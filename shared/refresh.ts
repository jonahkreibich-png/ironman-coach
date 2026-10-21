/* Neue Zonen in alle kommenden Einheiten übernehmen (Auftrag 9), für alle: Nach einem Test oder einem klaren Trend aus den Uhrdaten
   bekommen alle Einheiten ab morgen die neuen Puls-, Pace-, Watt- und Schwimm-Vorgaben (Bauplan neu gerechnet, Titel und Text passen).
   Der Coach zeigt an einem Beispiel vorher und nachher. */
import * as C from './core';
import * as W from './workouts';
import * as K from './keysessions';
import { paceCtx } from './plangen';
import { estimatesAt, legacyActivities } from './scores';
import { speedTrend, bikeSpeedsOf, mainKind, BIKE_KIND_LABEL, type BikeKind } from './bikespeed';

const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

export function refreshFuture(weeks: any[], profile: any, today: string): { weeks: any[]; changed: number; example: string | null } {
  let changed = 0; let example: string | null = null;
  const out = weeks.map((w: any) => ({ ...w, days: (w.days || []).map((d: any) => {
    if (d.date <= today) return d;
    return { ...d, sessions: (d.sessions || []).map((s: any) => {
      if (!s || !s.spec || s.race || s.fixed || !['run', 'bike', 'swim'].includes(s.sport)) return s;
      const old = s.spec.ctx || {};
      const ctx = { ...paceCtx(profile, !!old.indoor, old.bikeName ?? null, today), indoor: old.indoor, bikeName: old.bikeName };
      if (JSON.stringify({ ...old, indoor: undefined, bikeName: undefined }) === JSON.stringify({ ...ctx, indoor: undefined, bikeName: undefined })) return s;
      let spec = { ...s.spec, ctx };
      // Schwimmen (Auftrag 17): mit der eigenen Pace neu auf die geplante Dauer bringen (weniger Meter statt längerer Einheit)
      if (s.sport === 'swim' && s.plannedMinutes && W.totals(spec).min > s.plannedMinutes + 3) spec = K.fitSwim(JSON.parse(JSON.stringify(spec)), s.plannedMinutes);
      const b = W.build(spec);
      changed++;
      if (!example && (s.hard || /Schwelle|Sweet|Intervall|Tempo/i.test(s.title || ''))) {
        const z = Math.max(...spec.steps.filter((x: any) => x.part === 'main').map((x: any) => x.zone || 2));
        const before = W.intensity(s.spec, z), after = W.intensity(spec, z);
        if (before !== after) example = `${b.title} (${d.date.slice(8)}.${d.date.slice(5, 7)}.): vorher ${before.replace(/^Z\d: /, '')}, jetzt ${after.replace(/^Z\d: /, '')}`;
      }
      return { ...s, title: s.title === W.title(s.spec) ? b.title : s.title, description: b.description, plannedKm: b.plannedKm ?? s.plannedKm, ...(s.sport === 'swim' ? { plannedMinutes: b.plannedMinutes } : {}), spec: b.spec };
    }) };
  }) }));
  return { weeks: out, changed, example };
}

/* Klarer Trend aus den Uhrdaten: geschätzte Schwelle aus mindestens 4 Einheiten weicht deutlich ab (schneller ab 3 %, langsamer ab 5 %,
   höchstens 10 %). Höchstens alle 3 Wochen. Liefert die neuen Werte und einen Text mit vorher/nachher. */
export function trendThresholds(state: any, weeks: any[], profile: any, goal: any, today: string): { thresholds: Record<string, any>; settings: Record<string, any>; text: string } | null {
  const th = profile.thresholds || {};
  if (th.trendAt && th.trendAt > C.addDays(today, -21)) return null;
  const acts = [...C.recordedActivities(state), ...legacyActivities(state, weeks, profile)] as any[];
  if (!acts.length) return null;
  let est: any;
  try { est = estimatesAt({ today, activities: acts, trend: state.trend || [], illness: state.illnessPeriods || [], profile, goal }, today); } catch (e) { return null; }
  const ok = (cur: number, nu: number, lowerIsBetter: boolean) => { const d = lowerIsBetter ? (cur - nu) / cur : (nu - cur) / cur; return (d >= 0.03 && d <= 0.10) || (d <= -0.05 && d >= -0.10); };
  const t: Record<string, any> = {}, s: Record<string, any> = {}; const parts: string[] = [];
  if (est.nRun >= 4 && est.runThrSpeed && th.thresholdPaceRunSec) {
    const pace = Math.round(1000 / est.runThrSpeed);
    if (ok(th.thresholdPaceRunSec, pace, true)) { t.thresholdPaceRunSec = pace; s.thresholdPaceRunSec = pace; parts.push(`Schwellen-Pace ${mmss(th.thresholdPaceRunSec)} → ${mmss(pace)}/km`); }
  }
  if (profile.powerMeter && est.nBike >= 4 && est.ftp && th.ftp && ok(th.ftp, est.ftp, false)) { t.ftp = Math.round(est.ftp); parts.push(`FTP ${th.ftp} → ${t.ftp} W`); }
  if (est.nSwim >= 4 && est.swimCss && th.cssSec && ok(th.cssSec, est.swimCss, true)) { t.cssSec = Math.round(est.swimCss); parts.push(`CSS ${mmss(th.cssSec)} → ${mmss(t.cssSec)}/100 m`); }
  // Auftrag 12: Schwellen-Geschwindigkeit je Rad aus lockeren, flachen Fahrten (mindestens 3 je Rad)
  if (th.lthrBike > 0 && (profile.sports || []).includes('bike')) {
    const cur = bikeSpeedsOf(profile); const tr = speedTrend(acts, th.lthrBike, profile, today, C.addDays);
    const speeds: Record<string, number> = { ...(th.bikeSpeeds || {}) };
    (Object.keys(tr) as BikeKind[]).forEach(k => {
      const nu = tr[k]!.kmh, old = cur[k];
      if (ok(old, nu, false) || (!cur.measured[k] && Math.abs(nu / old - 1) >= 0.03 && Math.abs(nu / old - 1) <= 0.15)) {
        speeds[k] = nu; parts.push(`Schwellen-Tempo ${BIKE_KIND_LABEL[k]} ${String(old).replace('.', ',')} → ${String(nu).replace('.', ',')} km/h`);
        if (k === mainKind(profile)) { t.thresholdSpeedBikeKmh = nu; s.thresholdSpeedBikeKmh = nu; }
      }
    });
    if (JSON.stringify(speeds) !== JSON.stringify(th.bikeSpeeds || {})) t.bikeSpeeds = speeds;
  }
  if (!parts.length) return null;
  return { thresholds: { ...t, trendAt: today, source: `Trend aus deinen Einheiten (${today.slice(8)}.${today.slice(5, 7)}.)` }, settings: s, text: `Deine Einheiten der letzten Wochen zeigen eine klare Veränderung: ${parts.join(', ')}.` };
}
