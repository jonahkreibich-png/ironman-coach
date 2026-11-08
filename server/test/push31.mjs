// Auftrag 31: die ganze Mitteilungs-Kette auf dem lokalen Server (nachgemachter Push-Dienst wie Apple):
// Anmeldung gehört zum Konto und Gerät, Test-Mitteilung mit ehrlichem Ergebnis je Gerät, abgelaufene Anmeldung (410) wird entfernt
// und dem Gerät gemeldet, Ablehnung mit Grund (403 BadJwtToken) wird gespeichert, falscher Schlüssel (VapidPkHashMismatch) gilt als
// abgelaufen, erneutes Anmelden heilt, gleiche Anmeldung behält ihren Stand, Ruhezeit in der Schule, Betreiber-Übersicht, Protokoll.
const BASE = process.env.API || 'http://localhost:8787';
const MOCK = 'http://127.0.0.1:8798';
let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } }
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const sub = async id => (await fetch(MOCK + '/sub' + (id ? '?id=' + id : ''))).json();
const msgs = async () => (await fetch(MOCK + '/messages')).json();
const reset = () => fetch(MOCK + '/reset', { method: 'POST' });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

const setup = (await call('POST', '/api/setup', { name: 'iPhone' })).data;
const T1 = setup.token;
async function pairDevice(name) { const c = (await call('POST', '/api/pair/create', null, T1)).data.code; return (await call('POST', '/api/pair/redeem', { code: c, name })).data.token; }
const T2 = await pairDevice('Altes iPhone'), T3 = await pairDevice('iPad'), T4 = await pairDevice('Mac');

console.log('Anmeldung');
let r = await call('GET', '/api/push/status', null, T1);
ok(r.status === 200 && r.data.configured === true && r.data.thisDevice === false, 'Vorher: Server-Schlüssel gesetzt, Gerät nicht angemeldet');
r = await call('POST', '/api/push/subscribe', { subscription: await sub() }, T1);
ok(r.data.ok && r.data.renewed === true, 'Anmeldung gespeichert');
await call('POST', '/api/push/subscribe', { subscription: await sub('gone') }, T2);
await call('POST', '/api/push/subscribe', { subscription: await sub('bad') }, T3);
await call('POST', '/api/push/subscribe', { subscription: await sub('oldkey') }, T4);
r = await call('GET', '/api/push/status', null, T1);
ok(r.data.thisDevice === true && r.data.devices === 4 && r.data.endTail === 'http://127.0.0.1:8798/push/abc'.slice(-24) && r.data.lastOkAt == null, 'Status: dieses Gerät angemeldet, 4 Geräte im Konto, Ende der Adresse zum Abgleich');

console.log('Test-Mitteilung');
await reset();
r = await call('POST', '/api/push/test', null, T1);
const res = r.data.results || [];
const by = n => res.find(x => x.device === n) || {};
ok(r.data.delivered === 1, 'Nur das gültige Gerät hat sie bekommen (zugestellt: ' + r.data.delivered + ')');
ok(by('iPhone').ok === true && by('iPhone').thisDevice === true, 'iPhone: angenommen, als „dieses Gerät“ markiert');
ok(by('Altes iPhone').gone === true && by('Altes iPhone').status === 410, 'Altes iPhone: 410 abgelaufen');
ok(by('iPad').ok === false && by('iPad').status === 403 && /BadJwtToken/.test(by('iPad').reason), 'iPad: 403 mit Grund BadJwtToken');
ok(by('Mac').gone === true && /VapidPkHashMismatch/.test(by('Mac').reason), 'Mac: Anmeldung zu altem Schlüssel gilt als abgelaufen');
const m = await msgs();
ok(m.some(x => x.id === 'abc' && /Test/.test(x.body || '')), 'Push-Dienst hat die verschlüsselte Mitteilung entschlüsselt erhalten');

r = await call('GET', '/api/push/status', null, T1);
ok(r.data.thisDevice && r.data.lastOkAt > 0 && r.data.fails === 0 && r.data.lastStatus === 201, 'iPhone: letzte Zustellung gespeichert (201)');
r = await call('GET', '/api/push/status', null, T2);
ok(r.data.thisDevice === false && r.data.expired && r.data.expired.status === 410, 'Altes iPhone: abgemeldet und als „abgelaufen“ gemeldet → App zeigt „erneut erlauben“');
r = await call('GET', '/api/push/status', null, T3);
ok(r.data.thisDevice === true && r.data.fails === 1 && /BadJwtToken/.test(r.data.lastError || ''), 'iPad: Fehler gezählt, Grund gespeichert');
r = await call('GET', '/api/push/status', null, T4);
ok(r.data.thisDevice === false && r.data.expired, 'Mac: entfernt, als abgelaufen gemeldet');

