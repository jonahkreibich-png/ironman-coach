/* Auftrag 35, Punkt 5: Puls-Zonen automatisch prüfen. Tempo, Rad-Geschwindigkeit, FTP und CSS passen sich schon per Trend an
   (shared/refresh trendThresholds), die Puls-Zonen bisher nur nach Tests (shared/fields runTestUpdate).
   Neu: Zeigen die Uhrdaten mehrmals einen höheren Maximalpuls als hinterlegt oder einen klar höheren Schwellenpuls (harte, gleichmäßige
   Abschnitte von 20-30 min), schlägt die App neue Puls-Zonen vor (vorher/nachher, „Übernehmen“). Vorsichtige Grenzen gegen Ausreißer:
   - Maximalpuls: nur Laufen und Rad (kein Teamsport: Spitzen im Fußball, Brustgurt-Aussetzer), der Wert muss im Verlauf gehalten sein
     (Minuten-Schnitt nahe am Maximum bzw. eine Runde mit hohem Ø), mindestens 2 Einheiten in 120 Tagen; übernommen wird der zweithöchste
     Wert (ein einzelner Ausreißer zählt nie), höchstens +12 Schläge auf einmal, höchstens 225.
   - Schwellenpuls: 20-30 min am Stück hart (Runde der Uhr, Hauptteil oder 20-min-Fenster im Verlauf gleichmäßiger Einheiten),
     geschätzt wie beim 20-min-Test (Ø × 0,95, bei 25-30 min × 0,97); mindestens 2 solche Abschnitte in 8 Wochen, die alle mindestens
     3 % über dem hinterlegten Wert liegen; übernommen wird der Median, höchstens +8 %, nie über 97 % des Maximalpulses.
   - Niedriger wird kein Wert automatisch vorgeschlagen: Training ist selten ganz ausbelastet (dafür gibt es den Test).
   Herkunft je Wert: thresholds.origin[key] = { src, at } (Test, Trend, Uhrdaten, von Hand), Anzeige auf der Zonen-Seite. */
import * as C from './core';
import { hrZonesFor } from './sports';
import { estMaxHr, estimateThresholds, type Profile } from './profile';
import { mainPart } from './sections';

export type HrKey = 'maxHr' | 'lthrRun' | 'lthrBike';
export interface HrChange { key: HrKey; from: number | null; to: number; n: number; dates: string[]; why: string }
export interface HrSuggestion { changes: HrChange[]; signature: string; text: string;
  zones: { sport: 'run' | 'bike'; before: ReturnType<typeof hrZonesFor>; after: ReturnType<typeof hrZonesFor> }[] }
