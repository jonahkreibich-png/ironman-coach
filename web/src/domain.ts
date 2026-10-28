import {effectiveCustomWorkouts} from './store';
/* Fachlogik der App: Trend, Krankheit, Einheiten-Status, Zonen, Ampel, Scores, Leistungswerte. */
import * as CoachCore from '../../shared/core';
import { STATE, PLAN, SESS } from './store';
import { todayStr, addDays, daysBetween, secToPace, de, parseNum, paceToSec, dowShort, fmtDate } from './util';

/* ================= Trend ================= */
export const TREND_KEYS = ['ctl', 'atl', 'tsb', 'vo2max', 'cardioRecovery', 'sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
export const RECOVERY_KEYS = ['sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
export function upsertTrendPoint(date, fields) {
  let p = STATE.trend.find(x => x.date === date);
  if (!p) { p = { date }; TREND_KEYS.forEach(k => { p[k] = null; }); STATE.trend.push(p); }
  Object.assign(p, fields);
  STATE.trend.sort((a, b) => a.date.localeCompare(b.date));
  return p;
}
export function trendAt(date) { return STATE.trend.find(p => p.date === date) || null; }
export function latestTrend() { const arr = STATE.trend.filter(p => p.ctl != null || p.atl != null || p.tsb != null); return arr.length ? arr[arr.length - 1] : null; }
export function latestWithKey(key, maxDate?) { const arr = STATE.trend.filter(p => p[key] != null && (!maxDate || p.date <= maxDate)); return arr.length ? arr[arr.length - 1] : null; }
export function hasRecovery(p) { return !!p && RECOVERY_KEYS.some(k => p[k] != null); }
export function rollingAvg(arr, key, idx, win) {
  const slice = arr.slice(Math.max(0, idx - win + 1), idx + 1).filter(p => p[key] != null);
  if (!slice.length) return null;
  return slice.reduce((a, p) => a + p[key], 0) / slice.length;
}
export function baseline(key, beforeDate, days) {
  const from = addDays(beforeDate, -(days || 14));
  const vals = STATE.trend.filter(p => p.date < beforeDate && p.date >= from && p[key] != null && !illnessAt(p.date)).map(p => p[key]);
  if (vals.length < 3) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
export function arrow(key) {
  const arr = STATE.trend.filter(p => p[key] != null);
  if (arr.length < 2) return '';
  const cur = arr[arr.length - 1][key], prev = arr[arr.length - 2][key];
  if (cur > prev) return '<small class="up" aria-label="gestiegen">▲</small>';
  if (cur < prev) return '<small class="down" aria-label="gesunken">▼</small>';
  return '<small class="flat">▬</small>';
}

/* ================= Illness ================= */
export function illnessAt(date) { return STATE.illnessPeriods.find(p => p.start && date >= p.start && (!p.end || date <= p.end)) || null; }
export function activeIllness() { const t = todayStr(); return STATE.illnessPeriods.find(p => p.start && p.start <= t && (!p.end || p.end >= t)) || null; }
export function returnPhase(date) {
  const ended = STATE.illnessPeriods.filter(p => p.end && p.end < date).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!ended) return null;
  const day = daysBetween(ended.end, date); // 1 = erster Tag ohne Symptome
  if (day > 8) return null;
  let stage;
  if (day <= 1) stage = 0; else if (day <= 3) stage = 1; else if (day <= 5) stage = 2; else stage = 3;
  return { period: ended, day, stage };
}
export const RETURN_STAGES = [
  { n: 'Abwarten', d: 'Erster Tag ohne Symptome: noch kein Training, Spaziergang okay.' },
  { n: 'Stufe 1', d: '20-30 min ganz locker (Spaziergang oder Rad), Puls unter 130.' },
  { n: 'Stufe 2', d: 'Lockere Zone-2-Einheit, 30-40 min, Rad oder Lauf.' },
  { n: 'Stufe 3', d: 'Intervalle wieder möglich, wenn Ruhepuls und HFV passen.' }
];

/* ================= Sessions ================= */
export function sessState(id) { return STATE.sessions[id] || {}; }
export function ensureSess(id) { if (!STATE.sessions[id]) STATE.sessions[id] = { completed: false, notes: '' }; return STATE.sessions[id]; }
export function effStatus(s) {
  if (s.sport === 'rest') return 'rest';
  const st = sessState(s.id);
  if (st.completed) return 'done';
  if (s.cancelled) return 'cancelled';
  if (st.skipped) return 'skipped';
  if (illnessAt(s.date)) return 'sick';
  if (s.date < todayStr()) return 'missed';
  return 'open';
}
export function forgottenSessions() { return SESS.filter(s => effStatus(s) === 'missed'); }
export function dayStats(d) {
  const real = d.sessions.filter(s => s.sport !== 'rest' && !(s.cancelled && !sessState(s.id).completed));
  const st = real.map(s => effStatus({ ...s, date: d.date }));
  const done = st.filter(x => x === 'done').length;
  const skipped = st.filter(x => x === 'skipped').length;
  const sick = st.filter(x => x === 'sick').length;
  const missed = st.filter(x => x === 'missed').length;
  const custom = (effectiveCustomWorkouts()[d.date] || []).length;
  return { total: real.length, done, skipped, sick, missed, custom, open: real.length - done - skipped - sick - missed };
}

/* ================= Zones ================= */
export function computeZones(lthr) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, lowBpm: Math.round(lthr * z.low / 100), highBpm: z.high >= 999 ? null : Math.round(lthr * z.high / 100) }));
}
export function computePaceZones(thresholdSec) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, fastSec: z.high >= 999 ? thresholdSec * 100 / 140 : thresholdSec * 100 / z.high, slowSec: z.low <= 0 ? null : thresholdSec * 100 / z.low }));
}
export function computeSpeedZones(kmh) {
  return (PLAN.zonePercents || []).map(z => ({ zone: z.zone, label: z.label, lowKmh: Math.round(kmh * z.low / 100 * 10) / 10, highKmh: z.high >= 999 ? null : Math.round(kmh * z.high / 100 * 10) / 10 }));
}
export function zoneRangeText(sport, zoneStr) {
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
/* Tagesampel mit persönlichen Normalbereichen (CoachCore, core.js). Krankheit und Wiedereinstieg haben Vorrang. */
export function computeReadiness() {
  const t = todayStr();
  const ill = activeIllness();
  const ret = returnPhase(t);
  const r = CoachCore.readinessFor(STATE.trend, STATE.illnessPeriods, t, STATE.settings.readiness);
  const { crits, reasons, stale, personal, score } = r;
  const p = r.point;
  const lt = latestTrend();
  const level = r.level === 3 ? 0 : r.level;
  const history = CoachCore.readinessHistory(STATE.trend, STATE.illnessPeriods, t, 14, STATE.settings.readiness);

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
    title = 'Ruhe'; sub = 'Heute Ruhetag oder höchstens 20-30 min ganz locker.';
  }
  return { level: kind, title, sub, crits, reasons, stale, point: p, ill, ret, score, personal, history };
}
export function readinessHistoryHtml(hist) {
  if (!hist || !hist.some(h => h.level != null)) return '';
  const col = l => l === 0 ? 'var(--good)' : l === 1 ? 'var(--warn)' : l === 2 ? 'var(--bad)' : 'var(--line)';
  return `<div class="rhist" role="img" aria-label="Ampel der letzten 14 Tage">${hist.map(h =>
    `<i title="${dowShort(h.date)} ${fmtDate(h.date)}${h.score != null ? ': ' + h.score : ''}" style="height:${h.score != null ? Math.max(12, h.score) : 12}%;background:${h.ill ? 'var(--rest)' : col(h.level)}${h.level == null ? ';opacity:.5' : ''}"></i>`).join('')}</div>
    <div class="rhist-l"><span>vor 14 Tagen</span><span>heute</span></div>`;
}

