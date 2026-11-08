import React from 'react';

const SECTIONS = [
  { title: 'Global', rows: [
    ['⌘⇧Space', 'Show / hide FloatPad'],
    ['⌘⇧S',     'Screenshot → Board'],
  ]},
  { title: 'Board', rows: [
    ['Scroll / Pinch', 'Zoom toward cursor'],
    ['Drag canvas',    'Pan'],
    ['Dbl-click',      'Add sticky note'],
    ['⌘V',             'Paste image'],
    ['⌘A',             'Select all'],
    ['⇧Click',         'Add to selection'],
    ['Drag selection', 'Rubber-band select'],
    ['⌫',              'Delete selected'],
    ['⌘0',             'Zoom to fit'],
    ['⤢ handle',       'Drag image out to Finder / Figma'],
  ]},
  { title: 'Video', rows: [
    ['Space',  'Play / Pause'],
    ['← →',   'Seek ±5s'],
    ['↑ ↓',   'Volume ±5%'],
    ['M',      'Mute'],
    [', .',    'Step one frame'],
    ['A / B',  'Set A-B loop points'],
    ['⊡',      'Grab frame → Board'],
  ]},
  { title: 'Browser', rows: [
    ['⌘L',        'Focus URL bar'],
    ['⌘D',        'Bookmark page'],
    ['⌘1–9',      'Jump to bookmark'],
    ['Right-click img', 'Send to Board'],
  ]},
];

export default function ShortcutsOverlay({ onClose }) {
  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-panel" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span>Keyboard shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-body">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="shortcuts-section">
              <div className="shortcuts-section-title">{sec.title}</div>
              <table className="shortcuts-table"><tbody>
                {sec.rows.map(([key, desc]) => (
                  <tr key={key}>
                    <td className="shortcuts-key"><kbd>{key}</kbd></td>
                    <td className="shortcuts-desc">{desc}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
