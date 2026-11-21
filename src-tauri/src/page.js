// Injected into every page of the embedded browser (main frame only).
// Reports SPA navigations / context menus / popups back to the app shell and
// hides ad/tracker elements. Network-level request blocking is a WKWebView
// limitation; element hiding + iframe removal covers the visible surface.
(() => {
  if (window.top !== window.self || window.__fpInjected) return;
  window.__fpInjected = true;
  const T = window.__TAURI_INTERNALS__;
  const report = (p) => { try { if (T) T.invoke('web_page_event', { payload: p }).catch(() => {}); } catch {} };

  // SPA navigations (full loads are reported by Rust on_page_load)
  const nav = () => report({ kind: 'nav', url: location.href, inPage: true });
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function (...a) { const r = orig.apply(this, a); nav(); return r; };
  }
  addEventListener('popstate', nav);
  addEventListener('hashchange', nav);

  // Right-click → app-level context menu (send image to Board, copy URLs)
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    const img = t && t.closest ? t.closest('img') : null;
    const a = t && t.closest ? t.closest('a') : null;
    report({ kind: 'ctx', x: e.clientX, y: e.clientY, srcUrl: img ? img.src : '', linkUrl: a ? a.href : '' });
  }, true);

  // Popups stay inside the pad instead of opening system windows
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if (a && a.href) { e.preventDefault(); report({ kind: 'open', url: a.href }); }
  }, true);
  window.open = (u) => { if (u) report({ kind: 'open', url: String(u) }); return null; };

  // Ad/tracker element hiding, with the same per-host allowlist as v1
  const AD_HOSTS = ['doubleclick.net','googlesyndication.com','googleadservices.com','googletagmanager.com','google-analytics.com','adsystem.google.com','adservice.google.com','amazon-adsystem.com','ads-twitter.com','ads.linkedin.com','connect.facebook.net','facebook.com/tr','taboola.com','outbrain.com','criteo.com','hotjar.com','segment.com'];
  const AD_SEL = 'ins.adsbygoogle,[id^="google_ads"],[data-ad-slot],[aria-label="advertisement"],[class*="adsbygoogle"]';
  let allowed = false, queued = false;
  const sweep = () => {
    if (allowed) return;
    document.querySelectorAll(AD_SEL).forEach((el) => el.remove());
    document.querySelectorAll('iframe[src]').forEach((f) => {
      try {
        const h = new URL(f.src).hostname.toLowerCase();
        if (AD_HOSTS.some((r) => h === r || h.endsWith('.' + r) || h.includes(r))) f.remove();
      } catch {}
    });
  };
  const schedule = () => {
    if (queued || allowed) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  };
  const recheck = async () => {
    try { const s = await T.invoke('adblock_site_status', { url: location.href }); allowed = !!(s && s.disabled); } catch {}
    schedule();
  };
  window.__fpRecheckAdblock = recheck;
  recheck();
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
})();