/* ================= Scores ================= */
export const QUALITY_DELTA = { good: 3, ok: 0.3, bad: -2 };
export function computeScore(sport) {
  const cal = PLAN.meta.scoreCalibration;
  const base = cal ? cal.scores[sport] : (PLAN.meta.baseScores[sport] || 20);
  const calDate = cal ? cal.date : '0000-00-00';
  let delta = 0;
  SESS.filter(s => s.sport === sport && s.date > calDate).forEach(s => {
    const status = effStatus(s); const st = sessState(s.id);
    if (status === 'done') delta += QUALITY_DELTA[st.quality || 'ok'];
    else if (status === 'missed') delta -= 1.2;
  });
  Object.entries(effectiveCustomWorkouts() || {}).forEach(([date, list]) => {
    if (date <= calDate) return;
    list.forEach(w => { if (w.sport === sport) delta += QUALITY_DELTA[w.quality || 'ok']; });
  });
  delta += (STATE.scoreAdjust[sport] || 0);
  return Math.max(1, Math.min(100, Math.round(base + delta)));
}
export function tierLabel(s) { if (s < 25) return 'Anfänger'; if (s < 45) return 'Aufbauend'; if (s < 65) return 'Solide'; if (s < 85) return 'Stark'; return 'Elite'; }

