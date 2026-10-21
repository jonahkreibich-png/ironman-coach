/* Intensität als feste Regel (Auftrag 14, für jeden Plan): Prüfung und Korrektur.
   - Niveau: Einsteiger (unter 1 Jahr oder noch keine 30 min am Stück), Fortgeschrittene (1-3 Jahre), Erfahrene (ab 3 Jahren).
   - Harte Einheiten pro Woche: Einsteiger 1, Fortgeschrittene 2, Erfahrene 3 (Grundlage höchstens 2); unter 18 und ab 60 höchstens 2.
     Spiele (Teamsport) und Wettkämpfe zählen als hart.
   - Je Phase und Sportart die passende Intensität (Grundlage: Steigerungen/Hügelsprints/Fahrtspiel, Sweet Spot, Technik;
     Aufbau: Schwelle, CSS; spezifisch: Wettkampftempo, VO2max; Tapering: kurze, scharfe Reize).
   - Etwa 80 % locker (Zeit in Zone 1-2), nie zwei harte Tage hintereinander, kein Hartes am Tag vor einem Spiel oder Wettkampf,
     keine gleiche Schlüsseleinheit in aufeinanderfolgenden Wochen, Titel passt zur Zone („locker“ = Zone 1-2).
   checkIntensity findet die Fehler, repairIntensity korrigiert den Plan, bevor die Person ihn sieht. */
import type { Profile } from './profile';
import { ageOf } from './profile';
import * as W from './workouts';
import * as K from './keysessions';
import type { GoalType } from './goals';

export type Level = 'beginner' | 'advanced' | 'experienced';
export type IPhase = 'base' | 'build' | 'specific' | 'taper' | 'race';
const HARD_KINDS = new Set(['intervals', 'threshold', 'tempo', 'css', 'sweetspot', 'overunder', 'vo2', 'racepace', 'longq', 'force', 'climb', 'test', 'game', 'race']);
const LIGHT_KINDS = new Set(['hills', 'fartlek']);

export function levelOf(p: Profile): Level {
  const exp = p.experienceYears;
  const cont = (p.skills || {}).runContinuousMin;
  if ((exp != null && exp < 1) || (cont != null && cont < 30 && p.sports.includes('run'))) return 'beginner';
  if (exp == null) return (p.weeklyHours || 0) >= 7 ? 'advanced' : 'beginner';
  return exp >= 3 ? 'experienced' : 'advanced';
}
/* Auftrag 17: sehr erfahren = mindestens 6 Jahre, 18-59 Jahre, viel Zeit und kein Teamsport nebenher */
export function veryExperienced(p: Profile, today: string): boolean {
  const age = ageOf(p, today);
  return levelOf(p) === 'experienced' && (p.experienceYears || 0) >= 6 && (p.weeklyHours || 0) >= 10 && !p.teamSport && (age == null || (age >= 18 && age < 60));
}
/* Auftrag 17: eigene harte Einheiten pro Woche (ohne Spiel und Wettkampf): höchstens 2, Einsteiger 0-1 (in der Grundlage 0),
   sehr Erfahrene bis 3, unter 18 und ab 60 höchstens 2, mit ärztlicher Vorsicht 1. Wettkampfwoche: nur der Wettkampf. */
export function ownHardMax(p: Profile, phase: IPhase, today: string, baseWeek = 0): number {
  const lv = levelOf(p); const age = ageOf(p, today);
  let n = lv === 'beginner' ? (phase === 'base' ? 0 : 1) : veryExperienced(p, today) ? 3 : 2;
  // Grundlage: höchstens 2, sehr Erfahrene ab der 5. Grundlagenwoche 3 (Tempo dazu)
  if (phase === 'base') n = Math.min(n, veryExperienced(p, today) && baseWeek >= 4 ? 3 : 2);
  if (phase === 'taper') n = Math.min(n, 2);
  if (phase === 'race') n = 0;
  if (age != null && (age < 18 || age >= 60)) n = Math.min(n, 2);
  if (p.medicalCaution) n = Math.min(n, 1);
  return n;
}
/* Eigene harte Einheiten bei festen harten Terminen: ein Spiel oder Wettkampf kommt dazu („2 plus Spiel“); ab dem zweiten festen
   harten Tag gibt es je einen eigenen weniger. */
export function ownHardBudget(p: Profile, phase: IPhase, today: string, baseWeek = 0, fixedHard = 0): number {
  return Math.max(0, ownHardMax(p, phase, today, baseWeek) - Math.max(0, fixedHard - 1));
}
/* Höchstzahl harter Tage pro Woche einschließlich der festen harten Termine (Spiele, Wettkämpfe) */
export function maxHard(p: Profile, phase: IPhase, today: string, baseWeek = 0, fixedHard = 0): number {
  return ownHardBudget(p, phase, today, baseWeek, fixedHard) + fixedHard;
}

