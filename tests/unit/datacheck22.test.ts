/* Auftrag 22, Punkt 3: Eingaben prüfen (Grenzen, Rückfragen, Import) und der tägliche Daten-Check für alle Nutzer. */
import { test, expect, describe } from 'vitest';
import { checkField, crossCheck, applyDoubtFix, cleanImported } from '../../shared/validate';
import { dataCheck, summarize } from '../../shared/datacheck';
import { metricsFromActivity } from '../../shared/activity/merge';
import { actualMetrics } from '../../shared/results';

describe('Eingaben prüfen', () => {
  test('Puls 30-230, RPE 1-10, Komma und Punkt, Pace-Format', () => {
    expect(checkField('run', 'hr', '150').ok).toBe(true);
    expect(checkField('run', 'hr', '250')).toMatchObject({ ok: false, msg: expect.stringMatching(/Puls 250 ist unrealistisch \(möglich: 30 bis 230\)/) });
    expect(checkField('run', 'hr', '12')).toMatchObject({ ok: false });
    expect(checkField('run', 'rpe', '11').msg).toMatch(/1 \(sehr leicht\) bis 10/);
    expect(checkField('run', 'km', '10,5')).toMatchObject({ ok: true, value: '10.5' });
    expect(checkField('run', 'km', '10.5')).toMatchObject({ ok: true, value: '10.5' });
    expect(checkField('run', 'km', 'zehn').ok).toBe(false);
    expect(checkField('run', 'pace', '5:30')).toMatchObject({ ok: true, value: '5:30' });
    expect(checkField('run', 'pace', '530')).toMatchObject({ ok: true, value: '5:30' });
    expect(checkField('run', 'pace', '1:10').ok).toBe(false);
    expect(checkField('run', 'pace', '5:75').ok).toBe(false);
    expect(checkField('swim', 'pace100', '2:30').ok).toBe(true);
    expect(checkField('bike', 'speed', '120').ok).toBe(false);
    expect(checkField('run', 'hr', '').ok).toBe(true);
    expect(checkField('run', 'shoe', 'Pegasus 40').ok).toBe(true);
  });
  test('Rückfrage: 200 km in 30 min? Meintest du 20 km?', () => {
    const d = crossCheck('bike', { km: '200', min: '30' });
    expect(d[0].text).toMatch(/200 km in 30 min .*Meintest du 20 km\?/);
    expect(applyDoubtFix({ km: '200', min: '30' }, d[0].fix!.key, d[0].fix!.value)).toMatchObject({ km: '20' });
    expect(crossCheck('run', { km: '10', min: '1' })[0].text).toMatch(/Meintest du/);
  });
  test('Puls über max. Puls: Rückfrage mit „Tauschen“; Distanz 0 bei 60 min', () => {
    const d = crossCheck('run', { hr: '170', maxHr: '150' });
    expect(d[0]).toMatchObject({ key: 'hr>max', severe: true });
    expect(applyDoubtFix({ hr: '170', maxHr: '150' }, 'swapHr', '')).toMatchObject({ hr: '150', maxHr: '170' });
    expect(crossCheck('run', { km: '0', min: '60' })[0].key).toBe('dist0');
    expect(crossCheck('run', { km: '10', min: '55', hr: '150', maxHr: '170' })).toEqual([]);
    expect(crossCheck('swim', { meters: '3000', min: '10' })[0].text).toMatch(/Weltrekord.*Meintest du 300 m/);
  });
  test('Import: unmögliche Werte werden nicht übernommen (Uhr ohne GPS: 0 km, Pulsgurt 255)', () => {
    expect(cleanImported('run', { min: 40, km: 0, hr: 255, maxHr: 170 }).metrics).toEqual({ min: 40, maxHr: 170 });
    expect(cleanImported('bike', { min: 30, km: 200 }).metrics).toEqual({ min: 30 });
    const a: any = { id: 'x', sport: 'football', source: 'healthfit', min: 60, km: 0, avgHr: 150, maxHr: 175, laps: [], swim: null };
    expect(metricsFromActivity(a)).not.toHaveProperty('km');
    // schon gespeicherter Importwert 0 km zählt nicht, von Hand eingetragen bleibt er
    expect(actualMetrics({ metrics: { km: '0', min: '60' }, metricsSrc: { km: 'healthfit' } }, a).km).toBeNull();
  });
});

