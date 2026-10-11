/* Gemeinsame Coach-Logik für App und Server (keine Abhängigkeiten, keine DOM-Zugriffe). */
// Bewusst locker typisiert: Datensätze kommen aus Sync und Backups und sind nicht immer vollständig.
import { GENERIC_LTHR } from './profile';
import * as W from './workouts';
/* ---------- Datum ---------- */
function addDays(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function illnessAt(periods, date) { return (periods || []).find(p => p && p.start && date >= p.start && (!p.end || date <= p.end)) || null; }
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const fmt = (v, d?) => { const s = d != null ? Number(v).toFixed(d) : String(Math.round(v * 10) / 10); return s.replace('.', ','); };
const sign = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);

/* ---------- Phase 3: Tagesampel ---------- */
const BASE_DAYS = 28;      // gleitende Grundlage
const MIN_DAYS = 7;        // darunter gelten feste Rückfall-Grenzwerte
const DEFAULT_SLEEP_NEED = [7.5, 9];

function stats(vals) {
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (vals.length - 1)) : 0;
  return { mean, sd, n: vals.length };
}
/* Persönlicher Normalbereich aus den 28 Tagen vor `date`, Krankheitstage ausgeschlossen. */
function baselineOf(trend, illness, date, key, transform?) {
  const from = addDays(date, -BASE_DAYS);
  const vals = [];
  (trend || []).forEach(p => {
    if (!p || p.date >= date || p.date < from || illnessAt(illness, p.date)) return;
    const v = num(p[key]); if (v == null || (key === 'hrv' && v <= 0)) return;
    vals.push(transform ? transform(v) : v);
  });
  return stats(vals);
}

/* Morgenwerte für einen Tag: heute, sonst bis zu 2 Tage alt (dann "stale"). */
const RECOVERY_KEYS = ['sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
function hasRecovery(p) { return !!p && RECOVERY_KEYS.some(k => p[k] != null); }
function pointFor(trend, date) {
  const byDate = {}; (trend || []).forEach(p => { if (p) byDate[p.date] = p; });
  if (hasRecovery(byDate[date])) return { p: byDate[date], stale: false };
  for (let i = 1; i <= 2; i++) { const q = byDate[addDays(date, -i)]; if (hasRecovery(q)) return { p: q, stale: true }; }
  return { p: null, stale: false };
}
function latestLoad(trend, date) {
  const arr = (trend || []).filter(p => p && p.date <= date && num(p.ctl) != null && num(p.atl) != null && p.ctl > 0);
  return arr.length ? arr[arr.length - 1] : null;
}

/**
 * Bewertet einen Tag. Liefert Stufe (0 grün, 1 gelb, 2 rot, 3 keine Werte), Score 0-100,
 * 1-3 Gründe in einfachen Worten und die einzelnen Kriterien.
 * fallback: { rhrMax, hrvMin, tempMax } aus den eigenen Einstellungen. Fehlen sie, gibt es in den ersten 7 Tagen
 * keine feste Grenze: die App lernt den persönlichen Normalbereich und bewertet HFV und Ruhepuls erst danach.
 */
function readinessFor(trend, illness, date, fallback) {
  fallback = fallback || {};
  const { p, stale } = pointFor(trend, date);
  const crits = [], reasons = [];
  let level = 0, score = 100;
  const bump = (l, why, weight) => { if (l > level) level = l; if (why) reasons.push({ l, why, w: weight || l }); };
  let personal = false;

  if (p) {
    // HFV: ln(HFV), 3-Tage-Schnitt gegen Ausreißer, z-Wert gegen den persönlichen Normalbereich
    if (num(p.hrv) != null && p.hrv > 0) {
      const base = baselineOf(trend, illness, p.date, 'hrv', Math.log);
      if (base && base.n >= MIN_DAYS && base.sd > 0) {
        personal = true;
        const recent = (trend || []).filter(q => q && q.date <= p.date && q.date > addDays(p.date, -3) && num(q.hrv) > 0 && !illnessAt(illness, q.date)).map(q => Math.log(q.hrv));
        const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : Math.log(p.hrv);
        const z = (avg - base.mean) / base.sd;
        const st = z < -1.5 ? 'bad' : z < -1 ? 'warn' : 'ok';
        crits.push({ k: 'HFV', v: fmt(p.hrv, 0) + ' ms', t: `normal ${fmt(Math.exp(base.mean), 0)} · z ${sign(z, 1)}`, st });
        score -= Math.max(0, -z) * 15;
        if (st === 'bad') bump(2, 'HFV deutlich unter deinem Normalbereich', 3);
        else if (st === 'warn') bump(1, 'HFV etwas unter deinem Normalbereich', 2);
      } else if (num(fallback.hrvMin) == null) {
        crits.push({ k: 'HFV', v: fmt(p.hrv, 0) + ' ms', t: `Normalbereich wird gelernt (${base ? base.n : 0}/${MIN_DAYS} Tage)`, st: 'ok' });
      } else {
        const st = p.hrv >= fallback.hrvMin ? 'ok' : (p.hrv >= fallback.hrvMin - 7 ? 'warn' : 'bad');
        crits.push({ k: 'HFV', v: fmt(p.hrv, 0) + ' ms', t: `Ziel ≥${fallback.hrvMin}`, st });
        if (st !== 'ok') score -= st === 'bad' ? 25 : 12;
        if (st === 'warn') bump(1, 'HFV etwas niedrig', 2); if (st === 'bad') bump(2, 'HFV deutlich niedrig', 3);
      }
    }
    // Ruhepuls: heute minus Normalwert
    if (num(p.restingHR) != null && p.restingHR > 0) {
      const base = baselineOf(trend, illness, p.date, 'restingHR');
      if (base && base.n >= MIN_DAYS) {
        personal = true;
        const d = p.restingHR - base.mean;
        const st = d >= 5 ? 'bad' : d >= 3 ? 'warn' : 'ok';
        crits.push({ k: 'Ruhepuls', v: fmt(p.restingHR, 0), t: `normal ${fmt(base.mean, 0)} · ${sign(d, 0)}`, st });
        score -= Math.max(0, d) * 4;
        if (st === 'bad') bump(2, `Ruhepuls ${fmt(d, 0)} Schläge über normal`, 3);
        else if (st === 'warn') bump(1, `Ruhepuls ${fmt(d, 0)} Schläge über normal`, 2);
      } else if (num(fallback.rhrMax) == null) {
        crits.push({ k: 'Ruhepuls', v: fmt(p.restingHR, 0), t: `Normalbereich wird gelernt (${base ? base.n : 0}/${MIN_DAYS} Tage)`, st: 'ok' });
      } else {
        const st = p.restingHR <= fallback.rhrMax ? 'ok' : (p.restingHR <= fallback.rhrMax + 2 ? 'warn' : 'bad');
        crits.push({ k: 'Ruhepuls', v: fmt(p.restingHR, 0), t: `Ziel ≤${fallback.rhrMax}`, st });
        if (st !== 'ok') score -= st === 'bad' ? 20 : 10;
        if (st === 'warn') bump(1, 'Ruhepuls leicht erhöht', 2); if (st === 'bad') bump(2, 'Ruhepuls deutlich erhöht', 3);
      }
    }
    // Temperatur-Abweichung
    if (num(p.bodyTemp) != null) {
      const v = p.bodyTemp;
      const st = v >= 0.5 ? 'bad' : v >= 0.3 ? 'warn' : 'ok';
      crits.push({ k: 'Temp.', v: sign(v, 1) + ' °C', t: 'Grenze +0,3', st });
      score -= Math.max(0, v) * 40;
      if (st === 'bad') bump(2, 'Temperatur erhöht. Wirst du krank?', 4);
      else if (st === 'warn') bump(1, 'Temperatur leicht erhöht', 2);
    }
    // Schlaf: Bedarf aus dem Profil (Jugendliche brauchen mehr)
      const SLEEP_NEED = (fallback.sleepNeed && fallback.sleepNeed.length === 2) ? fallback.sleepNeed : DEFAULT_SLEEP_NEED;
      const needTxt = fmt(SLEEP_NEED[0]) + '-' + fmt(SLEEP_NEED[1]) + ' h';
    if (num(p.sleepHours) != null || num(p.sleepQuality) != null) {
      const h = num(p.sleepHours), q = num(p.sleepQuality);
      const short = h != null && h < 7, poor = q != null && q < 5;
      const st = (short || poor) ? 'warn' : ((h != null && h < SLEEP_NEED[0]) ? 'mid' : 'ok');
      crits.push({ k: 'Schlaf', v: h != null ? fmt(h, 1) + ' h' : fmt(q, 0) + '/10', t: (h != null && q != null ? 'Qualität ' + fmt(q, 0) + ' · ' : '') + 'Bedarf ' + needTxt, st: st === 'mid' ? 'ok' : st });
      if (h != null && h < SLEEP_NEED[0]) score -= (SLEEP_NEED[0] - h) * 8;
      if (q != null && q < 7) score -= (7 - q) * 3;
      if (short) bump(1, `Nur ${fmt(h, 1)} h geschlafen (du brauchst ${needTxt})`, 2);
      else if (poor) bump(1, 'Schlecht geschlafen', 1);
    }
  }
  // Belastung: ATL/CTL
  const L = latestLoad(trend, date);
  if (L && !illnessAt(illness, date)) {
    const r = L.atl / L.ctl;
    const st = r > 1.5 ? 'warn' : 'ok';
    crits.push({ k: 'Belastung', v: fmt(r, 2), t: 'ATL/CTL · gut 0,8-1,3', st });
    if (r > 1.3) score -= (r - 1.3) * 50;
    if (st === 'warn') bump(1, 'Belastung zuletzt sehr hoch (ATL/CTL über 1,5)', 2);
  }

  if (!p && !L) level = 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (level === 2) score = Math.min(score, 40); else if (level === 1) score = Math.min(score, 70); else if (level === 0) score = Math.max(score, 71);
  reasons.sort((a, b) => b.l - a.l || b.w - a.w);
  return { level, score: level === 3 ? null : score, reasons: reasons.slice(0, 3).map(r => r.why), crits, personal, point: p, stale };
}

/* Verlauf der letzten n Tage (nur Tage mit Morgenwerten). */
function readinessHistory(trend, illness, date, n, fallback) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    const own = (trend || []).find(p => p && p.date === d);
    if (!hasRecovery(own)) { out.push({ date: d, level: null, score: null, ill: !!illnessAt(illness, d) }); continue; }
    const r = readinessFor(trend, illness, d, fallback);
    out.push({ date: d, level: r.level, score: r.score, ill: !!illnessAt(illness, d) });
  }
  return out;
}

