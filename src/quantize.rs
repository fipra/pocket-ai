use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

pub struct Job {
    source: String,
    output: String,
    part: PathBuf,
    output_path: PathBuf,
    log_path: PathBuf,
    phase: &'static str,
    error: Option<String>,
    cancelled: bool,
    child: Option<Child>,
    source_bytes: u64,
}

impl Job {
    pub fn active(&self) -> bool {
        self.phase == "running" || self.phase == "starting"
    }

    pub fn status(&self) -> Value {
        let bytes = fs::metadata(if self.phase == "complete" {
            &self.output_path
        } else {
            &self.part
        })
        .map(|m| m.len())
        .unwrap_or(0);
        let percent = if self.phase == "complete" {
            100
        } else {
            tensor_progress(&self.log_path).unwrap_or(0).min(99)
        };
        json!({"active":self.active(),"phase":self.phase,"source":self.source,
            "output":self.output,"bytes":bytes,"sourceBytes":self.source_bytes,
            "percent":percent,"error":self.error})
    }

    pub fn cancel(&mut self) {
        if self.active() {
            self.cancelled = true;
            if let Some(child) = self.child.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

fn tensor_progress(log: &Path) -> Option<u64> {
    let mut file = fs::File::open(log).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(16 * 1024)))
        .ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    text.lines().rev().find_map(|line| {
        let (counts, _) = line.trim_start().strip_prefix('[')?.split_once(']')?;
        let (current, total) = counts.split_once('/')?;
        let current = current.trim().parse::<u64>().ok()?;
        let total = total.trim().parse::<u64>().ok()?;
        (total > 0 && current <= total).then_some(current.saturating_mul(100) / total)
    })
}

pub fn target_name(source: &str, kind: &str) -> Result<String, String> {
    let suffix = match kind {
        "Q8" => "Q8_0",
        "Q4" => "Q4_K_M",
        "Q3" => "Q3_K_M",
        "Q2" => "Q2_K",
        _ => return Err("Unsupported quantization".into()),
    };
    let stem = source
        .strip_suffix(".gguf")
        .or_else(|| source.strip_suffix(".GGUF"))
        .ok_or("Invalid GGUF filename")?;
    if stem.is_empty() || stem.contains(['/', '\\']) {
        return Err("Invalid GGUF filename".into());
    }
    Ok(format!("{stem}-{suffix}.gguf"))
}

pub fn looks_quantized(source: &str) -> bool {
    let upper = source.to_ascii_uppercase();
    [
        "-Q8_", "-Q6_", "-Q5_", "-Q4_", "-Q3_", "-Q2_", "-IQ", "_Q8_", "_Q6_", "_Q5_", "_Q4_",
        "_Q3_", "_Q2_", "_IQ", ".Q8_", ".Q6_", ".Q5_", ".Q4_", ".Q3_", ".Q2_", ".IQ",
    ]
    .iter()
    .any(|mark| upper.contains(mark))
}

#[cfg(windows)]
fn free_disk_bytes(dir: &Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            free_bytes_available: *mut u64,
            total_bytes: *mut u64,
            total_free_bytes: *mut u64,
        ) -> i32;
    }

    let path = dir.canonicalize().map_err(|e| e.to_string())?;
    let wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut available = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(format!(
            "Cannot check free disk space in {}: {}",
            path.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(available)
}

#[cfg(not(windows))]
fn free_disk_bytes(dir: &Path) -> Result<u64, String> {
    let output = Command::new("df")
        .arg("-Pk")
        .arg(dir)
        .output()
        .map_err(|e| format!("Cannot check disk space: {e}"))?;
    if !output.status.success() {
        return Err("Cannot check disk space".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let available = stdout
        .lines()
        .last()
        .and_then(|line| line.split_whitespace().nth(3))
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or("Cannot read free disk space")?
        .saturating_mul(1024);
    Ok(available)
}

fn disk_space_error(language: &str, dir: &Path, available: u64, required: u64) -> String {
    let free = available as f64 / 1_073_741_824.0;
    let needed = required as f64 / 1_073_741_824.0;
    let path = dir.display();
    match language {
        "it" => format!("Spazio insufficiente nella cartella {path}: {free:.1} GB liberi, circa {needed:.1} GB richiesti per la conversione. Il modello originale viene conservato."),
        "de" => format!("Nicht genug Speicherplatz im Ordner {path}: {free:.1} GB frei, etwa {needed:.1} GB für die Konvertierung benötigt. Das Originalmodell bleibt erhalten."),
        "fr" => format!("Espace insuffisant dans le dossier {path} : {free:.1} Go libres, environ {needed:.1} Go nécessaires pour la conversion. Le modèle original est conservé."),
        "es" => format!("Espacio insuficiente en la carpeta {path}: {free:.1} GB libres, se necesitan unos {needed:.1} GB para la conversión. Se conserva el modelo original."),
        _ => format!("Not enough free space in {path}: {free:.1} GB available, about {needed:.1} GB required for conversion. The original model is kept."),
    }
}

pub fn start(
    source_name: &str,
    source: &Path,
    models: &Path,
    kind: &str,
    allow_requantize: bool,
    ram_gb: Option<f64>,
    tool: &Path,
    language: &str,
) -> Result<Arc<Mutex<Job>>, String> {
    let name = target_name(source_name, kind)?;
    if looks_quantized(source_name) && !allow_requantize {
        return Err("This model appears already quantized. Requantization loses quality; enable the explicit confirmation to continue.".into());
    }
    let mut file = fs::File::open(source).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if &magic != b"GGUF" {
        return Err("Invalid GGUF file".into());
    }
    let source_bytes = file.metadata().map_err(|e| e.to_string())?.len();
    if source_bytes < 32 {
        return Err("GGUF file is incomplete".into());
    }
    let required_ram = source_bytes.saturating_add(1024 * 1024 * 1024);
    if ram_gb.is_some_and(|gb| gb * 1_073_741_824.0 < required_ram as f64) {
        return Err(format!("Insufficient total RAM: approximately {:.1} GB required. Close other apps or use a smaller source model.", required_ram as f64 / 1_073_741_824.0));
    }
    if ram_gb.is_none() {
        return Err("Cannot verify RAM on this device".into());
    }
    fs::create_dir_all(models).map_err(|e| e.to_string())?;
    let required_disk = source_bytes
        .saturating_add(source_bytes / 10)
        .saturating_add(128 * 1024 * 1024);
    let available_disk = free_disk_bytes(models)?;
    if available_disk < required_disk {
        return Err(disk_space_error(
            language,
            models,
            available_disk,
            required_disk,
        ));
    }
    let output = models.join(&name);
    if output.exists() {
        return Err("Output model already exists".into());
    }
    let part = models.join(format!(".{name}.part"));
    let log = models.join(format!(".{name}.quantize.log"));
    if part.exists() {
        return Err("A partial conversion file already exists".into());
    }
    let job = Arc::new(Mutex::new(Job {
        source: source_name.to_owned(),
        output: name.clone(),
        part: part.clone(),
        output_path: output.clone(),
        log_path: log.clone(),
        phase: "starting",
        error: None,
        cancelled: false,
        child: None,
        source_bytes,
    }));
    let shared = job.clone();
    let tool = tool.to_path_buf();
    let source = source.to_path_buf();
    let kind = kind.to_owned();
    thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let stderr = fs::File::create(&log).map_err(|e| e.to_string())?;
            let mut cmd = Command::new(tool);
            if allow_requantize {
                cmd.arg("--allow-requantize");
            }
            cmd.arg(&source)
                .arg(&part)
                .arg(match kind.as_str() {
                    "Q8" => "Q8_0",
                    "Q4" => "Q4_K_M",
                    "Q3" => "Q3_K_M",
                    _ => "Q2_K",
                })
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::from(stderr));
            let child = cmd
                .spawn()
                .map_err(|e| format!("Cannot start llama-quantize: {e}"))?;
            {
                let mut state = shared.lock().unwrap();
                state.child = Some(child);
                state.phase = "running";
                if state.cancelled {
                    state.cancel();
                }
            }
            loop {
                let status = {
                    let mut state = shared.lock().unwrap();
                    state
                        .child
                        .as_mut()
                        .unwrap()
                        .try_wait()
                        .map_err(|e| e.to_string())?
                };
                if let Some(status) = status {
                    if shared.lock().unwrap().cancelled {
                        return Err("Conversion cancelled".into());
                    }
                    if !status.success() {
                        let detail = fs::read_to_string(&log).unwrap_or_default();
                        let detail = detail
                            .lines()
                            .rev()
                            .find(|line| !line.trim().is_empty())
                            .unwrap_or("Unknown error");
                        return Err(format!("llama-quantize failed: {detail}"));
                    }
                    break;
                }
                thread::sleep(Duration::from_millis(250));
            }
            let mut produced = fs::File::open(&part).map_err(|e| e.to_string())?;
            let mut magic = [0u8; 4];
            produced.read_exact(&mut magic).map_err(|e| e.to_string())?;
            if &magic != b"GGUF" {
                return Err("llama-quantize produced an invalid GGUF".into());
            }
            let mut state = shared.lock().unwrap();
            if state.cancelled {
                return Err("Conversion cancelled".into());
            }
            if output.exists() {
                return Err("Output model already exists".into());
            }
            fs::rename(&part, &output).map_err(|e| e.to_string())?;
            state.phase = "complete";
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&part);
        }
        let _ = fs::remove_file(&log);
        let mut state = shared.lock().unwrap();
        state.child = None;
        state.phase = if state.cancelled {
            "cancelled"
        } else if result.is_ok() {
            "complete"
        } else {
            "error"
        };
        state.error = result.err();
    });
    Ok(job)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn windows_disk_check_reads_available_bytes_from_real_folder() {
        let available = free_disk_bytes(&std::env::temp_dir()).unwrap();
        assert!(available > 128 * 1024 * 1024);
    }

    #[test]
    fn disk_error_names_the_destination_and_measured_space() {
        let message = disk_space_error(
            "it",
            Path::new("models"),
            8 * 1_073_741_824,
            17 * 1_073_741_824,
        );
        assert!(message.contains("models"));
        assert!(message.contains("8.0 GB liberi"));
        assert!(message.contains("17.0 GB richiesti"));
    }
    #[test]
    fn target_names_and_safety() {
        assert_eq!(
            target_name("Model.gguf", "Q3").unwrap(),
            "Model-Q3_K_M.gguf"
        );
        assert!(target_name("../Model.gguf", "Q3").is_err());
        assert!(target_name("Model.gguf", "Q1").is_err());
        assert!(looks_quantized("Llama-3B-IQ3_M.gguf"));
        assert!(looks_quantized("Model.Q4_K_M.gguf"));
        assert!(!looks_quantized("Model-F16.gguf"));
    }

    #[test]
    fn requantization_requires_explicit_consent() {
        let dir =
            std::env::temp_dir().join(format!("usb-ai-quantize-safety-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("Model-Q8_0.gguf");
        fs::write(&source, [b"GGUF".as_slice(), &[0; 40]].concat()).unwrap();
        let error = start(
            "Model-Q8_0.gguf",
            &source,
            &dir,
            "Q3",
            false,
            Some(16.0),
            Path::new("missing-tool"),
            "en",
        )
        .err()
        .unwrap();
        assert!(error.contains("Requantization loses quality"));
        assert!(!dir.join("Model-Q8_0-Q3_K_M.gguf").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn progress_uses_reported_tensor_count() {
        let log = std::env::temp_dir().join(format!(
            "usb-ai-quantize-progress-{}.log",
            std::process::id()
        ));
        fs::write(&log, "loading\n[ 100/ 400] tensor.weight\n").unwrap();
        assert_eq!(tensor_progress(&log), Some(25));
        let _ = fs::remove_file(&log);
    }

    #[cfg(unix)]
    #[test]
    fn background_conversion_can_be_cancelled_without_changing_original() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("usb-ai-quantize-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("Model-F16.gguf");
        fs::write(&source, [b"GGUF".as_slice(), &[0; 40]].concat()).unwrap();
        let tool = dir.join("fake-quantize.sh");
        fs::write(&tool, "#!/bin/sh\nprintf 'GGUF' > \"$2\"\nexec sleep 5\n").unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        let job = start(
            "Model-F16.gguf",
            &source,
            &dir,
            "Q3",
            false,
            Some(16.0),
            &tool,
            "en",
        )
        .unwrap();
        for _ in 0..40 {
            if job.lock().unwrap().status()["bytes"].as_u64().unwrap_or(0) > 0 {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(job.lock().unwrap().status()["phase"], "running");
        job.lock().unwrap().cancel();
        for _ in 0..80 {
            if !job.lock().unwrap().active() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(job.lock().unwrap().status()["phase"], "cancelled");
        assert!(!dir.join("Model-F16-Q3_K_M.gguf").exists());
        assert_eq!(&fs::read(&source).unwrap()[..4], b"GGUF");
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn completed_conversion_keeps_source_and_publishes_result() {
        use std::os::unix::fs::PermissionsExt;
        let dir =
            std::env::temp_dir().join(format!("usb-ai-quantize-success-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("Model-F16.gguf");
        fs::write(&source, [b"GGUF".as_slice(), &[0; 40]].concat()).unwrap();
        let tool = dir.join("fake-quantize.sh");
        fs::write(&tool, "#!/bin/sh\ncp \"$1\" \"$2\"\n").unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        let job = start(
            "Model-F16.gguf",
            &source,
            &dir,
            "Q4",
            false,
            Some(16.0),
            &tool,
            "en",
        )
        .unwrap();
        for _ in 0..80 {
            if !job.lock().unwrap().active() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(job.lock().unwrap().status()["phase"], "complete");
        assert_eq!(
            fs::read(dir.join("Model-F16-Q4_K_M.gguf")).unwrap(),
            fs::read(&source).unwrap()
        );
        assert!(!dir.join(".Model-F16-Q4_K_M.gguf.part").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
