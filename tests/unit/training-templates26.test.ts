import { describe, expect, it, vi } from 'vitest';
import { makeTrainingTemplate, templateSession, applyTemplate, templateTotals, adaptStrengthTemplate, describeTrainingBlocks } from '../../shared/training-templates26';
const make = (sport = 'run', blocks: any[] = [{ name: 'Intervalle', repeat: 3, durationSec: 60, restSec: 30 }]) => makeTrainingTemplate({ id: 't', name: 'Test', sport, blocks });
describe('universal training templates', () => {
  it.each(['run', 'bike', 'swim', 'strength'])('%s counts work and rests between repetitions', sport => { expect(templateTotals(make(sport)).durationSec).toBe(240); });
  it('repeats ordered groups without doubling rests', () => {
    const t = make('swim', [{ name: 'Serie', repeat: 2, restSec: 60, blocks: [{ name: '100 m', repeat: 4, distanceM: 100, durationSec: 90, restSec: 20 }, { name: 'Locker', durationSec: 120 }] }]);
    expect(templateTotals(t)).toMatchObject({ durationSec: 1140, distanceM: 800, unknownDuration: false });
  });
  it('never invents time for distance-only swimming or strength reps', () => {
    expect(templateTotals(make('swim', [{ name: 'Bahn', distanceM: 100 }]))).toMatchObject({ durationSec: null, unknownDuration: true, distanceM: 100 });
    expect(templateTotals(make('strength', [{ name: 'Squat', sets: 3, reps: '10', restSec: 60 }]))).toMatchObject({ durationSec: null, knownDurationSec: 120 });
  });
  it('counts strength sets and explicit per-set work', () => { expect(templateTotals(make('strength', [{ name: 'Squat', sets: 3, reps: '10', durationSec: 40, restSec: 60 }])).durationSec).toBe(240); });
  it('labels time derived from pace as estimated', () => {
    expect(templateTotals(make('run', [{ name: 'Lauf', distanceM: 2000, paceSecPerKm: 300 }]))).toMatchObject({ durationSec: 600, estimated: true });
    expect(templateTotals(make('bike', [{ name: 'Rad', distanceM: 10000, speedKmh: 30 }])).durationSec).toBe(1200);
  });
  it('validates sports, prescriptions and nonempty blocks', () => {
    expect(() => make('football')).toThrow();
    expect(() => make('run', [{ name: 'Wrong', kg: 20, durationSec: 30 }])).toThrow();
    expect(() => make('strength', [{ name: 'Wrong', distanceM: 20 }])).toThrow();
    expect(() => make('run', [{ name: 'Wrong', repeat: 0, durationSec: 20 }])).toThrow();
    expect(() => make('run', [])).toThrow();
  });
  it('creates independent snapshots', () => {
    const t = make(); const s = templateSession(t, 'new'); t.blocks[0].name = 'Changed';
    expect(s.trainingBlocks[0].name).toBe('Intervalle'); s.trainingBlocks[0].name = 'Individual'; expect(t.blocks[0].name).toBe('Changed'); expect(s.id).toBe('new');
  });
  it('replaces planned fields with same ID and untouched actuals', () => {
    const s: any = { id: 'old', sport: 'run', title: 'Old', plannedMinutes: 30, description: 'Old text', metrics: { duration: 17 }, actualMinutes: 17, completed: false, spec: { old: true } };
    const result = applyTemplate(s, make(), 'replace');
    expect(result).toMatchObject({ id: 'old', plannedMinutes: 4, metrics: { duration: 17 }, actualMinutes: 17, spec: null }); expect(result.description).not.toContain('Old text'); expect(s.title).toBe('Old'); result.metrics.duration = 99; expect(s.metrics.duration).toBe(17);
  });
  it('appends original content once and sums duration', () => {
    const s: any = { id: 'old', sport: 'run', title: 'Old', description: 'Original text', plannedMinutes: 20, plannedKm: 2 };
    const result = applyTemplate(s, make(), 'append'); expect(result.plannedMinutes).toBe(24); expect(result.description.match(/Original text/g)).toHaveLength(1); expect(result.trainingBlocks).toHaveLength(2); expect(templateTotals({ ...make(), blocks: result.trainingBlocks }).durationSec).toBe(1440);
  });
  it('never converts missing duration to zero', () => {
    expect(applyTemplate({ id: 'old', sport: 'swim', title: 'Old', plannedMinutes: 20 }, make('swim', [{ name: '100m', distanceM: 100 }]), 'append').plannedMinutes).toBeNull();
    expect(applyTemplate({ id: 'old', sport: 'run', title: 'Old' }, make(), 'append').plannedMinutes).toBeNull();
  });
  it('rejects completed and cross-sport append', () => {
    expect(() => applyTemplate({ id: 'old', sport: 'run', completed: true }, make(), 'replace')).toThrow(); expect(() => applyTemplate({ id: 'old', sport: 'bike' }, make(), 'append')).toThrow();
  });
  it('adapts legacy strength read-only preserving original prescriptions', () => {
    const legacy = { id: 's', name: 'Kraft', updatedAt: 123, exercises: [{ name: 'Squat', sets: 3, reps: '8–12', kg: 27.5, restSec: 45 }] }; const before = JSON.stringify(legacy); const t = adaptStrengthTemplate(legacy);
    expect(t).toMatchObject({ readOnly: true, legacyId: 's', sport: 'strength' }); expect(t.blocks[0]).toMatchObject(legacy.exercises[0]); expect(templateTotals(t).durationSec).toBeNull(); t.blocks[0].kg = 100; expect(JSON.stringify(legacy)).toBe(before);
  });
});

