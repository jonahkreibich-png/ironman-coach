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
