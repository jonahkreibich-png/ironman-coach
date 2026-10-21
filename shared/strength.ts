/** Reusable prescriptions. Workouts always receive their own copy. */
export type StrengthExercise = { name: string; sets: number | null; reps: string; kg: number | null; restSec: number | null };
export type StrengthTemplate = { id: string; name: string; exercises: StrengthExercise[]; updatedAt: number };

export function strengthNumber(value: unknown, label: string, integer = false, positive = false): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0) || (integer && !Number.isInteger(n))) throw new Error(`${label}: Bitte eine gültige ${positive ? 'positive ' : ''}Zahl eingeben.`);
  return n;
}
export function makeStrengthTemplate(id: string, name: string, exercises: any[], updatedAt = Date.now()): StrengthTemplate {
  if (!name.trim()) throw new Error('Bitte einen Namen für die Vorlage eingeben.');
  if (!Array.isArray(exercises) || !exercises.length) throw new Error('Bitte mindestens eine Übung hinzufügen.');
  return { id, name: name.trim(), exercises: exercises.map((e, i) => {
    if (!String(e.name || '').trim()) throw new Error(`Übung ${i + 1}: Bitte einen Namen eingeben.`);
    return { name: String(e.name).trim(), sets: strengthNumber(e.sets, 'Sätze', true, true), reps: String(e.reps ?? '').trim(), kg: strengthNumber(e.kg, 'Gewicht'), restSec: strengthNumber(e.restSec, 'Pause', true) };
  }), updatedAt };
}
export function startStrengthWorkout(template: StrengthTemplate, date: string, id: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Bitte ein gültiges Trainingsdatum wählen.');
  return { id, sport: 'strength', title: template.name, description: '', completed: false, strengthTemplateId: template.id, metrics: { exercises: template.exercises.map(e => ({ ...e })) } };
}
