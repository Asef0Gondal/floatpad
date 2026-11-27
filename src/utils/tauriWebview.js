// Browser-webview API surface backed by a native Tauri child webview.
// The webview is positioned over `host` (a plain div) and follows its rect.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

let evalSeq = 0;
const nextEvalId = () => { evalSeq = (evalSeq + 1 + Math.floor(Math.random() * 0xFFFF)) >>> 0; return evalSeq; };

/** One-shot executeJavaScript against any app webview, with result (scraping etc.). */
export function evalInWebview(label, script, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const id = nextEvalId();
    let un = null;
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; un?.(); fn(arg); } };
    listen('web-eval-result', e => {
      if (e.payload?.id !== id) return;
      if (e.payload.error) finish(reject, new Error(e.payload.error));
      else { try { finish(resolve, e.payload.result ? JSON.parse(e.payload.result) : null); } catch { finish(resolve, null); } }
    }).then(f => { un = f; if (settled) f(); });
    setTimeout(() => finish(reject, new Error('eval timeout')), timeoutMs);
    const wrapped = `(async () => { try { const r = await eval(${JSON.stringify(script)}); window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: ${id}, result: JSON.stringify(r === undefined ? null : r) }); } catch (e) { try { window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: ${id}, error: String((e && e.message) || e) }); } catch {} } })();`;
    invoke('web_eval', { label, script: wrapped }).catch(e => finish(reject, e));
  });
}

