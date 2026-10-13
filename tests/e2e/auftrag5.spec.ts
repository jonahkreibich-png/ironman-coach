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
  // Auftrag 6: erst vorgemerkt, Vorschau zeigt die Folgen, dann übernehmen
  await expect(page.locator('[data-act="rule-cell"][data-s="run"][data-d="3"]')).toHaveClass(/\bchg\b/);
  await page.locator('[data-act="stage-apply"]').click();
  await expect(page.locator('[data-stage-preview]')).toContainText(/Laufen von \S+ auf (Sa|So)(?![a-z])/);
  await page.locator('[data-act="stage-confirm"]').click();
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
  await expect(page.locator('[data-stage-bar]')).toContainText('1 Änderung');
  await page.locator('[data-act="stage-apply"]').click(); await page.locator('[data-act="stage-confirm"]').click();
  await expect(page.locator('[data-stage-bar]')).toHaveCount(0);
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

test.describe('D: Coach-Chat', () => {
  const send = async (page: any, text: string) => { await page.fill('#coach-in', text); await page.locator('[data-act="coach-send"]').click(); };
  test('Rückfrage mit Knöpfen: keine Zeit → Tag wählen → verschoben → Rückgängig', async ({ page }) => {
    await seed(page);
    await open(page, '/?go=coach');
    await expect(page.locator('[data-now]')).toContainText('Gerade aktuell');
    await send(page, 'Ich habe morgen keine Zeit');
    const last = page.locator('.msg').last();
    await expect(last.locator('[data-act="chat-opt"]').first()).toBeVisible();
    await last.locator('[data-act="chat-opt"]').first().click();
    let reply = page.locator('.msg').last();
    if (await reply.locator('[data-act="chat-opt"]', { hasText: /Ja/ }).count()) { await reply.locator('[data-act="chat-opt"]', { hasText: /Ja/ }).first().click(); reply = page.locator('.msg').last(); }
    await expect(reply).toContainText('Erledigt');
    const adj = Object.values((await stored(page)).adjustments).filter((a: any) => a.from_chat && !a.undone);
    expect(adj.length).toBeGreaterThan(0);
    await reply.locator('[data-act="chat-undo"]').click();
    await expect.poll(async () => Object.values((await stored(page)).adjustments).filter((a: any) => a.from_chat && !a.undone).length).toBe(0);
  });
  test('Schnellaktion „Mir geht\'s nicht gut“ mit zwei Tipps, Verlauf durchsuchbar', async ({ page }) => {
    await seed(page);
    await open(page, '/?go=coach');
    await page.locator('[data-quick] [data-act="chat-say"]', { hasText: "Mir geht's nicht gut" }).click();
    await expect(page.locator('.msg').last()).toContainText('Gute Besserung');
    await page.locator('[data-act="chat-history"]').click();
    await page.fill('#hist-q', 'Besserung'); await page.locator('#hist-q').blur();
    await expect(page.locator('[data-history]')).toContainText('Gute Besserung');
  });
  test('Neue Regel im Chat: ab jetzt mittwochs kein Laufen → im Wochenraster sichtbar', async ({ page }) => {
    await seed(page);
    await open(page, '/?go=coach');
    await send(page, 'Ab jetzt kann ich mittwochs nicht laufen');
    await expect(page.locator('.msg').last()).toContainText('Laufen: nie Mi');
    await page.locator('.msg').last().locator('[data-act="chat-opt"]').first().click();
    await expect(page.locator('.msg').last()).toContainText('Erledigt');
    await open(page, '/?go=beruecksichtigungen');
    await expect(page.locator('[data-act="rule-cell"][data-s="run"][data-d="3"]')).toHaveClass(/\bno\b/);
  });
});

test.describe('E: bereit für Tester', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  test('Einladungslink → Begrüßung → Fragebogen; Safari-Daten weg → mit Wiederherstellungscode alles zurück; Export; Konto löschen', async ({ page, request }) => {
    await request.post('/__reset');
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    const H = { Authorization: 'Bearer ' + admin.token };
    const inv = await (await request.post('/api/admin/testusers', { headers: H, data: { note: 'Papa' } })).json();
    await page.goto('/?invite=' + inv.code);
    await expect(page.locator('[data-invite]')).toBeVisible();
    await page.fill('#intro-name', 'Papa');
    await page.locator('[data-act="intro-accept"]').click();
    await page.waitForLoadState('load');
    await expect(page.locator('[data-intro="1"]')).toBeVisible({ timeout: 10000 });
    const rc = (await page.locator('[data-recovery] .pair-code').textContent())!.trim();
    expect(rc).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await page.locator('[data-act="rc-done"]').click();
    await page.locator('[data-act="intro-next"]').click();
    await expect(page.locator('[data-intro="2"]')).toBeVisible();
    await page.locator('[data-act="intro-next"]').click();
    await page.locator('[data-act="intro-next"]').click();
    await expect(page.locator('.ob')).toBeVisible();
    // eine Berücksichtigung eintragen, die auf den Server geht
    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_sync_auth') || 'null'));
    await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + auth.token }, data: { since: 0, changes: [{ kind: 'profile', key: 'main', data: { name: 'Papa', notes: ['dienstags gar nichts'] }, updatedAt: Date.now() }] } });
    // Safari-Daten gelöscht / neues Handy
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?go=daten');
    await page.locator('summary', { hasText: 'Wiederherstellungscode' }).click();
    await page.fill('#rc-code', rc);
    await page.locator('[data-act="rc-recover"]').click();
    await page.waitForLoadState('load');
    await expect.poll(async () => (await page.evaluate(() => (JSON.parse(localStorage.getItem('ec_state_v2') || '{}').profile || {}).notes)), { timeout: 10000 }).toEqual(['dienstags gar nichts']);
    // Export und Löschen
    await page.goto('/?go=daten');
    const dl = page.waitForEvent('download');
    await page.locator('[data-act="acc-export"]').click();
    const file = await dl; expect(file.suggestedFilename()).toMatch(/daten-\d{4}-\d{2}-\d{2}\.json$/);
    await page.fill('#acc-confirm', 'LÖSCHEN');
    await page.locator('[data-act="acc-delete"]').click(); await page.locator('[data-act="acc-delete"]').click();
    await expect.poll(async () => (await (await request.get('/api/admin/users', { headers: H })).json()).users.length).toBe(1);
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ec_sync_auth'))).toBeNull();
  });
});
test('E6: nach einem Update einmal „Neu in dieser Version“', async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('__ui')) { localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '2.1.0' })); sessionStorage.setItem('__ui', '1'); } });
  await open(page, '/');
  await expect(page.locator('[data-whatsnew]')).toBeVisible();
  await expect(page.locator('[data-whatsnew] li')).toHaveCount(3);
  await page.locator('[data-act="news-ok"]').click();
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('[data-whatsnew]')).toHaveCount(0);
});
