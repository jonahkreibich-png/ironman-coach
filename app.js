'use strict';
/* ================= Plan + constants ================= */
const BUILD = window.__BUILD || 'artifact';
const PLAN_KEY = 'ironman_plan';
const DEFAULT_ZONES = [
  { zone: 1, label: 'Recovery', low: 0, high: 81 }, { zone: 2, label: 'Aerobic (Grundlage)', low: 81, high: 89 },
  { zone: 3, label: 'Tempo', low: 90, high: 93 }, { zone: 4, label: 'Schwelle', low: 94, high: 102 }, { zone: 5, label: 'VO2max/Anaerob', low: 102, high: 999 }
];
function readPlan() {
  if (BUILD === 'pwa') { try { return JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); } catch (e) { return null; } }
  const tag = document.getElementById('plan-data');
  try { return tag ? JSON.parse(tag.textContent) : null; } catch (e) { return null; }
}
const PLAN_RAW = readPlan();
const HAS_PLAN = !!(PLAN_RAW && Array.isArray(PLAN_RAW.weeks) && PLAN_RAW.weeks.length);
const PLAN = HAS_PLAN ? PLAN_RAW : { meta: { event: 'Ironman', eventDate: '2029-09-15' }, weeks: [], keyDates: [] };
if (!PLAN.meta) PLAN.meta = { eventDate: '2029-09-15' };
if (!PLAN.meta.eventDate) PLAN.meta.eventDate = '2029-09-15';
if (!PLAN.meta.baseScores) PLAN.meta.baseScores = { swim: 20, bike: 20, run: 20, strength: 20 };
if (!Array.isArray(PLAN.zonePercents) || !PLAN.zonePercents.length) PLAN.zonePercents = DEFAULT_ZONES;
if (!Array.isArray(PLAN.keyDates)) PLAN.keyDates = [];
const LS_KEY = 'ironman_dashboard_v2';
const UI_KEY = 'ironman_ui';

