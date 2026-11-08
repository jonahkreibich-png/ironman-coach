/* Auftrag 30, Punkt 7: Pläne aller Nutzer gegen die Trainingsregeln prüfen (vorher = gespeicherter Plan, nachher = mit den neuen Regeln
   neu berechnet, wie es die App beim nächsten Neu-Planen tut). Liest nur eine lokale Kopie der Datenbank, ändert nichts.
   Aufruf: npx vite-node scripts/plan-auftrag30.ts -- <kopie.sqlite> <heute JJJJ-MM-TT> [nutzer] [--korrektur <datei.json>]
   Mit --korrektur (nur zusammen mit einem Nutzer): schreibt die Änderung für scripts/korrektur.mjs (neuer Plan, Ausgangsstand als „base“). */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import * as C from '../shared/core';
import { replanPlan, replanStart } from '../shared/replan';
import { isHardSession, swimFast } from '../shared/intensity';
import { checkTrainingRules, TRULE_LABEL } from '../shared/trainingrules';

const argv = process.argv.slice(2).filter(a => a !== '--');
const ki = argv.indexOf('--korrektur'); const korrFile = ki >= 0 ? argv[ki + 1] : null;
const args = ki >= 0 ? argv.filter((_, i) => i !== ki && i !== ki + 1) : argv;
const [dbFile, today, only] = args;
const db = new DatabaseSync(dbFile, { readOnly: true });
const users = (db.prepare('SELECT DISTINCT user_id FROM records WHERE deleted = 0').all() as any[]).map(r => r.user_id).filter(u => !only || String(u) === only);

function load(uid: number) {
  const recs = (db.prepare('SELECT kind, key, data FROM records WHERE user_id = ? AND deleted = 0').all(uid) as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
  const one = (k: string) => (recs.find(r => r.kind === k) || {} as any).data;
  const dict = (k: string) => Object.fromEntries(recs.filter(r => r.kind === k).map(r => [r.key, r.data]));
  const customWorkouts: any = {}; recs.filter(r => r.kind === 'custom').forEach(r => { const w = r.data; if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
  const profile = one('profile') || {};
  const state: any = { sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'), trend: recs.filter(r => r.kind === 'trend').map(r => r.data).sort((a, b) => a.date.localeCompare(b.date)), illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data), profile };
  return { plan: one('plan'), profile, state, goals: recs.filter(r => r.kind === 'goal').map(r => r.data) };
}
const strengthOf = (all: any[]) => all.filter(s => s.sport === 'strength').length;
export function overview(weeks: any[], adjustments: any, from: string, n = 16) {
  const days = C.planDays(C.applyAdjustments(weeks, adjustments || {}));
  const ws = weeks.filter((w: any) => w.endDate >= from).slice(0, n);
  let lastBuild: number | null = null;
  return ws.map((w: any) => {
    const ds = days.filter((d: any) => d.date >= w.startDate && d.date <= w.endDate);
    const all = ds.flatMap((d: any) => d.sessions.filter((s: any) => s && s.sport !== 'rest' && !s.cancelled));
    const own = all.filter((s: any) => s.sport !== 'football' && !s.race).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const team = all.filter((s: any) => s.sport === 'football').reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const ratio = w.isRecoveryWeek && lastBuild ? Math.round(own / lastBuild * 100) : null;
    if (!w.isRecoveryWeek && w.phase !== 'taper' && w.phase !== 'race') lastBuild = own;
    return { week: w.weekNumber, from: w.startDate, phase: w.phase + (w.isRecoveryWeek ? ' Erh.' : ''), ownH: Math.round(own / 6) / 10, teamH: Math.round(team / 6) / 10,
      hard: all.filter((s: any) => isHardSession(s) && s.sport !== 'football' && !s.race).length, swimFast: all.filter(swimFast).length, strength: strengthOf(all), recPct: ratio };
  });
}
const table = (rows: any[]) => ['| Woche | ab | Phase | eigene h | Teamsport h | harte | Schwimm-⚡ | Kraft | Erholung % |', '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.week} | ${r.from.slice(8)}.${r.from.slice(5, 7)}. | ${r.phase} | ${String(r.ownH).replace('.', ',')} | ${String(r.teamH).replace('.', ',')} | ${r.hard} | ${r.swimFast} | ${r.strength} | ${r.recPct ?? ''} |`)].join('\n');
for (const uid of users) {
  const u = load(uid); if (!u.plan || !u.plan.weeks) { console.log(`\n## Nutzer ${uid}: kein Plan`); continue; }
  const from = process.env.FROM30 || replanStart(today, 20); // FROM30: anderer Start (nur Analyse)
  const before = overview(u.plan.weeks, u.state.adjustments, from);
  let after: any[] = []; let rulesAfter: Record<string, number> = {};
  try {
    const r = replanPlan(u.plan, u.profile, u.goals, today, { state: u.state, adjustments: u.state.adjustments, from, recentHours: null });
    if (r && korrFile && only) {
      // Vergangenes und Erledigtes bleibt (Prüfung wie Auftrag 20)
      const done = Object.entries(u.state.sessions).filter(([, s]: any) => s && s.completed).map(([id]) => id);
      const ids = new Set(C.planDays(r.plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
      const lost = done.filter(id => C.planDays(u.plan.weeks).some((d: any) => d.sessions.some((s: any) => s.id === id)) && !ids.has(id));
      if (lost.length) throw new Error('Erledigte Einheiten fehlen: ' + lost.join(', '));
      fs.writeFileSync(korrFile, JSON.stringify([{ kind: 'plan', key: 'main', data: r.plan, base: u.plan }]));
      console.log('Korrektur geschrieben:', korrFile);
    }
    if (r) { after = overview(r.plan.weeks, u.state.adjustments, from);
      checkTrainingRules(C.applyAdjustments(r.plan.weeks, u.state.adjustments), u.profile, { from, goals: u.goals, today }).forEach((i: any) => { if (process.env.MSG30) console.log('MSG', i.rule, i.msg); const k = TRULE_LABEL[i.rule as keyof typeof TRULE_LABEL] || i.rule; rulesAfter[k] = (rulesAfter[k] || 0) + 1; }); }
  } catch (e) { console.log('Neu-Planen fehlgeschlagen:', (e as Error).message); }
  const rulesBefore: Record<string, number> = {};
  checkTrainingRules(C.applyAdjustments(u.plan.weeks, u.state.adjustments), u.profile, { from, goals: u.goals, today }).forEach((i: any) => { const k = TRULE_LABEL[i.rule as keyof typeof TRULE_LABEL] || i.rule; rulesBefore[k] = (rulesBefore[k] || 0) + 1; });
  console.log(`\n## Nutzer ${uid} (Alter ${u.profile.birthYear ? +today.slice(0, 4) - u.profile.birthYear : '?'}, Sportarten ${(u.profile.sports || []).join(', ')})\n### vorher\n${table(before)}\nRegel-Verstöße vorher: ${JSON.stringify(rulesBefore)}`);
  if (after.length) console.log(`### nachher (neu berechnet)\n${table(after)}\nRegel-Verstöße nachher: ${JSON.stringify(rulesAfter)}`);
}
