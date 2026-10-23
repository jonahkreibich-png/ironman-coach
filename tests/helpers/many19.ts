/* Auftrag 19, Punkt 4: großer Test. Für jeden neuen Test-Nutzer (fixtures/users19.ts):
   Fragebogen → Plan → 3 Wochen mit erledigten, abweichenden, ausgelassenen und Extra-Einheiten, Korrekturen → Coach → Profil ändern
   (das alles macht simulate17) → Messdaten passend zur Ausstattung (Uhr, von Hand, Watt, nur Puls) → Scores, Trend, Prognose →
   Verlängerung des Plans wie auf dem Server (jeden Sonntag) → ganzer Plan gegen alle Trainingsregeln (inkl. der neuen aus Auftrag 19). */
import * as C from '../../shared/core';
import { simulate17, KIND17_LABEL } from './many17';
import { KIND_LABEL } from './many-sim';
import { extendPlan } from '../../shared/replan';
import { checkTrainingRules, TRULE_LABEL } from '../../shared/trainingrules';
import { checkIntensity, isHardSession } from '../../shared/intensity';
import { validateWeeks } from '../../shared/rules';
import { sportScores, estimatesAt, legacyActivities } from '../../shared/scores';
import { prognosis } from '../../shared/prognosis';
import { mainGoal } from '../../shared/goals';
import { chosenSports } from '../../shared/sports';
import { isMinor } from '../../shared/profile';
import type { Activity } from '../../shared/activity/analyze';
import type { ManyUser19, Device } from '../../fixtures/users19';

export interface Finding19 { user: string; kind: string; msg: string }
export interface Sim19 { findings: Finding19[]; plan: any; profile: any; goals: any[]; state: any; today: string; rules: Record<string, number>; quality: Record<string, Record<string, number>>; weeks: number }

