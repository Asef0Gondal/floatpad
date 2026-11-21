// A floating "shot": one image in its own frameless always-on-top window.
// Drag anywhere to move; ✕ closes. (PureRef overlay mode / ScreenFloat shots.)
import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ipcRenderer } from '../ipc';

export default function ShotView() {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    ipcRenderer.invoke('shot-payload').then(setSrc).catch(() => {});
  }, []);

  const close = () => getCurrentWindow().close();

  return (
    <div className="shot-view" data-tauri-drag-region>
      {src ? (
        <img className="shot-img" src={src} alt="" draggable={false} data-tauri-drag-region />
      ) : (
        <div className="shot-empty">…</div>
      )}
      <button className="shot-close" onClick={close} title="Close shot">✕</button>
    </div>
  );
}