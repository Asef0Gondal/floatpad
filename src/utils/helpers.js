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
export async function loadImageDimensions(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
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

// Flip the nth GFM task checkbox in Markdown source (Write preview).
// Skips fenced code blocks (marked renders no checkbox there) so the index
// stays aligned with the preview; also handles blockquoted task items.
export function toggleTaskAtIndex(text, idx) {
  const lines = String(text || '').split('\n');
  let inFence = false;
  let fenceChar = '';
  let n = -1;
  return lines.map(line => {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; }
      return line;
    }
    if (inFence) return line;
    return line.replace(/^(\s*(?:>\s*)*[-*+] \[)([ xX])(\])/, (m, a, b, c) => {
      n += 1;
      return n === idx ? a + (b === ' ' ? 'x' : ' ') + c : m;
    });
  }).join('\n');
}

// Potato mode opacity decision (pure): dim to 70% on entry, restore the
// stashed pre-potato value on exit. Returns the new opacity and stash.
export function potatoTransition(turningOn, currentOpacity, stashedOpacity) {
  return turningOn
    ? { opacity: 70, stash: currentOpacity }
    : { opacity: stashedOpacity, stash: stashedOpacity };
}

// Normalize a board image record, filling defaults (pure — used on add/restore).
export function normalizeImageModel(image, index = 0) {
  return {
    ...image,
    opacity: image.opacity ?? 1,
    z: image.z ?? index,
    gray: image.gray ?? false,
    source: image.source ?? null,
    pixelated: image.pixelated ?? false,
    comment: image.comment ?? '',
  };
}

// Detect links / emails / phone numbers in OCR text (pure, unit-tested).
export function detectContacts(text) {
  const uniq = a => [...new Set(a)];
  const t = String(text || '');
  const links = uniq(t.match(/https?:\/\/[^\s<>"')\]]+/g) || []);
  const emails = uniq((t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).map(e => e.replace(/[.,;:]+$/, '')));
  const phones = uniq(t.match(/\+?\d[\d\s().-]{7,}\d/g) || [])
    .map(p => p.trim())
    .filter(p => p.replace(/\D/g, '').length >= 8);
  return { links, emails, phones };
}
