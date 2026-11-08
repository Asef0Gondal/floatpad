<p align="center">
  <img src="assets/icon.png" width="104" alt="FloatPad app icon" />
</p>

<h1 align="center">FloatPad</h1>

<p align="center">
  A lean, always-on-top reference pad for macOS.<br/>
  Image board, video player, real web browser and writing pad — in one floating overlay.
</p>

<p align="center">
  <a href="https://github.com/Asef0Gondal/floatpad"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Asef0Gondal%2Ffloatpad-181717?logo=github&logoColor=white"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple&logoColor=white">
  <a href="https://github.com/Asef0Gondal/floatpad/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Asef0Gondal/floatpad/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## Why FloatPad

Reference material is scattered across Finder, YouTube, browser tabs and design files. Every lookup costs an alt-tab, a window resize, and a lost train of thought.

FloatPad keeps the reference **on top of everything else**: a frameless overlay that stays above your work, can drop to **15% opacity**, and can become **click-through** so it never blocks the app underneath. It lives in the menu bar instead of the Dock and is summoned with a global shortcut.

Built for video editors, designers and developers who need a second screen that never takes focus away from the main one.

## Modes

| Mode | What it does |
| --- | --- |
| **Board** | Infinite canvas for images, annotations, sticky notes and screenshots |
| **Video** | Local files or direct URLs, with A-B loop, frame stepping and frame grabbing |
| **Web** | A real Chromium browser with bookmarks, reader mode and image-to-Board actions |
| **Write** | Screenplay-format or Markdown writing pad with autosave and a focus timer |

### Board

- Drop images from Finder, drag them from a browser, or paste with `⌘V`
- Scroll / pinch to zoom toward the cursor, drag to pan, `⌘0` to zoom to fit
- Annotation tools: pen, eraser, rectangle, ellipse, arrow, text, and a pixel eyedropper
- Adjustable stroke color and width, per-image opacity, bring-to-front / send-to-back
- Double-click empty space to add a sticky note; select multiple images with `⇧`-click or rubber-band
- Drag an image out to Finder / Figma using the corner handle
- Save and reload boards as `.floatpad` files; export the whole board as PNG or JPEG
- Capture any screen region with `⌘⇧S` and drop it straight onto the board

### Video

- Open a local video file or paste a direct video URL
- Full transport: play/pause, seek, volume, mute, frame-by-frame stepping, `0.25×–2×` speed
- **A-B loop** for repeating a section while following along
- **Grab frame → Board** to keep a still reference next to your work
- Picture-in-Picture support
- Pauses automatically when the tab is hidden or a CPU-heavy task needs the resources

### Web

- Embedded Chromium (`webview`) — YouTube, documentation, Notion and most sites work normally
- URL bar with back / forward / reload, plus persistent bookmarks (`⌘D`, `⌘1–9`)
- **Reader mode** strips page clutter for long-form reading
- **Ad and tracker blocking** at the session level, with a per-site allowlist toggle
- Right-click any image to send it to the Board
- Step through embedded video frame-by-frame and grab a frame to the Board

### Write

- **Screenplay mode**: `Tab` cycles element types — SCENE → Action → CHARACTER → Dialogue → (parenthetical) — with automatic uppercase scene headings
- **Markdown / freeform mode** for notes and drafts
- Live word/page statistics, autoreload of the last document, and autosave to local storage
- Open and save `.txt`, `.md` and Fountain files through native dialogs
- Built-in 25-minute focus timer

## Window & workflow

- **Always on top**, visible on every Space, including full-screen apps
- **Opacity** slider from 100% down to 15%
- **Detach** toggles click-through, with mouse events forwarded to the window underneath
- **Mini mode** collapses the window to its title bar for a near-invisible strip
- **Window sizes**: Tiny `400×320`, Small `580×440`, Medium `700×560`, Large `960×700`, Wide `1100×620`
- **Standalone panels**: undock any mode into its own floating window and dock it back later
- **Dark / light themes** with the choice persisted
- **Potato mode** cuts rendering work for low CPU/VRAM use while gaming or rendering
- **Menu-bar app**: closing hides the window instead of quitting; `⌘⇧Space` brings it back
- Window position and size are remembered across launches

