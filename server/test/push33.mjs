// Auftrag 33: Mitteilungen zuverlässig – auf dem lokalen Server mit nachgemachtem Push-Dienst (wie Apple):
// Empfangsbestätigung des Geräts je Mitteilung (gesendet / angenommen / angekommen), alte Kennung desselben Geräts bekommt nichts mehr
// (echte Zweitgeräte schon), zeitgebundene Mitteilungen mit Urgency high und passender TTL, jede geplante Mitteilung genau einmal,
// Adduktoren-Erinnerung nur bei aktiver Leisten-/Adduktoren-Beschwerde, Protokoll für Mitteilungen-Seite und Betreiber.
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
const DAY = 86400000;
const dowOf = d => new Date(d + 'T12:00:00Z').getUTCDay();
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
// feste Tage in der Zukunft (Montag, Mittwoch, Freitag einer Woche), damit nichts mit „heute“ kollidiert
let MON = '2099-01-01'; while (dowOf(MON) !== 1) MON = addDays(MON, 1);
const WED = addDays(MON, 2), FRI = addDays(MON, 4), TUE = addDays(MON, 1);

const setup = (await call('POST', '/api/setup', { name: 'iPhone' })).data;
const T1 = setup.token, D1 = setup.deviceId;
async function pairDevice(name) { const c = (await call('POST', '/api/pair/create', null, T1)).data.code; return (await call('POST', '/api/pair/redeem', { code: c, name })).data; }
const old = await pairDevice('iPhone'), ipad = await pairDevice('iPad'), mac = await pairDevice('Mac');
const T2 = old.token, T3 = ipad.token, T4 = mac.token;

await call('POST', '/api/push/subscribe', { subscription: await sub('abc') }, T1);
await call('POST', '/api/push/subscribe', { subscription: await sub('alt') }, T2);
await call('POST', '/api/push/subscribe', { subscription: await sub('ipad') }, T3);
await call('POST', '/api/push/subscribe', { subscription: await sub('mac') }, T4);
// Das alte iPhone (dieselbe App, frühere Kennung): angelegt vor 40 Tagen, zuletzt gesehen vor 10 Tagen; das neue iPhone kam danach.
// Der Mac wurde ebenfalls lange nicht gesehen, aber es gibt keinen neueren Mac → echtes Zweitgerät, bleibt.
await call('POST', '/api/test/device', { deviceId: old.deviceId, createdAt: Date.now() - 40 * DAY, lastSeen: Date.now() - 10 * DAY }, T1);
await call('POST', '/api/test/device', { deviceId: D1, createdAt: Date.now() - 9 * DAY }, T1);
await call('POST', '/api/test/device', { deviceId: mac.deviceId, createdAt: Date.now() - 60 * DAY, lastSeen: Date.now() - 20 * DAY }, T1);

console.log('Alte Kennung desselben Geräts');
await reset();
let r = await call('POST', '/api/push/test', null, T1);
const devs = (r.data.results || []).map(x => x.device).sort();
ok(r.status === 200 && typeof r.data.mid === 'string' && r.data.mid.length > 6, 'Test-Mitteilung hat eine eigene Kennung (' + (r.data && r.data.mid) + ')');
ok(JSON.stringify(devs) === JSON.stringify(['iPad', 'Mac', 'iPhone'].sort()), 'nur das neue iPhone, iPad und Mac bekommen sie (' + devs.join(', ') + ')');
let m = await msgs();
ok(!m.some(x => x.id === 'alt'), 'alte iPhone-Kennung bekommt nichts mehr');
ok(m.some(x => x.id === 'mac'), 'echtes Zweitgerät (Mac, lange nicht gesehen, aber nicht ersetzt) bekommt sie weiter');
const mid = r.data.mid;
const mine = m.find(x => x.id === 'abc') || {};
ok(mine.mid === mid && typeof mine.rt === 'string' && mine.rt.length >= 20, 'Mitteilung enthält Kennung und Empfangs-Schlüssel für den Service Worker');
ok(mine.urgency === 'high' && mine.ttl > 0 && mine.ttl <= 600, 'Test: Urgency high, kurze TTL (' + mine.urgency + ', ' + mine.ttl + ' s)');

console.log('Empfangsbestätigung');
r = await call('GET', '/api/push/receipt?mid=' + encodeURIComponent(mid), null, T1);
let me = (r.data.devices || []).find(x => x.thisDevice) || {};
ok(r.status === 200 && me.accepted === true && !me.receivedAt, 'vor der Bestätigung: angenommen, aber noch nicht angekommen');
r = await call('POST', '/api/push/receipt', { t: mine.rt, at: Date.now() });
ok(r.status === 200 && r.data.ok === true, 'Service Worker meldet „angekommen“ (ohne Geräte-Schlüssel, nur mit Empfangs-Schlüssel)');
r = await call('POST', '/api/push/receipt', { t: 'x'.repeat(30) });
ok(r.status === 200 && r.data.ok === false, 'unbekannter Empfangs-Schlüssel ändert nichts');
r = await call('POST', '/api/push/receipt', { t: '<script>' });
ok(r.status === 400, 'ungültiger Empfangs-Schlüssel wird abgelehnt');
r = await call('GET', '/api/push/receipt?mid=' + encodeURIComponent(mid), null, T1);
me = (r.data.devices || []).find(x => x.thisDevice) || {};
const ip = (r.data.devices || []).find(x => x.device === 'iPad') || {};
ok(me.receivedAt > 0 && me.accepted === true, 'dieses Gerät: angekommen');
ok(ip.accepted === true && !ip.receivedAt, 'iPad: angenommen, (noch) nicht angekommen');
r = await call('GET', '/api/push/receipt?mid=' + encodeURIComponent(mid), null, T3);
ok(r.status === 200 && (r.data.devices || []).find(x => x.thisDevice).device === 'iPad', 'andere Geräte sehen ihren eigenen Stand');

