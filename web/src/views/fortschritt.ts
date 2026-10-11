/* Fortschritt-Bildschirm */
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
import { sessionMinutes, sessDoneMinutes, sessDoneKm } from '../nutrition';

export function renderFortschritt() {
  let h = `<h1 class="view-title">Fortschritt<small>Was sich seit dem Start getan hat</small></h1>`;
  const cal = PLAN.meta.scoreCalibration;
  h += `<div class="sec" style="margin-top:0"><div class="sec-h"><h2>Sport-Scores</h2>${cal ? `<span class="aside">Coach-Stand ${fmtDate(cal.date)}</span>` : ''}</div><div class="scores">${['swim', 'bike', 'run', 'strength'].map(sp => {
    const sc = computeScore(sp); const r = 27, c = 2 * Math.PI * r;
    return `<div class="score"><div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" style="stroke:var(--surface-2)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" style="stroke:${SPORTS[sp].color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c - sc / 100 * c).toFixed(1)}"/></svg><b>${sc}</b></div>
      <div class="nm">${SPORTS[sp].label}</div><div class="tr">${tierLabel(sc)}</div>
      <div class="adj"><button data-act="score" data-sport="${sp}" data-dir="-1" aria-label="${SPORTS[sp].label} minus 1">−</button><button data-act="score" data-sport="${sp}" data-dir="1" aria-label="${SPORTS[sp].label} plus 1">+</button></div></div>`;
  }).join('')}</div>
  ${cal ? `<details class="fold panel"><summary><span class="hint">Wie die Scores zustande kommen</span><span class="chev">${uiIcon('chev', 18)}</span></summary><div class="fold-body hint">${['swim', 'bike', 'run', 'strength'].map(sp => esc(cal.notes[sp])).join('<br>')}<br>Seit dem Coach-Stand bewegen abgehakte Einheiten die Scores (Gut +3, Okay +0,3, Schlecht −2), verpasste kosten 1,2 Punkte. Ausgefallene und Krankheitstage zählen nicht.</div></details>` : ''}</div>`;

  const sp = UI.perfSport || 'swim';
  const E = perfEntries(sp);
  h += `<div class="sec"><div class="sec-h"><h2>Leistung</h2></div>
    <div class="seg" role="tablist">${[['swim', 'Schwimmen'], ['run', 'Laufen'], ['bike', 'Rad']].map(([k, l]) => `<button class="${sp === k ? 'on' : ''}" data-act="perf" data-sport="${k}" role="tab" aria-selected="${sp === k}">${l}</button>`).join('')}</div>`;
  if (sp === 'swim') {
    h += `<div class="panel"><div class="lbl">Kraul-Pace pro 100 m (oben = schneller)</div>${lineChart(E, [{ key: 'pace100', name: 'Pace', color: 'var(--swim)', fmt: secToPace }], { invert: true, fmt: secToPace, h: 160, label: 'Schwimm-Pace' })}</div>
      <div class="panel"><div class="lbl">Züge pro 25-m-Bahn (weniger = effizienter)</div>${lineChart(E, [{ key: 'spl', name: 'Züge/Bahn', color: 'var(--swim)', area: true }], { h: 150, label: 'Züge pro Bahn' })}
      <div class="hint">Weniger Züge bei gleichem Tempo heißt: längerer Zug und bessere Wasserlage. Werte mit viel Pull Buoy sind besser als ohne, schreib das in die Notizen.</div></div>`;
    h += perfTable(E, [['Meter', e => de(e.meters)], ['Pace', e => secToPace(e.pace100)], ['Züge/Bahn', e => de(e.spl)], ['m/Zug', e => de(e.dps)], ['Züge/min', e => de(e.rate)]]);
  } else {
    const key = sp === 'run' ? 'Laufen' : 'Rad';
    h += `<div class="panel"><div class="lbl">Meter pro Herzschlag (höher = effizienter)</div>${lineChart(E, [{ key: 'eff', name: 'm/Schlag', color: SPORTS[sp].color, area: true, fmt: v => de(v, 2) }], { h: 170, fmt: v => de(v, 2), label: key + ' Effizienz' })}
      <div class="hint">Tempo geteilt durch Ø Puls. Steigt der Wert bei lockeren Einheiten, wird dein Herz effizienter. Hitze, Müdigkeit und Hügel drücken ihn.</div></div>`;
    h += sp === 'run'
      ? perfTable(E, [['km', e => de(e.km)], ['Pace', e => e.pace ? secToPace(e.pace) : '–'], ['Ø HF', e => de(e.hr)], ['m/Schlag', e => e.eff ? de(e.eff, 2) : '–']])
      : perfTable(E, [['km', e => de(e.km)], ['km/h', e => e.speed ? de(e.speed, 1) : '–'], ['Ø HF', e => de(e.hr)], ['m/Schlag', e => e.eff ? de(e.eff, 2) : '–']]);
  }
  h += `<div class="hint">Neue Werte kommen aus den Feldern „Daten von der Uhr eintragen“ in abgehakten Einheiten.</div></div>`;

  const vo2 = STATE.trend.filter(p => p.vo2max != null);
  h += `<div class="sec"><div class="sec-h"><h2>VO2max</h2></div><div class="panel">${lineChart(vo2, [{ key: 'vo2max', name: 'VO2max', color: 'var(--accent)', area: true, fmt: v => de(v, 1) }], { h: 150, fmt: v => de(v, 1), shade: illnessShades(), label: 'VO2max' })}<div class="hint">${vo2Insight(vo2)}</div></div></div>`;

  h += volumeSection();

  const ms = [...STATE.milestones].sort((a, b) => b.date.localeCompare(a.date));
  h += `<div class="sec"><div class="sec-h"><h2>Meilensteine</h2><span class="aside">${ms.length}</span></div><div class="panel">
    ${ms.length ? ms.map(m => `<div class="ms" data-mid="${esc(m.id)}"><div class="when">${fmtDate(m.date)}</div><div class="txt">${esc(m.text)}</div><button class="btn danger small" data-act="ms-del">Löschen</button></div>`).join('') : '<div class="empty">Noch keine Meilensteine.</div>'}
    <div class="hr"></div>
    <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="ms-date">Datum</label><input class="inp" type="date" id="ms-date" value="${todayStr()}"></div><div class="fld wide"><label for="ms-text">Was hast du geschafft?</label><input class="inp" type="text" id="ms-text" placeholder="z. B. 50 m Kraul am Stück"></div></div>
    <button class="btn small" data-act="ms-add">Meilenstein hinzufügen</button></div></div>`;
  $('#app').innerHTML = h;
}
export function perfTable(E, cols) {
  if (!E.length) return '';
  return `<div class="panel scroll-x"><table class="tbl"><thead><tr><th>Datum</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${[...E].reverse().slice(0, 8).map(e => `<tr><td>${dowShort(e.date)} ${fmtDate(e.date)}</td>${cols.map(c => `<td>${c[1](e)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function vo2Insight(pts) {
  if (pts.length < 3) return 'Der Garmin-Schätzwert schwankt mit Tagesform, Hitze und Müdigkeit. Wichtig ist der Trend über Wochen.';
  const last3 = pts.slice(-3).map(p => p.vo2max);
  const tsbs = STATE.trend.filter(p => p.tsb != null).slice(-7).map(p => p.tsb);
  const avg = tsbs.length ? tsbs.reduce((a, b) => a + b, 0) / tsbs.length : null;
  if (last3[2] < last3[0] && avg != null && avg < -5) return `VO2max sinkt, während dein TSB im Schnitt bei ${de(avg, 1)} liegt. Das ist eher ein Müdigkeits-Effekt in der Messung als echter Fitnessverlust.`;
  if (last3[2] >= last3[0]) return 'VO2max zeigt zuletzt keinen fallenden Trend. Der Garmin-Wert schwankt mit der Tagesform, wichtig ist der Trend über Wochen.';
  return 'Der Garmin-Schätzwert schwankt mit Tagesform, Hitze und Müdigkeit. Wichtig ist der Trend über Wochen.';
}
export function volumeSection() {
  const mode = UI.volMode == null ? String(currentWeekIdx()) : UI.volMode;
  const weeks = mode === 'block' ? PLAN.weeks : [PLAN.weeks[parseInt(mode)] || PLAN.weeks[0]];
  const keys = ['swim', 'bike', 'run', 'strength', 'football'];
  const T = {}; keys.forEach(k => { T[k] = { ph: 0, dh: 0, pk: 0, dk: 0 }; });
  weeks.forEach(w => w.days.forEach(d => {
    d.sessions.forEach(s0 => {
      const s = { ...s0, date: d.date }; if (!T[s.sport]) return;
      T[s.sport].ph += sessionMinutes(s) / 60; T[s.sport].pk += s.plannedKm || 0;
      if (effStatus(s) === 'done') { T[s.sport].dh += sessDoneMinutes(s) / 60; T[s.sport].dk += sessDoneKm(s); }
    });
    (STATE.customWorkouts[d.date] || []).forEach(c => {
      if (!T[c.sport]) return; const m = c.metrics || {};
      const min = parseNum(m.min) ?? c.plannedMinutes ?? 0; T[c.sport].dh += min / 60;
      T[c.sport].dk += parseNum(m.km) ?? (parseNum(m.meters) != null ? parseNum(m.meters) / 1000 : (c.plannedKm || 0));
    });
  }));
  const maxH = Math.max(0.1, ...keys.map(k => Math.max(T[k].ph, T[k].dh)));
  const rows = keys.filter(k => T[k].ph || T[k].dh);
  const totP = rows.reduce((a, k) => a + T[k].ph, 0), totD = rows.reduce((a, k) => a + T[k].dh, 0);
  const wk = PLAN.weeks.map((w, i) => {
    let p = 0, d = 0;
    w.days.forEach(day => { day.sessions.forEach(s0 => { const s = { ...s0, date: day.date }; if (s.sport === 'rest') return; p += sessionMinutes(s); if (effStatus(s) === 'done') d += sessDoneMinutes(s); }); (STATE.customWorkouts[day.date] || []).forEach(c => { d += parseNum((c.metrics || {}).min) ?? c.plannedMinutes ?? 0; }); });
    return { i, label: w.label.replace('Woche ', 'W'), p: p / 60, d: d / 60 };
  });
  const wmax = Math.max(0.1, ...wk.map(x => Math.max(x.p, x.d)));
  return `<div class="sec"><div class="sec-h"><h2>Trainingsvolumen</h2><span class="aside num">${de(totD, 1)} von ${de(totP, 1)} h</span></div>
    <div class="chips">${PLAN.weeks.map((w, i) => `<button class="chip ${mode === String(i) ? 'on' : ''}" data-act="vol" data-mode="${i}">${esc(w.label)}</button>`).join('')}<button class="chip ${mode === 'block' ? 'on' : ''}" data-act="vol" data-mode="block">Ganzer Block</button></div>
    <div class="panel"><div class="vol">${rows.map(k => `<div class="nm" style="--c:${SPORTS[k].color}">${icon(k)}<span>${SPORTS[k].label}</span></div>
      <div class="vbar" style="--c:${SPORTS[k].color}"><div class="p" style="width:${(T[k].ph / maxH * 100).toFixed(1)}%"></div><div class="d" style="width:calc(${(T[k].dh / maxH * 100).toFixed(1)}% - 6px)"></div></div>
      <div class="amt"><b>${de(T[k].dh, 1)}</b> / ${de(T[k].ph, 1)} h</div>`).join('')}</div>
      <div class="legend"><span><i style="--c:var(--ink-2)"></i>erledigt</span><span><i class="box" style="--c:var(--ink-2)"></i>geplant</span></div></div>
    <div class="panel"><div class="lbl">Stunden pro Woche</div><div class="wk-bars">${wk.map(x => `<div class="wk-bar"><div class="col" style="height:${(x.p / wmax * 92).toFixed(1)}%"><i style="height:${x.p ? Math.min(100, x.d / x.p * 100).toFixed(1) : 0}%"></i></div><div class="l">${x.label}<br>${de(x.d, 1)}/${de(x.p, 1)}</div></div>`).join('')}</div></div></div>`;
}
