use crate::{id, tool_path, ActiveGeneration, App};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

const MAX_DATASET: usize = 2 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD: usize = 20 * 1024 * 1024;
const MAX_DOCUMENT_TEXT: usize = 1024 * 1024;
const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const CUDA_LAB_SCRIPT: &str = include_str!("../scripts/cuda_lab.py");
const GGUF_PREPARE_SCRIPT: &str = include_str!("../scripts/gguf_prepare.py");

fn adapter_weights(adapter: &Path) -> Option<PathBuf> {
    ["adapters.safetensors", "adapter_model.safetensors"]
        .iter()
        .map(|name| adapter.join(name))
        .find(|path| path.is_file())
}

fn cuda_python(root: &Path) -> Result<PathBuf, String> {
    let python = std::env::var_os("LLAMANEST_CUDA_PYTHON")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            root.parent()
                .unwrap_or(root)
                .join("cuda-venv/Scripts/python.exe")
        });
    python.is_file().then_some(python).ok_or_else(|| {
        "CUDA training is not installed. Run Installa Fine Tuning GPU.cmd in the Windows package."
            .into()
    })
}

fn cuda_worker(directory: &Path) -> Result<PathBuf, String> {
    let script = directory.join("cuda_lab.py");
    fs::write(&script, CUDA_LAB_SCRIPT).map_err(|e| e.to_string())?;
    Ok(script)
}

fn prepare_gguf_base(
    source: &Path,
    root: &Path,
    job: &Arc<Mutex<Job>>,
    log: &Path,
) -> Result<PathBuf, String> {
    if !source.is_file() {
        return Ok(source.to_path_buf());
    }
    validate_local_model_path(source)?;
    let python = if cfg!(windows) {
        cuda_python(root)?
    } else {
        let python = std::env::var_os("LLAMANEST_GGUF_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| root.parent().unwrap_or(root).join("gguf-venv/bin/python3"));
        if !python.is_file() {
            return Err(
                "GGUF conversion is not installed. Run Installa Fine Tuning GGUF.command.".into(),
            );
        }
        python
    };
    let script = root.join("gguf_prepare.py");
    fs::write(&script, GGUF_PREPARE_SCRIPT).map_err(|e| e.to_string())?;
    let output = root.join("gguf-base");
    let mut command = Command::new(python);
    command
        .arg(script)
        .arg("--source")
        .arg(source)
        .arg("--output")
        .arg(&output);
    run_export_step(
        job,
        command,
        "Prepare selected GGUF for training",
        log,
        false,
    )?;
    validate_local_model_folder(&output)?;
    Ok(output)
}

fn cuda_converter() -> Result<PathBuf, String> {
    let converter = std::env::var_os("LLAMA_CONVERT_HF")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(Path::to_path_buf))
                .unwrap_or_default()
                .join("converter/convert_hf_to_gguf.py")
        });
    converter
        .is_file()
        .then_some(converter)
        .ok_or_else(|| "The Windows package is missing the Hugging Face to GGUF converter".into())
}

fn mlx_tool(root: &Path, override_name: &str, name: &str) -> PathBuf {
    if let Some(path) = std::env::var_os(override_name) {
        return PathBuf::from(path);
    }
    let installed = root
        .parent()
        .unwrap_or(root)
        .join("gguf-venv/bin")
        .join(name);
    if installed.is_file() {
        installed
    } else {
        tool_path(override_name, name)
    }
}

fn valid_openrouter_key(key: &str) -> bool {
    (10..=256).contains(&key.len())
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn encode_query(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

fn openrouter_models(key: &str, query: &str) -> Result<Vec<Value>, String> {
    if query.chars().count() < 2 || query.chars().count() > 160 {
        return Err("openrouterSearchLength".into());
    }
    let url = format!(
        "{OPENROUTER_MODELS_URL}?distillable=true&output_modalities=text&q={}",
        encode_query(query)
    );
    let mut child = Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--fail",
            "--max-time",
            "20",
            "--max-filesize",
            "2000000",
            "--config",
            "-",
            "--url",
            &url,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "openrouterCurlMissing")?;
    let config = format!("header = \"Authorization: Bearer {key}\"\n");
    child
        .stdin
        .take()
        .ok_or("openrouterUnavailable")?
        .write_all(config.as_bytes())
        .map_err(|_| "openrouterUnavailable")?;
    let output = child
        .wait_with_output()
        .map_err(|_| "openrouterUnavailable")?;
    if !output.status.success() || output.stdout.len() > 2_000_000 {
        return Err("openrouterUnavailable".into());
    }
    let value: Value =
        serde_json::from_slice(&output.stdout).map_err(|_| "openrouterUnavailable")?;
    Ok(value["data"]
        .as_array()
        .ok_or("openrouterUnavailable")?
        .iter()
        .filter_map(|model| {
            let id = model["id"].as_str()?;
            let name = model["name"].as_str()?;
            if id.len() > 160
                || !id.contains('/')
                || !id.bytes().all(|b| {
                    b.is_ascii_alphanumeric() || matches!(b, b'/' | b'.' | b'_' | b'-' | b':')
                })
            {
                return None;
            }
            Some(json!({"id":id,"name":name}))
        })
        .take(30)
        .collect())
}

fn openrouter_completion(
    job: &Arc<Mutex<Job>>,
    root: &Path,
    key: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let token = id();
    let body_path = root.join(format!("openrouter-{token}.request"));
    let response_path = root.join(format!("openrouter-{token}.response"));
    let status_path = root.join(format!("openrouter-{token}.status"));
    let result = (|| -> Result<String, String> {
        let body = json!({"model":model,"messages":[{"role":"user","content":prompt}],
            "max_tokens":1800,"temperature":0.2,"stream":false});
        write_private_file(&body_path, body.to_string().as_bytes())?;
        write_private_file(&response_path, b"")?;
        let status_file = fs::File::create(&status_path).map_err(|e| e.to_string())?;
        let mut child = Command::new("curl")
            .args([
                "--silent",
                "--show-error",
                "--max-time",
                "180",
                "--connect-timeout",
                "15",
                "--max-filesize",
                "2000000",
                "--config",
                "-",
                "--header",
                "Content-Type: application/json",
                "--data-binary",
            ])
            .arg(format!("@{}", body_path.display()))
            .arg("--output")
            .arg(&response_path)
            .args(["--write-out", "%{http_code}", "--url", OPENROUTER_CHAT_URL])
            .stdin(Stdio::piped())
            .stdout(Stdio::from(status_file))
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "openrouterCurlMissing")?;
        let config = format!("header = \"Authorization: Bearer {key}\"\n");
        if child
            .stdin
            .take()
            .ok_or("openrouterUnavailable")?
            .write_all(config.as_bytes())
            .is_err()
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("openrouterUnavailable".into());
        }
        {
            let mut guard = job.lock().unwrap();
            if guard.cancelled {
                let _ = child.kill();
                let _ = child.wait();
                return Err("openrouterCancelled".into());
            }
            guard.child = Some(child);
        }
        loop {
            let mut guard = job.lock().unwrap();
            let done = guard
                .child
                .as_mut()
                .ok_or("openrouterUnavailable")?
                .try_wait()
                .map_err(|_| "openrouterUnavailable")?;
            if guard.cancelled {
                if let Some(mut child) = guard.child.take() {
                    let _ = child.wait();
                }
                return Err("openrouterCancelled".into());
            }
            if let Some(status) = done {
                guard.child = None;
                if !status.success() {
                    return Err("openrouterUnavailable".into());
                }
                break;
            }
            drop(guard);
            thread::sleep(Duration::from_millis(200));
        }
        let http_status = fs::read_to_string(&status_path).map_err(|_| "openrouterUnavailable")?;
        match http_status.trim() {
            "200" => {}
            "401" | "403" => return Err("openrouterUnauthorized".into()),
            "429" => return Err("openrouterRateLimit".into()),
            _ => return Err("openrouterUnavailable".into()),
        }
        if fs::metadata(&response_path)
            .map_err(|_| "openrouterUnavailable")?
            .len()
            > 2_000_000
        {
            return Err("openrouterUnavailable".into());
        }
        let response: Value =
            serde_json::from_slice(&fs::read(&response_path).map_err(|_| "openrouterUnavailable")?)
                .map_err(|_| "openrouterUnavailable")?;
        response["choices"][0]["message"]["content"]
            .as_str()
            .filter(|value| !value.trim().is_empty())
            .map(str::to_owned)
            .ok_or_else(|| "openrouterEmptyResponse".into())
    })();
    let _ = fs::remove_file(body_path);
    let _ = fs::remove_file(response_path);
    let _ = fs::remove_file(status_path);
    result
}
const DEFAULT_STUDENT: &str = "Qwen/Qwen2.5-0.5B-Instruct";
const LOCAL_STUDENT: &str = "@local";
const STUDENT_MODELS: [&str; 6] = [
    DEFAULT_STUDENT,
    "Qwen/Qwen2.5-1.5B-Instruct",
    "Qwen/Qwen2.5-3B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "meta-llama/Llama-3.2-3B-Instruct",
    "google/gemma-2-9b-it",
];
// GGUF selections are unpacked into a private full-precision training base first.
const CHAT_TRAIN_BASES: [(&str, &str); 5] = [
    ("qwen2.5-0.5b-instruct-q4_k_m.gguf", DEFAULT_STUDENT),
    (
        "qwen2.5-3b-instruct-q4_k_m.gguf",
        "Qwen/Qwen2.5-3B-Instruct",
    ),
    (
        "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "Qwen/Qwen2.5-7B-Instruct",
    ),
    (
        "Llama-3.2-3B-Instruct-IQ3_M.gguf",
        "meta-llama/Llama-3.2-3B-Instruct",
    ),
    ("gemma-2-9b-it-Q4_K_M.gguf", "google/gemma-2-9b-it"),
];

#[derive(Clone, Debug)]
struct Example {
    prompt: String,
    completion: Option<String>,
}

fn parse_examples(bytes: &[u8]) -> Result<Vec<Example>, String> {
    if bytes.is_empty() || bytes.len() > MAX_DATASET {
        return Err("Dataset must be between 1 byte and 2 MB".into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "Dataset must be UTF-8")?;
    let mut examples = Vec::new();
    let mut has_completions = None;
    let mut seen = std::collections::HashSet::new();
    for (line_no, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        if examples.len() >= 200 {
            return Err("Dataset limit is 200 examples".into());
        }
        let row: Value = serde_json::from_str(line)
            .map_err(|_| format!("Invalid JSON on line {}", line_no + 1))?;
        let prompt = row["prompt"]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.chars().count() <= 2000)
            .ok_or_else(|| format!("Invalid prompt on line {}", line_no + 1))?;
        if !seen.insert(prompt.to_owned()) {
            return Err(format!("Duplicate prompt on line {}", line_no + 1));
        }
        let completion = match row.get("completion") {
            Some(Value::String(value))
                if !value.trim().is_empty() && value.chars().count() <= 32_000 =>
            {
                Some(value.trim().to_owned())
            }
            Some(_) => return Err(format!("Invalid completion on line {}", line_no + 1)),
            None => None,
        };
        if has_completions.is_some_and(|present| present != completion.is_some()) {
            return Err(
                "Use either prompts only or prompt/completion pairs throughout the file".into(),
            );
        }
        has_completions = Some(completion.is_some());
        examples.push(Example {
            prompt: prompt.to_owned(),
            completion,
        });
    }
    if examples.is_empty() {
        return Err("Dataset has no examples".into());
    }
    Ok(examples)
}

