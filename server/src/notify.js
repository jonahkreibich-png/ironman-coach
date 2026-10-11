/* Phase 5: Push-Mitteilungen. Zeiten in Europe/Berlin, Ruhezeit 22:30-6:00, höchstens 4 pro Tag.
   Läuft alle 5 Minuten. Geplante Mitteilungen werden fällig, wenn ihre Uhrzeit seit dem letzten Lauf erreicht wurde. */
import * as C from '../../shared/core';
import { berlinParts, addDaysStr, getMeta, setMeta } from './store.js';
import { loadState } from './coach.js';
import { sendPush } from './webpush.js';


export const DEFAULT_PREFS = {
  types: { morning: true, preSession: true, eveEarly: true, evening: true, warnings: true, adductors: true, food: true, weekly: true, achievements: true },
  times: { morningSchool: '06:45', morningWeekend: '09:00', eveEarly: '21:00', evening: '20:30', adductors: '19:00', food: '18:00', weekly: '18:00' },
  quietStart: '22:30', quietEnd: '06:00', preSessionMinutes: 60, holidays: false, maxPerDay: 4
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
export function inQuiet(prefs, min) {
  const a = toMin(prefs.quietStart), b = toMin(prefs.quietEnd);
  if (a == null || b == null) return false;
  return a > b ? (min >= a || min < b) : (min >= a && min < b);
}
const WARNING_TYPES = new Set(['warnings']);
const LEVEL = ['🟢', '🟡', '🔴'];
const LEVEL_TXT = ['Intervalle möglich', 'heute nur locker', 'heute Ruhe'];
const SNACKS = ['jetzt noch Toast mit Banane', 'jetzt noch 2 Reiswaffeln mit Marmelade', 'jetzt noch eine Banane und etwas Wasser', 'jetzt noch ein Brot mit Honig'];

/* ---------- Datenbank ---------- */
async function subscriptions(env) {
  const rows = await env.DB.prepare('SELECT id, device_id, endpoint, p256dh, auth FROM push_subs').all();
  return rows.results || [];
}
async function sentToday(env, day) {
  const rows = await env.DB.prepare('SELECT key, type FROM push_log WHERE day = ?').bind(day).all();
  return rows.results || [];
}
async function logSent(env, day, key, type) {
  await env.DB.prepare('INSERT OR IGNORE INTO push_log (key, day, type, sent_at) VALUES (?, ?, ?, ?)').bind(key, day, type, Date.now()).run();
}
export async function queueWarning(env, key, msg) {
  await env.DB.prepare('INSERT OR IGNORE INTO push_queue (key, type, payload, created_at) VALUES (?, ?, ?, ?)').bind(key, 'warnings', JSON.stringify(msg), Date.now()).run();
}

/* ---------- Verschicken an alle Geräte ---------- */
export async function deliver(env, msg) {
  const subs = await subscriptions(env);
  let ok = 0;
  for (const s of subs) {
    try {
      const r = await sendPush(env, s, msg, { urgency: msg.urgent ? 'high' : 'normal' });
      if (r.ok) ok++;
      else if (r.gone) await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
    } catch (e) { console.error('Push fehlgeschlagen:', e && e.message); }
  }
  return ok;
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
  const jobs = [];
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
    const bpm = C.zoneBpm(s, L.state.settings, L.plan && L.plan.zonePercents);
    jobs.push({ type: 'preSession', key: 'pre-' + s.id, title: `${t} ${s.title}`, body: [bpm ? 'Puls ' + bpm : (s.zone || null), SNACKS[new Date(date).getUTCDate() % SNACKS.length]].filter(Boolean).join(', '), url: './?go=heute' });
  });
  // Vorabend früher Einheiten
  if (T.eveEarly && due(X.eveEarly)) {
    const tomorrow = addDaysStr(date, 1);
    const day = C.planDays(weeks).find(d => d.date === tomorrow);
    const early = day ? day.sessions.filter(s => s.sport !== 'rest' && !s.cancelled && C.isEarly(s, L.state.sessions[s.id])) : [];
    if (early.length && !C.illnessAt(L.state.illnessPeriods, tomorrow)) {
      const s = early[0]; const t = C.sessionTime(s, L.state.sessions[s.id]);
      jobs.push({ type: 'eveEarly', key: 'eve-' + s.id, title: `Morgen ${t ? t + ' ' : 'früh '}${s.title}`, body: 'Sachen bereitlegen, um 22:30 ins Bett.', url: './?go=plan' });
    }
  }
  // Abends: nicht abgehakt oder ohne Gefühl
  if (T.evening && due(X.evening) && !ill) {
    const open = list.filter(s => { const st = L.state.sessions[s.id] || {}; return !st.skipped && (!st.completed || !st.quality); });
    if (open.length) jobs.push({ type: 'evening', key: 'evening', title: 'Wie war\'s?', body: `${open.map(s => s.title).join(', ')}: kurz abhaken und Gefühl eintragen. Ein Tipp schickt den Bericht an deinen Coach.`, url: './?go=heute&open=export' });
  }
  // Routinen
  if (T.adductors && [1, 3, 5].includes(b.dow) && due(X.adductors) && !ill) jobs.push({ type: 'adductors', key: 'adductors', title: 'Adduktoren-Übungen', body: 'Kurz die Adduktoren-Übungen machen, 10 Minuten reichen.', url: './?go=heute' });
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
export async function checkAchievements(env, L, date) {
  const weeks = C.applyAdjustments(L.baseWeeks, L.state.adjustments);
  const now = C.bests(C.perfEntries(L.state, weeks));
  const prev = await getMeta(env, 'bests');
  await setMeta(env, 'bests', now);
  if (!prev) return []; // erster Lauf: nur merken
  const out = [];
  const recent = d => d >= addDaysStr(date, -2);
  const fmtPace = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  if (now.swimPace && recent(now.swimPace.date) && (!prev.swimPace || now.swimPace.v < prev.swimPace.v - 0.5)) out.push({ key: 'best-swim-' + now.swimPace.id, title: 'Neuer Bestwert 🎉', body: `Schwimm-Pace ${fmtPace(now.swimPace.v)} pro 100 m. Stark!`, url: './?go=fortschritt' });
  if (now.spl && recent(now.spl.date) && (!prev.spl || now.spl.v < prev.spl.v)) out.push({ key: 'best-spl-' + now.spl.id, title: 'Neuer Bestwert 🎉', body: `Nur ${now.spl.v} Züge pro Bahn. Dein Zug wird länger!`, url: './?go=fortschritt' });
  if (now.runEff && recent(now.runEff.date) && (!prev.runEff || now.runEff.v > prev.runEff.v * 1.01)) out.push({ key: 'best-eff-' + now.runEff.id, title: 'Neuer Bestwert 🎉', body: `Lauf-Effizienz ${String(Math.round(now.runEff.v * 100) / 100).replace('.', ',')} m pro Herzschlag. Dein Herz arbeitet sparsamer.`, url: './?go=fortschritt' });
  return out;
}

