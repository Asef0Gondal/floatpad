// Network-level ad/tracker blocking for the embedded browser.
//
// macOS: WKContentRuleList (Safari content-blocker format) — real request
// cancellation, same semantics as v1's session.webRequest.onBeforeRequest.
// The compiled list is stored as a raw pointer and ONLY touched on the main
// thread (AppKit/WebKit rule; async commands run on worker threads).
// Other platforms: no-op here; the injected page.js still hides ad elements.

/// Keep in sync with AD_HOSTS in src/page.js.
pub const AD_HOSTS: [&str; 17] = [
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "googletagmanager.com",
    "google-analytics.com",
    "adsystem.google.com",
    "adservice.google.com",
    "amazon-adsystem.com",
    "ads-twitter.com",
    "ads.linkedin.com",
    "connect.facebook.net",
    "facebook.com/tr",
    "taboola.com",
    "outbrain.com",
    "criteo.com",
    "hotjar.com",
    "segment.com",
];

/// Safari content-blocker JSON. `unless-domain` exempts the per-site allowlist
/// (matches the page loading the resource, like v1's initiator/referrer check).
pub fn rules_json(allowed_hosts: &[String]) -> String {
    let rules: Vec<serde_json::Value> = AD_HOSTS
        .iter()
        .map(|entry| {
            let (host, path) = match entry.split_once('/') {
                Some((h, p)) => (h, format!("/{p}")),
                None => (*entry, String::new()),
            };
            let escaped = host.replace('.', "\\.");
            // WebKit's url-filter engine is a restricted regex subset; plain
            // substring matching is reliable and mirrors v1's host.includes(rule).
            let mut trigger = serde_json::json!({
                "url-filter": format!("{escaped}{path}"),
                "load-type": ["third-party"],
            });
            if !allowed_hosts.is_empty() {
                trigger["unless-domain"] = serde_json::json!(
                    allowed_hosts.iter().map(|h| format!("*{h}")).collect::<Vec<_>>()
                );
            }
            serde_json::json!({ "trigger": trigger, "action": { "type": "block" } })
        })
        .collect();
    serde_json::to_string(&rules).unwrap_or_else(|_| "[]".into())
}

#[cfg(target_os = "macos")]
mod imp {
    use super::{rules_json, AD_HOSTS};
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_foundation::NSString;
    use objc2_web_kit::{WKContentRuleList, WKContentRuleListStore, WKWebView, WKWebViewConfiguration};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::{AppHandle, Manager};

    // Retained<WKContentRuleList> as raw pointer; main-thread-only access.
    static RULE_LIST: AtomicUsize = AtomicUsize::new(0);

    pub fn is_ready() -> bool {
        RULE_LIST.load(Ordering::SeqCst) != 0
    }

    unsafe fn store_list(list: *mut WKContentRuleList) {
        if let Some(r) = Retained::retain(list) {
            let old = RULE_LIST.swap(Retained::into_raw(r) as usize, Ordering::SeqCst);
            if old != 0 {
                drop(Retained::from_raw(old as *mut WKContentRuleList));
            }
        }
    }

