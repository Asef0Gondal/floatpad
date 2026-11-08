// Crisp 16×16 SVG icon set — all strokes, no fills, 1.5px weight
// Used everywhere in the UI. Consistent optical size.

const I = ({ d, children, size = 16, ...p }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display:'block', flexShrink:0 }}
    {...p}
  >
    {d ? <path d={d}/> : children}
  </svg>
);

export const IconImage    = p => <I {...p}><rect x="1" y="2" width="14" height="12" rx="1.5"/><circle cx="5" cy="6" r="1.2"/><path d="M1 10l3.5-3.5 3 3 2.5-2 5 4.5"/></I>;
export const IconCamera   = p => <I {...p}><path d="M1 5.5A1.5 1.5 0 012.5 4h1.6l1.2-2h5.4l1.2 2h1.6A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-7z"/><circle cx="8" cy="9" r="2.5"/></I>;
export const IconEyedrop  = p => <I {...p}><path d="M11 2l3 3-7 7-3-1-1-3 8-6z"/><path d="M9 4l3 3"/><circle cx="3.5" cy="12.5" r="1.5"/></I>;
export const IconFit      = p => <I {...p}><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></I>;
export const IconSave     = p => <I {...p}><path d="M2 4a2 2 0 012-2h6l4 4v6a2 2 0 01-2 2H4a2 2 0 01-2-2V4z"/><path d="M10 2v4H6V2"/><path d="M5 9h6M5 12h4"/></I>;
export const IconFolder   = p => <I {...p}><path d="M2 5.5A1.5 1.5 0 013.5 4H6l1.5 2H13a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5.5z"/></I>;
export const IconTrash    = p => <I {...p}><path d="M3 4h10M6 4V3h4v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"/></I>;
export const IconPlay     = p => <I {...p}><polygon points="5,2 14,8 5,14"/></I>;
export const IconPause    = p => <I {...p}><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></I>;
export const IconSkipBack = p => <I {...p}><path d="M2 2v12M5 8l8-5v10L5 8z"/></I>;
export const IconSkipFwd  = p => <I {...p}><path d="M14 2v12M11 8L3 3v10l8-5z"/></I>;
export const IconVolume   = p => <I {...p}><path d="M2 6h3l4-3v10L5 10H2V6z"/><path d="M12 5.5a4 4 0 010 5M10.5 7a2 2 0 010 2"/></I>;
export const IconMute     = p => <I {...p}><path d="M2 6h3l4-3v10L5 10H2V6z"/><path d="M13 6l-3 4M10 6l3 4"/></I>;
export const IconEject    = p => <I {...p}><path d="M3 12h10M8 3l5 6H3l5-6z"/></I>;
export const IconPip      = p => <I {...p}><rect x="1" y="3" width="14" height="10" rx="1.5"/><rect x="8" y="7" width="5" height="4" rx="1"/></I>;
export const IconBack     = p => <I {...p} d="M10 2L4 8l6 6"/>;
export const IconFwd      = p => <I {...p} d="M6 2l6 6-6 6"/>;
export const IconReload   = p => <I {...p}><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9"/><path d="M14 2v4h-4"/></I>;
export const IconClose    = p => <I {...p} d="M3 3l10 10M13 3L3 13"/>;
export const IconSize     = p => <I {...p}><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="10" y="1" width="5" height="5" rx="1"/><rect x="1" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/></I>;
export const IconUndock   = p => <I {...p}><path d="M9 2h5v5M8 8l6-6"/><path d="M13 9v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h4"/></I>;
export const IconDock     = p => <I {...p}><rect x="1" y="1" width="14" height="14" rx="2" strokeDasharray="3 2"/><rect x="4" y="4" width="8" height="8" rx="1"/></I>;
export const IconSun      = p => <I {...p}><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></I>;
export const IconMoon     = p => <I {...p} d="M13 10A6 6 0 016 3a7 7 0 100 10 6 6 0 017-3z"/>;
export const IconHelp     = p => <I {...p}><circle cx="8" cy="8" r="7"/><path d="M6 6.5a2 2 0 113 1.7C8.5 8.7 8 9.2 8 10"/><circle cx="8" cy="13" r=".75" fill="currentColor" stroke="none"/></I>;
export const IconPen      = p => <I {...p}><path d="M11 2l3 3L5 14H2v-3L11 2z"/><path d="M9 4l3 3"/></I>;
export const IconEraser   = p => <I {...p}><path d="M14 14H5M2 14h1"/><path d="M4 11L9 3l5 3-5 8H4z"/><path d="M4 11L9 6"/></I>;
export const IconShape    = p => <I {...p}><rect x="2" y="2" width="5" height="5" rx="1"/><circle cx="11.5" cy="4.5" r="2.5"/><path d="M2 14l4-7 4 7H2z"/><rect x="9" y="9" width="5" height="5" rx="1"/></I>;
export const IconText     = p => <I {...p}><path d="M3 3h10M8 3v10M5 13h6"/></I>;
export const IconBookmark = p => <I {...p}><path d="M3 2h10v13l-5-3.5L3 15V2z"/></I>;
export const IconShield   = p => <I {...p}><path d="M8 1l6 2.5v4.5A6 6 0 018 14 6 6 0 012 8V3.5L8 1z"/></I>;
export const IconReader   = p => <I {...p}><path d="M2 4h12M2 7h8M2 10h10M2 13h6"/></I>;
export const IconWrite    = p => <I {...p}><path d="M4 13h8M3 10l7-7 3 3-7 7H3v-3z"/><path d="M9 4l3 3"/></I>;
export const IconMini     = p => <I {...p} d="M2 10h12"/>;
export const IconExpand   = p => <I {...p}><path d="M2 10h12M2 6h12"/></I>;
export const IconPotato   = p => <I {...p}><ellipse cx="8" cy="9" rx="6" ry="5"/><path d="M8 4c0-2 3-3 3-3"/><circle cx="6" cy="9" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="9" r=".8" fill="currentColor" stroke="none"/></I>;
export const IconDetach   = p => <I {...p}><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/></I>;
export const IconGrab     = p => <I {...p}><rect x="1" y="1" width="14" height="14" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M1 10l3.5-3.5 3 3 2.5-2 5 4.5"/></I>;
