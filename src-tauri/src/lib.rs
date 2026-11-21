mod adblock;
mod commands;
mod ocr;
mod platform;
mod selftest;

use commands::MiniState;
use serde_json::{Map, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

// ── Persisted prefs (same prefs.json shape as v1) ────────────────────────────
// Lock + atomic write: move/resize events, panels and adblock toggles all
// read-modify-write concurrently; without this, updates get lost or torn.
static PREFS_LOCK: Mutex<()> = Mutex::new(());

pub fn prefs_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("no config dir")
        .join("prefs.json")
}

pub fn load_prefs(app: &tauri::AppHandle) -> Map<String, Value> {
    let _guard = PREFS_LOCK.lock().unwrap();
    fs::read_to_string(prefs_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

pub fn save_prefs(app: &tauri::AppHandle, patch: Map<String, Value>) {
    let _guard = PREFS_LOCK.lock().unwrap();
    let mut prefs = fs::read_to_string(prefs_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    for (k, v) in patch {
        prefs.insert(k, v);
    }
    let p = prefs_path(app);
    if let Some(dir) = p.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let tmp = p.with_extension("json.tmp");
    if fs::write(&tmp, serde_json::to_string_pretty(&Value::Object(prefs)).unwrap_or_default()).is_ok() {
        let _ = fs::rename(&tmp, &p);
    }
}

fn save_main_bounds(app: &tauri::AppHandle, win: &tauri::WebviewWindow, mini: &MiniState) {
    if mini.0.lock().unwrap().is_some() {
        return; // don't persist the 36px mini strip
    }
    let Ok(scale) = win.scale_factor() else { return };
    let Ok(size) = win.inner_size() else { return };
    let Ok(pos) = win.outer_position() else { return };
    let logical = size.to_logical::<u32>(scale);
    let lpos = pos.to_logical::<i32>(scale);
    let mut patch = Map::new();
    patch.insert("width".into(), serde_json::json!(logical.width));
    patch.insert("height".into(), serde_json::json!(logical.height));
    patch.insert("x".into(), serde_json::json!(lpos.x));
    patch.insert("y".into(), serde_json::json!(lpos.y));
    save_prefs(app, patch);
}

// ── App ──────────────────────────────────────────────────────────────────────

pub fn run() {
    // Visible runtime logs (IPC denials, shortcut fires, window ops) in dev.
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).try_init();

    let toggle: Shortcut = "CommandOrControl+Shift+Space".parse().unwrap();
    let shot: Shortcut = "CommandOrControl+Shift+S".parse().unwrap();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("second instance launched — focusing existing windows");
            commands::show_all_windows(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(toggle)
                .expect("invalid toggle shortcut")
                .with_shortcut(shot)
                .expect("invalid screenshot shortcut")
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.id() == toggle.id() {
                        log::info!("shortcut: toggle windows");
                        commands::toggle_all(app);
                    } else if shortcut.id() == shot.id() {
                        log::info!("shortcut: screenshot");
                        commands::open_screenshot(app);
                    }
                })
                .build(),
        )
        .manage(MiniState(Mutex::new(None)))
        .manage(commands::ShotPayloads(Mutex::new(std::collections::HashMap::new())))
        .setup(|app| {
            // Menu-bar app: no Dock icon (v1: app.dock.hide())
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let prefs = load_prefs(&handle);
            adblock::init(&handle, commands::allowed_hosts(&prefs));
            let num = |k: &str, d: f64| prefs.get(k).and_then(|v| v.as_f64()).unwrap_or(d);

            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("FloatPad")
                .inner_size(num("width", 700.0), num("height", 560.0))
                .min_inner_size(320.0, 260.0)
                .decorations(false)
                .always_on_top(true)
                .visible(false);
            if prefs.contains_key("x") && prefs.contains_key("y") {
                builder = builder.position(num("x", 0.0), num("y", 0.0));
            }
            let win = builder.build()?;
            platform::decorate(&win.as_ref().window());
            let selftest_mode = std::env::var("FP_SELFTEST").is_ok();
            if !selftest_mode {
                win.show()?;
            }

            let h = handle.clone();
            let w2 = win.clone();
            win.on_window_event(move |e| match e {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close(); // tray keeps the app alive
                    let _ = w2.hide();
                }
                WindowEvent::Focused(_) => {
                    let _ = w2.set_ignore_cursor_events(false);
                    let _ = h.emit_to("main", "detach-cleared", ());
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    let mini = h.state::<MiniState>();
                    save_main_bounds(&h, &w2, &mini);
                }
                _ => {}
            });

            // Tray
            let show = MenuItem::with_id(app, "show", "Show FloatPad", true, None::<&str>)?;
            let board = MenuItem::with_id(app, "board", "Board", true, None::<&str>)?;
            let video = MenuItem::with_id(app, "video", "Video", true, None::<&str>)?;
            let web = MenuItem::with_id(app, "web", "Web", true, None::<&str>)?;
            let write = MenuItem::with_id(app, "write", "Write", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &board, &video, &web, &write, &sep, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!("../../assets/icon_16.png"))?)
                .tooltip("FloatPad")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => commands::show_all_windows(app),
                    mode @ ("board" | "video" | "web" | "write") => {
                        commands::show_all_windows(app);
                        let _ = app.emit_to("main", "set-mode", mode);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        commands::show_all_windows(tray.app_handle());
                    }
                })
                .build(app)?;

            if selftest_mode {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move { selftest::run(h).await });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::win_close,
            commands::win_minimize,
            commands::win_show,
            commands::show_all,
            commands::win_opacity,
            commands::win_resize,
            commands::win_detach,
            commands::win_always_bottom,
            commands::win_lock,
            commands::reveal_path,
            commands::open_external,
            commands::win_mini_toggle,
            commands::panel_undock,
            commands::panel_dock_back,
            commands::screenshot_request,
            commands::screenshot_cancel,
            commands::screenshot_done,
            commands::capture_screen,
            commands::capture_webview_rect,
            commands::adblock_site_status,
            commands::adblock_toggle_site,
            commands::web_create,
            commands::web_set_bounds,
            commands::web_show,
            commands::web_hide,
            commands::web_destroy,
            commands::web_eval,
            commands::web_eval_result,
            commands::web_page_event,
            commands::log_js,
            commands::ocr_image,
            commands::shot_open,
            commands::shot_payload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FloatPad");
}