const plan = (sessions: any[]) => [{ weekNumber: 1, days: [{ date: '2026-10-26', sessions }] }];
describe('Täglicher Daten-Check', () => {
  const base = { profile: { thresholds: {}, sports: ['run'] }, goals: [], today: '2026-10-27' };
  test('widersprüchliche Werte werden gemeldet, ohne Gesundheitswerte im Text', () => {
    const r = dataCheck({ ...base, baseWeeks: plan([{ id: 's1', sport: 'run', title: 'Lauf', plannedMinutes: 40 }]), state: { sessions: { s1: { completed: true, metrics: { hr: '172', maxHr: '160', km: '8', min: '40' }, metricsSrc: { hr: 'manual', maxHr: 'manual' } } } } });
    const f = r.findings.find(x => x.group === 'values')!;
    expect(f.text).toMatch(/Ø Puls über max. Puls/); expect(f.text).not.toMatch(/172|160/);
    expect(r.fixes).toEqual([]);
  });
  test('Distanz 0 mit Dauer 60 (von Hand) wird gemeldet', () => {
    const r = dataCheck({ ...base, baseWeeks: plan([{ id: 's1', sport: 'run', title: 'Lauf', plannedMinutes: 60 }]), state: { sessions: { s1: { completed: true, metrics: { km: '0', min: '60' }, metricsSrc: { km: 'manual', min: 'manual' } } } } });
    expect(r.findings.some(x => x.group === 'values')).toBe(true);
  });
  test('doppelte Meldungen und doppelte Extra-Einheiten: sicher entfernt; zwei nicht zusammengeführte Aufzeichnungen: gemeldet', () => {
    const msg = (id: string) => ({ id, kind: 'warning', title: 'Schwimmen: bitte prüfen', text: 'Gleicher Text', date: '2026-10-26', at: 1 });
    const act = (id: string, ms: number) => ({ id, sport: 'run', date: '2026-10-26', startMs: ms, min: 40 });
    const w = { id: 'c1', date: '2026-10-26', sport: 'bike', title: 'Rad', metrics: { min: '30' }, completed: true };
    const state: any = {
      sessions: { s1: { completed: true, activityId: 'a1', metrics: { min: '40' } } },
      coachMsgs: { m1: msg('m1'), m2: msg('m2'), m3: msg('m3') },
      activities: { a1: act('a1', 1e12), a2: act('a2', 1e12 + 60000) },
      customWorkouts: { '2026-10-26': [w, { ...w, id: 'c2' }, { id: 'c3', date: '2026-10-26', sport: 'run', activityId: 'a1', auto: true, metrics: { min: '40' }, metricsSrc: { min: 'healthfit' } }] }
    };
    const r = dataCheck({ ...base, baseWeeks: plan([{ id: 's1', sport: 'run', title: 'Lauf', plannedMinutes: 40 }]), state });
    expect(r.fixes.filter(f => f.kind === 'coachMsg')).toHaveLength(2);
    expect(r.fixes.filter(f => f.kind === 'custom').map(f => f.key).sort()).toEqual(['c2', 'c3']);
    expect(r.findings.some(f => /zwei Aufzeichnungen derselben Einheit/.test(f.text))).toBe(true);
    expect(summarize(r.findings).find(g => g.group === 'duplicates')!.fixed).toBe(2);
  });
  test('Extra-Einheit mit eigenen Einträgen wird nie gelöscht, nur gemeldet', () => {
    const state: any = { sessions: { s1: { completed: true, activityId: 'a1' } }, activities: { a1: { id: 'a1', sport: 'run', date: '2026-10-26', startMs: 1 } },
      customWorkouts: { '2026-10-26': [{ id: 'c3', date: '2026-10-26', sport: 'run', activityId: 'a1', auto: true, description: 'mit Papa', metrics: {} }] } };
    const r = dataCheck({ ...base, baseWeeks: plan([{ id: 's1', sport: 'run', title: 'Lauf' }]), state });
    expect(r.fixes).toEqual([]);
  });
  test('verwaiste Anpassungen: eine Zeile mit Anzahl, nichts gelöscht', () => {
    const state: any = { sessions: {}, adjustments: { a: { id: 'a', type: 'modify', sessionId: 'alt-1', set: {} }, b: { id: 'b', type: 'cancel', sessionId: 'alt-2' }, c: { id: 'c', type: 'modify', sessionId: 's1', set: {} } } };
    const r = dataCheck({ ...base, baseWeeks: plan([{ id: 's1', sport: 'run', title: 'Lauf' }]), state });
    const o = r.findings.filter(f => f.group === 'orphans');
    expect(o).toHaveLength(1); expect(o[0].text).toMatch(/2 Anpassungen/); expect(r.fixes).toEqual([]);
  });
  test('leerer neuer Nutzer: keine Befunde, kein Absturz', () => {
    expect(dataCheck({ ...base, baseWeeks: [], state: {} })).toEqual({ findings: [], fixes: [] });
  });
});
