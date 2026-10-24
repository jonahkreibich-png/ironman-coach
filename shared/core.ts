/* Gemeinsame Coach-Logik für App und Server (keine Abhängigkeiten, keine DOM-Zugriffe). */
// Bewusst locker typisiert: Datensätze kommen aus Sync und Backups und sind nicht immer vollständig.
import { GENERIC_LTHR } from './profile';
import { loadSeriesFromDaily, validDate } from './load';
import * as W from './workouts';
import * as K from './keysessions';
import { rulesOf, evaluate, dayLimit } from './constraints';
import { parseFor } from './ruleparse';
import { actualMetrics, effectiveActivity } from './results';
import { LIB } from './workoutlib';
import { runQualitySpec, bikeQualitySpec } from './workoutbuild';
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
const RECOVERY_KEYS = ['feel', 'soreness', 'sleepHours', 'sleepQuality', 'restingHR', 'hrv', 'breathingRate', 'remSleep', 'deepSleep', 'sleepLatency', 'bodyTemp', 'spo2'];
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

/* Auftrag 14: Bereitschaft als EIN Wert 0-100. Farbe, Wort und Text kommen nur aus diesem Wert:
   ab 70 grün (normal trainieren), 45-69 gelb (lockerer, Intensität raus), unter 45 rot (Ruhe oder ganz locker).
   Jeder Einzelwert zieht Punkte ab und hat seine eigene Ampelfarbe; ein gelber Einzelwert begrenzt auf 69, ein roter auf 44.
   Fehlen die Morgenwerte von heute oder ist nur ein Wert da, ist die Ampel „unsicher“ (Stufe 3) statt grün. */
const READY_GREEN = 70, READY_YELLOW = 45;
const CORE_KEYS = ['hrv', 'restingHR', 'sleepHours', 'sleepQuality', 'feel', 'soreness'];
function levelOfScore(score) { return score >= READY_GREEN ? 0 : score >= READY_YELLOW ? 1 : 2; }

/**
 * Bewertet einen Tag. Liefert Stufe (0 grün, 1 gelb, 2 rot, 3 unsicher), Score 0-100 (bei 3: null),
 * 1-3 Gründe in einfachen Worten und die Einzelwerte (crits, jeweils mit st: ok | warn | bad | none).
 * fallback: { rhrMax, hrvMin, tempMax, sleepNeed, load: { ctl, atl } } aus Einstellungen und Plan.
 * Persönliche Basis: 28 Tage (ab 7 Tagen Werte), vorläufig ab 3 Tagen mit weiteren Grenzen, sonst feste Grenzen aus den Einstellungen.
 */
