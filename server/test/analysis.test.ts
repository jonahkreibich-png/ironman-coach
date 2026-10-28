import { putRecords } from '../src/store';
/* Auftrag 7, Punkt 6: der Analyse-Coach läuft auf dem Server, auch wenn die App zu ist:
   nach einer neuen Einheit (Sync), beim 5-Minuten-Lauf, wenn sich Einheiten aus einer anderen Quelle geändert haben, morgens und sonntags. */
import { test, expect } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { everyFive } from '../src/index';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function setup() {
  const env: any = makeEnv({ SETUP_CODE: 'code-1234-abcd-xyz' });
  const T = (await call(env, 'POST', '/api/setup', { name: 'Test', setupCode: 'code-1234-abcd-xyz' })).data.token;
  const days: any[] = []; for (let i = -10; i <= 6; i++) days.push({ date: add(today, i), sessions: [{ id: 's' + (i + 10), sport: i % 2 ? 'run' : 'rest', title: i % 2 ? 'Lockerer Lauf 40 min' : 'Ruhetag', zone: 'Zone 2', plannedMinutes: 40 }] });
  const changes: any[] = [{ kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: days[0].date, days }] }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { birthYear: 2000, sports: ['run'], thresholds: { lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 28, aetHr: [150, 155] } }, updatedAt: 1 }];
  for (let i = 30; i >= 0; i--) changes.push({ kind: 'trend', key: add(today, -i), data: { date: add(today, -i), ctl: 30, atl: 50, tsb: -20, restingHR: 50, hrv: 70, sleepHours: 8 }, updatedAt: 1 });
  await call(env, 'POST', '/api/sync', { since: 0, changes }, T);
  return { env, T };
}
const records = async (env: any, T: string) => (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, T)).data.records;

test('neue Einheit per Sync → Analyse gespeichert (analysis/latest) mit Top-Erkenntnissen und Belastung', async () => {
  const { env, T } = await setup();
  const runs = ['s1', 's3', 's5'].map((id, i) => ({ kind: 'session', key: id, data: { completed: true, metrics: { min: '40', km: '6', hr: String(165 + i) } }, updatedAt: Date.now() + i }));
  await call(env, 'POST', '/api/sync', { since: 0, changes: runs }, T);
  const recs = await records(env, T);
  const a = recs.find((r: any) => r.kind === 'analysis' && r.key === 'latest');
  expect(a).toBeTruthy();
  expect(a.data.load.acwr).toBeGreaterThan(1.5);
  expect(a.data.top.map((i: any) => i.id)).toContain('acwr-high');
  // Warnungen als Nachricht, kleine Änderung automatisch mit Bezug zum Rückgängig
  expect(recs.some((r: any) => r.kind === 'coachMsg' && /Belastung steigt zu schnell/.test(r.data.title || ''))).toBe(true);
  const adj = recs.find((r: any) => r.kind === 'adjust' && /^ana-hr-/.test(r.key));
  expect(adj && adj.data.set.description).toMatch(/Puls-Grenze: unter 155/);
});
test('Zeitplan ohne App: geänderte Einheiten (z. B. von intervals.icu) lösen die Analyse aus, unveränderte nicht', async () => {
  const { env, T } = await setup();
  const uid = 1;
  const b = { date: today, hour: 14, minute: 0, dow: new Date(today + 'T12:00:00Z').getUTCDay() };
  await everyFive(env, b, [uid]);
  const n1 = (await records(env, T)).filter((r: any) => r.kind === 'analysis').length;
  expect(n1).toBe(1);
  const first = (await env.DB.prepare("SELECT updated_at FROM records WHERE kind = 'analysis'").first()).updated_at;
  await everyFive(env, { ...b, minute: 30 }, [uid]);
  expect((await env.DB.prepare("SELECT updated_at FROM records WHERE kind = 'analysis'").first()).updated_at).toBe(first);
  // neue Einheit wie ein Import von intervals.icu (alle Importe schreiben über putRecords; Auftrag 21: Datenstand-Zähler statt Zählen)
  await putRecords(env, 1, [{ kind: 'session', key: 's7', data: { completed: true, metrics: { min: '40', hr: '150' } }, updatedAt: Date.now() + 5000 }]);
  await everyFive(env, { ...b, hour: 15, minute: 0 }, [uid]);
  expect((await env.DB.prepare("SELECT updated_at FROM records WHERE kind = 'analysis'").first()).updated_at).toBeGreaterThan(first);
});
test('Analyse auf Abruf (/api/coach/analysis) und sonntags in der Wochenplanung', async () => {
  const { env, T } = await setup();
  expect((await call(env, 'POST', '/api/coach/analysis', null, T)).data.top.length).toBeGreaterThan(0);
  const r = await call(env, 'POST', '/api/coach/weekly', { date: today }, T);
  expect(r.status).toBe(200);
  expect((await records(env, T)).some((x: any) => x.kind === 'coachMsg' && x.data.title === 'Was der Coach gerade sieht')).toBe(true);
});
test('Lauftest erledigt (Werte von Uhr oder Hand) → Server übernimmt die Zonen ins Profil, mit Mitteilung', async () => {
  const env: any = makeEnv({ SETUP_CODE: 'code-1234-abcd-xyz' });
  const T = (await call(env, 'POST', '/api/setup', { name: 'Test', setupCode: 'code-1234-abcd-xyz' })).data.token;
  const day = add(today, -1);
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: day, days: [{ date: day, sessions: [{ id: 'test1', sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 55 }] }] }] }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { birthYear: 2009, sports: ['run'], thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, aetHr: [150, 155] } }, updatedAt: 1 }] }, T);
  await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 'test1', data: { completed: true, metrics: { hr: '173', pace: '5:28' } }, updatedAt: Date.now() }] }, T);
  const recs = await records(env, T);
  const prof = recs.find((r: any) => r.kind === 'profile').data;
  expect(prof.thresholds).toMatchObject({ lthrRun: 173, thresholdPaceRunSec: 328, aetHr: [153, 158] });
  expect(recs.find((r: any) => r.kind === 'settings').data.settings.lthrRun).toBe(173);
  expect(recs.some((r: any) => r.kind === 'coachMsg' && r.data.title === 'Zonen aktualisiert')).toBe(true);
});
test('Radtest erledigt (Testfelder) → Server übernimmt Schwellenpuls Rad und FTP, mit Mitteilung (Auftrag 8)', async () => {
  const env: any = makeEnv({ SETUP_CODE: 'code-1234-abcd-xyz' });
  const T = (await call(env, 'POST', '/api/setup', { name: 'Test', setupCode: 'code-1234-abcd-xyz' })).data.token;
  const day = add(today, -1);
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: day, days: [{ date: day, sessions: [{ id: 'bt1', sport: 'bike', title: 'Radtest 20 min', plannedMinutes: 70 }] }] }] }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { birthYear: 2009, sports: ['bike'], powerMeter: true, thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28 } }, updatedAt: 1 }] }, T);
  await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 'bt1', data: { completed: true, metrics: { testHr: '174', testPower: '250' } }, updatedAt: Date.now() }] }, T);
  const recs = await records(env, T);
  expect(recs.find((r: any) => r.kind === 'profile').data.thresholds).toMatchObject({ lthrBike: 174, ftp: 238 });
  expect(recs.find((r: any) => r.kind === 'settings').data.settings.lthrBike).toBe(174);
  expect(recs.some((r: any) => r.kind === 'coachMsg' && r.data.title === 'Rad-Zonen aktualisiert')).toBe(true);
});
