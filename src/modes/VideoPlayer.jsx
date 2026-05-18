import React, { useRef, useState, useEffect, useCallback } from 'react';
import { formatTime } from '../utils/helpers';

export default function VideoPlayer() {
  const vidRef = useRef(null);

  const [loaded,   setLoaded]   = useState(false);
  const [playing,  setPlaying]  = useState(false);
  const [muted,    setMuted]    = useState(false);
  const [time,     setTime]     = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume,   setVolume]   = useState(0.8);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  // ── Load a video src ──────────────────────────────────────
  const loadSrc = useCallback((src) => {
    const v = vidRef.current;
    if (!v) return;
    v.src     = src;
    v.volume  = volume;
    v.muted   = false;
    setMuted(false);
    setLoaded(true);
    v.play().catch(() => {});
  }, [volume]);

  // ── Eject ────────────────────────────────────────────────
  const eject = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    v.pause();
    v.src = '';
    setLoaded(false);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setUrlInput('');
  }, []);

  // ── Video element events ──────────────────────────────────
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;

    const onPlay  = ()  => setPlaying(true);
    const onPause = ()  => setPlaying(false);
    const onEnded = ()  => setPlaying(false);
    const onMeta  = ()  => setDuration(v.duration);
    const onTime  = ()  => setTime(v.currentTime);

    v.addEventListener('play',             onPlay);
    v.addEventListener('pause',            onPause);
    v.addEventListener('ended',            onEnded);
    v.addEventListener('loadedmetadata',   onMeta);
    v.addEventListener('timeupdate',       onTime);

    return () => {
      v.removeEventListener('play',           onPlay);
      v.removeEventListener('pause',          onPause);
      v.removeEventListener('ended',          onEnded);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate',     onTime);
    };
  }, []);

  // ── Keyboard shortcuts (only when video is loaded) ────────
  useEffect(() => {
    const onKey = (e) => {
      // Don't steal from URL inputs
      if (document.activeElement?.tagName === 'INPUT') return;
      if (!loaded) return;

      const v = vidRef.current;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.05);
          setVolume(v.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.05);
          setVolume(v.volume);
          break;
        case 'KeyM':
          v.muted = !v.muted;
          setMuted(v.muted);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded]);

  // ── Drop events ───────────────────────────────────────────
  const onDragEnter = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };
  const onDragOver  = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith('video/'));
    if (file) loadSrc(URL.createObjectURL(file));
  };

  // ── Controls ──────────────────────────────────────────────
  const togglePlay = () => {
    const v = vidRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const toggleMute = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleSeek = (e) => {
    const v = vidRef.current;
    if (!v || !duration) return;
    v.currentTime = (e.target.value / 100) * duration;
    setTime(v.currentTime);
  };

  const handleVolume = (e) => {
    const v = vidRef.current;
    if (!v) return;
    const vol = e.target.value / 100;
    v.volume  = vol;
    v.muted   = false;
    setVolume(vol);
    setMuted(false);
  };

  const goUrl = () => {
    const u = urlInput.trim();
    if (u) loadSrc(u);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      className="video-panel"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drop / URL zone — hidden when video is loaded */}
      <div className={`video-drop${loaded ? ' gone' : ''}${dragOver ? ' dragover' : ''}`}>
        <div className="video-drop-icon">▶</div>
        <div className="video-drop-text">Drop a video file</div>
        <div className="video-url-row">
          <input
            className="video-url-input"
            type="text"
            placeholder="or paste a .mp4 / .webm URL"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && goUrl()}
          />
          <button className="video-url-go" onClick={goUrl}>↵</button>
        </div>
      </div>

      {/* Video viewer — shown when video is loaded */}
      <div className={`video-viewer${loaded ? ' on' : ''}`}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={vidRef} className="video-el" preload="metadata" />

        <div className="video-controls">
          {/* Play / Pause */}
          <button className="vc-btn" onClick={togglePlay} title="Play/Pause (Space)">
            {playing ? '⏸' : '▶'}
          </button>

          {/* Time */}
          <span className="vc-time">
            {formatTime(time)} / {formatTime(duration)}
          </span>

          {/* Seek */}
          <input
            type="range"
            className="vc-seek"
            min="0" max="100" step="0.05"
            value={duration ? (time / duration) * 100 : 0}
            onMouseDown={() => vidRef.current?.pause()}
            onChange={handleSeek}
          />

          {/* Mute */}
          <button className="vc-btn" onClick={toggleMute} title="Mute (M)">
            {muted ? '🔇' : '🔊'}
          </button>

          {/* Volume */}
          <input
            type="range"
            className="vc-vol"
            min="0" max="100"
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={handleVolume}
          />

          {/* Eject */}
          <button className="vc-btn" onClick={eject} title="Eject">⏏</button>
        </div>
      </div>
    </div>
  );
}
