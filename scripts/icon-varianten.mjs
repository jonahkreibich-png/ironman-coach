// Erzeugt icon-varianten.html: jede Icon-Variante auf einem iPhone-Homescreen in echter Größe (393 × 852 pt, Icons 60 pt),
// hell und dunkel, dazu kleine Größen und Startbilder. Aufruf: node scripts/icon-varianten.mjs
import fs from 'node:fs';
import { VARIANTS } from './icon-designs.mjs';

const brand = fs.readFileSync('shared/brand.ts', 'utf8');
const NAME = /name:\s*'([^']*)'/.exec(brand)[1];
let n = 0;
const svg = (v, mode) => v.svg(mode, v.id + mode + (n++));
// Nachbar-Apps ohne Marken: neutrale Flächen mit einfachen Formen
const OTHER = [
  ['#ff9f0a', 'Uhr', '<circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="7"/><path d="M50 34 V50 H62" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>'],
  ['#34c759', 'Nachrichten', '<path d="M24 46 a26 22 0 1 1 14 19 l-12 6 4-11z" fill="#fff"/>'],
  ['#5e5ce6', 'Podcasts', '<circle cx="50" cy="44" r="10" fill="#fff"/><rect x="45" y="56" width="10" height="22" rx="5" fill="#fff"/>'],
  ['#ff375f', 'Musik', '<path d="M40 70 V32 L66 26 V62" stroke="#fff" stroke-width="7" fill="none"/><circle cx="35" cy="70" r="8" fill="#fff"/><circle cx="61" cy="64" r="8" fill="#fff"/>'],
  ['#0a84ff', 'Wetter', '<circle cx="42" cy="42" r="12" fill="#ffd60a"/><path d="M34 68 h34 a10 10 0 0 0 -4-19 a14 14 0 0 0-26 4 a8 8 0 0 0-4 15z" fill="#fff"/>'],
  ['#8e8e93', 'Einstellungen', '<circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="8 6"/><circle cx="50" cy="50" r="9" fill="#fff"/>'],
  ['#30b0c7', 'Karten', '<path d="M26 30 L44 24 L58 30 L74 24 V70 L58 76 L44 70 L26 76z" fill="#fff"/>'],
  ['#ffcc00', 'Notizen', '<rect x="26" y="26" width="48" height="48" rx="6" fill="#fff"/><path d="M34 40 h32 M34 50 h32 M34 60 h20" stroke="#c9c9c9" stroke-width="4"/>'],
  ['#ff453a', 'Kalender', '<rect x="24" y="26" width="52" height="48" rx="8" fill="#fff"/><text x="50" y="64" font-size="28" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-weight="600" fill="#222">31</text>'],
  ['#64d2ff', 'Dateien', '<path d="M24 34 h20 l6 6 h26 v32 h-52z" fill="#fff"/>'],
  ['#bf5af2', 'Kamera', '<rect x="24" y="34" width="52" height="34" rx="7" fill="#fff"/><circle cx="50" cy="51" r="10" fill="#bf5af2"/>']
];
const other = ([c, label, g], dark) => `<div class="app"><div class="ic"><svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${dark ? '#2c2c2e' : c}"/>${dark ? g.replace(/#fff\b/g, c) : g}</svg></div><span>${label}</span></div>`;

