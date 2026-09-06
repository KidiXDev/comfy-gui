use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEnvelope {
    pub cached_at: u64,
    pub expires_at: u64,
    pub data: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkCacheStats {
    pub total_entries: u32,
    pub total_size_bytes: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn cache_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    let dir = base.join("network_cache");
    Ok(dir)
}

fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Reads cached JSON from disk if file exists and has not expired.
pub fn read_cache(app_handle: &AppHandle, namespace: &str, key: &str) -> Option<Value> {
    let root = cache_root(app_handle).ok()?;
    let path = root.join(namespace).join(format!("{}.json", hash_key(key)));

    if !path.exists() {
        return None;
    }

    let contents = fs::read_to_string(&path).ok()?;
    let envelope: CacheEnvelope = serde_json::from_str(&contents).ok()?;

    if now_ms() < envelope.expires_at {
        Some(envelope.data)
    } else {
        // Expired – remove stale cache file in background
        let _ = fs::remove_file(path);
        None
    }
}

/// Writes JSON data to disk cache wrapped with expiration metadata.
pub fn write_cache(
    app_handle: &AppHandle,
    namespace: &str,
    key: &str,
    data: &Value,
    ttl_seconds: u64,
) -> Result<(), String> {
    let root = cache_root(app_handle)?;
    let dir = root.join(namespace);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(format!("{}.json", hash_key(key)));
    let cached_at = now_ms();
    let expires_at = cached_at.saturating_add(ttl_seconds.saturating_mul(1000));

    let envelope = CacheEnvelope {
        cached_at,
        expires_at,
        data: data.clone(),
    };

    let serialized = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes cached network files for a given namespace or the entire network_cache.
#[tauri::command]
pub async fn clear_network_cache(
    app_handle: AppHandle,
    namespace: Option<String>,
) -> Result<(), String> {
    let root = cache_root(&app_handle)?;
    let target = match namespace {
        Some(ns) => root.join(ns),
        None => root,
    };

    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Computes file count and total size in bytes for the network cache.
#[tauri::command]
pub async fn get_network_cache_stats(app_handle: AppHandle) -> Result<NetworkCacheStats, String> {
    let root = cache_root(&app_handle)?;
    if !root.exists() {
        return Ok(NetworkCacheStats {
            total_entries: 0,
            total_size_bytes: 0,
        });
    }

    let mut total_entries = 0u32;
    let mut total_size_bytes = 0u64;

    fn visit_dir(
        dir: &std::path::Path,
        entries: &mut u32,
        size: &mut u64,
    ) -> Result<(), std::io::Error> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dir(&path, entries, size)?;
                } else if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    *entries += 1;
                    if let Ok(meta) = entry.metadata() {
                        *size += meta.len();
                    }
                }
            }
        }
        Ok(())
    }

    let _ = visit_dir(&root, &mut total_entries, &mut total_size_bytes);

    Ok(NetworkCacheStats {
        total_entries,
        total_size_bytes,
    })
}
