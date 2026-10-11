/* Jede Schaltfläche (data-act) und jedes Eingabefeld (data-ch) braucht eine registrierte Aktion, sonst passiert beim Tippen nichts. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.ts')) files.push(fs.readFileSync(p, 'utf8')); } };
walk('web/src');
const all = files.join('\n');
const used = (re: RegExp) => new Set([...all.matchAll(re)].map(m => m[1]));

describe('UI-Aktionen', () => {
  it('jede data-act hat einen Handler', () => {
    const acts = used(/data-act="([a-z0-9-]+)"/g);
    for (const m of all.matchAll(/act: '([a-z0-9-]+)'/g)) acts.add(m[1]); // li({ act: … })
    const reg = used(/\bon\('([a-z0-9-]+)'/g);
    expect([...acts].filter(a => !reg.has(a))).toEqual([]);
  });
  it('jedes data-ch hat einen Handler', () => {
    const ch = used(/data-ch=\?"([a-z0-9-]+)\?"/g);
    const reg = used(/\bonChange\('([a-z0-9-]+)'/g);
    expect([...ch].filter(a => !reg.has(a))).toEqual([]);
  });
});
