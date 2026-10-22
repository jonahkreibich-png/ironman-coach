/* Sicherheitsregeln, stärker als jeder Vorschlag (Plan-Generator, Plan-Code, KI-Coach, automatische Anpassung):
   - Umfang höchstens +10 % pro Woche (Minderjährige +8 %), Laufumfang ebenso
   - keine zwei harten Tage hintereinander (ein Spiel zählt als hart)
   - nach Krankheit gilt der Stufenplan (keine Intensität in den ersten Tagen)
   - Altersregeln: Minderjährige keine Distanzen über ihrer Altersgrenze, höchstens zwei harte Einheiten pro Woche
   Jeder Verstoß kommt mit einer Erklärung in einfachen Worten. */
import { isGame, isIntervals, plannedLoad, addDays, illnessAt, returnStageActive } from './core';

/* Hart = Intensität (Intervalle, Tests, Spiel, Koppeltraining im Renntempo). Lange lockere Einheiten zählen nicht als hart. */
export function isIntense(s: any): boolean {
  if (!s || s.cancelled) return false;
  if (/Kraul-Check/i.test(s.title || '') && !s.hard) return false;
  if (/koppel/i.test(s.title || '') && (s.plannedMinutes || 0) <= 20 && !s.hard) return false;
  return isIntervals(s) || isGame(s) || !!s.hard || /test\b|koppel|wettkampf/i.test(s.title || '');
}

export interface Violation { rule: 'volume' | 'runVolume' | 'hardDays' | 'illness' | 'age' | 'hardCount' | 'format'; week?: number; date?: string; msg: string }
export interface RuleCtx { minor?: boolean; age?: number | null; illness?: any[]; today?: string; maxHardPerWeek?: number; /** eigener Aufbau-Rhythmus (profile.progressionOf), höchstens 10 */ maxIncPct?: number }

export function weekMinutes(w: any, sport?: string): number {
  return (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && (!sport || s.sport === sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || (s.sport === 'football' ? 75 : 0)), 0), 0);
}
/* eigenes Training einer Woche: ohne Teamsport und Wettkämpfe (feste Termine, die nicht „steigen“) */
export function ownWeekMinutes(w: any): number {
  return (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && s.sport !== 'football' && !s.race && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
}
/* Umfang einer Woche (eigenes Training) und Veränderung zur letzten Aufbauwoche davor (nicht Erholung) */
export function weekVolume(weeks: any[], i: number): { min: number; refMin: number | null; pct: number | null; refWeek: number | null } {
  const w = weeks[i]; if (!w) return { min: 0, refMin: null, pct: null, refWeek: null };
  const min = ownWeekMinutes(w);
  let j = i - 1; while (j >= 0 && (weeks[j].isRecoveryWeek || ownWeekMinutes(weeks[j]) <= 0)) j--;
  if (j < 0) return { min, refMin: null, pct: null, refWeek: null };
  const refMin = ownWeekMinutes(weeks[j]);
  return { min, refMin, pct: Math.round((min / refMin - 1) * 100), refWeek: weeks[j].weekNumber ?? null };
}
export function weekLoad(w: any): number {
  return (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).reduce((b: number, s: any) => b + plannedLoad(s), 0), 0);
}

