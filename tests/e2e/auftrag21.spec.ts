/* Auftrag 21: Hilfsmittel an Schwimmeinheiten (Symbol + Wort), Vorschläge mit was/von/nach und „Bestätigen“, keine doppelten Meldungen */
import { test, expect } from './storage-harness';
import { seed, open, TODAY, openPlanSession, stored, writeStored } from './helpers';
import * as W from '../../shared/workouts';

test('Schwimmeinheit zeigt ihre Hilfsmittel im Plan und in der Einheit', async ({ page }) => {
  const spec = W.swimLearn({ gear: ['board', 'buoy'], pool: 25 } as any, { ladder: 'swim', n: 4 });
  spec.steps.splice(1, 0, { part: 'main', reps: 4, m: 25, zone: 1, mode: 'kick', restSec: 30 } as any, { part: 'main', reps: 4, m: 50, zone: 2, mode: 'pull', restSec: 30 } as any);
  const b = W.build(spec);
  await seed(page);
  await open(page, '/?go=plan');
  // Die App plant beim Start die Zukunft neu: eine vorhandene künftige Schwimmeinheit nehmen und per Anpassung Kickbrett und Pull Buoy geben
  const sid = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('ec_plan') || '{"weeks":[]}'); for (const w of p.weeks) for (const d of w.days) for (const x of d.sessions || []) if (x.sport === 'swim' && d.date > '2026-10-14') return x.id; return ''; });
  expect(sid).not.toBe('');
  const st = await stored(page);
  st.adjustments = { ...(st.adjustments || {}), 'a21-gear': { id: 'a21-gear', type: 'modify', sessionId: sid, set: { title: b.title, description: b.description, spec: b.spec }, what: 'Test', reason: 'Test', createdAt: 1, date: TODAY } };
  st.profile = { ...(st.profile || {}), skills: { ...((st.profile || {}).skills || {}), swimGear: ['board', 'buoy'] } };
  await writeStored(page, st); await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, sid); await page.keyboard.press('Escape');
  const chips = page.locator(`[data-sid="${sid}"] [data-gear]`).first();
  await expect(chips).toContainText('Kickbrett');
  await expect(chips).toContainText('Pull Buoy');
  await openPlanSession(page, sid);
  await expect(page.locator('#sheet [data-gear]').first()).toContainText('Kickbrett');
});

test('Vorschlag zeigt was, von wann, nach wann und „Bestätigen“; gleiche Meldung nur einmal', async ({ page }) => {
  const at = Date.parse(TODAY + 'T06:00:00Z');
  const dup = (i: number) => ({ id: 'msg-dup-' + i, at: at + i, date: TODAY, kind: 'proposal', from: 'coach', title: 'Schwimmen: bitte prüfen', text: 'Bitte prüfen: gleiche Meldung.', proposal: { status: 'open', changes: [] } });
  await seed(page, { extra: d => {
    d.coachMsgs = { ...(d.coachMsgs || {}),
      'msg-prop-a21': { id: 'msg-prop-a21', at: at + 50, date: TODAY, kind: 'proposal', from: 'ai', title: 'Tauschen: Schwimmen (Mi 14.10.) ↔ Lauf (Fr 16.10.)', text: '',
        proposal: { status: 'open', changes: [{ kind: 'adjust', key: 'a1', data: { id: 'a1', type: 'move', what: 'Schwimmen: Mi 14.10. → Fr 16.10.' } }, { kind: 'adjust', key: 'a2', data: { id: 'a2', type: 'move', what: 'Lauf: Fr 16.10. → Mi 14.10.' } }] } },
      ...Object.fromEntries([1, 2, 3].map(i => ['msg-dup-' + i, dup(i)])) };
  } });
  await open(page, '/?go=coach');
  const prop = page.locator('[data-msg="msg-prop-a21"]');
  await expect(prop.locator('[data-prop-lines]')).toContainText('Schwimmen: Mi 14.10. → Fr 16.10.');
  await expect(prop.locator('[data-prop-lines]')).toContainText('Lauf: Fr 16.10. → Mi 14.10.');
  await expect(prop.getByRole('button', { name: 'Bestätigen' })).toBeVisible();
  await expect(prop.getByRole('button', { name: 'Ablehnen' })).toBeVisible();
  await expect(page.getByText('Bitte prüfen: gleiche Meldung.')).toHaveCount(1);
});
