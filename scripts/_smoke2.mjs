import { webkit } from '@playwright/test';
import { instrument, waitQuiet, collect } from './lib/startmess.mjs';
import { makeDemo } from '../fixtures/demo.mjs';
const URL = process.argv[2];
const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', serviceWorkers: 'block' });
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const d = makeDemo(today); const plan = d.plan; delete d.plan;
await ctx.addInitScript(([p, s]) => { if (localStorage.getItem('ec_plan')) return; localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', s); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); }, [JSON.stringify(plan), JSON.stringify(d)]);
for (let i = 0; i < 2; i++) { const p = await ctx.newPage(); await p.addInitScript(instrument); await p.goto(URL + '/'); await waitQuiet(p, { minMs: 3000, quietMs: 1500 });
const r = await collect(p); console.log(i, JSON.stringify({ firstView: r.firstView, cls: r.cls, shifts: r.shifts, rebuilds: r.rebuilds, partial: r.partial, fonts: r.fontsLoaded })); await p.close(); }
await b.close();
