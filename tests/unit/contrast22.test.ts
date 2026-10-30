/* Auftrag 22: ausreichender Kontrast hell und dunkel (WCAG 2.1: Text 4,5:1, große/fette kleine Kennzeichen und Rahmen-Symbole 3:1).
   Die Farben kommen direkt aus web/src/styles.css – eine neue Farbe muss hier durch. */
import { test, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('web/src/styles.css', 'utf8');
function tokens(block: string): Record<string, string> { const out: Record<string, string> = {}; for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2]; return out; }
const light = tokens(/:root \{([\s\S]*?)\n\}/.exec(css)![1]);
const dark = { ...light, ...tokens(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)![1]) };
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Text auf Flächen (4,5) und Hinweis-Farben auf ihren hellen Flächen (Pillen, Banner: 4,5)
const TEXT: [string, string][] = [['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['ink-2', 'surface'], ['ink-2', 'bg'], ['ink-2', 'surface-2'], ['accent-ink', 'accent'],
  ['good', 'good-soft'], ['warn', 'warn-soft'], ['bad', 'bad-soft'], ['info', 'info-soft'], ['accent', 'accent-soft'], ['ink', 'warn-soft'], ['ink', 'bad-soft'], ['ink', 'good-soft']];
// Symbole, Balken, Tab-Beschriftung inaktiv (3,0)
const UI: [string, string][] = [['ink-3', 'surface'], ['good', 'surface'], ['warn', 'surface'], ['bad', 'surface'], ['accent', 'surface'], ['swim', 'surface'], ['bike', 'surface'], ['run', 'surface'], ['strength', 'surface']];
for (const [name, t] of [['hell', light], ['dunkel', dark]] as const) {
  test(`Kontrast ${name}: Text mindestens 4,5:1`, () => {
    const bad = TEXT.map(([f, b]) => [f, b, ratio(t[f], t[b])] as const).filter(x => x[2] < 4.5).map(x => `${x[0]} auf ${x[1]}: ${x[2].toFixed(2)}`);
    expect(bad).toEqual([]);
  });
  test(`Kontrast ${name}: Symbole und Kennzeichen mindestens 3:1`, () => {
    const bad = UI.map(([f, b]) => [f, b, ratio(t[f], t[b])] as const).filter(x => x[2] < 3).map(x => `${x[0]} auf ${x[1]}: ${x[2].toFixed(2)}`);
    expect(bad).toEqual([]);
  });
}
