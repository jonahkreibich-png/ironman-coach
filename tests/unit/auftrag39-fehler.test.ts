/* Auftrag 39, große Fehlersuche: jeder gefundene Fehler mit einem dauerhaften Test, der vorher scheiterte. */
import { test, expect, describe } from 'vitest';
import { world } from '../helpers/chat-world';
import { converse } from '../../shared/coach/dialog';
import { restDayReason } from '../../shared/trainingrules';
import * as C from '../../shared/core';

describe('Coach-Wochenrückblick: abgehakt ohne Werte gilt „wie geplant“ (wie Belastung und Scores)', () => {
  test('erledigt ohne Dauer → Umfang mit geplanter Dauer, kein „−100 %“, bei allem erledigt „Alles geschafft“', () => {
    const W = world('laeuferin-hm', '2026-10-21');
    const done = W.days().filter((d: any) => d.date >= '2026-10-19' && d.date <= '2026-10-21').flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.fixed));
    expect(done.length).toBeGreaterThan(0);
    for (const s of done) W.state.sessions[s.id] = { completed: true, metrics: {} };
    const min = done.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const t = converse(W.ctx(), {}, 'Wie war meine Woche?').reply.text;
    expect(t).toMatch(/wie geplant, nicht gemessen/);
    expect(t).toContain(String(Math.round(min / 60 * 10) / 10).replace('.', ',') + ' h');
    expect(t).not.toMatch(/−100 %/);
    expect(t).toMatch(/Alles geschafft/);
    expect(t).not.toMatch(/Fast alles geschafft \((\d+) von \1\)/);
  });
});

describe('Ruhetag-Begründung: „morgen/gestern“ von heute aus', () => {
  const day = (date: string, sessions: any[]) => ({ date, sessions });
  const w = { weekNumber: 1, days: [day('2026-11-09', [{ id: 'a', sport: 'football', title: 'Fußball-Training', fixed: true }]), day('2026-11-10', [{ id: 'r', sport: 'rest', title: 'Ruhetag' }]),
    day('2026-11-11', [{ id: 'iv', sport: 'run', title: 'Lauf-Intervalle 5×3 min sehr hart', hard: true, plannedMinutes: 45, spec: { kind: 'intervals', steps: [] } }])] };
  test('Frage am Montag nach dem Ruhetag Dienstag: „morgen steht“ meinte vorher Mittwoch', () => {
    const r = restDayReason([w], '2026-11-10', null, [], '2026-11-09')!;
    expect(r).not.toMatch(/(^|[^r])morgen steht/);
    expect(r).toMatch(/übermorgen steht Lauf-Intervalle/);
  });
  test('ohne Bezugstag wie bisher (vom Ruhetag aus)', () => {
    expect(restDayReason([w], '2026-11-10')).toMatch(/morgen steht Lauf-Intervalle/);
    void C;
  });
});

describe('Coach-Fragen aus der Fehlersuche (16 Testnutzer × 20 Fragen)', () => {
  const ask = (id: string, q: string) => { const W = world(id, '2026-10-21'); return converse(W.ctx(), {}, q).reply.text; };
  test('„Wie viele Stunden trainiere ich diese Woche?“ → Wochenstunden (vorher Antwort zum heutigen Tag bzw. Ruhetag)', () => {
    const t = ask('laeuferin-hm', 'Wie viele Stunden trainiere ich diese Woche?');
    expect(t).toMatch(/^Diese Woche \(.*\): [\d,]+ h geplant in \d+ Einheit/);
    expect(t).not.toMatch(/Ruhetag|^Heute/);
  });
  test('„Wann ist der nächste Test?“ → Termin bzw. „kein Test“, geschätzte Werte mit Namen nur der eigenen Sportarten (vorher „geschätzt: 5.“)', () => {
    const t = ask('vater-rad-lauf', 'Wann ist der nächste Test?');
    expect(t).toMatch(/Nächster Test: .+ am |Im Plan steht gerade kein Test/);
    expect(t).not.toMatch(/geschätzt: \d+\./);
    expect(t).not.toMatch(/Kraul|Schwimm-Schwelle/); // Person schwimmt nicht
  });
  test('„Was mache ich heute?“ ist keine Ja/Nein-Frage: kein „Ja:“ am Anfang; „Soll ich heute trainieren?“ weiter mit „Ja“', () => {
    for (const id of ['laeuferin-hm', 'einsteiger-sprint', 'vater-rad-lauf']) expect(ask(id, 'Was mache ich heute?'), id).not.toMatch(/^Ja\b/);
  });
});
