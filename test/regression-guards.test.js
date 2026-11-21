import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { potatoTransition } from '../src/utils/helpers';

// Audit #1: native window.confirm/prompt/alert are dead on macOS WKWebView.
// Guard against them creeping back into the UI — use the dialog plugin instead.
describe('no raw JS dialogs in the UI (audit #1)', () => {
  const files = ['src/App.jsx', ...readdirSync('src/modes').filter(f => f.endsWith('.jsx')).map(f => 'src/modes/' + f)];
  for (const f of files) {
    it(`${f} uses no window.confirm/prompt/alert`, () => {
      const s = readFileSync(f, 'utf8');
      expect(s).not.toMatch(/window\.(confirm|prompt|alert)\s*\(/);
      expect(s).not.toMatch(/(?<![.\w])(alert|confirm|prompt)\s*\(/);
    });
  }
});

// Audit #5: potato mode must restore the prior opacity, not stay at 70%.
describe('potatoTransition (audit #5)', () => {
  it('dims to 70 and stashes the current opacity on entry', () => {
    expect(potatoTransition(true, 100, 100)).toEqual({ opacity: 70, stash: 100 });
    expect(potatoTransition(true, 45, 100)).toEqual({ opacity: 70, stash: 45 });
  });
  it('restores the stashed opacity on exit', () => {
    expect(potatoTransition(false, 70, 100)).toEqual({ opacity: 100, stash: 100 });
    expect(potatoTransition(false, 70, 45)).toEqual({ opacity: 45, stash: 45 });
  });
  it('round-trips back to the original value', () => {
    const on = potatoTransition(true, 80, 80);
    const off = potatoTransition(false, on.opacity, on.stash);
    expect(off.opacity).toBe(80);
  });
});
