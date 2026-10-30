/* Auftrag 22: Aufruf der Release-Prüfung mit echten Daten: npx vite-node scripts/release-check-cli.ts <sicherung.sql|kopie.sqlite> [JJJJ-MM-TT] */
import { releaseDataCheck } from './release-datacheck';
const [src, day] = process.argv.slice(2);
if (!src) { console.error('Aufruf: npx vite-node scripts/release-check-cli.ts <sicherung.sql|kopie.sqlite> [JJJJ-MM-TT]'); process.exit(1); }
releaseDataCheck(src, day).then(r => {
  console.log(`Umstellung: ${r.migrated.length ? r.migrated.join(', ') : 'nichts Neues'} · Datensätze ${r.counts.before} → ${r.counts.after}`);
  for (const u of r.users) console.log(`Nutzer ${u.uid}: ${u.errors.length ? 'FEHLER ' + u.errors.join(' | ') : 'lädt fehlerfrei'} (Einheiten ${u.sessions ?? '–'}, Bewertungen ${u.reviews ?? '–'}, Intervall-Einheiten ${u.intervalSessions ?? '–'}, Befunde ${u.findings ?? '–'}, Scores ${u.scores || '–'})`);
  console.log(r.ok ? 'OK: alle Nutzer laden fehlerfrei.' : 'ACHTUNG: Release anhalten.');
  process.exit(r.ok ? 0 : 1);
}).catch(e => { console.error(e); process.exit(1); });
