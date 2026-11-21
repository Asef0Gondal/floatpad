import { convertFileSrc } from '@tauri-apps/api/core';

// Format seconds → m:ss
export function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Normalize raw URL input → full URL
export function normalizeUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  if (/^(https?|file):\/\//i.test(raw)) return raw;
  if (/^[\w-][\w-]*(\.\w{2,})+/.test(raw)) return 'https://' + raw;
  return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
}

// Scale {w,h} so w ≤ maxW, preserving aspect ratio
export function scaleToFit(w, h, maxW = 400) {
  if (w <= maxW) return { w, h };
  return { w: maxW, h: Math.round(h * (maxW / w)) };
}

// Load image and resolve natural dimensions
export function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Cannot load: ' + src));
    img.src = src;
  });
}

// Convert a file path to a loadable URL (file:// on Electron, asset protocol on Tauri)
export function filePathToUrl(filePath) {
  return filePath ? convertFileSrc(filePath) : '';
}

// Convert a local file to base64 data URL via IPC
export async function fileToDataUrl(filePath, ipcRenderer) {
  const b64 = await ipcRenderer.invoke('file-read', filePath);
  if (!b64) return null;
  const ext = filePath.split('.').pop().toLowerCase();
  const mimeMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp',  tiff: 'image/tiff',
  };
  const mime = mimeMap[ext] || 'image/png';
  return `data:${mime};base64,${b64}`;
}

// Generate a simple unique ID
let _uid = 0;
export function uid() { return ++_uid; }

// After loading a saved board, keep new ids above every restored id
export function ensureUidAbove(n) { if (Number.isFinite(n) && n >= _uid) _uid = n; }

// Flip the nth GFM task checkbox in Markdown source (Write preview)
export function toggleTaskAtIndex(text, idx) {
  let n = -1;
  return String(text || '').replace(/^(\s*[-*+] \[)([ xX])(\])/gm, (m, a, b, c) => {
    n += 1;
    return n === idx ? a + (b === ' ' ? 'x' : ' ') + c : m;
  });
}

// Potato mode opacity decision (pure): dim to 70% on entry, restore the
// stashed pre-potato value on exit. Returns the new opacity and stash.
export function potatoTransition(turningOn, currentOpacity, stashedOpacity) {
  return turningOn
    ? { opacity: 70, stash: currentOpacity }
    : { opacity: stashedOpacity, stash: stashedOpacity };
}