fn write_examples(path: &Path, examples: &[Example]) -> Result<(), String> {
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    for example in examples {
        let row = match &example.completion {
            Some(completion) => json!({"prompt": example.prompt, "completion": completion}),
            None => json!({"prompt": example.prompt}),
        };
        writeln!(file, "{row}").map_err(|e| e.to_string())?;
    }
    file.sync_all().map_err(|e| e.to_string())
}

fn read_examples(path: &Path) -> Result<Vec<Example>, String> {
    parse_examples(&fs::read(path).map_err(|e| e.to_string())?)
}

fn document_text(name: &str, bytes: &[u8], root: &Path) -> Result<String, String> {
    if name.is_empty()
        || name.len() > 160
        || name.starts_with('.')
        || name.contains('/')
        || name.contains('\\')
        || bytes.is_empty()
    {
        return Err("documentInvalidFile".into());
    }
    if bytes.len() > MAX_DOCUMENT_UPLOAD {
        return Err("documentTooLarge".into());
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|part| part.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let text = if matches!(extension.as_str(), "txt" | "md") {
        std::str::from_utf8(bytes)
            .map_err(|_| "documentInvalidText")?
            .to_owned()
    } else if extension == "pdf" || extension == "docx" {
        fs::create_dir_all(root).map_err(|e| e.to_string())?;
        let token = id();
        let temporary = root.join(format!("document-{token}.{extension}"));
        fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
        if extension == "pdf" {
            let extracted = root.join(format!("document-{token}.txt"));
            let status = Command::new(tool_path("PDFTOTEXT", "pdftotext"))
                .arg("-layout")
                .arg(&temporary)
                .arg(&extracted)
                .status();
            let _ = fs::remove_file(&temporary);
            let status = status.map_err(|_| "documentExtractorMissing")?;
            if !status.success() {
                let _ = fs::remove_file(&extracted);
                return Err("documentUnreadable".into());
            }
            let size = fs::metadata(&extracted)
                .map_err(|_| "documentUnreadable")?
                .len();
            if size > MAX_DOCUMENT_TEXT as u64 {
                let _ = fs::remove_file(&extracted);
                return Err("documentTextTooLong".into());
            }
            let text = fs::read_to_string(&extracted);
            let _ = fs::remove_file(&extracted);
            text.map_err(|_| "documentUnreadable")?
        } else {
            const DOCX_TEXT: &str = r#"import sys, zipfile, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as archive:
    info = archive.getinfo('word/document.xml')
    if info.file_size > 8 * 1024 * 1024:
        raise ValueError('document XML too large')
    root = ET.fromstring(archive.read(info))
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    for paragraph in root.iter(ns + 'p'):
        line = ''.join(node.text or '' for node in paragraph.iter(ns + 't'))
        if line.strip():
            print(line)
"#;
            let output = Command::new("python3")
                .args(["-c", DOCX_TEXT])
                .arg(&temporary)
                .output();
            let _ = fs::remove_file(&temporary);
            let output = output.map_err(|_| "documentExtractorMissing")?;
            if !output.status.success() {
                return Err("documentUnreadable".into());
            }
            if output.stdout.len() > MAX_DOCUMENT_TEXT {
                return Err("documentTextTooLong".into());
            }
            String::from_utf8(output.stdout).map_err(|_| "documentInvalidText")?
        }
    } else {
        return Err("documentUnsupported".into());
    };
    let text = text.replace('\0', "").replace("\r\n", "\n");
    if text.trim().is_empty() {
        return Err("documentNoText".into());
    }
    if text.len() > MAX_DOCUMENT_TEXT {
        return Err("documentTextTooLong".into());
    }
    Ok(text.trim().to_owned())
}

pub struct Job {
    kind: &'static str,
    phase: &'static str,
    done: usize,
    total: usize,
    error: Option<String>,
    output: Option<String>,
    log: Option<PathBuf>,
    response: Option<PathBuf>,
    child: Option<Child>,
    generation: Option<Arc<ActiveGeneration>>,
    cancelled: bool,
}

impl Job {
    fn new(kind: &'static str, total: usize) -> Self {
        Self {
            kind,
            phase: "starting",
            done: 0,
            total,
            error: None,
            output: None,
            log: None,
            response: None,
            child: None,
            generation: None,
            cancelled: false,
        }
    }

    fn active(&self) -> bool {
        matches!(self.phase, "starting" | "running")
    }

    fn cancel(&mut self) {
        if !self.active() {
            return;
        }
        self.cancelled = true;
        if let Some(generation) = &self.generation {
            generation.cancel();
        }
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
        }
    }

    fn status(&self) -> Value {
        let response = self
            .response
            .as_ref()
            .and_then(|path| fs::read_to_string(path).ok());
        let log = self
            .log
            .as_ref()
            .and_then(|path| fs::File::open(path).ok())
            .and_then(|mut file| {
                let length = file.metadata().ok()?.len();
                file.seek(SeekFrom::Start(length.saturating_sub(16_384)))
                    .ok()?;
                let mut bytes = Vec::new();
                file.read_to_end(&mut bytes).ok()?;
                let content = String::from_utf8_lossy(&bytes);
                Some(
                    content
                        .chars()
                        .rev()
                        .take(2500)
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect::<String>(),
                )
            });
        json!({"kind":self.kind,"phase":self.phase,"active":self.active(),"done":self.done,
            "total":self.total,"error":self.error,"output":self.output,"log":log,"response":response})
    }
}

pub struct Service {
    root: PathBuf,
    training: Option<PathBuf>,
    prompts: Option<PathBuf>,
    job: Option<Arc<Mutex<Job>>>,
}

impl Service {
    fn openrouter_key(&self) -> Result<String, String> {
        let key = fs::read_to_string(self.root.join("openrouter-key.txt"))
            .map_err(|_| "openrouterKeyMissing")?;
        let key = key.trim().to_owned();
        if !valid_openrouter_key(&key) {
            return Err("openrouterKeyMissing".into());
        }
        Ok(key)
    }

    pub fn save_openrouter_key(&mut self, key: &str) -> Result<Value, String> {
        if self.busy() {
            return Err("Wait for the current lab job to finish".into());
        }
        let key = key.trim();
        if !valid_openrouter_key(key) {
            return Err("openrouterInvalidKey".into());
        }
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let temporary = self.root.join(format!("openrouter-key.{}.part", id()));
        write_private_file(&temporary, key.as_bytes())?;
        let target = self.root.join("openrouter-key.txt");
        let backup = self.root.join(format!("openrouter-key.{}.backup", id()));
        let had_target = target.is_file();
        if had_target {
            fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        }
        if let Err(error) = fs::rename(&temporary, &target) {
            if had_target {
                let _ = fs::rename(&backup, &target);
            }
            let _ = fs::remove_file(&temporary);
            return Err(error.to_string());
        }
        let _ = fs::remove_file(backup);
        Ok(self.status())
    }

    pub fn remove_openrouter_key(&mut self) -> Result<Value, String> {
        if self.busy() {
            return Err("Wait for the current lab job to finish".into());
        }
        let path = self.root.join("openrouter-key.txt");
        if path.is_file() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        Ok(self.status())
    }

    pub fn search_openrouter_models(&self, query: &str) -> Result<Value, String> {
        let key = self.openrouter_key()?;
        Ok(json!({"models":openrouter_models(&key, query)?}))
    }

    fn document_meta(&self) -> Option<Value> {
        serde_json::from_slice(&fs::read(self.root.join("document.json")).ok()?).ok()
    }

    fn document_source(&self) -> Result<String, String> {
        let meta = self.document_meta().ok_or("documentMissing")?;
        let file = meta["file"].as_str().ok_or("documentMissing")?;
        if !file.starts_with("source-")
            || !file.ends_with(".txt")
            || file.contains('/')
            || file.contains('\\')
        {
            return Err("documentMissing".into());
        }
        let text = fs::read_to_string(self.root.join(file)).map_err(|_| "documentMissing")?;
        if text.is_empty() || text.len() > MAX_DOCUMENT_TEXT {
            return Err("documentMissing".into());
        }
        Ok(text)
    }

    pub fn upload_document(&mut self, name: &str, bytes: &[u8]) -> Result<Value, String> {
        if self.busy() {
            return Err("Wait for the current lab job to finish".into());
        }
        let text = document_text(name, bytes, &self.root)?;
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let file = format!("source-{}.txt", id());
        let old = self.document_meta();
        fs::write(self.root.join(&file), &text).map_err(|e| e.to_string())?;
        let metadata = json!({"name":name,"file":file,"characters":text.chars().count()});
        let temporary = self.root.join("document.json.part");
        let target = self.root.join("document.json");
        fs::write(&temporary, metadata.to_string()).map_err(|e| e.to_string())?;
        let backup = self.root.join(format!("document.{}.backup", id()));
        let had_target = target.is_file();
        if had_target {
            fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        }
        if let Err(error) = fs::rename(&temporary, &target) {
            if had_target {
                let _ = fs::rename(&backup, &target);
            }
            let _ = fs::remove_file(self.root.join(&file));
            return Err(error.to_string());
        }
        let _ = fs::remove_file(backup);
        if let Some(old_file) = old.and_then(|meta| meta["file"].as_str().map(str::to_owned)) {
            if old_file.starts_with("source-")
                && old_file.ends_with(".txt")
                && !old_file.contains('/')
                && !old_file.contains('\\')
            {
                let _ = fs::remove_file(self.root.join(old_file));
            }
        }
        Ok(self.status())
    }

    fn local_model_path(&self) -> Option<PathBuf> {
        let saved = fs::read_to_string(self.root.join("local-model-path.txt")).ok()?;
        let path = PathBuf::from(saved.trim_end_matches(['\r', '\n']));
        path.is_absolute().then_some(path)
    }

    fn student_selection(&self) -> String {
        let saved = fs::read_to_string(self.root.join("student-model.txt")).unwrap_or_default();
        if saved.trim() == LOCAL_STUDENT && self.local_model_path().is_some() {
            return LOCAL_STUDENT.to_owned();
        }
        STUDENT_MODELS
            .iter()
            .copied()
            .find(|model| *model == saved.trim())
            .unwrap_or(DEFAULT_STUDENT)
            .to_owned()
    }

    fn student_model(&self) -> String {
        let selected = self.student_selection();
        if selected == LOCAL_STUDENT {
            return self
                .local_model_path()
                .unwrap()
                .to_string_lossy()
                .into_owned();
        }
        selected
    }

    fn checked_student_model(&self) -> Result<String, String> {
        let model = self.student_model();
        if self.student_selection() == LOCAL_STUDENT {
            validate_local_model_path(Path::new(&model))?;
        }
        Ok(model)
    }

