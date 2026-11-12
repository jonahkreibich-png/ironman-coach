/* Auftrag 30, Punkt 3: Ruckeln nach kurzem App-Wechsel.
   Messung (Performance-Aufzeichnung im Browser): nach der Rückkehr in die App 3 s lang Bildabstände (requestAnimationFrame), lange Aufgaben
   (Chromium: PerformanceObserver „longtask“), Anzahl kompletter Neuzeichnungen und ob die Ansicht neu aufgebaut wurde (anderes Element).
   Szenario wie im Alltag: verbundenes Gerät, auf dem Server liegt inzwischen etwas Neues (z. B. Werte der Uhr), die Ansicht ist gescrollt.
   Erwartet: erst der gespeicherte Stand ruhig, Abgleich und Neuberechnung im Hintergrund, nur Geändertes wird angeglichen, kein Neuaufbau. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { seed, TODAY } from './helpers';

async function account(request: any) {
  await request.post('/__reset');
  return await (await request.post('/api/setup', { data: { name: 'Rueckkehr30' } })).json();
}
async function withAccount(page: Page, acc: any) {
  await page.addInitScript(a => { if (!localStorage.getItem('ec_sync_auth')) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); } }, acc);
}
const meta = (page: Page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ec_sync') || '{}'); } catch (e) { return {}; } });
async function synced(page: Page) { await expect.poll(async () => { const m = await meta(page); return !!m.lastSyncAt && !Object.keys(m.pending || {}).length; }, { timeout: 30000 }).toBe(true); }

/* App verlassen und zurückkommen (wie iOS: visibilitychange hidden → visible) und 3 s messen */
async function leaveAndReturn(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => w.__vis || 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => (w.__vis || 'visible') === 'hidden' });
    w.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  return page.evaluate(() => new Promise<any>(resolve => {
    const w = window as any; const view0 = document.querySelector('#app > .view');
    const gaps: number[] = []; const long: number[] = []; let mutated = 0; let last = 0; let stop = false; const t0 = performance.now();
    let po: PerformanceObserver | null = null;
    const longEarly: number[] = [];
    try { po = new PerformanceObserver(l => l.getEntries().forEach(e => { long.push(e.duration); if (e.startTime - t0 < 500) longEarly.push(e.duration); })); po.observe({ type: 'longtask', buffered: false } as any); } catch (e) { po = null; }
    (w as any).__longEarly = longEarly;
    const mo = new MutationObserver(list => list.forEach(m => { mutated += m.addedNodes.length + m.removedNodes.length + (m.type === 'characterData' || m.type === 'attributes' ? 1 : 0); }));
    mo.observe(document.getElementById('app')!, { subtree: true, childList: true, characterData: true, attributes: true });
    const renders0 = w.__renders || 0; const y0 = window.scrollY;
    const loop = (t: number) => { if (last) gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    w.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    const firstGap = () => gaps.slice(0, 30);
    setTimeout(() => {
      stop = true; mo.disconnect(); if (po) po.disconnect();
      const early = firstGap();
      resolve({ maxGapFirst500: Math.round(Math.max(0, ...gaps.filter((_, i) => gaps.slice(0, i).reduce((a, b) => a + b, 0) < 500))), maxGap: Math.round(Math.max(0, ...gaps)), janky: gaps.filter(g => g > 50).length,
        longTotal: Math.round(long.reduce((a, b) => a + b, 0)), longMax: Math.round(Math.max(0, ...long)), longFirst500: Math.round(((w as any).__longEarly || []).reduce((a: number, b: number) => a + b, 0)), renders: (w.__renders || 0) - renders0, rebuilt: document.querySelector('#app > .view') !== view0, mutated, scrollKept: Math.abs(window.scrollY - y0) < 2, frames: gaps.length, early: early.length, ms: Math.round(performance.now() - t0) });
    }, 3000);
  }));
}

