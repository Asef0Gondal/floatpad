import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconSave, IconFolder, IconWrite } from '../components/Icons';

const { ipcRenderer } = window.require('electron');

const AUTOSAVE_KEY  = 'fp_write_content';
const MODE_KEY      = 'fp_write_mode';
const AUTOSAVE_MS   = 30_000;

// Screenplay element types cycled by Tab
const SP_TYPES = [
  { id:'scene',    label:'SCENE',    style:{ textTransform:'uppercase', fontWeight:'bold', marginTop:'2em' } },
  { id:'action',   label:'Action',   style:{ marginTop:'1em' } },
  { id:'character',label:'CHARACTER',style:{ textTransform:'uppercase', marginLeft:'3em', marginTop:'1em', fontWeight:'bold' } },
  { id:'dialogue', label:'Dialogue', style:{ marginLeft:'2em', marginRight:'2em', marginTop:'.3em' } },
  { id:'paren',    label:'(paren)',  style:{ marginLeft:'2.5em', color:'#888', marginTop:'.2em' } },
];

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function countScenes(text) {
  return (text.match(/^(INT\.|EXT\.|INT\/EXT\.)/gm) || []).length;
}
function estimatePages(text) {
  // Screenplay: ~55 lines per page
  const lines = text.split('\n').length;
  return Math.max(1, Math.round(lines / 55 * 10) / 10);
}