export const HR_LABEL: Record<HrKey, string> = { maxHr: 'Maximalpuls', lthrRun: 'Schwellenpuls Laufen', lthrBike: 'Schwellenpuls Rad' };
const fmtD = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}.`;
const median = (a: number[]) => { const v = [...a].sort((x, y) => x - y); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };

/** Maximalpuls einer Aufzeichnung, nur wenn er im Verlauf gehalten wurde (kein Messfehler) */
export function confirmedMax(a: any): number | null {
  const m = a && a.maxHr; if (!m || m < 120 || m > 225) return null;
  const s = a.series;
  if (s && Array.isArray(s.hr) && s.hr.some((h: any) => h != null)) { const top = Math.max(...s.hr.filter((h: any) => h != null)); return top >= m - 10 ? m : null; }
  const laps: any[] = a.laps || [];
  if (laps.some(l => l && l.avgHr && l.avgHr >= m - 15 && l.sec >= 60)) return m;
  return null;
}
/** harte, gleichmäßige Abschnitte von 20-30 min: [Ø Puls, Sekunden] */
export function thresholdEfforts(a: any, planned?: any, st?: any): { hr: number; sec: number }[] {
  const out: { hr: number; sec: number }[] = [];
  for (const l of (a.laps || []) as any[]) if (l && l.avgHr && l.sec >= 1200 && l.sec <= 1860 && l.kind !== 'rest' && l.kind !== 'warmup' && l.kind !== 'cooldown') out.push({ hr: l.avgHr, sec: l.sec });
  if (!out.length) { const mp = mainPart(planned || { sport: a.sport }, st || {}, a, {}, a.sport); if (mp && mp.hr && mp.sec >= 1200 && mp.sec <= 1860) out.push({ hr: mp.hr, sec: mp.sec }); }
  // 20-min-Fenster im Verlauf gleichmäßiger Einheiten (keine Intervalle: Pausen würden den Schnitt verfälschen)
  const s = a.series; const steady = !a.intervals || (a.intervals.count || 0) < 2;
  if (!out.length && steady && s && Array.isArray(s.hr) && s.hr.length >= 25 && (s.step || 60) === 60) {
    let best = 0;
    for (let i = 0; i + 20 <= s.hr.length; i++) { const w = s.hr.slice(i, i + 20); if (w.some((h: any) => h == null)) continue; const av = w.reduce((x: number, y: number) => x + y, 0) / 20; const spread = Math.max(...w) - Math.min(...w); if (spread <= 15 && av > best) best = av; }
    if (best) out.push({ hr: Math.round(best), sec: 1200 });
  }
  return out;
}
const lthrOf = (e: { hr: number; sec: number }) => e.hr * (e.sec >= 1500 ? 0.97 : 0.95);

export function hrZoneSuggest(state: any, weeks: any[], profile: Profile, today: string): HrSuggestion | null {
  const th: any = profile.thresholds || {};
  const est: string[] = th.estimated || [];
  const plan = new Map<string, [any, any]>();
  C.planDays(weeks || []).forEach((d: any) => (d.sessions || []).forEach((s: any) => { const st = (state.sessions || {})[s.id]; if (st && st.activityId) plan.set(st.activityId, [s, st]); }));
  const acts = (C.recordedActivities(state) as any[]).filter(a => a && !a.mergedInto && (a.sport === 'run' || a.sport === 'bike') && a.date <= today && a.date > C.addDays(today, -120));
  const changes: HrChange[] = [];
  // Maximalpuls
  const curMax = th.maxHr || estMaxHr(profile, today);
  const maxes = acts.map(a => ({ a, m: confirmedMax(a) })).filter(x => x.m != null && x.m! > curMax + 2).sort((x, y) => y.m! - x.m!);
  let newMax = curMax;
  if (maxes.length >= 2) {
    newMax = Math.min(225, curMax + 12, maxes[1].m!);
    if (newMax > curMax + 2) changes.push({ key: 'maxHr', from: th.maxHr || null, to: newMax, n: maxes.length, dates: maxes.slice(0, 3).map(x => x.a.date).sort(), why: `${maxes.length} Einheiten mit höherem Maximalpuls (${maxes.slice(0, 3).map(x => `${x.m} am ${fmtD(x.a.date)}`).join(', ')})${th.maxHr ? '' : ', bisher aus dem Alter geschätzt'}` });
    else newMax = curMax;
  }
  // Schwellenpuls je Sportart
  for (const [sport, key] of [['run', 'lthrRun'], ['bike', 'lthrBike']] as const) {
    if (!(profile.sports || []).includes(sport)) continue;
    const cur = th[key] || 0; if (!cur) continue;
    const eff = acts.filter(a => a.sport === sport && a.date > C.addDays(today, -56)).flatMap(a => { const ps = plan.get(a.id); return thresholdEfforts(a, ps && ps[0], ps && ps[1]).map(e => ({ ...e, date: a.date })); })
      .map(e => ({ ...e, v: lthrOf(e) })).filter(e => e.v >= cur * 1.03 && e.v <= newMax * 0.97);
    if (eff.length >= 2) {
      const to = Math.round(Math.min(cur * 1.08, median(eff.map(e => e.v))));
      if (to >= cur * 1.03) changes.push({ key, from: cur, to, n: eff.length, dates: eff.map(e => e.date).sort().slice(-3), why: `${eff.length} harte, gleichmäßige Abschnitte von 20-30 min (${eff.slice(-3).map(e => `Ø ${e.hr} am ${fmtD(e.date)}`).join(', ')})` });
    } else if (newMax > curMax && est.includes(key)) {
      // geschätzter Schwellenpuls (aus dem Alter): mit dem gemessenen Maximalpuls neu schätzen, wie in der Ersteinschätzung
      const f = sport === 'run' ? 0.89 : 0.86; const to = Math.round(newMax * f);
      if (to > cur + 2) changes.push({ key, from: cur, to, n: 0, dates: [], why: `bisher geschätzt; neu geschätzt aus dem gemessenen Maximalpuls (${Math.round(f * 100)} %)` });
    }
  }
  if (!changes.length) return null;
  const signature = changes.map(c => `${c.key}:${c.to}`).join(',');
  if (th.hrSuggestDismissed === signature) return null;
  const zones = (['run', 'bike'] as const).filter(sp => (profile.sports || []).includes(sp)).map(sp => {
    const k = sp === 'run' ? 'lthrRun' : 'lthrBike'; const c = changes.find(x => x.key === k);
    return c ? { sport: sp, before: hrZonesFor(c.from || 0), after: hrZonesFor(c.to) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const text = `Deine Uhrdaten zeigen andere Pulswerte als hinterlegt: ${changes.map(c => `${HR_LABEL[c.key]} ${c.from ?? '–'} → ${c.to}`).join(', ')}.`;
  return { changes, signature, text, zones };
}
/** Vorschlag übernehmen: Werte mit Herkunft „Uhrdaten“ und Datum */
export function applyHrSuggestion(profile: Profile, s: HrSuggestion, today: string): Profile {
  const th: any = { ...profile.thresholds, origin: { ...((profile.thresholds as any).origin || {}) } };
  for (const c of s.changes) { th[c.key] = c.to; th.origin[c.key] = { src: 'aus deinen Uhrdaten', at: today }; }
  th.estimated = (th.estimated || []).filter((k: string) => !s.changes.some(c => c.key === k));
  delete th.hrSuggestDismissed;
  return { ...profile, thresholds: th };
}
export function dismissHrSuggestion(profile: Profile, s: HrSuggestion): Profile { return { ...profile, thresholds: { ...profile.thresholds, hrSuggestDismissed: s.signature } as any }; }

/** Woher ein Wert stammt und wann er zuletzt angepasst wurde (Zonen-Seite) */
export function originText(profile: Profile, key: string, today: string): string {
  const th: any = profile.thresholds || {};
  const o = th.origin && th.origin[key];
  const d = (x: string) => `${x.slice(8)}.${x.slice(5, 7)}.${x.slice(0, 4)}`;
  if (o && o.src) return `${o.src}${o.at ? `, ${d(o.at)}` : ''}`;
  if ((th.estimated || []).includes(key)) { const b = (estimateThresholds(profile, today).basis as any)[key]; return `geschätzt${b ? ` (${b})` : ''}`; }
  if (key === 'maxHr' && !th.maxHr) return 'geschätzt aus dem Alter';
  // ältere Daten ohne Herkunft je Wert: die letzte Quelle nur für die Werte, die sie wirklich setzt
  const src = String(th.source || '');
  const sets = /^Lauftest/.test(src) ? ['lthrRun', 'thresholdPaceRunSec'] : /^Radtest/.test(src) ? ['lthrBike', 'ftp', 'thresholdSpeedBikeKmh'] : /^Trend/.test(src) ? ['thresholdPaceRunSec', 'ftp', 'cssSec', 'thresholdSpeedBikeKmh'] : [];
  if (sets.includes(key)) { const m = /(\d{2})\.(\d{2})\./.exec(src); return `${src.replace(/\s*\(?\d{2}\.\d{2}\.\)?\s*$/, '')}${m ? `, ${m[1]}.${m[2]}.` : ''}`; }
  return 'von dir eingetragen';
}
