/* Auftrag 5 A3: Der Regel-Parser versteht echte Formulierungen, auch mit Tippfehlern und Umgangssprache.
   Jede Zeile: Satz → erwartete Regeln in Kurzform (summarize) oder eine Rückfrage (ASK:art). */
import { test, expect, describe } from 'vitest';
import { parseRules, summarize } from '../../shared/ruleparse';
import { describe as say } from '../../shared/constraints';

const TODAY = '2026-10-12';
const W = '1,2,3,11,12'; // Winter
const CASES: [string, string[] | string][] = [
  // der Satz des Vaters
  ['kann mittwochs nicht laufen, nur Samstag oder Sonntag', ['neverDays run 3 hard', 'onlyDays run 0,6 hard']],
  ['Kann Mittwochs nicht laufen nur Samstag oder Sonntag', ['neverDays run 3 hard', 'onlyDays run 0,6 hard']],
  ['Laufen nur am Wochenende', ['onlyDays run 0,6 hard']],
  ['Nur am Wochenende laufen', ['onlyDays run 0,6 hard']],
  ['Laufen geht nur Sa/So', ['onlyDays run 0,6 hard']],
  ['Laufen nur Sa, So', ['onlyDays run 0,6 hard']],
  ['joggen nur so und sa', ['onlyDays run 0,6 hard']],
  ['radfahren nur am we', ['onlyDays bike 0,6 hard']],
  ['Kraft nur Mo und Do', ['onlyDays strength 1,4 hard']],
  ['mittwochs kein Laufen', ['neverDays run 3 hard']],
  ['mitwochs ned joggen', ['neverDays run 3 hard']],
  ['Mi + Do kein Laufen', ['neverDays run 3,4 hard']],
  ['Laufen nie am Mittwoch und Donnerstag', ['neverDays run 3,4 hard']],
  ['am donerstag kann ich nicht laufen', ['neverDays run 4 hard']],
  ['samstachs kein rad', ['neverDays bike 6 hard']],
  ['jeden Tag außer Mittwoch laufen', ['onlyDays run 0,1,2,4,5,6 hard']],
  ['Freitags geht nur Schwimmen', ['neverDays bike 5 hard', 'neverDays run 5 hard', 'neverDays strength 5 hard']],
  ['Mittwochs nur Laufen', ['neverDays swim 3 hard', 'neverDays bike 3 hard', 'neverDays strength 3 hard']],
  // ganze Tage
  ['dienstags gar nichts', ['dayOff 2 hard']],
  ['Dienstag gar kein Training', ['dayOff 2 hard']],
  ['Montags kann ich nicht', ['dayOff 1 hard']],
  ['keine Zeit am Freitag', ['dayOff 5 hard']],
  ['Kein Training am Wochenende', ['dayOff 0,6 hard']],
  ['Dienstag und Donnerstag kein Sport', ['dayOff 2,4 hard']],
  ['samstag frei', ['dayOff 6 hard']],
  ['Sonntag Ruhetag', ['dayOff 0 hard']],
  ['mo geht nix', ['dayOff 1 hard']],
  ['Nur am Wochenende Zeit', ['onlyDays 0,6 hard']],
  // Höchstdauer
  ['Mo-Fr höchstens 60 min', ['maxDay 1,2,3,4,5 60min hard']],
  ['unter der Woche max 45 Minuten', ['maxDay 1,2,3,4,5 45min hard']],
  ['Montag bis Freitag nicht länger als eine Stunde', ['maxDay 1,2,3,4,5 60min hard']],
  ['Am Donnerstag hab ich nur ne halbe Stunde', ['maxDay 4 30min hard']],
  ['werktags max. 1,5 h', ['maxDay 1,2,3,4,5 90min hard']],
  ['Unter der Woche nur kurz', ['maxDay 1,2,3,4,5 45min hard']],
  ['Schwimmen höchstens 45 min', ['maxDay swim 45min hard']],
  // Orte und Geräte
  ['Schwimmbad nur donnerstags', ['onlyDays swim only:pool 4 hard'.replace('only:pool', 'pool')]],
  ['Schwimmbad nur Di, Mi und So', ['onlyDays swim pool 0,2,3 hard']],
  ['Hallenbad hat nur Mo und Mi offen', ['onlyDays swim pool 1,3 hard']],
  ['kein Schwimmbad im Winter', [`placeDays never:pool m${W} hard`]],
  ['im Sommer kein Hallenbad', ['placeDays never:pool m6,7,8 hard']],
  ['Rolle nur im Winter', [`placeDays only:trainer m${W} hard`]],
  ['im Winter nur Rolle', [`placeDays never:outdoor m${W} hard`]],
  ['Rad im Winter nur drinnen', [`placeDays never:outdoor m${W} hard`]],
  ['werktags nur Rolle', ['placeDays only:trainer 1,2,3,4,5 hard']],
  ['Rad nur am Wochenende, unter der Woche Rolle', ['placeDays only:outdoor 0,6 hard', 'placeDays only:trainer 1,2,3,4,5 hard']],
  ['nur drinnen radeln', ['placeDays never:outdoor hard']],
  ['Laufband im Keller', ['info treadmill']],
  ['Fitnessstudio vorhanden', ['info gym']],
  // Sportart gar nicht
  ['kein Rad', ['neverDays bike hard']],
  ['ohne Fahrrad', ['neverDays bike hard']],
  ['So lange Läufe gehen nicht', ['neverDays run long hard']],
  // Zeiträume
  ['Urlaub vom 20.12. bis 6.1.', ['period 2026-12-20..2027-01-06 none']],
  ['vom 20.12.-06.01. im urlaub', ['period 2026-12-20..2027-01-06 none']],
  ['Vom 1.6. bis 30.6. Prüfungen, nur wenig Zeit', ['period 2027-06-01..2027-06-30 low']],
  ['Prüfungen im Juni', ['period 2027-06-01..2027-06-30 low']],
  ['vom 3. bis 10. März Skiurlaub', ['period 2027-03-03..2027-03-10 none']],
  ['1.-14.8. Urlaub', ['period 2027-08-01..2027-08-14 none']],
  ['nächste Woche Urlaub', ['period 2026-10-19..2026-10-25 none']],
  ['die nächsten 2 Wochen keine Zeit', ['period 2026-10-12..2026-10-25 none']],
  ['ab 2.11. für 2 Wochen Dienstreise', ['period 2026-11-02..2026-11-15 none']],
  ['am 24.12. kein Training', ['period 2026-12-24..2026-12-24 none']],
  // Körper
  ['Knie: keine Lauf-Intervalle, kein Bergablaufen', ['body knee noInt noDown']],
  ['Knie links zwickt beim Bergablaufen', ['body knee noInt noDown']],
  ['Achillessehne gereizt', ['body achilles noInt']],
  ['Rücken: keine schweren Gewichte', ['body back']],
  ['Asthma', ['body asthma caution']],
  ['Schulter tut weh beim Kraulen', ['body shoulder']],
  ['keine Intervalle beim Laufen', ['body - noInt']],
  // Vorlieben (weich)
  ['langer Lauf lieber sonntags', ['prefer run long 0 soft']],
  ['Am Wochenende lieber lange Radtouren', ['prefer bike long 0,6 soft']],
  ['Samstags lieber kein Rad', ['neverDays bike 6 soft']],
  ['Laufen lieber nicht am Montag', ['neverDays run 1 soft']],
  ['Freitag ist schlecht fürs Laufen', ['neverDays run 5 soft']],
  ['Sonntags lieber keine Intervalle', ['neverDays run hard 0 soft', 'neverDays bike hard 0 soft', 'neverDays swim hard 0 soft']],
  ['wenn möglich am Wochenende laufen', ['onlyDays run 0,6 soft']],
  ['lange Einheiten nur am Wochenende', ['onlyDays run long 0,6 hard', 'onlyDays bike long 0,6 hard']],
  ['harte Einheiten nicht montags', ['neverDays run hard 1 hard', 'neverDays bike hard 1 hard', 'neverDays swim hard 1 hard']],
  // nur merken
  ['Ich kann nur morgens', ['info']],
  ['kann nicht kraulen', ['info']],
  ['Fußball am Montag', ['info']],
  // unklar → gezielte Rückfrage
  ['Mittwoch', 'ASK:what'],
  ['Laufen ist schwierig', 'ASK:days'],
  ['Urlaub', 'ASK:period'],
  ['blablabla', 'ASK:unknown'],
  ['keine', []]
];

describe('Regel-Parser: echte Formulierungen', () => {
  test(`mindestens 60 Formulierungen`, () => expect(CASES.length).toBeGreaterThanOrEqual(60));
  test.each(CASES)('%s', (text, want) => {
    const r = parseRules(text, TODAY);
    if (typeof want === 'string') { expect(r.rules.map(summarize)).toEqual([]); expect('ASK:' + (r.ask && r.ask.kind)).toBe(want); return; }
    expect(r.rules.map(summarize).sort()).toEqual([...want].sort());
    // jede Regel lässt sich in einfachen Worten anzeigen
    r.rules.forEach(x => expect(say(x).length).toBeGreaterThan(3));
  });
});

test('Der Satz des Vaters in einfachen Worten', () => {
  const r = parseRules('kann mittwochs nicht laufen, nur Samstag oder Sonntag', TODAY);
  expect(r.rules.map(say)).toEqual(['Laufen: nie Mi', 'Laufen: nur Sa und So']);
  expect(r.rules.every(x => x.strength === 'hard')).toBe(true);
});