const kindOf = (s: any): string => (s && s.spec && s.spec.kind) || '';
export function isGameOrRace(s: any): boolean { return !!s && (!!s.race || kindOf(s) === 'game' || (s.sport === 'football' && /(^|[\s:])(spiel|match)\b/i.test(s.title || '') && kindOf(s) !== 'team')); }
/* harte Einheit: Intervalle, Schwelle, Sweet Spot, Wettkampftempo, Test, Spiel, Wettkampf */
export function isHardSession(s: any): boolean {
  if (!s || s.sport === 'rest' || s.cancelled) return false;
  if (isGameOrRace(s)) return true;
  if (/^(Zone 2|Locker) statt/.test(s.title || '')) return false;
  if (s.hard) return true;
  return HARD_KINDS.has(kindOf(s)) && !/Kraul-Check/.test(s.title || '');
}
/* leichte Qualität: Hügelsprints, Fahrtspiel, Steigerungen, Technik im Wasser */
export function isLightQuality(s: any): boolean {
  if (!s || isHardSession(s)) return false;
  const k = kindOf(s);
  if (LIGHT_KINDS.has(k)) return true;
  if (s.sport === 'run' && /Steigerung/.test(JSON.stringify((s.spec && s.spec.steps) || []) + (s.description || ''))) return true;
  if (s.sport === 'swim' && (k === 'technique' || k === 'swimlearn' || (s.spec && s.spec.steps || []).some((x: any) => x.mode === 'drill' || x.mode === 'kick'))) return true;
  return false;
}
/* Minuten in Zone 3 und höher (Spiele und Wettkämpfe ganz) */
export function hardMinutes(s: any): number {
  if (!s || s.sport === 'rest' || s.sport === 'strength' || s.cancelled) return 0;
  if (isGameOrRace(s)) return s.plannedMinutes || 0;
  const sp: W.Spec | undefined = s.spec;
  if (!sp || !sp.steps) return /zone\s*[345]/i.test(s.zone || '') ? (s.plannedMinutes || 0) * 0.5 : 0;
  return sp.steps.filter(x => (x.zone || 0) >= 3 && x.part !== 'warm').reduce((a, x) => a + (sp.sport === 'swim' ? W.stepMinutes(sp, { ...x, restSec: 0 }) : (x.reps || 1) * (x.min || 0)), 0);
}
export function totalMinutes(s: any): number { return !s || s.sport === 'rest' || s.sport === 'strength' || s.cancelled ? 0 : s.plannedMinutes || 0; }

/* Titel gegen Zone: „locker/ruhig/Grundlage/Erholung“ nur mit Zone 1-2, „Schwelle“ Zone 4, „VO2max“ Zone 5 */
export function titleZoneIssue(s: any): string | null {
  if (!s || !s.zone || !['run', 'bike'].includes(s.sport)) return null;
  const z = Math.max(0, ...[...String(s.zone).matchAll(/\d/g)].map(m => +m[0]));
  const t = s.title || '';
  if (/^(Zone 2|Locker) statt/.test(t)) return z > 2 ? `${t}: als locker angepasst, aber ${s.zone}` : null;
  if (/locker|ruhig|grundlage|erholung|regeneration/i.test(t) && z > 2) return `${t}: „locker“ im Titel, aber ${s.zone}`;
  if (/schwelle/i.test(t) && !/mit .*schwelle/i.test(t) && z < 4) return `${t}: Schwelle im Titel, aber ${s.zone}`;
  if (/vo2/i.test(t) && z < 5) return `${t}: VO2max im Titel, aber ${s.zone}`;
  return null;
}

export interface IntensityIssue { rule: 'adjacent' | 'tooMany' | 'missing' | 'share' | 'repeat' | 'titleZone' | 'beforeGame' | 'longRun'; week?: number; date?: string; sport?: string; phase?: string; msg: string }
export interface IntensityStats { level: Level; easyShare: number; byPhase: Record<string, Record<string, { hard: number; light: number; weeks: number }>>; hardPerWeek: number[] }

const days = (weeks: any[]) => weeks.flatMap((w: any) => (w.days || []).map((d: any) => ({ w, d, list: (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled) })));
const normalWeek = (w: any) => !w.isRecoveryWeek && !w.entry && !w.partial && !(w.races || []).length && w.phase !== 'race';
const sig = (s: any) => `${s.sport}:${String(s.title || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()}`;

/* Feste Termine der Person (Teamsport, Wettkampf, eigene feste Einheiten) plant die App nicht: sie zählen als harte Tage,
   aber nicht für den Anteil locker/hart des geplanten Trainings. */
