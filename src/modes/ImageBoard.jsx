import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  IconCamera,
  IconEyedrop,
  IconFit,
  IconFolder,
  IconPen,
  IconEraser,
  IconShape,
  IconText,
  IconSave,
  IconTrash,
} from '../components/Icons';
import { loadImageDimensions, scaleToFit, fileToDataUrl, uid } from '../utils/helpers';

const { ipcRenderer } = window.require('electron');

const EXPORT_PADDING = 48;
const LABEL_WIDTH = 180;
const MIN_SHAPE_SIZE = 8;
const TOOL_OPTIONS = [
  { id: 'select', label: 'Move' },
  { id: 'pen', label: 'Pen', Icon: IconPen },
  { id: 'eraser', label: 'Erase', Icon: IconEraser },
  { id: 'rect', label: 'Rect', Icon: IconShape },
  { id: 'ellipse', label: 'Ellipse', Icon: IconShape },
  { id: 'arrow', label: 'Arrow', Icon: IconShape },
  { id: 'text', label: 'Text', Icon: IconText },
];

function sampleColor(src, origW, origH, relX, relY) {
  return new Promise(resolve => {
    const c = document.createElement('canvas');
    c.width = origW;
    c.height = origH;
    const ctx = c.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, origW, origH);
      const px = ctx.getImageData(
        Math.round(relX * origW),
        Math.round(relY * origH),
        1,
        1
      ).data;
      resolve('#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function createImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${src}`));
    img.src = src;
  });
}

function getMaxZ(items) {
  return items.reduce((max, item) => Math.max(max, item.z ?? 0), 0);
}

function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  return { x, y, w, h };
}

