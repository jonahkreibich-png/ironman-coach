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

/* ---------- Auftrag 36: Kraft auswerten (Score, „wie letztes Mal“) ----------
   Für Triathlon wichtig: Beine/Hüfte, einbeinig/Stabilität, Rumpf, Oberkörper Zug, Oberkörper Druck (Rønnestad & Mujika 2014,
   Lauf-/Rad-Ökonomie; Rumpf und Schulter für Schwimmen). Je Übung: Sätze × Wiederholungen × Gewicht bzw. Zeit bei Halteübungen,
   Körpergewicht bei Übungen ohne Gewicht. Steigerung: geschätztes Maximalgewicht nach Epley (Gewicht × (1 + Wdh/30)) aus dem besten Satz,
   im Verhältnis zum Körpergewicht. Unter 18 nur aus Sätzen mit mindestens 6 Wiederholungen (keine Maximalversuche, nie ein Maximaltest). */
export type StrengthCat = 'legs' | 'single' | 'core' | 'pull' | 'push';
export const STRENGTH_CATS: [StrengthCat, string][] = [['legs', 'Beine/Hüfte'], ['single', 'einbeinig/Stabilität'], ['core', 'Rumpf'], ['pull', 'Oberkörper Zug'], ['push', 'Oberkörper Druck']];
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
/** Bereiche einer Übung (eine Übung kann zwei treffen, z. B. Ausfallschritt = Beine + einbeinig) */
export function exerciseCats(name: string): StrengthCat[] {
  const n = norm(name); const out = new Set<StrengthCat>();
  if (/einbein|single.?leg|ausfallschritt|lunge|split.?squat|bulgar|step.?up|aufsteig|pistol|standwaage|balance|einbeinstand|copenhagen|kopenhagen|seitlich.*band|monster walk|clam|muschel/.test(n)) out.add('single');
  if (/kniebeug|squat|lunge|ausfallschritt|step.?up|aufsteig|beinpresse|leg press|wadenheb|calf|huftbrucke|huftheb|glute bridge|bridge|hip thrust|nordic|kreuzheb|deadlift|rdl|beincurl|leg curl|beinstreck|good morning|sprung|jump|kettlebell swing|swing|wall sit|wandsitz/.test(n)) out.add('legs');
  if (/plank|unterarmstutz|seitstutz|stutz|dead.?bug|bird.?dog|vierfussler|rumpf|crunch|sit.?up|pallof|russian twist|hollow|superman|rucken.?streck|back extension|beinheb|leg raise|mountain climber|ab wheel|bauch/.test(n)) out.add('core');
  if (/rudern|\brow|klimmzug|pull.?up|chin.?up|latzug|lat pull|face pull|reverse fly|aussenrotation|y.?t.?w|band.?zug|zugseil|pullover|schwimmzug/.test(n)) out.add('pull');
  if (/bankdruck|bench|liegestutz|push.?up|schulterdruck|overhead|military|dips|trizeps|triceps|druck|press(?!e)/.test(n) && !/beinpresse|leg press|pallof/.test(n)) out.add('push');
  return [...out];
}
/** Wiederholungen bzw. Haltezeit aus der Eingabe („8-10“, „10/Seite“, „45 s“, „1 min“, „3×10“) */
export function repsOf(reps: any): { reps: number | null; holdSec: number | null } {
  const s = norm(String(reps ?? '')).replace(',', '.').trim();
  if (!s) return { reps: null, holdSec: null };
  const t = /(\d+(?:\.\d+)?)\s*(s|sek|sec|min)\b/.exec(s);
  if (t) return { reps: null, holdSec: Math.round(+t[1] * (t[2] === 'min' ? 60 : 1)) };
  const x = /\d+\s*[x×]\s*(\d+)/.exec(s); if (x) return { reps: +x[1], holdSec: null };
  const r = /(\d+)(?:\s*[-–]\s*(\d+))?/.exec(s);
  if (!r) return { reps: null, holdSec: null };
  return { reps: r[2] ? Math.round((+r[1] + +r[2]) / 2) : +r[1], holdSec: null };
}
/** Anteil des Körpergewichts, der bei Übungen ohne Zusatzgewicht bewegt wird (grob, nach Studien zu Liegestütz/Kniebeuge) */
function bwShare(name: string): number {
  const n = norm(name);
  if (/klimmzug|pull.?up|chin.?up|dips/.test(n)) return 1;
  if (/liegestutz|push.?up/.test(n)) return 0.65;
  if (/kniebeug|squat|ausfallschritt|lunge|step.?up|split/.test(n)) return 0.75;
  if (/huft|bridge|hip thrust/.test(n)) return 0.5;
  if (/waden|calf/.test(n)) return 1;
  return 0;
}
export const epley = (kg: number, reps: number) => kg * (1 + reps / 30);
export interface ExerciseLoad { name: string; cats: StrengthCat[]; sets: number; reps: number | null; holdSec: number | null; kg: number | null; volumeKg: number; e1rmKg: number | null; holdBest: number | null }
/** Eine eingetragene Übung auswerten; bw = Körpergewicht (kg), minor = unter 18 */
export function exerciseLoad(e: any, bw: number | null, minor = false): ExerciseLoad | null {
  if (!e || !String(e.name || '').trim()) return null;
  const sets = Number(e.sets) > 0 ? Math.min(20, Math.round(Number(e.sets))) : 1;
  const { reps, holdSec } = repsOf(e.reps);
  const kg0 = e.kg != null && e.kg !== '' && Number.isFinite(Number(String(e.kg).replace(',', '.'))) ? Number(String(e.kg).replace(',', '.')) : null;
  const share = bwShare(e.name);
  const load = (kg0 || 0) + (bw && share ? bw * share : 0);
  const volumeKg = reps ? sets * reps * load : 0;
  const okReps = reps != null && reps >= (minor ? 6 : 1) && reps <= 15;
  const e1rmKg = okReps && load > 0 ? epley(load, reps!) : null;
  return { name: String(e.name).trim(), cats: exerciseCats(e.name), sets, reps, holdSec, kg: kg0, volumeKg, e1rmKg, holdBest: holdSec };
}
/** Schlüssel einer Übung über Einheiten hinweg (Groß/Klein, Umlaute, Zusätze in Klammern egal) */
export const exerciseKey = (name: string) => norm(name).replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** „Wie letztes Mal“: die Übungen (mit Gewichten) der letzten erledigten Krafteinheit vor diesem Tag; null, wenn es keine gibt */
export function lastStrengthExercises(entries: { date: string; id: string; exercises: any[] | null | undefined }[], date: string, exceptId: string): { date: string; exercises: any[] } | null {
  const list = entries.filter(x => x && x.id !== exceptId && x.date <= date && Array.isArray(x.exercises) && x.exercises.some(e => e && String(e.name || '').trim()))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return null;
  return { date: list[0].date, exercises: list[0].exercises!.filter(e => e && String(e.name || '').trim()).map(e => ({ name: e.name, sets: e.sets ?? null, reps: e.reps ?? '', kg: e.kg ?? null, restSec: e.restSec ?? null })) };
}
