import { vi } from 'vitest';

// Minimal Tauri frontend stub so src/ipc.js takes the Tauri branch in Node.
const calls = [];
globalThis.__ipcCalls = calls;
globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: vi.fn(async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'plugin:event|listen') return 1; // event id
      return null;
    }),
    transformCallback: vi.fn(() => 1),
    convertFileSrc: (p, proto = 'asset') => `${proto}://localhost/${encodeURIComponent(p)}`,
  },
  require: () => {
    throw new Error('Electron require must not run under Tauri');
  },
  addEventListener: () => {},
  devicePixelRatio: 2,
};