function phone(v, mode) {
  const dark = mode === 'dark';
  const ours = `<div class="app me"><div class="ic">${svg(v, mode)}</div><span>${NAME}</span></div>`;
  const grid = [...OTHER.slice(0, 5).map(o => other(o, dark)), ours, ...OTHER.slice(5, 11).map(o => other(o, dark))].join('');
  const dock = OTHER.slice(1, 4).map(o => other(o, dark)).join('') + `<div class="app me"><div class="ic">${svg(v, mode)}</div></div>`;
  return `<figure class="phone ${mode}"><div class="screen"><div class="status"><b>9:41</b><span>●●● ▮</span></div>
    <div class="grid">${grid}</div><div class="dock">${dock}</div></div><figcaption>${dark ? 'Dunkel' : 'Hell'} · echte Größe (Icon 60 pt)</figcaption></figure>`;
}
function splash(v, mode) {
  const dark = mode === 'dark';
  return `<div class="splash ${mode}"><div class="sicon">${svg(v, mode)}</div><div class="sname">${NAME}</div></div>`;
}
function sizes(v) {
  return `<div class="sizes">${[180, 60, 40, 29, 20].map(s => `<div><div class="sz" style="width:${s}px;height:${s}px;border-radius:${s * 0.225}px">${svg(v, 'light')}</div><small>${s} px</small></div>`).join('')}
    ${[60, 29].map(s => `<div><div class="sz" style="width:${s}px;height:${s}px;border-radius:${s * 0.225}px">${svg(v, 'dark')}</div><small>${s} px dunkel</small></div>`).join('')}
    <div><div class="tab"><span class="fav">${svg(v, 'light')}</span>${NAME}</div><small>Browser-Tab 16 px</small></div></div>`;
}

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon-Varianten · ${NAME}</title><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef1f5;color:#0b1b2b}
header{padding:24px 20px 8px;max-width:1100px;margin:auto}h1{font-size:26px;margin:0 0 6px}header p{margin:4px 0;color:#3f5064}
section{max-width:1100px;margin:20px auto;padding:20px;background:#fff;border-radius:22px;box-shadow:0 8px 28px rgba(30,50,80,.08)}
h2{margin:0;font-size:22px}h2 b{display:inline-block;background:#0652c4;color:#fff;border-radius:10px;padding:0 10px;margin-right:8px}.idea{color:#3f5064;margin:4px 0 14px}
.row{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.phone{margin:0}.phone figcaption{text-align:center;font-size:12px;color:#55667a;margin-top:6px}
.screen{width:393px;height:852px;border-radius:55px;overflow:hidden;position:relative;border:10px solid #111;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.light .screen{background:linear-gradient(160deg,#a7c8ff 0%,#ffd1bf 55%,#bde9da 100%)}.dark .screen{background:linear-gradient(160deg,#0b1a38 0%,#2a1410 60%,#062a22 100%)}
.status{display:flex;justify-content:space-between;padding:16px 30px 0;font-size:15px}.light .status{color:#000}.dark .status{color:#fff}
.grid{display:grid;grid-template-columns:repeat(4,60px);justify-content:space-between;row-gap:26px;padding:34px 27px 0}
.app{display:flex;flex-direction:column;align-items:center;gap:5px;width:60px}.app span{font-size:11px;white-space:nowrap;letter-spacing:.01em}
.light .app span{color:#111}.dark .app span{color:#fff}
.ic{width:60px;height:60px;border-radius:13.5px;overflow:hidden}.ic svg,.sz svg,.sicon svg,.fav svg{display:block;width:100%;height:100%}
.me .ic{box-shadow:0 0 0 2px rgba(255,255,255,.0)}
.dock{position:absolute;left:12px;right:12px;bottom:12px;height:94px;border-radius:34px;display:flex;justify-content:space-around;align-items:center;padding:0 10px}
.light .dock{background:rgba(255,255,255,.35);backdrop-filter:blur(20px)}.dark .dock{background:rgba(40,40,46,.45);backdrop-filter:blur(20px)}
.sizes{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin:6px 0 18px}.sizes>div{text-align:center}.sizes small{display:block;color:#55667a;font-size:11px;margin-top:4px}
.sz{overflow:hidden;margin:auto;box-shadow:0 0 0 1px rgba(0,0,0,.08)}.tab{display:flex;gap:6px;align-items:center;background:#e9ecf0;border-radius:8px 8px 0 0;padding:6px 12px;font-size:12px}.fav{width:16px;height:16px;border-radius:4px;overflow:hidden;display:inline-block}
.splashes{display:flex;gap:16px;flex-wrap:wrap}.splash{width:157px;height:340px;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border:5px solid #111}
.splash.light{background:#e8edf4}.splash.dark{background:#060a12}.sicon{width:52px;height:52px;border-radius:12px;overflow:hidden}
.sname{font:700 15px/1 ui-rounded,"SF Pro Rounded",-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em}.splash.light .sname{color:#0b1b2b}.splash.dark .sname{color:#eef3fa}
h3{font-size:15px;margin:18px 0 8px;color:#3f5064}
.note{max-width:1100px;margin:10px auto 40px;padding:0 20px;color:#55667a;font-size:13px}
</style></head><body>
<header><h1>Icon-Varianten für ${NAME}</h1>
<p>Vier Vorschläge statt des Buchstabens. Jede Variante hell und dunkel, auf einem iPhone-Homescreen in echter Größe (iPhone 15/16: 393 × 852 pt, Icon 60 pt), in kleinen Größen und als Startbild.</p>
<p><b>Bitte wähle eine Nummer (1–4).</b> Der Name bleibt vorerst „${NAME}“.</p></header>
${VARIANTS.map((v, i) => `<section id="${v.id}"><h2><b>${i + 1}</b>${v.name}</h2><p class="idea">${v.idea}</p>
  <h3>Kleine Größen</h3>${sizes(v)}
  <h3>Homescreen</h3><div class="row">${phone(v, 'light')}${phone(v, 'dark')}</div>
  <h3>Startbild beim Öffnen (verkleinert)</h3><div class="splashes">${splash(v, 'light')}${splash(v, 'dark')}</div></section>`).join('')}
<p class="note">Hinweis: Auf dem iPhone-Homescreen zeigt eine Web-App immer ein Icon (das helle). Die dunkle Fassung nutze ich für das Startbild im dunklen Modus. Nachbar-Apps sind neutrale Platzhalter.</p>
</body></html>`;
fs.writeFileSync('icon-varianten.html', html);
console.log('icon-varianten.html geschrieben');
