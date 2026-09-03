use reqwest::blocking::{Client, Response};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, State};

use crate::download_manager::{DownloadManager, DownloadRecord, NewDownload};

const API_BASE: &str = "https://civitai.com/api/v1";

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("ComfyGUI/1.0")
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(60 * 60 * 6))
        .build()
        .map_err(|error| error.to_string())
}

fn authorized(
    request: reqwest::blocking::RequestBuilder,
    api_key: &str,
) -> reqwest::blocking::RequestBuilder {
    if api_key.trim().is_empty() {
        request
    } else {
        request.bearer_auth(api_key.trim())
    }
}

fn response_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    if status.is_success() {
        response.json().map_err(|error| error.to_string())
    } else {
        let message = response.text().unwrap_or_default();
        Err(if message.is_empty() {
            format!("Civitai returned {status}")
        } else {
            format!("Civitai returned {status}: {message}")
        })
    }
}

fn models_blocking(
    query: String,
    model_type: String,
    base_model: String,
    sort: String,
    period: String,
    cursor: Option<String>,
    api_key: String,
) -> Result<Value, String> {
    let client = client()?;
    let mut url =
        reqwest::Url::parse(&format!("{API_BASE}/models")).map_err(|error| error.to_string())?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("limit", "24");
        params.append_pair("nsfw", "false");
        params.append_pair("primaryFileOnly", "true");
        params.append_pair("sort", &sort);
        params.append_pair("period", &period);
        if !query.trim().is_empty() {
            params.append_pair("query", query.trim());
        }
        for model_type in model_type
            .split(',')
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            params.append_pair("types", model_type);
        }
        if !base_model.trim().is_empty() {
            params.append_pair("baseModels", base_model.trim());
        }
        if let Some(cursor) = cursor.filter(|value| !value.is_empty()) {
            params.append_pair("cursor", &cursor);
        }
    }
    response_json(
        authorized(client.get(url), &api_key)
            .send()
            .map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
pub async fn models(
    query: String,
    model_type: String,
    base_model: String,
    sort: String,
    period: String,
    cursor: Option<String>,
    api_key: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        models_blocking(query, model_type, base_model, sort, period, cursor, api_key)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn enums() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let response = client()?
            .get(format!("{API_BASE}/enums"))
            .send()
            .map_err(|error| error.to_string())?;
        response_json(response)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn comfy_dir(working_dir: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(working_dir.trim().trim_matches(['"', '\'']));
    if path.join("main.py").is_file() {
        Ok(path)
    } else if path.join("ComfyUI").join("main.py").is_file() {
        Ok(path.join("ComfyUI"))
    } else {
        Err("Select a valid ComfyUI directory in Settings first.".into())
    }
}

fn is_diffusion_model(base_model: &str, file_type: &str) -> bool {
    let base = base_model.to_ascii_lowercase();
    let file = file_type.to_ascii_lowercase();
    file.contains("diffusion")
        || file.contains("unet")
        || [
            "anima",
            "auraflow",
            "chroma",
            "cogvideox",
            "flux",
            "hidream",
            "hunyuan",
            "ltxv",
            "lumina",
            "mochi",
            "pixart",
            "qwen",
            "svd",
            "wan",
            "zimage",
        ]
        .iter()
        .any(|prefix| base.starts_with(prefix))
}

fn model_folder(
    model_type: &str,
    base_model: &str,
    file_type: &str,
) -> Result<&'static str, String> {
    match model_type.to_ascii_lowercase().as_str() {
        "checkpoint" if is_diffusion_model(base_model, file_type) => Ok("diffusion_models"),
        "checkpoint" => Ok("checkpoints"),
        "unet" => Ok("diffusion_models"),
        "textencoder" | "clip" => Ok("text_encoders"),
        "clipvision" => Ok("clip_vision"),
        "lora" | "locon" | "dora" => Ok("loras"),
        "vae" => Ok("vae"),
        "textualinversion" => Ok("embeddings"),
        "controlnet" => Ok("controlnet"),
        "upscaler" => Ok("upscale_models"),
        "hypernetwork" => Ok("hypernetworks"),
        other => Err(format!("Unsupported Civitai model type: {other}")),
    }
}

fn safe_filename(name: &str) -> String {
    let name = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("model.safetensors");
    let cleaned: String = name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.');
    if cleaned.is_empty() {
        "model.safetensors".into()
    } else {
        cleaned.into()
    }
}

fn preview_extension(url: &reqwest::Url) -> &'static str {
    match Path::new(url.path())
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "png",
        "webp" => "webp",
        _ => "jpg",
    }
}

fn is_civitai_host(url: &reqwest::Url) -> bool {
    url.domain()
        .is_some_and(|host| host == "civitai.com" || host.ends_with(".civitai.com"))
}

