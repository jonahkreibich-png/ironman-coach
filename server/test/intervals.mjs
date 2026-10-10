// Test des intervals.icu-Abrufs gegen den Mock (test/mock-intervals.mjs) und den lokalen Server.
// Erwartet eine frische lokale Datenbank.
const BASE = process.env.API || 'http://localhost:8787';
let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } }
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const yd = new Date(today + 'T12:00:00Z'); yd.setUTCDate(yd.getUTCDate() - 1); const y = yd.toISOString().slice(0, 10);

let r = await call('POST', '/api/setup', { name: 'Test' });
const T = r.data.token;
const plan = { meta: {}, weeks: [{ weekNumber: 1, days: [
  { date: y, sessions: [{ id: 'p-y-run', sport: 'run', title: 'Lauf' }] },
  { date: today, sessions: [{ id: 'p-t-bike', sport: 'bike', title: 'Sweet-Spot 3×8' }, { id: 'p-t-swim', sport: 'swim', title: 'Schwimmen' }] }
] }] };
await call('POST', '/api/sync', { since: 0, changes: [
  { kind: 'plan', key: 'main', data: plan, updatedAt: 1000 },
  { kind: 'trend', key: y, data: { date: y, restingHR: 55, illness: 'Halskratzen' }, updatedAt: 1000 },
  { kind: 'session', key: 'p-t-bike', data: { completed: false, notes: 'Beine schwer', metrics: { hr: '139' } }, updatedAt: 1000 }
] }, T);

console.log('Erster Abruf');
r = await call('POST', '/api/intervals/import', null, T);
ok(r.status === 200 && r.data.ok, 'Abruf erfolgreich' + (r.data && r.data.error ? ': ' + r.data.error : ''));
ok(r.data.wellnessDays === 2, 'Zwei Wellness-Tage übernommen');
ok(r.data.matched === 1 && r.data.extras === 1, 'Rad zugeordnet, Lauf als Extra (matched ' + r.data.matched + ', extras ' + r.data.extras + ')');
ok(r.data.custom.includes('OuraTempDeviation'), 'Zusatzfelder erkannt: ' + r.data.custom.join(', '));

r = await call('POST', '/api/sync', { since: 0, changes: [] }, T);
const rec = (k, key) => (r.data.records.find(x => x.kind === k && x.key === key) || {}).data;
const ty = rec('trend', y), tt = rec('trend', today);
ok(ty.restingHR === 55, 'Manueller Ruhepuls (55) bleibt erhalten');
ok(ty.hrv === 74 && ty.sleepHours === 8.5 && ty.sleepQuality === 8 && ty.spo2 === 97.2 && ty.breathingRate === 14.6, 'Leere Felder gefüllt (HFV, Schlaf, Qualität, SpO2, Atem)');
ok(ty.ctl === 40.2 && ty.atl === 45.6 && ty.tsb === -5.4, 'CTL/ATL/TSB übernommen');
ok(ty.bodyTemp === 0.12 && ty.remSleep === 90, 'Oura-Zusatzfelder: Temperatur und REM');
ok(ty.illness === 'Halskratzen', 'Notiz bleibt erhalten');
ok(tt.sleepQuality === 7, 'intervals-Schlafqualität 2 → 7/10');
const bike = rec('session', 'p-t-bike');
ok(bike.completed === true && bike.metrics.km === 27.5 && bike.metrics.min === 60 && bike.metrics.speed === 27.5, 'Rad-Einheit abgehakt mit km, min, km/h');
ok(bike.metrics.hr === '139', 'Manueller Puls in der Einheit bleibt');
ok(bike.notes === 'Beine schwer' && bike.rpe === '6' && bike.icuLoad === 58, 'Notiz bleibt, RPE und Trainingslast übernommen');
const extra = r.data.records.find(x => x.kind === 'custom');
ok(extra && extra.data.sport === 'run' && extra.data.metrics.pace === '6:00' && extra.data.date === today, 'Lauf ohne Plan-Einheit am Tag → Extra-Einheit mit Pace 6:00');
ok(!r.data.records.find(x => x.kind === 'custom' && x.data.title === 'Spaziergang'), 'Spaziergang wird ignoriert');
ok(!rec('session', 'p-t-swim'), 'Schwimmen ohne Aktivität bleibt offen');
const cursor = r.data.cursor;

console.log('Zweiter Abruf');
r = await call('POST', '/api/intervals/import', null, T);
ok(r.data.ok && r.data.matched === 0 && r.data.extras === 0 && r.data.wellnessDays === 0, 'Nichts doppelt übernommen');
r = await call('POST', '/api/sync', { since: cursor, changes: [] }, T);
ok(r.data.records.length === 0, 'Keine unnötigen Änderungen');

console.log('Manuelle Korrektur');
const t2 = Object.assign({}, tt, { hrv: 70 });
await call('POST', '/api/sync', { since: 0, changes: [{ kind: 'trend', key: today, data: t2, updatedAt: Date.now() }] }, T);
r = await call('POST', '/api/intervals/import', null, T);
r = await call('POST', '/api/sync', { since: 0, changes: [] }, T);
ok(r.data.records.find(x => x.kind === 'trend' && x.key === today).data.hrv === 70, 'Von Hand geänderte HFV wird nicht überschrieben');

r = await call('GET', '/api/intervals/status', null, T);
ok(r.data.configured && r.data.last && r.data.last.ok, 'Status: letzte Übernahme gespeichert');

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
