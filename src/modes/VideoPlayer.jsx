import React, { useRef, useState, useEffect, useCallback } from 'react';
import { formatTime, filePathToUrl } from '../utils/helpers';

const { ipcRenderer } = window.require('electron');

export default function VideoPlayer({ active, potato }) {
  const vidRef   = useRef(null);
  const seekRef  = useRef(null);
  const abRef    = useRef({ a: null, b: null });
  const rafRef   = useRef(null);

  const [loaded,    setLoaded]    = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [muted,     setMuted]     = useState(false);
  const [time,      setTime]      = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [volume,    setVolume]    = useState(() => parseFloat(localStorage.getItem('fp_vol') || '0.85'));
  const [speed,     setSpeed]     = useState(() => parseFloat(localStorage.getItem('fp_speed') || '1'));
  const [dragOver,  setDragOver]  = useState(false);
  const [urlInput,  setUrlInput]  = useState('');
  const [abA,       setAbA]       = useState(null);
  const [abB,       setAbB]       = useState(null);

  // Seek hover tooltip
  const [hoverTime, setHoverTime]     = useState(null);
  const [hoverPct,  setHoverPct]      = useState(0);

  // ── rAF ticker ───────────────────────────────────────────
  const tick = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (seekRef.current && v.duration) {
      seekRef.current.value = (v.currentTime / v.duration) * 1000;
    }
    const { a, b } = abRef.current;
    if (a !== null && b !== null && v.currentTime >= b) v.currentTime = a;
    if (!v.paused) rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startTick = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (!potato) rafRef.current = requestAnimationFrame(tick);
  }, [tick, potato]);

  // ── Load ─────────────────────────────────────────────────
  const loadSrc = useCallback((src) => {
    const v = vidRef.current;
    if (!v) return;
    v.src = src; v.volume = volume; v.playbackRate = speed;
    setLoaded(true); setTime(0);
    setAbA(null); setAbB(null); abRef.current = { a: null, b: null };
    v.play().catch(() => {});
  }, [volume, speed]);

  const eject = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const v = vidRef.current;
    if (!v) return;
    v.pause(); v.src = '';
    setLoaded(false); setPlaying(false); setTime(0); setDuration(0);
    setAbA(null); setAbB(null); setUrlInput('');
    abRef.current = { a: null, b: null };
  }, []);

  const openDialog = useCallback(async () => {
    const p = await ipcRenderer.invoke('dialog-open-video');
    if (p) loadSrc(filePathToUrl(p));
  }, [loadSrc]);

  // ── Video events ──────────────────────────────────────────
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const onPlay  = () => { setPlaying(true);  startTick(); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(rafRef.current); };
    const onEnded = () => { setPlaying(false); cancelAnimationFrame(rafRef.current); };
    const onMeta  = () => setDuration(v.duration);
    const onErr   = () => { if (loaded) alert('Cannot play this file.'); };
    v.addEventListener('play',           onPlay);
    v.addEventListener('pause',          onPause);
    v.addEventListener('ended',          onEnded);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error',          onErr);
    return () => {
      v.removeEventListener('play',           onPlay);
      v.removeEventListener('pause',          onPause);
      v.removeEventListener('ended',          onEnded);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('error',          onErr);
    };
  }, [loaded, startTick]);

  // Pause when tab is hidden
  useEffect(() => { if (!active && playing) vidRef.current?.pause(); }, [active, playing]);

  // ── Keyboard ─────────────────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (!active || !loaded) return;
      if (document.activeElement?.tagName === 'INPUT') return;
      const v = vidRef.current;
      switch (e.code) {
        case 'Space':      e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case 'ArrowLeft':  e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5); break;
        case 'ArrowRight': e.preventDefault(); v.currentTime = Math.min(v.duration, v.currentTime + 5); break;
        case 'ArrowUp':    e.preventDefault(); v.volume = Math.min(1, v.volume + 0.05); setVolume(v.volume); break;
        case 'ArrowDown':  e.preventDefault(); v.volume = Math.max(0, v.volume - 0.05); setVolume(v.volume); break;
        case 'KeyM':       v.muted = !v.muted; setMuted(v.muted); break;
        case 'Comma':      e.preventDefault(); v.pause(); v.currentTime = Math.max(0, v.currentTime - 1/30); break;
        case 'Period':     e.preventDefault(); v.pause(); v.currentTime = Math.min(v.duration, v.currentTime + 1/30); break;
        default: break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, loaded]);

  // ── Controls ──────────────────────────────────────────────
  const togglePlay  = () => { const v = vidRef.current; v.paused ? v.play() : v.pause(); };
  const toggleMute  = () => { const v = vidRef.current; v.muted = !v.muted; setMuted(v.muted); };

  const handleSeek  = e => {
    const v = vidRef.current;
    if (!v || !duration) return;
    v.currentTime = (e.target.value / 1000) * duration;
  };

  const handleVolume = e => {
    const v = vidRef.current; const vol = e.target.value / 100;
    v.volume = vol; v.muted = false; setVolume(vol); setMuted(false); localStorage.setItem('fp_vol', vol);
  };

  const handleSpeed  = e => {
    const s = parseFloat(e.target.value); setSpeed(s); localStorage.setItem('fp_speed', s);
    if (vidRef.current) vidRef.current.playbackRate = s;
  };

  // Seek hover → tooltip
  const onSeekMouseMove = e => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPct(pct * 100);
    setHoverTime(pct * duration);
  };

  const setAbPoint = point => {
    const v = vidRef.current; if (!v) return;
    const t = v.currentTime;
    if (point === 'a') {
      abRef.current.a = t; setAbA(t);
      if (abRef.current.b !== null && t >= abRef.current.b) { abRef.current.b = null; setAbB(null); }
    } else {
      if (abRef.current.a !== null && t > abRef.current.a) { abRef.current.b = t; setAbB(t); }
    }
  };
  const clearAb = () => { abRef.current = { a: null, b: null }; setAbA(null); setAbB(null); };

  // ── Grab frame → Board ────────────────────────────────────
  const grabFrame = useCallback(() => {
    const v = vidRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const ch = new BroadcastChannel('floatpad');
    ch.postMessage({ type: 'grab-frame', dataUrl: c.toDataURL('image/png') });
    ch.close();
  }, []);

  // ── PiP (Picture-in-Picture) ──────────────────────────────
  const togglePip = useCallback(async () => {
    const v = vidRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch (e) { console.warn('PiP not supported:', e.message); }
  }, []);

  const goUrl = () => { const u = urlInput.trim(); if (u) loadSrc(u); };

  const onDragEnter = e => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); };
  const onDragOver  = e => e.preventDefault();
  const onDrop = e => {
    e.preventDefault(); setDragOver(false);
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('video/'));
    if (f) loadSrc(URL.createObjectURL(f));
  };

  return (
    <div className="video-wrap" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>

      {/* ── Drop zone ── */}
      <div className={`video-dropzone${loaded?' gone':''}`}>
        <div className={`vdz-box${dragOver?' dragover':''}`}>
          <div className="vdz-icon">▶</div>
          <div className="vdz-label">Drop a video file</div>
          <div className="vdz-sub">mp4 · mov · mkv · webm · avi · m4v</div>
          <div className="vdz-buttons">
            <button className="vdz-btn vdz-btn--primary" onClick={openDialog}>Browse files</button>
          </div>
        </div>
        <div className="vdz-url-row">
          <input className="vdz-url-input" type="text"
            placeholder="or paste a direct video URL"
            value={urlInput} onChange={e=>setUrlInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&goUrl()}
          />
          <button className="vdz-url-go" onClick={goUrl}>↵</button>
        </div>
      </div>

      {/* ── Viewer ── */}
      <div className={`video-viewer${loaded?' active':''}`}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={vidRef} className="video-el" preload="metadata" />

        <div className="video-controls">

          {/* ── Seek row ── */}
          <div className="vc-progress-row">
            <span className="vc-time">{formatTime(time)}</span>

            <div className="vc-seek-wrap"
              onMouseMove={onSeekMouseMove}
              onMouseLeave={() => setHoverTime(null)}
            >
              <input type="range" className="vc-seek"
                ref={seekRef} min="0" max="1000" defaultValue="0"
                onMouseDown={() => { cancelAnimationFrame(rafRef.current); vidRef.current?.pause(); }}
                onMouseUp={handleSeek} onChange={handleSeek}
              />
              {/* A-B markers on seek bar */}
              {abA !== null && duration > 0 && (
                <div className="vc-ab-marker vc-ab-marker--a" style={{left: `${(abA/duration)*100}%`}} />
              )}
              {abB !== null && duration > 0 && (
                <div className="vc-ab-marker vc-ab-marker--b" style={{left: `${(abB/duration)*100}%`}} />
              )}
              {/* Hover tooltip */}
              {hoverTime !== null && (
                <div className="vc-seek-tooltip" style={{left: `${hoverPct}%`}}>
                  {formatTime(hoverTime)}
                </div>
              )}
            </div>

            <span className="vc-time">{formatTime(duration)}</span>

            <div className="vc-ab">
              <button className={`vc-ab-btn${abA!==null?' set':''}`} onClick={()=>setAbPoint('a')} title="Set loop start">A</button>
              <button className={`vc-ab-btn${abB!==null?' set':''}`} onClick={()=>setAbPoint('b')} title="Set loop end">B</button>
              {(abA!==null||abB!==null) && <button className="vc-ab-btn" onClick={clearAb} title="Clear loop">✕</button>}
            </div>
          </div>

          {/* ── Buttons row ── */}
          <div className="vc-buttons-row">
            {/* Playback */}
            <button className="vc-btn" onClick={()=>{const v=vidRef.current;v.currentTime=Math.max(0,v.currentTime-5);}} title="Back 5s  ←">⏮</button>
            <button className="vc-btn vc-btn--play" onClick={togglePlay} title="Play/Pause  Space">{playing?'⏸':'▶'}</button>
            <button className="vc-btn" onClick={()=>{const v=vidRef.current;v.currentTime=Math.min(v.duration,v.currentTime+5);}} title="Forward 5s  →">⏭</button>

            <div className="vc-sep"/>

            {/* Frame step */}
            <button className="vc-btn vc-btn--sm" onClick={()=>{const v=vidRef.current;v.pause();v.currentTime=Math.max(0,v.currentTime-1/30);}} title="Prev frame  ,">‹</button>
            <button className="vc-btn vc-btn--sm" onClick={()=>{const v=vidRef.current;v.pause();v.currentTime=Math.min(v.duration,v.currentTime+1/30);}} title="Next frame  .">›</button>

            <div className="vc-sep"/>

            {/* Volume */}
            <button className="vc-btn" onClick={toggleMute} title="Mute  M">{muted?'🔇':'🔊'}</button>
            <input type="range" className="vc-vol" min="0" max="100"
              value={muted?0:Math.round(volume*100)} onChange={handleVolume} title="Volume  ↑↓"
            />

            <div className="vc-spacer"/>

            {/* Speed */}
            <select className="vc-speed" value={speed} onChange={handleSpeed} title="Playback speed">
              {[0.25,0.5,0.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}×</option>)}
            </select>

            <div className="vc-sep"/>

            {/* Grab frame */}
            <button className="vc-btn" onClick={grabFrame} title="Grab frame → Board">⊡</button>

            {/* PiP */}
            <button className="vc-btn" onClick={togglePip} title="Picture-in-Picture">⧉</button>

            <div className="vc-sep"/>
            <button className="vc-btn" onClick={eject} title="Eject">⏏</button>
          </div>
        </div>
      </div>
    </div>
  );
}
