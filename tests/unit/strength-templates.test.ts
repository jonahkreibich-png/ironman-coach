import { describe, test, expect } from 'vitest';
import { makeStrengthTemplate, startStrengthWorkout } from '../../shared/strength';

const exercises = [{ name: ' Kniebeuge ', sets: '3', reps: '8–10', kg: '0', restSec: '90' }];
describe('Kraftvorlagen', () => {
  test('normalisiert Übungen und behält Körpergewicht und Pausen', () => {
    expect(makeStrengthTemplate('a', ' Ganzkörper ', exercises, 42)).toEqual({ id: 'a', name: 'Ganzkörper', exercises: [{ name: 'Kniebeuge', sets: 3, reps: '8–10', kg: 0, restSec: 90 }], updatedAt: 42 });
  });
  test.each([
    ['', exercises], ['Plan', []], ['Plan', [{ ...exercises[0], name: '' }]],
    ['Plan', [{ ...exercises[0], sets: '-1' }]], ['Plan', [{ ...exercises[0], sets: '2.5' }]],
    ['Plan', [{ ...exercises[0], kg: 'foo' }]], ['Plan', [{ ...exercises[0], restSec: '-1' }]],
  ])('weist unvollständige oder ungültige Vorlagen zurück', (name, rows) => {
    expect(() => makeStrengthTemplate('a', name as string, rows as any)).toThrow();
  });
  test('startet als Entwurf und kopiert Übungen unabhängig von der Vorlage', () => {
    const template = makeStrengthTemplate('a', 'Ganzkörper', exercises);
    const workout = startStrengthWorkout(template, '2026-10-20', 'w1');
    expect(workout).toMatchObject({ id: 'w1', completed: false, sport: 'strength', strengthTemplateId: 'a' });
    workout.metrics.exercises[0].kg = 50;
    expect(template.exercises[0].kg).toBe(0);
    expect(() => startStrengthWorkout(template, '2026-02-31', 'w2')).toThrow();
  });
});
