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