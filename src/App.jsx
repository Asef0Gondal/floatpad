import React, { useState, useCallback, useEffect, useRef } from 'react';
import ImageBoard  from './modes/ImageBoard';
import VideoPlayer from './modes/VideoPlayer';
import Browser     from './modes/Browser';
import Write       from './modes/Write';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import Onboarding       from './components/Onboarding';
import ShotView         from './components/ShotView';
import {
  IconImage, IconPlay, IconWrite, IconSize, IconSun, IconMoon,
  IconHelp, IconClose, IconMini, IconExpand, IconPotato, IconDetach, IconUndock, IconBorderless,
} from './components/Icons';
import { applyTheme, getInitialTheme, THEME_KEY } from './theme';
import { potatoTransition } from './utils/helpers';
import { ipcRenderer } from './ipc';
import { getCurrentWindow } from '@tauri-apps/api/window';

const MODES = [
  { id:'board', label:'Board', Icon:IconImage  },
  { id:'video', label:'Video', Icon:IconPlay   },
  { id:'web',   label:'Web',   Icon:null       },
  { id:'write', label:'Write', Icon:IconWrite  },
];

const SIZE_PRESETS = [
  {label:'Tiny',  sub:'400×320', w:400, h:320},
  {label:'Small', sub:'580×440', w:580, h:440},
  {label:'Medium',sub:'700×560', w:700, h:560},
  {label:'Large', sub:'960×700', w:960, h:700},
  {label:'Wide',  sub:'1100×620',w:1100,h:620},
];

const SEEN_KEY = 'fp_onboarding_done';
const MODE_KEY = 'fp_last_mode';

// Determine if we're in a standalone panel window
const urlParams   = new URLSearchParams(window.location.search);
const panelParam  = urlParams.get('panel'); // 'board' | 'video' | 'web' | 'write' | null
const shotParam   = urlParams.get('shot');  // floating single-image window

// Standalone windows are pinned to their panel; the main window reopens
// on whichever mode was active last time.
function getInitialMode() {
  if (panelParam) return panelParam;
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved && MODES.some(m => m.id === saved)) return saved;
  } catch { /* storage unavailable — fall back to the board */ }
  return 'board';
}

export default function App() {
  // Shot windows render a separate component so hooks order stays stable (#8).
  return shotParam ? <ShotView /> : <AppMain />;
}

