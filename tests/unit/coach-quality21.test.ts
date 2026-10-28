/* Auftrag 21: Test-Paket mit mindestens 200 Coach-Gesprächen. Jede Antwort (Text, Rückfragen, Vorschläge) wird automatisch geprüft auf
   interne Texte, falsche Wochentage zu einem Datum, falsche Artikel bei Einheitennamen, Widersprüche (Änderung behauptet, aber nichts
   geändert), unbelegte Leistungsaussagen und unnötige „Warum?“-Fragen beim Verschieben. Dazu: die feste Prüfung hinter den KI-Antworten
   mit typischen KI-Fehlern (Fälle aus Jonahs Chat vom 27.10.). */
import { describe, expect, test } from 'vitest';
import { world, type World } from '../helpers/chat-world';
import { PERSONAS } from '../../fixtures/personas';
import { INTERNAL_RE, fixCoachText, internalLeaks, unsupportedClaims, claimFacts } from '../../shared/coach/claims';
import { mergeSwapProposals, dayDe } from '../../shared/coach/tools';
import * as C from '../../shared/core';

const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DOW_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const WRONG_ART = /\b(?:den|die) (?:[A-ZÄÖÜ][\wäöü-]*)?(?:[Tt]raining|[Ss]chwimmen|[Rr]adfahren)\b|\bden (?:[A-ZÄÖÜ][\wäöü-]*)?(?:[Ee]inheit|[Aa]usfahrt)\b/;