const ownSession = (s: any) => !!s && !s.fixed && !s.race && s.sport !== 'football';
export function intensityStats(weeks: any[], p: Profile): IntensityStats {
  let hard = 0, tot = 0;
  const byPhase: IntensityStats['byPhase'] = {};
  const hardPerWeek: number[] = [];
  for (const w of weeks) {
    const ph = w.phase || 'base';
    const B = (byPhase[ph] = byPhase[ph] || {});
    let hw = 0;
    for (const d of w.days || []) {
      const list = (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
      if (list.some(isHardSession)) hw++;
      for (const s of list) {
        if (ownSession(s)) { hard += hardMinutes(s); tot += totalMinutes(s); }
        if (!['swim', 'bike', 'run'].includes(s.sport) || s.race) continue;
        const e = (B[s.sport] = B[s.sport] || { hard: 0, light: 0, weeks: 0 });
        if (isHardSession(s) && !/test/i.test(s.title || '')) e.hard++; else if (isLightQuality(s)) e.light++;
      }
    }
    for (const sp of ['swim', 'bike', 'run']) if ((w.days || []).some((d: any) => (d.sessions || []).some((s: any) => s && s.sport === sp))) { const e = (B[sp] = B[sp] || { hard: 0, light: 0, weeks: 0 }); e.weeks++; }
    hardPerWeek.push(hw);
  }
  return { level: levelOf(p), easyShare: tot ? 1 - hard / tot : 1, byPhase, hardPerWeek };
}

/* Prüft einen Plan. o.runEasyOnly: keine Lauf-Intensität (Beschwerden), o.runAllowed: Lauf-Intervalle freigegeben */
export interface CheckOpts { goalType?: GoalType; runEasyOnly?: boolean; runAllowed?: boolean; from?: string | null; baseOffset?: number; /** Auftrag 17: Tempo-Teil im langen Lauf erlaubt? */ longQ?: (date: string) => boolean; /** dasselbe gespeichert im Plan: erlaubte Wochen (Montag) */ longQWeeks?: string[] }
const fixedHard = (s: any) => isHardSession(s) && (!!s.fixed || !!s.race || isGameOrRace(s) || /test/i.test(s.title || ''));
/* Tage mit festen harten Terminen (Spiel, Wettkampf, eigener fester harter Termin), ohne Tests */
const fixedHardDays = (w: any) => (w.days || []).filter((d: any) => (d.sessions || []).some((s: any) => s && !s.cancelled && isHardSession(s) && (isGameOrRace(s) || !!s.race || !!s.fixed) && !/test/i.test(s.title || ''))).length;
const mondayOfDate = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const withLongQ = <T extends CheckOpts>(o: T): T => o.longQ || !o.longQWeeks ? o : { ...o, longQ: (d: string) => o.longQWeeks!.includes(mondayOfDate(d)) };
export function checkIntensity(weeks: any[], p: Profile, today: string, o0: CheckOpts = {}): IntensityIssue[] {
  const o = withLongQ(o0);
  const out: IntensityIssue[] = [];
  const D = days(weeks).filter(x => !o.from || x.d.date >= o.from);
  // nie zwei harte Tage hintereinander (zwei feste Termine wie Spiel und Wettkampf kann der Plan nicht ändern)
  for (let i = 1; i < D.length; i++) {
    const a = D[i - 1], b = D[i];
    if (!a.list.some(isHardSession) || !b.list.some(isHardSession)) continue;
    if (a.list.filter(isHardSession).every(fixedHard) && b.list.filter(isHardSession).every(fixedHard)) continue;
    out.push({ rule: 'adjacent', week: b.w.weekNumber, date: b.d.date, msg: `${a.d.date} und ${b.d.date}: zwei harte Tage hintereinander (${a.list.filter(isHardSession).map((s: any) => s.title).join(', ')} / ${b.list.filter(isHardSession).map((s: any) => s.title).join(', ')}).` });
  }
  let bw = o.baseOffset || 0;
  for (const w of weeks) {
    const ph = String(w.phase || 'base').toLowerCase() as IPhase;
    const baseWeek = ph === 'base' ? bw : 0; bw = ph === 'base' ? bw + 1 : 0;
    if (o.from && w.endDate && w.endDate < o.from) continue;
    const hd = (w.days || []).filter((d: any) => (d.sessions || []).some(isHardSession));
    // Tests (meist in der Erholungswoche) und eigene feste Termine erlauben einen harten Tag mehr
    const max = maxHard(p, ph, w.startDate || today, baseWeek, fixedHardDays(w)) + (hd.some((d: any) => (d.sessions || []).some((s: any) => /test/i.test(s.title || '') && isHardSession(s))) ? 1 : 0);
    const flexDays = hd.filter((d: any) => (d.sessions || []).some((s: any) => isHardSession(s) && !fixedHard(s))).length;
    if (hd.length > max && flexDays > 0 && !w.partial) out.push({ rule: 'tooMany', week: w.weekNumber, phase: ph, msg: `Woche ${w.weekNumber}: ${hd.length} harte Tage, passend wären höchstens ${max}.` });
    for (const d of w.days || []) for (const s of d.sessions || []) { const t = titleZoneIssue(s); if (t) out.push({ rule: 'titleZone', week: w.weekNumber, date: d.date, msg: t }); }
  }
  // Auftrag 17: langer Lauf locker; Tempo-Teil nur im Fenster vor einem Laufziel, nicht in zwei Wochen hintereinander, nie zusätzlich zu
  // einem Intervall-Lauf derselben Woche
  let prevLongQ = false;
  for (const w of weeks) {
    if (o.from && w.endDate && w.endDate < o.from) continue;
    const runs = (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && s.sport === 'run' && !s.cancelled && !s.race).map((s: any) => ({ s, d })));
    const lq = runs.filter((x: any) => x.s.spec && x.s.spec.kind === 'longq' && (x.s.long || /^Lang/.test(x.s.title || '')));
    for (const x of lq) {
      if (o.longQ && !o.longQ(x.d.date)) out.push({ rule: 'longRun', week: w.weekNumber, date: x.d.date, msg: `${x.d.date} ${x.s.title}: Tempo im langen Lauf nur in den letzten 8 Wochen vor einem Laufziel und nur jede 2. Woche.` });
      if (runs.some((y: any) => y !== x && isHardSession(y.s) && !/test/i.test(y.s.title || ''))) out.push({ rule: 'longRun', week: w.weekNumber, date: x.d.date, msg: `${x.d.date} ${x.s.title}: Tempo im langen Lauf und dazu ein harter Lauf in derselben Woche.` });
    }
    if (lq.length && prevLongQ) out.push({ rule: 'longRun', week: w.weekNumber, msg: `Woche ${w.weekNumber}: Tempo im langen Lauf zwei Wochen hintereinander.` });
    prevLongQ = lq.length > 0; // Kalenderwochen: jede 2. Woche (eine Erholungswoche dazwischen reicht)
  }
  // Anteil locker (Zeit im geplanten Training): mindestens 75 %
  const st = intensityStats(weeks.filter(w => !o.from || !w.endDate || w.endDate >= o.from), p);
  if (st.easyShare < 0.75) out.push({ rule: 'share', msg: `Nur ${Math.round(st.easyShare * 100)} % locker, passend sind etwa 80 %.` });
  // Gleiche Schlüsseleinheit in aufeinanderfolgenden normalen Wochen
  let prev: Set<string> | null = null;
  for (const w of weeks) {
    if (!normalWeek(w)) { if (w.isRecoveryWeek) prev = null; continue; }
    const cur = new Set<string>((w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => isHardSession(s) && !fixedHard(s)).map(sig)));
    if (prev && !(o.from && w.endDate && w.endDate < o.from)) for (const k of cur) if (prev.has(k)) out.push({ rule: 'repeat', week: w.weekNumber, msg: `Woche ${w.weekNumber}: ${k.slice(k.indexOf(':') + 1)} wie in der Woche davor.` });
    prev = cur;
  }
  // Je Phase und Sportart die passende Intensität. Bedarf je Sportart nach den harten Tagen, die neben Spielen frei bleiben
  // (z. B. Fortgeschrittene mit Spiel: 1 Qualität pro Woche, im Triathlon reihum).
  const segs: { phase: IPhase; weeks: any[] }[] = [];
  for (const w of weeks) { if (o.from && w.endDate && w.endDate < o.from) continue; const last = segs[segs.length - 1]; if (last && last.phase === w.phase) last.weeks.push(w); else segs.push({ phase: w.phase, weeks: [w] }); }
  for (const seg of segs) {
    const norm = seg.weeks.filter(normalWeek);
    if (seg.phase === 'race') continue;
    if (seg.phase === 'taper') {
      const own = seg.weeks.flatMap((w: any) => (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => ownSession(s) && ['run', 'bike', 'swim'].includes(s.sport))));
      const beginner = levelOf(p) === 'beginner';
      void beginner;
      const game = seg.weeks.some((w: any) => (w.days || []).some((d: any) => (d.sessions || []).some((s: any) => isGameOrRace(s) && !s.race)));
      if (!game && own.some((s: any) => !s.stage) && !own.some((s: any) => isHardSession(s) || (isLightQuality(s) && s.sport !== 'swim'))) out.push({ rule: 'missing', phase: 'taper', msg: `Tapering ab ${seg.weeks[0].startDate}: kein kurzer, scharfer Reiz.` });
      continue;
    }
    if (norm.length < 2) continue;
    const sportsIn = ['run', 'bike', 'swim'].filter(sport => {
      const per = norm.map((w: any) => (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && s.sport === sport && !s.cancelled && !/^(Koppel|Wechsel)/.test(s.title || ''))));
      return per.reduce((a: number, l: any[]) => a + l.length, 0) / norm.length >= (sport === 'swim' ? 1.5 : 1.8);
    });
    const games = norm.reduce((a: number, w: any) => a + (w.days || []).filter((d: any) => (d.sessions || []).some((s: any) => fixedHard(s) && !/test/i.test(s.title || ''))).length, 0) / norm.length;
    const free = norm.reduce((a: number, w: any) => { const ds = w.days || []; return a + ds.filter((d: any, k: number) => (d.sessions || []).some((s: any) => ownSession(s) && ['run', 'bike', 'swim'].includes(s.sport))
      && ![ds[k - 1], d, ds[k + 1]].some((x: any) => x && (x.sessions || []).some((s: any) => fixedHard(s) && !/test/i.test(s.title || '')))).length; }, 0) / norm.length;
    // Auftrag 15: mit Spielen und wenigen Tagen gibt es manchmal keinen Tag für Hartes (z. B. nur Sa/So, Spiel am Samstag): dann kein Bedarf
    const budget = Math.min(Math.floor(free + 0.01), ownHardBudget(p, seg.phase, seg.weeks[0].startDate || today, seg.phase === 'base' ? 4 : 0, Math.round(games)));
    for (const sport of sportsIn) {
      const per = norm.map((w: any) => (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && s.sport === sport && !s.cancelled && !/^(Koppel|Wechsel)/.test(s.title || ''))));
      if (sport === 'run' && (o.runEasyOnly || per.flat().some((s: any) => s.stage && s.stage.ladder === 'runwalk'))) continue;
      const hard = per.filter(l => l.some(s => isHardSession(s) && !/test/i.test(s.title || ''))).length;
      const light = per.filter(l => l.some(isLightQuality)).length;
      const learning = sport === 'swim' && per.flat().some((s: any) => s.stage);
      const half = Math.ceil(norm.length / 2);
      const hardSports = sportsIn.filter(x => !(x === 'swim' && seg.phase === 'base') && !(x === 'run' && seg.phase === 'base') && !(x === 'bike' && seg.phase === 'base' && levelOf(p) === 'beginner')).length || 1;
      let needHard = Math.min(half, Math.max(budget > 0 ? 1 : 0, Math.floor(norm.length * Math.min(1, budget / hardSports))));
      // Auftrag 17: Woche mit voll ausgeschöpften harten Tagen (z. B. Rad und Lauf hart): keine weitere harte Einheit nötig (höchstens 2 plus Spiel)
      const full = (w: any) => (w.days || []).filter((d: any) => (d.sessions || []).some((x: any) => x && !x.cancelled && isHardSession(x))).length >= maxHard(p, seg.phase, w.startDate || today, 4, fixedHardDays(w));
      if (seg.phase !== 'base' && sport !== 'run') needHard = Math.min(needHard, norm.filter((w: any, wi: number) => per[wi].some((x: any) => isHardSession(x) && !/test/i.test(x.title || '')) || !full(w)).length);
      // Lauf-Qualität nur, wo sie Platz hat (Lauftag ohne harten Nachbartag; langer Lauf nur im 8-Wochen-Fenster vor einem Laufziel)
      if (sport === 'run' && seg.phase !== 'base') {
        const hardAt = (d: any, ign: any) => !!d && (d.sessions || []).some((x: any) => x !== ign && x && !x.cancelled && isHardSession(x));
        const feasible = norm.filter((w: any, wi: number) => per[wi].some((x: any) => isHardSession(x) && !/test/i.test(x.title || '')) || !full(w) && (w.days || []).some((d: any) => (d.sessions || []).some((x: any) => {
          if (x.sport !== 'run' || x.stage || x.fixed || /^(Koppel|Wechsel)/.test(x.title || '') || (x.plannedMinutes || 0) < 25) return false;
          const i = D.findIndex(y => y.d === d); if (i < 0) return false;
          if (hardAt(D[i - 1] && D[i - 1].d, null) || hardAt(D[i + 1] && D[i + 1].d, null) || hardAt(d, x)) return false;
          const long = !!x.long || /^Lang/.test(x.title || '');
          if (long && o.longQ && !o.longQ(d.date)) return false;
          // muss sich auch wirklich in eine Qualität umwandeln lassen (Dauer, Freigabe)
          if (!flexible(x, o.from, d.date) || isLightQuality(x)) return false;
          const q = qualityFor(x, seg.phase, { ...o, goalType: o.goalType || 'fitness' } as RepairOpts, p, 0, d.date);
          return !!q && isHardSession(q);
        }))).length;
        needHard = Math.min(needHard, feasible);
      }
      if (seg.phase === 'base') {
        if (sport === 'bike' && levelOf(p) === 'beginner') continue;
        const have = sport === 'bike' ? hard : sport === 'run' ? light + hard : light;
        const need = sport === 'bike' ? needHard : half;
        if (have < need) out.push({ rule: 'missing', sport, phase: 'base', msg: `Grundlage ab ${seg.weeks[0].startDate}: ${sport === 'run' ? 'Steigerungen, Hügelsprints oder Fahrtspiel' : sport === 'bike' ? 'Sweet Spot' : 'Technik-Sets'} fehlen (${have} von ${need} Wochen).` });
      } else if (!(sport === 'run' && o.runAllowed === false) && !(sport === 'run' && levelOf(p) === 'beginner' && ((p.skills || {}).runContinuousMin || 0) < 30)) {
        const have = learning ? light : hard; const need = learning ? half : needHard;
        if (have < need) out.push({ rule: 'missing', sport, phase: seg.phase, msg: `${seg.phase === 'build' ? 'Aufbau' : 'Spezifisch'} ab ${seg.weeks[0].startDate}: ${sport === 'run' ? 'Schwellen- bzw. Tempoläufe' : sport === 'bike' ? 'Rad-Schwelle bzw. Wettkampftempo' : learning ? 'Technik-Sets' : 'Schwimm-Intervalle (CSS)'} fehlen (${have} von ${need} Wochen).` });
      }
    }
  }
  return out;
}

