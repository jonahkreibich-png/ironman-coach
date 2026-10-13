// Phase 5 auf dem lokalen Server: Abo, Verschlüsselung, Zeitplan, Ruhezeit, Tageslimit.
const BASE = process.env.API || 'http://localhost:8787';
const MOCK = 'http://127.0.0.1:8798';
let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } }
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const msgs = async () => (await fetch(MOCK + '/messages')).json();
const reset = () => fetch(MOCK + '/reset', { method: 'POST' });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const dow = 2; // Dienstag simulieren (Schultag)
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tick = (hour, minute, extra) => call('POST', '/api/test/tick', Object.assign({ date: today, hour, minute, dow }, extra || {}), T);

const T = (await call('POST', '/api/setup', { name: 'Test' })).data.token;
let r = await call('GET', '/api/push/key');
ok(r.status === 200 && r.data.key.length === 87, 'Öffentlicher VAPID-Schlüssel abrufbar');
const sub = await (await fetch(MOCK + '/sub')).json();
r = await call('POST', '/api/push/subscribe', { subscription: sub }, T);
ok(r.status === 200, 'Abo gespeichert');
r = await call('POST', '/api/push/test', null, T);
let m = await msgs();
ok(r.data.delivered === 1 && m.length === 1 && !!m[0].title && !m[0].error, 'Test-Mitteilung: VAPID gültig, Inhalt entschlüsselt' + (m[0] && m[0].error ? ' (' + m[0].error + ')' : ''));

// Plan: heute Rad 17:30 (Text), morgen früher Lauf, Trend mit Morgenwerten
const days = [
  { date: today, sessions: [{ id: 't-bike', sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60, description: 'Start 17:30 nach der Schule' }] },
  { date: add(today, 1), sessions: [{ id: 'm-run', sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40, description: 'Vor der Schule, 6:15' }] }
];
const changes = [
  { kind: 'plan', key: 'main', data: { meta: { runIntervalsAllowed: true }, weeks: [{ weekNumber: 1, startDate: today, days }] }, updatedAt: 1 },
  { kind: 'settings', key: 'main', data: { settings: { lthrBike: 162, lthrRun: 170, readiness: { rhrMax: 56, hrvMin: 65, tempMax: 0.5 } }, nutritionProfile: { age: 17, heightCm: 184, weightKg: 73, pal: 1.4 } }, updatedAt: 1 },
  { kind: 'trend', key: today, data: { date: today, hrv: 72, restingHR: 50, sleepHours: 8.8, sleepQuality: 8 }, updatedAt: 1 }
];
await call('POST', '/api/sync', { since: 0, changes }, T);

await reset();
await tick(6, 40);
r = await tick(6, 45);
m = await msgs();
ok(m.length === 1 && /Ampel heute/.test(m[0].title) && /17:30 Sweet-Spot/.test(m[0].body) && m[0].url.includes('go=heute'), 'Morgens 6:45 (Schultag): Ampel und Einheit des Tages' + JSON.stringify(m[0] || {}));
ok(m[0] && m[0].badge === 1, 'App-Icon-Badge: 1 offene Einheit');
await tick(16, 25);
r = await tick(16, 35);
m = await msgs();
ok(m.length === 2 && /^17:30 Sweet-Spot/.test(m[1].title) && /bpm/.test(m[1].body) && /jetzt noch/.test(m[1].body), '1 h vor 17:30: Einheit, Pulsbereich, Snack-Tipp');
r = await tick(16, 40);
ok((await msgs()).length === 2, 'Nicht doppelt');
await tick(17, 55);
r = await tick(18, 5);
m = await msgs();
ok(m.length === 3 && /Genug gegessen/.test(m[2].title), '18:00 Trainingstag, unter 50 % gegessen → Essens-Hinweis');
await tick(20, 55);
r = await tick(21, 5);
m = await msgs();
// Tageslimit: 3 Routine-Mitteilungen + 1 Platz für Warnungen → 21:00 kommt nicht mehr
ok(m.length === 3, 'Höchstens 4 pro Tag, ein Platz bleibt für Warnungen frei');
await call('POST', '/api/sync', { since: 0, changes: [{ kind: 'trend', key: today, data: { date: today, hrv: 72, restingHR: 50, sleepHours: 8.8, bodyTemp: 0.6 }, updatedAt: Date.now() }] }, T);
r = await tick(21, 30);
m = await msgs();
ok(m.length === 4 && /Temperatur/.test(m[3].title) && m[3].urgent, 'Warnung Temperatur +0,6 kommt trotzdem (4. Mitteilung)');
r = await tick(22, 0);
ok((await msgs()).length === 4, 'Danach ist Schluss für heute');

// Ruhezeit: neuer Tag simulieren über anderes Datum
await reset();
const tomorrow = add(today, 1), tdow = (dow + 1) % 7;
await call('POST', '/api/test/tick', { date: tomorrow, hour: 22, minute: 25, dow: tdow }, T);
await reset(); // was um 22:25 noch rausging (z. B. eine gestern zurückgehaltene Warnung), zählt hier nicht
r = await call('POST', '/api/test/tick', { date: tomorrow, hour: 22, minute: 45, dow: tdow }, T);
ok(r.data.quiet === true && (await msgs()).length === 0, 'Ruhezeit ab 22:30: nichts');

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