describe('all sports snapshot regression', () => {
  it.each(['run', 'bike', 'swim', 'strength'])('%s replaces/appends on same ID and preserves actual journal', sport => {
    const template = make(sport);
    const original = { id: 'stable', sport, title: 'Original', description: 'Keep once', plannedMinutes: 10, completed: false, metrics: { min: 7, exercises: [{ name: 'Done', reps: 9 }] }, actualMinutes: 7, notes: 'Historic actual', rpe: 3 };
    const before = JSON.stringify(original);
    const replaced = applyTemplate(original, template, 'replace');
    const appended = applyTemplate(original, template, 'append');
    expect(replaced.id).toBe('stable'); expect(appended.id).toBe('stable');
    expect(replaced.plannedMinutes).toBe(4); expect(appended.plannedMinutes).toBe(14);
    for (const result of [replaced, appended]) {
      expect(result.metrics).toEqual(original.metrics); expect(result.notes).toBe(original.notes); expect(result.actualMinutes).toBe(7); expect(result.rpe).toBe(3);
      result.trainingBlocks.at(-1).name = 'Changed individual';
      expect(template.blocks[0].name).toBe('Intervalle');
    }
    expect(JSON.stringify(original)).toBe(before);
  });
  it('keeps full snapshot after append independently editable', () => {
    const first = makeTrainingTemplate({ id: 'a', name: 'First', sport: 'run', description: 'First instructions', blocks: [{ name: 'Warmup', durationSec: 300 }] });
    const second = makeTrainingTemplate({ id: 'b', name: 'Second', sport: 'run', description: 'Second instructions', blocks: [{ name: 'Main', durationSec: 600 }] });
    const result = applyTemplate(templateSession(first, 'stable'), second, 'append');
    expect(result.trainingTemplateSnapshot.blocks).toEqual(result.trainingBlocks);
    expect(result.trainingTemplateSnapshot.description).toBe('First instructions\nSecond instructions');
    result.trainingTemplateSnapshot.blocks[0].name = 'Snapshot changed';
    expect(result.trainingBlocks[0].name).toBe('Warmup');
    expect(first.blocks[0].name).toBe('Warmup');
  });
});


