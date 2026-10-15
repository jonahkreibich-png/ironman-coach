/* Kompakter Kontext: für „Mit Claude besprechen“ (Teilen-Menü in die Claude-App) und für den KI-Coach auf dem Server.
   Enthält Profil und Ziele, Plan der nächsten 14 Tage, Werte und Einheiten der letzten 28 Tage, Krankheiten,
   Ampel-Verlauf, letzte Anpassungen und Coach-Notizen. Nicht der ganze Datenbestand. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { ageOf, sleepNeed } from '../profile';
import { mainGoal, GOALS } from '../goals';
import { PLAN_FORMAT_HINT } from './plancode';
import { mmss } from './texts';

const SPORT: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Teamsport', rest: 'Ruhe' };
const d2 = (d: string) => d.slice(8) + '.' + d.slice(5, 7) + '.';
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dow = (d: string) => DOW[new Date(d + 'T12:00:00Z').getUTCDay()];

export function buildContext(ctx: EngineCtx, opts: { days?: number; question?: string; scores?: any[]; forShare?: boolean; appName?: string } = {}): string {
  const today = ctx.today, days = opts.days || 28;
  const p = ctx.profile; const L: string[] = [];
  const age = ageOf(p, today);
  L.push(`# ${opts.appName || 'Coach'}: Stand ${d2(today)}${today.slice(0, 4)}`);
  L.push('## Profil');
  L.push([age != null ? `${age} Jahre` : null, p.sex ? ({ f: 'weiblich', m: 'männlich', d: 'divers' } as any)[p.sex] : null, p.heightCm ? `${p.heightCm} cm` : null, p.weightKg ? `${p.weightKg} kg` : null, `Sportarten: ${p.sports.map(s => s === 'football' ? p.teamSportName : SPORT[s]).join(', ')}`].filter(Boolean).join(', '));
  const t = p.thresholds;
  L.push(`Schwellen: Laufen ${t.lthrRun} bpm, ${mmss(t.thresholdPaceRunSec)}/km; Rad ${t.lthrBike} bpm${t.ftp ? `, FTP ${t.ftp} W` : `, ${t.thresholdSpeedBikeKmh} km/h`}${t.cssSec ? `; Schwimmen CSS ${mmss(t.cssSec)}/100 m` : ''}`);
  L.push(`Zeitbudget ${p.weeklyHours} h/Woche${p.fixed.length ? `; feste Termine: ${p.fixed.map(f => `${DOW[f.dow]} ${f.title}${f.time ? ' ' + f.time : ''}`).join(', ')}` : ''}; Schlafbedarf ${sleepNeed(p, today).join('-')} h`);
  if (t.aetHr || t.vo2max) L.push(`Weitere Werte: ${t.aetHr ? `aerobe Schwelle ${t.aetHr[0]}-${t.aetHr[1]} bpm` : ''}${t.aetHr && t.vo2max ? ', ' : ''}${t.vo2max ? `VO2max ${String(t.vo2max).replace('.', ',')}` : ''}${(t.estimated || []).length ? ` (geschätzt: ${(t.estimated || []).join(', ')})` : ''}`);
  if (p.progression) L.push(`Aufbau: ${p.progression.buildWeeks} Wochen steigern (+${p.progression.incPct} %), dann 1 Woche Erholung`);
  if (p.strengthPlan) L.push(`Kraft: ${(p.strengthPlan.lower || []).map(d => 'Unterkörper ' + DOW[d]).concat((p.strengthPlan.upper || []).map(d => 'Oberkörper ' + DOW[d])).join(', ')}; nie Beine am Spieltag`);
  if (p.morning) L.push(`Morgens ${p.morning.label || 'vor der Schule'} (${p.morning.days.map(d => DOW[d]).join(', ')}): höchstens ${p.morning.maxMin} min${p.morning.noPool ? ', kein Schwimmbad' : ''}`);
  if (p.runGoal) L.push(`Langfristiges Lauf-Ziel: ${mmss(p.runGoal.paceSec)}/km bei Puls ${p.runGoal.hr}`);
  if (p.teamSport) L.push(`Teamsport: ${p.teamSport.name}, Training ${p.teamSport.trainingDays.map(d => DOW[d]).join(', ')}, ${p.teamSport.gameDays.length ? 'Spiel ' + p.teamSport.gameDays.map(d => DOW[d]).join(', ') : 'keine Spiele'}${p.teamSport.seasonTo ? ` bis ${d2(p.teamSport.seasonTo)}${p.teamSport.seasonTo.slice(0, 4)}` : ''}`);
  (p.focus || []).forEach(f => L.push('- ' + f));
  if (p.injuries) L.push(`Beschwerden/Verletzungen: ${p.injuries}`);
  if (p.medicalCaution) L.push('Gesundheit: ärztliche Freigabe empfohlen, vorsichtig planen.');
  L.push('## Ziele');
  const goals = [...ctx.goals].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!goals.length) L.push('keins eingetragen');
  goals.forEach(g => L.push(`- ${g.priority}: ${g.name} (${GOALS[g.type] ? g.type : 'fitness'})${g.date ? ` am ${d2(g.date)}${g.date.slice(0, 4)}` : ''}${g.targetTimeSec ? `, Zielzeit ${Math.floor(g.targetTimeSec / 3600)}:${String(Math.floor(g.targetTimeSec % 3600 / 60)).padStart(2, '0')} h` : ''}${g.result ? ', erledigt' : ''}`));
  const weeks = C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {});
  const all = C.planDays(weeks);
  L.push(`## Plan nächste 14 Tage (${(ctx.planMeta && ctx.planMeta.blockName) || 'aktueller Block'})`);
  all.filter((d: any) => d.date >= today && d.date < C.addDays(today, 14)).forEach((d: any) => {
    const list = d.sessions.filter((s: any) => s.sport !== 'rest');
    L.push(`${dow(d.date)} ${d2(d.date)}: ${list.length ? list.map((s: any) => `${SPORT[s.sport] || s.sport} ${s.title}${s.plannedMinutes ? ` ${s.plannedMinutes}′` : ''}${s.zone ? ` ${s.zone}` : ''}${s.cancelled ? ' [entfällt]' : ''}${s._adj ? ' [angepasst]' : ''}`).join('; ') : 'Ruhetag'}`);
  });
  L.push(`## Letzte ${days} Tage: Einheiten`);
  const from = C.addDays(today, -days);
  all.filter((d: any) => d.date >= from && d.date < today).forEach((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest').forEach((s: any) => {
    const st = (ctx.state.sessions || {})[s.id] || {};
    const m = st.metrics || {};
    const status = st.completed ? '✓' : st.skipped ? `ausgefallen${st.skipReason ? ' (' + st.skipReason + ')' : ''}` : C.illnessAt(ctx.state.illnessPeriods, d.date) ? 'krank' : 'nicht gemacht';
    const data = [m.km ? m.km + ' km' : null, m.meters ? m.meters + ' m' : null, m.min ? m.min + ' min' : null, m.hr ? 'HF ' + m.hr : null, m.pace ? m.pace + '/km' : null, m.pace100 ? m.pace100 + '/100m' : null, m.spl ? m.spl + ' Züge/Bahn' : null, st.rpe ? 'RPE ' + st.rpe : null].filter(Boolean).join(', ');
    const more = [m.maxHr ? 'max ' + m.maxHr : null, m.decoupling != null && m.decoupling !== '' ? 'Entkopplung ' + m.decoupling + ' %' : null, m.cadence ? 'Kadenz ' + m.cadence : null, m.power ? m.power + ' W' : null, m.longestCrawl ? 'Kraul am Stück ' + m.longestCrawl + ' m' : null, m.technique ? 'Technik: ' + m.technique : null, st.rpe ? 'RPE ' + st.rpe : null, st.feel ? 'Gefühl ' + st.feel + '/5' : null, st.deviation ? 'Abweichung: ' + st.deviation : null].filter(Boolean).join(', ');
    L.push(`${d2(d.date)} ${SPORT[s.sport] || s.sport} ${s.title}: ${status}${data ? ' – ' + data : ''}${more ? ', ' + more : ''}${st.notes ? ` „${String(st.notes).slice(0, 120)}“` : ''}`);
  }));
  Object.entries(ctx.state.customWorkouts || {}).filter(([d]) => d >= from && d < today).forEach(([d, list]: any) => (list || []).forEach((w: any) => L.push(`${d2(d)} Extra ${SPORT[w.sport] || w.sport} ${w.title}${w.metrics && w.metrics.min ? ' ' + w.metrics.min + ' min' : ''}`)));
  L.push('## Werte (Schlaf h / HFV / Ruhepuls / Temp-Abw. / Ampel)');
  const hist = C.readinessHistory(ctx.state.trend, ctx.state.illnessPeriods, today, Math.min(days, 21), { ...((ctx.state.settings || {}).readiness || {}), sleepNeed: sleepNeed(p, today) });
  hist.forEach(h => {
    const v = (ctx.state.trend || []).find((x: any) => x && x.date === h.date);
    if (!v) return;
    const amp = h.ill ? 'krank' : h.level == null ? '–' : ['grün', 'gelb', 'rot', '–'][h.level];
    L.push(`${d2(h.date)}: ${v.sleepHours ?? '–'} / ${v.hrv ?? '–'} / ${v.restingHR ?? '–'} / ${v.bodyTemp ?? '–'} / ${amp}${h.score != null ? ' ' + h.score : ''}${v.illness ? ` („${String(v.illness).slice(0, 80)}“)` : ''}`);
  });
  const ill = (ctx.state.illnessPeriods || []).filter((x: any) => x && (!x.end || x.end >= C.addDays(today, -60)));
  if (ill.length) L.push('## Krankheiten: ' + ill.map((x: any) => `${d2(x.start)}-${x.end ? d2(x.end) : 'läuft'}${x.note ? ' ' + x.note : ''}`).join('; '));
  const adj = Object.values(ctx.state.adjustments || {}).filter((a: any) => a && a.date >= C.addDays(today, -14)).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
  if (adj.length) { L.push('## Anpassungen der App (14 Tage)'); adj.forEach((a: any) => L.push(`- ${d2(a.date)} ${a.what || ''}${a.reason ? ' (' + a.reason + ')' : ''}${a.undone ? ' [rückgängig]' : ''}`)); }
  if (opts.scores && opts.scores.length) L.push('## Leistungs-Scores (feste Skala: 20 Einsteiger, 50 solider Hobbysportler, 70 stark, 85 Spitzenamateur, 100 Elite): ' + opts.scores.map((s: any) => `${SPORT[s.sport]} ${s.score}${s.gains && s.gains[0] ? ` (am meisten bringt: ${s.gains[0].text})` : ''}`).join(', '));
  const notes = Object.values(ctx.state.coachNotes || {}).filter((n: any) => n && !n.deleted);
  if (notes.length) { L.push('## Coach-Notizen'); notes.forEach((n: any) => L.push('- ' + n.text)); }
  const mg = mainGoal(ctx.goals, today);
  if (opts.question) { L.push('## Meine Frage'); L.push(opts.question); }
  if (opts.forShare) { L.push(''); L.push(PLAN_FORMAT_HINT); }
  void mg;
  return L.join('\n');
}
