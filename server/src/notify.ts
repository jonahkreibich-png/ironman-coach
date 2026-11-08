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
  const rows = await env.DB.prepare('SELECT key, type FROM push_log WHERE user_id = ? AND day = ?').bind(uid, day).all();
  return rows.results || [];
}
async function logSent(env: Env, uid: number, day: string, key: string, type: string, delivered: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO push_log (user_id, key, day, type, sent_at, delivered) VALUES (?, ?, ?, ?, ?, ?)').bind(uid, key, day, type, Date.now(), delivered).run();
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
/* Auftrag 31: an alle Geräte; je Gerät wird die Antwort des Push-Dienstes gespeichert (Status, Grund, letzte Zustellung, Fehler in Folge).
   Abgelaufene Anmeldungen (404/410, falscher Schlüssel) werden entfernt und gemerkt – das Gerät zeigt dann „nicht aktiv – erneut erlauben“
   und meldet sich beim nächsten Öffnen selbst neu an. */
export async function deliverAll(env: Env, uid: number, msg: any): Promise<{ delivered: number; results: PushResult[] }> {
  const subs = await subscriptions(env, uid);
  let ok = 0; const results: PushResult[] = [];
  for (const s of subs) {
    let r: any;
    try { r = pushOverride ? await pushOverride(s, msg) : await sendPush(env, s, msg, { urgency: msg.urgent ? 'high' : 'normal' }); }
    catch (e) { r = { ok: false, status: null, reason: 'Netzwerk: ' + String((e && e.message) || e).slice(0, 80) }; }
    const status = r.status == null ? (r.ok ? 201 : null) : r.status;
    const reason = String(r.reason || '').slice(0, 120);
    results.push({ deviceId: s.device_id, ok: !!r.ok, status, reason, gone: !!r.gone });
    const now = Date.now();
    if (r.ok) { ok++; await env.DB.prepare('UPDATE push_subs SET last_status = ?, last_at = ?, last_ok_at = ?, fails = 0, last_error = NULL WHERE id = ?').bind(status, now, now, s.id).run(); }
    else if (r.gone) {
      await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
      await env.DB.prepare('INSERT OR REPLACE INTO push_gone (user_id, device_id, at, status, reason) VALUES (?, ?, ?, ?, ?)').bind(uid, s.device_id, now, status, reason || null).run();
    } else {
      await env.DB.prepare('UPDATE push_subs SET last_status = ?, last_at = ?, fails = COALESCE(fails, 0) + 1, last_error = ? WHERE id = ?').bind(status, now, reason || ('HTTP ' + status), s.id).run();
      console.error('Push fehlgeschlagen:', status, reason);
    }
  }
  return { delivered: ok, results };
}
export async function deliver(env: Env, uid: number, msg: any): Promise<number> { return (await deliverAll(env, uid, msg)).delivered; }

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
  const ill = C.illnessAt(L.state.illnessPeriods, date);
  const { weeks, list } = todaySessions(L, date);
  const R = C.readinessFor(L.state.trend, L.state.illnessPeriods, date, L.state.settings.readiness);
  const todayPoint = L.state.trend.find(p => p.date === date);

  // Morgens
  const weekend = b.dow === 0 || b.dow === 6 || prefs.holidays;
  if (T.morning && due(weekend ? X.morningWeekend : X.morningSchool)) {
    const sess = list.length ? list.map(s => sessLine(s, L)).join(', ') : 'Kein Training geplant.';
    if (!C.hasRecovery(todayPoint)) jobs.push({ type: 'morning', key: 'morning', title: 'Guten Morgen', body: 'Noch keine Morgenwerte, kurz eintragen? Heute: ' + sess, url: './?go=heute&open=checkin' });
    else if (ill) jobs.push({ type: 'morning', key: 'morning', title: 'Gute Besserung', body: 'Heute kein Training. Schlafen, trinken, genug essen.', url: './?go=heute' });
    else jobs.push({ type: 'morning', key: 'morning', title: `Deine Ampel heute: ${LEVEL[R.level] || '⚪'} ${LEVEL_TXT[R.level] || ''}`, body: 'Heute: ' + sess, url: './?go=heute' });
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
    jobs.push({ type: 'preSession', key: 'pre-' + s.id, title: `${t} ${s.title}`, body: [bpm ? 'Puls ' + bpm : (s.zone || null), SNACKS[new Date(date).getUTCDate() % SNACKS.length]].filter(Boolean).join(', '), url: './?go=heute' });
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
      jobs.push({ type: 'eveEarly', key: 'eve-' + s.id, title: `Morgen ${t ? t + ' ' : 'früh '}${s.title}`, body: 'Sachen bereitlegen, um 22:30 ins Bett.', url: './?go=plan' });
    }
  }
  // Abends: nicht abgehakt oder ohne Gefühl
  if (T.evening && due(X.evening) && !ill) {
    const open = list.filter(s => { const st = L.state.sessions[s.id] || {}; return !st.skipped && (!st.completed || !st.quality); });
    if (open.length) jobs.push({ type: 'evening', key: 'evening', title: 'Wie war\'s?', body: `${open.map(s => s.title).join(', ')}: kurz abhaken und Gefühl eintragen.`, url: './?go=heute&open=export' });
  }
  // Routinen
  // Abend-Check nur für Teamsportler (Leiste und Adduktoren bei Fußball und Laufen), sonst nie
  const team = !!(L.profile && (L.profile.teamSport || (L.profile.sports || []).includes('football')));
  if (T.adductors && team && [1, 3, 5].includes(b.dow) && due(X.adductors) && !ill) jobs.push({ type: 'adductors', key: 'adductors', title: 'Adduktoren-Übungen', body: 'Kurz die Adduktoren-Übungen machen, 10 Minuten reichen.', url: './?go=heute' });
  if (T.food && due(X.food) && list.length && !ill) {
    const low = C.nutritionKcalLow(L.state, weeks, date, L.nutritionProfile);
    const eaten = ((L.state.nutrition || {})[date] || {}).kcal || 0;
    if (eaten < low * 0.5) jobs.push({ type: 'food', key: 'food', title: 'Genug gegessen?', body: `Bisher ${eaten ? eaten + ' kcal' : 'nichts'} eingetragen, Ziel ab ${low} kcal. Heute ist Trainingstag, iss gut zu Abend.`, url: './?go=essen' });
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
    const r = await deliverAll(env, uid, { title: job.title || 'Test', body: job.body || 'Test-Mitteilung', url: job.url || './?go=heute', tag: row.key });
    await logSent(env, uid, b.date, row.key, 'test', r.delivered);
    testSent.push({ key: row.key, ...r });
  }

  const L = ctx.state || await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const settingsRec = L.state.settings || {};
  const prefs = prefsOf(settingsRec);
  const quiet = inQuiet(prefs, min, b.dow);
  const sent = await sentToday(env, uid, b.date);
  const sentKeys = new Set(sent.map(r => r.key));
  let count = sent.filter(r => r.type !== 'test').length;   // Tests zählen nicht zum Tageslimit
  const warnSent = sent.some(r => WARNING_TYPES.has(r.type));
  const max = prefs.maxPerDay || 4;
  const out: any[] = [];

  const trySend = async (job, isWarning) => {
    if (sentKeys.has(job.key)) return false;
    const typeOn = isWarning ? prefs.types.warnings : prefs.types[job.type] !== false;
    if (!typeOn) return false;
    // Ein Platz bleibt für Warnungen frei, solange heute noch keine kam
    const limit = isWarning ? max : (warnSent ? max : max - 1);
    if (count >= limit) return false;
    const payload = { title: job.title, body: job.body, url: job.url || './', tag: job.key, badge: openCount(L, b.date), urgent: !!isWarning };
    const n = await deliver(env, uid, payload);
    await logSent(env, uid, b.date, job.key, isWarning ? 'warnings' : job.type, n);
    sentKeys.add(job.key); count++; out.push(job.key);
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
  // 2) Geplante Mitteilungen (in der Ruhezeit verfallen sie)
  if (!quiet) for (const job of buildJobs(L, b, prefs, prevMin)) await trySend(job, false);
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