/* ---------- Korrektur ---------- */
export interface RepairOpts extends CheckOpts { goalType: GoalType; minor?: boolean; noZ5?: (date: string) => boolean; /** Auftrag 17: Tempo-Teil im langen Lauf erlaubt? */ longQ?: (date: string) => boolean }
const flexible = (s: any, from: string | null | undefined, date: string) => !!s && !!s.spec && !s.adjacentOk && !s.fixed && !s.race && !s.frozen && !s.stage && !/test/i.test(s.title || '') && !isGameOrRace(s) && (!from || date >= from) && ['run', 'bike', 'swim'].includes(s.sport);
const swimRep = (sp: W.Spec) => Math.max(25, ...sp.steps.filter(x => x.mode === 'crawl' || x.mode === 'pull').map(x => x.m || 0));
/* Locker statt hart (gleiche Dauer, höchstens 60 min Lauf bzw. 90 min Rad) */
function easyOf(s: any, phase: string): any {
  const sp: W.Spec = s.spec; const min = s.plannedMinutes || 45;
  // gleiche Dauer wie geplant (der Wochenumfang bleibt), lange Einheiten bleiben lang
  const long = !!s.long || sp.kind === 'longq' || sp.kind === 'long';
  const e = s.sport === 'run' ? (long ? W.runLong(sp.ctx, min) : W.runEasy(sp.ctx, min)) : s.sport === 'bike' ? (long ? W.bikeLong(sp.ctx, min) : W.bikeEasy(sp.ctx, min)) : W.swimNormal(sp.ctx, 'endurance', min, phase, swimRep(sp));
  e.why = s.sport === 'swim' ? 'Wassergefühl und Grundlage, ohne müde zu machen.' : 'Grundlage, ohne müde zu machen.';
  const { hard, ...rest } = s;
  return { ...rest, ...W.build(e), id: s.id, checkFix: 'easy' };
}
/* Andere Form derselben Einheit (gleiche Zeit im Hauptteil): 3×12 → 4×10 oder 2×18 */
function variantOf(s: any, avoid: Set<string>): any | null {
  const sp: W.Spec = JSON.parse(JSON.stringify(s.spec));
  const q = sp.steps.find(x => x.part === 'main' && (x.zone || 0) >= 3);
  if (!q) return null;
  const r = q.reps || 1;
  // Schwimmen: nie längere Stücke als bisher (Können), sondern mehr kürzere Stücke oder andere Pausen
  const opts: Partial<W.Step>[] = sp.sport === 'swim' ? ((q.m || 0) >= 100 ? [{ m: 50, reps: r * 2 }] : [{ reps: r + 2, restSec: Math.max(15, (q.restSec || 30) - 10) }, { reps: Math.max(2, r - 1), restSec: (q.restSec || 30) + 10 }])
    : [{ reps: r + 1, min: Math.max(1, Math.round((q.min || 0) * r / (r + 1))) }, { reps: Math.max(1, r - 1), min: Math.round((q.min || 0) * r / Math.max(1, r - 1)) },
      // ein einzelner Block (z. B. 20 min Wettkampftempo): zwei Stücke mit kurzer Pause, gleiche Gesamtzeit (Auftrag 15)
      { reps: r + 1, min: Math.max(1, Math.round(((q.min || 0) * r - r * (q.restMin || 2)) / (r + 1))) }];
  const base = { ...q };
  for (const o of opts) {
    Object.assign(q, base, o);
    const b = W.build(sp);
    if (b.plannedMinutes > (s.plannedMinutes || 0) + 2) continue;
    if (!avoid.has(sig(b))) return { ...s, ...b, id: s.id, checkFix: 'variant' };
  }
  return null;
}
/* Passende Qualität für eine lockere Einheit (Phase, Ziel, Niveau) */
export function qualityFor(s: any, phase: IPhase, o: RepairOpts, p: Profile, n: number, date: string): any | null {
  const sp: W.Spec = s.spec; const ctx = sp.ctx; const min = s.plannedMinutes || 45;
  const noZ5 = !!(o.noZ5 && o.noZ5(date));
  let q: W.Spec | null = null;
  if (s.sport === 'run') {
    if (phase === 'taper' && (levelOf(p) === 'beginner' || min < 45)) q = W.runEasy(ctx, min, { strides: 4 });
    else if (phase === 'base') q = K.runBaseVariant(ctx, Math.max(30, Math.min(60, min)), n);
    else if (o.runAllowed !== false && !o.runEasyOnly) { const rq = K.runQualityStep(phase, o.goalType, n, !!o.minor, { noZ5, level: levelOf(p), baseWeek: 4 }); if (rq) q = s.long || /^Lang/.test(s.title || '') ? K.longRunWithQuality(ctx, min, rq) : K.runQuality(ctx, rq); }
  } else if (s.sport === 'bike') {
    if (!(phase === 'base' && levelOf(p) === 'beginner')) q = K.bikeKey(ctx, phase as any, o.goalType, n, Math.max(45, Math.min(90, min)), { noZ5 });
  } else if (s.sport === 'swim') {
    const rep = swimRep(sp);
    q = phase === 'base' ? W.swimNormal(ctx, 'technique', min, phase, rep, n) : W.swimNormal(ctx, 'css', min, phase, rep, n);
  }
  if (!q) return null;
  // Dauer wie geplant: zu lang → Hauptteil kürzen; passt es nicht, bleibt die Einheit locker
  for (let k = 0; k < 4 && W.totals(q).min > min + 2; k++) q = W.scaleSpec(q, Math.max(0.5, min / W.totals(q).min));
  if (W.totals(q).min > min + 2) return null;
  // eine harte Einheit unter 30 min (oder mit weniger als 8 min Qualität) ist keine sinnvolle Schlüsseleinheit (Auftrag 15)
  if (W.totals(q).min < 30 && q.kind !== 'hills' && q.kind !== 'fartlek' && q.kind !== 'easy') return null;
  return { ...s, ...W.build(q), id: s.id, checkFix: 'quality' };
}

