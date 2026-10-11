/* Kopfzeile mit Countdown */
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


export function renderHeader() {
  const t = todayStr();
  const keys = (PLAN.keyDates || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const next = keys.find(k => k.date >= t);
  const im = daysBetween(t, PLAN.meta.eventDate);
  const nd = next ? daysBetween(t, next.date) : null;
  $('#clock').innerHTML = `<div class="eyebrow">${esc(APP.name)} · noch ${im.toLocaleString('de-DE')} Tage</div>
    <div class="clock-big num">${next ? `<b>${nd === 0 ? 'Heute' : nd + (nd === 1 ? ' Tag' : ' Tage')}</b><span>${esc(next.label)}</span>` : `<b>${im}</b><span>Tage bis ${esc(PLAN.meta.event || "zum Ziel")}</span>`}</div>`;
}
