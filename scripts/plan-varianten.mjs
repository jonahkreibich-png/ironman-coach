/* Auftrag 19, Punkt 3: baut plan-varianten.html aus den Bildschirmfotos von tests/e2e/auftrag19-varianten.spec.ts.
   Aufruf: npx playwright test tests/e2e/auftrag19-varianten.spec.ts --project=chromium-iphone && node scripts/plan-varianten.mjs */
import fs from 'node:fs';

const V = {
  A: { name: 'A · Liste', text: 'Alle 7 Tage untereinander, jede Einheit mit Titel, Dauer und Haken. Du siehst alles ohne Tippen, musst bei vollen Wochen aber scrollen.' },
  B: { name: 'B · Raster', text: 'Die Woche als Kalender mit 7 Spalten: pro Tag Symbole und Minuten, ein Blitz für harte Tage. Antippen zeigt den Tag darunter mit allen Einheiten.' },
  C: { name: 'C · Mix', text: 'Oben Balken je Tag (Höhe = Minuten, Farbe = Sportart), darunter jeder Tag als eine Zeile. Heute ist aufgeklappt, andere Tage klappst du mit einem Tipp auf.' }
};
const W = [['aktuell', 'Aktuelle Woche'], ['erholung', 'Erholungswoche'], ['wettkampf', 'Wettkampfwoche (Halbmarathon)']];
const img = (v, w, m) => 'data:image/png;base64,' + fs.readFileSync(`test-results/a19-plan-${v}-${w}-${m}.png`).toString('base64');

let rows = '';
for (const [w, title] of W) {
  rows += `<section class="wk"><h2>${title}</h2><div class="row">` + Object.entries(V).map(([v, x]) =>
    `<figure><figcaption>${x.name}</figcaption><img class="hell" alt="${x.name}, ${title}, hell" src="${img(v, w, 'hell')}"><img class="dunkel" alt="${x.name}, ${title}, dunkel" src="${img(v, w, 'dunkel')}"></figure>`).join('') + `</div></section>`;
}
const html = `<title>Plan-Tab Varianten</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Layout: drei iPhone-Bilder nebeneinander je Woche; schmal: seitlich wischen */
:root { --bg: #f3f5f8; --card: #ffffff; --ink: #18202b; --muted: #5b6676; --line: #dde3ea; --accent: #2563eb;
  --f-head: "Manrope", system-ui, sans-serif; --f-body: "Source Sans 3", system-ui, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0e131a; --card: #171e28; --ink: #e8edf3; --muted: #9aa6b5; --line: #2a3442; --accent: #6ea0ff; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #0e131a; --card: #171e28; --ink: #e8edf3; --muted: #9aa6b5; --line: #2a3442; --accent: #6ea0ff; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--f-body); }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 24px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }
h1, h2 { font-family: var(--f-head); text-wrap: balance; margin: 0; }
h1 { font-size: 1.75rem; }
h2 { font-size: 1.15rem; margin-bottom: 10px; }
.intro { display: grid; gap: 12px; max-width: 70ch; }
.intro p { margin: 0; color: var(--muted); }
.vars { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.var { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; min-width: 0; }
.var b { font-family: var(--f-head); display: block; margin-bottom: 4px; }
.var p { margin: 0; font-size: .95rem; color: var(--muted); }
.mode { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 11px; background: var(--card); justify-self: start; }
.mode button { border: 0; background: transparent; color: var(--muted); font: 600 .9rem var(--f-body); padding: 8px 14px; border-radius: 8px; cursor: pointer; }
.mode button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.mode button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
@media (max-width: 820px) { .row { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding-bottom: 8px; } figure { flex: 0 0 82%; scroll-snap-align: start; } }
figure { margin: 0; display: grid; gap: 8px; min-width: 0; }
figcaption { font: 700 .95rem var(--f-head); }
figure img { width: 100%; max-width: 390px; border-radius: 16px; border: 1px solid var(--line); display: block; }
body.dunkel-an img.hell, body:not(.dunkel-an) img.dunkel { display: none; }
.ask { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; max-width: 70ch; }
.ask p { margin: 0; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700&family=Source+Sans+3:wght@400;600&display=swap">
<div class="wrap">
  <div class="intro"><h1>Plan-Tab: drei Varianten</h1>
    <p>Gleicher Plan (fester Wochenaufbau mit Fußball, Halbmarathon am 4.4.) in drei Ansichten, iPhone-Größe. Wochenleiste, „Heute“-Knopf und Details beim Antippen gibt es in allen drei. In der Test-App (stamio-test) kannst du im Plan-Tab oben zwischen A, B und C umschalten.</p></div>
  <div class="vars">${Object.values(V).map(x => `<div class="var"><b>${x.name}</b><p>${x.text}</p></div>`).join('')}</div>
  <div class="mode" role="group" aria-label="Darstellung"><button id="m-hell" aria-pressed="true">Hell</button><button id="m-dunkel" aria-pressed="false">Dunkel</button></div>
  ${rows}
  <div class="ask"><p><b>Deine Wahl:</b> Schreib mir einfach A, B oder C, oder was du mischen willst (z. B. „Raster von B, Zeilen von C“).</p></div>
</div>
<script>
const set = d => { document.body.classList.toggle('dunkel-an', d); document.getElementById('m-hell').setAttribute('aria-pressed', String(!d)); document.getElementById('m-dunkel').setAttribute('aria-pressed', String(d)); try { localStorage.setItem('pv-dunkel', d ? '1' : '0'); } catch (e) {} };
document.getElementById('m-hell').onclick = () => set(false);
document.getElementById('m-dunkel').onclick = () => set(true);
let d0 = matchMedia('(prefers-color-scheme: dark)').matches; try { const s = localStorage.getItem('pv-dunkel'); if (s != null) d0 = s === '1'; } catch (e) {}
set(d0);
</script>
`;
fs.writeFileSync('plan-varianten.html', html);
console.log('plan-varianten.html', Math.round(html.length / 1024), 'KB');
