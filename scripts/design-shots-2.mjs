// Auftrag 26: Bildschirmfotos der Farbvarianten zum neuen Icon (iPhone 390×844, hell und dunkel, erfundene Demo-Daten)
// und die Vergleichsseite design-varianten-2.html (Icon oben, je Variante Farben + 6 Bildschirme hell und dunkel nebeneinander).
// Voraussetzung: npm run build und ein laufender Test-Server (node scripts/test-server.mjs 4180).
// Aufruf: node scripts/design-shots-2.mjs [--inline] [--page-only]   (--inline: Bilder als data:-URL in eine Datei zum Veröffentlichen; --page-only: nur die Seite aus vorhandenen Bildern)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { makeDemo } from '../fixtures/demo.mjs';
import { PALETTES } from './palettes.mjs';
import { APP_ICON } from './icon-designs.mjs';

const OUT = 'docs/design-varianten-2';
const BASE = process.env.BASE || 'http://localhost:4180';
const TODAY = '2026-10-14';
const INLINE = process.argv.includes('--inline');
const PAGE_ONLY = process.argv.includes('--page-only');
fs.mkdirSync(OUT, { recursive: true });
const demo = makeDemo(TODAY);
const plan = demo.plan; const state = { ...demo }; delete state.plan;

const VARIANTS = [{ id: '', name: 'Bisher (zum Vergleich)', idea: 'Blau-Akzente vom alten Icon, neutrales Dunkelblau.' }, ...PALETTES];
const SCREENS = [
  { id: 'heute', name: 'Heute', url: '/?go=heute' },
  { id: 'plan', name: 'Plan', url: '/?go=plan' },
  { id: 'einheit', name: 'Einheit', url: '/?go=heute', open: '[data-act="sess-open"]' },
  { id: 'coach', name: 'Coach', url: '/?go=coach' },
  { id: 'fortschritt', name: 'Fortschritt', url: '/?go=fortschritt' },
  { id: 'mehr', name: 'Mehr', url: '/?go=mehr' }
];

