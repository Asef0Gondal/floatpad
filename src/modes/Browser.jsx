import React, { useRef, useState, useEffect, useCallback } from 'react';
import { normalizeUrl } from '../utils/helpers';

// Modern Chrome UA — everything works: YouTube, Notion, Figma, etc.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

const STORAGE_KEY = 'floatpad_url';

// Read once — we don't want React to ever change the initial src
// (changing src on the webview element causes a reload)
const initialUrl = localStorage.getItem(STORAGE_KEY) || '';

export default function Browser() {
  const wvRef = useRef(null);

  const [urlInput,  setUrlInput]  = useState(initialUrl);
  const [canBack,   setCanBack]   = useState(false);
  const [canFwd,    setCanFwd]    = useState(false);
  const [loading,   setLoading]   = useState(false);

  // ── Navigate ────────────────────────────────────────────
  const navigate = useCallback((raw) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setUrlInput(url);
    wvRef.current?.loadURL(url);
  }, []);

  // ── Sync nav-button state ────────────────────────────────
  const syncNav = useCallback(() => {
    const wv = wvRef.current;
    if (!wv) return;
    try {
      setCanBack(wv.canGoBack());
      setCanFwd(wv.canGoForward());
    } catch (_) {}
  }, []);

  // ── Wire up webview events ────────────────────────────────
  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;

    const onNavigate = (e) => {
      const url = e.url || '';
      if (url && url !== 'about:blank') {
        setUrlInput(url);
        localStorage.setItem(STORAGE_KEY, url);
      }
      syncNav();
    };

    const onStartLoad = () => setLoading(true);
    const onStopLoad  = () => { setLoading(false); syncNav(); };

    // Open links that try to open new windows inside the webview
    const onNewWindow = (e) => {
      if (e.url && e.url !== 'about:blank') {
        navigate(e.url);
      }
    };

    wv.addEventListener('did-navigate',         onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('did-start-loading',    onStartLoad);
    wv.addEventListener('did-stop-loading',     onStopLoad);
    wv.addEventListener('new-window',           onNewWindow);

    return () => {
      wv.removeEventListener('did-navigate',         onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('did-start-loading',    onStartLoad);
      wv.removeEventListener('did-stop-loading',     onStopLoad);
      wv.removeEventListener('new-window',           onNewWindow);
    };
  }, [navigate, syncNav]);

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="browser">

      {/* Nav bar */}
      <div className="browser-nav">
        <button
          className="nav-btn"
          disabled={!canBack}
          onClick={() => wvRef.current?.goBack()}
          title="Back"
        >←</button>

        <button
          className="nav-btn"
          disabled={!canFwd}
          onClick={() => wvRef.current?.goForward()}
          title="Forward"
        >→</button>

        <button
          className={`nav-btn${loading ? ' loading' : ''}`}
          onClick={() => wvRef.current?.reload()}
          title="Reload"
        >↺</button>

        <input
          className="nav-url"
          type="text"
          placeholder="Search or enter URL…"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => e.key === 'Enter' && navigate(urlInput)}
        />

        <button className="nav-btn" onClick={() => navigate(urlInput)} title="Go">↵</button>
      </div>

      {/*
        The webview is an Electron-specific element.
        - useragent: modern Chrome so all sites work
        - partition: persistent session (keeps you logged in across restarts)
        - src: set ONCE from localStorage — do NOT bind to React state,
                subsequent navigation uses wv.loadURL() instead
      */}
      <webview
        ref={wvRef}
        className="browser-webview"
        src={initialUrl || 'about:blank'}
        useragent={USER_AGENT}
        partition="persist:floatpad"
        allowpopups="false"
      />
    </div>
  );
}