/* ---------- Hauptlauf alle 5 Minuten ---------- */
export async function notifyTick(env, ctx) {
  ctx = ctx || {};
  if (!env.VAPID_PRIVATE_JWK) return { skipped: 'kein VAPID-Schlüssel' };
  const b = ctx.berlin || berlinParts();
  const min = b.hour * 60 + b.minute;
  const tick = (await getMeta(env, 'notify_tick')) || {};
  // Nur begrenzt zurückschauen (35 min, reicht auch bei 30-Minuten-Läufen), damit nach einer Pause keine alten Mitteilungen nachkommen
  const prevMin = Math.max(tick.date === b.date ? tick.min : -1, min - 35);
  await setMeta(env, 'notify_tick', { date: b.date, min });
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first();
  if (!subs || !subs.n) return { skipped: 'keine Geräte angemeldet' };

  const L = ctx.state || await loadState(env);
  if (!L.plan) return { skipped: 'kein Plan' };
  const settingsRec = L.state.settings || {};
  const prefs = prefsOf(settingsRec);
  const quiet = inQuiet(prefs, min);
  const sent = await sentToday(env, b.date);
  const sentKeys = new Set(sent.map(r => r.key));
  let count = sent.length;
  const warnSent = sent.some(r => WARNING_TYPES.has(r.type));
  const max = prefs.maxPerDay || 4;
  const out = [];

  const trySend = async (job, isWarning) => {
    if (sentKeys.has(job.key)) return false;
    const typeOn = isWarning ? prefs.types.warnings : prefs.types[job.type] !== false;
    if (!typeOn) return false;
    // Ein Platz bleibt für Warnungen frei, solange heute noch keine kam
    const limit = isWarning ? max : (warnSent ? max : max - 1);
    if (count >= limit) return false;
    const payload = { title: job.title, body: job.body, url: job.url || './', tag: job.key, badge: openCount(L, b.date), urgent: !!isWarning };
    await deliver(env, payload);
    await logSent(env, b.date, job.key, isWarning ? 'warnings' : job.type);
    sentKeys.add(job.key); count++; out.push(job.key);
    return true;
  };

  // 1) Warteschlange (Warnungen, Erfolge) – außerhalb der Ruhezeit
  if (!quiet) {
    const q = await env.DB.prepare('SELECT key, type, payload, created_at FROM push_queue ORDER BY created_at').all();
    for (const row of q.results || []) {
      if (Date.now() - row.created_at > 24 * 3600 * 1000) { await env.DB.prepare('DELETE FROM push_queue WHERE key = ?').bind(row.key).run(); continue; }
      const job = Object.assign(JSON.parse(row.payload), { key: row.key, type: row.type });
      const isWarn = row.type === 'warnings';
      if (await trySend(job, isWarn) || sentKeys.has(row.key) || (!isWarn && prefs.types[row.type] === false)) await env.DB.prepare('DELETE FROM push_queue WHERE key = ?').bind(row.key).run();
    }
  }
  // 2) Geplante Mitteilungen (in der Ruhezeit verfallen sie)
  if (!quiet) for (const job of buildJobs(L, b, prefs, prevMin)) await trySend(job, false);
  return { sent: out, count, quiet };
}

