/* Auftrag 19, Punkt 1c: Bausteine (W.Spec) für die Formen der Einheiten-Bibliothek (shared/workoutlib.ts).
   Vorgaben immer aus den persönlichen Zonen (Pace, Puls, Watt, CSS – workouts.ts schreibt sie in den Text); fehlen Zonen, steht die
   Anstrengung als Gefühl dabei („nur noch einzelne Wörter“). Jede Einheit hat Aufwärmen, Hauptteil und Auslaufen. */
import * as W from './workouts';
import { LIB, libGoal, type LGoal } from './workoutlib';

const S = (part: W.Step['part'], o: Omit<W.Step, 'part'>): W.Step => ({ part, ...o });
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const pick = <T>(list: T[], i: number): T => list[Math.max(0, Math.min(list.length - 1, i))];
const r1 = (x: number) => Math.round(x * 10) / 10;

/* Wettkampftempo je Ziel: Leiter, Zone, Name */
function racePaceOf(goal: LGoal): { lad: [number, number, number][]; zone: number; label: string } {
  if (goal === 'half' || goal === 'middle' || goal === 'fitness') return { lad: [[3, 10, 3], [2, 15, 3], [3, 12, 3], [2, 20, 3]], zone: 3, label: 'Halbmarathon-Tempo' };
  if (goal === 'marathon' || goal === 'long') return { lad: [[2, 30, 5], [3, 25, 5], [2, 40, 5], [3, 30, 5]], zone: 3, label: 'Marathon-Tempo' };
  if (goal === '5k' || goal === 'sprint' || goal === 'aquathlon') return { lad: [[5, 3, 2], [6, 3, 2], [5, 4, 2], [4, 5, 2]], zone: 5, label: '5-km-Tempo' };
  return { lad: [[5, 4, 2], [4, 6, 2], [3, 8, 2], [2, 10, 3]], zone: 4, label: '10-km-Tempo' };
}
const WHY: Record<string, string> = {
  'run.threshold': 'Schwellenläufe heben das Tempo, das du lange halten kannst.',
  'run.tempo': 'Tempodauerlauf: die Schwelle am Stück halten macht dich auf langen Strecken schneller.',
  'run.vo2': 'Kurz und sehr hart: hebt die maximale Sauerstoffaufnahme.',
  'run.hillreps': 'Bergauf hart laufen hebt die Sauerstoffaufnahme mit wenig Stoß auf Sehnen und Gelenke.',
  'run.longhills': 'Lange Anstiege knapp unter der Schwelle bauen Kraftausdauer für lange Rennen auf.',
  'run.pyramid': 'Kurze und längere Stücke in einer Einheit: Abwechslung und Tempogefühl.',
  'run.3030': 'Kurze schnelle Stücke: Einstieg in das Training der maximalen Sauerstoffaufnahme, gut zu dosieren.',
  'run.speed': 'Kurze schnelle Stücke mit voller Pause machen den Schritt ökonomischer und schneller.',
  'run.racepace': 'Wettkampftempo üben: so fühlt sich das Rennen an.',
  'run.fartlek': 'Tempowechsel (Fahrtspiel): zügige Minuten im Wechsel mit lockeren, kontrolliert und ohne Ermüdung.',
  'run.progression': 'Locker beginnen und zum Ende steigern: Tempogefühl, ohne sich zu überfordern.',
  'run.abc': 'Lauf-ABC schult Fußaufsatz, Kniehub und Armarbeit, Steigerungen machen den Schritt schnell.',
  'run.strides': 'Kurze Steigerungen halten die Beine schnell, ohne müde zu machen.',
  'run.hillsprints': 'Hügelsprints machen kräftig und ökonomisch, ohne müde zu machen.',
  'run.longfinish': 'Renntempo auf müden Beinen: die letzten Minuten des langen Laufs im Wettkampftempo.'
};

