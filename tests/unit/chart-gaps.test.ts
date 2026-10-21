import { test, expect } from 'vitest';
import { chartSegments } from '../../shared/chartdata';
test('Diagramme unterbrechen fehlende Punkte und große Datumlücken', () => {
  const pts = [{ date: '2026-10-01', v: 1 }, { date: '2026-10-02', v: null }, { date: '2026-10-03', v: 2 }, { date: '2026-10-20', v: 3 }, { date: '2026-10-21', v: 4 }];
  expect(chartSegments(pts, 'v')).toEqual([[0], [2], [3, 4]]);
});
test('nicht endliche und unsortierte Werte erzeugen keine Verbindung', () => {
  expect(chartSegments([{ date: '2026-10-02', v: 1 }, { date: '2026-10-01', v: 2 }, { date: '2026-10-03', v: Infinity }], 'v')).toEqual([[0], [1]]);
});