/* Warnungen nach dem Abruf bzw. nach Plan-Anpassungen in die Warteschlange legen */
export async function queueAfterImport(env, L, date) {
  const R = C.readinessFor(L.state.trend, L.state.illnessPeriods, date, L.state.settings.readiness);
  const p = L.state.trend.find(x => x.date === date);
  if (C.illnessAt(L.state.illnessPeriods, date) || !C.hasRecovery(p)) return;
  if (p && p.bodyTemp != null && p.bodyTemp >= 0.5) await queueWarning(env, 'warn-temp-' + date, { title: 'Temperatur erhöht', body: `Temperatur +${String(p.bodyTemp).replace('.', ',')} °C. Wirst du krank? Heute kein hartes Training.`, url: './?go=heute' });
  else if (R.level === 2) await queueWarning(env, 'warn-red-' + date, { title: '🔴 Ampel rot', body: (R.reasons.join(', ') || 'Deine Werte sind deutlich schlechter als normal') + '. Heute Ruhe oder ganz locker.', url: './?go=heute' });
}
export async function queueAdjustments(env, list, date) {
  const changes = (list || []).filter(a => a.type !== 'note');
  if (!changes.length) return;
  await queueWarning(env, 'warn-adj-' + date + '-' + changes[0].id, { title: 'Plan angepasst', body: changes.map(a => a.what).join('; ') + (changes[0].reason ? ' – ' + changes[0].reason : ''), url: './?go=plan' });
}
export async function queueAchievements(env, list) {
  for (const a of list) await env.DB.prepare('INSERT OR IGNORE INTO push_queue (key, type, payload, created_at) VALUES (?, ?, ?, ?)').bind(a.key, 'achievements', JSON.stringify(a), Date.now()).run();
}
