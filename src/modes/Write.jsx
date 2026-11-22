import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { IconSave, IconFolder, IconWrite } from '../components/Icons';
import ScrollToolbar from '../components/ScrollToolbar';

import { ipcRenderer } from '../ipc';
import { toggleTaskAtIndex } from '../utils/helpers';

marked.setOptions({ gfm: true, breaks: true });

const AUTOSAVE_KEY  = 'fp_write_content';
const MODE_KEY      = 'fp_write_mode';

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

  const [writeMode,  setWriteMode]  = useState(() => localStorage.getItem(MODE_KEY) || 'script');
  const [content,    setContent]    = useState(() => localStorage.getItem(AUTOSAVE_KEY) || '');
  // Derived during render — no state-sync churn (timer stays stateful below)
  const wordCount  = countWords(content);
  const sceneCount = countScenes(content);
  const pages      = estimatePages(content);
  const [spType,     setSpType]     = useState(0);  // index into SP_TYPES
  const [timerSecs,  setTimerSecs]  = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLabel,   setTimerLabel]   = useState('25:00');
  const [preview,      setPreview]      = useState(() => localStorage.getItem('fp_write_preview') === '1');
  const previewRef = useRef(null);

  useEffect(() => { localStorage.setItem('fp_write_preview', preview ? '1' : '0'); }, [preview]);

  // Live Markdown (Markraft/Tot parity) — sanitized, GFM tables + task lists
  const rendered = useMemo(
    () => DOMPurify.sanitize(marked.parse(content || '')),
    [content]
  );

  // Click a task checkbox in preview → flip the nth [ ]/[x] in the source
  useEffect(() => {
    if (!preview || !previewRef.current) return undefined;
    const boxes = previewRef.current.querySelectorAll('input[type="checkbox"]');
    const handlers = [];
    boxes.forEach((box, idx) => {
      box.disabled = false;
      const h = () => setContent(prev => toggleTaskAtIndex(prev, idx));
      box.addEventListener('change', h);
      handlers.push([box, h]);
    });
    return () => handlers.forEach(([box, h]) => box.removeEventListener('change', h));
  }, [preview, rendered]);

  // ── Autosave ──────────────────────────────────────────────
  useEffect(() => {
    const save = () => { try { localStorage.setItem(AUTOSAVE_KEY, content); } catch {} };
    const t = setTimeout(save, 500);
    const onVis = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('blur', save);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      window.removeEventListener('blur', save);
      document.removeEventListener('visibilitychange', onVis);
    };
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
    if (text) setContent(text);
  }, []);

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
      <ScrollToolbar className="write-toolbar">
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

        {writeMode==='md' && (
          <>
            <div className="tb-tool-sep"/>
            <button
              className={`tb-tool${preview?' active':''}`}
              onClick={()=>setPreview(p=>!p)}
              title="Live Markdown preview — click checkboxes to toggle tasks"
            >
              {preview ? '✎ Edit' : '👁 Preview'}
            </button>
          </>
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
      </ScrollToolbar>

      {/* Editor / live preview */}
      <div className="write-body">
        {preview && writeMode==='md' ? (
          <div
            ref={previewRef}
            className="write-preview"
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        ) : (
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
        )}
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
