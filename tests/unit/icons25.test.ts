/* Auftrag 25: neues App-Icon (2a). Alle Icons und Startbilder haben die richtige Größe, die Seite verweist darauf, und das
   Icon kommt aus derselben Zeichnung wie die Vorschau (scripts/icon-designs.mjs APP_ICON). */
import { test, expect } from 'vitest';
import fs from 'node:fs';
// @ts-ignore – reines JS
import { APP_ICON } from '../../scripts/icon-designs.mjs';

const size = (f: string) => { const b = fs.readFileSync(f); expect(b.subarray(1, 4).toString()).toBe('PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
test('Icons in allen Größen', () => {
  for (const [f, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['favicon-64.png', 64]] as const) expect(size('web/public/icons/' + f), f).toEqual([s, s]);
});
test('Startbilder hell und dunkel für jedes iPhone, Größe wie im Namen', () => {
  const files = fs.readdirSync('web/public/splash');
  const html = fs.readFileSync('web/index.html', 'utf8');
  for (const f of files) { const m = /^(light|dark)-(\d+)x(\d+)\.png$/.exec(f)!; expect(m, f).toBeTruthy(); expect(size('web/public/splash/' + f)).toEqual([+m[2], +m[3]]); expect(html).toContain('splash/' + f); }
  expect(files.filter(f => f.startsWith('light')).length).toBe(files.filter(f => f.startsWith('dark')).length);
});
test('gewähltes Icon: 2a Petrol, dunkel ohne fast Schwarz, maskable mit sicherer Mitte', () => {
  expect(APP_ICON.id).toBe('2a');
  expect(APP_ICON.svg('light', 't')).toContain('#1a9aa3');
  expect(APP_ICON.svg('dark', 't')).toContain('#17606b');
  expect(APP_ICON.svg('light', 't', { maskable: true })).toContain('scale(0.72)');
  expect(fs.readFileSync('web/index.html', 'utf8')).toContain('icons/apple-touch-icon.png');
});