/* ================= Phase 4: Belastung ================= */
/* Schwellenpuls aus Profil oder Einstellungen, sonst eine allgemeine Formel (keine Werte einer Person) */
const LTHR_DEFAULT = GENERIC_LTHR;
function thrOf(state) { return (state && state.profile && state.profile.thresholds) || (state && state.settings) || {}; }
const toNum = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const clone = o => JSON.parse(JSON.stringify(o));
const HARD_RE = /sweet|schwelle|intervall|vo2|zone\s*[45]|\bz[45]\b|tempo|\d\s*[×x]\s*\d/i;
function isGame(s) { return !!s && s.sport === 'football' && /spiel|match/i.test(s.title || ''); }
const EASED_RE = /^(Zone 2|Locker) statt/;
function isIntervals(s) { return !!s && ['run', 'bike', 'swim'].includes(s.sport) && !EASED_RE.test(s.title || '') && HARD_RE.test((s.title || '') + ' ' + (s.zone || '')); }
function isLong(s) {
  if (!s || EASED_RE.test(s.title || '')) return false;
  const m = s.plannedMinutes || 0;
  return (s.sport === 'run' && (m >= 75 || /lang/i.test(s.title || ''))) || (s.sport === 'bike' && (m >= 120 || /lang/i.test(s.title || '')));
}
function isKey(s) { return isIntervals(s) || isLong(s); }
function isHard(s) { return isKey(s) || isGame(s); }
function isTestOrRace(s) { return /test|wettkampf|rennen|race|triathlon/i.test((s && s.title) || ''); }
function defaultMinutes(s) { if (s.plannedMinutes) return s.plannedMinutes; if (s.sport === 'football') return isGame(s) ? 60 : 90; return 0; }

/* Belastung einer erledigten Einheit (TSS-ähnlich).
   intervals-Last > hrTSS mit Puls > RPE-Schätzung. Schwimmen und Kraft immer über RPE. */
