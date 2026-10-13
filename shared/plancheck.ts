/* Plausibilitäts-Prüfung eines Plans gegen die Angaben der Person (Auftrag 4 C4). Wird in den Tests für alle
   Test-Personen benutzt und beim Bearbeiten des Plans (C5) für freundliche Warnungen.
   Regeln: kein Training über dem Können, Häufigkeit je Sportart wie gewünscht, Tagesdauer innerhalb der Angabe,
   Teamsport-Tage berücksichtigt, Kraft vorhanden wenn gewählt, alle Ziele berücksichtigt, Distanz passt zur
   Beschreibung, höchstens +10 % pro Woche (unter 18 +8 %), keine zwei harten Tage hintereinander. */
import type { Profile, SportKey } from './profile';
import { isMinor, progressionOf } from './profile';
import type { Goal } from './goals';
import { addDays } from './core';
import { validateWeeks, isIntense } from './rules';
import * as W from './workouts';
import { abilityCap, dayCap, freqOf, teamActive } from './plangen';
import { rulesOf, effectsOf, hardViolations, allowedHard, dayLimit } from './constraints';
import { parseFor } from './ruleparse';

export type CheckRule = 'ability' | 'frequency' | 'dayTime' | 'teamSport' | 'strength' | 'goals' | 'distance' | 'volume' | 'hardDays' | 'runVolume' | 'hardCount' | 'illness' | 'age' | 'format' | 'constraint';
export interface CheckIssue { rule: CheckRule; week?: number; date?: string; msg: string }