test('Rückkehr in die App: ruhig (keine langen Aufgaben im ersten Moment, kein Neuaufbau, Scrollposition bleibt)', async ({ page, request, browserName }) => {
  test.setTimeout(120000);
  const acc = await account(request);
  // viele Daten wie nach Monaten: alle vergangenen Einheiten erledigt mit Werten, 150 Tage Morgenwerte, viele Coach-Nachrichten
  await seed(page, { extra: (d: any) => {
    d.sessions = d.sessions || {}; d.trend = d.trend || []; d.coachMsgs = d.coachMsgs || {};
    for (const w of d.plan.weeks) for (const day of w.days) if (day.date < TODAY) for (const s of day.sessions) if (s.sport !== 'rest') d.sessions[s.id] = { completed: true, rpe: '5', metrics: { min: String(s.plannedMinutes || 45), hr: '138', km: s.sport === 'run' ? '8.2' : s.sport === 'bike' ? '30' : undefined, meters: s.sport === 'swim' ? '1500' : undefined }, metricsSrc: { min: 'manual', hr: 'manual' } };
    const base = Date.parse(TODAY + 'T12:00:00Z');
    for (let i = 1; i <= 150; i++) { const dt = new Date(base - i * 86400000).toISOString().slice(0, 10); if (!d.trend.some((p: any) => p.date === dt)) d.trend.push({ date: dt, hrv: 55 + (i % 9), restingHR: 48 + (i % 5), sleepHours: 7 + (i % 3) / 2 }); }
    for (let i = 0; i < 80; i++) d.coachMsgs['m30-' + i] = { id: 'm30-' + i, at: base - i * 7200e3, date: TODAY, kind: 'answer', from: i % 2 ? 'coach' : 'user', text: 'Nachricht ' + i + ' mit etwas Text, wie im Alltag.' };
  } });
  await withAccount(page, acc);
  await page.goto('/'); await synced(page);
  await page.waitForTimeout(1500);
  if (browserName === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  // auf dem Server liegt inzwischen etwas Neues (zweites Gerät / Uhr): ein Morgenwert von heute
  let inject = true;
  await page.route('**/api/sync', async route => {
    const res = await route.fetch(); const body = await res.json();
    if (inject) { inject = false; body.records = [...(body.records || []), { kind: 'trend', key: TODAY, data: { date: TODAY, hrv: 66, restingHR: 48, _src: { hrv: 'manual' } }, updatedAt: Date.now(), deleted: false }]; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluate(() => window.scrollTo(0, 300));
  const r = await leaveAndReturn(page);
  // Werte für ERGEBNIS.md (vorher/nachher)
  fs.mkdirSync('test-results', { recursive: true });
  fs.appendFileSync('test-results/rueckkehr30.jsonl', JSON.stringify({ browser: browserName, at: new Date().toISOString(), ...r }) + '\n');
  console.log('Rückkehr', browserName, JSON.stringify(r));
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}').trend || [])).some((p: any) => p.date === TODAY && p.hrv === 66), { timeout: 15000 }).toBe(true);
  expect(r.rebuilt, 'Ansicht darf nicht neu aufgebaut werden').toBe(false);
  expect(r.scrollKept, 'Scrollposition bleibt').toBe(true);
  expect(r.renders, 'höchstens ein Angleichen nach dem Abgleich').toBeLessThanOrEqual(1);
  // die ersten 500 ms gehören dem gespeicherten Stand: keine lange Aufgabe (Chromium misst sie), ruhige Bilder in WebKit (ohne CPU-Bremse)
  if (browserName === 'chromium') expect(r.longFirst500, 'keine lange Aufgabe in den ersten 500 ms').toBe(0);
  else expect(r.maxGapFirst500, 'WebKit: die ersten 500 ms ruhig').toBeLessThan(40);
});

/* Auftrag 30, Punkt 8 (Browser-Teil der Langzeit-Prüfung): mit Daten wie nach Monaten mehrmals drehen und die App wechseln –
   die Linse sitzt danach am aktiven Tab, die Ansicht wird nicht neu aufgebaut, keine Fehler im Browser. */
test('Langzeit: drehen und App wechseln im Wechsel (4×), Linse richtig, kein Neuaufbau, keine Fehler', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await seed(page, { extra: (d: any) => {
    d.sessions = d.sessions || {}; d.trend = d.trend || [];
    for (const w of d.plan.weeks) for (const day of w.days) if (day.date < TODAY) for (const s of day.sessions) if (s.sport !== 'rest') d.sessions[s.id] = { completed: true, rpe: '5', metrics: { min: String(s.plannedMinutes || 45) }, metricsSrc: { min: 'manual' }, ...(s.sport === 'bike' ? { asPlanned: false, changed: { kind: 'easy', zone: 2 } } : {}) };
    const base = Date.parse(TODAY + 'T12:00:00Z');
    for (let i = 1; i <= 120; i++) { const dt = new Date(base - i * 86400000).toISOString().slice(0, 10); if (!d.trend.some((p: any) => p.date === dt)) d.trend.push({ date: dt, hrv: 55 + (i % 9), restingHR: 48 + (i % 5) }); }
  } });
  await page.goto('/?go=plan'); await expect(page.locator('#app')).not.toBeEmpty();
  const view0 = await page.evaluate(() => { (window as any).__v0 = document.querySelector('#app > .view'); return true; });
  void view0;
  const aligned = async () => expect.poll(async () => page.evaluate(() => {
    const l = (document.querySelector('.tab-lens') as HTMLElement).getBoundingClientRect(); const t = (document.querySelector('#tabs .tab.on') as HTMLElement).getBoundingClientRect();
    return Math.max(Math.abs((l.left + l.width / 2) - (t.left + t.width / 2)), Math.abs((l.top + l.height / 2) - (t.top + t.height / 2)), Math.abs(l.width - t.width - 6)); // Auftrag 34: Markierung 6 px breiter als der Tab
  }), { timeout: 3000 }).toBeLessThan(1.5);
  await page.evaluate(() => { const w = window as any; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => w.__vis || 'visible' }); });
  for (let i = 0; i < 4; i++) {
    await page.setViewportSize({ width: 844, height: 390 }); await aligned();
    await page.evaluate(() => { (window as any).__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { (window as any).__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await aligned();
  }
  // Breite ändert sich um mehr als 40 px → die Ansicht darf einmal angeglichen werden, aber dasselbe Element bleiben
  expect(await page.evaluate(() => document.querySelector('#app > .view') === (window as any).__v0)).toBe(true);
  await page.locator('#tabs .tab[data-tab="heute"]').click(); await expect(page.locator('[data-view="heute"]')).toBeVisible(); await aligned();
  expect(errors).toEqual([]);
});
