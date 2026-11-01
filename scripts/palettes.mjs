/* Auftrag 26: Farbvarianten passend zum neuen Icon (Petrol, weiße Linie, oranger Punkt).
   Eine Quelle für alle Farben je Variante: daraus entsteht web/src/palettes.css (node scripts/palettes.mjs),
   und tests/unit/contrast26.test.ts prüft jede Variante hell und dunkel auf WCAG AA.
   Umschalten in der Test-App: Mehr → Darstellung → Farbvariante (nur Test-Umgebung), gespeichert als palette_pref.

   Begriffe: bg Hintergrund, surface Karten (Glas, halbdurchsichtig), ink Text, accent Akzent (Tabs, Links, Auswahl),
   hl Hervorhebung (Orange wie der Punkt im Icon: Ziel, Wettkampf, neue Nachrichten), btn Hauptknopf,
   good/warn/bad Ampel, swim/bike/run/strength/football Sportarten, blob-1..3 weiche Farbflecken im Hintergrund. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const soft = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function withSoft(t, a) {
  return { ...t, 'accent-soft': soft(t.accent, a), 'hl-soft': soft(t.hl, a), 'good-soft': soft(t.good, a), 'warn-soft': soft(t.warn, a), 'bad-soft': soft(t.bad, a), 'info-soft': soft(t.info, a) };
}

export const PALETTES = [
  {
    id: 'a', name: 'A · Tiefes Petrol',
    idea: 'Hintergrund sehr dunkles Petrol wie die dunkle Fassung des Icons, Akzent Türkis, Orange (der Punkt im Icon) nur für Wichtiges: Ziel, Wettkampf, neue Nachrichten.',
    light: withSoft({
      bg: '#e2eeee', surface: 'rgba(255,255,255,.66)', 'surface-2': 'rgba(255,255,255,.52)', ink: '#06262b', 'ink-2': '#33575b', 'ink-3': '#4a6d71', line: 'rgba(255,255,255,.75)',
      accent: '#0a6c76', 'accent-ink': '#ffffff', hl: '#a8380b', 'hl-ink': '#ffffff', btn: '#0a6c76', 'btn-ink': '#ffffff',
      good: '#086b36', warn: '#875800', bad: '#b42318', info: '#1d5fc4',
      swim: '#1e66c9', bike: '#3a8a1c', run: '#c92f50', strength: '#7444cc', football: '#946600', rest: '#647b7e',
      'blob-1': '#8fd3d3', 'blob-2': '#ffc9a8', 'blob-3': '#a8e0d8', scrim: 'rgba(4,26,30,.45)',
      shadow: '0 1px 0 rgba(255,255,255,.8) inset, 0 8px 28px rgba(6,60,66,.12)'
    }, .13),
    dark: withSoft({
      bg: '#03171b', surface: 'rgba(16,58,64,.55)', 'surface-2': 'rgba(22,72,78,.5)', ink: '#e6f5f4', 'ink-2': '#a5c6c5', 'ink-3': '#8bb1b1', line: 'rgba(255,255,255,.12)',
      accent: '#3fd0c9', 'accent-ink': '#022a2a', hl: '#ff8f4f', 'hl-ink': '#2a1102', btn: '#3fd0c9', 'btn-ink': '#022a2a',
      good: '#55d27b', warn: '#f5c84c', bad: '#ff6f6a', info: '#7cb4ff',
      swim: '#5aaaff', bike: '#9bd65a', run: '#ff6f8a', strength: '#b994ff', football: '#f2b84b', rest: '#7e9a9c',
      'blob-1': '#0f5560', 'blob-2': '#5c2a14', 'blob-3': '#0b4a45', scrim: 'rgba(0,10,12,.55)',
      shadow: '0 1px 0 rgba(255,255,255,.07) inset, 0 10px 30px rgba(0,0,0,.45)'
    }, .16)
  },
  {
    id: 'b', name: 'B · Mitternacht + Petrol',
    idea: 'Fast neutraler, sehr dunkler Hintergrund mit leichtem Blau-Grün-Stich, ruhig wie bisher. Akzente Petrol, Orange ganz sparsam (nur Ziel und neue Nachrichten).',
    light: withSoft({
      bg: '#edf1f2', surface: 'rgba(255,255,255,.72)', 'surface-2': 'rgba(255,255,255,.56)', ink: '#0d1a1e', 'ink-2': '#425157', 'ink-3': '#59686d', line: 'rgba(255,255,255,.78)',
      accent: '#0b6b76', 'accent-ink': '#ffffff', hl: '#a03c0d', 'hl-ink': '#ffffff', btn: '#0b6b76', 'btn-ink': '#ffffff',
      good: '#086b36', warn: '#875800', bad: '#b42318', info: '#2457c0',
      swim: '#1f63d1', bike: '#13804a', run: '#c63a24', strength: '#7349d1', football: '#926400', rest: '#6c7a7f',
      'blob-1': '#bcdde0', 'blob-2': '#f3d9cb', 'blob-3': '#d3e7e3', scrim: 'rgba(8,14,16,.45)',
      shadow: '0 1px 0 rgba(255,255,255,.8) inset, 0 8px 28px rgba(20,40,46,.10)'
    }, .12),
    dark: withSoft({
      bg: '#070b0d', surface: 'rgba(30,39,43,.6)', 'surface-2': 'rgba(40,51,55,.55)', ink: '#edf2f3', 'ink-2': '#a9b6b9', 'ink-3': '#909ea2', line: 'rgba(255,255,255,.11)',
      accent: '#35bdb9', 'accent-ink': '#021b1b', hl: '#ff8a4c', 'hl-ink': '#2a1102', btn: '#35bdb9', 'btn-ink': '#021b1b',
      good: '#4fd083', warn: '#f2c14e', bad: '#ff6b66', info: '#74a9ff',
      swim: '#4f9dff', bike: '#57c785', run: '#ff7a5c', strength: '#a98bff', football: '#e9b949', rest: '#7f8b8f',
      'blob-1': '#0d3237', 'blob-2': '#2a1a12', 'blob-3': '#0a2427', scrim: 'rgba(0,0,0,.55)',
      shadow: '0 1px 0 rgba(255,255,255,.07) inset, 0 10px 30px rgba(0,0,0,.5)'
    }, .15)
  },
  {
    id: 'c', name: 'C · Ozean',
    idea: 'Dunkler Hintergrund mit leichtem Verlauf (oben Petrol wie die Icon-Oberkante, unten fast schwarz), Karten aus mattem Glas. Akzent Türkis für Tabs und Auswahl, Hauptknöpfe Orange wie der Punkt im Icon.',
    light: withSoft({
      bg: '#eef5f5', surface: 'rgba(255,255,255,.6)', 'surface-2': 'rgba(255,255,255,.46)', ink: '#062328', 'ink-2': '#33555a', 'ink-3': '#486a6e', line: 'rgba(255,255,255,.7)',
      accent: '#0a6a74', 'accent-ink': '#ffffff', hl: '#a8380a', 'hl-ink': '#ffffff', btn: '#b33c0b', 'btn-ink': '#ffffff',
      good: '#086b36', warn: '#875800', bad: '#b42318', info: '#1d5fc4',
      swim: '#1e66c9', bike: '#3a8a1c', run: '#c92f50', strength: '#7444cc', football: '#946600', rest: '#647b7e',
      'blob-1': '#bfe3e5', 'blob-2': '#ffd9c2', 'blob-3': '#d5eeee', 'grad-top': '#c4e3e6', 'grad-bottom': '#f3f8f8', scrim: 'rgba(4,26,30,.45)',
      shadow: '0 1px 0 rgba(255,255,255,.8) inset, 0 8px 28px rgba(6,60,66,.10)'
    }, .13),
    dark: withSoft({
      bg: '#03090b', surface: 'rgba(255,255,255,.075)', 'surface-2': 'rgba(255,255,255,.055)', ink: '#eaf6f7', 'ink-2': '#a9c4c7', 'ink-3': '#90b1b5', line: 'rgba(255,255,255,.12)',
      accent: '#4fd6cb', 'accent-ink': '#02292a', hl: '#ff9152', 'hl-ink': '#2a1102', btn: '#ff8a4c', 'btn-ink': '#2a1102',
      good: '#5fd68d', warn: '#f6cb52', bad: '#ff7470', info: '#7fb6ff',
      swim: '#62b6ff', bike: '#a3dc5f', run: '#ff7896', strength: '#c09bff', football: '#f5bd52', rest: '#86a3a6',
      'blob-1': '#0f4048', 'blob-2': '#5a2a14', 'blob-3': '#06252b', 'grad-top': '#0f4048', 'grad-bottom': '#03090b', scrim: 'rgba(0,8,10,.6)',
      shadow: '0 1px 0 rgba(255,255,255,.06) inset, 0 12px 32px rgba(0,0,0,.5)'
    }, .16),
    // Verlauf statt Flecken, mattes Glas (stärker weichgezeichnet, weniger Farbsättigung)
    css: p => `${p} body { background: radial-gradient(70% 30% at 100% 0%, color-mix(in srgb, var(--hl) 14%, transparent), transparent 70%), linear-gradient(180deg, var(--grad-top) 0%, color-mix(in srgb, var(--grad-top) 45%, var(--grad-bottom)) 38%, var(--grad-bottom) 78%); background-attachment: fixed; }
:root${p} { --glass-blur: blur(28px) saturate(130%); }
${p} .tabbar { background: color-mix(in srgb, var(--grad-bottom) 62%, transparent); }`
  }
];

const block = t => Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(' ');
export function paletteCss() {
  let out = '/* Erzeugt von scripts/palettes.mjs (Auftrag 26) – nicht von Hand ändern. Farbvarianten über <html data-palette="a|b|c">. */\n';
  for (const p of PALETTES) {
    const sel = `:root[data-palette="${p.id}"]`;
    out += `\n/* ${p.name} */\n${sel} { ${block(p.light)} color-scheme: light; }\n`;
    out += `@media (prefers-color-scheme: dark) { ${sel}:not([data-theme="light"]) { ${block(p.dark)} color-scheme: dark; } }\n`;
    out += `${sel}[data-theme="dark"] { ${block(p.dark)} color-scheme: dark; }\n`;
    if (p.css) out += p.css(`[data-palette="${p.id}"]`) + '\n';
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fs.writeFileSync('web/src/palettes.css', paletteCss());
  console.log('web/src/palettes.css geschrieben');
}
