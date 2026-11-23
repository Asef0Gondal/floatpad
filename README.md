<p align="center">
  <img src="assets/icon.png" width="104" alt="FloatPad app icon" />
</p>

<h1 align="center">FloatPad</h1>

<p align="center">
  A floating <strong>reference board &amp; moodboard</strong> that stays always-on-top.<br/>
  The open-source <strong>PureRef / ScreenFloat alternative</strong> for macOS, Windows &amp; Linux:<br/>
  images, video, a real web browser and a writing pad in one floating overlay.
</p>

<p align="center">
  <a href="https://github.com/Asef0Gondal/floatpad/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/Asef0Gondal/floatpad?label=download&logo=github&color=4a90e2"></a>
  <a href="https://asef0gondal.github.io/floatpad/"><img alt="Website" src="https://img.shields.io/badge/website-floatpad-4a90e2?logo=googlechrome&logoColor=white"></a>
  <a href="https://github.com/Asef0Gondal/floatpad"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Asef0Gondal%2Ffloatpad-181717?logo=github&logoColor=white"></a>
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=black">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey">
  <a href="https://github.com/Asef0Gondal/floatpad/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Asef0Gondal/floatpad/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

> FloatPad came into existence for one simple reason: **I needed it.** As a creative director, I got tired of alt-tabbing away from my work every time I had to check a reference, so I built myself an always-on-top pad that keeps everything in view.
>
> I have ADHD and OCD and had some free time, so I made this instead of a video based on a shitty brief. That's the entire origin story.
>
> **🦀 v2 is the Rust rewrite.** The shell is now [Tauri 2](https://tauri.app): a native Rust core instead of Electron, same React UI, ~10 MB app instead of ~250 MB. macOS is the primary platform; Windows and Linux build from the same codebase. The legacy Electron shell was retired in v2.1.2; Tauri is the only shell.

<p align="center">
  <a href="https://github.com/Asef0Gondal/floatpad/releases/latest"><strong>⬇ Download FloatPad</strong></a> · macOS (.dmg) · Windows (.exe) · Linux (.deb / AppImage)
</p>

**FloatPad** is a free, open-source **reference image board** and **moodboard** app, a lightweight **PureRef alternative** and **ScreenFloat alternative** built with **Rust** and **Tauri**. Keep reference images, screenshots, GIFs, video, web pages and markdown notes **always on top** of your work, with **OCR**, region **screenshots**, and a click-through floating overlay. It runs on **macOS, Windows and Linux** from one codebase, weighs ~10 MB, and collects no telemetry.

## Why FloatPad

Reference material is scattered across Finder, YouTube, browser tabs and design files. Every lookup costs an alt-tab, a window resize, and a lost train of thought.

FloatPad keeps the reference **on top of everything else**: a frameless overlay that stays above your work, can drop to **15% opacity**, and can become **click-through** so it never blocks the app underneath. It lives in the menu bar instead of the Dock and is summoned with a global shortcut.

Built for creative directors, designers, video editors and developers who need a second screen that never takes focus away from the main one.

## How FloatPad compares

Looking for a **PureRef alternative**, **ScreenFloat alternative** or **BeeRef alternative**? FloatPad is the all-in-one option: instead of a single-purpose image viewer, it combines a reference board with a video player, a real web browser and a writing pad, plus OCR and region screenshots, in one native, open-source app.

| | FloatPad | PureRef | ScreenFloat | BeeRef |
| --- | --- | --- | --- | --- |
| Open source (MIT) | ✅ | ❌ | ❌ | ✅ |
| macOS / Windows / Linux | ✅ | ✅ | macOS only | ✅ |
| Reference image board | ✅ | ✅ | ✅ | ✅ |
| OCR (image → text) | ✅ | ❌ | ✅ | ❌ |
| Region screenshots | ✅ | ❌ | ✅ | ❌ |
| Video player + A-B loop | ✅ | ❌ | ❌ | ❌ |
| Built-in web browser + ad block | ✅ | ❌ | ❌ | ❌ |
| Markdown / screenplay notes | ✅ | ❌ | ❌ | ❌ |
| Native Rust core (~10 MB) | ✅ | ❌ | ❌ | ❌ |

*Competitor features reflect their public docs at the time of writing; corrections welcome.*

## Modes

| Mode | What it does |
| --- | --- |
| **Board** | Infinite canvas for images, annotations, sticky notes and screenshots |
| **Video** | Local files with A-B loop, frame stepping and frame grabbing (use Web mode for online video) |
| **Web** | A real browser (native system webview) with bookmarks, reader mode and image-to-Board actions |
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
- **Paste a URL** → every image on that page lands on the board
- **Focus mode**: double-click an image (or `F`) to zoom in, `←`/`→` to step, `Esc` to exit, built-in slideshow
- **Arrange**: align, distribute, normalize height/width/size, stack, shelf-pack (optimal / by name / by addition)
- **Per-image powers**: flip, rotate, grayscale (`⌥G`), opacity, lock, duplicate (`⌘D`), reset, open source, and **crop** (`✂`, undoable)
- **OCR any image** (`T`): extracted text with one-click copy, plus detected links, emails and phone numbers (macOS Vision)
- **Float any image as a shot** (`⧉`): its own frameless always-on-top mini window
- **Shot Library**: floated images are saved to disk with thumbnails; browse, search by name/tag, rename, retag, reopen or delete them (⧉ Shots button)
- **Undo / redo** (`⌘Z` / `⌘⇧Z`, toolbar ↶ ↷) across images, notes and annotations

### Video

- Open a local video file (browse or drag-drop); for online video use the Web mode
- Full transport: play/pause, seek, volume, mute, frame-by-frame stepping, `0.25×-2×` speed
- **A-B loop** for repeating a section while following along
- **Grab frame → Board** to keep a still reference next to your work
- Picture-in-Picture support
- Pauses automatically when the tab is hidden or a CPU-heavy task needs the resources

### Web

- Native system webview: WebKit on macOS, Chromium/WebView2 on Windows, WebKitGTK on Linux. YouTube, documentation, Notion and most sites work normally
- URL bar with back / forward / reload, plus persistent bookmarks (`⌘D`, `⌘1-9`)
- **Reader mode** strips page clutter for long-form reading
- **History** dropdown with the last 50 pages
- **Ad and tracker blocking** at the session level, with a per-site allowlist toggle
- Right-click any image to send it to the Board
- Step through embedded video frame-by-frame and grab a frame to the Board

### Write

- **Screenplay mode**: `Tab` cycles element types: SCENE → Action → CHARACTER → Dialogue → (parenthetical), with automatic uppercase scene headings
- **Markdown / freeform mode** with **live preview**: GFM tables, code, and task lists whose checkboxes you can click right in the preview
- Live word/page statistics, autoreload of the last document, and autosave to local storage
- Open and save `.txt`, `.md` and Fountain files through native dialogs
- Built-in 25-minute focus timer

## Window & workflow

- **Always on top**, visible on every Space, including full-screen apps, or **always on bottom** (interactable wallpaper)
- **Lock the window position** so it can't be dragged accidentally
- **Opacity** slider from 100% down to 15%
- **Detach** toggles click-through, with mouse events forwarded to the window underneath
- **Always-visible grab handle** on the left edge; drag it to move the window in any mode
- **Borderless view** (toggle in the titlebar): hides the titlebar for a clean canvas; hover the top edge to reveal it again, auto-hides
- **Mini mode** collapses the window to a grabbable strip (drag the ⠿ grip) with just expand + close
- **Responsive title bar**: controls compress as the window narrows; secondary controls fold into a ⋯ menu instead of disappearing, and a dedicated grip strip is always available for moving the window
- **Window sizes**: Tiny `400×320`, Small `580×440`, Medium `700×560`, Large `960×700`, Wide `1100×620`
- **Standalone panels**: undock any mode into its own floating window and dock it back later
- **Settings panel** (`⚙`): theme, potato mode, borderless default, and data management (clear autosaved board / shot library)
- **Dark / light themes** with the choice persisted; visible keyboard-focus rings for accessibility
- **Potato mode** cuts rendering work for low CPU/VRAM use while gaming or rendering
- **Menu-bar app**: closing hides the window instead of quitting; `⌘⇧Space` brings it back
- **`⌘⇧Space` is also a panic key**: it dismisses the screenshot overlay and restores click control if the window is detached, then toggles visibility
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
| `⌘1-9` | Jump to bookmark |
| Right-click image | Send to Board |

Press `?` anywhere in the app for the full shortcut overlay.

## Architecture (v2: Rust/Tauri)

FloatPad is a Tauri 2 app: a native Rust core with the system webview rendering the React UI.

- **Rust core** (`src-tauri/src/`): window and panel lifecycle, tray, global shortcuts, opacity/click-through/all-Spaces via platform APIs (`objc2` on macOS, `windows-sys` on Windows), screen capture through `xcap`, persisted window bounds in `prefs.json`, ad-block allowlist.
- **Embedded browser**: Web mode is a native child webview (Tauri multi-webview) positioned over the app's content area; a main-frame-only injected script reports SPA navigations, context menus and popups back to the shell and hides ad/tracker elements.
- **Renderer**: React 18 + Vite 5 in `src/`, unchanged from v1: a single `App` shell owns mode switching, themes, opacity, mini/standalone state; each mode is a self-contained component under `src/modes/`.
- **IPC**: `src/ipc.js` maps the app's channel names onto Tauri `invoke`/`listen`. File dialogs and file I/O go through the official `dialog`/`fs` plugins; everything window-related is a Rust command. Native `alert/confirm/prompt` are avoided (WKWebView suppresses them) in favor of the dialog plugin and inline inputs.
- **Panel windows**: undocked modes are separate Tauri windows loading the same bundle with `?panel=<mode>`.
- **Persistence**: window prefs and the ad-block allowlist live in `prefs.json` under the app config dir; the board autosaves to `localStorage` (restored on launch) and can be saved as `.floatpad` files; the Write pad autosaves on edit and on quit; bookmarks, theme and opacity persist too.

### Platform notes & limitations

- **Ad blocking** is network-level on macOS (WKContentRuleList, same host list and per-site allowlist as v1) plus ad-element hiding everywhere; on Windows/Linux it is element-level only for now.
- **OCR** uses the macOS Vision framework; other platforms get a clear message (Windows.Media.Ocr is the planned path).
- **Window-position lock** is macOS only for now.
- **Detach (click-through)** does not forward hover events to the window underneath; tray → Show or `⌘⇧Space` always restores control.
- **Window opacity** is macOS/Windows only for now (no-op on Linux).
- **Opacity sliders on undocked panels** affect their own window.
- **File/asset access** is scoped to your home folder, `/Volumes`, temp and app-data dirs (not the whole filesystem).

## Project structure

```
floatpad/
├── assets/                 # app + tray icons
├── public/
│   └── screenshot.html     # full-screen region-capture overlay
├── src/
│   ├── ipc.js              # IPC shim over the Tauri Rust core
│   ├── components/         # Icons, Onboarding, ShortcutsOverlay
│   ├── modes/              # ImageBoard, VideoPlayer, Browser, Write
│   ├── utils/              # helpers + Tauri webview adapter
│   ├── theme.js            # dark / light theme application
│   ├── App.jsx             # window shell, modes, titlebar
│   ├── App.css             # all UI styling
│   └── index.jsx           # React entry point
├── src-tauri/
│   ├── src/                # Rust core: lib, commands, platform shims, page.js
│   ├── capabilities/       # per-window IPC permissions
│   ├── icons/              # generated bundle icons
│   └── tauri.conf.json
├── index.html
├── vite.config.js
└── package.json
```

## Getting started

**Requirements:** Node.js 18+ (20 LTS recommended, see `.nvmrc`), Rust stable ([rustup](https://rustup.rs)), and the Tauri platform prerequisites:

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** WebView2 (preinstalled on 10/11) + MSVC build tools
- **Linux:** `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev` (see the CI workflow for the full apt line)

```bash
# Install dependencies
npm install

# Run the Rust/Tauri app (hot reload)
npm run dev
```


## Build & package

```bash
# Production frontend build → dist/
npm run build

# Native app bundles (runs the Rust release build)
npm run dist:mac      # .app + .dmg  → src-tauri/target/release/bundle/
npm run dist:win      # NSIS installer
npm run dist:linux    # .deb + AppImage
```

Screen capture (⌘⇧S and frame grabbing) needs the OS **Screen Recording** permission on macOS; the system prompts on first use.

## Tests

```bash
npm test           # vitest: helpers + the IPC contract (every channel used by any mode is handled by the shim)
npm run test:rust  # cargo unit tests (ad-block rule generation)
```

There is also a hidden end-to-end self-test of the Rust plumbing (no window shown):
with vite running, `FP_SELFTEST=1 cargo run` from `src-tauri/`; it checks window
controls, panels, the embedded browser round-trip, capture and the ad blocker,
logging `SELFTEST PASS/FAIL` per assertion. See [docs/ENGINEERING-NOTES.md](docs/ENGINEERING-NOTES.md)
for the debugging playbook and the root causes behind the shell's design rules.

## Data & privacy

FloatPad runs entirely on your machine. There is no account, no telemetry and no analytics. Network traffic only happens inside the embedded browser when you navigate to a page, and ad/tracker hosts are blocked there by default.

## Repository notes

- `dist/`, `node_modules/` and `src-tauri/target/` are ignored; only sources are committed.
- Every push to `main` runs CI (`.github/workflows/ci.yml`): the Vite bundle plus `cargo check` on macOS, Windows and Linux.
- The Electron v1 shell was retired in v2.1.2 after a full A-to-Z audit; Tauri is the only shell.
- `FP_SELFTEST=1 cargo run` (from `src-tauri/`, with vite running) executes a hidden end-to-end check of the window/panel/webview/capture plumbing (no window is shown).

## License

[MIT](LICENSE) © 2026 Asif Gondal