/* Auftrag 15, Punkt 5: 60 erfundene Test-Nutzer mit großer Bandbreite (keine echten Personen, fester Aufbau, damit Tests wiederholbar sind).
   Alter 14-75, Einsteiger bis Erfahrene; Ziele allgemeine Fitness, Abnehmen ohne Gewichtsziel (Jugendliche), 5 km bis Marathon,
   Super-Sprint bis Langdistanz, Duathlon, Aquathlon, Rad-Event, Schwimmen; alle Sportart-Kombinationen (auch nur eine Sportart, ohne Laufen,
   ohne Rad, ohne Schwimmen), mit und ohne Teamsport/Spiele, wenig und viel Zeit, Kraul ja/ein bisschen/nein, Hilfsmittel, 25/50-m-Becken,
   Verletzungen, ärztliche Vorsicht und eine Krankheit während der 3 simulierten Wochen. */
export const MANY_TODAY = '2026-10-19'; // Montag
export interface ManyUser { id: string; label: string; answers: Record<string, any>; ill?: boolean; teen?: boolean }

type G = { type: string; name: string; weeks: number | null; sports: string[]; why?: string };
const S = ['swim', 'bike', 'run', 'strength'];
/* alle 15 Kombinationen aus Schwimmen, Rad, Laufen, Kraft (auch nur eine Sportart) */
const COMBOS: string[][] = Array.from({ length: 15 }, (_, i) => S.filter((_, k) => (i + 1) & (1 << k)));
const GOALS: G[] = [
  { type: 'run_5k', name: '5-km-Lauf', weeks: 10, sports: ['run'] }, { type: 'run_10k', name: '10-km-Lauf', weeks: 14, sports: ['run', 'strength'] },
  { type: 'run_half', name: 'Halbmarathon', weeks: 18, sports: ['run', 'bike'] }, { type: 'run_marathon', name: 'Marathon', weeks: 26, sports: ['run', 'strength'] },
  { type: 'tri_supersprint', name: 'Super-Sprint', weeks: 12, sports: ['swim', 'bike', 'run'] }, { type: 'tri_sprint', name: 'Sprint-Triathlon', weeks: 20, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'tri_olympic', name: 'Olympisch', weeks: 30, sports: ['swim', 'bike', 'run'] }, { type: 'tri_middle', name: 'Mitteldistanz', weeks: 36, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'tri_long', name: 'Langdistanz', weeks: 48, sports: ['swim', 'bike', 'run'] }, { type: 'duathlon', name: 'Duathlon', weeks: 16, sports: ['run', 'bike'] },
  { type: 'aquathlon', name: 'Aquathlon', weeks: 12, sports: ['swim', 'run'] }, { type: 'bike_event', name: 'Radmarathon', weeks: 22, sports: ['bike'] },
  { type: 'swim_goal', name: '1,5 km Freiwasser', weeks: 16, sports: ['swim'] }
];
const AGES = [14, 15, 16, 17, 19, 23, 27, 31, 36, 41, 45, 49, 53, 57, 61, 65, 68, 71, 73, 75];
const EXP = [0, 0, 0.5, 1, 2, 3, 5, 8, 12, 20];
/* Zeit: wenig (3 kurze Tage) bis viel (6 Tage, lange Wochenenden) */
const TIME: Record<string, number>[] = [
  { 1: 0, 2: 1, 3: 0, 4: 1, 5: 0, 6: 2, 0: 0 }, { 1: 1, 2: 0, 3: 2, 4: 0, 5: 1, 6: 2, 0: 2 }, { 1: 0, 2: 2, 3: 1, 4: 2, 5: 0, 6: 3, 0: 3 },
  { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 3, 0: 3 }, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 0: 1 }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 0: 3 }
];
const INJ = ['keine', 'keine', 'Knie zwickt beim Bergablaufen', 'keine', 'Achillessehne manchmal gereizt', 'Schulter nach Sturz empfindlich', 'keine', 'Rücken manchmal steif'];
const GEAR = [[], ['board'], ['board', 'buoy'], ['buoy', 'fins'], ['board', 'buoy', 'fins', 'paddles', 'snorkel']];
const SUNDAY = (weeks: number) => { const d = new Date(Date.UTC(2026, 9, 19 + weeks * 7)); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

function build(i: number, g: G, sports: string[], o: Partial<{ age: number; team: 0 | 1 | 2; time: number; crawl: string; exp: number; medical: boolean; ill: boolean; pool: string; inj: string; teen: boolean }> = {}): ManyUser {
  const age = o.age ?? AGES[(i * 7) % AGES.length];
  const exp = Math.min(o.exp ?? EXP[(i * 3) % EXP.length], Math.max(0, age - 10));
  const team = o.team ?? (i % 5 === 0 ? 2 : i % 7 === 0 ? 1 : 0); // 2: mit Spielen, 1: ohne Spiele
  const t = TIME[o.time ?? (i % TIME.length)];
  const swim = sports.includes('swim');
  const crawl = swim ? (o.crawl ?? ['no', 'some', 'yes', 'yes', 'yes'][i % 5]) : undefined;
  const hoursNow = [1.5, 2, 3, 4, 5, 6, 8, 10, 'unknown'][(i * 5) % 9];
  const runCont = exp < 1 ? [5, 10, 20, 30][i % 4] : [30, 45, 60, 90, 120][i % 5];
  const a: Record<string, any> = {
    goals: [{ id: 'g' + i, type: g.type, name: g.name, date: g.weeks ? SUNDAY(g.weeks) : null, priority: 'A', timeMode: 'total' }],
    why: g.why || '', birthYear: 2026 - age, sex: i % 2 ? 'f' : 'm', heightCm: 160 + (i % 30), ...(o.teen ? {} : { weightKg: 50 + (i % 40) }),
    injuries: o.inj ?? INJ[i % INJ.length], medical: o.medical ?? (age >= 70 && i % 2 === 0),
    sports, experienceYears: exp, weeklyHoursNow: hoursNow,
    ...(sports.includes('run') ? { runContinuousMin: runCont } : {}),
    ...(sports.includes('bike') ? { bikeLongestMin: [30, 60, 90, 150, 240][i % 5], bikes: [['road'], ['gravel', 'trainer'], ['trekking'], ['road', 'tt', 'trainer'], ['mtb']][i % 5], powerMeter: i % 4 === 0 } : {}),
    ...(swim ? { swimCrawl: crawl, ...(crawl === 'yes' ? { swimCrawlM: [50, 100, 200, 400, 1500][i % 5] } : crawl === 'some' ? { swimCrawlM: 25 } : {}), swimBreast: crawl !== 'yes' ? i % 3 !== 0 : undefined,
      poolM: o.pool ?? (i % 4 === 3 ? '50' : '25'), swimGear: GEAR[i % GEAR.length], openWater: i % 6 === 1, ...(i % 6 === 1 ? { openWaterFrom: '5', openWaterTo: '9' } : {}) } : {}),
    teamYes: team > 0, ...(team > 0 ? { teamName: ['Fußball', 'Handball', 'Volleyball'][i % 3], teamTrainingDays: i % 2 ? [2, 4] : [3], teamTrainingMinutes: 90, teamGames: team === 2, ...(team === 2 ? { teamGameDays: [6], teamGameMinutes: 90 } : {}) } : {}),
    dayLoad: t, notes: i % 9 === 4 ? ['kann mittwochs nicht'] : [], wantTests: i % 3 === 0, sleep: 7 + (i % 3)
  };
  const label = `${age} J., ${g.name}, ${sports.map(s => ({ swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft' } as any)[s]).join('+')}, ${exp} J. Erfahrung${team ? (team === 2 ? ', Teamsport mit Spielen' : ', Teamsport ohne Spiele') : ''}${crawl ? ', Kraul ' + crawl : ''}`;
  return { id: `n${String(i + 1).padStart(2, '0')}-${g.type.replace('_', '-')}`, label, answers: a, ill: o.ill ?? i % 8 === 5, teen: o.teen };
}

export function manyUsers(): ManyUser[] {
  const out: ManyUser[] = [];
  // 1) allgemeine Fitness mit allen 15 Sportart-Kombinationen (darunter Mamas Fall: Rad, Schwimmen, Kraft, kein Laufen)
  COMBOS.forEach((sp, k) => out.push(build(out.length, { type: 'fitness', name: 'Allgemeine Fitness', weeks: null, sports: sp }, sp)));
  // 2) Jugendliche: Abnehmen ohne Gewichtsziel (Fitness, kein Gewicht im Fragebogen)
  for (const [age, sp] of [[14, ['run', 'bike']], [15, ['swim', 'strength']], [16, ['bike']], [17, ['run', 'swim', 'strength']]] as [number, string[]][])
    out.push(build(out.length, { type: 'fitness', name: 'Fitter werden', weeks: null, sports: sp, why: 'abnehmen und fitter werden' }, sp, { age, teen: true, exp: 0 }));
  // 3) alle Wettkampf-Ziele, je zweimal mit unterschiedlichen Sportarten, Zeiten, Alter und Niveau
  for (let r = 0; r < 2; r++) for (const g of GOALS) {
    const extra = r === 1 && !g.sports.includes('strength') ? ['strength'] : [];
    const minus = r === 1 && g.type === 'tri_olympic' ? ['swim'] : []; // Ziel enthält Schwimmen, Person wählt es nicht
    out.push(build(out.length, g, [...g.sports.filter(s => !minus.includes(s)), ...extra].filter((s, k, a) => a.indexOf(s) === k)));
  }
  // 4) Grenzfälle: sehr alt mit Vorsicht, sehr wenig Zeit, nur Wochenende, 50-m-Becken ohne Kraul, viel Zeit und Erfahrung
  out.push(build(out.length, { type: 'fitness', name: 'Beweglich bleiben', weeks: null, sports: ['swim', 'strength'] }, ['swim', 'strength'], { age: 75, medical: true, crawl: 'no', pool: '50' }));
  out.push(build(out.length, { type: 'run_10k', name: '10 km', weeks: 12, sports: ['run'] }, ['run'], { time: 0, age: 44, exp: 1 }));
  out.push(build(out.length, { type: 'tri_sprint', name: 'Sprint', weeks: 24, sports: ['swim', 'bike', 'run'] }, ['swim', 'bike', 'run'], { time: 5, crawl: 'no', exp: 0 }));
  out.push(build(out.length, { type: 'tri_long', name: 'Ironman', weeks: 40, sports: ['swim', 'bike', 'run', 'strength'] }, ['swim', 'bike', 'run', 'strength'], { time: 3, exp: 12, crawl: 'yes', team: 0, age: 38 }));
  out.push(build(out.length, { type: 'bike_event', name: 'Alpenrunde', weeks: 30, sports: ['bike', 'strength'] }, ['bike', 'strength'], { age: 66, team: 2 }));
  out.push(build(out.length, { type: 'swim_goal', name: 'Seequerung', weeks: 20, sports: ['swim'] }, ['swim'], { crawl: 'some', age: 14, teen: true }));
  out.push(build(out.length, { type: 'run_marathon', name: 'Marathon', weeks: 30, sports: ['run', 'bike', 'swim'] }, ['run', 'bike', 'swim'], { time: 3, exp: 6, team: 1 }));
  out.push(build(out.length, { type: 'fitness', name: 'Fit bleiben', weeks: null, sports: ['strength'] }, ['strength'], { age: 58, team: 2 }));
  out.push(build(out.length, { type: 'run_half', name: 'Halbmarathon', weeks: 16, sports: ['run'] }, ['run'], { time: 4, exp: 4, age: 29, ill: true }));
  out.push(build(out.length, { type: 'tri_middle', name: '70.3', weeks: 34, sports: ['swim', 'bike', 'run'] }, ['swim', 'bike', 'run'], { time: 2, age: 52, crawl: 'yes', pool: '50', exp: 8 }));
  out.push(build(out.length, { type: 'duathlon', name: 'Duathlon', weeks: 14, sports: ['run', 'bike', 'strength'] }, ['run', 'bike', 'strength'], { age: 63, team: 1 }));
  // 5) Mamas Angaben (Fitness, Rad + Schwimmen + Kraft, kein Laufen, kein Teamsport, krault ein bisschen), Läufer 6× pro Woche, Urlaub, Teamsport + Triathlon
  const mama = build(out.length, { type: 'fitness', name: 'Allgemeine Fitness', weeks: null, sports: ['bike', 'swim', 'strength'] }, ['bike', 'swim', 'strength'], { age: 58, team: 0, crawl: 'some', exp: 2, time: 1, ill: false, inj: 'keine' });
  out.push({ ...mama, id: 'n57-mama' });
  const six = build(out.length, { type: 'run_marathon', name: 'Marathon', weeks: 28, sports: ['run'] }, ['run'], { time: 3, exp: 10, age: 34, team: 0 });
  six.answers.freq = { run: [6, 6] }; out.push({ ...six, id: 'n58-laeufer-6x' });
  const hol = build(out.length, { type: 'tri_olympic', name: 'Olympisch', weeks: 32, sports: ['swim', 'bike', 'run'] }, ['swim', 'bike', 'run'], { age: 44, crawl: 'yes', team: 0 });
  hol.answers.notes = ['Urlaub vom 2.11. bis 8.11.', 'Schwimmbad nur Di, Do und Sa']; out.push({ ...hol, id: 'n59-urlaub-bad' });
  out.push({ ...build(out.length, { type: 'tri_sprint', name: 'Sprint', weeks: 26, sports: ['swim', 'bike', 'run', 'strength'] }, ['swim', 'bike', 'run', 'strength'], { age: 20, team: 2, crawl: 'yes', exp: 2 }), id: 'n60-team-tri' });
  return out;
}

/* Auftrag 17, Punkt 7: dazu Personen für die neuen Fälle – Einsteiger mit 25 bzw. 50 m Kraul, Triathlet mit Fußball (Training und Spiel),
   jemand, der oft auslässt und Werte korrigiert, und jemand mit fehlenden und widersprüchlichen Angaben. Opt: Verhalten in der Simulation. */
export interface ManyUser17 extends ManyUser { skipper?: boolean; corrector?: boolean }
export function manyUsers17(): ManyUser17[] {
  const out: ManyUser17[] = manyUsers();
  const base = (i: number, g: G, sp: string[], o: any = {}) => build(i, g, sp, o);
  const k25 = base(60, { type: 'tri_sprint', name: 'Sprint', weeks: 26, sports: ['swim', 'bike', 'run'] }, ['swim', 'bike', 'run'], { age: 35, exp: 0, crawl: 'some', team: 0, inj: 'keine', ill: false });
  k25.answers.swimCrawlM = 25; k25.answers.swimGear = [];
  out.push({ ...k25, id: 'n61-kraul-25' });
  const k50 = base(61, { type: 'tri_olympic', name: 'Olympisch', weeks: 36, sports: ['swim', 'bike', 'run', 'strength'] }, ['swim', 'bike', 'run', 'strength'], { age: 28, exp: 1, crawl: 'yes', team: 0, inj: 'keine', ill: false });
  k50.answers.swimCrawlM = 50; k50.answers.swimGear = ['board', 'buoy']; k50.answers.swimBreast = true;
  out.push({ ...k50, id: 'n62-kraul-50' });
  const tri = base(62, { type: 'tri_middle', name: 'Mitteldistanz', weeks: 40, sports: ['swim', 'bike', 'run', 'strength'] }, ['swim', 'bike', 'run', 'strength'], { age: 17, exp: 4, crawl: 'yes', team: 0, time: 3, inj: 'keine', ill: false });
  Object.assign(tri.answers, { swimCrawlM: 50, swimGear: ['board', 'buoy'], swimBreast: true, teamYes: true, teamName: 'Fußball', teamTrainingDays: [1, 3], teamTrainingMinutes: 90, teamGames: true, teamGameDays: [5], teamGameMinutes: 90,
    goals: [{ id: 'g62a', type: 'run_half', name: 'Halbmarathon', date: '2027-04-04', priority: 'B', timeMode: 'total' }, { id: 'g62', type: 'tri_middle', name: 'Mitteldistanz', date: '2027-07-25', priority: 'A', timeMode: 'total' }] });
  out.push({ ...tri, id: 'n63-tri-fussball' });
  const sk = base(63, { type: 'run_10k', name: '10 km', weeks: 14, sports: ['run', 'bike', 'swim'] }, ['run', 'bike', 'swim'], { age: 46, exp: 3, crawl: 'yes', team: 0, inj: 'keine', ill: false });
  out.push({ ...sk, id: 'n64-auslasser-korrigierer', skipper: true, corrector: true });
  const bad = base(64, { type: 'run_marathon', name: 'Marathon', weeks: 10, sports: ['run', 'swim'] }, ['run', 'swim'], { age: 52, exp: 0, crawl: 'no', team: 0, time: 0, inj: 'keine', ill: false });
  Object.assign(bad.answers, { weeklyHoursNow: 12, runContinuousMin: 5, swimCrawlM: 400, swimGear: undefined, poolM: undefined, sleep: undefined });
  delete bad.answers.weightKg; delete bad.answers.heightCm;
  out.push({ ...bad, id: 'n65-widerspruechlich' });
  return out;
}
