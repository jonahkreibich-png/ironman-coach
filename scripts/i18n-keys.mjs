// Listet alle festen Textschlüssel aus t('…') / tn('…') in web/src und shared, die in shared/lang/de.ts fehlen.
// Aufruf: node scripts/i18n-keys.mjs [--all]
import fs from 'node:fs';
import path from 'node:path';
const roots = ['web/src', 'shared'];
const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes('lang')) walk(p); } else if (/\.ts$/.test(f)) files.push(p); } };
roots.forEach(walk);
const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/\btn\('([a-zA-Z0-9_.]+)'/g)) { keys.add(m[1] + '.1'); keys.add(m[1] + '.n'); }
}
export const usedKeys = [...keys].sort();
if (process.argv[1] && process.argv[1].endsWith('i18n-keys.mjs')) {
  const de = fs.readFileSync('shared/lang/de.ts', 'utf8') + (fs.existsSync('shared/lang/de') ? fs.readdirSync('shared/lang/de').map(f => fs.readFileSync('shared/lang/de/' + f, 'utf8')).join('\n') : '');
  const have = new Set([...de.matchAll(/'([a-zA-Z0-9_.]+)':/g)].map(m => m[1]));
  const list = process.argv.includes('--all') ? usedKeys : usedKeys.filter(k => !have.has(k) && !k.endsWith('.') && ![...have].some(h => h.startsWith(k) && /^d/.test(h.slice(k.length))));
  console.log(list.join('\n'));
  console.error(`${list.length} von ${usedKeys.length}`);
}
