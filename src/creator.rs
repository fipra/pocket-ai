use crate::id;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

const WORKER: &str = include_str!("../scripts/model_creator.py");

struct Job {
    child: Option<Child>,
    phase: &'static str,
    action: String,
    model: String,
    error: Option<String>,
    cancelled: bool,
}
pub struct Creator {
    root: PathBuf,
    job: Option<Arc<Mutex<Job>>>,
}
impl Drop for Creator {
    fn drop(&mut self) {
        if let Some(job) = &self.job {
            if let Ok(mut job) = job.lock() {
                if let Some(child) = job.child.as_mut() {
                    let _ = child.kill();
                }
            }
        }
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 60 && id.bytes().all(|c| c.is_ascii_digit() || c == b'-')
}
fn path(root: &Path, model: &str) -> Result<PathBuf, String> {
    if !valid_id(model) {
        return Err("Invalid model ID".into());
    }
    let folder = root.join(model);
    if fs::symlink_metadata(&folder)
        .map_or(true, |meta| meta.file_type().is_symlink() || !meta.is_dir())
    {
        return Err("Model not found".into());
    }
    Ok(folder)
}
fn read_json(path: &Path) -> Option<Value> {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}
fn python() -> PathBuf {
    std::env::var_os("LLAMANEST_CREATOR_PYTHON")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(windows) {
                PathBuf::from("python")
            } else {
                PathBuf::from("python3")
            }
        })
}

