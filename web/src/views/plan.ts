/* Plan-Bildschirm mit Anpassungen */
import * as CoachCore from '../../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, findDay, currentWeekIdx } from '../store';
import { $, esc, de, todayStr, addDays, daysBetween, fmtDate, dowShort, dowLong, secToPace, parseNum, round5, round50, rng } from '../util';
import { SPORTS, icon, uiIcon } from '../icons';
import * as D from '../domain';
import { sessState, effStatus, illnessAt, activeIllness, returnPhase, RETURN_STAGES, trendAt, latestTrend, latestWithKey, hasRecovery, rollingAvg, arrow, computeReadiness, readinessHistoryHtml, computeScore, tierLabel, perfEntries, forgottenSessions, computeZones, computePaceZones, computeSpeedZones } from '../domain';
import { sessionCard, dayCard, dayBadge, weekStrip, weekProgress, checkinFields } from '../components';
import { lineChart, illnessShades } from '../charts';
import { VS } from '../viewstate';
import { APP } from '../config';



export function renderPlan() {
  if (VS.PLAN_WEEK == null) VS.PLAN_WEEK = currentWeekIdx();
  const cw = currentWeekIdx();
  const week = PLAN.weeks[VS.PLAN_WEEK];
  const wp = weekProgress(week);
  let h = `<h1 class="view-title">Trainingsplan<small>${esc(PLAN.meta.blockName || 'Block 1 · Grundlage')} · ${PLAN.weeks.length} Wochen</small></h1>
    <div class="chips" role="tablist">${PLAN.weeks.map((w, i) => `<button class="chip ${i === VS.PLAN_WEEK ? 'on' : ''}" data-act="week" data-i="${i}" role="tab" aria-selected="${i === VS.PLAN_WEEK}">${esc(w.label)}${i === cw ? '<span class="dot" aria-label="aktuelle Woche"></span>' : ''}</button>`).join('')}</div>
    <div class="sec" style="margin-top:16px">
      <div class="sec-h"><h2>${fmtDate(week.startDate)} – ${fmtDate(week.endDate)}</h2><span class="aside num">${wp.done}/${wp.total} erledigt</span></div>
      <div class="hint"><strong>${esc(week.focus)}</strong>${week.isRecoveryWeek ? ' · Erholungswoche' : ''}</div>
      ${wp.html}
      ${weekStrip(week, true)}
      <textarea class="inp" rows="2" data-f="weeknote" data-week="${week.weekNumber}" placeholder="Wochennotiz: wie hat sich die Woche angefühlt?">${esc(STATE.weekNotes[week.weekNumber] || '')}</textarea>
    </div>
    <div class="sec">${week.days.map(d => dayCard({ ...d, weekIdx: VS.PLAN_WEEK })).join('')}</div>`;
  h += adjustmentsSection();
  $('#app').innerHTML = h;
}
/* Liste aller automatischen Anpassungen, gruppiert, mit Rückgängig */
export function adjustmentGroups() {
  const groups = {};
  Object.values(STATE.adjustments || {}).forEach(a => {
    if (!a || !a.id) return;
    const g = a.group || a.id;
    (groups[g] = groups[g] || { id: g, items: [], createdAt: 0, date: a.date }).items.push(a);
    groups[g].createdAt = Math.max(groups[g].createdAt, a.createdAt || 0);
  });
  return Object.values(groups).sort((a, b) => b.createdAt - a.createdAt);
}
export function adjustmentsSection() {
  const from = addDays(todayStr(), -30);
  const groups = adjustmentGroups().filter(g => !g.date || g.date >= from);
  const body = groups.length ? groups.map(g => {
    const undone = g.items.every(a => a.undone);
    const note = g.items.find(a => a.type === 'note');
    const changes = g.items.filter(a => a.type !== 'note');
    const reason = (note && note.reason) || (changes[0] && changes[0].reason) || '';
    return `<div class="adj ${undone ? 'undone' : ''}" data-group="${esc(g.id)}">
      <div class="adj-h"><span class="lbl">${g.date ? dowShort(g.date) + ' ' + fmtDate(g.date) : ''}</span>${undone ? '<span class="pill pill-skipped">Rückgängig gemacht</span>' : ''}</div>
      ${note ? `<div class="adj-t">${esc(note.what)}</div>` : ''}
      ${changes.map(a => `<div class="adj-t">${esc(a.what || '')}</div>`).join('')}
      ${changes.length || !note ? '' : '<div class="hint">Keine Einheit geändert.</div>'}
      <div class="hint">Warum: ${esc(reason)}</div>
      ${changes.length ? `<button class="btn ghost small" data-act="adj-undo">${undone ? 'Wieder anwenden' : 'Rückgängig'}</button>` : ''}</div>`;
  }).join('') : '<div class="empty">Noch keine automatischen Anpassungen. Die App passt den Plan morgens nach der Ampel und sonntags um 18 Uhr für die nächste Woche an.</div>';
  return `<div class="sec"><div class="sec-h"><h2>Anpassungen</h2><span class="aside">letzte 30 Tage</span></div><div class="panel">
    <div class="hint">Große Änderungen wie neue Blöcke, Tests und Wettkämpfe kommen weiter vom Coach über „Plan aktualisieren“.</div>${body}</div></div>`;
}
