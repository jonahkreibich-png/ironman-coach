/* Dauerhafter Analyse-Coach (Auftrag 7, Punkt 6). Läuft auf dem Server jeden Morgen, nach jeder neuen Einheit und sonntags,
   auch wenn die App zu ist, und in der App für „Was der Coach gerade sieht“ (derselbe Code).
   Wertet aus: Belastung (CTL/ATL/TSB, ACWR), Morgenwerte (Ruhepuls, HFV, Schlaf), alle Felder der Einheiten (Puls, Pace, Zone,
   Entkopplung, Effizienz, Kadenz, RPE, Gefühl, Schwimm-Technik) und erkennt Trends. Daraus: Erkenntnisse mit Begründung und Tipp,
   kleine Planänderungen automatisch (mit Mitteilung und Rückgängig), größere als Vorschlag zum Bestätigen.
   Regeln sind die Grundlage; eine KI darf die Texte nur umformulieren. */
import * as C from '../core';
import * as W from '../workouts';
import type { EngineCtx, CoachMsg } from './engine';
import { fieldsOf, hrZone, plannedZone } from '../fields';
import { sleepNeed } from '../profile';
import { rulesOf } from '../constraints';
import { parseFor } from '../ruleparse';
import { doneItems } from './review';
import { actualMetrics } from '../results';

