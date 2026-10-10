/* Abruf von intervals.icu: Wellness → trend, Aktivitäten → erledigte Einheiten bzw. Extra-Einheiten.
   Regel: Manuell eingegebene Werte werden nie überschrieben, nur leere Felder werden gefüllt.
   Werte, die früher automatisch kamen, merkt sich der Datensatz in _icu. Nur die dürfen aktualisiert werden. */
import { berlinDate, addDaysStr, getRecord, getRecords, putRecords, getMeta, setMeta } from './store.js';

const SPORT_MAP = {
  run: ['Run', 'TrailRun', 'VirtualRun', 'Treadmill'],
  bike: ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Velomobile', 'Handcycle', 'TrackRide'],
  swim: ['Swim', 'OpenWaterSwim'],
  strength: ['WeightTraining', 'Workout', 'Crossfit', 'Pilates', 'Yoga', 'StairStepper', 'Elliptical'],
  football: ['Soccer', 'Football']
};
export function sportOf(type) {
  for (const [k, list] of Object.entries(SPORT_MAP)) if (list.includes(type)) return k;
  return null;
}
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const isNum = v => typeof v === 'number' && isFinite(v);
const empty = v => v == null || v === '';
function secToPace(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

/* Verrät nie den Schlüssel selbst, nur Länge und Format, damit Tippfehler beim Einfügen auffallen. */
export function accessHint(env, status) {
  const key = String(env.INTERVALS_API_KEY || ''), id = String(env.INTERVALS_ATHLETE_ID || '').trim();
  const idOk = /^i\d+$/.test(id);
  const keyInfo = `Schlüssel hat ${key.length} Zeichen${key.length < 15 ? ' (zu kurz, wahrscheinlich nicht richtig eingefügt)' : ''}${/\s/.test(key) ? ', enthält Leerzeichen' : ''}`;
  const idInfo = idOk ? 'Athleten-ID-Format ok' : `Athleten-ID-Format falsch (soll wie i123456 aussehen, hat ${id.length} Zeichen)`;
  const what = status === 401 ? 'lehnt den API-Schlüssel ab' : 'kennt die Athleten-ID nicht oder erlaubt keinen Zugriff';
  return `intervals.icu ${what} (Fehler ${status}). ${keyInfo}, ${idInfo}.`;
}

async function icuGet(env, path) {
  const base = env.INTERVALS_BASE || 'https://intervals.icu';
  const res = await fetch(base + path, {
    headers: { Authorization: 'Basic ' + btoa('API_KEY:' + String(env.INTERVALS_API_KEY).trim()), Accept: 'application/json' }
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error(accessHint(env, res.status));
  if (!res.ok) throw new Error('intervals.icu antwortet mit Fehler ' + res.status);
  return res.json();
}

/* ---------- Wellness → trend ---------- */
const STANDARD_WELLNESS = new Set(['id', 'ctl', 'atl', 'rampRate', 'ctlLoad', 'atlLoad', 'sportInfo', 'updated', 'weight', 'restingHR', 'hrv', 'hrvSDNN', 'menstrualPhase', 'menstrualPhasePredicted', 'kcalConsumed', 'sleepSecs', 'sleepScore', 'sleepQuality', 'avgSleepingHR', 'soreness', 'fatigue', 'stress', 'mood', 'motivation', 'injury', 'spO2', 'systolic', 'diastolic', 'hydration', 'hydrationVolume', 'readiness', 'baevskySI', 'bloodGlucose', 'lactate', 'bodyFat', 'abdomen', 'vo2max', 'comments', 'steps', 'floorsClimbed', 'respiration', 'carbohydrates', 'protein', 'fatTotal', 'locked', 'tempWeight', 'tempRestingHR']);
const ICU_SLEEP_QUALITY = { 1: 9, 2: 7, 3: 5, 4: 3 }; // intervals: 1 = super … 4 = schlecht → App: /10

export function mapWellness(w) {
  const o = {};
  if (isNum(w.ctl)) o.ctl = r1(w.ctl);
  if (isNum(w.atl)) o.atl = r1(w.atl);
  if (isNum(w.ctl) && isNum(w.atl)) o.tsb = r1(w.ctl - w.atl);
  if (isNum(w.restingHR) && w.restingHR > 0) o.restingHR = w.restingHR;
  if (isNum(w.hrv) && w.hrv > 0) o.hrv = Math.round(w.hrv);
  if (isNum(w.spO2) && w.spO2 > 0) o.spo2 = r1(w.spO2);
  if (isNum(w.respiration) && w.respiration > 0) o.breathingRate = r1(w.respiration);
  if (isNum(w.sleepSecs) && w.sleepSecs > 0) o.sleepHours = r1(w.sleepSecs / 3600);
  if (isNum(w.sleepScore) && w.sleepScore > 0) o.sleepQuality = Math.round(w.sleepScore / 10);
  else if (ICU_SLEEP_QUALITY[w.sleepQuality]) o.sleepQuality = ICU_SLEEP_QUALITY[w.sleepQuality];
  if (isNum(w.vo2max) && w.vo2max > 0) o.vo2max = r1(w.vo2max);
  // Zusatzfelder (z. B. von Oura), Namen sind je nach Konto verschieden
  const custom = [];
  for (const [k, v] of Object.entries(w)) {
    if (STANDARD_WELLNESS.has(k) || !isNum(v)) continue;
    custom.push(k);
    const lk = k.toLowerCase();
    if (/temp/.test(lk) && Math.abs(v) < 5 && o.bodyTemp == null) o.bodyTemp = r2(v);
    else if (/rem/.test(lk) && o.remSleep == null) o.remSleep = Math.round(v > 600 ? v / 60 : v);
    else if (/deep/.test(lk) && o.deepSleep == null) o.deepSleep = Math.round(v > 600 ? v / 60 : v);
    else if (/latency/.test(lk) && o.sleepLatency == null) o.sleepLatency = Math.round(v > 300 ? v / 60 : v);
  }
  return { fields: o, custom };
}

/* Füllt nur leere Felder oder Felder, die unverändert aus einem früheren Abruf stammen. */
export function mergeAuto(existing, incoming) {
  const out = Object.assign({}, existing || {});
  const icu = Object.assign({}, out._icu || {});
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    const cur = out[k];
    const fromIcu = Object.prototype.hasOwnProperty.call(icu, k) && icu[k] === cur;
    if (empty(cur) || fromIcu) {
      if (cur !== v) { out[k] = v; changed = true; }
      if (icu[k] !== v) { icu[k] = v; changed = true; }
    }
  }
  if (changed) out._icu = icu;
  return { record: out, changed };
}

/* ---------- Aktivitäten → Sessions ---------- */
export function activityMetrics(a, sport) {
  const m = {};
  const min = isNum(a.moving_time) && a.moving_time > 0 ? a.moving_time / 60 : (isNum(a.elapsed_time) ? a.elapsed_time / 60 : null);
  const dist = isNum(a.distance) && a.distance > 0 ? a.distance : (isNum(a.icu_distance) && a.icu_distance > 0 ? a.icu_distance : null);
  if (min) m.min = Math.round(min);
  if (isNum(a.average_heartrate) && a.average_heartrate > 0) m.hr = Math.round(a.average_heartrate);
  if (sport === 'swim') {
    if (dist) m.meters = Math.round(dist);
    if (dist && min) m.pace100 = secToPace(min * 60 / (dist / 100));
  } else if (dist && (sport === 'run' || sport === 'bike')) {
    m.km = r2(dist / 1000);
    if (sport === 'run' && min) m.pace = secToPace(min * 60 / (dist / 1000));
    if (sport === 'bike') m.speed = r1(isNum(a.average_speed) && a.average_speed > 0 ? a.average_speed * 3.6 : (dist / 1000) / (min / 60));
  }
  return m;
}
function planSessionsByDate(plan) {
  const map = {};
  ((plan && plan.weeks) || []).forEach(w => (w.days || []).forEach(d => (d.sessions || []).forEach(s => {
    (map[d.date] = map[d.date] || []).push(Object.assign({}, s, { date: d.date }));
  })));
  return map;
}
function fillEmpty(target, src) {
  let changed = false;
  for (const [k, v] of Object.entries(src)) if (empty(target[k]) && !empty(v)) { target[k] = v; changed = true; }
  return changed;
}

/* ---------- Hauptlauf ---------- */
export async function runImport(env, opts) {
  opts = opts || {};
  const status = { at: Date.now(), ok: false, wellnessDays: 0, matched: 0, extras: 0, custom: [] };
  try {
    if (!env.INTERVALS_API_KEY || !env.INTERVALS_ATHLETE_ID) throw new Error('Noch kein intervals.icu-Schlüssel hinterlegt.');
    const last = await getMeta(env, 'intervals_last');
    const today = berlinDate();
    const oldest = addDaysStr(today, last && last.ok ? -(opts.days || 7) : -42);
    const athlete = encodeURIComponent(String(env.INTERVALS_ATHLETE_ID).trim());
    const changes = [];
    const t = Date.now();

    // Wellness
    const wellness = await icuGet(env, `/api/v1/athlete/${athlete}/wellness?oldest=${oldest}&newest=${today}`);
    const existingTrend = await getRecords(env, 'trend', (wellness || []).map(w => w.id));
    const customSeen = new Set();
    for (const w of wellness || []) {
      if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(w.id)) continue;
      const { fields, custom } = mapWellness(w);
      custom.forEach(c => customSeen.add(c));
      if (!Object.keys(fields).length) continue;
      const base = existingTrend[w.id] || { date: w.id };
      const { record, changed } = mergeAuto(base, fields);
      record.date = w.id;
      if (changed) { changes.push({ kind: 'trend', key: w.id, data: record, updatedAt: t }); status.wellnessDays++; }
    }
    status.custom = [...customSeen];

    // Aktivitäten
    const linked = (await getMeta(env, 'icu_links')) || {};
    // Solange noch nie eine Aktivität übernommen wurde, 6 Wochen zurück schauen
    const actOldest = Object.keys(linked).length ? oldest : addDaysStr(today, -42);
    const acts = await icuGet(env, `/api/v1/athlete/${athlete}/activities?oldest=${actOldest}&newest=${today}`);
    const planRec = await getRecord(env, 'plan', 'main');
    const byDate = planSessionsByDate(planRec && planRec.data);
    const sessIds = Object.values(byDate).flat().map(s => s.id);
    const sessRecs = await getRecords(env, 'session', sessIds);
    const usedThisRun = new Set(Object.values(linked).filter(l => l.kind === 'session').map(l => l.key));
    const usedCustom = new Set(Object.values(linked).filter(l => l.kind === 'custom').map(l => l.key));
    let customsByKey = null, manual = null;
    const sorted = (acts || []).filter(a => a && a.id && a.start_date_local).sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
    // Übersicht ohne Werte: wie viele Aktivitäten, aus welcher Quelle, welche Sportarten
    const A = status.activities = { total: (acts || []).length, already: 0, ignored: {}, sources: {}, stubs: 0 };
    for (const a of acts || []) {
      const src = String((a && a.source) || 'unbekannt');
      A.sources[src] = (A.sources[src] || 0) + 1;
      if (a && !a.type && !a.moving_time) A.stubs++;
    }
    for (const a of sorted) {
      const id = String(a.id);
      if (linked[id]) { A.already++; continue; }
      const sport = sportOf(a.type);
      if (!sport) { const t = String(a.type || 'ohne Sportart'); A.ignored[t] = (A.ignored[t] || 0) + 1; continue; }
      const date = a.start_date_local.slice(0, 10);
      const metrics = activityMetrics(a, sport);
      const extra = { icuId: id };
      if (isNum(a.icu_training_load)) extra.icuLoad = Math.round(a.icu_training_load);
      // Passende geplante Einheit: gleicher Tag, gleicher Sport, nicht ausgefallen, noch nicht verknüpft
      const cand = (byDate[date] || []).find(s => s.sport === sport && !usedThisRun.has(s.id) && !((sessRecs[s.id] || {}).skipped));
      if (cand) {
        const st = Object.assign({ completed: false, notes: '' }, sessRecs[cand.id] || {});
        st.metrics = Object.assign({}, st.metrics || {});
        fillEmpty(st.metrics, metrics);
        st.completed = true;
        if (empty(st.rpe) && isNum(a.icu_rpe) && a.icu_rpe > 0) st.rpe = String(a.icu_rpe);
        Object.assign(st, extra);
        sessRecs[cand.id] = st; usedThisRun.add(cand.id);
        changes.push({ kind: 'session', key: cand.id, data: st, updatedAt: t });
        linked[id] = { kind: 'session', key: cand.id, date };
        status.matched++;
      } else if ((customsByKey = customsByKey || await getRecords(env, 'custom')) &&
                 (manual = Object.values(customsByKey).find(c => c && c.date === date && c.sport === sport && !c.icuId && !usedCustom.has(c.id)))) {
        // Selbst eingetragene Extra-Einheit desselben Tages und Sports: nur ergänzen, nicht doppelt anlegen
        const c = Object.assign({}, manual);
        c.metrics = Object.assign({}, c.metrics || {});
        fillEmpty(c.metrics, metrics);
        if (empty(c.plannedMinutes) && metrics.min) c.plannedMinutes = metrics.min;
        Object.assign(c, extra);
        usedCustom.add(c.id);
        changes.push({ kind: 'custom', key: c.id, data: c, updatedAt: t });
        linked[id] = { kind: 'custom', key: c.id, date };
        status.matched++;
      } else {
        const key = 'icu-' + id;
        const w = Object.assign({
          id: key, date, sport, title: a.name || 'Aktivität', description: '',
          plannedMinutes: metrics.min || null, plannedKm: metrics.km != null ? metrics.km : (metrics.meters ? r2(metrics.meters / 1000) : null),
          metrics, auto: true
        }, extra);
        changes.push({ kind: 'custom', key, data: w, updatedAt: t });
        linked[id] = { kind: 'custom', key, date };
        status.extras++;
      }
    }

    if (changes.length) await putRecords(env, changes);
    // Verknüpfungen nur so lange merken, wie sie abgerufen werden könnten
    const keepFrom = addDaysStr(today, -60);
    Object.keys(linked).forEach(k => { if (linked[k].date < keepFrom) delete linked[k]; });
    await setMeta(env, 'icu_links', linked);
    status.ok = true;
  } catch (e) {
    status.error = e.message;
  }
  await setMeta(env, 'intervals_last', status);
  return status;
}
