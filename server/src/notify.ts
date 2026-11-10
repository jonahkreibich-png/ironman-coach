/* Phase 5: Push-Mitteilungen. Zeiten in Europe/Berlin, Ruhezeit 22:30-6:00, höchstens 4 pro Tag.
   Läuft alle 5 Minuten. Geplante Mitteilungen werden fällig, wenn ihre Uhrzeit seit dem letzten Lauf erreicht wurde. */
import * as C from '../../shared/core';
import { type Env, berlinParts, addDaysStr, getMeta, setMeta } from './store';
import { loadState } from './coach';
import { sendPush } from './webpush';


export const DEFAULT_PREFS = {
  types: { morning: true, preSession: true, eveEarly: true, evening: true, warnings: true, adductors: true, food: true, weekly: true, achievements: true },
  times: { morningSchool: '06:45', morningWeekend: '09:00', eveEarly: '21:00', evening: '20:30', adductors: '19:00', food: '18:00', weekly: '18:00' },
  quietStart: '22:30', quietEnd: '06:00', preSessionMinutes: 60, holidays: false, maxPerDay: 4,
  // Auftrag 31: zweite Ruhezeit an Schultagen (Mo–Fr, nicht in den Ferien), wahlweise
  schoolQuiet: false, schoolStart: '07:45', schoolEnd: '13:15'
};
export function prefsOf(settings) {
  const p = (settings && settings.notify) || {};
  return {
    ...DEFAULT_PREFS, ...p,
    types: { ...DEFAULT_PREFS.types, ...(p.types || {}) },
    times: { ...DEFAULT_PREFS.times, ...(p.times || {}) }
  };
}
const toMin = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };
const inWindow = (from, to, min) => { const a = toMin(from), b = toMin(to); if (a == null || b == null || a === b) return false; return a > b ? (min >= a || min < b) : (min >= a && min < b); };
/* Ruhezeit: nachts (quietStart–quietEnd) und, wenn gewählt, in der Schule (Mo–Fr außer Ferien). dow: 0 = Sonntag */
export function inQuiet(prefs, min, dow?: number) {
  if (inWindow(prefs.quietStart, prefs.quietEnd, min)) return true;
  if (prefs.schoolQuiet && dow != null && dow >= 1 && dow <= 5 && !prefs.holidays && inWindow(prefs.schoolStart, prefs.schoolEnd, min)) return true;
  return false;
}
const WARNING_TYPES = new Set(['warnings']);
const LEVEL = ['🟢', '🟡', '🔴'];
const LEVEL_TXT = ['Intervalle möglich', 'heute nur locker', 'heute Ruhe'];
const SNACKS = ['jetzt noch Toast mit Banane', 'jetzt noch 2 Reiswaffeln mit Marmelade', 'jetzt noch eine Banane und etwas Wasser', 'jetzt noch ein Brot mit Honig'];

/* ---------- Datenbank ---------- */
async function subscriptions(env: Env, uid: number) {
  const rows = await env.DB.prepare('SELECT id, device_id, endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').bind(uid).all();
  return rows.results || [];
}
async function sentToday(env: Env, uid: number, day: string) {
  const rows = await env.DB.prepare('SELECT key, type, skipped FROM push_log WHERE user_id = ? AND day = ?').bind(uid, day).all();
  return rows.results || [];
}
async function logSent(env: Env, uid: number, day: string, key: string, type: string, delivered: number, mid?: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO push_log (user_id, key, day, type, sent_at, delivered, mid) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid, key, day, type, Date.now(), delivered, mid || null).run();
}
/* Auftrag 33: Eine geplante Mitteilung wird VOR dem Versand im Protokoll eingetragen. Nur wer den Eintrag anlegen konnte, verschickt sie –
   so geht jede Mitteilung genau einmal raus, auch wenn zwei Läufe gleichzeitig arbeiten (vorher: erst senden, dann eintragen). */