/* ================= Performance metrics ================= */
export const METRIC_FIELDS = {
  run: [['km', 'km'], ['min', 'Minuten'], ['hr', 'Ø Puls'], ['pace', 'Pace /km', '6:24']],
  bike: [['km', 'km'], ['min', 'Minuten'], ['hr', 'Ø Puls'], ['speed', 'Ø km/h']],
  swim: [['meters', 'Meter'], ['min', 'Minuten'], ['pace100', 'Pace /100 m', '2:35'], ['spl', 'Züge/Bahn'], ['rate', 'Züge/min'], ['dps', 'm pro Zug']],
  strength: [['min', 'Minuten']],
  football: [['min', 'Minuten'], ['hr', 'Ø Puls']]
};
export function normMetrics(m, date, sport, title) {
  const o: any = { date, sport, title };
  ['km', 'min', 'hr', 'speed', 'meters', 'spl', 'rate', 'dps'].forEach(k => { o[k] = parseNum(m[k]); });
  o.pace = paceToSec(m.pace); o.pace100 = paceToSec(m.pace100);
  if (o.pace == null && o.km && o.min) o.pace = o.min * 60 / o.km;
  if (o.speed == null && o.km && o.min) o.speed = o.km / (o.min / 60);
  if (sport === 'swim' && o.pace100 == null && o.meters && o.min) o.pace100 = o.min * 60 / (o.meters / 100);
  return o;
}
export function hasMetrics(m) { return m && Object.values(m).some(v => v != null && v !== ''); }
export function perfEntries(sport) {
  const map: any = {};
  (PLAN.seedMetrics || []).filter(m => m.sport === sport).forEach(m => { map[m.date] = { ...m, seed: true }; });
  SESS.forEach(s => {
    if (s.sport !== sport) return;
    const st = STATE.sessions[s.id];
    if (st && st.completed && hasMetrics(st.metrics)) map[s.date] = normMetrics(st.metrics, s.date, sport, s.title);
  });
  Object.entries(effectiveCustomWorkouts() || {}).forEach(([d, list]) => list.forEach(w => {
    if (w.sport === sport && hasMetrics(w.metrics)) map[d] = normMetrics(w.metrics, d, sport, w.title);
  }));
  const out = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  out.forEach(e => {
    if (sport === 'run' && e.pace && e.hr) e.eff = (60000 / e.pace) / e.hr;
    if (sport === 'bike' && e.speed && e.hr) e.eff = (e.speed * 1000 / 60) / e.hr;
  });
  return out;
}
export function metricsSummary(sport, m) {
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
