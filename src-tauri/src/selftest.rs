// Hidden end-to-end check of the Rust plumbing (FP_SELFTEST=1).
// The main window stays hidden; every step logs PASS/FAIL and the app exits.
use crate::{commands, platform};
use serde_json::Value;
use tauri::{AppHandle, Listener, Manager};

macro_rules! check {
    ($ok:expr, $($arg:tt)*) => {
        if $ok { log::info!("SELFTEST PASS: {}", format!($($arg)*)); }
        else   { log::error!("SELFTEST FAIL: {}", format!($($arg)*)); }
    };
}

pub async fn run(app: AppHandle) {
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    log::info!("SELFTEST: start");

    let Some(win) = app.get_webview_window("main") else {
        log::error!("SELFTEST FAIL: no main window");
        app.exit(1);
        return;
    };

    // 1. opacity
    let _ = platform::set_opacity(&win, 0.5);
    let (alpha, _) = platform::read_state(&win);
    check!((alpha - 0.5).abs() < 0.01, "opacity set/read ({alpha})");
    let _ = platform::set_opacity(&win, 1.0);

    // 2. detach + escape hatch
    let _ = win.set_ignore_cursor_events(true);
    let (_, ignoring) = platform::read_state(&win);
    check!(ignoring, "detach sets click-through");
    commands::show_all_windows(&app);
    let (_, ignoring) = platform::read_state(&win);
    check!(!ignoring, "show_all clears click-through");
    let _ = win.hide(); // stay invisible for the rest of the test

    // 3. mini toggle
    commands::win_mini_toggle(app.clone(), app.state::<commands::MiniState>());
    let scale = win.scale_factor().unwrap_or(1.0);
    let h = win.inner_size().unwrap().to_logical::<u32>(scale).height;
    check!(h == 36, "mini mode height 36 (got {h})");
    commands::win_mini_toggle(app.clone(), app.state::<commands::MiniState>());
    let h = win.inner_size().unwrap().to_logical::<u32>(scale).height;
    check!(h > 36, "mini mode restores height (got {h})");

    // 4. resize
    commands::win_resize(app.clone(), app.state::<commands::MiniState>(), 500, 400);
    let size = win.inner_size().unwrap().to_logical::<u32>(scale);
    check!(size.width == 500 && size.height == 400, "resize 500x400 (got {}x{})", size.width, size.height);

    // 5. screenshot overlay lifecycle (created hidden in selftest)
    commands::open_screenshot(&app);
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    check!(app.get_webview_window("screenshot").is_some(), "screenshot overlay created");
    commands::screenshot_cancel(app.clone()).await;
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    check!(app.get_webview_window("screenshot").is_none(), "screenshot overlay closed");

    // 6. panel undock / dock-back (created hidden in selftest)
    commands::panel_undock(app.clone(), "write".into()).await;
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    check!(app.get_webview_window("panel-write").is_some(), "panel-write created");
    commands::panel_dock_back(app.clone(), "write".into()).await;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    check!(app.get_webview_window("panel-write").is_none(), "panel-write docked back");

    // 7. embedded webview: create + executeJavaScript round-trip + destroy.
    //    This exercises the remote-URL capability chain (the riskiest part).
    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    app.listen_any("web-eval-result", move |e| {
        let _ = tx.send(serde_json::from_str(e.payload()).unwrap_or(Value::Null));
    });
    let created = commands::web_create(
        app.clone(), "main".into(), "web-selftest".into(),
        "https://example.com".into(), 0.0, 0.0, 400.0, 300.0,
    ).await;
    check!(created.is_ok(), "web_create ({created:?})");
    if created.is_ok() {
        let script = r#"(async () => { try { const r = await eval("document.title"); window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: 1, result: JSON.stringify(r === undefined ? null : r) }); } catch (e) { try { window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: 1, error: String((e && e.message) || e) }); } catch {} } })();"#;
        commands::web_eval(app.clone(), "web-selftest".into(), script.into()).await;
        match rx.recv_timeout(std::time::Duration::from_secs(20)) {
            Ok(v) => {
                let title = v.get("result").and_then(|r| r.as_str()).unwrap_or("");
                check!(title.contains("Example"), "remote eval round-trip (title={title}, err={})", v.get("error").and_then(|e| e.as_str()).unwrap_or("none"));
            }
            Err(_) => log::error!("SELFTEST FAIL: remote eval round-trip timed out (capability chain?)"),
        }
        commands::web_destroy(app.clone(), "web-selftest".into()).await;
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        check!(app.get_webview("web-selftest").is_none(), "web_destroy");
    }

    // 8. screen capture (needs Screen Recording permission; informational)
    match commands::capture_screen(app.clone()).await {
        Some(url) => log::info!("SELFTEST PASS: capture_screen ({} bytes)", url.len()),
        None => log::warn!("SELFTEST SKIP: capture_screen returned None (Screen Recording permission?)"),
    }

    log::info!("SELFTEST: done");
    app.exit(0);
}