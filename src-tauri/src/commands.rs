// Every IPC channel the v1 Electron main process served, as Tauri commands.
// Names are snake_case; the frontend shim (src/ipc.js) maps the old kebab channels.
use crate::{load_prefs, save_prefs, platform};
use tauri_plugin_opener::OpenerExt;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, Webview, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

pub struct MiniState(pub std::sync::Mutex<Option<(u32, u32)>>);

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_SCRIPT: &str = include_str!("page.js");
const PANEL_DEFAULTS: [(&str, f64, f64); 4] = [
    ("board", 700.0, 560.0),
    ("video", 680.0, 520.0),
    ("web", 780.0, 640.0),
    ("write", 680.0, 700.0),
];

fn main_win(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_all_windows(app: &AppHandle) {
    let mut main = None;
    for (label, win) in app.webview_windows() {
        if label == "main" || label.starts_with("panel-") {
            // Showing always restores control — otherwise a detached
            // (click-through) window can never be clicked back to normal.
            let _ = win.set_ignore_cursor_events(false);
            let _ = app.emit_to(&label, "detach-cleared", ());
            let _ = win.show();
            if label == "main" {
                main = Some(win);
            }
        }
    }
    if let Some(w) = main {
        let _ = w.set_focus();
    }
}

pub fn toggle_all(app: &AppHandle) {
    // Panic-key semantics: if the capture overlay is up, dismiss it and bring
    // the pad back — the shortcut must never leave the user stuck.
    if let Some(overlay) = app.get_webview_window("screenshot") {
        let _ = overlay.close();
        show_all_windows(app);
        return;
    }
    let windows: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(l, _)| l == "main" || l.starts_with("panel-"))
        .map(|(_, w)| w)
        .collect();
    for w in &windows {
        let _ = w.set_ignore_cursor_events(false);
    }
    if windows.iter().any(|w| w.is_visible().unwrap_or(false)) {
        for w in windows {
            let _ = w.hide();
        }
    } else {
        show_all_windows(app);
    }
}

/// JS-side error relay so frontend failures show up in the terminal log.
#[tauri::command]
pub fn log_js(level: String, msg: String) {
    match level.as_str() {
        "warn" => log::warn!("[js] {msg}"),
        "info" => log::info!("[js] {msg}"),
        _ => log::error!("[js] {msg}"),
    }
}

// ── Board autosave (file-based: no localStorage quota, off the UI thread) ─────

fn autosave_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("board-autosave.json"))
}

#[tauri::command]
pub async fn autosave_board(app: AppHandle, json: String) -> Result<(), String> {
    let path = autosave_path(&app).ok_or("no app data dir")?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_autosave_board(app: AppHandle) -> Option<String> {
    let path = autosave_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || std::fs::read_to_string(path).ok())
        .await
        .ok()
        .flatten()
}

// ── Window controls ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn win_close(app: AppHandle) {
    if let Some(w) = main_win(&app) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub async fn win_opacity(webview: Webview, v: f64) {
    // Applies to the calling window — undocked panels get their own opacity
    // (v1 always hit the main window, even from a panel's slider).
    let win = webview.window();
    let _ = platform::set_opacity(&win, (v / 100.0).clamp(0.1, 1.0));
}

#[tauri::command]
pub fn win_resize(app: AppHandle, state: State<'_, MiniState>, w: u32, h: u32) {
    *state.0.lock().unwrap() = None;
    if let Some(win) = main_win(&app) {
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        let _ = win.center();
    }
}

#[tauri::command]
pub async fn win_detach(app: AppHandle, on: bool) {
    log::info!("win_detach: {on}");
    if let Some(w) = main_win(&app) {
        // shortcut: Tauri has no mouse-event forwarding ({forward:true} in v1); detached = fully click-through
        let _ = w.set_ignore_cursor_events(on);
    }
}

/// PureRef-style "interactable wallpaper": stay below every other window.
#[tauri::command]
pub async fn win_always_bottom(app: AppHandle, on: bool) {
    if let Some(w) = main_win(&app) {
        if on {
            let _ = w.set_always_on_top(false);
        }
        let _ = w.set_always_on_bottom(on);
        if !on {
            let _ = w.set_always_on_top(true);
        }
    }
}