function sessionLoad(s, st, thr?) {
  st = st || {}; const m = st.metrics || {};
  if (toNum(st.icuLoad) != null) return Math.round(toNum(st.icuLoad));
  const min = toNum(m.min) != null ? toNum(m.min) : defaultMinutes(s);
  if (!min) return 0;
  const h = min / 60, hr = toNum(m.hr);
  if (hr && hr > 60 && s.sport !== 'swim' && s.sport !== 'strength') {
    const lthr = s.sport === 'bike' ? ((thr && thr.lthrBike) || LTHR_DEFAULT.bike) : ((thr && thr.lthrRun) || LTHR_DEFAULT.run);
    return Math.round(h * Math.pow(hr / lthr, 2) * 100);
  }
  const rpe = toNum(st.rpe);
  // Ohne RPE: Fußball 6 (Spiel 7), sonst dieselbe Schätzung wie für die geplante Einheit
  const IF = rpe != null ? Math.min(rpe / 9, 1.05) : plannedIF(s);
  return Math.round(h * IF * IF * 100);
}
function plannedIF(s) {
  if (s.sport === 'football') return isGame(s) ? 7 / 9 : 6 / 9;
  if (s.sport === 'strength') return 5 / 9;
  if (isIntervals(s)) return 0.85;
  const z = Math.max(0, ...[...String(s.zone || '').matchAll(/\d/g)].map(x => +x[0]));
  return ({ 1: 0.6, 2: 0.7, 3: 0.82, 4: 0.92, 5: 1 })[z] || 0.68;
}
/* Geschätzte Belastung einer geplanten Einheit (für die Umsetzungsquote). */
function plannedLoad(s) {
  if (!s || s.sport === 'rest' || s.cancelled) return 0;
  const min = defaultMinutes(s); if (!min) return 0;
  const IF = plannedIF(s);
  return Math.round(min / 60 * IF * IF * 100);
}

/* ---------- Effektiver Plan: Coach-Plan + Anpassungen ---------- */
const ADJ_FIELDS = ['title', 'plannedMinutes', 'plannedKm', 'zone', 'description'];
function activeAdjustments(adjustments) {
  return Object.values(adjustments || {}).filter(a => a && !a.undone && a.type !== 'note').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
}
function applyAdjustments(weeks, adjustments) {
  const out = clone(weeks || []);
  const dayByDate = {}; const where = {};
  out.forEach(w => (w.days || []).forEach(d => { dayByDate[d.date] = d; (d.sessions || []).forEach(s => { where[s.id] = d; }); }));
  for (const a of activeAdjustments(adjustments)) {
    // Neue Einheit (vom Nutzer hinzugefügt)
    if (a.type === 'add') {
      const to = dayByDate[a.to]; if (!to || !a.session || where[a.session.id]) continue;
      to.sessions = to.sessions.filter(x => x.sport !== 'rest');
      to.sessions.push(Object.assign({}, a.session, { _adj: [a.id], added: true })); where[a.session.id] = to; continue;
    }
    const d = where[a.sessionId]; if (!d) continue;
    const s = d.sessions.find(x => x.id === a.sessionId); if (!s) continue;
    if (!s._orig) { s._orig = {}; ADJ_FIELDS.forEach(k => { s._orig[k] = s[k] == null ? null : s[k]; }); s._orig.date = d.date; }
    s._adj = (s._adj || []).concat(a.id);
    if (a.type === 'modify') Object.assign(s, a.set || {});
    else if (a.type === 'cancel') { s.cancelled = true; s.cancelReason = a.reason; if (a.removed) s.removed = true; }
    else if (a.type === 'move') {
      const to = dayByDate[a.to]; if (!to || to === d) continue;
      d.sessions = d.sessions.filter(x => x !== s);
      (d.moved = d.moved || []).push({ id: s.id, title: s.title, sport: s.sport, to: a.to });
      s.movedFrom = d.date; to.sessions = to.sessions.filter(x => x.sport !== 'rest'); to.sessions.push(s); where[s.id] = to;
    }
  }
  return out;
}
/* Vom Nutzer als „fest“ markiert: die Engine ändert diese Einheit nicht mehr (Auftrag 4 C5) */
function isLocked(weeks, id) { const s = planDays(weeks).flatMap(d => d.sessions).find(x => x.id === id); return !!(s && s.locked); }
function planDays(weeks) { const out = []; (weeks || []).forEach((w, wi) => (w.days || []).forEach(d => out.push(Object.assign({}, d, { weekIdx: wi })))); return out; }

/* ---------- Tagesbelastung und eigene CTL/ATL ---------- */
function dailyLoads(state, weeks) {
  const loads = {};
  const add = (d, v) => { if (v > 0) loads[d] = (loads[d] || 0) + v; };
  planDays(weeks).forEach(d => d.sessions.forEach(s => {
    const st = (state.sessions || {})[s.id];
    if (st && st.completed && s.sport !== 'rest') add(d.date, sessionLoad(s, st, thrOf(state)));
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, list]) => (list || []).forEach(w => {
    add(d, sessionLoad({ sport: w.sport, title: w.title, plannedMinutes: w.plannedMinutes }, w, thrOf(state)));
  }));
  return loads;
}
function ownLoadSeries(state, weeks, upto) {
  const loads = dailyLoads(state, weeks);
  const dates = Object.keys(loads).sort();
  const trend = (state.trend || []).filter(p => p && num(p.ctl) != null).sort((a, b) => a.date.localeCompare(b.date));
  let start = dates[0] || null;
  if (!start) return [];
  // Startwert: CTL/ATL von intervals.icu am Starttag, sonst 0
  const seed = trend.find(p => p.date >= addDays(start, -1)) || null;
  let ctl = seed && seed.date <= start ? seed.ctl : 0, atl = seed && seed.date <= start && num(seed.atl) != null ? seed.atl : 0;
  const out = [];
  for (let d = start; d <= upto; d = addDays(d, 1)) {
    const l = loads[d] || 0;
    ctl += (l - ctl) / 42; atl += (l - atl) / 7;
    out.push({ date: d, load: l, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round((ctl - atl) * 10) / 10 });
  }
  return out;
}

