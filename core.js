/* Gemeinsame Coach-Logik für App und Server (keine Abhängigkeiten, keine DOM-Zugriffe).
   Im Browser: window.CoachCore. Im Worker: import './core.js' und dann globalThis.CoachCore. */
(function (root) {
  'use strict';

  /* ---------- Datum ---------- */
  function addDays(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function illnessAt(periods, date) { return (periods || []).find(p => p && p.start && date >= p.start && (!p.end || date <= p.end)) || null; }
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const fmt = (v, d) => { const s = d != null ? Number(v).toFixed(d) : String(Math.round(v * 10) / 10); return s.replace('.', ','); };
  const sign = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);

  /* ---------- Phase 3: Tagesampel ---------- */
  const BASE_DAYS = 28;      // gleitende Grundlage
  const MIN_DAYS = 7;        // darunter gelten feste Rückfall-Grenzwerte
  const SLEEP_NEED = [8.5, 9];

  function stats(vals) {
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (vals.length - 1)) : 0;
    return { mean, sd, n: vals.length };
  }
  /* Persönlicher Normalbereich aus den 28 Tagen vor `date`, Krankheitstage ausgeschlossen. */
  function baselineOf(trend, illness, date, key, transform) {
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
   * fallback: { rhrMax, hrvMin, tempMax } aus den Einstellungen.
   */
  function readinessFor(trend, illness, date, fallback) {
    fallback = fallback || { rhrMax: 56, hrvMin: 65, tempMax: 0.5 };
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
      // Schlaf: Bedarf 8,5-9 h (Wachstum)
      if (num(p.sleepHours) != null || num(p.sleepQuality) != null) {
        const h = num(p.sleepHours), q = num(p.sleepQuality);
        const short = h != null && h < 7, poor = q != null && q < 5;
        const st = (short || poor) ? 'warn' : ((h != null && h < SLEEP_NEED[0]) ? 'mid' : 'ok');
        crits.push({ k: 'Schlaf', v: h != null ? fmt(h, 1) + ' h' : fmt(q, 0) + '/10', t: (h != null && q != null ? 'Qualität ' + fmt(q, 0) + ' · ' : '') + 'Bedarf 8,5-9 h', st: st === 'mid' ? 'ok' : st });
        if (h != null && h < SLEEP_NEED[0]) score -= (SLEEP_NEED[0] - h) * 8;
        if (q != null && q < 7) score -= (7 - q) * 3;
        if (short) bump(1, `Nur ${fmt(h, 1)} h geschlafen (du brauchst 8,5-9 h)`, 2);
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

  root.CoachCore = { addDays, illnessAt, hasRecovery, readinessFor, readinessHistory, baselineOf, BASE_DAYS, MIN_DAYS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