async function claim(env: Env, uid: number, day: string, key: string, type: string, mid: string, skipped: string | null = null): Promise<boolean> {
  const r: any = await env.DB.prepare('INSERT OR IGNORE INTO push_log (user_id, key, day, type, sent_at, delivered, mid, skipped) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)').bind(uid, key, day, type, Date.now(), mid, skipped).run();
  return !!(r && r.meta && r.meta.changes === 1);
}
export async function queueWarning(env: Env, uid: number, key: string, msg: any) {
  await env.DB.prepare('INSERT OR IGNORE INTO push_queue (user_id, key, type, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid, key, 'warnings', JSON.stringify(msg), Date.now()).run();
}

/* ---------- Verschicken an alle Geräte ---------- */
/* Austauschbar für Tests (kein echter Versand) */
type PushFn = (sub: any, msg: any) => Promise<{ ok?: boolean; gone?: boolean; status?: number; reason?: string }>;
let pushOverride: PushFn | null = null;
export function setPushOverride(fn: PushFn | null) { pushOverride = fn; }
export interface PushResult { deviceId: string; ok: boolean; status: number | null; reason: string; gone: boolean }
export interface DeliverMeta { mid?: string; day?: string; type?: string; urgency?: 'very-low' | 'low' | 'normal' | 'high'; ttl?: number }
const DAY_MS = 86400000;
/** so lange nicht gesehen und durch eine neuere Kennung mit demselben Gerätenamen ersetzt → bekommt nichts mehr */
export const REPLACED_DAYS = 7;
const tail = (endpoint: string) => String(endpoint || '').slice(-24);
const rid = () => { const b = crypto.getRandomValues(new Uint8Array(18)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const newMid = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + rid().slice(0, 6);
async function markGone(env: Env, uid: number, deviceId: string, status: number | null, reason: string | null, endpoint: string) {
  await env.DB.prepare('INSERT OR REPLACE INTO push_gone (user_id, device_id, at, status, reason, end_tail) VALUES (?, ?, ?, ?, ?, ?)').bind(uid, deviceId, Date.now(), status, reason, tail(endpoint)).run();
}
/* Auftrag 33: Alte Kennung desselben Geräts aussortieren. Beispiel Nutzer 1: Das iPhone bekam am 31.10. eine neue Kennung; die Anmeldung der
   alten Kennung (zuletzt gesehen 31.10.) bekam weiter jede Mitteilung, Apple nahm sie an (201) – angezeigt wurde dort nichts.
   Ersetzt heißt: seit REPLACED_DAYS Tagen nicht gesehen UND es gibt eine Kennung mit demselben Gerätenamen, die erst danach angelegt wurde.
   Echte Zweitgeräte (anderer Name, oder weiter benutzt) bleiben. Die alte Kennung erfährt beim nächsten Öffnen „ersetzt“ und meldet sich neu an. */
export async function dropReplaced(env: Env, uid: number): Promise<number> {
  const devs = ((await env.DB.prepare('SELECT id, name, created_at, last_seen FROM devices WHERE user_id = ?').bind(uid).all()).results || []) as any[];
  const subs = ((await env.DB.prepare('SELECT id, device_id, endpoint FROM push_subs WHERE user_id = ?').bind(uid).all()).results || []) as any[];
  let n = 0;
  for (const s of subs) {
    const dev = devs.find(d => d.id === s.device_id); if (!dev) continue;
    const seen = dev.last_seen || dev.created_at || 0;
    if (Date.now() - seen < REPLACED_DAYS * DAY_MS) continue;
    if (!devs.some(o => o.id !== dev.id && o.name === dev.name && (o.created_at || 0) > seen)) continue;
    await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
    await markGone(env, uid, dev.id, null, 'ersetzt', s.endpoint);
    n++;
  }
  return n;
}
/* Auftrag 31: an alle Geräte; je Gerät wird die Antwort des Push-Dienstes gespeichert (Status, Grund, letzte Zustellung, Fehler in Folge).
   Abgelaufene Anmeldungen (404/410, falscher Schlüssel) werden entfernt und gemerkt – das Gerät zeigt dann „nicht aktiv – erneut erlauben“
   und meldet sich beim nächsten Öffnen selbst neu an.
   Auftrag 33: je Mitteilung (mid) und Gerät ein Eintrag in push_deliveries (gesendet, angenommen) mit eigenem Empfangs-Schlüssel (rt);
   der Service Worker meldet damit nach dem Anzeigen „angekommen“ (POST /api/push/receipt). */
export async function deliverAll(env: Env, uid: number, msg: any, meta: DeliverMeta = {}): Promise<{ delivered: number; results: PushResult[]; mid: string }> {
  await dropReplaced(env, uid);
  const subs = await subscriptions(env, uid);
  const mid = meta.mid || msg.mid || newMid('m');
  const day = meta.day || new Date().toISOString().slice(0, 10), type = meta.type || 'other';
  const opts = { urgency: meta.urgency || (msg.urgent ? 'high' : 'normal'), ttl: meta.ttl };
  let ok = 0; const results: PushResult[] = [];
  for (const s of subs) {
    const token = rid();
    // vor dem Versand eintragen: die Bestätigung des Geräts kann schneller zurück sein als die Antwort von Apple
    await env.DB.prepare('INSERT OR REPLACE INTO push_deliveries (user_id, mid, device_id, day, type, sent_at, status, accepted, reason, token, received_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, NULL)').bind(uid, mid, s.device_id, day, type, Date.now(), token).run();
    const body = { ...msg, mid, rt: token };
    let r: any;
    try { r = pushOverride ? await pushOverride(s, body) : await sendPush(env, s, body, opts); }
    catch (e) { r = { ok: false, status: null, reason: 'Netzwerk: ' + String((e && e.message) || e).slice(0, 80) }; }
    const status = r.status == null ? (r.ok ? 201 : null) : r.status;
    const reason = String(r.reason || '').slice(0, 120);
    results.push({ deviceId: s.device_id, ok: !!r.ok, status, reason, gone: !!r.gone });
    await env.DB.prepare('UPDATE push_deliveries SET status = ?, accepted = ?, reason = ? WHERE user_id = ? AND mid = ? AND device_id = ?').bind(status, r.ok ? 1 : 0, reason || null, uid, mid, s.device_id).run();
    const now = Date.now();
    if (r.ok) { ok++; await env.DB.prepare('UPDATE push_subs SET last_status = ?, last_at = ?, last_ok_at = ?, fails = 0, last_error = NULL WHERE id = ?').bind(status, now, now, s.id).run(); }
    else if (r.gone) {
      await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
      await markGone(env, uid, s.device_id, status, reason || null, s.endpoint);
    } else {
      await env.DB.prepare('UPDATE push_subs SET last_status = ?, last_at = ?, fails = COALESCE(fails, 0) + 1, last_error = ? WHERE id = ?').bind(status, now, reason || ('HTTP ' + status), s.id).run();
      console.error('Push fehlgeschlagen:', status, reason);
    }
  }
  return { delivered: ok, results, mid };
}
export async function deliver(env: Env, uid: number, msg: any, meta?: DeliverMeta): Promise<number> { return (await deliverAll(env, uid, msg, meta)).delivered; }

/* Auftrag 33: Zeitgebundene Mitteilungen (Morgen, Erinnerungen, Abend, Warnungen) mit Urgency high, damit iOS sie nicht zurückhält
   (Stromsparen), und mit einer TTL bis zu dem Zeitpunkt, ab dem sie nicht mehr passt – eine Morgen-Ampel um 15 Uhr nützt niemandem.
   job.until: Ortszeit in Minuten, bis zu der die Mitteilung gilt. */
const HIGH = new Set(['morning', 'preSession', 'eveEarly', 'evening', 'adductors', 'food', 'warnings', 'test']);
export function deliveryOpts(job: any, min: number, isWarning: boolean): { urgency: 'high' | 'normal'; ttl: number } {
  const type = isWarning ? 'warnings' : job.type;
  let ttl = type === 'weekly' ? 12 * 3600 : type === 'achievements' ? 24 * 3600 : type === 'warnings' ? 6 * 3600 : 3 * 3600;
  if (job.until != null) ttl = (job.until - min) * 60;
  return { urgency: HIGH.has(type) ? 'high' : 'normal', ttl: Math.max(600, Math.min(86400, Math.round(ttl))) };
}

/* ---------- Inhalte ---------- */
function todaySessions(L, date) {
  const weeks = C.applyAdjustments(L.baseWeeks, L.state.adjustments);
  const day = C.planDays(weeks).find(d => d.date === date);
  return { weeks, list: day ? day.sessions.filter(s => s.sport !== 'rest' && !s.cancelled) : [] };
}
function openCount(L, date) {
  const { list } = todaySessions(L, date);
  return list.filter(s => { const st = L.state.sessions[s.id] || {}; return !st.completed && !st.skipped; }).length;
}
function sessLine(s, L) {
  const st = L.state.sessions[s.id] || {};
  const t = C.sessionTime(s, st);
  return `${t ? t + ' ' : ''}${s.title}${s.plannedMinutes ? ' (' + s.plannedMinutes + ' min)' : ''}`;
}

export function buildJobs(L, b, prefs, prevMin) {
  const jobs: any[] = [];
  const date = b.date, min = b.hour * 60 + b.minute;
  const due = hhmm => { const t = toMin(hhmm); return t != null && t > prevMin && t <= min; };
  const T = prefs.types, X = prefs.times;
  // Auftrag 33: bis wann eine Mitteilung noch passt (Ortszeit in Minuten) – abends bis zur Ruhezeit, morgens bis 12 Uhr
  const qs = toMin(prefs.quietStart); const bed = qs != null && qs > min ? qs : min + 120;
  const ill = C.illnessAt(L.state.illnessPeriods, date);
  const { weeks, list } = todaySessions(L, date);
  const R = C.readinessFor(L.state.trend, L.state.illnessPeriods, date, L.state.settings.readiness);
  const todayPoint = L.state.trend.find(p => p.date === date);

  // Morgens
  const weekend = b.dow === 0 || b.dow === 6 || prefs.holidays;
  if (T.morning && due(weekend ? X.morningWeekend : X.morningSchool)) {
    const sess = list.length ? list.map(s => sessLine(s, L)).join(', ') : 'Kein Training geplant.';
    if (!C.hasRecovery(todayPoint)) jobs.push({ type: 'morning', key: 'morning', title: 'Guten Morgen', body: 'Noch keine Morgenwerte, kurz eintragen? Heute: ' + sess, url: './?go=heute&open=checkin', until: 12 * 60 });
    else if (ill) jobs.push({ type: 'morning', key: 'morning', title: 'Gute Besserung', body: 'Heute kein Training. Schlafen, trinken, genug essen.', url: './?go=heute', until: 12 * 60 });
    else jobs.push({ type: 'morning', key: 'morning', title: `Deine Ampel heute: ${LEVEL[R.level] || '⚪'} ${LEVEL_TXT[R.level] || ''}`, body: 'Heute: ' + sess, url: './?go=heute', until: 12 * 60 });
  }
  // 1 h vor Nachmittagseinheiten
  if (T.preSession && !ill) list.forEach(s => {
    const st = L.state.sessions[s.id] || {};
    const t = C.sessionTime(s, st);
    if (!t || t < '12:00' || st.completed || st.skipped) return;
    const at = toMin(t) - (prefs.preSessionMinutes || 60);
    const hh = String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0');
    if (!due(hh)) return;
    const bpm = C.zoneBpm(s, L.profile.thresholds, L.plan && L.plan.zonePercents);
    jobs.push({ type: 'preSession', key: 'pre-' + s.id, title: `${t} ${s.title}`, body: [bpm ? 'Puls ' + bpm : (s.zone || null), SNACKS[new Date(date).getUTCDate() % SNACKS.length]].filter(Boolean).join(', '), url: './?go=heute', until: toMin(t) });
  });
  // Vorabend früher Einheiten
  if (T.eveEarly && due(X.eveEarly)) {
    const tomorrow = addDaysStr(date, 1);
    const day = C.planDays(weeks).find(d => d.date === tomorrow);
    // Wer morgens trainiert (Fragebogen), bekommt die Erinnerung am Vorabend für jede Einheit
    const morningPerson = !!(L.profile && L.profile.timeOfDay === 'morning');
    const early = day ? day.sessions.filter(s => s.sport !== 'rest' && !s.cancelled && !s.fixed && (morningPerson || C.isEarly(s, L.state.sessions[s.id]))) : [];
    if (early.length && !C.illnessAt(L.state.illnessPeriods, tomorrow)) {
      const s = early[0]; const t = C.sessionTime(s, L.state.sessions[s.id]);
      jobs.push({ type: 'eveEarly', key: 'eve-' + s.id, title: `Morgen ${t ? t + ' ' : 'früh '}${s.title}`, body: 'Sachen bereitlegen, um 22:30 ins Bett.', url: './?go=plan', until: bed });
    }
  }
  // Abends: nicht abgehakt oder ohne Gefühl
  if (T.evening && due(X.evening) && !ill) {
    const open = list.filter(s => { const st = L.state.sessions[s.id] || {}; return !st.skipped && (!st.completed || !st.quality); });
    if (open.length) jobs.push({ type: 'evening', key: 'evening', title: 'Wie war\'s?', body: `${open.map(s => s.title).join(', ')}: kurz abhaken und Gefühl eintragen.`, url: './?go=heute&open=export', until: bed });
  }
  // Routinen
  // Abend-Check nur für Teamsportler (Leiste und Adduktoren bei Fußball und Laufen), sonst nie.
  // Auftrag 33: und nur, solange eine passende Beschwerde aktiv ist (Leiste/Adduktoren als Berücksichtigung oder Schmerzangabe der letzten
  // 7 Tage, nach „wieder schmerzfrei“ nicht mehr). Vorher kam sie jedem Fußballer Mo/Mi/Fr, auch ganz ohne Beschwerden.
  const team = !!(L.profile && (L.profile.teamSport || (L.profile.sports || []).includes('football')));
  if (T.adductors && team && [1, 3, 5].includes(b.dow) && due(X.adductors) && !ill && C.groinComplaint({ ...(L.state || {}), profile: L.profile }, weeks, date)) jobs.push({ type: 'adductors', key: 'adductors', title: 'Adduktoren-Übungen', body: 'Kurz die Adduktoren-Übungen machen, 10 Minuten reichen.', url: './?go=heute', until: bed });
  if (T.food && due(X.food) && list.length && !ill) {
    const low = C.nutritionKcalLow(L.state, weeks, date, L.nutritionProfile);
    const eaten = ((L.state.nutrition || {})[date] || {}).kcal || 0;
    if (eaten < low * 0.5) jobs.push({ type: 'food', key: 'food', title: 'Genug gegessen?', body: `Bisher ${eaten ? eaten + ' kcal' : 'nichts'} eingetragen, Ziel ab ${low} kcal. Heute ist Trainingstag, iss gut zu Abend.`, url: './?go=essen', until: bed });
  }
  // Sonntag: Wochenrückblick und Vorschau
  if (T.weekly && b.dow === 0 && due(X.weekly)) jobs.push(weeklyJob(L, b));
  return jobs;
}

/* Wochenrückblick und Vorschau (Sonntag) */
export function weeklyJob(L, b) {
  const created = Object.values(L.state.adjustments || {}).filter(a => a && a.date === b.date);
  const S = C.weekSummary(L.state, L.baseWeeks, b.date);
  const own = C.ownLoadSeries(L.state, C.applyAdjustments(L.baseWeeks, L.state.adjustments), b.date);
  const ctlNow = own.length ? own[own.length - 1].ctl : null;
  const ctlBefore = own.length > 7 ? own[own.length - 8].ctl : null;
  const fit = ctlNow != null && ctlBefore != null ? ` Fitness ${ctlNow - ctlBefore >= 0 ? '+' : ''}${Math.round((ctlNow - ctlBefore) * 10) / 10}.` : '';
  const weeks = C.applyAdjustments(L.baseWeeks, L.state.adjustments);
  const next = C.planDays(weeks).filter(d => d.date > b.date && d.date <= addDaysStr(b.date, 7)).flatMap(d => d.sessions.filter(s => s.sport !== 'rest' && !s.cancelled));
  const hours = Math.round(next.reduce((a, s) => a + (s.plannedMinutes || 0), 0) / 6) / 10;
  const note = created.find(a => a.type === 'note');
  return { type: 'weekly', key: 'weekly', title: 'Deine Woche', body: `${S.nDone} von ${S.nPlanned} Einheiten erledigt.${fit} Nächste Woche: ${next.length} Einheiten, ${String(hours).replace('.', ',')} h.${note ? ' ' + note.what + '.' : ''}`, url: './?go=plan' };
}

/* Bestwerte nach dem Abruf prüfen */
export async function checkAchievements(env: Env, uid: number, L: any, date: string): Promise<any[]> {
  const weeks = C.applyAdjustments(L.baseWeeks, L.state.adjustments);
  const now = C.bests(C.perfEntries(L.state, weeks));
  const prev = await getMeta(env, uid, 'bests');
  await setMeta(env, uid, 'bests', now);
  if (!prev) return []; // erster Lauf: nur merken
  const out: any[] = [];
  const recent = d => d >= addDaysStr(date, -2);
  const fmtPace = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  if (now.swimPace && recent(now.swimPace.date) && (!prev.swimPace || now.swimPace.v < prev.swimPace.v - 0.5)) out.push({ key: 'best-swim-' + now.swimPace.id, title: 'Neuer Bestwert 🎉', body: `Schwimm-Pace ${fmtPace(now.swimPace.v)} pro 100 m. Stark!`, url: './?go=fortschritt' });
  if (now.spl && recent(now.spl.date) && (!prev.spl || now.spl.v < prev.spl.v)) out.push({ key: 'best-spl-' + now.spl.id, title: 'Neuer Bestwert 🎉', body: `Nur ${now.spl.v} Züge pro Bahn. Dein Zug wird länger!`, url: './?go=fortschritt' });
  if (now.runEff && recent(now.runEff.date) && (!prev.runEff || now.runEff.v > prev.runEff.v * 1.01)) out.push({ key: 'best-eff-' + now.runEff.id, title: 'Neuer Bestwert 🎉', body: `Lauf-Effizienz ${String(Math.round(now.runEff.v * 100) / 100).replace('.', ',')} m pro Herzschlag. Dein Herz arbeitet sparsamer.`, url: './?go=fortschritt' });
  return out;
}

/* ---------- Hauptlauf alle 5 Minuten ---------- */
export async function notifyTick(env: Env, uid: number, ctx?: any): Promise<any> {
  ctx = ctx || {};
  if (!env.VAPID_PRIVATE_JWK) return { skipped: 'kein VAPID-Schlüssel' };
  const b = ctx.berlin || berlinParts();
  const min = b.hour * 60 + b.minute;
  const tick = (await getMeta(env, uid, 'notify_tick')) || {};
  // Nur begrenzt zurückschauen (35 min, reicht auch bei 30-Minuten-Läufen), damit nach einer Pause keine alten Mitteilungen nachkommen
  const prevMin = Math.max(tick.date === b.date ? tick.min : -1, min - 35);
  await setMeta(env, uid, 'notify_tick', { date: b.date, min });
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(uid).first();
  if (!subs || !subs.n) return { skipped: 'keine Geräte angemeldet' };

  // Auftrag 31: Test-Mitteilungen (Betreiber: scripts/push-test.mjs bzw. Betreiber-Seite) sofort, ohne Ruhezeit und Tageslimit
  const tests = await env.DB.prepare("SELECT key, payload FROM push_queue WHERE user_id = ? AND type = 'test' ORDER BY created_at").bind(uid).all();
  const testSent: any[] = [];
  for (const row of (tests.results || []) as any[]) {
    await env.DB.prepare('DELETE FROM push_queue WHERE user_id = ? AND key = ?').bind(uid, row.key).run();
    let job: any = {}; try { job = JSON.parse(row.payload); } catch (_) { job = {}; }
    const r = await deliverAll(env, uid, { title: job.title || 'Test', body: job.body || 'Test-Mitteilung', url: job.url || './?go=heute', tag: row.key }, { mid: row.key, day: b.date, type: 'test', urgency: 'high', ttl: 600 });
    await logSent(env, uid, b.date, row.key, 'test', r.delivered, row.key);
    testSent.push({ key: row.key, ...r });
  }

  const L = ctx.state || await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const settingsRec = L.state.settings || {};
  const prefs = prefsOf(settingsRec);
  const quiet = inQuiet(prefs, min, b.dow);
  const sent = await sentToday(env, uid, b.date);
  const sentKeys = new Set(sent.map(r => r.key));
  let count = sent.filter(r => r.type !== 'test' && !r.skipped).length;   // Tests und nicht verschickte zählen nicht zum Tageslimit
  const warnSent = sent.some(r => WARNING_TYPES.has(r.type));
  const max = prefs.maxPerDay || 4;
  const out: any[] = [];

  const trySend = async (job, isWarning, scheduled = false) => {
    if (sentKeys.has(job.key)) return false;
    const typeOn = isWarning ? prefs.types.warnings : prefs.types[job.type] !== false;
    if (!typeOn) return false;
    const type = isWarning ? 'warnings' : job.type, mid = b.date + '|' + job.key;
    // Ein Platz bleibt für Warnungen frei, solange heute noch keine kam
    const limit = isWarning ? max : (warnSent ? max : max - 1);
    if (count >= limit) {
      // Auftrag 33: fällige geplante Mitteilung über dem Tageslimit im Protokoll als „geplant, nicht gesendet“ (Warteschlange wartet weiter)
      if (scheduled) await claim(env, uid, b.date, job.key + '~limit', type, mid, 'limit');
      return false;
    }
    // Auftrag 33: erst eintragen, dann senden – nur ein Lauf verschickt sie (genau einmal)
    if (!await claim(env, uid, b.date, job.key, type, mid)) { sentKeys.add(job.key); return false; }
    sentKeys.add(job.key); count++;
    const payload = { title: job.title, body: job.body, url: job.url || './', tag: job.key, badge: openCount(L, b.date), urgent: !!isWarning };
    const n = await deliver(env, uid, payload, { mid, day: b.date, type, ...deliveryOpts(job, min, !!isWarning) });
    await env.DB.prepare('UPDATE push_log SET delivered = ? WHERE user_id = ? AND day = ? AND key = ?').bind(n, uid, b.date, job.key).run();
    out.push(job.key);
    return true;
  };

  // 1) Warteschlange (Warnungen, Erfolge) – außerhalb der Ruhezeit
  if (!quiet) {
    const q = await env.DB.prepare('SELECT key, type, payload, created_at FROM push_queue WHERE user_id = ? ORDER BY created_at').bind(uid).all();
    for (const row of q.results || []) {
      if (Date.now() - row.created_at > 24 * 3600 * 1000) { await env.DB.prepare('DELETE FROM push_queue WHERE user_id = ? AND key = ?').bind(uid, row.key).run(); continue; }
      const job = Object.assign(JSON.parse(row.payload), { key: row.key, type: row.type });
      const isWarn = row.type === 'warnings';
      if (await trySend(job, isWarn) || sentKeys.has(row.key) || (!isWarn && prefs.types[row.type] === false)) await env.DB.prepare('DELETE FROM push_queue WHERE user_id = ? AND key = ?').bind(uid, row.key).run();
    }
  }
  // 2) Geplante Mitteilungen (in der Ruhezeit verfallen sie – Auftrag 33: dann als „geplant, Ruhezeit“ im Protokoll)
  for (const job of buildJobs(L, b, prefs, prevMin)) {
    if (!quiet) await trySend(job, false, true);
    else if (!sentKeys.has(job.key) && prefs.types[job.type] !== false) await claim(env, uid, b.date, job.key + '~quiet', job.type, b.date + '|' + job.key, 'quiet');
  }
  return { sent: out, count, quiet, ...(testSent.length ? { tests: testSent } : {}) };
}

/* Warnungen nach dem Abruf bzw. nach Plan-Anpassungen in die Warteschlange legen */
export async function queueAfterImport(env: Env, uid: number, L: any, date: string) {
  const R = C.readinessFor(L.state.trend, L.state.illnessPeriods, date, L.state.settings.readiness);
  const p = L.state.trend.find(x => x.date === date);
  if (C.illnessAt(L.state.illnessPeriods, date) || !C.hasRecovery(p)) return;
  if (p && p.bodyTemp != null && p.bodyTemp >= 0.5) await queueWarning(env, uid, 'warn-temp-' + date, { title: 'Temperatur erhöht', body: `Temperatur +${String(p.bodyTemp).replace('.', ',')} °C. Wirst du krank? Heute kein hartes Training.`, url: './?go=heute' });
  else if (R.level === 2) await queueWarning(env, uid, 'warn-red-' + date, { title: '🔴 Ampel rot', body: (R.reasons.join(', ') || 'Deine Werte sind deutlich schlechter als normal') + '. Heute Ruhe oder ganz locker.', url: './?go=heute' });
}
export async function queueAdjustments(env: Env, uid: number, list: any[], date: string) {
  const changes = (list || []).filter(a => a.type !== 'note');
  if (!changes.length) return;
  await queueWarning(env, uid, 'warn-adj-' + date + '-' + changes[0].id, { title: 'Plan angepasst', body: changes.map(a => a.what).join('; ') + (changes[0].reason ? ' – ' + changes[0].reason : ''), url: './?go=plan' });
}
export async function queueAchievements(env: Env, uid: number, list: any[]) {
  for (const a of list) await env.DB.prepare('INSERT OR IGNORE INTO push_queue (user_id, key, type, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid, a.key, 'achievements', JSON.stringify(a), Date.now()).run();
}