const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function checkPlan(weeks: any[], profile: Profile, goals: Goal[], today: string, o: { from?: number } = {}): CheckIssue[] {
  const out: CheckIssue[] = [];
  const minor = isMinor(profile, today);
  const rules = rulesOf(profile, parseFor(today));
  const eff = effectsOf(rules);
  const sk = profile.skills || {};
  const swimStart = W.swimLadderStart(sk);
  const runStart = W.runLadderStart(sk.runContinuousMin);
  const strengthWanted = profile.sports.includes('strength') || freqOf(profile, 'strength')[0] > 0;
  const ts = profile.teamSport;
  const first = o.from || 0;

  weeks.forEach((w, wi) => {
    const normal = !w.isRecoveryWeek && w.phase !== 'race' && w.phase !== 'taper' && !(w.races || []).length;
    const count: Partial<Record<SportKey, number>> = {};
    for (const d of w.days || []) {
      const dow = dowOf(d.date);
      const list = (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
      // Tagesdauer (Teamsport und Wettkampf sind feste Termine)
      const own = list.filter((s: any) => !s.fixed && !s.race).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
      const cap = dayCap(profile, dow);
      if (own > cap + 5 && !list.some((s: any) => s.race)) out.push({ rule: 'dayTime', week: w.weekNumber, date: d.date, msg: `${d.date}: ${own} min geplant, angegeben sind höchstens ${cap} min.` });
      for (const s of list) {
        if (!s.race && !s.replaces) count[s.sport as SportKey] = (count[s.sport as SportKey] || 0) + 1;
        // Können
        const spec: W.Spec | undefined = s.spec;
        if (s.sport === 'swim' && spec) {
          const crawl = spec.steps.filter(st => st.mode === 'crawl').map(st => st.m || 0);
          const maxCrawl = crawl.length ? Math.max(...crawl) : 0;
          if (sk.swimCrawl === 'no' && maxCrawl > 25 && !(swimStart && swimStart.n >= 3)) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: ${maxCrawl} m Kraul am Stück, obwohl noch nicht gekrault werden kann.` });
          if (sk.swimCrawl === 'no' && swimStart && swimStart.n < 2 && maxCrawl > 0) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: Kraul-Strecken vor Wassergewöhnung und Technik.` });
          if ((sk.swimCrawl === 'some' || (sk.swimCrawl === 'yes' && sk.swimCrawlM)) && sk.swimCrawlM != null && maxCrawl > Math.max(25, sk.swimCrawlM) * 1.0 + 1 && wi < 2) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: ${maxCrawl} m Kraul am Stück, geschafft werden bisher ${sk.swimCrawlM} m.` });
        }
        if (s.sport === 'run' && spec && !s.race) {
          const cont = Math.max(0, ...spec.steps.filter(st => st.part === 'main').map(st => st.min || 0));
          const cap2 = abilityCap(profile, 'run', wi + first);
          if (runStart != null && spec.steps.some(st => st.part === 'main' && !st.walkMin && (st.min || 0) > W.RUNWALK_LADDER[runStart].run + 0.1)) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: ${cont} min am Stück, möglich sind bisher ${sk.runContinuousMin} min.` });
          else if (cap2 != null && !s.stage && s.plannedMinutes > cap2 + 5) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: ${s.plannedMinutes} min, passend wären höchstens etwa ${cap2} min.` });
          if (eff.runEasyOnly && isIntense(s) && !s.race && !/test/i.test(s.title)) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: Lauf-Intensität trotz Beschwerden.` });
        }
        if (s.sport === 'bike' && !s.race) {
          const cap2 = abilityCap(profile, 'bike', wi + first);
          if (cap2 != null && s.plannedMinutes > cap2 + 5) out.push({ rule: 'ability', week: w.weekNumber, date: d.date, msg: `${s.title}: ${s.plannedMinutes} min Rad, längste Fahrt bisher ${sk.bikeLongestMin} min.` });
        }
        // Distanz passt zur Beschreibung (A6)
        out.push(...checkSession(s, w.weekNumber, d.date));
      }
      // Teamsport
      if (ts && teamActive(ts, d.date)) {
        if (ts.trainingDays.includes(dow) && !list.some((s: any) => s.sport === 'football') && !list.some((s: any) => s.race)) out.push({ rule: 'teamSport', week: w.weekNumber, date: d.date, msg: `${d.date}: ${ts.name || 'Teamsport'}-Training fehlt.` });
        if (ts.gameDays.includes(dow)) {
          const prev = (w.days || []).find((x: any) => x.date === addDays(d.date, -1));
          if (prev && prev.sessions.some((s: any) => s && !s.cancelled && isIntense(s) && s.sport !== 'football')) out.push({ rule: 'teamSport', week: w.weekNumber, date: prev.date, msg: `${prev.date}: harte Einheit am Tag vor dem Spiel.` });
        }
      }
      if (!ts && list.some((s: any) => s.sport === 'football')) out.push({ rule: 'teamSport', week: w.weekNumber, date: d.date, msg: `${d.date}: Teamsport im Plan, obwohl keiner angegeben ist.` });
      // Kraft nicht direkt vor harten Tagen
      if (list.some((s: any) => s.sport === 'strength')) {
        const next = (w.days || []).find((x: any) => x.date === addDays(d.date, 1)) || (weeks[wi + 1] && weeks[wi + 1].days[0].date === addDays(d.date, 1) ? weeks[wi + 1].days[0] : null);
        if (next && next.sessions.some((s: any) => s && !s.cancelled && (s.race || /spiel/i.test(s.title || '') || isIntense(s)))) out.push({ rule: 'strength', week: w.weekNumber, date: d.date, msg: `${d.date}: Kraft direkt vor einem harten Tag.` });
      }
    }
    // Häufigkeit je Sportart
    for (const sp of ['run', 'bike', 'swim', 'strength'] as SportKey[]) {
      const f = (profile.freq || {})[sp]; if (!f) continue;
      const n = count[sp] || 0;
      if (n > f[1]) out.push({ rule: 'frequency', week: w.weekNumber, msg: `Woche ${w.weekNumber}: ${n}× ${sp}, gewünscht höchstens ${f[1]}×.` });
      const blocked = sp === 'swim' && (eff.noSwim || (eff.noSwimMonths && eff.noSwimMonths.includes(+w.startDate.slice(5, 7))));
      // Wunsch-Häufigkeit nur so weit, wie die harten Regeln Tage erlauben (sonst meldet der Plan einen Konflikt)
      const can = (w.days || []).filter((d: any) => dayCap(profile, dowOf(d.date)) > 0 && dayLimit(rules, d.date).cap > 0 && !d.sessions.some((s: any) => s.race) && allowedHard(rules, { sport: sp, place: sp === 'swim' ? 'pool' : undefined }, d.date)).length;
      if (normal && n < Math.min(f[0], can) && !blocked) out.push({ rule: 'frequency', week: w.weekNumber, msg: `Woche ${w.weekNumber}: ${n}× ${sp}, gewünscht mindestens ${f[0]}×.` });
    }
    if (strengthWanted && w.phase !== 'race' && !(count.strength)) out.push({ rule: 'strength', week: w.weekNumber, msg: `Woche ${w.weekNumber}: keine Krafteinheit, obwohl Kraft gewählt ist.` });
    if (!w.headline && !w.target) out.push({ rule: 'goals', week: w.weekNumber, msg: `Woche ${w.weekNumber}: kein Ziel angegeben.` });
  });
  // Alle Ziele im Zeitraum stehen als Wettkampf im Plan
  const lastDate = weeks.length ? weeks[weeks.length - 1].endDate : today;
  const firstDate = weeks.length ? weeks[0].startDate : today;
  for (const g of goals) {
    if (!g.date || g.result || g.date < firstDate || g.date > lastDate) continue;
    const day = weeks.flatMap(w => w.days).find((d: any) => d.date === g.date);
    if (!day || !day.sessions.some((s: any) => s.race && s.goalId === g.id)) out.push({ rule: 'goals', date: g.date, msg: `${g.name} am ${g.date} fehlt im Plan.` });
  }
  // Harte Regeln der Person (Tage, Orte, Zeiträume, Tagesgrenzen)
  hardViolations(weeks, rules).forEach(v => out.push({ rule: 'constraint', date: v.date, msg: v.msg }));
  // Umfang und harte Tage
  validateWeeks(weeks, { minor, maxIncPct: progressionOf(profile, today).incPct }).forEach(v => out.push({ rule: v.rule as CheckRule, week: v.week, date: v.date, msg: v.msg }));
  return out;
}

