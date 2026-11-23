import React, { useEffect, useRef, useState, useCallback } from 'react';

// Non-destructive-feeling crop: drag/resize a crop box over the image, then Apply.
// The result replaces the image source and is recorded by board undo/redo.
export default function CropDialog({ img, onApply, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const origW = img.origW || img.w;
  const origH = img.origH || img.h;
  const scale = Math.min(480 / origW, 360 / origH, 1);
  const dispW = Math.round(origW * scale);
  const dispH = Math.round(origH * scale);

  const [crop, setCrop] = useState({ x: 0, y: 0, w: origW, h: origH });
  const dragRef = useRef(null);

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const onCancel = () => closeRef.current();
    d.addEventListener('cancel', onCancel);
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, []);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const startDrag = useCallback((e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...crop } };
    const move = ev => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / scale;
      const dy = (ev.clientY - d.sy) / scale;
      const s = d.start;
      let { x, y, w, h } = s;
      const MIN = 8;
      if (d.mode === 'move') {
        x = clamp(s.x + dx, 0, origW - s.w);
        y = clamp(s.y + dy, 0, origH - s.h);
      } else {
        if (d.mode.includes('e')) w = clamp(s.w + dx, MIN, origW - s.x);
        if (d.mode.includes('s')) h = clamp(s.h + dy, MIN, origH - s.y);
        if (d.mode.includes('w')) { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.w + (s.x - nx); x = nx; }
        if (d.mode.includes('n')) { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.h + (s.y - ny); y = ny; }
      }
      setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [crop, scale, origW, origH]);

  const apply = useCallback(async () => {
    try {
      const image = new Image();
      image.src = img.src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(crop.w));
      canvas.height = Math.max(1, Math.round(crop.h));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      onApply(canvas.toDataURL('image/png'), canvas.width, canvas.height);
      closeRef.current();
    } catch { /* ignore decode failure */ }
  }, [crop, img.src, onApply]);

  const boxStyle = {
    left: crop.x * scale, top: crop.y * scale,
    width: crop.w * scale, height: crop.h * scale,
  };

  return (
    <dialog ref={ref} className="crop-dialog" aria-label="Crop image">
      <div className="crop-head">
        <span>Crop image</span>
        <span className="crop-dims">{crop.w} × {crop.h}</span>
        <button className="crop-close" onClick={onClose} title="Cancel">✕</button>
      </div>
      <div className="crop-stage" style={{ width: dispW, height: dispH }}>
        <img className="crop-img" src={img.src} alt="" style={{ width: dispW, height: dispH }} draggable={false} />
        <div className="crop-box" style={boxStyle} onPointerDown={e => startDrag(e, 'move')}>
          {['nw', 'ne', 'sw', 'se'].map(m => (
            <span key={m} className={`crop-handle crop-${m}`} onPointerDown={e => startDrag(e, m)} />
          ))}
        </div>
      </div>
      <div className="crop-actions">
        <button className="crop-btn" onClick={() => setCrop({ x: 0, y: 0, w: origW, h: origH })}>Reset</button>
        <div style={{ flex: 1 }} />
        <button className="crop-btn" onClick={onClose}>Cancel</button>
        <button className="crop-btn primary" onClick={apply}>Apply crop</button>
      </div>
    </dialog>
  );
}