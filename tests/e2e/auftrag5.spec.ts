/* Auftrag 5 E2E: Regeln steuern den Plan (A), Ergebnisse auf iPhone-Breite in Chromium und WebKit. */
import { test, expect } from '@playwright/test';
import { seed, open, stored } from './helpers';

const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
async function effectiveSessions(page: any) {
  return page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem('ec_plan') || 'null'); const st = JSON.parse(localStorage.getItem('ec_state_v2') || 'null');
    const adj = Object.values(st.adjustments || {}).filter((a: any) => a && !a.undone);
    const moved: Record<string, string> = {}; const cancelled = new Set<string>();
    adj.forEach((a: any) => { if (a.type === 'move') moved[a.sessionId] = a.to; if (a.type === 'cancel') cancelled.add(a.sessionId); });
    return plan.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !cancelled.has(s.id)).map((s: any) => ({ id: s.id, sport: s.sport, title: s.title, date: moved[s.id] || d.date }))));
  });
}

test('A: Papas Satz → App zeigt, was sie verstanden hat → Läufe nur noch Sa/So, auch diese Woche', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  await page.fill('#rule-new-cons', 'kann mittwochs nicht laufen, nur Samstag oder Sonntag');
  await page.locator('[data-act="rule-check"]').click();
  const card = page.locator('[data-rule-confirm]');
  await expect(card).toContainText('Laufen: nie Mi');
  await expect(card).toContainText('Laufen: nur Sa und So');
  await page.locator('[data-act="rule-ok"]').click();
  // die Regel landet direkt im Wochenraster
  await expect(page.locator('[data-act="rule-cell"][data-s="run"][data-d="3"]')).toHaveClass(/\bno\b/);
  await expect(page.locator('[data-act="rule-cell"][data-s="run"][data-d="6"]')).toHaveClass(/\byes\b/);
  await expect(page.locator('[data-replanned]')).toBeVisible({ timeout: 5000 });
  // ab heute (Mi 14.10.) kein Lauf mehr außer Sa/So
  const all = await effectiveSessions(page);
  const runs = all.filter((s: any) => s.sport === 'run' && s.date >= '2026-10-14');
  expect(runs.length).toBeGreaterThan(0);
  runs.forEach((s: any) => expect([0, 6], `${s.title} ${s.date}`).toContain(dow(s.date)));
  const msgs = Object.values((await stored(page)).coachMsgs) as any[];
  expect(msgs.some(m => /Plan angepasst/.test(m.title || ''))).toBe(true);
});

test('A2: Wochenraster antippen ändert die Regel (geht → lieber nicht → geht nicht)', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  const cell = page.locator('[data-act="rule-cell"][data-s="bike"][data-d="2"]');
  await expect(cell).toHaveClass(/\byes\b/);
  await cell.click(); await expect(cell).toHaveClass(/\bsoft\b/);
  await cell.click(); await expect(cell).toHaveClass(/\bno\b/);
  const p = (await stored(page)).profile;
  expect(p.rules.some((r: any) => r.kind === 'neverDays' && r.sport === 'bike' && r.days.includes(2) && r.strength === 'hard')).toBe(true);
});

test('A4: Plan bearbeiten – Regel bewusst brechen nur mit Warnung, gilt dann nur für diese Einheit', async ({ page }) => {
  await seed(page, { extra: d => { d.profile = { ...(d.profile || {}), sports: ['swim', 'bike', 'run', 'strength'], notes: ['Rad nie am Freitag'], thresholds: { lthrRun: 170, lthrBike: 160, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 30 } }; } });
  await open(page, '/?go=plan');
  await page.locator('[data-act="edit-toggle"]').first().click();
  const bike = (await effectiveSessions(page)).find((s: any) => s.sport === 'bike' && s.date >= '2026-10-14' && s.date <= '2026-10-18' && dow(s.date) !== 5);
  expect(bike).toBeTruthy();
  await page.locator(`[data-act="sess-edit"][data-sid="${bike.id}"]`).click();
  await page.selectOption('#ed-day', '2026-10-16');
  await page.locator('[data-act="edit-save"]').click();
  await expect(page.locator('[data-edit-warn]')).toContainText('bricht deine Regel „Rad: nie Fr“');
  await page.locator('[data-act="edit-anyway"]').click();
  const adj = Object.values((await stored(page)).adjustments) as any[];
  expect(adj.some(a => a.sessionId === bike.id && a.type === 'move' && a.override)).toBe(true);
});

