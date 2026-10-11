/* Export für den Chat und Wochenbericht für den Coach. */
import * as CoachCore from '../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, findDay, currentWeekIdx } from './store';
import { $, esc, de, todayStr, addDays, daysBetween, fmtDate, dowShort, dowLong, secToPace, parseNum, round5, round50, rng } from './util';
import { SPORTS, icon, uiIcon } from './icons';
import * as D from './domain';
import { sessState, effStatus, illnessAt, activeIllness, returnPhase, RETURN_STAGES, trendAt, latestTrend, latestWithKey, hasRecovery, rollingAvg, arrow, computeReadiness, readinessHistoryHtml, computeScore, tierLabel, perfEntries, forgottenSessions, computeZones, computePaceZones, computeSpeedZones } from './domain';
import { sessionCard, dayCard, dayBadge, weekStrip, weekProgress, checkinFields } from './components';
import { lineChart, illnessShades } from './charts';
import { VS } from './viewstate';
import { APP } from './config';
import { NUTRI_TYPES, computeNutritionTargets } from './nutrition';
import { metricsSummary } from './domain';
import { adjustmentGroups } from './views/plan';

export function buildExportText(date) {
  const L = [];
  L.push(`Training vom ${fmtDate(date)}:`);
  let any = false;
  SESS.filter(s => s.date === date).forEach(s => {
    const st = sessState(s.id);
    if (st.completed) {
      any = true;
      let line = `- ${(SPORTS[s.sport] || {}).label || s.sport}: ${s.title}`;
      if (st.rpe) line += ` (RPE ${st.rpe}/10)`;
      if (st.temp) line += ` (${st.temp}°C)`;
      if (st.quality) line += ` [${st.quality === 'good' ? 'gut' : st.quality === 'bad' ? 'schlecht' : 'ok'}]`;
      L.push(line);
      const ms = metricsSummary(s.sport, st.metrics); if (ms) L.push(`  Daten: ${ms}`);
      if (st.notes) L.push(`  ${st.notes}`);
    } else if (st.skipped) {
      any = true; L.push(`- Ausgefallen: ${s.title}${st.skipReason ? ' (' + st.skipReason + ')' : ''}`);
    }
  });
  (STATE.customWorkouts[date] || []).forEach(w => {
    any = true;
    const dk = [w.plannedMinutes ? w.plannedMinutes + 'min' : null, w.plannedKm ? w.plannedKm + 'km' : null].filter(Boolean).join(' / ');
    L.push(`- Extra (nicht geplant) ${(SPORTS[w.sport] || {}).label || w.sport}: ${w.title}${dk ? ' - ' + dk : ''}${w.quality ? ` [${w.quality === 'good' ? 'gut' : w.quality === 'bad' ? 'schlecht' : 'ok'}]` : ''}`);
    const ms = metricsSummary(w.sport, w.metrics); if (ms) L.push(`  Daten: ${ms}`);
    if (w.description) L.push(`  ${w.description}`);
  });
  if (!any) L.push('(keine abgehakten oder zusätzlichen Einheiten für dieses Datum)');
  const ill = illnessAt(date);
  if (ill) L.push(`Krank seit ${fmtDate(ill.start)} (Tag ${daysBetween(ill.start, date) + 1})${ill.note ? ': ' + ill.note : ''}`);
  else { const rp = returnPhase(date); if (rp) L.push(`Wiedereinstieg nach Krankheit: Tag ${rp.day} ohne Symptome (${RETURN_STAGES[rp.stage].n})`); }

  const exact = trendAt(date);
  const ctlSrc = exact && exact.ctl != null ? exact : latestWithKey('ctl', date);
  const wv = [];
  if (ctlSrc) { ['ctl', 'atl', 'tsb', 'vo2max'].forEach(k => { if (ctlSrc[k] != null) wv.push(`${k === 'vo2max' ? 'VO2max' : k.toUpperCase()} ${ctlSrc[k]}`); }); }
  const cs = exact && exact.cardioRecovery != null ? exact : latestWithKey('cardioRecovery', date);
  if (cs && cs.cardioRecovery != null) wv.push(`Cardio-Erholung ${cs.cardioRecovery}${cs.date !== date && (!ctlSrc || ctlSrc.date !== cs.date) ? ' (Stand ' + fmtDate(cs.date) + ')' : ''}`);
  if (wv.length) { L.push(''); L.push(`Status${ctlSrc && ctlSrc.date !== date ? ' (Stand ' + fmtDate(ctlSrc.date) + ')' : ''}: ${wv.join(', ')}`); }
  const rSrc = hasRecovery(exact) ? exact : (() => { const a = STATE.trend.filter(p => p.date <= date && hasRecovery(p)); return a.length ? a[a.length - 1] : null; })();
  if (rSrc) {
    const rv = [];
    if (rSrc.sleepHours != null) rv.push(`Schlaf ${rSrc.sleepHours}h`);
    if (rSrc.sleepQuality != null) rv.push(`Qualität ${rSrc.sleepQuality}/10`);
    if (rSrc.restingHR != null) rv.push(`Ruhepuls ${rSrc.restingHR}`);
    if (rSrc.hrv != null) rv.push(`HFV ${rSrc.hrv}ms`);
    if (rSrc.breathingRate != null) rv.push(`Atemfrequenz ${rSrc.breathingRate}/min`);
    if (rSrc.remSleep != null) rv.push(`REM ${rSrc.remSleep}min`);
    if (rSrc.deepSleep != null) rv.push(`Tiefschlaf ${rSrc.deepSleep}min`);
    if (rSrc.sleepLatency != null) rv.push(`Latenz ${rSrc.sleepLatency}min`);
    if (rSrc.bodyTemp != null) rv.push(`Temp.-Abw. ${rSrc.bodyTemp > 0 ? '+' : ''}${rSrc.bodyTemp}°C`);
    if (rSrc.spo2 != null) rv.push(`SpO2 ${rSrc.spo2}%`);
    if (rv.length) L.push(`Erholung${rSrc.date !== date ? ' (Stand ' + fmtDate(rSrc.date) + ')' : ''}: ${rv.join(', ')}`);
  }
  const note = exact && exact.illness ? exact.illness : (rSrc && rSrc.date === date ? rSrc.illness : null);
  if (note) L.push(`Hinweis: ${note}`);
  const ne = STATE.nutrition && STATE.nutrition[date];
  if (ne && ['kcal', 'carbs', 'protein', 'fat', 'weight'].some(k => ne[k] != null)) {
    const nt = computeNutritionTargets(date); const np = [];
    if (ne.kcal != null) np.push(`${ne.kcal} kcal`); if (ne.carbs != null) np.push(`KH ${ne.carbs}g`); if (ne.protein != null) np.push(`Protein ${ne.protein}g`);
    if (ne.fat != null) np.push(`Fett ${ne.fat}g`); if (ne.weight != null) np.push(`Gewicht ${ne.weight}kg`);
    L.push(''); L.push(`Ernährung (${NUTRI_TYPES[nt.type].label}): ${np.join(', ')}`);
    L.push(`Ernährungsziel: ${nt.kcal[0]}-${nt.kcal[1]} kcal, KH ${nt.carbs[0]}-${nt.carbs[1]}g, Protein ${nt.protein[0]}-${nt.protein[1]}g, Fett ${nt.fat[0]}-${nt.fat[1]}g`);
  }
  return L.join('\n');
}