function readinessFor(trend, illness, date, fallback) {
  fallback = fallback || {};
  const { p, stale } = pointFor(trend, date);
  const crits = [], reasons = [];
  let score = 100, cap = 100, personal = false;
  const add = (c) => { crits.push(c); if (c.st === 'warn') cap = Math.min(cap, READY_GREEN - 1); if (c.st === 'bad') cap = Math.min(cap, READY_YELLOW - 1); };
  const why = (st, text, w) => { if (st === 'warn' || st === 'bad') reasons.push({ l: st === 'bad' ? 2 : 1, why: text, w: w || 1 }); };
  const ill = illnessAt(illness, date);
  const ret = !ill && returnStageActive(illness, date);

  // Krankheit
  if (ill) { add({ k: 'Krankheit', v: 'krank', t: 'seit ' + dm(ill.start), st: 'bad' }); why('bad', 'Du bist krank eingetragen', 5); score -= 80; }
  else if (ret) { add({ k: 'Krankheit', v: 'Wiedereinstieg', t: 'nach Krankheit nur locker', st: 'warn' }); why('warn', 'Wiedereinstieg nach Krankheit', 3); score -= 15; }

  const q = p && !stale ? p : null;   // nur Werte von heute zählen
  if (q) {
    // HFV: ln(HFV), 3-Tage-Schnitt gegen Ausreißer, z-Wert gegen den persönlichen Normalbereich
    if (num(q.hrv) != null && q.hrv > 0) {
      const base = baselineOf(trend, illness, q.date, 'hrv', Math.log);
      if (base && base.n >= MIN_DAYS && base.sd > 0) {
        personal = true;
        const recent = (trend || []).filter(x => x && x.date <= q.date && x.date > addDays(q.date, -3) && num(x.hrv) > 0 && !illnessAt(illness, x.date)).map(x => Math.log(x.hrv));
        const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : Math.log(q.hrv);
        const z = (avg - base.mean) / base.sd;
        const st = z < -1.5 ? 'bad' : z < -1 ? 'warn' : 'ok';
        add({ k: 'HFV', v: fmt(q.hrv, 0) + ' ms', t: `normal ${fmt(Math.exp(base.mean), 0)} · z ${sign(z, 1)}`, st });
        score -= Math.max(0, -z) * 15;
        why(st, st === 'bad' ? 'HFV deutlich unter deinem Normalbereich' : 'HFV etwas unter deinem Normalbereich', st === 'bad' ? 3 : 2);
      } else if (base && base.n >= 3 && num(fallback.hrvMin) == null) {
        // vorläufige Basis (3-6 Tage): nur deutliche Abweichungen zählen
        const norm = Math.exp(base.mean); const pct = (q.hrv / norm - 1) * 100;
        const st = pct <= -30 ? 'bad' : pct <= -20 ? 'warn' : 'ok';
        add({ k: 'HFV', v: fmt(q.hrv, 0) + ' ms', t: `vorläufig normal ${fmt(norm, 0)} (${base.n}/${MIN_DAYS} Tage)`, st });
        score -= Math.max(0, -pct) * 0.6;
        why(st, st === 'bad' ? 'HFV deutlich unter den letzten Tagen' : 'HFV unter den letzten Tagen', st === 'bad' ? 3 : 2);
      } else if (num(fallback.hrvMin) == null) {
        add({ k: 'HFV', v: fmt(q.hrv, 0) + ' ms', t: `Normalbereich wird gelernt (${base ? base.n : 0}/${MIN_DAYS} Tage)`, st: 'none' });
      } else {
        const st = q.hrv >= fallback.hrvMin ? 'ok' : (q.hrv >= fallback.hrvMin - 7 ? 'warn' : 'bad');
        add({ k: 'HFV', v: fmt(q.hrv, 0) + ' ms', t: `Ziel ≥${fallback.hrvMin}`, st });
        if (st !== 'ok') score -= st === 'bad' ? 25 : 12;
        why(st, st === 'bad' ? 'HFV deutlich niedrig' : 'HFV etwas niedrig', st === 'bad' ? 3 : 2);
      }
    }
    // Ruhepuls: heute minus Normalwert
    if (num(q.restingHR) != null && q.restingHR > 0) {
      const base = baselineOf(trend, illness, q.date, 'restingHR');
      if (base && base.n >= MIN_DAYS) {
        personal = true;
        const d = q.restingHR - base.mean;
        const st = d >= 5 ? 'bad' : d >= 3 ? 'warn' : 'ok';
        add({ k: 'Ruhepuls', v: fmt(q.restingHR, 0), t: `normal ${fmt(base.mean, 0)} · ${sign(d, 0)}`, st });
        score -= Math.max(0, d) * 4;
        why(st, `Ruhepuls ${fmt(d, 0)} Schläge über normal`, st === 'bad' ? 3 : 2);
      } else if (base && base.n >= 3 && num(fallback.rhrMax) == null) {
        const d = q.restingHR - base.mean;
        const st = d >= 8 ? 'bad' : d >= 5 ? 'warn' : 'ok';
        add({ k: 'Ruhepuls', v: fmt(q.restingHR, 0), t: `vorläufig normal ${fmt(base.mean, 0)} · ${sign(d, 0)} (${base.n}/${MIN_DAYS} Tage)`, st });
        score -= Math.max(0, d - 2) * 3;
        why(st, `Ruhepuls ${fmt(d, 0)} Schläge über den letzten Tagen`, st === 'bad' ? 3 : 2);
      } else if (num(fallback.rhrMax) == null) {
        add({ k: 'Ruhepuls', v: fmt(q.restingHR, 0), t: `Normalbereich wird gelernt (${base ? base.n : 0}/${MIN_DAYS} Tage)`, st: 'none' });
      } else {
        const st = q.restingHR <= fallback.rhrMax ? 'ok' : (q.restingHR <= fallback.rhrMax + 2 ? 'warn' : 'bad');
        add({ k: 'Ruhepuls', v: fmt(q.restingHR, 0), t: `Ziel ≤${fallback.rhrMax}`, st });
        if (st !== 'ok') score -= st === 'bad' ? 20 : 10;
        why(st, st === 'bad' ? 'Ruhepuls deutlich erhöht' : 'Ruhepuls leicht erhöht', st === 'bad' ? 3 : 2);
      }
    }
    // Temperatur-Abweichung
    if (num(q.bodyTemp) != null) {
      const v = q.bodyTemp;
      const st = v >= 0.5 ? 'bad' : v >= 0.3 ? 'warn' : 'ok';
      add({ k: 'Temp.', v: sign(v, 1) + ' °C', t: 'Grenze +0,3', st });
      score -= Math.max(0, v) * 40;
      why(st, st === 'bad' ? 'Temperatur erhöht. Wirst du krank?' : 'Temperatur leicht erhöht', st === 'bad' ? 4 : 2);
    }
    // Schlaf: Bedarf aus dem Profil (Jugendliche brauchen mehr)
    const NEED = (fallback.sleepNeed && fallback.sleepNeed.length === 2) ? fallback.sleepNeed : DEFAULT_SLEEP_NEED;
    const needTxt = fmt(NEED[0]) + '-' + fmt(NEED[1]) + ' h';
    if (num(q.sleepHours) != null || num(q.sleepQuality) != null) {
      const h = num(q.sleepHours), sq = num(q.sleepQuality);
      const veryShort = h != null && h < Math.min(5, NEED[0] - 2.5);
      const short = h != null && h < Math.min(7, NEED[0] - 0.5), poor = sq != null && sq < 5;
      // Auftrag 18: kurzer Schlaf nimmt die Intensität raus (gelb), sagt aber nicht allein alles ab
      const st = veryShort || short || poor ? 'warn' : 'ok';
      add({ k: 'Schlaf', v: h != null ? fmt(h, 1) + ' h' : fmt(sq, 0) + '/10', t: (h != null && sq != null ? 'Qualität ' + fmt(sq, 0) + ' · ' : '') + 'Bedarf ' + needTxt, st });
      if (h != null && h < NEED[0]) score -= (NEED[0] - h) * 8;
      if (sq != null && sq < 7) score -= (7 - sq) * 3;
      if (short || veryShort) why(st, `Nur ${fmt(h, 1)} h geschlafen (du brauchst ${needTxt})`, veryShort ? 3 : 2);
      else if (poor) why('warn', 'Schlecht geschlafen', 1);
    }
    // Gefühl und Muskelkater (Morgen-Eingabe oder intervals.icu): Gefühl 1 sehr frisch … 5 sehr müde, Muskelkater 0 keiner … 3 stark
    const feel = num(q.feel), sore = num(q.soreness);
    if (feel != null || sore != null) {
      const fSt = feel == null ? 'ok' : feel >= 4 ? 'warn' : 'ok';
      const sSt = sore == null ? 'ok' : sore >= 2 ? 'warn' : 'ok';
      const st = fSt === 'warn' || sSt === 'warn' ? 'warn' : 'ok';
      const FEEL_TXT = ['', 'sehr frisch', 'frisch', 'normal', 'müde', 'sehr müde'], SORE_TXT = ['kein Muskelkater', 'leichter Muskelkater', 'Muskelkater', 'starker Muskelkater'];
      const parts = [feel != null ? FEEL_TXT[Math.round(feel)] || '' : '', sore != null ? SORE_TXT[Math.round(sore)] || '' : ''].filter(Boolean);
      add({ k: 'Gefühl', v: parts[0] || '–', t: parts.slice(1).join(' · ') || 'dein Gefühl am Morgen', st });
      if (feel != null && feel >= 4) score -= feel >= 5 ? 22 : 12;
      if (sore != null && sore >= 2) score -= sore >= 3 ? 20 : 10;
      if (st === 'warn') why('warn', [feel != null && feel >= 4 ? (feel >= 5 ? 'Du fühlst dich sehr müde' : 'Du fühlst dich müde') : '', sore != null && sore >= 2 ? (sore >= 3 ? 'starker Muskelkater' : 'Muskelkater') : ''].filter(Boolean).join(', '), 2);
    }
  }

  // Belastung: Form (TSB = Fitness − Müdigkeit) und ACWR (Müdigkeit / Fitness), erst ab etwas Trainingsverlauf (Fitness ≥ 15)
  const LF = fallback.load && num(fallback.load.ctl) != null && num(fallback.load.atl) != null ? fallback.load : latestLoad(trend, date);
  if (LF && !ill) {
    const ctl = LF.ctl, atl = LF.atl, tsb = ctl - atl;
    if (ctl >= 15) {
      const r = atl / ctl, rel = tsb / ctl;
      const st = (r > 2 || rel < -0.6) ? 'bad' : (r > 1.5 || rel < -0.35) ? 'warn' : 'ok';
      add({ k: 'Belastung', v: 'Form ' + sign(tsb, 0), t: `ACWR ${fmt(r, 2)} · gut 0,8-1,3`, st });
      if (r > 1.3) score -= (r - 1.3) * 50;
      if (rel < -0.2) score -= (-rel - 0.2) * 40;
      why(st, st === 'bad' ? 'Belastung zuletzt viel zu hoch (etwa ' + Math.round((r - 1) * 100) + ' % mehr als gewohnt)' : 'Belastung zuletzt sehr hoch (etwa ' + Math.round((r - 1) * 100) + ' % mehr als gewohnt)', st === 'bad' ? 3 : 2);
    } else add({ k: 'Belastung', v: 'Form ' + sign(tsb, 0), t: 'noch zu wenig Trainingsverlauf', st: 'none' });
  }

  score = Math.max(0, Math.min(cap, Math.round(score)));
  // Sicherheit: Werte von heute, mindestens zwei (HFV, Ruhepuls, Schlaf, Gefühl). Rote oder gelbe Zeichen gelten auch einzeln.
  const have = q ? CORE_KEYS.filter(k => num(q[k]) != null && !(k === 'sleepQuality' && num(q.sleepHours) != null) && !(k === 'soreness' && num(q.feel) != null)).length : 0;
  let level = levelOfScore(score), uncertain = '';
  if (!ill && !ret && level === 0 && have < 2) { uncertain = q ? 'few' : 'none'; level = 3; }
  reasons.sort((a, b) => b.l - a.l || b.w - a.w);
  // Für „unsicher“: wie es nach den letzten (alten) Werten aussah
  let staleLevel = null;
  if (level === 3 && p && stale) { const old = readinessFor(trend, illness, p.date, fallback); staleLevel = old.level; }
  return { level, score: level === 3 ? null : score, reasons: reasons.slice(0, 3).map(r => r.why), crits, personal, point: q || p, stale: !q && !!p, uncertain, staleLevel, have };
}

/* Wort, Satz und Farbe zur Bereitschaft: überall dieselben (Heute, Morgen-Nachricht, Coach). */
const READY_WORDS = ['Bereit', 'Locker', 'Ruhe', 'Unsicher'];
const READY_ACTION = ['normal trainieren', 'lockerer trainieren, Intensität raus', 'Ruhe oder nur ganz locker', ''];
function readinessLine(R) {
  if (!R) return '';
  if (R.level === 3) {
    const base = R.uncertain === 'few' ? `Ampel unsicher – nur ${R.crits.filter(c => ['HFV', 'Ruhepuls', 'Schlaf', 'Gefühl'].includes(c.k)).map(c => c.k === 'Gefühl' ? 'dein Gefühl' : c.k).join(', ') || 'ein Wert'} von heute.` : 'Ampel unsicher – keine Morgenwerte.';
    return base + ' ' + (R.uncertain === 'few' ? 'Mit Schlaf und Ruhepuls oder HFV wird sie sicher.' : 'Trag Schlaf und Ruhepuls ein oder verbinde Uhr oder Ring.');
  }
  const head = `${['Grün', 'Gelb', 'Rot'][R.level]} (${R.score}/100): ${READY_ACTION[R.level]}.`;
  if (R.level === 0) return head + ' Alles im grünen Bereich.';
  return head + ' ' + (R.reasons.join(', ') || 'Einige Werte sind auffällig') + '.';
}

