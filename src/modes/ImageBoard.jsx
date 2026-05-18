import React, {
  useEffect, useRef, useState, useCallback,
} from 'react';
import { loadImageDimensions, scaleToFit } from '../utils/helpers';

let _nextId = 1;

export default function ImageBoard() {
  const boardRef  = useRef(null);
  const canvasRef = useRef(null);

  // Transform stored in a ref — mutations never trigger re-renders,
  // we update the DOM style directly for smooth pan/zoom.
  const transform = useRef({ tx: 0, ty: 0, scale: 1 });

  // Images in state — adding/removing DOES trigger re-renders.
  const [images, setImages]     = useState([]);
  const imagesRef               = useRef(images);   // always-current ref
  const [dragOver, setDragOver] = useState(false);

  // DOM element refs for each board item (for direct style updates during drag)
  const itemEls = useRef({});

  // Keep imagesRef in sync
  useEffect(() => { imagesRef.current = images; }, [images]);

  // ── Apply CSS transform to canvas ────────────────────────
  const applyTransform = useCallback(() => {
    if (!canvasRef.current) return;
    const { tx, ty, scale } = transform.current;
    canvasRef.current.style.transform =
      `translate(${tx}px,${ty}px) scale(${scale})`;
  }, []);

  // ── Convert client coords → canvas coords ────────────────
  const toCanvas = useCallback((cx, cy) => {
    const { tx, ty, scale } = transform.current;
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: (cx - rect.left  - tx) / scale,
      y: (cy - rect.top   - ty) / scale,
    };
  }, []);

  // ── Add image to board ───────────────────────────────────
  const addImage = useCallback(async (src, dropCx, dropCy) => {
    try {
      const { w: nw, h: nh } = await loadImageDimensions(src);
      const { w, h } = scaleToFit(nw, nh, 360);

      let x, y;
      if (dropCx != null) {
        const c = toCanvas(dropCx, dropCy);
        x = c.x - w / 2;
        y = c.y - h / 2;
      } else {
        // Center of viewport
        const rect = boardRef.current.getBoundingClientRect();
        const c = toCanvas(
          rect.left + rect.width  / 2,
          rect.top  + rect.height / 2
        );
        x = c.x - w / 2;
        y = c.y - h / 2;
      }

      setImages(prev => [...prev, { id: _nextId++, src, x, y, w, h }]);
    } catch (e) {
      console.warn('FloatPad: could not load image', src, e);
    }
  }, [toCanvas]);

  // ── Pan (drag on empty canvas area) ─────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0)                    return;
    if (e.target.closest('.board-item'))   return;

    const startX  = e.clientX,   startY  = e.clientY;
    const startTx = transform.current.tx, startTy = transform.current.ty;

    document.body.style.cursor = 'grabbing';

    const onMove = (e) => {
      transform.current.tx = startTx + e.clientX - startX;
      transform.current.ty = startTy + e.clientY - startY;
      applyTransform();
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [applyTransform]);

  // ── Zoom (wheel + trackpad pinch) ───────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();

    const rect = boardRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const { tx, ty, scale } = transform.current;

    // ctrlKey = trackpad pinch, else scroll
    const factor = e.ctrlKey
      ? Math.exp(-e.deltaY * 0.012)
      : e.deltaY < 0 ? 1.1 : 0.9;

    const newScale  = Math.max(0.04, Math.min(24, scale * factor));
    const f         = newScale / scale;

    transform.current = {
      tx:    mx - (mx - tx) * f,
      ty:    my - (my - ty) * f,
      scale: newScale,
    };
    applyTransform();
  }, [applyTransform]);

  // Register wheel listener with { passive: false } so we can preventDefault
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ── Drag individual image ────────────────────────────────
  const startItemDrag = useCallback((e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();   // don't start a pan

    const item = imagesRef.current.find(i => i.id === id);
    if (!item) return;

    const { tx, ty, scale } = transform.current;
    const startCanvasX = (e.clientX - tx) / scale;
    const startCanvasY = (e.clientY - ty) / scale;
    const startItemX   = item.x;
    const startItemY   = item.y;
    let lastX = startItemX, lastY = startItemY;

    const el = itemEls.current[id];
    document.body.style.cursor = 'grabbing';

    const onMove = (e) => {
      const { tx, ty, scale } = transform.current;
      lastX = startItemX + (e.clientX - tx) / scale - startCanvasX;
      lastY = startItemY + (e.clientY - ty) / scale - startCanvasY;
      if (el) {
        el.style.left = `${lastX}px`;
        el.style.top  = `${lastY}px`;
      }
    };

    const onUp = () => {
      document.body.style.cursor = '';
      // Commit final position to React state
      setImages(prev =>
        prev.map(i => i.id === id ? { ...i, x: lastX, y: lastY } : i)
      );
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, []);

  // ── Paste from clipboard (⌘V) ────────────────────────────
  useEffect(() => {
    const onPaste = (e) => {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          addImage(URL.createObjectURL(item.getAsFile()), null, null);
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImage]);

  // ── Drag-and-drop events ─────────────────────────────────
  const onDragEnter = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => {
    if (!boardRef.current?.contains(e.relatedTarget)) setDragOver(false);
  };
  const onDragOver  = (e) => e.preventDefault();

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);

    const cx = e.clientX, cy = e.clientY;

    // Files from Finder / Explorer
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        await addImage(URL.createObjectURL(file), cx, cy);
      }
    }

    // Image URL dragged from browser
    if (!e.dataTransfer.files.length) {
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        const urls = uriList.split('\n').filter(u => u && !u.startsWith('#'));
        for (const url of urls) {
          await addImage(url.trim(), cx, cy);
        }
      }
    }
  };

  // ── Double-click empty area → reset view ─────────────────
  const onDoubleClick = (e) => {
    if (!e.target.closest('.board-item')) {
      transform.current = { tx: 0, ty: 0, scale: 1 };
      applyTransform();
    }
  };

  // ── Delete image ─────────────────────────────────────────
  const deleteImage = (id) => {
    setImages(prev => prev.filter(i => i.id !== id));
    delete itemEls.current[id];
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div
      ref={boardRef}
      className={`board${dragOver ? ' dragover' : ''}`}
      onMouseDown={onMouseDown}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onDoubleClick}
    >
      <div ref={canvasRef} className="board-canvas">
        {images.map(img => (
          <div
            key={img.id}
            className="board-item"
            style={{ left: img.x, top: img.y, width: img.w, height: img.h }}
            ref={el => { if (el) itemEls.current[img.id] = el; }}
            onMouseDown={e => startItemDrag(e, img.id)}
          >
            <img
              src={img.src}
              width={img.w}
              height={img.h}
              alt=""
              draggable={false}
            />
            <button
              className="board-item-del"
              onClick={e => { e.stopPropagation(); deleteImage(img.id); }}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {images.length === 0 && (
        <div className="board-empty">
          <div className="board-empty-icon">⊞</div>
          <div className="board-empty-title">Drop images here</div>
          <div className="board-empty-sub">scroll to zoom · drag to pan · ⌘V to paste</div>
        </div>
      )}
    </div>
  );
}
