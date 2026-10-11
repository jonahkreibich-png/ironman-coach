// Setzt einen Server-Schlüssel der Test-Umgebung aus der Zwischenablage (Windows).
// Aufruf (im Ordner ironman-coach): node scripts/set-secret.mjs OURA_CLIENT_ID
// Vorher den Wert beim Anbieter kopieren. Der Wert wird nicht angezeigt und nirgends gespeichert,
// nur an Cloudflare übergeben (Einfügen im Terminal mit Strg+V fügt sonst unsichtbare Zeichen ein).
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const name = process.argv[2] || '';
const ALLOWED = /^(DROPBOX_APP_KEY|DROPBOX_APP_SECRET|OURA_CLIENT_ID|OURA_CLIENT_SECRET|WHOOP_CLIENT_ID|WHOOP_CLIENT_SECRET|POLAR_CLIENT_ID|POLAR_CLIENT_SECRET|WITHINGS_CLIENT_ID|WITHINGS_CLIENT_SECRET)$/;
if (!ALLOWED.test(name)) { console.error('Bitte einen dieser Namen angeben: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, OURA_CLIENT_ID, OURA_CLIENT_SECRET, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, POLAR_CLIENT_ID, POLAR_CLIENT_SECRET, WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET'); process.exit(1); }
const value = execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', { encoding: 'utf8' }).replace(/^\uFEFF/, '').trim();
if (value.length < 8 || /\s/.test(value)) { console.error('In der Zwischenablage steht kein passender Schlüssel (zu kurz oder mit Leerzeichen). Bitte den Wert beim Anbieter nochmal kopieren.'); process.exit(1); }
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
console.log(`Setze ${name} (${value.length} Zeichen, beginnt mit ${value.slice(0, 3)}…) in der Test-Umgebung …`);
const r = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', name, '--env', 'test'], { cwd: 'server', env, input: value, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.status !== 0) { console.error('Hat nicht geklappt. Ausgabe oben bitte an Claude geben.'); process.exit(1); }
console.log('Fertig. Prüfen: node scripts/check-secrets.mjs');
