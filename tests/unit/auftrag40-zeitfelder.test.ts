/* Auftrag 40, Vorschläge 14 und 15: Dauer-Felder zeigen gespeicherte Werte als Zeit (so, wie die Zeitregel sie wieder liest). */
import { test, expect, describe } from 'vitest';
import { fmtDurInput, readTimeInput, inputDisplay } from '../../shared/validate';

describe('Vorschlag 15: gespeicherte Dauer als Zeit im Feld', () => {
  test('ganze Minuten als Zahl, mit Sekunden als Zeit (45,25 → 45:15)', () => {
    expect(fmtDurInput(65)).toBe('65');
    expect(fmtDurInput(45)).toBe('45');
    expect(fmtDurInput(45.25)).toBe('45:15');
    expect(fmtDurInput(45.5)).toBe('45:30');
    expect(fmtDurInput(60.5)).toBe('1:00:30');
    expect(fmtDurInput(5.5)).toBe('0:05:30');
    expect(inputDisplay('run', 'min', 45.25)).toBe('45:15');
    expect(inputDisplay('run', 'min', '45.3')).toBe('45:18');
  });
  test('Rundweg: was im Feld steht, liest die Regel als denselben Wert (lange und kurze Dauer-Felder)', () => {
    for (const m of [45.25, 45.5, 65, 5.5, 0.5, 9.75, 125.5, 45.3, 60.5, 1, 90, 600.25]) {
      const s = fmtDurInput(m);
      for (const kind of ['min', 'minShort'] as const) {
        const r = readTimeInput(s, kind, [0, 86400]);
        expect(r.ask, `${m} → ${s} (${kind})`).toBeFalsy();
        expect(r.sec! / 60, `${m} → ${s} (${kind})`).toBeCloseTo(Math.round(m * 60) / 60, 6);
      }
    }
  });
});

describe('Vorschlag 10: eine Schreibweise für Dauern', async () => {
  const { duration } = await import('../../shared/i18n');
  test('„25 min“, „45 min 30 s“, „1 h“, „1 h 30 min“ – nie „1:30“, „25′“, „45,5 min“, „46 min“ für 45:30', () => {
    expect(duration(25)).toBe('25 min');
    expect(duration(45.5)).toBe('45 min 30 s');
    expect(duration(60)).toBe('1 h');
    expect(duration(90)).toBe('1 h 30 min');
    expect(duration(405)).toBe('6 h 45 min');
    expect(duration(0.5)).toBe('30 s');
    expect(duration(null)).toBe('–');
  });
});