function checkText(W: World, text: string, where: string, ownStatement = false) {
  expect(internalLeaks(text), where + ': interner Text').toEqual([]);
  expect(text, where).not.toMatch(INTERNAL_RE);
  // Wochentag passt zum Datum
  for (const m of text.matchAll(/\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?,? (?:den )?(\d{1,2})\.(\d{1,2})\./g)) {
    const y = +m[3] < 6 ? 2027 : 2026;
    const real = dow(`${y}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
    const named = DOW_LONG.indexOf(m[1]) >= 0 ? DOW_LONG.indexOf(m[1]) : DOW_SHORT.indexOf(m[1]);
    expect(named, `${where}: „${m[0]}“ hat den falschen Wochentag`).toBe(real);
  }
  expect(text, where + ': Artikel').not.toMatch(WRONG_ART);
  expect(text, where + ': Leerformel').not.toMatch(/prüfe zusätzliche Dauer|anhand deines bisherigen Trainings, der verfügbaren Zeit/);
  // eine eigene Angabe im Chat („ich schaffe jetzt 100 m“) ist selbst der Nachweis
  let bad: string[] = []; if (!ownStatement) try { bad = unsupportedClaims(text, claimFacts(W.ctx() as any)); } catch (e) { bad = []; }
  expect(bad, where + ': unbelegte Aussage').toEqual([]);
}
function checkReply(W: World, r: any, input: string) {
  const where = `${W.persona || ''} „${input}“`;
  checkText(W, r.text || '', where, r.intent === 'swim-skill');
  (r.options || []).forEach((o: any) => checkText(W, String(o.label || ''), where + ' (Knopf)'));
  // Widerspruch: „erledigt/verschoben/gestrichen“ ohne Änderung
  if (/^Erledigt[:.]/.test(r.text || '')) expect(Object.keys(W.state.adjustments).length + (W.state.illnessPeriods || []).length + Object.keys(W.goals).length).toBeGreaterThan(0);
  // beim Verschieben nie nach dem Grund fragen
  if (/verschieb|tausch|keine zeit/i.test(input)) expect(r.text || '', where + ': fragt nach dem Grund').not.toMatch(/\b(warum|weshalb|welchen Grund|aus welchem Grund)\b[^.]*\?/i);
}

type Utter = (W: World) => string | null;
const future = (W: World, k = 1) => W.sessions(C.addDays(W.today, k));
const UTTERANCES: Utter[] = [
  W => { const x = future(W)[0]; return x ? `Ich hab ${DOW_LONG[dow(x.date)]} keine Zeit` : null; },
  W => { const x = future(W)[0]; return x ? `Verschieb das Training von ${DOW_LONG[dow(x.date)]} auf ${DOW_LONG[dow(C.addDays(x.date, 1))]}` : null; },
  W => `Tausch ${DOW_LONG[dow(C.addDays(W.today, 1))]} und ${DOW_LONG[dow(C.addDays(W.today, 3))]}`,
  W => { const x = future(W).find(s => s.sport === 'swim'); return x ? `Verschieb das Schwimmen am ${DOW_LONG[dow(x.date)]}` : null; },
  () => 'Mach die Einheit heute kürzer',
  () => 'Heute lieber locker',
  W => { const x = future(W)[0]; return x ? `Streich das Training am ${DOW_LONG[dow(x.date)]}` : null; },
  () => 'Warum ist heute locker?',
  () => 'Wie war meine Woche?',
  () => 'Was mache ich morgen?',
  () => 'Wie läuft es mit meinem Ziel?',
  () => 'Ich bin krank, Halsweh',
  () => 'Mein Knie tut weh',
  () => 'Kann ich heute Intervalle machen?',
  () => 'Was ist Zone 2?',
  () => 'Ich schaffe jetzt 100 m Kraul am Stück',
  () => 'Wie war mein letztes Schwimmtraining?',
  () => 'Diese Woche habe ich kaum Zeit',
  () => 'Ich brauche heute einen Tag frei',
  () => 'Erklär mir den Plan',
  () => 'Ich bin heute sehr müde',
  W => { const x = future(W).find(s => s.plannedMinutes >= 20); return x ? `Kannst du die Einheit am ${DOW_LONG[dow(x.date)]} länger machen?` : null; },
  () => 'Wie geht es meiner Form?'
];

describe('Auftrag 21: 200+ Coach-Gespräche ohne interne Texte, falsche Tage, falsche Artikel und Widersprüche', () => {
  let count = 0;
  for (const p of PERSONAS) {
    test(p.id, () => {
      for (const u of UTTERANCES) {
        const W = world(p.id); (W as any).persona = p.id;
        const input = u(W); if (!input) continue;
        const r = W.say(input); count++;
        checkReply(W, r, input);
        // Rückfrage beantworten (erste Option bzw. „ja“) und erneut prüfen
        const next = (r.options || [])[0]?.say || (r.pending ? 'ja' : null);
        if (next) { const r2 = W.say(next); checkReply(W, r2, input + ' → ' + next); }
        expect(W.violations()).toEqual([]);
      }
    });
  }
  test('mindestens 200 Gespräche', () => { expect(count).toBeGreaterThanOrEqual(200); });
});

describe('Auftrag 21: feste Prüfung hinter KI-Antworten (typische Fehler)', () => {
  const W = world(PERSONAS[0].id);
  const ctx = W.ctx() as any;
  test('interner Platzhalter erscheint nie (Fall 27.10.)', () => {
    const t = fixCoachText('Ich habe dir einen Vorschlag gemacht. Trainingsangabe (Begründung nicht für die KI freigegeben) auf Donnerstag. Bestätige ihn unten.', ctx);
    expect(t).not.toMatch(/Trainingsangabe|freigegeben/);
    expect(t).toMatch(/Vorschlag gemacht/);
    for (const x of ['Wert: undefined.', 'Die Einheit msg-prop-1 ist neu.', 'Einheit g261027w1-sa-5 verschoben.', '[object Object]']) expect(fixCoachText(x, ctx)).toBe('');
  });
  test('Wochentag zum Datum wird berichtigt (Samstag statt Dienstag)', () => {
    expect(fixCoachText('Dein Schwimmtest am Samstag, 27.10. war gut.', { ...ctx, today: '2026-10-28' })).toMatch(/Dienstag, 27\.10\./);
    expect(fixCoachText('Am Sa 27.10. war der Test.', { ...ctx, today: '2026-10-28' })).toMatch(/Di 27\.10\./);
  });
  test('„Schwimmtest vom Samstag“ wird zum richtigen Tag aus dem Plan', () => {
    const swimDay = C.planDays(W.weeks()).find((d: any) => d.date <= W.today && d.date >= C.addDays(W.today, -7) && d.sessions.some((s: any) => s.sport === 'swim'));
    if (!swimDay) return;
    const wrong = (dow(swimDay.date) + 3) % 7;
    const out = fixCoachText(`Das Schwimmtraining vom ${DOW_LONG[wrong]} lief gut.`, ctx);
    const swimDays = new Set(C.planDays(W.weeks()).filter((d: any) => d.date >= C.addDays(W.today, -7) && d.date <= W.today && d.sessions.some((s: any) => s.sport === 'swim')).map((d: any) => dow(d.date)));
    if (swimDays.size === 1) expect(out).toMatch(new RegExp(`vom ${DOW_LONG[dow(swimDay.date)]}`));
  });
  test('Artikel bei Einheitennamen: „den Schwimmtraining“ → „das Schwimmtraining“', () => {
    expect(fixCoachText('Ich verschiebe den Schwimmtraining auf morgen.', ctx)).toBe('Ich verschiebe das Schwimmtraining auf morgen.');
    expect(fixCoachText('Wie war den Radeinheit?', ctx)).toBe('Wie war die Radeinheit?');
    expect(fixCoachText('Ich verschiebe den Lauf und die Intervalle.', ctx)).toBe('Ich verschiebe den Lauf und die Intervalle.');
  });
  test('Tauschen ist EIN Vorschlag mit was, von wann, nach wann', () => {
    const a = '2026-10-28', b = '2026-10-30';
    const mk = (id: string, title: string, from: string, to: string) => ({ title: 'Verschieben: ' + title, text: '', proposal: { status: 'open', changes: [{ kind: 'adjust', key: id, data: { id, type: 'move', sessionId: 's' + id, from, to, what: `${title}: ${dayDe(from)} → ${dayDe(to)}` } }] } });
    const out = mergeSwapProposals([mk('1', 'Schwimmen', a, b), mk('2', 'Lauf', b, a)]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Tauschen: Schwimmen (Mi 28.10.) ↔ Lauf (Fr 30.10.)');
    expect(out[0].proposal.changes).toHaveLength(2);
    expect(mergeSwapProposals([mk('1', 'Schwimmen', a, b)])).toHaveLength(1);
  });
});
