// Auftrag 28: Korrektur an Nutzerdaten – nur so, nie mehr direkt in der Datenbank.
// Die Änderung läuft als normale Änderung mit Zeitstempel über den Server (Prüfung, feldweises Zusammenführen, neue Revision).
// Die Geräte übernehmen sie beim nächsten Abgleich wie eine Änderung von einem anderen Gerät; ihre noch nicht hochgeladenen Eingaben bleiben.
//
// Aufruf: node scripts/korrektur.mjs test|production <nutzer-nr> <aenderungen.json> "<Grund>" [--ohne-sicherung]
//   aenderungen.json: [{ "kind": "illness", "key": "ill-…", "data": { … }, "base": { …Stand vorher… } }]
//   „base“ (Stand vor der Korrektur) mitgeben: dann werden gleichzeitige Änderungen eines Geräts feldweise zusammengeführt.
// Ablauf: 1. Sicherung der Datenbank nach data-export/ (Pflicht)  2. Korrektur über /api/admin/users/<nr>/changes  3. Ergebnis anzeigen.
// Anmeldung: Betreiber-Gerät „Werkzeug (Claude)“; der Schlüssel liegt nur lokal in scratch/werkzeug-<ziel>.local.json (nicht im Git).
// Fehlt er, wird er einmal mit dem Einrichtungscode aus ZUGANG.local.md angelegt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS, execute, verifyBackup } from './veroeffentlichen.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const [target, uidArg, file, reason] = process.argv.slice(2);
const t = TARGETS[target];
if (!t || !uidArg || !file || !reason) { console.error('Aufruf: node scripts/korrektur.mjs test|production <nutzer-nr> <aenderungen.json> "<Grund>"'); process.exit(2); }
const changes = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(changes) || !changes.length) { console.error('Die Datei muss eine Liste von Änderungen enthalten.'); process.exit(2); }

function setupCode() {
  const z = fs.readFileSync(path.join(ROOT, 'ZUGANG.local.md'), 'utf8');
  const head = target === 'production' ? /^# Zugang zur echten App/m : /^# Zugang zur Test-Umgebung/m;
  const start = z.search(head); if (start < 0) throw new Error('Abschnitt in ZUGANG.local.md fehlt.');
  const part = z.slice(start).split(/\n# /)[0];
  const m = /^[^:\n]*code[^:\n]*:\s*(\S+)\s*$/im.exec(part);
  if (!m) throw new Error('Einrichtungscode in ZUGANG.local.md nicht gefunden.');
  return m[1];
}
async function api(method, p, body, token) {
  const res = await fetch(t.url + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${p}: ${res.status} ${data && data.error || ''}`);
  return data;
}
async function token() {
  const f = path.join(ROOT, 'scratch', `werkzeug-${target}.local.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).token;
  const r = await api('POST', '/api/setup', { setupCode: setupCode(), name: 'Werkzeug (Claude)' });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ token: r.token, deviceId: r.deviceId, createdAt: new Date().toISOString() }));
  return r.token;
}

if (!process.argv.includes('--ohne-sicherung')) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(ROOT, 'data-export', `${target}-vor-korrektur-${stamp}.sql`);
  execute({ kind: 'backup', target, file: backup });
  const b = verifyBackup(backup);
  console.log('Sicherung geprüft: ' + backup + ' (' + b.bytes + ' Bytes)');
}
const r = await api('POST', `/api/admin/users/${+uidArg}/changes`, { changes, reason }, await token());
console.log(`Korrektur für Nutzer ${uidArg} gespeichert (Zeitstempel ${new Date(r.updatedAt).toISOString()}, zusammengeführt: ${r.merged}).`);
for (const c of r.changes) console.log(` - ${c.kind}/${c.key}${c.deleted ? ' gelöscht' : ''}`);
