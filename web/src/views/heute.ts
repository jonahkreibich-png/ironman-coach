/* Heute-Bildschirm */
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
import { syncStatusLine } from '../sync';
import { backupReminder } from './sheets';
import { nutritionMini } from '../nutrition';

export function renderHeute() {
  const t = todayStr();
  const R = computeReadiness();
  const day = findDay(t);
  const ill = R.ill, ret = R.ret;
  const todayPoint = trendAt(t);
  const haveToday = hasRecovery(todayPoint);
  const lightIcon = R.level === 0 ? uiIcon('bolt') : R.level === 1 ? uiIcon('walk') : uiIcon('pause');
  let h = `<h1 class="view-title">${dowLong(t)}<small>${fmtDate(t)} · ${day ? PLAN.weeks[day.weekIdx].label + ' · ' + esc(PLAN.weeks[day.weekIdx].focus) : 'außerhalb des aktuellen Blocks'}</small></h1>`;
  h += syncStatusLine();

  h += `<div class="ready l${R.level}">
    <div class="ready-head"><div class="light">${lightIcon}</div><div style="flex:1;min-width:0"><div class="ready-t">${esc(R.title)}</div><div class="ready-s">${esc(R.sub)}</div></div>${R.score != null && !ill ? `<div class="ready-score num" aria-label="Bereitschaft ${R.score} von 100"><b>${R.score}</b><span>/100</span></div>` : ''}</div>
    ${R.reasons.length && !ill ? `<ul class="ready-why">${R.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${R.crits.length ? `<div class="crits">${R.crits.map(c => `<span class="crit ${c.st}"><i></i>${c.k} <b>${c.v}</b>${c.t ? `<span class="t">${c.t}</span>` : ''}</span>`).join('')}</div>` : ''}
    ${readinessHistoryHtml(R.history)}
    ${R.point && !R.personal ? `<div class="hint">Noch weniger als ${CoachCore.MIN_DAYS} Tage Werte: Die Ampel nutzt feste Grenzwerte, bis dein persönlicher Normalbereich steht.</div>` : ''}
    <div class="ready-foot"><span class="hint">${R.stale ? `Werte vom ${fmtDate(R.point.date)}. Heute noch nichts eingetragen.` : (haveToday ? 'Morgenwerte von heute.' : '')}</span>
      ${ill ? '' : `<button class="btn ghost small" data-act="ill-start">Ich bin krank</button>`}</div>
  </div>`;

  if (ill) {
    const n = daysBetween(ill.start, t) + 1;
    const yest = addDays(t, -1);
    h += `<div class="sec"><div class="sec-h"><h2>Krankheit</h2><span class="aside">seit ${dowShort(ill.start)} ${fmtDate(ill.start)} · Tag ${n}</span></div>
      <div class="panel">
        <div class="hint">Geplante Einheiten in dieser Zeit zählen nicht als verpasst und kosten keine Score-Punkte. CTL und ATL fallen rechnerisch, weil du nicht trainierst. Das ist kein echter Fitnessverlust: ein paar Tage Pause holst du in ein bis zwei Wochen wieder auf.</div>
        ${todayPoint && todayPoint.illness ? `<div class="kv"><span class="muted">Heute notiert</span><span>${esc(todayPoint.illness)}</span></div>` : ''}
        <div class="banner info"><strong>Zum Arzt</strong> bei Fieber über 39 °C oder länger als 2-3 Tage, Atemnot, Brustschmerzen oder wenn du kaum trinken kannst.</div>
        <div class="hr"></div>
        <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="ill-end">Letzter Tag mit Symptomen</label><input class="inp" type="date" id="ill-end" value="${yest >= ill.start ? yest : t}" min="${ill.start}" max="${t}"></div></div>
        <button class="btn block" data-act="ill-end">Wieder gesund, Pause beenden</button>
      </div></div>`;
  } else if (ret) {
    h += `<div class="sec"><div class="sec-h"><h2>Wiedereinstieg</h2><span class="aside">Tag ${ret.day} ohne Symptome</span></div>
      <div class="panel"><div class="steps">${RETURN_STAGES.slice(1).map((s, i) => `<div class="step ${ret.stage === i + 1 ? 'now' : (ret.stage > i + 1 ? 'past' : '')}"><div class="n">${s.n}</div><div class="d">${s.d}</div></div>`).join('')}</div>
      <div class="hint">${ret.stage === 0 ? 'Heute noch abwarten. ' : ''}Der Plan unten gilt erst wieder voll ab Stufe 3. Bis dahin ersetzt die Stufe die geplanten Intervalle.</div>
      <button class="btn ghost small" data-act="ill-reopen">Doch noch krank</button></div></div>`;
  }

  h += backupReminder();
  h += `<div class="sec" id="checkin"><div class="panel"><details class="fold" ${haveToday ? '' : 'open'}>
      <summary><span><span class="sec-h"><h2>Morgenwerte</h2></span><span class="hint">${haveToday ? 'Für heute eingetragen. Tippen zum Ändern.' : 'Für heute noch nicht eingetragen.'}</span></span><span class="chev">${uiIcon('chev', 20)}</span></summary>
      <div class="fold-body">${checkinFields('h', t)}<button class="btn block" data-act="checkin-save" data-prefix="h">Werte speichern</button></div>
    </details></div></div>`;

  if (day) {
    const week = PLAN.weeks[day.weekIdx];
    h += `<div class="sec"><div class="sec-h"><h2>Training heute</h2><span class="aside">${dayBadge(day)}</span></div>${dayCard(day, { open: true, noHead: true })}</div>`;
    const wp = weekProgress(week);
    h += `<div class="sec"><div class="sec-h"><h2>${esc(week.label)}</h2><span class="aside num">${wp.done} von ${wp.total} erledigt${wp.sick ? ` · ${wp.sick} krank` : ''}</span></div>${wp.html}${weekStrip(week, false)}</div>`;
  } else {
    h += `<div class="sec"><div class="panel empty">Heute liegt außerhalb des aktuellen Plans. Der nächste Block kommt nach dem Schwellentest.</div></div>`;
  }

  const forgot = forgottenSessions();
  if (forgot.length) {
    const shown = VS.SHOW_ALL_MISSED ? forgot : forgot.slice(-5);
    h += `<div class="sec"><div class="sec-h"><h2>Noch offen</h2><span class="aside">${forgot.length} ${forgot.length === 1 ? 'Einheit' : 'Einheiten'} ohne Haken</span></div>
      <div class="panel"><div class="hint">Abhaken, wenn du sie gemacht hast, sonst als ausgefallen markieren. Details trägst du im Plan nach.</div>
      ${[...shown].reverse().map(s => `<div class="miss" data-sid="${esc(s.id)}" style="--sc:${(SPORTS[s.sport] || SPORTS.rest).color}">
        <span class="miss-ic">${icon(s.sport)}</span><div class="miss-t"><div class="lbl">${dowShort(s.date)} ${fmtDate(s.date)}</div><div>${esc(s.title)}</div></div>
        <div class="wo-btns"><button class="rbtn skip" data-act="sess-skip" aria-label="Als ausgefallen markieren" title="Ausgefallen">${uiIcon('skip')}</button><button class="rbtn check" data-act="sess-toggle" aria-label="Erledigt" title="Erledigt">${uiIcon('check')}</button></div></div>`).join('')}
      <div class="row" style="justify-content:space-between">${forgot.length > 5 ? `<button class="link" data-act="missed-all">${VS.SHOW_ALL_MISSED ? 'Weniger zeigen' : `Alle ${forgot.length} zeigen`}</button>` : '<span></span>'}<button class="btn ghost small" data-act="missed-skip-all">Alle als ausgefallen</button></div></div></div>`;
  }

  h += `<div class="sec"><div class="sec-h"><h2>Essen heute</h2></div>${nutritionMini()}</div>`;

  if (STATE.milestones.length) {
    const last = [...STATE.milestones].sort((a, b) => b.date.localeCompare(a.date))[0];
    h += `<div class="sec"><div class="sec-h"><h2>Letzter Meilenstein</h2></div><div class="panel"><div class="ms"><div class="when">${fmtDate(last.date)}</div><div class="txt">${esc(last.text)}</div></div></div></div>`;
  }
  h += `<div class="sec"><button class="btn block" data-act="export-open">Heute für den Chat exportieren</button></div>`;
  $('#app').innerHTML = h;
}
