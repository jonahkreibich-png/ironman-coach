/* Plan-Generator (regelbasiert): aus Ziel, Datum, Ausgangsform, Zeitbudget und festen Terminen ein periodisierter Plan
   mit Grundlage, Aufbau, spezifischer Phase und Tapering, dazu Erholungswochen alle 3-4 Wochen.
   Er nutzt dieselben Sicherheitsregeln wie die Anpassung (shared/rules.ts). Ausgabe im bekannten Plan-Format. */
import type { Profile, SportKey } from './profile';
import { ageOf, isMinor } from './profile';
import type { Goal } from './goals';
import { GOALS, legsOf } from './goals';
import { addDays } from './core';
import { validateWeeks, weekMinutes, goalAllowed, isIntense, type Violation } from './rules';
import { HR_ZONES } from './sports';

export type Phase = 'base' | 'build' | 'specific' | 'taper' | 'race';
export interface GenInput {
  profile: Profile;
  goal: Goal;
  today: string;
  /** Trainingsstunden pro Woche der letzten 4-8 Wochen (gemessen oder aus dem Onboarding) */
  currentWeeklyHours?: number | null;
  /** fehlende Schwellen → Einstiegstests in den ersten 2 Wochen */
  needTests?: Partial<Record<'run' | 'bike' | 'swim', boolean>>;
  runIntervalsAllowed?: boolean;
  /** höchstens so viele Wochen ausgeben (der Rest folgt als späterer Block) */
  maxWeeks?: number;
}
export interface GenResult { plan: any; summary: string[]; violations: Violation[]; phases: { phase: Phase; from: string; to: string; weeks: number }[] }

const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const PHASE_LABEL: Record<Phase, string> = { base: 'Grundlage', build: 'Aufbau', specific: 'Wettkampfspezifisch', taper: 'Tapering', race: 'Wettkampfwoche' };
const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
function nextMonday(d: string) { const w = dowOf(d); return addDays(d, w === 1 ? 0 : ((8 - w) % 7)); }

/* Phasen über die verfügbaren Wochen verteilen */
export function phasePlan(nWeeks: number, goalType: string, recoveryEvery: number): { phase: Phase; recovery: boolean }[] {
  const longTaper = /marathon|middle|long|bike_event/.test(goalType) ? 2 : 1;
  const out: { phase: Phase; recovery: boolean }[] = [];
  const race = 1, taper = Math.min(longTaper, Math.max(0, nWeeks - 3));
  const rest = Math.max(1, nWeeks - race - taper);
  const specific = Math.max(1, Math.round(rest * 0.25)), build = Math.max(1, Math.round(rest * 0.35));
  const base = Math.max(0, rest - specific - build);
  const seq: Phase[] = [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(specific).fill('specific'), ...Array(taper).fill('taper'), 'race'];
  let sinceRecovery = 0;
  seq.slice(0, nWeeks).forEach((p, i) => {
    sinceRecovery++;
    const recovery = (p === 'base' || p === 'build' || p === 'specific') && sinceRecovery >= recoveryEvery && i < seq.length - race - taper - 1;
    if (recovery) sinceRecovery = 0;
    out.push({ phase: p, recovery });
  });
  return out;
}

/* Anteil der Sportarten nach Ziel */
function sportShare(goal: Goal, profile: Profile): Partial<Record<SportKey, number>> {
  const sports = new Set(legsOf(goal).map(l => l.sport));
  const group = GOALS[goal.type].group;
  let share: Partial<Record<SportKey, number>>;
  if (goal.type === 'fitness') share = { run: 0.35, bike: 0.35, swim: 0.2 };
  else if (group === 'tri') share = { swim: sports.has('swim') ? 0.2 : 0, bike: sports.has('bike') ? 0.45 : 0, run: sports.has('run') ? 0.35 : 0 };
  else share = { [[...sports][0]]: 0.9 };
  if (profile.sports.includes('strength')) share.strength = 0.08;
  // nur Sportarten, die der Nutzer macht oder die das Ziel braucht
  Object.keys(share).forEach(k => { if (!profile.sports.includes(k as SportKey) && !sports.has(k as SportKey)) delete (share as any)[k]; });
  const sum = Object.values(share).reduce((a, b) => a + (b || 0), 0) || 1;
  Object.keys(share).forEach(k => { (share as any)[k] = (share as any)[k] / sum; });
  return share;
}

