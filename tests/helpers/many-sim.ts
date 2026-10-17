/* Auftrag 15, Punkt 5: jeden Test-Nutzer komplett durchspielen und automatisch prüfen.
   Fragebogen → Plan → 3 Wochen (erledigt, ausgelassen, Extra-Einheiten, Morgenwerte, bei manchen Krankheit) → Coach (Engine + Fragen)
   → Profil ändern und neu planen → Scores, Prognose, Ampel. Liefert die gefundenen Fehler je Art (für Tests und ERGEBNIS.md). */
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { applyOnboarding, missingRequired } from '../../shared/onboarding';
import { replanPlan } from '../../shared/replan';
import { checkPlanRules } from '../../shared/planrules';
import { checkPlan, checkSession } from '../../shared/plancheck';
import { checkIntensity, titleZoneIssue, isHardSession } from '../../shared/intensity';
import { runEngine } from '../../shared/coach/engine';
import { converse } from '../../shared/coach/dialog';
import { applyOps } from '../../shared/coach/ops';
import { sportScores, formScore, estimatesAt, legacyActivities } from '../../shared/scores';
import { prognosis } from '../../shared/prognosis';
import { mainGoal } from '../../shared/goals';
import { chosenSports, sportAllowed } from '../../shared/sports';
import { isMinor } from '../../shared/profile';
import { JARGON, unexplained } from '../../shared/glossary';
import type { ManyUser } from '../../fixtures/manyusers';

export type Kind = 'sport' | 'sameSport' | 'hardAdjacent' | 'volume' | 'realistic' | 'intensity' | 'contradiction' | 'jargon' | 'coachSport' | 'coach' | 'scores' | 'ampel' | 'replan' | 'questionnaire';
export const KIND_LABEL: Record<Kind, string> = {
  questionnaire: 'Fragebogen unvollständig/kein Plan', sport: 'nicht gewählte Sportart im Plan', sameSport: 'gleiche Sportart an Folgetagen ohne Begründung',
  hardAdjacent: 'zwei harte Tage hintereinander', volume: 'Umfang passt nicht zu Zeit/Niveau', realistic: 'unrealistische Meter/Zeit/Tempo',
  intensity: 'Intensität passt nicht zur Phase', contradiction: 'widersprüchlicher Text (z. B. „locker“ + Zone 3)', jargon: 'Fachbegriff ohne Erklärung',
  coachSport: 'Coach schlägt nicht gewählte Sportart vor', coach: 'Coach-Antwort fehlt/Regel verletzt', scores: 'Score/Prognose ungültig', ampel: 'Ampel-Farbe passt nicht zum Wert',
  replan: 'Neuplanung verliert Erledigtes/Vergangenes'
};
export interface Finding { user: string; kind: Kind; msg: string }

const SPORT_WORDS: Record<string, RegExp> = {
  run: /\b(Lauf|Laufen|laufen|läufst|Läufe|Dauerlauf|Joggen|joggen)\b/, bike: /\b(Radfahrt|Ausfahrt|radeln|Radeinheit|Rolle)\b/, swim: /\b(Schwimmen|schwimmen|Kraul|Bahnen)\b/
};
const rnd = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

