const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width:    680,
    height:   560,
    minWidth: 320,
    minHeight:240,
    frame:    false,
    backgroundColor: '#0e0e0e',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
      webviewTag:       true,   // Required for Browser mode
    },
  });

  const isDev = !!process.env.APP_URL;
  if (isDev) {
    win.loadURL(process.env.APP_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true);
  win.setFullScreenable(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Re-enable mouse on focus (for detach mode)
app.on('browser-window-focus', () => {
  win?.setIgnoreMouseEvents(false);
});

// ── IPC handlers ────────────────────────────────────────────
ipcMain.on('win-close',    () => win?.close());
ipcMain.on('win-minimize', () => win?.minimize());

ipcMain.on('win-opacity', (_, v) => {
  win?.setOpacity(Math.max(0.15, Math.min(1, v / 100)));
});

ipcMain.on('win-detach', () => {
  // Click-through mode — click anywhere in another app to re-focus FloatPad
  win?.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on('win-resize', (_, w, h) => {
  win?.setSize(w, h);
  win?.center();
});