/* Verlauf der letzten n Tage (nur Tage mit Morgenwerten). */
function readinessHistory(trend, illness, date, n, fallback) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    const own = (trend || []).find(p => p && p.date === d);
    if (!hasRecovery(own)) { out.push({ date: d, level: null, score: null, ill: !!illnessAt(illness, d) }); continue; }
    const r = readinessFor(trend, illness, d, i === 0 ? fallback : { ...(fallback || {}), load: null });
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
// Spiel: aus der Bauanleitung (Teamname wie „Spielvereinigung“ zählt nicht), sonst aus dem Titel (alte Pläne)
function isGame(s) { if (!s || s.sport !== 'football') return false; if (s.spec && s.spec.kind) return s.spec.kind === 'game'; return /(spiel|match)\b/i.test(s.title || ''); } // auch „Fussballspiel“, nicht „Spielvereinigung“
const EASED_RE = /^(Zone 2|Locker) statt/;
function isIntervals(s) {
  // Der sichtbare Name darf kurze kontrollierte Tempowechsel nicht nachträglich
  // zu einer harten Einheit machen. Die strukturierten Schritte sind maßgeblich.
  if (s?.spec?.kind === 'fartlek' && !s.hard && (s.spec.steps || []).every(x => (x.zone || 0) <= 3)) return false;
  // Auftrag 19: lockere Formen der Einheiten-Bibliothek (Progressionslauf, Hügelsprints, kurze schnelle Schwimm-Stücke) sind keine Intervall-Einheit
  if (!s?.hard && (['progression', 'hills'].includes(s?.spec?.kind) || s?.spec?.lib?.key === 'swim.fast')) return false;
  return !!s && ['run', 'bike', 'swim'].includes(s.sport) && !EASED_RE.test(s.title || '') && HARD_RE.test((s.title || '') + ' ' + (s.zone || ''));
}
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
  const corrected = ['min', 'hr', 'power', 'normalizedPower'].some(k => st.metricsManual?.[k] || st.metricsSrc?.[k] === 'manual');
  if (toNum(st.icuLoad) != null && !corrected) return Math.max(0, Math.round(toNum(st.icuLoad)));
  const min = toNum(m.min) != null ? toNum(m.min) : defaultMinutes(s);
  if (!min || min < 0) return 0;
  const h = min / 60, hr = toNum(m.hr);
  // Ohne NP ist Durchschnittsleistung nur eine Näherung für gleichmäßige Fahrten.
  const power = toNum(m.normalizedPower) ?? toNum(m.power);
  if (s.sport === 'bike' && power > 0 && toNum(thr && thr.ftp) > 0) return Math.round(h * Math.pow(power / thr.ftp, 2) * 100);
  if (hr && hr > 60 && s.sport !== 'swim' && s.sport !== 'strength') {
    const lthr = s.sport === 'bike' ? ((thr && thr.lthrBike) || LTHR_DEFAULT.bike) : ((thr && thr.lthrRun) || LTHR_DEFAULT.run);
    return Math.round(h * Math.pow(hr / lthr, 2) * 100);
  }
  const rpe = toNum(st.rpe);
  // Ohne RPE: Fußball 6 (Spiel 7), sonst dieselbe Schätzung wie für die geplante Einheit
  const IF = rpe != null ? Math.max(0, Math.min(rpe / 9, 1.05)) : plannedIF(s);
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
      to.sessions.push(Object.assign({}, a.session, { _adj: [a.id], added: true }, a.override ? { ruleOverride: true } : {})); where[a.session.id] = to; continue;
    }
    const d = where[a.sessionId]; if (!d) continue;
    const s = d.sessions.find(x => x.id === a.sessionId); if (!s) continue;
    if (!s._orig) { s._orig = {}; ADJ_FIELDS.forEach(k => { s._orig[k] = s[k] == null ? null : s[k]; }); s._orig.date = d.date; }
    s._adj = (s._adj || []).concat(a.id);
    // bewusste Ausnahme von einer harten Regel: gilt nur für diese eine Einheit (Auftrag 5 A4)
    if (a.override) s.ruleOverride = true;
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
function canonicalActivityId(state, id) {
  const visited = new Set();
  while (id && state.activities?.[id]?.mergedInto && !visited.has(id)) { visited.add(id); id = state.activities[id].mergedInto; }
  return id;
}
function recordedActivities(state) {
  const drafts = new Set();
  const corrections = new Map();
  Object.entries(state.sessions || {}).forEach(([id, st]) => { const aid = canonicalActivityId(state, st.activityId); if (aid) corrections.set(aid, st); corrections.set('session:' + id, st); });
  Object.values(state.customWorkouts || {}).forEach(list => (list || []).forEach(w => { const aid = canonicalActivityId(state, w.activityId); if (aid) corrections.set(aid, w); }));
  Object.values(state.customWorkouts || {}).forEach(list => (list || []).forEach(w => { if (w.completed === false && w.activityId) drafts.add(canonicalActivityId(state, w.activityId)); }));
  return Object.values(state.activities || {}).filter(a => a && !a.mergedInto && !drafts.has(a.id)).map(a => {
    const linked = corrections.get(a.id) || corrections.get('session:' + a.sessionId);
    return effectiveActivity(a, linked || {});
  });
}
function dailyLoadEntries(state, weeks) {
  const out = [], seen = new Set();
  const add = (date, s, st, key) => {
    if (!validDate(date) || s.sport === 'rest' || st.completed === false) return;
    const aid = canonicalActivityId(state, st.activityId), dedup = aid ? 'act:' + aid : key;
    if (seen.has(dedup)) return; seen.add(dedup);
    const a = aid && state.activities?.[aid];
    const record = { ...st, metrics: actualMetrics(st, a), rpe: st.rpe ?? a?.rpe };
    // Abgehakt bedeutet abgeschlossen, nicht dass die geplante Dauer gemessen wurde.
    if (toNum(record.metrics?.min) == null && toNum(record.icuLoad) == null) return;
    out.push({ date, sport: s.sport, key, load: sessionLoad(s, record, thrOf(state)) });
  };
  planDays(weeks).forEach(d => (d.sessions || []).forEach(s => { const st = state.sessions?.[s.id]; if (st?.completed) add(d.date, s, st, 'session:' + s.id); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, list]) => (list || []).forEach(w => add(d, w, w, 'custom:' + w.id)));
  recordedActivities(state).forEach(a => {
    if (!a || a.mergedInto || seen.has('act:' + a.id)) return;
    if (a.sessionId && seen.has('session:' + a.sessionId)) return;
    add(a.date, { sport: a.sport, title: a.name, plannedMinutes: a.min }, { activityId: a.id, metrics: { min: a.min, hr: a.avgHr, power: a.avgPower }, rpe: a.rpe, icuLoad: a.icuLoad }, 'act:' + a.id);
  });
  return out;
}
function dailyLoads(state, weeks) {
  const loads = {};
  dailyLoadEntries(state, weeks).forEach(e => { if (e.load > 0) loads[e.date] = (loads[e.date] || 0) + e.load; });
  return loads;
}
function ownLoadSeries(state, weeks, upto) {
  return loadSeriesFromDaily(dailyLoads(state, weeks), state.trend || [], upto, state.settings || {});
}

/* Belastung für die Planung: Fitness (CTL) und Müdigkeit (ATL) aus intervals.icu, sonst aus den eigenen Einheiten.
   Nach einer Krankheit zählt zusätzlich die Fitness vor der Krankheit (der Einbruch durch die Pause ist keine echte Formänderung). */
function loadBaseline(state, weeks, today) {
  const tr = (state.trend || []).filter(p => p && p.date <= today && num(p.ctl) != null && p.ctl > 0).sort((a, b) => a.date.localeCompare(b.date));
  let ctl = null, atl = null, source = null;
  const own = ownLoadSeries(state, weeks || [], today);
  const o = own[own.length - 1];
  if (o) { ctl = o.ctl; atl = o.atl; source = o.source; }
  const ill = (state.illnessPeriods || []).filter(p => p && p.start && p.start <= today && (!p.end || p.end >= addDays(today, -21))).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
  let preIllnessCtl = null;
  // Median der 14 Tage davor (ein einzelner Spitzenwert soll den Wiedereinstieg nicht hochtreiben)
  if (ill) { const before = tr.filter(p => p.date < ill.start && p.date >= addDays(ill.start, -14)).map(p => p.ctl).sort((a, b) => a - b); if (before.length) preIllnessCtl = before[Math.floor((before.length - 1) / 2)]; }
  const entries = dailyLoadEntries(state, weeks).filter(e => e.date <= today);
  const dates = [...new Set(entries.map(e => e.date))].sort();
  const recentAnchor = tr.some(p => p.date >= addDays(today, -3));
  // Mindestdaten für eine Umfangsableitung, keine Aussage über Gesundheit oder Belastbarkeit.
  const reliable = recentAnchor || (dates.length >= 14 && dates[0] <= addDays(today, -28));
  return { ctl, atl, source, reliable, preIllnessCtl, illness: ill ? { start: ill.start, end: ill.end || null } : null };
}

