/* Auftrag 20, Punkt 3: 50 neue erfundene Test-Nutzer (keine echten Personen) mit Fokus auf Scores und realistische Dauer.
   Zehn Daten-Fälle × fünf Ziele: einfache Rolle ohne Watt mit Fantasie-Tempo, Smart-Trainer mit Watt, nur 1-2 Einheiten, ein Ausreißer,
   4 Wochen Pause, echter Test, Laufband, GPS-Fehler, ohne Puls (nur Gefühl), Wattmesser draußen. Dazu Schwimm-Lernende und Kraulende
   (Dauer der Schwimmeinheiten), Intervalle mit Pausen, Teamsport mit viel Laufen. */
import { build, type G, type ManyUser } from './manyusers';
import type { Device } from './users19';

export const MANY20_TODAY = '2026-10-26'; // Montag
export type Case20 = 'basicTrainer' | 'smartTrainer' | 'few' | 'outlier' | 'pause' | 'test' | 'treadmill' | 'gps' | 'nohr' | 'power';
export interface ManyUser20 extends ManyUser { device: Device; case: Case20 }

const GOALS: G[] = [
  { type: 'tri_olympic', name: 'Olympische Distanz', weeks: 34, sports: ['swim', 'bike', 'run', 'strength'] },
  { type: 'run_half', name: 'Halbmarathon im Frühjahr', weeks: 22, sports: ['run', 'bike'] },
  { type: 'tri_sprint', name: 'Sprint-Triathlon', weeks: 26, sports: ['swim', 'bike', 'run'] },
  { type: 'bike_event', name: 'Radmarathon', weeks: 30, sports: ['bike', 'run', 'strength'] },
  { type: 'tri_middle', name: 'Mitteldistanz', weeks: 40, sports: ['swim', 'bike', 'run', 'strength'] }
];
const CASES: Case20[] = ['basicTrainer', 'smartTrainer', 'few', 'outlier', 'pause', 'test', 'treadmill', 'gps', 'nohr', 'power'];
const AGES = [19, 33, 45, 58, 16, 27, 64, 38, 51, 23];

export function manyUsers20(): ManyUser20[] {
  const out: ManyUser20[] = [];
  GOALS.forEach((g, gi) => CASES.forEach((cs, k) => {
    const i = 300 + gi * 10 + k;
    const age = AGES[(k + gi) % AGES.length];
    const teen = age < 18;
    const team = (k + gi) % 4 === 1 ? 2 : (k + gi) % 7 === 3 ? 1 : 0;
    const u = build(i, g, g.sports, { age, teen, team: team as any, time: (k + gi) % 6, exp: [0, 2, 5, 12, 1][(k + gi) % 5], ill: (k + gi) % 11 === 6, inj: 'keine',
      crawl: g.sports.includes('swim') ? (['no', 'some', 'yes', 'yes'] as const)[(k + gi) % 4] : undefined });
    if (team === 2) Object.assign(u.answers, { teamName: ['Fußball', 'Handball', 'Basketball', 'Volleyball'][(k + gi) % 4], teamTrainingDays: [2], teamGameDays: [6], teamGameMinutes: 80 });
    if (g.sports.includes('bike')) {
      u.answers.powerMeter = cs === 'power';
      if (cs === 'basicTrainer') Object.assign(u.answers, { bikes: ['gravel', 'trainer'], trainerType: 'basic' });
      if (cs === 'smartTrainer') Object.assign(u.answers, { bikes: ['road', 'trainer'], trainerType: 'smart' });
    }
    u.answers.terrain = [['hills'], [], ['track'], ['hills', 'track']][(k + gi) % 4];
    const device: Device = cs === 'power' ? 'power' : cs === 'nohr' ? 'manual' : cs === 'treadmill' ? 'hr' : 'watch';
    out.push({ ...u, id: `v${String(out.length + 1).padStart(2, '0')}-${g.type.replace('_', '-')}-${cs}`, label: `${u.label}, Fall ${cs}`, device, case: cs, teen });
  }));
  return out;
}
