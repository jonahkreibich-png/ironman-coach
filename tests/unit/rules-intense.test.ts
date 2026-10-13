/* Auftrag 6: Im Muster für harte Einheiten stand statt der Wortgrenze ein unsichtbares Steuerzeichen,
   deshalb galt z. B. ein „Schwellentest“ nicht als harte Einheit (zwei harte Tage hintereinander blieben unbemerkt). */
import { test, expect } from 'vitest';
import { isIntense } from '../../shared/rules';
import fs from 'node:fs';
import path from 'node:path';

test('Schwellentest und Leistungstest gelten als hart, „Testlauf locker“ wird nicht am Wortanfang verwechselt', () => {
  expect(isIntense({ title: 'Schwellentest Rad' })).toBe(true);
  expect(isIntense({ title: 'Leistungstest' })).toBe(true);
  expect(isIntense({ title: 'Lockerer Lauf' })).toBe(false);
});
test('kein Quelltext enthält unsichtbare Steuerzeichen (z. B. Backspace statt \b)', () => {
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|mjs|js|css|html)$/.test(f) && /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(p, 'utf8'))) bad.push(p); } };
  ['shared', 'web/src', 'server/src', 'scripts', 'tests'].forEach(walk);
  expect(bad).toEqual([]);
});
