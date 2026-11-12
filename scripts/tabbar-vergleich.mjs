// Vergleichsvideo der Tab-Leiste: links die iPhone-Aufnahme der Fitness-App (iOS 26), rechts die App (WebKit, iPhone-Größe, Touch;
// aufgenommen mit RECORD=1 TOUCH=1 NAME=meine-app-<version> npx playwright test tests/e2e/tabbar-video.spec.ts --project=webkit-iphone).
// Auftrag 34: Das mitgelieferte ffmpeg (Playwright) kann kein H.264 lesen. Deshalb liest Chrome beide Videos Bild für Bild (Canvas),
// das ffmpeg von Playwright schreibt daraus WebM (VP9). Dazu ein Bildvergleich der Leiste (Einzelbilder, klein genug fürs Repository).
// Aufruf: node scripts/tabbar-vergleich.mjs <eigenes-video.webm> [titel rechts]
// Ergebnis: docs/vergleich/vergleich-tableiste-<name>.webm (nicht im Repository) und docs/tabbar-ios26/vergleich-bilder-<name>.png
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { pathToFileURL } from 'node:url';

const D = 'docs/vergleich';
const ios = `${D}/ios26-fitness-tableiste.mp4`;
const mine = process.argv[2]; const title = process.argv[3] || 'Stamio';
if (!mine || !fs.existsSync(mine) || !fs.existsSync(ios)) { console.error('Aufruf: node scripts/tabbar-vergleich.mjs <eigenes-video.webm> [titel]'); process.exit(1); }
const name = path.basename(mine).replace(/\.\w+$/, '');
const pwDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'ms-playwright');
const ffDir = fs.existsSync(pwDir) ? fs.readdirSync(pwDir).find(d => d.startsWith('ffmpeg')) : null;
const FF = process.env.FFMPEG || (ffDir ? path.join(pwDir, ffDir, fs.readdirSync(path.join(pwDir, ffDir)).find(f => /^ffmpeg/.test(f))) : 'ffmpeg');
const LEN = +(process.env.LEN || 14), FPS = 30, W = 390, H = 844;

const browser = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
const html = path.resolve('node_modules/.cache/tabbar-vergleich.html');
fs.mkdirSync(path.dirname(html), { recursive: true });
fs.writeFileSync(html, '<!doctype html><body style="margin:0"><video id="a" muted preload="auto"></video><video id="b" muted preload="auto"></video><canvas id="c"></canvas></body>');
await page.goto(pathToFileURL(html).href);
await page.evaluate(async ([a, b]) => {
  const load = (id, src) => new Promise((r, j) => { const v = document.getElementById(id); v.onloadeddata = r; v.onerror = () => j(new Error('Video ' + src)); v.src = src; });
  await Promise.all([load('a', a), load('b', b)]);
}, [pathToFileURL(path.resolve(ios)).href, pathToFileURL(path.resolve(mine)).href]);
const frame = (t, kind) => page.evaluate(async ([t, kind, W, H, title]) => {
  const a = document.getElementById('a'), b = document.getElementById('b'), c = document.getElementById('c'), g = c.getContext('2d');
  const seek = (v, t) => new Promise(r => { const tt = Math.min(t, v.duration - 0.01); if (Math.abs(v.currentTime - tt) < 1e-4) return r(); v.onseeked = r; v.currentTime = tt; });
  await Promise.all([seek(a, t), seek(b, t)]);
  if (kind === 'full') {
    c.width = W * 2; c.height = H; g.drawImage(a, 0, 0, W, H); g.drawImage(b, W, 0, W, H);
    g.font = '600 20px sans-serif'; for (const [x, s] of [[12, 'iOS 26 Fitness'], [W + 12, title]]) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 6, 52, g.measureText(s).width + 12, 30); g.fillStyle = '#fff'; g.fillText(s, x, 74); }
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W - 40, H - 30, 80, 24); g.fillStyle = '#ff0'; g.font = '14px sans-serif'; g.fillText(t.toFixed(2) + ' s', W - 32, H - 13);
    return c.toDataURL('image/jpeg', 0.86);
  }
  // Leiste allein (unteres Drittel), für den Bildvergleich
  c.width = W; c.height = 300; g.drawImage(kind === 'a' ? a : b, 0, a.videoHeight * 0, a.videoWidth, 0, 0, 0, 0, 0);
  const v = kind === 'a' ? a : b; const sy = v.videoHeight * (690 / 844), sh = v.videoHeight * (150 / 844);
  c.height = 150; g.drawImage(v, 0, sy, v.videoWidth, sh, 0, 0, W, 150);
  return c.toDataURL('image/png');
}, [t, kind, W, H, title]);

// Video nebeneinander: Bilder als JPEG hintereinander in eine Datei (das mitgelieferte ffmpeg kann nicht aus einer Pipe lesen), dann WebM
const out = `${D}/vergleich-tableiste-${name}.webm`;
const tmp = path.resolve('node_modules/.cache/tabbar-vergleich.mjpeg'); fs.writeFileSync(tmp, '');
for (let i = 0; i < LEN * FPS; i++) fs.appendFileSync(tmp, Buffer.from((await frame(i / FPS, 'full')).split(',')[1], 'base64'));
await new Promise((res, rej) => { const ff = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'file:' + tmp, '-c:v', 'libvpx-vp9', '-b:v', '2500k', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' }); ff.on('error', rej); ff.on('exit', c => c ? rej(new Error('ffmpeg ' + c)) : res()); });
fs.unlinkSync(tmp);

// Bildvergleich: alle 0,5 s die Leiste, iOS oben, App unten
const shots = []; for (let t = 0; t < LEN; t += 0.5) shots.push([await frame(t, 'a'), await frame(t, 'b')]);
const sheet = await page.evaluate(async ([shots, W]) => {
  const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const cols = 7, rows = Math.ceil(shots.length / cols), w = W / 2, h = 75;
  const c = document.getElementById('c'); c.width = w * cols; c.height = rows * (2 * h + 16); const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < shots.length; k++) { const x = (k % cols) * w, y = Math.floor(k / cols) * (2 * h + 16); g.drawImage(await img(shots[k][0]), x, y + 14, w, h); g.drawImage(await img(shots[k][1]), x, y + 14 + h, w, h); g.fillStyle = '#ff0'; g.font = '11px sans-serif'; g.fillText((k / 2).toFixed(1) + ' s', x + 3, y + 11); }
  return c.toDataURL('image/png');
}, [shots, W]);
fs.mkdirSync('docs/tabbar-ios26', { recursive: true });
fs.writeFileSync(`docs/tabbar-ios26/vergleich-bilder-${name}.png`, Buffer.from(sheet.split(',')[1], 'base64'));
await browser.close();
console.log('fertig: ' + out + ', docs/tabbar-ios26/vergleich-bilder-' + name + '.png');
