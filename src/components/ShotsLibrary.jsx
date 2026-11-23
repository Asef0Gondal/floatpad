import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ipcRenderer } from '../ipc';

// Persistent Shot Library: browse, search, tag, reopen and delete floated images.
export default function ShotsLibrary({ onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [shots, setShots] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // {id, name, tags}

  const load = useCallback(() => {
    ipcRenderer.invoke('shots-list').then(list => setShots(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const onCancel = () => closeRef.current();
    d.addEventListener('cancel', onCancel);
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, []);

  const float = useCallback(async (s) => {
    const dataUrl = await ipcRenderer.invoke('shot-load', s.id);
    if (!dataUrl) return;
    let w = 320, h = 240;
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      w = img.naturalWidth || w; h = img.naturalHeight || h;
    } catch { /* keep defaults */ }
    ipcRenderer.invoke('shot-open', dataUrl, w, h, s.name, false); // persist=false: no duplicate
  }, []);

  const del = useCallback(async (id) => {
    await ipcRenderer.invoke('shot-delete', id);
    load();
  }, [load]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const tags = editing.tags.split(',').map(t => t.trim()).filter(Boolean);
    await ipcRenderer.invoke('shot-update', editing.id, editing.name, tags);
    setEditing(null);
    load();
  }, [editing, load]);

  const q = query.trim().toLowerCase();
  const filtered = shots.filter(s =>
    !q || s.name.toLowerCase().includes(q) || (s.tags || []).some(t => t.toLowerCase().includes(q))
  );

  return (
    <dialog ref={ref} className="shots-dialog" aria-label="Shot Library" onClick={e => { if (e.target === ref.current) closeRef.current(); }}>
      <div className="shots-head">
        <span className="shots-title">Shot Library</span>
        <input
          className="shots-search" placeholder="Search name or tag…"
          value={query} onChange={e => setQuery(e.target.value)}
        />
        <button className="shots-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="shots-grid">
        {filtered.length === 0 && (
          <div className="shots-empty">
            {shots.length === 0
              ? 'No shots yet. Float an image with the ⧉ button to save it here.'
              : 'No shots match your search.'}
          </div>
        )}
        {filtered.map(s => (
          <div key={s.id} className="shot-card">
            {s.thumb
              ? <img className="shot-thumb" src={s.thumb} alt={s.name} loading="lazy" onClick={() => float(s)} title="Click to float" />
              : <div className="shot-thumb shot-thumb-empty" onClick={() => float(s)} title="Click to float">🖼</div>}
            <div className="shot-name" title={s.name}>{s.name}</div>
            {(s.tags || []).length > 0 && <div className="shot-tags">{s.tags.join(' · ')}</div>}
            <div className="shot-actions">
              <button onClick={() => float(s)}>Float</button>
              <button onClick={() => setEditing({ id: s.id, name: s.name, tags: (s.tags || []).join(', ') })}>Edit</button>
              <button onClick={() => del(s.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="shot-edit">
          <input value={editing.name} placeholder="Name"
            onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <input value={editing.tags} placeholder="tags, comma, separated"
            onChange={e => setEditing({ ...editing, tags: e.target.value })} />
          <button onClick={saveEdit}>Save</button>
          <button onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
    </dialog>
  );
}