/* Prüft eine Folge von Wochen. prevWeeks: Wochen davor (für den Vergleich der ersten Woche). */
export function validateWeeks(weeks: any[], ctx: RuleCtx = {}, prevWeeks: any[] = []): Violation[] {
  const out: Violation[] = [];
  const maxInc = ctx.maxIncPct ? 1 + Math.min(10, ctx.maxIncPct) / 100 : ctx.minor ? 1.08 : 1.10;
  const all = [...prevWeeks, ...weeks];
  const firstNew = prevWeeks.length;
  // Umfang: gegen die letzte normale Woche (nach einer Erholungswoche zählt die Woche davor)
  for (let i = Math.max(1, firstNew); i < all.length; i++) {
    const w = all[i];
    // Auftrag 17: eine Woche mit Lauftest (statt langem Lauf) ist auch für den Gesamtumfang kein Bezug
    const runTest = (x: any) => (x.days || []).some((d: any) => (d.sessions || []).some((s: any) => s && s.sport === 'run' && /^Lauftest/.test(s.title || '')));
    let j = i - 1; while (j > 0 && (runTest(all[j]) || all[j].isRecoveryWeek || all[j].reduced || all[j].entry || all[j].partial || all[j].phase === 'taper' || all[j].phase === 'race' || (all[j].races || []).length)) j--;
    // Wiedereinstieg nach Krankheit: niedriger als die Woche davor, keine Steigerung zu prüfen; angebrochene Woche (Plan ab heute) ebenso
    if (w.entry || w.partial || all[j].partial) continue;
    const ref = all[j];
    // eigenes Training (Teamsport ist ein fester Termin und steigt nicht)
    const refMin = ownWeekMinutes(ref), cur = ownWeekMinutes(w);
    // Auftrag 15: bei kleinem Umfang bis +15 min (eine kurze Einheit mehr), sonst +10 % (unter 18 +8 %)
    if (refMin >= 60 && cur > Math.max(refMin * maxInc, refMin + 15) + 5) out.push({ rule: 'volume', week: w.weekNumber, msg: `Woche ${w.weekNumber}: Umfang ${Math.round(cur)} min, das sind ${Math.round((cur / refMin - 1) * 100)} % mehr als ${Math.round(refMin)} min. Erlaubt sind höchstens +${Math.round((maxInc - 1) * 100)} %.` });
    // Laufumfang ohne Wettkampf (der Wettkampf selbst ist keine Steigerung)
    const runOf = (x: any) => (x.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && s.sport === 'run' && !s.race && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
    let jr = j; while (jr > 0 && (runTest(all[jr]) || all[jr].isRecoveryWeek || all[jr].reduced || all[jr].entry || all[jr].phase === 'taper' || all[jr].phase === 'race' || (all[jr].races || []).length)) jr--;
    const refRun = runOf(all[jr]), curRun = runOf(w);
    if (refRun >= 40 && curRun > refRun * maxInc + 5) out.push({ rule: 'runVolume', week: w.weekNumber, msg: `Woche ${w.weekNumber}: Laufumfang steigt um ${Math.round((curRun / refRun - 1) * 100)} %. Laufen verträgt höchstens +${Math.round((maxInc - 1) * 100)} % pro Woche.` });
  }
  // Harte Tage
  const days = all.flatMap(w => (w.days || []).map((d: any) => ({ ...d, weekNumber: w.weekNumber }))).sort((a: any, b: any) => a.date.localeCompare(b.date));
  const hard = new Set(days.filter((d: any) => (d.sessions || []).some((s: any) => isIntense(s))).map((d: any) => d.date));
  // feste Termine (Spiel, Wettkampf) liegen nicht in der Hand des Plans: zwei feste harte Tage hintereinander sind kein Planungsfehler
  const onlyFixed = (date: string) => { const d = days.find((x: any) => x.date === date); return !!d && (d.sessions || []).filter((s: any) => isIntense(s)).every((s: any) => s.fixed || s.race); };
  const newDates = new Set(weeks.flatMap(w => (w.days || []).map((d: any) => d.date)));
  for (const d of days) {
    if (!newDates.has(d.date) || !hard.has(d.date)) continue;
    if (hard.has(addDays(d.date, 1)) && !(onlyFixed(d.date) && onlyFixed(addDays(d.date, 1)))) out.push({ rule: 'hardDays', date: d.date, msg: `${fmt(d.date)} und ${fmt(addDays(d.date, 1))} sind beide hart. Zwischen zwei harten Tagen braucht es einen lockeren Tag.` });
  }
  // Krankheit und Wiedereinstieg: keine Intensität
  if (ctx.illness && ctx.illness.length) {
    for (const d of days) {
      if (!newDates.has(d.date)) continue;
      const sick = illnessAt(ctx.illness, d.date), ret = returnStageActive(ctx.illness, d.date);
      if ((sick || ret) && (d.sessions || []).some((s: any) => s && !s.cancelled && isIntervals(s))) out.push({ rule: 'illness', date: d.date, msg: `${fmt(d.date)}: ${sick ? 'Während der Krankheit' : 'Im Wiedereinstieg nach Krankheit'} keine Intervalle. Erst die Stufen locker durchlaufen.` });
    }
  }
  // Harte Einheiten pro Woche
  const maxHard = ctx.maxHardPerWeek ?? (ctx.minor ? 2 : 3);
  for (const w of weeks) {
    const n = (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && !s.cancelled && isIntervals(s)).length, 0);
    if (n > maxHard) out.push({ rule: 'hardCount', week: w.weekNumber, msg: `Woche ${w.weekNumber}: ${n} Intervall-Einheiten. ${ctx.minor ? 'Für Jugendliche' : 'Sinnvoll'} sind höchstens ${maxHard}.` });
  }
  return out;
}
function fmt(d: string) { const p = d.split('-'); return `${p[2]}.${p[1]}.`; }

/* Altersgrenzen für Ziele (grob nach Verbandsregeln) */
export function goalAllowed(type: string, age: number | null): { ok: boolean; msg?: string } {
  const min: Record<string, number> = { run_half: 16, run_marathon: 18, tri_olympic: 16, tri_middle: 18, tri_long: 18 };
  if (age != null && min[type] && age < min[type]) return { ok: false, msg: `Für diese Distanz gilt meist ein Mindestalter von ${min[type]} Jahren. Wähle bis dahin eine kürzere Distanz als Ziel, die lange Strecke kann ein Ziel für später bleiben.` };
  return { ok: true };
}
