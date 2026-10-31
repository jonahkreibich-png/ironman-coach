// App-Icon-Entwürfe (Auftrag 25) als SVG, Raster 100×100, randlos (iOS rundet selbst ab).
// Genutzt von scripts/icon-varianten.mjs (Vorschau) und scripts/make-icons.mjs (echte Icons und Startbilder).
// Farben aus dem Glas-Design: Akzent #0652c4 / #4b9bff, Schwimmen #1f6feb, Rad #15935a, Laufen #dd3f35, Pfirsich-Ton der Hintergrund-Flecken.

const BG = {
  light: ['#1d6ef0', '#0645b0'], // helles Icon: kräftiges Blau mit Verlauf
  dark: ['#18263c', '#070c16']   // dunkles Icon: fast schwarz mit Blau-Schimmer
};
const bg = (id, mode) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${BG[mode][0]}"/><stop offset="1" stop-color="${BG[mode][1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#${id})"/>`;
const glow = mode => mode === 'light' ? '<ellipse cx="30" cy="8" rx="60" ry="30" fill="#fff" opacity=".10"/>' : '<ellipse cx="30" cy="6" rx="60" ry="28" fill="#4b9bff" opacity=".10"/>';

export const VARIANTS = [
  {
    id: 'welle',
    name: 'Welle → Straße',
    idea: 'Zwei Wellen (Schwimmen) gehen in eine ansteigende Straße über, am Ende das Ziel.',
    svg(mode = 'light', key = 'w') {
      const ink = mode === 'light' ? '#ffffff' : '#7db4ff';
      const sun = mode === 'light' ? '#ffb58f' : '#ff8a5c';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('bg' + key, mode)}${glow(mode)}
        <path d="M10 64 q6.5 -10 13 0 t13 0 t13 0 L77 35" fill="none" stroke="${ink}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="80.5" cy="30.5" r="8.5" fill="${sun}"/></svg>`;
    }
  },
  {
    id: 'puls',
    name: 'Puls-Bogen',
    idea: 'Ein Herzschlag, der in einen Bogen nach oben übergeht: Belastung wird zu Fortschritt.',
    svg(mode = 'light', key = 'p') {
      const ink = mode === 'light' ? '#ffffff' : '#7db4ff';
      const tip = mode === 'light' ? '#ffb58f' : '#ff8a5c';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg('bg' + key, mode)}${glow(mode)}
        <path d="M12 60 H30 L37 47 L46 72 L56 36 C62 26 70 22 80 22" fill="none" stroke="${ink}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M71 13 L84 22 L73 33" fill="none" stroke="${tip}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
  },
  {
    id: 'tempo',
    name: 'Tempo-Form',
    idea: 'Drei schräge Balken in den Farben Schwimmen, Rad, Laufen – wie Bewegung nach vorn.',
    svg(mode = 'light', key = 't') {
      const back = mode === 'light' ? '<rect width="100" height="100" fill="#f4f7fb"/><ellipse cx="25" cy="10" rx="70" ry="34" fill="#dce8fb" opacity=".7"/>' : bg('bg' + key, mode) + glow(mode);
      const c = mode === 'light' ? ['#1f6feb', '#15935a', '#dd3f35'] : ['#5d9dff', '#3cc27e', '#ff6e61'];
      const bar = (x, y, len, col) => `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y - len * 0.62}" stroke="${col}" stroke-width="11" stroke-linecap="round"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${back}
        ${bar(16, 52, 28, c[0])}${bar(28, 70, 40, c[1])}${bar(46, 84, 38, c[2])}</svg>`;
    }
  },
  {
    id: 'ring',
    name: 'Fortschritts-Ring',
    idea: 'Ein fast geschlossener Ring mit Verlauf Schwimmen → Rad → Laufen, der Punkt zeigt, wo du gerade stehst.',
    svg(mode = 'light', key = 'r') {
      const back = mode === 'light' ? '<rect width="100" height="100" fill="#ffffff"/><ellipse cx="30" cy="8" rx="70" ry="34" fill="#e3edfb" opacity=".8"/>' : bg('bg' + key, mode) + glow(mode);
      const c = mode === 'light' ? ['#1f6feb', '#15935a', '#dd3f35'] : ['#5d9dff', '#3cc27e', '#ff6e61'];
      // Ring 300° von oben im Uhrzeigersinn, Verlauf über drei Bögen
      const R = 29, cx = 50, cy = 52;
      const pt = a => [cx + R * Math.sin(a * Math.PI / 180), cy - R * Math.cos(a * Math.PI / 180)].map(v => v.toFixed(2));
      const arc = (a0, a1, col) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `<path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"/>`; };
      const [ex, ey] = pt(300);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${back}
        ${arc(0, 100, c[0])}${arc(100, 200, c[1])}${arc(200, 300, c[2])}
        <circle cx="${ex}" cy="${ey}" r="4.2" fill="${mode === 'light' ? '#fff' : '#0b1422'}"/></svg>`;
    }
  }
];
export const byId = id => VARIANTS.find(v => v.id === id);

/* Auftrag 25, Runde 2: Jonah wählt Variante 1 als Grundlage. Weiche Welle unten (Wasser), daraus ein leicht geschwungener Weg,
   der perspektivisch nach hinten oben läuft und an einer Sonne endet. Dicke Formen, damit es auch mit 20-29 px lesbar bleibt.
   Dunkel: dunkles Petrol statt fast Schwarz. Gemeinsame Form, drei Farbwelten (1a Blau, 1b Petrol → Orange, 1c Petrol + Orange). */
const PALETTES = {
  '1a': {
    light: { bg: ['#2a7cf6', '#0a4fc0', '#063a94'], waterLow: '#dce9ff', wave: '#ffffff', road: '#ffffff', sun: ['#ffd29a', '#ff9a5c'], shade: '#03255f' },
    dark: { bg: ['#16586a', '#0b3a48', '#062530'], waterLow: '#86c6e6', wave: '#bfe9ff', road: '#e9f6ff', sun: ['#ffc58a', '#ff8a4c'], shade: '#021419' }
  },
  '1b': {
    light: { bg: ['#ff9b54', '#d9645a', '#1f5f86', '#0b3c5d'], stops: [0, 0.32, 0.72, 1], waterLow: '#d6ecf5', wave: '#ffffff', road: '#ffffff', sun: ['#fff4d6', '#ffd08a'], shade: '#0a2a40' },
    dark: { bg: ['#9a4a2c', '#5a3a44', '#14505f', '#072c37'], stops: [0, 0.3, 0.7, 1], waterLow: '#8fcfdc', wave: '#c8eef5', road: '#f3f8fa', sun: ['#ffe2b0', '#ffae66'], shade: '#03171d' }
  },
  '1c': {
    light: { bg: ['#16a0a6', '#0b7c86', '#075a66'], waterLow: '#d3f1f2', wave: '#ffffff', road: '#ffffff', sun: ['#ffb36b', '#ff7a2f'], shade: '#03363d' },
    dark: { bg: ['#12606a', '#0a414b', '#052a31'], waterLow: '#84cdd2', wave: '#bdeef0', road: '#eef9fa', sun: ['#ffae66', '#ff7a2f'], shade: '#021a1e' }
  }
};
/* Weg mit Perspektive: Mittellinie als Bézier-Kurve, Breite nimmt nach hinten ab, Ränder als Versatz senkrecht zur Kurve */
function roadPath() {
  const P = [[50, 92], [49, 66], [67, 58], [70.5, 37.5]];
  const at = t => { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
  const dir = t => { const a = at(Math.max(0, t - 0.005)), b = at(Math.min(1, t + 0.005)); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const width = t => 30 * Math.pow(1 - t, 1.1) + 5.2;
  const L = [], R = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, c = at(t), d = dir(t), w = width(t) / 2; L.push([c[0] - d[1] * w, c[1] + d[0] * w]); R.push([c[0] + d[1] * w, c[1] - d[0] * w]); }
  const f = q => q.map(v => v.toFixed(2)).join(' ');
  const C = []; for (let i = 6; i <= 30; i++) C.push(at(i / 40));
  return { edge: 'M' + L.map(f).join(' L') + ' L' + R.reverse().map(f).join(' L') + ' Z', mid: 'M' + C.map(f).join(' L') };
}
const { edge: ROAD, mid: LANE } = roadPath();
function waveRoad(p, key) {
  const stops = p.stops || p.bg.map((_, i) => i / (p.bg.length - 1));
  const id = s => s + key;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="${id('g')}" x1="0.15" y1="0" x2="0.55" y2="1">${p.bg.map((c, i) => `<stop offset="${stops[i]}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="${id('s')}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${p.sun[0]}"/><stop offset="1" stop-color="${p.sun[1]}"/></radialGradient>
    <radialGradient id="${id('h')}" cx="0.75" cy="0.2" r="0.55"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id('w')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.wave}"/><stop offset="1" stop-color="${p.waterLow || p.wave}"/></linearGradient>
    <linearGradient id="${id('r')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.road}"/><stop offset="1" stop-color="${p.road}" stop-opacity=".82"/></linearGradient>
    <filter id="${id('f')}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="${p.shade}" flood-opacity=".35"/></filter>
  </defs>
  <rect width="100" height="100" fill="url(#${id('g')})"/>
  <rect width="100" height="100" fill="url(#${id('h')})"/>
  <g filter="url(#${id('f')})">
    <circle cx="70.5" cy="25.5" r="13.2" fill="url(#${id('s')})"/>
    <path d="${ROAD}" fill="url(#${id('r')})"/>
    <path d="${LANE}" fill="none" stroke="${p.shade}" stroke-opacity=".28" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 3.2"/>
    <path d="M-2 75 C 10 66, 22 66, 34 74 S 58 83, 70 74.5 S 92 66, 102 71 L 102 102 L -2 102 Z" fill="url(#${id('w')})"/>
  </g></svg>`;
}
export const WAVE_VARIANTS = [
  { id: 'w1a', num: '1a', name: 'Welle → Weg, Blau', idea: 'Wie bisher in Blau: weiche Welle unten, geschwungener Weg nach hinten oben, Sonne als Ziel.', svg: (mode = 'light', key = 'a') => waveRoad(PALETTES['1a'][mode], key) },
  { id: 'w1b', num: '1b', name: 'Welle → Weg, Sonnenaufgang', idea: 'Verlauf von Tiefblau/Petrol (Wasser) nach Orange (Ziel, Sonnenaufgang).', svg: (mode = 'light', key = 'b') => waveRoad(PALETTES['1b'][mode], key) },
  { id: 'w1c', num: '1c', name: 'Welle → Weg, Petrol + Orange', idea: 'Petrol als Grundfarbe, die Sonne als oranger Akzent.', svg: (mode = 'light', key = 'c') => waveRoad(PALETTES['1c'][mode], key) }
];

/* Auftrag 25, Runde 3: zurück zum grafischen Zeichen von Variante 1, keine Landschaft. Eine einzige dicke weiße Linie:
   zwei weiche Wellen (Wasser), die ohne Knick in einen Bogen nach oben übergehen; am Ende ein oranger Punkt (Ziel).
   Runde Enden, 10,5 von 100 dick (bei 20 px noch gut 2 px). Dunkel: dunkles Petrol statt fast Schwarz. */
function linePath({ x0 = 9, y0 = 62, half = 15, amp = 16, dip = 0.7, c2 = [66, 30], end = [76, 29] } = {}) {
  let d = `M${x0} ${y0} q${half / 2} ${-amp} ${half} 0 t${half} 0 t${half} 0`;
  const jx = x0 + 3 * half, jy = y0;
  // Fortsetzung genau in Richtung des letzten Abstiegs: glatter Übergang von der Welle in den Bogen
  const c1 = [jx + (half / 2) * dip, jy + amp * dip];
  return d + ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0]} ${c2[1]}, ${end[0]} ${end[1]}`;
}
const LINE = linePath();
const LINE_BG = {
  petrol: { light: ['#1a9aa3', '#0d6f7b', '#08505c'], dark: ['#17606b', '#0d4049', '#072a31'] },
  blue: { light: ['#2a7cf6', '#0a52c4', '#06409c'], dark: ['#17606b', '#0d4049', '#072a31'] }
};
function lineIcon(bgKey, mode, key, lineGrad, scale = 1) {
  const c = LINE_BG[bgKey][mode];
  const id = s => s + key;
  const stroke = lineGrad ? `url(#${id('l')})` : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="${id('g')}" x1="0.1" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="0.55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>
    <radialGradient id="${id('h')}" cx="0.3" cy="0.05" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id('d')}" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffc08a"/><stop offset="1" stop-color="#ff7a35"/></radialGradient>
    ${lineGrad ? `<linearGradient id="${id('l')}" gradientUnits="userSpaceOnUse" x1="10" y1="62" x2="76" y2="30"><stop offset="0" stop-color="#9fdcff"/><stop offset="0.5" stop-color="#c9ecff"/><stop offset="0.8" stop-color="#ffffff"/></linearGradient>` : ''}
    <filter id="${id('f')}" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#00141a" flood-opacity=".3"/></filter>
  </defs>
  <rect width="100" height="100" fill="url(#${id('g')})"/><rect width="100" height="100" fill="url(#${id('h')})"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)"><g filter="url(#${id('f')})"><path d="${LINE}" fill="none" stroke="${stroke}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="81.5" cy="27.5" r="8.8" fill="url(#${id('d')})"/></g></g></svg>`;
}
export const LINE_VARIANTS = [
  { id: 'w1', num: '1', name: 'Zum Vergleich: ursprüngliche Variante 1', idea: 'So sah Variante 1 in der ersten Runde aus.', svg: (mode = 'light', key = 'o') => VARIANTS[0].svg(mode, key) },
  { id: 'l2a', num: '2a', name: 'Welle → Bogen, Petrol', idea: 'Hintergrund Petrol, Verlauf von hell nach dunkel; weiße Linie, oranger Punkt.', svg: (mode = 'light', key = 'a') => lineIcon('petrol', mode, key, false) },
  { id: 'l2b', num: '2b', name: 'Welle → Bogen, Blau', idea: 'Hintergrund Blau wie bisher; weiße Linie, oranger Punkt.', svg: (mode = 'light', key = 'b') => lineIcon('blue', mode, key, false) },
  { id: 'l2c', num: '2c', name: 'Welle → Bogen, Petrol mit Linienverlauf', idea: 'Hintergrund Petrol; die Linie geht von Hellblau (Welle) in Weiß (Bogen) über.', svg: (mode = 'light', key = 'c') => lineIcon('petrol', mode, key, true) }
];