/// Lock the window in place so it can't be dragged accidentally (PureRef ⌘W).
#[tauri::command]
pub async fn win_lock(app: AppHandle, on: bool) {
    if let Some(w) = main_win(&app) {
        let _ = platform::set_movable(&w.as_ref().window(), !on);
    }
}

/// Reveal a local file in Finder / Explorer / the Linux file manager.
#[tauri::command]
pub async fn reveal_path(app: AppHandle, path: String) {
    let _ = app.opener().reveal_item_in_dir(path);
}

/// Open an http(s) URL in the default browser (board "open source" for web images).
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) {
    let Ok(parsed) = tauri::Url::parse(&url) else { return };
    if !matches!(parsed.scheme(), "http" | "https") {
        return;
    }
    let _ = app.opener().open_url(url, None::<String>);
}

#[tauri::command]
pub fn win_mini_toggle(app: AppHandle, state: State<'_, MiniState>) {
    let Some(win) = main_win(&app) else { return };
    let on = {
        let mut mini = state.0.lock().unwrap();
        if mini.is_none() {
            let scale = win.scale_factor().unwrap_or(1.0);
            let size = win.inner_size().unwrap_or_default().to_logical::<u32>(scale);
            *mini = Some((size.width, size.height));
            let _ = win.set_size(tauri::LogicalSize::new(size.width, 34));
            true
        } else {
            if let Some((w, h)) = mini.take() {
                let _ = win.set_size(tauri::LogicalSize::new(w, h));
            }
            false
        }
    };
    let _ = app.emit_to("main", "mini-mode", on);
}

// ── Undocked panels ──────────────────────────────────────────────────────────

fn save_panel_size(app: &AppHandle, win: &tauri::WebviewWindow, id: &str) {
    let Ok(scale) = win.scale_factor() else { return };
    let Ok(size) = win.inner_size() else { return };
    let logical = size.to_logical::<u32>(scale);
    let mut patch = Map::new();
    patch.insert(format!("{id}_w"), json!(logical.width));
    patch.insert(format!("{id}_h"), json!(logical.height));
    save_prefs(app, patch);
}

