// Platform-specific window niceties that Tauri's cross-platform API doesn't cover.
use tauri::WebviewWindow;

/// Whole-window alpha (v1: BrowserWindow.setOpacity).
#[cfg(target_os = "macos")]
pub fn set_opacity(win: &WebviewWindow, alpha: f64) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;
    let ptr = win.ns_window()? as *mut NSWindow;
    unsafe { (*ptr).setAlphaValue(alpha) };
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn set_opacity(win: &WebviewWindow, alpha: f64) -> tauri::Result<()> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };
    // tauri returns the `windows` crate's newtype HWND; windows-sys takes the raw pointer
    let hwnd = win.hwnd()?.0;
    unsafe {
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED as i32);
        SetLayeredWindowAttributes(hwnd, 0, (alpha * 255.0) as u8, LWA_ALPHA);
    }
    Ok(())
}

// shortcut: Linux window opacity is a no-op (GTK exposes no per-window alpha through tao); upgrade when tao adds it
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn set_opacity(_win: &WebviewWindow, _alpha: f64) -> tauri::Result<()> {
    Ok(())
}

/// Visible on every Space, including over full-screen apps (v1: setVisibleOnAllWorkspaces).
pub fn decorate(win: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
        let _ = win.set_visible_on_all_workspaces(true);
        if let Ok(ptr) = win.ns_window() {
            let ns = ptr as *mut NSWindow;
            unsafe {
                let b = (*ns).collectionBehavior();
                (*ns).setCollectionBehavior(
                    b | NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = win;
    }
}

/// Screenshot overlay: above everything, screen-saver level (v1 parity).
pub fn decorate_overlay(win: &WebviewWindow) {
    decorate(win);
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;
        if let Ok(ptr) = win.ns_window() {
            let ns = ptr as *mut NSWindow;
            unsafe { (*ns).setLevel(1000) }; // kCGScreenSaverWindowLevel
        }
    }
}