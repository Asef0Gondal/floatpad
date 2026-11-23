// Persistent Shot Library: shots (floated images) are saved to disk with a name,
// tags and a thumbnail, so they survive restart and can be searched/reopened.
// Storage: <app-data>/shots/<id>.<ext> + <id>_thumb.png + index.json.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct ShotMeta {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub created: u64,
    pub ext: String,
}

static SHOTS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn shots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("shots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn load_index(app: &AppHandle) -> Vec<ShotMeta> {
    let Ok(dir) = shots_dir(app) else { return Vec::new() };
    std::fs::read_to_string(dir.join("index.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_index(app: &AppHandle, index: &[ShotMeta]) -> Result<(), String> {
    let dir = shots_dir(app)?;
    let tmp = dir.join("index.json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(index).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("index.json")).map_err(|e| e.to_string())?;
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ext_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        _ => "png",
    }
}

fn b64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Decode a data URL (or raw base64) into bytes + extension.
fn decode_image(data_url: &str) -> Result<(Vec<u8>, &'static str), String> {
    use base64::Engine;
    let (mime, b64) = match data_url.split_once("base64,") {
        Some((header, b)) => {
            let mime = header.trim_start_matches("data:").trim_end_matches(';');
            (mime.to_string(), b)
        }
        None => ("image/png".to_string(), data_url),
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    Ok((bytes, ext_from_mime(&mime)))
}

/// Save a shot image + thumbnail + metadata. Returns the metadata.
pub fn save(app: &AppHandle, data_url: &str, name: &str, tags: Vec<String>) -> Result<ShotMeta, String> {
    let (bytes, ext) = decode_image(data_url)?;
    let dir = shots_dir(app)?;
    let id = format!("{}-{}", now_ms(), std::process::id());
    let img_path = dir.join(format!("{id}.{ext}"));
    std::fs::write(&img_path, &bytes).map_err(|e| e.to_string())?;

    // Thumbnail (best-effort; SVG/unsupported formats fall back to the original).
    let thumb_path = dir.join(format!("{id}_thumb.png"));
    // Raster formats get a PNG thumbnail; SVG/unsupported leave no thumb
    // (the library shows a placeholder) rather than a wrong-format copy.
    let _ = image::open(&img_path).map(|img| img.thumbnail(160, 160).save(&thumb_path));

    let meta = ShotMeta {
        id,
        name: if name.trim().is_empty() { "Untitled shot".into() } else { name.trim().into() },
        tags,
        created: now_ms(),
        ext: ext.into(),
    };
    let _guard = SHOTS_LOCK.lock().unwrap();
    let mut index = load_index(app);
    index.insert(0, meta.clone());
    save_index(app, &index)?;
    Ok(meta)
}

#[tauri::command]
pub async fn shot_save(app: AppHandle, data_url: String, name: String, tags: Vec<String>) -> Result<Value, String> {
    let meta = tauri::async_runtime::spawn_blocking(move || save(&app, &data_url, &name, tags))
        .await
        .map_err(|e| e.to_string())??;
    Ok(serde_json::to_value(meta).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn shots_list(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = shots_dir(&app)?;
        let index = load_index(&app);
        let items: Vec<Value> = index
            .iter()
            .map(|m| {
                let thumb = std::fs::read(dir.join(format!("{}_thumb.png", m.id)))
                    .map(|b| format!("data:image/png;base64,{}", b64_encode(&b)))
                    .unwrap_or_default();
                json!({ "id": m.id, "name": m.name, "tags": m.tags, "created": m.created, "ext": m.ext, "thumb": thumb })
            })
            .collect();
        Ok(Value::Array(items))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn shot_load(app: AppHandle, id: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = shots_dir(&app).ok()?;
        let index = load_index(&app);
        let meta = index.iter().find(|m| m.id == id)?;
        let bytes = std::fs::read(dir.join(format!("{}.{}", meta.id, meta.ext))).ok()?;
        let mime = match meta.ext.as_str() {
            "jpg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "bmp" => "image/bmp",
            "tiff" => "image/tiff",
            _ => "image/png",
        };
        Some(format!("data:{mime};base64,{}", b64_encode(&bytes)))
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn shot_delete(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = shots_dir(&app)?;
        let _guard = SHOTS_LOCK.lock().unwrap();
        let mut index = load_index(&app);
        if let Some(pos) = index.iter().position(|m| m.id == id) {
            let meta = index.remove(pos);
            let _ = std::fs::remove_file(dir.join(format!("{}.{}", meta.id, meta.ext)));
            let _ = std::fs::remove_file(dir.join(format!("{}_thumb.png", meta.id)));
            save_index(&app, &index)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn shot_update(app: AppHandle, id: String, name: String, tags: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SHOTS_LOCK.lock().unwrap();
        let mut index = load_index(&app);
        if let Some(meta) = index.iter_mut().find(|m| m.id == id) {
            meta.name = if name.trim().is_empty() { meta.name.clone() } else { name.trim().into() };
            meta.tags = tags;
            save_index(&app, &index)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Delete every shot (Settings → clear shot library).
#[tauri::command]
pub async fn shots_clear(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = shots_dir(&app)?;
        let _guard = SHOTS_LOCK.lock().unwrap();
        let index = load_index(&app);
        for m in &index {
            let _ = std::fs::remove_file(dir.join(format!("{}.{}", m.id, m.ext)));
            let _ = std::fs::remove_file(dir.join(format!("{}_thumb.png", m.id)));
        }
        save_index(&app, &[])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