const SPORTS = {
  swim:     { label: 'Schwimmen', color: 'var(--swim)' },
  bike:     { label: 'Radfahren', color: 'var(--bike)' },
  run:      { label: 'Laufen',    color: 'var(--run)' },
  strength: { label: 'Kraft',     color: 'var(--strength)' },
  football: { label: 'Fußball',   color: 'var(--football)' },
  rest:     { label: 'Ruhetag',   color: 'var(--rest)' }
};
const ICON_PATHS = {
  swim: '<circle cx="16.5" cy="6.5" r="2"/><path d="M3 18c1.6 0 1.6-1.3 3.2-1.3S7.8 18 9.4 18s1.6-1.3 3.2-1.3S14.2 18 15.8 18 17.4 16.7 19 16.7 20.6 18 21 18M5 13.5l4.5-3 3 2.5 3-2"/>',
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.6-6.5h5.2L18 16M9.6 9.5L12 16M13 6.5h2.5"/>',
  run: '<circle cx="14.5" cy="4.8" r="1.9"/><path d="M8.5 21l3-5.5-2.5-2.5 2.5-4.5 3.5 3 3 .5M11.5 8.5l-4 1-1.5 3M11.5 15.5l3.5 1.5 1 4"/>',
  strength: '<path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10"/>',
  football: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8l3 2.2-1.1 3.5h-3.8L9 10.2zM12 3.5V8M15 10.2l4.6-1.4M13.9 13.7l2.8 3.9M10.1 13.7l-2.8 3.9M9 10.2L4.4 8.8"/>',
  rest: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.rest}</svg>`;
}
const UI_ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  skip: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  walk: '<path d="M7 12h10"/>'
};
function uiIcon(n, w) { return `<svg viewBox="0 0 24 24" ${w ? `width="${w}" height="${w}"` : ''} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[n]}</svg>`; }

/* ================= Small helpers ================= */
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayStr() { return ymd(new Date()); }
function addDays(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
function dowShort(s) { return DOW[new Date(s + 'T12:00:00').getDay()]; }
function dowLong(s) { return DOW_LONG[new Date(s + 'T12:00:00').getDay()]; }
function fmtDate(s) { if (!s) return ''; const p = s.split('-'); return p[2] + '.' + p[1] + '.'; }
function de(v, dec) {
  if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '–';
  const n = Number(v);
  const str = dec != null ? n.toFixed(dec) : String(Math.round(n * 100) / 100);
  return str.replace('.', ',');
}
function parseNum(v) { if (v == null) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = parseFloat(s); return isNaN(n) ? null : n; }
function paceToSec(str) { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(str || '').trim()); if (!m) return null; return parseInt(m[1]) * 60 + parseInt(m[2]); }
function secToPace(sec) { if (sec == null) return '–'; sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
function round5(x) { return Math.round(x / 5) * 5; }
function round50(x) { return Math.round(x / 50) * 50; }

/* ================= State ================= */
function defaultState() {
  return {
    sessions: clone(PLAN.seedSessions || {}),
    trend: clone(PLAN.seedTrend || []),
    scoreAdjust: { swim: 0, bike: 0, run: 0, strength: 0 },
    customWorkouts: {}, openDays: {},
    milestones: clone(PLAN.seedMilestones || []),
    settings: {
      lthrRun: PLAN.meta.defaultLthrRun || 170, lthrBike: PLAN.meta.defaultLthrBike || 165,
      thresholdPaceRunSec: PLAN.meta.defaultThresholdPaceRunSec || 339, thresholdSpeedBikeKmh: PLAN.meta.defaultThresholdSpeedBikeKmh || 28,
      readiness: { rhrMax: 56, hrvMin: 65, tempMax: 0.5 }
    },
    weekNotes: {}, nutrition: {},
    nutritionProfile: { age: 17, heightCm: 184, weightKg: 73, pal: 1.4 },
    illnessPeriods: clone(PLAN.seedIllness || []),
    lastBackupAt: null
  };
}
function mergeIntoDefaults(partial) {
  const base = defaultState();
  const out = Object.assign(base, partial || {});
  if (!Array.isArray(out.trend) || !out.trend.length) out.trend = base.trend;
  if (!out.scoreAdjust) out.scoreAdjust = base.scoreAdjust;
  if (!out.sessions) out.sessions = {};
  if (!out.customWorkouts) out.customWorkouts = {};
  if (!out.openDays) out.openDays = {};
  if (!Array.isArray(out.milestones)) out.milestones = base.milestones;
  if (!out.settings) out.settings = base.settings;
  const bs = defaultState().settings;
  ['lthrRun', 'lthrBike', 'thresholdPaceRunSec', 'thresholdSpeedBikeKmh'].forEach(k => { if (out.settings[k] == null) out.settings[k] = bs[k]; });
  if (!out.settings.readiness) out.settings.readiness = bs.readiness;
  if (!out.weekNotes) out.weekNotes = {};
  if (!out.nutrition) out.nutrition = {};
  if (!out.nutritionProfile) out.nutritionProfile = base.nutritionProfile;
  if (!Array.isArray(out.illnessPeriods)) out.illnessPeriods = clone(PLAN.seedIllness || []);
  out.trend.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
function loadState() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return mergeIntoDefaults(JSON.parse(raw)); } catch (e) {}
  try { const old = localStorage.getItem('ironman_dashboard_v1'); if (old) return mergeIntoDefaults(JSON.parse(old)); } catch (e) {}
  return mergeIntoDefaults(null);
}
let saveWarned = false;
function saveState() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast('Dieser Browser speichert gerade nicht. Mach ein Backup unter Einstellungen.'); } }
  if (typeof window.syncNotify === 'function') window.syncNotify();
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 350); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveState(); });
window.addEventListener('pagehide', () => { if (saveTimer) saveState(); });

let STATE = loadState();
if (PLAN.meta.scoreCalibration && STATE.scoreCalibVersion !== PLAN.meta.scoreCalibration.version) {
  STATE.scoreAdjust = { swim: 0, bike: 0, run: 0, strength: 0 };
  STATE.scoreCalibVersion = PLAN.meta.scoreCalibration.version;
  saveState();
}
function loadUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) {} }
const UI = Object.assign({ view: 'heute', perfSport: 'swim', volMode: null }, loadUi());

/* ================= Plan index ================= */
const DAYS = [];
PLAN.weeks.forEach((w, wi) => w.days.forEach(d => DAYS.push({ ...d, weekIdx: wi })));
const DAY_BY_DATE = {};
DAYS.forEach(d => { DAY_BY_DATE[d.date] = d; });
const SESS = [];
const SESS_BY_ID = {};
DAYS.forEach(d => d.sessions.forEach(s => { const x = { ...s, date: d.date }; SESS.push(x); SESS_BY_ID[s.id] = x; }));
function findDay(date) { return DAY_BY_DATE[date] || null; }
function currentWeekIdx() {
  if (!PLAN.weeks.length) return 0;
  const t = todayStr(); const d = findDay(t);
  if (d) return d.weekIdx;
  return t < PLAN.weeks[0].startDate ? 0 : PLAN.weeks.length - 1;
}

/* ================= Trend ================= */
const TREND_KEYS = ['ctl', 'atl', 'tsb', 'vo2max', 'cardioRecovery', 'sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
const RECOVERY_KEYS = ['sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
function upsertTrendPoint(date, fields) {
  let p = STATE.trend.find(x => x.date === date);
  if (!p) { p = { date }; TREND_KEYS.forEach(k => { p[k] = null; }); STATE.trend.push(p); }
  Object.assign(p, fields);
  STATE.trend.sort((a, b) => a.date.localeCompare(b.date));
  return p;
}
function trendAt(date) { return STATE.trend.find(p => p.date === date) || null; }
function latestTrend() { const arr = STATE.trend.filter(p => p.ctl != null || p.atl != null || p.tsb != null); return arr.length ? arr[arr.length - 1] : null; }
function latestWithKey(key, maxDate) { const arr = STATE.trend.filter(p => p[key] != null && (!maxDate || p.date <= maxDate)); return arr.length ? arr[arr.length - 1] : null; }
function hasRecovery(p) { return !!p && RECOVERY_KEYS.some(k => p[k] != null); }
function rollingAvg(arr, key, idx, win) {
  const slice = arr.slice(Math.max(0, idx - win + 1), idx + 1).filter(p => p[key] != null);
  if (!slice.length) return null;
  return slice.reduce((a, p) => a + p[key], 0) / slice.length;
}
function baseline(key, beforeDate, days) {
  const from = addDays(beforeDate, -(days || 14));
  const vals = STATE.trend.filter(p => p.date < beforeDate && p.date >= from && p[key] != null && !illnessAt(p.date)).map(p => p[key]);
  if (vals.length < 3) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function arrow(key) {
  const arr = STATE.trend.filter(p => p[key] != null);
  if (arr.length < 2) return '';
  const cur = arr[arr.length - 1][key], prev = arr[arr.length - 2][key];
  if (cur > prev) return '<small class="up" aria-label="gestiegen">▲</small>';
  if (cur < prev) return '<small class="down" aria-label="gesunken">▼</small>';
  return '<small class="flat">▬</small>';
}

/* ================= Illness ================= */
function illnessAt(date) { return STATE.illnessPeriods.find(p => p.start && date >= p.start && (!p.end || date <= p.end)) || null; }
function activeIllness() { const t = todayStr(); return STATE.illnessPeriods.find(p => p.start && p.start <= t && (!p.end || p.end >= t)) || null; }
function returnPhase(date) {
  const ended = STATE.illnessPeriods.filter(p => p.end && p.end < date).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!ended) return null;
  const day = daysBetween(ended.end, date); // 1 = erster Tag ohne Symptome
  if (day > 8) return null;
  let stage;
  if (day <= 1) stage = 0; else if (day <= 3) stage = 1; else if (day <= 5) stage = 2; else stage = 3;
  return { period: ended, day, stage };
}
const RETURN_STAGES = [
  { n: 'Abwarten', d: 'Erster Tag ohne Symptome: noch kein Training, Spaziergang okay.' },
  { n: 'Stufe 1', d: '20-30 min ganz locker (Spaziergang oder Rad), Puls unter 130.' },
  { n: 'Stufe 2', d: 'Lockere Zone-2-Einheit, 30-40 min, Rad oder Lauf.' },
  { n: 'Stufe 3', d: 'Intervalle wieder möglich, wenn Ruhepuls und HFV passen.' }
];

/* ================= Sessions ================= */
function sessState(id) { return STATE.sessions[id] || {}; }
function ensureSess(id) { if (!STATE.sessions[id]) STATE.sessions[id] = { completed: false, notes: '' }; return STATE.sessions[id]; }
function effStatus(s) {
  if (s.sport === 'rest') return 'rest';
  const st = sessState(s.id);
  if (st.completed) return 'done';
  if (st.skipped) return 'skipped';
  if (illnessAt(s.date)) return 'sick';
  if (s.date < todayStr()) return 'missed';
  return 'open';
}
function forgottenSessions() { return SESS.filter(s => effStatus(s) === 'missed'); }
function dayStats(d) {
  const real = d.sessions.filter(s => s.sport !== 'rest');
  const st = real.map(s => effStatus({ ...s, date: d.date }));
  const done = st.filter(x => x === 'done').length;
  const skipped = st.filter(x => x === 'skipped').length;
  const sick = st.filter(x => x === 'sick').length;
  const missed = st.filter(x => x === 'missed').length;
  const custom = (STATE.customWorkouts[d.date] || []).length;
  return { total: real.length, done, skipped, sick, missed, custom, open: real.length - done - skipped - sick - missed };
}

/* ================= Zones ================= */
function computeZones(lthr) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, lowBpm: Math.round(lthr * z.low / 100), highBpm: z.high >= 999 ? null : Math.round(lthr * z.high / 100) }));
}
function computePaceZones(thresholdSec) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, fastSec: z.high >= 999 ? thresholdSec * 100 / 140 : thresholdSec * 100 / z.high, slowSec: z.low <= 0 ? null : thresholdSec * 100 / z.low }));
}
function computeSpeedZones(kmh) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, lowKmh: Math.round(kmh * z.low / 100 * 10) / 10, highKmh: z.high >= 999 ? null : Math.round(kmh * z.high / 100 * 10) / 10 }));
}
function zoneRangeText(sport, zoneStr) {
  if (!zoneStr || (sport !== 'run' && sport !== 'bike')) return zoneStr || '';
  const nums = [...zoneStr.matchAll(/\d/g)].map(m => parseInt(m[0]));
  if (!nums.length) return zoneStr;
  const S = STATE.settings;
  const zones = computeZones(sport === 'bike' ? S.lthrBike : S.lthrRun);
  const matched = nums.map(n => zones.find(z => z.zone === n)).filter(Boolean);
  if (!matched.length) return zoneStr;
  const low = Math.min(...matched.map(z => z.lowBpm));
  const high = Math.max(...matched.map(z => z.highBpm == null ? z.lowBpm + 30 : z.highBpm));
  let out = `${zoneStr} · ${low}-${high} bpm`;
  if (sport === 'run') {
    const pz = computePaceZones(S.thresholdPaceRunSec).filter(z => nums.includes(z.zone));
    if (pz.length) {
      const fast = Math.min(...pz.map(z => z.fastSec));
      const slows = pz.map(z => z.slowSec).filter(v => v != null);
      out += ` · ${secToPace(fast)}-${secToPace(slows.length ? Math.max(...slows) : fast + 40)}/km`;
    }
  } else {
    const sz = computeSpeedZones(S.thresholdSpeedBikeKmh).filter(z => nums.includes(z.zone));
    if (sz.length) out += ` · ${de(Math.min(...sz.map(z => z.lowKmh)))}-${de(Math.max(...sz.map(z => z.highKmh == null ? z.lowKmh + 8 : z.highKmh)))} km/h`;
  }
  return out;
}

/* ================= Readiness ================= */
function computeReadiness() {
  const t = todayStr();
  const R = STATE.settings.readiness;
  const ill = activeIllness();
  const ret = returnPhase(t);
  const today = trendAt(t);
  let p = hasRecovery(today) ? today : null;
  let stale = false;
  if (!p) { const prev = [...STATE.trend].reverse().find(x => x.date < t && x.date >= addDays(t, -2) && hasRecovery(x)); if (prev) { p = prev; stale = true; } }
  const crits = [];
  let level = 0;
  const reasons = [];
  const bump = (l, why) => { if (l > level) level = l; if (why) reasons.push(why); };

  if (p && p.restingHR != null) {
    const v = p.restingHR; const st = v <= R.rhrMax ? 'ok' : (v <= R.rhrMax + 2 ? 'warn' : 'bad');
    crits.push({ k: 'Ruhepuls', v: de(v), t: `Ziel ≤${R.rhrMax}`, st });
    if (st === 'warn') bump(1, 'Ruhepuls leicht erhöht'); if (st === 'bad') bump(2, 'Ruhepuls deutlich erhöht');
  }
  if (p && p.hrv != null) {
    const v = p.hrv; const st = v >= R.hrvMin ? 'ok' : (v >= R.hrvMin - 7 ? 'warn' : 'bad');
    crits.push({ k: 'HFV', v: de(v) + ' ms', t: `Ziel ≥${R.hrvMin}`, st });
    if (st === 'warn') bump(1, 'HFV etwas niedrig'); if (st === 'bad') bump(2, 'HFV deutlich niedrig');
  }
  if (p && p.bodyTemp != null) {
    const v = p.bodyTemp; const st = v < R.tempMax - 0.2 ? 'ok' : (v < R.tempMax ? 'warn' : 'bad');
    crits.push({ k: 'Temp.', v: (v > 0 ? '+' : '') + de(v) + ' °C', t: `Grenze +${de(R.tempMax)}`, st });
    if (st === 'warn') bump(1, 'Temperatur leicht erhöht'); if (st === 'bad') bump(2, 'Temperatur erhöht');
  }
  if (p && p.sleepQuality != null) {
    const v = p.sleepQuality; const st = v >= 7 ? 'ok' : (v >= 5 ? 'warn' : 'bad');
    crits.push({ k: 'Schlaf', v: de(v) + '/10', t: p.sleepHours != null ? de(p.sleepHours) + ' h' : '', st });
    if (st !== 'ok') bump(1, 'Schlaf nicht optimal');
  }
  const lt = latestTrend();
  if (lt && lt.tsb != null && !ill) {
    const v = lt.tsb; const st = v >= -10 ? 'ok' : (v >= -20 ? 'warn' : 'bad');
    crits.push({ k: 'TSB', v: de(v), t: 'Form', st });
    if (st === 'warn') bump(1, 'TSB im Minus'); if (st === 'bad') bump(2, 'TSB stark im Minus');
  }

  let title, sub, kind = level;
  if (ill) {
    kind = 2; title = 'Krank: Pause';
    sub = 'Kein Training, bis du 24-48 h symptomfrei bist. Schlafen, trinken, genug essen.';
  } else if (ret && ret.stage < 3) {
    kind = Math.max(1, level); title = ret.stage === 0 ? 'Noch Pause' : 'Wiedereinstieg';
    sub = RETURN_STAGES[ret.stage].d + ' Keine Intervalle.';
  } else if (!p && !lt) {
    kind = 3; title = 'Keine Werte'; sub = 'Trag deine Morgenwerte ein, dann bekommst du eine Empfehlung.';
  } else if (level === 0) {
    title = 'Intensität möglich'; sub = 'Training wie geplant. Intervalle sind okay.';
  } else if (level === 1) {
    title = 'Nur locker'; sub = 'Lockere Einheiten ja, Intervalle auf einen besseren Tag schieben.';
  } else {
    title = 'Ruhe'; sub = 'Heute Pause oder höchstens ein Spaziergang.';
  }
  return { level: kind, title, sub, crits, reasons, stale, point: p, ill, ret };
}

/* ================= Scores ================= */
const QUALITY_DELTA = { good: 3, ok: 0.3, bad: -2 };
function computeScore(sport) {
  const cal = PLAN.meta.scoreCalibration;
  const base = cal ? cal.scores[sport] : (PLAN.meta.baseScores[sport] || 20);
  const calDate = cal ? cal.date : '0000-00-00';
  let delta = 0;
  SESS.filter(s => s.sport === sport && s.date > calDate).forEach(s => {
    const status = effStatus(s); const st = sessState(s.id);
    if (status === 'done') delta += QUALITY_DELTA[st.quality || 'ok'];
    else if (status === 'missed') delta -= 1.2;
  });
  Object.entries(STATE.customWorkouts || {}).forEach(([date, list]) => {
    if (date <= calDate) return;
    list.forEach(w => { if (w.sport === sport) delta += QUALITY_DELTA[w.quality || 'ok']; });
  });
  delta += (STATE.scoreAdjust[sport] || 0);
  return Math.max(1, Math.min(100, Math.round(base + delta)));
}
function tierLabel(s) { if (s < 25) return 'Anfänger'; if (s < 45) return 'Aufbauend'; if (s < 65) return 'Solide'; if (s < 85) return 'Stark'; return 'Elite'; }

/* ================= Performance metrics ================= */
const METRIC_FIELDS = {
  run: [['km', 'km'], ['min', 'Minuten'], ['hr', 'Ø Puls'], ['pace', 'Pace /km', '6:24']],
  bike: [['km', 'km'], ['min', 'Minuten'], ['hr', 'Ø Puls'], ['speed', 'Ø km/h']],
  swim: [['meters', 'Meter'], ['min', 'Minuten'], ['pace100', 'Pace /100 m', '2:35'], ['spl', 'Züge/Bahn'], ['rate', 'Züge/min'], ['dps', 'm pro Zug']],
  strength: [['min', 'Minuten']],
  football: [['min', 'Minuten'], ['hr', 'Ø Puls']]
};
function normMetrics(m, date, sport, title) {
  const o = { date, sport, title };
  ['km', 'min', 'hr', 'speed', 'meters', 'spl', 'rate', 'dps'].forEach(k => { o[k] = parseNum(m[k]); });
  o.pace = paceToSec(m.pace); o.pace100 = paceToSec(m.pace100);
  if (o.pace == null && o.km && o.min) o.pace = o.min * 60 / o.km;
  if (o.speed == null && o.km && o.min) o.speed = o.km / (o.min / 60);
  if (sport === 'swim' && o.pace100 == null && o.meters && o.min) o.pace100 = o.min * 60 / (o.meters / 100);
  return o;
}
function hasMetrics(m) { return m && Object.values(m).some(v => v != null && v !== ''); }
function perfEntries(sport) {
  const map = {};
  (PLAN.seedMetrics || []).filter(m => m.sport === sport).forEach(m => { map[m.date] = { ...m, seed: true }; });
  SESS.forEach(s => {
    if (s.sport !== sport) return;
    const st = STATE.sessions[s.id];
    if (st && st.completed && hasMetrics(st.metrics)) map[s.date] = normMetrics(st.metrics, s.date, sport, s.title);
  });
  Object.entries(STATE.customWorkouts || {}).forEach(([d, list]) => list.forEach(w => {
    if (w.sport === sport && hasMetrics(w.metrics)) map[d] = normMetrics(w.metrics, d, sport, w.title);
  }));
  const out = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  out.forEach(e => {
    if (sport === 'run' && e.pace && e.hr) e.eff = (60000 / e.pace) / e.hr;
    if (sport === 'bike' && e.speed && e.hr) e.eff = (e.speed * 1000 / 60) / e.hr;
  });
  return out;
}
function metricsSummary(sport, m) {
  if (!hasMetrics(m)) return '';
  const n = normMetrics(m, '', sport, '');
  const parts = [];
  if (sport === 'swim') {
    if (n.meters) parts.push(`${n.meters}m`); if (n.min) parts.push(`${n.min}min`);
    if (m.pace100) parts.push(`${m.pace100}/100m`); if (n.spl) parts.push(`${n.spl} Züge/Bahn`);
    if (n.rate) parts.push(`${n.rate} Züge/min`); if (n.dps) parts.push(`${n.dps}m/Zug`);
  } else {
    if (n.km) parts.push(`${n.km}km`); if (n.min) parts.push(`${n.min}min`);
    if (sport === 'run' && n.pace) parts.push(`${secToPace(n.pace)}/km`);
    if (sport === 'bike' && n.speed) parts.push(`${Math.round(n.speed * 10) / 10}km/h`);
    if (n.hr) parts.push(`ØHF ${n.hr}`);
  }
  return parts.join(', ');
}

/* ================= Toast / confirm ================= */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
function armed(btn, label) {
  if (btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1'; const orig = btn.innerHTML;
  btn.textContent = label || 'Sicher? Nochmal tippen'; btn.classList.add('armed');
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.innerHTML = orig; btn.classList.remove('armed'); } }, 3200);
  return false;
}

/* ================= Charts ================= */
const CHARTS = {};
let chartSeq = 0;
function chartWidth() { const m = $('#app'); const w = m ? m.clientWidth - 32 - 30 : 320; return Math.max(260, Math.min(700, Math.round(w))); }
function niceStep(range, target) {
  const raw = range / Math.max(1, target); const mag = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
function fmtTick(v, step) { const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0; return de(v, dec); }
function lineChart(pts, series, o) {
  o = o || {};
  const vals = [];
  series.forEach(s => pts.forEach(p => { if (p[s.key] != null) vals.push(p[s.key]); }));
  if (pts.length < 2 || !vals.length) return `<div class="empty">${o.empty || 'Noch nicht genug Datenpunkte für einen Verlauf.'}</div>`;
  (o.lines || []).forEach(l => vals.push(l.v));
  const id = 'c' + (++chartSeq);
  const W = chartWidth(), H = o.h || 170, L = 36, R = o.endLabel === false ? 10 : 40, T = 12, B = 24;
  let lo = o.min != null ? o.min : Math.min(...vals), hi = o.max != null ? o.max : Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, 3);
  if (o.min == null) lo = Math.floor((lo - (hi - lo) * 0.06) / step) * step;
  if (o.max == null) hi = Math.ceil((hi + (hi - lo) * 0.06) / step) * step;
  const n = pts.length;
  const span = Math.max(1, daysBetween(pts[0].date, pts[n - 1].date));
  const di = pts.map(p => daysBetween(pts[0].date, p.date));
  const xd = d => L + (d / span) * (W - L - R);
  const x = i => xd(di[i]);
  const y = v => { const r = (v - lo) / (hi - lo); return o.invert ? T + r * (H - T - B) : H - B - r * (H - T - B); };
  const fmt = o.fmt || (v => fmtTick(v, step));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Verlauf')}">`;
  (o.shade || []).forEach(r => {
    const a = daysBetween(pts[0].date, r.from) - 0.5, b2 = daysBetween(pts[0].date, r.to) + 0.5;
    if (b2 < 0 || a > span) return;
    const x1 = xd(Math.max(0, a)), x2 = xd(Math.min(span, b2));
    s += `<rect x="${x1}" y="${T}" width="${Math.max(2, x2 - x1)}" height="${H - T - B}" style="fill:var(--bad);opacity:.09"/>`;
  });
  (o.bands || []).forEach(b => {
    const a = y(Math.min(Math.max(b.from, lo), hi)), c = y(Math.min(Math.max(b.to, lo), hi));
    s += `<rect x="${L}" y="${Math.min(a, c)}" width="${W - L - R}" height="${Math.abs(c - a)}" style="fill:${b.color};opacity:.10"/>`;
  });
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line);stroke-width:1"/>`;
    s += `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  (o.lines || []).forEach(l => {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(l.v)}" y2="${y(l.v)}" style="stroke:${l.color || 'var(--ink-2)'};stroke-width:1.5;stroke-dasharray:5 4"/>`;
    s += `<text x="${W - R - 2}" y="${y(l.v) - 5}" text-anchor="end" style="fill:${l.color || 'var(--ink-2)'}">${esc(l.label)}</text>`;
  });
  series.forEach((ser, si) => {
    const c = pts.map((p, i) => p[ser.key] != null ? [x(i), y(p[ser.key]), p[ser.key]] : null).filter(Boolean);
    if (!c.length) return;
    const poly = c.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
    if (ser.area && c.length > 1) {
      const base = o.invert ? T : H - B;
      s += `<polygon points="${c[0][0].toFixed(1)},${base} ${poly} ${c[c.length - 1][0].toFixed(1)},${base}" style="fill:${ser.color};opacity:.12"/>`;
    }
    if (c.length > 1) s += `<polyline points="${poly}" style="fill:none;stroke:${ser.color};stroke-width:${ser.dashed ? 1.6 : 2.4};stroke-linejoin:round;stroke-linecap:round${ser.dashed ? ';stroke-dasharray:5 4' : ''}"/>`;
    if (!ser.dashed) {
      if (n <= 45) c.slice(0, -1).forEach(q => { s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" style="fill:${ser.color}"/>`; });
      const e = c[c.length - 1];
      s += `<circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="4.6" style="fill:${ser.color};stroke:var(--surface);stroke-width:2"/>`;
      if (o.endLabel !== false && si < 3) s += `<text class="end-l" x="${(e[0] + 8).toFixed(1)}" y="${(e[1] + 4).toFixed(1)}" style="fill:${ser.color}">${esc((ser.fmt || fmt)(e[2]))}</text>`;
    }
  });
  const want = Math.min(span + 1, W < 400 ? 4 : 6);
  const ds = [...new Set(Array.from({ length: want }, (_, k) => Math.round(k * span / Math.max(1, want - 1))))];
  ds.forEach(d => {
    const anchor = d === 0 ? 'start' : (d === span ? 'end' : 'middle');
    s += `<text x="${xd(d)}" y="${H - 6}" text-anchor="${anchor}">${fmtDate(addDays(pts[0].date, d))}</text>`;
  });
  s += `<line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" style="stroke:var(--ink-2);stroke-width:1;opacity:0"/>`;
  s += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" style="fill:transparent" data-chart-hit="${id}"/>`;
  s += '</svg>';
  CHARTS[id] = { pts, series, fmt, x, W, L, R, n, span, di };
  const legend = o.legend ? `<div class="legend">${series.map(se => `<span><i class="${se.dashed ? 'dash' : ''}" style="--c:${se.color}"></i>${esc(se.name)}</span>`).join('')}${(o.legendExtra || '')}</div>` : '';
  return `<div class="chart" data-chart="${id}">${legend}${s}<div class="readout" id="ro-${id}">Tippe auf den Verlauf für einzelne Werte.</div></div>`;
}
function chartTap(e) {
  const hit = e.target.closest('[data-chart-hit]'); if (!hit) return false;
  const id = hit.getAttribute('data-chart-hit'); const C = CHARTS[id]; if (!C) return true;
  const svg = hit.ownerSVGElement; const r = svg.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * C.W;
  const d = (px - C.L) / (C.W - C.L - C.R) * C.span;
  let i = 0; C.di.forEach((v, k) => { if (Math.abs(v - d) < Math.abs(C.di[i] - d)) i = k; });
  const p = C.pts[i];
  const cur = svg.querySelector('.cursor'); cur.setAttribute('x1', C.x(i)); cur.setAttribute('x2', C.x(i)); cur.style.opacity = '.6';
  const parts = C.series.filter(se => p[se.key] != null).map(se => `${esc(se.name)} <b>${esc((se.fmt || C.fmt)(p[se.key]))}</b>`);
  const ro = document.getElementById('ro-' + id);
  if (ro) ro.innerHTML = `<b>${dowShort(p.date)} ${fmtDate(p.date)}</b> · ${parts.join(' · ') || 'kein Wert'}${p.note ? ' · ' + esc(p.note) : ''}`;
  return true;
}
function illnessShades() { return STATE.illnessPeriods.filter(p => p.start).map(p => ({ from: p.start, to: p.end || todayStr() })); }

/* ================= Backup ================= */
function backupObject() {
  const o = clone(STATE);
  if (HAS_PLAN) o.plan = PLAN;
  o.backupVersion = 2; o.exportedAt = new Date().toISOString();
  return o;
}
function backupText() { return JSON.stringify(backupObject()); }
function parseBackupText(raw) {
  raw = String(raw || '').trim();
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('kein JSON');
  return JSON.parse(raw.slice(a, b + 1));
}
function isBackup(o) { return !!o && typeof o === 'object' && (Array.isArray(o.trend) || (o.sessions && typeof o.sessions === 'object')); }
function isPlan(o) { return !!o && typeof o === 'object' && Array.isArray(o.weeks); }
function markBackedUp() { STATE.lastBackupAt = new Date().toISOString(); saveState(); }
/* Liefert true, wenn die Seite neu geladen wird (Plan geändert). */
function applyBackup(data) {
  const plan = data.plan;
  delete data.plan; delete data.exportedAt; delete data.backupVersion;
  STATE = mergeIntoDefaults(data);
  STATE.lastBackupAt = STATE.lastBackupAt || new Date().toISOString();
  saveState();
  if (BUILD === 'pwa' && isPlan(plan)) {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch (e) { toast('Speichern nicht möglich. Ist der Speicher voll?'); return false; }
    location.reload(); return true;
  }
  return false;
}
function mergePlan(cur, upd) {
  if (upd.meta && upd.weeks && upd.replace !== false && upd.mode !== 'merge') return upd;
  const out = clone(cur && cur.weeks ? cur : { meta: {}, weeks: [] });
  if (upd.meta) out.meta = Object.assign(out.meta || {}, upd.meta);
  (upd.weeks || []).forEach(w => {
    const i = out.weeks.findIndex(x => x.weekNumber === w.weekNumber);
    if (i >= 0) out.weeks[i] = w; else out.weeks.push(w);
  });
  out.weeks.sort((a, b) => a.startDate.localeCompare(b.startDate));
  ['keyDates', 'zonePercents', 'seedMetrics'].forEach(k => { if (Array.isArray(upd[k])) out[k] = upd[k]; });
  return out;
}

/* ================= Shared components ================= */
function sportTag(sport, extra) {
  const sp = SPORTS[sport] || SPORTS.rest;
  return `<div class="wo-tag">${icon(sport)}<span>${sp.label}</span>${extra || ''}</div>`;
}
function qualitySeg(act, q) {
  const cur = q || 'ok';
  return `<div class="seg" role="group" aria-label="Wie war's?">${[['good', 'Gut'], ['ok', 'Okay'], ['bad', 'Schlecht']].map(([v, l]) =>
    `<button data-act="${act}" data-q="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
}
function metricsBlock(sport, m) {
  const fields = METRIC_FIELDS[sport]; if (!fields) return '';
  m = m || {};
  const sum = metricsSummary(sport, m);
  return `<details class="mx"><summary>${uiIcon('plus', 14)} ${sum ? 'Daten: ' + esc(sum) : 'Daten von der Uhr eintragen'}</summary>
    <div class="fgrid">${fields.map(([k, lbl, ph]) => `<div class="fld"><label>${lbl}</label><input class="inp" ${ph ? 'type="text" inputmode="decimal"' : 'type="number" step="any" inputmode="decimal"'} data-f="m.${k}" value="${esc(m[k] ?? '')}" placeholder="${ph || ''}"></div>`).join('')}</div></details>`;
}
function sessionCard(s) {
  const st = sessState(s.id);
  const status = effStatus(s);
  const sp = SPORTS[s.sport] || SPORTS.rest;
  const meta = [s.plannedMinutes ? s.plannedMinutes + ' min' : null, s.plannedKm ? de(s.plannedKm) + ' km' : null].filter(Boolean).join(' · ');
  const zone = s.zone ? `<span class="wo-zone">${esc(zoneRangeText(s.sport, s.zone))}</span>` : '';
  const pill = { skipped: '<span class="pill pill-skipped">Ausgefallen</span>', sick: '<span class="pill pill-sick">Krank · entfällt</span>', missed: '<span class="pill pill-missed">Nicht eingetragen</span>' }[status] || '';
  let extra = '';
  if (status === 'done') {
    extra = `<div class="wo-extra">
      <div class="wo-row">${qualitySeg('sess-quality', st.quality)}</div>
      <div class="wo-row"><span class="lbl">RPE</span><input class="inp sm" type="number" min="1" max="10" inputmode="numeric" data-f="rpe" value="${esc(st.rpe ?? '')}" placeholder="1-10">
      ${(s.sport === 'run' || s.sport === 'bike') ? `<span class="lbl">Temp °C</span><input class="inp sm" type="number" step="any" data-f="temp" value="${esc(st.temp ?? '')}">` : ''}</div>
      ${metricsBlock(s.sport, st.metrics)}
    </div>`;
  } else if (status === 'skipped') {
    extra = `<div class="fld"><label>Grund (optional)</label><input class="inp" type="text" data-f="skipReason" value="${esc(st.skipReason || '')}" placeholder="z. B. Krankheit, Termin, Ruhetag"></div>`;
  }
  const notes = (s.sport !== 'rest' && status !== 'skipped' && status !== 'sick') ? `<textarea class="inp" rows="2" data-f="notes" placeholder="Deine Daten und Notizen …">${esc(st.notes || '')}</textarea>` : '';
  const btns = s.sport === 'rest' ? '' : `<div class="wo-btns">
      <button class="rbtn skip ${st.skipped ? 'on' : ''}" data-act="sess-skip" aria-pressed="${!!st.skipped}" aria-label="${st.skipped ? 'Ausgefallen rückgängig machen' : 'Als ausgefallen markieren'}" title="Ausgefallen">${uiIcon('skip')}</button>
      <button class="rbtn check ${st.completed ? 'on' : ''}" data-act="sess-toggle" aria-pressed="${!!st.completed}" aria-label="${st.completed ? 'Nicht erledigt' : 'Erledigt'}" title="Erledigt">${uiIcon('check')}</button>
    </div>`;
  return `<article class="wo is-${status}" data-sid="${esc(s.id)}" style="--sc:${sp.color}">
    <div class="wo-top"><div class="wo-main">${sportTag(s.sport, zone + pill)}<h3 class="wo-title">${esc(s.title)}</h3>${meta ? `<div class="wo-meta">${meta}</div>` : ''}</div>${btns}</div>
    ${s.description && status !== 'sick' ? `<p class="wo-desc ${s.description.length > 95 ? 'clamp' : ''}">${esc(s.description)}</p>${s.description.length > 95 ? '<button class="link" data-act="expand" style="align-self:flex-start">Mehr anzeigen</button>' : ''}` : ''}
    ${extra}${notes}
  </article>`;
}
function customCard(w, date) {
  const sp = SPORTS[w.sport] || SPORTS.rest;
  const meta = [w.plannedMinutes ? w.plannedMinutes + ' min' : null, w.plannedKm ? de(w.plannedKm) + ' km' : null].filter(Boolean).join(' · ');
  return `<article class="wo is-done" data-cid="${esc(w.id)}" data-cdate="${esc(date)}" style="--sc:${sp.color}">
    <div class="wo-top"><div class="wo-main">${sportTag(w.sport, '<span class="pill pill-extra">Nicht im Plan</span>')}<h3 class="wo-title">${esc(w.title)}</h3>${meta ? `<div class="wo-meta">${meta}</div>` : ''}</div>
      <button class="btn danger small" data-act="cust-remove">Entfernen</button></div>
    <div class="wo-row">${qualitySeg('cust-quality', w.quality)}</div>
    ${metricsBlock(w.sport, w.metrics)}
    <textarea class="inp" rows="2" data-f="description" placeholder="Was genau, Daten, Gefühl …">${esc(w.description || '')}</textarea>
  </article>`;
}
let ADD_OPEN = null;
let SHOW_ALL_MISSED = false;
function addBlock(date) {
  if (ADD_OPEN !== date) return `<button class="add-btn" data-act="add-open" data-date="${date}">+ Einheit hinzufügen, die nicht im Plan war</button>`;
  return `<div class="add-form">
    <div class="fgrid">
      <div class="fld"><label for="add-sport">Sport</label><select class="inp" id="add-sport">${['run', 'bike', 'swim', 'strength', 'football'].map(k => `<option value="${k}">${SPORTS[k].label}</option>`).join('')}</select></div>
      <div class="fld" style="grid-column: span 2"><label for="add-title">Titel</label><input class="inp" id="add-title" type="text" placeholder="z. B. Spaziergang"></div>
      <div class="fld"><label for="add-min">Minuten</label><input class="inp" id="add-min" type="number" step="any" inputmode="decimal"></div>
      <div class="fld"><label for="add-km">km</label><input class="inp" id="add-km" type="number" step="any" inputmode="decimal"></div>
    </div>
    <textarea class="inp" id="add-desc" rows="2" placeholder="Was genau, Daten, Gefühl …"></textarea>
    <div class="row"><button class="btn small" data-act="add-save" data-date="${date}">Speichern</button><button class="btn ghost small" data-act="add-cancel">Abbrechen</button></div>
  </div>`;
}
function dayBadge(d) {
  const x = dayStats(d);
  if (!x.total && !x.custom) return '';
  if (x.sick && x.done === 0 && x.sick + x.skipped === x.total) return '<span class="badge sick">Krank</span>';
  const complete = x.total > 0 && x.done + x.skipped + x.sick === x.total && x.done > 0;
  return `<span class="badge ${complete ? 'ok' : ''}">${x.done}/${x.total}${x.custom ? ' +' + x.custom : ''}</span>`;
}
function dayCard(d, opts) {
  opts = opts || {};
  const t = todayStr(); const isToday = d.date === t;
  const open = opts.open != null ? opts.open : (STATE.openDays[d.date] ?? isToday);
  const customs = STATE.customWorkouts[d.date] || [];
  return `<section class="day ${open ? 'open' : ''} ${isToday ? 'today' : ''}" data-date="${d.date}" id="day-${d.date}">
    ${opts.noHead ? '' : `<button class="day-h" data-act="day-toggle" aria-expanded="${open}">
      <span class="t"><span class="dw">${esc(d.dow)}</span><span class="dd">${fmtDate(d.date)}</span>${isToday ? '<span class="badge today">HEUTE</span>' : ''}</span>
      <span class="row" style="flex-wrap:nowrap">${dayBadge(d)}<span class="chev">${uiIcon('chev', 18)}</span></span></button>`}
    <div class="day-b" ${opts.noHead ? 'style="padding-top:12px"' : ''}>
      ${d.sessions.map(s => sessionCard({ ...s, date: d.date })).join('')}
      ${customs.map(w => customCard(w, d.date)).join('')}
      ${addBlock(d.date)}
    </div></section>`;
}
function weekStrip(week, jump) {
  const t = todayStr();
  return `<div class="strip">${week.days.map(d => {
    const x = dayStats(d);
    const real = d.sessions.filter(s => s.sport !== 'rest');
    const cls = [d.date === t ? 'today' : '',
      x.sick ? 'sick' : '',
      x.total && x.done && x.done + x.skipped + x.sick === x.total ? 'complete' : (x.done ? 'partial' : ''),
      x.missed ? 'missed' : '',
      x.total && x.skipped === x.total ? 'excused' : ''].filter(Boolean).join(' ');
    const dots = real.map(s => `<i style="--c:${(SPORTS[s.sport] || SPORTS.rest).color}"></i>`).join('') + (x.custom ? `<i style="--c:var(--accent)"></i>` : '');
    return `<button class="tile-day ${cls}" data-act="${jump ? 'strip-jump' : 'go-plan-day'}" data-date="${d.date}" aria-label="${dowLong(d.date)} ${fmtDate(d.date)}, ${x.done} von ${x.total} erledigt">
      <span class="dw">${dowShort(d.date)}</span><span class="dd">${fmtDate(d.date)}</span><span class="dots">${dots}</span></button>`;
  }).join('')}</div>`;
}
function weekProgress(week) {
  let done = 0, total = 0, sick = 0, skipped = 0;
  week.days.forEach(d => { const x = dayStats(d); done += x.done; total += x.total; sick += x.sick; skipped += x.skipped; });
  const pct = v => total ? (v / total * 100).toFixed(1) : 0;
  return { done, total, sick, skipped, html: `<div class="progress" role="img" aria-label="${done} von ${total} erledigt"><i style="width:${pct(done)}%;background:var(--good)"></i><i style="width:${pct(skipped)}%;background:var(--rest);opacity:.6"></i><i style="width:${pct(sick)}%;background:var(--bad);opacity:.45"></i></div>` };
}

/* ================= Check-in form ================= */
const CHECKIN_GROUPS = [
  { t: 'Nacht (Oura)', keys: [['sleepHours', 'Schlaf h'], ['sleepQuality', 'Qualität /10'], ['restingHR', 'Ruhepuls'], ['hrv', 'HFV ms'], ['bodyTemp', 'Temp.-Abw. °C', true], ['breathingRate', 'Atemfreq.'], ['remSleep', 'REM min'], ['deepSleep', 'Tiefschlaf min'], ['sleepLatency', 'Latenz min'], ['spo2', 'SpO2 %']] },
  { t: 'Status (Garmin)', keys: [['ctl', 'CTL'], ['atl', 'ATL'], ['tsb', 'TSB', true], ['vo2max', 'VO2max'], ['cardioRecovery', 'Cardio-Erh.']] }
];
function checkinFields(prefix, date) {
  const p = trendAt(date) || {};
  return CHECKIN_GROUPS.map(g => `<div><div class="fgroup-t">${g.t}</div><div class="fgrid">${g.keys.map(([k, l, signed]) =>
    `<div class="fld"><label for="${prefix}-${k}">${l}</label><input class="inp" id="${prefix}-${k}" type="number" step="any" ${signed ? '' : 'inputmode="decimal"'} value="${p[k] ?? ''}"></div>`).join('')}</div></div>`).join('') +
    `<div class="fld"><label for="${prefix}-illness">Symptome, Verletzung, Notiz</label><input class="inp" id="${prefix}-illness" type="text" value="${esc(p.illness || '')}" placeholder="z. B. Halskratzen, Muskelkater"></div>`;
}

/* ================= Header ================= */
function renderHeader() {
  const t = todayStr();
  const keys = (PLAN.keyDates || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const next = keys.find(k => k.date >= t);
  const im = daysBetween(t, PLAN.meta.eventDate);
  const nd = next ? daysBetween(t, next.date) : null;
  $('#clock').innerHTML = `<div class="eyebrow">Ironman Coach · noch ${im.toLocaleString('de-DE')} Tage</div>
    <div class="clock-big num">${next ? `<b>${nd === 0 ? 'Heute' : nd + (nd === 1 ? ' Tag' : ' Tage')}</b><span>${esc(next.label)}</span>` : `<b>${im}</b><span>Tage bis zum Ironman</span>`}</div>`;
}

/* ================= HEUTE ================= */
function renderHeute() {
  const t = todayStr();
  const R = computeReadiness();
  const day = findDay(t);
  const ill = R.ill, ret = R.ret;
  const todayPoint = trendAt(t);
  const haveToday = hasRecovery(todayPoint);
  const lightIcon = R.level === 0 ? uiIcon('bolt') : R.level === 1 ? uiIcon('walk') : uiIcon('pause');
  let h = `<h1 class="view-title">${dowLong(t)}<small>${fmtDate(t)} · ${day ? PLAN.weeks[day.weekIdx].label + ' · ' + esc(PLAN.weeks[day.weekIdx].focus) : 'außerhalb des aktuellen Blocks'}</small></h1>`;
  if (typeof window.syncStatusLine === 'function') h += window.syncStatusLine();

  h += `<div class="ready l${R.level}">
    <div class="ready-head"><div class="light">${lightIcon}</div><div><div class="ready-t">${esc(R.title)}</div><div class="ready-s">${esc(R.sub)}</div></div></div>
    ${R.crits.length ? `<div class="crits">${R.crits.map(c => `<span class="crit ${c.st}"><i></i>${c.k} <b>${c.v}</b>${c.t ? `<span class="t">${c.t}</span>` : ''}</span>`).join('')}</div>` : ''}
    <div class="ready-foot"><span class="hint">${R.stale ? `Werte vom ${fmtDate(R.point.date)}. Heute noch nichts eingetragen.` : (haveToday ? 'Morgenwerte von heute.' : '')}</span>
      ${ill ? '' : `<button class="btn ghost small" data-act="ill-start">Ich bin krank</button>`}</div>
  </div>`;

  if (ill) {
    const n = daysBetween(ill.start, t) + 1;
    const yest = addDays(t, -1);
    h += `<div class="sec"><div class="sec-h"><h2>Krankheit</h2><span class="aside">seit ${dowShort(ill.start)} ${fmtDate(ill.start)} · Tag ${n}</span></div>
      <div class="panel">
        <div class="hint">Geplante Einheiten in dieser Zeit zählen nicht als verpasst und kosten keine Score-Punkte. CTL und ATL fallen rechnerisch, weil du nicht trainierst. Das ist kein echter Fitnessverlust: ein paar Tage Pause holst du in ein bis zwei Wochen wieder auf.</div>
        ${todayPoint && todayPoint.illness ? `<div class="kv"><span class="muted">Heute notiert</span><span>${esc(todayPoint.illness)}</span></div>` : ''}
        <div class="banner info"><strong>Zum Arzt</strong> bei Fieber über 39 °C oder länger als 2-3 Tage, Atemnot, Brustschmerzen oder wenn du kaum trinken kannst.</div>
        <div class="hr"></div>
        <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="ill-end">Letzter Tag mit Symptomen</label><input class="inp" type="date" id="ill-end" value="${yest >= ill.start ? yest : t}" min="${ill.start}" max="${t}"></div></div>
        <button class="btn block" data-act="ill-end">Wieder gesund, Pause beenden</button>
      </div></div>`;
  } else if (ret) {
    h += `<div class="sec"><div class="sec-h"><h2>Wiedereinstieg</h2><span class="aside">Tag ${ret.day} ohne Symptome</span></div>
      <div class="panel"><div class="steps">${RETURN_STAGES.slice(1).map((s, i) => `<div class="step ${ret.stage === i + 1 ? 'now' : (ret.stage > i + 1 ? 'past' : '')}"><div class="n">${s.n}</div><div class="d">${s.d}</div></div>`).join('')}</div>
      <div class="hint">${ret.stage === 0 ? 'Heute noch abwarten. ' : ''}Der Plan unten gilt erst wieder voll ab Stufe 3. Bis dahin ersetzt die Stufe die geplanten Intervalle.</div>
      <button class="btn ghost small" data-act="ill-reopen">Doch noch krank</button></div></div>`;
  }

  h += backupReminder();
  h += `<div class="sec" id="checkin"><div class="panel"><details class="fold" ${haveToday ? '' : 'open'}>
      <summary><span><span class="sec-h"><h2>Morgenwerte</h2></span><span class="hint">${haveToday ? 'Für heute eingetragen. Tippen zum Ändern.' : 'Für heute noch nicht eingetragen.'}</span></span><span class="chev">${uiIcon('chev', 20)}</span></summary>
      <div class="fold-body">${checkinFields('h', t)}<button class="btn block" data-act="checkin-save" data-prefix="h">Werte speichern</button></div>
    </details></div></div>`;

  if (day) {
    const week = PLAN.weeks[day.weekIdx];
    h += `<div class="sec"><div class="sec-h"><h2>Training heute</h2><span class="aside">${dayBadge(day)}</span></div>${dayCard(day, { open: true, noHead: true })}</div>`;
    const wp = weekProgress(week);
    h += `<div class="sec"><div class="sec-h"><h2>${esc(week.label)}</h2><span class="aside num">${wp.done} von ${wp.total} erledigt${wp.sick ? ` · ${wp.sick} krank` : ''}</span></div>${wp.html}${weekStrip(week, false)}</div>`;
  } else {
    h += `<div class="sec"><div class="panel empty">Heute liegt außerhalb des aktuellen Plans. Der nächste Block kommt nach dem Schwellentest.</div></div>`;
  }

  const forgot = forgottenSessions();
  if (forgot.length) {
    const shown = SHOW_ALL_MISSED ? forgot : forgot.slice(-5);
    h += `<div class="sec"><div class="sec-h"><h2>Noch offen</h2><span class="aside">${forgot.length} ${forgot.length === 1 ? 'Einheit' : 'Einheiten'} ohne Haken</span></div>
      <div class="panel"><div class="hint">Abhaken, wenn du sie gemacht hast, sonst als ausgefallen markieren. Details trägst du im Plan nach.</div>
      ${[...shown].reverse().map(s => `<div class="miss" data-sid="${esc(s.id)}" style="--sc:${(SPORTS[s.sport] || SPORTS.rest).color}">
        <span class="miss-ic">${icon(s.sport)}</span><div class="miss-t"><div class="lbl">${dowShort(s.date)} ${fmtDate(s.date)}</div><div>${esc(s.title)}</div></div>
        <div class="wo-btns"><button class="rbtn skip" data-act="sess-skip" aria-label="Als ausgefallen markieren" title="Ausgefallen">${uiIcon('skip')}</button><button class="rbtn check" data-act="sess-toggle" aria-label="Erledigt" title="Erledigt">${uiIcon('check')}</button></div></div>`).join('')}
      <div class="row" style="justify-content:space-between">${forgot.length > 5 ? `<button class="link" data-act="missed-all">${SHOW_ALL_MISSED ? 'Weniger zeigen' : `Alle ${forgot.length} zeigen`}</button>` : '<span></span>'}<button class="btn ghost small" data-act="missed-skip-all">Alle als ausgefallen</button></div></div></div>`;
  }

  h += `<div class="sec"><div class="sec-h"><h2>Essen heute</h2></div>${nutritionMini()}</div>`;

  if (STATE.milestones.length) {
    const last = [...STATE.milestones].sort((a, b) => b.date.localeCompare(a.date))[0];
    h += `<div class="sec"><div class="sec-h"><h2>Letzter Meilenstein</h2></div><div class="panel"><div class="ms"><div class="when">${fmtDate(last.date)}</div><div class="txt">${esc(last.text)}</div></div></div></div>`;
  }
  h += `<div class="sec"><button class="btn block" data-act="export-open">Heute für den Chat exportieren</button></div>`;
  $('#app').innerHTML = h;
}

/* ================= PLAN ================= */
let PLAN_WEEK = null;
function renderPlan() {
  if (PLAN_WEEK == null) PLAN_WEEK = currentWeekIdx();
  const cw = currentWeekIdx();
  const week = PLAN.weeks[PLAN_WEEK];
  const wp = weekProgress(week);
  let h = `<h1 class="view-title">Trainingsplan<small>${esc(PLAN.meta.blockName || 'Block 1 · Grundlage')} · ${PLAN.weeks.length} Wochen</small></h1>
    <div class="chips" role="tablist">${PLAN.weeks.map((w, i) => `<button class="chip ${i === PLAN_WEEK ? 'on' : ''}" data-act="week" data-i="${i}" role="tab" aria-selected="${i === PLAN_WEEK}">${esc(w.label)}${i === cw ? '<span class="dot" aria-label="aktuelle Woche"></span>' : ''}</button>`).join('')}</div>
    <div class="sec" style="margin-top:16px">
      <div class="sec-h"><h2>${fmtDate(week.startDate)} – ${fmtDate(week.endDate)}</h2><span class="aside num">${wp.done}/${wp.total} erledigt</span></div>
      <div class="hint"><strong>${esc(week.focus)}</strong>${week.isRecoveryWeek ? ' · Erholungswoche' : ''}</div>
      ${wp.html}
      ${weekStrip(week, true)}
      <textarea class="inp" rows="2" data-f="weeknote" data-week="${week.weekNumber}" placeholder="Wochennotiz: wie hat sich die Woche angefühlt?">${esc(STATE.weekNotes[week.weekNumber] || '')}</textarea>
    </div>
    <div class="sec">${week.days.map(d => dayCard({ ...d, weekIdx: PLAN_WEEK })).join('')}</div>`;
  $('#app').innerHTML = h;
}

/* ================= WERTE ================= */
let WERTE_DATE = null;
function renderWerte() {
  const t = todayStr();
  if (!WERTE_DATE) WERTE_DATE = t;
  const lt = latestTrend() || {};
  const cardio = latestWithKey('cardioRecovery');
  const vo2 = latestWithKey('vo2max');
  const ill = activeIllness();
  const tsbCls = v => v == null ? '' : (v >= -10 ? 'good' : v >= -20 ? 'warn' : 'bad');
  let h = `<h1 class="view-title">Werte<small>Belastung, Form und Erholung${lt.date ? ' · Stand ' + fmtDate(lt.date) : ''}</small></h1>`;
  h += `<div class="tiles">
    <div class="tile"><div class="k">CTL</div><div class="v">${de(lt.ctl)} ${arrow('ctl')}</div><div class="s">Fitness</div></div>
    <div class="tile"><div class="k">ATL</div><div class="v">${de(lt.atl)} ${arrow('atl')}</div><div class="s">Ermüdung</div></div>
    <div class="tile ${tsbCls(lt.tsb)}"><div class="k">TSB</div><div class="v">${de(lt.tsb)} ${arrow('tsb')}</div><div class="s">Form</div></div>
    <div class="tile"><div class="k">VO2max</div><div class="v">${de(vo2 && vo2.vo2max)} ${arrow('vo2max')}</div><div class="s">Garmin</div></div>
    <div class="tile"><div class="k">Cardio-Erh.</div><div class="v">${de(cardio && cardio.cardioRecovery)} ${arrow('cardioRecovery')}</div><div class="s">bpm</div></div>
  </div>`;
  if (ill) h += `<div class="banner info" style="margin-top:10px">Du bist gerade krank. CTL und ATL sinken, weil keine Trainingslast dazukommt, und TSB steigt. Das zeigt keine echte Erholung und keinen echten Fitnessverlust.</div>`;

  const withBoth = STATE.trend.filter(p => p.ctl != null && p.atl != null && p.ctl > 0);
  let gauge = '<div class="empty">Noch keine CTL/ATL-Werte.</div>';
  if (withBoth.length) {
    const L = withBoth[withBoth.length - 1]; const ratio = L.atl / L.ctl;
    const [lab, col] = ratio < 0.8 ? ['Unterbelastet', 'var(--info)'] : ratio <= 1.3 ? ['Im grünen Bereich', 'var(--good)'] : ratio <= 1.5 ? ['Erhöht', 'var(--warn)'] : ['Hohes Risiko', 'var(--bad)'];
    gauge = `<div class="row" style="align-items:baseline"><span style="font:700 34px/1 var(--f-display);color:${col}" class="num">${de(ratio, 2)}</span><span style="color:${col};font-weight:600">${lab}</span></div>
      <div class="gauge-w"><div class="gauge"><i style="width:40%;background:var(--info);opacity:.55"></i><i style="width:25%;background:var(--good);opacity:.7"></i><i style="width:10%;background:var(--warn);opacity:.7"></i><i style="width:25%;background:var(--bad);opacity:.6"></i></div>
      <div class="gauge-m" style="left:${Math.min(100, ratio / 2 * 100)}%"></div></div>
      <div class="gauge-l">${[[0, '0'], [40, '0,8'], [65, '1,3'], [75, '1,5'], [100, '2+']].map(([l, t]) => `<span style="left:${l}%">${t}</span>`).join('')}</div>
      <div class="hint">ATL geteilt durch CTL. Unter 0,8 trainierst du unter deiner Kapazität, 0,8 bis 1,3 ist der gute Bereich, über 1,5 steigt das Verletzungsrisiko.${ill ? ' Während der Krankheit ist der Wert nicht aussagekräftig.' : ''}</div>`;
  }
  h += `<div class="sec"><div class="sec-h"><h2>Belastungsverhältnis</h2></div><div class="panel">${gauge}</div></div>`;

  const tp = STATE.trend.filter(p => p.ctl != null || p.atl != null || p.tsb != null);
  h += `<div class="sec"><div class="sec-h"><h2>Fitness, Ermüdung, Form</h2></div><div class="panel">${lineChart(tp, [
    { key: 'ctl', name: 'CTL', color: 'var(--info)', area: true }, { key: 'atl', name: 'ATL', color: 'var(--run)' }, { key: 'tsb', name: 'TSB', color: 'var(--good)' }
  ], { h: 200, legend: true, legendExtra: '<span><i class="box" style="--c:var(--bad)"></i>krank</span>', shade: illnessShades(), lines: [{ v: 0, label: '' }], label: 'CTL ATL TSB Verlauf' })}
    <div class="hint">CTL ist deine Fitness (Belastung der letzten 6 Wochen), ATL die Ermüdung der letzten Woche, TSB die Differenz. TSB unter -20 heißt: Erholung einplanen.</div></div></div>`;

  const R = STATE.settings.readiness;
  const hp = STATE.trend.filter(p => p.hrv != null).map((p, i, arr) => ({ date: p.date, hrv: p.hrv, avg: rollingAvg(arr, 'hrv', i, 7), note: p.illness || '' }));
  const rp = STATE.trend.filter(p => p.restingHR != null).map(p => ({ date: p.date, rhr: p.restingHR, note: p.illness || '' }));
  const tpts = STATE.trend.filter(p => p.bodyTemp != null).map(p => ({ date: p.date, temp: p.bodyTemp, note: p.illness || '' }));
  h += `<div class="sec"><div class="sec-h"><h2>Erholung</h2><span class="aside">Rot hinterlegt: krank</span></div>
    <div class="panel"><div class="lbl">HFV (ms) mit 7-Tage-Schnitt</div>${lineChart(hp, [{ key: 'hrv', name: 'HFV', color: 'var(--info)', area: true }, { key: 'avg', name: 'Ø 7 Tage', color: 'var(--ink-2)', dashed: true }], { legend: true, shade: illnessShades(), lines: [{ v: R.hrvMin, label: `Ziel ≥${R.hrvMin}`, color: 'var(--good)' }], label: 'HFV Verlauf' })}</div>
    <div class="panel"><div class="lbl">Ruhepuls (bpm)</div>${lineChart(rp, [{ key: 'rhr', name: 'Ruhepuls', color: 'var(--run)', area: true }], { shade: illnessShades(), lines: [{ v: R.rhrMax, label: `Ziel ≤${R.rhrMax}`, color: 'var(--good)' }], label: 'Ruhepuls Verlauf' })}</div>
    <div class="panel"><div class="lbl">Temperatur-Abweichung (°C)</div>${lineChart(tpts, [{ key: 'temp', name: 'Temp.', color: 'var(--warn)', fmt: v => (v > 0 ? '+' : '') + de(v, 1) }], { h: 140, shade: illnessShades(), lines: [{ v: R.tempMax, label: `Grenze +${de(R.tempMax)}`, color: 'var(--bad)' }], label: 'Temperatur Verlauf' })}</div>
  </div>`;

  const rows = STATE.trend.filter(p => hasRecovery(p) || p.illness).slice(-10).reverse();
  const all = STATE.trend;
  h += `<div class="sec"><div class="sec-h"><h2>Schlaf-Tabelle</h2><span class="aside">letzte ${rows.length} Nächte</span></div><div class="panel">${rows.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Datum</th><th>Schlaf</th><th>Qual.</th><th>Ruhep.</th><th>HFV</th><th>Ø7</th><th>Temp.</th><th>Atem</th><th>REM</th><th>Tief</th><th>Lat.</th><th>SpO2</th></tr></thead><tbody>
    ${rows.map(r => { const idx = all.indexOf(r); const a7 = rollingAvg(all, 'hrv', idx, 7); let fl = '';
      if (r.hrv != null && a7) { const d = (r.hrv - a7) / a7 * 100; fl = d <= -10 ? ' <span class="flag-low" title="mehr als 10 % unter Schnitt">▼</span>' : d >= 10 ? ' <span class="flag-high" title="mehr als 10 % über Schnitt">▲</span>' : ''; }
      return `<tr class="${illnessAt(r.date) ? 'sick' : ''}"><td>${dowShort(r.date)} ${fmtDate(r.date)}</td><td>${de(r.sleepHours)}</td><td>${de(r.sleepQuality)}</td><td>${de(r.restingHR)}</td><td>${de(r.hrv)}${fl}</td><td>${a7 != null ? de(a7, 0) : '–'}</td><td>${r.bodyTemp != null ? (r.bodyTemp > 0 ? '+' : '') + de(r.bodyTemp) : '–'}</td><td>${de(r.breathingRate)}</td><td>${de(r.remSleep)}</td><td>${de(r.deepSleep)}</td><td>${de(r.sleepLatency)}</td><td>${de(r.spo2)}</td></tr>`; }).join('')}
    </tbody></table></div><div class="hint">▼ HFV mehr als 10 % unter deinem 7-Tage-Schnitt, ▲ deutlich darüber. Rote Datumsangaben: krank.</div>` : '<div class="empty">Noch keine Einträge.</div>'}</div></div>`;

  h += `<div class="sec" id="werte-form"><div class="sec-h"><h2>Werte eintragen</h2><span class="aside">auch für andere Tage</span></div><div class="panel">
    <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="w-date">Datum</label><input class="inp" type="date" id="w-date" value="${WERTE_DATE}" max="${t}"></div></div>
    ${checkinFields('w', WERTE_DATE)}
    <button class="btn block" data-act="checkin-save" data-prefix="w">Werte speichern</button></div></div>`;
  $('#app').innerHTML = h;
}

/* ================= FORTSCHRITT ================= */
function renderFortschritt() {
  let h = `<h1 class="view-title">Fortschritt<small>Was sich seit dem Start getan hat</small></h1>`;
  const cal = PLAN.meta.scoreCalibration;
  h += `<div class="sec" style="margin-top:0"><div class="sec-h"><h2>Sport-Scores</h2>${cal ? `<span class="aside">Coach-Stand ${fmtDate(cal.date)}</span>` : ''}</div><div class="scores">${['swim', 'bike', 'run', 'strength'].map(sp => {
    const sc = computeScore(sp); const r = 27, c = 2 * Math.PI * r;
    return `<div class="score"><div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" style="stroke:var(--surface-2)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" style="stroke:${SPORTS[sp].color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c - sc / 100 * c).toFixed(1)}"/></svg><b>${sc}</b></div>
      <div class="nm">${SPORTS[sp].label}</div><div class="tr">${tierLabel(sc)}</div>
      <div class="adj"><button data-act="score" data-sport="${sp}" data-dir="-1" aria-label="${SPORTS[sp].label} minus 1">−</button><button data-act="score" data-sport="${sp}" data-dir="1" aria-label="${SPORTS[sp].label} plus 1">+</button></div></div>`;
  }).join('')}</div>
  ${cal ? `<details class="fold panel"><summary><span class="hint">Wie die Scores zustande kommen</span><span class="chev">${uiIcon('chev', 18)}</span></summary><div class="fold-body hint">${['swim', 'bike', 'run', 'strength'].map(sp => esc(cal.notes[sp])).join('<br>')}<br>Seit dem Coach-Stand bewegen abgehakte Einheiten die Scores (Gut +3, Okay +0,3, Schlecht −2), verpasste kosten 1,2 Punkte. Ausgefallene und Krankheitstage zählen nicht.</div></details>` : ''}</div>`;

  const sp = UI.perfSport || 'swim';
  const E = perfEntries(sp);
  h += `<div class="sec"><div class="sec-h"><h2>Leistung</h2></div>
    <div class="seg" role="tablist">${[['swim', 'Schwimmen'], ['run', 'Laufen'], ['bike', 'Rad']].map(([k, l]) => `<button class="${sp === k ? 'on' : ''}" data-act="perf" data-sport="${k}" role="tab" aria-selected="${sp === k}">${l}</button>`).join('')}</div>`;
  if (sp === 'swim') {
    h += `<div class="panel"><div class="lbl">Kraul-Pace pro 100 m (oben = schneller)</div>${lineChart(E, [{ key: 'pace100', name: 'Pace', color: 'var(--swim)', fmt: secToPace }], { invert: true, fmt: secToPace, h: 160, label: 'Schwimm-Pace' })}</div>
      <div class="panel"><div class="lbl">Züge pro 25-m-Bahn (weniger = effizienter)</div>${lineChart(E, [{ key: 'spl', name: 'Züge/Bahn', color: 'var(--swim)', area: true }], { h: 150, label: 'Züge pro Bahn' })}
      <div class="hint">Weniger Züge bei gleichem Tempo heißt: längerer Zug und bessere Wasserlage. Werte mit viel Pull Buoy sind besser als ohne, schreib das in die Notizen.</div></div>`;
    h += perfTable(E, [['Meter', e => de(e.meters)], ['Pace', e => secToPace(e.pace100)], ['Züge/Bahn', e => de(e.spl)], ['m/Zug', e => de(e.dps)], ['Züge/min', e => de(e.rate)]]);
  } else {
    const key = sp === 'run' ? 'Laufen' : 'Rad';
    h += `<div class="panel"><div class="lbl">Meter pro Herzschlag (höher = effizienter)</div>${lineChart(E, [{ key: 'eff', name: 'm/Schlag', color: SPORTS[sp].color, area: true, fmt: v => de(v, 2) }], { h: 170, fmt: v => de(v, 2), label: key + ' Effizienz' })}
      <div class="hint">Tempo geteilt durch Ø Puls. Steigt der Wert bei lockeren Einheiten, wird dein Herz effizienter. Hitze, Müdigkeit und Hügel drücken ihn.</div></div>`;
    h += sp === 'run'
      ? perfTable(E, [['km', e => de(e.km)], ['Pace', e => e.pace ? secToPace(e.pace) : '–'], ['Ø HF', e => de(e.hr)], ['m/Schlag', e => e.eff ? de(e.eff, 2) : '–']])
      : perfTable(E, [['km', e => de(e.km)], ['km/h', e => e.speed ? de(e.speed, 1) : '–'], ['Ø HF', e => de(e.hr)], ['m/Schlag', e => e.eff ? de(e.eff, 2) : '–']]);
  }
  h += `<div class="hint">Neue Werte kommen aus den Feldern „Daten von der Uhr eintragen“ in abgehakten Einheiten.</div></div>`;

  const vo2 = STATE.trend.filter(p => p.vo2max != null);
  h += `<div class="sec"><div class="sec-h"><h2>VO2max</h2></div><div class="panel">${lineChart(vo2, [{ key: 'vo2max', name: 'VO2max', color: 'var(--accent)', area: true, fmt: v => de(v, 1) }], { h: 150, fmt: v => de(v, 1), shade: illnessShades(), label: 'VO2max' })}<div class="hint">${vo2Insight(vo2)}</div></div></div>`;

  h += volumeSection();

  const ms = [...STATE.milestones].sort((a, b) => b.date.localeCompare(a.date));
  h += `<div class="sec"><div class="sec-h"><h2>Meilensteine</h2><span class="aside">${ms.length}</span></div><div class="panel">
    ${ms.length ? ms.map(m => `<div class="ms" data-mid="${esc(m.id)}"><div class="when">${fmtDate(m.date)}</div><div class="txt">${esc(m.text)}</div><button class="btn danger small" data-act="ms-del">Löschen</button></div>`).join('') : '<div class="empty">Noch keine Meilensteine.</div>'}
    <div class="hr"></div>
    <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="ms-date">Datum</label><input class="inp" type="date" id="ms-date" value="${todayStr()}"></div><div class="fld wide"><label for="ms-text">Was hast du geschafft?</label><input class="inp" type="text" id="ms-text" placeholder="z. B. 50 m Kraul am Stück"></div></div>
    <button class="btn small" data-act="ms-add">Meilenstein hinzufügen</button></div></div>`;
  $('#app').innerHTML = h;
}
function perfTable(E, cols) {
  if (!E.length) return '';
  return `<div class="panel scroll-x"><table class="tbl"><thead><tr><th>Datum</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${[...E].reverse().slice(0, 8).map(e => `<tr><td>${dowShort(e.date)} ${fmtDate(e.date)}</td>${cols.map(c => `<td>${c[1](e)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function vo2Insight(pts) {
  if (pts.length < 3) return 'Der Garmin-Schätzwert schwankt mit Tagesform, Hitze und Müdigkeit. Wichtig ist der Trend über Wochen.';
  const last3 = pts.slice(-3).map(p => p.vo2max);
  const tsbs = STATE.trend.filter(p => p.tsb != null).slice(-7).map(p => p.tsb);
  const avg = tsbs.length ? tsbs.reduce((a, b) => a + b, 0) / tsbs.length : null;
  if (last3[2] < last3[0] && avg != null && avg < -5) return `VO2max sinkt, während dein TSB im Schnitt bei ${de(avg, 1)} liegt. Das ist eher ein Müdigkeits-Effekt in der Messung als echter Fitnessverlust.`;
  if (last3[2] >= last3[0]) return 'VO2max zeigt zuletzt keinen fallenden Trend. Der Garmin-Wert schwankt mit der Tagesform, wichtig ist der Trend über Wochen.';
  return 'Der Garmin-Schätzwert schwankt mit Tagesform, Hitze und Müdigkeit. Wichtig ist der Trend über Wochen.';
}
function sessDoneMinutes(s) { const st = sessState(s.id); const m = st.metrics ? parseNum(st.metrics.min) : null; return m != null ? m : sessionMinutes(s); }
function sessDoneKm(s) {
  const st = sessState(s.id); const m = st.metrics || {};
  const km = parseNum(m.km); if (km != null) return km;
  const me = parseNum(m.meters); if (me != null) return me / 1000;
  return s.plannedKm || 0;
}
function volumeSection() {
  const mode = UI.volMode == null ? String(currentWeekIdx()) : UI.volMode;
  const weeks = mode === 'block' ? PLAN.weeks : [PLAN.weeks[parseInt(mode)] || PLAN.weeks[0]];
  const keys = ['swim', 'bike', 'run', 'strength', 'football'];
  const T = {}; keys.forEach(k => { T[k] = { ph: 0, dh: 0, pk: 0, dk: 0 }; });
  weeks.forEach(w => w.days.forEach(d => {
    d.sessions.forEach(s0 => {
      const s = { ...s0, date: d.date }; if (!T[s.sport]) return;
      T[s.sport].ph += sessionMinutes(s) / 60; T[s.sport].pk += s.plannedKm || 0;
      if (effStatus(s) === 'done') { T[s.sport].dh += sessDoneMinutes(s) / 60; T[s.sport].dk += sessDoneKm(s); }
    });
    (STATE.customWorkouts[d.date] || []).forEach(c => {
      if (!T[c.sport]) return; const m = c.metrics || {};
      const min = parseNum(m.min) ?? c.plannedMinutes ?? 0; T[c.sport].dh += min / 60;
      T[c.sport].dk += parseNum(m.km) ?? (parseNum(m.meters) != null ? parseNum(m.meters) / 1000 : (c.plannedKm || 0));
    });
  }));
  const maxH = Math.max(0.1, ...keys.map(k => Math.max(T[k].ph, T[k].dh)));
  const rows = keys.filter(k => T[k].ph || T[k].dh);
  const totP = rows.reduce((a, k) => a + T[k].ph, 0), totD = rows.reduce((a, k) => a + T[k].dh, 0);
  const wk = PLAN.weeks.map((w, i) => {
    let p = 0, d = 0;
    w.days.forEach(day => { day.sessions.forEach(s0 => { const s = { ...s0, date: day.date }; if (s.sport === 'rest') return; p += sessionMinutes(s); if (effStatus(s) === 'done') d += sessDoneMinutes(s); }); (STATE.customWorkouts[day.date] || []).forEach(c => { d += parseNum((c.metrics || {}).min) ?? c.plannedMinutes ?? 0; }); });
    return { i, label: w.label.replace('Woche ', 'W'), p: p / 60, d: d / 60 };
  });
  const wmax = Math.max(0.1, ...wk.map(x => Math.max(x.p, x.d)));
  return `<div class="sec"><div class="sec-h"><h2>Trainingsvolumen</h2><span class="aside num">${de(totD, 1)} von ${de(totP, 1)} h</span></div>
    <div class="chips">${PLAN.weeks.map((w, i) => `<button class="chip ${mode === String(i) ? 'on' : ''}" data-act="vol" data-mode="${i}">${esc(w.label)}</button>`).join('')}<button class="chip ${mode === 'block' ? 'on' : ''}" data-act="vol" data-mode="block">Ganzer Block</button></div>
    <div class="panel"><div class="vol">${rows.map(k => `<div class="nm" style="--c:${SPORTS[k].color}">${icon(k)}<span>${SPORTS[k].label}</span></div>
      <div class="vbar" style="--c:${SPORTS[k].color}"><div class="p" style="width:${(T[k].ph / maxH * 100).toFixed(1)}%"></div><div class="d" style="width:calc(${(T[k].dh / maxH * 100).toFixed(1)}% - 6px)"></div></div>
      <div class="amt"><b>${de(T[k].dh, 1)}</b> / ${de(T[k].ph, 1)} h</div>`).join('')}</div>
      <div class="legend"><span><i style="--c:var(--ink-2)"></i>erledigt</span><span><i class="box" style="--c:var(--ink-2)"></i>geplant</span></div></div>
    <div class="panel"><div class="lbl">Stunden pro Woche</div><div class="wk-bars">${wk.map(x => `<div class="wk-bar"><div class="col" style="height:${(x.p / wmax * 92).toFixed(1)}%"><i style="height:${x.p ? Math.min(100, x.d / x.p * 100).toFixed(1) : 0}%"></i></div><div class="l">${x.label}<br>${de(x.d, 1)}/${de(x.p, 1)}</div></div>`).join('')}</div></div></div>`;
}

/* ================= Nutrition ================= */
const NUTRI_TYPES = {
  rest: { label: 'Ruhetag', carbs: [4, 5], note: 'Kein Training: Basis decken, viel Gemüse und genug Protein.' },
  training: { label: 'Trainingstag', carbs: [5, 6], note: 'Normales Training: Kohlenhydrate rund um die Einheit legen.' },
  hard: { label: 'Langer/harter Tag', carbs: [6, 8], note: 'Lange oder harte Einheit: viel Kohlenhydrate. Bei Einheiten über 75 min unterwegs 30-60 g Kohlenhydrate pro Stunde.' },
  match: { label: 'Spieltag', carbs: [6, 7], note: 'Spiel: 3-4 h vorher eine große Kohlenhydrat-Mahlzeit, danach schnell auffüllen.' },
  sick: { label: 'Krankheitstag', carbs: [4, 5], note: 'Krank: auch ohne Hunger regelmäßig kleine Portionen. Suppe, Reis, Toast, Banane, viel Tee und Wasser. Tracken ist optional.' }
};
const NUTRI_SLOTS = {
  rest: [['Frühstück', 28, 'breakfast'], ['Mittagessen', 32, 'main'], ['Abendessen', 30, 'main'], ['Snack', 10, 'snack']],
  training: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 28, 'main'], ['Abendessen', 27, 'main'], ['Snack', 10, 'snack'], ['Nach dem Training', 10, 'post']],
  hard: [['Frühstück', 22, 'breakfast'], ['Vor dem Training (1-2 h)', 8, 'pre'], ['Mittagessen', 22, 'main'], ['Nach dem Training', 13, 'post'], ['Abendessen', 25, 'main'], ['Snack', 10, 'snack']],
  match: [['Frühstück', 22, 'breakfast'], ['Mittagessen (3-4 h vor dem Spiel)', 25, 'main'], ['Vor dem Spiel (1-1,5 h)', 8, 'pre'], ['Nach dem Spiel', 15, 'post'], ['Abendessen', 20, 'main'], ['Snack', 10, 'snack']],
  sick: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 30, 'sick'], ['Abendessen', 30, 'sick'], ['Snack', 15, 'snack']]
};
const MEALS = {
  breakfast: [
    { n: 'Haferbrei', p: '80 g Haferflocken, 300 ml Milch, 1 Banane, 15 g Nüsse', k: 630, c: 97, pr: 25, f: 18 },
    { n: 'Skyr-Müsli', p: '250 g Skyr, 60 g Müsli, 100 g Beeren, 10 g Honig', k: 450, c: 64, pr: 35, f: 5 },
    { n: 'Brot mit Rührei', p: '3 Scheiben Vollkornbrot, 3 Eier, Gemüse', k: 520, c: 57, pr: 30, f: 18 }
  ],
  main: [
    { n: 'Reis mit Hähnchen', p: '100 g Reis (roh), 150 g Hähnchenbrust, 200 g Gemüse, 1 EL Öl', k: 665, c: 87, pr: 44, f: 13 },
    { n: 'Pasta mit Puten-Bolognese', p: '100 g Vollkornnudeln (roh), 150 g Putenhack, 150 g Tomatensauce, 15 g Parmesan', k: 635, c: 78, pr: 52, f: 11 },
    { n: 'Lachs mit Kartoffeln', p: '400 g Kartoffeln, 150 g Lachs, 200 g Brokkoli', k: 660, c: 74, pr: 44, f: 21 },
    { n: 'Linsen-Dal mit Reis', p: '100 g rote Linsen (roh), 60 g Reis (roh), 150 g Gemüse, 1 EL Öl', k: 695, c: 114, pr: 32, f: 13 }
  ],
  sick: [
    { n: 'Hühnersuppe mit Nudeln', p: '500 ml Brühe, 120 g Hähnchen, 60 g Nudeln (roh), Karotte, Sellerie', k: 480, c: 50, pr: 38, f: 10 },
    { n: 'Reis mit Rührei', p: '90 g Reis (roh), 2 Eier, etwas Butter', k: 500, c: 72, pr: 18, f: 15 },
    { n: 'Kartoffelbrei mit Quark', p: '350 g Kartoffeln, 100 ml Milch, 150 g Kräuterquark', k: 450, c: 60, pr: 22, f: 11 }
  ],
  snack: [
    { n: 'Banane mit Nüssen', p: '1 Banane, 30 g Nüsse', k: 285, c: 31, pr: 7, f: 16 },
    { n: 'Quark mit Obst', p: '250 g Magerquark, 150 g Obst', k: 250, c: 30, pr: 31, f: 1 },
    { n: 'Brot mit Erdnussbutter', p: '2 Scheiben Vollkornbrot, 20 g Erdnussbutter', k: 320, c: 40, pr: 12, f: 12 }
  ],
  pre: [
    { n: 'Toast mit Honig und Banane', p: '2 Scheiben Toast, 20 g Honig, 1 Banane', k: 330, c: 73, pr: 6, f: 2 },
    { n: 'Reiswaffeln mit Marmelade', p: '4 Reiswaffeln, 30 g Marmelade', k: 215, c: 48, pr: 3, f: 1 }
  ],
  post: [
    { n: 'Kakao mit Banane', p: '400 ml Milch, 20 g Kakaopulver, 1 Banane', k: 370, c: 63, pr: 15, f: 7 },
    { n: 'Skyr mit Haferflocken', p: '250 g Skyr, 40 g Haferflocken, 100 g Beeren', k: 350, c: 45, pr: 34, f: 4 }
  ]
};
function sessionMet(s) {
  const intense = /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || ''));
  if (s.sport === 'run') return intense ? 11 : 9;
  if (s.sport === 'bike') return intense ? 9.5 : 7;
  if (s.sport === 'swim') return 6;
  if (s.sport === 'strength') return 4;
  if (s.sport === 'football') return 7.5;
  return 0;
}
function sessionMinutes(s) {
  if (s.plannedMinutes) return s.plannedMinutes;
  if (s.sport === 'football') return /spiel|match/i.test(s.title || '') ? 60 : 90;
  return 0;
}
function nutritionSessionsFor(date) {
  const out = []; const day = findDay(date);
  if (day) day.sessions.forEach(s0 => {
    const s = { ...s0, date }; if (s.sport === 'rest') return;
    const status = effStatus(s);
    if (status === 'skipped' || status === 'sick' || status === 'missed') return;
    out.push({ sport: s.sport, title: s.title, zone: s.zone, minutes: status === 'done' ? sessDoneMinutes(s) : sessionMinutes(s), custom: false });
  });
  (STATE.customWorkouts[date] || []).forEach(w => out.push({ sport: w.sport, title: w.title, zone: '', minutes: parseNum((w.metrics || {}).min) ?? sessionMinutes(w), custom: true }));
  return out.filter(x => x.minutes > 0);
}
function classifyDay(date, sessions) {
  if (illnessAt(date) && !sessions.length) return 'sick';
  if (!sessions.length) return 'rest';
  if (sessions.some(s => s.sport === 'football' && /spiel|match/i.test(s.title || ''))) return 'match';
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const longest = Math.max(0, ...sessions.filter(s => s.sport !== 'strength').map(s => s.minutes));
  const intense = sessions.some(s => s.sport !== 'strength' && /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || '')));
  if (intense || longest >= 75 || total >= 150) return 'hard';
  return 'training';
}
function weightFor(date) {
  const e = Object.entries(STATE.nutrition || {}).filter(([d, v]) => v && v.weight != null && d <= date).sort((a, b) => a[0].localeCompare(b[0]));
  if (e.length) { const last = e.slice(-7).map(x => x[1].weight); return last.reduce((a, b) => a + b, 0) / last.length; }
  return STATE.nutritionProfile.weightKg;
}
function computeNutritionTargets(date) {
  const p = STATE.nutritionProfile; const w = weightFor(date);
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + 5;
  const daily = bmr * p.pal;
  const sessions = nutritionSessionsFor(date);
  const actDetails = sessions.map(s => ({ ...s, kcal: Math.round((sessionMet(s) - 1) * w * s.minutes / 60) }));
  const act = actDetails.reduce((a, s) => a + s.kcal, 0);
  const tdee = daily + act;
  const typeAuto = classifyDay(date, sessions);
  const ov = STATE.nutrition[date] && STATE.nutrition[date].typeOverride;
  const type = (ov && NUTRI_TYPES[ov]) ? ov : typeAuto;
  const t = NUTRI_TYPES[type];
  return { date, weight: w, bmr, daily, act, actDetails, tdee, type, typeAuto, overridden: !!(ov && NUTRI_TYPES[ov]),
    kcal: [round50(tdee), round50(tdee * 1.10)], carbs: [round5(t.carbs[0] * w), round5(t.carbs[1] * w)],
    protein: [round5(1.6 * w), round5(2.0 * w)], fat: [round5(1.0 * w), round5(1.5 * w)] };
}
function nbar(label, eaten, lo, hi, unit) {
  const max = hi * 1.25; const pct = v => Math.max(0, Math.min(100, v / max * 100));
  const st = eaten == null ? '' : (eaten < lo ? 'low' : eaten > hi ? 'over' : 'ok');
  return `<div class="nrow"><span class="muted">${label}</span><div class="nbar"><div class="band" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>${eaten != null ? `<div class="fill ${st}" style="width:${pct(eaten)}%"></div>` : ''}</div><span class="v"><b>${eaten != null ? Math.round(eaten) : '–'}</b> / ${lo}-${hi}${unit}</span></div>`;
}
function nutritionMini() {
  const d = todayStr(); const t = computeNutritionTargets(d); const e = STATE.nutrition[d] || {}; const info = NUTRI_TYPES[t.type];
  return `<button class="panel" data-act="go-essen" style="width:100%;text-align:left;cursor:pointer;display:block">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><div style="font:700 18px/1.1 var(--f-display);text-transform:uppercase;letter-spacing:.03em">${info.label}</div>
    <div class="hint num">Ziel ${t.kcal[0]}-${t.kcal[1]} kcal · KH ${t.carbs[0]}-${t.carbs[1]} g · Protein ${t.protein[0]}-${t.protein[1]} g</div></div>
    <div class="hint" style="text-align:right;flex-shrink:0">${e.kcal != null ? `<b class="num">${e.kcal}</b> kcal<br>eingetragen` : 'noch nichts<br>eingetragen'}</div></div>
    ${e.kcal != null ? nbar('Kalorien', e.kcal, t.kcal[0], t.kcal[1], '') : ''}</button>`;
}
let NUT_DATE = null;
function rng(a, b) { return a === b ? String(a) : a + '-' + b; }
function renderEssen() {
  if (!NUT_DATE) NUT_DATE = todayStr();
  const date = NUT_DATE; const t = computeNutritionTargets(date); const e = STATE.nutrition[date] || {}; const ti = NUTRI_TYPES[t.type]; const pr = STATE.nutritionProfile;
  let h = `<h1 class="view-title">Ernährung<small>${dowLong(date)}, ${fmtDate(date)} · ${ti.label}</small></h1>
  <div class="panel"><div class="fgrid">
    <div class="fld" style="grid-column: span 2"><label for="nut-date">Datum</label><input class="inp" type="date" id="nut-date" value="${date}"></div>
    <div class="fld" style="grid-column: span 2"><label for="nut-type">Tagestyp</label><select class="inp" id="nut-type"><option value="auto">Automatisch (${NUTRI_TYPES[t.typeAuto].label})</option>${Object.entries(NUTRI_TYPES).map(([k, v]) => `<option value="${k}" ${t.overridden && t.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
  </div>
  <div class="tiles four">
    <div class="tile"><div class="k">Ruhe</div><div class="v">${Math.round(t.bmr)}</div><div class="s">Grundumsatz</div></div>
    <div class="tile"><div class="k">Alltag</div><div class="v">${Math.round(t.daily - t.bmr)}</div><div class="s">Schule, Gehen</div></div>
    <div class="tile"><div class="k">Training</div><div class="v">${Math.round(t.act)}</div><div class="s">kcal</div></div>
    <div class="tile"><div class="k">Gesamt</div><div class="v">${Math.round(t.tdee)}</div><div class="s">Verbrauch</div></div>
  </div>
  <div><div class="lbl">Zielbereich</div><div style="font:700 26px/1.1 var(--f-display)" class="num">${t.kcal[0]}-${t.kcal[1]} kcal</div>
    <div class="hint num">Kohlenhydrate <strong>${t.carbs[0]}-${t.carbs[1]} g</strong> (${ti.carbs[0]}-${ti.carbs[1]} g/kg) · Protein <strong>${t.protein[0]}-${t.protein[1]} g</strong> · Fett <strong>${t.fat[0]}-${t.fat[1]} g</strong> · Rechengewicht ${de(t.weight, 1)} kg</div></div>
  <div class="hint">${ti.note}</div>
  ${t.actDetails.length ? `<div>${t.actDetails.map(a => `<div class="kv"><span>${esc(a.title)}${a.custom ? ' (Extra)' : ''}</span><span class="muted">${a.minutes} min · ca. ${a.kcal} kcal</span></div>`).join('')}</div>` : '<div class="hint">Kein Training in der Berechnung.</div>'}
  </div>`;

  h += `<div class="sec"><div class="sec-h"><h2>Gegessen</h2><span class="aside">Tagessumme aus deiner App</span></div><div class="panel">
    <div class="fgrid">${[['kcal', 'Kalorien'], ['carbs', 'Kohlenh. g'], ['protein', 'Protein g'], ['fat', 'Fett g'], ['weight', 'Gewicht kg']].map(([k, l]) => `<div class="fld"><label for="nut-${k}">${l}</label><input class="inp" type="number" step="any" inputmode="decimal" id="nut-${k}" value="${e[k] ?? ''}"></div>`).join('')}</div>
    <button class="btn block" data-act="nut-save">Speichern</button>
    <div class="stack">${nbar('Kalorien', e.kcal ?? null, t.kcal[0], t.kcal[1], '')}${nbar('Kohlenh.', e.carbs ?? null, t.carbs[0], t.carbs[1], ' g')}${nbar('Protein', e.protein ?? null, t.protein[0], t.protein[1], ' g')}${nbar('Fett', e.fat ?? null, t.fat[0], t.fat[1], ' g')}</div>
    <div class="hint">Grün ist dein Zielbereich. Darunter: mehr essen, vor allem Kohlenhydrate. Darüber ist kein Problem.</div></div></div>`;

  const rows = []; for (let i = 6; i >= 0; i--) { const d = addDays(date, -i); rows.push({ d, t: computeNutritionTargets(d), e: STATE.nutrition[d] || {} }); }
  const logged = rows.filter(r => r.e.kcal != null);
  const icon2 = r => r.e.kcal == null ? '<span class="muted">·</span>' : r.e.kcal < r.t.kcal[0] ? '<span style="color:var(--warn)">●</span>' : r.e.kcal > r.t.kcal[1] ? '<span style="color:var(--info)">●</span>' : '<span style="color:var(--good)">●</span>';
  const last3 = logged.slice(-3);
  const banner = (last3.length === 3 && last3.every(r => r.e.kcal < r.t.kcal[0] * 0.9)) ? `<div class="banner">An den letzten drei eingetragenen Tagen lagst du deutlich unter dem Zielbereich. Beim Training zählt vor allem genug Energie und genug Kohlenhydrate. Iss an den nächsten Tagen etwas mehr, und wenn dir das Essen gerade schwerfällt, sag es mir oder sprich mit deinem Arzt.</div>` : '';
  let summary = 'Noch keine Tage in dieser Woche eingetragen.';
  if (logged.length) {
    const avgE = logged.reduce((a, r) => a + r.e.kcal, 0) / logged.length; const avgL = logged.reduce((a, r) => a + r.t.kcal[0], 0) / logged.length;
    const wc = logged.filter(r => r.e.carbs != null); const cpk = wc.length ? (wc.reduce((a, r) => a + r.e.carbs, 0) / wc.length) / weightFor(date) : null;
    summary = `${logged.length}/7 Tage eingetragen · Ø ${Math.round(avgE)} kcal (${Math.round(avgE / avgL * 100)} % vom Beginn des Zielbereichs)${cpk ? ` · Ø ${de(cpk, 1)} g Kohlenhydrate pro kg` : ''}.`;
  }
  h += `<div class="sec"><div class="sec-h"><h2>Letzte 7 Tage</h2></div>${banner}<div class="panel"><div class="scroll-x"><table class="tbl"><thead><tr><th>Tag</th><th>Typ</th><th>Ziel kcal</th><th>Gegessen</th><th>KH</th><th>P</th><th>F</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${dowShort(r.d)} ${fmtDate(r.d)}</td><td>${NUTRI_TYPES[r.t.type].label}</td><td>${r.t.kcal[0]}-${r.t.kcal[1]}</td><td>${r.e.kcal ?? '–'}</td><td>${r.e.carbs ?? '–'}</td><td>${r.e.protein ?? '–'}</td><td>${r.e.fat ?? '–'}</td><td>${icon2(r)}</td></tr>`).join('')}
    </tbody></table></div><div class="hint">${summary} <span style="color:var(--good)">●</span> im Bereich · <span style="color:var(--warn)">●</span> darunter · <span style="color:var(--info)">●</span> darüber</div></div></div>`;

  const we = Object.entries(STATE.nutrition || {}).filter(([d, v]) => v && v.weight != null).sort((a, b) => a[0].localeCompare(b[0]));
  const wp = we.map(([d, v]) => ({ date: d, weight: v.weight })); wp.forEach((p, i) => { p.avg = rollingAvg(wp, 'weight', i, 7); });
  const lastW = wp[wp.length - 1];
  h += `<div class="sec"><div class="sec-h"><h2>Gewicht</h2></div><div class="panel">${lineChart(wp, [{ key: 'weight', name: 'Gewicht', color: 'var(--ink-2)', fmt: v => de(v, 1) }, { key: 'avg', name: 'Ø 7 Tage', color: 'var(--info)', fmt: v => de(v, 1) }], { h: 140, legend: true, fmt: v => de(v, 1), empty: 'Für einen Verlauf braucht es mindestens zwei Einträge. Einer pro Woche reicht (morgens, nüchtern).' })}
    <div class="hint">${lastW ? `Letzter Wert ${de(lastW.weight, 1)} kg · Schnitt ${de(lastW.avg, 1)} kg. Das Gewicht schwankt täglich um 1-2 kg, nur der Schnitt zählt. Du bist noch im Wachstum, ein Gewichtsziel gibt es nicht. Es dient nur der Berechnung.` : 'Noch keine Gewichte eingetragen.'}</div></div></div>`;

  const slots = NUTRI_SLOTS[t.type]; const dayIdx = Math.floor(new Date(date + 'T12:00:00').getTime() / 86400000); let used = 0;
  h += `<div class="sec"><div class="sec-h"><h2>Vorschläge</h2><span class="aside">wechseln täglich</span></div><div class="panel">${slots.map(([name, share, cat]) => {
    const list = MEALS[cat]; const cnt = Math.min((cat === 'main' || cat === 'sick') ? 2 : 3, list.length); const off = (dayIdx + ((cat === 'main' || cat === 'sick') ? used * 2 : 0)) % list.length; if (cat === 'main' || cat === 'sick') used++;
    const opts = []; for (let i = 0; i < cnt; i++) opts.push((off + i) % list.length);
    return `<div class="meal"><div class="meal-h"><b>${name}</b><span>ca. ${rng(round50(t.kcal[0] * share / 100), round50(t.kcal[1] * share / 100))} kcal<br>${rng(round5(t.carbs[0] * share / 100), round5(t.carbs[1] * share / 100))} g KH</span></div>
      ${opts.map(i => { const m = list[i]; return `<div class="mopt"><div><strong>${m.n}</strong> · ${m.p}<div class="mm">ca. ${m.k} kcal · KH ${m.c} g · Protein ${m.pr} g · Fett ${m.f} g</div></div><button class="btn soft small" data-act="nut-add" data-cat="${cat}" data-i="${i}" aria-label="${m.n} als gegessen hinzufügen">+ Gegessen</button></div>`; }).join('')}</div>`;
  }).join('')}<div class="hint">„+ Gegessen“ addiert die Nährwerte zur Tagessumme oben. Mengen sind Richtwerte, Reis, Nudeln oder Kartoffeln passt du an deinen Hunger an.</div></div></div>`;

  h += `<div class="sec"><div class="panel"><details class="fold"><summary><span class="sec-h"><h2>Berechnung einstellen</h2></span><span class="chev">${uiIcon('chev', 18)}</span></summary><div class="fold-body">
    <div class="fgrid"><div class="fld"><label for="np-age">Alter</label><input class="inp" type="number" id="np-age" value="${pr.age}"></div><div class="fld"><label for="np-h">Größe cm</label><input class="inp" type="number" id="np-h" value="${pr.heightCm}"></div><div class="fld"><label for="np-w">Startgewicht kg</label><input class="inp" type="number" step="any" id="np-w" value="${pr.weightKg}"></div><div class="fld"><label for="np-pal">Alltagsfaktor</label><input class="inp" type="number" step="0.05" id="np-pal" value="${pr.pal}"></div></div>
    <button class="btn small" data-act="nut-settings">Speichern</button>
    <div class="hint">Grundumsatz nach Mifflin-St Jeor. Der Alltagsfaktor deckt Schule, Lernen und Gehen ab (1,4 = überwiegend sitzend). Training wird nach Dauer und Intensität dazugerechnet. Alle Zahlen sind Schätzungen (±10-15 %). Die App ist dafür da, dass du genug isst: der Zielbereich beginnt beim geschätzten Verbrauch, nie darunter.</div></div></details></div></div>`;
  $('#app').innerHTML = h;
}

/* ================= Export ================= */
function buildExportText(date) {
  const L = [];
  L.push(`Training vom ${fmtDate(date)}:`);
  let any = false;
  SESS.filter(s => s.date === date).forEach(s => {
    const st = sessState(s.id);
    if (st.completed) {
      any = true;
      let line = `- ${(SPORTS[s.sport] || {}).label || s.sport}: ${s.title}`;
      if (st.rpe) line += ` (RPE ${st.rpe}/10)`;
      if (st.temp) line += ` (${st.temp}°C)`;
      if (st.quality) line += ` [${st.quality === 'good' ? 'gut' : st.quality === 'bad' ? 'schlecht' : 'ok'}]`;
      L.push(line);
      const ms = metricsSummary(s.sport, st.metrics); if (ms) L.push(`  Daten: ${ms}`);
      if (st.notes) L.push(`  ${st.notes}`);
    } else if (st.skipped) {
      any = true; L.push(`- Ausgefallen: ${s.title}${st.skipReason ? ' (' + st.skipReason + ')' : ''}`);
    }
  });
  (STATE.customWorkouts[date] || []).forEach(w => {
    any = true;
    const dk = [w.plannedMinutes ? w.plannedMinutes + 'min' : null, w.plannedKm ? w.plannedKm + 'km' : null].filter(Boolean).join(' / ');
    L.push(`- Extra (nicht geplant) ${(SPORTS[w.sport] || {}).label || w.sport}: ${w.title}${dk ? ' - ' + dk : ''}${w.quality ? ` [${w.quality === 'good' ? 'gut' : w.quality === 'bad' ? 'schlecht' : 'ok'}]` : ''}`);
    const ms = metricsSummary(w.sport, w.metrics); if (ms) L.push(`  Daten: ${ms}`);
    if (w.description) L.push(`  ${w.description}`);
  });
  if (!any) L.push('(keine abgehakten oder zusätzlichen Einheiten für dieses Datum)');
  const ill = illnessAt(date);
  if (ill) L.push(`Krank seit ${fmtDate(ill.start)} (Tag ${daysBetween(ill.start, date) + 1})${ill.note ? ': ' + ill.note : ''}`);
  else { const rp = returnPhase(date); if (rp) L.push(`Wiedereinstieg nach Krankheit: Tag ${rp.day} ohne Symptome (${RETURN_STAGES[rp.stage].n})`); }

  const exact = trendAt(date);
  const ctlSrc = exact && exact.ctl != null ? exact : latestWithKey('ctl', date);
  const wv = [];
  if (ctlSrc) { ['ctl', 'atl', 'tsb', 'vo2max'].forEach(k => { if (ctlSrc[k] != null) wv.push(`${k === 'vo2max' ? 'VO2max' : k.toUpperCase()} ${ctlSrc[k]}`); }); }
  const cs = exact && exact.cardioRecovery != null ? exact : latestWithKey('cardioRecovery', date);
  if (cs && cs.cardioRecovery != null) wv.push(`Cardio-Erholung ${cs.cardioRecovery}${cs.date !== date && (!ctlSrc || ctlSrc.date !== cs.date) ? ' (Stand ' + fmtDate(cs.date) + ')' : ''}`);
  if (wv.length) { L.push(''); L.push(`Status${ctlSrc && ctlSrc.date !== date ? ' (Stand ' + fmtDate(ctlSrc.date) + ')' : ''}: ${wv.join(', ')}`); }
  const rSrc = hasRecovery(exact) ? exact : (() => { const a = STATE.trend.filter(p => p.date <= date && hasRecovery(p)); return a.length ? a[a.length - 1] : null; })();
  if (rSrc) {
    const rv = [];
    if (rSrc.sleepHours != null) rv.push(`Schlaf ${rSrc.sleepHours}h`);
    if (rSrc.sleepQuality != null) rv.push(`Qualität ${rSrc.sleepQuality}/10`);
    if (rSrc.restingHR != null) rv.push(`Ruhepuls ${rSrc.restingHR}`);
    if (rSrc.hrv != null) rv.push(`HFV ${rSrc.hrv}ms`);
    if (rSrc.breathingRate != null) rv.push(`Atemfrequenz ${rSrc.breathingRate}/min`);
    if (rSrc.remSleep != null) rv.push(`REM ${rSrc.remSleep}min`);
    if (rSrc.deepSleep != null) rv.push(`Tiefschlaf ${rSrc.deepSleep}min`);
    if (rSrc.sleepLatency != null) rv.push(`Latenz ${rSrc.sleepLatency}min`);
    if (rSrc.bodyTemp != null) rv.push(`Temp.-Abw. ${rSrc.bodyTemp > 0 ? '+' : ''}${rSrc.bodyTemp}°C`);
    if (rSrc.spo2 != null) rv.push(`SpO2 ${rSrc.spo2}%`);
    if (rv.length) L.push(`Erholung${rSrc.date !== date ? ' (Stand ' + fmtDate(rSrc.date) + ')' : ''}: ${rv.join(', ')}`);
  }
  const note = exact && exact.illness ? exact.illness : (rSrc && rSrc.date === date ? rSrc.illness : null);
  if (note) L.push(`Hinweis: ${note}`);
  const ne = STATE.nutrition && STATE.nutrition[date];
  if (ne && ['kcal', 'carbs', 'protein', 'fat', 'weight'].some(k => ne[k] != null)) {
    const nt = computeNutritionTargets(date); const np = [];
    if (ne.kcal != null) np.push(`${ne.kcal} kcal`); if (ne.carbs != null) np.push(`KH ${ne.carbs}g`); if (ne.protein != null) np.push(`Protein ${ne.protein}g`);
    if (ne.fat != null) np.push(`Fett ${ne.fat}g`); if (ne.weight != null) np.push(`Gewicht ${ne.weight}kg`);
    L.push(''); L.push(`Ernährung (${NUTRI_TYPES[nt.type].label}): ${np.join(', ')}`);
    L.push(`Ernährungsziel: ${nt.kcal[0]}-${nt.kcal[1]} kcal, KH ${nt.carbs[0]}-${nt.carbs[1]}g, Protein ${nt.protein[0]}-${nt.protein[1]}g, Fett ${nt.fat[0]}-${nt.fat[1]}g`);
  }
  return L.join('\n');
}

/* ================= Sheets ================= */
let SHEET = null;
function openSheet(kind, arg) { SHEET = { kind, arg }; renderSheet(); $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; }
function closeSheet() { SHEET = null; $('#sheet').hidden = true; $('#sheetPanel').innerHTML = ''; document.body.style.overflow = ''; }
function sheetHead(t) { return `<div class="sheet-h"><h2>${t}</h2><button class="icon-btn" data-act="sheet-close" aria-label="Schließen">${uiIcon('close')}</button></div>`; }
function renderSheet() {
  if (!SHEET) return;
  const P = $('#sheetPanel');
  if (SHEET.kind === 'export') {
    const d = SHEET.arg || todayStr();
    P.innerHTML = sheetHead('Export') + `<div class="stack">
      <div class="hint">Enthält die Einheiten des Tages, deinen Status, die Erholungswerte und die Ernährung. Kopieren und in den Chat einfügen.</div>
      <div class="row"><div class="fld" style="flex:1;min-width:150px"><label for="ex-date">Datum</label><input class="inp" type="date" id="ex-date" value="${d}"></div>
      <button class="btn" data-act="export-copy" style="align-self:flex-end">Kopieren</button>${CAN_SHARE ? '<button class="btn ghost" data-act="export-share" style="align-self:flex-end">Teilen</button>' : ''}</div>
      <textarea class="inp" id="ex-text" rows="14" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px">${esc(buildExportText(d))}</textarea></div>`;
  } else if (SHEET.kind === 'settings') {
    const S = STATE.settings, R = S.readiness;
    const theme = (() => { try { return localStorage.getItem('theme_pref') || ''; } catch (e) { return ''; } })();
    const zr = computeZones(S.lthrRun), pz = computePaceZones(S.thresholdPaceRunSec), zb = computeZones(S.lthrBike), sz = computeSpeedZones(S.thresholdSpeedBikeKmh);
    const zcol = ['var(--rest)', 'var(--info)', 'var(--good)', 'var(--warn)', 'var(--bad)'];
    P.innerHTML = sheetHead('Einstellungen') + `<div class="stack">
      <div class="sec" style="margin-top:0"><div class="sec-h"><h2>Darstellung</h2></div><div class="seg">${[['', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button class="${theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></div>

      <div class="sec"><div class="sec-h"><h2>Ampel-Grenzwerte</h2></div><div class="panel">
        <div class="hint">Ab diesen Morgenwerten zeigt „Heute“ Grün für Intervalle. Darunter wird es Gelb oder Rot.</div>
        <div class="fgrid"><div class="fld"><label for="r-rhr">Ruhepuls max</label><input class="inp" type="number" id="r-rhr" value="${R.rhrMax}"></div><div class="fld"><label for="r-hrv">HFV min</label><input class="inp" type="number" id="r-hrv" value="${R.hrvMin}"></div><div class="fld"><label for="r-temp">Temp. max °C</label><input class="inp" type="number" step="0.1" id="r-temp" value="${R.tempMax}"></div></div>
        <button class="btn small" data-act="save-ready">Speichern</button></div></div>

      <div class="sec"><div class="sec-h"><h2>Zonen</h2><span class="aside">nach dem Schwellentest anpassen</span></div><div class="panel">
        <div class="fgrid"><div class="fld"><label for="z-lr">LTHR Laufen</label><input class="inp" type="number" id="z-lr" value="${S.lthrRun}"></div><div class="fld"><label for="z-lb">LTHR Rad</label><input class="inp" type="number" id="z-lb" value="${S.lthrBike}"></div><div class="fld"><label for="z-tp">Schwellen-Pace</label><input class="inp" type="text" inputmode="decimal" id="z-tp" value="${secToPace(S.thresholdPaceRunSec)}" placeholder="5:39"></div><div class="fld"><label for="z-ts">Schwelle Rad km/h</label><input class="inp" type="number" step="any" id="z-ts" value="${S.thresholdSpeedBikeKmh}"></div></div>
        <button class="btn small" data-act="save-zones">Speichern</button>
        <div class="zbar">${zcol.map(c => `<i style="background:${c}"></i>`).join('')}</div>
        <div class="lbl">Laufen</div><div class="scroll-x"><table class="tbl"><tbody>${zr.map((z, i) => `<tr><td><b style="color:${zcol[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td>${z.lowBpm}${z.highBpm ? '-' + z.highBpm : '+'} bpm</td><td>${secToPace(pz[i].fastSec)}${pz[i].slowSec ? '-' + secToPace(pz[i].slowSec) : '+'}/km</td></tr>`).join('')}</tbody></table></div>
        <div class="lbl">Rad</div><div class="scroll-x"><table class="tbl"><tbody>${zb.map((z, i) => `<tr><td><b style="color:${zcol[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td>${z.lowBpm}${z.highBpm ? '-' + z.highBpm : '+'} bpm</td><td>${de(sz[i].lowKmh)}${sz[i].highKmh ? '-' + de(sz[i].highKmh) : '+'} km/h</td></tr>`).join('')}</tbody></table></div>
        <div class="hint">Passt Pace oder Speed, aber der Puls ist hoch, war es ein schwerer Tag und kein Rückschritt. Der Rad-Speed ist eine grobe Schätzung, bis mehr Fahrten mit dem Rennrad da sind.</div></div></div>

      <div class="sec"><div class="sec-h"><h2>Krankheitsphasen</h2></div><div class="panel">
        <div class="hint">In diesen Zeiträumen zählen geplante Einheiten nicht als verpasst. Leeres Ende heißt: läuft noch.</div>
        ${STATE.illnessPeriods.length ? STATE.illnessPeriods.map(p => `<div class="fgrid" data-ill="${esc(p.id)}" style="padding-top:10px;border-top:1px solid var(--line)">
          <div class="fld"><label>Von</label><input class="inp" type="date" data-illf="start" value="${p.start || ''}"></div>
          <div class="fld"><label>Bis</label><input class="inp" type="date" data-illf="end" value="${p.end || ''}"></div>
          <div class="fld" style="grid-column: span 2"><label>Notiz</label><input class="inp" type="text" data-illf="note" value="${esc(p.note || '')}"></div>
          <div class="fld" style="justify-content:flex-end"><button class="btn danger small" data-act="ill-del">Löschen</button></div></div>`).join('') : '<div class="empty">Keine Einträge.</div>'}
        <button class="btn ghost small" data-act="ill-add">+ Phase hinzufügen</button></div></div>

      ${BUILD === 'pwa' && typeof window.syncSection === 'function' ? window.syncSection() : ''}
      ${BUILD === 'pwa' ? planUpdateSection() : ''}
      <div class="sec"><div class="sec-h"><h2>Backup</h2>${STATE.lastBackupAt ? `<span class="aside">zuletzt ${fmtDate(STATE.lastBackupAt.slice(0, 10))}</span>` : ''}</div><div class="panel">
        <div class="hint">${syncOn() ? 'Der Server sichert deine Daten jeden Tag automatisch (siehe Sync). Ein Datei-Backup ist zusätzlich möglich.' : `Deine Daten liegen nur auf diesem Gerät. ${BUILD === 'pwa' ? 'Sichere sie einmal pro Woche als Datei, z. B. in iCloud Drive. Dann bist du sicher, auch wenn das Handy kaputtgeht.' : 'Kopiere das Backup regelmäßig, z. B. in eine Notiz.'}`}</div>
        <div class="row">${BUILD === 'pwa' ? '<button class="btn small" data-act="backup-file">Als Datei sichern</button>' : ''}<button class="btn ${BUILD === 'pwa' ? 'ghost ' : ''}small" data-act="backup-copy">Backup kopieren</button></div>
        <textarea class="inp" id="bk-out" rows="3" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea>
        <div class="hr"></div>
        <div class="fld"><label for="bk-in">Backup wiederherstellen</label><textarea class="inp" id="bk-in" rows="3" placeholder="Backup-Text hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea></div>
        <div class="row"><label class="btn ghost small" for="bk-file">Datei wählen</label><input type="file" id="bk-file" accept="application/json,.json,.txt,text/plain" hidden>
        <button class="btn danger small" data-act="backup-load">Einfügen und laden</button></div>
        <div class="hint">Beim Laden werden alle aktuellen Daten durch das Backup ersetzt.</div></div></div>
      ${BUILD === 'pwa' ? appInfoSection() : ''}
      <div class="hint" style="text-align:center;padding-top:8px">Erstellt von deinem Claude Coach.</div>
    </div>`;
    const out = $('#bk-out'); if (out) out.value = backupText();
  }
}

/* ================= Backup reminder / welcome / plan update ================= */
const CAN_SHARE = BUILD === 'pwa' && typeof navigator.share === 'function';
function syncOn() { return typeof window.isSyncOn === 'function' && window.isSyncOn(); }
function backupReminder() {
  if (BUILD !== 'pwa' || syncOn()) return '';
  const last = STATE.lastBackupAt ? STATE.lastBackupAt.slice(0, 10) : null;
  const age = last ? daysBetween(last, todayStr()) : 999;
  if (age < 7) return '';
  return `<div class="sec"><div class="banner info row" style="justify-content:space-between;flex-wrap:nowrap"><span>${last ? `Letztes Backup vor ${age} Tagen.` : 'Noch kein Backup gemacht.'} Sichere deine Daten kurz als Datei.</span><button class="btn small" data-act="backup-file" style="flex-shrink:0">Sichern</button></div></div>`;
}
function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
const SHARE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
const DOTS_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="vertical-align:-3px"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
function installSteps() {
  return `<ol class="howto">
    <li>Unten rechts in Safari auf die <b>drei Punkte</b> ${DOTS_SVG} tippen.</li>
    <li><b>Teilen</b> ${SHARE_SVG} wählen.</li>
    <li>Nach unten scrollen und <b>Zum Home-Bildschirm</b> wählen.</li>
    <li><b>Als Web-App öffnen</b> eingeschaltet lassen, auf <b>Hinzufügen</b> tippen und die App ab jetzt über das neue Icon öffnen.</li></ol>
    <div class="hint">Ältere iOS-Version ohne drei Punkte: Das Teilen-Symbol ${SHARE_SVG} liegt direkt unten in der Leiste.</div>`;
}
function renderWelcome() {
  const needInstall = isIOS() && !isStandalone();
  $('#app').innerHTML = `<div class="welcome">
    <div class="mark" aria-hidden="true"><span>140.6</span><i></i></div>
    <h1 class="view-title" style="margin-top:18px">Ironman Coach<small>Dein Training, deine Werte und dein Essen, als App auf dem Handy.</small></h1>
    ${needInstall ? `<div class="panel" style="border-color:var(--accent)"><div class="sec-h"><h2 style="color:var(--accent)">Schritt 1: App installieren</h2></div>
      <div class="hint">Mach das zuerst. Daten, die du hier in Safari lädst, sieht die installierte App nicht.</div>${installSteps()}</div>` : ''}
    <div class="panel"><div class="sec-h"><h2>${needInstall ? 'Schritt 2: ' : ''}Daten laden</h2></div>
      <div class="hint">Öffne die alte App, tippe auf Einstellungen und dann auf <b>Backup kopieren</b>. Füge den Text hier ein. Oder wähle eine Backup-Datei aus.</div>
      <textarea class="inp" id="bk-in" rows="4" placeholder="Backup-Text hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:12px"></textarea>
      <div class="row"><button class="btn" data-act="welcome-load">Daten laden</button><label class="btn ghost" for="bk-file">Datei wählen</label><input type="file" id="bk-file" accept="application/json,.json,.txt,text/plain" hidden></div>
      <div class="hint">Der Trainingsplan steckt im Backup mit drin. Deine Daten bleiben auf diesem Handy, bis du unter Einstellungen den Sync mit deinem eigenen Server einrichtest.</div></div>
    ${typeof window.syncWelcomePanel === 'function' ? window.syncWelcomePanel() : ''}
  </div>`;
}
function planUpdateSection() {
  return `<div class="sec"><div class="sec-h"><h2>Plan aktualisieren</h2></div><div class="panel">
    <div class="hint">Wenn dein Coach dir im Chat einen neuen Plan-Code gibt (z. B. für Block 2), füge ihn hier ein. Deine Einträge bleiben erhalten.</div>
    <textarea class="inp" id="pl-in" rows="3" placeholder="Plan-Code hier einfügen" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea>
    <button class="btn small" data-act="plan-load">Plan übernehmen</button></div></div>`;
}
function appInfoSection() {
  return `<div class="sec"><div class="sec-h"><h2>App</h2><span class="aside">Version ${esc(window.__APP_VERSION || '')}</span></div><div class="panel">
    ${isStandalone() ? '<div class="hint">Installiert auf dem Home-Bildschirm. Funktioniert auch offline.</div>' : `<div class="hint">So legst du die App auf den Home-Bildschirm:</div>${installSteps()}`}
    <button class="btn ghost small" data-act="app-update">Nach Update suchen</button></div></div>`;
}

/* ================= Rendering ================= */
const VIEWS = { heute: renderHeute, plan: renderPlan, werte: renderWerte, fortschritt: renderFortschritt, essen: renderEssen };
function render() {
  if (!HAS_PLAN) { renderWelcome(); renderHeader(); document.body.classList.add('no-plan'); return; }
  document.body.classList.remove('no-plan');
  if (!VIEWS[UI.view]) UI.view = 'heute';
  for (const k in CHARTS) delete CHARTS[k];
  VIEWS[UI.view]();
  renderHeader();
  document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.go === UI.view; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function go(view, scrollTarget) {
  UI.view = view; saveUi(); render();
  if (scrollTarget) { const el = document.getElementById(scrollTarget); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); return; } }
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function applyTheme(v) {
  if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('theme_pref', v); } catch (e) {}
}

/* ================= Click actions ================= */
document.addEventListener('click', async e => {
  if (chartTap(e)) return;
  const nav = e.target.closest('[data-go]');
  if (nav) { go(nav.dataset.go); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const sEl = b.closest('[data-sid]');
  const cEl = b.closest('[data-cid]');
  const t = todayStr();
  switch (act) {
    case 'sess-toggle': {
      const st = ensureSess(sEl.dataset.sid); st.completed = !st.completed;
      if (st.completed) { st.skipped = false; if (!st.quality) st.quality = 'ok'; }
      saveState(); rerender(); if (st.completed) toast('Erledigt. Stark!'); break;
    }
    case 'sess-skip': {
      const st = ensureSess(sEl.dataset.sid); st.skipped = !st.skipped;
      if (st.skipped) st.completed = false; else st.skipReason = '';
      saveState(); rerender(); break;
    }
    case 'sess-quality': { const st = ensureSess(sEl.dataset.sid); st.quality = b.dataset.q; saveState(); rerender(); break; }
    case 'cust-quality': {
      const w = (STATE.customWorkouts[cEl.dataset.cdate] || []).find(x => x.id === cEl.dataset.cid); if (w) w.quality = b.dataset.q; saveState(); rerender(); break;
    }
    case 'cust-remove': {
      if (!armed(b, 'Wirklich entfernen?')) return;
      const d = cEl.dataset.cdate; STATE.customWorkouts[d] = (STATE.customWorkouts[d] || []).filter(x => x.id !== cEl.dataset.cid);
      saveState(); rerender(); toast('Einheit entfernt'); break;
    }
    case 'expand': {
      const p = b.previousElementSibling; if (!p) return; p.classList.toggle('clamp'); b.textContent = p.classList.contains('clamp') ? 'Mehr anzeigen' : 'Weniger anzeigen'; break;
    }
    case 'add-open': ADD_OPEN = b.dataset.date; rerender(); { const f = $('#add-title'); if (f) f.focus(); } break;
    case 'add-cancel': ADD_OPEN = null; rerender(); break;
    case 'add-save': {
      const date = b.dataset.date;
      const entry = { id: 'custom-' + date + '-' + Date.now(), sport: $('#add-sport').value, title: $('#add-title').value.trim() || 'Zusätzliche Einheit',
        description: $('#add-desc').value.trim(), plannedMinutes: parseNum($('#add-min').value), plannedKm: parseNum($('#add-km').value), quality: 'ok' };
      (STATE.customWorkouts[date] = STATE.customWorkouts[date] || []).push(entry);
      ADD_OPEN = null; saveState(); rerender(); toast('Einheit hinzugefügt'); break;
    }
    case 'day-toggle': {
      const card = b.closest('.day'); const open = !card.classList.contains('open');
      card.classList.toggle('open', open); b.setAttribute('aria-expanded', open); STATE.openDays[card.dataset.date] = open; saveSoon(); break;
    }
    case 'strip-jump': {
      const d = b.dataset.date; const card = document.getElementById('day-' + d); if (!card) return;
      card.classList.add('open'); STATE.openDays[d] = true; saveSoon();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => window.scrollBy({ top: -76, behavior: 'smooth' }), 350); break;
    }
    case 'go-plan-day': {
      const d = b.dataset.date; const day = findDay(d); if (day) PLAN_WEEK = day.weekIdx; STATE.openDays[d] = true; go('plan', 'day-' + d); break;
    }
    case 'missed-all': SHOW_ALL_MISSED = !SHOW_ALL_MISSED; rerender(); break;
    case 'missed-skip-all': {
      if (!armed(b, 'Alle markieren? Nochmal tippen')) return;
      const list = forgottenSessions(); list.forEach(s => { const st = ensureSess(s.id); st.skipped = true; st.completed = false; });
      saveState(); rerender(); toast(`${list.length} Einheiten als ausgefallen markiert`); break;
    }
    case 'week': PLAN_WEEK = parseInt(b.dataset.i); ADD_OPEN = null; rerender(); break;
    case 'score': STATE.scoreAdjust[b.dataset.sport] = (STATE.scoreAdjust[b.dataset.sport] || 0) + parseInt(b.dataset.dir); saveState(); rerender(); break;
    case 'perf': UI.perfSport = b.dataset.sport; saveUi(); rerender(); break;
    case 'vol': UI.volMode = b.dataset.mode; saveUi(); rerender(); break;
    case 'checkin-save': {
      const pre = b.dataset.prefix; const date = pre === 'h' ? t : ($('#w-date').value || t);
      const f = {}; CHECKIN_GROUPS.forEach(g => g.keys.forEach(([k]) => { const el = document.getElementById(pre + '-' + k); if (el) f[k] = parseNum(el.value); }));
      const il = document.getElementById(pre + '-illness'); f.illness = il && il.value.trim() ? il.value.trim() : null;
      upsertTrendPoint(date, f); saveState(); rerender(); toast(`Werte für ${fmtDate(date)} gespeichert`); break;
    }
    case 'ill-start': {
      STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: t, end: null, note: '' }); saveState(); rerender(); toast('Krankheitsphase gestartet. Gute Besserung!'); break;
    }
    case 'ill-end': {
      const ill = activeIllness(); if (!ill) return;
      let end = $('#ill-end').value || addDays(t, -1); if (end < ill.start) end = ill.start; if (end > t) end = t;
      ill.end = end; saveState(); rerender(); toast('Pause beendet. Jetzt langsam wieder einsteigen.'); break;
    }
    case 'ill-reopen': { const r = returnPhase(t); if (r) { r.period.end = null; saveState(); rerender(); toast('Krankheitsphase läuft wieder'); } break; }
    case 'ill-add': STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: t, end: t, note: '' }); saveState(); renderSheet(); render(); break;
    case 'ill-del': {
      if (!armed(b, 'Wirklich löschen?')) return;
      const id = b.closest('[data-ill]').dataset.ill; STATE.illnessPeriods = STATE.illnessPeriods.filter(p => p.id !== id); saveState(); renderSheet(); render(); break;
    }
    case 'ms-add': {
      const text = $('#ms-text').value.trim(); if (!text) { toast('Schreib kurz, was du geschafft hast.'); $('#ms-text').focus(); return; }
      STATE.milestones.push({ id: 'ms-' + Date.now(), date: $('#ms-date').value || t, text }); saveState(); rerender(); toast('Meilenstein gespeichert'); break;
    }
    case 'ms-del': {
      if (!armed(b, 'Löschen?')) return;
      const id = b.closest('[data-mid]').dataset.mid; STATE.milestones = STATE.milestones.filter(m => m.id !== id); saveState(); rerender(); break;
    }
    case 'go-essen': NUT_DATE = t; go('essen'); break;
    case 'nut-save': {
      const date = NUT_DATE || t; const prev = STATE.nutrition[date] || {};
      const v = id => { const n = parseNum($('#nut-' + id).value); return n == null || n < 0 ? null : n; };
      STATE.nutrition[date] = { ...prev, kcal: v('kcal'), carbs: v('carbs'), protein: v('protein'), fat: v('fat'), weight: v('weight'), typeOverride: prev.typeOverride || null };
      saveState(); rerender(); toast('Ernährung gespeichert'); break;
    }
    case 'nut-add': {
      const m = MEALS[b.dataset.cat][parseInt(b.dataset.i)]; const date = NUT_DATE || t;
      const e0 = STATE.nutrition[date] = STATE.nutrition[date] || {};
      e0.kcal = (e0.kcal || 0) + m.k; e0.carbs = (e0.carbs || 0) + m.c; e0.protein = (e0.protein || 0) + m.pr; e0.fat = (e0.fat || 0) + m.f;
      saveState(); rerender(); toast(`${m.n}: +${m.k} kcal`); break;
    }
    case 'nut-settings': {
      const val = (id, lo, hi) => { const n = parseNum($(id).value); return n != null && n >= lo && n <= hi ? n : null; };
      const pr = STATE.nutritionProfile; const a = val('#np-age', 10, 60), h = val('#np-h', 120, 220), w = val('#np-w', 30, 150), p = val('#np-pal', 1.2, 2.0);
      if (a != null) pr.age = a; if (h != null) pr.heightCm = h; if (w != null) pr.weightKg = w; if (p != null) pr.pal = p;
      saveState(); rerender(); toast('Einstellungen gespeichert'); break;
    }
    case 'export-open': openSheet('export', b.dataset.date || t); break;
    case 'export-copy': {
      const ta = $('#ex-text');
      try { await navigator.clipboard.writeText(ta.value); toast('Kopiert. Jetzt im Chat einfügen.'); }
      catch (err) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Kopiert. Jetzt im Chat einfügen.'); } catch (e2) { toast('Text ist markiert. Bitte manuell kopieren.'); } }
      break;
    }
    case 'settings-open': openSheet('settings'); if (typeof window.syncOnSettingsOpen === 'function') window.syncOnSettingsOpen(); break;
    case 'sheet-close': closeSheet(); break;
    case 'theme': applyTheme(b.dataset.v); renderSheet(); rerender(); break;
    case 'save-ready': {
      const R = STATE.settings.readiness; const a = parseNum($('#r-rhr').value), h = parseNum($('#r-hrv').value), tm = parseNum($('#r-temp').value);
      if (a != null) R.rhrMax = a; if (h != null) R.hrvMin = h; if (tm != null) R.tempMax = tm; saveState(); render(); toast('Grenzwerte gespeichert'); break;
    }
    case 'save-zones': {
      const S = STATE.settings; const lr = parseNum($('#z-lr').value), lb = parseNum($('#z-lb').value), tp = paceToSec($('#z-tp').value), ts = parseNum($('#z-ts').value);
      if (lr) S.lthrRun = lr; if (lb) S.lthrBike = lb; if (tp) S.thresholdPaceRunSec = tp; if (ts) S.thresholdSpeedBikeKmh = ts;
      saveState(); renderSheet(); render(); toast('Zonen gespeichert'); break;
    }
    case 'backup-copy': {
      const ta = $('#bk-out'); ta.value = backupText();
      try { await navigator.clipboard.writeText(ta.value); markBackedUp(); toast('Backup kopiert'); }
      catch (err) { ta.focus(); ta.select(); toast('Backup ist markiert. Bitte manuell kopieren.'); }
      break;
    }
    case 'backup-load': {
      const raw = $('#bk-in').value.trim(); if (!raw) { toast('Füge zuerst einen Backup-Text ein oder wähle eine Datei.'); return; }
      let data; try { data = parseBackupText(raw); } catch (err) { toast('Das ist kein gültiges Backup. Prüfe, ob der ganze Text kopiert wurde.'); return; }
      if (!armed(b, 'Alles ersetzen? Nochmal tippen')) return;
      if (!isBackup(data)) { toast('Das sieht nicht wie ein Backup aus.'); return; }
      if (applyBackup(data)) return;
      closeSheet(); render(); toast('Backup geladen'); break;
    }
    case 'welcome-load': {
      const raw = $('#bk-in').value.trim(); if (!raw) { toast('Füge zuerst den Backup-Text ein oder wähle eine Datei.'); return; }
      let data; try { data = parseBackupText(raw); } catch (err) { toast('Das ist kein gültiges Backup. Prüfe, ob der ganze Text kopiert wurde.'); return; }
      if (!isBackup(data)) { toast('Das sieht nicht wie ein Backup aus.'); return; }
      if (!isPlan(data.plan)) { toast('In diesem Backup fehlt der Trainingsplan. Kopiere es nochmal aus der aktuellen Version der alten App.'); return; }
      applyBackup(data); break;
    }
    case 'plan-load': {
      const raw = $('#pl-in').value.trim(); if (!raw) { toast('Füge zuerst den Plan-Code ein.'); return; }
      let obj; try { obj = parseBackupText(raw); } catch (err) { toast('Der Plan-Code ist unvollständig. Kopiere ihn nochmal ganz.'); return; }
      const upd = obj.plan && !obj.weeks ? obj.plan : obj;
      if (!isPlan(upd)) { toast('Das ist kein Plan-Code.'); return; }
      const next = mergePlan(PLAN, upd);
      try { localStorage.setItem(PLAN_KEY, JSON.stringify(next)); } catch (err) { toast('Speichern nicht möglich.'); return; }
      toast('Plan übernommen'); setTimeout(() => location.reload(), 600); break;
    }
    case 'backup-file': await shareBackupFile(); break;
    case 'export-share': {
      try { await navigator.share({ text: $('#ex-text').value }); } catch (err) { if (err && err.name !== 'AbortError') toast('Teilen nicht möglich. Nutze Kopieren.'); }
      break;
    }
    case 'app-update': if (typeof checkForUpdate === 'function') checkForUpdate(true); break;
    case 'reload': location.reload(); break;
  }
});

/* ================= Autosave inputs ================= */
document.addEventListener('input', e => {
  const el = e.target; const f = el.dataset.f;
  if (!f) return;
  if (f === 'weeknote') { STATE.weekNotes[el.dataset.week] = el.value; saveSoon(); return; }
  let o = null;
  const s = el.closest('[data-sid]'); const c = el.closest('[data-cid]');
  if (s) o = ensureSess(s.dataset.sid);
  else if (c) o = (STATE.customWorkouts[c.dataset.cdate] || []).find(w => w.id === c.dataset.cid);
  if (!o) return;
  if (f.startsWith('m.')) { o.metrics = o.metrics || {}; const k = f.slice(2); if (el.value === '') delete o.metrics[k]; else o.metrics[k] = el.value; }
  else o[f] = el.value;
  saveSoon();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'ex-date') { $('#ex-text').value = buildExportText(el.value || todayStr()); return; }
  if (el.id === 'w-date') { WERTE_DATE = el.value || todayStr(); rerender(); return; }
  if (el.id === 'nut-date') { NUT_DATE = el.value || todayStr(); rerender(); return; }
  if (el.id === 'nut-type') {
    const d = NUT_DATE || todayStr(); STATE.nutrition[d] = STATE.nutrition[d] || {}; STATE.nutrition[d].typeOverride = el.value === 'auto' ? null : el.value; saveState(); rerender(); return;
  }
  if (el.dataset.illf) {
    const p = STATE.illnessPeriods.find(x => x.id === el.closest('[data-ill]').dataset.ill); if (!p) return;
    p[el.dataset.illf] = el.value || (el.dataset.illf === 'end' ? null : (el.dataset.illf === 'note' ? '' : p.start));
    if (p.end && p.start && p.end < p.start) p.end = p.start;
    saveState(); render(); return;
  }
  if (el.id === 'bk-file') {
    const file = el.files && el.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => { $('#bk-in').value = String(r.result || ''); toast(HAS_PLAN ? 'Datei gelesen. Jetzt „Einfügen und laden“ tippen.' : 'Datei gelesen. Jetzt „Daten laden“ tippen.'); }; r.readAsText(file); return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SHEET) closeSheet(); });
let lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; rerender(); } }, 250); });

/* ================= Backup file ================= */
async function shareBackupFile() {
  const txt = backupText();
  const name = `ironman-backup-${todayStr()}.json`;
  const tryShare = async type => {
    const f = new File([txt], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Ironman Coach Backup' }); return true; }
    return false;
  };
  try {
    if (await tryShare('application/json') || await tryShare('text/plain')) { markBackedUp(); toast('Backup gesichert'); rerender(); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  try {
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); markBackedUp(); toast('Backup-Datei erstellt'); rerender();
  } catch (err) { toast('Sichern als Datei klappt hier nicht. Nutze „Backup kopieren“.'); }
}

/* ================= Init ================= */
try { const th = localStorage.getItem('theme_pref'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) {}
render();
// Datumswechsel um Mitternacht oder beim Zurückkehren in die App
let renderedDay = todayStr();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && todayStr() !== renderedDay) { renderedDay = todayStr(); WERTE_DATE = null; NUT_DATE = null; rerender(); } });
