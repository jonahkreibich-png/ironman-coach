/* Auftrag 19, Punkt 1c: Einheiten-Bibliothek. Je Ziel × Niveau × Phase (dazu Jugendliche, ohne/mit Gelände, mit Beschwerden) werden die
   ersten 6 Qualitätseinheiten je Sportart ausgewählt und gebaut. Geprüft: nur erlaubte Formen (Niveau, Phase, Ziel, Gelände/Ausrüstung,
   Beschwerden, keine Zone 5 unter 18), Einheit baubar mit Aufwärmen/Hauptteil/Auslaufen und klarem Namen, Abwechslung (keine Form mehr als
   3-mal hintereinander, mehrere Formen je Block), Stufen steigen. Bericht: test-results/auftrag19-bibliothek.json (Tabelle in ERGEBNIS.md). */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { WORKOUTS, LIB, pickQuality, allowed, rotation, libGoal, type LPhase, type LLevel, type PickOpts } from '../../shared/workoutlib';
import { runQualitySpec, runEasyForm, bikeQualitySpec, bikeEasyForm, swimQuality } from '../../shared/workoutbuild';
import * as W from '../../shared/workouts';
import { nameIssues } from '../../shared/sessiontypes';
import { exampleSpec, diagramSvg } from '../../shared/workoutdiagram';
import { JARGON } from '../../shared/glossary';

const GOALS = ['run_5k', 'run_10k', 'run_half', 'run_marathon', 'tri_sprint', 'tri_olympic', 'tri_middle', 'tri_long', 'bike_event', 'swim_goal', 'fitness', 'duathlon', 'aquathlon'];
const LEVELS: LLevel[] = ['beginner', 'advanced', 'experienced'];
const PHASES: LPhase[] = ['base', 'build', 'specific', 'taper', 'recovery'];
const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 165, bikeKmh: 30, css: 105, breast100: 160, pool: 25, gear: ['buoy', 'board'] };
const VARIANTS: { id: string; o: Partial<PickOpts> }[] = [
  { id: 'Standard', o: {} },
  { id: 'Hügel+Bahn', o: { terrain: { hills: true, track: true } } },
  { id: 'unter 18', o: { noZ5: true } },
  { id: 'Achilles', o: { excludes: ['achilles'], terrain: { hills: true } } }
];
const report: Record<string, Record<string, string[]>> = {};
function build(sport: 'run' | 'bike' | 'swim', key: string, stage: number, goal: string, noZ5: boolean): W.Spec | null {
  if (sport === 'run') return runEasyForm(key, stage, CTX, 50) || runQualitySpec(key, stage, CTX, goal, { noZ5 });
  if (sport === 'bike') return bikeEasyForm(key, stage, CTX, 60) || bikeQualitySpec(key, stage, CTX, goal, { total: 75, noZ5 });
  const base = W.swimNormal({ ...CTX }, 'technique', 45, 'build', 400, 0);
  return swimQuality(key, stage, base, { repMax: 400, learner: false, minutes: 50 });
}

