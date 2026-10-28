import { expect, test } from 'vitest';
import { setImmediate as nativeImmediate } from 'node:timers';

let ioProcessed = false;
test('queue worker IO while a synchronous test finishes', () => {
  nativeImmediate(() => { ioProcessed = true; });
});
test('process queued IO between synchronous test cases', () => {
  expect(ioProcessed).toBe(true);
});
