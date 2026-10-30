/* Auftrag 22: Vor jedem Release mit einer Kopie ALLER echten Daten prüfen, ob die Datenbank-Umstellung klappt und alle Nutzer danach
   fehlerfrei laden. Die echte Datenbank wird nur gelesen (Sicherung), geprüft wird eine lokale Kopie.
   Je Nutzer laufen die echten Server-Wege: Zustand laden, Coach-Engine (Morgen- und Wochenlauf), Scores, Bewertung der letzten 14 Tage,
   Intervalle jeder erledigten Einheit, Daten-Check. Jeder Absturz hält das Release an.
   Aufruf: npx vite-node scripts/release-check-cli.ts <sicherung.sql|kopie.sqlite> [JJJJ-MM-TT]   (Exit 1 bei Fehlern) */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore reines JS
import { upgradeCopy } from './lib/upgrade-copy.mjs';
// @ts-ignore reines JS
import { D1Shim } from '../server/test/d1-shim.mjs';
import { loadState, engineCtx } from '../server/src/coach';
import { withTz, userTz } from '../server/src/tz';
import { runEngine } from '../shared/coach/engine';
import { doneItems, reviewItem } from '../shared/coach/review';
import { sportScores, legacyActivities, namedFromPlan } from '../shared/scores';
import { evaluateIntervals } from '../shared/intervals';
import { dataCheck } from '../shared/datacheck';
import { mainGoal } from '../shared/goals';
import { localDate } from '../shared/tz';
import * as C from '../shared/core';

export async function releaseDataCheck(src: string, today = localDate()): Promise<{ ok: boolean; users: any[]; migrated: string[]; counts: { before: number; after: number } }> {
  const file = src.endsWith('.sqlite') ? src : src.replace(/\.sql$/, '') + '-releasecheck.sqlite';
  if (!src.endsWith('.sqlite')) { if (fs.existsSync(file)) fs.unlinkSync(file); const db = new DatabaseSync(file); db.exec(fs.readFileSync(src, 'utf8')); db.close(); }
  const shim = new D1Shim(file);
  const count = () => (shim.db.prepare('SELECT COUNT(*) AS n FROM records WHERE deleted = 0').get() as any).n;
  const before = count();
  const migrated: string[] = upgradeCopy(shim.db, 'server/migrations');
  const after = count();
  const env: any = { DB: shim };
  const ids = (shim.db.prepare('SELECT DISTINCT user_id AS id FROM records WHERE deleted = 0 ORDER BY user_id').all() as any[]).map(r => r.id);
  const users: any[] = [];
  for (const uid of ids) {
    const errors: string[] = []; const stats: any = { uid };
    const step = async (name: string, fn: () => any) => { try { return await fn(); } catch (e: any) { errors.push(`${name}: ${String(e && e.message || e).slice(0, 200)}`); return null; } };
    await withTz(await userTz(env, uid), async () => {
      const L: any = await step('Zustand laden', () => loadState(env, uid));
      if (!L) return;
      stats.sessions = Object.keys(L.state.sessions || {}).length; stats.plan = !!L.plan;
      if (L.plan) {
        const ctx = engineCtx(L, today);
        await step('Coach-Engine (Morgen)', () => runEngine(ctx, { type: 'daily' } as any));
        await step('Coach-Engine (Woche)', () => runEngine(ctx, { type: 'weekly' } as any));
        await step('Wochenübersicht', () => C.weekSummary(L.state, L.baseWeeks, today));
        const items = await step('Bewertungen', () => doneItems(ctx, C.addDays(today, -14), today)) || [];
        for (const d of items) await step('Bewertung ' + d.date, () => reviewItem(ctx, d));
        stats.reviews = items.length;
        let iv = 0;
        for (const d of C.planDays(C.applyAdjustments(L.baseWeeks, L.state.adjustments || {}))) for (const s of d.sessions) {
          const st = (L.state.sessions || {})[s.id]; if (!st || !st.completed) continue;
          const e = await step('Intervalle ' + d.date, () => evaluateIntervals(s, st, st.activityId ? (L.state.activities || {})[st.activityId] : null, (L.profile && L.profile.thresholds) || {}, s.sport));
          if (e) iv++;
        }
        stats.intervalSessions = iv;
        await step('Daten-Check', () => { const r = dataCheck({ state: L.state, baseWeeks: L.baseWeeks, profile: L.profile, goals: L.goals, today }); stats.findings = r.findings.length; stats.safeFixes = r.fixes.length; });
      }
      await step('Scores', () => { const acts = [...namedFromPlan(L.state, L.baseWeeks, C.recordedActivities(L.state)), ...legacyActivities(L.state, L.baseWeeks, L.profile)] as any[]; const sc = sportScores({ today, activities: acts, trend: L.state.trend, illness: L.state.illnessPeriods, profile: L.profile, goal: mainGoal(L.goals, today) } as any); stats.scores = sc.map(x => `${x.sport} ${x.score}`).join(', '); for (const x of sc) if (!Number.isFinite(x.score)) throw new Error(`${x.sport}: ungültig`); });
    });
    users.push({ ...stats, errors });
  }
  shim.db.close();
  return { ok: before === after && users.every(u => !u.errors.length), users, migrated, counts: { before, after } };
}

