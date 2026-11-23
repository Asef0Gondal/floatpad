// Pure undo/redo history for the Board. Snapshots are {images, notes, annotations}.
// No React, no DOM — fully unit-testable. The component drives it via a ref and
// guards restores so they aren't recorded as new edits.

const MAX_DEPTH = 100;

export function createHistory(initial) {
  return { stack: [initial], index: 0 };
}

// Record a new snapshot, discarding any redo tail. Capped at MAX_DEPTH.
export function pushHistory(history, snapshot) {
  const stack = history.stack.slice(0, history.index + 1);
  stack.push(snapshot);
  while (stack.length > MAX_DEPTH) stack.shift();
  return { stack, index: stack.length - 1 };
}

export function undoHistory(history) {
  return history.index > 0 ? { ...history, index: history.index - 1 } : history;
}

export function redoHistory(history) {
  return history.index < history.stack.length - 1 ? { ...history, index: history.index + 1 } : history;
}

export function currentSnapshot(history) {
  return history.stack[history.index];
}

export function canUndo(history) {
  return history.index > 0;
}

export function canRedo(history) {
  return history.index < history.stack.length - 1;
}