fn download_blocking(
    app_handle: AppHandle,
    manager: DownloadManager,
    version_id: u64,
    working_dir: String,
    api_key: String,
) -> Result<DownloadRecord, String> {
    let client = client()?;
    let metadata_url = format!("{API_BASE}/model-versions/{version_id}");
    let metadata = response_json(
        authorized(client.get(metadata_url), &api_key)
            .send()
            .map_err(|error| error.to_string())?,
    )?;
    let primary_file = metadata["files"]
        .as_array()
        .and_then(|files| {
            files
                .iter()
                .find(|file| file["primary"].as_bool() == Some(true))
                .or_else(|| files.first())
        })
        .ok_or("This model version has no downloadable files.")?;
    if primary_file["virusScanResult"].as_str() == Some("Danger")
        || primary_file["pickleScanResult"].as_str() == Some("Danger")
    {
        return Err("Civitai marked this file as unsafe; download blocked.".into());
    }
    let model_type = metadata["model"]["type"]
        .as_str()
        .ok_or("Civitai did not return the model type.")?;
    let model_name = metadata["model"]["name"]
        .as_str()
        .unwrap_or("Civitai model");
    let version_name = metadata["name"].as_str().unwrap_or_default();
    let base_model = metadata["baseModel"].as_str().unwrap_or("Unknown");
    let file_type = primary_file["type"].as_str().unwrap_or("Model");
    let filename = safe_filename(primary_file["name"].as_str().unwrap_or("model.safetensors"));
    let download_url = primary_file["downloadUrl"]
        .as_str()
        .or_else(|| metadata["downloadUrl"].as_str())
        .ok_or("Civitai did not return a download URL.")?;
    let download_url = reqwest::Url::parse(download_url).map_err(|error| error.to_string())?;
    if download_url.domain() != Some("civitai.com") {
        return Err("Civitai returned an unexpected download host.".into());
    }

    let directory = comfy_dir(&working_dir)?
        .join("models")
        .join(model_folder(model_type, base_model, file_type)?);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let model_path = directory.join(&filename);
    if model_path.exists() {
        return Err(format!("Model already exists: {}", model_path.display()));
    }

    let preview = metadata["images"]
        .as_array()
        .and_then(|images| images.first())
        .and_then(|image| image["url"].as_str())
        .and_then(|url| reqwest::Url::parse(url).ok())
        .filter(|url| url.scheme() == "https" && is_civitai_host(url))
        .map(|url| {
            let extension = preview_extension(&url);
            let response = client.get(url).send().map_err(|error| error.to_string())?;
            if !response.status().is_success() {
                return Err(format!(
                    "Preview download failed with {}",
                    response.status()
                ));
            }
            Ok((
                extension,
                response.bytes().map_err(|error| error.to_string())?,
            ))
        })
        .transpose()?;

    let stem = model_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("model");
    let metadata_path = directory.join(format!("{stem}.civitai.info"));
    let metadata_bytes = serde_json::to_vec_pretty(&metadata).map_err(|error| error.to_string())?;
    fs::write(&metadata_path, &metadata_bytes).map_err(|error| error.to_string())?;
    fs::write(
        directory.join(format!("{stem}.cm-info.json")),
        metadata_bytes,
    )
    .map_err(|error| error.to_string())?;

    preview
        .map(|(extension, bytes)| {
            let path = directory.join(format!("{stem}.preview.{extension}"));
            fs::write(&path, bytes).map_err(|error| error.to_string())?;
            Ok::<String, String>(path.to_string_lossy().to_string())
        })
        .transpose()?;

    manager.add(
        &app_handle,
        NewDownload {
            version_id,
            name: if version_name.is_empty() {
                model_name.to_string()
            } else {
                format!("{model_name} — {version_name}")
            },
            file_name: filename,
            model_type: model_type.to_string(),
            base_model: base_model.to_string(),
            model_path,
            preview_url: metadata["images"]
                .as_array()
                .and_then(|images| images.first())
                .and_then(|image| image["url"].as_str())
                .map(str::to_string),
            url: download_url.to_string(),
            api_key,
        },
    )
}

#[tauri::command]
pub async fn download(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    version_id: u64,
    working_dir: String,
    api_key: String,
) -> Result<DownloadRecord, String> {
    let manager = (*manager).clone();
    tauri::async_runtime::spawn_blocking(move || {
        download_blocking(app_handle, manager, version_id, working_dir, api_key)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{is_civitai_host, model_folder, safe_filename};

    #[test]
    fn maps_supported_types_and_sanitizes_filenames() {
        assert_eq!(model_folder("LORA", "Flux.1 D", "Model"), Ok("loras"));
        assert_eq!(model_folder("VAE", "SDXL 1.0", "Model"), Ok("vae"));
        assert_eq!(
            model_folder("TextualInversion", "SDXL 1.0", "Model"),
            Ok("embeddings")
        );
        assert_eq!(
            model_folder("UNet", "Unknown", "Model"),
            Ok("diffusion_models")
        );
        assert_eq!(
            model_folder("Checkpoint", "SDXL 1.0", "Model"),
            Ok("checkpoints")
        );
        assert_eq!(
            model_folder("Checkpoint", "Flux.1 D", "Model"),
            Ok("diffusion_models")
        );
        assert_eq!(
            model_folder("Checkpoint", "Anima", "Model"),
            Ok("diffusion_models")
        );
        assert_eq!(
            safe_filename("../bad:model?.safetensors"),
            "bad_model_.safetensors"
        );
        assert!(is_civitai_host(
            &reqwest::Url::parse("https://image.civitai.com/example.jpg").unwrap()
        ));
        assert!(!is_civitai_host(
            &reqwest::Url::parse("https://example.com/image.jpg").unwrap()
        ));
    }
}
