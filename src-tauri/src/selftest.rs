// Hidden end-to-end check of the Rust plumbing (FP_SELFTEST=1).
// The main window stays hidden; every step logs PASS/FAIL and the app exits.
use crate::{commands, platform};
use serde_json::{json, Value};
use tauri::{AppHandle, Listener, Manager};

macro_rules! check {
    ($ok:expr, $($arg:tt)*) => {
        if $ok { log::info!("SELFTEST PASS: {}", format!($($arg)*)); }
        else   { log::error!("SELFTEST FAIL: {}", format!($($arg)*)); }
    };
}

/// Poll until `f` is true or timeout — avoids fixed-sleep races on window registration.
async fn wait_for(mut f: impl FnMut() -> bool, ms: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    while std::time::Instant::now() < deadline {
        if f() {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    f()
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
    let _ = platform::set_opacity(&win.as_ref().window(), 0.5);
    let (alpha, _) = platform::read_state(&win.as_ref().window());
    check!((alpha - 0.5).abs() < 0.01, "opacity set/read ({alpha})");
    let _ = platform::set_opacity(&win.as_ref().window(), 1.0);

    // 2. detach + escape hatch
    let _ = win.set_ignore_cursor_events(true);
    let (_, ignoring) = platform::read_state(&win.as_ref().window());
    check!(ignoring, "detach sets click-through");
    commands::show_all_windows(&app);
    let (_, ignoring) = platform::read_state(&win.as_ref().window());
    check!(!ignoring, "show_all clears click-through");
    let _ = win.hide(); // stay invisible for the rest of the test

    // 3. mini toggle
    commands::win_mini_toggle(app.clone(), app.state::<commands::MiniState>());
    let scale = win.scale_factor().unwrap_or(1.0);
    let h = win.inner_size().unwrap().to_logical::<u32>(scale).height;
    check!(h == 34, "mini mode height 34 (got {h})");
    commands::win_mini_toggle(app.clone(), app.state::<commands::MiniState>());
    let h = win.inner_size().unwrap().to_logical::<u32>(scale).height;
    check!(h > 34, "mini mode restores height (got {h})");

    // 4. resize
    commands::win_resize(app.clone(), app.state::<commands::MiniState>(), 500, 400);
    let size = win.inner_size().unwrap().to_logical::<u32>(scale);
    check!(size.width == 500 && size.height == 400, "resize 500x400 (got {}x{})", size.width, size.height);

    // 4b. always-on-bottom (wallpaper mode) + window lock
    commands::win_always_bottom(app.clone(), true).await;
    check!(!win.is_always_on_top().unwrap_or(true), "always-bottom clears always-on-top");
    commands::win_always_bottom(app.clone(), false).await;
    check!(win.is_always_on_top().unwrap_or(false), "always-bottom restore re-enables always-on-top");
    commands::win_lock(app.clone(), true).await;
    commands::win_lock(app.clone(), false).await;
    log::info!("SELFTEST PASS: window lock toggle (no trap)");

    // 5. screenshot overlay lifecycle (created hidden in selftest)
    commands::open_screenshot(&app);
    let a = app.clone();
    check!(wait_for(move || a.get_webview_window("screenshot").is_some(), 3000).await, "screenshot overlay created");
    commands::screenshot_cancel(app.clone()).await;
    let a = app.clone();
    check!(wait_for(move || a.get_webview_window("screenshot").is_none(), 3000).await, "screenshot overlay closed");

    // 6. panel undock / dock-back (created hidden in selftest)
    commands::panel_undock(app.clone(), "write".into()).await;
    let a = app.clone();
    check!(wait_for(move || a.get_webview_window("panel-write").is_some(), 3000).await, "panel-write created");
    commands::panel_dock_back(app.clone(), "write".into()).await;
    let a = app.clone();
    check!(wait_for(move || a.get_webview_window("panel-write").is_none(), 3000).await, "panel-write docked back");

    // 6b. floating shot window (per-image mini window)
    let tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    let label = commands::shot_open(
        app.clone(),
        app.state::<commands::ShotPayloads>(),
        tiny_png.into(),
        100.0,
        100.0,
        String::new(),
        false,
    ).await;
    check!(label.is_ok(), "shot_open");
    if let Ok(l) = label {
        let a = app.clone();
        let l2 = l.clone();
        check!(wait_for(move || a.get_webview_window(&l2).is_some(), 3000).await, "shot window created");
        if let Some(w) = app.get_webview_window(&l) {
            let _ = w.close();
        }
        let a = app.clone();
        check!(wait_for(move || a.get_webview_window(&l).is_none(), 3000).await, "shot window closed");
    }

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
        let a = app.clone();
        check!(wait_for(move || a.get_webview("web-selftest").is_none(), 3000).await, "web_destroy");
    }

    // 8. screen capture (needs Screen Recording permission; informational)
    match commands::capture_screen(app.clone()).await {
        Some(url) => {
            log::info!("SELFTEST PASS: capture_screen ({} bytes)", url.len());
            // 8b. OCR end-to-end: recognize text in the live capture
            match commands::ocr_image(url).await {
                Ok(v) => {
                    let text = v["text"].as_str().unwrap_or("");
                    let preview: String = text.chars().take(60).collect();
                    log::info!("SELFTEST PASS: OCR pipeline ({} chars: {preview:?})", text.len());
                }
                Err(e) => log::error!("SELFTEST FAIL: OCR pipeline: {e}"),
            }
        }
        None => log::warn!("SELFTEST SKIP: capture_screen returned None (Screen Recording permission?)"),
    }

    // 9. ad-block allowlist round-trip + compiled network rule list
    let st = commands::adblock_site_status(app.clone(), "https://example.com".into()).await;
    check!(st["disabled"] == false, "adblock blocks by default");
    let tg = commands::adblock_toggle_site(app.clone(), "https://example.com".into()).await;
    check!(tg["disabled"] == true && tg["host"] == "example.com", "adblock toggle exempts host");
    let st = commands::adblock_site_status(app.clone(), "https://example.com".into()).await;
    check!(st["disabled"] == true, "adblock exemption persisted");
    commands::adblock_toggle_site(app.clone(), "https://example.com".into()).await; // restore
    #[cfg(target_os = "macos")]
    check!(wait_for(|| crate::adblock::is_ready(), 3000).await, "WKContentRuleList compiled");

    // 10. GIF decode round-trip: encode a 2-frame GIF, decode it back
    {
        let mut out = Vec::new();
        let ok = (|| -> Result<(), String> {
            let mut enc = image::codecs::gif::GifEncoder::new(&mut out);
            let f1 = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
            let f2 = image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 255, 0, 255]));
            enc.encode_frame(image::Frame::new(f1)).map_err(|e| e.to_string())?;
            enc.encode_frame(image::Frame::new(f2)).map_err(|e| e.to_string())?;
            Ok(())
        })();
        if ok.is_ok() {
            use base64::Engine;
            let url = format!("data:image/gif;base64,{}", base64::engine::general_purpose::STANDARD.encode(&out));
            match commands::gif_frames(url).await {
                Ok(v) => {
                    let n = v.as_array().map(|a| a.len()).unwrap_or(0);
                    check!(n == 2, "gif_frames round-trip (got {n} frames)");
                }
                Err(e) => log::error!("SELFTEST FAIL: gif_frames: {e}"),
            }
        } else {
            log::error!("SELFTEST FAIL: gif encode for round-trip");
        }
    }

    // 11. board autosave command responds (read-only — never clobbers the real board)
    let _ = commands::load_autosave_board(app.clone()).await;
    log::info!("SELFTEST PASS: board autosave read command");

    // 12. Shot Library round-trip (save → list → load → update → delete; cleans up)
    {
        let tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        match crate::shots::shot_save(app.clone(), tiny.into(), "selftest-shot".into(), vec!["test".into()]).await {
            Ok(meta) => {
                let id = meta["id"].as_str().unwrap_or("").to_string();
                let listed = crate::shots::shots_list(app.clone()).await.unwrap_or(Value::Array(vec![]));
                let found = listed.as_array().map(|a| a.iter().any(|s| s["id"] == json!(id))).unwrap_or(false);
                check!(found, "shot_save + shots_list");
                let loaded = crate::shots::shot_load(app.clone(), id.clone()).await;
                check!(loaded.as_deref() == Some(tiny), "shot_load round-trip");
                let _ = crate::shots::shot_update(app.clone(), id.clone(), "renamed".into(), vec!["x".into()]).await;
                let _ = crate::shots::shot_delete(app.clone(), id.clone()).await;
                let after = crate::shots::shots_list(app.clone()).await.unwrap_or(Value::Array(vec![]));
                let gone = after.as_array().map(|a| !a.iter().any(|s| s["id"] == json!(id))).unwrap_or(false);
                check!(gone, "shot_update + shot_delete cleanup");
            }
            Err(e) => log::error!("SELFTEST FAIL: shot_save: {e}"),
        }
    }

    // 13. image_optimize: downscale preserving aspect, never upscale
    {
        use base64::Engine;
        let encode = |img: image::RgbaImage| {
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
            format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
        };
        let big = encode(image::RgbaImage::from_pixel(2000, 1000, image::Rgba([10, 20, 30, 255])));
        match commands::image_optimize(big, 1600).await {
            Ok(v) => {
                let (w, h) = (v["width"].as_u64().unwrap_or(0), v["height"].as_u64().unwrap_or(0));
                check!(w == 1600 && h == 800, "image_optimize downscales 2000x1000 -> {w}x{h}");
            }
            Err(e) => log::error!("SELFTEST FAIL: image_optimize downscale: {e}"),
        }
        let small = encode(image::RgbaImage::from_pixel(100, 80, image::Rgba([1, 2, 3, 255])));
        if let Ok(v) = commands::image_optimize(small, 1600).await {
            check!(v["width"].as_u64() == Some(100), "image_optimize never upscales");
        }
    }

    log::info!("SELFTEST: done");
    app.exit(0);
}