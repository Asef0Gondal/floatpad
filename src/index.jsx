import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import { getInitialTheme, applyTheme } from './theme';

// Apply theme before React renders to avoid flash
applyTheme(getInitialTheme());

// Relay JS errors to the Rust log so failures are visible in the terminal
if (window.__TAURI_INTERNALS__) {
  const relay = (msg) => window.__TAURI_INTERNALS__.invoke('log_js', { level: 'error', msg: String(msg) }).catch(() => {});
  window.addEventListener('error', (e) => relay(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => relay(`unhandled rejection: ${e.reason?.message || e.reason}`));
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