    pub fn select_student(&mut self, model: &str) -> Result<Value, String> {
        if self.busy() {
            return Err("A lab job is already running".into());
        }
        if !STUDENT_MODELS.contains(&model)
            && !(model == LOCAL_STUDENT && self.local_model_path().is_some())
        {
            return Err("Unsupported student model".into());
        }
        if model == LOCAL_STUDENT {
            validate_local_model_path(&self.local_model_path().unwrap())?;
        }
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let temporary = self.root.join("student-model.txt.part");
        fs::write(&temporary, model).map_err(|e| e.to_string())?;
        fs::rename(&temporary, self.root.join("student-model.txt")).map_err(|e| e.to_string())?;
        Ok(self.status())
    }

    fn select_local_model_path(&mut self, path: &Path) -> Result<Value, String> {
        if self.busy() {
            return Err("A lab job is already running".into());
        }
        let path = fs::canonicalize(path).map_err(|_| "localModelInvalid")?;
        validate_local_model_path(&path)?;
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let temporary = self.root.join("local-model-path.txt.part");
        fs::write(&temporary, path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        fs::rename(&temporary, self.root.join("local-model-path.txt"))
            .map_err(|e| e.to_string())?;
        self.select_student(LOCAL_STUDENT)
    }

    fn latest_adapter(&self) -> Option<PathBuf> {
        let student = self.student_model();
        fs::read_dir(self.root.join("runs"))
            .ok()?
            .filter_map(Result::ok)
            .map(|entry| entry.path().join("adapter"))
            .filter(|path| {
                let eligible = path.parent().is_some_and(|run| {
                    let manifest = fs::read(run.join("manifest.json"))
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
                    if !manifest
                        .as_ref()
                        .is_some_and(|manifest| manifest["baseModel"] == student)
                    {
                        return false;
                    }
                    if run.join(".complete").is_file() {
                        return true;
                    }
                    manifest
                        .and_then(|manifest| manifest["validationExamples"].as_u64())
                        .is_some_and(|count| count > 0)
                });
                adapter_weights(path).is_some() && eligible
            })
            .max()
    }

    fn adapter_fresh(&self) -> bool {
        let Some(adapter) = self.latest_adapter() else {
            return false;
        };
        let Some(training) = &self.training else {
            return false;
        };
        let manifest = adapter
            .parent()
            .and_then(|run| fs::read(run.join("manifest.json")).ok())
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
        let current_count = self.rows("training").map_or(0, |rows| rows.len()) as u64;
        if !manifest.is_some_and(|manifest| {
            manifest["validationExamples"].as_u64() == Some(0)
                && manifest["trainingExamples"].as_u64() == Some(current_count)
        }) {
            return false;
        }
        let adapter_time = adapter_weights(&adapter)
            .ok_or_else(|| std::io::Error::other("Adapter missing"))
            .and_then(fs::metadata)
            .and_then(|meta| meta.modified());
        let training_time = fs::metadata(training).and_then(|meta| meta.modified());
        matches!((adapter_time, training_time), (Ok(adapter), Ok(training)) if adapter >= training)
    }

    fn continuation_adapter(&self, examples: &[Example]) -> Option<PathBuf> {
        let adapter = self.latest_adapter()?;
        let run = adapter.parent()?;
        if !run.join(".complete").is_file() {
            return None;
        }
        let manifest: Value =
            serde_json::from_slice(&fs::read(run.join("manifest.json")).ok()?).ok()?;
        if manifest["baseModel"] != self.student_model()
            || manifest["method"] != "LoRA"
            || manifest["validationExamples"].as_u64() != Some(0)
        {
            return None;
        }
        let reset_time = fs::metadata(self.root.join("training-reset.marker"))
            .and_then(|meta| meta.modified())
            .ok();
        let adapter_time = fs::metadata(adapter_weights(&adapter)?)
            .and_then(|meta| meta.modified())
            .ok()?;
        if reset_time.is_some_and(|reset| adapter_time <= reset) {
            return None;
        }
        let previous = read_examples(&run.join("data/train.jsonl")).ok()?;
        let shared = previous
            .iter()
            .filter(|old| examples.iter().any(|new| new.prompt == old.prompt))
            .count();
        if shared < 3 || shared * 2 < previous.len().min(examples.len()) {
            return None;
        }
        adapter_weights(&adapter)
    }

    pub fn new(root: PathBuf) -> Self {
        let training = root.join("training.jsonl");
        let prompts = root.join("prompts.jsonl");
        let uploaded = root.join("dataset.jsonl");
        let legacy_pairs = read_examples(&uploaded)
            .ok()
            .and_then(|rows| rows.first().map(|row| row.completion.is_some()));
        Self {
            root,
            training: if training.is_file() {
                Some(training)
            } else if legacy_pairs == Some(true) {
                Some(uploaded.clone())
            } else {
                None
            },
            prompts: if prompts.is_file() {
                Some(prompts)
            } else if legacy_pairs == Some(false) {
                Some(uploaded)
            } else {
                None
            },
            job: None,
        }
    }

    fn busy(&self) -> bool {
        self.job
            .as_ref()
            .is_some_and(|job| job.lock().unwrap().active())
    }

    pub fn status(&self) -> Value {
        let training = self.rows("training").unwrap_or_default();
        let training_count = training.len();
        let prompt_count = self.rows("prompts").map_or(0, |rows| rows.len());
        let distilled_count = self.rows("distilled").map_or(0, |rows| rows.len());
        json!({"trainingCount":training_count,"promptCount":prompt_count,"distilledCount":distilled_count,
            "job":self.job.as_ref().map(|job|job.lock().unwrap().status()),
            "baseModel":self.student_selection(),"resolvedBaseModel":self.student_model(),
            "studentModels":STUDENT_MODELS.iter().copied().chain(self.local_model_path().is_some().then_some(LOCAL_STUDENT)).collect::<Vec<_>>(),
            "localModelName":self.local_model_path().and_then(|path|path.file_name().map(|name|name.to_string_lossy().into_owned())),
            "localModelValid":self.local_model_path().is_some_and(|path|validate_local_model_path(&path).is_ok()),
            "chatTrainBases":CHAT_TRAIN_BASES,"selectionSaved":self.root.join("student-model.txt").is_file(),
            "trainSupported":cfg!(any(all(target_os="macos", target_arch="aarch64"), target_os="windows")),
            "workspace":self.root,"document":self.document_meta(),"openrouterConfigured":self.openrouter_key().is_ok(),"adapter":self.latest_adapter(),"adapterFresh":self.adapter_fresh(),
            "canContinue":self.continuation_adapter(&training).is_some()})
    }

    fn rows(&self, kind: &str) -> Result<Vec<Example>, String> {
        let path = match kind {
            "training" => self.training.clone(),
            "prompts" => self.prompts.clone(),
            "distilled" => Some(self.root.join("distilled.jsonl")).filter(|p| p.is_file()),
            _ => return Err("Unknown dataset type".into()),
        };
        match path.as_deref() {
            Some(path) if fs::metadata(path).map_err(|e| e.to_string())?.len() > 0 => {
                read_examples(path)
            }
            _ => Ok(Vec::new()),
        }
    }

    pub fn examples(&self, kind: &str) -> Result<Value, String> {
        let rows = self.rows(kind)?;
        Ok(
            json!({"examples": rows.iter().map(|row| match &row.completion {
            Some(completion) => json!({"prompt":row.prompt,"completion":completion}),
            None => json!({"prompt":row.prompt}),
        }).collect::<Vec<_>>() }),
        )
    }

    fn save_auto_pairs(&mut self, pairs: &[Example]) -> Result<(), String> {
        if pairs.len() != 5 || pairs.iter().any(|pair| pair.completion.is_none()) {
            return Err("Five complete examples are required".into());
        }
        let questions = pairs
            .iter()
            .map(|pair| Example {
                prompt: pair.prompt.clone(),
                completion: None,
            })
            .collect::<Vec<_>>();
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let suffix = id();
        let prompt_path = self.root.join("prompts.jsonl");
        let answer_path = self.root.join("distilled.jsonl");
        let prompt_part = self.root.join(format!("prompts.{suffix}.part"));
        let answer_part = self.root.join(format!("distilled.{suffix}.part"));
        write_examples(&prompt_part, &questions)?;
        write_examples(&answer_part, pairs)?;
        let prompt_backup = self.root.join(format!("prompts.{suffix}.backup"));
        let answer_backup = self.root.join(format!("distilled.{suffix}.backup"));
        let had_prompts = prompt_path.is_file();
        let had_answers = answer_path.is_file();
        let result = (|| -> Result<(), String> {
            if had_prompts {
                fs::rename(&prompt_path, &prompt_backup).map_err(|e| e.to_string())?;
            }
            if had_answers {
                fs::rename(&answer_path, &answer_backup).map_err(|e| e.to_string())?;
            }
            fs::rename(&answer_part, &answer_path).map_err(|e| e.to_string())?;
            fs::rename(&prompt_part, &prompt_path).map_err(|e| e.to_string())?;
            Ok(())
        })();
        if let Err(error) = result {
            if !had_prompts || prompt_backup.is_file() {
                let _ = fs::remove_file(&prompt_path);
            }
            if !had_answers || answer_backup.is_file() {
                let _ = fs::remove_file(&answer_path);
            }
            if had_prompts && prompt_backup.is_file() {
                let _ = fs::rename(&prompt_backup, &prompt_path);
            }
            if had_answers && answer_backup.is_file() {
                let _ = fs::rename(&answer_backup, &answer_path);
            }
            let _ = fs::remove_file(&prompt_part);
            let _ = fs::remove_file(&answer_part);
            return Err(error);
        }
        let _ = fs::remove_file(prompt_backup);
        let _ = fs::remove_file(answer_backup);
        self.prompts = Some(prompt_path);
        Ok(())
    }

    fn append_document_pairs(&mut self, pairs: &[Example]) -> Result<(), String> {
        if pairs.is_empty() || pairs.iter().any(|pair| pair.completion.is_none()) {
            return Err("documentNoExamples".into());
        }
        let mut combined = self.rows("training")?;
        if combined.len() + pairs.len() > 200 {
            return Err("documentExampleLimit".into());
        }
        let mut seen = combined
            .iter()
            .map(|row| row.prompt.to_lowercase())
            .collect::<std::collections::HashSet<_>>();
        for pair in pairs {
            if !seen.insert(pair.prompt.to_lowercase()) {
                return Err("documentDuplicateQuestion".into());
            }
            combined.push(pair.clone());
        }
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let target = self.root.join("training.jsonl");
        let temporary = self.root.join(format!("training.{}.part", id()));
        write_examples(&temporary, &combined)?;
        let backup = self.root.join(format!("training.{}.backup", id()));
        let had_target = target.is_file();
        if had_target {
            fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        }
        if let Err(error) = fs::rename(&temporary, &target) {
            if had_target {
                let _ = fs::rename(&backup, &target);
            }
            let _ = fs::remove_file(&temporary);
            return Err(error.to_string());
        }
        let _ = fs::remove_file(backup);
        self.training = Some(target);
        Ok(())
    }

    pub fn save(&mut self, kind: &str, rows: &Value) -> Result<Value, String> {
        if self.busy() {
            return Err("Wait for the current lab job to finish".into());
        }
        if !matches!(kind, "training" | "prompts" | "distilled") {
            return Err("Unknown dataset type".into());
        }
        let array = rows.as_array().ok_or("Examples must be a list")?;
        if array.len() > 200 {
            return Err("Dataset limit is 200 examples".into());
        }
        if kind == "prompts" && array.len() > 30 {
            return Err("Distillation is limited to 30 questions".into());
        }
        let examples = if array.is_empty() {
            Vec::new()
        } else {
            let mut bytes = Vec::new();
            for row in array {
                serde_json::to_writer(&mut bytes, row).map_err(|e| e.to_string())?;
                bytes.push(b'\n');
            }
            parse_examples(&bytes)?
        };
        if examples
            .iter()
            .any(|row| row.completion.is_some() != (kind != "prompts"))
        {
            return Err("This dataset has the wrong example type".into());
        }
        if kind == "training"
            && examples.iter().any(|row| {
                row.completion
                    .as_ref()
                    .is_some_and(|answer| answer.chars().count() > 4000)
            })
        {
            return Err("Shorten every answer to 4000 characters before training".into());
        }
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let temporary = self.root.join(format!("{kind}.jsonl.part"));
        write_examples(&temporary, &examples)?;
        let target = self.root.join(format!("{kind}.jsonl"));
        fs::rename(&temporary, &target).map_err(|e| e.to_string())?;
        match kind {
            "training" => self.training = Some(target),
            "prompts" => self.prompts = Some(target),
            _ => {}
        }
        Ok(self.status())
    }

    pub fn upload(&mut self, bytes: &[u8]) -> Result<Value, String> {
        let rows = parse_examples(bytes)?;
        let kind = if rows[0].completion.is_some() {
            "training"
        } else {
            "prompts"
        };
        let data = json!(rows
            .iter()
            .map(|row| match &row.completion {
                Some(completion) => json!({"prompt":row.prompt,"completion":completion}),
                None => json!({"prompt":row.prompt}),
            })
            .collect::<Vec<_>>());
        self.save(kind, &data)
    }

    pub fn reset(&mut self, kind: &str) -> Result<Value, String> {
        match kind {
            "training" => {
                self.save("training", &json!([]))?;
                fs::write(self.root.join("training-reset.marker"), b"reset\n")
                    .map_err(|e| e.to_string())?;
            }
            "prompts" => {
                self.save("prompts", &json!([]))?;
                self.save("distilled", &json!([]))?;
            }
            _ => return Err("Unknown dataset type".into()),
        }
        self.job = None;
        Ok(self.status())
    }

    pub fn use_distilled(&mut self) -> Result<Value, String> {
        let rows = self.rows("distilled")?;
        if rows.is_empty() {
            return Err("Generate answers first".into());
        }
        let prompts = self.rows("prompts")?;
        if !prompts.is_empty()
            && (prompts.len() != rows.len()
                || prompts
                    .iter()
                    .zip(&rows)
                    .any(|(prompt, answer)| prompt.prompt != answer.prompt))
        {
            return Err("Questions changed; generate answers again".into());
        }
        let data = json!(rows
            .iter()
            .map(|row| json!({"prompt":row.prompt,"completion":row.completion}))
            .collect::<Vec<_>>());
        self.save("training", &data)
    }

    pub fn cancel(&self) -> Value {
        if let Some(job) = &self.job {
            job.lock().unwrap().cancel();
        }
        self.status()
    }
}

pub fn start_preview(service: Arc<Mutex<Service>>, prompt: &str) -> Result<Value, String> {
    if prompt.trim().is_empty() || prompt.chars().count() > 1000 {
        return Err("Preview prompt must be between 1 and 1000 characters".into());
    }
    let (adapter, student, root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        if !lab.adapter_fresh() {
            return Err("Retrain the model with the current examples before previewing".into());
        }
        let adapter = lab.latest_adapter().ok_or("Train an adapter first")?;
        let student = lab.checked_student_model()?;
        let job = Arc::new(Mutex::new(Job::new("preview", 1)));
        lab.job = Some(job.clone());
        (adapter, student, lab.root.clone(), job)
    };
    let prompt = prompt.trim().to_owned();
    thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            if job.lock().unwrap().cancelled {
                return Ok(String::new());
            }
            let dir = root.join("previews");
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let preview_id = id();
            let log_path = dir.join(format!("{preview_id}.log"));
            let answer_path = dir.join(format!("{preview_id}.txt"));
            let training_base = prepare_gguf_base(Path::new(&student), &root, &job, &log_path)?;
            let log = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .map_err(|e| e.to_string())?;
            let answer = fs::File::create(&answer_path).map_err(|e| e.to_string())?;
            let mut command = if cfg!(windows) {
                let python = cuda_python(&root)?;
                let script = cuda_worker(&dir)?;
                let mut command = Command::new(python);
                command
                    .arg(script)
                    .arg("preview")
                    .arg("--model")
                    .arg(&training_base)
                    .arg("--adapter")
                    .arg(&adapter)
                    .arg("--prompt")
                    .arg(&prompt)
                    .arg("--max-tokens")
                    .arg("160");
                command
            } else {
                let mut command =
                    Command::new(mlx_tool(&root, "MLX_LM_GENERATE", "mlx_lm.generate"));
                command
                    .arg("--model")
                    .arg(&training_base)
                    .arg("--adapter-path")
                    .arg(&adapter)
                    .args([
                        "--prompt",
                        &prompt,
                        "--max-tokens",
                        "160",
                        "--verbose",
                        "false",
                    ]);
                command
            };
            let child = command
                .stdout(Stdio::from(answer))
                .stderr(Stdio::from(log))
                .spawn()
                .map_err(|e| format!("Cannot start the preview worker: {e}"))?;
            {
                let mut guard = job.lock().unwrap();
                if guard.cancelled {
                    let mut child = child;
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok(String::new());
                }
                guard.phase = "running";
                guard.log = Some(log_path.clone());
                guard.response = Some(answer_path.clone());
                guard.child = Some(child);
            }
            loop {
                let done = {
                    let mut guard = job.lock().unwrap();
                    let status = guard
                        .child
                        .as_mut()
                        .unwrap()
                        .try_wait()
                        .map_err(|e| e.to_string())?;
                    if guard.cancelled {
                        return Ok(String::new());
                    }
                    status
                };
                if let Some(status) = done {
                    if !status.success() {
                        let detail = fs::read_to_string(&log_path)
                            .ok()
                            .and_then(|log| {
                                log.lines()
                                    .rev()
                                    .find(|line| !line.trim().is_empty())
                                    .map(|line| line.chars().take(300).collect::<String>())
                            })
                            .unwrap_or_else(|| format!("exited with {status}"));
                        return Err(format!("Preview failed: {detail}"));
                    }
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }
            if fs::read_to_string(&answer_path)
                .map_err(|e| e.to_string())?
                .trim()
                .is_empty()
            {
                return Err("The model returned no answer; see technical details".into());
            }
            Ok(answer_path.display().to_string())
        })();
        let mut guard = job.lock().unwrap();
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        match result {
            Ok(path) if !path.is_empty() => {
                guard.done = 1;
                guard.output = Some(path);
            }
            Err(error) => guard.error = Some(error),
            _ => {}
        }
    });
    Ok(service.lock().unwrap().status())
}

