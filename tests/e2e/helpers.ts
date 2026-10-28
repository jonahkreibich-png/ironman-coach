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
  await expect(page.locator('#storage-status')).toBeHidden();
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
