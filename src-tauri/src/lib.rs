mod adblock;
mod commands;
mod ocr;
mod platform;
mod selftest;
mod shots;

use commands::MiniState;
use serde_json::{Map, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

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
        return; // don't persist the mini strip
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

// Drag/resize fires many events per second; only persist the resting bounds.
// Each event bumps a generation; a delayed task saves only if it's still latest.
static BOUNDS_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn save_main_bounds_debounced(app: &tauri::AppHandle, win: &tauri::WebviewWindow) {
    use std::sync::atomic::Ordering;
    let gen = BOUNDS_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    let win = win.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if BOUNDS_GEN.load(Ordering::SeqCst) != gen {
            return; // a newer move/resize superseded this one
        }
        let mini = app.state::<MiniState>();
        save_main_bounds(&app, &win, &mini);
    });
}

// ── App ──────────────────────────────────────────────────────────────────────

pub fn run() {
    // Visible runtime logs (IPC denials, shortcut fires, window ops) in dev.
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).try_init();

    let toggle: Shortcut = "CommandOrControl+Shift+Space".parse().unwrap();
    let shot: Shortcut = "CommandOrControl+Shift+S".parse().unwrap();
    let toggle_id = toggle.id();
    let shot_id = shot.id();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("second instance launched — focusing existing windows");
            commands::show_all_windows(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.id() == toggle_id {
                        log::info!("shortcut: toggle windows");
                        commands::toggle_all(app);
                    } else if shortcut.id() == shot_id {
                        log::info!("shortcut: screenshot");
                        commands::open_screenshot(app);
                    }
                })
                .build(),
        )
        .manage(MiniState(Mutex::new(None)))
        .manage(commands::ShotPayloads(Mutex::new(std::collections::HashMap::new())))
        .setup(move |app| {
            // Menu-bar app: no Dock icon (v1: app.dock.hide())
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let prefs = load_prefs(&handle);
            adblock::init(&handle, commands::allowed_hosts(&prefs));

            // Register hotkeys gracefully: a conflict (another app owns the key)
            // disables that one shortcut instead of crashing the whole app.
            for (sc, name) in [(toggle, "toggle (⌘⇧Space)"), (shot, "screenshot (⌘⇧S)")] {
                if let Err(e) = app.global_shortcut().register(sc) {
                    log::warn!("global shortcut {name} unavailable: {e}");
                }
            }

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
            // If the saved position lands on a disconnected display, re-center.
            if prefs.contains_key("x") && prefs.contains_key("y") {
                if let Ok(pos) = win.outer_position() {
                    let scale = win.scale_factor().unwrap_or(1.0);
                    let lp = pos.to_logical::<f64>(scale);
                    let sz = win.inner_size().map(|s| s.to_logical::<f64>(scale)).unwrap_or_default();
                    let on_screen = app.available_monitors().map(|ms| ms.iter().any(|m| {
                        let mp = m.position().to_logical::<f64>(m.scale_factor());
                        let msz = m.size().to_logical::<f64>(m.scale_factor());
                        lp.x < mp.x + msz.width && lp.x + sz.width > mp.x
                            && lp.y < mp.y + msz.height && lp.y + sz.height > mp.y
                    })).unwrap_or(false);
                    if !on_screen { let _ = win.center(); }
                }
            }
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
                    save_main_bounds_debounced(&h, &w2);
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
            commands::gif_frames,
            commands::image_optimize,
            commands::list_md_files,
            shots::shot_save,
            shots::shots_list,
            shots::shot_load,
            shots::shot_delete,
            shots::shot_update,
            shots::shots_clear,
            commands::board_autosave_clear,
            commands::autosave_board,
            commands::load_autosave_board,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FloatPad");
}