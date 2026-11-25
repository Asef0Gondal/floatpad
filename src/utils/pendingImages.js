// Bridges screenshot / grab-frame images to the Board even when it isn't mounted
// yet (lazy mode mounting). AppMain pushes; ImageBoard drains on mount.
export const boardSink = { add: null, queue: [] };
export function pushBoardImage(dataUrl) {
  if (!dataUrl) return;
  if (boardSink.add) boardSink.add(dataUrl);
  else boardSink.queue.push(dataUrl);
}
