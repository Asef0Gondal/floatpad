import { describe, it, expect } from 'vitest';
import {
  createHistory, pushHistory, undoHistory, redoHistory,
  currentSnapshot, canUndo, canRedo,
} from '../src/utils/boardHistory';

const snap = n => ({ images: [{ id: n }], notes: [], annotations: [] });

describe('boardHistory', () => {
  it('starts at the initial snapshot with no undo/redo', () => {
    const h = createHistory(snap(0));
    expect(currentSnapshot(h).images[0].id).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('push advances and enables undo', () => {
    let h = createHistory(snap(0));
    h = pushHistory(h, snap(1));
    h = pushHistory(h, snap(2));
    expect(currentSnapshot(h).images[0].id).toBe(2);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it('undo walks back, redo walks forward', () => {
    let h = createHistory(snap(0));
    h = pushHistory(h, snap(1));
    h = pushHistory(h, snap(2));
    h = undoHistory(h);
    expect(currentSnapshot(h).images[0].id).toBe(1);
    expect(canRedo(h)).toBe(true);
    h = undoHistory(h);
    expect(currentSnapshot(h).images[0].id).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = undoHistory(h); // no-op at floor
    expect(currentSnapshot(h).images[0].id).toBe(0);
    h = redoHistory(h);
    h = redoHistory(h);
    expect(currentSnapshot(h).images[0].id).toBe(2);
    h = redoHistory(h); // no-op at ceiling
    expect(currentSnapshot(h).images[0].id).toBe(2);
  });

  it('a new push after undo discards the redo tail', () => {
    let h = createHistory(snap(0));
    h = pushHistory(h, snap(1));
    h = pushHistory(h, snap(2));
    h = undoHistory(h); // at 1
    h = pushHistory(h, snap(9)); // branch
    expect(currentSnapshot(h).images[0].id).toBe(9);
    expect(canRedo(h)).toBe(false);
    h = undoHistory(h);
    expect(currentSnapshot(h).images[0].id).toBe(1);
  });

  it('caps depth at 100 and keeps the newest', () => {
    let h = createHistory(snap(0));
    for (let i = 1; i <= 150; i++) h = pushHistory(h, snap(i));
    expect(h.stack.length).toBe(100);
    expect(currentSnapshot(h).images[0].id).toBe(150);
    // oldest retained is 51 (150 - 99)
    expect(h.stack[0].images[0].id).toBe(51);
  });

  it('never mutates the input history object', () => {
    const h = createHistory(snap(0));
    const frozen = JSON.stringify(h);
    pushHistory(h, snap(1));
    undoHistory(h);
    redoHistory(h);
    expect(JSON.stringify(h)).toBe(frozen);
  });
});