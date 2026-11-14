import { type Page, expect } from '@playwright/test';
// @ts-ignore – reines JS ohne Typen
import { makeDemo } from '../../fixtures/demo.mjs';

export const TODAY = '2026-10-14'; // ein Mittwoch
export const TOMORROW = '2026-10-15';
export const YESTERDAY = '2026-10-13';

/* Lädt den erfundenen Demo-Datensatz in den Speicher und friert die Uhr auf heute 7:30 ein. */
export async function seed(page: Page, opts: { today?: string; time?: string; extra?: (d: any) => void; noPlan?: boolean } = {}) {
  const today = opts.today || TODAY;
  const demo = makeDemo(today);
  if (opts.extra) opts.extra(demo);
  const plan = demo.plan; const state = { ...demo }; delete (state as any).plan;
  await page.addInitScript(([p, s, noPlan]) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.clear();
      if (!noPlan) { localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); }
      // „Neu in dieser Version“ gilt als gesehen (eigener Test prüft das Fenster)
      localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
      sessionStorage.setItem('__seeded', '1');
    }
  }, [JSON.stringify(plan), JSON.stringify(state), !!opts.noPlan]);
  await page.clock.setFixedTime(new Date(`${today}T${opts.time || '07:30'}:00+02:00`));
  return demo;
}
export async function open(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#app')).not.toBeEmpty();
}
export async function stored(page: Page): Promise<any> {
  await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
  return page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || 'null'));
}
/* Auftrag 19 (Plan-Tab C): Einheit im Plan öffnen – Woche wählen und den Tag aufklappen, falls er zu ist */
export async function openPlanSession(page: Page, sid: string) {
  const at = await page.evaluate(id => {
    const p = JSON.parse(localStorage.getItem('ec_plan') || '{"weeks":[]}');
    for (let i = 0; i < p.weeks.length; i++) for (const d of p.weeks[i].days) if ((d.sessions || []).some((s: any) => s.id === id)) return { week: i, date: d.date };
    return null;
  }, sid);
  if (!at) throw new Error('Einheit nicht im Plan: ' + sid);
  const btn = page.locator(`[data-act="sess-open"][data-sid="${sid}"]`);
  if (!(await btn.count())) await page.locator(`[data-act="plan-week"][data-i="${at.week}"]`).click();
  if (!(await btn.count())) await page.locator(`.cday-h[data-date="${at.date}"]`).click();
  await btn.first().click();
}

/* Ausschliesslich synthetische Testdaten: neuen kanonischen Speicher mit aktualisieren. */
export async function writeStored(page: Page, state: any) {
 await page.evaluate(async value => {
  const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('stamio-durable-storage',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=d.transaction('values','readwrite');tx.objectStore('values').put(JSON.stringify(value),'ec_state_v2');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  localStorage.setItem('ec_state_v2',JSON.stringify(value));
 },state);
}

/* Fix 3.23.0: Textbereiche dürfen nicht zu schmal werden. Die Überlauf-Tests prüften nur, ob etwas über einen Rand ragt – ein auf 38 px
   geschrumpfter Titel (bricht nach fast jedem Buchstaben um, Karte über 500 px hoch) ragt nirgends heraus. Hier: jeder sichtbare Text
   ab 12 Zeichen darf nicht auf 3 oder mehr Zeilen mit weniger als 7 Zeichen pro Zeile umbrechen (Breite) – dann ist auch der Kasten
   unnötig hoch (Höhe). Die Meldung nennt die Elternkette mit Breiten, damit man sieht, wer den Platz wegnimmt.
   Wird von layout.spec.ts und auftrag29-ueberlauf.spec.ts mitgeprüft. */
export async function narrowText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} „${(el.textContent || '').trim().slice(0, 40)}“`;
    const short = (el: Element) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ':' + Math.round(el.getBoundingClientRect().width);
    const hiddenIn = (el: Element) => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!(d as HTMLDetailsElement).open) { const sm = el.closest('summary'); if (!sm || sm.parentElement !== d) return true; } } return false; };
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const par = n.parentElement; const txt = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!par || txt.replace(/ /g, '').length < 12 || par.closest('svg, [hidden], [aria-hidden="true"]') || hiddenIn(par)) continue;
      const cs = getComputedStyle(par); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const rects = Array.from(rg.getClientRects()).filter(b => b.width > 0 && b.height > 0);
      const lines = new Set(rects.map(b => Math.round(b.top / 4))).size;
      if (lines < 3 || txt.length / lines >= 7) continue;
      const bw = Math.round(Math.max(...rects.map(b => b.right)) - Math.min(...rects.map(b => b.left)));
      const chain: string[] = []; for (let p: Element | null = par.parentElement, i = 0; p && p !== document.body && i < 3; p = p.parentElement, i++) chain.push(short(p));
      out.push(`${desc(par)} Text in zu schmalem Bereich (${bw} px breit, ${lines} Zeilen; in ${chain.join(' < ')})`);
    }
    return [...new Set(out)].slice(0, 10);
  });
}
/* Fix 3.23.0: offene Radeinheit mit Aufbau (spec) und einem der längsten Titel aus echten Plänen – nur mit spec erscheint der Umschalter
   „Minuten | km“. Die Demo-Daten haben keine Lauf-/Radeinheit mit spec, darum sahen die Überlauf-Tests den Umschalter nie. */
export function longBikeSession(id = 'long-bike') {
  return { id, sport: 'bike', title: 'Lockere Ausfahrt 45 min (Gravelbike), mit Kadenz-Blöcken', plannedMinutes: 45, zone: 'Zone 2',
    spec: { sport: 'bike', kind: 'long', variant: 'mit Kadenz-Blöcken', ctx: { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, bikeName: 'Gravelbike' },
      steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 25, zone: 2, note: 'darin 5×5 min mit hoher Trittfrequenz (100+), dazwischen normal' }, { part: 'cool', min: 10, zone: 1 }] } };
}
