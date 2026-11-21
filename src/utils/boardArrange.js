// Pure arrangement math for the Board (PureRef/BeeRef parity).
// Every function takes (images, ids) and returns a NEW images array —
// no DOM, no mutation, fully unit-testable.
import { uid } from './helpers';

const PAD = 16;

function pick(images, ids) {
  const set = ids instanceof Set ? ids : new Set(ids);
  return images.filter(i => set.has(i.id));
}

function applyMap(images, map) {
  return images.map(i => (map.has(i.id) ? { ...i, ...map.get(i.id) } : i));
}

const avg = nums => nums.reduce((a, b) => a + b, 0) / nums.length;

export function alignImages(images, ids, edge) {
  const sel = pick(images, ids);
  if (sel.length < 2) return images;
  const minX = Math.min(...sel.map(i => i.x));
  const maxX = Math.max(...sel.map(i => i.x + i.w));
  const minY = Math.min(...sel.map(i => i.y));
  const maxY = Math.max(...sel.map(i => i.y + i.h));
  const map = new Map();
  for (const i of sel) {
    switch (edge) {
      case 'left': map.set(i.id, { x: minX }); break;
      case 'right': map.set(i.id, { x: maxX - i.w }); break;
      case 'top': map.set(i.id, { y: minY }); break;
      case 'bottom': map.set(i.id, { y: maxY - i.h }); break;
      case 'centerH': map.set(i.id, { x: (minX + maxX) / 2 - i.w / 2 }); break;
      case 'centerV': map.set(i.id, { y: (minY + maxY) / 2 - i.h / 2 }); break;
      default: break;
    }
  }
  return applyMap(images, map);
}

/** Lay the selection out in a neat row (h) or column (v) with equal gaps. */
export function distributeImages(images, ids, axis) {
  const sel = pick(images, ids).sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
  if (sel.length < 2) return images;
  let cursor = axis === 'h' ? sel[0].x : sel[0].y;
  const map = new Map();
  for (const i of sel) {
    map.set(i.id, axis === 'h' ? { x: cursor } : { y: cursor });
    cursor += (axis === 'h' ? i.w : i.h) + PAD;
  }
  return applyMap(images, map);
}

/** Resize the selection to a shared height / width / longest-side (average source), keeping aspect. */
export function normalizeImages(images, ids, mode) {
  const sel = pick(images, ids);
  if (sel.length < 2) return images;
  const target = mode === 'height'
    ? avg(sel.map(i => i.h))
    : mode === 'width'
      ? avg(sel.map(i => i.w))
      : avg(sel.map(i => Math.max(i.w, i.h)));
  const map = new Map();
  for (const i of sel) {
    const ratio = i.origW && i.origH ? i.origW / i.origH : i.w / i.h;
    let w;
    let h;
    if (mode === 'height') { h = target; w = target * ratio; }
    else if (mode === 'width') { w = target; h = target / ratio; }
    else if (ratio >= 1) { w = target; h = target / ratio; }
    else { h = target; w = target * ratio; }
    map.set(i.id, { w: Math.max(8, Math.round(w)), h: Math.max(8, Math.round(h)) });
  }
  return applyMap(images, map);
}

/** Pile the selection on its shared centroid (PureRef Stack). */
export function stackImages(images, ids) {
  const sel = pick(images, ids);
  if (sel.length < 2) return images;
  const cx = avg(sel.map(i => i.x + i.w / 2));
  const cy = avg(sel.map(i => i.y + i.h / 2));
  const map = new Map();
  for (const i of sel) map.set(i.id, { x: cx - i.w / 2, y: cy - i.h / 2 });
  return applyMap(images, map);
}

/**
 * Shelf-pack the selection into a viewW×viewH viewport (PureRef Arrange Optimal).
 * Tallest-first shelves; scales everything down uniformly if it doesn't fit.
 * `orderIds` overrides the sort (arrange by name / addition).
 */
export function packImages(images, ids, viewW, viewH, orderIds = null) {
  const sel = pick(images, ids);
  if (!sel.length) return images;
  const ordered = orderIds
    ? [...sel].sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id))
    : [...sel].sort((a, b) => b.h - a.h);

  const placements = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let maxRowW = 0;
  for (const i of ordered) {
    if (x > 0 && x + i.w > viewW) {
      maxRowW = Math.max(maxRowW, x - PAD);
      x = 0;
      y += shelfH + PAD;
      shelfH = 0;
    }
    placements.push({ id: i.id, x, y, w: i.w, h: i.h });
    x += i.w + PAD;
    shelfH = Math.max(shelfH, i.h);
  }
  maxRowW = Math.max(maxRowW, x - PAD);
  const totalH = y + shelfH;

  const scale = Math.min(1, (viewW - PAD) / Math.max(1, maxRowW), (viewH - PAD) / Math.max(1, totalH));
  const map = new Map();
  for (const p of placements) {
    map.set(p.id, {
      x: Math.round(p.x * scale),
      y: Math.round(p.y * scale),
      w: Math.max(8, Math.round(p.w * scale)),
      h: Math.max(8, Math.round(p.h * scale)),
    });
  }
  return applyMap(images, map);
}

/** Clone the selection with a small offset, on top, unlocked. Returns new ids too. */
export function duplicateImages(images, ids) {
  const sel = pick(images, ids);
  if (!sel.length) return { images, newIds: [] };
  let z = images.reduce((m, i) => Math.max(m, i.z ?? 0), 0);
  const taken = new Set(images.map(i => i.id));
  const freshId = () => {
    let id = uid();
    while (taken.has(id)) id = uid(); // loaded boards can carry ids from a previous session
    taken.add(id);
    return id;
  };
  const clones = sel.map(i => ({ ...i, id: freshId(), x: i.x + 24, y: i.y + 24, z: ++z, locked: false }));
  return { images: [...images, ...clones], newIds: clones.map(c => c.id) };
}