/* Lauf: Hauptteil der Qualitätsform (für eigene Einheit und für den Qualitätsteil im langen Lauf) */
export interface RunMain { kind: W.Kind; steps: W.Step[]; label: string; why: string; warm: number; cool: number; reps: number; min: number; zone: number; rest: number }
export function runMain(key: string, stage: number, ctx: W.PaceCtx, goal: string | null, o: { noZ5?: boolean; taper?: boolean } = {}): RunMain | null {
  const g = libGoal(goal); const z5 = o.noZ5 ? 4 : 5;
  const why = WHY[key] || (LIB[key] ? LIB[key].purpose : '');
  const pace5 = W.runPace(ctx, 5);
  const distMin = (m: number) => r1(m / 1000 * pace5 / 60);
  const mk = (kind: W.Kind, reps: number, min: number, zone: number, rest: number, note: string, label: string, warm = 15, cool = 10): RunMain =>
    ({ kind, steps: [S('main', { reps, min, zone, restMin: reps > 1 ? rest : undefined, note })], label, why, warm, cool, reps, min, zone, rest });
  switch (key) {
    case 'run.threshold': { const [reps, min, rest] = pick<[number, number, number]>([[3, 8, 2], [3, 10, 2], [2, 15, 3], [1, 20, 0], [1, 25, 0]], stage); return mk('threshold', reps, min, 4, rest, 'an der Schwelle, gleichmäßig, nicht zu schnell anfangen', 'Schwelle'); }
    case 'run.tempo': { const min = pick([15, 20, 25, 30, 35, 40], stage); return mk('threshold', 1, min, 4, 0, 'gleichmäßig an der Schwelle', 'Schwelle'); }
    case 'run.vo2': {
      const st = pick<[number, number, number | null]>([[5, 3, null], [6, 3, null], [8, 0, 400], [5, 4, null], [6, 0, 1000], [12, 0, 400]], stage);
      if (st[2]) return mk('vo2', st[0], distMin(st[2]), z5, st[2] >= 1000 ? 2.5 : 1.5, `${st[2]} m sehr hart, jede Wiederholung gleich schnell`, 'VO2max');
      return mk('vo2', st[0], st[1], z5, st[1], 'sehr hart, aber jede Wiederholung gleich stark', 'VO2max');
    }
    case 'run.hillreps': { const [reps, min] = pick<[number, number]>([[6, 1], [8, 1], [6, 1.5], [8, 1.5], [10, 1.5]], stage); return mk('intervals', reps, min, z5, r1(min * 1.5), 'bergauf hart, im Traben zurück', 'Berg'); }
    case 'run.longhills': { const reps = pick([4, 5, 6], stage); return mk('threshold', reps, 3, 4, 3, 'bergauf gleichmäßig knapp unter der Schwelle, locker zurück', 'Hügel'); }
    case 'run.pyramid': {
      const list = pick([[1, 2, 3, 2, 1], [1, 2, 3, 4, 3, 2, 1]], stage);
      const steps = list.map(m => S('main', { reps: 1, min: m, zone: m >= 3 ? 4 : z5, restMin: Math.max(1, m / 2), note: m === Math.max(...list) ? 'Spitze der Pyramide' : undefined }));
      return { kind: 'intervals', steps, label: 'Pyramide', why, warm: 15, cool: 10, reps: list.length, min: Math.max(...list), zone: 4, rest: 1 };
    }
    case 'run.3030': { const reps = pick([10, 12, 16, 20], stage); return mk('vo2', reps, 0.5, z5, 0.5, '30 s schnell, 30 s locker traben', '30/30'); }
    case 'run.speed': { const reps = pick([8, 10], stage); return mk('vo2', reps, distMin(200), z5, 2, '200 m schnell und locker, gehend zurück (volle Pause)', 'Schnelligkeit'); }
    case 'run.racepace': {
      const rp = racePaceOf(g);
      if (o.taper) { const sh = rp.zone >= 4; return mk('racepace', 4, sh ? 2 : 3, Math.min(rp.zone, o.noZ5 ? 4 : 5), 2, rp.label + ', kurz', rp.label); }
      const [reps, min, rest] = pick(rp.lad, stage);
      return mk('racepace', reps, min, Math.min(rp.zone, z5), rest, rp.label, rp.label);
    }
    case 'run.fartlek': { const [reps, min, rest] = pick<[number, number, number]>([[6, 1, 2], [8, 1, 1], [10, 1, 1], [6, 2, 1]], stage); return mk('fartlek', reps, min, 3, rest, 'zügig, dazwischen locker traben (Fahrtspiel)', 'Tempowechsel', 10, 10); }
    default: return null;
  }
}
/* Lauf-Qualität als eigene Einheit; Gesamtdauer aus Ein-/Auslaufen und Hauptteil (minutes: nur Obergrenze für die Stufe) */
export function runQualitySpec(key: string, stage: number, ctx: W.PaceCtx, goal: string | null, o: { noZ5?: boolean; taper?: boolean; short?: boolean; minutes?: number } = {}): W.Spec | null {
  const m = runMain(key, stage, ctx, goal, o); if (!m) return null;
  const warm = o.short ? Math.min(10, m.warm) : m.warm, cool = o.short ? 5 : m.cool;
  const spec: W.Spec = { sport: 'run', kind: m.kind, ctx, why: m.why, lib: { key, stage, label: m.label },
    steps: [S('warm', { min: warm, zone: 1, note: key === 'run.hillreps' || key === 'run.longhills' ? 'mit 3 Steigerungen, zum Hügel laufen' : 'mit 3 Steigerungen' }), ...m.steps.map(x => ({ ...x })), S('cool', { min: cool, zone: 1, note: 'locker auslaufen' })] };
  // passt die Stufe nicht in die Zeit, eine Wiederholung weniger (nie unter die erste Stufe)
  if (o.minutes) for (let k = 0; k < 6 && W.totals(spec).min > o.minutes + 2; k++) { const q = spec.steps.find(x => x.part === 'main' && (x.reps || 1) > 2); if (!q) break; q.reps = (q.reps || 1) - 1; }
  return spec;
}
/* Lockere Formen mit Technik oder kurzen Reizen (Grundlage, Erholung) */
export function runEasyForm(key: string, stage: number, ctx: W.PaceCtx, minutes: number): W.Spec | null {
  const sp = runEasyForm0(key, stage, ctx, minutes);
  // nie länger als geplant (kurze Läufe: lockerer Lauf mit Steigerungen)
  if (sp && W.totals(sp).min > r5(minutes) + 3) { const e = W.runEasy(ctx, minutes, { strides: 4 }); return { ...e, why: WHY['run.strides'], lib: { key: 'run.strides', stage: 0 } }; }
  return sp;
}
function runEasyForm0(key: string, stage: number, ctx: W.PaceCtx, minutes: number): W.Spec | null {
  const min = r5(minutes);
  const why = WHY[key] || '';
  if (key === 'run.strides') { const sp = W.runEasy(ctx, min, { strides: pick([4, 6, 8], stage) }); return { ...sp, why, lib: { key, stage } }; }
  if (key === 'run.hillsprints') {
    const [reps, sec] = pick<[number, number]>([[6, 10], [8, 12], [8, 15], [10, 15]], stage);
    const hills = S('main', { reps, min: sec / 60, zone: 3, restMin: 1, note: `${sec} s zügig einen steilen Hügel hinauf, langsam zurückgehen (voll erholen)` });
    const wu = min >= 40 ? 10 : 5; const fill = Math.max(10, r5(min - wu - 5 - reps * (sec / 60 + 1)));
    return { sport: 'run', kind: 'hills', ctx, why, lib: { key, stage }, steps: [S('warm', { min: wu, zone: 1, note: 'ganz locker einlaufen' }), S('main', { min: fill, zone: 2 }), hills, S('cool', { min: 5, zone: 1, note: 'locker auslaufen' })] };
  }
  if (key === 'run.abc') {
    if (min < 40) return null;
    const reps = pick([4, 6, 6], stage); const fill = Math.max(10, r5(min - 10 - 10 - 5));
    return { sport: 'run', kind: 'easy', ctx, why, lib: { key, stage }, steps: [S('warm', { min: 10, zone: 1, note: 'ganz locker einlaufen' }), S('main', { min: 10, zone: 1, note: 'Lauf-ABC: Fußgelenksarbeit, Skippings, Anfersen, Hopserlauf, je 2 × 20-30 m' }),
      S('main', { min: fill, zone: 2, note: `am Ende ${reps} Steigerungen über 80 m, dazwischen zurückgehen` }), S('cool', { min: 5, zone: 1, note: 'locker auslaufen' })] };
  }
  if (key === 'run.progression') {
    if (min < 35) return null;
    const core = Math.max(20, min - 15); const z2 = r5(core * 0.6), z3 = r5(core * 0.2), z4 = Math.max(5, core - z2 - z3);
    return { sport: 'run', kind: 'progression', ctx, why, lib: { key, stage }, steps: [S('warm', { min: 10, zone: 1, note: 'ganz locker einlaufen' }), S('main', { min: z2, zone: 2 }), S('main', { min: z3, zone: 3, note: 'etwas schneller' }), S('main', { min: z4, zone: 4, note: 'bis knapp an die Schwelle steigern' }), S('cool', { min: 5, zone: 1, note: 'locker auslaufen' })] };
  }
  if (key === 'run.fartlek') { const sp = runQualitySpec(key, stage, ctx, null); if (!sp) return null; const cool = sp.steps.find(x => x.part === 'cool')!; cool.min = Math.max(5, r5(min - (W.totals(sp).min - (cool.min || 0)))); cool.zone = cool.min > 10 ? 2 : 1; return sp; }
  return null;
}
/* Endbeschleunigung im langen Lauf */
export function longFinish(ctx: W.PaceCtx, minutes: number, stage: number, goal: string | null): W.Spec {
  const rp = racePaceOf(libGoal(goal)); const fin = pick([10, 15, 20], stage);
  const easy = Math.max(15, minutes - 10 - fin - 5);
  return { sport: 'run', kind: 'longq', ctx, why: WHY['run.longfinish'], lib: { key: 'run.longfinish', stage, label: rp.label },
    steps: [S('warm', { min: 10, zone: 1 }), S('main', { min: easy, zone: 2 }), S('main', { min: fin, zone: Math.min(rp.zone, 4), note: rp.label }), S('cool', { min: 5, zone: 1, note: 'locker auslaufen' })] };
}

