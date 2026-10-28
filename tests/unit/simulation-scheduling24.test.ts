import { expect, test } from 'vitest';
import { SIM_PROFILES, simulateLongitudinal24 } from '../helpers/longitudinal24';

test('longitudinal simulation allows pending event-loop work before it finishes', async () => {
  let serviced = false;
  const pending = new Promise<void>(resolve => setImmediate(() => { serviced = true; resolve(); }));
  const result = await simulateLongitudinal24(SIM_PROFILES[0], 4);
  const servicedDuringSimulation = serviced;
  await pending;
  expect(result.failures).toEqual([]);
  expect(servicedDuringSimulation).toBe(true);
});