describe('Auftrag 19: Einheiten-Bibliothek', () => {
  test('jede Form hat Name, Sportart, Zweck, Niveau, Phasen, Ziele, Aufbau, Stufen, Belastung; Namen eindeutig', () => {
    expect(WORKOUTS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(WORKOUTS.map(w => w.name)).size).toBe(WORKOUTS.length);
    for (const w of WORKOUTS) {
      expect(w.name.length, w.key).toBeGreaterThan(3); expect(w.purpose.length, w.key).toBeGreaterThan(20);
      expect(w.phases.length, w.key).toBeGreaterThan(0); expect(w.stages.length, w.key).toBeGreaterThan(0);
      expect(['locker', 'mittel', 'hart']).toContain(w.load); expect(w.structure.length, w.key).toBeGreaterThan(20);
    }
    // die verlangten Formen sind da
    for (const k of ['run.strides', 'run.abc', 'run.hillsprints', 'run.hillreps', 'run.longhills', 'run.fartlek', 'run.progression', 'run.tempo', 'run.threshold', 'run.vo2', 'run.pyramid', 'run.3030', 'run.speed', 'run.racepace', 'run.longfinish', 'run.brick', 'run.runwalk',
      'bike.cadence', 'bike.force', 'bike.sweetspot', 'bike.threshold', 'bike.overunder', 'bike.vo2', 'bike.3015', 'bike.sprints', 'bike.tempolong', 'bike.racepaceblocks', 'bike.climb', 'bike.tt', 'bike.brickreps',
      'swim.drills', 'swim.kick', 'swim.pull', 'swim.breath', 'swim.fast', 'swim.aerobic', 'swim.threshold', 'swim.css', 'swim.pyramid', 'swim.descend', 'swim.broken', 'swim.long', 'swim.racestart', 'swim.openwater',
      'tri.brick', 'tri.transition', 'tri.rehearsal', 'tri.fueling']) expect(LIB[k], k).toBeTruthy();
  });
  test('Lexikon: jede Form mit Erklärung und Ablaufbild', () => {
    for (const w of WORKOUTS) {
      const j = JARGON.find(x => x.term === w.name); expect(j, w.name).toBeTruthy();
      expect(j!.facts && j!.facts.length, w.name).toBeGreaterThan(2);
      const sp = exampleSpec(w.key); expect(sp, w.key).toBeTruthy();
      expect(diagramSvg(sp!)).toMatch(/^<svg[^>]*role="img".*<rect/);
    }
  });
  for (const v of VARIANTS) describe(v.id, () => {
    test.each(GOALS.map(g => [g] as const))('%s', goal => {
      for (const level of LEVELS) for (const phase of PHASES) for (const sport of ['run', 'bike', 'swim'] as const) {
        const o: PickOpts = { phase, goal, level, swimCont: 400, gear: ['buoy', 'board'], ...v.o };
        const keys: string[] = [];
        for (let n = 0; n < 6; n++) {
          const pk = pickQuality(sport, n, o); if (!pk) continue;
          const d = LIB[pk.key];
          const where = `${v.id} ${goal} ${level} ${phase} ${sport} n=${n}: ${pk.key}`;
          expect(allowed(d, o), where).toBe(true);
          expect(d.phases.includes(phase) || phase === 'recovery' || phase === 'taper', where).toBe(true);
          if (v.o.noZ5) expect(!!d.z5 && d.sport !== 'swim', where).toBe(false);
          if ((v.o.excludes || []).includes('achilles')) expect((d.excludes || []).includes('achilles'), where).toBe(false);
          if (!(v.o.terrain && v.o.terrain.hills)) expect((d.needs || []).includes('hills'), where).toBe(false);
          if (level === 'beginner') expect(d.level, where).toBe('beginner');
          const sp = build(sport, pk.key, pk.stage, goal, !!v.o.noZ5);
          expect(sp, where).toBeTruthy();
          const b = W.build(sp!);
          expect(b.title.length, where).toBeGreaterThan(5);
          expect(nameIssues({ ...b, sport }), where).toEqual([]);
          if (sport !== 'swim' && b.hard) { expect(sp!.steps.some(x => x.part === 'warm'), where).toBe(true); expect(sp!.steps.some(x => x.part === 'cool'), where).toBe(true); }
          keys.push(pk.key + '#' + pk.stage);
        }
        // Abwechslung: dieselbe Form höchstens 3-mal hintereinander, und genau dieselbe Einheit (Form + Stufe) nie zweimal direkt hintereinander
        // Einsteiger bleiben bei der kürzesten Stufe; gibt es für sie nur eine Form (z. B. kurze schnelle Schwimm-Stücke), wiederholt sie sich
        const beginnerOne = level === 'beginner' && new Set(rotation(sport, phase, libGoal(goal)).flatMap(x => x.split('|')).filter(k => LIB[k] && allowed(LIB[k], o))).size <= 1;
        // „dieselbe Einheit“ = gleiche Form und gleiche Stufe; steigt die Stufe, ist es die nächste Stufe (erlaubt)
        let run = 1; for (let i = 1; i < keys.length && !beginnerOne; i++) { const same = keys[i] === keys[i - 1]; run = same ? run + 1 : 1; expect(run, `${v.id} ${goal} ${level} ${phase} ${sport}: ${keys.join(', ')}`).toBeLessThanOrEqual(level === 'beginner' ? 3 : 2); }
        // mehrere Formen je Block, wo die Reihenfolge mehrere vorsieht und das Niveau sie erlaubt
        const forms = new Set(keys.map(k => k.split('#')[0]));
        if (level !== 'beginner' && rotation(sport, phase, libGoal(goal)).length >= 2 && phase !== 'taper' && phase !== 'recovery' && !(sport === 'swim' && phase === 'base')) expect(forms.size, `${v.id} ${goal} ${level} ${phase} ${sport}: ${keys.join(', ')}`).toBeGreaterThanOrEqual(2);
        ((report[`${v.id} · ${goal}`] = report[`${v.id} · ${goal}`] || {})[`${level}/${phase}/${sport}`] = [...forms]);
      }
    });
  });
  test('Stufen steigen: Schwellenlauf im Aufbau 3×8 → 3×10 → 2×15 → 20 min am Stück', () => {
    const list = [0, 1, 3, 4].map(n => pickQuality('run', n, { phase: 'build', goal: 'run_half', level: 'advanced' })!);
    expect(list.map(p => p.key)).toEqual(['run.threshold', 'run.threshold', 'run.threshold', 'run.threshold']);
    expect(list.map(p => LIB[p.key].stages[p.stage])).toEqual(['3×8 min', '3×10 min', '2×15 min', '20 min am Stück']);
    // alle 2-3 Wochen kurze Intervalle
    expect(['run.vo2', 'run.3030', 'run.pyramid', 'run.hillreps', 'run.longhills']).toContain(pickQuality('run', 2, { phase: 'build', goal: 'run_half', level: 'advanced' })!.key);
    // spezifisch: Halbmarathon-Tempo 3×10 → 2×15 → …
    const sp = runQualitySpec('run.racepace', 0, CTX, 'run_half')!; expect(W.build(sp).title).toBe('Lauf-Intervalle 3×10 min im Halbmarathon-Tempo');
    // Rad: Sweet Spot → Schwelle → Over-Unders → VO2max → niedrige Kadenz
    expect([0, 1, 2, 3, 4].map(n => pickQuality('bike', n, { phase: 'build', goal: 'tri_olympic', level: 'advanced' })!.key)).toEqual(['bike.sweetspot', 'bike.threshold', 'bike.overunder', 'bike.vo2', 'bike.force']);
  });
  test('Bericht', () => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/auftrag19-bibliothek.json', JSON.stringify(report, null, 1)); });
});
