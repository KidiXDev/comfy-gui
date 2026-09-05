use reqwest::blocking::Client;
use serde_json::Value;
use std::time::Duration;

#[tauri::command]
pub async fn danbooru_wiki_request(
    title: Option<String>,
    post_ids: Option<Vec<u64>>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .user_agent("ComfyGUI/1.0 (Danbooru Tag Wiki)")
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())?;
        let request = if let Some(title) = title {
            if title.trim().is_empty() || title.len() > 500 {
                return Err("Invalid wiki title".into());
            }
            let mut url = reqwest::Url::parse("https://danbooru.donmai.us/wiki_pages/").unwrap();
            url.path_segments_mut()
                .unwrap()
                .pop_if_empty()
                .push(&format!("{title}.json"));
            client.get(url)
        } else {
            let ids = post_ids.unwrap_or_default();
            if ids.is_empty() || ids.len() > 100 || ids.contains(&0) {
                return Err("Expected 1–100 post IDs".into());
            }
            let ids = ids.iter().map(u64::to_string).collect::<Vec<_>>().join(",");
            client.get("https://danbooru.donmai.us/posts.json").query(&[
                ("tags", format!("id:{ids}")),
                ("limit", "100".into()),
                ("only", "id,preview_file_url".into()),
            ])
        };
        let response = request.send().map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Danbooru returned {}", response.status()));
        }
        response.json().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
