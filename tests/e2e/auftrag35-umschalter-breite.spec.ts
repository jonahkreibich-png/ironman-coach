/* Fix 3.23.0: Im Heute-Tab rutschte der Umschalter „Minuten | km“ mit dem Haken in die Titelzeile. Der Titel-Knopf (flex: 1, Basis 0)
   schrumpfte auf ca. 38 px, der Titel brach nach fast jedem Buchstaben um, die Karte wurde über 500 px hoch. Nichts ragte heraus –
   darum sahen die Überlauf-Tests es nicht. Hier wird in jeder Karte mit Umschalter (Heute, Plan-Zeile, Einheit geöffnet) die Breite
   des Textbereichs und die Höhe der Karte geprüft: WebKit (iPhone) und Chromium, 320/375/390 px, normale und große Schrift,
   lange Titel wie in echten Plänen (die längsten aus den echten Daten, 57-60 Zeichen). */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, TODAY } from './helpers';

const CTX = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, bikeName: 'Gravelbike' };
const wu = (min: number) => ({ part: 'warm', min, zone: 1 });
const cd = (min: number) => ({ part: 'cool', min, zone: 1 });
/* längste Lauf-/Rad-Titel aus echten Plänen (Plan-Generator, keine persönlichen Daten) */
const SESSIONS = [
  { id: 'b-kad', sport: 'bike', title: 'Lockere Ausfahrt 45 min (Gravelbike), mit Kadenz-Blöcken', plannedMinutes: 45, zone: 'Zone 2', spec: { sport: 'bike', kind: 'long', variant: 'mit Kadenz-Blöcken', ctx: CTX, steps: [wu(10), { part: 'main', min: 25, zone: 2, note: 'darin 5×5 min mit hoher Trittfrequenz (100+), dazwischen normal' }, cd(10)] } },
  { id: 'b-ss', sport: 'bike', title: 'Lange Ausfahrt 130 min mit 2×15 min Sweet Spot (Gravelbike)', plannedMinutes: 130, zone: 'Zone 3', spec: { sport: 'bike', kind: 'longq', ctx: CTX, steps: [wu(15), { part: 'main', min: 40, zone: 2 }, { part: 'main', reps: 2, min: 15, zone: 3, restMin: 5 }, { part: 'main', min: 30, zone: 2 }, cd(10)] } },
  { id: 'b-mtb', sport: 'bike', title: 'Lockere Ausfahrt 45 min (Mountainbike), mit Zone-3-Blöcken', plannedMinutes: 45, zone: 'Zone 2', spec: { sport: 'bike', kind: 'long', variant: 'mit Zone-3-Blöcken', ctx: { ...CTX, bikeName: 'Mountainbike' }, steps: [wu(10), { part: 'main', min: 25, zone: 2 }, cd(10)] } },
  { id: 'r-hm', sport: 'run', title: 'Langer Lauf 120 min mit 3×15 min Halbmarathon-Tempo', plannedMinutes: 120, zone: 'Zone 3', spec: { sport: 'run', kind: 'longq', ctx: CTX, steps: [wu(15), { part: 'main', min: 30, zone: 2 }, { part: 'main', reps: 3, min: 15, zone: 3, restMin: 5, note: 'Halbmarathon-Tempo' }, { part: 'main', min: 10, zone: 2 }, cd(10)] } }
];
async function seedLong(page: Page, px: number) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions = [...SESSIONS, ...MEDIUM].map(s => ({ ...s }));
  } });
  await page.addInitScript(size => { const set = () => { document.documentElement.style.fontSize = size + 'px'; }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, px);
}
/* häufige mittellange Titel aus echten Plänen (bis 40 Zeichen): Karte höchstens ca. 160 px */
const MEDIUM = [
  { id: 'm-mtb', sport: 'bike', title: 'Lockere Ausfahrt 30 min (Mountainbike)', plannedMinutes: 30, zone: 'Zone 2', spec: { sport: 'bike', kind: 'easy', ctx: { ...CTX, bikeName: 'Mountainbike' }, steps: [wu(5), { part: 'main', min: 20, zone: 2 }, cd(5)] } },
  { id: 'm-run', sport: 'run', title: 'Lockerer Lauf 60 min', plannedMinutes: 60, zone: 'Zone 2', spec: { sport: 'run', kind: 'easy', ctx: CTX, steps: [wu(10), { part: 'main', min: 40, zone: 2 }, cd(10)] } }
];
/* Höchsthöhe der Heute-Karte bei 375/390 px und normaler Schrift: ca. 160 px (mittellange Titel) bzw. 210 px (längste Titel: schon ohne
   Umschalter 4 Titel- und 2 Info-Zeilen, so hoch war die Karte auch vor 3.23.0 plus eine Zeile). Bei 320 px und großer Schrift höchstens
   doppelt so hoch wie 160 px (mit der Schrift skaliert) – der Fehler lag bei 500-1100 px. Genauer prüft die Regel „nur eine Zeile mehr“. */
