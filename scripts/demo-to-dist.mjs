// Nur für die lokale Vorschau: schreibt erfundene Demo-Daten nach dist/__demo.json (dist ist nicht im Repo).
import fs from 'node:fs';
import { makeDemo } from '../fixtures/demo.mjs';
fs.writeFileSync('dist/__demo.json', JSON.stringify(makeDemo(new Date().toISOString().slice(0, 10))));