console.log('Status der alten Kennung');
r = await call('GET', '/api/push/status', null, T2);
ok(r.data.thisDevice === false && r.data.expired && r.data.expired.reason === 'ersetzt', 'alte Kennung: als „ersetzt“ gemeldet (meldet sich beim Öffnen von selbst neu an)');
ok(r.data.expired && r.data.expired.endTail === 'http://127.0.0.1:8798/push/alt'.slice(-24), '…mit dem Ende der verworfenen Adresse');
r = await call('POST', '/api/push/subscribe', { subscription: await sub('alt') }, T2);
r = await call('GET', '/api/push/status', null, T2);
ok(r.data.thisDevice === true && !r.data.expired, 'wieder geöffnet und neu gemeldet: wieder aktiv');

console.log('Zeitplan: genau einmal, Urgency und TTL');
const plan = { kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: MON, days: [MON, TUE, WED, addDays(MON, 3), FRI].map(date => ({ date, sessions: [{ id: 'run-' + date, sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40, time: '17:00' }] })) }] }, updatedAt: 1 };
const prof = (extra, at) => ({ kind: 'profile', key: 'main', data: { name: 'Test', sports: ['run', 'football'], teamSport: { name: 'Fußball', trainingDays: [2] }, thresholds: {}, ...extra }, updatedAt: at });
await call('POST', '/api/sync', { since: 0, changes: [plan, prof({}, 2), { kind: 'settings', key: 'main', data: { settings: { notify: { times: { morningSchool: '06:45', adductors: '19:00' } } } }, updatedAt: 1 }] }, T1);
await reset();
const tick = (date, hour, minute) => call('POST', '/api/test/tick', { date, hour, minute, dow: dowOf(date) }, T1);
const [a, b] = await Promise.all([tick(MON, 6, 45), tick(MON, 6, 45)]);
await tick(MON, 6, 50);
m = (await msgs()).filter(x => x.id === 'abc' && x.tag === 'morning');
const sentBy = x => (x.data && (x.data.sent || (x.data[1] && x.data[1].sent))) || [];
ok(m.length === 1, 'Morgen-Briefing bei zwei gleichzeitigen Läufen genau einmal verschickt (' + m.length + '×; ' + JSON.stringify([sentBy(a), sentBy(b)]) + ')');
ok(m[0] && m[0].urgency === 'high', 'Morgen-Briefing: Urgency high');
ok(m[0] && m[0].ttl === (12 * 60 - (6 * 60 + 45)) * 60, 'Morgen-Briefing: TTL bis 12:00 (' + (m[0] && m[0].ttl) + ' s)');
ok(m[0] && m[0].mid === MON + '|morning', 'Kennung je Tag und Mitteilung');
await tick(MON, 15, 55); await tick(MON, 16, 0);
m = (await msgs()).filter(x => x.id === 'abc' && /^pre-/.test(x.tag || ''));
ok(m.length === 1 && m[0].urgency === 'high' && m[0].ttl === 3600, 'Erinnerung 1 h vor der Einheit: Urgency high, TTL bis Beginn (' + (m[0] && m[0].ttl) + ' s)');

console.log('Adduktoren-Erinnerung nur bei Beschwerde');
await reset();
await tick(MON, 18, 55); r = await tick(MON, 19, 5);
ok(!sentBy(r).includes('adductors') && !(await msgs()).some(x => x.tag === 'adductors'), 'Teamsport ohne Beschwerde: keine Adduktoren-Erinnerung');
await call('POST', '/api/sync', { since: 0, changes: [prof({ injuries: 'Leiste zieht beim Sprinten' }, 3)] }, T1);
await tick(WED, 18, 55); r = await tick(WED, 19, 5);
ok(sentBy(r).includes('adductors'), 'Leisten-Beschwerde eingetragen: Erinnerung kommt (Mi 19:00)');
await call('POST', '/api/sync', { since: 0, changes: [prof({ injuries: '' }, 4)] }, T1);
await tick(FRI, 18, 55); r = await tick(FRI, 19, 5);
ok(!sentBy(r).includes('adductors'), 'Beschwerde entfernt: keine Erinnerung mehr (Fr)');

console.log('Protokoll');
r = await call('GET', '/api/push/log', null, T1);
const items = r.data.items || [];
const morning = items.find(x => x.mid === MON + '|morning') || {};
ok(r.status === 200 && morning.type === 'morning' && morning.devices && morning.devices.some(d => d.thisDevice && d.accepted), 'Mitteilungen-Seite: Liste mit gesendet/angenommen je Gerät');
ok(!items.some(x => x.type === 'adductors' && x.day === MON), 'nicht verschickte Adduktoren-Erinnerung steht nicht im Protokoll');
r = await call('GET', '/api/admin/push', null, T1);
const wk = (r.data.week || []).find(x => x.userId === 1) || {};
ok(wk.sent >= 3 && wk.accepted >= 3 && wk.received >= 1, 'Betreiber: gesendet / angenommen / angekommen (' + JSON.stringify(wk) + ')');
ok((r.data.list || []).some(x => x.device === 'iPhone' && x.lastReceivedAt > 0), 'Betreiber: zuletzt angekommen je Gerät');
ok((r.data.recent || []).some(x => x.mid === mid && x.received >= 1 && x.accepted >= 3), 'Betreiber: letzte Mitteilungen mit Zählern');

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