function getPathBounds(points = [], pad = 0) {
  if (!points.length) return null;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return {
    minX,
    minY,
    maxX,
    maxY,
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

function getTextHeight(text = '', fontSize = 16) {
  const lines = Math.max(1, String(text || '').split('\n').length);
  return Math.max(fontSize * 1.7, lines * fontSize * 1.35);
}

function getAnnotationBounds(annotation) {
  if (!annotation) return null;

  if (annotation.type === 'path') {
    return getPathBounds(annotation.points, (annotation.strokeWidth ?? 4) * 1.5);
  }

  if (annotation.type === 'text') {
    const height = getTextHeight(annotation.text, annotation.fontSize ?? 16);
    return {
      minX: annotation.x,
      minY: annotation.y,
      maxX: annotation.x + (annotation.width ?? LABEL_WIDTH),
      maxY: annotation.y + height,
      x: annotation.x,
      y: annotation.y,
      w: annotation.width ?? LABEL_WIDTH,
      h: height,
    };
  }

  const rect = normalizeRect(annotation.x1, annotation.y1, annotation.x2, annotation.y2);
  const pad = Math.max(4, (annotation.strokeWidth ?? 4) * 1.2);
  return {
    minX: rect.x - pad,
    minY: rect.y - pad,
    maxX: rect.x + rect.w + pad,
    maxY: rect.y + rect.h + pad,
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

function expandBounds(current, next) {
  if (!next) return current;
  if (!current) {
    return {
      minX: next.minX,
      minY: next.minY,
      maxX: next.maxX,
      maxY: next.maxY,
    };
  }
  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY),
  };
}

function getBoardBounds(images, notes, annotations) {
  let bounds = null;

  for (const img of images) {
    bounds = expandBounds(bounds, {
      minX: img.x,
      minY: img.y,
      maxX: img.x + img.w,
      maxY: img.y + img.h,
    });
  }

  for (const note of notes) {
    bounds = expandBounds(bounds, {
      minX: note.x,
      minY: note.y,
      maxX: note.x + note.w,
      maxY: note.y + Math.max(88, 52 + (note.text || '').split('\n').length * 16),
    });
  }

  for (const annotation of annotations) {
    const annotationBounds = getAnnotationBounds(annotation);
    if (annotationBounds) bounds = expandBounds(bounds, annotationBounds);
  }

  return bounds;
}

function wrapTextLines(ctx, text, maxWidth) {
  const safeText = String(text || '');
  if (!safeText.trim()) return [''];

  const lines = [];
  for (const block of safeText.split('\n')) {
    const words = block.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawArrowShape(ctx, x1, y1, x2, y2, color, strokeWidth) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(10, strokeWidth * 3);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawAnnotationToCanvas(ctx, annotation, offsetX, offsetY) {
  const color = annotation.color ?? '#3B6EE0';
  const strokeWidth = annotation.strokeWidth ?? 4;

  if (annotation.type === 'path') {
    const points = annotation.points || [];
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
    }
    ctx.stroke();
    return;
  }

  if (annotation.type === 'text') {
    const lines = String(annotation.text || '').split('\n');
    ctx.fillStyle = color;
    ctx.font = `${annotation.fontSize ?? 16}px "Courier New", Courier, monospace`;
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => {
      ctx.fillText(line || ' ', annotation.x + offsetX, annotation.y + offsetY + index * (annotation.fontSize ?? 16) * 1.35);
    });
    return;
  }

  const rect = normalizeRect(annotation.x1, annotation.y1, annotation.x2, annotation.y2);
  const x = rect.x + offsetX;
  const y = rect.y + offsetY;
  const x2 = rect.x + rect.w + offsetX;
  const y2 = rect.y + rect.h + offsetY;

  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (annotation.type === 'rect') {
    ctx.strokeRect(x, y, rect.w, rect.h);
    return;
  }

  if (annotation.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      x + rect.w / 2,
      y + rect.h / 2,
      Math.max(1, rect.w / 2),
      Math.max(1, rect.h / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    return;
  }

  if (annotation.type === 'arrow') {
    drawArrowShape(ctx, x, y, x2, y2, color, strokeWidth);
  }
}

function isPointInsideAnnotation(annotation, point) {
  const bounds = getAnnotationBounds(annotation);
  if (!bounds) return false;
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function normalizeImageModel(image, index = 0) {
  return {
    ...image,
    opacity: image.opacity ?? 1,
    z: image.z ?? index,
  };
}

export default function ImageBoard({ active }) {
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const tf = useRef({ tx: 0, ty: 0, scale: 1 });
  const itemElsRef = useRef({});
  const annotationsRef = useRef([]);
  const imagesRef = useRef([]);
  const notesRef = useRef([]);
  const pickerRef = useRef(false);
  const spaceHeldRef = useRef(false);

  const [images, setImages] = useState([]);
  const [notes, setNotes] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pickerMode, setPickerMode] = useState(false);
  const [pickedColor, setPickedColor] = useState(null);
  const [rubberBand, setRubberBand] = useState(null);
  const [tool, setTool] = useState(() => localStorage.getItem('fp_board_tool') || 'select');
  const [strokeColor, setStrokeColor] = useState(() => localStorage.getItem('fp_board_color') || '#3B6EE0');
  const [strokeWidth, setStrokeWidth] = useState(() => Number(localStorage.getItem('fp_board_width') || 4));
  const [draftAnnotation, setDraftAnnotation] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { pickerRef.current = pickerMode; }, [pickerMode]);

  useEffect(() => {
    localStorage.setItem('fp_board_tool', tool);
  }, [tool]);

  useEffect(() => {
    localStorage.setItem('fp_board_color', strokeColor);
  }, [strokeColor]);

  useEffect(() => {
    localStorage.setItem('fp_board_width', String(strokeWidth));
  }, [strokeWidth]);

  const applyTf = useCallback(() => {
    if (!canvasRef.current) return;
    const { tx, ty, scale } = tf.current;
    canvasRef.current.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    setZoom(Math.round(scale * 100));
  }, []);

  const toCanvas = useCallback((cx, cy) => {
    const { tx, ty, scale } = tf.current;
    const r = boardRef.current.getBoundingClientRect();
    return { x: (cx - r.left - tx) / scale, y: (cy - r.top - ty) / scale };
  }, []);

  const addImage = useCallback(async (src, dropCx, dropCy) => {
    try {
      const { w: nw, h: nh } = await loadImageDimensions(src);
      const { w, h } = scaleToFit(nw, nh, 380);
      let x;
      let y;
      if (dropCx != null) {
        const c = toCanvas(dropCx, dropCy);
        x = c.x - w / 2;
        y = c.y - h / 2;
      } else {
        const r = boardRef.current.getBoundingClientRect();
        const c = toCanvas(r.left + r.width / 2, r.top + r.height / 2);
        const off = imagesRef.current.length * 18;
        x = c.x - w / 2 + off % 100;
        y = c.y - h / 2 + off % 80;
      }
      setImages(prev => [
        ...prev,
        normalizeImageModel({
          id: uid(),
          src,
          x,
          y,
          w,
          h,
          origW: nw,
          origH: nh,
          locked: false,
          flipX: false,
          flipY: false,
          rotation: 0,
          opacity: 1,
          z: getMaxZ(prev) + 1,
        }),
      ]);
    } catch (e) {
      console.warn('FloatPad: image load failed', e.message);
    }
  }, [toCanvas]);

  useEffect(() => {
    const onShot = (_, dataUrl) => addImage(dataUrl, null, null);
    ipcRenderer.on('screenshot-result', onShot);
    return () => ipcRenderer.removeListener('screenshot-result', onShot);
  }, [addImage]);

  useEffect(() => {
    const ch = new BroadcastChannel('floatpad');
    ch.onmessage = e => {
      if (e.data?.type === 'grab-frame') addImage(e.data.dataUrl, null, null);
    };
    return () => ch.close();
  }, [addImage]);

  const openDialog = useCallback(async () => {
    const paths = await ipcRenderer.invoke('dialog-open-images');
    for (const filePath of paths) {
      const dataUrl = await fileToDataUrl(filePath, ipcRenderer);
      if (dataUrl) await addImage(dataUrl, null, null);
    }
  }, [addImage]);

  const takeScreenshot = useCallback(() => ipcRenderer.send('screenshot-request'), []);

  const selectTool = useCallback(nextTool => {
    setTool(nextTool);
    setPickerMode(false);
    setPickedColor(null);
  }, []);

  const eraseAtCanvasPoint = useCallback(point => {
    setAnnotations(prev => prev.filter(annotation => !isPointInsideAnnotation(annotation, point)));
  }, []);

  const addTextLabel = useCallback((clientX, clientY) => {
    const point = toCanvas(clientX, clientY);
    const id = uid();
    const annotation = {
      id,
      type: 'text',
      x: point.x,
      y: point.y,
      text: 'Label',
      color: strokeColor,
      fontSize: 16,
      width: LABEL_WIDTH,
    };
    setAnnotations(prev => [...prev, annotation]);
    setEditingTextId(id);
  }, [strokeColor, toCanvas]);

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.board-note') || e.target.closest('.board-text-editor')) return;

    if (e.button === 1 || e.button === 2 || spaceHeldRef.current) {
      e.preventDefault();
      const stx = tf.current.tx;
      const sty = tf.current.ty;
      const sx = e.clientX;
      const sy = e.clientY;
      const mv = event => {
        tf.current.tx = stx + event.clientX - sx;
        tf.current.ty = sty + event.clientY - sy;
        applyTf();
      };
      const up = () => {
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      };
      document.body.style.cursor = 'grabbing';
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
      return;
    }

    if (e.button !== 0) return;

    if (pickerRef.current) return;

    if (tool === 'text') {
      addTextLabel(e.clientX, e.clientY);
      return;
    }

    if (tool === 'eraser') {
      const erasePoint = event => eraseAtCanvasPoint(toCanvas(event.clientX, event.clientY));
      erasePoint(e);
      const mv = event => erasePoint(event);
      const up = () => {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
      return;
    }

    if (tool === 'pen') {
      const start = toCanvas(e.clientX, e.clientY);
      const draft = {
        id: uid(),
        type: 'path',
        color: strokeColor,
        strokeWidth,
        points: [start],
      };
      setDraftAnnotation(draft);
      const mv = event => {
        const nextPoint = toCanvas(event.clientX, event.clientY);
        setDraftAnnotation(prev => (
          prev ? { ...prev, points: [...prev.points, nextPoint] } : prev
        ));
      };
      const up = () => {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
        setDraftAnnotation(prev => {
          if (prev && prev.points.length > 1) {
            setAnnotations(current => [...current, prev]);
          }
          return null;
        });
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
      return;
    }

    if (tool === 'rect' || tool === 'ellipse' || tool === 'arrow') {
      const start = toCanvas(e.clientX, e.clientY);
      const draft = {
        id: uid(),
        type: tool,
        color: strokeColor,
        strokeWidth,
        x1: start.x,
        y1: start.y,
        x2: start.x,
        y2: start.y,
      };
      setDraftAnnotation(draft);
      const mv = event => {
        const nextPoint = toCanvas(event.clientX, event.clientY);
        setDraftAnnotation(prev => (
          prev ? { ...prev, x2: nextPoint.x, y2: nextPoint.y } : prev
        ));
      };
      const up = () => {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
        setDraftAnnotation(prev => {
          if (!prev) return null;
          const rect = normalizeRect(prev.x1, prev.y1, prev.x2, prev.y2);
          if (rect.w >= MIN_SHAPE_SIZE || rect.h >= MIN_SHAPE_SIZE) {
            setAnnotations(current => [...current, prev]);
          }
          return null;
        });
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
      return;
    }

    if (e.target.closest('.board-item') || e.target.closest('.board-text-label')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const mv = event => {
      moved = true;
      setRubberBand({ x1: startX, y1: startY, x2: event.clientX, y2: event.clientY });
    };
    const up = event => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);

      if (moved) {
        const r = boardRef.current.getBoundingClientRect();
        const bx1 = Math.min(startX, event.clientX) - r.left;
        const by1 = Math.min(startY, event.clientY) - r.top;
        const bx2 = Math.max(startX, event.clientX) - r.left;
        const by2 = Math.max(startY, event.clientY) - r.top;

        const { tx, ty, scale } = tf.current;
        const cbx1 = (bx1 - tx) / scale;
        const cby1 = (by1 - ty) / scale;
        const cbx2 = (bx2 - tx) / scale;
        const cby2 = (by2 - ty) / scale;

        const nextSelection = new Set();
        for (const img of imagesRef.current) {
          const overlapX = img.x < cbx2 && img.x + img.w > cbx1;
          const overlapY = img.y < cby2 && img.y + img.h > cby1;
          if (overlapX && overlapY) nextSelection.add(img.id);
        }
        setSelected(nextSelection);
      } else if (!event.shiftKey) {
        setSelected(new Set());
      }
      setRubberBand(null);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, [addTextLabel, applyTf, eraseAtCanvasPoint, strokeColor, strokeWidth, toCanvas, tool]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const r = boardRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const { tx, ty, scale } = tf.current;
    const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.012) : e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = Math.max(0.04, Math.min(24, scale * factor));
    const ratio = nextScale / scale;
    tf.current = {
      tx: mx - (mx - tx) * ratio,
      ty: my - (my - ty) * ratio,
      scale: nextScale,
    };
    applyTf();
  }, [applyTf]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const zoomToFit = useCallback(() => {
    const bounds = getBoardBounds(imagesRef.current, notesRef.current, annotationsRef.current);
    if (!bounds) {
      tf.current = { tx: 0, ty: 0, scale: 1 };
      applyTf();
      return;
    }
    const r = boardRef.current.getBoundingClientRect();
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const pad = 40;
    const scale = Math.min((r.width - pad * 2) / width, (r.height - pad * 2) / height, 2);
    tf.current = {
      tx: (r.width - width * scale) / 2 - bounds.minX * scale,
      ty: (r.height - height * scale) / 2 - bounds.minY * scale,
      scale,
    };
    applyTf();
  }, [applyTf]);

  const startItemDrag = useCallback((e, id) => {
    if (e.button !== 0 || pickerRef.current || tool !== 'select') return;
    e.stopPropagation();
    const item = imagesRef.current.find(image => image.id === id);
    if (!item || item.locked) return;

    if (e.shiftKey) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      return;
    }

    const currentSelection = selected.has(id) ? selected : new Set([id]);
    if (!selected.has(id)) setSelected(currentSelection);

    const { tx, ty, scale } = tf.current;
    const startCanvasX = (e.clientX - tx) / scale;
    const startCanvasY = (e.clientY - ty) / scale;
    const starts = {};

    for (const image of imagesRef.current) {
      if (currentSelection.has(image.id)) {
        starts[image.id] = { x: image.x, y: image.y };
      }
    }

    document.body.style.cursor = 'grabbing';

    const mv = event => {
      const { tx: nextTx, ty: nextTy, scale: nextScale } = tf.current;
      const dcx = (event.clientX - nextTx) / nextScale - startCanvasX;
      const dcy = (event.clientY - nextTy) / nextScale - startCanvasY;
      for (const [selectedId, start] of Object.entries(starts)) {
        const el = itemElsRef.current[selectedId];
        if (el) {
          el.style.left = `${start.x + dcx}px`;
          el.style.top = `${start.y + dcy}px`;
        }
      }
    };

    const up = event => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
      const { tx: nextTx, ty: nextTy, scale: nextScale } = tf.current;
      const dcx = (event.clientX - nextTx) / nextScale - startCanvasX;
      const dcy = (event.clientY - nextTy) / nextScale - startCanvasY;
      setImages(prev => prev.map(image => (
        currentSelection.has(image.id) && starts[image.id]
          ? { ...image, x: starts[image.id].x + dcx, y: starts[image.id].y + dcy }
          : image
      )));
    };

    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, [selected, tool]);

  const startExternalDrag = useCallback((e, img) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const mv = event => {
      if (!dragging && (Math.abs(event.clientX - startX) > 6 || Math.abs(event.clientY - startY) > 6)) {
        dragging = true;
        ipcRenderer.send('board-drag-start', img.src);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, []);

  const startItemResize = useCallback((e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const item = imagesRef.current.find(image => image.id === id);
    if (!item) return;
    const sx = e.clientX;
    const sw = item.w;
    const ratio = item.origW / item.origH;
    const { scale } = tf.current;
    let nextWidth = sw;
    let nextHeight = Math.round(sw / ratio);
    const el = itemElsRef.current[id];

    const mv = event => {
      nextWidth = Math.max(40, sw + (event.clientX - sx) / scale);
      nextHeight = Math.round(nextWidth / ratio);
      if (el) {
        el.style.width = `${nextWidth}px`;
        el.style.height = `${nextHeight}px`;
        const img = el.querySelector('img');
        if (img) {
          img.width = nextWidth;
          img.height = nextHeight;
        }
      }
    };
    const up = () => {
      setImages(prev => prev.map(image => (
        image.id === id ? { ...image, w: nextWidth, h: nextHeight } : image
      )));
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, []);

  const togglePicker = useCallback(() => {
    setPickerMode(prev => {
      const next = !prev;
      if (next) setTool('select');
      return next;
    });
    setPickedColor(null);
  }, []);

  const onImageClick = useCallback(async (e, img) => {
    if (!pickerRef.current) return;
    e.stopPropagation();
    const el = itemElsRef.current[img.id];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const hex = await sampleColor(
      img.src,
      img.origW || img.w,
      img.origH || img.h,
      (e.clientX - r.left) / r.width,
      (e.clientY - r.top) / r.height
    );
    if (hex) {
      setPickedColor(hex);
      setStrokeColor(hex);
      navigator.clipboard.writeText(hex).catch(() => {});
    }
  }, []);

  const addNote = useCallback((cx, cy) => {
    const c = toCanvas(cx, cy);
    setNotes(prev => [...prev, { id: uid(), x: c.x, y: c.y, text: '', w: 160 }]);
  }, [toCanvas]);

  const startNoteDrag = useCallback((e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const note = notesRef.current.find(item => item.id === id);
    if (!note) return;
    const { tx, ty, scale } = tf.current;
    const sx = (e.clientX - tx) / scale;
    const sy = (e.clientY - ty) / scale;
    const ox = note.x;
    const oy = note.y;
    let lx = ox;
    let ly = oy;

    const mv = event => {
      const { tx: nextTx, ty: nextTy, scale: nextScale } = tf.current;
      lx = ox + (event.clientX - nextTx) / nextScale - sx;
      ly = oy + (event.clientY - nextTy) / nextScale - sy;
      const el = document.getElementById(`note-${id}`);
      if (el) {
        el.style.left = `${lx}px`;
        el.style.top = `${ly}px`;
      }
    };
    const up = () => {
      setNotes(prev => prev.map(item => (
        item.id === id ? { ...item, x: lx, y: ly } : item
      )));
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, []);

  const startTextDrag = useCallback((e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const annotation = annotationsRef.current.find(item => item.id === id && item.type === 'text');
    if (!annotation) return;
    const { tx, ty, scale } = tf.current;
    const sx = (e.clientX - tx) / scale;
    const sy = (e.clientY - ty) / scale;
    const ox = annotation.x;
    const oy = annotation.y;
    let lx = ox;
    let ly = oy;

    const mv = event => {
      const { tx: nextTx, ty: nextTy, scale: nextScale } = tf.current;
      lx = ox + (event.clientX - nextTx) / nextScale - sx;
      ly = oy + (event.clientY - nextTy) / nextScale - sy;
      const el = document.getElementById(`board-text-${id}`);
      if (el) {
        el.style.left = `${lx}px`;
        el.style.top = `${ly}px`;
      }
    };
    const up = () => {
      setAnnotations(prev => prev.map(item => (
        item.id === id ? { ...item, x: lx, y: ly } : item
      )));
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }, []);

  const updateAnnotationText = useCallback((id, text) => {
    setAnnotations(prev => prev.map(annotation => (
      annotation.id === id ? { ...annotation, text } : annotation
    )));
  }, []);

  const finishTextEditing = useCallback(id => {
    setEditingTextId(current => (current === id ? null : current));
    setAnnotations(prev => prev.filter(annotation => (
      annotation.id !== id || annotation.type !== 'text' || String(annotation.text || '').trim()
    )));
  }, []);

  const bringSelectionToFront = useCallback(() => {
    if (!selected.size) return;
    setImages(prev => {
      let nextZ = getMaxZ(prev);
      return prev.map(image => (
        selected.has(image.id)
          ? { ...image, z: ++nextZ }
          : image
      ));
    });
  }, [selected]);

  const sendSelectionToBack = useCallback(() => {
    if (!selected.size) return;
    setImages(prev => {
      let nextZ = Math.min(...prev.map(image => image.z ?? 0), 0) - selected.size;
      return prev.map(image => (
        selected.has(image.id)
          ? { ...image, z: nextZ++ }
          : image
      ));
    });
  }, [selected]);

  const exportBoardImage = useCallback(async (format) => {
    const bounds = getBoardBounds(imagesRef.current, notesRef.current, annotationsRef.current);
    if (!bounds) {
      alert('Nothing to export yet.');
      return;
    }

    const width = Math.ceil(bounds.maxX - bounds.minX + EXPORT_PADDING * 2);
    const height = Math.ceil(bounds.maxY - bounds.minY + EXPORT_PADDING * 2);
    const offsetX = EXPORT_PADDING - bounds.minX;
    const offsetY = EXPORT_PADDING - bounds.minY;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);

    const ctx = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue('--fp-board-bg').trim() || '#111215';
    const dot = styles.getPropertyValue('--fp-board-dot').trim() || '#1A1C22';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = dot;
    for (let x = 0; x < canvas.width; x += 22) {
      for (let y = 0; y < canvas.height; y += 22) {
        ctx.beginPath();
        ctx.arc(x + 1, y + 1, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const orderedImages = [...imagesRef.current].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const image of orderedImages) {
      try {
        const source = await createImageElement(image.src);
        const cx = image.x + image.w / 2 + offsetX;
        const cy = image.y + image.h / 2 + offsetY;
        ctx.save();
        ctx.globalAlpha = image.opacity ?? 1;
        ctx.translate(cx, cy);
        ctx.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1);
        ctx.rotate(((image.rotation || 0) * Math.PI) / 180);
        ctx.drawImage(source, -image.w / 2, -image.h / 2, image.w, image.h);
        ctx.restore();
      } catch (error) {
        console.warn('FloatPad: export skipped image', error.message);
      }
    }

    for (const annotation of annotationsRef.current) {
      drawAnnotationToCanvas(ctx, annotation, offsetX, offsetY);
    }

    ctx.textBaseline = 'top';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    for (const note of notesRef.current) {
      const x = note.x + offsetX;
      const y = note.y + offsetY;
      const noteWidth = note.w;
      const wrapped = wrapTextLines(ctx, note.text || '', noteWidth - 16);
      const noteHeight = Math.max(88, 34 + wrapped.length * 16 + 14);

      ctx.fillStyle = styles.getPropertyValue('--fp-note-bg').trim() || '#FFFDE8';
      ctx.strokeStyle = styles.getPropertyValue('--fp-note-border').trim() || '#E0DC80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, noteWidth, noteHeight, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.beginPath();
      ctx.roundRect(x, y, noteWidth, 24, [8, 8, 0, 0]);
      ctx.fill();

      ctx.fillStyle = styles.getPropertyValue('--fp-note-text').trim() || '#4A4400';
      wrapped.forEach((line, index) => {
        ctx.fillText(line || ' ', x + 8, y + 32 + index * 16);
      });
    }

    const dialogResult = await ipcRenderer.invoke('dialog-save-export-image', format);
    if (!dialogResult?.path) return;

    const dataUrl = canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    await ipcRenderer.invoke('file-write-base64', dialogResult.path, base64);
  }, []);

  useEffect(() => {
    const h = async e => {
      if (!active) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const dataUrl = await blobToDataUrl(file);
            await addImage(dataUrl, null, null);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  }, [addImage, active]);

  useEffect(() => {
    const onKeyDown = e => {
      if (!active) return;
      if (e.code === 'Space' && document.activeElement === document.body) {
        spaceHeldRef.current = true;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0 && document.activeElement === document.body) {
        e.preventDefault();
        setImages(prev => prev.filter(image => !selected.has(image.id)));
        setSelected(new Set());
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && document.activeElement === document.body) {
        e.preventDefault();
        setSelected(new Set(imagesRef.current.map(image => image.id)));
      }

      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        zoomToFit();
      }

      if (e.key === 'Escape') {
        setSelected(new Set());
        setDraftAnnotation(null);
        setEditingTextId(null);
        setPickerMode(false);
      }
    };

    const onKeyUp = e => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [active, selected, zoomToFit]);

  const onDrop = async e => {
    e.preventDefault();
    setDragOver(false);
    const cx = e.clientX;
    const cy = e.clientY;
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await blobToDataUrl(file);
        await addImage(dataUrl, cx, cy);
      }
    }
    if (!e.dataTransfer.files.length) {
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        for (const url of uriList.split('\n').filter(url => url && !url.startsWith('#'))) {
          await addImage(url.trim(), cx, cy);
        }
      }
    }
  };

  const onDoubleClick = e => {
    if (tool !== 'select') return;
    if (
      e.target.closest('.board-item') ||
      e.target.closest('.board-note') ||
      e.target.closest('.board-text-label')
    ) {
      return;
    }
    addNote(e.clientX, e.clientY);
  };

  const saveBoard = useCallback(async () => {
    const fp = await ipcRenderer.invoke('dialog-save-board');
    if (!fp) return;
    await ipcRenderer.invoke('file-write', fp, JSON.stringify({
      version: 3,
      images: imagesRef.current,
      notes: notesRef.current,
      annotations: annotationsRef.current,
      tf: tf.current,
    }));
  }, []);

  const loadBoard = useCallback(async () => {
    const fp = await ipcRenderer.invoke('dialog-open-board');
    if (!fp) return;
    const raw = await ipcRenderer.invoke('file-read-text', fp);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setImages((parsed.images || []).map(normalizeImageModel));
      setNotes(parsed.notes || []);
      setAnnotations(parsed.annotations || []);
      if (parsed.tf) {
        tf.current = parsed.tf;
        applyTf();
      }
    } catch {
      alert('Could not read board file.');
    }
  }, [applyTf]);

  const clearBoard = useCallback(() => {
    if (!imagesRef.current.length && !notesRef.current.length && !annotationsRef.current.length) return;
    if (window.confirm('Clear everything?')) {
      setImages([]);
      setNotes([]);
      setAnnotations([]);
      setSelected(new Set());
      setDraftAnnotation(null);
      setEditingTextId(null);
      itemElsRef.current = {};
    }
  }, []);

  const rbStyle = rubberBand ? (() => {
    const r = boardRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    return {
      left: Math.min(rubberBand.x1, rubberBand.x2) - r.left,
      top: Math.min(rubberBand.y1, rubberBand.y2) - r.top,
      width: Math.abs(rubberBand.x2 - rubberBand.x1),
      height: Math.abs(rubberBand.y2 - rubberBand.y1),
    };
  })() : null;

  const sortedImages = [...images].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const singleSelectedImage = selected.size === 1
    ? images.find(image => selected.has(image.id)) || null
    : null;
  const visibleAnnotationCount = annotations.length + (draftAnnotation ? 1 : 0);

  const renderShapeAnnotation = annotation => {
    const bounds = getAnnotationBounds(annotation);
    if (!bounds) return null;

    if (annotation.type === 'text') {
      if (editingTextId === annotation.id) {
        return (
          <textarea
            key={annotation.id}
            id={`board-text-${annotation.id}`}
            className="board-text-editor"
            style={{
              left: annotation.x,
              top: annotation.y,
              width: annotation.width ?? LABEL_WIDTH,
              color: annotation.color,
            }}
            autoFocus
            value={annotation.text}
            onChange={e => updateAnnotationText(annotation.id, e.target.value)}
            onBlur={() => finishTextEditing(annotation.id)}
            onMouseDown={e => e.stopPropagation()}
          />
        );
      }

      return (
        <div
          key={annotation.id}
          id={`board-text-${annotation.id}`}
          className="board-text-label"
          style={{
            left: annotation.x,
            top: annotation.y,
            width: annotation.width ?? LABEL_WIDTH,
            color: annotation.color,
          }}
          onMouseDown={e => startTextDrag(e, annotation.id)}
          onDoubleClick={e => {
            e.stopPropagation();
            setEditingTextId(annotation.id);
          }}
        >
          {annotation.text}
        </div>
      );
    }

    const pad = Math.max(8, (annotation.strokeWidth ?? 4) * 2);
    const localLeft = bounds.x;
    const localTop = bounds.y;
    const svgWidth = bounds.w;
    const svgHeight = bounds.h;
    const rect = annotation.type === 'path'
      ? null
      : normalizeRect(annotation.x1, annotation.y1, annotation.x2, annotation.y2);

    return (
      <svg
        key={annotation.id}
        className="board-annotation-svg"
        style={{ left: localLeft, top: localTop, width: svgWidth, height: svgHeight }}
      >
        {annotation.type === 'path' && (
          <polyline
            points={(annotation.points || [])
              .map(point => `${point.x - bounds.x},${point.y - bounds.y}`)
              .join(' ')}
            fill="none"
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {annotation.type === 'rect' && rect && (
          <rect
            x={rect.x - bounds.x + pad / 2}
            y={rect.y - bounds.y + pad / 2}
            width={Math.max(1, rect.w)}
            height={Math.max(1, rect.h)}
            rx="4"
            fill="none"
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
          />
        )}

        {annotation.type === 'ellipse' && rect && (
          <ellipse
            cx={rect.x - bounds.x + rect.w / 2 + pad / 2}
            cy={rect.y - bounds.y + rect.h / 2 + pad / 2}
            rx={Math.max(1, rect.w / 2)}
            ry={Math.max(1, rect.h / 2)}
            fill="none"
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
          />
        )}

        {annotation.type === 'arrow' && rect && (
          <>
            <line
              x1={annotation.x1 - bounds.x + pad / 2}
              y1={annotation.y1 - bounds.y + pad / 2}
              x2={annotation.x2 - bounds.x + pad / 2}
              y2={annotation.y2 - bounds.y + pad / 2}
              stroke={annotation.color}
              strokeWidth={annotation.strokeWidth}
              strokeLinecap="round"
            />
            {(() => {
              const x1 = annotation.x1 - bounds.x + pad / 2;
              const y1 = annotation.y1 - bounds.y + pad / 2;
              const x2 = annotation.x2 - bounds.x + pad / 2;
              const y2 = annotation.y2 - bounds.y + pad / 2;
              const angle = Math.atan2(y2 - y1, x2 - x1);
              const head = Math.max(10, (annotation.strokeWidth ?? 4) * 3);
              const p1x = x2 - head * Math.cos(angle - Math.PI / 6);
              const p1y = y2 - head * Math.sin(angle - Math.PI / 6);
              const p2x = x2 - head * Math.cos(angle + Math.PI / 6);
              const p2y = y2 - head * Math.sin(angle + Math.PI / 6);
              return (
                <path
                  d={`M ${x2} ${y2} L ${p1x} ${p1y} M ${x2} ${y2} L ${p2x} ${p2y}`}
                  fill="none"
                  stroke={annotation.color}
                  strokeWidth={annotation.strokeWidth}
                  strokeLinecap="round"
                />
              );
            })()}
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="board-wrap">
      <div className="board-toolbar mode-toolbar">
        <button className="tb-tool" onClick={openDialog} title="Import images from Finder">
          <IconFolder size={13}/>
          Import
        </button>

        <button className="tb-tool" onClick={takeScreenshot} title="Capture screen area  Cmd+Shift+S">
          <IconCamera size={13}/>
          Screenshot
        </button>

        <button className="tb-tool" onClick={zoomToFit} title="Zoom to fit  Cmd+0">
          <IconFit size={13}/>
          Fit
        </button>

        <div className="tb-tool-sep"/>

        {TOOL_OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tb-tool${tool === id ? ' active' : ''}`}
            onClick={() => selectTool(id)}
            title={label}
          >
            {Icon ? <Icon size={13}/> : null}
            {label}
          </button>
        ))}

        <div className="tb-tool-sep"/>

        <label className="tool-colorchip board-color-control" title="Stroke color">
          <span className="tool-colorchip-swatch" style={{ background: strokeColor }}/>
          <span>{strokeColor}</span>
          <input
            className="board-color-input"
            type="color"
            value={strokeColor}
            onChange={e => setStrokeColor(e.target.value)}
          />
        </label>

        <label className="tool-colorchip board-width-control" title="Stroke width">
          <span>Stroke</span>
          <input
            className="board-toolbar-range"
            type="range"
            min="1"
            max="12"
            value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))}
          />
          <span>{strokeWidth}px</span>
        </label>

        <button
          className={`tb-tool${pickerMode ? ' active' : ''}`}
          onClick={togglePicker}
          title="Click any pixel on an image to copy its hex color and use it as the active stroke"
        >
          <IconEyedrop size={13}/>
          {pickerMode ? 'Picking…' : 'Pick color'}
        </button>

        {pickedColor && (
          <div className="tool-colorchip" title="Copied to clipboard">
            <span className="tool-colorchip-swatch" style={{ background: pickedColor }}/>
            <span>{pickedColor}</span>
          </div>
        )}

        {selected.size > 0 && (
          <>
            <div className="tb-tool-sep"/>
            <span className="tb-sel-info">{selected.size} selected</span>
            <button className="tb-tool" onClick={sendSelectionToBack} title="Send selected images to back">
              Back
            </button>
            <button className="tb-tool" onClick={bringSelectionToFront} title="Bring selected images to front">
              Front
            </button>
            {singleSelectedImage && (
              <label className="tool-colorchip board-width-control" title="Selected image opacity">
                <span>Opacity</span>
                <input
                  className="board-toolbar-range"
                  type="range"
                  min="10"
                  max="100"
                  value={Math.round((singleSelectedImage.opacity ?? 1) * 100)}
                  onChange={e => {
                    const opacity = Number(e.target.value) / 100;
                    setImages(prev => prev.map(image => (
                      image.id === singleSelectedImage.id ? { ...image, opacity } : image
                    )));
                  }}
                />
                <span>{Math.round((singleSelectedImage.opacity ?? 1) * 100)}%</span>
              </label>
            )}
            <button
              className="tb-tool"
              onClick={() => {
                setImages(prev => prev.filter(image => !selected.has(image.id)));
                setSelected(new Set());
              }}
              title="Delete selected images"
            >
              <IconTrash size={13}/>
              Delete
            </button>
          </>
        )}

        <div className="tb-tool-sep"/>

        <button className="tb-tool" onClick={() => exportBoardImage('png')} title="Export board as PNG">
          <IconSave size={13}/>
          PNG
        </button>

        <button className="tb-tool" onClick={() => exportBoardImage('jpeg')} title="Export board as JPEG">
          <IconSave size={13}/>
          JPG
        </button>

        <button className="tb-tool" onClick={saveBoard} title="Save board">
          <IconSave size={13}/>
          Save
        </button>

        <button className="tb-tool" onClick={loadBoard} title="Load board">
          <IconFolder size={13}/>
          Load
        </button>

        <button className="tb-tool" onClick={clearBoard} title="Clear board">
          <IconTrash size={13}/>
          Clear
        </button>

        <div className="tb-tool-spacer"/>
        <span className="tb-tool-info">
          {zoom}% · {images.length} img · {notes.length} note{notes.length === 1 ? '' : 's'} · {visibleAnnotationCount} mark{visibleAnnotationCount === 1 ? '' : 's'}
        </span>
      </div>

      <div
        ref={boardRef}
        className={`board${dragOver ? ' dragover' : ''}${pickerMode ? ' picker-mode' : ''}${tool !== 'select' ? ' drawing-mode' : ''}`}
        onMouseDown={onMouseDown}
        onDragEnter={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={e => {
          if (!boardRef.current?.contains(e.relatedTarget)) setDragOver(false);
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onDoubleClick={onDoubleClick}
        onContextMenu={e => e.preventDefault()}
      >
        <div ref={canvasRef} className="board-canvas">
          {sortedImages.map(img => (
            <div
              key={img.id}
              className={`board-item${img.locked ? ' locked' : ''}${selected.has(img.id) ? ' selected' : ''}`}
              style={{ left: img.x, top: img.y, width: img.w, height: img.h }}
              ref={el => {
                if (el) itemElsRef.current[img.id] = el;
              }}
              onMouseDown={e => startItemDrag(e, img.id)}
              onClick={e => onImageClick(e, img)}
            >
              {!pickerMode && !img.locked && tool === 'select' && (
                <div
                  className="board-item-drag-out"
                  title="Drag to Finder / Figma / any app"
                  onMouseDown={e => {
                    e.stopPropagation();
                    startExternalDrag(e, img);
                  }}
                >
                  ⤢
                </div>
              )}

              <img
                src={img.src}
                width={img.w}
                height={img.h}
                alt=""
                draggable={false}
                style={{
                  opacity: img.opacity ?? 1,
                  transform: `scaleX(${img.flipX ? -1 : 1}) scaleY(${img.flipY ? -1 : 1}) rotate(${img.rotation || 0}deg)`,
                  cursor: pickerMode ? 'crosshair' : undefined,
                }}
              />

              {!pickerMode && tool === 'select' && (
                <>
                  <div className="board-item-actions">
                    <button
                      className="bia-btn bia-flip"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.map(image => (
                          image.id === img.id ? { ...image, flipX: !image.flipX } : image
                        )));
                      }}
                      title="Flip horizontal"
                    >
                      ↔
                    </button>
                    <button
                      className="bia-btn bia-flip"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.map(image => (
                          image.id === img.id ? { ...image, flipY: !image.flipY } : image
                        )));
                      }}
                      title="Flip vertical"
                    >
                      ↕
                    </button>
                    <button
                      className="bia-btn bia-rotate"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.map(image => (
                          image.id === img.id
                            ? { ...image, rotation: ((image.rotation || 0) - 90 + 360) % 360 }
                            : image
                        )));
                      }}
                      title="Rotate 90 degrees counter-clockwise"
                    >
                      ↺
                    </button>
                    <button
                      className="bia-btn bia-rotate"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.map(image => (
                          image.id === img.id
                            ? { ...image, rotation: ((image.rotation || 0) + 90) % 360 }
                            : image
                        )));
                      }}
                      title="Rotate 90 degrees clockwise"
                    >
                      ↻
                    </button>
                    <button
                      className="bia-btn bia-lock"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.map(image => (
                          image.id === img.id ? { ...image, locked: !image.locked } : image
                        )));
                      }}
                      title={img.locked ? 'Unlock' : 'Lock'}
                    >
                      {img.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="bia-btn bia-del"
                      onClick={e => {
                        e.stopPropagation();
                        setImages(prev => prev.filter(image => image.id !== img.id));
                        setSelected(prev => {
                          const next = new Set(prev);
                          next.delete(img.id);
                          return next;
                        });
                        delete itemElsRef.current[img.id];
                      }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                  {!img.locked && <div className="board-item-resize" onMouseDown={e => startItemResize(e, img.id)}/>}
                </>
              )}
            </div>
          ))}

          {annotations.map(renderShapeAnnotation)}
          {draftAnnotation ? renderShapeAnnotation({ ...draftAnnotation, id: 'draft' }) : null}

          {notes.map(note => (
            <div
              key={note.id}
              id={`note-${note.id}`}
              className="board-note"
              style={{ left: note.x, top: note.y, width: note.w }}
            >
              <div className="board-note-header" onMouseDown={e => startNoteDrag(e, note.id)}>
                <span className="board-note-drag">⠿</span>
                <button
                  className="board-note-del"
                  onClick={() => setNotes(prev => prev.filter(item => item.id !== note.id))}
                >
                  ✕
                </button>
              </div>
              <textarea
                className="board-note-text"
                placeholder="Type a note…"
                value={note.text}
                onChange={e => setNotes(prev => prev.map(item => (
                  item.id === note.id ? { ...item, text: e.target.value } : item
                )))}
                onMouseDown={e => e.stopPropagation()}
              />
            </div>
          ))}
        </div>

        {rubberBand && rbStyle && (
          <div className="rubber-band" style={rbStyle}/>
        )}

        {images.length === 0 && notes.length === 0 && annotations.length === 0 && !draftAnnotation && (
          <div className="board-empty">
            <div className="board-empty-icon">⊞</div>
            <div className="board-empty-title">Drop images · Draw · Screenshot · Export</div>
            <div className="board-empty-hints">
              <span className="board-empty-hint">scroll to zoom · drag canvas to pan · Cmd+V paste</span>
              <span className="board-empty-hint">pen, shapes, labels, and eraser now live in the toolbar</span>
              <span className="board-empty-hint">double-click empty space to add a sticky note</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