/* ---------- Hilfen für Anpassungen ---------- */
/* Auftrag 18: Trainingspause ohne Krankheit: Tage seit der letzten erledigten eigenen Einheit (null ohne Verlauf). Krankheitstage zählen
   nicht als Pause (dafür gilt der Stufenplan nach Krankheit). */
function doneDates(state, weeks) {
  const out = new Set();
  planDays(weeks || []).forEach(d => (d.sessions || []).forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && s.sport !== 'football' && s.sport !== 'rest') out.add(d.date); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l || []).forEach(c => { if (c && c.completed !== false && c.sport !== 'football') out.add(d); }));
  recordedActivities(state).forEach(a => { if (a && a.sport !== 'football') out.add(a.date); });
  return [...out].sort();
}
/* Rückkehr nach einer Pause: wurde heute oder gestern wieder trainiert und lag davor eine Pause ohne Krankheit, deren Länge in Tagen */
function returnAfterPause(state, weeks, date) {
  const ds = doneDates(state, weeks).filter(d => d <= date);
  const last = ds[ds.length - 1], prev = ds[ds.length - 2];
  if (!last || !prev || last < addDays(date, -1)) return null;
  let gap = 0; for (let d = addDays(prev, 1); d < last; d = addDays(d, 1)) if (!illnessAt(state.illnessPeriods, d)) gap++;
  return gap;
}
function trainingGap(state, weeks, date) {
  let last = null;
  const take = d => { if (d < date && (!last || d > last)) last = d; };
  planDays(weeks || []).forEach(d => (d.sessions || []).forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && s.sport !== 'football' && s.sport !== 'rest') take(d.date); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l || []).forEach(c => { if (c && c.completed !== false && c.sport !== 'football') take(d); }));
  recordedActivities(state).forEach(a => { if (a && a.sport !== 'football') take(a.date); });
  if (!last) return null;
  // nur wer vorher regelmäßig eingetragen hat (mindestens 4 Tage in den 3 Wochen davor): sonst fehlen nur Daten
  const before = doneDates(state, weeks).filter(d => d <= last && d > addDays(last, -21)).length;
  if (before < 4) return null;
  let gap = 0;
  for (let d = addDays(last, 1); d < date; d = addDays(d, 1)) if (!illnessAt(state.illnessPeriods, d)) gap++;
  return gap;
}
/* Wiedereinstieg nach einer Pause: Umfang je nach Länge (bis 1 Woche 90 %, 2-4 Wochen 70 %, länger 60 %) */
function pauseFactor(gap) { return gap == null || gap < 8 ? 1 : gap <= 14 ? 0.9 : gap <= 28 ? 0.7 : 0.6; }
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
  planDays(weeks).forEach(d => { if (d.date >= from && d.date <= date) d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.notes) texts.push(st.notes); if (st && st.deviation) texts.push(st.deviation); }); });
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
/* Auftrag 18: stärkster Schmerz der letzten 7 Tage (Körperteil und Wert 0-10); ab 4/10 ersetzt die App Laufen durch Rad oder Schwimmen */
function painInfo(state, weeks, date) {
  const from = addDays(date, -6); const texts = [];
  planDays(weeks).forEach(d => { if (d.date >= from && d.date <= date) d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.notes) texts.push(st.notes); if (st && st.deviation) texts.push(st.deviation); }); });
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d >= from && d <= date) (l || []).forEach(w => { if (w.description) texts.push(w.description); }); });
  (state.trend || []).forEach(p => { if (p && p.date >= from && p.date <= date && p.illness) texts.push(p.illness); });
  let best = null;
  for (const t of texts) { let m; PAIN_RE.lastIndex = 0; while ((m = PAIN_RE.exec(t))) { const v = parseFloat(m[2].replace(',', '.')); if (v <= 10 && (!best || v > best.level)) best = { part: PAIN_NAMES[m[1].toLowerCase()] || 'Schmerz', level: v }; } }
  return best;
}
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
function isSweetSpot(s) { return !!s && s.sport === 'bike' && !s.pattern && !(s.spec && s.spec.lib) && !/^(Zone 2|Locker) statt/.test(s.title || '') && /sweet/i.test((s.title || '') + ' ' + (s.zone || '')); }
const round5 = x => Math.max(5, Math.round(x / 5) * 5);
const r1 = x => Math.round(x * 10) / 10;
const DOW_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dowDe(s) { return DOW_DE[new Date(s + 'T12:00:00Z').getUTCDay()]; }
function dm(s) { const p = s.split('-'); return p[2] + '.' + p[1] + '.'; }
function sessDone(state, s) { const st = (state.sessions || {})[s.id]; return !!(st && st.completed); }
function sessSkipped(state, s) { const st = (state.sessions || {})[s.id]; return !!(st && st.skipped); }

