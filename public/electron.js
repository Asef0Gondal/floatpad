const {
  app, BrowserWindow, ipcMain, dialog, screen,
  globalShortcut, Tray, Menu, nativeImage, desktopCapturer, session, webContents
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

let win, tray;
let screenshotWin = null;

// ── Persisted window bounds ───────────────────────────────────────────────────
const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json');

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')); } catch { return {}; }
}
function savePrefs(data) {
  try { fs.writeFileSync(PREFS_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

const AD_HOST_PATTERNS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'adsystem.google.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'ads-twitter.com',
  'ads.linkedin.com',
  'connect.facebook.net',
  'facebook.com/tr',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'hotjar.com',
  'segment.com',
];

function getHost(raw) {
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

function hostMatchesRule(host, rule) {
  return host === rule || host.endsWith(`.${rule}`) || host.includes(rule);
}

function getAdblockAllowlist() {
  return new Set(loadPrefs().adblockAllowedHosts || []);
}

function setAdblockHostAllowed(host, disabled) {
  const prefs = loadPrefs();
  const next = new Set(prefs.adblockAllowedHosts || []);
  if (disabled) next.add(host);
  else next.delete(host);
  savePrefs({ ...prefs, adblockAllowedHosts: [...next].sort() });
}

function isRequestWhitelisted(details) {
  const allowlist = getAdblockAllowlist();
  if (!allowlist.size) return false;

  const relatedHosts = [
    getHost(details.initiator),
    getHost(details.referrer),
    getHost(details.url),
  ].filter(Boolean);

  return relatedHosts.some(host => allowlist.has(host));
}

function shouldBlockRequest(details) {
  if (!details?.url || details.resourceType === 'mainFrame') return false;
  if (isRequestWhitelisted(details)) return false;
  const host = getHost(details.url);
  if (!host) return false;
  return AD_HOST_PATTERNS.some(rule => hostMatchesRule(host, rule));
}

function initAdblock() {
  const persistSession = session.fromPartition('persist:floatpad');
  if (persistSession.__floatpadAdblockReady) return;
  persistSession.__floatpadAdblockReady = true;
  persistSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: shouldBlockRequest(details) });
  });
}

// ── Tray icon (16×16 template PNG) ───────────────────────────────────────────
function makeTrayIcon() {
  // Tiny "F" on transparent bg — works as macOS template image
  const SIZE = 16;
  const buf  = Buffer.alloc(SIZE * SIZE * 4, 0);
  // Draw a minimal "F" shape
  const pix  = (x, y, r, g, b, a) => {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a;
  };
  for (let y = 2; y < 14; y++) pix(5, y, 255, 255, 255, 220);   // vertical bar
  for (let x = 5; x < 12; x++) pix(x, 2, 255, 255, 255, 220);   // top bar
  for (let x = 5; x < 10; x++) pix(x, 7, 255, 255, 255, 180);   // mid bar

  // Encode as raw PNG via nativeImage
  const img = nativeImage.createFromBuffer(buf, { width: SIZE, height: SIZE, scaleFactor: 1 });
  return img;
}

// ── Main window ───────────────────────────────────────────────────────────────
function createWindow() {
  const prefs = loadPrefs();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const bounds = {
    width:  prefs.width  || 700,
    height: prefs.height || 560,
    x:      prefs.x      ?? Math.round((sw - 700) / 2),
    y:      prefs.y      ?? Math.round((sh - 560) / 2),
  };

  win = new BrowserWindow({
    ...bounds,
    minWidth:  320,
    minHeight: 260,
    frame:     false,
    backgroundColor: '#0e0e0e',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
      webviewTag:       true,
      spellcheck:       false,
    },
  });

  const isDev = !!process.env.APP_URL;
  isDev
    ? win.loadURL(process.env.APP_URL)
    : win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreenable(false);

  // Save position/size on move/resize
  const saveBounds = () => {
    if (!win) return;
    const b = win.getBounds();
    savePrefs({ ...loadPrefs(), ...b });
  };
  win.on('moved',   saveBounds);
  win.on('resized', saveBounds);
  win.on('focus',   () => win.setIgnoreMouseEvents(false));
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  try {
    const icon = makeTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('FloatPad');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show FloatPad', click: showWin },
      { label: 'Board',  click: () => { showWin(); win?.webContents.send('set-mode','board'); } },
      { label: 'Video',  click: () => { showWin(); win?.webContents.send('set-mode','video'); } },
      { label: 'Web',    click: () => { showWin(); win?.webContents.send('set-mode','web');   } },
      { type: 'separator' },
      { label: 'Quit',   click: () => { app.exit(0); } },
    ]));
    tray.on('click', showWin);
  } catch (e) {
    console.error('Tray error:', e.message);
  }
}

function showWin() {
  if (!win) return;
  win.show(); win.focus();
}

