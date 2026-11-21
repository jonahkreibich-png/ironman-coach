/* Auftrag 39: Zeit-, Dauer- und Pace-Eingabe ohne Doppelpunkt – eine Regel für alle Felder (shared/validate.ts) */
import { describe, it, expect } from 'vitest';
import { readTimeInput, autoColon, timeWords, fmtTimeInput, checkField, parsePace, parseInput, INPUTS } from '../../shared/validate';
import { repsOf } from '../../shared/strength';

const sec = (raw: string, kind: any, lim?: [number, number]) => readTimeInput(raw, kind, lim);

describe('Auftrag 39: Ziffern ohne Doppelpunkt', () => {
  it('Pace: 530 → 5:30, 5 → 5:00, Komma/Punkt/Doppelpunkt gleich', () => {
    for (const r of ['530', '5:30', '5,30', '5.30', '0530', ' 5 30 ']) expect(sec(r, 'pace', [140, 1200]).sec, r).toBe(330);
    expect(sec('5', 'pace', [140, 1200]).sec).toBe(300);
    expect(sec('1045', 'pace', [140, 1200]).sec).toBe(645);
    expect(sec('560', 'pace').err).toBe('sec');
  });
  it('Pace „5,3“ (vorher nicht erkannt): nachfragen 5:30 oder 5:18', () => {
    expect(parsePace('5,3')).toBeNaN();
    expect(sec('5,3', 'pace', [140, 1200]).ask).toEqual([330, 318]);
    expect(sec('5:3', 'pace', [140, 1200]).ask).toEqual([303, 330]);
    expect(sec('5,0', 'pace', [140, 1200]).sec).toBe(300);
    const c = checkField('run', 'pace', '5,3');
    expect(c.ok).toBe(false); expect(c.ask).toEqual([330, 318]); expect(c.msg).toMatch(/5:30 oder 5:18/);
  });
  it('lange Zeiten: 14530 → 1:45:30, 4530 → 45:30, „1:30“ fragt nach (Stunden oder Minuten)', () => {
    expect(sec('14530', 'hms').sec).toBe(6330);
    expect(sec('1:45:30', 'hms').sec).toBe(6330);
    expect(sec('1.45.30', 'hms').sec).toBe(6330);
    expect(sec('4530', 'hms', [60, 172800]).sec).toBe(2730);
    expect(sec('1:30', 'hms', [60, 172800]).ask).toEqual([5400, 90]);
    // Wunschzeit unter 5 min ist unmöglich → eindeutig 1 h 30
    expect(sec('1:30', 'hms', [300, 172800]).sec).toBe(5400);
    expect(sec('130', 'hms', [300, 172800]).sec).toBe(5400);
  });
  it('Dauer in Minuten: „45,30“ = 45 min 30 s (vorher 45,3 min), „45,5“ = 45 min 30 s, „90“ = 90 min', () => {
    const p = (raw: string, short = false) => checkField('run', 'min', raw, { short });
    expect(p('45,30').value).toBe('45.5');
    expect(p('45.30').value).toBe('45.5');
    expect(p('45:30').value).toBe('45.5');
    expect(p('4530').value).toBe('45.5');
    expect(p('45,5').value).toBe('45.5');
    expect(p('90').value).toBe('90');
    expect(p('130').value).toBe('130');
    expect(p('14530').value).toBe('105.5');
    expect(p('1:05').value).toBe('65'); // wie bisher: Stunden:Minuten bei der ganzen Einheit
    expect(p('5:30', true).value).toBe('5.5'); // Abschnitt: Minuten:Sekunden
    expect(p('45,75').value).toBe('45.75'); // keine Sekunden möglich → Kommazahl
    expect(p('1,5 h').value).toBe('90');
    expect(p('45,3').ask).toEqual([2718, 2730]);
    expect(p('45,30').note).toMatch(/45,5 min/);
    expect(p('45').note).toBeUndefined();
  });
  it('Sekunden-Felder (Pause, Halten, 25 m): 90 = 90 s, 3 = 3 min, 130 = 1:30', () => {
    expect(sec('90', 'sec', [0, 3600]).sec).toBe(90);
    expect(sec('3', 'sec', [0, 3600]).sec).toBe(180);
    expect(sec('130', 'sec', [0, 3600]).sec).toBe(90);
    expect(checkField('swim', 'crawl25', '35').value).toBe('0:35');
    expect(checkField('swim', 'css400', '830').value).toBe('8:30');
  });
  it('Doppelpunkt beim Tippen', () => {
    expect(autoColon('5', 'pace')).toBe('5');
    expect(autoColon('53', 'pace')).toBe('53');
    expect(autoColon('530', 'pace')).toBe('5:30');
    expect(autoColon('5:300', 'pace')).toBe('53:00');
    expect(autoColon('14530', 'hms')).toBe('1:45:30');
    expect(autoColon('130', 'min')).toBe('130');
    expect(autoColon('4530', 'min')).toBe('45:30');
    expect(autoColon('5,3', 'pace')).toBe('5,3');
    expect(autoColon('2:30', 'min')).toBe('2:30'); // selbst getippter Doppelpunkt bleibt
    expect(autoColon('5:', 'pace')).toBe('5:');
  });
  it('Anzeige der verstandenen Zeit und Rückweg ins Feld', () => {
    expect(timeWords(2730)).toBe('45 min 30 s');
    expect(timeWords(6330)).toBe('1 h 45 min 30 s');
    expect(fmtTimeInput(330, 'pace')).toBe('5:30');
    expect(fmtTimeInput(90, 'hms')).toBe('0:01:30');
    expect(fmtTimeInput(2718, 'min')).toBe('45,3 min');
    // jede Auswahl beim Nachfragen wird wieder eindeutig gelesen
    for (const [k, s] of [['pace', 318], ['hms', 90], ['hms', 5400], ['ms', 3725]] as const) expect(readTimeInput(fmtTimeInput(s, k), k).sec).toBe(s);
    expect(parseInput({ ...INPUTS.skills.runContinuousMin }, fmtTimeInput(2718, 'min')).value).toBe(45.3);
  });
  it('Halteübung: „1:30“ ist 90 s, nicht 1 Wiederholung', () => {
    expect(repsOf('1:30')).toEqual({ reps: null, holdSec: 90 });
    expect(repsOf('90 s')).toEqual({ reps: null, holdSec: 90 });
    expect(repsOf('10')).toEqual({ reps: 10, holdSec: null });
  });
});