/* ---------- Täglich (morgens) ---------- */
/* Darf die Einheit an diesem Tag liegen? Harte Regeln der Person und Tagesgrenzen (Auftrag 5 A4) */
function ruleOk(rules, s, date, others) {
  if (evaluate(rules, s, date).hard.length) return false;
  const lim = dayLimit(rules.filter(r => r.strength === 'hard'), date, false);
  const used = (others || []).filter(x => x && x.sport !== 'rest' && !x.cancelled && !x.fixed && x.id !== s.id).reduce((a, x) => a + (x.plannedMinutes || 0), 0);
  return used + (s.plannedMinutes || 0) <= lim.cap + 5;
}
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
  const rules = rulesOf(state.profile, parseFor(date));

  // 1) Schutzregeln für heute: Lauf-Intervalle ohne Freigabe oder bei Leistenschmerz
  live(date).forEach(s => {
    if (s.sport === 'run' && isIntervals(s) && !sessDone(state, s) && (!meta.runIntervalsAllowed || pain)) {
      push({ id: 'guard-' + s.id, type: 'modify', sessionId: s.id, group: 'daily-' + date,
        set: { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', description: 'Lauf-Intervalle sind ' + (pain ? 'wegen ' + painLabel(pain) + ' über 2/10 ' : '') + 'gerade nicht freigegeben. Locker in Zone 2 laufen.' },
        what: `${s.title} → lockerer Lauf in Zone 2`, reason: pain ? painLabel(pain) + ' über 2/10 in deinen Notizen' : 'Lauf-Intervalle hat der Coach noch nicht freigegeben' });
    }
  });

  // 1b) Auftrag 18: Schmerz ab 4/10 – Laufen heute und die nächsten 2 Tage durch lockeres Rad (sonst Schwimmen) gleicher Dauer ersetzen
  const pi = painInfo(state, weeks, date);
  if (pi && pi.level >= 4) {
    const prof = state.profile || {}; const sp = prof.sports || [];
    const why0 = `Schmerz ${String(pi.level).replace('.', ',')}/10${pi.part ? ' (' + pi.part + ')' : ''}: Laufen pausieren, locker Rad oder Schwimmen gleich lang. Wird es nicht besser oder hinkst du, bitte zu Arzt oder Physio`;
    let any = false;
    for (const dd of [date, addDays(date, 1), addDays(date, 2)]) live(dd).forEach(s0 => {
      if (s0.sport !== 'run' || sessDone(state, s0) || isTestOrRace(s0)) return;
      const min = s0.plannedMinutes || 30; let set = null;
      if (sp.includes('bike') && ruleOk(rules, Object.assign({}, s0, { sport: 'bike', hard: false, long: false }), dd, live(dd))) { const b = W.build(Object.assign(W.bikeEasy(Object.assign({}, s0.spec ? s0.spec.ctx : {}, { indoor: false }), min), { why: 'Statt Laufen: schont die schmerzende Stelle und hält die Ausdauer.' })); set = { sport: 'bike', title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: null, zone: b.zone, description: b.description, spec: b.spec, hard: false, long: false }; }
      else if (sp.includes('swim') && ruleOk(rules, Object.assign({}, s0, { sport: 'swim', hard: false, long: false }), dd, live(dd))) set = { sport: 'swim', title: 'Lockeres Schwimmen ' + min + ' min', plannedMinutes: min, plannedKm: null, zone: 'Zone 2', description: 'Statt Laufen locker schwimmen, ohne Schmerz. Brust oder Kraul, wie es angenehm ist.', spec: null, hard: false, long: false };
      if (push({ id: 'pain-' + s0.id, type: set ? 'modify' : 'cancel', sessionId: s0.id, group: 'daily-' + date, set, what: s0.title + (set ? ' → ' + set.title : ' entfällt'), reason: why0 })) any = true;
    });
    if (any) push({ id: 'pain-note-' + date, type: 'note', group: 'daily-' + date, what: 'Laufen pausiert', reason: why0 });
  }

  // 1c) Auftrag 18: Wiedereinstieg nach einer Pause ohne Krankheit (Urlaub, Prüfungen, Verletzung): die nächsten 7 Tage ohne Intensität,
  //     nach mehr als 2 Wochen Pause auch kürzer (70 %, über 4 Wochen 60 %)
  const gap = returnAfterPause(state, baseWeeks, date);
  if (gap != null && gap >= 8) {
    const f = pauseFactor(gap); const g = 'pause-' + date;
    const why1 = `Wiedereinstieg nach ${gap} Tagen Pause: eine Woche ohne Intensität${f < 0.9 ? `, Umfang etwa ${Math.round(f * 100)} %` : ''}. Danach steigt es wieder Schritt für Schritt`;
    let n = 0;
    for (let k = 0; k < 7; k++) { const dd = addDays(date, k); live(dd).forEach(s0 => {
      if (sessDone(state, s0) || isTestOrRace(s0) || isGame(s0) || s0.fixed || s0.stage) return;
      const hard = isIntervals(s0);
      if (!hard && f >= 0.9) return;
      const mins = s0.plannedMinutes ? round5(s0.plannedMinutes * (f < 0.9 ? f : 1)) : null;
      if (push({ id: 'pause-' + s0.id, type: 'modify', sessionId: s0.id, group: g, set: Object.assign({}, hard ? { title: 'Zone 2 statt: ' + s0.title, zone: 'Zone 2', hard: false } : {}, mins ? { plannedMinutes: mins, plannedKm: s0.plannedKm ? r1(s0.plannedKm * f) : null } : {}),
        what: `${s0.title}${hard ? ' → locker in Zone 2' : ''}${mins && mins !== s0.plannedMinutes ? `, ${mins} min` : ''}`, reason: why1 })) n++;
    }); }
    if (n) push({ id: 'pause-note-' + date, type: 'note', group: g, what: 'Wiedereinstieg nach der Pause', reason: why1 });
  }

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
        if (!ruleOk(rules, s, to, live(to))) continue;           // nie gegen die Regeln der Person (Auftrag 5)
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
  st = st || {}; const m = actualMetrics(st, act);
  const rpe = toNum(st.rpe), min = toNum(m.min);
  if (/abgebrochen|nicht geschafft|zu schwer/i.test(st.notes || '')) return { ok: false, why: 'laut Notiz zu schwer' };
  if (rpe != null && rpe >= 9) return { ok: false, why: 'RPE ' + rpe + ' (sehr hart)' };
  const longest = toNum(m.longestCrawl);
  if (s.stage.ladder !== 'runwalk' && longest) {
    const need = Math.max(...((s.spec && s.spec.steps) || []).filter(x => x.mode === 'crawl').map(x => x.m || 0), 0);
    if (need && longest >= need) return { ok: true, why: longest + ' m am Stück gemessen' };
  }
  if (s.stage.ladder !== 'runwalk') return { ok: false, why: longest ? `${longest} m Kraul nachgewiesen; Ziel noch nicht erreicht` : 'kein Nachweis der Kraulstrecke' };
  if (min != null && s.plannedMinutes && min >= s.plannedMinutes * 0.9) return { ok: true, why: Math.round(min) + ' von ' + s.plannedMinutes + ' min geschafft' };
  if (rpe != null && rpe <= 7) return { ok: true, why: 'RPE ' + rpe };
  if (min == null && rpe == null) return { ok: false, why: 'keine Messdaten und keine RPE' };
  return { ok: false, why: 'noch nicht ganz geschafft' };
}
function stageSession(s, n, ctxPatch?) {
  // aktuelle Ausrüstung und Beckenlänge aus dem Profil (nicht der alte Stand in der Einheit)
  const ctx = { ...((s.spec && s.spec.ctx) || {}), ...(ctxPatch || {}) };
  const why = s.spec && s.spec.why; const tip = s.spec && s.spec.tip;
  let spec;
  if (s.stage.ladder === 'runwalk') {
    if (n >= W.RUNWALK_LADDER.length) { spec = W.runEasy(ctx, 30); spec.why = 'Du kannst jetzt 30 min am Stück laufen: ab hier normale lockere Läufe.'; }
    else { spec = W.runWalk(ctx, n, why); }
  } else {
    const L = s.stage.ladder === 'swimBreast' ? W.SWIM_BREAST_LADDER : W.SWIM_LADDER;
    // Kraul-Weg endet nach den 200-m-Stücken (Auftrag 11): ab da normales Training mit Technik-Anteil
    if (n >= L.length || (s.stage.ladder === 'swim' && n >= 6)) {
      // Brust-Weg fertig → Kraul-Weg ab Stufe 2, Kraul-Weg fertig → normales Schwimmen
      if (s.stage.ladder === 'swimBreast') spec = W.swimLearn(ctx, { ladder: 'swim', n: 2, breast: true }, why);
      else spec = W.swimNormal(ctx, 'technique', s.plannedMinutes || 45, 'base', 200);
    } else spec = W.swimLearn(ctx, { ...s.stage, n }, why, s.spec && s.spec.fillMin);
    // Auftrag 17: Schwerpunkt der Einheit (Technik, Beinschlag, Pull Buoy …) bleibt, Hilfsmittel nach der aktuellen Ausrüstung
    spec = K.swimVariant(spec, K.swimFocusIndex(s.spec && s.spec.variant, ctx.gear, spec.stage), 1, 'base');
    if (s.spec && s.spec.fillMin) spec = K.fitSwim(spec, s.spec.fillMin);
  }
  if (tip && !spec.tip) spec.tip = tip;
  const b = W.build(spec);
  return { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, stage: b.stage || null, zone: b.zone };
}

/* Auftrag 17: Schwimm-Nachweise je erledigter Einheit, nur tatsächlich eingetragene oder gemessene Werte (nie das Soll der Einheit).
   target = längstes geplantes Kraul-Stück der Einheit (nur zum Vergleich), stage = Lernstufe, in der sie geplant war. */
