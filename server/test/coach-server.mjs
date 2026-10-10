// Phase 4 auf dem lokalen Server: Tagesanpassung landet als "adjust"-Datensatz im Sync.
const BASE = process.env.API || 'http://localhost:8787';
let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } }
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const T = (await call('POST', '/api/setup', { name: 'Test' })).data.token;
const days = []; for (let i = -3; i <= 3; i++) days.push({ date: add(today, i), sessions: [{ id: 's' + i, sport: i === 0 ? 'bike' : 'rest', title: i === 0 ? 'Sweet-Spot 3×8' : 'Ruhetag', zone: 'Zone 3-4', plannedMinutes: 60 }] });
const changes = [{ kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: days[0].date, days }] }, updatedAt: 1 }];
for (let i = 28; i >= 1; i--) changes.push({ kind: 'trend', key: add(today, -i), data: { date: add(today, -i), hrv: 70 + ((i % 5) - 2) * 6, restingHR: 50, sleepHours: 8.6 }, updatedAt: 1 });
changes.push({ kind: 'trend', key: today, data: { date: today, hrv: 46, restingHR: 57, sleepHours: 6, bodyTemp: 0.6 }, updatedAt: 1 });
await call('POST', '/api/sync', { since: 0, changes }, T);

let r = await call('POST', '/api/coach/daily', null, T);
ok(r.status === 200 && r.data.created === 1, 'Rote Ampel → eine Anpassung angelegt' + (r.data && r.data.skipped ? ' (' + r.data.skipped + ')' : ''));
r = await call('POST', '/api/sync', { since: 0, changes: [] }, T);
const a = r.data.records.find(x => x.kind === 'adjust');
ok(a && a.data.sessionId === 's0' && a.data.set.plannedMinutes === 25, 'Anpassung kommt per Sync in der App an');
r = await call('POST', '/api/coach/daily', null, T);
ok(r.data.created === 0, 'Kein zweites Mal');
await call('POST', '/api/sync', { since: 0, changes: [{ kind: 'adjust', key: a.key, data: Object.assign({}, a.data, { undone: true }), updatedAt: Date.now() }] }, T);
r = await call('POST', '/api/coach/daily', null, T);
ok(r.data.created === 0, 'Nach Rückgängig in der App wird sie nicht neu angelegt');
r = await call('POST', '/api/coach/weekly', { date: add(today, 3) }, T);
ok(r.status === 200, 'Wochenplanung läuft ohne Fehler' + (r.data && r.data.error ? ': ' + r.data.error : ''));

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
