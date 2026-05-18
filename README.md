# 🖥 FloatPad — Lean Floating Reference Pad

An elegant, premium utility designed for creators and developers on macOS. **FloatPad** is an Electron + React application that provides a floating, transparent overlay pad with lazy-mounted tools: Image Board, Video Player, Web Browser, and Writing Pad.

![Mockup](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80)

---

## ✨ Features

- **🎛 Quad-Mode Reference Suite:**
  - **Board:** View, organize, and float image references.
  - **Video:** Watch and float local video files during work.
  - **Web:** Full mini-browser for floating documentations, YouTube, or tutorials.
  - **Write:** Markdown-friendly distraction-free writing pad.
- **🛡 Standalone Panel Undocking:** Undock any tool into its own independent, standalone floating panel window with automatic docking restoration!
- **🪟 Transparency & Click-Through (Detach):** Slidably adjust window opacity down to `15%`. Detach the panel to enable **click-through mouse events** (overlay reference with no workflow obstruction).
- **🥔 Potato Mode:** Toggle resource-light rendering for low CPU/VRAM usage during heavy rendering or gaming.
- **🌓 Adaptive HSL Dark/Light Themes:** Harmonious UI styling matching clean dark or bright workspaces.

---

## 🛠 Setup

### Prerequisites
* Node.js v18+

### Installation & Launch
```bash
# Install dependencies
npm install

# Start development server (concurrently runs Vite and Electron)
npm start
```

### Packaging Apps
```bash
# Package native macOS app (.dmg)
npm run dist:mac

# Package native Windows app (.exe)
npm run dist:win
```