interface Slot { date: string; dow: number; maxMin: number; fixed: any[] }

export function generatePlan(inp: GenInput): GenResult {
  const { profile, goal, today } = inp;
  const start = nextMonday(addDays(today, 1));
  const goalDate = goal.date || addDays(start, 7 * 12);
  let nWeeks = Math.max(4, Math.ceil((+new Date(goalDate + 'T12:00:00Z') - +new Date(start + 'T12:00:00Z')) / (7 * 86400000)) + (dowOf(goalDate) === 0 ? 0 : 1));
  nWeeks = Math.min(nWeeks, 60);
  const age = ageOf(profile, today);
  const ageAtRace = profile.birthYear ? +goalDate.slice(0, 4) - profile.birthYear : null;
  const minor = isMinor(profile, today);
  const cautious = profile.medicalCaution || (age != null && age >= 50);
  const recoveryEvery = minor || cautious ? 3 : 4;
  const phases = phasePlan(nWeeks, goal.type, recoveryEvery);
  const share = sportShare(goal, profile);
  const def = GOALS[goal.type];

  // Umfang: Start bei der aktuellen Form, höchstens +10 % (Jugend +8 %) pro Woche bis zum Budget
  const budget = Math.max(2, profile.weeklyHours || 6);
  const peakCap = { tri_supersprint: 6, tri_sprint: 8, tri_olympic: 11, tri_middle: 14, tri_long: 18, run_5k: 6, run_10k: 7, run_half: 8, run_marathon: 10, duathlon: 9, aquathlon: 6, bike_event: 12, swim_goal: 5, fitness: 7 }[goal.type] || 10;
  const peak = Math.min(budget, peakCap) * 60;
  const startMin = Math.min(peak, Math.max(120, (inp.currentWeeklyHours ?? budget * 0.7) * 60 * (cautious ? 0.85 : 1)));
  const inc = minor ? 1.07 : 1.09;
  const volumes: number[] = [];
  let cur = startMin, lastNormal = startMin;
  phases.forEach((p, i) => {
    if (i === 0) { volumes.push(cur); lastNormal = cur; return; }
    if (p.phase === 'race') { volumes.push(Math.round(lastNormal * 0.4)); return; }
    if (p.phase === 'taper') { volumes.push(Math.round(lastNormal * (phases[i + 1] && phases[i + 1].phase === 'taper' ? 0.75 : 0.6))); return; }
    if (p.recovery) { volumes.push(Math.round(lastNormal * 0.65)); return; }
    cur = Math.min(peak, lastNormal * inc);
    volumes.push(Math.round(cur)); lastNormal = cur;
  });

  // Wochentage: Zeitfenster aus dem Profil, sonst Standard (ein Ruhetag Montag)
  const avail = profile.availability || {};
  const hasAvail = Object.keys(avail).length > 0;
  const fixedByDow: Record<number, any[]> = {};
  (profile.fixed || []).forEach(f => { (fixedByDow[f.dow] = fixedByDow[f.dow] || []).push(f); });
  const minutesOf = (dow: number) => {
    if (!hasAvail) return dow === 1 ? 0 : (dow === 0 || dow === 6 ? (profile.maxDayHours || 2.5) * 60 : 75);
    return (avail[dow] || []).reduce((a, w) => a + Math.max(0, toMin(w.to) - toMin(w.from)), 0);
  };

  const weeks: any[] = [];
  let prevSundayHard = false;
  const isHardTitle = (t: string) => /intervall|sweet|schwelle|tempo|test|koppel|spiel/i.test(t);
  phases.forEach((p, wi) => {
    const mon = addDays(start, wi * 7);
    const slots: Slot[] = Array.from({ length: 7 }, (_, i) => { const date = addDays(mon, i); const dow = dowOf(date); return { date, dow, maxMin: Math.min(minutesOf(dow), (profile.maxDayHours || 2.5) * 60), fixed: fixedByDow[dow] || [] }; });
    const total = volumes[wi];
    const sessions: { day: number; s: any }[] = [];
    let id = 0;
    const add = (day: number, s: any) => { sessions.push({ day, s: { id: `g${wi + 1}-${DOW[slots[day].dow].toLowerCase()}-${++id}`, ...s } }); };
    // Feste Termine (z. B. Teamsport) zuerst
    slots.forEach((sl, i) => sl.fixed.forEach(f => add(i, { sport: f.sport, title: f.title, time: f.time, plannedMinutes: f.minutes || 75, description: 'Fester Termin', fixed: true, hard: !!f.hard })));
    const fixedMin = sessions.reduce((a, x) => a + (x.s.plannedMinutes || 0), 0);
    const avail2 = Math.max(0, total - fixedMin * 0.5);
    const raceWeek = p.phase === 'race';
    const plan = buildWeekSessions(p.phase, p.recovery, avail2, share, def.group, goal, inp, wi);
    // Verteilen: lange Einheiten aufs Wochenende, harte nicht nebeneinander, nicht vor/nach festen harten Terminen
    const order = [...plan].sort((a, b) => (b.long ? 2 : b.hard ? 1 : 0) - (a.long ? 2 : a.hard ? 1 : 0) || b.plannedMinutes - a.plannedMinutes);
    const used: number[] = slots.map(() => 0);
    sessions.forEach(x => { used[x.day] += x.s.plannedMinutes || 0; });
    const hardDay = (i: number) => sessions.some(x => x.day === i && (x.s.hard || isHardTitle(x.s.title || '') || isIntense(x.s)));
    for (const s of order) {
      if (raceWeek && s.raceDay) {
        const di = slots.findIndex(sl => sl.date === goalDate);
        if (di >= 0) { add(di, s); used[di] += s.plannedMinutes; continue; }
      }
      const candidates = slots.map((sl, i) => i).filter(i => {
        const free = slots[i].maxMin - used[i];
        if (free < Math.min(s.plannedMinutes, 30)) return false;
        if ((s.hard || isIntense(s)) && (hardDay(i) || hardDay(i - 1) || hardDay(i + 1) || (i === 0 && prevSundayHard))) return false;
        if (sessions.some(x => x.day === i && x.s.sport === s.sport)) return false;
        if (slots[i].date === goalDate && !s.raceDay) return false;
        return true;
      });
      const pref = (i: number) => {
        const dow = slots[i].dow;
        let sc = slots[i].maxMin - used[i];
        if (s.long && (dow === 6 || dow === 0)) sc += s.sport === 'bike' ? (dow === 6 ? 400 : 300) : (dow === 0 ? 400 : 300);
        if (s.sport === 'swim' && dow >= 2 && dow <= 4) sc += 50;
        if (s.raceDay) sc -= 1000;
        return sc;
      };
      candidates.sort((a, b) => pref(b) - pref(a));
      const di = candidates[0];
      if (di == null) continue; // passt nicht: Einheit entfällt diese Woche
      const fit = Math.min(s.plannedMinutes, slots[di].maxMin - used[di]);
      const ss = { ...s, plannedMinutes: round5(fit) };
      if (ss.plannedKm && s.plannedMinutes) ss.plannedKm = Math.round(s.plannedKm * fit / s.plannedMinutes * 10) / 10;
      add(di, ss); used[di] += ss.plannedMinutes;
    }
    const days = slots.map((sl, i) => {
      const list = sessions.filter(x => x.day === i).map(x => { const s = { ...x.s }; delete s.long; delete s.raceDay; delete s.hard; return s; });
      return { date: sl.date, dow: DOW[sl.dow], sessions: list.length ? list : [{ id: `g${wi + 1}-${DOW[sl.dow].toLowerCase()}-rest`, sport: 'rest', title: 'Ruhetag' }] };
    });
    prevSundayHard = days[6].sessions.some((s: any) => isIntense(s));
    weeks.push({
      weekNumber: wi + 1, label: 'Woche ' + (wi + 1), startDate: mon, endDate: addDays(mon, 6), isRecoveryWeek: p.recovery,
      phase: p.phase, focus: p.recovery ? 'Erholung: weniger Umfang, Körper verarbeitet das Training' : focusText(p.phase, def.group), days
    });
  });

  // Umfang in einem Durchgang begrenzen: jede Woche höchstens +10 % (Jugend +8 %) gegenüber der letzten normalen Woche
  enforceVolume(weeks, minor ? 1.08 : 1.10);
  let violations = validateWeeks(weeks, { minor });
  const age2 = goalAllowed(goal.type, ageAtRace);
  if (!age2.ok) violations.push({ rule: 'age', msg: age2.msg! });

  const keyDates = [{ date: goalDate, label: goal.name }];
  weeks.forEach(w => w.days.forEach((d: any) => d.sessions.forEach((s: any) => { if (/test/i.test(s.title)) keyDates.push({ date: d.date, label: s.title }); })));
  const phaseList: GenResult['phases'] = [];
  weeks.forEach(w => { const last = phaseList[phaseList.length - 1]; if (last && last.phase === w.phase) { last.to = w.endDate; last.weeks++; } else phaseList.push({ phase: w.phase, from: w.startDate, to: w.endDate, weeks: 1 }); });
  const shown = inp.maxWeeks ? weeks.slice(0, inp.maxWeeks) : weeks;
  const plan = {
    meta: { generated: true, generatedAt: today, goalId: goal.id, event: goal.name, eventDate: goalDate, blockName: `${goal.name}: ${PHASE_LABEL[shown[0].phase as Phase]}`, runIntervalsAllowed: inp.runIntervalsAllowed ?? !minor, phases: phaseList },
    weeks: shown, keyDates,
    zonePercents: HR_ZONES.map(z => ({ zone: z.zone, label: z.label, low: z.low, high: z.high }))
  };
  return { plan, phases: phaseList, violations, summary: planSummary(plan, inp, phaseList, volumes, share, minor) };
}