const durableMock = vi.hoisted(() => ({ settled: vi.fn(async () => true) }));
vi.mock('../../web/src/persistence', () => ({ storage: durableMock, storageMessage: () => 'Storage error' }));
const editorState = vi.hoisted(() => ({ workoutTemplates: {} as Record<string, any> }));
vi.mock('../../web/src/store', () => ({ STATE: editorState, PLAN: { weeks: [] }, saveState: () => false }));
vi.mock('../../web/src/nav', () => ({ nav: { rerender() {} } }));
vi.mock('../../web/src/toast', () => ({ toast() {} }));
vi.mock('../../web/src/views/planedit', () => ({ propose() {} }));
describe('sport-specific pace editor', () => {
  it('shows swim seconds per 100 m, stores normalized pace, and reopens without drift', async () => {
    const panel = { innerHTML: '', scrollTop: 0 }; const sheet = { hidden: true };
    const fields: Record<string, string> = { 'tpl-name': 'Swim', 'tpl-description': '', 'tpl-sport': 'swim' };
    vi.stubGlobal('document', {
      querySelector: (q: string) => q === '#sheetPanel' ? panel : sheet,
      getElementById: (id: string) => ({ value: fields[id] || '' }),
      querySelectorAll: () => [{ value: '125,5', dataset: { tplPath: '0', tplKey: 'paceSecPerKm', tplScale: '10' } }],
      body: { style: { overflow: '' } }
    });
    try {
      const { editTrainingTemplate, renderTrainingTemplates } = await import('../../web/src/views/templates');
      expect(renderTrainingTemplates()).toContain('data-act="go-sub" data-sub="strength">Bestehende Kraftvorlagen bearbeiten');
      const { ACTIONS } = await import('../../web/src/kit');
      const template = makeTrainingTemplate({ id: 'swim-editor', name: 'Swim', sport: 'swim', blocks: [{ name: '400 m', distanceM: 400, paceSecPerKm: 1200 }] });
      editTrainingTemplate(template);
      expect(panel.innerHTML).toContain('Pace (Sekunden/100 m), optional');
      expect(panel.innerHTML).toMatch(/id="tpl-0-paceSecPerKm"[^>]*value="120"/);
      expect(panel.innerHTML).not.toContain('Sekunden pro Kilometer');
      let release!: (value: boolean) => void;
      durableMock.settled.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; }));
      const saving = ACTIONS['tpl-save']({} as HTMLElement, {} as Event);
      expect(editorState.workoutTemplates['swim-editor']).toBeDefined();
      expect(sheet.hidden).toBe(false);
      release(true); await saving;
      const saved = editorState.workoutTemplates['swim-editor'];
      expect(saved.blocks[0].paceSecPerKm).toBe(1255);
      expect(templateTotals(saved).durationSec).toBe(502);
      expect(describeTrainingBlocks(saved.blocks, 0, 'swim')).toContain('125.5 s/100 m');
      expect(templateSession(saved, 'preview').description).toContain('125.5 s/100 m');
      editTrainingTemplate(saved);
      expect(panel.innerHTML).toMatch(/id="tpl-0-paceSecPerKm"[^>]*value="125.5"/);
      editTrainingTemplate(makeTrainingTemplate({ id: 'run-editor', name: 'Run', sport: 'run', blocks: [{ name: 'Run', distanceM: 1000, paceSecPerKm: 300 }] }));
      expect(panel.innerHTML).toContain('Pace (Sekunden/km), optional');
      expect(panel.innerHTML).toMatch(/id="tpl-0-paceSecPerKm"[^>]*value="300"/);
      let finishDelete!: (value: boolean) => void;
      durableMock.settled.mockImplementationOnce(() => new Promise<boolean>(resolve => { finishDelete = resolve; }));
      const removing = ACTIONS['tpl-delete']({ dataset: { id: 'swim-editor', armed: '1' } } as any, {} as Event);
      expect(editorState.workoutTemplates['swim-editor']).toBeUndefined();
      finishDelete(true); await removing;
      expect(editorState.workoutTemplates['swim-editor']).toBeUndefined();
      durableMock.settled.mockResolvedValueOnce(false);
      await ACTIONS['tpl-save']({} as HTMLElement, {} as Event);
      expect(editorState.workoutTemplates['run-editor']).toBeDefined();
      expect(sheet.hidden).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});


