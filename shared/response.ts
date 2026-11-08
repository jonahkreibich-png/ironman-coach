/* Auftrag 30, Punkt 7: persönliche Reaktion lernen – wie reagieren HFV, Ruhepuls, Leistung und RPE auf harte Wochen und auf Erholung?
   Bisher gab es das nicht (Rhythmus und Erholungstiefe hingen nur von Alter und Vorsicht ab). Aus den eigenen Daten der letzten 16 Wochen:
   - harte Woche = eigene Belastung mindestens 10 % über dem Schnitt der 4 Wochen davor
   - Reaktion = HFV (logarithmisch, gegen die eigene Basis) und Ruhepuls in den 3 Tagen nach der Woche, RPE der Einheiten der Woche,
     Erholung = sind HFV/Ruhepuls am Ende der folgenden lockeren Woche wieder normal?
   Ergebnis „langsam“ → Rhythmus 2+1, tiefere Erholungswochen (55–65 %), Steigerung höchstens 6 %, Tapering eher länger.
   „schnell“ → 3+1, Erholung 65–72 %. Zu wenige Daten → keine Anpassung (die Regeln nach Alter/Niveau gelten). */
import * as C from './core';

export interface Response {
  /** ausgewertete harte Wochen mit Morgenwerten */ n: number;
  hrvZ: number | null; rhrDelta: number | null; rpe: number | null; recovered: number | null;
  recovery: 'fast' | 'normal' | 'slow' | null;
  /** Empfehlung für den Planer */ buildWeeks: 2 | 3 | null; depth: [number, number] | null; incMax: number | null; longTaper: boolean;
  text: string;
}
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export function personalResponse(state: any, weeks: any[], today: string): Response {
  const none: Response = { n: 0, hrvZ: null, rhrDelta: null, rpe: null, recovered: null, recovery: null, buildWeeks: null, depth: null, incMax: null, longTaper: false, text: 'Noch zu wenige Morgenwerte nach harten Wochen – die App plant nach Alter und Erfahrung.' };
  try {
    const loads = C.dailyLoads(state, weeks) as Record<string, number>;
    const mon = (d: string) => C.addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
    const thisMon = mon(today);
    const wk: { mon: string; load: number }[] = [];
    for (let k = 20; k >= 1; k--) { const m = C.addDays(thisMon, -7 * k); let s = 0; for (let i = 0; i < 7; i++) s += loads[C.addDays(m, i)] || 0; wk.push({ mon: m, load: s }); }
    const trend = (state.trend || []) as any[];
    const at = (d: string) => trend.find(p => p && p.date === d) || null;
    const zs: number[] = [], rd: number[] = [], rp: number[] = [], rec: number[] = [];
    for (let i = 4; i < wk.length; i++) {
      const avg = (wk[i - 1].load + wk[i - 2].load + wk[i - 3].load + wk[i - 4].load) / 4;
      if (avg < 50 || wk[i].load < avg * 1.1) continue;
      const end = C.addDays(wk[i].mon, 6);
      if (C.illnessAt(state.illnessPeriods, end)) continue;
      const bH = C.baselineOf(trend, state.illnessPeriods, wk[i].mon, 'hrv', Math.log), bR = C.baselineOf(trend, state.illnessPeriods, wk[i].mon, 'restingHR');
      const after = [1, 2, 3].map(k => at(C.addDays(end, k))).filter(Boolean);
      const hz = bH && bH.n >= C.MIN_DAYS && bH.sd > 0 ? mean(after.filter((p: any) => p.hrv > 0).map((p: any) => (Math.log(p.hrv) - bH.mean) / bH.sd)) : null;
      const rr = bR && bR.n >= C.MIN_DAYS ? mean(after.filter((p: any) => p.restingHR > 0).map((p: any) => p.restingHR - bR.mean)) : null;
      if (hz == null && rr == null) continue;
      if (hz != null) zs.push(hz); if (rr != null) rd.push(rr);
      // erholt? Ende der Woche danach wieder im Normalbereich
      const late = [5, 6, 7].map(k => at(C.addDays(end, k))).filter(Boolean);
      const lz = bH && bH.sd > 0 ? mean(late.filter((p: any) => p.hrv > 0).map((p: any) => (Math.log(p.hrv) - bH!.mean) / bH!.sd)) : null;
      if (lz != null) rec.push(lz > -0.5 ? 1 : 0);
    }
    // RPE: Einheiten der letzten 16 Wochen, die als locker geplant waren, im Schnitt
    const easyRpe: number[] = [];
    C.planDays(weeks).filter((d: any) => d.date >= C.addDays(today, -112) && d.date < today).forEach((d: any) => d.sessions.forEach((s: any) => { const st = (state.sessions || {})[s.id]; if (st && st.completed && st.rpe && !C.isHard(s)) easyRpe.push(+st.rpe); }));
    rp.push(...easyRpe.filter(Number.isFinite));
    const n = Math.max(zs.length, rd.length);
    if (n < 2) return { ...none, n };
    const hrvZ = mean(zs), rhrDelta = mean(rd), rpe = mean(rp), recovered = rec.length ? mean(rec) : null;
    const slow = (hrvZ != null && hrvZ < -0.8) || (rhrDelta != null && rhrDelta >= 3) || (recovered != null && recovered < 0.5) || (rpe != null && rp.length >= 6 && rpe >= 6);
    const fast = !slow && (hrvZ == null || hrvZ > -0.3) && (rhrDelta == null || rhrDelta < 1.5) && (recovered == null || recovered >= 0.8) && (rpe == null || rpe <= 4.5);
    const recovery = slow ? 'slow' : fast ? 'fast' : 'normal';
    const de = (v: number | null, d = 1) => v == null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
    const facts = [hrvZ != null ? `HFV nach harten Wochen ${hrvZ < 0 ? 'unter' : 'über'} deiner Basis (${de(hrvZ)} SD)` : '', rhrDelta != null ? `Ruhepuls ${rhrDelta >= 0 ? '+' : ''}${de(rhrDelta)}` : '', rpe != null && rp.length >= 6 ? `lockere Einheiten im Schnitt RPE ${de(rpe)}` : ''].filter(Boolean).join(', ');
    return { n, hrvZ, rhrDelta, rpe, recovered, recovery,
      buildWeeks: slow ? 2 : fast ? 3 : null, depth: slow ? [0.55, 0.65] : fast ? [0.65, 0.72] : null, incMax: slow ? 6 : null, longTaper: slow,
      text: `${n} harte Wochen ausgewertet: ${facts}. ${slow ? 'Du brauchst eher länger zur Erholung – Rhythmus 2+1, etwas tiefere Erholungswochen, vorsichtig steigern.' : fast ? 'Du erholst dich schnell – Rhythmus 3+1 passt.' : 'Normale Erholung – der Rhythmus bleibt.'}` };
  } catch (e) { return none; }
}