export type Trigger = 'morning' | 'activity' | 'weekly' | 'view';
export interface Insight { id: string; kind: 'load' | 'recovery' | 'trend' | 'technique' | 'consistency' | 'illness'; tone: 'good' | 'info' | 'warn' | 'bad'; score: number; title: string; why: string; tip: string }
export interface Analysis {
  date: string; trigger: Trigger; at: number;
  load: { ctl: number | null; atl: number | null; tsb: number | null; acwr: number | null; ctl28: number | null; source: string | null };
  insights: Insight[]; top: Insight[];
  /** kleine Änderungen: werden automatisch übernommen (mit Mitteilung und Rückgängig) */
  auto: any[];
  /** größere Änderungen: als Vorschlag */
  proposals: { id: string; title: string; text: string; changes: { kind: string; key: string; data: any }[] }[];
  messages: CoachMsg[];
}
const de = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fmtD = (d: string) => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`;

/* Alle erledigten Einheiten mit ihren Feldern (geplante, Extra-Einheiten, Aufzeichnungen ohne Zuordnung) */
export interface Done { id: string; date: string; sport: string; title: string; planned: any | null; f: ReturnType<typeof fieldsOf> }
export function doneSessions(ctx: EngineCtx, from: string, to: string): Done[] {
  return doneItems(ctx, from, to).map(d => ({ id: d.key, date: d.date, sport: d.sport, title: d.title, planned: d.planned, f: fieldsOf({ ...d.st, metrics: actualMetrics(d.st, d.act) }, d.sport) }));
}
/* Laufökonomie: Meter pro Herzschlag bei lockeren Läufen (je höher, desto effizienter) */
const runEff = (x: Done) => x.f.paceSec && x.f.hr ? (60000 / x.f.paceSec) / x.f.hr : null;
function slope(pts: { x: number; y: number }[]): number | null {
  if (pts.length < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0); if (!sxx) return null;
  return pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
}
const dayNo = (d: string) => Math.round(Date.parse(d + 'T12:00:00Z') / 86400000);

export function analyze(ctx: EngineCtx, trigger: Trigger = 'view'): Analysis {
  const today = ctx.today; const st = ctx.state; const prof = ctx.profile;
  const ins: Insight[] = []; const auto: any[] = []; const proposals: Analysis['proposals'] = [];
  const add = (i: Insight) => { if (!ins.some(x => x.id === i.id)) ins.push(i); };
  const lthrRun = prof.thresholds.lthrRun || 0;
  const aet = prof.thresholds.aetHr && prof.thresholds.aetHr.length === 2 ? prof.thresholds.aetHr : null;
  const easyMax = aet ? aet[1] : lthrRun ? Math.round(lthrRun * 0.89) : null;
  const weeks = C.applyAdjustments(ctx.baseWeeks, st.adjustments || {});

  /* ---------- Krankheit ---------- */
  const ill = C.illnessAt(st.illnessPeriods, today);
  const ret = !ill && C.returnStageActive(st.illnessPeriods, today);
  if (ill) add({ id: 'ill', kind: 'illness', tone: 'bad', score: 100, title: 'Du bist krank eingetragen', why: `Seit ${fmtD(ill.start)}${ill.note ? ` (${ill.note})` : ''}. Training würde die Erholung verlängern.`, tip: 'Pause, viel schlafen und trinken. Melde dich, wenn du 24 Stunden ohne Symptome bist.' });
  else if (ret) add({ id: 'ret', kind: 'illness', tone: 'info', score: 70, title: 'Wiedereinstieg nach Krankheit', why: 'Die Krankheit ist erst wenige Tage vorbei. Das Immunsystem braucht noch Zeit.', tip: 'Nur locker und kurz, keine Intervalle, bis Ruhepuls und HFV wieder normal sind.' });

  /* ---------- Belastung ---------- */
  const tr = (st.trend || []).filter((p: any) => p && p.date <= today && typeof p.ctl === 'number' && p.ctl > 0);
  let ctl: number | null = null, atl: number | null = null, tsb: number | null = null, src: string | null = null, ctl28: number | null = null;
  const last = tr[tr.length - 1];
  if (last && last.date >= C.addDays(today, -3)) { ctl = last.ctl; atl = typeof last.atl === 'number' ? last.atl : null; tsb = typeof last.tsb === 'number' ? last.tsb : (atl != null ? ctl! - atl : null); src = 'intervals.icu'; const old = tr.filter((p: any) => p.date <= C.addDays(today, -28)).slice(-1)[0]; ctl28 = old ? old.ctl : null; }
  else { const own = C.ownLoadSeries(st, weeks, today); const o = own[own.length - 1]; if (o && o.ctl > 0) { ctl = o.ctl; atl = o.atl; tsb = o.tsb; src = 'eigene Einheiten'; const old = own.find((x: any) => x.date === C.addDays(today, -28)); ctl28 = old ? old.ctl : null; } }
  const acwr = ctl && atl != null ? Math.round(atl / ctl * 100) / 100 : null;
  const recentIll = (st.illnessPeriods || []).find((p: any) => p && p.end && p.end >= C.addDays(today, -21) && p.end < today);
  // Auftrag 14: erst ab etwas Trainingsverlauf (Fitness ab 15), sonst ergibt eine einzige Einheit Werte wie „483 % über deiner Fitness“
  if (acwr != null && !ill && (ctl || 0) >= 15) {
    if (acwr > 1.5) add({ id: 'acwr-high', kind: 'load', tone: 'bad', score: 90, title: 'Belastung steigt zu schnell', why: `Müdigkeit (ATL ${Math.round(atl!)}) liegt ${Math.round((acwr - 1) * 100)} % über deiner Fitness (CTL ${Math.round(ctl!)}), ACWR ${de(acwr, 2)}. Das Verhältnis zeigt einen Belastungsunterschied, sagt allein aber weder Erschöpfung noch Verletzungsrisiko voraus.`, tip: 'Die nächsten 2-3 Tage locker, keine Intervalle.' });
    else if (acwr > 1.3) add({ id: 'acwr-up', kind: 'load', tone: 'warn', score: 60, title: 'Belastung ist gerade hoch', why: `ACWR ${de(acwr, 2)} (ATL ${Math.round(atl!)}, CTL ${Math.round(ctl!)}). Das ist ein Modellhinweis; tatsächliche Erholung, Verlauf und Beschwerden entscheiden mit.`, tip: 'Achte auf Schlaf und plane nach der nächsten harten Einheit einen lockeren Tag.' });
    else if (acwr < 0.8 && recentIll) add({ id: 'acwr-low-ill', kind: 'load', tone: 'info', score: 55, title: 'Fitness nach der Krankheit gesunken', why: `CTL ${ctl28 != null ? `von ${Math.round(ctl28)} auf ` : ''}${Math.round(ctl!)}, ATL nur ${Math.round(atl!)} (ACWR ${de(acwr, 2)}). Das ist nach einer Pause normal und kommt schnell zurück.`, tip: 'Nach tatsächlicher Verträglichkeit wieder einsteigen; ausgefallene Einheiten nicht nachholen und Steigerungen erst nach Prüfung übernehmen.' });
    else if (acwr < 0.8) add({ id: 'acwr-low', kind: 'load', tone: 'info', score: 35, title: 'Weniger Belastung als deine Fitness', why: `ACWR ${de(acwr, 2)}: in den letzten Tagen weniger trainiert als in den Wochen davor.`, tip: 'Ist das gewollt (Erholungswoche), passt es. Sonst die geplanten Einheiten wieder regelmäßig machen.' });
    if (tsb != null && tsb < -25) add({ id: 'tsb-low', kind: 'load', tone: 'warn', score: 65, title: 'Kurzfristige Modellbelastung ist hoch', why: `Form (TSB) ${Math.round(tsb)}: die Belastung der letzten Tage ist deutlich höher als deine Fitness.`, tip: 'Morgen locker oder frei, gut essen und schlafen.' });
  }
  if (ctl != null && ctl28 != null && !recentIll && !ill && Math.abs(ctl - ctl28) >= 3) add({ id: ctl > ctl28 ? 'ctl-up' : 'ctl-down', kind: 'trend', tone: ctl > ctl28 ? 'good' : 'info', score: ctl > ctl28 ? 40 : 45, title: ctl > ctl28 ? 'Deine Fitness steigt' : 'Deine Fitness sinkt', why: `CTL in 4 Wochen von ${Math.round(ctl28)} auf ${Math.round(ctl)} (${src}).`, tip: ctl > ctl28 ? 'Weiter so: regelmäßig und überwiegend locker.' : 'Mehr Regelmäßigkeit bringt die Fitness zurück, nicht einzelne harte Einheiten.' });

  /* ---------- Morgenwerte ---------- */
  const last5 = [0, 1, 2, 3, 4].map(i => C.addDays(today, -i));
  const pts = last5.map(d => (st.trend || []).find((p: any) => p && p.date === d)).filter(Boolean);
  if (!ill && pts.length >= 3) {
    const bR = C.baselineOf(st.trend, st.illnessPeriods, C.addDays(today, -4), 'restingHR');
    const bH = C.baselineOf(st.trend, st.illnessPeriods, C.addDays(today, -4), 'hrv', Math.log);
    const rhrUp = bR && bR.n >= C.MIN_DAYS ? pts.filter((p: any) => p.restingHR && p.restingHR - bR.mean >= 3) : [];
    const hrvDown = bH && bH.n >= C.MIN_DAYS && bH.sd > 0 ? pts.filter((p: any) => p.hrv > 0 && (Math.log(p.hrv) - bH.mean) / bH.sd < -1) : [];
    if (rhrUp.length >= 3 || hrvDown.length >= 3 || (rhrUp.length >= 2 && hrvDown.length >= 2)) add({ id: 'fatigue', kind: 'recovery', tone: 'warn', score: 85, title: ret || recentIll ? 'Noch nicht ganz erholt von der Krankheit' : 'Ermüdung steigt', why: [rhrUp.length ? `Ruhepuls an ${rhrUp.length} von ${pts.length} Tagen über normal (normal ${Math.round(bR!.mean)}, zuletzt ${(pts[0] as any).restingHR ?? '–'})` : '', hrvDown.length ? `HFV an ${hrvDown.length} Tagen deutlich unter normal (normal ${Math.round(Math.exp(bH!.mean))} ms)` : ''].filter(Boolean).join('; ') + '.', tip: ret || recentIll ? 'Weiter nur locker, bis Ruhepuls und HFV wieder im Normalbereich sind.' : 'Zwei lockere Tage einbauen. Fühlst du dich krank, trag es ein.' });
    const need = sleepNeed(prof, today)[0];
    const sl = (st.trend || []).filter((p: any) => p && p.date > C.addDays(today, -7) && p.date <= today && typeof p.sleepHours === 'number').map((p: any) => p.sleepHours);
    if (sl.length >= 4) { const avg = sl.reduce((a: number, b: number) => a + b, 0) / sl.length; if (avg < need - 0.4) add({ id: 'sleep', kind: 'recovery', tone: 'warn', score: 50, title: 'Zu wenig Schlaf', why: `Im Schnitt ${de(avg)} h in den letzten ${sl.length} Nächten, du brauchst etwa ${de(need)} h.`, tip: 'Eine halbe Stunde früher ins Bett bringt mehr als jede Zusatzeinheit.' }); }
  }

  /* ---------- Einheiten: Felder und Trends ---------- */
  const done = doneSessions(ctx, C.addDays(today, -42), today);
  const runs = done.filter(x => x.sport === 'run' && x.f.hr && (x.f.paceSec || x.f.km));
  // lockere Läufe: geplant Zone 1-2 (oder ohne Plan mit Puls unter der Schwelle für locker)
  const easyRuns = runs.filter(x => { const pz = x.planned ? plannedZone(x.planned) : null; return pz != null ? pz <= 2 && !C.isIntervals(x.planned) : (easyMax ? x.f.hr! <= easyMax + 8 : true); });
  const last3 = easyRuns.slice(-3);
  if (lthrRun && last3.length === 3 && last3.every(x => hrZone(x.f.hr!, lthrRun) > 2)) {
    add({ id: 'run-hr-high', kind: 'trend', tone: 'warn', score: 75, title: '3 lockere Läufe in Folge mit zu hohem Puls', why: `${last3.map(x => `${fmtD(x.date)}: Ø ${x.f.hr}`).join(', ')}. Locker heißt bei dir bis etwa ${easyMax} Schläge${aet ? ' (aerobe Schwelle)' : ''}.`, tip: `Langsamer laufen, bergauf ruhig gehen. Ziel: Puls unter ${easyMax}. So wächst die Grundlage für ${prof.runGoal ? `${mmss(prof.runGoal.paceSec)}/km bei Puls ${prof.runGoal.hr}` : 'dein Ziel'}.` });
    // kleine Änderung automatisch: beim nächsten lockeren Lauf eine Puls-Grenze in den Text
    const next = C.planDays(weeks).filter((d: any) => d.date >= today && d.date <= C.addDays(today, 7)).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'run' && !s.cancelled && !C.isHard(s) && !(st.sessions[s.id] || {}).completed && !/Puls-Grenze/.test(s.description || '')).map((s: any) => ({ s, date: d.date })))[0];
    if (next && easyMax) auto.push({ id: `ana-hr-${next.s.id}`, type: 'modify', sessionId: next.s.id, group: `analysis-${today}`, set: { description: `Puls-Grenze: unter ${easyMax}. Lieber langsamer laufen oder kurz gehen, wenn der Puls darüber steigt.\n${next.s.description || ''}`.trim() }, what: `${next.s.title} (${fmtD(next.date)}): Puls-Grenze ${easyMax} dazu`, reason: '3 lockere Läufe in Folge mit zu hohem Puls' });
  }
  // aerobe Effizienz (Meter pro Herzschlag bei lockeren Läufen) über 6 Wochen
  const effPts = easyRuns.map(x => ({ x: dayNo(x.date), y: runEff(x) })).filter(p => p.y != null) as { x: number; y: number }[];
  const sl = slope(effPts);
  if (sl != null && effPts.length >= 4) {
    const avg = effPts.reduce((a, p) => a + p.y, 0) / effPts.length; const per4w = sl * 28 / avg * 100;
    const goalEff = prof.runGoal ? (60000 / prof.runGoal.paceSec) / prof.runGoal.hr : null;
    const lastE = effPts[effPts.length - 1].y;
    const goalTxt = goalEff ? ` Ziel ${mmss(prof.runGoal!.paceSec)}/km bei Puls ${prof.runGoal!.hr} entspricht ${de(goalEff, 2)} m pro Schlag, du bist bei ${Math.round(lastE / goalEff * 100)} %.` : '';
    if (per4w >= 2) add({ id: 'eff-up', kind: 'trend', tone: 'good', score: 55, title: 'Aerobe Effizienz steigt', why: `Bei lockeren Läufen schaffst du ${de(per4w, 0)} % mehr Strecke pro Herzschlag als vor 4 Wochen (zuletzt ${de(lastE, 2)} m pro Schlag, ${effPts.length} Läufe).${goalTxt}`, tip: 'Genau so weiter: viel Zone 2, ruhig und regelmäßig.' });
    else if (per4w <= -3) add({ id: 'eff-down', kind: 'trend', tone: 'warn', score: 60, title: 'Aerobe Effizienz sinkt', why: `Bei lockeren Läufen ${de(-per4w, 0)} % weniger Strecke pro Herzschlag als vor 4 Wochen (${effPts.length} Läufe). Mögliche Gründe prüfen: Schlaf, Hitze, beginnender Infekt.`, tip: 'Ein paar ruhige Tage, dann wieder locker in Zone 2.' });
    else add({ id: 'eff-flat', kind: 'trend', tone: 'info', score: 25, title: 'Aerobe Effizienz stabil', why: `Zuletzt ${de(lastE, 2)} m pro Herzschlag bei lockeren Läufen.${goalTxt}`, tip: 'Mehr lockere Kilometer in Zone 2 bringen sie nach oben.' });
  }
  // Entkopplung bei längeren Einheiten
  const longs = done.filter(x => (x.sport === 'run' || x.sport === 'bike') && x.f.decoupling != null && (x.f.min || 0) >= 30).slice(-3);
  if (longs.length >= 2) {
    const hi = longs.filter(x => x.f.decoupling! > 5);
    if (hi.length >= 2) add({ id: 'decoupling', kind: 'trend', tone: 'warn', score: 50, title: 'Puls driftet bei längeren Einheiten', why: `Aerobe Entkopplung ${hi.map(x => `${de(x.f.decoupling!)} %`).join(', ')} (gut ist unter 5 %).`, tip: 'Längere Einheiten ruhiger beginnen und mehr in Zone 2 bleiben.' });
    else if (hi.length === 1) add({ id: 'decoupling-mixed', kind: 'trend', tone: 'info', score: 30, title: 'Puls meist stabil', why: `Aerobe Entkopplung zuletzt ${longs.map(x => `${de(x.f.decoupling!)} %`).join(', ')}: einmal über 5 %.`, tip: 'Bei längeren Einheiten die ersten 10 Minuten bewusst ruhig beginnen.' });
    else if (longs.every(x => x.f.decoupling! <= 5)) add({ id: 'decoupling-ok', kind: 'trend', tone: 'good', score: 30, title: 'Grundlage trägt', why: `Aerobe Entkopplung zuletzt ${longs.map(x => `${de(x.f.decoupling!)} %`).join(', ')}: der Puls bleibt stabil.`, tip: 'Die langen Einheiten dürfen langsam länger werden.' });
  }
  // subjektiv: Gefühl und RPE
  const recent = done.filter(x => x.date > C.addDays(today, -10));
  const tired = recent.filter(x => (x.f.feel || 0) >= 4);
  const hardEasy = recent.filter(x => x.f.rpe != null && x.f.rpe >= 7 && x.planned && !C.isHard(x.planned));
  if (tired.length >= 2 || hardEasy.length >= 2) add({ id: 'feel', kind: 'recovery', tone: 'warn', score: 70, title: 'Einheiten fühlen sich schwer an', why: [tired.length >= 2 ? `${tired.length}× „müde“ in den letzten 10 Tagen` : '', hardEasy.length >= 2 ? `${hardEasy.length} lockere Einheiten mit RPE 7 oder mehr` : ''].filter(Boolean).join(', ') + '.', tip: 'Ein lockerer Tag mehr diese Woche, früher schlafen.' });
  // Schwimmen: Kraul am Stück und Züge pro Bahn
  const swims = done.filter(x => x.sport === 'swim');
  const crawl = swims.filter(x => x.f.longestCrawl).map(x => ({ d: x.date, m: x.f.longestCrawl! }));
  if (crawl.length >= 2 && crawl[crawl.length - 1].m > crawl[0].m) add({ id: 'swim-crawl', kind: 'technique', tone: 'good', score: 45, title: 'Kraul am Stück wird länger', why: `Von ${de(crawl[0].m, 1)} m (${fmtD(crawl[0].d)}) auf ${de(crawl[crawl.length - 1].m, 1)} m (${fmtD(crawl[crawl.length - 1].d)}).`, tip: 'Weiter kurze Strecken sauber schwimmen, die Länge kommt mit der Atmung.' });
  const tech = swims.filter(x => x.f.technique).slice(-1)[0];
  if (tech && tech.date > C.addDays(today, -21)) add({ id: 'swim-tech', kind: 'technique', tone: 'info', score: 35, title: 'Technik-Schwerpunkt Schwimmen', why: `Zuletzt notiert: „${tech.f.technique}“ (${fmtD(tech.date)}).`, tip: /atm/i.test(tech.f.technique) ? 'Ins Wasser ausatmen (blubbern), nur kurz seitlich einatmen, Brett-Übungen mit Atmung.' : /bein|sink|wasserlage|kopf/i.test(tech.f.technique) ? 'Kopf ruhig, Blick zum Boden, Beinschlag aus der Hüfte: so liegen die Beine höher.' : 'Technikübungen am Anfang jeder Einheit, kurze Kraul-Strecken.' });
  if (prof.focus && prof.focus.some(t => /schwimm/i.test(t)) && !swims.length && !ill) add({ id: 'swim-none', kind: 'consistency', tone: 'warn', score: 40, title: 'Länger nicht geschwommen', why: 'In den letzten 6 Wochen keine Schwimm-Einheit erledigt, dabei ist Schwimmen deine Schwäche.', tip: 'Die zwei Schwimmtermine pro Woche haben Vorrang vor Zusatzeinheiten.' });
  // Regelmäßigkeit (14 Tage)
  const from14 = C.addDays(today, -14);
  const planned14 = C.planDays(weeks).filter((d: any) => d.date >= from14 && d.date < today && !C.illnessAt(st.illnessPeriods, d.date)).flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && s.sport !== 'football'));
  if (planned14.length >= 4 && !ill) {
    const ok = planned14.filter((s: any) => (st.sessions[s.id] || {}).completed).length; const r = ok / planned14.length;
    if (r < 0.6) add({ id: 'consistency', kind: 'consistency', tone: 'warn', score: 45, title: 'Viele Einheiten ausgelassen', why: `${ok} von ${planned14.length} Einheiten in den letzten 14 Tagen erledigt (ohne Krankheitstage).`, tip: 'Lieber kürzer als gar nicht: schreib mir „ich hab nur 20 min“, dann passe ich die Einheit an.' });
    else if (r >= 0.9) add({ id: 'consistency-good', kind: 'consistency', tone: 'good', score: 30, title: 'Sehr regelmäßig', why: `${ok} von ${planned14.length} Einheiten in den letzten 14 Tagen erledigt.`, tip: 'Regelmäßigkeit ist der wichtigste Baustein, weiter so.' });
  }

  /* ---------- Größere Änderungen: als Vorschlag ---------- */
  const fatigueSignals = ins.filter(i => ['acwr-high', 'fatigue', 'feel', 'tsb-low', 'eff-down'].includes(i.id)).length;
  if (fatigueSignals >= 2 && !ill && (trigger === 'weekly' || trigger === 'morning' || trigger === 'view')) {
    const w0 = C.weekRange(today)[1];
    const nextW = weeks.find((w: any) => w.startDate === C.addDays(w0, 1));
    if (nextW && !nextW.isRecoveryWeek) {
      const g = `ana-week-${nextW.weekNumber}`;
      const changes = C.planDays([nextW]).flatMap((d: any) => d.sessions.filter((s: any) => ['run', 'bike', 'swim'].includes(s.sport) && s.plannedMinutes && !s.stage && !s.fixed && !s.race).map((s: any) => {
        const rb = W.rebuildScaled(s, 0.85);
        const a = { id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set: rb || { plannedMinutes: Math.max(10, Math.round(s.plannedMinutes * 0.85 / 5) * 5) }, what: `${s.title}: ${s.plannedMinutes} → ${(rb && rb.plannedMinutes) || Math.round(s.plannedMinutes * 0.85 / 5) * 5} min`, reason: 'mehrere Müdigkeitszeichen', date: today };
        return { kind: 'adjust', key: a.id, data: a };
      }));
      if (changes.length) proposals.push({ id: g, title: `Vorschlag: Woche ${nextW.weekNumber} 15 % leichter`, text: `Mehrere Zeichen von Müdigkeit (${ins.filter(i => ['acwr-high', 'fatigue', 'feel', 'tsb-low', 'eff-down'].includes(i.id)).map(i => i.title).join(', ')}). Ich würde nächste Woche die Ausdauer-Einheiten um 15 % kürzen.`, changes });
    }
  }
  // Schwellen geschätzt oder alt und kein Test geplant
  const est = prof.thresholds.estimated || [];
  const testPlanned = C.planDays(weeks).some((d: any) => d.date >= today && d.date <= C.addDays(today, 28) && d.sessions.some((s: any) => /test/i.test(s.title || '') && !s.cancelled));
  // nur, wer läuft (Auftrag 15: Mama ohne Laufen bekam „Deine Laufzonen sind geschätzt“)
  if (!testPlanned && !ill && (prof.sports || []).includes('run') && (est.includes('lthrRun') || est.includes('thresholdPaceRunSec'))) add({ id: 'test-needed', kind: 'trend', tone: 'info', score: 40, title: 'Deine Laufzonen sind geschätzt', why: 'Schwellenpuls und Schwellen-Pace kommen noch aus einer Schätzung, nicht aus einem Test.', tip: ((prof.skills || {}).runContinuousMin ?? 99) < 30 || !(prof.sports || []).includes('run') ? 'Für den Anfang reicht das. Sobald du 30 min am Stück laufen kannst, macht ein Lauftest die Zonen genau.' : 'Ein 30-min-Lauftest macht alle Zonen genau. Schreib „Plan einen Lauftest ein“.' });

  /* ---------- Reihenfolge, Top 3 (verschiedene Arten bevorzugt) ---------- */
  ins.sort((a, b) => b.score - a.score);
  const top: Insight[] = [];
  for (const i of ins) { if (top.length >= 3) break; if (top.filter(x => x.kind === i.kind).length < 2) top.push(i); }
  for (const i of ins) { if (top.length >= 3) break; if (!top.includes(i)) top.push(i); }

  /* ---------- Mitteilungen (einmal pro Erkenntnis und Woche) ---------- */
  const messages: CoachMsg[] = [];
  const wk = C.weekRange(today)[0];
  const has = (id: string) => !!(st.coachMsgs || {})[id];
  for (const i of top.filter(x => x.tone === 'warn' || x.tone === 'bad')) { const id = `msg-ana-${i.id}-${wk}`; if (!has(id)) messages.push({ id, at: ctx.now, date: today, kind: 'warning', from: 'coach', title: i.title, text: `${i.why} ${i.tip}`, important: i.tone === 'bad' }); }
  for (const i of top.filter(x => x.tone === 'good')) { const id = `msg-ana-${i.id}-${wk}`; if (trigger !== 'view' && !has(id)) messages.push({ id, at: ctx.now + 1, date: today, kind: 'info', from: 'coach', title: i.title, text: `${i.why} ${i.tip}` }); }
  const autoNew = auto.filter(a => !(st.adjustments || {})[a.id]);
  if (autoNew.length) { const id = `msg-ana-adj-${today}`; if (!has(id)) messages.push({ id, at: ctx.now + 2, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst', text: `${autoNew.map(a => a.what).join('. ')}. Grund: ${autoNew[0].reason}. Du kannst das rückgängig machen.`, refs: { adjustmentIds: autoNew.map(a => a.id) } }); }
  for (const p of proposals) { const id = `msg-ana-prop-${p.id}`; if (!has(id)) messages.push({ id, at: ctx.now + 3, date: today, kind: 'proposal', from: 'coach', title: p.title, text: p.text, proposal: { changes: p.changes, status: 'open' } }); }
  if (trigger === 'weekly') { const id = `msg-ana-week-${today}`; if (!has(id) && top.length) messages.push({ id, at: ctx.now + 4, date: today, kind: 'week', from: 'coach', title: 'Was der Coach gerade sieht', text: top.map((i, n) => `${n + 1}. ${i.title}: ${i.why}`).join(' ') }); }

  // harte Regeln gelten auch hier: automatische Änderungen verschieben nichts und machen nichts härter
  void rulesOf; void parseFor;
  return { date: today, trigger, at: ctx.now, load: { ctl, atl, tsb, acwr, ctl28, source: src }, insights: ins, top, auto: autoNew.map((a, k) => ({ ...a, createdAt: ctx.now + k, date: today, from_analysis: true })), proposals, messages };
}