export function createTauriWebview({ host, url }) {
  const winLabel = getCurrentWindow().label;
  const label = 'web-' + winLabel;
  const handlers = {};
  const evalCbs = new Map();
  let created = false;
  let destroyed = false;
  let stack = [];
  let idx = -1;
  let pendingBack = false;
  let pendingFwd = false;
  let lastBounds = null;

  const emit = (name, arg) => (handlers[name] || []).forEach((f) => { try { f(arg); } catch (e) { console.error(e); } });
  const evalInPage = (script) => { if (!destroyed) invoke('web_eval', { label, script }).catch(() => {}); };

  function pushUrl(u) {
    if (pendingBack) { idx = Math.max(0, idx - 1); pendingBack = false; return; }
    if (pendingFwd) { idx = Math.min(stack.length - 1, idx + 1); pendingFwd = false; return; }
    if (stack[idx] === u) return;
    stack = stack.slice(0, idx + 1);
    stack.push(u);
    idx = stack.length - 1;
  }
  const clearPendingSoon = () => setTimeout(() => { pendingBack = false; pendingFwd = false; }, 1500);

  const unWebEvent = listen('web-event', (e) => {
    const p = e.payload;
    if (p.label !== label || destroyed) return;
    if (p.kind === 'load-start') {
      if (p.url && p.url !== 'about:blank') { pushUrl(p.url); emit('did-navigate', { url: p.url }); }
      emit('did-start-loading', {});
    } else if (p.kind === 'load-stop') {
      emit('did-stop-loading', {});
    } else if (p.kind === 'nav') {
      pushUrl(p.url);
      emit('did-navigate-in-page', { url: p.url });
      emit('did-navigate', { url: p.url });
      emit('did-stop-loading', {});
    } else if (p.kind === 'ctx') {
      emit('context-menu', { params: { srcURL: p.srcUrl || '', linkURL: p.linkUrl || '', x: p.x || 0, y: p.y || 0 } });
    } else if (p.kind === 'open') {
      emit('new-window', { url: p.url });
    }
  });
  const unEvalResult = listen('web-eval-result', (e) => {
    const p = e.payload;
    const cb = evalCbs.get(p.id);
    if (!cb) return;
    evalCbs.delete(p.id);
    if (p.error) cb.reject(new Error(p.error));
    else { try { cb.resolve(p.result ? JSON.parse(p.result) : null); } catch { cb.resolve(null); } }
  });

  // Keep the native webview glued to the host div (mode switches, meta bar,
  // mini mode, window resizes). Zero-size rect → hidden.
  const syncBounds = () => {
    if (!created || destroyed || !host.isConnected) return;
    // A native WKWebView subview paints ABOVE the host DOM (incl. <dialog> top
    // layer), so hide it while any modal is open or it would obscure the dialog.
    if (document.querySelector('dialog[open]') || document.querySelector('.ctx-menu')) {
      if (lastBounds !== null) { invoke('web_hide', { label }).catch(() => {}); lastBounds = null; }
      return;
    }
    const r = host.getBoundingClientRect();
    const b = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    if (b.w < 2 || b.h < 2) {
      if (lastBounds !== null) { invoke('web_hide', { label }).catch(() => {}); lastBounds = null; }
      return;
    }
    if (lastBounds && lastBounds.x === b.x && lastBounds.y === b.y && lastBounds.w === b.w && lastBounds.h === b.h) return;
    lastBounds = b;
    invoke('web_set_bounds', { label, x: b.x, y: b.y, w: b.w, h: b.h }).catch(() => {});
    invoke('web_show', { label }).catch(() => {});
  };
  const ro = new ResizeObserver(syncBounds);
  ro.observe(host);
  window.addEventListener('resize', syncBounds);
  const timer = setInterval(syncBounds, 400);

  const ready = (async () => {
    const r = host.getBoundingClientRect();
    await invoke('web_create', {
      window: winLabel, label, url,
      x: r.x, y: r.y, w: Math.max(r.width, 1), h: Math.max(r.height, 1),
    });
    created = true;
    syncBounds();
  })().catch((e) => console.error('web_create failed:', e));

  return {
    label,
    loadURL(u) {
      emit('did-start-loading', {});
      ready.then(() => evalInPage(`location.href = ${JSON.stringify(u)}`));
    },
    canGoBack: () => idx > 0,
    canGoForward: () => idx < stack.length - 1,
    goBack() { if (idx > 0) { pendingBack = true; clearPendingSoon(); evalInPage('history.back()'); } },
    goForward() { if (idx < stack.length - 1) { pendingFwd = true; clearPendingSoon(); evalInPage('history.forward()'); } },
    reload() { emit('did-start-loading', {}); evalInPage('location.reload()'); },
    stop() { evalInPage('window.stop()'); },
    executeJavaScript(script) {
      const id = nextEvalId();
      return new Promise((resolve, reject) => {
        evalCbs.set(id, { resolve, reject });
        const wrapped = `(async () => { try { const r = await eval(${JSON.stringify(script)}); window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: ${id}, result: JSON.stringify(r === undefined ? null : r) }); } catch (e) { try { window.__TAURI_INTERNALS__.invoke('web_eval_result', { id: ${id}, error: String((e && e.message) || e) }); } catch {} } })();`;
        ready.then(() => invoke('web_eval', { label, script: wrapped })).catch(reject);
        setTimeout(() => {
          if (evalCbs.has(id)) { evalCbs.delete(id); reject(new Error('eval timeout')); }
        }, 8000);
      });
    },
    insertCSS(css) {
      return this.executeJavaScript(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`);
    },
    addEventListener(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    removeEventListener(name, fn) { handlers[name] = (handlers[name] || []).filter((f) => f !== fn); },
    getWebContentsId: () => label,
    recheckAdblock() { evalInPage('window.__fpRecheckAdblock && window.__fpRecheckAdblock()'); },
    destroy() {
      destroyed = true;
      clearInterval(timer);
      ro.disconnect();
      window.removeEventListener('resize', syncBounds);
      unWebEvent.then((u) => u());
      unEvalResult.then((u) => u());
      // Wait for any in-flight create to settle before destroying, otherwise a
      // webview created just after destroy() would be orphaned (audit #4).
      ready.finally(() => invoke('web_destroy', { label }).catch(() => {}));
    },
  };
}