/* Wochenbericht für den Coach: Umsetzung, Belastung, Ampel-Verlauf, Anpassungen, Auffälligkeiten */
export function buildWeekReport(date) {
  const S = CoachCore.weekSummary(STATE, BASE_WEEKS, date);
  const L = [];
  L.push(`Wochenbericht ${fmtDate(S.mon)}-${fmtDate(S.sun)}`);
  L.push('');
  L.push(`Umsetzung: ${S.nDone} von ${S.nPlanned} Einheiten erledigt, Belastung ${S.done} von geplant ${S.planned}${S.ratio != null ? ` (${Math.round(S.ratio * 100)} %)` : ''}${S.extra ? `, davon ${S.extra} aus Extra-Einheiten` : ''}.`);
  const own = CoachCore.ownLoadSeries(STATE, PLAN.weeks, S.sun < todayStr() ? S.sun : todayStr());
  const o = own.length ? own[own.length - 1] : null;
  const icu = latestWithKey('ctl', S.sun);
  const parts = [];
  if (o) parts.push(`eigen CTL ${de(o.ctl, 0)} / ATL ${de(o.atl, 0)} / TSB ${de(o.tsb, 0)}`);
  if (icu) parts.push(`intervals.icu CTL ${de(icu.ctl, 0)} / ATL ${de(icu.atl, 0)}`);
  if (S.loadRatio != null) parts.push(`ATL/CTL ${de(S.loadRatio, 2)}`);
  if (parts.length) L.push('Belastung: ' + parts.join(' · '));
  const sym = l => l === 0 ? '🟢' : l === 1 ? '🟡' : l === 2 ? '🔴' : '⚪';
  L.push('Ampel: ' + S.history.map(h => `${dowShort(h.date)} ${h.ill ? '🤒' : sym(h.level)}${h.score != null ? ' ' + h.score : ''}`).join(', '));
  const adj = adjustmentGroups().filter(g => g.date && g.date >= S.mon && g.date <= addDays(S.sun, 1));
  if (adj.length) {
    L.push(''); L.push('Anpassungen der App:');
    adj.forEach(g => g.items.forEach(a => L.push(`- ${fmtDate(a.date || g.date)} ${a.what || ''}${a.reason ? ' (' + a.reason + ')' : ''}${a.undone ? ' [rückgängig gemacht]' : ''}`)));
  }
  const notes = [];
  if (S.red) notes.push(`${S.red} rote${S.red === 1 ? 'r' : ''} Tag${S.red === 1 ? '' : 'e'}`);
  if (S.sick) notes.push('Krankheit in dieser Woche');
  if (S.missedKey.length) notes.push('Schlüsseleinheiten verpasst: ' + S.missedKey.join(', '));
  if (S.sleepAvg != null && S.sleepAvg < 8.5) notes.push(`Schlaf im Schnitt ${de(S.sleepAvg, 1)} h (Bedarf 8,5-9 h)`);
  if (CoachCore.groinFlag(STATE, PLAN.weeks, S.sun < todayStr() ? S.sun : todayStr())) notes.push('Leistenschmerz über 2/10 in den Notizen');
  L.push(''); L.push('Auffälligkeiten: ' + (notes.length ? notes.join('; ') : 'keine'));
  const wk = PLAN.weeks.find(w => w.startDate === S.mon);
  if (wk && STATE.weekNotes[wk.weekNumber]) { L.push(''); L.push('Wochennotiz: ' + STATE.weekNotes[wk.weekNumber]); }
  return L.join('\n');
}
