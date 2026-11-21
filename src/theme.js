// ── FloatPad theme ────────────────────────────────────────────────────────────
// Tokens live in App.css under :root (dark default) and :root[data-theme="light"].
// applyTheme just toggles the attribute; getInitialTheme persists + follows OS.

export const THEME_KEY = 'fp_theme';

export function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
