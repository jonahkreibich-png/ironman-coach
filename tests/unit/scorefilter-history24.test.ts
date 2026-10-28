import { expect, test } from 'vitest';
import { runFilter } from '../../shared/scorefilter';
import { addDays } from '../../shared/core';

test('Score-Wochengrenze behält identische Ergebnisse bei doppelten Trainingstagen und Pausen', () => {
  const obs: any[] = Array.from({ length: 160 }, (_, i) => ({ id: String(i).padStart(3, '0'), date: addDays('2026-01-01', Math.floor(i / 2) + (i >= 80 ? 60 : 0)), z: Math.log(3 + i * 0.003 + (i % 37 === 0 ? 1 : 0)), sd: 0.025, kind: i === 50 ? 'test' : 'hr', title: 'Synthetisch', value: String(i) }));
  const result = runFilter({ obs, trained: obs.map(o => o.date), cross: [], illness: [], end: '2026-07-01', prior: { z: Math.log(3), sd: 0.1 }, v20: { pts: z => Math.exp(z) * 15, weekPts: 3, capZ: Math.log(5) } })!;
  expect({ z: result.z, sd: result.sd, n: result.n, usable: result.usable, tested: result.tested, steps: result.steps.filter((_, i) => i % 17 === 0 || i >= result.steps.length - 3).map(s => ({ ...s, before: +s.before.toFixed(9), after: +s.after.toFixed(9) })) }).toMatchSnapshot();
});
