import type { StrengthTemplate } from './strength';
import { swimPace } from './workouts';
export type TrainingSport = 'swim' | 'bike' | 'run' | 'strength';
/** Work duration/distance is per repetition or strength set; rest is BETWEEN repetitions. */
export type TrainingBlock = {
  name: string; kind?: string; repeat?: number; durationSec?: number | null; distanceM?: number | null;
  restSec?: number | null; paceSecPerKm?: number | null; speedKmh?: number | null;
  intensity?: string; equipment?: string[]; sets?: number | null; reps?: string; kg?: number | null;
  blocks?: TrainingBlock[]; timeBudgetSec?: number | null; description?: string; sourceStep?: Record<string, any>;
};
export type TrainingTemplate = { id: string; name: string; sport: TrainingSport; description: string; blocks: TrainingBlock[]; updatedAt: number; readOnly?: boolean; legacyId?: string; sourceSpec?: Record<string, any>; sourcePlannedMinutes?: number | null; sourcePlannedKm?: number | null; prescriptionSummary?: { fingerprint: string; minutes: number | null; km: number | null; estimated: boolean } };
export type TemplateTotals = { durationSec: number | null; knownDurationSec: number; distanceM: number; unknownDuration: boolean; estimated: boolean };
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const text = (x: unknown) => String(x ?? '').trim();
function number(x: unknown, label: string, integer = false, zero = false): number | null {
  if (x == null || text(x) === '') return null;
  const n = Number(text(x).replace(',', '.'));
  if (!Number.isFinite(n) || (zero ? n < 0 : n <= 0) || (integer && !Number.isInteger(n))) throw Error(`${label}: Bitte eine gueltige ${zero ? 'nichtnegative' : 'positive'} Zahl eingeben.`);
  return n;
}
function blocksOf(raw: any[], sport: TrainingSport, depth = 0): TrainingBlock[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 200 || depth > 5) throw Error('Bitte 1 bis 200 Bausteine angeben (maximal 6 Ebenen).');
  return raw.map((b, i) => {
    if (!b || !text(b.name)) throw Error(`Baustein ${i + 1}: Name fehlt.`);
    const out: TrainingBlock = { name: text(b.name), repeat: number(b.repeat, 'Wiederholungen', true) ?? 1 };
    if (b.sourceStep && typeof b.sourceStep === 'object') out.sourceStep = copy(b.sourceStep);
    for (const k of ['kind', 'intensity', 'description'] as const) if (text(b[k])) out[k] = text(b[k]);
    for (const k of ['durationSec', 'distanceM', 'restSec', 'paceSecPerKm', 'speedKmh', 'sets', 'kg', 'timeBudgetSec'] as const) {
      const n = number(b[k], k, k === 'sets', k === 'restSec' || k === 'kg'); if (n != null) out[k] = n;
    }
    if (text(b.reps)) out.reps = text(b.reps);
    if (b.equipment != null) { if (!Array.isArray(b.equipment)) throw Error('Ausruestung muss eine Liste sein.'); out.equipment = b.equipment.map(text).filter(Boolean); }
    if (sport !== 'strength' && (out.kg != null || out.sets != null || out.reps)) throw Error('Saetze, Gewicht und Uebungswiederholungen sind Kraftvorgaben.');
    if (sport === 'strength' && (out.distanceM != null || out.paceSecPerKm != null || out.speedKmh != null)) throw Error('Distanz und Pace gehoeren zu Ausdauereinheiten.');
    if (out.speedKmh != null && sport !== 'bike') throw Error('Geschwindigkeit in km/h ist eine Radvorgabe.');
    if (out.paceSecPerKm != null && sport === 'bike') throw Error('Bitte Radgeschwindigkeit statt Laufpace verwenden.');
    if (out.timeBudgetSec != null && (sport !== 'strength' || !Array.isArray(b.blocks))) throw Error('Ein Zeitbudget gilt nur fuer eine Kraftserie mit Uebungen.');
    if (Array.isArray(b.blocks)) {
      if (out.durationSec != null || out.distanceM != null || out.sets != null) throw Error('Serien verwenden Unterbausteine statt eigener Dauer/Distanz/Saetze.');
      out.blocks = blocksOf(b.blocks, sport, depth + 1);
    } else if (out.durationSec == null && out.distanceM == null && !(sport === 'strength' && out.reps)) throw Error(`Baustein ${i + 1}: Dauer, Distanz oder Kraftwiederholungen fehlen.`);
    return out;
  });
}
export function makeTrainingTemplate(input: { id: string; name: string; sport: string; blocks: any[]; description?: string; updatedAt?: number }): TrainingTemplate {
  if (!text(input.id) || !text(input.name)) throw Error('ID und Name der Vorlage fehlen.');
  if (!['swim', 'bike', 'run', 'strength'].includes(input.sport)) throw Error('Diese Sportart wird nicht unterstuetzt.');
  return { id: text(input.id), name: text(input.name), sport: input.sport as TrainingSport, description: text(input.description), blocks: blocksOf(input.blocks, input.sport as TrainingSport), ...((input as any).sourceSpec ? { sourceSpec: copy((input as any).sourceSpec), sourcePlannedMinutes: (input as any).sourcePlannedMinutes ?? null, sourcePlannedKm: (input as any).sourcePlannedKm ?? null } : {}), ...((input as any).prescriptionSummary ? { prescriptionSummary: { fingerprint: String((input as any).prescriptionSummary.fingerprint), minutes: number((input as any).prescriptionSummary.minutes, 'Gesamtdauer', false, true), km: number((input as any).prescriptionSummary.km, 'Gesamtdistanz', false, true), estimated: !!(input as any).prescriptionSummary.estimated } } : {}), updatedAt: input.updatedAt ?? Date.now() };
}
export function templateTotals(template: Pick<TrainingTemplate, 'blocks'>): TemplateTotals {
  function sum(blocks: TrainingBlock[]): TemplateTotals {
    const total: TemplateTotals = { durationSec: 0, knownDurationSec: 0, distanceM: 0, unknownDuration: false, estimated: false };
    for (const b of blocks) {
      const count = (b.repeat ?? 1) * (b.blocks ? 1 : b.sets ?? 1);
      let own: TemplateTotals;
      if (b.blocks) { own = sum(b.blocks); if (b.timeBudgetSec != null) own = { ...own, durationSec: b.timeBudgetSec, knownDurationSec: b.timeBudgetSec, unknownDuration: false, estimated: true }; }
      else {
        const derived = b.durationSec == null && b.distanceM != null && (!!b.paceSecPerKm || !!b.speedKmh);
        const seconds = b.durationSec ?? (b.distanceM != null && b.paceSecPerKm ? b.distanceM / 1000 * b.paceSecPerKm : b.distanceM != null && b.speedKmh ? b.distanceM / 1000 / b.speedKmh * 3600 : null);
        own = { durationSec: seconds, knownDurationSec: seconds ?? 0, distanceM: b.distanceM ?? 0, unknownDuration: seconds == null, estimated: derived };
      }
      total.knownDurationSec += own.knownDurationSec * count + (b.restSec ?? 0) * Math.max(0, count - 1);
      total.distanceM += own.distanceM * count; total.unknownDuration ||= own.unknownDuration; total.estimated ||= own.estimated;
    }
    total.durationSec = total.unknownDuration ? null : total.knownDurationSec; return total;
  }
  return sum(template.blocks);
}
export function describeTrainingBlocks(blocks: TrainingBlock[], depth = 0, sport?: TrainingSport): string {
  return blocks.map(b => {
    const prescription = [b.repeat && b.repeat > 1 ? `${b.repeat} x` : '', b.name, b.kind, b.timeBudgetSec ? `Zeitbudget ${b.timeBudgetSec} s (geschaetzt fuer alle Uebungen)` : '', b.sets ? `${b.sets} Saetze` : '', b.reps ? `${b.reps} Wdh.` : '', b.kg != null ? `${b.kg} kg` : '', b.durationSec ? `${b.durationSec} s` : '', b.distanceM ? `${b.distanceM} m` : '', b.restSec != null ? `${b.restSec} s Pause zwischen Wiederholungen/Saetzen` : '', b.paceSecPerKm ? sport === 'swim' ? `${b.paceSecPerKm / 10} s/100 m` : `${b.paceSecPerKm} s/km` : '', b.speedKmh ? `${b.speedKmh} km/h` : '', b.intensity, b.equipment?.join(', '), b.description].filter(Boolean).join(' · ');
    return '  '.repeat(depth) + prescription + (b.blocks ? '\n' + describeTrainingBlocks(b.blocks, depth + 1, sport) : '');
  }).join('\n');
}
export function adaptStrengthTemplate(legacy: StrengthTemplate): TrainingTemplate {
  return { id: 'legacy-strength:' + legacy.id, legacyId: legacy.id, readOnly: true, name: legacy.name, sport: 'strength', description: '', updatedAt: legacy.updatedAt, blocks: legacy.exercises.map(e => ({ ...copy(e), repeat: 1 })) };
}
export function templateSession(template: TrainingTemplate, id: string): any {
  const t = copy(template); const totals = templateTotals(t); const summary = matchingSummary(t);
  return { id, sport: t.sport, title: t.name, description: [t.description, describeTrainingBlocks(t.blocks, 0, t.sport)].filter(Boolean).join('\n'), plannedMinutes: summary ? summary.minutes : totals.durationSec == null ? null : totals.durationSec / 60, plannedKm: summary ? summary.km : totals.distanceM ? totals.distanceM / 1000 : null, plannedDurationUnknown: summary ? summary.minutes == null : totals.unknownDuration, plannedDurationEstimated: totals.estimated || !!summary?.estimated, trainingBlocks: copy(t.blocks), trainingTemplateSnapshot: t, spec: null, long: false, hard: /[Zz]one ?[45]|[Zz][45]|[Ii]ntervall|[Ss]chwelle/.test(describeTrainingBlocks(t.blocks, 0, t.sport)), zone: t.blocks.map(b => b.intensity).filter(Boolean).join(', '), completed: false };
}
export function applyTemplate(session: any, template: TrainingTemplate, mode: 'replace' | 'append'): any {
  if (session.completed || session.status === 'completed') throw Error('Bereits absolvierte Einheiten bleiben unveraendert.');
  if (!['replace', 'append'].includes(mode)) throw Error('Bitte Ersetzen oder Ergaenzen waehlen.');
  if (mode === 'append' && session.sport !== template.sport) throw Error('Ergaenzen ist nur innerhalb derselben Sportart moeglich.');
  const planned = templateSession(template, session.id); const out = copy(session);
  if (mode === 'append') {
    const base = sessionTrainingBlocks(session);
    planned.trainingBlocks = [...base, ...planned.trainingBlocks];
    const totals = templateTotals({ blocks: planned.trainingBlocks });
    planned.plannedMinutes = totals.durationSec == null ? null : totals.durationSec / 60;
    planned.plannedDurationUnknown = totals.unknownDuration; planned.plannedDurationEstimated = totals.estimated || !!session.plannedDurationEstimated;
    planned.plannedKm = totals.distanceM ? totals.distanceM / 1000 : null;
    planned.title = `${session.title || ''} + ${template.name}`;
    planned.description = [session.description, planned.description].filter(Boolean).join('\n');
    planned.hard ||= !!session.hard; planned.long ||= !!session.long;
    planned.trainingTemplateSnapshot = { ...planned.trainingTemplateSnapshot, name: planned.title, description: [session.trainingBlocks ? session.trainingTemplateSnapshot?.description : session.spec ? session.description : '', template.description].filter(Boolean).join('\n'), blocks: copy(planned.trainingBlocks), ...(session.trainingTemplateSnapshot?.sourceSpec ? { sourceSpec: copy(session.trainingTemplateSnapshot.sourceSpec), sourcePlannedMinutes: session.trainingTemplateSnapshot.sourcePlannedMinutes, sourcePlannedKm: session.trainingTemplateSnapshot.sourcePlannedKm } : session.spec ? { sourceSpec: copy(session.spec), sourcePlannedMinutes: session.plannedMinutes ?? null, sourcePlannedKm: session.plannedKm ?? null } : {}) };
    // Preserve an existing explicit generated summary only while its workload fingerprint matches.
    const sourceSummary = session.trainingTemplateSnapshot && matchingSummary({ ...session.trainingTemplateSnapshot, blocks: session.trainingBlocks });
    if ((session.spec && !session.trainingBlocks) || sourceSummary) {
      const added = templateSession(template, 'summary');
      planned.plannedMinutes = session.plannedMinutes == null || added.plannedMinutes == null ? null : session.plannedMinutes + added.plannedMinutes;
      planned.plannedKm = session.plannedKm == null && added.plannedKm == null ? null : (session.plannedKm ?? 0) + (added.plannedKm ?? 0);
      planned.plannedDurationUnknown = planned.plannedMinutes == null;
      planned.plannedDurationEstimated ||= totals.durationSec == null || planned.plannedMinutes == null || Math.abs(planned.plannedMinutes * 60 - totals.durationSec) > 0.001;
      planned.trainingTemplateSnapshot.prescriptionSummary = { fingerprint: prescriptionFingerprint(planned.trainingBlocks), minutes: planned.plannedMinutes, km: planned.plannedKm, estimated: planned.plannedDurationEstimated };
    }
  }
  // Copy only planned prescription fields. Unknown actual fields and journals remain byte-for-byte equivalent.
  const { completed, ...fields } = planned;
  Object.assign(out, fields);
  return out;
}





