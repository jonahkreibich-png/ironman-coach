/* Auftrag 16: künstliche Aufzeichnungen für die Erkennung von Dauerlauf, Intervallen, Fahrtspiel und Hügeln.
   Abschnitte mit Tempo (m/s), Ziel-Puls, Watt und Steigung; Puls folgt verzögert, kleine feste Schwankungen (kein Zufall). */
import type { RawActivity, RawRecord, RawLap } from '../../shared/activity/types';

export interface Part { sec: number; speed: number; hr: number; power?: number; grade?: number; lap?: boolean }
export interface SimOpts { sport?: 'run' | 'bike'; laps?: 'auto' | 'manual' | 'none'; autoLapM?: number; noise?: number; alt?: boolean; power?: boolean; step?: number }

export function simulate(parts: Part[], o: SimOpts = {}): RawActivity {
  const sport = o.sport || 'run'; const step = o.step || 1; const noise = o.noise ?? 0.03;
  const recs: RawRecord[] = []; let t = 0, dist = 0, alt = 300, hr = parts[0].hr - 15;
  const bounds: number[] = []; // Ende jedes Abschnitts (Sekunden) für Runden von Hand
  for (const p of parts) {
    for (let s = 0; s < p.sec; s += step) {
      const wob = 1 + noise * (Math.sin(t / 7) * 0.6 + Math.sin(t / 23 + 1) * 0.4);
      const v = p.speed * wob;
      hr += (p.hr - hr) * Math.min(1, step / 20);
      dist += v * step; if (p.grade != null) alt += v * step * p.grade / 100;
      recs.push({ t, hr: Math.round(hr + Math.sin(t / 11) * 1.5), cad: null, power: o.power && p.power != null ? Math.round(p.power * wob) : null, dist: Math.round(dist), speed: Math.round(v * 100) / 100, alt: o.alt ? Math.round(alt * 10) / 10 : null, temp: null, lat: null, lon: null });
      t += step;
    }
    bounds.push(t);
  }
  const laps: RawLap[] = [];
  const lapOf = (t0: number, t1: number, trigger: number): RawLap => {
    const rs = recs.filter(r => r.t >= t0 && r.t < t1); const d0 = rs[0].dist!, d1 = rs[rs.length - 1].dist!;
    const hrs = rs.map(r => r.hr!); const pw = rs.map(r => r.power).filter((x): x is number => x != null);
    return { start: t0, sec: t1 - t0, dist: d1 - d0, avgHr: Math.round(hrs.reduce((a, x) => a + x, 0) / hrs.length), maxHr: Math.max(...hrs), avgSpeed: Math.round((d1 - d0) / (t1 - t0) * 100) / 100, avgPower: pw.length ? Math.round(pw.reduce((a, x) => a + x, 0) / pw.length) : null, intensity: 'active', trigger };
  };
  if (o.laps === 'manual') { let t0 = 0; bounds.forEach(b => { laps.push(lapOf(t0, b, 0)); t0 = b; }); }
  else if (o.laps !== 'none') {
    const every = o.autoLapM || 1000; let t0 = 0, next = every;
    for (const r of recs) if (r.dist! >= next) { laps.push(lapOf(t0, r.t, 2)); t0 = r.t; next += every; }
    if (t0 < t - 10) laps.push(lapOf(t0, t, 7));
  }
  const hrs = recs.map(r => r.hr!);
  return {
    format: 'fit', sport, startMs: Date.UTC(2026, 9, 18, 8), indoor: false,
    totals: { elapsedSec: t, movingSec: t, distanceM: dist, ascentM: null, kcal: null, avgHr: Math.round(hrs.reduce((a, x) => a + x, 0) / hrs.length), maxHr: Math.max(...hrs), avgPower: null, avgSpeed: dist / t },
    records: recs, laps, lengths: []
  };
}
/* Tempo aus Pace (min:s pro km) */
export const pace = (s: string) => { const [m, x] = s.split(':').map(Number); return 1000 / (m * 60 + x); };

/* Gespeicherte Aufzeichnung (Runden + verkleinerter Verlauf) wieder als RawActivity */
export function fromFixture(fx: any): RawActivity {
  const st = fx.streams; const recs: RawRecord[] = []; let dist = 0;
  for (let i = 0; i < st.t.length; i++) {
    const dt = i ? st.t[i] - st.t[i - 1] : 0; if (st.speed[i] != null) dist += st.speed[i] * dt;
    recs.push({ t: st.t[i], hr: st.hr[i], cad: null, power: st.power[i], dist: Math.round(dist), speed: st.speed[i], alt: st.alt[i], temp: null, lat: null, lon: null });
  }
  let start = 0;
  const laps: RawLap[] = fx.laps.map((l: any) => { const o = { start, sec: l.sec, dist: l.dist, avgHr: l.avgHr, maxHr: l.maxHr, avgSpeed: l.avgSpeed, avgPower: l.avgPower, intensity: 'active', trigger: null }; start += l.sec; return o; });
  return { format: 'fit', sport: fx.sport, startMs: Date.UTC(2026, 9, 18, 7), indoor: false, totals: { elapsedSec: fx.totals.movingSec, movingSec: fx.totals.movingSec, distanceM: fx.totals.distanceM, ascentM: null, kcal: null, avgHr: fx.totals.avgHr, maxHr: fx.totals.maxHr, avgPower: null, avgSpeed: fx.totals.distanceM / fx.totals.movingSec }, records: recs, laps, lengths: [] };
}
