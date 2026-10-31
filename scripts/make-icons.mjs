// Erzeugt App-Icons und iPhone-Startbildschirme aus dem gewählten Icon (scripts/icon-designs.mjs APP_ICON, Auftrag 25: 2a Petrol)
// und dem App-Namen (shared/brand.ts). Aufruf: npm run icons   (rendert mit Playwright/Chromium, gestochen scharf aus SVG)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ICON } from './icon-designs.mjs';

const brandSrc = fs.readFileSync('shared/brand.ts', 'utf8');
const pick = k => (new RegExp(k + ":\\s*'([^']*)'").exec(brandSrc) || [])[1];
const NAME = pick('name'), SHORT = pick('shortName');
const out = 'web/public';
const CSS = 'html,body{margin:0;padding:0;background:transparent}svg{display:block;width:100%;height:100%}';

// Icon randlos (iOS und Browser runden selbst ab); maskable mit sicherer Mitte
const icon = (s, o = {}) => `<div style="width:${s}px;height:${s}px;${o.radius ? `border-radius:${s * 0.225}px;overflow:hidden;` : ''}">${APP_ICON.svg(o.mode || 'light', 'i' + s + (o.mode || '') + (o.maskable ? 'm' : ''), o)}</div>`;
// Startbild: Hintergrund wie die App (Glas-Design), Icon in der Mitte, Name darunter
function splashHtml(w, h, dark) {
  const s = Math.round(w * 0.285);
  return `<div style="width:${w}px;height:${h}px;background:${dark ? '#060a12' : '#e8edf4'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${w * 0.065}px">
    <div style="box-shadow:0 ${s * 0.06}px ${s * 0.18}px rgba(${dark ? '0,0,0,.55' : '8,60,70,.22'});border-radius:${s * 0.225}px">${icon(s, { radius: true, mode: dark ? 'dark' : 'light' })}</div>
    <div style="font:600 ${w * 0.072}px/1 ui-rounded,'SF Pro Rounded',-apple-system,'Segoe UI',system-ui,sans-serif;color:${dark ? '#eef3fa' : '#0b1b2b'};letter-spacing:.01em">${NAME}</div></div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>${CSS}</style>${html}`);
  await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width: w, height: h }, omitBackground: false });
}
for (const [s, f] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png'], [64, 'favicon-64.png']]) await shot(icon(s), s, s, 'icons/' + f);
await shot(icon(512, { maskable: true }), 512, 512, 'icons/icon-maskable-512.png');
for (const f of fs.readdirSync(path.join(out, 'splash'))) {
  const m = /^(light|dark)-(\d+)x(\d+)\.png$/.exec(f); if (!m) continue;
  // In CSS-Pixeln rendern und mit Gerätefaktor 3 bzw. 2 hochrechnen
  const w = +m[2], h = +m[3], dpr = w >= 1000 ? 3 : 2;
  const ctx = await browser.newContext({ viewport: { width: Math.round(w / dpr), height: Math.round(h / dpr) }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.setContent(`<style>${CSS}</style>${splashHtml(Math.round(w / dpr), Math.round(h / dpr), m[1] === 'dark')}`);
  await p.screenshot({ path: path.join(out, 'splash', f) });
  await ctx.close();
}
await browser.close();
console.log(`Icons (${APP_ICON.id}) und Startbildschirme für „${NAME}“ (${SHORT}) erzeugt.`);
