import { describe, it, expect } from 'vitest';
import { formatTime, normalizeUrl, scaleToFit, filePathToUrl, uid } from '../src/utils/helpers';

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3600)).toBe('60:00');
  });
  it('guards invalid input', () => {
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('normalizeUrl', () => {
  it('passes through full URLs', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://x.dev/a?b=1')).toBe('http://x.dev/a?b=1');
  });
  it('adds https to bare domains', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('sub.example.co.uk')).toBe('https://sub.example.co.uk');
  });
  it('turns text into a search', () => {
    expect(normalizeUrl('hello world')).toBe('https://www.google.com/search?q=hello%20world');
  });
  it('rejects empty input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
    expect(normalizeUrl(null)).toBe('');
  });
});

describe('scaleToFit', () => {
  it('scales down preserving aspect', () => {
    expect(scaleToFit(800, 600, 400)).toEqual({ w: 400, h: 300 });
  });
  it('leaves small images alone', () => {
    expect(scaleToFit(100, 50, 400)).toEqual({ w: 100, h: 50 });
  });
});

describe('filePathToUrl (Tauri asset protocol)', () => {
  it('converts via convertFileSrc with encoding', () => {
    const url = filePathToUrl('/tmp/my video.mp4');
    expect(url).toContain('asset://localhost/');
    expect(url).toContain(encodeURIComponent('/tmp/my video.mp4'));
  });
  it('handles empty path', () => {
    expect(filePathToUrl('')).toBe('');
  });
});

describe('uid', () => {
  it('is unique', () => {
    expect(uid()).not.toBe(uid());
  });
});
describe('toggleTaskAtIndex', () => {
  const md = '- [ ] first\n  - [x] second\n* [ ] third\ntext';
  it('flips the nth task only', async () => {
    const { toggleTaskAtIndex } = await import('../src/utils/helpers');
    expect(toggleTaskAtIndex(md, 0)).toBe('- [x] first\n  - [x] second\n* [ ] third\ntext');
    expect(toggleTaskAtIndex(md, 1)).toBe('- [ ] first\n  - [ ] second\n* [ ] third\ntext');
    expect(toggleTaskAtIndex(md, 2)).toContain('* [x] third');
  });
  it('is a no-op out of range', async () => {
    const { toggleTaskAtIndex } = await import('../src/utils/helpers');
    expect(toggleTaskAtIndex(md, 9)).toBe(md);
    expect(toggleTaskAtIndex('', 0)).toBe('');
  });
});

describe('toggleTaskAtIndex — code blocks & blockquotes (audit #1)', () => {
  it('ignores task-like lines inside fenced code blocks', async () => {
    const { toggleTaskAtIndex } = await import('../src/utils/helpers');
    const md = '- [ ] real one\n- [x] real two\n\n```\n- [ ] fake in code\n- [ ] another fake\n```\n\n- [ ] real three';
    // 3 real checkboxes; index 2 must flip "real three", not a code-block line
    const out = toggleTaskAtIndex(md, 2);
    expect(out).toContain('- [x] real three');
    expect(out).toContain('- [ ] fake in code'); // untouched
    expect(out).toContain('- [ ] another fake'); // untouched
  });
  it('handles tilde fences and blockquoted tasks', async () => {
    const { toggleTaskAtIndex } = await import('../src/utils/helpers');
    const md = '> - [ ] quoted task\n\n~~~\n- [ ] fake\n~~~\n- [ ] plain';
    expect(toggleTaskAtIndex(md, 0)).toContain('> - [x] quoted task');
    expect(toggleTaskAtIndex(md, 1)).toContain('- [x] plain');
    expect(toggleTaskAtIndex(md, 1)).toContain('- [ ] fake');
  });
});

describe('board autosave round-trip (audit #2/#5)', () => {
  it('preserves all image fields through JSON + normalize', async () => {
    const { normalizeImageModel } = await import('../src/utils/helpers');
    const img = { id: 7, src: 'data:image/png;base64,AA', x: 10, y: 20, w: 100, h: 80,
      origW: 100, origH: 80, flipX: true, flipY: false, rotation: 90, opacity: 0.5,
      z: 3, gray: true, pixelated: true, comment: 'note', source: '/Volumes/x/a.png', locked: true };
    const restored = JSON.parse(JSON.stringify({ images: [img] })).images.map(normalizeImageModel)[0];
    expect(restored).toMatchObject(img);
  });
  it('fills defaults for a minimal record', async () => {
    const { normalizeImageModel } = await import('../src/utils/helpers');
    const r = normalizeImageModel({ id: 1, src: 'x', x: 0, y: 0, w: 10, h: 10 }, 5);
    expect(r.opacity).toBe(1);
    expect(r.z).toBe(5);
    expect(r.gray).toBe(false);
    expect(r.pixelated).toBe(false);
    expect(r.comment).toBe('');
    expect(r.source).toBeNull();
  });
});
