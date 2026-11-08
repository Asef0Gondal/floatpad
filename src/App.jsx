import React, { useState, useCallback, useEffect, useRef } from 'react';
import ImageBoard  from './modes/ImageBoard';
import VideoPlayer from './modes/VideoPlayer';
import Browser     from './modes/Browser';
import Write       from './modes/Write';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import Onboarding       from './components/Onboarding';
import {
  IconImage, IconPlay, IconWrite, IconSize, IconSun, IconMoon,
  IconHelp, IconClose, IconMini, IconExpand, IconPotato, IconDetach, IconUndock,
} from './components/Icons';
import { applyTheme, getInitialTheme, THEME_KEY } from './theme';

const { ipcRenderer } = window.require('electron');

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

// Determine if we're in a standalone panel window
const urlParams   = new URLSearchParams(window.location.search);
const panelParam  = urlParams.get('panel'); // 'board' | 'video' | 'web' | 'write' | null

export default function App() {
  const [mode,       setMode]       = useState(panelParam || 'board');
  const [theme,      setTheme]      = useState(getInitialTheme);
  const [opacity,    setOpacity]    = useState(100);
  const [potato,     setPotato]     = useState(false);
  const [miniMode,   setMiniMode]   = useState(false);
  const [detached,   setDetached]   = useState(false);
  const [showSizes,  setShowSizes]  = useState(false);
  const [showKeys,   setShowKeys]   = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !panelParam && !localStorage.getItem(SEEN_KEY)
  );
  // Track which panels have ever been visited (for lazy mounting)
  const [visited, setVisited] = useState(() => new Set([panelParam || 'board']));

  const sizeRef = useRef(null);
  const isStandalone = !!panelParam;

  // ── Side effects ─────────────────────────────────────────

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

  // Potato
  useEffect(() => {
    document.documentElement.classList.toggle('potato', potato);
    ipcRenderer.send('win-opacity', potato ? 70 : opacity);
    if (potato) setOpacity(70);
  }, [potato]);

  // Close menus on outside click
  useEffect(() => {
    const h = e => {
      if (sizeRef.current && !sizeRef.current.contains(e.target)) setShowSizes(false);
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
    const v = +e.target.value; setOpacity(v); ipcRenderer.send('win-opacity', v);
  }, []);

  const handleResize = useCallback((w, h) => {
    ipcRenderer.send('win-resize', w, h); setShowSizes(false);
  }, []);

  const toggleDetach = useCallback(() => {
    const next = !detached; setDetached(next); ipcRenderer.send('win-detach', next);
  }, [detached]);

  const toggleMini = useCallback(() => {
    ipcRenderer.send('win-mini-toggle');
  }, []);

  const undockPanel = useCallback((panelId) => {
    ipcRenderer.send('panel-undock', panelId);
  }, []);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(SEEN_KEY, '1');
    setShowOnboarding(false);
  }, []);

  // ── Render ────────────────────────────────────────────────

  // Standalone mode: just the single panel + slim titlebar
  if (isStandalone) {
    return (
      <div className={`app${potato?' potato':''}`} style={{height:'100vh'}}>
        <div className="standalone-titlebar">
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
          <button className="tb-close" onClick={()=>ipcRenderer.send('win-close')}>
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
    <div className={`app${potato?' potato':''}${miniMode?' mini':''}`}>

      <header className="titlebar">

        {/* Mode tabs */}
        <nav className="mode-nav">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`mode-tab${mode===id?' active':''}`}
              onClick={() => setMode(id)}
              title={label}
            >
              {Icon && <Icon size={13}/>}
              {label}
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

        <div className="tb-spacer"/>

        <div className="tb-right">
          {/* Theme */}
          <button className="tb-btn" onClick={toggleTheme}
            title={theme==='dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme==='dark' ? <IconSun size={14}/> : <IconMoon size={14}/>}
          </button>

          {/* Potato */}
          <button className={`tb-btn${potato?' on':''}`}
            onClick={()=>setPotato(p=>!p)} title="Potato mode — low resource usage">
            <IconPotato size={14}/>
          </button>

          {/* Detach */}
          <button className={`tb-btn${detached?' on':''}`}
            onClick={toggleDetach}
            title={detached?'Detached — click to restore':'Detach — click-through'}>
            <IconDetach size={14}/>
          </button>

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

          {/* Opacity */}
          <input type="range" className="tb-opacity" min="15" max="100"
            value={opacity} onChange={handleOpacity} title={`Opacity: ${opacity}%`}/>

          {/* Mini */}
          <button className="tb-btn" onClick={toggleMini}
            title={miniMode?'Expand':'Collapse to mini'}>
            {miniMode ? <IconExpand size={14}/> : <IconMini size={14}/>}
          </button>

          {/* Help */}
          <button className="tb-btn" onClick={()=>setShowKeys(s=>!s)} title="Shortcuts (?)">
            <IconHelp size={14}/>
          </button>

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

      {showKeys       && <ShortcutsOverlay onClose={()=>setShowKeys(false)}/>}
      {showOnboarding && <Onboarding onDone={dismissOnboarding}/>}
    </div>
  );
}
