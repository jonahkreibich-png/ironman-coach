/* Auftrag 26: Kontrast der Farbvarianten zum neuen Icon (scripts/palettes.mjs), hell und dunkel, nach WCAG 2.1 AA:
   Text 4,5:1, Symbole/Balken/Sportfarben 3:1. Karten sind halbdurchsichtiges Glas: geprüft wird die Karte über dem ungünstigsten
   Hintergrund (Grundfarbe, jeder Farbfleck bzw. Verlauf oben/unten). Dazu: Ampel rot/gelb/grün klar getrennt, Orange ≠ Gelb,
   und web/src/palettes.css ist aus der Quelle erzeugt (keine Handänderung). */
import { test, expect } from 'vitest';
import fs from 'node:fs';
// @ts-ignore reines JS
import { PALETTES, paletteCss } from '../../scripts/palettes.mjs';

type RGB = [number, number, number];
const parse = (c: string): [RGB, number] => {
  if (c.startsWith('#')) { const n = parseInt(c.slice(1), 16); return [[n >> 16, (n >> 8) & 255, n & 255], 1]; }
  const m = /rgba?\(([^)]+)\)/.exec(c)!; const p = m[1].split(',').map(Number); return [[p[0], p[1], p[2]], p[3] ?? 1];
};
const over = (fg: string, bg: RGB): RGB => { const [c, a] = parse(fg); return c.map((v, i) => v * a + bg[i] * (1 - a)) as RGB; };
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v * t + b[i] * (1 - t)) as RGB;
const lum = (c: RGB) => { const l = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hue = (hex: string) => { const [[r, g, b]] = parse(hex); const R = r / 255, G = g / 255, B = b / 255; const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (!d) return 0; const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; return (h * 60 + 360) % 360; };
const hueDist = (a: string, b: string) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

/* Hintergründe, auf denen Karten liegen können: Grundfarbe und Farbflecken (so stark wie in design.css gemischt) bzw. Verlauf */
function backdrops(t: Record<string, string>): RGB[] {
  const bg = parse(t.bg)[0];
  const out: RGB[] = [bg, mix(parse(t['blob-1'])[0], bg, 0.7), mix(parse(t['blob-2'])[0], bg, 0.55), mix(parse(t['blob-3'])[0], bg, 0.55)];
  if (t['grad-top']) out.push(parse(t['grad-top'])[0], parse(t['grad-bottom'])[0]);
  return out;
}
const TEXT_ON_CARD = ['ink', 'ink-2'];
const UI_ON_CARD = ['ink-3', 'accent', 'hl', 'good', 'warn', 'bad', 'swim', 'bike', 'run', 'strength', 'football'];

for (const p of PALETTES) for (const mode of ['light', 'dark'] as const) {
  const t = p[mode] as Record<string, string>;
  const label = `${p.name} ${mode === 'light' ? 'hell' : 'dunkel'}`;
  test(`${label}: Text auf Karten und Hintergrund mindestens 4,5:1`, () => {
    const bad: string[] = [];
    for (const b of backdrops(t)) for (const surf of ['surface', 'surface-2']) {
      const card = over(t[surf], b);
      for (const f of TEXT_ON_CARD) { const r = ratio(parse(t[f])[0], card); if (r < 4.5) bad.push(`${f} auf ${surf}: ${r.toFixed(2)}`); }
    }
    for (const b of backdrops(t)) for (const f of TEXT_ON_CARD) { const r = ratio(parse(t[f])[0], b); if (r < 4.5) bad.push(`${f} auf Hintergrund: ${r.toFixed(2)}`); }
    // Knöpfe und Kennzeichen (Pillen: farbiger Text auf zarter Fläche über der Karte)
    const pairs: [string, string][] = [['accent-ink', 'accent'], ['btn-ink', 'btn'], ['hl-ink', 'hl']];
    for (const [f, b] of pairs) { const r = ratio(parse(t[f])[0], parse(t[b])[0]); if (r < 4.5) bad.push(`${f} auf ${b}: ${r.toFixed(2)}`); }
    const card = over(t.surface, parse(t.bg)[0]);
    for (const k of ['accent', 'hl', 'good', 'warn', 'bad', 'info']) { const r = ratio(parse(t[k])[0], over(t[k + '-soft'], card)); if (r < 4.5) bad.push(`${k} auf ${k}-soft: ${r.toFixed(2)}`); }
    expect(bad).toEqual([]);
  });
  test(`${label}: Symbole, Ampel und Sportfarben mindestens 3:1`, () => {
    const bad: string[] = [];
    for (const b of backdrops(t)) { const card = over(t.surface, b); for (const f of UI_ON_CARD) { const r = ratio(parse(t[f])[0], card); if (r < 3) bad.push(`${f}: ${r.toFixed(2)}`); } }
    expect([...new Set(bad)]).toEqual([]);
  });
  test(`${label}: Ampel eindeutig, Orange nicht mit Gelb verwechselbar, Sportarten unterscheidbar`, () => {
    expect(hueDist(t.good, t.warn)).toBeGreaterThan(50);
    expect(hueDist(t.warn, t.bad)).toBeGreaterThan(25);
    expect(hueDist(t.good, t.bad)).toBeGreaterThan(90);
    expect(hueDist(t.hl, t.warn)).toBeGreaterThan(15);
    const sports = ['swim', 'bike', 'run', 'strength', 'football'];
    for (let i = 0; i < sports.length; i++) for (let j = i + 1; j < sports.length; j++) expect(hueDist(t[sports[i]], t[sports[j]]), `${sports[i]}/${sports[j]}`).toBeGreaterThan(30);
  });
}

test('palettes.css ist aus scripts/palettes.mjs erzeugt', () => {
  expect(fs.readFileSync('web/src/palettes.css', 'utf8')).toBe(paletteCss());
});