/* Korrigiert den Plan in festen Schritten (in place) und liefert, was geändert wurde.
   Feste Termine, Tests, Wettkämpfe, Spiele, Lernstufen und Tage vor „from“ bleiben unverändert. */
export function repairIntensity(weeks: any[], p: Profile, today: string, o0: RepairOpts): string[] {
  const o = withLongQ(o0);
  const fixes: string[] = [];
  const hardDay = (d: any) => (d.sessions || []).some((s: any) => s && !s.cancelled && isHardSession(s));
  const setS = (d: any, s: any, nx: any) => { d.sessions = d.sessions.map((x: any) => x === s ? nx : x); };
  // 1) zwei harte Tage hintereinander: die spätere bewegliche Einheit wird locker (sonst die frühere)
  for (let k = 0; k < 3; k++) {
    const all = days(weeks);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i];
      if (!hardDay(a.d) || !hardDay(b.d)) continue;
      const pick = (x: any) => (x.d.sessions || []).find((s: any) => isHardSession(s) && flexible(s, o.from, x.d.date));
      const tgt = pick(b) ? b : pick(a) ? a : null;
      if (!tgt) continue;
      const s = pick(tgt); setS(tgt.d, s, easyOf(s, tgt.w.phase)); fixes.push(`${tgt.d.date}: ${s.title} locker (zwei harte Tage hintereinander)`);
    }
  }
  const fixLongQ = () => {
  // 1b) Auftrag 17: Tempo im langen Lauf außerhalb des Fensters, zwei Wochen hintereinander oder zusätzlich zu einem harten Lauf → locker
  for (let k = 0; k < 2; k++) {
    const iss = checkIntensity(weeks, p, today, o).filter(i => i.rule === 'longRun');
    if (!iss.length) break;
    for (const w of weeks) for (const d of w.days || []) for (const s of [...(d.sessions || [])]) {
      if (!s || s.sport !== 'run' || !s.spec || s.spec.kind !== 'longq' || s.frozen || s.fixed || (o.from && d.date < o.from)) continue;
      if (!iss.some(i => i.date === d.date || (!i.date && i.week === w.weekNumber))) continue;
      setS(d, s, { ...easyOf(s, w.phase), long: true }); fixes.push(`${d.date}: ${s.title} locker (Tempo im langen Lauf nicht passend)`);
    }
  }
  };
  fixLongQ();
  // 2) zu viele harte Tage in einer Woche: zuerst die Sportart, die in der Woche davor schon hart war
  let bw = o.baseOffset || 0; let prevHard = new Set<string>();
  const goalSport = /^run_/.test(o.goalType) ? 'run' : o.goalType === 'bike_event' ? 'bike' : '';
  for (const w of weeks) {
    const ph = String(w.phase || 'base').toLowerCase() as IPhase; const baseWeek = ph === 'base' ? bw : 0; bw = ph === 'base' ? bw + 1 : 0;
    const max = maxHard(p, ph, w.startDate || today, baseWeek, fixedHardDays(w));
    for (let guard = 0; guard < 4 && !w.partial && (w.days || []).filter(hardDay).length > max; guard++) {
      const cands = (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => isHardSession(s) && flexible(s, o.from, d.date)).map((s: any) => ({ d, s })));
      if (!cands.length) break;
      cands.sort((x: any, y: any) => (+prevHard.has(y.s.sport) - +prevHard.has(x.s.sport)) || (+(x.s.sport === goalSport) - +(y.s.sport === goalSport)) || (['swim', 'bike', 'run'].indexOf(x.s.sport) - ['swim', 'bike', 'run'].indexOf(y.s.sport)));
      const { d, s } = cands[0]; setS(d, s, easyOf(s, ph)); fixes.push(`${d.date}: ${s.title} locker (mehr als ${max} harte Tage in der Woche)`);
    }
    prevHard = new Set((w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => isHardSession(s) && !isGameOrRace(s)).map((s: any) => s.sport)));
  }
  // 3) gleiche Schlüsseleinheit wie in der Woche davor: andere Form (nach Schritt 4 noch einmal, Auftrag 15)
  const vary = () => {
    let prev: Set<string> | null = null;
    for (const w of weeks) {
      if (!normalWeek(w)) { if (w.isRecoveryWeek) prev = null; continue; }
      for (const d of w.days || []) for (const s of [...(d.sessions || [])]) {
        if (!prev || !isHardSession(s) || !flexible(s, o.from, d.date) || !prev.has(sig(s))) continue;
        const v = variantOf(s, prev); if (v) { setS(d, s, v); fixes.push(`${d.date}: ${s.title} → ${v.title} (Abwechslung)`); }
      }
      prev = new Set((w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => isHardSession(s) && !isGameOrRace(s)).map(sig)));
    }
  };
  vary();
  // 4) fehlende Intensität je Phase und Sportart: eine lockere Einheit an einem freien Tag wird zur passenden Qualität
  for (let pass = 0; pass < 2; pass++) {
    const miss = checkIntensity(weeks, p, today, o).filter(i => i.rule === 'missing');
    if (!miss.length) break;
    for (const m of miss) {
      // Auftrag 17: nur der Abschnitt, um den es geht (ab dem Datum in der Meldung, gleiche Phase am Stück), nicht alle Wochen dieser Phase
      const segStart = (/ab (\d{4}-\d{2}-\d{2})/.exec(m.msg) || [])[1];
      const i0 = segStart ? weeks.findIndex(w => w.startDate === segStart) : -1;
      let i1 = i0; while (i1 >= 0 && i1 + 1 < weeks.length && weeks[i1 + 1].phase === m.phase) i1++;
      const block = i0 >= 0 ? weeks.slice(i0, i1 + 1) : weeks;
      const seg = block.filter(w => w.phase === m.phase && (m.phase === 'taper' || normalWeek(w)) && (!o.from || !w.endDate || w.endDate >= o.from));
      const AD = days(weeks); let n = 0;
      const light = (m.phase === 'base' && m.sport !== 'bike') || (m.phase === 'taper' && levelOf(p) === 'beginner');
      for (const w of seg) {
        const hasQ = (w.days || []).some((d: any) => (d.sessions || []).some((s: any) => (!m.sport || s.sport === m.sport) && (light ? isLightQuality(s) || isHardSession(s) : isHardSession(s) && !s.race)));
        if (hasQ) { n++; continue; }
        // freier Tag (nicht hart, Nachbartage nicht hart), lockere Einheit der Sportart; als letzte Möglichkeit der lange Lauf (Tempoteil darin)
        const hardExcept = (d: any, ign: any) => (d.sessions || []).some((s: any) => s && s !== ign && !s.cancelled && isHardSession(s));
        const findCand = (allowLong: boolean, ign: any = null): { d: any; s: any; nx: any } | null => {
          for (const d of w.days || []) {
            const i = AD.findIndex(x => x.d === d);
            const near = [AD[i - 1], AD[i + 1]].filter(Boolean);
            if (!light && (hardExcept(d, ign) || near.some(x => hardExcept(x.d, ign)))) continue;
            const s = (d.sessions || []).find((x: any) => (m.sport ? x.sport === m.sport : !(light && x.sport === 'swim')) && flexible(x, o.from, d.date) && !isHardSession(x) && !(isLightQuality(x) && x.sport !== 'swim')
              && (allowLong ? x.sport === 'run' && m.phase !== 'base' && (x.long || /^Lang/.test(x.title || '')) && (!o.longQ || o.longQ(d.date)) : !x.long && !/^Lang/.test(x.title || '')) && (x.plannedMinutes || 0) >= 25);
            if (!s) continue;
            // passt die nächste Stufe der Leiter nicht in die Zeit, dann die erste (kürzere)
            const nx = qualityFor(s, m.phase as IPhase, o, p, n, d.date) || qualityFor(s, m.phase as IPhase, o, p, 0, d.date); if (nx) return { d, s, nx };
          }
          return null;
        };
        let cand: { d: any; s: any; nx: any } | null = null;
        if (!light && (w.days || []).filter(hardDay).length >= maxHard(p, w.phase, w.startDate || today, 4, fixedHardDays(w))) {
          // Woche voll: Tausch mit einer Sportart, die in dieser Phase deutlich öfter hart war (gerechter verteilt)
          const cnt = (sp: string) => seg.filter((x: any) => (x.days || []).some((d: any) => (d.sessions || []).some((s: any) => s.sport === sp && isHardSession(s) && !fixedHard(s)))).length;
          const mine = m.sport ? cnt(m.sport) : 0;
          const other = m.sport ? (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => isHardSession(s) && flexible(s, o.from, d.date) && s.sport !== m.sport && cnt(s.sport) > mine + 1).map((s: any) => ({ d, s })))[0] : null;
          if (!other) continue;
          cand = findCand(false, other.s) || findCand(true, other.s);
          if (!cand) continue;
          setS(other.d, other.s, easyOf(other.s, w.phase)); fixes.push(`${other.d.date}: ${other.s.title} locker (Tausch für ${m.sport === 'run' ? 'Laufen' : m.sport === 'bike' ? 'Rad' : 'Schwimmen'})`);
        } else cand = findCand(false) || findCand(true);
        if (cand) { setS(cand.d, cand.s, cand.nx); n++; fixes.push(`${cand.d.date}: ${cand.s.title} → ${cand.nx.title} (${m.msg.split(':')[0]})`); }
        if (n >= Math.ceil(seg.length / 2) && m.phase !== 'taper') break;
      }
    }
  }
  vary();
  // 5) Anteil locker unter 75 %: die härtesten beweglichen Einheiten lockern
  for (let guard = 0; guard < 6 && intensityStats(weeks.filter(w => !o.from || !w.endDate || w.endDate >= o.from), p).easyShare < 0.75; guard++) {
    const c = days(weeks).flatMap(x => (x.d.sessions || []).filter((s: any) => isHardSession(s) && flexible(s, o.from, x.d.date)).map((s: any) => ({ x, s }))).sort((a, b) => hardMinutes(b.s) - hardMinutes(a.s))[0];
    if (!c) break; setS(c.x.d, c.s, easyOf(c.s, c.x.w.phase)); fixes.push(`${c.x.d.date}: ${c.s.title} locker (zu wenig lockeres Training)`);
  }
  // am Ende noch einmal: spätere Schritte können Tempo in einen langen Lauf gelegt haben
  fixLongQ();
  return fixes;
}
