// API-Tests gegen den lokalen Server (npm run dev). Erwartet eine frische lokale Datenbank.
const BASE = process.env.API || 'http://localhost:8787';
let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } }
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8765', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data, cors: res.headers.get('Access-Control-Allow-Origin') };
}

console.log('Einrichten');
let r = await call('GET', '/api/health');
ok(r.status === 200 && r.data.setup === false, 'Server noch nicht eingerichtet');
ok(r.cors === 'http://localhost:8765', 'CORS für erlaubte Herkunft');
r = await call('POST', '/api/setup', { name: 'iPhone' });
ok(r.status === 200 && r.data.token && r.data.token.length >= 40, 'Erstes Gerät bekommt langen Schlüssel');
const A = r.data.token, Aid = r.data.deviceId;
r = await call('POST', '/api/setup', { name: 'Angreifer' });
ok(r.status === 409, 'Zweites Einrichten wird abgelehnt');
r = await call('GET', '/api/me', null, 'falsch-falsch-falsch-falsch');
ok(r.status === 401, 'Falscher Schlüssel wird abgelehnt');
r = await call('GET', '/api/me');
ok(r.status === 401, 'Ohne Schlüssel kein Zugriff');

console.log('Koppeln');
r = await call('POST', '/api/pair/create', null, A);
ok(r.status === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.data.code), 'Kopplungscode erzeugt: ' + (r.data && r.data.code));
ok(r.data.expiresAt - Date.now() > 9 * 60000 && r.data.expiresAt - Date.now() <= 10 * 60000 + 2000, 'Code gilt 10 Minuten');
const code = r.data.code;
r = await call('POST', '/api/pair/redeem', { code: 'AAAA-AAAA', name: 'PC' });
ok(r.status === 403, 'Falscher Code wird abgelehnt');
r = await call('POST', '/api/pair/redeem', { code: code.toLowerCase().replace('-', ' '), name: 'PC' });
ok(r.status === 200 && r.data.token, 'Richtiger Code (auch klein geschrieben) koppelt');
const B = r.data.token, Bid = r.data.deviceId;
r = await call('POST', '/api/pair/redeem', { code, name: 'PC2' });
ok(r.status === 403, 'Code ist nur einmal gültig');

console.log('Sync');
r = await call('POST', '/api/sync', { since: 0, changes: [
  { kind: 'session', key: 's1', data: { completed: true }, updatedAt: 1000 },
  { kind: 'trend', key: '2026-10-10', data: { date: '2026-10-10', hrv: 70 }, updatedAt: 1000 }
] }, A);
ok(r.status === 200 && r.data.records.length === 2 && r.data.cursor > 0, 'Hochladen und zurückbekommen');
const cur = r.data.cursor;
r = await call('POST', '/api/sync', { since: 0, changes: [] }, B);
ok(r.data.records.length === 2, 'Zweites Gerät sieht beide Datensätze');
r = await call('POST', '/api/sync', { since: cur, changes: [{ kind: 'session', key: 's1', data: { completed: false }, updatedAt: 500 }] }, B);
ok(r.data.records.length === 0, 'Ältere Änderung verliert (neueste gewinnt)');
r = await call('POST', '/api/sync', { since: cur, changes: [{ kind: 'session', key: 's1', data: { completed: true, rpe: 6 }, updatedAt: 2000 }] }, B);
ok(r.data.records.length === 1 && r.data.records[0].data.rpe === 6, 'Neuere Änderung gewinnt');
r = await call('POST', '/api/sync', { since: r.data.cursor, changes: [{ kind: 'trend', key: '2026-10-10', deleted: true, updatedAt: 3000 }] }, A);
ok(r.data.records.length === 1 && r.data.records[0].deleted === true, 'Löschen wird als Grabstein übertragen');
r = await call('POST', '/api/sync', { since: 0, changes: [{ kind: 'boese', key: 'x', data: 1, updatedAt: 1 }] }, A);
ok(r.status === 400, 'Unbekannte Datensatz-Art wird abgelehnt');

console.log('Backup');
r = await call('POST', '/api/backups/now', null, A);
ok(r.status === 200 && r.data.count === 1, 'Tägliches Backup enthält nur nicht gelöschte Datensätze');
r = await call('GET', '/api/backups', null, A);
ok(r.data.backups.length === 1, 'Backup wird aufgelistet');
r = await call('GET', '/api/backups/' + r.data.backups[0].day, null, A);
ok(r.data.records[0].key === 's1', 'Backup lässt sich abrufen');

console.log('Geräte');
r = await call('GET', '/api/devices', null, A);
ok(r.data.devices.length === 2 && r.data.devices.find(d => d.self).id === Aid, 'Geräteliste');
r = await call('DELETE', '/api/devices/' + Aid, null, A);
ok(r.status === 400, 'Gerät kann sich nicht selbst entfernen');
r = await call('DELETE', '/api/devices/' + Bid, null, A);
ok(r.status === 200, 'Verlorenes Gerät entfernen');
r = await call('GET', '/api/me', null, B);
ok(r.status === 401, 'Entferntes Gerät hat keinen Zugriff mehr');

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