/* ---------- Hilfen für Anpassungen ---------- */
function returnStageActive(illness, date) {
  const ended = (illness || []).filter(p => p && p.end && p.end < date).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!ended) return false;
  const day = Math.round((+new Date(date + 'T12:00:00Z') - +new Date(ended.end + 'T12:00:00Z')) / 86400000);
  return day <= 5; // Stufen 0-2 des Wiedereinstiegs
}
/* Schmerz über 2/10 in Notizen der letzten 7 Tage (z. B. "Leiste zieht, 3/10", "Knie 4/10"). Liefert den Körperteil oder null. */
const PAIN_RE = /(leist|knie|achill|schienbein|hüft|hueft|rücken|ruecken|fuß|fuss|wade|oberschenkel|schulter|sprunggelenk|schmerz)\w*[^0-9\n]{0,25}(\d+(?:[.,]\d)?)\s*(?:\/|von)\s*10/gi;
const PAIN_NAMES: Record<string, string> = { leist: 'Leiste', knie: 'Knie', achill: 'Achillessehne', schienbein: 'Schienbein', hüft: 'Hüfte', hueft: 'Hüfte', rücken: 'Rücken', ruecken: 'Rücken', fuß: 'Fuß', fuss: 'Fuß', wade: 'Wade', oberschenkel: 'Oberschenkel', schulter: 'Schulter', sprunggelenk: 'Sprunggelenk', schmerz: '' };
function painFlag(state, weeks, date) {
  const from = addDays(date, -6);
  const texts = [];
  planDays(weeks).forEach(d => { if (d.date >= from && d.date <= date) d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.notes) texts.push(st.notes); }); });
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d >= from && d <= date) (l || []).forEach(w => { if (w.description) texts.push(w.description); }); });
  (state.trend || []).forEach(p => { if (p && p.date >= from && p.date <= date && p.illness) texts.push(p.illness); });
  Object.values(state.weekNotes || {}).forEach(t => { if (t) texts.push(String(t)); });
  for (const t of texts) {
    let m; PAIN_RE.lastIndex = 0;
    while ((m = PAIN_RE.exec(t))) { if (parseFloat(m[2].replace(',', '.')) > 2) { const k = m[1].toLowerCase(); return PAIN_NAMES[k] || 'Schmerz'; } }
  }
  return null;
}
const painLabel = p => p && p !== 'Schmerz' ? `Schmerz (${p})` : 'Schmerz';
const groinFlag = (state, weeks, date) => !!painFlag(state, weeks, date);
const LADDER = [[3, 6], [3, 8], [3, 10], [2, 15], [2, 20]];
const STEP_RE = /(\d)\s*[×x]\s*(\d{1,2})(?!\d)/;
function ladderIndex(title) {
  const m = STEP_RE.exec(title || ''); if (!m) return -1;
  return LADDER.findIndex(([a, b]) => a === +m[1] && b === +m[2]);
}
/* Bewertung der letzten Sweet-Spot-Einheit aus Messdaten (Runden der Uhr):
   alle Intervalle geschafft, Puls im Zielbereich, Puls- oder Tempoabfall erstes → letztes Intervall unter 5 %, Erholung in den Pausen.
   Ohne Rundendaten zählt die RPE, falls eingetragen, sonst bleibt die Stufe gleich. */
function ladderVerdict(s, st, act, lthrBike): { result: 'up' | 'stay' | 'fail'; why: string } {
  const m = STEP_RE.exec((s && s.title) || '');
  const plannedReps = m ? +m[1] : null;
  const iv = act && act.intervals;
  if (iv && iv.count >= 2) {
    const reps = iv.count;
    const hrOk = iv.avgHrWork == null || iv.avgHrWork <= 0.97 * lthrBike;
    const drift = Math.max(iv.hrDriftPct ?? 0, iv.dropPct ?? 0);
    const rec = iv.recoveryHrDrop;
    if (plannedReps && reps < plannedReps) return { result: 'fail', why: `nur ${reps} von ${plannedReps} Intervallen` };
    if (drift >= 8) return { result: 'fail', why: `Puls/Leistung im letzten Intervall ${Math.round(drift)} % schlechter als im ersten` };
    if (!hrOk) return { result: 'stay', why: `Puls in den Intervallen ${iv.avgHrWork} über dem Zielbereich` };
    if (drift >= 5) return { result: 'stay', why: `Abfall vom ersten zum letzten Intervall ${Math.round(drift)} %` };
    if (rec != null && rec < 12) return { result: 'stay', why: `Puls fiel in den Pausen nur um ${rec} Schläge` };
    return { result: 'up', why: `${reps} Intervalle, Puls im Zielbereich, Abfall unter 5 %${rec != null ? ', Erholung ' + rec + ' Schläge' : ''}` };
  }
  const rpe = toNum(st && st.rpe);
  if (rpe != null) {
    if (rpe <= 7) return { result: 'up', why: `keine Rundendaten, RPE ${rpe}` };
    if (rpe >= 9) return { result: 'fail', why: `keine Rundendaten, RPE ${rpe} (sehr hart)` };
    return { result: 'stay', why: `keine Rundendaten, RPE ${rpe}` };
  }
  return { result: 'stay', why: 'keine Messdaten und keine RPE' };
}
function isSweetSpot(s) { return !!s && s.sport === 'bike' && !/^(Zone 2|Locker) statt/.test(s.title || '') && /sweet/i.test((s.title || '') + ' ' + (s.zone || '')); }
const round5 = x => Math.max(5, Math.round(x / 5) * 5);
const r1 = x => Math.round(x * 10) / 10;
const DOW_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dowDe(s) { return DOW_DE[new Date(s + 'T12:00:00Z').getUTCDay()]; }
function dm(s) { const p = s.split('-'); return p[2] + '.' + p[1] + '.'; }
function sessDone(state, s) { const st = (state.sessions || {})[s.id]; return !!(st && st.completed); }
function sessSkipped(state, s) { const st = (state.sessions || {})[s.id]; return !!(st && st.skipped); }