function AppMain() {
  const [mode,       setMode]       = useState(getInitialMode);
  const [theme,      setTheme]      = useState(getInitialTheme);
  const [opacity,    setOpacity]    = useState(() => Number(localStorage.getItem('fp_opacity')) || 100);
  const [potato,     setPotato]     = useState(false);
  const [miniMode,   setMiniMode]   = useState(false);
  const [detached,   setDetached]   = useState(false);
  const [winLocked,  setWinLocked]  = useState(false);
  const [winBottom,  setWinBottom]  = useState(false);
  const [showSizes,  setShowSizes]  = useState(false);
  const [showMore,   setShowMore]   = useState(false);
  const [borderless, setBorderless] = useState(() => localStorage.getItem('fp_borderless') === '1');
  const [chromeVisible, setChromeVisible] = useState(false);
  const [showKeys,   setShowKeys]   = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !panelParam && !localStorage.getItem(SEEN_KEY)
  );
  // Track which panels have ever been visited (for lazy mounting)
  const [visited, setVisited] = useState(() => new Set([getInitialMode()]));

  const sizeRef = useRef(null);
  const moreRef = useRef(null);
  const prePotatoOpacity = useRef(Number(localStorage.getItem('fp_opacity')) || 100);
  const chromeHideTimerRef = useRef(null);
  const isStandalone = !!panelParam;

  // ── Side effects ─────────────────────────────────────────

  // Remember the active mode for the next launch (main window only)
  useEffect(() => {
    if (!isStandalone) localStorage.setItem(MODE_KEY, mode);
  }, [mode, isStandalone]);

  // Mark mode as visited for lazy mounting
  useEffect(() => {
    setVisited(prev => new Set([...prev, mode]));
  }, [mode]);

  // Theme
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }, [theme]);

  // Tray → set-mode
  useEffect(() => {
    const h = (_, m) => setMode(m);
    ipcRenderer.on('set-mode', h);
    return () => ipcRenderer.removeListener('set-mode', h);
  }, []);

  // Mini-mode
  useEffect(() => {
    const h = (_, on) => setMiniMode(on);
    ipcRenderer.on('mini-mode', h);
    return () => ipcRenderer.removeListener('mini-mode', h);
  }, []);

  // Rust restores control on tray/shortcut show — keep the toggle honest
  useEffect(() => {
    const h = () => setDetached(false);
    ipcRenderer.on('detach-cleared', h);
    return () => ipcRenderer.removeListener('detach-cleared', h);
  }, []);

  // Potato: dim to 70%, restore the user's prior opacity on exit (#5)
  useEffect(() => {
    document.documentElement.classList.toggle('potato', potato);
    const { opacity: next, stash } = potatoTransition(potato, opacity, prePotatoOpacity.current);
    prePotatoOpacity.current = stash;
    ipcRenderer.send('win-opacity', next);
    setOpacity(next);
  }, [potato]);

  // Toolbar/titlebar buttons must not steal focus from <body>, otherwise the
  // mode keyboard shortcuts (which guard on activeElement === body) stop working
  // after any tool click. Preventing mousedown default blocks focus but still
  // fires click; keyboard Tab focus is unaffected.
  useEffect(() => {
    const h = e => { if (e.target instanceof Element && e.target.closest('button')) e.preventDefault(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const h = e => {
      if (sizeRef.current && !sizeRef.current.contains(e.target)) setShowSizes(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ? key → shortcuts
  useEffect(() => {
    const h = e => {
      if (e.key === '?' && document.activeElement === document.body) setShowKeys(s => !s);
      if (e.key === 'Escape') { setShowKeys(false); setShowSizes(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Handlers ─────────────────────────────────────────────

  const handleOpacity = useCallback(e => {
    const v = +e.target.value;
    setOpacity(v);
    localStorage.setItem('fp_opacity', String(v));
    prePotatoOpacity.current = v;
    ipcRenderer.send('win-opacity', v);
  }, []);

  const handleResize = useCallback((w, h) => {
    ipcRenderer.send('win-resize', w, h); setShowSizes(false);
  }, []);

  const toggleDetach = useCallback(() => {
    const next = !detached; setDetached(next); ipcRenderer.send('win-detach', next);
  }, [detached]);

  const toggleWinLock = useCallback(() => {
    const next = !winLocked; setWinLocked(next); ipcRenderer.invoke('win-lock', next);
  }, [winLocked]);

  const toggleWinBottom = useCallback(() => {
    const next = !winBottom; setWinBottom(next); ipcRenderer.invoke('win-always-bottom', next);
  }, [winBottom]);

  const toggleMini = useCallback(() => {
    ipcRenderer.send('win-mini-toggle');
  }, []);

  // Borderless (clean) view: hide the titlebar; reveal on hover, auto-hide.
  const toggleBorderless = useCallback(() => {
    setBorderless(b => {
      const next = !b;
      localStorage.setItem('fp_borderless', next ? '1' : '0');
      return next;
    });
  }, []);

  const revealChrome = useCallback(() => {
    if (chromeHideTimerRef.current) { clearTimeout(chromeHideTimerRef.current); chromeHideTimerRef.current = null; }
    setChromeVisible(true);
  }, []);

  const hideChromeSoon = useCallback((delay = 1600) => {
    if (chromeHideTimerRef.current) clearTimeout(chromeHideTimerRef.current);
    chromeHideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      chromeHideTimerRef.current = null;
    }, delay);
  }, []);

  // In borderless mode the chrome auto-hides unless a menu/overlay is open.
  useEffect(() => {
    if (!borderless || miniMode || showSizes || showMore || showKeys || showOnboarding) {
      revealChrome();
      return undefined;
    }
    hideChromeSoon(700);
    return () => { if (chromeHideTimerRef.current) clearTimeout(chromeHideTimerRef.current); };
  }, [borderless, miniMode, showSizes, showMore, showKeys, showOnboarding, revealChrome, hideChromeSoon]);

  const undockPanel = useCallback((panelId) => {
    ipcRenderer.send('panel-undock', panelId);
  }, []);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(SEEN_KEY, '1');
    setShowOnboarding(false);
  }, []);

  // Secondary controls — shown inline on wide windows, inside the ⋯ menu on narrow ones
  const themeBtn = (
    <button className="tb-btn" onClick={toggleTheme}
      title={theme==='dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme==='dark' ? <IconSun size={14}/> : <IconMoon size={14}/>}
    </button>
  );
  const potatoBtn = (
    <button className={`tb-btn${potato?' on':''}`}
      onClick={()=>setPotato(p=>!p)} title="Potato mode — low resource usage">
      <IconPotato size={14}/>
    </button>
  );
  const detachBtn = (
    <button className={`tb-btn${detached?' on':''}`}
      onClick={toggleDetach}
      title={detached?'Detached — click to restore':'Detach — click-through'}>
      <IconDetach size={14}/>
    </button>
  );
  const lockBtn = (
    <button className={`tb-btn${winLocked?' on':''}`}
      onClick={toggleWinLock}
      title={winLocked?'Unlock window position':'Lock window position'}>
      {winLocked?'🔒':'🔓'}
    </button>
  );
  const bottomBtn = (
    <button className={`tb-btn${winBottom?' on':''}`}
      onClick={toggleWinBottom}
      title={winBottom?'Restore always-on-top':'Always on bottom (wallpaper mode)'}>
      ⤓
    </button>
  );
  const borderlessBtn = (
    <button className={`tb-btn${borderless?' on':''}`}
      onClick={toggleBorderless}
      title={borderless?'Show titlebar':'Borderless view — hide titlebar (hover top edge to reveal)'}>
      <IconBorderless size={14}/>
    </button>
  );
  const helpBtn = (
    <button className="tb-btn" onClick={()=>setShowKeys(s=>!s)} title="Shortcuts (?)">
      <IconHelp size={14}/>
    </button>
  );

  // ── Render ────────────────────────────────────────────────

  // Standalone mode: just the single panel + slim titlebar
  if (isStandalone) {
    return (
      <div className={`app${potato?' potato':''}`} style={{height:'100vh'}}>
        <div className="standalone-titlebar" data-tauri-drag-region>
          <button
            className="tb-btn"
            onClick={() => ipcRenderer.send('panel-dock-back', panelParam)}
            title="Dock back into main window"
          >
            ⊞
          </button>
          <span className="standalone-title">{panelParam}</span>
          <button className="tb-btn" onClick={toggleTheme} title="Toggle theme">
            {theme==='dark' ? <IconSun size={14}/> : <IconMoon size={14}/>}
          </button>
          <input type="range" className="tb-opacity" min="15" max="100"
            value={opacity} onChange={handleOpacity} title={`Opacity ${opacity}%`}/>
          <button className="tb-close" onClick={()=>getCurrentWindow().close()} title="Close this panel">
            <IconClose size={9}/>
          </button>
        </div>
        <div style={{flex:1,overflow:'hidden',minHeight:0,display:'flex',flexDirection:'column'}}>
          {panelParam==='board' && <ImageBoard active={true}/>}
          {panelParam==='video' && <VideoPlayer active={true} potato={potato}/>}
          {panelParam==='web'   && <Browser active={true}/>}
          {panelParam==='write' && <Write active={true}/>}
        </div>
      </div>
    );
  }

  // Main window
  return (
    <div
      className={`app${potato?' potato':''}${miniMode?' mini':''}${borderless?' borderless':''}${chromeVisible?' chrome-visible':''}`}
      onMouseLeave={() => { if (borderless) hideChromeSoon(900); }}
    >
      {/* Always-visible grab handle (drag to move), even in borderless view */}
      <div className="grab-handle-wrap" title="Drag to move window">
        <div className="grab-handle" data-tauri-drag-region="deep">
          <span className="grab-handle-texture" aria-hidden="true"/>
        </div>
      </div>

      {borderless && (
        <div className="chrome-hotspot" onMouseEnter={revealChrome} onMouseLeave={() => hideChromeSoon(1600)}/>
      )}

      <header
        className="titlebar"
        data-tauri-drag-region
        onMouseEnter={revealChrome}
        onMouseLeave={() => { if (borderless) hideChromeSoon(1600); }}
      >

        {/* Mode tabs */}
        <nav className="mode-nav">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`mode-tab${mode===id?' active':''}${Icon?'':' no-icon'}`}
              onClick={() => setMode(id)}
              title={label}
            >
              {Icon && <Icon size={13}/>}
              <span className="mode-tab-label">{label}</span>
              <span
                className="mode-tab-undock"
                onClick={e => { e.stopPropagation(); undockPanel(id); }}
                title={`Open ${label} in its own window`}
              >
                <IconUndock size={11}/>
              </span>
            </button>
          ))}
        </nav>

        {/* Guaranteed grab strip — never collapses below 44px */}
        <div className="tb-spacer" data-tauri-drag-region title="Drag to move"/>

        <div className="tb-right">
          <div className="tb-secondary">
            {themeBtn}
            {potatoBtn}
            {detachBtn}
            {lockBtn}
            {bottomBtn}
            {borderlessBtn}

            {/* Size */}
            <div className="tb-menu-wrap" ref={sizeRef}>
              <button className="tb-btn" onClick={()=>setShowSizes(s=>!s)} title="Window size">
                <IconSize size={14}/>
              </button>
              {showSizes && (
                <div className="tb-menu">
                  {SIZE_PRESETS.map(p=>(
                    <button key={p.label} className="tb-menu-item" onClick={()=>handleResize(p.w,p.h)}>
                      <span className="tb-menu-label">{p.label}</span>
                      <span className="tb-menu-sub">{p.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {helpBtn}
          </div>

          {/* Opacity */}
          <input type="range" className="tb-opacity" min="15" max="100"
            value={opacity} onChange={handleOpacity} title={`Opacity: ${opacity}%`}/>

          {/* Mini */}
          <button className="tb-btn tb-mini" onClick={toggleMini}
            title={miniMode?'Expand':'Collapse to mini'}>
            {miniMode ? <IconExpand size={14}/> : <IconMini size={14}/>}
          </button>

          {/* Overflow menu — secondary controls stay reachable at narrow widths */}
          <div className="tb-menu-wrap tb-more-wrap" ref={moreRef}>
            <button className="tb-btn tb-more" onClick={()=>setShowMore(s=>!s)} title="More controls">
              ⋯
            </button>
            {showMore && (
              <div className="tb-menu tb-more-menu">
                {themeBtn}
                {potatoBtn}
                {detachBtn}
                {lockBtn}
                {bottomBtn}
                {borderlessBtn}
                {helpBtn}
                <div className="tb-more-sep"/>
                {SIZE_PRESETS.map(p=>(
                  <button key={p.label} className="tb-menu-item" onClick={()=>{handleResize(p.w,p.h); setShowMore(false);}}>
                    <span className="tb-menu-label">{p.label}</span>
                    <span className="tb-menu-sub">{p.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close → hides, tray keeps alive */}
          <button className="tb-close" onClick={()=>ipcRenderer.send('win-close')}
            title="Hide  ·  ⌘⇧Space to restore">
            <IconClose size={9}/>
          </button>
        </div>
      </header>

      <main className="panels">
        {/* All panels always mounted once visited — preserves state */}
        <div className={`panel${mode==='board'?' active':''}`}>
          {visited.has('board') && <ImageBoard active={mode==='board'}/>}
        </div>
        <div className={`panel${mode==='video'?' active':''}`}>
          {visited.has('video') && <VideoPlayer active={mode==='video'} potato={potato}/>}
        </div>
        <div className={`panel${mode==='web'?' active':''}`}>
          {/* Browser only mounts on first visit — webview process is expensive */}
          {visited.has('web') && <Browser active={mode==='web'}/>}
        </div>
        <div className={`panel${mode==='write'?' active':''}`}>
          {visited.has('write') && <Write active={mode==='write'}/>}
        </div>
      </main>

      {detached && (
        <div className="detach-hint">
          Click-through on · tray → Show FloatPad (or ⌘⇧Space) restores control
        </div>
      )}

      {showKeys       && <ShortcutsOverlay onClose={()=>setShowKeys(false)}/>}
      {showOnboarding && <Onboarding onDone={dismissOnboarding}/>}
    </div>
  );
}
