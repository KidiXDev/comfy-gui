use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{copy, Cursor};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const ARIA2_X64_URL: &str = "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip";
const ARIA2_X64_SHA256: &str = "67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288";
const ARIA2_X86_URL: &str = "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-32bit-build1.zip";
const ARIA2_X86_SHA256: &str = "35f6514cc5dd7e98a87b3c4c2d25a0754b9b063dbe59bc0f22d483464f61e5b6";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRecord {
    pub gid: String,
    pub version_id: u64,
    pub name: String,
    pub file_name: String,
    pub model_type: String,
    pub base_model: String,
    pub model_path: String,
    pub preview_url: Option<String>,
    pub status: String,
    pub completed_length: u64,
    pub total_length: u64,
    pub download_speed: u64,
    pub error_message: Option<String>,
    pub created_at: u64,
}

pub struct NewDownload {
    pub version_id: u64,
    pub name: String,
    pub file_name: String,
    pub model_type: String,
    pub base_model: String,
    pub model_path: PathBuf,
    pub preview_url: Option<String>,
    pub url: String,
    pub api_key: String,
}

struct Aria2Connection {
    child: Child,
    port: u16,
    secret: String,
}

#[derive(Default)]
struct Inner {
    connection: Option<Aria2Connection>,
    records: Vec<DownloadRecord>,
    loaded: bool,
}

#[derive(Clone, Default)]
pub struct DownloadManager {
    inner: Arc<Mutex<Inner>>,
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("aria2"))
}

fn load_history(inner: &mut Inner, app: &AppHandle) -> Result<(), String> {
    if inner.loaded {
        return Ok(());
    }
    let path = config_dir(app)?.join("downloads.json");
    inner.records = fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    inner.loaded = true;
    Ok(())
}

