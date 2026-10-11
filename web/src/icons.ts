/* Sport- und UI-Symbole (SVG). */
export const SPORTS: Record<string, { label: string; color: string }> = {
  swim:     { label: 'Schwimmen', color: 'var(--swim)' },
  bike:     { label: 'Radfahren', color: 'var(--bike)' },
  run:      { label: 'Laufen',    color: 'var(--run)' },
  strength: { label: 'Kraft',     color: 'var(--strength)' },
  football: { label: 'Fußball',   color: 'var(--football)' },
  rest:     { label: 'Ruhetag',   color: 'var(--rest)' }
};
const ICON_PATHS: Record<string, string> = {
  swim: '<circle cx="16.5" cy="6.5" r="2"/><path d="M3 18c1.6 0 1.6-1.3 3.2-1.3S7.8 18 9.4 18s1.6-1.3 3.2-1.3S14.2 18 15.8 18 17.4 16.7 19 16.7 20.6 18 21 18M5 13.5l4.5-3 3 2.5 3-2"/>',
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.6-6.5h5.2L18 16M9.6 9.5L12 16M13 6.5h2.5"/>',
  run: '<circle cx="14.5" cy="4.8" r="1.9"/><path d="M8.5 21l3-5.5-2.5-2.5 2.5-4.5 3.5 3 3 .5M11.5 8.5l-4 1-1.5 3M11.5 15.5l3.5 1.5 1 4"/>',
  strength: '<path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10"/>',
  football: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8l3 2.2-1.1 3.5h-3.8L9 10.2zM12 3.5V8M15 10.2l4.6-1.4M13.9 13.7l2.8 3.9M10.1 13.7l-2.8 3.9M9 10.2L4.4 8.8"/>',
  rest: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>'
};
export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.rest}</svg>`;
}
const UI_ICONS: Record<string, string> = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  skip: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  walk: '<path d="M7 12h10"/>'
};
export function uiIcon(n: string, w?: number): string { return `<svg viewBox="0 0 24 24" ${w ? `width="${w}" height="${w}"` : ''} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[n]}</svg>`; }
