// Erzeugt App-Icons und iPhone-Startbildschirme aus dem App-Namen (shared/brand.ts) im bisherigen Stil.
// Aufruf: npm run icons   (rendert mit Playwright/Chromium und den App-Schriften)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const brandSrc = fs.readFileSync('shared/brand.ts', 'utf8');
const pick = k => (new RegExp(k + ":\\s*'([^']*)'").exec(brandSrc) || [])[1];
const NAME = pick('name'), SHORT = pick('shortName');
const MARK = (pick('mark') || NAME.slice(0, 1)).toUpperCase();
const out = 'web/public';
const font = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(out, 'fonts', f)).toString('base64');
const CSS = `@font-face{font-family:BC;font-weight:700;src:url(${font('barlow-condensed-latin-700-normal.woff2')})}
html,body{margin:0;padding:0}`;
const lane = w => `<div style="height:${w * 0.045}px;width:${w * 0.6}px;border-radius:${w}px;background:repeating-linear-gradient(90deg,#e8491a 0 ${w * 0.055}px,#1f6feb ${w * 0.055}px ${w * 0.11}px,#15935a ${w * 0.11}px ${w * 0.165}px)"></div>`;
function iconHtml(s, opts = {}) {
  const pad = opts.maskable ? 0.18 : 0;
  const inner = s * (1 - pad * 2);
  return `<div style="width:${s}px;height:${s}px;background:#13202c;display:flex;align-items:center;justify-content:center;${opts.radius ? `border-radius:${s * 0.22}px;` : ''}">
    <div style="display:flex;flex-direction:column;align-items:center;gap:${inner * 0.02}px;margin-top:${inner * 0.04}px">
      <div style="font:700 ${inner * 0.62}px/0.82 BC;color:#fff;letter-spacing:-0.02em">${MARK}</div>${lane(inner)}</div></div>`;
}
function splashHtml(w, h, dark) {
  const s = Math.round(w * 0.285);
  return `<div style="width:${w}px;height:${h}px;background:${dark ? '#0c1117' : '#eef1f4'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${w * 0.07}px">
    ${iconHtml(s, { radius: true })}<div style="font:700 ${w * 0.075}px/1 BC;color:${dark ? '#e7edf2' : '#13202c'};text-transform:uppercase;letter-spacing:.02em">${NAME}</div></div>`;
}
const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>${CSS}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width: w, height: h } });
}
for (const [s, f] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png'], [64, 'favicon-64.png']]) await shot(iconHtml(s), s, s, 'icons/' + f);
await shot(iconHtml(512, { maskable: true }), 512, 512, 'icons/icon-maskable-512.png');
for (const f of fs.readdirSync(path.join(out, 'splash'))) {
  const m = /^(light|dark)-(\d+)x(\d+)\.png$/.exec(f); if (!m) continue;
  // In CSS-Pixeln rendern und mit Gerätefaktor 3 bzw. 2 hochrechnen
  const w = +m[2], h = +m[3], dpr = w >= 1000 ? 3 : 2;
  const ctx = await browser.newContext({ viewport: { width: Math.round(w / dpr), height: Math.round(h / dpr) }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.setContent(`<style>${CSS}</style>${splashHtml(Math.round(w / dpr), Math.round(h / dpr), m[1] === 'dark')}`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, 'splash', f) });
  await ctx.close();
}
await browser.close();
console.log(`Icons und Startbildschirme für „${NAME}“ (${SHORT}) erzeugt.`);