    /// Compile the rule list on the main thread; the completion block stores it
    /// and (when `apply_live`) pushes it into every existing browser webview.
    fn compile(app: &AppHandle, allowed: Vec<String>, apply_live: bool) {
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || unsafe {
            let Some(mtm) = MainThreadMarker::new() else { return };
            let Some(store) = WKContentRuleListStore::defaultStore(mtm) else { return };
            let json = NSString::from_str(&rules_json(&allowed));
            let id = NSString::from_str("floatpad-adblock");
            let app3 = app2.clone();
            let block = block2::RcBlock::new(move |list: *mut WKContentRuleList, err: *mut objc2_foundation::NSError| {
                if list.is_null() || !err.is_null() {
                    let desc = if err.is_null() {
                        "unknown".to_string()
                    } else {
                        (*err).localizedDescription().to_string()
                    };
                    log::warn!("adblock: content rule list compile failed: {desc}");
                    return;
                }
                store_list(list);
                log::info!("adblock: content rule list compiled ({} hosts, {} exemptions)", AD_HOSTS.len(), allowed.len());
                if apply_live {
                    let ptr = RULE_LIST.load(Ordering::SeqCst);
                    for (label, webview) in app3.webviews() {
                        if !label.starts_with("web-") {
                            continue;
                        }
                        let _ = webview.with_webview(move |platform| {
                            let wk = platform.inner() as *mut WKWebView;
                            if let Some(list) = Retained::retain(ptr as *mut WKContentRuleList) {
                                let ucc = (*wk).configuration().userContentController();
                                ucc.removeAllContentRuleLists();
                                ucc.addContentRuleList(&list);
                            }
                        });
                    }
                }
            });
            store.compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
                Some(&id),
                Some(&json),
                Some(&block),
            );
        });
    }

    /// Compile once at startup with the persisted allowlist.
    pub fn init(app: &AppHandle, allowed: Vec<String>) {
        compile(app, allowed, false);
    }

    /// Recompile after an allowlist change and update live webviews.
    pub fn refresh(app: &AppHandle, allowed: Vec<String>) {
        compile(app, allowed, true);
    }

    /// Build a WKWebViewConfiguration carrying the current rule list, for
    /// WebviewBuilder::with_webview_configuration. Constructed on the main
    /// thread, shuttled back as a raw pointer (Retained is !Send).
    pub fn make_configuration(app: &AppHandle) -> Option<Retained<WKWebViewConfiguration>> {
        let ptr = RULE_LIST.load(Ordering::SeqCst);
        if ptr == 0 {
            return None;
        }
        let (tx, rx) = std::sync::mpsc::channel::<usize>();
        let _ = app.run_on_main_thread(move || unsafe {
            let Some(mtm) = MainThreadMarker::new() else {
                let _ = tx.send(0);
                return;
            };
            let config = WKWebViewConfiguration::new(mtm);
            if let Some(list) = Retained::retain(ptr as *mut WKContentRuleList) {
                config.userContentController().addContentRuleList(&list);
            }
            let _ = tx.send(Retained::into_raw(config) as usize);
        });
        match rx.recv_timeout(std::time::Duration::from_secs(2)) {
            Ok(p) if p != 0 => unsafe { Retained::from_raw(p as *mut WKWebViewConfiguration) },
            _ => None,
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::{init, is_ready, make_configuration, refresh};

#[cfg(not(target_os = "macos"))]
mod imp_stub {
    use tauri::AppHandle;
    pub fn init(_app: &AppHandle, _allowed: Vec<String>) {}
    pub fn refresh(_app: &AppHandle, _allowed: Vec<String>) {}
    pub fn is_ready() -> bool {
        false
    }
}

#[cfg(not(target_os = "macos"))]
pub use imp_stub::{init, is_ready, refresh};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_cover_all_hosts_and_escape_dots() {
        let json = rules_json(&[]);
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        let rules = v.as_array().unwrap();
        assert_eq!(rules.len(), AD_HOSTS.len());
        let filters: Vec<&str> = rules
            .iter()
            .map(|r| r["trigger"]["url-filter"].as_str().unwrap())
            .collect();
        assert!(filters.iter().any(|f| f.contains("doubleclick\\.net")));
        assert!(filters.iter().any(|f| f.contains("facebook\\.com/tr")));
        assert!(!json.contains("unless-domain"));
    }

    #[test]
    fn allowlist_adds_unless_domain() {
        let json = rules_json(&["example.com".into()]);
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        for rule in v.as_array().unwrap() {
            assert_eq!(rule["trigger"]["unless-domain"][0], "*example.com");
            assert_eq!(rule["action"]["type"], "block");
        }
    }

    #[test]
    fn main_frame_documents_are_not_blocked() {
        let json = rules_json(&[]);
        assert!(!json.contains("\"document\""));
    }
}