fn save_history(inner: &Inner, app: &AppHandle) -> Result<(), String> {
    let directory = config_dir(app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec_pretty(&inner.records).map_err(|error| error.to_string())?;
    fs::write(directory.join("downloads.json"), bytes).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

fn system_aria2() -> Option<PathBuf> {
    let mut command = Command::new("aria2c");
    command
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_window(&mut command);
    command
        .status()
        .ok()?
        .success()
        .then(|| PathBuf::from("aria2c"))
}

#[cfg(windows)]
fn install_aria2(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = config_dir(app)?;
    let binary = directory.join("aria2c.exe");
    if binary.is_file() {
        return Ok(binary);
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let (url, expected_hash, binary_path) = if cfg!(target_arch = "x86_64") {
        (
            ARIA2_X64_URL,
            ARIA2_X64_SHA256,
            "aria2-1.37.0-win-64bit-build1/aria2c.exe",
        )
    } else if cfg!(target_arch = "x86") {
        (
            ARIA2_X86_URL,
            ARIA2_X86_SHA256,
            "aria2-1.37.0-win-32bit-build1/aria2c.exe",
        )
    } else {
        return Err("Automatic aria2 installation is only available for Windows x64/x86.".into());
    };
    let response = Client::builder()
        .user_agent("ComfyGUI/1.0")
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .get(url)
        .send()
        .map_err(|error| format!("Failed to download aria2: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Failed to download aria2: {error}"))?;
    let bytes = response.bytes().map_err(|error| error.to_string())?;
    let actual_hash = format!("{:x}", Sha256::digest(&bytes));
    if actual_hash != expected_hash {
        return Err("Downloaded aria2 archive failed SHA-256 verification.".into());
    }

    let temporary_binary = directory.join("aria2c.exe.tmp");
    let extraction = (|| {
        let mut archive =
            zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
        let mut source = archive
            .by_name(binary_path)
            .map_err(|error| format!("aria2c.exe was not found in the archive: {error}"))?;
        let mut target = fs::File::create(&temporary_binary).map_err(|error| error.to_string())?;
        copy(&mut source, &mut target).map_err(|error| error.to_string())?;
        target.sync_all().map_err(|error| error.to_string())?;
        drop(target);
        fs::rename(&temporary_binary, &binary).map_err(|error| error.to_string())
    })();
    if extraction.is_err() {
        let _ = fs::remove_file(&temporary_binary);
    }
    let _ = fs::remove_file(directory.join("aria2.zip"));
    extraction?;
    Ok(binary)
}

#[cfg(not(windows))]
fn install_aria2(_app: &AppHandle) -> Result<PathBuf, String> {
    system_aria2().ok_or_else(|| "Install aria2c and make it available on PATH.".into())
}

fn rpc_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())
}

fn rpc_with(port: u16, secret: &str, method: &str, params: Vec<Value>) -> Result<Value, String> {
    let mut authorized_params = vec![json!(format!("token:{secret}"))];
    authorized_params.extend(params);
    let response: Value = rpc_client()?
        .post(format!("http://127.0.0.1:{port}/jsonrpc"))
        .json(&json!({
            "jsonrpc": "2.0",
            "id": "comfygui",
            "method": method,
            "params": authorized_params
        }))
        .send()
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;
    if let Some(error) = response.get("error") {
        Err(error["message"]
            .as_str()
            .unwrap_or("aria2 RPC request failed")
            .to_string())
    } else {
        Ok(response["result"].clone())
    }
}

fn rpc(connection: &Aria2Connection, method: &str, params: Vec<Value>) -> Result<Value, String> {
    rpc_with(connection.port, &connection.secret, method, params)
}

fn start_aria2(app: &AppHandle) -> Result<Aria2Connection, String> {
    let binary = match system_aria2() {
        Some(binary) => binary,
        None => install_aria2(app)?,
    };
    let directory = config_dir(app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let session = directory.join("aria2.session");
    if !session.exists() {
        fs::write(&session, []).map_err(|error| error.to_string())?;
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    drop(listener);
    let secret = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let mut command = Command::new(binary);
    command
        .arg("--enable-rpc=true")
        .arg("--rpc-listen-all=false")
        .arg(format!("--rpc-listen-port={port}"))
        .arg(format!("--rpc-secret={secret}"))
        .arg(format!("--input-file={}", session.display()))
        .arg(format!("--save-session={}", session.display()))
        .arg("--save-session-interval=1")
        .arg("--continue=true")
        .arg("--max-concurrent-downloads=3")
        .arg("--max-connection-per-server=8")
        .arg("--split=8")
        .arg("--min-split-size=1M")
        .arg("--file-allocation=none")
        .arg("--auto-file-renaming=false")
        .arg("--allow-overwrite=false")
        .arg("--summary-interval=0")
        .arg("--console-log-level=warn")
        .arg(format!("--stop-with-process={}", std::process::id()))
        .current_dir(&directory)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_window(&mut command);
    let child = command.spawn().map_err(|error| error.to_string())?;
    let connection = Aria2Connection {
        child,
        port,
        secret,
    };
    for _ in 0..50 {
        if rpc(&connection, "aria2.getVersion", vec![]).is_ok() {
            return Ok(connection);
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("aria2 RPC did not start in time.".into())
}

fn ensure_connection<'a>(
    inner: &'a mut Inner,
    app: &AppHandle,
) -> Result<&'a Aria2Connection, String> {
    let stopped = inner
        .connection
        .as_mut()
        .and_then(|connection| connection.child.try_wait().ok().flatten())
        .is_some();
    if stopped {
        inner.connection = None;
    }
    if inner.connection.is_none() {
        inner.connection = Some(start_aria2(app)?);
    }
    Ok(inner.connection.as_ref().unwrap())
}

fn parse_number(value: &Value, key: &str) -> u64 {
    value[key]
        .as_str()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

fn cleanup_files(model_path: &Path) {
    let _ = fs::remove_file(model_path);
    let _ = fs::remove_file(format!("{}.aria2", model_path.display()));
    let Some(parent) = model_path.parent() else {
        return;
    };
    let Some(stem) = model_path.file_stem().and_then(|value| value.to_str()) else {
        return;
    };
    for suffix in [
        "civitai.info",
        "cm-info.json",
        "preview.jpg",
        "preview.jpeg",
        "preview.png",
        "preview.webp",
    ] {
        let _ = fs::remove_file(parent.join(format!("{stem}.{suffix}")));
    }
}

impl DownloadManager {
    pub fn add(&self, app: &AppHandle, download: NewDownload) -> Result<DownloadRecord, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        load_history(&mut inner, app)?;
        if let Some(existing) = inner.records.iter().find(|record| {
            record.version_id == download.version_id
                && !matches!(record.status.as_str(), "error" | "removed")
        }) {
            return Ok(existing.clone());
        }
        let connection = ensure_connection(&mut inner, app)?;
        let mut options = json!({
            "dir": download.model_path.parent().unwrap_or(Path::new(".")).to_string_lossy(),
            "out": download.file_name,
            "continue": "true",
            "auto-file-renaming": "false",
            "allow-overwrite": "false"
        });
        if !download.api_key.trim().is_empty() {
            options["header"] =
                json!([format!("Authorization: Bearer {}", download.api_key.trim())]);
        }
        let gid = rpc(
            connection,
            "aria2.addUri",
            vec![json!([download.url]), options],
        )?
        .as_str()
        .ok_or("aria2 did not return a download ID.")?
        .to_string();
        let record = DownloadRecord {
            gid,
            version_id: download.version_id,
            name: download.name,
            file_name: download.file_name,
            model_type: download.model_type,
            base_model: download.base_model,
            model_path: download.model_path.to_string_lossy().to_string(),
            preview_url: download.preview_url,
            status: "waiting".into(),
            completed_length: 0,
            total_length: 0,
            download_speed: 0,
            error_message: None,
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };
        inner.records.insert(0, record.clone());
        save_history(&inner, app)?;
        Ok(record)
    }

    fn refresh(&self, app: &AppHandle) -> Result<Vec<DownloadRecord>, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        load_history(&mut inner, app)?;
        let pending = inner
            .records
            .iter()
            .any(|record| !matches!(record.status.as_str(), "complete" | "error" | "removed"));
        if pending {
            ensure_connection(&mut inner, app)?;
            let connection = inner.connection.as_ref().unwrap();
            let port = connection.port;
            let secret = connection.secret.clone();
            for record in &mut inner.records {
                if matches!(record.status.as_str(), "complete" | "error" | "removed") {
                    continue;
                }
                match rpc_with(
                    port,
                    &secret,
                    "aria2.tellStatus",
                    vec![
                        json!(record.gid),
                        json!([
                            "status",
                            "totalLength",
                            "completedLength",
                            "downloadSpeed",
                            "errorMessage"
                        ]),
                    ],
                ) {
                    Ok(status) => {
                        record.status = status["status"].as_str().unwrap_or("error").into();
                        record.total_length = parse_number(&status, "totalLength");
                        record.completed_length = parse_number(&status, "completedLength");
                        record.download_speed = parse_number(&status, "downloadSpeed");
                        record.error_message = status["errorMessage"].as_str().map(str::to_string);
                    }
                    Err(error) => {
                        let control = PathBuf::from(format!("{}.aria2", record.model_path));
                        if Path::new(&record.model_path).is_file() && !control.exists() {
                            record.status = "complete".into();
                            record.completed_length = record.total_length;
                        } else {
                            record.status = "error".into();
                            record.error_message = Some(error);
                        }
                    }
                }
            }
            save_history(&inner, app)?;
        }
        Ok(inner.records.clone())
    }

    fn change_status(&self, app: &AppHandle, gid: &str, method: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        load_history(&mut inner, app)?;
        let connection = ensure_connection(&mut inner, app)?;
        rpc(connection, method, vec![json!(gid)])?;
        Ok(())
    }

    fn cancel(&self, app: &AppHandle, gid: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        load_history(&mut inner, app)?;
        let index = inner
            .records
            .iter()
            .position(|record| record.gid == gid)
            .ok_or("Download was not found.")?;
        let record = inner.records[index].clone();
        if record.status == "complete" {
            return Err("Completed models cannot be cancelled.".into());
        }
        if matches!(record.status.as_str(), "active" | "waiting" | "paused") {
            let connection = ensure_connection(&mut inner, app)?;
            rpc(connection, "aria2.forceRemove", vec![json!(gid)])?;
            let _ = rpc(connection, "aria2.removeDownloadResult", vec![json!(gid)]);
        }
        cleanup_files(Path::new(&record.model_path));
        inner.records.remove(index);
        save_history(&inner, app)
    }
}

#[tauri::command]
pub async fn list(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
) -> Result<Vec<DownloadRecord>, String> {
    let manager = (*manager).clone();
    tauri::async_runtime::spawn_blocking(move || manager.refresh(&app_handle))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pause(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    gid: String,
) -> Result<(), String> {
    let manager = (*manager).clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.change_status(&app_handle, &gid, "aria2.forcePause")
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn resume(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    gid: String,
) -> Result<(), String> {
    let manager = (*manager).clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.change_status(&app_handle, &gid, "aria2.unpause")
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cancel(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    gid: String,
) -> Result<(), String> {
    let manager = (*manager).clone();
    tauri::async_runtime::spawn_blocking(move || manager.cancel(&app_handle, &gid))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::cleanup_files;
    use std::fs;

    #[test]
    fn cleanup_removes_partial_download_and_sidecars() {
        let directory =
            std::env::temp_dir().join(format!("comfygui-download-cleanup-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let model = directory.join("model.safetensors");
        for path in [
            model.clone(),
            directory.join("model.safetensors.aria2"),
            directory.join("model.civitai.info"),
            directory.join("model.cm-info.json"),
            directory.join("model.preview.jpg"),
        ] {
            fs::write(path, []).unwrap();
        }

        cleanup_files(&model);

        assert!(fs::read_dir(&directory).unwrap().next().is_none());
        fs::remove_dir(directory).unwrap();
    }
}
