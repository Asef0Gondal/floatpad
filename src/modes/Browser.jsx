import React, { useRef, useState, useEffect, useCallback } from 'react';
import { normalizeUrl } from '../utils/helpers';
import {
  IconBack,
  IconBookmark,
  IconFwd,
  IconGrab,
  IconReader,
  IconReload,
  IconShield,
} from '../components/Icons';

const { ipcRenderer } = window.require('electron');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const STORAGE_URL = 'fp_browser_url';
const STORAGE_BM = 'fp_bookmarks';
const initUrl = localStorage.getItem(STORAGE_URL) || 'https://www.google.com';

const READER_CSS = `
  header,nav,footer,.nav,.navbar,.header,.footer,.sidebar,.side-bar,
  [class*="sidebar"],[class*="banner"],[class*="cookie"],[class*="popup"],
  [class*="modal"],[class*="overlay"],[class*="advertisement"],[class*="ad-"],
  [id*="sidebar"],[id*="cookie"],[id*="popup"],[id*="ad-"],
  aside, .ad, #ad, [class*="widget"], [class*="social-share"],
  [class*="related"], [class*="recommended"] {
    display: none !important;
  }
  html, body {
    background: #f9f6f0 !important;
    color: #1a1a1a !important;
  }
  body > * { max-width: 700px !important; margin: 0 auto !important; }
  article, main, [role="main"], .content, .post-content, .entry-content {
    max-width: 680px !important; margin: 32px auto !important;
    font-family: Georgia, serif !important;
    font-size: 18px !important; line-height: 1.75 !important;
    padding: 0 24px !important;
  }
  img { max-width: 100% !important; height: auto !important; }
  a { color: #1a5276 !important; }
`;

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_BM) || '[]'); } catch { return []; }
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_BM, JSON.stringify(bookmarks));
}

function getActiveVideoScript(body) {
  return `
    (() => {
      const videos = Array.from(document.querySelectorAll('video'))
        .filter(video => video.currentSrc || video.src || video.readyState > 0);
      if (!videos.length) return null;

      let best = videos[0];
      let bestScore = -1;
      for (const video of videos) {
        const rect = video.getBoundingClientRect();
        const score = Math.max(0, rect.width * rect.height) + (video.paused ? 0 : 1000000);
        if (score > bestScore) {
          best = video;
          bestScore = score;
        }
      }

      const video = best;
      ${body}
    })();
  `;
}