function swimProofs(state, weeks, date, days = 42) {
  const out = []; const from = addDays(date, -days); const used = new Set();
  const plannedTarget = s => Math.max(0, ...((s && s.spec && s.spec.steps) || []).filter(x => x.mode === 'crawl').map(x => x.m || 0)) || null;
  const pos = v => { const n = toNum(v); return n != null && n > 0 ? n : null; };
  const add = (d, key, st, act, s) => {
    if (act) used.add(act.id);
    const m = actualMetrics(st, act);
    out.push({ date: d, key, crawl: pos(m.longestCrawl), pull: pos(m.longestPull), target: plannedTarget(s), stage: s && s.stage && s.stage.ladder !== 'runwalk' ? { ladder: s.stage.ladder, n: s.stage.n } : null, manual: !act || st.metricsSrc?.longestCrawl === 'manual' || !!st.metricsManual?.longestCrawl });
  };
  planDays(applyAdjustments(weeks, state.adjustments || {})).filter(d => d.date <= date && d.date > from).forEach(d => d.sessions.filter(s => s.sport === 'swim' && !s.cancelled).forEach(s => {
    const st = (state.sessions || {})[s.id]; if (!st || !st.completed) return;
    add(d.date, s.id, st, st.activityId ? (state.activities || {})[st.activityId] : null, s);
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d <= date && d > from) (l || []).forEach(c => { if (c && c.sport === 'swim' && c.completed !== false) add(d, c.id, c, c.activityId ? (state.activities || {})[c.activityId] : null, null); }); });
  recordedActivities(state).filter(a => a.sport === 'swim' && !a.sessionId && !used.has(a.id) && a.date <= date && a.date > from).forEach(a => {
    const c = toNum(a.swim && a.swim.longestCrawlM);
    out.push({ date: a.date, key: a.id, crawl: c != null && c > 0 ? c : null, pull: null, target: null, stage: null, manual: false });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
/* Auftrag 17: Meter pro Minute (mit Pausen) aus erledigten Schwimmeinheiten der letzten 6 Wochen mit eingetragener oder gemessener
   Strecke und Dauer. Mindestens 2 Einheiten, sonst null (dann rechnet die App mit dem Modell). */
function swimRate(state, weeks, date) {
  let m = 0, min = 0, n = 0; const from = addDays(date, -42);
  const look = (st, act) => { const x = actualMetrics(st, act); const meters = toNum(x.meters) ?? (toNum(x.km) != null ? toNum(x.km) * 1000 : null), mi = toNum(x.min);
    if (meters && mi && meters >= 200 && mi >= 15 && meters / mi < 80) { m += meters; min += mi; n++; } };
  planDays(weeks).filter(d => d.date <= date && d.date > from).forEach(d => d.sessions.filter(s => s.sport === 'swim').forEach(s => {
    const st = (state.sessions || {})[s.id]; if (st && st.completed) look(st, st.activityId ? (state.activities || {})[st.activityId] : null);
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d <= date && d > from) (l || []).forEach(c => { if (c && c.sport === 'swim' && c.completed !== false) look(c, c.activityId ? (state.activities || {})[c.activityId] : null); }); });
  return n >= 2 ? Math.round(m / min * 10) / 10 : null;
}
/* Auftrag 20: eigenes Schwimm-Tempo ohne Pausen (s/100 m, von der Uhr oder eingetragen) aus erledigten Schwimmeinheiten der letzten 6 Wochen,
   Median, mindestens 2 Einheiten. Damit rechnet die App Kraul und Brust, solange es keine Schwimm-Schwelle (CSS) gibt. */
function swimPace100(state, weeks, date) {
  const vals = []; const from = addDays(date, -42);
  const sec = v => (typeof v === 'number' ? v : paceSec(v));
  const used = new Set();
  const look = (st, act) => { if (act && act.id) used.add(act.id); const p = sec(actualMetrics(st, act).pace100); if (p && p >= 70 && p <= 240) vals.push(p); };
  planDays(weeks).filter(d => d.date <= date && d.date > from).forEach(d => d.sessions.filter(s => s.sport === 'swim').forEach(s => {
    const st = (state.sessions || {})[s.id]; if (st && st.completed) look(st, st.activityId ? (state.activities || {})[st.activityId] : null);
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d <= date && d > from) (l || []).forEach(c => { if (c && c.sport === 'swim' && c.completed !== false) look(c, c.activityId ? (state.activities || {})[c.activityId] : null); }); });
  recordedActivities(state).filter(a => a.sport === 'swim' && !a.sessionId && !used.has(a.id) && a.date <= date && a.date > from).forEach(a => look(null, a));
  if (vals.length < 2) return null;
  vals.sort((a, b) => a - b); return Math.round(vals[Math.floor((vals.length - 1) / 2)]);
}
/* Bestätigt = in mindestens 2 verschiedenen Einheiten geschafft (der zweitbeste Wert). Ein einzelner Wert ist ein Bestwert, keine neue Stufe. */
function confirmedOf(values) { const v = (values || []).filter(x => x != null && x > 0).sort((a, b) => b - a); return v.length >= 2 ? v[1] : 0; }
const swimCtxOf = state => { const sk = (state.profile || {}).skills || {}; return { gear: Array.isArray(sk.swimGear) ? [...sk.swimGear] : [], pool: sk.poolM === 50 ? 50 : 25 }; };
const swimStageOfM = m => { const s = W.swimLadderStart({ swimCrawl: 'some', swimCrawlM: m }); return s ? s.n : 6; };
/* Eigene Angabe als Ausgangswert: Fragebogen, Profil oder Satz im Coach. Alte Profilwerte ohne Herkunft gelten nur, solange keine
   eigenen Ergebnisse vorliegen (sie können aus einer früheren Uhr-Übernahme stammen). */
function trustedCrawlBase(state, known) {
  const sk = (state.profile || {}).skills || {}; const ev = sk.swimEvidence && sk.swimEvidence.crawl;
  const prof = toNum(sk.swimCrawlM);
  if (ev) return ev.manual ? prof : toNum(ev.baseline);
  return known.length ? null : prof;
}
/* Kraul-Stufe aus den Nachweisen (Auftrag 17): die nächste Stufe erst, wenn ihre Strecke in 2 verschiedenen Einheiten geschafft wurde
   (eingetragen oder gemessen, nie nach Zeit oder Plan). Zweimal hintereinander kürzer als geplant: eine Stufe leichter; danach
   braucht es wieder 2 Einheiten für die höhere Stufe. Ohne eingetragene Strecke: Stufe wiederholen. */
function swimStageVerdict(state, weeks, date, cur) {
  const all = swimProofs(state, weeks, date, 42);
  const known = all.filter(p => p.crawl != null);
  const fail = p => !!p.stage && p.target != null && p.crawl < p.target;
  let cut = 0, down = null;
  for (let i = 1; i < known.length; i++) if (fail(known[i]) && fail(known[i - 1])) { cut = i + 1; down = Math.max(0, known[i].stage.n - 1); }
  const conf = confirmedOf(known.slice(cut).map(p => p.crawl));
  const best = Math.max(0, ...known.map(p => p.crawl));
  if (down != null) {
    const n = conf ? Math.max(down, swimStageOfM(conf)) : down;
    return { n, conf, best, why: n > down ? `${conf} m Kraul am Stück in 2 Einheiten geschafft` : 'zweimal kürzer geschafft als geplant: eine Stufe leichter, das ist kein Rückschritt' };
  }
  // Technik-Stufe ohne Kraul-Strecke (Wassergewöhnung): weiter nach 2 erledigten Einheiten ohne „zu schwer“
  if (cur === 0 && !known.length) {
    const ok = all.filter(p => p.stage && p.stage.n === 0).length >= 2 && !planDays(weeks).some(d => d.date <= date && d.date > addDays(date, -21) && d.sessions.some(s => s.stage && s.stage.n === 0 && /zu schwer|abgebrochen/i.test(((state.sessions || {})[s.id] || {}).notes || '')));
    return { n: ok ? 1 : 0, conf, best, why: ok ? '2 Einheiten Wassergewöhnung geschafft' : 'Stufe wiederholen' };
  }
  const base = trustedCrawlBase(state, known);
  const m = Math.max(conf, base || 0);
  if (!m) return { n: cur, conf, best, why: best ? `${best} m Kraul am Stück eingetragen; für eine neue Stufe braucht es 2 Einheiten mit dieser Strecke` : 'keine Strecke Kraul am Stück eingetragen: Stufe wiederholen' };
  const n = Math.max(Math.min(cur, 1), swimStageOfM(m));
  const why = n > cur ? `${conf || m} m Kraul am Stück in 2 Einheiten geschafft` : n < cur ? `nachgewiesen sind ${m} m Kraul am Stück: Stufe passend dazu` : best > m ? `${best} m einmal geschafft; die nächste Stufe kommt nach der zweiten Einheit mit dieser Strecke` : `${m} m Kraul am Stück nachgewiesen: Stufe bleibt`;
  return { n, conf, best, why };
}

/* Längste Strecke Kraul am Stück (Uhr oder Feld) der letzten 8 Wochen */
function longestCrawl(state, weeks, date) {
  let best = toNum(((state.profile || {}).skills || {}).swimCrawlM) || 0;
  planDays(weeks).filter(d => d.date <= date && d.date > addDays(date, -56)).forEach(d => d.sessions.filter(s => s.sport === 'swim').forEach(s => {
    const st = (state.sessions || {})[s.id]; if (!st || !st.completed) return;
    const act = st.activityId ? (state.activities || {})[st.activityId] : null;
    best = Math.max(best, toNum(actualMetrics(st, act).longestCrawl) || 0);
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d <= date && d > addDays(date, -56)) (l || []).forEach(c => { if (c && c.sport === 'swim' && c.completed !== false) best = Math.max(best, toNum((c.metrics || {}).longestCrawl) || 0); }); });
  return best;
}
function lastCrawlCheck(state, weeks, date) {
  const done = planDays(weeks).filter(d => d.date <= date && d.date > addDays(date, -21)).flatMap(d => d.sessions.filter(s => /Kraul-Check/.test(s.title || '') && sessDone(state, s)).map(s => ({ s, date: d.date }))).sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!done) return null;
  const st = state.sessions[done.s.id] || {}; const act = st.activityId ? (state.activities || {})[st.activityId] : null;
  const m = toNum(actualMetrics(st, act).longestCrawl);
  return m ? { m, date: done.date } : null;
}

/* Auftrag 17: tatsächlich erledigtes eigenes Training (ohne Teamsport) in Minuten je Kalenderwoche. Erledigt ohne Dauer zählt mit der
   geplanten Dauer (Schätzung: die Einheit wurde gemacht). Aufzeichnungen ohne Zuordnung zählen dazu, nichts doppelt. */
function ownDoneMinutes(state, weeks, mon, sun) {
  let min = 0, n = 0; const used = new Set();
  planDays(applyAdjustments(weeks, state.adjustments || {})).filter(d => d.date >= mon && d.date <= sun).forEach(d => d.sessions.forEach(x => {
    const st = (state.sessions || {})[x.id]; if (!st || !st.completed || x.sport === 'football' || x.sport === 'rest' || x.race) return;
    const act = st.activityId ? (state.activities || {})[st.activityId] : null; if (act) used.add(act.id);
    min += toNum(actualMetrics(st, act).min) ?? x.plannedMinutes ?? 0; n++;
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d >= mon && d <= sun) (l || []).forEach(c => {
    if (!c || c.sport === 'football' || c.completed === false) return;
    const act = c.activityId ? (state.activities || {})[c.activityId] : null; if (act) used.add(act.id);
    const m = toNum(actualMetrics(c, act).min); if (m) { min += m; n++; }
  }); });
  recordedActivities(state).filter(a => a.date >= mon && a.date <= sun && !a.sessionId && !used.has(a.id) && a.sport !== 'football' && toNum(a.min)).forEach(a => { min += toNum(a.min); n++; });
  return { min: Math.round(min), n };
}
/* Bezug für die Steigerung: das meiste eigene Training einer der letzten 3 abgeschlossenen Wochen. Wochen mit mindestens 2 Krankheitstagen
   zählen nicht, dafür geht es eine Woche weiter zurück (höchstens 5 Wochen). null ohne Daten. */
function recentOwnMinutes(state, weeks, date) {
  const mon = addDays(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const vals = []; let looked = 0;
  for (let k = 1; k <= 5 && looked < 3; k++) {
    const m = addDays(mon, -7 * k), s = addDays(m, 6);
    let sick = 0; for (let d = m; d <= s; d = addDays(d, 1)) if (illnessAt(state.illnessPeriods, d)) sick++;
    if (sick >= 2) continue;
    looked++;
    const r = ownDoneMinutes(state, weeks, m, s); if (r.n >= 2) vals.push(r.min);
  }
  return vals.length ? Math.max(...vals) : null;
}

/* Auftrag 17: längste wirklich erledigte Einheit einer Sportart (Minuten) in den letzten 4 Wochen; null ohne Daten */
function recentLongest(state, weeks, date, sport, days = 28) {
  let best = 0; const from = addDays(date, -days);
  planDays(applyAdjustments(weeks, state.adjustments || {})).filter(d => d.date < date && d.date >= from).forEach(d => d.sessions.forEach(x => {
    const st = (state.sessions || {})[x.id]; if (!st || !st.completed || x.sport !== sport || x.race) return;
    const m = toNum(actualMetrics(st, st.activityId ? (state.activities || {})[st.activityId] : null).min); if (m) best = Math.max(best, m);
  }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => { if (d < date && d >= from) (l || []).forEach(c => { if (c && c.sport === sport && c.completed !== false) { const m = toNum(actualMetrics(c, null).min); if (m) best = Math.max(best, m); } }); });
  recordedActivities(state).filter(a => a.sport === sport && !a.sessionId && a.date < date && a.date >= from).forEach(a => { if (toNum(a.min)) best = Math.max(best, toNum(a.min)); });
  return best || null;
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
  const entries = dailyLoadEntries(state, weeks).filter(e => e.date >= mon && e.date <= sun);
  done = entries.filter(e => e.key.startsWith('session:')).reduce((sum, e) => sum + e.load, 0);
  extra = entries.filter(e => !e.key.startsWith('session:')).reduce((sum, e) => sum + e.load, 0);
  const illness = state.illnessPeriods || [];
  const end = sun > date ? date : sun;
  const nDays = Math.round((+new Date(end + 'T12:00:00Z') - +new Date(mon + 'T12:00:00Z')) / 86400000) + 1;
  const hist = readinessHistory(state.trend, illness, end, Math.max(1, nDays), (state.settings || {}).readiness);
  const lv = hist.filter(h => h.level != null && h.level !== 3);
  const sick = days.some(d => illnessAt(illness, d.date));
  const lt = ownLoadSeries(state, weeks, date).at(-1);
  const sleeps = (state.trend || []).filter(p => p && p.date >= mon && p.date <= sun && num(p.sleepHours) != null).map(p => p.sleepHours);
  return {
    mon, sun, planned, done: done + extra, doneInPlan: done, extra, nPlanned, nDone,
    ratio: planned ? (done + extra) / planned : null,
    green: lv.filter(h => h.level === 0).length, yellow: lv.filter(h => h.level === 1).length, red: lv.filter(h => h.level === 2).length, withValues: lv.length,
    history: hist, sick, missedKey, loadRatio: lt && lt.ctl > 0 ? lt.atl / lt.ctl : null,
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
  } else if (S.ratio != null && S.ratio >= 0.9) {
    pct = 0; why = 'Plan umgesetzt: eine Umfangssteigerung braucht einen geprüften Vorschlag anhand des Trainingsverlaufs';
  } else {
    why = S.ratio != null && S.ratio >= 0.7 ? `${ratioTxt}: Umfang bleibt gleich` : 'Zu wenig Daten für eine Änderung';
  }
  // Auftrag 18: Großteil der Woche ausgelassen (ohne Krankheit): die nächste Woche wiederholt diese Woche statt zu steigern
  if (!S.sick && S.red < 2 && S.ratio != null && S.ratio < 0.5 && !next.isRecoveryWeek) {
    const [mT, sT] = weekRange(date);
    const ownOf = (list) => list.filter(x => !['football', 'rest'].includes(x.sport) && !x.cancelled && !x.race && !x.fixed).reduce((acc, x) => acc + (x.plannedMinutes || 0), 0);
    const thisOwn = ownOf(planDays(weeks).filter(d => d.date >= mT && d.date <= sT).flatMap(d => d.sessions));
    const nextOwn = ownOf(planDays([next]).flatMap(d => d.sessions));
    if (thisOwn > 0 && nextOwn > 0) { pct = Math.max(-20, Math.min(0, Math.round((thisOwn / nextOwn - 1) * 100))); why = `${ratioTxt}: der Großteil der Woche fehlt, deshalb wiederholt die nächste Woche diese Woche (kein Steigern)`; }
  }
  if (pct > 0 && pain) { pct = 0; why = painLabel(pain) + ' über 2/10: diese Woche keine Steigerung'; }
  if (pct > 0 && (returnStageActive(illness, addDays(date, 1)))) { pct = 0; why = 'Nach Krankheit gilt der Stufenplan'; }
  if (next.isRecoveryWeek) { pct = 0; why = 'Erholungswoche aus dem Plan bleibt bestehen'; }
  if (next.entry && pct < 0 && S.sick) { pct = 0; why = 'Nach der Krankheit ist die nächste Woche schon als Wiedereinstieg geplant (weniger Umfang, nichts Hartes)'; }
  if (meta.pattern && !S.sick && pct !== 0) { pct = 0; why = 'Fester Wochenplan: der Umfang bleibt. Die Ampel kürzt einzelne Tage, der Coach schlägt bei Bedarf eine leichtere Woche vor'; }
  // Auftrag 17: Steigerung gedeckelt durch das echte Training: die nächste Woche höchstens +10 % auf das, was diese Woche erledigt wurde
  // (gilt auch beim festen Wochenplan; nur wenn die Woche eingetragen wurde, sonst fehlen nur Daten)
  {
    const [m0, s0] = weekRange(date); const od = ownDoneMinutes(state, baseWeeks, m0, s0 > date ? date : s0);
    const own = planDays([next]).flatMap(d => d.sessions).filter(s => !['football', 'rest'].includes(s.sport) && !s.cancelled && !s.race && !s.fixed).reduce((a, s) => a + (s.plannedMinutes || 0), 0);
    const tracked = S.nPlanned > 0 && S.nDone >= S.nPlanned * 0.6;
    if (!S.sick && !next.isRecoveryWeek && tracked && od.min > 0 && own > od.min * 1.1 + 15) {
      const capPct = Math.round((od.min * 1.1 / own - 1) * 100);
      if (capPct < pct) { pct = capPct; why = `Diese Woche ${Math.round(od.min / 6) / 10} h eigenes Training erledigt: nächste Woche höchstens etwa 10 % mehr`.replace('.', ','); }
    }
  }
  pct = Math.max(-20, Math.min(10, pct));

  const nextSessions = planDays([next]).flatMap(d => d.sessions.map(s => Object.assign({}, s, { date: d.date })));
  const wRules = rulesOf(state.profile, parseFor(date));
  if (pct !== 0) {
    nextSessions.forEach(s => {
      if (!['swim', 'bike', 'run'].includes(s.sport) || s.cancelled || isTestOrRace(s) || !s.plannedMinutes) return;
      if (s.stage || s.race || s.fixed) return;
      const f = 1 + pct / 100;
      if (pct > 0 && !ruleOk(wRules, { ...s, plannedMinutes: round5(s.plannedMinutes * f) }, s.date, nextSessions.filter(x => x.date === s.date && x.id !== s.id && !x.cancelled))) return;
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

  // Auftrag 19: Leitern der Einheiten-Bibliothek: die nächste Stufe einer Form nur, wenn die letzte erledigt war und laut Messdaten bzw.
  // Anstrengung (RPE) passte. Nicht erledigt oder nicht ganz geschafft: Stufe wiederholen; zweimal nicht geschafft: eine Stufe leichter.
  {
    const lthrBike = (thrOf(state).lthrBike) || LTHR_DEFAULT.bike;
    const libDone = planDays(weeks).filter(d => d.date <= date && d.date > addDays(date, -28)).flatMap(d => d.sessions.filter(x => x && x.spec && x.spec.lib && LIB[x.spec.lib.key] && LIB[x.spec.lib.key].quality && ['run', 'bike'].includes(x.sport) && !x.cancelled).map(x => ({ s: x, st: (state.sessions || {})[x.id] || {}, date: d.date })))
      .sort((a, b) => a.date.localeCompare(b.date));
    const keys = [...new Set(libDone.map(x => x.s.spec.lib.key))];
    for (const key of keys) {
      const list = libDone.filter(x => x.s.spec.lib.key === key); const last = list[list.length - 1]; const prev = list[list.length - 2];
      const verdictOf = (x) => x.st.completed ? ladderVerdict(x.s, x.st, (state.activities || {})[x.st.activityId], lthrBike) : x.st.skipped || x.date < date ? { result: 'stay', why: 'nicht erledigt' } : null;
      const v = verdictOf(last); if (!v || v.result === 'up') continue;
      const pv = prev ? verdictOf(prev) : null;
      const target = v.result === 'fail' && pv && pv.result === 'fail' ? Math.max(0, last.s.spec.lib.stage - 1) : last.s.spec.lib.stage;
      const why = v.result === 'fail' && pv && pv.result === 'fail' ? `zweimal nicht geschafft (${v.why}): eine Stufe leichter` : `${v.why}: Stufe wiederholen`;
      nextSessions.filter(x => x.spec && x.spec.lib && x.spec.lib.key === key && x.spec.lib.stage > target && !x.cancelled && !x.locked).forEach(x => {
        const sp = x.sport === 'run' ? runQualitySpec(key, target, x.spec.ctx, ({ 'Halbmarathon-Tempo': 'run_half', 'Marathon-Tempo': 'run_marathon', '10-km-Tempo': 'run_10k', '5-km-Tempo': 'run_5k' } as Record<string, string>)[x.spec.lib.label || ''] || null, {}) : bikeQualitySpec(key, target, x.spec.ctx, null, { total: x.plannedMinutes });
        if (!sp) return; sp.why = x.spec.why; const b = W.build(sp); if (b.title === x.title) return;
        push({ id: `${group}-lib-${x.id}`, type: 'modify', sessionId: x.id, set: { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec },
          what: `${x.title} → ${b.title}`, reason: `${LIB[key].name}: ${why}` });
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
    let target = ladder === 'runwalk' && v.ok ? last.s.stage.n + 1 : last.s.stage.n;
    // Auftrag 17: Kraul-Stufe nur aus Nachweisen (2 verschiedene Einheiten), zweimal nicht geschafft → eine Stufe leichter
    if (ladder === 'swim') { const sv = swimStageVerdict(state, weeks, date, last.s.stage.n); target = sv.n; v.ok = sv.n > last.s.stage.n; v.why = sv.why; }
    // Brust-Weg: Technik-Stufen nach 2 erledigten Einheiten, zu Kraul (25-m-Stücke) erst, wenn 25 m Kraul in 2 Einheiten geschafft sind
    if (ladder === 'swimBreast') {
      const cur = last.s.stage.n, same = done.filter(x => x.s.stage.n === cur && !/zu schwer|abgebrochen/i.test(((state.sessions || {})[x.s.id] || {}).notes || ''));
      const conf = confirmedOf(swimProofs(state, weeks, date, 42).map(p => p.crawl));
      if (cur < W.SWIM_BREAST_LADDER.length - 1) { v.ok = same.length >= 2; target = v.ok ? cur + 1 : cur; v.why = v.ok ? '2 Einheiten dieser Stufe geschafft' : 'Stufe wiederholen'; }
      else { v.ok = conf >= 25; target = v.ok ? cur + 1 : cur; v.why = v.ok ? `${conf} m Kraul am Stück in 2 Einheiten geschafft` : 'für Kraul-Stücke braucht es 2 Einheiten mit mindestens 25 m Kraul am Stück'; }
    }
    nextSessions.filter(s => s.stage && s.stage.ladder === ladder && !s.cancelled && s.stage.n !== target).forEach(s => {
      const built = stageSession(s, target, ladder === 'runwalk' ? null : swimCtxOf(state)); if (!built) return;
      push({ id: `${group}-stage-${s.id}`, type: 'modify', sessionId: s.id, set: built, what: `${s.title} → ${built.title}`, reason: (v.ok ? 'Letzte Stufe hat geklappt (' : 'Stufe wiederholen (') + v.why + ')' });
    });
    stageWhy.push((v.ok ? 'nächste Stufe: ' : 'Stufe bleibt: ') + v.why);
  }

  // Schwimmtest: ab 400 m Kraul am Stück wird aus dem Kraul-Check der CSS-Test (400 m + 200 m)
  const crawlBest = longestCrawl(state, weeks, date);
  if (crawlBest >= 400) nextSessions.filter(s => s.sport === 'swim' && /Kraul-Check/.test(s.title || '') && !s.cancelled).forEach(s => {
    const b = W.build(W.swimTest((s.spec && s.spec.ctx) || {}));
    push({ id: `${group}-css-${s.id}`, type: 'modify', sessionId: s.id, set: { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, hard: true },
      what: `${s.title} → ${b.title}`, reason: `Du schaffst ${crawlBest} m Kraul am Stück: jetzt der Test für deine Schwimm-Schwelle (CSS)` });
  });

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
  return lo > 0 ? `${lo}-${hi} bpm` : `unter ${hi} bpm`;
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
  ruleOk,
  sessionTime, isEarly, zoneBpm, nutritionKcalLow, perfEntries, bests,
  addDays, illnessAt, hasRecovery, readinessFor, readinessHistory, readinessLine, levelOfScore, READY_WORDS, READY_GREEN, READY_YELLOW, baselineOf, BASE_DAYS, MIN_DAYS,
  isGame, isIntervals, isLong, isKey, isHard, isTestOrRace, sessionLoad, plannedLoad, applyAdjustments, activeAdjustments, planDays,
  recordedActivities, dailyLoadEntries, dailyLoads, ownLoadSeries, loadBaseline, groinFlag, painFlag, thrOf, ladderIndex, LADDER, dailyAdjustments, weeklyAdjustments, weekSummary, weekRange, returnStageActive, trainingGap, pauseFactor, returnAfterPause,
  isLocked, stageVerdict, stageSession, swimProofs, confirmedOf, swimStageVerdict, swimRate, swimPace100, ownDoneMinutes, recentOwnMinutes, recentLongest
};
