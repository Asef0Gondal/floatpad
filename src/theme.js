// ── FloatPad design tokens ────────────────────────────────────────────────────
// Single source of truth. CSS vars are set on <html data-theme="dark|light">.
// Never use hardcoded hex in components — always var(--fp-*)

export const THEMES = {
  dark: {
    // Backgrounds — layered from deepest to most raised
    '--fp-bg':           '#111215',
    '--fp-bg-surface':   '#16181C',
    '--fp-bg-raised':    '#1C1F26',
    '--fp-bg-hover':     '#23272F',
    '--fp-bg-active':    '#2A2F3A',

    // Borders
    '--fp-border':       '#252830',
    '--fp-border-mid':   '#2E3240',
    '--fp-border-hi':    '#3A3F4E',

    // Text
    '--fp-text':         '#C8D0E0',
    '--fp-text-dim':     '#6B7385',
    '--fp-text-faint':   '#3A3F4C',
    '--fp-text-inverse': '#0E1015',

    // Accent — electric blue
    '--fp-accent':       '#3B6EE0',
    '--fp-accent-dim':   '#1E3A6E',
    '--fp-accent-text':  '#7AAFF0',

    // Semantic
    '--fp-danger':       '#E05C5C',
    '--fp-danger-dim':   '#3A1515',
    '--fp-success':      '#4CAF8A',
    '--fp-success-dim':  '#0D2B1E',
    '--fp-warning':      '#D4A040',
    '--fp-warning-dim':  '#2E2008',

    // Board
    '--fp-board-bg':     '#0C0D10',
    '--fp-board-dot':    '#1A1C22',

    // Note
    '--fp-note-bg':      '#1E1C00',
    '--fp-note-border':  '#3A3500',
    '--fp-note-text':    '#C8B840',

    // Write mode
    '--fp-write-bg':     '#111215',
    '--fp-write-text':   '#D0D8E8',
    '--fp-write-dim':    '#4A5060',
  },

  light: {
    '--fp-bg':           '#F2F0EC',
    '--fp-bg-surface':   '#E9E7E2',
    '--fp-bg-raised':    '#DEDAD4',
    '--fp-bg-hover':     '#D4D0C8',
    '--fp-bg-active':    '#C8C4BB',

    '--fp-border':       '#D0CCC4',
    '--fp-border-mid':   '#BDB9B0',
    '--fp-border-hi':    '#AEAAA0',

    '--fp-text':         '#1A1C22',
    '--fp-text-dim':     '#6B6860',
    '--fp-text-faint':   '#AEAB A4',
    '--fp-text-inverse': '#F2F0EC',

    '--fp-accent':       '#2D5ABF',
    '--fp-accent-dim':   '#C8D8F4',
    '--fp-accent-text':  '#1A3A80',

    '--fp-danger':       '#C0392B',
    '--fp-danger-dim':   '#F8E8E6',
    '--fp-success':      '#1D7A56',
    '--fp-success-dim':  '#E0F4EC',
    '--fp-warning':      '#8A5E10',
    '--fp-warning-dim':  '#FDF3E0',

    '--fp-board-bg':     '#E8E6E0',
    '--fp-board-dot':    '#D4D0C8',

    '--fp-note-bg':      '#FFFDE8',
    '--fp-note-border':  '#E0DC80',
    '--fp-note-text':    '#4A4400',

    '--fp-write-bg':     '#FAF8F4',
    '--fp-write-text':   '#1A1C22',
    '--fp-write-dim':    '#9A9890',
  },
};

export const THEME_KEY = 'fp_theme';

export function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const vars = THEMES[theme];
  const el   = document.documentElement;
  el.setAttribute('data-theme', theme);
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
  localStorage.setItem(THEME_KEY, theme);
}