pub fn start_distill(
    service: Arc<Mutex<Service>>,
    app: Arc<Mutex<App>>,
    provider: &str,
    teacher: &str,
) -> Result<Value, String> {
    let teacher_source = resolve_teacher(&service, &app, provider, teacher)?;
    let (examples, root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        let examples = lab.rows("prompts")?;
        if examples.is_empty() {
            return Err("Add questions first".into());
        }
        if examples.len() > 30 {
            return Err("Distillation is limited to 30 prompts in this preview".into());
        }
        let job = Arc::new(Mutex::new(Job::new("distill", examples.len())));
        lab.job = Some(job.clone());
        (examples, lab.root.clone(), job)
    };
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            verify_cloud_teacher(&teacher_source, &job)?;
            fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let output = root.join("distilled.jsonl.part");
            let mut completed = Vec::new();
            for example in examples {
                if job.lock().unwrap().cancelled {
                    return Ok(());
                }
                let answer = teacher_answer(&teacher_source, &job, &app, &root, &example.prompt)?;
                if job.lock().unwrap().cancelled {
                    return Ok(());
                }
                if answer.trim().is_empty() {
                    return Err("Teacher returned an empty answer".into());
                }
                completed.push(Example {
                    prompt: example.prompt,
                    completion: Some(answer),
                });
                write_examples(&output, &completed)?;
                job.lock().unwrap().done = completed.len();
            }
            let target = root.join("distilled.jsonl");
            fs::rename(&output, &target).map_err(|e| e.to_string())?;
            job.lock().unwrap().output = Some(target.display().to_string());
            Ok(())
        })();
        let mut guard = job.lock().unwrap();
        guard.generation = None;
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        guard.error = result.err();
    });
    Ok(service.lock().unwrap().status())
}

fn parse_generated_pairs(output: &str) -> Result<Vec<Example>, String> {
    let start = output.find('[').ok_or("teacherInvalidList")?;
    let end = output.rfind(']').ok_or("teacherInvalidList")?;
    if end < start {
        return Err("teacherInvalidList".into());
    }
    let value: Value =
        serde_json::from_str(&output[start..=end]).map_err(|_| "teacherInvalidJson")?;
    let array = value.as_array().ok_or("teacherInvalidList")?;
    if array.len() < 5 {
        return Err("teacherTooFew".into());
    }
    let mut seen = std::collections::HashSet::new();
    array
        .iter()
        .take(5)
        .map(|row| {
            let prompt = row["prompt"]
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty() && value.chars().count() <= 2000)
                .ok_or("teacherBadQuestion")?;
            let completion = row["completion"]
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty() && value.chars().count() <= 4000)
                .ok_or("teacherBadAnswer")?;
            if !seen.insert(prompt.to_lowercase()) {
                return Err("teacherDuplicate".into());
            }
            Ok(Example {
                prompt: prompt.to_owned(),
                completion: Some(completion.to_owned()),
            })
        })
        .collect()
}

fn document_excerpt(text: &str, batch: usize, batches: usize) -> String {
    let characters = text.chars().collect::<Vec<_>>();
    let window = 4000.min(characters.len());
    let start = if batches <= 1 || characters.len() <= window {
        0
    } else {
        (characters.len() - window) * batch / (batches - 1)
    };
    characters[start..start + window].iter().collect()
}

enum DocumentTeacher {
    Local(PathBuf),
    OpenRouter { model: String, key: String },
}

