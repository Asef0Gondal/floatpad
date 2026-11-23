// Platform-specific window niceties that Tauri's cross-platform API doesn't cover.
// IMPORTANT: raw AppKit calls must run on the main thread — async Tauri commands
// execute on worker threads, and macOS window management traps on off-main mutations.
use tauri::Window;


#[cfg(target_os = "macos")]
fn on_main(win: &Window, f: impl FnOnce() + Send + 'static) {
    let _ = win.run_on_main_thread(f);
}

/// Whole-window alpha (v1: BrowserWindow.setOpacity).
#[cfg(target_os = "macos")]
pub fn set_opacity(win: &Window, alpha: f64) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;
    let ptr = win.ns_window()? as *mut NSWindow;
    let ptr = ptr as usize; // send across threads; deref only on main
    on_main(win, move || unsafe {
        (*(ptr as *mut NSWindow)).setAlphaValue(alpha);
    });
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn set_opacity(win: &Window, alpha: f64) -> tauri::Result<()> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };
    // tauri returns the `windows` crate's newtype HWND; windows-sys takes the raw pointer
    let hwnd = win.hwnd()?.0 as usize;
    let _ = win.run_on_main_thread(move || unsafe {
        let hwnd = hwnd as _;
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED as i32);
        SetLayeredWindowAttributes(hwnd, 0, (alpha * 255.0) as u8, LWA_ALPHA);
    });
    Ok(())
}

// shortcut: Linux window opacity is a no-op (GTK exposes no per-window alpha through tao); upgrade when tao adds it
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn set_opacity(_win: &Window, _alpha: f64) -> tauri::Result<()> {
    Ok(())
}

/// Read back (alpha, ignoresMouseEvents) for the self-test. Main-thread dispatch + channel.
#[cfg(target_os = "macos")]
pub fn read_state(win: &Window) -> (f64, bool) {
    use objc2_app_kit::NSWindow;
    let Ok(ptr) = win.ns_window() else { return (1.0, false) };
    let ptr = ptr as usize;
    let (tx, rx) = std::sync::mpsc::channel();
    on_main(win, move || {
        let ns = ptr as *mut NSWindow;
        let _ = tx.send(unsafe { ((*ns).alphaValue(), (*ns).ignoresMouseEvents()) });
    });
    rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or((1.0, false))
}

#[cfg(not(target_os = "macos"))]
pub fn read_state(_win: &Window) -> (f64, bool) {
    (1.0, false)
}

/// Lock/unlock window dragging (PureRef "Lock window").
#[cfg(target_os = "macos")]
pub fn set_movable(win: &Window, movable: bool) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;
    let ptr = win.ns_window()? as usize;
    let _ = win.run_on_main_thread(move || unsafe {
        (*(ptr as *mut NSWindow)).setMovable(movable);
    });
    Ok(())
}

// shortcut: Windows/Linux window-move locking needs subclassing/hooking; no-op for now
#[cfg(not(target_os = "macos"))]
pub fn set_movable(_win: &Window, _movable: bool) -> tauri::Result<()> {
    Ok(())
}

/// Visible on every Space, including over full-screen apps (v1: setVisibleOnAllWorkspaces).
pub fn decorate(win: &Window) {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask};
        let _ = win.set_visible_on_all_workspaces(true);
        if let Ok(ptr) = win.ns_window() {
            let ptr = ptr as usize;
            on_main(win, move || unsafe {
                let ns = ptr as *mut NSWindow;
                let b = (*ns).collectionBehavior();
                (*ns).setCollectionBehavior(
                    b | NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );
                // Borderless windows need the Resizable mask to allow edge-drag
                // resizing (detached panels otherwise can't be resized).
                let m = (*ns).styleMask();
                (*ns).setStyleMask(m | NSWindowStyleMask::Resizable);
            });
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = win;
    }
}

/// Screenshot overlay: above everything, screen-saver level (v1 parity).
pub fn decorate_overlay(win: &Window) {
    decorate(win);
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;
        if let Ok(ptr) = win.ns_window() {
            let ptr = ptr as usize;
            on_main(win, move || unsafe {
                (*(ptr as *mut NSWindow)).setLevel(1000); // kCGScreenSaverWindowLevel
            });
        }
    }
}