const rnd = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const BAD_TEXT = /undefined|NaN|\[object|null min|Infinity/;

/* Messdaten wie von der jeweiligen Ausstattung: Uhr (Puls + Tempo), Watt (dazu Leistung auf dem Rad), nur Puls (ohne GPS-Tempo
   draußen: Laufband/Rolle mit Tempo), von Hand (nur Dauer und Gefühl). 8 Wochen vor dem Start plus die 3 simulierten Wochen. */
export function deviceActivities(u: ManyUser19, profile: any, from: string, to: string, state: any): Activity[] {
  const R = rnd(u.id.length * 7919 + u.id.charCodeAt(1));
  const sports = chosenSports(profile).filter(s => s === 'run' || s === 'bike' || s === 'swim');
  const out: Activity[] = [];
  const lthrR = profile.thresholds.lthrRun || 170, lthrB = profile.thresholds.lthrBike || 160;
  const thrRun = profile.thresholds.thresholdPaceRunSec > 0 ? 1000 / profile.thresholds.thresholdPaceRunSec : 3.2;
  const thrBike = profile.thresholds.thresholdSpeedBikeKmh > 0 ? profile.thresholds.thresholdSpeedBikeKmh : 28;
  const css = profile.thresholds.cssSec || 130;
  const dev: Device = u.device;
  let n = 0;
  for (let d = from; d <= to; d = C.addDays(d, 1)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    sports.forEach((sp, k) => {
      if ((dow + k * 2) % 7 > 1 || R() < 0.2) return; // etwa 2× pro Woche und Sportart
      const id = `${u.id}-a${n++}`;
      const base: any = { id, sport: sp, date: d, startMs: Date.parse(d + 'T17:00:00Z'), source: dev === 'manual' ? 'manual' : 'healthfit', sources: [dev === 'manual' ? 'manual' : 'healthfit'], laps: [], indoor: false, name: '' };
      const hard = R() < 0.25;
      const prog = 1 + 0.03 * (Date.parse(d) - Date.parse(from)) / (77 * 864e5); // langsam besser
      if (sp === 'run') {
        const min = hard ? 40 : 35 + Math.round(R() * 40); const frac = hard ? 0.97 : 0.8; const sp_ = thrRun * prog * (hard ? 0.98 : 0.8);
        Object.assign(base, { min, km: Math.round(sp_ * min * 60 / 10) / 100, rpe: hard ? 7 : 3 });
        if (dev !== 'manual') Object.assign(base, { avgHr: Math.round(lthrR * frac), ...(dev === 'hr' ? { indoor: true, name: 'Laufband' } : {}), speedKmh: Math.round(sp_ * 36) / 10, efficiency: Math.round(sp_ * 60 / (lthrR * frac) * 100) / 100 });
      } else if (sp === 'bike') {
        const min = hard ? 60 : 50 + Math.round(R() * 70); const frac = hard ? 0.93 : 0.78; const kmh = thrBike * Math.cbrt(prog) * (hard ? 0.97 : 0.85);
        Object.assign(base, { min, km: Math.round(kmh * min / 60), rpe: hard ? 7 : 3, bikeType: 'road' });
        if (dev !== 'manual') Object.assign(base, { avgHr: Math.round(lthrB * frac), speedKmh: Math.round(kmh * 10) / 10 });
        if (dev === 'power') Object.assign(base, { avgPower: Math.round((profile.thresholds.ftp || 200) * prog * (hard ? 0.9 : 0.65)), name: hard ? 'Sweet Spot' : '' });
        if (dev === 'hr') Object.assign(base, { indoor: true, speedKmh: null, name: 'Rolle' });
      } else {
        const m = 1200 + Math.round(R() * 1000); const pc = Math.round(css / prog + (hard ? 2 : 12));
        Object.assign(base, { min: Math.round(m / 100 * pc / 60) + 6, km: m / 1000, rpe: hard ? 7 : 4 });
        if (dev !== 'manual') base.swim = { poolLengthM: 25, lengths: m / 25, activeLengths: m / 25, pace100: pc, longestContinuousM: hard ? 400 : 200, strokesPerLength: 18, metersPerStroke: 1.1, byStroke: {} };
      }
      out.push(base as Activity);
    });
  }
  void state;
  return out;
}

/* Qualität je Phase und Sportart: harte Einheiten pro Woche (Schnitt) */
export function qualityByPhase(weeks: any[], from: string): Record<string, Record<string, number>> {
  const sum: Record<string, Record<string, number>> = {}, cnt: Record<string, number> = {};
  for (const w of weeks) {
    if (w.endDate < from || w.isRecoveryWeek) continue;
    const ph = w.phase || 'base'; cnt[ph] = (cnt[ph] || 0) + 1; sum[ph] = sum[ph] || {};
    for (const d of w.days) for (const s of d.sessions || []) if (s && !s.cancelled && !s.race && !s.fixed && (s.sport === 'run' || s.sport === 'bike' || s.sport === 'swim') && (isHardSession(s) || (s.spec && s.spec.lib && /swim\.(fast|threshold|css|pyramid|descend|broken)/.test(s.spec.lib.key))))
      sum[ph][s.sport] = (sum[ph][s.sport] || 0) + 1;
  }
  const out: Record<string, Record<string, number>> = {};
  for (const ph of Object.keys(sum)) { out[ph] = {}; for (const sp of Object.keys(sum[ph])) out[ph][sp] = Math.round(sum[ph][sp] / cnt[ph] * 10) / 10; out[ph].weeks = cnt[ph]; }
  return out;
}

export function simulate19(u: ManyUser19, T0: string): Sim19 {
  const F: Finding19[] = []; const add = (kind: string, msg: string) => F.push({ user: u.id, kind, msg });
  const s = simulate17(u, T0, {});
  s.base.forEach(f => add(KIND_LABEL[f.kind], f.msg));
  s.findings.forEach(f => add(KIND17_LABEL[f.kind], f.msg));
  if (!s.plan) return { findings: F, plan: null, profile: s.profile, goals: s.goals, state: s.state, today: s.today, rules: {}, quality: {}, weeks: 0 };
  const T3 = s.today; const profile = s.profile; const goals = s.goals;
  // Messdaten passend zur Ausstattung
  const acts = deviceActivities(u, profile, C.addDays(T0, -56), C.addDays(T3, -1), s.state);
  const state = { ...s.state, activities: Object.fromEntries(acts.map(a => [a.id, a])) };
  // Verlängerung wie auf dem Server: jeden Sonntag, solange der Plan weniger als 6 Wochen voraus reicht
  let plan = s.plan;
  let sun = T3; while (new Date(sun + 'T12:00:00Z').getUTCDay() !== 0) sun = C.addDays(sun, 1);
  for (let k = 0; k < 70; k++) {
    const d = C.addDays(sun, 7 * k);
    let nx: any = null; try { nx = extendPlan(plan, profile, goals, d); } catch (e: any) { add('Verlängerung', `${d}: ${e.message}`); break; }
    if (nx) plan = nx;
    const lastEnd = plan.weeks[plan.weeks.length - 1].endDate;
    if (d > C.addDays(lastEnd, 7)) break;
  }
  // Kürzungen des Coaches in den vergangenen Wochen (Müdigkeit, Krankheit) sind kein neuer Bezug für +10 %: nur Anpassungen ab heute zählen
  const adjNow = Object.fromEntries(Object.entries(state.adjustments || {}).filter(([, a]: any) => !a.date || a.date >= T3));
  const weeks = C.applyAdjustments(plan.weeks, adjNow);
  const g = mainGoal(goals, T3);
  // alle Trainingsregeln über den ganzen Plan (auch die verlängerten Wochen)
  const rules: Record<string, number> = {};
  for (const i of checkTrainingRules(weeks, profile, { goals, today: T3, from: T3, goalType: (g || {} as any).type || null })) { rules[i.rule] = (rules[i.rule] || 0) + 1; add('Regel: ' + TRULE_LABEL[i.rule], i.msg); }
  for (const i of checkIntensity(weeks, profile, T3, { ...(plan.meta.intensityOpts || {}), from: T3 })) add('Intensität', i.msg);
  const i0 = weeks.findIndex((w: any) => w.startDate >= T3);
  // +10 % pro Woche, unter 18 +8 % (je Woche nach dem Alter an diesem Tag)
  if (i0 > 0) for (const minor of [false, true]) for (const v of validateWeeks(weeks.slice(i0), { minor }, weeks.slice(Math.max(0, i0 - 3), i0))) {
    const wn = +((/Woche (\d+)/.exec(v.msg) || [])[1] || 0); const wk = weeks.find((x: any) => x.weekNumber === wn);
    if (minor === !!(wk && isMinor(profile, wk.startDate))) add('Umfang', v.msg);
  }
  // Texte: nie „undefined“, „NaN“ oder leere Werte im Plan
  for (const w of weeks) for (const d of w.days) for (const x of d.sessions || []) if (x && d.date >= T3 && BAD_TEXT.test(`${x.title} ${x.description || ''}`)) add('Text', `${d.date} ${x.title}`);
  // Scores: Werte gültig, Bereich da, Warum ohne kaputte Texte; fehlende Felder senken nie
  try {
    const all = [...acts, ...legacyActivities({ ...state, profile }, plan.weeks, profile)];
    const inp: any = { today: T3, activities: all, trend: state.trend, illness: state.illnessPeriods, profile, goal: g, loadsBySport: {} };
    const sp = (['swim', 'bike', 'run', 'strength'] as any[]).filter(x => chosenSports(profile).includes(x));
    const sc = sportScores(inp, sp.length ? sp : ['run']);
    for (const x of sc) {
      if (!(Number.isFinite(x.score) && x.score >= 1 && x.score <= 120)) add('Score', `${x.sport}: ${x.score}`);
      if (!(x.range >= 1 && x.range <= 30) || !/^± \d+/.test(x.rangeText)) add('Score', `${x.sport}: Bereich ${x.range} „${x.rangeText}“`);
      for (const t of [...x.why, x.confText, ...x.parts.map(p => p.value + ' ' + p.target)]) if (BAD_TEXT.test(t)) add('Score-Text', `${x.sport}: ${t}`);
      if (x.sport !== 'strength') for (let k = 1; k < x.trend.length; k++) if (Math.abs(x.trend[k].score - x.trend[k - 1].score) > 12) add('Score-Sprung', `${x.sport}: ${x.trend[k - 1].score} → ${x.trend[k].score} in einer Woche`);
    }
    // Einheiten ohne Messwerte (nur Dauer) dazu: kein Score darf deshalb sinken
    const empty = sp.filter(x => x !== 'strength').map((x, k) => ({ id: `${u.id}-leer${k}`, sport: x, date: C.addDays(T3, -1), source: 'manual', sources: ['manual'], min: 30, km: null, laps: [] } as any));
    const sc2 = sportScores({ ...inp, activities: [...all, ...empty] }, sp.length ? sp : ['run']);
    for (const x of sc2) { const a = sc.find(y => y.sport === x.sport)!; if (x.score < a.score) add('Score fällt ohne Daten', `${x.sport}: ${a.score} → ${x.score}`); }
    if (g && g.type !== 'fitness') {
      const pg: any = prognosis(g, estimatesAt(inp, T3), { profile, today: T3 });
      if (pg && pg.ok && !(pg.total.low <= pg.total.best && pg.total.best <= pg.total.high)) add('Prognose', JSON.stringify(pg.total));
    }
  } catch (e: any) { add('Score', 'Fehler: ' + e.message); }
  return { findings: F, plan: { ...plan, weeks: plan.weeks }, profile, goals, state, today: T3, rules, quality: qualityByPhase(weeks, T3), weeks: weeks.filter((w: any) => w.endDate >= T3).length };
}
