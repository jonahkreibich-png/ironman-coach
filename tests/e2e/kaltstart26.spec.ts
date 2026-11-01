/* Auftrag 26: Kaltstart mit großen Datenmengen (ein Jahr Plan, Einheiten und Morgenwerte, Sync eingeschaltet).
   Gemessen wie im echten Start (scripts/lib/startmess.mjs): Zeit bis zum ersten Bild, weißer Blitz, Layout-Verschiebung (wie CLS),
   Zahl der kompletten Neuaufbauten, Seiten-Neuladen, doppelte Server-Aufrufe. Vor dem zweiten Start legt „ein anderes Gerät“
   eine erledigte Einheit und einen geänderten Plan auf den Server: Beides muss sanft erscheinen, ohne Neuaufbau und ohne Neuladen.
   Vorher (3.13.2, echte Daten): 4 Neuaufbauten, CLS 0,16, weißer Blitz, Plan vom Server lud die Seite neu. */
import { test, expect } from '@playwright/test';
// @ts-ignore reines JS
import { makeDemo } from '../../fixtures/demo.mjs';
// @ts-ignore reines JS
import { instrument, waitQuiet, collect } from '../../scripts/lib/startmess.mjs';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

test('Kaltstart mit einem Jahr Daten: sofort letzter Stand, kein Blitz, kein Sprung, ein Aufbau, Sync aktualisiert sanft', async ({ page, request, browserName }, info) => {
  test.setTimeout(120000);
  const T = today();
  const demo = makeDemo(T, { pastWeeks: 52, trendDays: 365 });
  const plan = demo.plan; const state: any = { ...demo }; delete state.plan;
  const days = plan.weeks.flatMap((w: any) => w.days);
  const todayDay = days.find((d: any) => d.date === T);
  const sid = todayDay.sessions[0].id;
  expect(Object.keys(state.sessions).length).toBeGreaterThan(250);
  expect(state.trend.length).toBe(366);

  // Konto anlegen (wie „Verbinden“), Gerät mit Daten verbinden
  // Konto anlegen: erstes Gerät, falls der Test-Server noch leer ist, sonst eigenes Konto (wie „Verbinden“)
  let acc = await (await request.post('/api/setup', { data: { name: 'Kaltstart' } })).json();
  if (!acc.token) acc = await (await request.post('/api/setup', { data: { signup: true, name: 'Kaltstart', userName: 'SYNTHETIC' } })).json();
  expect(acc.token, JSON.stringify(acc)).toBeTruthy();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(([p, s, a]: any) => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.clear();
    localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', s);
    localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9', tab: 'heute' }));
    localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() }));
    localStorage.setItem('ec_owner', JSON.stringify(a.userId));
    sessionStorage.setItem('__seeded', '1');
  }, [JSON.stringify(plan), JSON.stringify(state), acc]);
  await page.goto('/');
  // erster Abgleich lädt das ganze Jahr hoch
  await expect.poll(() => page.evaluate(() => { try { const m = JSON.parse(localStorage.getItem('ec_sync') || '{}'); return !!m.lastSyncAt && !Object.keys(m.pending || {}).length; } catch (e) { return false; } }), { timeout: 60000 }).toBe(true);
  await page.waitForTimeout(1000);
  await page.close();

  // Kaltstart: neue Seite im selben Browser (Speicher bleibt, wie die App beim erneuten Öffnen)
  async function coldStart(label: string, ready?: (p: any) => Promise<void>) {
    const p = await page.context().newPage();
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.addInitScript(instrument);
    await p.goto('/');
    if (ready) await ready(p);
    await waitQuiet(p, { minMs: 3000, quietMs: 2000 });
    const r: any = await collect(p);
    const summary = { browser: browserName, label, firstView: r.firstView, fcp: r.fcp, marks: r.marks, rebuilds: r.rebuilds, cls: r.cls, whiteFlash: r.whiteFlash, firstPaintBg: r.firstPaintBg, navs: r.navs, api: r.api, partialUpdates: r.partial, shifts: r.shifts };
    console.log('Kaltstart 1 Jahr:', JSON.stringify(summary));
    await info.attach('kaltstart26-' + label + '.json', { body: JSON.stringify({ summary, result: r }, null, 1), contentType: 'application/json' });
    // gilt für jeden Start
    expect(r.navs, 'Seite wurde neu geladen').toBe(1);
    expect(r.whiteFlash, 'heller Blitz vor dem dunklen Design').toBe(false);
    expect(r.firstPaintBg.lum, 'erstes Bild nicht dunkel').toBeLessThan(60);
    expect(r.rebuilds, 'Ansicht mehrmals komplett neu aufgebaut').toBe(1);
    expect(r.firstView, 'erstes Bild zu spät').toBeLessThan(3000);
    expect(r.startupNotice, 'Ladehinweis blitzte auf').toBe(false);
    expect(r.api['/api/me'] || 0, 'Konto doppelt geladen').toBeLessThanOrEqual(1);
    expect(r.api['/api/coach/ai/status'] || 0, 'KI-Stand doppelt geladen').toBeLessThanOrEqual(1);
    expect(r.api['/api/sync'] || 0, 'kein Abgleich').toBeGreaterThanOrEqual(1);
    await p.close();
    return r;
  }

  // 1) Nichts Neues auf dem Server: das erste Bild ist schon das endgültige – keinerlei Verschiebung, keine Änderung nach dem Sync
  const a = await coldStart('ohne-aenderung');
  expect(a.cls, 'Layout-Verschiebung ohne neue Daten').toBeLessThan(0.005);

  // 2) Ein anderes Gerät: heutige Einheit erledigt, Titel im Plan geändert
  const plan2 = JSON.parse(JSON.stringify(plan));
  for (const w of plan2.weeks) for (const d of w.days) if (d.date === T) d.sessions[0].title = 'SYNTHETIC Titel vom anderen Gerät';
  const now = Date.now();
  const res = await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + acc.token }, data: { since: 1e15, changes: [
    { kind: 'session', key: sid, data: { completed: true, notes: '' }, updatedAt: now, deleted: false },
    { kind: 'plan', key: 'main', data: plan2, updatedAt: now, deleted: false }
  ] } });
  expect(res.ok()).toBe(true);
  const b = await coldStart('mit-aenderung', async p => {
    await expect(p.locator(`.check[data-sid="${sid}"]`)).toHaveClass(/(^| )on( |$)/, { timeout: 15000 });
    await expect(p.locator('[data-view="heute"]')).toContainText('SYNTHETIC Titel vom anderen Gerät');
  });
  // Änderung kam als Teil-Aktualisierung (kein Neuaufbau, kein Neuladen – oben geprüft); Bewegung erst nach dem Abgleich, nie im ersten Bild
  expect(b.partial, 'Sync-Änderung kam nicht als Teil-Aktualisierung an').toBeGreaterThan(0);
  const syncAt = (b.apiCalls.find((x: any) => x.path === '/api/sync') || { at: 0 }).at;
  expect(b.shifts.filter((s: any) => s.at < syncAt), 'Verschiebung vor dem Abgleich').toEqual([]);
});