const problems = [];
const browser = PAGE_ONLY ? null : await chromium.launch();
if (browser) for (const v of VARIANTS) for (const theme of ['dark', 'light']) for (const s of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.addInitScript(([p, st, pal]) => {
    localStorage.clear(); localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', st);
    localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
    if (pal) localStorage.setItem('palette_pref', pal);
  }, [JSON.stringify(plan), JSON.stringify(state), v.id]);
  await page.goto(BASE + s.url);
  await page.waitForSelector('#app > .view');
  if (s.open) { await page.locator(s.open).first().click(); await page.waitForSelector('#sheetPanel', { state: 'visible' }); }
  await page.waitForTimeout(450);
  const over = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.scroll-x,.chips,.wkbar,.tab-lens,[data-scroll]'); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
  if (over.length) problems.push(`${v.id || 'bisher'} ${theme} ${s.id}: ${over.join(', ')}`);
  await page.screenshot({ path: path.join(OUT, `${v.id || 'bisher'}-${s.id}-${theme}.jpg`), type: 'jpeg', quality: 82 });
  await ctx.close();
}
if (browser) await browser.close();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const src = f => INLINE ? 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') : `${OUT}/${f}`;
const sw = (c, label) => `<span class="sw"><i style="background:${c}"></i>${esc(label)}</span>`;
const swatches = (t) => !t ? '' : `<div class="sws">${[['bg', 'Hintergrund'], ['accent', 'Akzent'], ['hl', 'Orange'], ['btn', 'Knopf'], ['good', 'Grün'], ['warn', 'Gelb'], ['bad', 'Rot'], ['swim', 'Schwimmen'], ['bike', 'Rad'], ['run', 'Laufen'], ['strength', 'Kraft'], ['football', 'Teamsport']].map(([k, l]) => sw(t[k], l)).join('')}</div>`;
const icon = mode => `<div class="ic">${APP_ICON.svg(mode, 'top' + mode)}</div>`;
const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design-Varianten zum neuen Icon</title>
<style>
:root{--bg:#f3f5f6;--ink:#10181b;--ink2:#56636a;--card:#fff;--line:#dfe5e8}
@media (prefers-color-scheme:dark){:root{--bg:#0b1012;--ink:#eef3f4;--ink2:#a4b1b6;--card:#151c1f;--line:#263034}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
header{padding:24px 20px 6px;max-width:1100px}
.icons{display:flex;gap:14px;align-items:center;margin-bottom:12px}.ic{width:72px;height:72px;border-radius:17px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.25)}.ic svg{display:block;width:100%;height:100%}
h1{margin:0 0 6px;font-size:26px}p{margin:0 0 6px;max-width:72ch;color:var(--ink2)}
section{margin:18px 0 30px;padding:0 20px}h2{font-size:21px;margin:0 0 2px}
.txt{max-width:80ch;margin-bottom:8px}
.sws{display:flex;flex-wrap:wrap;gap:6px 12px;margin:6px 0 10px}.sw{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink2)}.sw i{width:16px;height:16px;border-radius:5px;border:1px solid var(--line);display:inline-block}
.mode{font-size:13px;font-weight:600;color:var(--ink2);margin:6px 0 4px}
.toggle{display:inline-flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--card);margin:8px 0 4px}
.toggle button{border:0;background:none;padding:6px 14px;border-radius:8px;font:inherit;color:var(--ink2);cursor:pointer}.toggle button.on{background:var(--ink);color:var(--bg)}
.strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity}
figure{margin:0;flex:0 0 auto;scroll-snap-align:start}figure img{width:230px;height:auto;display:block;border-radius:24px;border:1px solid var(--line);background:#000}
figcaption{font-size:12px;color:var(--ink2);margin-top:4px;text-align:center}
body.only-dark .light, body.only-light .dark{display:none}
.note{font-size:13px}
</style></head><body>
<header><div class="icons">${icon('light')}${icon('dark')}</div>
<h1>Farben passend zum neuen Icon</h1>
<p>Echte Bildschirme der App mit erfundenen Demo-Daten in iPhone-Größe (390 × 844): Heute, Plan, Einheit, Coach, Fortschritt, Mehr – je Variante dunkel und hell.</p>
<p>Du kannst mischen (z. B. „Hintergrund von C, Knöpfe von A“). Auf dem iPhone ausprobieren: Test-App → Mehr → Darstellung → Farbvariante.</p>
<p class="note">Alle Varianten erfüllen WCAG AA (Text 4,5:1, Symbole 3:1, auch auf den Glas-Karten über dem hellsten Hintergrund). Ampel rot/gelb/grün bleibt eindeutig, Orange ist klar von Gelb getrennt.</p>
<div class="toggle" role="group" aria-label="Ansicht"><button data-v="" class="on">Dunkel und hell</button><button data-v="only-dark">Nur dunkel</button><button data-v="only-light">Nur hell</button></div>
${problems.length ? `<p class="note">Layout-Hinweise: ${esc(problems.join('; '))}</p>` : ''}
</header>
${VARIANTS.map(v => `<section><h2>${esc(v.name)}</h2><div class="txt"><p>${esc(v.idea)}</p></div>
${['dark', 'light'].map(th => `<div class="${th}"><div class="mode">${th === 'dark' ? 'Dunkel' : 'Hell'}</div>${swatches(v[th])}<div class="strip">${SCREENS.map(s => `<figure><img loading="lazy" src="${src(`${v.id || 'bisher'}-${s.id}-${th}.jpg`)}" alt="${esc(v.name)}: ${esc(s.name)}, ${th === 'light' ? 'hell' : 'dunkel'}"><figcaption>${esc(s.name)}</figcaption></figure>`).join('')}</div></div>`).join('')}
</section>`).join('\n')}
<script>
document.querySelectorAll('.toggle button').forEach(b => b.onclick = () => { document.body.className = b.dataset.v; document.querySelectorAll('.toggle button').forEach(x => x.classList.toggle('on', x === b)); });
</script>
</body></html>`;
fs.writeFileSync(INLINE ? path.join(OUT, 'index.html') : 'design-varianten-2.html', html);
console.log('Fertig:', INLINE ? path.join(OUT, 'index.html') : 'design-varianten-2.html', problems.length ? '\nLayout-Hinweise:\n' + problems.join('\n') : '(keine Layout-Hinweise)');