// ── Screenshot — capture happens in MAIN process (desktopCapturer removed from renderer in Electron 16+) ──
ipcMain.handle('capture-screen', async () => {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const src = sources.find(s => s.name === 'Entire Screen' || s.name.toLowerCase().includes('screen')) || sources[0];
  return src ? src.thumbnail.toDataURL() : null;
});

function openScreenshot() {
  if (screenshotWin) { screenshotWin.close(); screenshotWin = null; }
  const { width, height } = screen.getPrimaryDisplay().bounds;
  screenshotWin = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  screenshotWin.loadFile(path.join(__dirname, 'screenshot.html'));
  screenshotWin.setAlwaysOnTop(true, 'screen-saver');
  screenshotWin.setVisibleOnAllWorkspaces(true);
  screenshotWin.on('closed', () => { screenshotWin = null; });
}

ipcMain.on('screenshot-request', openScreenshot);
ipcMain.on('screenshot-cancel',  () => { screenshotWin?.close(); screenshotWin = null; });
ipcMain.on('screenshot-done', (_, dataUrl) => {
  screenshotWin?.close(); screenshotWin = null;
  win?.webContents.send('screenshot-result', dataUrl);
  showWin();
});

// ── Drag image out of board → OS ─────────────────────────────────────────────
ipcMain.on('board-drag-start', (event, dataUrl) => {
  const base64  = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const tmpFile = path.join(os.tmpdir(), `floatpad_drag_${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(base64, 'base64'));
    const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 64, height: 64 });
    event.sender.startDrag({ file: tmpFile, icon });
  } catch (e) { console.error('drag-start error:', e.message); }
});

// ── Mini-mode toggle ──────────────────────────────────────────────────────────
let miniMode = false;
let prevBounds = null;

ipcMain.on('win-mini-toggle', () => {
  if (!win) return;
  if (!miniMode) {
    prevBounds = win.getBounds();
    win.setSize(prevBounds.width, 36, true);
    miniMode = true;
  } else {
    if (prevBounds) win.setSize(prevBounds.width, prevBounds.height, true);
    miniMode = false;
  }
  win.webContents.send('mini-mode', miniMode);
});

function getAllFloatPadWindows() {
  return [win, ...Object.values(panelWindows)].filter(w => w && !w.isDestroyed());
}

function showAllWindows() {
  const windows = getAllFloatPadWindows();
  if (!windows.length) return;
  windows.forEach(w => w.show());
  const [mainWindow] = windows;
  if (mainWindow) mainWindow.focus();
}

function hideAllWindows() {
  for (const w of getAllFloatPadWindows()) {
    w.hide();
  }
}

function toggleAllWindows() {
  const windows = getAllFloatPadWindows();
  if (!windows.length) return;
  const anyVisible = windows.some(w => w.isVisible());
  if (anyVisible) hideAllWindows();
  else showAllWindows();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  initAdblock();
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleAllWindows);
  globalShortcut.register('CommandOrControl+Shift+S', openScreenshot);
});

app.on('will-quit',         () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* tray keeps alive */ });
app.on('activate',          showWin);

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('win-close',    () => win?.hide());
ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-show',     showWin);

ipcMain.on('win-opacity', (_, v) =>
  win?.setOpacity(Math.max(0.1, Math.min(1, v / 100))));

ipcMain.on('win-resize', (_, w, h) => {
  win?.setSize(w, h, true);
  win?.center();
  miniMode = false;
});

ipcMain.on('win-detach', (_, on) =>
  on ? win?.setIgnoreMouseEvents(true, { forward: true })
     : win?.setIgnoreMouseEvents(false));

// ── File dialogs ──────────────────────────────────────────────────────────────
ipcMain.handle('dialog-open-images', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Add images to board', properties: ['openFile','multiSelections'],
    filters: [{ name:'Images', extensions:['jpg','jpeg','png','gif','webp','svg','bmp','tiff'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog-open-video', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open video', properties: ['openFile'],
    filters: [{ name:'Video', extensions:['mp4','mov','mkv','avi','webm','m4v','wmv','flv','ogv'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog-save-board', async () => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save board', defaultPath: 'board.floatpad',
    filters: [{ name:'FloatPad Board', extensions:['floatpad'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('dialog-open-board', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open board', properties: ['openFile'],
    filters: [{ name:'FloatPad Board', extensions:['floatpad'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog-save-export-image', async (_, format = 'png') => {
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const r = await dialog.showSaveDialog(win, {
    title: 'Export board image',
    defaultPath: `board.${ext}`,
    filters: [{
      name: format === 'jpeg' ? 'JPEG Image' : 'PNG Image',
      extensions: [ext],
    }],
  });
  return r.canceled ? null : { path: r.filePath, format: ext };
});

ipcMain.handle('file-read', async (_, p) => {
  try { return fs.readFileSync(p).toString('base64'); } catch { return null; }
});
ipcMain.handle('file-write', async (_, p, data) => {
  try { fs.writeFileSync(p, data, 'utf8'); return true; } catch { return false; }
});
ipcMain.handle('file-write-base64', async (_, p, data) => {
  try { fs.writeFileSync(p, Buffer.from(data, 'base64')); return true; } catch { return false; }
});
ipcMain.handle('file-read-text', async (_, p) => {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
});
ipcMain.handle('capture-webview-rect', async (_, targetId, rect) => {
  try {
    const contents = webContents.fromId(targetId);
    if (!contents || !rect) return null;
    const image = await contents.capturePage({
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    return image.toDataURL();
  } catch {
    return null;
  }
});
ipcMain.handle('adblock-site-status', async (_, rawUrl) => {
  const host = getHost(rawUrl);
  return { host, disabled: !!host && getAdblockAllowlist().has(host) };
});
ipcMain.handle('adblock-toggle-site', async (_, rawUrl) => {
  const host = getHost(rawUrl);
  if (!host) return { host: '', disabled: false };
  const currentlyDisabled = getAdblockAllowlist().has(host);
  const nextDisabled = !currentlyDisabled;
  setAdblockHostAllowed(host, nextDisabled);
  return { host, disabled: nextDisabled };
});

// ── Undocked panel windows ────────────────────────────────────────────────────
const panelWindows = {};  // { board: BrowserWindow, video: ..., web: ..., write: ... }

const PANEL_DEFAULTS = {
  board: { w:700, h:560 },
  video: { w:680, h:520 },
  web:   { w:780, h:640 },
  write: { w:680, h:700 },
};

ipcMain.on('panel-undock', (_, panelId) => {
  if (panelWindows[panelId]) {
    panelWindows[panelId].focus();
    return;
  }

  const def = PANEL_DEFAULTS[panelId] || { w:700, h:560 };
  const prefs = loadPrefs();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const pw = new BrowserWindow({
    width:  prefs[`${panelId}_w`] || def.w,
    height: prefs[`${panelId}_h`] || def.h,
    x: Math.round((sw - def.w) / 2),
    y: Math.round((sh - def.h) / 2),
    minWidth:  300, minHeight:220,
    frame:     false, backgroundColor: '#111215',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true, contextIsolation: false,
      webviewTag: true, spellcheck: false,
    },
  });

  const isDev = !!process.env.APP_URL;
  const url = isDev
    ? `${process.env.APP_URL}?panel=${panelId}`
    : `file://${path.join(__dirname, '../dist/index.html')}?panel=${panelId}`;

  pw.loadURL(url);
  pw.setAlwaysOnTop(true, 'floating');
  pw.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pw.setFullScreenable(false);

  pw.on('focus', () => pw.setIgnoreMouseEvents(false));
  pw.on('closed', () => {
    delete panelWindows[panelId];
    // Save final size
    try {
      const b = pw.getBounds();
      savePrefs({ ...loadPrefs(), [`${panelId}_w`]: b.width, [`${panelId}_h`]: b.height });
    } catch {}
    // Notify main window
    win?.webContents.send('panel-closed', panelId);
  });

  const savePBounds = () => {
    if (!pw || pw.isDestroyed()) return;
    const b = pw.getBounds();
    savePrefs({ ...loadPrefs(), [`${panelId}_w`]: b.width, [`${panelId}_h`]: b.height });
  };
  pw.on('moved',   savePBounds);
  pw.on('resized', savePBounds);

  panelWindows[panelId] = pw;
  win?.webContents.send('panel-undocked', panelId);
});

ipcMain.on('panel-dock-back', (_, panelId) => {
  if (panelWindows[panelId]) {
    panelWindows[panelId].close();
  }
  win?.webContents.send('panel-docked', panelId);
  showWin();
});

// Show/hide ALL FloatPad windows at once
// Override the global shortcut to hit all windows
ipcMain.on('show-all', () => {
  showAllWindows();
});

// Write-mode file dialogs
ipcMain.handle('dialog-write-save', async (_, mode) => {
  const filters = mode === 'script'
    ? [
        { name:'PDF', extensions:['pdf'] },
        { name:'Text', extensions:['txt'] },
        { name:'Markdown', extensions:['md'] },
      ]
    : [
        { name:'Markdown', extensions:['md'] },
        { name:'Text', extensions:['txt'] },
      ];

  const r = await dialog.showSaveDialog(win, {
    title: 'Save document', defaultPath: 'document',
    filters,
  });
  if (r.canceled) return null;
  return { path: r.filePath, isPdf: r.filePath.endsWith('.pdf') };
});

ipcMain.handle('dialog-write-open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open document', properties: ['openFile'],
    filters: [{ name:'Text files', extensions:['txt','md','fountain'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});