/* Eine Einheit: Titel, Dauer, Distanz und Beschreibung aus denselben Zahlen? Pace × Distanz ≈ Dauer? */
export function checkSession(s: any, week?: number, date?: string): CheckIssue[] {
  const out: CheckIssue[] = [];
  const bad = (msg: string) => out.push({ rule: 'distance', week, date, msg: `${s.title}: ${msg}` });
  if (!s || s.sport === 'rest' || s.race || s.sport === 'football') return out;
  const spec: W.Spec | undefined = s.spec;
  if (spec) {
    const t = W.totals(spec);
    if (Math.abs(t.min - (s.plannedMinutes || 0)) > 1) bad(`Dauer ${s.plannedMinutes} min, aus den Bausteinen ${t.min} min.`);
    if (t.km != null && s.plannedKm != null && Math.abs(t.km - s.plannedKm) > 0.051) bad(`Distanz ${s.plannedKm} km, aus den Bausteinen ${t.km} km.`);
  }
  const desc = String(s.description || '');
  const total = /Gesamt: (\d+) min(?:, (?:ca\. )?([\d.,]+) (km|m))?/.exec(desc);
  if (total) {
    if (+total[1] !== s.plannedMinutes) bad(`Beschreibung sagt ${total[1]} min, geplant sind ${s.plannedMinutes} min.`);
    if (total[2]) {
      const v = total[3] === 'm' ? +total[2].replace(/\./g, '') / 1000 : +total[2].replace(',', '.');
      if (s.plannedKm == null || Math.abs(v - s.plannedKm) > 0.051) bad(`Beschreibung sagt ${total[2]} ${total[3]}, geplant sind ${s.plannedKm ?? '–'} km.`);
    }
  }
  // „8×50 m“ usw.: Summe der Serien höchstens die Gesamtdistanz
  if (s.sport === 'swim' && s.plannedKm) {
    let sum = 0; const re = /(\d+)×(\d+) m|(?:^|[^×\d])(\d{2,4}) m (?:Kraul|Brust|locker|Lage|Technik|Beinschlag)/g; let m;
    while ((m = re.exec(desc))) sum += m[1] ? +m[1] * +m[2] : +m[3];
    if (sum > s.plannedKm * 1000 + 1) bad(`Serien ergeben ${sum} m, geplant sind ${Math.round(s.plannedKm * 1000)} m.`);
    if (sum && sum < s.plannedKm * 1000 - 1) bad(`Serien ergeben ${sum} m, geplant sind ${Math.round(s.plannedKm * 1000)} m.`);
  }
  // Titel mit Minuten
  const tm = /(?<![×\d])(\d+) min\b(?!\))/.exec(String(s.title || '').replace(/\d+×\d+ min/g, ''));
  if (tm && spec && ['easy', 'long', 'recovery', 'strength', 'brick'].includes(spec.kind) && !/Wechsel-Lauf/.test(s.title) && +tm[1] !== s.plannedMinutes) bad(`Titel sagt ${tm[1]} min, geplant sind ${s.plannedMinutes} min.`);
  // Pace × Distanz ≈ Dauer
  if (s.plannedKm && s.plannedMinutes) {
    const secPerKm = s.plannedMinutes * 60 / s.plannedKm;
    if (s.sport === 'run' && (secPerKm < 150 || secPerKm > 720)) bad(`${pace(secPerKm)}/km passt nicht zu Laufen.`);
    if (s.sport === 'bike') { const kmh = s.plannedKm / (s.plannedMinutes / 60); if (kmh < 10 || kmh > 45) bad(`${Math.round(kmh)} km/h passt nicht zu Rad.`); }
    if (s.sport === 'swim') { const per100 = s.plannedMinutes * 60 / (s.plannedKm * 10); if (per100 < 70 || per100 > 420) bad(`${pace(per100)}/100 m passt nicht.`); }
    if (spec && s.sport === 'run' && spec.ctx.runThrSec) {
      const work = spec.steps.filter(st => st.part === 'main' && !st.walkMin);
      if (work.length && work.every(st => (st.reps || 1) === 1)) {
        const expect = W.totals(spec).km!; if (Math.abs(expect - s.plannedKm) > Math.max(0.2, expect * 0.05)) bad('Pace × Distanz ergibt nicht die Dauer.');
      }
    }
  }
  return out;
}
