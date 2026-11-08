// Auftrag 31: Test-Mitteilung an einen Nutzer schicken (Betreiber) und die Antwort des Push-Dienstes (Apple, Google …) je Gerät zeigen.
// Legt eine Test-Mitteilung in die Warteschlange des Servers; der nächste 5-Minuten-Lauf verschickt sie sofort (ohne Ruhezeit und
// Tageslimit) und speichert das Ergebnis. Ändert keine Nutzerdaten (nur die Warteschlange des Servers).
// Aufruf: node scripts/push-test.mjs test|production [--user 1] [--text "…"] [--nur-status]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const TARGETS = { test: { db: 'stamio-test', env: ['--env', 'test'] }, production: { db: 'coach-db-efc7', env: [] } };
const target = TARGETS[process.argv[2]];
if (!target) { console.error('Aufruf: node scripts/push-test.mjs test|production [--user 1] [--text "…"] [--nur-status]'); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const uid = +arg('user', '1');
if (!Number.isInteger(uid) || uid < 1) { console.error('--user muss eine Zahl sein'); process.exit(2); }
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const wrangler = process.cwd() + '/server/node_modules/wrangler/bin/wrangler.js';
function sql(command) {
  const out = execFileSync(process.execPath, [wrangler, 'd1', 'execute', target.db, ...target.env, '--remote', '--json', '--command', command], { cwd: 'server', env, encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('['))).flatMap(r => r.results || []);
}
const esc = s => String(s).replace(/'/g, "''");
const fmt = ts => ts ? new Date(ts).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–';
function status() {
  const subs = sql(`SELECT s.device_id, d.name, s.created_at, s.last_status, s.last_at, s.last_ok_at, s.fails, s.last_error FROM push_subs s LEFT JOIN devices d ON d.id = s.device_id WHERE s.user_id = ${uid}`);
  if (!subs.length) console.log('Keine angemeldeten Geräte.');
  for (const s of subs) console.log(`  ${s.name || s.device_id}: angemeldet ${fmt(s.created_at)} · letzte Antwort ${s.last_status ?? '–'} (${fmt(s.last_at)}) · zuletzt zugestellt ${fmt(s.last_ok_at)}${s.fails ? ` · ${s.fails}× Fehler: ${s.last_error}` : ''}`);
  const gone = sql(`SELECT device_id, at, status, reason FROM push_gone WHERE user_id = ${uid}`);
  for (const g of gone) console.log(`  abgelaufen: ${g.device_id} ${fmt(g.at)} (${g.status} ${g.reason || ''})`);
}
console.log(`Nutzer ${uid} (${process.argv[2]}), vorher:`); status();
if (process.argv.includes('--nur-status')) process.exit(0);

const key = 'test-' + Date.now();
const text = arg('text', 'Test: Mitteilungen kommen wieder an. 💪');
sql(`INSERT INTO push_queue (user_id, key, type, payload, created_at) VALUES (${uid}, '${key}', 'test', '${esc(JSON.stringify({ title: 'Stamio', body: text, url: './?go=heute' }))}', ${Date.now()})`);
console.log(`\nTest-Mitteilung „${text}“ liegt in der Warteschlange. Warte auf den nächsten 5-Minuten-Lauf …`);
const t0 = Date.now();
while (Date.now() - t0 < 11 * 60000) {
  await new Promise(r => setTimeout(r, 30000));
  const log = sql(`SELECT delivered, sent_at FROM push_log WHERE user_id = ${uid} AND key = '${key}'`);
  if (log.length) { console.log(`\nVerschickt ${fmt(log[0].sent_at)}: an ${log[0].delivered} Gerät(e) zugestellt.`); status(); process.exit(log[0].delivered > 0 ? 0 : 1); }
}
console.log('Nach 11 Minuten noch nicht verschickt (läuft der Zeitplan?).'); process.exit(1);