export default function Browser({ active }) {
  const wvRef = useRef(null);
  const loadbarRef = useRef(null);

  const [urlInput, setUrlInput] = useState(initUrl);
  const [displayUrl, setDisplayUrl] = useState(initUrl);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readerMode, setReaderMode] = useState(false);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);
  const [showBm, setShowBm] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [pageTitle, setPageTitle] = useState('');
  const [pageHasVideo, setPageHasVideo] = useState(false);
  const [siteHost, setSiteHost] = useState('');
  const [siteAdblockDisabled, setSiteAdblockDisabled] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);

  const navigate = useCallback((raw) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setUrlInput(url);
    setReaderMode(false);
    try { wvRef.current?.loadURL(url); } catch (_) {}
  }, []);

  const syncNav = useCallback(() => {
    try {
      setCanBack(wvRef.current?.canGoBack() ?? false);
      setCanFwd(wvRef.current?.canGoForward() ?? false);
    } catch (_) {}
  }, []);

  const refreshAdblockState = useCallback(async (rawUrl = displayUrl) => {
    try {
      const result = await ipcRenderer.invoke('adblock-site-status', rawUrl);
      setSiteHost(result?.host || '');
      setSiteAdblockDisabled(!!result?.disabled);
    } catch (_) {
      setSiteHost('');
      setSiteAdblockDisabled(false);
    }
  }, [displayUrl]);

  const detectPageVideo = useCallback(async () => {
    const wv = wvRef.current;
    if (!wv) return;
    try {
      const result = await wv.executeJavaScript(getActiveVideoScript(`
        const rect = video.getBoundingClientRect();
        return {
          hasVideo: rect.width > 40 && rect.height > 40,
          paused: video.paused,
          width: rect.width,
          height: rect.height,
        };
      `), true);
      setPageHasVideo(!!result?.hasVideo);
    } catch (_) {
      setPageHasVideo(false);
    }
  }, []);

  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;

    const onNav = (e) => {
      const url = e.url || '';
      if (url && url !== 'about:blank') {
        setUrlInput(url);
        setDisplayUrl(url);
        localStorage.setItem(STORAGE_URL, url);
      }
      syncNav();
      refreshAdblockState(url);
    };

    const onStart = () => {
      setLoading(true);
      setPageHasVideo(false);
      if (loadbarRef.current) loadbarRef.current.className = 'nav-loadbar loading';
    };

    const onStop = () => {
      setLoading(false);
      syncNav();
      if (loadbarRef.current) {
        loadbarRef.current.className = 'nav-loadbar done';
        setTimeout(() => {
          if (loadbarRef.current) loadbarRef.current.className = 'nav-loadbar';
        }, 500);
      }
      try {
        wv.executeJavaScript('document.title').then(title => setPageTitle(title || '')).catch(() => {});
      } catch (_) {}
      detectPageVideo();
      refreshAdblockState();
    };

    const onNewWindow = (e) => {
      if (e.url && e.url !== 'about:blank') navigate(e.url);
    };

    const onCtxMenu = (e) => {
      const params = e.params || e;
      const srcURL = params.srcURL || params.srcUrl || '';
      const linkURL = params.linkURL || params.linkUrl || '';
      const x = params.x ?? e.x ?? 0;
      const y = (params.y ?? e.y ?? 0) + 36;
      if (srcURL || linkURL) {
        setCtxMenu({ x, y, imgSrc: srcURL || null, linkUrl: linkURL || null });
      } else {
        setCtxMenu(null);
      }
    };

    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('new-window', onNewWindow);
    wv.addEventListener('context-menu', onCtxMenu);

    return () => {
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('new-window', onNewWindow);
      wv.removeEventListener('context-menu', onCtxMenu);
    };
  }, [detectPageVideo, navigate, refreshAdblockState, syncNav]);

  useEffect(() => {
    if (!ctxMenu) return;
    const h = () => setCtxMenu(null);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [ctxMenu]);

  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => {
      detectPageVideo();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [active, detectPageVideo]);

  const toggleReader = useCallback(async () => {
    const wv = wvRef.current;
    if (!wv) return;
    const next = !readerMode;
    setReaderMode(next);
    if (next) {
      try {
        await wv.insertCSS(READER_CSS);
      } catch (_) {}
    } else {
      try { wv.reload(); } catch (_) {}
    }
  }, [readerMode]);

  const addBookmark = useCallback(() => {
    const url = displayUrl;
    if (!url || url === 'about:blank') return;
    const title = pageTitle || new URL(url).hostname;
    setBookmarks(prev => {
      if (prev.find(bookmark => bookmark.url === url)) return prev;
      const next = [...prev, { id: Date.now(), url, title: title.slice(0, 24) }];
      saveBookmarks(next);
      return next;
    });
    setShowBm(true);
  }, [displayUrl, pageTitle]);

  const removeBookmark = useCallback((id) => {
    setBookmarks(prev => {
      const next = prev.filter(bookmark => bookmark.id !== id);
      saveBookmarks(next);
      return next;
    });
  }, []);

  const toggleSiteAdblock = useCallback(async () => {
    try {
      const result = await ipcRenderer.invoke('adblock-toggle-site', displayUrl);
      setSiteHost(result?.host || '');
      setSiteAdblockDisabled(!!result?.disabled);
    } catch (_) {}
  }, [displayUrl]);

  useEffect(() => {
    const onKey = (e) => {
      if (!active) return;
      const ctrl = e.metaKey || e.ctrlKey;
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        addBookmark();
        return;
      }
      if (ctrl && e.key === 'l') {
        e.preventDefault();
        document.getElementById('burl')?.select();
        return;
      }
      if (ctrl && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (bookmarks[index]) {
          e.preventDefault();
          navigate(bookmarks[index].url);
        }
        return;
      }
      if (active && pageHasVideo && e.key === '[') {
        e.preventDefault();
        void runPageVideoStep(-1);
      }
      if (active && pageHasVideo && e.key === ']') {
        e.preventDefault();
        void runPageVideoStep(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, addBookmark, bookmarks, navigate, pageHasVideo]);

  const sendToBoard = useCallback((imgSrc) => {
    if (!imgSrc) return;
    const channel = new BroadcastChannel('floatpad');
    channel.postMessage({ type: 'grab-frame', dataUrl: imgSrc });
    channel.close();
    setCtxMenu(null);
  }, []);

  const runPageVideoStep = useCallback(async (direction) => {
    const wv = wvRef.current;
    if (!wv) return;
    setVideoBusy(true);
    try {
      const result = await wv.executeJavaScript(getActiveVideoScript(`
        const step = 1 / 30;
        const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
        video.pause();
        video.currentTime = Math.max(0, Math.min(duration, video.currentTime + (${direction}) * step));
        return { ok: true, currentTime: video.currentTime };
      `), true);
      setPageHasVideo(!!result?.ok);
    } catch (_) {
      setPageHasVideo(false);
    } finally {
      setVideoBusy(false);
    }
  }, []);

  const grabPageVideoFrame = useCallback(async () => {
    const wv = wvRef.current;
    if (!wv) return;
    setVideoBusy(true);
    try {
      const info = await wv.executeJavaScript(getActiveVideoScript(`
        const rect = video.getBoundingClientRect();
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      `), true);

      if (!info?.rect?.width || !info?.rect?.height) {
        setPageHasVideo(false);
        return;
      }

      const dataUrl = await ipcRenderer.invoke('capture-webview-rect', wv.getWebContentsId(), info.rect);
      if (dataUrl) sendToBoard(dataUrl);
    } catch (_) {
      setPageHasVideo(false);
    } finally {
      setVideoBusy(false);
    }
  }, [sendToBoard]);

  return (
    <div className="browser-wrap" onClick={() => ctxMenu && setCtxMenu(null)}>
      <div className="browser-toolbar">
        <button className="nav-btn" disabled={!canBack} onClick={() => { try { wvRef.current?.goBack(); } catch (_) {} }} title="Back">
          <IconBack size={13}/>
        </button>
        <button className="nav-btn" disabled={!canFwd} onClick={() => { try { wvRef.current?.goForward(); } catch (_) {} }} title="Forward">
          <IconFwd size={13}/>
        </button>
        <button
          className={`nav-btn${loading ? ' spin' : ''}`}
          onClick={() => { try { loading ? wvRef.current?.stop() : wvRef.current?.reload(); } catch (_) {} }}
          title="Reload / Stop"
        >
          <IconReload size={13}/>
        </button>

        <div className="nav-url-wrap">
          <input
            id="burl"
            className="nav-url"
            type="text"
            placeholder="Search or enter URL…"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Enter') navigate(urlInput);
              if (e.key === 'Escape') {
                try { wvRef.current?.stop(); } catch (_) {}
                setLoading(false);
              }
            }}
          />
          <div ref={loadbarRef} className="nav-loadbar" />
        </div>

        <button
          className={`nav-btn${readerMode ? ' on' : ''}`}
          onClick={toggleReader}
          title="Reader mode"
        >
          <IconReader size={13}/>
        </button>

        <button
          className={`nav-btn${siteHost && !siteAdblockDisabled ? ' on' : ''}`}
          onClick={toggleSiteAdblock}
          title={
            siteHost
              ? `${siteAdblockDisabled ? 'Allowing' : 'Blocking'} ads on ${siteHost}`
              : 'Toggle ad blocker for this site'
          }
        >
          <IconShield size={13}/>
        </button>

        <button
          className={`nav-btn${pageHasVideo ? ' on' : ''}`}
          disabled={!pageHasVideo || videoBusy}
          onClick={() => runPageVideoStep(-1)}
          title="Previous video frame"
        >
          ‹
        </button>
        <button
          className={`nav-btn${pageHasVideo ? ' on' : ''}`}
          disabled={!pageHasVideo || videoBusy}
          onClick={grabPageVideoFrame}
          title="Grab page video frame to Board"
        >
          <IconGrab size={13}/>
        </button>
        <button
          className={`nav-btn${pageHasVideo ? ' on' : ''}`}
          disabled={!pageHasVideo || videoBusy}
          onClick={() => runPageVideoStep(1)}
          title="Next video frame"
        >
          ›
        </button>

        <button
          className={`nav-btn${showBm ? ' on' : ''}`}
          onClick={() => setShowBm(current => !current)}
          title={`Bookmarks${bookmarks.length ? ` (${bookmarks.length})` : ''}`}
        >
          <IconBookmark size={13}/>
        </button>

        <button className="nav-btn" onClick={addBookmark} title="Bookmark this page (Cmd+D)">
          +
        </button>

        <button className="nav-btn" onClick={() => navigate(urlInput)} title="Go">
          ↵
        </button>
      </div>

      {(siteHost || pageHasVideo) && (
        <div className="browser-meta-bar">
          {siteHost && (
            <span className={`browser-meta-pill${siteAdblockDisabled ? '' : ' active'}`}>
              {siteAdblockDisabled ? 'Ads allowed' : 'Ads blocked'} on {siteHost}
            </span>
          )}
          {pageHasVideo && (
            <span className="browser-meta-pill active">
              Browser video tools ready
            </span>
          )}
        </div>
      )}

      {showBm && bookmarks.length > 0 && (
        <div className="bm-bar">
          {bookmarks.map((bookmark, index) => (
            <div key={bookmark.id} className="bm-pill">
              <button
                className="bm-pill-load"
                onClick={() => navigate(bookmark.url)}
                title={`${bookmark.url}\nCmd+${index + 1 <= 9 ? index + 1 : ''} to jump`}
              >
                {index < 9 && <span className="bm-num">{index + 1}</span>}
                {bookmark.title}
              </button>
              <button className="bm-pill-del" onClick={() => removeBookmark(bookmark.id)} title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <webview
        ref={wvRef}
        className="browser-webview"
        src={initUrl}
        useragent={UA}
        partition="persist:floatpad"
        allowpopups="false"
      />

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y + 36 }}
          onMouseDown={e => e.stopPropagation()}
        >
          {ctxMenu.imgSrc && (
            <button className="ctx-item" onClick={() => sendToBoard(ctxMenu.imgSrc)}>
              Send image to Board
            </button>
          )}
          {ctxMenu.imgSrc && (
            <button
              className="ctx-item"
              onClick={() => {
                navigator.clipboard.writeText(ctxMenu.imgSrc).catch(() => {});
                setCtxMenu(null);
              }}
            >
              Copy image URL
            </button>
          )}
          {ctxMenu.linkUrl && (
            <button className="ctx-item" onClick={() => { navigate(ctxMenu.linkUrl); setCtxMenu(null); }}>
              Open link
            </button>
          )}
          {ctxMenu.linkUrl && (
            <button
              className="ctx-item"
              onClick={() => {
                navigator.clipboard.writeText(ctxMenu.linkUrl).catch(() => {});
                setCtxMenu(null);
              }}
            >
              Copy link URL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