/* ---------- Rad ---------- */
const BIKE_WHY: Record<string, string> = {
  'bike.sweetspot': 'Sweet Spot hebt die Schwelle, ohne so müde zu machen wie Schwellen-Intervalle.',
  'bike.threshold': 'Schwellen-Intervalle heben das Tempo, das du lange halten kannst.',
  'bike.overunder': 'Over-Unders lehren den Körper, Laktat bei Tempo abzubauen: wichtig für Tempowechsel im Rennen.',
  'bike.vo2': 'Kurz und hart: hebt die maximale Sauerstoffaufnahme, gut für kurze Distanzen.',
  'bike.force': 'Kraftausdauer auf dem Rad: wichtig für Anstiege und lange Strecken.',
  'bike.climb': 'Lange Anstiege üben: Kraft und Tempo an der Schwelle, so wie am Berg im Rennen.',
  'bike.3015': '30/15: viel Zeit nahe der maximalen Sauerstoffaufnahme in kurzen Stücken.',
  'bike.sprints': 'Kurze Sprints wecken die Muskeln, ohne müde zu machen.',
  'bike.cadence': 'Kadenz-Übungen machen den Tritt rund und ökonomisch.',
  'bike.tempolong': 'Das Renntempo der langen Distanz lange halten, mit Essen und Trinken wie im Rennen.',
  'bike.racepaceblocks': 'Renntempo und Ausdauer in einer Einheit, mit Wettkampf-Verpflegung.',
  'bike.tt': 'Renntempo in der Wettkampf-Position: Tempogefühl, Position und Verpflegung.'
};
export function bikeQualitySpec(key: string, stage: number, ctx: W.PaceCtx, goal: string | null, o: { total?: number; noZ5?: boolean } = {}): W.Spec | null {
  const why = BIKE_WHY[key] || (LIB[key] ? LIB[key].purpose : '');
  const g = libGoal(goal); const shortG = ['5k', '10k', 'sprint', 'olympic', 'duathlon', 'aquathlon'].includes(g);
  let reps = 1, min = 10, zone = 3, rest = 4, note = '', kind: W.Kind = 'sweetspot'; const extraSteps: W.Step[] = [];
  switch (key) {
    case 'bike.sweetspot': [reps, min] = pick<[number, number]>([[3, 10], [3, 12], [2, 15], [2, 20], [3, 15], [2, 25], [1, 45]], stage); zone = 3; rest = min >= 15 ? 5 : 4; note = 'gleichmäßig im oberen Bereich von Zone 3 (Sweet Spot), Trittfrequenz 85-95'; kind = 'sweetspot'; break;
    case 'bike.threshold': [reps, min] = pick<[number, number]>([[4, 8], [3, 10], [3, 12], [2, 15], [2, 20]], stage); zone = 4; rest = min >= 15 ? 5 : 4; note = 'an der Schwelle, gleichmäßig, nicht zu schnell anfangen'; kind = 'threshold'; break;
    case 'bike.overunder': [reps, min] = pick<[number, number]>([[3, 6], [3, 9], [4, 9], [3, 12]], stage); zone = 4; rest = 5; note = 'je 2 min knapp unter und 1 min knapp über der Schwelle im Wechsel'; kind = 'overunder'; break;
    case 'bike.vo2': [reps, min] = pick<[number, number]>([[5, 3], [4, 4], [5, 4], [5, 5]], stage); zone = o.noZ5 ? 4 : 5; rest = min; note = 'hart, aber jede Wiederholung gleich stark'; kind = 'vo2'; break;
    case 'bike.force': [reps, min] = pick<[number, number]>([[4, 5], [5, 6], [4, 8], [5, 8], [4, 10], [6, 8]], stage); zone = 3; rest = 3; note = 'niedrige Trittfrequenz 55-65 im Sitzen, Oberkörper ruhig (am Berg oder auf der Rolle)'; kind = 'force'; break;
    case 'bike.climb': [reps, min] = pick<[number, number]>([[5, 3], [6, 4], [5, 5], [8, 4]], stage); zone = 4; rest = min; note = 'am Anstieg knapp unter der Schwelle, Trittfrequenz 70-80 im Sitzen; bergab locker zurück'; kind = 'climb'; break;
    case 'bike.tempolong': [reps, min] = pick<[number, number]>([[2, 30], [2, 40], [2, 50], [2, 60]], stage); zone = 3; rest = 10; note = 'Renntempo der langen Distanz, gleichmäßig, essen und trinken wie im Rennen'; kind = 'racepace'; break;
    case 'bike.tt': min = pick([20, 30, 40], stage); reps = 1; zone = shortG ? 4 : 3; rest = 0; note = 'Renntempo in der Wettkampf-Position (Aero), gleichmäßig'; kind = 'racepace'; break;
    case 'bike.3015': {
      const [sets, n] = pick<[number, number]>([[2, 10], [2, 13], [3, 10], [3, 13]], stage);
      for (let i = 0; i < sets; i++) { extraSteps.push(S('main', { reps: n, min: 0.5, zone: o.noZ5 ? 4 : 5, restMin: 0.25, note: '30 s hart, 15 s locker' })); if (i < sets - 1) extraSteps.push(S('main', { min: 5, zone: 1, note: 'locker zwischen den Sätzen' })); }
      kind = 'vo2'; break;
    }
    default: return null;
  }
  const main = extraSteps.length ? extraSteps : [S('main', { reps, min, zone, restMin: reps > 1 ? rest : undefined, note })];
  const coreOf = () => main.reduce((a, s) => a + (s.reps || 1) * (s.min || 0) + Math.max(0, (s.reps || 1) - 1) * (s.restMin || 0), 0);
  // passt die Stufe nicht in die Zeit: weniger bzw. kürzere Stücke
  if (o.total && !extraSteps.length) { const m0 = main[0]; while ((m0.reps || 1) > 1 && coreOf() + 25 > o.total) m0.reps = (m0.reps || 1) - 1; while ((m0.min || 0) > 5 && coreOf() + 25 > o.total) m0.min = (m0.min || 0) - (kind === 'vo2' ? 1 : 2); }
  const core = coreOf(); const extra = o.total ? Math.max(0, r5(o.total) - core - 25) : 0; const add = Math.round(extra / 2 / 5) * 5;
  return { sport: 'bike', kind, ctx, why, noDistance: !!ctx.indoor, lib: { key, stage },
    steps: [S('warm', { min: 15 + add, zone: 1, note: 'mit 3 kurzen Antritten' }), ...main, S('cool', { min: 10 + Math.max(0, extra - add), zone: extra - add > 5 ? 2 : 1 })] };
}
/* Lockere Rad-Formen: Kadenz-Übungen, Sprints, Rad am Morgen */
export function bikeEasyForm(key: string, stage: number, ctx: W.PaceCtx, minutes: number): W.Spec | null {
  const min = r5(minutes); const why = BIKE_WHY[key] || (LIB[key] ? LIB[key].purpose : '');
  if (key === 'bike.morning') { const sp = W.bikeEasy(ctx, min); sp.why = 'Kurz und locker am Morgen: Grundlage, ohne müde zu machen. Am Spieltag nur Zone 1-2, zählt nicht als hart.'; sp.lib = { key, stage }; return sp; }
  if (key === 'bike.cadence') {
    const reps = pick([4, 5, 6], stage); const fill = Math.max(10, r5(min - 15 - 5 - reps * 3));
    return { sport: 'bike', kind: 'easy', ctx, why, noDistance: !!ctx.indoor, lib: { key, stage }, steps: [S('warm', { min: 15, zone: 1, note: 'locker einrollen' }),
      S('main', { reps, min: 1, zone: 2, restMin: 2, note: 'Spin-up: 100-120 Umdrehungen, Oberkörper ruhig' }), S('main', { min: fill, zone: 2, note: ctx.indoor ? 'darin 4 × 30 s je Bein einbeinig fahren' : 'Trittfrequenz 85-95' }), S('cool', { min: 5, zone: 1, note: 'locker ausrollen' })] };
  }
  if (key === 'bike.sprints') {
    const [reps, sec] = pick<[number, number]>([[6, 10], [8, 12], [8, 15]], stage); const fill = Math.max(10, r5(min - 15 - 5 - reps * 4));
    return { sport: 'bike', kind: 'easy', ctx, why, noDistance: !!ctx.indoor, lib: { key, stage }, steps: [S('warm', { min: 15, zone: 1, note: 'locker einrollen' }),
      S('main', { reps, min: sec / 60, zone: 5, restMin: 4, note: `${sec} s Sprint, dann 4 min ganz locker` }), S('main', { min: fill, zone: 2 }), S('cool', { min: 5, zone: 1, note: 'locker ausrollen' })] };
  }
  return null;
}
/* Renntempo-Blöcke in der langen Ausfahrt */
export function bikeLongBlocks(ctx: W.PaceCtx, minutes: number, stage: number): W.Spec {
  const [reps, min] = pick<[number, number]>([[2, 15], [3, 15], [3, 20], [2, 30]], stage);
  let r = reps; while (r > 1 && r * min + (r - 1) * 10 > minutes - 40) r--;
  const q = r * min + (r - 1) * 10; const easy = Math.max(10, minutes - 15 - q - 10); const before = Math.max(10, r5(easy * 0.5)), after = Math.max(5, easy - before);
  return { sport: 'bike', kind: 'longq', ctx, why: BIKE_WHY['bike.racepaceblocks'], noDistance: !!ctx.indoor, lib: { key: 'bike.racepaceblocks', stage },
    steps: [S('warm', { min: 15, zone: 1 }), S('main', { min: before, zone: 2 }), S('main', { reps: r, min, zone: 3, restMin: r > 1 ? 10 : undefined, note: 'Renntempo, Verpflegung wie im Rennen' }), S('main', { min: after, zone: 2, note: 'locker zu Ende fahren' }), S('cool', { min: 10, zone: 1 })] };
}

