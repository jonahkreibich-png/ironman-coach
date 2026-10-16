// Auftrag 13, Punkt 4: Screenshots der Design-Varianten (iPhone 390×844, hell und dunkel) mit erfundenen Demo-Daten
// und die Vergleichsseite design-varianten.html im Projektordner.
// Voraussetzung: npm run build und ein laufender Test-Server (node scripts/test-server.mjs 4180).
// Aufruf: node scripts/design-shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { makeDemo } from '../fixtures/demo.mjs';

const OUT = 'docs/design-varianten';
const BASE = 'http://localhost:4180';
const TODAY = '2026-10-14';
fs.mkdirSync(OUT, { recursive: true });
const demo = makeDemo(TODAY);
const plan = demo.plan; const state = { ...demo }; delete state.plan;

const DESIGNS = [
  { id: '', name: 'Heute (zum Vergleich)', idea: 'Das bisherige Design.', strengths: '' },
  { id: 'glas', name: 'A · Glas', idea: 'Wie iOS 26: Inhalte liegen als Glas über einem weichen Farbverlauf, die Tab-Leiste schwebt als Kapsel, unter dem aktiven Tab sitzt eine Glas-Linse. Systemschrift und gerundete Zahlen wirken wie eine native iPhone-App.', strengths: 'Modern und leicht, fügt sich nahtlos ins iPhone ein; die „Liquid“-Buttons federn beim Drücken. Karten wirken ruhig, weil Ränder und Schatten fast verschwinden.' },
  { id: 'tempo', name: 'B · Tempo', idea: 'Sport-Display wie auf einer Uhr: hoher Kontrast, sehr große Zahlen in schmaler Schrift, Sportarten als kräftige Farbflächen. Die Leiste ist fest, mit großen Icons und einem orangen Feld hinter dem aktiven Tab.', strengths: 'Die wichtigen Zahlen springen sofort ins Auge, auch draußen in der Sonne gut lesbar. Buttons haben eine Kante, die beim Drücken spürbar einrastet.' },
  { id: 'fjord', name: 'C · Fjord', idea: 'Ruhig und luftig in Grün-Blau: feine Linien statt Schatten, mehr Weißraum, alles in einer Schrift. Unten schwebt ein dunkles Dock, der aktive Tab klappt mit seiner Beschriftung auf.', strengths: 'Am wenigsten Unruhe auf dem Bildschirm, angenehm für den täglichen Blick. Das Dock lässt mehr Platz für Inhalt und zeigt klar, wo man ist.' }
];
const SCREENS = [
  { id: 'heute', name: 'Heute', url: '/?go=heute' },
  { id: 'plan', name: 'Plan', url: '/?go=plan' },
  { id: 'coach', name: 'Coach', url: '/?go=coach' },
  { id: 'fortschritt', name: 'Fortschritt', url: '/?go=fortschritt' },
  { id: 'einheit', name: 'Einheit', url: '/?go=heute', open: '[data-act="sess-open"]' }
];

const browser = await chromium.launch();
const problems = [];
for (const d of DESIGNS) for (const theme of ['light', 'dark']) for (const s of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.addInitScript(([p, st, ds]) => {
    localStorage.clear(); localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', st);
    localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
    if (ds) localStorage.setItem('design_pref', ds);
  }, [JSON.stringify(plan), JSON.stringify(state), d.id]);
  await page.goto(BASE + s.url);
  await page.waitForSelector('#app > *');
  if (s.open) { await page.locator(s.open).first().click(); await page.waitForSelector('#sheetPanel', { state: 'visible' }); }
  await page.waitForTimeout(350);
  // Layout-Prüfung: nichts ragt seitlich aus dem Bildschirm
  const over = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.scroll-x,.chips,svg'); }).slice(0, 3).map(e => e.className || e.tagName));
  if (over.length) problems.push(`${d.id || 'heute'} ${theme} ${s.id}: ${over.join(', ')}`);
  await page.screenshot({ path: path.join(OUT, `${d.id || 'jetzt'}-${s.id}-${theme}.png` ) });
  await ctx.close();
}
await browser.close();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design-Varianten</title>
<style>
:root{--bg:#f4f5f7;--ink:#14181d;--ink2:#5b6470;--card:#fff;--line:#e2e5ea}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--ink:#eef0f3;--ink2:#a2a9b3;--card:#1b1e22;--line:#2b2f35}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:28px 24px 8px;max-width:1200px}
h1{margin:0 0 6px;font-size:28px}
p{margin:0 0 6px;max-width:72ch;color:var(--ink2)}
section{margin:22px 0 34px;padding:0 24px}
h2{font-size:22px;margin:0 0 4px}
.txt{max-width:80ch;margin-bottom:12px}
.txt b{color:var(--ink)}
.toggle{display:inline-flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--card);margin:6px 0 12px}
.toggle button{border:0;background:none;padding:6px 14px;border-radius:8px;font:inherit;color:var(--ink2);cursor:pointer}
.toggle button.on{background:var(--ink);color:var(--bg)}
.strip{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;scroll-snap-type:x proximity}
figure{margin:0;flex:0 0 auto;scroll-snap-align:start}
figure img{width:260px;height:auto;display:block;border-radius:26px;border:1px solid var(--line);background:#000}
figcaption{font-size:13px;color:var(--ink2);margin-top:6px;text-align:center}
.dark{display:none}
body.show-dark .dark{display:block} body.show-dark .light{display:none}
body.show-both .dark{display:block}
.note{font-size:13px}
</style></head><body class="show-both">
<header><h1>Design-Varianten</h1>
<p>Echte Bildschirme der App mit Demo-Daten in iPhone-Größe (390 × 844). Je Variante: Heute, Plan, Coach, Fortschritt und eine geöffnete Einheit, hell und dunkel.</p>
<p>Du kannst mischen, z. B. „Farben von A, Leiste von B“. Ausprobieren auf dem iPhone: Test-App → Mehr → Einstellungen → Design-Vorschau.</p>
<div class="toggle" role="group" aria-label="Ansicht"><button data-v="show-both" class="on">Hell und dunkel</button><button data-v="show-light">Nur hell</button><button data-v="show-dark">Nur dunkel</button></div>
${problems.length ? `<p class="note">Layout-Hinweise: ${esc(problems.join('; '))}</p>` : ''}
</header>
${DESIGNS.map(d => `<section><h2>${esc(d.name)}</h2><div class="txt"><p><b>Idee:</b> ${esc(d.idea)}</p>${d.strengths ? `<p><b>Stärken:</b> ${esc(d.strengths)}</p>` : ''}</div>
<div class="strip">${['light', 'dark'].map(th => SCREENS.map(s => `<figure class="${th}"><img loading="lazy" src="docs/design-varianten/${d.id || 'jetzt'}-${s.id}-${th}.png" alt="${esc(d.name)}: ${esc(s.name)}, ${th === 'light' ? 'hell' : 'dunkel'}"><figcaption>${esc(s.name)} · ${th === 'light' ? 'hell' : 'dunkel'}</figcaption></figure>`).join('')).join('')}</div></section>`).join('')}
<script>
document.querySelectorAll('.toggle button').forEach(b => b.onclick = () => { document.body.className = b.dataset.v; document.querySelectorAll('.toggle button').forEach(x => x.classList.toggle('on', x === b)); });
</script>
</body></html>`;
fs.writeFileSync('design-varianten.html', html);
console.log('Fertig: design-varianten.html', problems.length ? '\nLayout-Hinweise:\n' + problems.join('\n') : '(keine Layout-Hinweise)');
