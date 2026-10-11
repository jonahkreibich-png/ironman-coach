// Prüft, welche Server-Schlüssel (Cloudflare-Secrets) in der Test-Umgebung gesetzt sind.
// Aufruf (im Ordner ironman-coach): node scripts/check-secrets.mjs [test]
// Zeigt nur die Namen, nie die Werte. Dieselbe Übersicht steht in der App unter Mehr → Verbindungen → Server-Schlüssel (nur Betreiber).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const envName = process.argv[2] || 'test';
if (envName !== 'test') { console.error('Nur die Test-Umgebung wird geprüft.'); process.exit(1); }
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const out = execSync('node node_modules/wrangler/bin/wrangler.js secret list --env test', { cwd: 'server', env, encoding: 'utf8' });
const set = new Set(JSON.parse(out.slice(out.indexOf('['))).map(s => s.name));

const NEED = [
  ['Grundlagen', [['SETUP_CODE', 'Einrichtungscode für dein erstes Gerät'], ['TOKEN_KEY', 'verschlüsselt die Tokens der Dienste'], ['VAPID_PRIVATE_JWK', 'Mitteilungen aufs iPhone']]],
  ['Dropbox (HealthFit)', [['DROPBOX_APP_KEY', ''], ['DROPBOX_APP_SECRET', '']]],
  ['Oura', [['OURA_CLIENT_ID', ''], ['OURA_CLIENT_SECRET', '']]],
  ['WHOOP', [['WHOOP_CLIENT_ID', ''], ['WHOOP_CLIENT_SECRET', '']]],
  ['Polar', [['POLAR_CLIENT_ID', ''], ['POLAR_CLIENT_SECRET', '']]],
  ['Withings', [['WITHINGS_CLIENT_ID', ''], ['WITHINGS_CLIENT_SECRET', '']]],
  ['KI-Coach (später, kostet Geld)', [['ANTHROPIC_API_KEY', 'nur nach Absprache, siehe SPAETER.md']]]
];
let missing = 0;
console.log('Server-Schlüssel der Test-Umgebung (stamio-api-test):\n');
for (const [group, keys] of NEED) {
  const ok = keys.every(([k]) => set.has(k));
  console.log(`${ok ? '✓' : '✗'} ${group}`);
  for (const [k, why] of keys) { console.log(`    ${set.has(k) ? 'gesetzt' : 'FEHLT  '}  ${k}${why ? '  (' + why + ')' : ''}`); if (!set.has(k) && !group.startsWith('KI')) missing++; }
}
console.log(missing ? `\n${missing} Schlüssel fehlen. Anleitung: FUER-JONAH.md, Abschnitt „Verbindungen“.` : '\nAlles gesetzt.');