#[tauri::command]
pub async fn panel_undock(app: AppHandle, id: String) {
    let label = format!("panel-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // App() resolves against the configured base URL deterministically.
    // (Deriving from main.url() raced the first navigation: before commit it
    // is about:blank → opaque origin → "null" → invalid panel URL.)
    let url = WebviewUrl::App(format!("index.html?panel={id}").into());
    log::info!("panel-undock: {label}");

    let prefs = load_prefs(&app);
    let (dw, dh) = PANEL_DEFAULTS
        .iter()
        .find(|(n, _, _)| *n == id)
        .map(|(_, w, h)| (*w, *h))
        .unwrap_or((700.0, 560.0));
    let w = prefs.get(&format!("{id}_w")).and_then(|v| v.as_f64()).unwrap_or(dw);
    let h = prefs.get(&format!("{id}_h")).and_then(|v| v.as_f64()).unwrap_or(dh);

    let mut builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(format!("FloatPad — {id}"))
        .inner_size(w, h)
        .min_inner_size(300.0, 220.0)
        .decorations(false)
        .always_on_top(true);
    if std::env::var("FP_SELFTEST").is_ok() {
        builder = builder.visible(false);
    }
    let win = match builder.build()
    {
        Ok(w) => w,
        Err(e) => {
            eprintln!("panel-undock error: {e}");
            return;
        }
    };
    platform::decorate(&win.as_ref().window());

    let h2 = app.clone();
    let id2 = id.clone();
    let win2 = win.clone();
    win.on_window_event(move |e| match e {
        WindowEvent::Resized(_) | WindowEvent::Moved(_) => save_panel_size(&h2, &win2, &id2),
        WindowEvent::Focused(_) => {
            let _ = win2.set_ignore_cursor_events(false);
        }
        WindowEvent::Destroyed => {
            save_panel_size(&h2, &win2, &id2);
            let _ = h2.emit_to("main", "panel-closed", id2.clone());
        }
        _ => {}
    });

    let _ = app.emit_to("main", "panel-undocked", id);
}

#[tauri::command]
pub async fn panel_dock_back(app: AppHandle, id: String) {
    if let Some(w) = app.get_webview_window(&format!("panel-{id}")) {
        let _ = w.close();
    }
    let _ = app.emit_to("main", "panel-docked", id);
    show_all_windows(&app);
}

// ── Screenshot region capture ────────────────────────────────────────────────

pub fn open_screenshot(app: &AppHandle) {
    log::info!("screenshot overlay: open");
    if let Some(w) = app.get_webview_window("screenshot") {
        let _ = w.close();
    }
    let (sw, sh) = main_win(app)
        .and_then(|w| w.current_monitor().ok().flatten())
        .map(|m| {
            let s = m.size().to_logical::<f64>(m.scale_factor());
            (s.width, s.height)
        })
        .unwrap_or((1440.0, 900.0));
    let mut builder = WebviewWindowBuilder::new(app, "screenshot", WebviewUrl::App("screenshot.html".into()))
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .position(0.0, 0.0)
        .inner_size(sw, sh);
    if std::env::var("FP_SELFTEST").is_ok() {
        builder = builder.visible(false);
    }
    match builder.build()
    {
        Ok(win) => platform::decorate_overlay(&win.as_ref().window()),
        Err(e) => eprintln!("screenshot window error: {e}"),
    }
}

#[tauri::command]
pub async fn screenshot_request(app: AppHandle) {
    open_screenshot(&app);
}

#[tauri::command]
pub async fn screenshot_cancel(app: AppHandle) {
    if let Some(w) = app.get_webview_window("screenshot") {
        let _ = w.close();
    }
}

#[tauri::command]
pub async fn screenshot_done(app: AppHandle, data_url: String) {
    log::info!("screenshot overlay: done ({} bytes)", data_url.len());
    if let Some(w) = app.get_webview_window("screenshot") {
        let _ = w.close();
    }
    let _ = app.emit_to("main", "screenshot-result", data_url);
    show_all_windows(&app);
}

// ── Screen capture (xcap) ────────────────────────────────────────────────────

fn rgba_to_data_url(w: u32, h: u32, raw: Vec<u8>) -> Option<String> {
    let img = image::RgbaImage::from_raw(w, h, raw)?;
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(buf.into_inner())
    ))
}

#[tauri::command]
pub async fn capture_screen(app: AppHandle) -> Option<String> {
    let pos = main_win(&app)
        .and_then(|w| w.outer_position().ok())
        .unwrap_or_default();
    let monitor = xcap::Monitor::from_point(pos.x, pos.y).ok()?;
    let img = monitor.capture_image().ok()?;
    rgba_to_data_url(img.width(), img.height(), img.into_raw())
}

#[derive(Deserialize)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
pub async fn capture_webview_rect(app: AppHandle, label: String, rect: Rect) -> Option<String> {
    let webview = app.get_webview(&label)?;
    let win = webview.window();
    let scale = win.scale_factor().ok()?;
    let wpos = win.outer_position().ok()?;
    let vpos = webview.position().ok()?;
    let x = wpos.x + vpos.x + (rect.x * scale) as i32;
    let y = wpos.y + vpos.y + (rect.y * scale) as i32;
    let w = ((rect.width * scale).round() as u32).max(1);
    let h = ((rect.height * scale).round() as u32).max(1);
    let monitor = xcap::Monitor::from_point(x, y).ok()?;
    let mx = monitor.x().ok()?;
    let my = monitor.y().ok()?;
    let mw = monitor.width().ok()?;
    let mh = monitor.height().ok()?;
    // clamp to the monitor so partially off-screen webviews still capture
    let cx = (x - mx).clamp(0, mw as i32 - 1) as u32;
    let cy = (y - my).clamp(0, mh as i32 - 1) as u32;
    let cw = w.min(mw - cx);
    let ch = h.min(mh - cy);
    let img = monitor.capture_region(cx, cy, cw, ch).ok()?;
    rgba_to_data_url(img.width(), img.height(), img.into_raw())
}

