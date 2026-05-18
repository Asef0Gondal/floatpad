import React, { useState, useCallback } from 'react';
import ImageBoard  from './modes/ImageBoard';
import VideoPlayer from './modes/VideoPlayer';
import Browser     from './modes/Browser';

const { ipcRenderer } = window.require('electron');

const MODES = [
  { id: 'board', label: 'Board' },
  { id: 'video', label: 'Video' },
  { id: 'web',   label: 'Web'   },
];

const SIZE_PRESETS = [
  { label: 'S', w: 480,  h: 380 },
  { label: 'M', w: 680,  h: 540 },
  { label: 'L', w: 900,  h: 680 },
  { label: 'W', w: 1100, h: 620 },
];

export default function App() {
  const [mode,    setMode]    = useState('board');
  const [opacity, setOpacity] = useState(100);
  const [showSizes, setShowSizes] = useState(false);

  const handleOpacity = useCallback((e) => {
    const v = Number(e.target.value);
    setOpacity(v);
    ipcRenderer.send('win-opacity', v);
  }, []);

  const handleResize = useCallback((w, h) => {
    ipcRenderer.send('win-resize', w, h);
    setShowSizes(false);
  }, []);

  return (
    <div className="app">

      {/* ── TITLEBAR ─────────────────────────────────────── */}
      <header className="titlebar">
        <nav className="mode-nav">
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              className={`mode-tab${mode === id ? ' active' : ''}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="tb-spacer" />

        <div className="tb-right">
          {/* Window size presets */}
          <div className="size-wrap">
            <button
              className="tb-icon-btn"
              title="Window size"
              onClick={() => setShowSizes(s => !s)}
            >
              ⊡
            </button>
            {showSizes && (
              <div className="size-menu">
                {SIZE_PRESETS.map(p => (
                  <button key={p.label} onClick={() => handleResize(p.w, p.h)}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Opacity */}
          <input
            type="range"
            className="opacity-slider"
            min="15"
            max="100"
            value={opacity}
            onChange={handleOpacity}
            title={`Opacity: ${opacity}%`}
          />

          {/* Close */}
          <button
            className="tb-close"
            onClick={() => ipcRenderer.send('win-close')}
            title="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── PANELS ───────────────────────────────────────── */}
      {/*
        All three panels are always mounted so state is preserved
        when switching modes (video keeps playing, board keeps images).
        Inactive panels are hidden with display:none via CSS.
      */}
      <main className="panels">
        <div className={`panel${mode === 'board' ? ' active' : ''}`}>
          <ImageBoard />
        </div>
        <div className={`panel${mode === 'video' ? ' active' : ''}`}>
          <VideoPlayer />
        </div>
        <div className={`panel${mode === 'web' ? ' active' : ''}`}>
          <Browser />
        </div>
      </main>

    </div>
  );
}
