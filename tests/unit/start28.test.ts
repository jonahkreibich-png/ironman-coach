/* Auftrag 28: Die echte App startete bei Nutzer 1 seit 3.15.0 nicht mehr („Die App konnte nicht gestartet werden“).
   Ursache (nachgestellt in WebKit mit einer Kopie der echten Daten vom 7.11.):
   1. compactDecided() verkleinerte alte, entschiedene Coach-Vorschläge – und meldete schon verkleinerte bei jedem Aufruf erneut als
      „geändert“. afterCompute() speicherte deshalb bei jedem Berechnen von D().
   2. Seit 3.15.0 leert jedes Speichern (refreshStoredState → replaceState) den Zwischenspeicher von D(). D() gab danach `cache` zurück,
      das inzwischen null war → „null is not an object (evaluating 'e.today')“ in der Heute-Ansicht, bei jedem Start. */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { compactDecided } from '../../shared/coach/feed';

const DAY = 86400000;
const NOW = Date.parse('2026-11-07T10:00:00Z');
const decided = (id: string, at: number) => ({ id, at, from: 'coach', kind: 'proposal', title: 'Vorschlag', text: 'Lauf verschieben',
  proposal: { id: 'p-' + id, status: 'accepted', changes: [{ kind: 'adjust', key: 'a1', data: { what: 'Lauf → Mittwoch', id: 'a1', sessionId: 's1', type: 'move', to: '2026-10-29' } }] } });

describe('compactDecided ist idempotent', () => {
  test('verkleinert einmal, danach nie wieder (sonst speichert jeder Start und D() verliert seinen Wert)', () => {
    const once = compactDecided(decided('m1', NOW - 10 * DAY), NOW);
    expect(once?.proposal.compacted).toBe(true);
    expect(once?.proposal.changes).toEqual([{ kind: 'adjust', key: 'a1', data: { what: 'Lauf → Mittwoch' } }]);
    expect(compactDecided(once, NOW)).toBeNull();
  });
  test('alte Felder fehlen oder sind kaputt: kein Absturz, keine Änderung', () => {
    for (const m of [null, undefined, {}, { proposal: null }, { proposal: { status: 'accepted' } }, { proposal: { status: 'accepted', changes: 'x' } }, { at: 'gestern', proposal: { status: 'done', changes: [null, { data: null }] } }])
      expect(() => compactDecided(m, NOW)).not.toThrow();
    const noWhat = compactDecided({ at: NOW - 10 * DAY, proposal: { status: 'accepted', changes: [{ kind: 'adjust', key: 'x', data: {} }] } }, NOW);
    expect(compactDecided(noWhat, NOW)).toBeNull();
  });
  test('offene oder junge Vorschläge bleiben unverändert', () => {
    expect(compactDecided({ ...decided('m2', NOW - 10 * DAY), proposal: { ...decided('m2', 0).proposal, status: 'open' } }, NOW)).toBeNull();
    expect(compactDecided(decided('m3', NOW - 2 * DAY), NOW)).toBeNull();
  });
});

/* D() mit dem Zustand, der bei Nutzer 1 den Absturz auslöste: verkleinerte Vorschläge, Speichern ersetzt den Zustand */
const H = vi.hoisted(() => ({ replaced: [] as (() => void)[], saves: 0, state: {} as any }));
vi.mock('../../web/src/store', () => ({
  STATE: H.state, PLAN: { meta: {}, weeks: [] }, BASE_WEEKS: [], DAYS: [], SESS: [], findDay: () => null,
  profile: () => ({ sports: ['run', 'bike', 'swim'], thresholds: {}, birthYear: 1990 }), goals: () => [],
  effectiveCustomWorkouts: () => ({}),
  onStateReplaced: (fn: () => void) => { H.replaced.push(fn); },
  // wie in der echten App: Speichern liest den Speicher neu ein und ersetzt den Zustand → Zwischenspeicher wird geleert
  saveSoon: () => { H.saves++; H.replaced.forEach(f => f()); }
}));
vi.mock('../../web/src/util', () => ({ todayStr: () => '2026-11-07' }));

beforeEach(() => {
  vi.resetModules(); H.replaced.length = 0; H.saves = 0;
  Object.keys(H.state).forEach(k => delete H.state[k]);
  Object.assign(H.state, { sessions: {}, trend: [], illnessPeriods: [{ id: 'ill-1', start: '2026-10-30', end: '2026-10-31' }], settings: {}, coachMsgs: {}, customWorkouts: {}, activities: {}, adjustments: {}, nutrition: {} });
});

describe('D() liefert immer abgeleitete Daten', () => {
  test('auch wenn das Speichern in afterCompute den Zwischenspeicher leert (Zustand von Nutzer 1)', async () => {
    const c = compactDecided(decided('msg-prop-1', NOW - 14 * DAY), NOW);
    H.state.coachMsgs = { [c.id]: c, 'msg-prop-2': decided('msg-prop-2', NOW - 12 * DAY) };
    const { D } = await import('../../web/src/data');
    const d = D();
    expect(d).not.toBeNull();
    expect(d.today).toBe('2026-11-07');
    // der noch nicht verkleinerte wird einmal verkleinert und gespeichert, danach nichts mehr
    expect(H.state.coachMsgs['msg-prop-2'].proposal.compacted).toBe(true);
    const savesAfterFirst = H.saves;
    expect(D()?.today).toBe('2026-11-07');
    expect(D()?.today).toBe('2026-11-07');
    expect(H.saves).toBe(savesAfterFirst);
  });
});
