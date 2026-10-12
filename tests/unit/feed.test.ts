/* Auftrag 5 D8: alte Nachrichten verschwinden, Wichtiges bleibt. */
import { test, expect } from 'vitest';
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
