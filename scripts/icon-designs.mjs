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
