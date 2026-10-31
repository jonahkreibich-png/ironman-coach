/* Sport- und UI-Symbole (SVG, Strich-Stil). */
export const SPORT_COLOR: Record<string, string> = { swim: 'var(--swim)', bike: 'var(--bike)', run: 'var(--run)', strength: 'var(--strength)', football: 'var(--football)', rest: 'var(--rest)', walk: 'var(--run)', multi: 'var(--accent)', other: 'var(--rest)' };
const SPORT_PATHS: Record<string, string> = {
  swim: '<circle cx="16.5" cy="6.5" r="2"/><path d="M3 18c1.6 0 1.6-1.3 3.2-1.3S7.8 18 9.4 18s1.6-1.3 3.2-1.3S14.2 18 15.8 18 17.4 16.7 19 16.7 20.6 18 21 18M5 13.5l4.5-3 3 2.5 3-2"/>',
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.6-6.5h5.2L18 16M9.6 9.5L12 16M13 6.5h2.5"/>',
  run: '<circle cx="14.5" cy="4.8" r="1.9"/><path d="M8.5 21l3-5.5-2.5-2.5 2.5-4.5 3.5 3 3 .5M11.5 8.5l-4 1-1.5 3M11.5 15.5l3.5 1.5 1 4"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6-2-3 1-4 3 2 2 1M12 15l3 2v4M11 8l-3 3"/>',
  strength: '<path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10"/>',
  football: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8l3 2.2-1.1 3.5h-3.8L9 10.2zM12 3.5V8M15 10.2l4.6-1.4M13.9 13.7l2.8 3.9M10.1 13.7l-2.8 3.9M9 10.2L4.4 8.8"/>',
  rest: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  multi: '<path d="M4 17h4l3-10 3 10h6"/>', other: '<circle cx="12" cy="12" r="7"/>'
};
const UI: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5.5h16v10.5H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  trend: '<path d="M4 18l5-5.5 4 3L20 7M15 7h5v5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  skip: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  food: '<path d="M3.5 12h17a8.5 8.5 0 0 1-17 0zM8.5 8c0-1.8 1.8-2 1.8-4M13.5 8c0-1.8 1.8-2 1.8-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', wand: '<path d="M5 19L17 7M14 4v3M19 9h-3M17 3l1 2M21 7l-2 1"/>',
  pulse: '<path d="M3 12.5h4l2.2-5.5 4 11 2.3-5.5H21"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
  sick: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10h.01M15.5 10h.01M8.5 15.5c2-1.5 5-1.5 7 0"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 14h4v3h-4zM8 20h8"/>',
  doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>', bug: '<rect x="7" y="8" width="10" height="11" rx="5"/><path d="M12 8V5M9 5l1.5 2M15 5l-1.5 2M3 13h4M17 13h4M4 18l3-2M20 18l-3-2"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>', up: '<path d="M6 14l6-6 6 6"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>', lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  // Auftrag 25: Mehr-Tab (Suche, Sprache, Einheiten, Darstellung, Datenschutz, Ausrüstung, Betreiber, Hilfe)
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  ruler: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.5-1.8-.3-1.1.3-2.2 1.5-2.2h2a3.5 3.5 0 0 0 3.5-3.5c0-5.3-3.8-9.5-8.5-9.5z"/><circle cx="8" cy="11" r="1.2"/><circle cx="11" cy="7.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  tool: '<path d="M14.5 4.5a4 4 0 0 0-5 5L4 15v5h5l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-1-1-3z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2-2.5 4M12 16.8v.2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  // Auftrag 21: Schwimm-Hilfsmittel
  board: '<path d="M7 3.5h10a2 2 0 0 1 2 2V17a6.5 6.5 0 0 1-14 0V5.5a2 2 0 0 1 2-2z"/><path d="M9.5 7h5"/>', buoy: '<path d="M8 4h8a3 3 0 0 1 0 6h-1v4h1a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6h1v-4H8a3 3 0 0 1 0-6z"/>',
  fins: '<path d="M9 3h6l3 14-3 4H9l-3-4z"/><path d="M12 7v10"/>', paddles: '<rect x="6" y="3" width="12" height="18" rx="4"/><path d="M10 8h4M10 12h4"/>', snorkel: '<path d="M15 3v12a5 5 0 0 1-10 0"/><path d="M13 3h4"/>'
};
const svg = (paths: string, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export function sportIcon(sport: string): string { return svg(SPORT_PATHS[sport] || SPORT_PATHS.other, 1.8); }
export function ic(name: string): string { return svg(UI[name] || UI.info); }
export const SPORT_LABEL_KEY: Record<string, string> = { swim: 'sport.swim', bike: 'sport.bike', run: 'sport.run', strength: 'sport.strength', football: 'sport.football', rest: 'sport.rest', walk: 'sport.walk', multi: 'sport.multi', other: 'sport.other' };
