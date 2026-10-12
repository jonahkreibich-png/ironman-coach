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
  return page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || 'null'));
}