describe('append generated prescriptions', () => {
  it('keeps generated 6 x 1km intervals structured, editable and lossless', () => {
    const spec: any = { sport: 'run', kind: 'intervals', ctx: { runThrSec: 300 }, coachingExtension: { original: true }, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', reps: 6, m: 1000, min: 5, restMin: 2, zone: 4, note: 'Even pacing', externalField: { value: 42 } }, { part: 'cool', min: 10, zone: 1 }] };
    const source: any = { id: 'generated', sport: 'run', title: '6 x 1 km', description: 'Original full instructions', plannedMinutes: 60, plannedKm: 10, spec, metrics: { min: 20, intervals: [{ km: 1, sec: 290 }] } };
    const before = JSON.stringify(source);
    const added = makeTrainingTemplate({ id: 'cool', name: 'Extra cooldown', sport: 'run', blocks: [{ name: 'Cooldown', durationSec: 300 }] });
    const result = applyTemplate(source, added, 'append');
    expect(result.trainingBlocks).toHaveLength(4);
    expect(result.trainingBlocks[1]).toMatchObject({ repeat: 6, distanceM: 1000, durationSec: 300, restSec: 120, intensity: 'Zone 4', description: 'Even pacing', sourceStep: spec.steps[1] });
    expect(result.trainingTemplateSnapshot.sourceSpec).toEqual(spec);
    expect(result.plannedMinutes).toBe(65);
    expect(templateTotals({ blocks: result.trainingBlocks }).durationSec).toBe(3900);
    const editable = makeTrainingTemplate({ ...result.trainingTemplateSnapshot, id: 'editable' });
    expect(editable.blocks[1].sourceStep.externalField).toEqual({ value: 42 });
    editable.blocks[1].durationSec = 240;
    expect(templateTotals(editable).durationSec).toBe(3540);
    expect(result.metrics).toEqual(source.metrics); expect(result.id).toBe(source.id); expect(JSON.stringify(source)).toBe(before);
  });
  it('preserves running/walking cycle', () => {
    const walk: any = { id: 'walk', sport: 'run', title: 'Run/walk', plannedMinutes: 12, spec: { sport: 'run', kind: 'runwalk', ctx: {}, steps: [{ part: 'main', reps: 4, min: 2, walkMin: 1, zone: 2 }] } };
    const result = applyTemplate(walk, make('run', [{ name: 'Extra', durationSec: 60 }]), 'append');
    expect(result.trainingBlocks[0]).toMatchObject({ repeat: 4, blocks: [{ durationSec: 120 }, { durationSec: 60 }] });
    expect(templateTotals({ blocks: result.trainingBlocks }).durationSec).toBe(780);
  });
});


describe('generated swimming precision', () => {
  it('preserves supplied swim pace and explicit series changes without faking rounded duration', () => {
    const source = { id: 'swim-generated', sport: 'swim', title: 'Swim', plannedMinutes: 8, plannedKm: 0.3, spec: { sport: 'swim', kind: 'endurance', ctx: { css: 120 }, steps: [{ part: 'warm', m: 100, zone: 1, mode: 'crawl' }, { part: 'main', reps: 2, m: 100, zone: 2, restSec: 30, mode: 'crawl', gear: ['buoy'] }] } };
    const result = applyTemplate(source, make('swim', [{ name: 'Extra', durationSec: 60 }]), 'append');
    expect(result.trainingBlocks[0].paceSecPerKm).toBe(1350);
    expect(result.trainingBlocks[1]).toMatchObject({ name: 'Serienwechsel', durationSec: 30 });
    expect(result.trainingBlocks[2]).toMatchObject({ repeat: 2, distanceM: 100, paceSecPerKm: 1280, restSec: 30, equipment: ['buoy'] });
    expect(templateTotals({ blocks: result.trainingBlocks }).durationSec).toBe(511);
    expect(result.plannedMinutes).toBe(9); expect(result.plannedDurationEstimated).toBe(true);
    expect(result.trainingTemplateSnapshot.sourcePlannedMinutes).toBe(8);
  });
});



describe('preserved generated summaries', () => {
  it('keeps advertised rounded time and aggregate distance through unchanged editor and repeated append', () => {
    const original: any = { id: 'source', sport: 'run', title: 'Run', plannedMinutes: 10, plannedKm: 6, spec: { sport: 'run', kind: 'easy', ctx: {}, steps: [{ part: 'main', min: 9.5, zone: 2 }] } };
    const t = make('run', [{ name: 'Extra', durationSec: 300 }]);
    const once = applyTemplate(original, t, 'append');
    const roundtrip = templateSession(makeTrainingTemplate(once.trainingTemplateSnapshot), original.id);
    expect(roundtrip.plannedMinutes).toBe(15); expect(roundtrip.plannedKm).toBe(6);
    const twice = applyTemplate(roundtrip, t, 'append');
    expect(twice.plannedMinutes).toBe(20); expect(twice.plannedKm).toBe(6);
    const unchanged = templateSession(makeTrainingTemplate(twice.trainingTemplateSnapshot), original.id);
    expect(unchanged.plannedMinutes).toBe(20); expect(unchanged.plannedKm).toBe(6);
    const edited = structuredClone(twice.trainingTemplateSnapshot); edited.blocks[0].durationSec = 1200;
    const updated = templateSession(makeTrainingTemplate(edited), original.id);
    expect(updated.plannedMinutes).toBe(30); expect(updated.plannedKm).toBeNull();
    edited.blocks[0].durationSec = -5; expect(() => makeTrainingTemplate(edited)).toThrow();
  });
  it('keeps generated strength exercises editable inside labelled shared time budget', () => {
    const original: any = { id: 'strength-source', sport: 'strength', title: 'Kraft', plannedMinutes: 30, spec: { sport: 'strength', kind: 'strength', ctx: {}, steps: [{ part: 'warm', min: 5 }, { part: 'main', min: 25 }], exercises: [{ name: 'Squat', sets: 3, reps: '8–12', kg: 25, restSec: 60, note: 'Stable' }, { name: 'Plank', sets: 2, reps: '45 s' }] } };
    const result = applyTemplate(original, make('strength', [{ name: 'Extra', durationSec: 300 }]), 'append');
    expect(result.trainingBlocks[1]).toMatchObject({ timeBudgetSec: 1500, blocks: [{ name: 'Squat', sets: 3, reps: '8–12', kg: 25, restSec: 60 }, { name: 'Plank', sets: 2, reps: '45 s' }] });
    expect(templateTotals({ blocks: result.trainingBlocks })).toMatchObject({ durationSec: 2100, estimated: true });
    const validated = makeTrainingTemplate(result.trainingTemplateSnapshot);
    expect(validated.blocks[1].blocks[0].name).toBe('Squat');
    expect(templateSession(validated, original.id).plannedMinutes).toBe(35);
    expect(describeTrainingBlocks(validated.blocks, 0, 'strength')).toContain('Zeitbudget');
  });
});



it('keeps generated-session instructions in the editable snapshot after appending',()=>{
 const original={id:'generated',sport:'run',title:'Generated',description:'SYNTHETIC konkrete Originalanweisung',plannedMinutes:10,spec:{sport:'run',steps:[{part:'main',min:10,zone:2}]}};
 const result=applyTemplate(original,makeTrainingTemplate({id:'extra',sport:'run',name:'Extra',description:'SYNTHETIC Zusatzanweisung',blocks:[{name:'Extra',durationSec:60}]}),'append');
 expect(result.trainingTemplateSnapshot.description).toContain(original.description);
 expect(result.trainingTemplateSnapshot.description).toContain('SYNTHETIC Zusatzanweisung');
 expect(templateSession(result.trainingTemplateSnapshot,result.id).description).toContain(original.description);
});
