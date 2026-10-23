/* Auftrag 18: schreibt docs/TRAININGSREGELN.md aus shared/trainingknowledge.ts (eine Quelle für Plan-Check, KI-Coach und Lexikon).
   Aufruf: npx vite-node scripts/trainingsregeln.ts */
import fs from 'node:fs';
import { rulesMarkdown } from '../shared/trainingknowledge';
fs.writeFileSync('docs/TRAININGSREGELN.md', rulesMarkdown() + '\n');
console.log('docs/TRAININGSREGELN.md geschrieben');
