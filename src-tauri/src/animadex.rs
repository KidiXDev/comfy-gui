use reqwest::blocking::Client;
use serde_json::Value;
use std::time::Duration;

const BASE_URL: &str = "https://animadex.net";

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComfyGUI/1.0")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn animadex_request(url: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = client()?;
        let full_url = if url.starts_with("http://") || url.starts_with("https://") {
            url
        } else {
            format!("{BASE_URL}{}", if url.starts_with('/') { url } else { format!("/{url}") })
        };
        let response = client.get(&full_url).send().map_err(|e| e.to_string())?;
        let status = response.status();
        if status.is_success() {
            response.json().map_err(|e| e.to_string())
        } else {
            let text = response.text().unwrap_or_default();
            Err(format!("AnimaDex returned {status}: {text}"))
        }
    })
    .await
    .map_err(|error| error.to_string())?
}