// ── Ad-block allowlist (persisted per host, v1 parity) ───────────────────────

fn host_of(raw: &str) -> String {
    tauri::Url::parse(raw)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
        .unwrap_or_default()
}

pub(crate) fn allowed_hosts(prefs: &Map<String, Value>) -> Vec<String> {
    prefs
        .get("adblockAllowedHosts")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn adblock_site_status(app: AppHandle, url: String) -> Value {
    let host = host_of(&url);
    let disabled = !host.is_empty() && allowed_hosts(&load_prefs(&app)).contains(&host);
    json!({ "host": host, "disabled": disabled })
}

#[tauri::command]
pub async fn adblock_toggle_site(app: AppHandle, url: String) -> Value {
    let host = host_of(&url);
    if host.is_empty() {
        return json!({ "host": "", "disabled": false });
    }
    let mut list = allowed_hosts(&load_prefs(&app));
    let disabled = if list.contains(&host) {
        list.retain(|h| h != &host);
        false
    } else {
        list.push(host.clone());
        true
    };
    list.sort();
    let mut patch = Map::new();
    patch.insert("adblockAllowedHosts".into(), json!(list.clone()));
    save_prefs(&app, patch);
    crate::adblock::refresh(&app, list);
    json!({ "host": host, "disabled": disabled })
}

// ── Embedded browser webviews (Web mode) ─────────────────────────────────────

#[tauri::command]
pub async fn web_create(
    app: AppHandle,
    window: String,
    label: String,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    let win = app.get_window(&window).ok_or("window not found")?;
    let parsed = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;

    let a1 = app.clone();
    let a2 = app.clone();
    let a3 = app.clone();
    let l3 = label.clone();
    let win_label = win.label().to_string();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
        .user_agent(UA)
        .initialization_script(PAGE_SCRIPT)
        .accept_first_mouse(true)
        .on_page_load(move |webview, payload| {
            let kind = match payload.event() {
                PageLoadEvent::Started => "load-start",
                PageLoadEvent::Finished => "load-stop",
            };
            let _ = a1.emit_to(
                webview.window().label(),
                "web-event",
                json!({ "label": webview.label(), "kind": kind, "url": payload.url().as_str() }),
            );
        })
        .on_document_title_changed(move |webview, title| {
            let _ = a2.emit_to(
                webview.window().label(),
                "web-event",
                json!({ "label": webview.label(), "kind": "title", "title": title }),
            );
        })
        .on_new_window(move |url, _features| {
            let _ = a3.emit_to(
                win_label.clone(),
                "web-event",
                json!({ "label": l3, "kind": "open", "url": url.as_str() }),
            );
            NewWindowResponse::Deny
        });

    // macOS: attach the compiled network-level content blocker before first load
    #[cfg(target_os = "macos")]
    let builder = match crate::adblock::make_configuration(&app) {
        Some(config) => builder.with_webview_configuration(config),
        None => builder,
    };

    win.add_child(
        builder,
        PhysicalPosition::new((x * scale) as i32, (y * scale) as i32),
        PhysicalSize::new(((w * scale).round() as u32).max(1), ((h * scale).round() as u32).max(1)),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn web_set_bounds(app: AppHandle, label: String, x: f64, y: f64, w: f64, h: f64) {
    let Some(webview) = app.get_webview(&label) else { return };
    let Ok(scale) = webview.window().scale_factor() else { return };
    let _ = webview.set_position(PhysicalPosition::new((x * scale) as i32, (y * scale) as i32));
    let _ = webview.set_size(PhysicalSize::new(
        ((w * scale).round() as u32).max(1),
        ((h * scale).round() as u32).max(1),
    ));
}

#[tauri::command]
pub async fn web_show(app: AppHandle, label: String) {
    if let Some(w) = app.get_webview(&label) {
        let _ = w.show();
    }
}

#[tauri::command]
pub async fn web_hide(app: AppHandle, label: String) {
    if let Some(w) = app.get_webview(&label) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub async fn web_destroy(app: AppHandle, label: String) {
    if let Some(w) = app.get_webview(&label) {
        let _ = w.close();
    }
}

#[tauri::command]
pub async fn web_eval(app: AppHandle, label: String, script: String) {
    if let Some(w) = app.get_webview(&label) {
        let _ = w.eval(script);
    }
}

// ── Floating shots: per-image mini windows (PureRef overlay / ScreenFloat) ───

pub struct ShotPayloads(pub std::sync::Mutex<std::collections::HashMap<String, String>>);
static SHOT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn shot_open(
    app: AppHandle,
    payloads: State<'_, ShotPayloads>,
    data_url: String,
    w: f64,
    h: f64,
) -> Result<String, String> {
    let n = SHOT_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let label = format!("shot-{n}");
    // fit the image into a 480×360 envelope, keep aspect, sane minimum
    let scale = (480.0 / w.max(1.0)).min(360.0 / h.max(1.0)).min(1.0);
    let ww = (w * scale).max(160.0);
    let hh = (h * scale).max(120.0);
    payloads.0.lock().unwrap().insert(label.clone(), data_url);

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html?shot=1".into()))
        .title("FloatPad Shot")
        .inner_size(ww, hh)
        .min_inner_size(120.0, 90.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true);
    if std::env::var("FP_SELFTEST").is_ok() {
        builder = builder.visible(false);
    }
    let win = builder.build().map_err(|e| e.to_string())?;
    platform::decorate(&win.as_ref().window());

    // Drop the payload if the window closes before (or without) fetching it,
    // so fast-closed or failed shots don't leak whole images into the map.
    let app2 = app.clone();
    let label2 = label.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            app2.state::<ShotPayloads>().0.lock().unwrap().remove(&label2);
        }
    });
    Ok(label)
}

/// One-shot payload handoff to the shot window (no localStorage race).
#[tauri::command]
pub fn shot_payload(webview: Webview, payloads: State<'_, ShotPayloads>) -> Option<String> {
    let label = webview.window().label().to_string();
    payloads.0.lock().unwrap().remove(&label)
}

/// OCR a board image (data URL) → recognized text. macOS Vision, off-main.
#[tauri::command]
pub async fn ocr_image(data_url: String) -> Result<Value, String> {
    let b64 = data_url
        .split_once("base64,")
        .map(|(_, b)| b)
        .unwrap_or(&data_url);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    let text = tauri::async_runtime::spawn_blocking(move || crate::ocr::recognize(&bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(json!({ "text": text }))
}

/// Decode a GIF into fully-composited PNG frames + delays (PureRef GIF playback).
/// Capped at 300 frames to keep memory sane on huge GIFs.
#[tauri::command]
pub async fn gif_frames(data_url: String) -> Result<Value, String> {
    let b64 = data_url
        .split_once("base64,")
        .map(|(_, b)| b)
        .unwrap_or(&data_url);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        use image::AnimationDecoder;
        let decoder = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(bytes))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for frame in decoder.into_frames().take(300) {
            let f = frame.map_err(|e| e.to_string())?;
            let (num, den) = f.delay().numer_denom_ms();
            let delay = if den == 0 { 100 } else { num / den }.max(20);
            let buf = f.into_buffer();
            let url = rgba_to_data_url(buf.width(), buf.height(), buf.into_raw())
                .ok_or("frame encode failed")?;
            out.push(json!({ "dataUrl": url, "delay": delay }));
        }
        Ok(Value::Array(out))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Callback channel: injected page script returns executeJavaScript results here.
#[tauri::command]
pub async fn web_eval_result(
    webview: Webview,
    id: u64,
    result: Option<String>,
    error: Option<String>,
) {
    let _ = webview.window().emit(
        "web-eval-result",
        json!({ "id": id, "result": result, "error": error }),
    );
}

/// Callback channel: injected page script reports SPA navs, context menus, popups.
#[tauri::command]
pub async fn web_page_event(webview: Webview, payload: Value) {
    let mut p = payload.as_object().cloned().unwrap_or_default();
    p.insert("label".into(), json!(webview.label()));
    let _ = webview.window().emit("web-event", Value::Object(p));
}