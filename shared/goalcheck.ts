/* Ist die Wunschzeit im Zeitraum realistisch? (Auftrag 4 B4)
   Grobe Prognose aus den (gemessenen oder geschätzten) Schwellen plus einer vorsichtigen Verbesserung pro Woche.
   Ergebnis immer als Spanne; liegt die Wunschzeit deutlich darunter, schlägt die App eine realistische Spanne vor. */
import type { Goal } from './goals';
import { GOALS, legsOf } from './goals';
import type { Profile } from './profile';
import { withEstimates } from './profile';

/* Faktor Wettkampf-Pace zur Schwellen-Pace je Distanz (Laufen) */
function runFactor(km: number): number { return km <= 5 ? 0.96 : km <= 10 ? 1.0 : km <= 21.2 ? 1.05 : 1.12; }
export interface Realism { low: number; high: number; ok: boolean | null; text: string }

export function predictGoal(g: Goal, profile0: Profile, today: string): { low: number; high: number } | null {
  if (!g.date || g.type === 'fitness') return null;
  const p = withEstimates(profile0, today);
  const th = p.thresholds;
  const weeks = Math.max(0, (+new Date(g.date + 'T12:00:00Z') - +new Date(today + 'T12:00:00Z')) / (7 * 86400000));
  const beginner = (p.experienceYears ?? 1) < 2;
  const gain = Math.min(beginner ? 0.15 : 0.08, weeks * (beginner ? 0.008 : 0.004)); // vorsichtige Verbesserung bis zum Termin
  let sec = 0;
  const legs = legsOf(g);
  const tri = GOALS[g.type].group === 'tri';
  for (const l of legs) {
    if (l.sport === 'run') sec += l.km * th.thresholdPaceRunSec * runFactor(tri ? l.km * 2 : l.km) * (tri ? 1.06 : 1);
    if (l.sport === 'bike') sec += l.km / (th.thresholdSpeedBikeKmh * (l.km > 60 ? 0.82 : 0.9)) * 3600;
    if (l.sport === 'swim') sec += l.km * 10 * ((th.cssSec || 190) + 8);
  }
  if (tri) sec += legs.length > 2 ? 240 : 120;
  const best = sec * (1 - gain);
  return { low: Math.round(best * 0.95), high: Math.round(sec * 1.05) };
}
const fmt = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
export function realism(g: Goal, p: Profile, today: string): Realism | null {
  const r = predictGoal(g, p, today);
  if (!r) return null;
  const est = (p.thresholds.estimated || []).length > 0;
  const range = `${fmt(r.low)} bis ${fmt(r.high)}`;
  if (!g.targetTimeSec) return { ...r, ok: null, text: `Realistisch bis zum Termin: etwa ${range}${est ? ' (grob, aus geschätzten Werten)' : ''}.` };
  if (g.targetTimeSec >= r.low * 0.98) return { ...r, ok: true, text: `Deine Wunschzeit ${fmt(g.targetTimeSec)} ist realistisch (Prognose ${range}${est ? ', grob geschätzt' : ''}).` };
  return { ...r, ok: false, text: `${fmt(g.targetTimeSec)} ist bis zum Termin sehr ehrgeizig. Realistisch wären etwa ${range}${est ? ' (grob geschätzt, ein Test macht es genauer)' : ''}.` };
}

/* Auftrag 18: höchstens 2-3 A-Wettkämpfe pro Jahr mit genug Abstand (sonst Hinweis: weitere als B oder C) */
export function seasonHint(goals: Goal[], today: string): string | null {
  const a = (goals || []).filter(g => g && g.priority === 'A' && g.date && g.date >= today && !g.result && g.type !== 'fitness').sort((x, y) => x.date!.localeCompare(y.date!));
  for (let i = 0; i < a.length; i++) {
    const within = a.filter(g => g.date! >= a[i].date! && +new Date(g.date! + 'T12:00:00Z') - +new Date(a[i].date! + 'T12:00:00Z') < 365 * 86400000);
    if (within.length > 3) return `${within.length} Hauptziele (A) innerhalb eines Jahres: Mehr als 2-3 echte Form-Spitzen pro Jahr gehen kaum. Mach die weniger wichtigen zu B (kurzes Tapering) oder C (als Training).`;
  }
  for (let i = 1; i < a.length; i++) {
    const d = (+new Date(a[i].date! + 'T12:00:00Z') - +new Date(a[i - 1].date! + 'T12:00:00Z')) / 86400000;
    if (d < 42) return `${a[i - 1].name} und ${a[i].name} sind beide Hauptziele (A), aber nur ${Math.round(d / 7)} Wochen auseinander. Zwischen zwei A-Wettkämpfen braucht es Erholung und Aufbau: eins davon besser als B oder C planen.`;
  }
  return null;
}