fn resolve_teacher(
    service: &Arc<Mutex<Service>>,
    app: &Arc<Mutex<App>>,
    provider: &str,
    teacher: &str,
) -> Result<DocumentTeacher, String> {
    match provider {
        "local" => {
            let guard = app
                .try_lock()
                .map_err(|_| "Chat is busy; try again when it finishes")?;
            Ok(DocumentTeacher::Local(guard.model_path(teacher)?))
        }
        "openrouter" => {
            if teacher.len() > 160
                || !teacher.contains('/')
                || !teacher.bytes().all(|b| {
                    b.is_ascii_alphanumeric() || matches!(b, b'/' | b'.' | b'_' | b'-' | b':')
                })
            {
                return Err("openrouterInvalidModel".into());
            }
            let key = service.lock().unwrap().openrouter_key()?;
            Ok(DocumentTeacher::OpenRouter {
                model: teacher.to_owned(),
                key,
            })
        }
        _ => Err("documentInvalidTeacher".into()),
    }
}

fn verify_cloud_teacher(teacher: &DocumentTeacher, job: &Arc<Mutex<Job>>) -> Result<(), String> {
    if let DocumentTeacher::OpenRouter { model, key } = teacher {
        job.lock().unwrap().phase = "running";
        if !openrouter_models(key, model)?
            .iter()
            .any(|candidate| candidate["id"] == model.as_str())
        {
            return Err("openrouterInvalidModel".into());
        }
    }
    Ok(())
}

fn teacher_answer(
    teacher: &DocumentTeacher,
    job: &Arc<Mutex<Job>>,
    app: &Arc<Mutex<App>>,
    root: &Path,
    request: &str,
) -> Result<String, String> {
    match teacher {
        DocumentTeacher::Local(path) => {
            let generation = Arc::new(ActiveGeneration::new("lab".into(), id()));
            {
                let mut guard = job.lock().unwrap();
                guard.phase = "running";
                guard.generation = Some(generation.clone());
            }
            let mut app = app.lock().unwrap();
            let answer = app
                .infer_stream(path, request, &mut |_| Ok(()), &generation)
                .map(|(answer, _)| answer)?;
            job.lock().unwrap().generation = None;
            Ok(answer)
        }
        DocumentTeacher::OpenRouter { model, key } => {
            openrouter_completion(job, root, key, model, request)
        }
    }
}

pub fn start_document_examples(
    service: Arc<Mutex<Service>>,
    app: Arc<Mutex<App>>,
    provider: &str,
    teacher: &str,
    count: usize,
) -> Result<Value, String> {
    if !matches!(count, 5 | 10 | 20) {
        return Err("documentInvalidCount".into());
    }
    let teacher_source = resolve_teacher(&service, &app, provider, teacher)?;
    let (source, existing, root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        let source = lab.document_source()?;
        let existing = lab.rows("training")?;
        if existing.len() + count > 200 {
            return Err("documentExampleLimit".into());
        }
        let job = Arc::new(Mutex::new(Job::new("document", count)));
        lab.job = Some(job.clone());
        (source, existing, lab.root.clone(), job)
    };
    let worker_service = service.clone();
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            verify_cloud_teacher(&teacher_source, &job)?;
            let batches = count / 5;
            let mut generated = Vec::with_capacity(count);
            let mut seen = existing
                .iter()
                .map(|row| row.prompt.to_lowercase())
                .collect::<std::collections::HashSet<_>>();
            for batch in 0..batches {
                if job.lock().unwrap().cancelled {
                    return Ok(());
                }
                let excerpt = document_excerpt(&source, batch, batches);
                let previous = generated
                    .iter()
                    .map(|row: &Example| row.prompt.as_str())
                    .collect::<Vec<_>>()
                    .join(" | ");
                let request = format!(
                    "Use ONLY the source text below to create exactly 5 different question-answer examples. Questions must test specific information actually stated in the text. Answers must be concise, accurate, and in the same language as the text. Do not invent facts or ask about information missing from the text. Avoid these previous questions: {previous}\nReply ONLY with a JSON array of 5 objects, each with string fields \"prompt\" and \"completion\". No Markdown or extra text.\n\nSOURCE TEXT:\n{excerpt}"
                );
                let answer = teacher_answer(&teacher_source, &job, &app, &root, &request)?;
                if job.lock().unwrap().cancelled {
                    return Ok(());
                }
                for pair in parse_generated_pairs(&answer)? {
                    if !seen.insert(pair.prompt.to_lowercase()) {
                        return Err("documentDuplicateQuestion".into());
                    }
                    generated.push(pair);
                }
                job.lock().unwrap().done = generated.len();
            }
            let mut lab = worker_service.lock().unwrap();
            if job.lock().unwrap().cancelled {
                return Ok(());
            }
            lab.append_document_pairs(&generated)?;
            job.lock().unwrap().output = Some(format!("{} examples", generated.len()));
            Ok(())
        })();
        let mut guard = job.lock().unwrap();
        guard.generation = None;
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        guard.error = result.err();
    });
    Ok(service.lock().unwrap().status())
}

pub fn start_auto_distill(
    service: Arc<Mutex<Service>>,
    app: Arc<Mutex<App>>,
    provider: &str,
    teacher: &str,
    topic: &str,
    replace: bool,
) -> Result<Value, String> {
    let topic = topic.trim();
    if topic.is_empty() || topic.chars().count() > 500 {
        return Err("Enter a question or topic of at most 500 characters".into());
    }
    let teacher_source = resolve_teacher(&service, &app, provider, teacher)?;
    let (root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        if !replace && (!lab.rows("prompts")?.is_empty() || !lab.rows("distilled")?.is_empty()) {
            return Err(
                "Existing distillation examples would be replaced. Confirm replacement first"
                    .into(),
            );
        }
        let job = Arc::new(Mutex::new(Job::new("auto", 5)));
        lab.job = Some(job.clone());
        (lab.root.clone(), job)
    };
    let topic = topic.to_owned();
    let worker_service = service.clone();
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            verify_cloud_teacher(&teacher_source, &job)?;
            let request = format!(
                "Create exactly 5 different question-answer examples about this topic or question: {topic}\n\nIf the input is a question, include it as one example. Make the other questions explore different aspects of the same narrow topic, not simple rewordings. Give short, accurate answers. If a fact is uncertain, say so rather than inventing it. Reply ONLY with a JSON array of 5 objects, each with string fields \"prompt\" and \"completion\". No Markdown or extra text."
            );
            {
                let mut guard = job.lock().unwrap();
                if guard.cancelled {
                    return Ok(());
                }
                guard.phase = "running";
            }
            let answer = teacher_answer(&teacher_source, &job, &app, &root, &request)?;
            if job.lock().unwrap().cancelled {
                return Ok(());
            }
            let pairs = parse_generated_pairs(&answer)?;
            let mut lab = worker_service.lock().unwrap();
            if job.lock().unwrap().cancelled {
                return Ok(());
            }
            lab.save_auto_pairs(&pairs)?;
            let mut guard = job.lock().unwrap();
            guard.done = 5;
            guard.output = Some(lab.root.join("distilled.jsonl").display().to_string());
            Ok(())
        })();
        let mut guard = job.lock().unwrap();
        guard.generation = None;
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        guard.error = result.err();
    });
    Ok(service.lock().unwrap().status())
}

fn prepare_training_data(
    run: &Path,
    examples: &[Example],
    student: &str,
    iters: u64,
    resumed_from: Option<&Path>,
) -> Result<PathBuf, String> {
    let data = run.join("data");
    fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    write_examples(&data.join("train.jsonl"), examples)?;
    fs::write(
        run.join("manifest.json"),
        json!({"baseModel":student,"iterations":iters,"resumedFrom":resumed_from,
            "trainingExamples":examples.len(),"validationExamples":0,"method":"LoRA"})
        .to_string(),
    )
    .map_err(|e| e.to_string())?;
    Ok(data)
}

pub fn start_train(
    service: Arc<Mutex<Service>>,
    app: Arc<Mutex<App>>,
    iters: u64,
) -> Result<Value, String> {
    if !cfg!(any(
        all(target_os = "macos", target_arch = "aarch64"),
        target_os = "windows"
    )) {
        return Err("Fine tuning requires an Apple Silicon Mac or a Windows CUDA GPU".into());
    }
    if !(20..=300).contains(&iters) {
        return Err("Iterations must be between 20 and 300".into());
    }
    let mut app_guard = app
        .try_lock()
        .map_err(|_| "Chat is busy; try again when it finishes")?;
    let (examples, student, root, resume, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        let examples = lab.rows("training")?;
        if examples.len() < 5 {
            return Err("Training needs at least five prompt/completion pairs".into());
        }
        if examples.iter().any(|row| {
            row.completion
                .as_ref()
                .is_some_and(|answer| answer.chars().count() > 4000)
        }) {
            return Err("Shorten every answer to 4000 characters before training".into());
        }
        let job = Arc::new(Mutex::new(Job::new("train", iters as usize)));
        let resume = lab.continuation_adapter(&examples);
        let student = lab.checked_student_model()?;
        if cfg!(windows) && lab.student_selection() != LOCAL_STUDENT {
            return Err("Choose a local model folder before CUDA training".into());
        }
        lab.job = Some(job.clone());
        (examples, student, lab.root.clone(), resume, job)
    };
    app_guard.inference = None;
    drop(app_guard);
    thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            if job.lock().unwrap().cancelled {
                return Ok(String::new());
            }
            let run = root.join("runs").join(id());
            let data = prepare_training_data(&run, &examples, &student, iters, resume.as_deref())?;
            let adapter = run.join("adapter");
            let log_path = run.join("train.log");
            let training_base = prepare_gguf_base(Path::new(&student), &root, &job, &log_path)?;
            let log = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .map_err(|e| e.to_string())?;
            let stderr = log.try_clone().map_err(|e| e.to_string())?;
            let mut command = if cfg!(windows) {
                let python = cuda_python(&root)?;
                let script = cuda_worker(&run)?;
                let mut command = Command::new(python);
                command
                    .arg(script)
                    .arg("train")
                    .arg("--model")
                    .arg(&training_base)
                    .arg("--data")
                    .arg(data.join("train.jsonl"))
                    .arg("--adapter")
                    .arg(&adapter)
                    .arg("--iters")
                    .arg(iters.to_string());
                if let Some(previous) = &resume {
                    command.arg("--resume").arg(previous.parent().unwrap());
                }
                command
            } else {
                let mut command = Command::new(mlx_tool(&root, "MLX_LM_LORA", "mlx_lm.lora"));
                command
                    .arg("--model")
                    .arg(&training_base)
                    .args(["--train", "--data"])
                    .arg(&data)
                    .arg("--adapter-path")
                    .arg(&adapter);
                if let Some(previous) = &resume {
                    command.arg("--resume-adapter-file").arg(previous);
                }
                command.args([
                    "--iters",
                    &iters.to_string(),
                    "--batch-size",
                    "1",
                    "--mask-prompt",
                    "--max-seq-length",
                    "1024",
                    "--steps-per-report",
                    "1",
                ]);
                command
            };
            let child = command
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(stderr))
                .spawn()
                .map_err(|e| format!("Cannot start the training worker: {e}"))?;
            {
                let mut guard = job.lock().unwrap();
                if guard.cancelled {
                    let mut child = child;
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok(String::new());
                }
                guard.phase = "running";
                guard.log = Some(log_path.clone());
                guard.child = Some(child);
            }
            loop {
                let done = {
                    let mut guard = job.lock().unwrap();
                    let status = guard
                        .child
                        .as_mut()
                        .unwrap()
                        .try_wait()
                        .map_err(|e| e.to_string())?;
                    if guard.cancelled {
                        return Ok(String::new());
                    }
                    status
                };
                if let Some(status) = done {
                    if !status.success() {
                        let detail = fs::read_to_string(&log_path)
                            .ok()
                            .and_then(|log| {
                                log.lines()
                                    .rev()
                                    .find(|line| !line.trim().is_empty())
                                    .map(|line| line.chars().take(300).collect::<String>())
                            })
                            .unwrap_or_else(|| format!("exited with {status}"));
                        return Err(format!("Training failed: {detail}"));
                    }
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }
            if adapter_weights(&adapter).is_none() {
                return Err("Training ended without an adapter; see the training log".into());
            }
            fs::write(run.join(".complete"), "ok\n").map_err(|e| e.to_string())?;
            Ok(adapter.display().to_string())
        })();
        let mut guard = job.lock().unwrap();
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        match result {
            Ok(path) if !path.is_empty() => {
                guard.done = guard.total;
                guard.output = Some(path);
            }
            Err(error) => guard.error = Some(error),
            _ => {}
        }
    });
    Ok(service.lock().unwrap().status())
}

