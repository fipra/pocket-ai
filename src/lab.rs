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
const BASE_MODEL: &str = "Qwen/Qwen2.5-0.5B-Instruct";

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
    fn latest_adapter(&self) -> Option<PathBuf> {
        fs::read_dir(self.root.join("runs"))
            .ok()?
            .filter_map(Result::ok)
            .map(|entry| entry.path().join("adapter"))
            .filter(|path| {
                let eligible = path.parent().is_some_and(|run| {
                    if run.join(".complete").is_file() {
                        return true;
                    }
                    fs::read(run.join("manifest.json"))
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                        .and_then(|manifest| manifest["validationExamples"].as_u64())
                        .is_some_and(|count| count > 0)
                });
                path.join("adapters.safetensors").is_file() && eligible
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
        let adapter_time =
            fs::metadata(adapter.join("adapters.safetensors")).and_then(|meta| meta.modified());
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
        if manifest["baseModel"] != BASE_MODEL
            || manifest["method"] != "LoRA"
            || manifest["validationExamples"].as_u64() != Some(0)
        {
            return None;
        }
        let reset_time = fs::metadata(self.root.join("training-reset.marker"))
            .and_then(|meta| meta.modified())
            .ok();
        let adapter_time = fs::metadata(adapter.join("adapters.safetensors"))
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
        Some(adapter.join("adapters.safetensors"))
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
            "baseModel":BASE_MODEL,"trainSupported":cfg!(all(target_os="macos", target_arch="aarch64")),
            "workspace":self.root,"adapter":self.latest_adapter(),"adapterFresh":self.adapter_fresh(),
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
    let (adapter, root, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        if !lab.adapter_fresh() {
            return Err("Retrain the model with the current examples before previewing".into());
        }
        let adapter = lab.latest_adapter().ok_or("Train an adapter first")?;
        let job = Arc::new(Mutex::new(Job::new("preview", 1)));
        lab.job = Some(job.clone());
        (adapter, lab.root.clone(), job)
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
            let log = fs::File::create(&log_path).map_err(|e| e.to_string())?;
            let answer = fs::File::create(&answer_path).map_err(|e| e.to_string())?;
            let child = Command::new(tool_path("MLX_LM_GENERATE", "mlx_lm.generate"))
                .args(["--model", BASE_MODEL, "--adapter-path"])
                .arg(adapter)
                .args([
                    "--prompt",
                    &prompt,
                    "--max-tokens",
                    "160",
                    "--verbose",
                    "false",
                ])
                .stdout(Stdio::from(answer))
                .stderr(Stdio::from(log))
                .spawn()
                .map_err(|e| format!("Cannot start mlx_lm.generate: {e}"))?;
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
                        return Err(format!("mlx_lm.generate exited with {status}; see the log"));
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
    teacher: &str,
) -> Result<Value, String> {
    let teacher_path = {
        let guard = app
            .try_lock()
            .map_err(|_| "Chat is busy; try again when it finishes")?;
        guard.model_path(teacher)?
    };
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
            fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let output = root.join("distilled.jsonl.part");
            let mut completed = Vec::new();
            for example in examples {
                if job.lock().unwrap().cancelled {
                    return Ok(());
                }
                let generation = Arc::new(ActiveGeneration::new("lab".into(), id()));
                {
                    let mut guard = job.lock().unwrap();
                    guard.phase = "running";
                    guard.generation = Some(generation.clone());
                }
                let answer = {
                    let mut app = app.lock().unwrap();
                    app.infer_stream(&teacher_path, &example.prompt, &mut |_| Ok(()), &generation)
                        .map(|(answer, _)| answer)
                }?;
                {
                    job.lock().unwrap().generation = None;
                }
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
    iters: u64,
    resumed_from: Option<&Path>,
) -> Result<PathBuf, String> {
    let data = run.join("data");
    fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    write_examples(&data.join("train.jsonl"), examples)?;
    fs::write(
        run.join("manifest.json"),
        json!({"baseModel":BASE_MODEL,"iterations":iters,"resumedFrom":resumed_from,
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
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Err("This local preview supports LoRA training on Apple Silicon only".into());
    }
    if !(20..=300).contains(&iters) {
        return Err("Iterations must be between 20 and 300".into());
    }
    let mut app_guard = app
        .try_lock()
        .map_err(|_| "Chat is busy; try again when it finishes")?;
    let (examples, root, resume, job) = {
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
        lab.job = Some(job.clone());
        (examples, lab.root.clone(), resume, job)
    };
    app_guard.inference = None;
    drop(app_guard);
    thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            if job.lock().unwrap().cancelled {
                return Ok(String::new());
            }
            let run = root.join("runs").join(id());
            let data = prepare_training_data(&run, &examples, iters, resume.as_deref())?;
            let adapter = run.join("adapter");
            let log_path = run.join("train.log");
            let log = fs::File::create(&log_path).map_err(|e| e.to_string())?;
            let stderr = log.try_clone().map_err(|e| e.to_string())?;
            let executable = tool_path("MLX_LM_LORA", "mlx_lm.lora");
            let mut command = Command::new(&executable);
            command
                .args(["--model", BASE_MODEL, "--train", "--data"])
                .arg(&data)
                .arg("--adapter-path")
                .arg(&adapter);
            if let Some(previous) = &resume {
                command.arg("--resume-adapter-file").arg(previous);
            }
            let child = command
                .args([
                    "--iters",
                    &iters.to_string(),
                    "--batch-size",
                    "1",
                    "--mask-prompt",
                    "--max-seq-length",
                    "1024",
                    "--steps-per-report",
                    "1",
                ])
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(stderr))
                .spawn()
                .map_err(|e| format!("Cannot start mlx_lm.lora: {e}"))?;
            {
                let mut guard = job.lock().unwrap();
                if guard.cancelled {
                    let mut child = child;
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok(String::new());
                }
                guard.phase = "running";
                guard.log = Some(log_path);
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
                        return Err(format!(
                            "mlx_lm.lora exited with {status}; see the training log"
                        ));
                    }
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }
            if !adapter.join("adapters.safetensors").is_file() {
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

fn cached_base_model(python: &Path) -> Result<PathBuf, String> {
    const FIND_SNAPSHOT: &str = "import sys; from pathlib import Path; from huggingface_hub import hf_hub_download; print(Path(hf_hub_download(sys.argv[1], filename='config.json', local_files_only=True)).parent)";
    let output = Command::new(python)
        .args(["-c", FIND_SNAPSHOT, BASE_MODEL])
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
    if config["model_type"] != "qwen2"
        || !snapshot.join("tokenizer.json").is_file()
        || !(snapshot.join("model.safetensors").is_file()
            || snapshot.join("model.safetensors.index.json").is_file())
    {
        return Err(
            "The cached Qwen base model is missing required weights or tokenizer files".into(),
        );
    }
    Ok(())
}

fn run_export_step(
    job: &Arc<Mutex<Job>>,
    mut command: Command,
    label: &str,
    log: &Path,
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
            guard.done += 1;
            return Ok(());
        }
        drop(guard);
        thread::sleep(Duration::from_millis(250));
    }
}

pub fn start_export(service: Arc<Mutex<Service>>, app: Arc<Mutex<App>>) -> Result<Value, String> {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Err("Model export is available on Apple Silicon Macs only".into());
    }
    let models = app
        .try_lock()
        .map_err(|_| "Chat is busy; try again when it finishes")?
        .models
        .clone();
    let (adapter, job) = {
        let mut lab = service.lock().unwrap();
        if lab.busy() {
            return Err("A lab job is already running".into());
        }
        if !lab.adapter_fresh() {
            return Err("Fine tune with the current examples before creating a model".into());
        }
        let adapter = lab.latest_adapter().ok_or("Train an adapter first")?;
        let job = Arc::new(Mutex::new(Job::new("export", 3)));
        lab.job = Some(job.clone());
        (adapter, job)
    };
    thread::spawn(move || {
        let run = adapter.parent().unwrap().to_path_buf();
        let export = run.join("export");
        let fused = export.join("fused");
        let f16 = export.join("model-f16.gguf");
        let final_name = format!(
            "LlamaNest-Qwen2.5-0.5B-{}-Q4_K_M.gguf",
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
            // Fusion writes a full copy, conversion writes F16, then quantization writes Q4.
            // Keep a reserve to avoid filling the user's disk halfway through export.
            let free = Command::new("df")
                .args(["-Pk"])
                .arg(&models)
                .output()
                .map_err(|e| e.to_string())?;
            let kib = String::from_utf8_lossy(&free.stdout)
                .lines()
                .last()
                .and_then(|line| line.split_whitespace().nth(3))
                .and_then(|value| value.parse::<u64>().ok())
                .ok_or("Cannot check free disk space")?;
            if kib < 3 * 1024 * 1024 {
                return Err(
                    "At least 3 GB of free disk space is needed to create the model".into(),
                );
            }
            let fuse_tool = resolved_tool("MLX_LM_FUSE", "mlx_lm.fuse");
            let python = mlx_python(&fuse_tool);
            let base = cached_base_model(&python)?;
            let mut fuse = Command::new(&fuse_tool);
            fuse.arg("--model")
                .arg(&base)
                .arg("--adapter-path")
                .arg(&adapter)
                .arg("--save-path")
                .arg(&fused);
            run_export_step(&job, fuse, "Fuse adapter with base model", &log)?;
            if !fused.join("config.json").is_file() {
                return Err("Fusion did not produce a model".into());
            }

            let mut convert = Command::new(python);
            convert
                .arg(resolved_tool("LLAMA_CONVERT_HF", "convert_hf_to_gguf.py"))
                .arg(&fused)
                .args(["--outfile"])
                .arg(&f16)
                .args(["--outtype", "f16"]);
            run_export_step(&job, convert, "Convert fused model to GGUF", &log)?;
            valid_gguf(&f16)?;

            let mut quantize = Command::new(tool_path("LLAMA_QUANTIZE", "llama-quantize"));
            quantize.arg(&f16).arg(&part).arg("Q4_K_M");
            run_export_step(&job, quantize, "Quantize GGUF model", &log)?;
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
            json!({"trainingExamples":0,"validationExamples":1}).to_string(),
        )
        .unwrap();
        thread::sleep(Duration::from_millis(20));
        fs::write(adapter.join("adapters.safetensors"), b"test").unwrap();
        assert!(service.status()["adapter"].is_string());
        assert_eq!(service.status()["adapterFresh"], false);
        fs::write(
            adapter.parent().unwrap().join("manifest.json"),
            json!({"trainingExamples":1,"validationExamples":0}).to_string(),
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
    fn training_includes_the_first_example() {
        let dir = std::env::temp_dir().join(format!("llamanest-lab-{}", id()));
        let examples = (0..5)
            .map(|index| Example {
                prompt: format!("question {index}"),
                completion: Some(format!("answer {index}")),
            })
            .collect::<Vec<_>>();
        let data = prepare_training_data(&dir, &examples, 20, None).unwrap();
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
        prepare_training_data(&run, &original, 20, None).unwrap();
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
        prepare_training_data(&continued, &corrected, 80, Some(&adapter)).unwrap();
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
