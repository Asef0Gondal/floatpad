# FloatPad Competitive Analysis & Battle Plan

Researched 2026-11-21 from primary sources: PureRef Handbook v2.1 (pureref.com/handbook),
BeeRef README (github.com/rbreu/beeref, GPL — features studied, no code copied),
Helium README (github.com/JadenGeller/Helium, unmaintained), ScreenFloat 2 App Store
listing + eternalstorms.at, Tot App Store listing (tot.app), Markraft README
(github.com/ahonn/markraft, MIT — features studied, no code copied). Flotnote repo
has no feature docs; it's a minimal floating note covered by the Tot/Markraft analysis.

Method note: closed-source apps were studied via public documentation and listings
only — no binary reverse engineering. PureRef is installed locally for behavior checks.

## Feature matrix

Legend: ✅ have · 🔶 partial · ❌ missing · — not applicable

| Feature | FloatPad v2 | PureRef | BeeRef | Helium | ScreenFloat | Tot/Markraft |
|---|---|---|---|---|---|---|
| Infinite image canvas, pan/zoom | ✅ | ✅ | ✅ | — | — | — |
| Always-on-top / all Spaces | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window opacity | ✅ | ✅ | ✅ | ✅ | 🔶 | 🔶 |
| Click-through | ✅ (manual) | ✅ | ✅ | ✅ auto-when-translucent | ✅ | — |
| Paste/drop/browser-drag images | ✅ | ✅ | ✅ | — | ✅ clipboard | — |
| Annotations (pen/shapes/text/eyedropper) | ✅ | ✅ 2.0 | ❌ | — | ✅ | — |
| Sticky notes | ✅ | ✅ rich text | ✅ | — | — | — |
| Per-image opacity | ✅ | ✅ | ✅ | — | ✅ | — |
| Z-order front/back | ✅ | ✅ | ✅ | — | — | — |
| Multi-select + rubber band | ✅ | ✅ | ✅ | — | — | — |
| Drag image out to OS | ✅ | ✅ | ✅ | — | ✅ format-on-drag | — |
| Board save/load + export | ✅ .floatpad | ✅ .pur | ✅ .bee | — | ✅ library | ✅ .md |
| Region screenshot | ✅ | ❌ | ❌ | — | ✅++ timed/recapture | — |
| **Video player (loop/frame-step/grab)** | ✅ | ❌ | ❌ | 🔶 web only | 🔶 recordings | — |
| **Embedded web browser** | ✅ | ❌ | ❌ | ✅ | ❌ | — |
| **Writing pad (screenplay/md)** | ✅ | 🔶 notes | 🔶 notes | ❌ | ❌ | ✅ |
| Image rotate / flip / grayscale | ✅ | ✅ | ✅ | — | ✅ rotate | — |
| Crop (non-destructive) | ❌ | ✅ | ✅ | — | ✅ | — |
| Focus mode (zoom-to-image, step ←/→) | ✅ | ✅ | ✅ | — | — | — |
| Arrange: align/distribute/normalize/stack/pack | ✅ | ✅ | ✅ mass | — | — | — |
| Duplicate / lock item / open source | ✅ | ✅ | 🔶 | — | — | — |
| Groups + hierarchy tree | ❌ | ✅ 2.0 | ❌ | — | ✅ folders | — |
| GIF playback + frame scrub | ✅ | ✅ 2.0 | ❌ | — | — | — |
| Slideshow | ✅ | ✅ | ❌ | — | — | — |
| URL paste → scrape page images | ✅ | ✅ | ❌ | — | — | — |
| Overlay mode: per-image floating windows | ✅ shots | ✅ | ❌ | — | ✅ core | — |
| Always-on-bottom (wallpaper mode) | ✅ | ✅ | ❌ | — | — | — |
| Lock window position | ✅ macOS | ✅ | ❌ | — | ✅ | — |
| Pixel-art nearest-neighbor sampling | ✅ | ✅ | ❌ | — | — | — |
| **OCR / data detection (text, links, emails, phones)** | ✅ macOS (QR later) | ❌ | ❌ | — | ✅ killer | — |
| Shot library: tags/search/smart folders | ❌ | ❌ | ❌ | — | ✅ | — |
| Screen recording | ❌ | ❌ | ❌ | — | ✅ | — |
| Live Markdown preview + interactive tasks | ✅ | — | — | — | — | ✅ Markraft |
| Multi-note dots / plain .md folder | 🔶 | — | — | — | — | ✅ |
| Global hotkey scratchpad | ✅ app-level | — | — | — | — | ✅ ⌥N |
| Browser bookmarks/reader/adblock/history | ✅ | — | — | 🔶 | — | — |
| Potato/low-resource mode | ✅ | ❌ | ❌ | ❌ | ❌ | — |

## Where we already win

Nobody else combines **board + video + web + write** in one overlay. PureRef has no
video/web/write; Helium has no board; ScreenFloat is capture-only; Tot/Markraft are
text-only. Our adblock, screenplay mode, A-B loop and potato mode are unique.

## Gap-closing roadmap (priority = competitor-kill value ÷ effort)

### Tier 1 — ✅ SHIPPED (v2.1.0)
1. **Image transforms**: flip H/V, grayscale, rotate 90°, reset transform (PureRef/BeeRef core; render flags, persisted).
2. **Focus mode**: Space/double-click zooms to selection, ←/→ steps images, Esc returns (PureRef's most-used flow).
3. **Arrange & align**: align L/R/T/B/centers, distribute H/V, normalize height/width/size, stack, pack-optimal, arrange by name/addition (PureRef + BeeRef mass-arrange).
4. **Duplicate (⌘D), lock item, open source location** (PureRef).
5. **OCR + data detection** on any board image: extract text (macOS Vision), detect links/emails/phones, copy buttons (ScreenFloat's killer feature — we get it on *every* image, not just captures).
6. **Floating shots**: right-click image → its own frameless always-on-top mini window (PureRef overlay mode + ScreenFloat float).
7. **Always-on-bottom + lock window position** (PureRef wallpaper mode; cheap Rust).
8. **Slideshow** (focus mode + timer; cheap once #2 lands).

### Tier 2 — partially shipped
9. ✅ Write mode: live Markdown preview + interactive task checkboxes (Markraft/Tot parity). Remaining: .md folder workflow.
10. ✅ Browser history list (Helium parity).
11. ✅ GIF playback: Rust image-crate decode (composited frames + delays), play/pause, timeline scrub, frame step, speed, frame→board.
12. ✅ URL paste → scrape all page images onto board (PureRef) — hidden webview + eval channel.
13. ✅ Pixel-art sampling (⌥T, export-safe); image comments (💬 badge); replace image (⇄, keeps geometry).
14. ✅ Shot library: persistent shots with thumbnails, name/tag search, rename/retag, reopen, delete (v2.3.0).

### Tier 3 — architectural, later
15. Groups + hierarchy panel (PureRef 2.0).
16. ✅ Crop tool (undoable crop-box dialog, v2.4.0). Full pan/zoom-inside-crop gizmo remains a future refinement.
17. Image management: downscale/optimize/embed-vs-link (PureRef manage images).
18. Screen recording (ScreenFloat) — heavy; evaluate against product focus.
19. Cross-device sync (Tot/ScreenFloat iCloud) — needs backend decision.

## Rules of engagement

- Features studied from public docs/open-source READMEs; **no code copied from GPL
  projects** (BeeRef) into our MIT repo; no binary RE of closed apps.
- Every batch: unit tests where logic is testable, hidden self-test for Rust plumbing,
  CI green, commit + push. See ENGINEERING-NOTES.md for the verification playbook.