fn valid_gguf(path: &Path) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() < 32 {
        return Err("The exported GGUF is incomplete".into());
    }
    let mut magic = [0; 4];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if &magic != b"GGUF" {
        return Err("The exported model is not a GGUF file".into());
    }
    Ok(())
}

fn resolved_tool(override_name: &str, name: &str) -> PathBuf {
    let tool = tool_path(override_name, name);
    if tool.components().count() > 1 {
        return tool;
    }
    std::env::var_os("PATH")
        .and_then(|path| {
            std::env::split_paths(&path)
                .map(|dir| dir.join(&tool))
                .find(|candidate| candidate.is_file())
        })
        .unwrap_or(tool)
}

fn mlx_python(fuse_tool: &Path) -> PathBuf {
    std::env::var_os("LLAMA_CONVERT_PYTHON")
        .map(PathBuf::from)
        .or_else(|| {
            fs::read_to_string(fuse_tool)
                .ok()?
                .lines()
                .next()?
                .strip_prefix("#!")
                .map(PathBuf::from)
        })
        .unwrap_or_else(|| PathBuf::from("python3"))
}

fn cached_base_model(python: &Path, student: &str) -> Result<PathBuf, String> {
    const FIND_SNAPSHOT: &str = "import sys; from pathlib import Path; from huggingface_hub import hf_hub_download; print(Path(hf_hub_download(sys.argv[1], filename='config.json', local_files_only=True)).parent)";
    let output = Command::new(python)
        .args(["-c", FIND_SNAPSHOT, student])
        .output()
        .map_err(|e| format!("Cannot locate the cached base model: {e}"))?;
    if !output.status.success() {
        return Err("The base model is not fully available in the local Hugging Face cache".into());
    }
    let snapshot = PathBuf::from(
        std::str::from_utf8(&output.stdout)
            .map_err(|_| "Invalid cached model path")?
            .trim(),
    );
    validate_cached_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn validate_cached_snapshot(snapshot: &Path) -> Result<(), String> {
    let config: Value =
        serde_json::from_slice(&fs::read(snapshot.join("config.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if !["qwen2", "llama", "gemma2"].contains(&config["model_type"].as_str().unwrap_or(""))
        || !snapshot.join("tokenizer.json").is_file()
        || !(snapshot.join("model.safetensors").is_file()
            || snapshot.join("model.safetensors.index.json").is_file())
    {
        return Err("The cached base model is missing required weights or tokenizer files".into());
    }
    Ok(())
}

fn validate_local_model_folder(folder: &Path) -> Result<(), String> {
    if !folder.is_dir() {
        return Err("localModelInvalid".into());
    }
    let config_path = folder.join("config.json");
    if fs::metadata(&config_path).map_or(true, |meta| meta.len() > 1024 * 1024) {
        return Err("localModelInvalid".into());
    }
    let config: Value =
        serde_json::from_slice(&fs::read(config_path).map_err(|_| "localModelInvalid")?)
            .map_err(|_| "localModelInvalid")?;
    if config["model_type"].as_str().is_none_or(str::is_empty)
        || !(folder.join("tokenizer.json").is_file() || folder.join("tokenizer.model").is_file())
        || !fs::read_dir(folder)
            .map_err(|_| "localModelInvalid")?
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|ext| ext == "safetensors")
                    && entry
                        .metadata()
                        .is_ok_and(|meta| meta.is_file() && meta.len() > 0)
            })
    {
        return Err("localModelInvalid".into());
    }
    Ok(())
}

fn validate_local_model_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        return validate_local_model_folder(path);
    }
    if !path.is_file()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("gguf"))
    {
        return Err("localModelInvalid".into());
    }
    valid_gguf(path).map_err(|_| "localModelInvalid".into())
}

pub fn choose_local_model(service: Arc<Mutex<Service>>, file: bool) -> Result<Value, String> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err("localModelUnsupportedPlatform".into());
    }
    if service.lock().unwrap().busy() {
        return Err("A lab job is already running".into());
    }
    let output = if cfg!(windows) {
        let script = if file {
            "Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.OpenFileDialog; $picker.Title = 'Choose a GGUF model for fine tuning'; $picker.Filter = 'GGUF models (*.gguf)|*.gguf'; $picker.CheckFileExists = $true; if ($picker.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::WriteLine($picker.FileName) } else { exit 1 }"
        } else {
            "Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = 'Choose a model folder for fine tuning'; if ($picker.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::WriteLine($picker.SelectedPath) } else { exit 1 }"
        };
        Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", script])
            .output()
    } else {
        let script = if file {
            "POSIX path of (choose file with prompt \"Choose a GGUF model for fine tuning\")"
        } else {
            "POSIX path of (choose folder with prompt \"Choose a model folder for fine tuning\")"
        };
        Command::new("osascript").args(["-e", script]).output()
    }
    .map_err(|_| "localModelPickerUnavailable")?;
    if !output.status.success() {
        return Err("localModelCancelled".into());
    }
    let folder = std::str::from_utf8(&output.stdout)
        .map_err(|_| "localModelInvalid")?
        .trim_end_matches(['\r', '\n']);
    service
        .lock()
        .unwrap()
        .select_local_model_path(Path::new(folder))
}

fn run_export_step(
    job: &Arc<Mutex<Job>>,
    mut command: Command,
    label: &str,
    log: &Path,
    advance: bool,
) -> Result<(), String> {
    let output = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log)
        .map_err(|e| e.to_string())?;
    writeln!(&output, "\n{label}\n").map_err(|e| e.to_string())?;
    let error = output.try_clone().map_err(|e| e.to_string())?;
    let child = command
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(error))
        .spawn()
        .map_err(|e| format!("Cannot start {label}: {e}"))?;
    {
        let mut guard = job.lock().unwrap();
        if guard.cancelled {
            let mut child = child;
            let _ = child.kill();
            let _ = child.wait();
            return Err("Export cancelled".into());
        }
        guard.phase = "running";
        guard.log = Some(log.to_path_buf());
        guard.child = Some(child);
    }
    loop {
        let mut guard = job.lock().unwrap();
        let status = guard
            .child
            .as_mut()
            .unwrap()
            .try_wait()
            .map_err(|e| e.to_string())?;
        if guard.cancelled {
            let _ = guard.child.as_mut().unwrap().wait();
            guard.child = None;
            return Err("Export cancelled".into());
        }
        if let Some(status) = status {
            guard.child = None;
            if !status.success() {
                let detail = fs::read_to_string(log)
                    .ok()
                    .and_then(|content| {
                        content
                            .lines()
                            .rev()
                            .find(|line| !line.trim().is_empty())
                            .map(|line| line.chars().take(300).collect::<String>())
                    })
                    .unwrap_or_else(|| format!("exited with {status}"));
                return Err(format!("{label}: {detail}"));
            }
            if advance {
                guard.done += 1;
            }
            return Ok(());
        }
        drop(guard);
        thread::sleep(Duration::from_millis(250));
    }
}

