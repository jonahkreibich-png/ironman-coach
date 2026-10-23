/* Auftrag 19, Punkt 4: 54 neue erfundene Test-Nutzer (keine echten Personen). Jedes Ziel viermal mit anderer Ausstattung
   (Uhr mit Puls und GPS, nur von Hand, Uhr mit Wattmessung, nur Brustgurt-Puls), mit und ohne Teamsport, wenig und viel Zeit,
   Jugendliche bis Senioren, mit und ohne Hügel/Laufbahn. Dazu ein Fall wie Jonah (17, Fußball Mo + Spiel Fr, Halbmarathon vor der
   Langdistanz) und eine Läuferin mit zwei Zielen hintereinander. */
import { build, type G, type ManyUser } from './manyusers';

export const MANY19_TODAY = '2026-10-19'; // Montag
export type Device = 'watch' | 'manual' | 'power' | 'hr';
export interface ManyUser19 extends ManyUser { device: Device }

const SUNDAY = (weeks: number) => { const d = new Date(Date.UTC(2026, 9, 19 + weeks * 7)); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const GOALS: G[] = [
  { type: 'fitness', name: 'Fitter werden', weeks: null, sports: ['run', 'bike', 'strength'] },
  { type: 'run_5k', name: 'Parkrun unter 25', weeks: 9, sports: ['run', 'strength'] },
  { type: 'run_10k', name: 'Silvesterlauf 10 km', weeks: 11, sports: ['run'] },
  { type: 'run_half', name: 'Frühjahrs-Halbmarathon', weeks: 20, sports: ['run', 'bike'] },
  { type: 'run_marathon', name: 'Stadtmarathon', weeks: 28, sports: ['run', 'strength'] },
  { type: 'tri_supersprint', name: 'Schul-Triathlon', weeks: 14, sports: ['swim', 'bike', 'run'] },
  { type: 'tri_sprint', name: 'Sprint am See', weeks: 30, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'tri_olympic', name: 'Olympische Distanz Hamburg', weeks: 36, sports: ['swim', 'bike', 'run'] },
  { type: 'tri_middle', name: 'Mitteldistanz Kraichgau', weeks: 38, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'tri_long', name: 'Langdistanz Roth', weeks: 50, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'duathlon', name: 'Duathlon im Frühling', weeks: 22, sports: ['run', 'bike'] },
  { type: 'bike_event', name: 'Radmarathon 200 km', weeks: 30, sports: ['bike', 'strength'] },
  { type: 'swim_goal', name: '3 km Freiwasser', weeks: 26, sports: ['swim', 'strength'] }
];
const DEVICES: Device[] = ['watch', 'manual', 'power', 'hr'];
const AGES = [[34, 16, 47, 66], [29, 15, 52, 61], [41, 17, 38, 70], [25, 14, 56, 68]];
const TERRAIN = [['hills', 'track'], [], ['hills'], ['treadmill']];

export function manyUsers19(): ManyUser19[] {
  const out: ManyUser19[] = [];
  GOALS.forEach((g, gi) => DEVICES.forEach((dev, k) => {
    const i = 200 + gi * 4 + k;
    const age = AGES[gi % 4][k];
    const teen = age < 18;
    // k0: viel Zeit, kein Teamsport; k1: wenig Zeit, Teamsport mit Spielen; k2: mittel, Teamsport ohne Spiele; k3: nur Wochenende
    const o = [{ time: 3, team: 0 }, { time: 0, team: 2 }, { time: 2, team: 1 }, { time: 5, team: 0 }][k] as any;
    const u = build(i, g, g.sports, { age, teen, team: o.team, time: o.time, exp: [6, 1, 3, 12][k], ill: (gi + k) % 9 === 4, inj: 'keine' });
    u.answers.terrain = TERRAIN[(gi + k) % 4];
    if (g.sports.includes('bike')) u.answers.powerMeter = dev === 'power';
    if (dev === 'power' && g.sports.includes('bike')) u.answers.bikes = ['road', 'trainer'];
    if (o.team === 2) Object.assign(u.answers, { teamName: 'Fußball', teamTrainingDays: [1], teamGameDays: [5], teamGameMinutes: 90 });
    out.push({ ...u, id: `u${String(out.length + 1).padStart(2, '0')}-${g.type.replace('_', '-')}-${dev}`, label: `${u.label}, ${dev}`, device: dev, teen });
  }));
  // wie Jonah: 17, Fußball Mo Training + Fr Spiel, Halbmarathon im April, Langdistanz als Hauptziel, Uhr ohne Watt
  const j = build(260, { type: 'tri_long', name: 'Ironman', weeks: 150, sports: ['swim', 'bike', 'run', 'strength'] }, ['swim', 'bike', 'run', 'strength'], { age: 17, exp: 3, crawl: 'yes', team: 2, time: 3, inj: 'keine', ill: false, teen: true });
  Object.assign(j.answers, { teamName: 'Fußball', teamTrainingDays: [1], teamTrainingMinutes: 90, teamGameDays: [5], teamGameMinutes: 90, swimCrawlM: 1000, runContinuousMin: 75, bikeLongestMin: 150, terrain: ['hills'],
    goals: [{ id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: '2027-04-04', priority: 'B', timeMode: 'total' }, { id: 'g-im', type: 'tri_long', name: 'Ironman', date: '2029-09-15', priority: 'A', timeMode: 'total' }] });
  out.push({ ...j, id: 'u53-wie-jonah', label: '17 J., Fußball + Halbmarathon + Ironman (wie Jonah)', device: 'watch', teen: true });
  // zwei Laufziele hintereinander (10 km, dann Marathon), Laufbahn in der Nähe
  const r = build(261, { type: 'run_marathon', name: 'Herbstmarathon', weeks: 40, sports: ['run', 'bike', 'strength'] }, ['run', 'bike', 'strength'], { age: 44, exp: 8, team: 0, time: 2, inj: 'keine', ill: false });
  Object.assign(r.answers, { terrain: ['track'], goals: [{ id: 'g-10', type: 'run_10k', name: '10 km im März', date: '2027-03-14', priority: 'B', timeMode: 'total' }, { id: 'g-m', type: 'run_marathon', name: 'Herbstmarathon', date: SUNDAY(52), priority: 'A', timeMode: 'total' }] });
  out.push({ ...r, id: 'u54-zwei-laufziele', label: '44 J., 10 km im März, Marathon im Herbst', device: 'hr' });
  return out;
}