impl Creator {
    pub fn new(root: PathBuf) -> Self {
        Self { root, job: None }
    }
    pub fn status(&self) -> Value {
        let mut models = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.root) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !valid_id(&name)
                    || entry
                        .file_type()
                        .map_or(true, |kind| kind.is_symlink() || !kind.is_dir())
                {
                    continue;
                }
                if let Some(meta) = read_json(&entry.path().join("model.json")) {
                    models.push(json!({"id":name,"name":meta["name"],"config":meta["config"],"settings":meta["settings"],"checkpoint":entry.path().join("checkpoint.pt").is_file(),"dataset":entry.path().join("dataset.json").is_file(),"progress":read_json(&entry.path().join("status.json"))}));
                }
            }
        }
        models.sort_by(|a, b| b["id"].as_str().cmp(&a["id"].as_str()));
        let job = self.job.as_ref().map(|job| {
            let job=job.lock().unwrap();
            let folder=if job.model.is_empty(){self.root.join("system")}else{self.root.join(&job.model)};
            let progress=if job.action=="train" {read_json(&folder.join("status.json"))} else {None};
            let result=if job.phase=="complete" && job.action!="train" {read_json(&folder.join("result.json"))} else {None};
            json!({"phase":job.phase,"action":job.action,"model":job.model,"error":job.error,"progress":progress,"result":result})
        });
        json!({"models":models,"job":job})
    }
    pub fn cancel(&mut self) -> Value {
        if let Some(job) = &self.job {
            let mut job = job.lock().unwrap();
            if job.phase == "running" {
                job.cancelled = true;
                if let Some(child) = job.child.as_mut() {
                    let _ = child.kill();
                }
            }
        }
        self.status()
    }
    pub fn export(&self, model: &str) -> Result<PathBuf, String> {
        let file = path(&self.root, model)?.join("checkpoint.pt");
        if fs::symlink_metadata(&file).map_or(true, |meta| {
            meta.file_type().is_symlink() || !meta.is_file()
        }) {
            return Err("Checkpoint not available".into());
        }
        Ok(file)
    }
    pub fn start(&mut self, action: &str, data: &Value) -> Result<Value, String> {
        if self
            .job
            .as_ref()
            .is_some_and(|j| j.lock().unwrap().phase == "running")
        {
            return Err("A Model Creator task is already running".into());
        }
        if !["prepare", "train", "generate", "evaluate", "devices"].contains(&action) {
            return Err("Unknown Model Creator action".into());
        }
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let model = if action == "prepare" && data["id"].as_str().unwrap_or("").is_empty() {
            let name = data["name"].as_str().unwrap_or("").trim();
            if name.is_empty() || name.chars().count() > 80 {
                return Err("Model name must be 1–80 characters".into());
            }
            let model = id();
            let folder = self.root.join(&model);
            fs::create_dir(&folder).map_err(|e| e.to_string())?;
            fs::write(
                folder.join("model.json"),
                serde_json::to_vec(&json!({"name":name,"config":data["config"]})).unwrap(),
            )
            .map_err(|e| e.to_string())?;
            model
        } else if action == "devices" {
            String::new()
        } else {
            let model = data["id"].as_str().ok_or("Select a model")?;
            path(&self.root, model)?;
            model.to_owned()
        };
        let folder = if model.is_empty() {
            self.root.join("system")
        } else {
            self.root.join(&model)
        };
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        if action == "prepare" && folder.join("checkpoint.pt").exists() {
            return Err("Create a new model to change its training dataset".into());
        }
        if action == "train" && !folder.join("dataset.json").is_file() {
            return Err("Validate a dataset first".into());
        }
        if action == "train" && folder.join("checkpoint.pt").is_file() && data["resume"] != true {
            return Err("A checkpoint already exists. Resume it or create a new model.".into());
        }
        if action == "train" && data["resume"] == true && !folder.join("checkpoint.pt").is_file() {
            return Err("No checkpoint to resume.".into());
        }
        if ["generate", "evaluate"].contains(&action) && !folder.join("checkpoint.pt").is_file() {
            return Err("Train the model first".into());
        }
        if action == "train" && data["resume"] != true {
            let mut meta = read_json(&folder.join("model.json")).ok_or("Model metadata missing")?;
            meta["config"] = data["config"].clone();
            meta["settings"] = json!({"seed":data["seed"],"epochs":data["epochs"],"batch_size":data["batch_size"],"learning_rate":data["learning_rate"],"device":data["device"],"early_stopping":data["early_stopping"]});
            fs::write(
                folder.join("model.json"),
                serde_json::to_vec(&meta).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        }
        let worker = self.root.join("model_creator.py");
        fs::write(&worker, WORKER).map_err(|e| e.to_string())?;
        let request = folder.join("request.json");
        fs::write(
            &request,
            serde_json::to_vec(data).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let out = fs::File::create(folder.join("result.json")).map_err(|e| e.to_string())?;
        let err = fs::File::create(folder.join("error.log")).map_err(|e| e.to_string())?;
        let mut command = Command::new(python());
        command
            .env("PYTORCH_ENABLE_MPS_FALLBACK", "0")
            .arg(worker)
            .arg(action);
        if action != "devices" {
            command
                .arg("--request")
                .arg(request)
                .arg("--output")
                .arg(&folder);
        }
        let child=command.stdin(Stdio::null()).stdout(Stdio::from(out)).stderr(Stdio::from(err)).spawn().map_err(|e|format!("Cannot start Python: {e}. Install Python and PyTorch or set LLAMANEST_CREATOR_PYTHON."))?;
        let job = Arc::new(Mutex::new(Job {
            child: Some(child),
            phase: "running",
            action: action.into(),
            model: model.clone(),
            error: None,
            cancelled: false,
        }));
        self.job = Some(job.clone());
        thread::spawn(move || loop {
            let mut j = job.lock().unwrap();
            match j.child.as_mut().unwrap().try_wait() {
                Ok(Some(status)) => {
                    j.phase = if j.cancelled {
                        "cancelled"
                    } else if status.success() {
                        "complete"
                    } else {
                        "failed"
                    };
                    if j.phase == "failed" {
                        let log = fs::read_to_string(folder.join("error.log")).unwrap_or_default();
                        let last = log
                            .lines()
                            .rev()
                            .find(|line| !line.trim().is_empty())
                            .unwrap_or("Worker failed");
                        j.error = Some(if log.contains("No module named 'torch'") {
                            "PyTorch is not installed in the selected Python. Install torch or set LLAMANEST_CREATOR_PYTHON.".into()
                        } else {
                            last.chars().take(500).collect()
                        });
                    }
                    j.child = None;
                    break;
                }
                Err(e) => {
                    j.phase = "failed";
                    j.error = Some(e.to_string());
                    j.child = None;
                    break;
                }
                Ok(None) => {}
            }
            drop(j);
            thread::sleep(Duration::from_millis(200));
        });
        Ok(self.status())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_browser_paths() {
        assert!(valid_id("123-456"));
        for bad in ["../models", "/tmp/x", "", "123/../4", "x"] {
            assert!(!valid_id(bad));
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_model_directory_and_checkpoint() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!("creator-path-test-{}", id()));
        fs::create_dir_all(root.join("123-456")).unwrap();
        fs::write(root.join("outside"), b"not a checkpoint").unwrap();
        symlink(root.join("outside"), root.join("123-456/checkpoint.pt")).unwrap();
        assert!(Creator::new(root.clone()).export("123-456").is_err());
        symlink(root.join("123-456"), root.join("999-999")).unwrap();
        assert!(path(&root, "999-999").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn worker_creates_trains_reloads_and_evaluates_when_python_is_configured() {
        if std::env::var_os("LLAMANEST_CREATOR_PYTHON").is_none() {
            return;
        }
        let root = std::env::temp_dir().join(format!("llamanest-creator-test-{}", id()));
        let mut service = Creator::new(root.clone());
        let config =
            json!({"vocab_size":260,"dim":16,"layers":1,"heads":2,"context":64,"dropout":0.0});
        let data = json!({"name":"Test","config":config,"mode":"qa","extension":"json","raw":"[{\"question\":\"a\",\"answer\":\"x\"},{\"question\":\"b\",\"answer\":\"y\"},{\"question\":\"c\",\"answer\":\"z\"}]","seed":42});
        let initial = service.start("prepare", &data).unwrap();
        let model = initial["job"]["model"].as_str().unwrap().to_owned();
        fn wait(service: &Creator) -> Value {
            for _ in 0..300 {
                let status = service.status();
                if status["job"]["phase"] != "running" {
                    assert_eq!(status["job"]["phase"], "complete", "{status}");
                    return status;
                }
                thread::sleep(Duration::from_millis(100));
            }
            panic!("worker timed out");
        }
        assert_eq!(wait(&service)["job"]["result"]["count"], 3);
        let mut training = json!({"id":model,"name":"Test","config":config,"epochs":1,"batch_size":1,"learning_rate":0.001,"seed":42,"device":"cpu","early_stopping":false,"resume":false});
        service.start("train", &training).unwrap();
        wait(&service);
        assert!(service.export(&model).unwrap().is_file());
        assert!(service.start("train", &training).is_err());
        training["resume"] = json!(true);
        training["epochs"] = json!(2);
        service.start("train", &training).unwrap();
        assert_eq!(wait(&service)["job"]["progress"]["metrics"]["epoch"], 2);
        let mut reopened = Creator::new(root.clone());
        assert_eq!(reopened.status()["models"][0]["checkpoint"], true);
        assert_eq!(reopened.status()["models"][0]["settings"]["seed"], 42);
        reopened
            .start(
                "generate",
                &json!({"id":model,"device":"cpu","prompt":"a","max_tokens":3,"temperature":0}),
            )
            .unwrap();
        assert!(wait(&reopened)["job"]["result"]["text"].is_string());
        reopened
            .start("evaluate", &json!({"id":model,"device":"cpu"}))
            .unwrap();
        assert!(wait(&reopened)["job"]["result"]["perplexity"]
            .as_f64()
            .unwrap()
            .is_finite());
        fs::remove_dir_all(root).unwrap();
    }
}
