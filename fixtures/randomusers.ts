/* Auftrag 14: 10 zufällig erzeugte neue Nutzer (fester Startwert, damit Tests wiederholbar sind): verschiedene Sportarten, Ziele,
   Niveaus, Alter und Zeiten. Keine echten Personen. */
export const RANDOM_TODAY = '2026-10-17';
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const GOALS: { type: string; sports: string[]; name: string }[] = [
  { type: 'run_5k', sports: ['run'], name: '5-km-Lauf' }, { type: 'run_10k', sports: ['run'], name: '10-km-Lauf' }, { type: 'run_half', sports: ['run'], name: 'Halbmarathon' },
  { type: 'run_marathon', sports: ['run'], name: 'Marathon' }, { type: 'tri_sprint', sports: ['swim', 'bike', 'run'], name: 'Sprint-Triathlon' },
  { type: 'tri_olympic', sports: ['swim', 'bike', 'run'], name: 'Olympischer Triathlon' }, { type: 'tri_middle', sports: ['swim', 'bike', 'run'], name: 'Mitteldistanz' },
  { type: 'tri_long', sports: ['swim', 'bike', 'run'], name: 'Langdistanz' }, { type: 'bike_event', sports: ['bike'], name: 'Radmarathon' }, { type: 'run_10k', sports: ['run', 'bike'], name: 'Stadtlauf' }
];
export interface RandomUser { id: string; label: string; answers: Record<string, any> }
export function randomUsers(n = 10, seed = 1414): RandomUser[] {
  const r = rng(seed); const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const out: RandomUser[] = [];
  for (let i = 0; i < n; i++) {
    const g = GOALS[i % GOALS.length];
    const age = pick([15, 17, 24, 31, 38, 45, 52, 58, 63, 67]);
    const exp = pick([0, 0.5, 1, 2, 4, 7, 12]);
    const hours = pick([3, 4, 5, 6, 8, 10, 12]);
    const weeks = pick([8, 12, 16, 24, 36, 52]);
    const date = new Date(Date.UTC(2026, 9, 17 + weeks * 7)); while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
    const sports = [...g.sports, ...(r() < 0.6 ? ['strength'] : [])];
    const team = r() < 0.25;
    const crawl = sports.includes('swim') ? pick(['no', 'some', 'yes', 'yes']) : undefined;
    const runCont = exp < 1 ? pick([10, 20, 35]) : pick([40, 60, 90, 120]);
    const a: Record<string, any> = {
      goals: [{ id: 'g' + i, type: g.type, name: g.name, date: date.toISOString().slice(0, 10), priority: 'A', timeMode: 'total' }],
      birthYear: 2026 - age, sex: r() < 0.5 ? 'f' : 'm', injuries: 'keine', medical: false, sports, experienceYears: exp, weeklyHoursNow: Math.max(1, hours - 1),
      runContinuousMin: sports.includes('run') ? runCont : undefined, bikeLongestMin: sports.includes('bike') ? pick([45, 90, 150, 240]) : undefined, bikes: sports.includes('bike') ? [pick(['road', 'gravel', 'trekking']), ...(r() < 0.4 ? ['trainer'] : [])] : [], powerMeter: r() < 0.3,
      swimCrawl: crawl, swimCrawlM: crawl === 'yes' ? pick([50, 100, 400, 1500]) : crawl === 'some' ? 25 : undefined, swimBreast: sports.includes('swim') ? true : undefined, poolM: '25', openWater: false,
      swimGear: sports.includes('swim') ? [...(r() < 0.7 ? ['board'] : []), ...(r() < 0.6 ? ['buoy'] : []), ...(r() < 0.3 ? ['fins'] : []), ...(r() < 0.2 ? ['paddles'] : [])] : undefined,
      teamYes: team, ...(team ? { teamName: 'Fußball', teamTrainingDays: [2], teamTrainingMinutes: 90, teamGameDays: r() < 0.5 ? [6] : [], teamGameMinutes: 90 } : {}),
      dayLoad: { 0: pick([2, 3]), 1: pick([0, 1, 2]), 2: pick([1, 2]), 3: pick([0, 1, 2]), 4: pick([1, 2]), 5: pick([0, 1]), 6: pick([2, 3]) }, weeklyHours: hours, maxDayHours: Math.max(1.5, Math.min(4, hours / 3)),
      notes: [], wantTests: r() < 0.5
    };
    out.push({ id: `zufall-${i + 1}`, label: `${age} J., ${g.name} in ${weeks} Wochen, ${exp} J. Erfahrung, ${hours} h/Woche${team ? ', Teamsport' : ''}${crawl ? ', Kraul: ' + crawl : ''}`, answers: a });
  }
  return out;
}