/* ---------- Täglich (morgens) ---------- */
function dailyAdjustments(state, baseWeeks, date, opts) {
  opts = opts || {};
  const res = [];
  const now = opts.now || Date.now();
  const existing = state.adjustments || {};
  const has = id => !!existing[id] || res.some(a => a.id === id);
  const illness = state.illnessPeriods || [];
  if (illnessAt(illness, date) || returnStageActive(illness, date)) return res; // Krankheit und Wiedereinstieg haben Vorrang
  const meta = opts.planMeta || {};
  const R = readinessFor(state.trend, illness, date, (state.settings || {}).readiness);
  const why = R.reasons.length ? ' (' + R.reasons.join(', ') + ')' : '';
  let weeks = applyAdjustments(baseWeeks, Object.assign({}, existing));
  const dayOf = d => planDays(weeks).find(x => x.date === d) || null;
  const live = d => { const x = dayOf(d); return x ? x.sessions.filter(s => s.sport !== 'rest' && !s.cancelled) : []; };
  const push = a => { if (has(a.id)) return false; if (a.sessionId && isLocked(weeks, a.sessionId)) return false; a.createdAt = now + res.length; a.date = date; res.push(a); weeks = applyAdjustments(baseWeeks, Object.assign({}, existing, Object.fromEntries(res.map(x => [x.id, x])))); return true; };
  const pain = painFlag(state, weeks, date);

  // 1) Schutzregeln für heute: Lauf-Intervalle ohne Freigabe oder bei Leistenschmerz
  live(date).forEach(s => {
    if (s.sport === 'run' && isIntervals(s) && !sessDone(state, s) && (!meta.runIntervalsAllowed || pain)) {
      push({ id: 'guard-' + s.id, type: 'modify', sessionId: s.id, group: 'daily-' + date,
        set: { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', description: 'Lauf-Intervalle sind ' + (pain ? 'wegen ' + painLabel(pain) + ' über 2/10 ' : '') + 'gerade nicht freigegeben. Locker in Zone 2 laufen.' },
        what: `${s.title} → lockerer Lauf in Zone 2`, reason: pain ? painLabel(pain) + ' über 2/10 in deinen Notizen' : 'Lauf-Intervalle hat der Coach noch nicht freigegeben' });
    }
  });

  // 2) Ampel von heute
  if (R.level === 2 || R.level === 1) {
    live(date).forEach(s => {
      if (sessDone(state, s) || isGame(s) || isTestOrRace(s)) return;
      if (R.level === 2 && isKey(s)) {
        push({ id: `daily-${date}-${s.id}`, type: 'modify', sessionId: s.id, group: 'daily-' + date,
          set: { title: 'Locker statt: ' + (s._orig ? s._orig.title : s.title), plannedMinutes: Math.min(25, s.plannedMinutes || 25), plannedKm: null, zone: 'Zone 1',
            description: 'Ampel rot. Heute Ruhetag oder höchstens 20-30 min ganz locker. Die eigentliche Einheit siehst du unter „Original“.' },
          what: `${s.title} → Ruhetag oder 20-30 min ganz locker`, reason: 'Ampel rot' + why });
      } else if (R.level === 1 && isIntervals(s) && !/^Zone 2 statt/.test(s.title)) {
        push({ id: `daily-${date}-${s.id}`, type: 'modify', sessionId: s.id, group: 'daily-' + date,
          set: { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', plannedMinutes: s.plannedMinutes ? round5(s.plannedMinutes * 0.8) : null, plannedKm: s.plannedKm ? r1(s.plannedKm * 0.8) : null,
            description: 'Ampel gelb. Statt Intervallen eine lockere Zone-2-Einheit, 20 % kürzer.' },
          what: `${s.title} → Zone 2, 20 % kürzer`, reason: 'Ampel gelb' + why });
      }
    });
  }

  // 3) Verpasste Schlüsseleinheit innerhalb von 48 h verschieben
  const hardDay = (d, exceptId) => live(d).some(s => s.id !== exceptId && isHard(s));
  const gameDay = d => live(d).some(isGame);
  for (const back of [1, 2]) {
    const from = addDays(date, -back);
    if (illnessAt(illness, from)) continue;
    live(from).filter(s => isKey(s) && !isTestOrRace(s) && !sessDone(state, s) && !sessSkipped(state, s) && !s.movedFrom).forEach(s => {
      if (Object.values(existing).some(a => a && a.type === 'move' && a.sessionId === s.id)) return; // nur einmal verschieben, auch nicht nach Rückgängig
      for (let k = 1; k <= 2; k++) {
        const to = addDays(from, k);
        if (to < date || !dayOf(to) || illnessAt(illness, to)) continue;
        if (to === date && R.level > 0) continue;              // heute nicht, wenn die Ampel nicht grün ist
        if (hardDay(to, s.id)) continue;                         // Ziel muss frei oder locker sein
        if (hardDay(addDays(to, -1), s.id) || hardDay(addDays(to, 1), s.id)) continue; // nie zwei harte Tage hintereinander
        if (gameDay(addDays(to, 1))) continue;                   // nie direkt vor einem Spiel
        const easySame = live(to).find(x => x.sport === s.sport && !isHard(x) && !sessDone(state, x));
        push({ id: 'move-' + s.id, type: 'move', sessionId: s.id, from, to, group: 'move-' + s.id,
          what: `${s.title}: von ${dowDe(from)} ${dm(from)} auf ${dowDe(to)} ${dm(to)} verschoben`, reason: 'Schlüsseleinheit verpasst, Platz innerhalb von 48 h gefunden' });
        if (easySame) push({ id: `cancel-${easySame.id}-for-${s.id}`, type: 'cancel', sessionId: easySame.id, group: 'move-' + s.id,
          what: `${easySame.title} entfällt`, reason: 'Platz für die verschobene Einheit' });
        break;
      }
    });
  }
  return res;
}

/* Lernstufe geschafft? Erledigt und (Dauer mindestens 90 % des Plans oder RPE höchstens 7 oder Uhr zeigt die Strecke am Stück).
   Sehr hart (RPE 9-10) oder „abgebrochen“ in der Notiz: Stufe wiederholen. Ohne Daten: wiederholen. */
function stageVerdict(s, st, act): { ok: boolean; why: string } {
  st = st || {}; const m = st.metrics || {};
  const rpe = toNum(st.rpe), min = toNum(m.min);
  if (/abgebrochen|nicht geschafft|zu schwer/i.test(st.notes || '')) return { ok: false, why: 'laut Notiz zu schwer' };
  if (rpe != null && rpe >= 9) return { ok: false, why: 'RPE ' + rpe + ' (sehr hart)' };
  const longest = act && act.swim && act.swim.longestContinuousM;
  if (s.stage.ladder !== 'runwalk' && longest) {
    const need = Math.max(...((s.spec && s.spec.steps) || []).filter(x => x.mode === 'crawl').map(x => x.m || 0), 0);
    if (need && longest >= need) return { ok: true, why: longest + ' m am Stück gemessen' };
  }
  if (min != null && s.plannedMinutes && min >= s.plannedMinutes * 0.9) return { ok: true, why: Math.round(min) + ' von ' + s.plannedMinutes + ' min geschafft' };
  if (rpe != null && rpe <= 7) return { ok: true, why: 'RPE ' + rpe };
  if (min == null && rpe == null) return { ok: false, why: 'keine Messdaten und keine RPE' };
  return { ok: false, why: 'noch nicht ganz geschafft' };
}
function stageSession(s, n) {
  const ctx = (s.spec && s.spec.ctx) || {};
  const why = s.spec && s.spec.why; const tip = s.spec && s.spec.tip;
  let spec;
  if (s.stage.ladder === 'runwalk') {
    if (n >= W.RUNWALK_LADDER.length) { spec = W.runEasy(ctx, 30); spec.why = 'Du kannst jetzt 30 min am Stück laufen: ab hier normale lockere Läufe.'; }
    else { spec = W.runWalk(ctx, n, why); }
  } else {
    const L = s.stage.ladder === 'swimBreast' ? W.SWIM_BREAST_LADDER : W.SWIM_LADDER;
    if (n >= L.length) {
      // Brust-Weg fertig → Kraul-Weg ab Stufe 2, Kraul-Weg fertig → normales Schwimmen
      if (s.stage.ladder === 'swimBreast') spec = W.swimLearn(ctx, { ladder: 'swim', n: 2 }, why);
      else spec = W.swimSession(ctx, 'endurance', [{ part: 'main', reps: 3, m: 400, zone: 2, mode: 'crawl', restSec: 30 }]);
    } else spec = W.swimLearn(ctx, { ladder: s.stage.ladder, n }, why);
  }
  if (tip && !spec.tip) spec.tip = tip;
  const b = W.build(spec);
  return { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, stage: b.stage || null, zone: b.zone };
}

/* ---------- Wöchentlich (Sonntag 18 Uhr) für die nächste Woche ---------- */
function weekRange(date) { const dow = new Date(date + 'T12:00:00Z').getUTCDay(); const mon = addDays(date, -((dow + 6) % 7)); return [mon, addDays(mon, 6)]; }
function weekSummary(state, baseWeeks, date) {
  const weeks = applyAdjustments(baseWeeks, state.adjustments);
  const [mon, sun] = weekRange(date);
  const days = planDays(weeks).filter(d => d.date >= mon && d.date <= sun);
  let planned = 0, done = 0, nPlanned = 0, nDone = 0; const missedKey = [];
  days.forEach(d => d.sessions.forEach(s => {
    if (s.sport === 'rest' || s.cancelled) return;
    const pl = plannedLoad(s); planned += pl; nPlanned++;
    const st = (state.sessions || {})[s.id];
    if (st && st.completed) { done += sessionLoad(s, st, thrOf(state)); nDone++; }
    else if (isKey(s) && d.date <= date && !(st && st.skipped)) missedKey.push(s.title);
  }));
  let extra = 0;
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d >= mon && d <= sun) (l || []).forEach(w => { extra += sessionLoad({ sport: w.sport, title: w.title, plannedMinutes: w.plannedMinutes }, w, thrOf(state)); }); });
  const illness = state.illnessPeriods || [];
  const end = sun > date ? date : sun;
  const nDays = Math.round((+new Date(end + 'T12:00:00Z') - +new Date(mon + 'T12:00:00Z')) / 86400000) + 1;
  const hist = readinessHistory(state.trend, illness, end, Math.max(1, nDays), (state.settings || {}).readiness);
  const lv = hist.filter(h => h.level != null && h.level !== 3);
  const sick = days.some(d => illnessAt(illness, d.date));
  const lt = (state.trend || []).filter(p => p && p.date <= date && num(p.ctl) > 0 && num(p.atl) != null).slice(-1)[0];
  const sleeps = (state.trend || []).filter(p => p && p.date >= mon && p.date <= sun && num(p.sleepHours) != null).map(p => p.sleepHours);
  return {
    mon, sun, planned, done: done + extra, doneInPlan: done, extra, nPlanned, nDone,
    ratio: planned ? (done + extra) / planned : null,
    green: lv.filter(h => h.level === 0).length, yellow: lv.filter(h => h.level === 1).length, red: lv.filter(h => h.level === 2).length, withValues: lv.length,
    history: hist, sick, missedKey, loadRatio: lt ? lt.atl / lt.ctl : null,
    sleepAvg: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null
  };
}
function weeklyAdjustments(state, baseWeeks, date, opts) {
  opts = opts || {};
  const res = [];
  const now = opts.now || Date.now();
  const existing = state.adjustments || {};
  const meta = opts.planMeta || {};
  const weeks = applyAdjustments(baseWeeks, existing);
  const next = weeks.find(w => w.startDate === addDays(weekRange(date)[1], 1)) || weeks.find(w => (w.days || []).some(d => d.date === addDays(date, 1)));
  if (!next) return { adjustments: res, summary: null };
  const S = weekSummary(state, baseWeeks, date);
  const illness = state.illnessPeriods || [];
  const pain = painFlag(state, weeks, date);
  const group = 'week-' + next.weekNumber;
  if (existing[group + '-summary']) return { adjustments: res, summary: S };
  const push = a => { if (existing[a.id] || res.some(x => x.id === a.id)) return; if (a.sessionId && isLocked(weeks, a.sessionId)) return; a.createdAt = now + res.length; a.date = date; a.group = group; res.push(a); };

  // Umfang
  let pct = 0, why;
  const ratioTxt = S.ratio == null ? 'keine Planbelastung' : Math.round(S.ratio * 100) + ' % umgesetzt';
  if (S.sick || S.red >= 2 || (S.ratio != null && S.ratio < 0.7)) {
    pct = (S.sick || (S.ratio != null && S.ratio < 0.5)) ? -20 : -10;
    why = S.sick ? 'Du warst diese Woche krank' : S.red >= 2 ? `${S.red} rote Tage diese Woche` : ratioTxt;
  } else if (S.ratio != null && S.ratio >= 0.9 && S.withValues && S.green > S.withValues / 2 && S.loadRatio != null && S.loadRatio >= 0.8 && S.loadRatio <= 1.3) {
    pct = (S.ratio >= 1 && S.red === 0) ? 10 : 5;
    why = `${ratioTxt}, überwiegend grün, Belastung im guten Bereich`;
  } else {
    why = S.ratio != null && S.ratio >= 0.7 ? `${ratioTxt}: Umfang bleibt gleich` : 'Zu wenig Daten für eine Änderung';
  }
  if (pct > 0 && pain) { pct = 0; why = painLabel(pain) + ' über 2/10: diese Woche keine Steigerung'; }
  if (pct > 0 && (returnStageActive(illness, addDays(date, 1)))) { pct = 0; why = 'Nach Krankheit gilt der Stufenplan'; }
  if (next.isRecoveryWeek) { pct = 0; why = 'Erholungswoche aus dem Plan bleibt bestehen'; }
  pct = Math.max(-20, Math.min(10, pct));

  const nextSessions = planDays([next]).flatMap(d => d.sessions.map(s => Object.assign({}, s, { date: d.date })));
  if (pct !== 0) {
    nextSessions.forEach(s => {
      if (!['swim', 'bike', 'run'].includes(s.sport) || s.cancelled || isTestOrRace(s) || !s.plannedMinutes) return;
      if (s.stage || s.race || s.fixed) return;
      const f = 1 + pct / 100;
      const rb = W.rebuildScaled(s, f);
      push({ id: `${group}-vol-${s.id}`, type: 'modify', sessionId: s.id,
        set: rb || { plannedMinutes: round5(s.plannedMinutes * f), plannedKm: s.plannedKm ? r1(s.plannedKm * f) : s.plannedKm == null ? null : s.plannedKm },
        what: `${s.title}: ${s.plannedMinutes} → ${round5(s.plannedMinutes * f)} min`, reason: `Umfang ${pct > 0 ? '+' : ''}${pct} %` });
    });
  }

  // Intervall-Leiter Rad (Sweet Spot)
  const doneSS = planDays(weeks).filter(d => d.date <= date).flatMap(d => d.sessions.filter(s => isSweetSpot(s) && sessDone(state, s)).map(s => ({ s, st: state.sessions[s.id], date: d.date })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = doneSS[doneSS.length - 1];
  let ladderWhy = null;
  if (last) {
    const cur = ladderIndex(last.s.title);
    if (cur >= 0) {
      const lthrBike = (thrOf(state).lthrBike) || LTHR_DEFAULT.bike;
      const verdict = ladderVerdict(last.s, last.st, (state.activities || {})[last.st.activityId], lthrBike);
      const prev = doneSS[doneSS.length - 2];
      const prevVerdict = prev ? ladderVerdict(prev.s, prev.st, (state.activities || {})[prev.st.activityId], lthrBike) : null;
      let target = cur;
      if (verdict.result === 'fail' && prevVerdict && prevVerdict.result === 'fail') { target = Math.max(0, cur - 1); ladderWhy = 'zweimal nicht geschafft: eine Stufe zurück (' + verdict.why + ')'; }
      else if (verdict.result === 'up') { target = Math.min(LADDER.length - 1, cur + 1); ladderWhy = target > cur ? 'letzte Einheit lief laut Messdaten gut (' + verdict.why + '): eine Stufe weiter' : 'höchste Stufe erreicht'; }
      else ladderWhy = verdict.why + ': Stufe wiederholen';
      const [a, b] = LADDER[target];
      nextSessions.filter(s => isSweetSpot(s) && !s.cancelled).forEach(s => {
        const curTitle = s.title;
        const newTitle = STEP_RE.test(curTitle) ? curTitle.replace(STEP_RE, `${a}×${b}`) : `${curTitle} ${a}×${b}`;
        if (newTitle === curTitle) return;
        push({ id: `${group}-ladder-${s.id}`, type: 'modify', sessionId: s.id,
          set: { title: newTitle, description: `Sweet Spot ${a}×${b} min. ${s.description || ''}`.trim() },
          what: `${curTitle} → ${newTitle}`, reason: 'Intervall-Leiter Rad: ' + ladderWhy });
      });
    }
  }

  // Lernstufen (Kraul lernen, Lauf-Geh-Wechsel): eine Stufe weiter nur, wenn die letzte laut Daten geklappt hat (Auftrag 4 C1)
  const stageWhy: string[] = [];
  for (const ladder of ['swim', 'swimBreast', 'runwalk']) {
    const done = planDays(weeks).filter(d => d.date <= date && d.date > addDays(date, -21)).flatMap(d => d.sessions.filter(s => s.stage && s.stage.ladder === ladder && sessDone(state, s)).map(s => ({ s, date: d.date })))
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = done[done.length - 1]; if (!last) continue;
    const v = stageVerdict(last.s, state.sessions[last.s.id], (state.activities || {})[(state.sessions[last.s.id] || {}).activityId]);
    const target = v.ok ? last.s.stage.n + 1 : last.s.stage.n;
    nextSessions.filter(s => s.stage && s.stage.ladder === ladder && !s.cancelled && s.stage.n !== target).forEach(s => {
      const built = stageSession(s, target); if (!built) return;
      push({ id: `${group}-stage-${s.id}`, type: 'modify', sessionId: s.id, set: built, what: `${s.title} → ${built.title}`, reason: (v.ok ? 'Letzte Stufe hat geklappt (' : 'Stufe wiederholen (') + v.why + ')' });
    });
    stageWhy.push((v.ok ? 'nächste Stufe: ' : 'Stufe bleibt: ') + v.why);
  }

  // Schutzregeln für die nächste Woche
  nextSessions.forEach(s => {
    if (s.sport === 'run' && isIntervals(s) && (!meta.runIntervalsAllowed || pain)) {
      push({ id: 'guard-' + s.id, type: 'modify', sessionId: s.id,
        set: { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', description: 'Lauf-Intervalle sind ' + (pain ? 'wegen ' + painLabel(pain) + ' über 2/10 ' : '') + 'gerade nicht freigegeben. Locker in Zone 2 laufen.' },
        what: `${s.title} → lockerer Lauf in Zone 2`, reason: pain ? painLabel(pain) + ' über 2/10 in deinen Notizen' : 'Lauf-Intervalle hat der Coach noch nicht freigegeben' });
    }
  });

  push({ id: group + '-summary', type: 'note',
    what: `Woche ${next.weekNumber}: Umfang ${pct > 0 ? '+' + pct : pct} %`, reason: why + (ladderWhy ? '. Rad-Leiter: ' + ladderWhy : '') + (stageWhy.length ? '. Lernstufen: ' + stageWhy.join('; ') : ''),
    stats: { ratio: S.ratio, red: S.red, green: S.green, withValues: S.withValues, sick: S.sick, loadRatio: S.loadRatio, pct } });
  return { adjustments: res, summary: S };
}

/* ================= Phase 5: Hilfen für Mitteilungen ================= */
/* Uhrzeit einer Einheit: von Hand eingetragen (Session-Zustand) > Feld im Plan > erste Uhrzeit im Text. */
function sessionTime(s, st) {
  const cand = [st && st.time, s && (s.time || s.startTime)];
  for (const c of cand) if (c && /^\d{1,2}:\d{2}$/.test(c)) return c.padStart(5, '0');
  // Uhrzeit wie "17:30" oder "6.15 Uhr", aber keine Pace wie "5:39/km" oder "2:05 min"
  const m = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d.,:]|\s*(?:\/|min|km|m\b|s\b))/i.exec(((s && s.title) || '') + ' ' + ((s && s.description) || ''));
  return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
}
function isEarly(s, st) {
  const t = sessionTime(s, st);
  if (t) return t < '08:00';
  return /vor der schule|früh|morgens/i.test(((s && s.title) || '') + ' ' + ((s && s.description) || ''));
}
const DEFAULT_ZONES = [{ zone: 1, low: 0, high: 81 }, { zone: 2, low: 81, high: 89 }, { zone: 3, low: 90, high: 93 }, { zone: 4, low: 94, high: 102 }, { zone: 5, low: 102, high: 999 }];
function zoneBpm(s, settings, zonePercents) {
  if (!s || (s.sport !== 'run' && s.sport !== 'bike') || !s.zone) return null;
  const nums = [...String(s.zone).matchAll(/\d/g)].map(m => +m[0]);
  const zones = (zonePercents && zonePercents.length ? zonePercents : DEFAULT_ZONES);
  const lthr = s.sport === 'bike' ? ((settings && settings.lthrBike) || LTHR_DEFAULT.bike) : ((settings && settings.lthrRun) || LTHR_DEFAULT.run);
  const hit = nums.map(n => zones.find(z => z.zone === n)).filter(Boolean);
  if (!hit.length) return null;
  const lo = Math.min(...hit.map(z => Math.round(lthr * z.low / 100)));
  const hi = Math.max(...hit.map(z => z.high >= 999 ? Math.round(lthr * z.low / 100) + 30 : Math.round(lthr * z.high / 100)));
  return `${lo}-${hi} bpm`;
}
/* Untergrenze des Kalorienziels wie in der App (Mifflin-St Jeor × Alltagsfaktor + Training). */
const MET = s => {
  const intense = /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || ''));
  return ({ run: intense ? 11 : 9, bike: intense ? 9.5 : 7, swim: 6, strength: 4, football: 7.5 })[s.sport] || 0;
};
function nutritionKcalLow(state, weeks, date, profile) {
  // Ohne Angaben: allgemeine Erwachsenen-Werte (das Profil liefert die echten)
  const p = Object.assign({ age: 30, heightCm: 175, weightKg: 70, pal: 1.4 }, profile || {});
  const ws = Object.entries(state.nutrition || {}).filter(([d, v]) => v && v.weight != null && d <= date).sort((a, b) => a[0].localeCompare(b[0])).slice(-7).map(x => x[1].weight);
  const w = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : p.weightKg;
  const daily = (10 * w + 6.25 * p.heightCm - 5 * p.age + 5) * p.pal;
  let act = 0;
  const day = planDays(weeks).find(d => d.date === date);
  if (day) day.sessions.forEach(s => {
    if (s.sport === 'rest' || s.cancelled) return;
    const st = (state.sessions || {})[s.id] || {};
    if (st.skipped || illnessAt(state.illnessPeriods, date)) return;
    const min = st.completed && st.metrics && toNum(st.metrics.min) != null ? toNum(st.metrics.min) : defaultMinutes(s);
    act += (MET(s) - 1) * w * min / 60;
  });
  ((state.customWorkouts || {})[date] || []).forEach(x => { const min = toNum((x.metrics || {}).min) != null ? toNum(x.metrics.min) : (x.plannedMinutes || defaultMinutes(x)); act += (MET(x) - 1) * w * min / 60; });
  return Math.round((daily + act) / 50) * 50;
}
/* Bestwerte: Schwimm-Pace /100 m, Züge pro Bahn, Lauf-Effizienz (m pro Herzschlag). */
function paceSec(v) { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; }
function perfEntries(state, weeks) {
  const out = [];
  const addE = (date, sport, m, id) => {
    if (!m) return;
    const min = toNum(m.min), km = toNum(m.km), hr = toNum(m.hr), meters = toNum(m.meters);
    if (sport === 'swim') {
      let p100 = paceSec(m.pace100); if (p100 == null && meters && min) p100 = min * 60 / (meters / 100);
      out.push({ id, date, sport, pace100: p100, spl: toNum(m.spl) });
    } else if (sport === 'run') {
      let pace = paceSec(m.pace); if (pace == null && km && min) pace = min * 60 / km;
      out.push({ id, date, sport, eff: pace && hr ? (60000 / pace) / hr : null });
    }
  };
  planDays(weeks).forEach(d => d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed) addE(d.date, s.sport, st.metrics, s.id); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l || []).forEach(w => addE(d, w.sport, w.metrics, w.id)));
  return out;
}
function bests(entries) {
  const b: any = {};
  const better = (k, v, lower) => v != null && isFinite(v) && v > 0 && (b[k] == null || (lower ? v < b[k].v : v > b[k].v));
  entries.forEach(e => {
    if (better('swimPace', e.pace100, true)) b.swimPace = { v: e.pace100, id: e.id, date: e.date };
    if (better('spl', e.spl, true)) b.spl = { v: e.spl, id: e.id, date: e.date };
    if (better('runEff', e.eff, false)) b.runEff = { v: e.eff, id: e.id, date: e.date };
  });
  return b;
}

export {
  sessionTime, isEarly, zoneBpm, nutritionKcalLow, perfEntries, bests,
  addDays, illnessAt, hasRecovery, readinessFor, readinessHistory, baselineOf, BASE_DAYS, MIN_DAYS,
  isGame, isIntervals, isLong, isKey, isHard, sessionLoad, plannedLoad, applyAdjustments, activeAdjustments, planDays,
  dailyLoads, ownLoadSeries, groinFlag, painFlag, thrOf, ladderIndex, LADDER, dailyAdjustments, weeklyAdjustments, weekSummary, weekRange, returnStageActive,
  isLocked, stageVerdict, stageSession
};