console.log('Erneuern');
r = await call('POST', '/api/push/subscribe', { subscription: await sub('neu2') }, T2);
ok(r.data.renewed === true, 'Altes iPhone meldet sich mit neuer Anmeldung');
r = await call('GET', '/api/push/status', null, T2);
ok(r.data.thisDevice === true && !r.data.expired, 'danach wieder aktiv, „abgelaufen“ gelöscht');
r = await call('POST', '/api/push/subscribe', { subscription: await sub() }, T1);
ok(r.data.renewed === false, 'gleiche Anmeldung bei jedem Start: nichts ersetzt');
r = await call('GET', '/api/push/status', null, T1);
ok(r.data.lastOkAt > 0, '…und die letzte Zustellung bleibt bekannt');

console.log('Betreiber');
r = await call('GET', '/api/admin/push', null, T1);
ok(r.status === 200 && r.data.usersWithPush === 1 && r.data.subs === 3, 'Übersicht: 1 Nutzer mit Mitteilungen, 3 angemeldete Geräte (' + JSON.stringify({ u: r.data && r.data.usersWithPush, s: r.data && r.data.subs }) + ')');
ok(r.data.failing === 1 && r.data.list.some(x => x.device === 'iPad' && /BadJwtToken/.test(x.lastError)), 'Übersicht: Sendefehler sichtbar (iPad)');
ok(r.data.expired.some(x => x.device === 'Mac' && x.status === 400), 'Übersicht: abgelaufene Anmeldung (Mac) sichtbar');
await reset();
r = await call('POST', '/api/admin/push/test/1', null, T1);
ok(r.status === 200 && r.data.delivered === 2, 'Betreiber kann einem Nutzer eine Test-Mitteilung schicken (2 zugestellt)');

console.log('Zeitplan, Ruhezeit in der Schule, Protokoll');
const changes = [
  { kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: today, days: [{ date: today, sessions: [{ id: 't-run', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40 }] }] }] }, updatedAt: 1 },
  { kind: 'settings', key: 'main', data: { settings: { notify: { schoolQuiet: true, schoolStart: '07:45', schoolEnd: '13:15', times: { evening: '10:00' } } } }, updatedAt: 1 }
];
await call('POST', '/api/sync', { since: 0, changes }, T1);
await reset();
const tick = (hour, minute, dow, date = today) => call('POST', '/api/test/tick', { date, hour, minute, dow }, T1);
await tick(9, 55, 2);
r = await tick(10, 5, 2);
ok(r.data.quiet === true && (await msgs()).length === 0, 'Dienstag 10:05 mit Schul-Ruhezeit: nichts');
r = await tick(10, 5, 6, '2099-01-03');
ok(r.data.quiet === false, 'Samstag 10:05: keine Schul-Ruhezeit');
await call('POST', '/api/sync', { since: 0, changes: [{ ...changes[1], data: { settings: { notify: { schoolQuiet: false, times: { evening: '10:00' } } } }, updatedAt: Date.now() }] }, T1);
await reset();
await tick(9, 55, 2);
r = await tick(10, 5, 2);
const ev = await msgs();
ok(r.data.quiet === false && r.data.sent.includes('evening') && ev.some(x => /Wie war/.test(x.title || '')), 'Ohne Schul-Ruhezeit: Abend-Erinnerung (auf 10:00 gestellt) kommt');
r = await call('GET', '/api/admin/push', null, T1);
const wk = (r.data.week || []).find(x => x.userId === 1) || {};
ok(wk.sent >= 1 && wk.delivered >= 1, 'Protokoll zählt wirklich zugestellte Mitteilungen (' + JSON.stringify(wk) + ')');

console.log('Abmelden');
await call('POST', '/api/devices/self/logout', null, T3);
r = await call('GET', '/api/admin/push', null, T1);
ok(!r.data.list.some(x => x.device === 'iPad'), 'abgemeldetes Gerät hat keine Anmeldung mehr');

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
