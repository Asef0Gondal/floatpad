// IPC shim over the Tauri Rust core. Channel names match the original API so
// the mode components stay unchanged.
import { invoke, Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tempDir } from '@tauri-apps/api/path';
import { open, save, ask, message } from '@tauri-apps/plugin-dialog';
import { readFile, readTextFile, writeFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

const IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'];
const VID_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'ogv'];

// send() channels → Rust commands + arg mapping
const SEND = {
  'win-close': ['win_close', () => ({})],
  'win-minimize': ['win_minimize', () => ({})],
  'win-show': ['win_show', () => ({})],
  'show-all': ['show_all', () => ({})],
  'win-opacity': ['win_opacity', (v) => ({ v })],
  'win-resize': ['win_resize', (w, h) => ({ w, h })],
  'win-detach': ['win_detach', (on) => ({ on })],
  'win-mini-toggle': ['win_mini_toggle', () => ({})],
  'panel-undock': ['panel_undock', (id) => ({ id })],
  'panel-dock-back': ['panel_dock_back', (id) => ({ id })],
  'screenshot-request': ['screenshot_request', () => ({})],
  'screenshot-cancel': ['screenshot_cancel', () => ({})],
  'screenshot-done': ['screenshot_done', (dataUrl) => ({ dataUrl })],
};

// Drag an image out of the Board to Finder / Figma / etc. (v1: startDrag).
// Writes the original bytes to a temp file, then starts a native OS drag with
// a PNG preview icon via tauri-plugin-drag.
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tiff',
};
function pngIcon(dataUrl) {
  if (dataUrl.startsWith('data:image/png;base64,')) return Promise.resolve(dataUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 64 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
async function dragOut(dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return;
  const [, mime, b64] = m;
  const ext = MIME_EXT[mime] || 'png';
  const name = `floatpad_drag_${Date.now()}.${ext}`;
  await writeFile(name, b64ToBytes(b64), { baseDir: BaseDirectory.Temp });
  const path = (await tempDir()) + name;
  await invoke('plugin:drag|start_drag', {
    item: [path],
    image: await pngIcon(dataUrl),
    onEvent: new Channel(),
  });
}

// invoke() channels served in JS through the official Tauri plugins
const JS_INVOKE = {
  'dialog-ask': (text, title) => ask(text, { title: title || 'FloatPad', kind: 'warning' }),
  'dialog-message': (text, title) => message(text, { title: title || 'FloatPad' }),
  'dialog-open-images': async () => {
    const r = await open({ title: 'Add images to board', multiple: true, filters: [{ name: 'Images', extensions: IMG_EXT }] });
    return r ? (Array.isArray(r) ? r : [r]) : [];
  },
  'dialog-open-video': async () => (await open({ title: 'Open video', filters: [{ name: 'Video', extensions: VID_EXT }] })) || null,
  'dialog-save-board': async () => (await save({ title: 'Save board', defaultPath: 'board.floatpad', filters: [{ name: 'FloatPad Board', extensions: ['floatpad'] }] })) || null,
  'dialog-open-board': async () => (await open({ title: 'Open board', filters: [{ name: 'FloatPad Board', extensions: ['floatpad'] }] })) || null,
  'dialog-save-export-image': async (format = 'png') => {
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const p = await save({
      title: 'Export board image',
      defaultPath: `board.${ext}`,
      filters: [{ name: ext === 'jpg' ? 'JPEG Image' : 'PNG Image', extensions: [ext] }],
    });
    return p ? { path: p, format: ext } : null;
  },
  'dialog-write-save': async () => {
    const p = await save({
      title: 'Save document',
      defaultPath: 'document',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'Fountain', extensions: ['fountain'] },
      ],
    });
    return p ? { path: p } : null;
  },
  'dialog-write-open': async () => (await open({ title: 'Open document', filters: [{ name: 'Text files', extensions: ['txt', 'md', 'fountain'] }] })) || null,
  'file-read': async (p) => { try { return bytesToB64(await readFile(p)); } catch { return null; } },
  'file-read-text': async (p) => { try { return await readTextFile(p); } catch { return null; } },
  'file-write': async (p, data) => { try { await writeTextFile(p, data); return true; } catch { return false; } },
  'file-write-base64': async (p, b64) => { try { await writeFile(p, b64ToBytes(b64)); return true; } catch { return false; } },
};

// invoke() channels served by Rust
const RUST_INVOKE = {
  'ocr-image': ['ocr_image', (dataUrl) => ({ dataUrl })],
  'shot-open': ['shot_open', (dataUrl, w, h) => ({ dataUrl, w, h })],
  'shot-payload': ['shot_payload', () => ({})],
  'web-create': ['web_create', (label, url) => ({ window: getCurrentWindow().label, label, url, x: 0, y: 0, w: 1, h: 1 })],
  'web-destroy': ['web_destroy', (label) => ({ label })],
  'gif-frames': ['gif_frames', (dataUrl) => ({ dataUrl })],
  'reveal-path': ['reveal_path', (path) => ({ path })],
  'open-external': ['open_external', (url) => ({ url })],
  'win-always-bottom': ['win_always_bottom', (on) => ({ on })],
  'win-lock': ['win_lock', (on) => ({ on })],
  'capture-screen': ['capture_screen', () => ({})],
  'capture-webview-rect': ['capture_webview_rect', (label, rect) => ({ label, rect })],
  'adblock-site-status': ['adblock_site_status', (url) => ({ url })],
  'adblock-toggle-site': ['adblock_toggle_site', (url) => ({ url })],
};

function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

const listeners = new Map(); // handler → unlisten promise

export const ipcRenderer = {
  send(channel, ...args) {
    if (channel === 'board-drag-start') {
      dragOut(args[0]).catch((e) => console.error('board-drag-start', e));
      return;
    }
    const entry = SEND[channel];
    if (!entry) return;
    invoke(entry[0], entry[1](...args)).catch((e) => console.error(channel, e));
  },
  invoke(channel, ...args) {
    if (JS_INVOKE[channel]) return JS_INVOKE[channel](...args);
    const entry = RUST_INVOKE[channel];
    if (!entry) return Promise.reject(new Error('unknown channel: ' + channel));
    return invoke(entry[0], entry[1](...args));
  },
  on(channel, handler) {
    listeners.set(handler, listen(channel, (e) => handler(null, e.payload)));
    return this;
  },
  removeListener(channel, handler) {
    const p = listeners.get(handler);
    if (p) { listeners.delete(handler); p.then((un) => un()); }
    return this;
  },
};