export default function Write({ active }) {
  const editorRef   = useRef(null);
  const timerRef    = useRef(null);
  const autosaveRef = useRef(null);

  const [writeMode,  setWriteMode]  = useState(() => localStorage.getItem(MODE_KEY) || 'script');
  const [content,    setContent]    = useState(() => localStorage.getItem(AUTOSAVE_KEY) || '');
  const [wordCount,  setWordCount]  = useState(0);
  const [sceneCount, setSceneCount] = useState(0);
  const [pages,      setPages]      = useState(1);
  const [spType,     setSpType]     = useState(0);  // index into SP_TYPES
  const [timerSecs,  setTimerSecs]  = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLabel,   setTimerLabel]   = useState('25:00');

  // ── Stats ─────────────────────────────────────────────────
  const updateStats = useCallback((text) => {
    setWordCount(countWords(text));
    setSceneCount(countScenes(text));
    setPages(estimatePages(text));
  }, []);

  useEffect(() => { updateStats(content); }, [content, updateStats]);

  // ── Autosave ──────────────────────────────────────────────
  useEffect(() => {
    autosaveRef.current = setInterval(() => {
      localStorage.setItem(AUTOSAVE_KEY, content);
    }, AUTOSAVE_MS);
    return () => clearInterval(autosaveRef.current);
  }, [content]);

  // ── Mode persist ──────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(MODE_KEY, writeMode);
  }, [writeMode]);

  // ── Focus editor on active ────────────────────────────────
  useEffect(() => {
    if (active) {
      setTimeout(() => editorRef.current?.focus(), 50);
    }
  }, [active]);

  // ── Keyboard handling ─────────────────────────────────────
  const onKeyDown = useCallback((e) => {
    if (writeMode !== 'script') return;

    // Tab → cycle screenplay element type
    if (e.key === 'Tab') {
      e.preventDefault();
      setSpType(t => (t + 1) % SP_TYPES.length);
      return;
    }

    // Enter after scene heading → auto uppercase + move to action
    if (e.key === 'Enter' && spType === 0) {
      e.preventDefault();
      const ta = editorRef.current;
      const pos = ta.selectionStart;
      const before = content.slice(0, pos);
      const after  = content.slice(pos);
      // Uppercase the current line
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart).toUpperCase();
      const newContent = content.slice(0, lineStart) + currentLine + '\n\n' + after;
      setContent(newContent);
      setSpType(1); // move to Action
      setTimeout(() => {
        const newPos = lineStart + currentLine.length + 2;
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    }
  }, [writeMode, spType, content]);

  const onInput = useCallback((e) => {
    setContent(e.target.value);
  }, []);

  // ── Export ────────────────────────────────────────────────
  const saveFile = useCallback(async () => {
    const r = await ipcRenderer.invoke('dialog-write-save');
    if (!r) return;
    await ipcRenderer.invoke('file-write', r.path, content);
  }, [content]);

  const loadFile = useCallback(async () => {
    const filePath = await ipcRenderer.invoke('dialog-write-open');
    if (!filePath) return;
    const text = await ipcRenderer.invoke('file-read-text', filePath);
    if (text) { setContent(text); updateStats(text); }
  }, [updateStats]);

  // ── Focus timer ───────────────────────────────────────────
  const toggleTimer = useCallback(() => {
    if (timerRunning) {
      clearInterval(timerRef.current);
      setTimerRunning(false);
      setTimerSecs(25 * 60);
      setTimerLabel('25:00');
    } else {
      setTimerRunning(true);
      timerRef.current = setInterval(() => {
        setTimerSecs(s => {
          const next = s - 1;
          const m    = Math.floor(next / 60);
          const sec  = next % 60;
          setTimerLabel(`${m}:${sec.toString().padStart(2,'0')}`);
          if (next <= 0) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            setTimerSecs(25 * 60);
            setTimerLabel('Done!');
          }
          return next;
        });
      }, 1000);
    }
  }, [timerRunning]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const currentSpType = SP_TYPES[spType];
  const placeholder = writeMode === 'script'
    ? `Tab to switch: ${SP_TYPES.map(t=>t.label).join(' → ')}\nStart typing your ${currentSpType.label}…`
    : 'Start writing…';

  return (
    <div className="write-wrap">

      {/* Toolbar */}
      <div className="write-toolbar mode-toolbar">
        {/* Mode switch */}
        <div className="write-mode-pill">
          <button
            className={`write-mode-btn${writeMode==='script'?' active':''}`}
            onClick={()=>setWriteMode('script')}
            title="Screenplay / script format"
          >
            Script
          </button>
          <button
            className={`write-mode-btn${writeMode==='md'?' active':''}`}
            onClick={()=>setWriteMode('md')}
            title="Markdown / freeform"
          >
            Markdown
          </button>
        </div>

        {writeMode==='script' && (
          <div className="tb-tool-sep"/>
        )}

        {/* Script element indicator */}
        {writeMode==='script' && (
          <div style={{
            fontSize:10, fontWeight:700, color:'var(--fp-accent-text)',
            background:'var(--fp-accent-dim)', borderRadius:5,
            padding:'2px 8px', letterSpacing:'.05em', textTransform:'uppercase',
            flexShrink:0,
          }}>
            Tab → {currentSpType.label}
          </div>
        )}

        <div className="tb-tool-sep"/>

        <button className="tb-tool" onClick={saveFile} title="Save file">
          <IconSave size={13}/>
          Save
        </button>

        <button className="tb-tool" onClick={loadFile} title="Open file">
          <IconFolder size={13}/>
          Open
        </button>

        <div className="tb-tool-spacer"/>
        <span className="tb-tool-info">
          {wordCount.toLocaleString()} words · {writeMode==='script' ? `${pages} pages · ${sceneCount} scenes` : `${content.length.toLocaleString()} chars`}
        </span>
      </div>

      {/* Editor */}
      <div className="write-body">
        <textarea
          ref={editorRef}
          className={`write-editor${writeMode==='script'?' screenplay':''}`}
          value={content}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={writeMode==='md'}
          style={writeMode==='script' ? { ...currentSpType.style } : {}}
        />
      </div>

      {/* Status bar */}
      <div className="write-statusbar">
        <div className="write-stat">{wordCount.toLocaleString()} words</div>
        <div className="write-stat-sep"/>
        {writeMode==='script' && <>
          <div className="write-stat">{pages}p</div>
          <div className="write-stat-sep"/>
          <div className="write-stat">{sceneCount} scenes</div>
          <div className="write-stat-sep"/>
        </>}
        <div className="write-stat">{content.length.toLocaleString()} chars</div>
        <div className="write-stat-sep"/>
        <div className="write-stat" style={{color:'var(--fp-text-faint)',fontSize:9}}>
          autosaved
        </div>

        {/* Focus timer */}
        <div className="write-timer">
          <span className="write-timer-display">{timerLabel}</span>
          <button
            className={`write-timer-btn${timerRunning?' running':''}`}
            onClick={toggleTimer}
            title={timerRunning?'Stop focus timer':'Start 25-min focus timer'}
          >
            {timerRunning ? '■ Stop' : '▶ Focus'}
          </button>
        </div>
      </div>
    </div>
  );
}
