/**
 * Format seconds → "m:ss"
 */
export function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Normalize a raw URL input:
 *   - Already http/https/file → return as-is
 *   - Looks like a domain (e.g. "youtube.com") → prepend https://
 *   - Anything else → Google search
 */
export function normalizeUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  if (/^(https?|file):\/\//i.test(raw)) return raw;
  if (/^[\w-][\w-]*(\.\w{2,})+/.test(raw)) return 'https://' + raw;
  return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
}

/**
 * Scale {w,h} down so w ≤ maxW, preserving aspect ratio.
 */
export function scaleToFit(w, h, maxW = 380) {
  if (w <= maxW) return { w, h };
  return { w: maxW, h: Math.round(h * (maxW / w)) };
}

/**
 * Load an <img> src and resolve with its natural dimensions.
 */
export function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}
