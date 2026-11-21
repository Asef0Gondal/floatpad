import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ipcRenderer, isTauri } from '../src/ipc';

const calls = () => globalThis.__ipcCalls;

it('detects the Tauri backend', () => {
  expect(isTauri).toBe(true);
});

describe('channel → command mapping', () => {
  beforeEach(() => { calls().length = 0; });

  const sendCases = [
    ['win-close', [], 'win_close', {}],
    ['win-opacity', [55], 'win_opacity', { v: 55 }],
    ['win-resize', [400, 320], 'win_resize', { w: 400, h: 320 }],
    ['win-detach', [true], 'win_detach', { on: true }],
    ['win-mini-toggle', [], 'win_mini_toggle', {}],
    ['panel-undock', ['board'], 'panel_undock', { id: 'board' }],
    ['panel-dock-back', ['web'], 'panel_dock_back', { id: 'web' }],
    ['screenshot-request', [], 'screenshot_request', {}],
    ['screenshot-done', ['data:image/png;base64,AA'], 'screenshot_done', { dataUrl: 'data:image/png;base64,AA' }],
  ];
  for (const [ch, args, cmd, expected] of sendCases) {
    it(`send ${ch} → ${cmd}`, () => {
      ipcRenderer.send(ch, ...args);
      expect(calls()[0]).toEqual({ cmd, args: expected });
    });
  }

  it('invoke capture-webview-rect maps targetId → label', async () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    await ipcRenderer.invoke('capture-webview-rect', 'web-main', rect);
    expect(calls()[0]).toEqual({ cmd: 'capture_webview_rect', args: { label: 'web-main', rect } });
  });

  it('invoke adblock channels', async () => {
    await ipcRenderer.invoke('adblock-site-status', 'https://x.com');
    expect(calls()[0]).toEqual({ cmd: 'adblock_site_status', args: { url: 'https://x.com' } });
    calls().length = 0;
    await ipcRenderer.invoke('adblock-toggle-site', 'https://x.com');
    expect(calls()[0].cmd).toBe('adblock_toggle_site');
  });

  it('dialog channels go through the dialog plugin', async () => {
    await ipcRenderer.invoke('dialog-open-video');
    expect(calls()[0].cmd).toBe('plugin:dialog|open');
  });

  it('file channels go through the fs plugin', async () => {
    await ipcRenderer.invoke('file-read-text', '/tmp/x.md');
    expect(calls()[0].cmd).toBe('plugin:fs|read_text_file');
  });

  it('unknown invoke channels reject loudly', async () => {
    await expect(ipcRenderer.invoke('does-not-exist')).rejects.toThrow('unknown channel');
  });

  it('on() listens on the same channel name', () => {
    ipcRenderer.on('set-mode', () => {});
    const c = calls().find((c) => c.cmd === 'plugin:event|listen');
    expect(c.args.event).toBe('set-mode');
  });
});

describe('contract: every IPC channel used by the UI is handled by the shim', () => {
  const files = ['src/App.jsx', ...readdirSync('src/modes').filter((f) => f.endsWith('.jsx')).map((f) => 'src/modes/' + f)];
  const used = new Map();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/ipcRenderer\.(invoke|send|on)\(\s*'([^']+)'/g)) {
      used.set(m[2], m[1]);
    }
  }

  it('scans a meaningful number of channels', () => {
    expect(used.size).toBeGreaterThan(15);
  });

  for (const [ch, kind] of used) {
    // board-drag-start needs DOM canvas/Image; exercised by the release smoke test
    if (ch === 'board-drag-start') continue;
    it(`${kind}('${ch}') is handled`, async () => {
      calls().length = 0;
      if (kind === 'on') {
        ipcRenderer.on(ch, () => {});
        expect(calls().some((c) => c.cmd === 'plugin:event|listen' && c.args.event === ch)).toBe(true);
      } else if (kind === 'send') {
        ipcRenderer.send(ch, 'x', {});
        expect(calls().length).toBeGreaterThan(0);
      } else {
        const args = ch === 'file-write-base64' ? ['x', 'AA=='] : ['x', {}];
        await ipcRenderer.invoke(ch, ...args).catch(() => {});
        expect(calls().length).toBeGreaterThan(0);
      }
    });
  }
});