function enforceVolume(weeks: any[], maxInc: number) {
  for (let i = 1; i < weeks.length; i++) {
    let j = i - 1; while (j > 0 && weeks[j].isRecoveryWeek) j--;
    for (const sport of [undefined, 'run'] as (string | undefined)[]) {
      const ref = weekMinutes(weeks[j], sport), cur = weekMinutes(weeks[i], sport);
      if (ref < (sport ? 40 : 60) || cur <= ref * maxInc) continue;
      const fixed = weeks[i].days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.fixed && (!sport || s.sport === sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
      const f = Math.max(0.3, (ref * maxInc - fixed) / Math.max(1, cur - fixed));
      weeks[i].days.forEach((d: any) => d.sessions.forEach((s: any) => {
        if (s.fixed || !s.plannedMinutes || (sport && s.sport !== sport)) return;
        const nm = Math.max(5, Math.floor(s.plannedMinutes * f / 5) * 5);
        if (s.plannedKm) s.plannedKm = Math.round(s.plannedKm * nm / s.plannedMinutes * 10) / 10;
        s.plannedMinutes = nm;
      }));
    }
  }
}
function focusText(p: Phase, group: string): string {
  return ({ base: 'Grundlage: viel locker, Technik, Kraft', build: 'Aufbau: Intervalle dazu, lange Einheiten wachsen', specific: group === 'tri' ? 'Wettkampfnah: Koppeltraining und Renntempo' : 'Wettkampfnah: Renntempo üben', taper: 'Tapering: weniger Umfang, kurz und knackig', race: 'Wettkampfwoche: frisch werden' } as Record<Phase, string>)[p];
}

/* Einheiten einer Woche nach Phase. 80 % locker, 20 % hart (polarisiert). */
function buildWeekSessions(phase: Phase, recovery: boolean, total: number, share: Partial<Record<SportKey, number>>, group: string, goal: Goal, inp: GenInput, wi: number): any[] {
  const out: any[] = [];
  const thr = inp.profile.thresholds;
  const runKm = (min: number, f = 1.25) => Math.round(min * 60 / (thr.thresholdPaceRunSec * f) * 10) / 10;
  const bikeKm = (min: number, f = 0.72) => Math.round(min / 60 * thr.thresholdSpeedBikeKmh * f);
  const hardOk = !recovery && phase !== 'race';
  const intensityCount = recovery ? 0 : phase === 'base' ? 1 : phase === 'taper' ? 1 : 2;
  let hardLeft = intensityCount;
  const runAllowed = inp.runIntervalsAllowed ?? !isMinor(inp.profile, inp.today);
  for (const [sport, sh] of Object.entries(share) as [SportKey, number][]) {
    const min = total * sh;
    if (min < 20) continue;
    if (sport === 'strength') { out.push({ sport, title: 'Kraft und Stabi', plannedMinutes: round5(Math.min(40, Math.max(20, min))), description: 'Rumpf, Hüfte, Beine. Saubere Technik vor Gewicht.' }); continue; }
    if (sport === 'run') {
      const long = Math.min(min * 0.4, phase === 'taper' ? 50 : 150);
      out.push({ sport, title: phase === 'race' ? 'Lockerer Lauf mit Steigerungen' : 'Langer Lauf', plannedMinutes: round5(long), plannedKm: runKm(long), zone: 'Zone 2', long: phase !== 'race', description: 'Gleichmäßig locker, du kannst dabei reden.' });
      let rest = min - long;
      if (hardOk && hardLeft > 0 && runAllowed && rest >= 35 && phase !== 'base') {
        const reps = phase === 'specific' ? '4×6 min' : '5×3 min';
        out.push({ sport, title: `Lauf-Intervalle ${reps}`, plannedMinutes: 45, plannedKm: runKm(45, 1.1), zone: 'Zone 4', hard: true, description: `15 min einlaufen, ${reps} an der Schwelle mit 2 min Trabpause, auslaufen.` });
        rest -= 45; hardLeft--;
      }
      while (rest >= 30) { const m = Math.min(55, rest); out.push({ sport, title: phase === 'base' && rest < 60 ? 'Lockerer Lauf mit Steigerungen' : 'Lockerer Lauf', plannedMinutes: round5(m), plannedKm: runKm(m), zone: 'Zone 2', description: 'Locker in Zone 2.' + (phase === 'base' ? ' Am Ende 4 kurze Steigerungen.' : '') }); rest -= m; }
    }
    if (sport === 'bike') {
      const long = Math.min(min * 0.5, phase === 'taper' ? 75 : 330);
      out.push({ sport, title: phase === 'race' ? 'Rad locker mit kurzen Antritten' : 'Lange Ausfahrt', plannedMinutes: round5(long), plannedKm: bikeKm(long), zone: 'Zone 2', long: phase !== 'race', description: 'Gleichmäßig, regelmäßig essen und trinken.' });
      let rest = min - long;
      if (hardOk && hardLeft > 0 && rest >= 45) {
        const step = ['3×8', '3×10', '2×15', '2×20'][Math.min(3, Math.floor(wi / 3))];
        out.push({ sport, title: phase === 'build' || phase === 'base' ? `Rad Sweet Spot ${step}` : 'Rad Schwelle 3×10', plannedMinutes: 60, plannedKm: bikeKm(60, 0.8), zone: 'Zone 3-4', hard: true, description: '15 min einrollen, Intervalle knapp unter der Schwelle, 5 min Pause dazwischen, ausrollen.' });
        rest -= 60; hardLeft--;
      }
      if (group === 'tri' && phase === 'specific' && !recovery && rest >= 50) { out.push({ sport, title: 'Koppeltraining Rad + 15 min Lauf', plannedMinutes: 75, plannedKm: bikeKm(60), zone: 'Zone 2-3', description: 'Rad im Renntempo, danach direkt 15 min laufen.' }); rest -= 75; }
      while (rest >= 40) { const m = Math.min(75, rest); out.push({ sport, title: 'Lockere Radeinheit', plannedMinutes: round5(m), plannedKm: bikeKm(m), zone: 'Zone 2', description: 'Locker, hohe Trittfrequenz.' }); rest -= m; }
    }
    if (sport === 'swim') {
      let rest = min;
      const sess = rest > 100 ? 3 : rest > 50 ? 2 : 1;
      for (let i = 0; i < sess && rest >= 25; i++) {
        const m = Math.min(60, rest / (sess - i));
        const hard = hardOk && hardLeft > 0 && i === 1 && phase !== 'base';
        const meters = Math.round(m * 60 / ((thr.cssSec || 130) + (hard ? 8 : 15)) * 100 / 100) * 100;
        out.push({ sport, title: hard ? 'Schwimmen CSS-Serie' : i === 0 ? 'Schwimmen Technik' : (phase === 'specific' ? 'Schwimmen lange Strecke' : 'Schwimmen Ausdauer'), plannedMinutes: round5(m), plannedKm: Math.round(meters / 100) / 10, zone: hard ? 'Zone 4' : 'Zone 2', hard,
          description: hard ? '300 ein, 8×100 im CSS-Tempo mit 15 s Pause, 200 aus.' : i === 0 ? '300 ein, Technikübungen (Abschlag, Fingerspitzen), 4×100 locker, 200 aus.' : 'Gleichmäßige längere Serien, z. B. 3×400 locker.' });
        if (hard) hardLeft--;
        rest -= m;
      }
    }
  }
  // Einstiegstests in den ersten 2 Wochen, wenn Schwellen fehlen
  if (wi <= 1 && inp.needTests) {
    if (wi === 0 && inp.needTests.run) replaceWith(out, 'run', { sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 50, zone: 'Zone 4', hard: true, description: '15 min einlaufen, 30 min so schnell wie gleichmäßig möglich. Ø-Puls der letzten 20 min = Schwellenpuls, Pace = Schwellen-Pace.' });
    if (wi === 1 && inp.needTests.bike) replaceWith(out, 'bike', { sport: 'bike', title: 'Radtest 20 min', plannedMinutes: 60, zone: 'Zone 4', hard: true, description: '20 min einrollen mit 3 kurzen Antritten, 20 min volle gleichmäßige Leistung. 95 % davon = FTP.' });
    if (wi === 0 && inp.needTests.swim) replaceWith(out, 'swim', { sport: 'swim', title: 'Schwimmtest 400/200 m', plannedMinutes: 45, zone: 'Zone 4', hard: true, description: '400 m ein, 400 m schnell, 5 min locker, 200 m schnell. Daraus berechnet die App deine CSS.' });
  }
  if (phase === 'race') out.push({ sport: [...Object.keys(share)].find(s => s !== 'strength') as SportKey || 'run', title: goal.name, plannedMinutes: Math.round(GOALS[goal.type].hours[1] * 60), description: 'Wettkampf! Viel Erfolg.', raceDay: true });
  return out;
}
function replaceWith(list: any[], sport: string, s: any) {
  const i = list.findIndex(x => x.sport === sport && x.hard);
  const j = i >= 0 ? i : list.findIndex(x => x.sport === sport && !x.long);
  if (j >= 0) list[j] = s; else list.push(s);
}
function toMin(hhmm: string) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : 0; }