/* ---------- Schwimmen ---------- */
/* Zweite Schwimmeinheit der Woche ohne zügige Serien (der harte Teil steckt schon in der ersten): Variante „zügige Bahnen“ wird Technik */
export function noFast(spec: W.Spec): W.Spec {
  const out: W.Spec = JSON.parse(JSON.stringify(spec));
  const before = out.steps.length;
  out.steps = out.steps.filter(s => !(s.part === 'main' && (s.zone || 2) >= 3 && s.mode !== 'drill' && s.mode !== 'kick'));
  if (out.steps.length < before || /zügige Bahnen/.test(out.variant || '')) { out.variant = (out.variant || '').replace('zügige Bahnen', 'Technik'); const d = out.steps.find(s => s.mode === 'drill'); if (d) d.reps = (d.reps || 1) + 2; }
  return out;
}
/* Kurzer harter Teil in einer Schwimmeinheit (Auftrag 19, Punkt 1b): Lernende kurze schnelle Stücke in der eigenen Strecke, ab 200 m am Stück
   Schwellen-Sets, ab 400 m CSS-Intervalle. Die Technik bleibt in jeder Einheit. base: die Einheit wie bisher (Technik, Lernstufe). */
export function swimQuality(key: string, stage: number, base: W.Spec, o: { repMax: number; learner: boolean; minutes?: number }): W.Spec {
  const out: W.Spec = JSON.parse(JSON.stringify(base));
  const gear = (out.ctx && out.ctx.gear) || [];
  // vorhandene zügige Serien (Variante „zügige Bahnen“) ersetzen, damit es nicht doppelt wird
  out.steps = out.steps.filter(s => !(s.part === 'main' && (s.zone || 2) >= 3 && s.mode !== 'drill' && s.mode !== 'kick'));
  const at = Math.max(1, out.steps.findIndex(s => s.part === 'main' && s.mode !== 'drill' && s.mode !== 'kick' && (s.zone || 2) <= 2));
  const ins = (steps: W.Step[]) => { const i = at > 0 && at < out.steps.length ? at : out.steps.length - 1; out.steps.splice(i, 0, ...steps); };
  if (key === 'swim.fast') {
    const reps = pick([6, 8, 10, 12], stage); const m = !o.learner && o.repMax >= 100 && stage >= 2 ? 50 : 25;
    const set: W.Step[] = [S('main', { reps, m, zone: 3, mode: 'crawl', restSec: o.learner ? 45 : 30, note: 'zügig, Technik sauber halten', focus: 'schnell, aber sauber; nach jedem Stück ganz ausatmen' })];
    if (gear.includes('buoy') && o.repMax >= 25) set.push(S('main', { reps: 4, m: 25, zone: 3, mode: 'pull', restSec: 30, note: 'zügig mit Pull Buoy', focus: 'kräftiger Zug, Beine ruhig' }));
    else if (gear.includes('board')) set.push(S('main', { reps: 4, m: 25, zone: 3, mode: 'kick', restSec: 30, focus: 'zügiger Beinschlag aus der Hüfte' }));
    ins(set); out.variant = [out.variant, 'kurze schnelle Stücke'].filter(Boolean).join(', ').replace(/^zügige Bahnen, /, '');
  } else if (key === 'swim.threshold') {
    const [reps, m] = pick<[number, number]>([[8, 50], [10, 50], [6, 100], [8, 100]], stage);
    ins([S('main', { reps, m: Math.min(m, o.repMax), zone: 4, mode: 'crawl', restSec: m >= 100 ? 20 : 15, focus: 'knapp unter der Schwelle, jede Wiederholung gleich schnell' })]); out.kind = 'css';
  } else if (key === 'swim.css') {
    const [reps, m, r] = pick<[number, number, number]>([[8, 100, 15], [10, 100, 15], [5, 200, 20], [3, 300, 20]], stage);
    ins([S('main', { reps, m: Math.min(m, o.repMax), zone: 4, mode: 'crawl', restSec: r, focus: 'genau im CSS-Tempo, gleichmäßig' })]); out.kind = 'css';
  } else if (key === 'swim.pyramid') {
    const list = pick([[100, 200, 100], [100, 200, 300, 200, 100]], stage);
    ins(list.map(m => S('main', { reps: 1, m: Math.min(m, o.repMax), zone: 3, mode: 'crawl', restSec: 20, focus: 'zügig, gleichmäßig' }))); out.variant = [out.variant, 'Pyramide'].filter(Boolean).join(', '); out.kind = 'css';
  } else if (key === 'swim.descend') {
    ins([S('main', { reps: 1, m: 100, zone: 2, mode: 'crawl', restSec: 20, focus: 'Stück 1 ruhig' }), S('main', { reps: 2, m: 100, zone: 3, mode: 'crawl', restSec: 20, focus: 'jedes Stück etwas schneller' }), S('main', { reps: 1, m: 100, zone: 4, mode: 'crawl', restSec: 30, focus: 'das letzte am schnellsten' }),
      ...(stage >= 2 ? [S('main', { reps: 1, m: 400, zone: 3, mode: 'crawl', focus: 'zweite Hälfte schneller als die erste' })] : [])]); out.variant = [out.variant, 'absteigend'].filter(Boolean).join(', '); out.kind = 'css';
  } else if (key === 'swim.broken') {
    const [reps, m] = pick<[number, number]>([[4, 100], [8, 100], [4, 200]], stage);
    ins([S('main', { reps, m: Math.min(m, o.repMax), zone: 4, mode: 'crawl', restSec: 10, focus: 'Wettkampftempo, nur 10 s Pause' })]); out.kind = 'css';
  } else if (key === 'swim.racestart') {
    const reps = pick([4, 6], stage);
    ins([S('main', { reps, m: 50, zone: 5, mode: 'crawl', restSec: 0, focus: 'schneller Start' }), S('main', { reps, m: 100, zone: 3, mode: 'crawl', restSec: 30, focus: 'direkt danach ins Renntempo finden' })]); out.kind = 'css';
  }
  out.lib = { key, stage };
  if (out.variant) out.variant = out.variant.replace(/zügige Bahnen(, )?/, '').replace(/, $/, '') || undefined;
  // Dauer wie geplant: Brust- bzw. lockere Kraul-Wiederholungen anpassen
  if (o.minutes) {
    const easy = out.steps.filter(s => s.part === 'main' && (s.mode === 'breast' || s.mode === 'crawl' || s.mode === 'pull') && (s.zone || 2) <= 2 && (s.reps || 1) > 1);
    for (let k = 0; k < 30 && W.totals(out).min > o.minutes + 3; k++) { const x = easy.filter(s => (s.reps || 1) > 2).sort((a, b) => (b.reps || 1) - (a.reps || 1))[0]; if (!x) break; x.reps = (x.reps || 1) - 1; }
    out.steps = out.steps.filter(s => (s.reps ?? 1) > 0);
  }
  return out;
}