/* Auftrag 25, Runde 4 (Feinschliff von 2a): Wellen flacher und kleiner, der Bogen wird zum Hauptteil und läuft oben flacher aus;
   der orange Punkt sitzt mit Abstand in Verlängerung des Linienendes (Sonne/Ziel). 3a weiß, 3b Welle hellblau → Bogen weiß. */
function fineGeo({ x0 = 9, y0 = 75, half = 13, amp = 10, dip = 0.5, c2 = [52, 30], end = [68, 27], w = 9.5, r = 8.5, gap = 3.5 } = {}) {
  let d = `M${x0} ${y0} q${half / 2} ${-amp} ${half} 0 t${half} 0 t${half} 0`;
  const jx = x0 + 3 * half, jy = y0;
  const c1 = [jx + (half / 2) * dip, jy + amp * dip];
  d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0]} ${c2[1]}, ${end[0]} ${end[1]}`;
  const ux = end[0] - c2[0], uy = end[1] - c2[1], l = Math.hypot(ux, uy), dist = w / 2 + r + gap;
  return { d, w, dot: [+(end[0] + ux / l * dist).toFixed(2), +(end[1] + uy / l * dist).toFixed(2), r] };
}
const FINE = fineGeo();
function fineIcon(mode, key, lineGrad) {
  const c = LINE_BG.petrol[mode];
  const id = s => s + key;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="${id('g')}" x1="0.1" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="0.55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>
    <radialGradient id="${id('h')}" cx="0.3" cy="0.05" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id('d')}" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffc08a"/><stop offset="1" stop-color="#ff7a35"/></radialGradient>
    ${lineGrad ? `<linearGradient id="${id('l')}" gradientUnits="userSpaceOnUse" x1="9" y1="75" x2="68" y2="27"><stop offset="0" stop-color="#a8defa"/><stop offset="0.42" stop-color="#bfe8fc"/><stop offset="0.62" stop-color="#ffffff"/></linearGradient>` : ''}
    <filter id="${id('f')}" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#00141a" flood-opacity=".3"/></filter>
  </defs>
  <rect width="100" height="100" fill="url(#${id('g')})"/><rect width="100" height="100" fill="url(#${id('h')})"/>
  <g filter="url(#${id('f')})"><path d="${FINE.d}" fill="none" stroke="${lineGrad ? `url(#${id('l')})` : '#ffffff'}" stroke-width="${FINE.w}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${FINE.dot[0]}" cy="${FINE.dot[1]}" r="${FINE.dot[2]}" fill="url(#${id('d')})"/></g></svg>`;
}
export const FINE_VARIANTS = [
  { ...LINE_VARIANTS[1], name: 'Zum Vergleich: 2a', idea: 'So sieht 2a aus der letzten Runde aus.' },
  { id: 'f3a', num: '3a', name: 'Kleine Wellen, langer Bogen, weiß', idea: 'Zwei kleine, ruhige Wellen; der aufsteigende Bogen ist der Hauptteil und läuft oben flacher aus. Der Punkt sitzt mit Abstand wie eine Sonne.', svg: (mode = 'light', key = 'f3a') => fineIcon(mode, key, false) },
  { id: 'f3b', num: '3b', name: 'Kleine Wellen, langer Bogen, Hellblau → Weiß', idea: 'Gleiche Form; die Welle ist hellblau und geht im Bogen in Weiß über. Hellblau so hell gewählt, dass es auch bei 29 px deutlich bleibt.', svg: (mode = 'light', key = 'f3b') => fineIcon(mode, key, true) }
];

/* Gewähltes App-Icon (Jonah, 31.10.): 2a, Petrol. maskable: Zeichen auf 72 % verkleinert, damit es in der sicheren Mitte liegt (Android/Chrome schneiden außen ab). */
export const APP_ICON = { id: '2a', svg: (mode = 'light', key = 'app', o = {}) => lineIcon('petrol', mode, key, false, o.maskable ? 0.72 : 1) };
