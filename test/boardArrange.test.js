import { describe, it, expect } from 'vitest';
import {
  alignImages, distributeImages, normalizeImages, stackImages, packImages, duplicateImages,
} from '../src/utils/boardArrange';

const img = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, origW: w, origH: h, z: id, ...extra });
const ids = (...n) => new Set(n);
const byId = (arr, id) => arr.find(i => i.id === id);

describe('alignImages', () => {
  const base = [img(1, 0, 0, 100, 50), img(2, 200, 100, 50, 80), img(3, 400, 400, 10, 10)];
  it('aligns left edges to the selection minimum', () => {
    const r = alignImages(base, ids(1, 2), 'left');
    expect(byId(r, 1).x).toBe(0);
    expect(byId(r, 2).x).toBe(0);
    expect(byId(r, 3).x).toBe(400); // untouched
  });
  it('aligns right edges to the selection maximum', () => {
    const r = alignImages(base, ids(1, 2), 'right');
    expect(byId(r, 1).x + byId(r, 1).w).toBe(250);
    expect(byId(r, 2).x + byId(r, 2).w).toBe(250);
  });
  it('aligns top / bottom', () => {
    expect(byId(alignImages(base, ids(1, 2), 'top'), 2).y).toBe(0);
    expect(byId(alignImages(base, ids(1, 2), 'bottom'), 1).y + 50).toBe(180);
  });
  it('centers horizontally and vertically', () => {
    const r = alignImages(base, ids(1, 2), 'centerH');
    expect(byId(r, 1).x + 50).toBe(125);
    expect(byId(r, 2).x + 25).toBe(125);
    const v = alignImages(base, ids(1, 2), 'centerV');
    expect(byId(v, 1).y + 25).toBe(90);
    expect(byId(v, 2).y + 40).toBe(90);
  });
  it('is a no-op for fewer than two items and never mutates', () => {
    const frozen = JSON.stringify(base);
    expect(alignImages(base, ids(1), 'left')).toBe(base);
    alignImages(base, ids(1, 2), 'left');
    expect(JSON.stringify(base)).toBe(frozen);
  });
});

describe('distributeImages', () => {
  it('lays out a row with equal gaps, sorted by position', () => {
    const base = [img(1, 300, 0, 100, 50), img(2, 0, 999, 50, 80)];
    const r = distributeImages(base, ids(1, 2), 'h');
    expect(byId(r, 2).x).toBe(0);
    expect(byId(r, 1).x).toBe(50 + 16);
    expect(byId(r, 1).y).toBe(0); // row keeps each item's y? no — row aligns nothing on y
  });
  it('lays out a column', () => {
    const base = [img(1, 0, 500, 100, 50), img(2, 0, 0, 50, 80)];
    const r = distributeImages(base, ids(1, 2), 'v');
    expect(byId(r, 2).y).toBe(0);
    expect(byId(r, 1).y).toBe(80 + 16);
  });
});

describe('normalizeImages', () => {
  const base = [img(1, 0, 0, 100, 50), img(2, 0, 0, 200, 200)];
  it('matches heights keeping aspect', () => {
    const r = normalizeImages(base, ids(1, 2), 'height');
    expect(byId(r, 1).h).toBe(125);
    expect(byId(r, 1).w).toBe(250);
    expect(byId(r, 2).h).toBe(125);
    expect(byId(r, 2).w).toBe(125);
  });
  it('matches widths keeping aspect', () => {
    const r = normalizeImages(base, ids(1, 2), 'width');
    expect(byId(r, 1).w).toBe(150);
    expect(byId(r, 1).h).toBe(75);
  });
  it('matches longest side', () => {
    const r = normalizeImages(base, ids(1, 2), 'size');
    expect(Math.max(byId(r, 1).w, byId(r, 1).h)).toBe(150);
    expect(Math.max(byId(r, 2).w, byId(r, 2).h)).toBe(150);
  });
});

describe('stackImages', () => {
  it('piles everything on the shared centroid', () => {
    const base = [img(1, 0, 0, 100, 100), img(2, 100, 100, 100, 100)];
    const r = stackImages(base, ids(1, 2));
    expect(byId(r, 1).x).toBe(50);
    expect(byId(r, 2).x).toBe(50);
    expect(byId(r, 1).y).toBe(50);
  });
});

describe('packImages', () => {
  it('packs into shelves inside the viewport without overlap', () => {
    const base = [img(1, 999, 999, 300, 200), img(2, 999, 999, 300, 200), img(3, 999, 999, 300, 200)];
    const r = packImages(base, ids(1, 2, 3), 700, 500);
    const sel = r.filter(i => [1, 2, 3].includes(i.id));
    for (const a of sel) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(700);
      expect(a.y + a.h).toBeLessThanOrEqual(500);
      for (const b of sel) {
        if (a.id === b.id) continue;
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });
  it('scales down uniformly when the content cannot fit', () => {
    const base = [img(1, 0, 0, 1000, 1000), img(2, 0, 0, 1000, 1000)];
    const r = packImages(base, ids(1, 2), 400, 400);
    const a = byId(r, 1);
    const b = byId(r, 2);
    expect(a.w).toBeLessThan(1000);
    expect(a.w / a.h).toBeCloseTo(1);
    expect(a.y + a.h).toBeLessThanOrEqual(400);
    expect(b.y + b.h).toBeLessThanOrEqual(400);
  });
  it('respects an explicit order', () => {
    const base = [img(1, 0, 0, 100, 300), img(2, 0, 0, 100, 100)];
    const r = packImages(base, ids(1, 2), 1000, 1000, [2, 1]);
    expect(byId(r, 2).x).toBe(0); // first in order starts the first shelf
    expect(byId(r, 1).x).toBe(116);
  });
});

describe('duplicateImages', () => {
  it('clones with offset, new ids, top z, unlocked; originals untouched', () => {
    const base = [img(1, 10, 10, 100, 100, { locked: true, z: 5 })];
    const { images: r, newIds } = duplicateImages(base, ids(1));
    expect(r).toHaveLength(2);
    expect(newIds).toHaveLength(1);
    expect(newIds[0]).not.toBe(1);
    const clone = byId(r, newIds[0]);
    expect(clone.x).toBe(34);
    expect(clone.y).toBe(34);
    expect(clone.z).toBeGreaterThan(5);
    expect(clone.locked).toBe(false);
    expect(byId(r, 1).x).toBe(10);
    expect(byId(r, 1).locked).toBe(true);
  });
  it('returns the same array when nothing is selected', () => {
    const base = [img(1, 0, 0, 10, 10)];
    expect(duplicateImages(base, ids()).images).toBe(base);
  });
});
describe('packImages view anchor', () => {
  it('offsets packed positions by the anchor (stays on-screen when panned)', async () => {
    const { packImages } = await import('../src/utils/boardArrange');
    const imgs = [
      { id: 1, x: 500, y: 400, w: 100, h: 80 },
      { id: 2, x: 700, y: 600, w: 120, h: 90 },
    ];
    const ids = new Set([1, 2]);
    const atOrigin = packImages(imgs, ids, 800, 600);
    const anchored = packImages(imgs, ids, 800, 600, null, 1000, 2000);
    const o1 = atOrigin.find(i => i.id === 1);
    const a1 = anchored.find(i => i.id === 1);
    expect(a1.x - o1.x).toBe(1000);
    expect(a1.y - o1.y).toBe(2000);
  });
});
