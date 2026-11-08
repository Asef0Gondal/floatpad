import React, { useState } from 'react';

const STEPS = [
  {
    icon: '⊞',
    title: 'Image Board',
    body: 'Drop images from anywhere onto the canvas. Drag to pan, scroll to zoom, pinch on trackpad. Double-click empty space to add a sticky note.',
    tips: ['⌘V to paste images', 'Drag from browser or Finder', '⌘⇧S to screenshot any area'],
  },
  {
    icon: '▶',
    title: 'Video Player',
    body: 'Drop any video file or paste a direct URL. Full controls with A-B loop for repeating sections, frame-by-frame stepping, and variable speed.',
    tips: ['Space play/pause', ', . to step frames', '⊡ grabs current frame → Board'],
  },
  {
    icon: '◉',
    title: 'Web Browser',
    body: 'A real browser with Chrome 120 — YouTube, Notion, anything works. Right-click images to send them straight to your Board.',
    tips: ['⌘D to bookmark', '⌘1–9 to jump to bookmarks', 'Reader mode strips page clutter'],
  },
  {
    icon: '◎',
    title: 'Always on top',
    body: 'FloatPad floats above every other window — your reference is always visible. Use ⌘⇧Space to hide/show without touching your mouse.',
    tips: ['Opacity slider in the titlebar', '🥔 Potato mode = minimal RAM', 'Lives in the menu bar, not the Dock'],
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">

        <div className="ob-progress">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`ob-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="ob-icon">{s.icon}</div>
        <div className="ob-title">{s.title}</div>
        <div className="ob-body">{s.body}</div>

        <ul className="ob-tips">
          {s.tips.map(t => (
            <li key={t}><span className="ob-tip-bullet">›</span>{t}</li>
          ))}
        </ul>

        <div className="ob-actions">
          {step > 0 && (
            <button className="ob-btn ob-btn--ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
          )}
          <div style={{flex:1}}/>
          {!isLast
            ? <button className="ob-btn ob-btn--primary" onClick={() => setStep(s => s + 1)}>Next →</button>
            : <button className="ob-btn ob-btn--primary" onClick={onDone}>Get started →</button>
          }
        </div>

        <button className="ob-skip" onClick={onDone}>Skip intro</button>
      </div>
    </div>
  );
}
