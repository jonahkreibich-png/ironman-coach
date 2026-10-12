/* Auftrag 5 A: Fehler von Papas Test nachgestellt. Er hat geschrieben „kann mittwochs nicht laufen, nur Samstag oder Sonntag“,
   der Plan hat den Lauf trotzdem auf andere Tage gelegt. Harte Regeln müssen den Plan steuern. */
import { test, expect } from 'vitest';
import { PERSONAS, PERSONA_TODAY as today } from '../../fixtures/personas';
import { applyOnboarding } from '../../shared/onboarding';

const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
test('Vater-Profil: Läufe nur Sa/So, nie Mi; Schwimmen nur Do; dienstags gar nichts', () => {
  const p = PERSONAS.find(x => x.id === 'vater-regeln')!;
  const r = applyOnboarding(p.answers, today);
  const weeks = r.gen!.plan.weeks.slice(0, 8);
  const all = weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.race).map((s: any) => ({ ...s, date: d.date }))));
  const runs = all.filter((s: any) => s.sport === 'run');
  expect(runs.length).toBeGreaterThan(0);
  runs.forEach((s: any) => expect([0, 6], `${s.title} am ${s.date}`).toContain(dow(s.date)));
  all.filter((s: any) => s.sport === 'swim').forEach((s: any) => expect(dow(s.date), `${s.title} am ${s.date}`).toBe(4));
  all.forEach((s: any) => expect(dow(s.date), `${s.title} am ${s.date}`).not.toBe(2));
});