## Keyboard shortcuts

| Global | |
| --- | --- |
| `⌘⇧Space` | Show / hide FloatPad |
| `⌘⇧S` | Screenshot a screen region → Board |

| Board | |
| --- | --- |
| Scroll / pinch | Zoom toward cursor |
| Drag canvas | Pan |
| Double-click | Add sticky note |
| `⌘V` | Paste image |
| `⌘A` | Select all |
| `⇧`-click / drag | Add to selection / rubber-band |
| `⌫` | Delete selected |
| `⌘0` | Zoom to fit |
| Corner handle | Drag image out to Finder / Figma |

| Video | |
| --- | --- |
| `Space` | Play / pause |
| `←` `→` | Seek ±5s |
| `↑` `↓` | Volume ±5% |
| `M` | Mute |
| `,` `.` | Step one frame |
| `A` / `B` | Set A-B loop points |
| `⊡` | Grab frame → Board |

| Web | |
| --- | --- |
| `⌘L` | Focus URL bar |
| `⌘D` | Bookmark page |
| `⌘1–9` | Jump to bookmark |
| Right-click image | Send to Board |

Press `?` anywhere in the app for the full shortcut overlay.

## Architecture

FloatPad is a standard two-process Electron app:

- **Main process** — `public/electron.js`: window and panel lifecycle, tray, global shortcuts, native dialogs, screen capture through `desktopCapturer`, webview session and ad-block rules, persisted window bounds.
- **Renderer** — React 18 + Vite 5 in `src/`: a single `App` shell owns mode switching, themes, opacity, mini/standalone state; each mode is a self-contained component under `src/modes/`.
- **IPC** — renderer talks to main through `ipcRenderer.invoke` for file dialogs and capture, and `ipcRenderer.send` for window commands.
- **Panel windows** — undocked modes are separate `BrowserWindow`s loading the same bundle with `?panel=<mode>`, so each panel keeps its own state.
- **Persistence** — window prefs and the ad-block allowlist live in `prefs.json` under Electron's `userData` directory; board documents are `.floatpad` files; the Write pad and theme autosave to `localStorage`.

## Project structure

```
floatpad/
├── assets/                 # app + tray icons used by electron-builder
├── public/
│   ├── electron.js         # Electron main process
│   └── screenshot.html     # full-screen region-capture overlay
├── src/
│   ├── components/         # Icons, Onboarding, ShortcutsOverlay
│   ├── modes/              # ImageBoard, VideoPlayer, Browser, Write
│   ├── utils/helpers.js    # file/URL/image helpers
│   ├── theme.js            # dark / light theme application
│   ├── App.jsx             # window shell, modes, titlebar
│   ├── App.css             # all UI styling
│   └── index.jsx           # React entry point
├── index.html
├── vite.config.js
└── package.json            # scripts + electron-builder config
```

## Getting started

**Requirements:** macOS, Node.js 18 or newer (20 LTS recommended — see `.nvmrc`).

```bash
# Install dependencies
npm install

# Run Vite + Electron together (hot reload)
npm start
```

## Build & package

```bash
# Production renderer build → dist/
npm run build

# Native macOS app (.dmg, arm64 + x64) → release/
npm run dist:mac

# Windows installer (.exe) → release/
npm run dist:win
```

## Data & privacy

FloatPad runs entirely on your machine. There is no account, no telemetry and no analytics. Network traffic only happens inside the embedded browser when you navigate to a page, and ad/tracker hosts are blocked there by default.

## Repository notes

- `dist/`, `release/` and `node_modules/` are ignored; only sources are committed.
- Every push to `main` runs the CI workflow (`.github/workflows/ci.yml`), which installs dependencies and builds the Vite bundle.
- `.npm-local/` was a leftover offline npm cache from the first packaging run. It is ignored and no longer tracked by the repository.

## License

[MIT](LICENSE) © 2026 Asif Gondal