test.describe('B: Meldungen mit Server', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  const authOf = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('ec_sync_auth') || 'null'));

  test('ohne Konto gemeldet → wartet im Ausgang → nach der Einrichtung beim Betreiber; Antwort kommt beim Nutzer an', async ({ page, request }) => {
    await request.post('/__reset');
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    const H = { Authorization: 'Bearer ' + admin.token };
    const inv = await (await request.post('/api/admin/testusers', { headers: H, data: { note: 'Papa' } })).json();
    await seed(page);
    await open(page, '/?go=feedback');
    await page.fill('#fb-text', 'Lauf liegt am Montag, obwohl ich nur Sa/So kann');
    await page.locator('[data-act="fb-send"]').click();
    await expect(page.locator('[data-feedback-queued]')).toContainText('Ausgang');
    // jetzt mit Einladung einrichten (Daten auf dem Gerät gehören nicht zum Konto)
    await page.locator('[data-act="back"]').click().catch(() => {});
    await open(page, '/?go=daten');
    await page.locator('summary', { hasText: 'Einladung' }).click();
    await page.fill('#inv-code', inv.code); await page.fill('#inv-name', 'Papa');
    await page.locator('[data-act="sync-invite"]').click();
    await page.waitForLoadState('load');
    await expect.poll(async () => (await (await request.get('/api/admin/feedback', { headers: H })).json()).feedback.length, { timeout: 15000 }).toBe(1);
    const fb = (await (await request.get('/api/admin/feedback', { headers: H })).json()).feedback[0];
    expect(fb).toMatchObject({ user: 'Papa', text: 'Lauf liegt am Montag, obwohl ich nur Sa/So kann', status: 'neu' });
    expect(fb.version).not.toBe('#');
    // Betreiber antwortet → Nutzer sieht die Antwort unter „Meine Meldungen“
    await request.post('/api/admin/feedback/' + fb.id, { headers: H, data: { reply: 'Danke, ist repariert!' } });
    await open(page, '/?go=feedback');
    await expect(page.locator('[data-feedback-mine]')).toContainText('Danke, ist repariert!');
  });

  test('Server nicht erreichbar: Meldung geht nicht verloren, wird beim nächsten Start gesendet', async ({ page, request }) => {
    await request.post('/__reset');
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    const H = { Authorization: 'Bearer ' + admin.token };
    const inv = await (await request.post('/api/admin/testusers', { headers: H, data: { note: 'Tester' } })).json();
    const user = await (await request.post('/api/setup', { data: { name: 'iPhone Tester', invite: inv.code, userName: 'Tester' } })).json();
    await page.addInitScript(([a]) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('ec_sync_auth', a as string); localStorage.setItem('ec_owner', '2'); sessionStorage.setItem('__s', '1'); } }, [JSON.stringify({ token: user.token, deviceId: user.deviceId, userId: 2 })]);
    await page.route('**/api/feedback', r => r.fulfill({ status: 503, body: '{"error":"weg"}' }));
    await open(page, '/?go=feedback');
    await page.fill('#fb-text', 'Offline gemeldet');
    await page.locator('[data-act="fb-send"]').click();
    await expect(page.locator('[data-feedback-queued]')).toBeVisible();
    await page.unroute('**/api/feedback');
    await page.reload();
    await expect.poll(async () => (await (await request.get('/api/admin/feedback', { headers: H })).json()).feedback.map((f: any) => f.text), { timeout: 15000 }).toEqual(['Offline gemeldet']);
    expect(await page.evaluate(() => localStorage.getItem('ec_fb_outbox'))).toBeNull();
  });

  test('Betreiber-Posteingang: Filter, Status, Als Text kopieren, Link aus der Mitteilung öffnet die Meldung', async ({ page, request, context }) => {
    await request.post('/__reset');
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    const H = { Authorization: 'Bearer ' + admin.token };
    const inv = await (await request.post('/api/admin/testusers', { headers: H, data: { note: 'Papa' } })).json();
    const u = await (await request.post('/api/setup', { data: { name: 'iPhone Papa', invite: inv.code, userName: 'Papa' } })).json();
    const r = await (await request.post('/api/feedback', { headers: { Authorization: 'Bearer ' + u.token }, data: { kind: 'bug', text: 'Coach antwortet nicht', version: '20261012', screen: 'coach', device: 'iPhone' } })).json();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(([a]) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('ec_sync_auth', a as string); localStorage.setItem('ec_owner', '1'); localStorage.setItem('ec_me', JSON.stringify({ role: 'admin', entitlements: {} })); sessionStorage.setItem('__s', '1'); } }, [JSON.stringify({ token: admin.token, deviceId: admin.deviceId, userId: 1 })]);
    await open(page, `/?go=feedback&fb=${r.id}`);
    const item = page.locator(`[data-fb="${r.id}"]`);
    await expect(item).toContainText('Coach antwortet nicht');
    await item.locator('[data-act="fb-copy"]').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('Meldung #' + r.id + ' von Papa');
    expect(clip).toContain('Version 20261012');
    await item.locator('[data-act="fb-status"][data-v="erledigt"]').click();
    await expect.poll(async () => (await (await request.get('/api/admin/feedback', { headers: H })).json()).feedback[0].status).toBe('erledigt');
  });
});