pub fn start_export(service: Arc<Mutex<Service>>, app: Arc<Mutex<App>>) -> Result<Value, String> {
    if !cfg!(any(
        all(target_os = "macos", target_arch = "aarch64"),
        target_os = "windows"
    )) {
        return Err("Model export requires an Apple Silicon Mac or Windows".into());
    }
    let models = app
        .try_lock()
        .map_err(|_| "Chat is busy; try again when it finishes")?
        .models
        .clone();
    let (adapter, student, root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        if !lab.adapter_fresh() {
            return Err("Fine tune with the current examples before creating a model".into());
        }
        let adapter = lab.latest_adapter().ok_or("Train an adapter first")?;
        let student = lab.checked_student_model()?;
        let job = Arc::new(Mutex::new(Job::new("export", 3)));
        lab.job = Some(job.clone());
        (adapter, student, lab.root.clone(), job)
    };
    thread::spawn(move || {
        let run = adapter.parent().unwrap().to_path_buf();
        let export = run.join("export");
        let fused = export.join("fused");
        let f16 = export.join("model-f16.gguf");
        let short_name = Path::new(&student)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Model")
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
            .take(80)
            .collect::<String>();
        let short_name = if short_name.is_empty() {
            "Model"
        } else {
            &short_name
        };
        let final_name = format!(
            "LlamaNest-{short_name}-{}-Q4_K_M.gguf",
            run.file_name().unwrap().to_string_lossy()
        );
        let part = models.join(format!(".{final_name}.part"));
        let target = models.join(&final_name);
        let log = export.join("export.log");
        let result = (|| -> Result<String, String> {
            fs::create_dir_all(&export).map_err(|e| e.to_string())?;
            fs::create_dir_all(&models).map_err(|e| e.to_string())?;
            if target.exists() {
                return Err("This model is already in the library".into());
            }
            let training_base = prepare_gguf_base(Path::new(&student), &root, &job, &log)?;
            // Fusion writes a full copy, conversion writes F16, then quantization writes Q4.
            // Keep a reserve to avoid filling the user's disk halfway through export.
            let free_bytes = crate::quantize::free_disk_bytes(&models)?;
            let needed_gb = match student.as_str() {
                DEFAULT_STUDENT => 3,
                "Qwen/Qwen2.5-1.5B-Instruct" => 8,
                "Qwen/Qwen2.5-3B-Instruct" | "meta-llama/Llama-3.2-3B-Instruct" => 16,
                "Qwen/Qwen2.5-7B-Instruct" => 35,
                _ if Path::new(&student).is_absolute() => {
                    let weight_bytes = fs::read_dir(&training_base)
                        .map_err(|e| e.to_string())?
                        .filter_map(Result::ok)
                        .filter(|entry| {
                            entry
                                .path()
                                .extension()
                                .is_some_and(|ext| ext == "safetensors")
                        })
                        .filter_map(|entry| entry.metadata().ok().map(|meta| meta.len()))
                        .sum::<u64>();
                    3 + weight_bytes.saturating_mul(3).div_ceil(1024 * 1024 * 1024)
                }
                _ => 45,
            };
            if free_bytes < needed_gb * 1024 * 1024 * 1024 {
                return Err(format!(
                    "At least {needed_gb} GB of free disk space is needed to create the model"
                ));
            }
            let python = if cfg!(windows) {
                let python = cuda_python(&root)?;
                let script = cuda_worker(&export)?;
                let mut merge = Command::new(&python);
                merge
                    .arg(script)
                    .arg("merge")
                    .arg("--model")
                    .arg(&training_base)
                    .arg("--adapter")
                    .arg(&adapter)
                    .arg("--output")
                    .arg(&fused);
                run_export_step(
                    &job,
                    merge,
                    "Merge CUDA adapter with base model",
                    &log,
                    true,
                )?;
                python
            } else {
                let fuse_tool = mlx_tool(&root, "MLX_LM_FUSE", "mlx_lm.fuse");
                let python = mlx_python(&fuse_tool);
                let base = if Path::new(&student).is_absolute() {
                    let path = training_base.clone();
                    validate_local_model_folder(&path)?;
                    path
                } else {
                    cached_base_model(&python, &student)?
                };
                let mut fuse = Command::new(&fuse_tool);
                fuse.arg("--model")
                    .arg(&base)
                    .arg("--adapter-path")
                    .arg(&adapter)
                    .arg("--save-path")
                    .arg(&fused);
                if Path::new(&student).is_absolute() {
                    let config: Value = serde_json::from_slice(
                        &fs::read(base.join("config.json")).map_err(|e| e.to_string())?,
                    )
                    .map_err(|e| e.to_string())?;
                    if !config["quantization"].is_null() || !config["quantization_config"].is_null()
                    {
                        fuse.arg("--de-quantize");
                    }
                }
                run_export_step(&job, fuse, "Fuse adapter with base model", &log, true)?;
                python
            };
            if !fused.join("config.json").is_file() {
                return Err("Fusion did not produce a model".into());
            }

            let mut convert = Command::new(python);
            convert
                .arg(if cfg!(windows) {
                    cuda_converter()?
                } else {
                    cuda_converter().unwrap_or_else(|_| {
                        resolved_tool("LLAMA_CONVERT_HF", "convert_hf_to_gguf.py")
                    })
                })
                .arg(&fused)
                .args(["--outfile"])
                .arg(&f16)
                .args(["--outtype", "f16"]);
            run_export_step(&job, convert, "Convert fused model to GGUF", &log, true)?;
            valid_gguf(&f16)?;

            let mut quantize = Command::new(tool_path("LLAMA_QUANTIZE", "llama-quantize"));
            quantize.arg(&f16).arg(&part).arg("Q4_K_M");
            run_export_step(&job, quantize, "Quantize GGUF model", &log, true)?;
            valid_gguf(&part)?;
            fs::rename(&part, &target).map_err(|e| e.to_string())?;
            // The finished model is in the library; temporary full precision copies are no longer needed.
            let _ = fs::remove_file(&f16);
            let _ = fs::remove_dir_all(&fused);
            Ok(final_name)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&part);
            let _ = fs::remove_file(&f16);
            let _ = fs::remove_dir_all(&fused);
        }
        let mut guard = job.lock().unwrap();
        guard.child = None;
        guard.phase = if guard.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "failed"
        };
        match result {
            Ok(name) => guard.output = Some(name),
            Err(error) => guard.error = Some(error),
        }
    });
    Ok(service.lock().unwrap().status())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cached_base_needs_weights_and_tokenizer_but_not_repository_docs() {
        let dir = std::env::temp_dir().join(format!("llamanest-cached-base-{}", id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("config.json"), br#"{"model_type":"qwen2"}"#).unwrap();
        fs::write(dir.join("tokenizer.json"), b"{}").unwrap();
        fs::write(dir.join("model.safetensors"), b"weights").unwrap();
        assert!(validate_cached_snapshot(&dir).is_ok());
        fs::remove_file(dir.join("model.safetensors")).unwrap();
        assert!(validate_cached_snapshot(&dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn dataset_rejects_mixed_and_duplicate_examples() {
        assert!(parse_examples(b"{\"prompt\":\"a\"}\n{\"prompt\":\"a\"}\n")
            .unwrap_err()
            .contains("Duplicate"));
        assert!(
            parse_examples(b"{\"prompt\":\"a\"}\n{\"prompt\":\"b\",\"completion\":\"c\"}\n")
                .unwrap_err()
                .contains("either")
        );
    }
    #[test]
    fn dataset_round_trip() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("pairs.jsonl");
        let examples = parse_examples(b"{\"prompt\":\"one\",\"completion\":\"two\"}\n").unwrap();
        write_examples(&path, &examples).unwrap();
        assert_eq!(
            read_examples(&path).unwrap()[0].completion.as_deref(),
            Some("two")
        );
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn selected_dataset_persists_after_restart() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .upload(b"{\"prompt\":\"one\",\"completion\":\"two\"}\n")
            .unwrap();
        assert_eq!(Service::new(dir.clone()).status()["trainingCount"], 1);
        assert_eq!(
            Service::new(dir.clone()).examples("training").unwrap()["examples"][0]["completion"],
            "two"
        );
        service
            .upload(b"{\"prompt\":\"changed\",\"completion\":\"answer\"}\n")
            .unwrap();
        assert_eq!(
            Service::new(dir.clone()).examples("training").unwrap()["examples"][0]["prompt"],
            "changed"
        );
        fs::write(
            dir.join("distilled.jsonl"),
            b"{\"prompt\":\"other\",\"completion\":\"answer\"}\n",
        )
        .unwrap();
        assert_eq!(Service::new(dir.clone()).status()["distilledCount"], 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn training_and_distillation_datasets_stay_separate() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save("training", &json!([{"prompt":"a","completion":"b"}]))
            .unwrap();
        service.save("prompts", &json!([{"prompt":"c"}])).unwrap();
        let reopened = Service::new(dir.clone());
        assert_eq!(
            reopened.examples("training").unwrap()["examples"][0]["prompt"],
            "a"
        );
        assert_eq!(
            reopened.examples("prompts").unwrap()["examples"][0]["prompt"],
            "c"
        );
        assert_eq!(reopened.status()["trainingCount"], 1);
        assert_eq!(reopened.status()["promptCount"], 1);
        service.save("training", &json!([])).unwrap();
        assert_eq!(Service::new(dir.clone()).status()["trainingCount"], 0);
        assert_eq!(Service::new(dir.clone()).status()["promptCount"], 1);
        service
            .save("distilled", &json!([{"prompt":"c","completion":"d"}]))
            .unwrap();
        service.use_distilled().unwrap();
        assert_eq!(
            Service::new(dir.clone()).examples("training").unwrap()["examples"][0]["completion"],
            "d"
        );
        assert_eq!(Service::new(dir.clone()).status()["promptCount"], 1);
        service
            .save("prompts", &json!([{"prompt":"new question"}]))
            .unwrap();
        assert!(service.use_distilled().unwrap_err().contains("changed"));
        service.save("prompts", &json!([{"prompt":"c"}])).unwrap();
        let long_answer = "x".repeat(5000);
        service
            .save(
                "distilled",
                &json!([{"prompt":"c","completion":long_answer}]),
            )
            .unwrap();
        assert!(service.use_distilled().unwrap_err().contains("4000"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn changing_examples_marks_the_adapter_outdated() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save("training", &json!([{"prompt":"a","completion":"b"}]))
            .unwrap();
        let adapter = dir.join("runs/1/adapter");
        fs::create_dir_all(&adapter).unwrap();
        fs::write(
            adapter.parent().unwrap().join("manifest.json"),
            json!({"baseModel":DEFAULT_STUDENT,"trainingExamples":0,"validationExamples":1})
                .to_string(),
        )
        .unwrap();
        thread::sleep(Duration::from_millis(20));
        fs::write(adapter.join("adapters.safetensors"), b"test").unwrap();
        assert!(service.status()["adapter"].is_string());
        assert_eq!(service.status()["adapterFresh"], false);
        fs::write(
            adapter.parent().unwrap().join("manifest.json"),
            json!({"baseModel":DEFAULT_STUDENT,"trainingExamples":1,"validationExamples":0})
                .to_string(),
        )
        .unwrap();
        fs::write(adapter.parent().unwrap().join(".complete"), b"ok\n").unwrap();
        assert_eq!(service.status()["adapterFresh"], true);
        thread::sleep(Duration::from_millis(20));
        service
            .save(
                "training",
                &json!([{"prompt":"a","completion":"corrected"}]),
            )
            .unwrap();
        assert_eq!(Service::new(dir.clone()).status()["adapterFresh"], false);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn student_selection_persists_and_keeps_adapters_separate() {
        let dir = std::env::temp_dir().join(format!("llamanest-student-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save("training", &json!([{"prompt":"a","completion":"b"}]))
            .unwrap();
        let adapter = dir.join("runs/1/adapter");
        fs::create_dir_all(&adapter).unwrap();
        fs::write(
            adapter.parent().unwrap().join("manifest.json"),
            json!({"baseModel":DEFAULT_STUDENT,"trainingExamples":1,"validationExamples":0})
                .to_string(),
        )
        .unwrap();
        fs::write(adapter.join("adapters.safetensors"), b"test").unwrap();
        fs::write(adapter.parent().unwrap().join(".complete"), b"ok\n").unwrap();
        assert_eq!(service.status()["adapterFresh"], true);

        let larger = STUDENT_MODELS[1];
        assert_eq!(service.select_student(larger).unwrap()["baseModel"], larger);
        let reopened = Service::new(dir.clone());
        assert_eq!(reopened.status()["baseModel"], larger);
        assert_eq!(reopened.status()["adapter"], Value::Null);
        assert_eq!(reopened.status()["adapterFresh"], false);
        assert_eq!(
            service.select_student("unknown").unwrap_err(),
            "Unsupported student model"
        );
        assert_eq!(Service::new(dir.clone()).status()["baseModel"], larger);
        service.select_student(DEFAULT_STUDENT).unwrap();
        assert_eq!(service.status()["adapterFresh"], true);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn curated_chat_models_have_supported_training_bases() {
        let catalog: Value = serde_json::from_str(include_str!("../models/catalog.json")).unwrap();
        for model in catalog.as_array().unwrap() {
            let file = model["file"].as_str().unwrap();
            let (_, base) = CHAT_TRAIN_BASES
                .iter()
                .find(|(name, _)| *name == file)
                .expect("curated chat model needs a training base");
            assert!(STUDENT_MODELS.contains(base));
        }
    }

    #[test]
    fn local_training_folder_is_validated_and_selection_persists() {
        let root = std::env::temp_dir().join(format!("llamanest-local-model-{}", id()));
        let folder = root.join("my-model");
        fs::create_dir_all(&folder).unwrap();
        let mut service = Service::new(root.join("lab"));
        assert_eq!(
            service.select_local_model_path(&folder).unwrap_err(),
            "localModelInvalid"
        );
        fs::write(folder.join("config.json"), br#"{"model_type":"qwen2"}"#).unwrap();
        fs::write(folder.join("tokenizer.json"), b"{}").unwrap();
        fs::write(folder.join("model.safetensors"), b"weights").unwrap();
        let selected = service.select_local_model_path(&folder).unwrap();
        assert_eq!(selected["baseModel"], LOCAL_STUDENT);
        assert_eq!(selected["localModelValid"], true);
        assert_eq!(
            selected["resolvedBaseModel"],
            fs::canonicalize(&folder).unwrap().to_str().unwrap()
        );
        let mut reopened = Service::new(root.join("lab"));
        assert_eq!(reopened.status()["baseModel"], LOCAL_STUDENT);
        assert_eq!(
            reopened
                .select_student(folder.to_str().unwrap())
                .unwrap_err(),
            "Unsupported student model"
        );
        reopened.select_student(DEFAULT_STUDENT).unwrap();
        assert_eq!(reopened.status()["baseModel"], DEFAULT_STUDENT);
        reopened.select_student(LOCAL_STUDENT).unwrap();
        fs::remove_file(folder.join("model.safetensors")).unwrap();
        assert_eq!(reopened.status()["localModelValid"], false);
        assert_eq!(
            reopened.checked_student_model().unwrap_err(),
            "localModelInvalid"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selected_gguf_file_is_validated_and_persists_as_training_model() {
        let root = std::env::temp_dir().join(format!("llamanest-gguf-model-{}", id()));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("my-chat-model.gguf");
        fs::write(&file, [0_u8; 32]).unwrap();
        let mut service = Service::new(root.join("lab"));
        assert_eq!(
            service.select_local_model_path(&file).unwrap_err(),
            "localModelInvalid"
        );
        let mut bytes = [0_u8; 32];
        bytes[..4].copy_from_slice(b"GGUF");
        fs::write(&file, bytes).unwrap();
        let selected = service.select_local_model_path(&file).unwrap();
        assert_eq!(selected["localModelName"], "my-chat-model.gguf");
        assert_eq!(selected["localModelValid"], true);
        let reopened = Service::new(root.join("lab"));
        assert_eq!(
            reopened.status()["resolvedBaseModel"],
            fs::canonicalize(&file).unwrap().to_str().unwrap()
        );
        fs::remove_file(file).unwrap();
        assert_eq!(reopened.status()["localModelValid"], false);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn automatic_examples_are_validated_and_saved_for_review() {
        let dir = std::env::temp_dir().join(format!("llamanest-auto-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save("training", &json!([{"prompt":"keep","completion":"this"}]))
            .unwrap();
        service
            .save("prompts", &json!([{"prompt":"old?"}]))
            .unwrap();
        service
            .save(
                "distilled",
                &json!([{"prompt":"old?","completion":"old answer"}]),
            )
            .unwrap();
        let response = format!(
            "```json\n{}\n```",
            json!((0..5)
                .map(|index| json!({"prompt":format!("Question {index}?"),"completion":format!("Answer {index}.")}))
                .collect::<Vec<_>>())
        );
        let pairs = parse_generated_pairs(&response).unwrap();
        service.save_auto_pairs(&pairs).unwrap();
        let reopened = Service::new(dir.clone());
        assert_eq!(reopened.status()["promptCount"], 5);
        assert_eq!(reopened.status()["distilledCount"], 5);
        assert_eq!(reopened.status()["trainingCount"], 1);
        assert_eq!(
            reopened.examples("prompts").unwrap()["examples"][0]["prompt"],
            "Question 0?"
        );
        assert_eq!(
            reopened.examples("distilled").unwrap()["examples"][0]["completion"],
            "Answer 0."
        );
        assert!(
            parse_generated_pairs("[{\"prompt\":\"one\",\"completion\":\"answer\"}]")
                .unwrap_err()
                .contains("teacherTooFew")
        );
        let repeated = json!((0..5)
            .map(|_| json!({"prompt":"same?","completion":"answer"}))
            .collect::<Vec<_>>());
        assert!(parse_generated_pairs(&repeated.to_string())
            .unwrap_err()
            .contains("teacherDuplicate"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn document_upload_and_generated_examples_persist_without_replacing_existing_pairs() {
        let dir = std::env::temp_dir().join(format!("llamanest-document-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save(
                "training",
                &json!([{"prompt":"existing?","completion":"yes"}]),
            )
            .unwrap();
        service
            .upload_document(
                "guide.txt",
                b"The office opens at nine. Visitors sign in at reception.",
            )
            .unwrap();
        assert_eq!(service.status()["document"]["name"], "guide.txt");
        assert!(service
            .document_source()
            .unwrap()
            .contains("Visitors sign in"));
        assert_eq!(
            service
                .upload_document("../secret.txt", b"bad")
                .unwrap_err(),
            "documentInvalidFile"
        );
        let pairs = vec![Example {
            prompt: "When does the office open?".into(),
            completion: Some("At nine.".into()),
        }];
        service.append_document_pairs(&pairs).unwrap();
        let reopened = Service::new(dir.clone());
        assert_eq!(reopened.status()["trainingCount"], 2);
        assert_eq!(reopened.status()["document"]["name"], "guide.txt");
        assert_eq!(
            reopened.examples("training").unwrap()["examples"][0]["prompt"],
            "existing?"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn openrouter_key_persists_without_leaking_into_status() {
        let dir = std::env::temp_dir().join(format!("llamanest-openrouter-{}", id()));
        let mut service = Service::new(dir.clone());
        let key = "sk-or-v1-testsecret123456789";
        assert_eq!(
            service.save_openrouter_key("short").unwrap_err(),
            "openrouterInvalidKey"
        );
        let status = service.save_openrouter_key(key).unwrap();
        assert_eq!(status["openrouterConfigured"], true);
        assert!(!status.to_string().contains(key));
        assert_eq!(
            fs::read_to_string(dir.join("openrouter-key.txt")).unwrap(),
            key
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(dir.join("openrouter-key.txt"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        let mut reopened = Service::new(dir.clone());
        assert_eq!(reopened.status()["openrouterConfigured"], true);
        reopened
            .save_openrouter_key("sk-or-v1-replacement123")
            .unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("openrouter-key.txt")).unwrap(),
            "sk-or-v1-replacement123"
        );
        assert_eq!(
            reopened.remove_openrouter_key().unwrap()["openrouterConfigured"],
            false
        );
        assert!(!dir.join("openrouter-key.txt").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn openrouter_search_query_is_percent_encoded() {
        assert_eq!(encode_query("Qwen 3.5/0.5B"), "Qwen%203.5%2F0.5B");
        assert!(!valid_openrouter_key("bad\nheader"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn word_document_text_is_extracted_without_retaining_the_original_file() {
        let dir = std::env::temp_dir().join(format!("llamanest-docx-{}", id()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("sample.docx");
        let script = r#"import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as archive:
    archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello colleague</w:t></w:r></w:p></w:body></w:document>')
"#;
        assert!(Command::new("python3")
            .args(["-c", script])
            .arg(&source)
            .status()
            .unwrap()
            .success());
        let bytes = fs::read(&source).unwrap();
        assert_eq!(
            document_text("sample.docx", &bytes, &dir).unwrap(),
            "Hello colleague"
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn training_includes_the_first_example() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        let examples = (0..5)
            .map(|index| Example {
                prompt: format!("question {index}"),
                completion: Some(format!("answer {index}")),
            })
            .collect::<Vec<_>>();
        let data = prepare_training_data(&dir, &examples, DEFAULT_STUDENT, 20, None).unwrap();
        let saved = read_examples(&data.join("train.jsonl")).unwrap();
        assert_eq!(saved.len(), 5);
        assert_eq!(saved[0].prompt, "question 0");
        assert!(!data.join("valid.jsonl").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn reset_clears_only_the_selected_path_and_persists() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-reset-{}", id()));
        let mut service = Service::new(dir.clone());
        service
            .save(
                "training",
                &json!([{"prompt":"student","completion":"answer"}]),
            )
            .unwrap();
        service
            .save("prompts", &json!([{"prompt":"teacher"}]))
            .unwrap();
        service
            .save(
                "distilled",
                &json!([{"prompt":"teacher","completion":"answer"}]),
            )
            .unwrap();
        service.reset("prompts").unwrap();
        let reopened = Service::new(dir.clone());
        assert_eq!(reopened.status()["trainingCount"], 1);
        assert_eq!(reopened.status()["promptCount"], 0);
        assert_eq!(reopened.status()["distilledCount"], 0);
        service.reset("training").unwrap();
        assert_eq!(Service::new(dir.clone()).status()["trainingCount"], 0);
        assert!(service.reset("distilled").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn training_can_continue_after_a_correction_but_reset_starts_fresh() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-resume-{}", id()));
        let mut service = Service::new(dir.clone());
        let original = (0..5)
            .map(|i| Example {
                prompt: format!("question {i}"),
                completion: Some(format!("answer {i}")),
            })
            .collect::<Vec<_>>();
        let run = dir.join("runs/1");
        prepare_training_data(&run, &original, DEFAULT_STUDENT, 20, None).unwrap();
        let adapter = run.join("adapter/adapters.safetensors");
        fs::create_dir_all(adapter.parent().unwrap()).unwrap();
        fs::write(&adapter, b"adapter").unwrap();
        fs::write(run.join(".complete"), b"ok\n").unwrap();
        let mut corrected = original.clone();
        corrected[0].completion = Some("corrected".into());
        assert_eq!(
            service.continuation_adapter(&corrected),
            Some(adapter.clone())
        );
        let continued = dir.join("runs/2");
        prepare_training_data(&continued, &corrected, DEFAULT_STUDENT, 80, Some(&adapter)).unwrap();
        let manifest: Value =
            serde_json::from_slice(&fs::read(continued.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(manifest["resumedFrom"], adapter.to_string_lossy().as_ref());
        let unrelated = (0..5)
            .map(|i| Example {
                prompt: format!("other {i}"),
                completion: Some("answer".into()),
            })
            .collect::<Vec<_>>();
        assert!(service.continuation_adapter(&unrelated).is_none());
        service.reset("training").unwrap();
        assert!(service.continuation_adapter(&corrected).is_none());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn preview_keeps_model_answer_separate_from_diagnostics() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        fs::create_dir_all(&dir).unwrap();
        let answer = dir.join("answer.txt");
        let log = dir.join("diagnostics.log");
        fs::write(&answer, "2 figli\n").unwrap();
        fs::write(&log, "UserWarning: package version\n").unwrap();
        let mut job = Job::new("preview", 1);
        job.response = Some(answer);
        job.log = Some(log);
        let status = job.status();
        assert_eq!(status["response"], "2 figli\n");
        assert!(status["log"].as_str().unwrap().contains("UserWarning"));
        assert!(!status["response"].as_str().unwrap().contains("UserWarning"));
        fs::remove_dir_all(dir).unwrap();
    }
}
