import React, { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from '../ipc';
import pkg from '../../package.json';

// Consolidated settings dialog: appearance, window behavior, data management, about.
export default function Settings({ theme, onToggleTheme, borderless, onToggleBorderless, potato, onTogglePotato, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const onCancel = () => closeRef.current();
    d.addEventListener('cancel', onCancel);
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, []);

  const clearBoard = async () => {
    if (await ipcRenderer.invoke('dialog-ask', 'Clear the board and its saved copy? This empties the board on screen and cannot be undone.', 'Clear saved board')) {
      setBusy('board');
      await ipcRenderer.invoke('board-autosave-clear'); // also resets the live board
      setBusy('');
    }
  };
  const clearShots = async () => {
    if (await ipcRenderer.invoke('dialog-ask', 'Delete ALL saved shots? This cannot be undone.', 'Clear shot library')) {
      setBusy('shots');
      await ipcRenderer.invoke('shots-clear');
      setBusy('');
    }
  };

  return (
    <dialog ref={ref} className="settings-dialog" aria-label="Settings" onClick={e => { if (e.target === ref.current) closeRef.current(); }}>
      <div className="settings-head">
        <span>Settings</span>
        <button className="settings-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="settings-row">
            <span>Theme</span>
            <button className="settings-btn" onClick={onToggleTheme}>{theme === 'dark' ? 'Dark' : 'Light'}</button>
          </div>
          <div className="settings-row">
            <span>Potato mode (low resource)</span>
            <button className={`settings-btn${potato ? ' on' : ''}`} onClick={onTogglePotato}>{potato ? 'On' : 'Off'}</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Window</h3>
          <div className="settings-row">
            <span>Borderless (hide titlebar)</span>
            <button className={`settings-btn${borderless ? ' on' : ''}`} onClick={onToggleBorderless}>{borderless ? 'On' : 'Off'}</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Data</h3>
          <div className="settings-row">
            <span>Autosaved board</span>
            <button className="settings-btn danger" onClick={clearBoard} disabled={busy === 'board'}>{busy === 'board' ? 'Clearing…' : 'Clear'}</button>
          </div>
          <div className="settings-row">
            <span>Shot library</span>
            <button className="settings-btn danger" onClick={clearShots} disabled={busy === 'shots'}>{busy === 'shots' ? 'Clearing…' : 'Clear all'}</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>About</h3>
          <div className="settings-about">
            FloatPad v{pkg.version} · native Rust / Tauri 2<br />
            Runs entirely on your machine — no account, no telemetry.
          </div>
        </section>
      </div>
    </dialog>
  );
}