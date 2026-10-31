/* Auftrag 25: Coach-KI gezielter (weniger Tokens), Vorschläge nur für den genannten Tag, Regel-Coach-Texte ohne Bausteinfehler. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { world } from '../helpers/chat-world';
import * as C from '../../shared/core';
import { focusedPrompt, mentionedDays, limitToMentioned, coachSkill, compactContext, openAiTools, topicOf, autoTool, relevantRules } from '../../shared/coach/freeai';
import { fixCoachText } from '../../shared/coach/claims';
import { pendingChange, GIVES_REASON } from '../../server/src/wai';

const QS: { q: string; cat: string }[] = JSON.parse(fs.readFileSync('docs/ki-vergleich-25/fragen.json', 'utf8'));
const tok = (s: string) => Math.round(s.length / 3.3);

describe('gezielter Kontext', () => {
  const W = world('olympisch-erfahren');
  const ctx: any = W.ctx();
  const old = tok(coachSkill(ctx, 'Stamio')) + tok(compactContext(ctx)) + tok(JSON.stringify(openAiTools()));
  test('60 Fragen: je Aufruf höchstens halb so viele Tokens wie vorher, Grundregeln immer dabei', () => {
    const sizes: number[] = [];
    for (const { q } of QS) {
      const pre = autoTool(ctx, q);
      const fp = focusedPrompt(ctx, q, 'Stamio', pre);
      const n = tok(fp.system) + tok(JSON.stringify(fp.tools));
      sizes.push(n);
      expect(n, q).toBeLessThan(old * 0.55);
      expect(fp.system, q).toMatch(/erfinde keine Zahlen/);
      expect(fp.system, q).toMatch(/Keine Diagnosen/);
      expect(fp.system, q).toMatch(/morgen ist /);
      if (pre) expect(fp.tools, q).toEqual([]);
    }
    expect(sizes.reduce((a, b) => a + b, 0) / sizes.length).toBeLessThan(old * 0.4);
  });
  test('Thema bestimmt Daten und Werkzeuge', () => {
    expect(topicOf('verschieb den lauf auf freitag', null)).toBe('change');
    expect(topicOf('was ist zone 2', null)).toBe('knowledge');
    expect(topicOf('was soll ich vor dem spiel essen', null)).toBe('nutrition');
    expect(topicOf('mir tut das knie weh', null)).toBe('health');
    const ch = focusedPrompt(ctx, 'verschieb den lauf auf freitag', 'Stamio', null);
    expect(ch.tools.map((t: any) => t.function.name)).toEqual(['get_data', 'move_session', 'modify_session', 'cancel_session', 'add_rule']);
    expect(ch.system).toContain('NÄCHSTE TAGE:'); expect(ch.system).toMatch(/Frag nie nach dem Grund/); expect(ch.system).toMatch(/erst ein Vorschlag/);
    const kn = focusedPrompt(ctx, 'was ist zone 2', 'Stamio', null);
    expect(kn.tools).toEqual([]); expect(kn.maxRounds).toBe(1); expect(kn.system).not.toContain('LETZTE 7 TAGE'); expect(kn.system).toContain('SCHWELLEN');
  });
  test('nur passende Trainingsregeln, höchstens 3', () => {
    expect(relevantRules('warum habe ich mittwoch frei')).toMatch(/Ruhetage/);
    expect(relevantRules('wie atme ich beim kraulen')).toMatch(/Schwimmtechnik/);
    expect(relevantRules('hallo')).toBe('');
    expect((relevantRules('ich bin krank und müde und hab knieschmerzen, soll ich hart trainieren').match(/^- /gm) || []).length).toBeLessThanOrEqual(3);
  });
});

describe('Vorschläge nur für den genannten Tag', () => {
  test('Tage im Text: Quelle und Ziel', () => {
    const T = '2026-10-30';
    expect(mentionedDays('ich hab morgen keine zeit, streich das training', T)).toEqual([{ date: '2026-10-31', target: false }]);
    expect(mentionedDays('das schwimmen am samstag auf dienstag verschieben', T)).toEqual([{ date: '2026-10-31', target: false }, { date: '2026-11-03', target: true }]);
    expect(mentionedDays('verschieb den lauftest auf den 3.11', T)).toEqual([{ date: '2026-11-03', target: true }]);
    expect(mentionedDays('guten morgen', T)).toEqual([]);
    expect(mentionedDays('so ein mist', T)).toEqual([]);
  });
  test('„morgen keine Zeit“: Streichungen an anderen Tagen und doppelte fallen weg', () => {
    const W = world('olympisch-erfahren'); const ctx: any = W.ctx();
    const tomorrow = C.addDays(W.today, 1);
    const all = W.sessions(W.today, C.addDays(W.today, 5));
    const prop = (s: any) => ({ proposal: { changes: [{ kind: 'adjust', key: 'a-' + s.id, data: { type: 'cancel', sessionId: s.id } }] } });
    const props = [...all.map(prop), ...all.slice(0, 1).map(prop)];
    const kept = limitToMentioned(ctx, 'ich hab morgen keine zeit, streich das training', props);
    const ids = kept.map(k => k.proposal.changes[0].data.sessionId);
    expect(ids.sort()).toEqual(all.filter(s => s.date === tomorrow).map(s => s.id).sort());
    // ohne genannten Tag: alles bleibt (nur Doppelte weg)
    expect(limitToMentioned(ctx, 'streich bitte etwas', props)).toHaveLength(all.length);
  });
  test('Rückfrage „Auf welchen Tag?“ → die nächste Nachricht bleibt ein Änderungswunsch; Grund nur, wenn genannt', () => {
    const T = '2026-10-30';
    const m = (from: string, text: string, at: number) => ({ id: 'm' + at, at, date: T, kind: from === 'user' ? 'user' : 'answer', from, text } as any);
    expect(pendingChange([m('user', 'schwimmtest heute verschieben', 1), m('ai', 'Auf welchen Tag soll ich ihn legen?', 2)], T)).toBe(true);
    expect(pendingChange([m('user', 'wie war mein lauf', 1), m('ai', 'Gut. Was hast du morgen vor?', 2)], T)).toBe(false);
    expect(GIVES_REASON.test('auf den 3.11')).toBe(false);
    expect(GIVES_REASON.test('verschieb es, ich hab einen termin')).toBe(true);
  });
});

describe('Texte: Regel-Coach und KI', () => {
  test('doppelte Punkte, „und warum?“, doppelte Leerzeichen', () => {
    expect(fixCoachText('Okay, Lauftest bleibt am Sonntag 25.10..')).toBe('Okay, Lauftest bleibt am Sonntag 25.10.');
    expect(fixCoachText('Auf welches Datum soll ich es verschieben und warum?')).toBe('Auf welches Datum soll ich es verschieben?');
    expect(fixCoachText('Das  ist gut...')).toBe('Das ist gut...');
  });
  test('Regel-Coach versteht ein genanntes Datum („auf den 3.11“) und den Test im Titel', () => {
    const W = world('olympisch-erfahren');
    const runs = W.sessions(C.addDays(W.today, 1)).filter((s: any) => s.sport === 'run');
    const x = runs[0]; if (!x) return;
    // Ziel: ein Tag derselben Woche ohne Lauf
    const target = [1, 2, 3, 4, 5].map(k => C.addDays(x.date, k)).find(d => !W.sessions(d, d).some((s: any) => s.sport === 'run'))!;
    const dm = `${+target.slice(8)}.${+target.slice(5, 7)}`;
    const r = W.say(`verschieb den lauf am ${['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][new Date(x.date + 'T12:00:00Z').getUTCDay()]} auf den ${dm}`);
    expect(r.text).not.toMatch(/keinen anderen/);
    expect(r.text).toContain(`${target.slice(8)}.${target.slice(5, 7)}.`);
    expect(r.text).not.toMatch(/\d\.\.(?!\.)/);
  });
  test('krank: „Gute Besserung“ nur einmal im ganzen Gespräch, Titel grammatisch in Anführungszeichen', () => {
    const W = world('olympisch-erfahren');
    const t = [W.say('mir geht es nicht gut').text, W.say('ich bin krank').text, W.say('ja').text].join(' ');
    expect((t.match(/Gute Besserung/g) || []).length).toBeLessThanOrEqual(1);
    const W2 = world('olympisch-erfahren');
    const x = W2.sessions(C.addDays(W2.today, 1))[0];
    const r = W2.say(`am ${['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][new Date(x.date + 'T12:00:00Z').getUTCDay()]} hab ich was anderes vor`);
    expect(r.text).not.toMatch(/\bmit [A-ZÄÖÜ][a-zäöü]+ [A-ZÄÖÜ]/); // „mit Langer Lauf“
  });
});

describe('Funde aus dem Modellvergleich (allgemein behoben)', () => {
  test('„dienstags nicht mehr schwimmen“ ist ein Änderungswunsch; „ich kann nicht mehr“ nicht', async () => {
    const { isChangeRequest, claimsChange } = await import('../../shared/coach/freeai');
    expect(isChangeRequest('ich will dienstags nicht mehr schwimmen')).toBe(true);
    expect(isChangeRequest('samstags kein rad')).toBe(true);
    expect(isChangeRequest('ich kann nicht mehr, so müde')).toBe(false);
    expect(claimsChange('Alles klar, ich habe notiert, dass du dienstags nicht mehr schwimmen möchtest.')).toBe(true);
    expect(claimsChange('Ich werde das bei deiner weiteren Planung berücksichtigen.')).toBe(true);
    expect(claimsChange('Das habe ich nicht verschoben, weil der Tag voll ist.')).toBe(false);
  });
  test('Krankheit steht bei „heute“ im Kontext', () => {
    const W = world('olympisch-erfahren'); W.state.illnessPeriods = [{ id: 'i1', start: W.today, end: null }];
    const fp = focusedPrompt(W.ctx() as any, 'was mache ich am sonntag', 'Stamio', null);
    expect(fp.system).toMatch(/KRANK EINGETRAGEN seit/);
  });
  test('Vorschläge: falsches Training, gleicher Tag, Regel ohne Regel-Wunsch, halber Tausch fallen weg', () => {
    const W = world('olympisch-erfahren'); const ctx: any = W.ctx();
    const ses = W.sessions(W.today, C.addDays(W.today, 13));
    const long = ses.find((s: any) => s.sport === 'run' && /lang/i.test(s.title)); const other = ses.find((s: any) => s.sport === 'run' && !/lang/i.test(s.title));
    const mod = (s: any) => ({ proposal: { changes: [{ kind: 'adjust', data: { type: 'modify', sessionId: s.id } }] } });
    if (long && other) expect(limitToMentioned(ctx, 'mach den langen lauf 15 min kürzer', [mod(other), mod(long)]).map(m => m.proposal.changes[0].data.sessionId)).toEqual([long.id]);
    const x = ses[0];
    expect(limitToMentioned(ctx, 'verschieb das bitte', [{ proposal: { changes: [{ kind: 'adjust', data: { type: 'move', sessionId: x.id, from: x.date, to: x.date } }] } }])).toEqual([]);
    const rule = { proposal: { changes: [{ kind: 'profile', key: 'main', data: {} }] } };
    expect(limitToMentioned(ctx, 'kannst du den lauftest auf einen anderen tag verschieben', [rule])).toEqual([]);
    expect(limitToMentioned(ctx, 'ab jetzt mittwochs kein rad mehr', [rule])).toHaveLength(1);
    expect(limitToMentioned(ctx, 'tausch das schwimmen mit dem rad', [{ proposal: { changes: [{ kind: 'adjust', data: { type: 'move', sessionId: x.id, from: x.date, to: C.addDays(x.date, 1) } }] } }])).toEqual([]);
  });
  test('Wochentag mit Jahr: „Di 15.09.2029“ → „Sa 15.09.2029“', () => {
    expect(fixCoachText('Dein Ironman ist am Di 15.09.2029.', { today: '2026-10-30' })).toBe('Dein Ironman ist am Sa 15.09.2029.');
  });
});
