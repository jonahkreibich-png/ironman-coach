/* Auftrag 5 D8: alte Nachrichten verschwinden, Wichtiges bleibt. */
import { test, expect, describe } from 'vitest';
import { arrangeFeed, searchMsgs } from '../../shared/coach/feed';

const NOW = Date.parse('2026-10-21T08:00:00Z'); const D = 86400000;
const m = (id: string, ageDays: number, o: any = {}) => ({ id, at: NOW - ageDays * D, date: '', kind: 'briefing', from: 'coach', text: 'Text ' + id, ...o });
test('Briefings nach 7 Tagen im Archiv, mit 3 Tagen Einstellung früher; Offenes, Ungelesenes, Angeheftetes bleibt', () => {
  const msgs = [m('alt', 9), m('neu', 2), m('pin', 20, { pinned: true }), m('prop', 20, { kind: 'proposal', proposal: { status: 'open' } }), m('ungelesen', 10, { at: NOW - 10 * D })];
  const r = arrangeFeed(msgs.map(x => x.id === 'alt' ? { ...x, read: true } : x), NOW, NOW - 11 * D, 7);
  const shown = r.feed.map(f => f.ids[0]);
  expect(shown).toEqual(expect.arrayContaining(['neu', 'pin', 'prop', 'ungelesen']));
  expect(shown).not.toContain('alt');
  expect(r.archived.map(x => x.id)).toEqual(['alt']);
  expect(arrangeFeed([m('a', 4)], NOW, NOW, 3).feed).toEqual([]);
  expect(arrangeFeed([m('a', 4)], NOW, NOW, 14).feed.length).toBe(1);
});
test('erledigtes Gespräch nach 3 Tagen als eine Zeile', () => {
  const t = NOW - 4 * D;
  const msgs = [{ id: 'u', at: t, from: 'user', kind: 'user', text: 'Ich hab Mittwoch keine Zeit' }, { id: 'a', at: t + 1000, from: 'coach', kind: 'answer', chat: true, pendingOpen: true, options: [{ label: 'Samstag', say: 'Samstag' }], text: 'Soll ich den Lauf auf Donnerstag oder Samstag legen?' }, { id: 'u2', at: t + 5000, from: 'user', kind: 'user', text: 'Samstag' }, { id: 'a2', at: t + 6000, from: 'coach', kind: 'answer', chat: true, text: 'Erledigt: Lauf liegt jetzt am Samstag 24.10.' }];
  const r = arrangeFeed(msgs, NOW, NOW, 7);
  expect(r.feed.filter(f => f.type === 'line').map(f => f.line)).toEqual(['Sa: Lauf liegt jetzt am Samstag 24.10.']);
  // frische Gespräche bleiben ganz sichtbar
  expect(arrangeFeed(msgs.map(x => ({ ...x, at: x.at + 3 * D })), NOW, NOW, 7).feed.every(f => f.type === 'msg')).toBe(true);
});
test('Verlauf findet auch Archiviertes', () => {
  expect(searchMsgs([m('x', 30, { text: 'Lauf auf Samstag verschoben' }), m('y', 1)], 'samstag').map(x => x.id)).toEqual(['x']);
});

/* Auftrag 21: „Schwimmen: bitte prüfen“ kam am 22.10. neunmal. Jede Meldung höchstens einmal je Anlass, für alle Meldungsarten. */
import { duplicateMsgIds, dedupeIncoming, occasionKey } from '../../shared/coach/feed';
import { dedupeMsgChanges } from '../../server/src/coach';
describe('Auftrag 21: keine doppelten Coach-Meldungen', () => {
  const at0 = Date.parse('2026-10-22T06:46:00Z');
  const legacy = (i: number, status = 'open') => ({ id: 'msg-swim-legacy-results-v1-' + i, at: at0 + i * 1000, date: '2026-10-22', kind: 'proposal', from: 'coach', title: 'Schwimmen: bitte prüfen',
    text: 'Bitte prüfen: Im Profil stehen 100 m Kraul am Stück; die aktuellen Ergebnisse belegen höchstens 50 m.', proposal: { status, changes: [] } });
  test('neun gleiche Meldungen: eine bleibt sichtbar, acht werden aufgeräumt', () => {
    const all = Array.from({ length: 9 }, (_, i) => legacy(i));
    expect(duplicateMsgIds(all)).toHaveLength(8);
    expect(arrangeFeed(all, at0 + 3600e3, 0).feed.filter(f => f.type === 'msg')).toHaveLength(1);
  });
  test('die entschiedene Fassung bleibt (angenommen/abgelehnt vor offen)', () => {
    const all = [legacy(0), legacy(1, 'rejected'), legacy(2)];
    expect(duplicateMsgIds(all).sort()).toEqual([all[0].id, all[2].id].sort());
  });
  test('Gespräche und unterschiedliche Tage sind nie Duplikate', () => {
    const u = (i: number) => ({ id: 'u' + i, at: at0 + i, from: 'user', text: 'ok' });
    expect(duplicateMsgIds([u(1), u(2)])).toEqual([]);
    expect(occasionKey({ ...legacy(0), date: '2026-10-23' })).not.toBe(occasionKey(legacy(0)));
    expect(duplicateMsgIds([legacy(0), { ...legacy(1), date: '2026-10-23' }])).toEqual([]);
  });
  test('Server speichert eine neue gleiche Meldung unter anderer Id nicht und löscht alte Duplikate', () => {
    const existing: any = { [legacy(1).id]: legacy(1), [legacy(2).id]: legacy(2) };
    const out = dedupeMsgChanges(existing, [{ kind: 'coachMsg', key: 'c', data: { ...legacy(3), id: 'c' }, updatedAt: 1 }, { kind: 'adjust', key: 'x', data: {}, updatedAt: 1 }], 10);
    expect(out.find(c => c.key === 'c')).toBeUndefined();
    expect(out.find(c => c.kind === 'adjust')).toBeTruthy();
    expect(out.filter(c => c.deleted).map(c => c.key)).toEqual([legacy(2).id]);
    expect(dedupeIncoming({}, [legacy(5)]).keep).toHaveLength(1);
  });
});