const maxHeight = (titleLen: number, w: number, px: number) => px === 17 && w >= 375 ? (titleLen <= 40 ? 165 : 210) : 320 * px / 17;
/* jede sichtbare Karte mit Umschalter: Textbereich mind. 60 % der Kartenbreite, Umschalter unter dem Titel und nur eine Zeile mehr,
   Heute-Karte nicht zu hoch */
async function measure(page: Page, px: number): Promise<string[]> {
  return page.evaluate(([size, maxFn]) => {
    const out: string[] = [];
    const maxH = new Function('return ' + maxFn)() as (l: number, w: number, px: number) => number;
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const tg of Array.from(document.querySelectorAll('[data-plan-view]')).filter(vis)) {
      const card = tg.closest('.session-hero, .pr-what, [data-structure], [data-kopf]') as HTMLElement | null; // Auftrag 37: Einheit = Kopf
      if (!card) { out.push('Umschalter ohne bekannte Karte'); continue; }
      const cr = card.getBoundingClientRect();
      const name = card.classList.contains('session-hero') ? 'Heute' : card.classList.contains('pr-what') ? 'Plan' : 'Einheit';
      const label = `${name} „${(card.textContent || '').trim().slice(0, 30)}“`;
      let area: DOMRect; let ref = cr.width;
      // Heute: der Knopf mit Symbol und Titel (daneben nur der Haken)
      if (name === 'Heute') area = card.querySelector('[data-act="sess-open"]')!.getBoundingClientRect();
      else if (name === 'Plan') {
        // Text steht direkt im Block; maßgeblich ist die Inhaltsbreite gegenüber der Plan-Zeile darüber
        const cs = getComputedStyle(card); const w = cr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        area = new DOMRect(cr.left, cr.top, w, cr.height);
        const row = card.previousElementSibling; if (row) { ref = row.getBoundingClientRect().width; const t = row.querySelector('.pr-t'); if (t && t.getBoundingClientRect().width < 0.6 * ref) out.push(`Plan-Titel nur ${Math.round(t.getBoundingClientRect().width)} von ${Math.round(ref)} px breit`); }
      } else area = (card.querySelector('.steps') || card.querySelector('.grow'))!.getBoundingClientRect();
      if (area.width < 0.6 * ref) out.push(`${label}: Textbereich nur ${Math.round(area.width)} von ${Math.round(ref)} px breit`);
      if (name === 'Heute') {
        const title = (card.querySelector('.t')!.textContent || '').trim();
        const lim = maxH(title.length, document.documentElement.clientWidth, size);
        if (cr.height > lim) out.push(`${label}: Karte ${Math.round(cr.height)} px hoch (höchstens ${Math.round(lim)})`);
        const tr = tg.getBoundingClientRect();
        // Umschalter liegt unter dem Titel, nicht daneben
        if (tr.top < area.bottom - 2) out.push(`${label}: Umschalter neben dem Titel statt darunter`);
        // und macht die Karte nur um seine eigene Zeile höher (Titel-Knopf + Umschalter + Abstände)
        const cs = getComputedStyle(card); const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const chk = card.querySelector('.check'); const row1 = Math.max(area.height, chk ? chk.getBoundingClientRect().height : 0);
        const gap = tr.top - Math.max(area.bottom, chk ? chk.getBoundingClientRect().bottom : 0);
        if (cr.height > row1 + gap + tr.height + pad + 4) out.push(`${label}: Karte ${Math.round(cr.height)} px, erwartet höchstens ${Math.round(row1 + gap + tr.height + pad)}`);
        if (gap > 16) out.push(`${label}: ${Math.round(gap)} px Lücke über dem Umschalter`);
      }
    }
    return out;
  }, [px, maxHeight.toString()] as const);
}

for (const px of [17, 23]) for (const w of [320, 375, 390]) {
  test(`Umschalter Minuten|km: Titel breit genug, Karte nicht zu hoch – ${w} px, Schrift ${px} px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: w, height: 800 });
    await seedLong(page, px);
    const problems: string[] = [];
    for (const view of ['min', 'km']) {
      await open(page, '/?go=heute');
      const heroes = page.locator('.session-hero:has([data-plan-view])');
      await expect(heroes).toHaveCount(SESSIONS.length + MEDIUM.length);
      if (view === 'km') { await heroes.first().locator('[data-act="plan-view"][data-v="km"]').click(); await expect(heroes.first().locator('[data-v="km"]')).toHaveAttribute('aria-pressed', 'true'); }
      (await measure(page, px)).forEach(p => problems.push(`${view} Heute: ${p}`));
      await open(page, '/?go=plan');
      await expect(page.locator('[data-what] [data-plan-view]').first()).toBeVisible();
      (await measure(page, px)).forEach(p => problems.push(`${view} Plan: ${p}`));
      await openPlanSession(page, 'b-ss');
      await expect(page.locator('#sheetPanel [data-kopf] [data-plan-view]')).toBeVisible(); // Auftrag 37: Umschalter im Kopf der Einheit
      (await measure(page, px)).forEach(p => problems.push(`${view} Einheit: ${p}`));
      await page.keyboard.press('Escape');
    }
    expect([...new Set(problems)]).toEqual([]);
  });
}