/* Der Plan in 5 Sätzen: „Das ist dein Plan, weil …“ */
function planSummary(plan: any, inp: GenInput, phases: GenResult['phases'], volumes: number[], share: Partial<Record<SportKey, number>>, minor: boolean): string[] {
  const g = inp.goal; const n = plan.weeks.length;
  const h = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
  const ph = phases.map(p => `${p.weeks} ${p.weeks === 1 ? 'Woche' : 'Wochen'} ${PHASE_LABEL[p.phase]}`).join(', ');
  const main = Object.entries(share).filter(([k]) => k !== 'strength').sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([k, v]) => `${({ swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', football: 'Teamsport' } as any)[k] || k} ${Math.round((v || 0) * 100)} %`).join(', ');
  const fixed = (inp.profile.fixed || []).map(f => `${DOW[f.dow]} ${f.title}`).join(', ');
  return [
    `Dein Plan führt in ${n} Wochen zu „${g.name}“${g.date ? ` am ${g.date.split('-').reverse().join('.')}` : ''}: ${ph}.`,
    `Du startest mit ${h(volumes[0])} h pro Woche, weil das zu deiner aktuellen Form passt, und steigerst höchstens um ${minor ? 7 : 9} % pro Woche bis ${h(Math.max(...volumes))} h.`,
    `Die Zeit verteilt sich auf ${main}${share.strength ? ', dazu Kraft' : ''}, passend zu deinem Ziel.`,
    `Etwa 80 % sind locker, nur 1-2 Einheiten pro Woche sind hart. Nie zwei harte Tage hintereinander${fixed ? `, deine festen Termine (${fixed}) sind eingeplant` : ''}.`,
    `Alle ${minor || inp.profile.medicalCaution ? 3 : 4} Wochen kommt eine Erholungswoche, vor dem Wettkampf wird der Umfang reduziert, damit du frisch an den Start gehst.`
  ];
}

/* Sauberer Übergang, wenn sich Ziel oder Alltag ändern: vergangene Wochen bleiben, ab nächstem Montag gilt der neue Plan */
export function transitionPlan(oldPlan: any, newPlan: any, today: string): any {
  const keep = (oldPlan && oldPlan.weeks || []).filter((w: any) => w.endDate < nextMonday(addDays(today, 1)));
  const offset = keep.length;
  const weeks = [...keep, ...newPlan.weeks.map((w: any, i: number) => ({ ...w, weekNumber: offset + i + 1, label: 'Woche ' + (offset + i + 1) }))];
  return { ...newPlan, weeks, meta: { ...newPlan.meta, previousBlock: oldPlan && oldPlan.meta && oldPlan.meta.blockName } };
}
export { weekMinutes };