/** Translate generated steps without rebuilding their recipe or discarding source extensions. */
export function sessionTrainingBlocks(session: any): TrainingBlock[] {
  if (session.trainingBlocks) return copy(session.trainingBlocks);
  const spec = session.spec;
  if (Array.isArray(spec?.steps) && spec.steps.length) {
    const result: TrainingBlock[] = [];
    const labels: Record<string, string> = { warm: 'Aufwaermen', main: 'Hauptteil', cool: 'Ausklang' };
    let swimSeries = 0;
    for (const step of spec.steps) {
      const name = labels[step.part] || step.part || 'Baustein';
      const b: TrainingBlock = { name, kind: step.part, repeat: step.reps || 1, sourceStep: copy(step), ...(step.zone != null ? { intensity: `Zone ${step.zone}` } : {}), ...([step.note, step.mode, step.drill, step.focus].filter(Boolean).length ? { description: [step.note, step.mode, step.drill, step.focus].filter(Boolean).join(' · ') } : {}), ...(step.gear ? { equipment: copy(step.gear) } : {}) };
      if (spec.sport === 'strength' && step.part === 'main' && spec.exercises?.length) {
        b.blocks = spec.exercises.map((e: any) => ({ name: e.name, sets: e.sets, reps: String(e.reps ?? ''), ...(e.kg != null ? { kg: e.kg } : {}), ...(e.restSec != null ? { restSec: e.restSec } : {}), ...(e.note ? { description: e.note } : {}), sourceStep: copy(e) }));
        if (step.min > 0) b.timeBudgetSec = step.min * 60;
      } else if (step.min > 0) b.durationSec = step.min * 60;
      if (step.m > 0) b.distanceM = step.m;
      if (step.restMin != null || step.restSec != null) b.restSec = step.restSec ?? step.restMin * 60;
      if (spec.sport === 'swim' && step.m > 0) {
        if (swimSeries++) result.push({ name: 'Serienwechsel', durationSec: 30, kind: 'recovery' });
        const ctx = spec.ctx || {};
        const hasPace = step.mode === 'breast' ? ctx.breast100 > 0 : ctx.css > 0 || ctx.crawl100 > 0 || ctx.breast100 > 0;
        if (hasPace) b.paceSecPerKm = swimPace(ctx, step.zone || 2, step.mode || 'crawl', step.gear || []) * 10;
      }
      if (step.walkOnly) { b.name = 'Gehen'; b.intensity = 'Gehen'; }
      if (step.walkMin > 0) {
        const work = { ...b, repeat: 1 }; delete work.sourceStep; delete work.restSec;
        const group: TrainingBlock = { name: 'Lauf-Geh-Wechsel', repeat: b.repeat, blocks: [work, { name: 'Gehen', durationSec: step.walkMin * 60, intensity: 'Gehen' }], sourceStep: copy(step), ...(b.restSec != null ? { restSec: b.restSec } : {}) };
        result.push(group);
      } else result.push(b);
    }
    return result;
  }
  return [{ name: session.title || 'Bisherige Einheit', description: session.description || '', ...(session.plannedMinutes != null && session.plannedMinutes > 0 ? { durationSec: session.plannedMinutes * 60 } : {}), ...(session.plannedKm > 0 ? { distanceM: session.plannedKm * 1000 } : {}) }];
}


/** Only workload-bearing values take part, so field normalization does not change the summary. */
export function prescriptionFingerprint(blocks: TrainingBlock[]): string {
  const shape = (list: TrainingBlock[]): any[] => list.map(b => ({ repeat: Number(b.repeat || 1), sets: Number(b.sets || 1), ...Object.fromEntries(['durationSec', 'distanceM', 'restSec', 'paceSecPerKm', 'speedKmh', 'timeBudgetSec'].map(k => [k, (b as any)[k] == null || String((b as any)[k]).trim() === '' ? null : Number((b as any)[k])])), blocks: b.blocks ? shape(b.blocks) : null }));
  return JSON.stringify(shape(blocks));
}
function matchingSummary(t: Pick<TrainingTemplate, 'blocks' | 'prescriptionSummary'>) {
  const s = t.prescriptionSummary;
  if (!s || !t.blocks || s.fingerprint !== prescriptionFingerprint(t.blocks)) return null;
  return { minutes: number(s.minutes, 'Gesamtdauer', false, true), km: number(s.km, 'Gesamtdistanz', false, true), estimated: !!s.estimated };
}

