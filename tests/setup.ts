import { afterEach } from 'vitest';
import { setImmediate as nativeImmediate } from 'node:timers';

// Capture the real scheduler before a test installs fake clocks. Awaiting resolved
// promises alone does not let a worker receive its RPC acknowledgements.
const scheduleWorkerIO = nativeImmediate;
afterEach(() => new Promise<void>(resolve => scheduleWorkerIO(resolve)));
