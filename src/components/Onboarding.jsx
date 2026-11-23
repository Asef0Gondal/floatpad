import React, { useState, useEffect, useRef } from 'react';

const I = ({ children }) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const STEPS = [
  {
    icon: <I><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L6 23"/></I>,
    title: 'Image Board',
    body: 'Drop images from anywhere onto the canvas. Drag to pan, scroll to zoom, pinch on trackpad. Double-click empty space to add a sticky note.',
    tips: ['⌘V to paste images', 'Drag from browser or Finder', '⌘⇧S to screenshot any area'],
  },
  {
    icon: <I><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/></I>,
    title: 'Video Player',
    body: 'Drop a local video file (or Browse). Full controls with A-B loop for repeating sections, frame-by-frame stepping, and variable speed. Use the Web mode for online video.',
    tips: ['Space play/pause', ', . to step frames', '⊡ grabs current frame → Board'],
  },
  {
    icon: <I><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></I>,
    title: 'Web Browser',
    body: 'A real browser (the native system webview) — YouTube, Notion, anything works. Right-click images to send them straight to your Board.',
    tips: ['⌘D to bookmark', '⌘1–9 to jump to bookmarks', 'Reader mode strips page clutter'],
  },
  {
    icon: <I><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></I>,
    title: 'Always on top',
    body: 'FloatPad floats above every other window — your reference is always visible. Use ⌘⇧Space to hide/show without touching your mouse.',
    tips: ['Opacity slider in the titlebar', 'Potato mode = minimal RAM', 'Lives in the menu bar, not the Dock'],
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const onCancel = e => e.preventDefault(); // keep the intro open on Escape
    d.addEventListener('cancel', onCancel);
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, []);

  return (
    <dialog ref={ref} className="onboarding-card" aria-label="Welcome to FloatPad">

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
    </dialog>
  );
}