/* alle Plan-Prüfungen ab „from“ */
export function planFindings(user: string, weeks: any[], profile: any, goals: any[], today: string, from: string, meta: any = {}, label = ''): Finding[] {
  const out: Finding[] = []; const add = (kind: Kind, msg: string) => out.push({ user, kind, msg: (label ? label + ': ' : '') + msg });
  const i0 = weeks.findIndex((w: any) => (w.endDate || C.addDays(w.startDate, 6)) >= from);
  const ws = i0 < 0 ? [] : weeks.slice(i0);
  const ctxWeeks = i0 < 0 ? [] : weeks.slice(Math.max(0, i0 - 4));
  const firstNo = ws.length ? ws[0].weekNumber : 0;
  for (const i of checkPlanRules(ws, profile, { from })) add(i.rule === 'sport' ? 'sport' : 'sameSport', i.msg);
  const ints = checkIntensity(ws, profile, today, { ...(meta.intensityOpts || {}), from });
  for (const i of ints) add(i.rule === 'adjacent' ? 'hardAdjacent' : i.rule === 'titleZone' ? 'contradiction' : 'intensity', i.msg);
  const cp = checkPlan(ctxWeeks.slice(0, 16), profile, goals, today, { fromDate: from }).filter(i => (i.week == null || i.week >= firstNo) && (!i.date || i.date >= from));
  for (const i of cp) {
    if (['sport', 'sameSport', 'strengthGroup'].includes(i.rule)) continue; // schon oben
    if (i.rule === 'dayTime' || i.rule === 'volume' || i.rule === 'runVolume' || i.rule === 'frequency') add('volume', i.msg);
    else if (i.rule === 'distance' || i.rule === 'ability') add('realistic', i.msg);
    else if (i.rule === 'hardDays') add('hardAdjacent', i.msg);
    else if (i.rule === 'teamSport' && /obwohl keiner angegeben/.test(i.msg)) add('sport', i.msg);
    else if (i.rule !== 'age' && i.rule !== 'goals' && i.rule !== 'constraint' && i.rule !== 'teamSport' && i.rule !== 'strength') add('intensity', `${i.rule}: ${i.msg}`);
  }
  const budget = (profile.weeklyHours || 5) * 60;
  for (const w of ws.slice(0, 12)) {
    const own = (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && !s.fixed && !s.race && s.sport !== 'rest' && s.sport !== 'football' && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
    if (own > budget * 1.1 + 10) add('volume', `Woche ${w.weekNumber}: ${own} min geplant, Zeit pro Woche ${Math.round(budget)} min.`);
    // Erholungswoche spürbar leichter als die letzte normale Woche davor
    if (w.isRecoveryWeek && !w.partial) { const k = weeks.indexOf(w); const prev = weeks.slice(0, k).reverse().find((x: any) => !x.isRecoveryWeek && !x.partial && !x.reduced && !x.entry && x.phase !== 'taper' && x.phase !== 'race');
      const pm = prev ? (prev.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && !s.fixed && !s.race && s.sport !== 'rest' && s.sport !== 'football' && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0) : 0;
      if (pm >= 90 && own > pm * 0.9) add('volume', `Woche ${w.weekNumber}: Erholungswoche mit ${own} min kaum leichter als ${pm} min davor.`); }
    for (const d of w.days || []) for (const s of d.sessions || []) {
      if (!s || s.sport === 'rest' || s.race || s.sport === 'football' || d.date < from) continue;
      const t = titleZoneIssue(s); if (t) add('contradiction', t);
      if (s.adjacentOk && isHardSession(s)) add('contradiction', `${d.date} ${s.title}: Ausnahme „locker und kurz“, aber hart.`);
      for (const x of checkSession(s, w.weekNumber, d.date)) add('realistic', x.msg);
      const m = s.plannedMinutes || 0;
      if (m < 10 || m > 420) add('realistic', `${d.date} ${s.title}: ${m} min.`);
      if (s.sport !== 'strength' && isHardSession(s) && m < 20 && !/test|check/i.test(s.title)) add('realistic', `${d.date} ${s.title}: harte Einheit nur ${m} min.`);
      if (s.sport === 'swim' && s.plannedKm) { const p100 = m * 60 / (s.plannedKm * 10); if (p100 < 75 || p100 > 330) add('realistic', `${d.date} ${s.title}: ${Math.round(p100)} s/100 m inkl. Pausen.`); if (s.plannedKm * 1000 < 150) add('realistic', `${d.date} ${s.title}: nur ${Math.round(s.plannedKm * 1000)} m.`); }
      if (s.sport === 'run' && s.plannedKm) { const sk = m * 60 / s.plannedKm; if (sk < 180 || sk > 660) add('realistic', `${d.date} ${s.title}: ${Math.floor(sk / 60)}:${String(Math.round(sk % 60)).padStart(2, '0')}/km.`); }
      if (s.sport === 'bike' && s.plannedKm) { const kmh = s.plannedKm / (m / 60); if (kmh < 12 || kmh > 40) add('realistic', `${d.date} ${s.title}: ${Math.round(kmh)} km/h.`); }
      for (const j of unexplained(`${s.title}\n${s.description || ''}`)) add('jargon', `${s.title}: „${j}“ ohne Erklärung.`);
    }
  }
  return out;
}

export interface SimResult { findings: Finding[]; profile: any; goals: any[]; plan: any; state: any; today: string }
export function simulate(u: ManyUser, T0: string): SimResult {
  const F: Finding[] = []; const add = (kind: Kind, msg: string) => F.push({ user: u.id, kind, msg });
  const miss = missingRequired(u.answers);
  const r = applyOnboarding(u.answers, T0);
  if (miss.length || !r.gen) { add('questionnaire', miss.map(m => m.q.id).join(', ') || 'kein Plan'); return { findings: F, profile: r.profile, goals: r.goals, plan: null, state: null, today: T0 }; }
  let profile: any = r.profile; const goals: any[] = r.goals; let plan = r.gen.plan;
  F.push(...planFindings(u.id, plan.weeks, profile, goals, T0, T0, plan.meta, 'Start'));
  // ---------- 3 Wochen ----------
  const R = rnd(u.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const state: any = { sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, nutrition: {} };
  const own = chosenSports(profile).filter(s => s !== 'strength');
  const ctx = (today: string, now: number): any => ({ today, now, state: { ...state, profile }, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals });
  for (let k = 0; k < 21; k++) {
    const date = C.addDays(T0, k); const now = Date.parse(date + 'T19:00:00Z');
    if (u.ill && k === 8) state.illnessPeriods.push({ id: 'ill-' + u.id, start: date, end: null, note: 'Erkältung' });
    if (u.ill && k === 11) state.illnessPeriods[0].end = date;
    state.trend.push({ date, hrv: 60 + Math.round(R() * 12), restingHR: 52 + Math.round(R() * 6), sleepHours: 6 + Math.round(R() * 25) / 10, sleepQuality: 6 + Math.round(R() * 3), feel: 1 + Math.floor(R() * 4) });
    const day = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((d: any) => d.date === date);
    const done: string[] = [];
    for (const s of (day ? day.sessions : []).filter((x: any) => x && x.sport !== 'rest' && !x.cancelled)) {
      const x = R();
      const sick = C.illnessAt(state.illnessPeriods, date);
      if (x < 0.7 && !sick) { state.sessions[s.id] = { completed: true, metrics: { min: Math.round((s.plannedMinutes || 45) * (0.85 + R() * 0.3)), rpe: 3 + Math.floor(R() * 5), feel: 2 + Math.floor(R() * 3) }, completedAt: now }; done.push(s.id); }
      else if (x < 0.85 || sick) state.sessions[s.id] = { skipped: true, skipReason: sick ? 'krank' : 'keine Zeit' };
    }
    // Extra-Einheit einmal pro Woche: eigene Sportart (oder Teamsport)
    if (k % 7 === 4) {
      const sp = profile.teamSport && k === 11 ? 'football' : own[k % Math.max(1, own.length)] || 'strength';
      const id = `x-${u.id}-${k}`;
      (state.customWorkouts[date] = state.customWorkouts[date] || []).push({ id, sport: sp, title: sp === 'football' ? 'Freundschaftsspiel' : 'Extra-Einheit', plannedMinutes: 40, completed: true, metrics: { min: 40, rpe: sp === 'football' ? 8 : 4 } });
    }
    const evs: any[] = [{ type: 'trend', dates: [date] }, ...(done.length ? [{ type: 'activity', sessionIds: done }] : []), { type: 'daily' }, ...(dow(date) === 0 ? [{ type: 'weekly' }] : [])];
    for (const ev of evs) {
      let out: any; try { out = runEngine(ctx(date, now), ev); } catch (e: any) { add('coach', `${date} Engine ${ev.type}: ${e.message}`); continue; }
      for (const m of out.messages) { state.coachMsgs[m.id] = m; coachText(u, profile, m.text || '', `${date} ${m.title || m.kind}`, add); }
      for (const a of out.adjustments || []) state.adjustments[a.id] = { ...a, createdAt: now };
    }
  }
  // ---------- Coach-Fragen ----------
  const T3 = C.addDays(T0, 21);
  let dialog: any = {};
  const ask = (q: string) => {
    const { reply, dialog: d2 } = converse(ctx(T3, Date.parse(T3 + 'T08:00:00Z')), dialog, q); dialog = d2;
    if (!reply || !reply.text || reply.text.length < 5) add('coach', `„${q}“: keine Antwort.`);
    else coachText(u, profile, reply.text, `„${q}“`, add);
    return reply;
  };
  ask('Was steht heute an?');
  ask('Warum soll ich heute locker trainieren?');
  ask('Ich bin heute sehr müde');
  ask('Wie läuft mein Training?');
  const abn = ask('Ich will abnehmen');
  if (isMinor(profile, T3) && /Kalorien.?defizit|weniger essen|Gewicht.?ziel von|kg abnehmen/i.test(abn.text)) add('coach', `Jugendlich, „Ich will abnehmen“: ${abn.text.slice(0, 120)}`);
  for (const sp of ['run', 'bike', 'swim'].filter(s => !sportAllowed(profile, s))) {
    const word = { run: 'laufen', bike: 'Rad fahren', swim: 'schwimmen' }[sp]!;
    const rep = ask(`Kannst du mir eine Einheit ${word} einplanen?`);
    if (rep.intent !== 'sport-not-chosen') add('coachSport', `„Einheit ${word}“: Coach sagt nicht, dass die Sportart nicht gewählt ist (${rep.intent}).`);
    if (rep.apply && rep.apply.length) {
      const store = { state, profile, goals: Object.fromEntries(goals.map((g: any) => [g.id, g])), saveProfile: (p: any) => { profile = p; } };
      try { applyOps(store, rep.apply, Date.now(), T3); } catch (e) { /* zählt unten */ }
      const bad = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).filter((d: any) => d.date >= T3).flatMap((d: any) => d.sessions).filter((s: any) => s && !s.cancelled && !s.race && !sportAllowed(profile, s.sport));
      if (bad.length) add('coachSport', `„${word}“ eingeplant, obwohl nicht gewählt: ${bad[0].title}`);
    }
  }
  // ---------- Profil ändern (eine Stunde mehr bzw. ein Tag mehr) und neu planen ----------
  const before = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments));
  const doneIds = Object.entries(state.sessions).filter(([, v]: any) => v.completed).map(([k]) => k).filter(id => before.some((d: any) => d.date < T3 && d.sessions.some((s: any) => s.id === id)));
  const dl = { ...(profile.dayLoad || {}) }; const free = [3, 5, 1].find(d => !dl[d]); if (free != null) dl[free] = 1;
  profile = { ...profile, dayLoad: dl, weeklyHours: (profile.weeklyHours || 4) + 0.75 };
  const rp = replanPlan(plan, profile, goals, T3, { state, adjustments: state.adjustments, from: T3 });
  if (!rp) add('replan', 'Neuplanung ohne Ergebnis.');
  else {
    const ids = new Set(C.planDays(rp.plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
    const lost = doneIds.filter(id => !ids.has(id)); if (lost.length) add('replan', `${lost.length} erledigte Einheiten fehlen nach dem Neuplanen.`);
    plan = rp.plan;
    F.push(...planFindings(u.id, plan.weeks, profile, goals, T3, T3, plan.meta, 'nach Profil-Änderung'));
  }
  // ---------- Fortschritt, Scores, Prognose, Ampel ----------
  try {
    const goal = mainGoal(goals, T3);
    const acts = legacyActivities({ ...state, profile }, plan.weeks, profile);
    const inp: any = { today: T3, activities: acts, trend: state.trend, illness: state.illnessPeriods, profile, goal, loadsBySport: {} };
    const sp = (['swim', 'bike', 'run', 'strength'] as any[]).filter(s => chosenSports(profile).includes(s));
    const sc = sportScores(inp, sp.length ? sp : ['run']);
    for (const s of sc) if (s.score != null && !(isFinite(s.score) && s.score >= 0 && s.score <= 200)) add('scores', `${s.sport}: Score ${s.score}`);
    if (sc.some((s: any) => !chosenSports(profile).includes(s.sport))) add('sport', `Score für nicht gewählte Sportart: ${sc.map((s: any) => s.sport).join(', ')}`);
    const fs = formScore(inp); if (fs && (fs as any).score != null && !isFinite((fs as any).score)) add('scores', 'Form ungültig');
    if (goal && goal.type !== 'fitness') {
      const pg: any = prognosis(goal, estimatesAt(inp, T3), { profile, today: T3 });
      const preds = pg && pg.ok ? [pg.total, ...(pg.parts || []), ...(pg.race ? [pg.race.total, ...(pg.race.parts || [])] : [])].filter(Boolean) : [];
      for (const x of preds) if (!(isFinite(x.best) && x.best > 0 && x.low <= x.best && x.best <= x.high)) add('scores', `Prognose ${x.label}: ${x.low}/${x.best}/${x.high}`);
      for (const x of preds) if (x.sport && x.sport !== 'trans' && !chosenSports(profile).includes(x.sport) && pg.parts && !pg.parts.length) add('sport', `Prognose für nicht gewählte Sportart ${x.sport}`);
    }
    for (let k = 0; k < 21; k++) {
      const d = C.addDays(T0, k); const rd = C.readinessFor(state.trend, state.illnessPeriods, d, { sleepNeed: [7, 9] });
      if (rd.score != null && rd.level !== 3 && C.levelOfScore(rd.score) !== rd.level && !C.illnessAt(state.illnessPeriods, d)) add('ampel', `${d}: Wert ${rd.score}, Farbe ${rd.level}`);
    }
  } catch (e: any) { add('scores', `Fehler: ${e.message}`); }
  return { findings: F, profile, goals, plan, state, today: T3 };
}

/* Coach-Text: schlägt er eine nicht gewählte Sportart vor? Erklärt er Fachbegriffe? */
function coachText(u: ManyUser, profile: any, text: string, where: string, add: (k: Kind, m: string) => void) {
  // die Erklärung „… hast du nicht als Sportart gewählt“ ist kein Vorschlag
  if (/nicht als Sportart gewählt/.test(text)) { for (const j of unexplained(text)) add('jargon', where + ': „' + j + '“ ohne Erklärung.'); return; }
  for (const sp of ['run', 'bike', 'swim'].filter(s => !sportAllowed(profile, s))) {
    const m = SPORT_WORDS[sp].exec(text);
    if (m) add('coachSport', `${where}: „${m[0]}“ in „${text.replace(/\s+/g, ' ').slice(Math.max(0, m.index - 50), m.index + 60)}“`);
  }
  for (const j of unexplained(text)) add('jargon', `${where}: „${j}“ ohne Erklärung.`);
}
export { JARGON };
