/* Wiederverwendbare Bausteine: Einheiten-Karten, Tage, Wochenstreifen, Morgenwerte-Formular. */
import * as CoachCore from '../../shared/core';
import { STATE, SESS } from './store';
import { esc, de, todayStr, fmtDate, dowShort, dowLong } from './util';
import { SPORTS, icon, uiIcon } from './icons';
import { sessState, effStatus, zoneRangeText, dayStats, METRIC_FIELDS, metricsSummary, trendAt } from './domain';
import { VS } from './viewstate';

export function sportTag(sport, extra) {
  const sp = SPORTS[sport] || SPORTS.rest;
  return `<div class="wo-tag">${icon(sport)}<span>${sp.label}</span>${extra || ''}</div>`;
}
export function qualitySeg(act, q) {
  const cur = q || 'ok';
  return `<div class="seg" role="group" aria-label="Wie war's?">${[['good', 'Gut'], ['ok', 'Okay'], ['bad', 'Schlecht']].map(([v, l]) =>
    `<button data-act="${act}" data-q="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
}
export function metricsBlock(sport, m) {
  const fields = METRIC_FIELDS[sport]; if (!fields) return '';
  m = m || {};
  const sum = metricsSummary(sport, m);
  return `<details class="mx"><summary>${uiIcon('plus', 14)} ${sum ? 'Daten: ' + esc(sum) : 'Daten von der Uhr eintragen'}</summary>
    <div class="fgrid">${fields.map(([k, lbl, ph]) => `<div class="fld"><label>${lbl}</label><input class="inp" ${ph ? 'type="text" inputmode="decimal"' : 'type="number" step="any" inputmode="decimal"'} data-f="m.${k}" value="${esc(m[k] ?? '')}" placeholder="${ph || ''}"></div>`).join('')}</div></details>`;
}
export function sessionCard(s) {
  const st = sessState(s.id);
  const status = effStatus(s);
  const sp = SPORTS[s.sport] || SPORTS.rest;
  const meta = [s.plannedMinutes ? s.plannedMinutes + ' min' : null, s.plannedKm ? de(s.plannedKm) + ' km' : null].filter(Boolean).join(' · ');
  const zone = s.zone ? `<span class="wo-zone">${esc(zoneRangeText(s.sport, s.zone))}</span>` : '';
  const pill = ({ skipped: '<span class="pill pill-skipped">Ausgefallen</span>', sick: '<span class="pill pill-sick">Krank · entfällt</span>', missed: '<span class="pill pill-missed">Nicht eingetragen</span>', cancelled: '<span class="pill pill-skipped">Entfällt</span>' }[status] || '') +
    (s._adj && s._adj.length ? `<span class="pill pill-adj">${s.movedFrom ? 'Verschoben' : 'Angepasst'}</span>` : '') +
    (status === 'done' && st.icuId ? '<span class="pill pill-icu">intervals.icu</span>' : '');
  if (status === 'cancelled') {
    return `<article class="wo is-skipped" data-sid="${esc(s.id)}" style="--sc:${sp.color}">
      <div class="wo-top"><div class="wo-main">${sportTag(s.sport, pill)}<h3 class="wo-title">${esc(s.title)}</h3></div></div>
      <p class="wo-desc">${esc(s.cancelReason || 'Entfällt wegen einer Anpassung.')} Rückgängig unter Plan → Anpassungen.</p></article>`;
  }
  let extra = '';
  if (status === 'done') {
    extra = `<div class="wo-extra">
      <div class="wo-row">${qualitySeg('sess-quality', st.quality)}</div>
      <div class="wo-row"><span class="lbl">RPE</span><input class="inp sm" type="number" min="1" max="10" inputmode="numeric" data-f="rpe" value="${esc(st.rpe ?? '')}" placeholder="1-10">
      ${(s.sport === 'run' || s.sport === 'bike') ? `<span class="lbl">Temp °C</span><input class="inp sm" type="number" step="any" data-f="temp" value="${esc(st.temp ?? '')}">` : ''}</div>
      ${metricsBlock(s.sport, st.metrics)}
    </div>`;
  } else if (status === 'open' && s.sport !== 'rest') {
    const tAuto = CoachCore.sessionTime(s, null);
    extra = `<div class="wo-row"><span class="lbl">Uhrzeit</span><input class="inp sm" type="time" data-f="time" value="${esc(st.time || '')}" placeholder="${esc(tAuto || '')}" aria-label="Uhrzeit für die Erinnerung"><span class="hint" style="margin:0">${st.time ? 'Erinnerung 1 h vorher' : tAuto ? 'laut Plan ' + esc(tAuto) : 'für die Erinnerung (optional)'}</span></div>`;
  } else if (status === 'skipped') {
    extra = `<div class="fld"><label>Grund (optional)</label><input class="inp" type="text" data-f="skipReason" value="${esc(st.skipReason || '')}" placeholder="z. B. Krankheit, Termin, Ruhetag"></div>`;
  }
  const notes = (s.sport !== 'rest' && status !== 'skipped' && status !== 'sick') ? `<textarea class="inp" rows="2" data-f="notes" placeholder="Deine Daten und Notizen …">${esc(st.notes || '')}</textarea>` : '';
  const btns = s.sport === 'rest' ? '' : `<div class="wo-btns">
      <button class="rbtn skip ${st.skipped ? 'on' : ''}" data-act="sess-skip" aria-pressed="${!!st.skipped}" aria-label="${st.skipped ? 'Ausgefallen rückgängig machen' : 'Als ausgefallen markieren'}" title="Ausgefallen">${uiIcon('skip')}</button>
      <button class="rbtn check ${st.completed ? 'on' : ''}" data-act="sess-toggle" aria-pressed="${!!st.completed}" aria-label="${st.completed ? 'Nicht erledigt' : 'Erledigt'}" title="Erledigt">${uiIcon('check')}</button>
    </div>`;
  return `<article class="wo is-${status}" data-sid="${esc(s.id)}" style="--sc:${sp.color}">
    <div class="wo-top"><div class="wo-main">${sportTag(s.sport, zone + pill)}<h3 class="wo-title">${esc(s.title)}</h3>${meta ? `<div class="wo-meta">${meta}</div>` : ''}</div>${btns}</div>
    ${s.description && status !== 'sick' ? `<p class="wo-desc ${s.description.length > 95 ? 'clamp' : ''}">${esc(s.description)}</p>${s.description.length > 95 ? '<button class="link" data-act="expand" style="align-self:flex-start">Mehr anzeigen</button>' : ''}` : ''}
    ${s._adj && s._adj.length ? adjInfo(s) : ''}
    ${extra}${notes}
  </article>`;
}
/* Warum die Einheit angepasst wurde und wie das Original aussah */
export function adjInfo(s) {
  const list = s._adj.map(id => (STATE.adjustments || {})[id]).filter(Boolean);
  const o = s._orig || {};
  const orig = [o.title, o.plannedMinutes ? o.plannedMinutes + ' min' : null, o.plannedKm ? de(o.plannedKm) + ' km' : null, o.zone].filter(Boolean).join(' · ');
  return `<details class="adj-info"><summary>${uiIcon('chev', 14)} Warum angepasst? · Original ansehen</summary>
    <div class="hint">${list.map(a => `${esc(a.what)}${a.reason ? `<br><span class="muted">Grund: ${esc(a.reason)}</span>` : ''}`).join('<br>')}</div>
    ${orig ? `<div class="hint"><b>Original${o.date && s.movedFrom ? ' (' + dowShort(o.date) + ' ' + fmtDate(o.date) + ')' : ''}:</b> ${esc(orig)}${o.description ? '<br>' + esc(o.description) : ''}</div>` : ''}</details>`;
}
export function customCard(w, date) {
  const sp = SPORTS[w.sport] || SPORTS.rest;
  const meta = [w.plannedMinutes ? w.plannedMinutes + ' min' : null, w.plannedKm ? de(w.plannedKm) + ' km' : null].filter(Boolean).join(' · ');
  return `<article class="wo is-done" data-cid="${esc(w.id)}" data-cdate="${esc(date)}" style="--sc:${sp.color}">
    <div class="wo-top"><div class="wo-main">${sportTag(w.sport, '<span class="pill pill-extra">Nicht im Plan</span>' + (w.icuId ? '<span class="pill pill-icu">intervals.icu</span>' : ''))}<h3 class="wo-title">${esc(w.title)}</h3>${meta ? `<div class="wo-meta">${meta}</div>` : ''}</div>
      <button class="btn danger small" data-act="cust-remove">Entfernen</button></div>
    <div class="wo-row">${qualitySeg('cust-quality', w.quality)}</div>
    ${metricsBlock(w.sport, w.metrics)}
    <textarea class="inp" rows="2" data-f="description" placeholder="Was genau, Daten, Gefühl …">${esc(w.description || '')}</textarea>
  </article>`;
}


export function addBlock(date) {
  if (VS.ADD_OPEN !== date) return `<button class="add-btn" data-act="add-open" data-date="${date}">+ Einheit hinzufügen, die nicht im Plan war</button>`;
  return `<div class="add-form">
    <div class="fgrid">
      <div class="fld"><label for="add-sport">Sport</label><select class="inp" id="add-sport">${['run', 'bike', 'swim', 'strength', 'football'].map(k => `<option value="${k}">${SPORTS[k].label}</option>`).join('')}</select></div>
      <div class="fld" style="grid-column: span 2"><label for="add-title">Titel</label><input class="inp" id="add-title" type="text" placeholder="z. B. Spaziergang"></div>
      <div class="fld"><label for="add-min">Minuten</label><input class="inp" id="add-min" type="number" step="any" inputmode="decimal"></div>
      <div class="fld"><label for="add-km">km</label><input class="inp" id="add-km" type="number" step="any" inputmode="decimal"></div>
    </div>
    <textarea class="inp" id="add-desc" rows="2" placeholder="Was genau, Daten, Gefühl …"></textarea>
    <div class="row"><button class="btn small" data-act="add-save" data-date="${date}">Speichern</button><button class="btn ghost small" data-act="add-cancel">Abbrechen</button></div>
  </div>`;
}
export function dayBadge(d) {
  const x = dayStats(d);
  if (!x.total && !x.custom) return '';
  if (x.sick && x.done === 0 && x.sick + x.skipped === x.total) return '<span class="badge sick">Krank</span>';
  const complete = x.total > 0 && x.done + x.skipped + x.sick === x.total && x.done > 0;
  return `<span class="badge ${complete ? 'ok' : ''}">${x.done}/${x.total}${x.custom ? ' +' + x.custom : ''}</span>`;
}
export function dayCard(d, opts?) {
  opts = opts || {};
  const t = todayStr(); const isToday = d.date === t;
  const open = opts.open != null ? opts.open : (STATE.openDays[d.date] ?? isToday);
  const customs = STATE.customWorkouts[d.date] || [];
  return `<section class="day ${open ? 'open' : ''} ${isToday ? 'today' : ''}" data-date="${d.date}" id="day-${d.date}">
    ${opts.noHead ? '' : `<button class="day-h" data-act="day-toggle" aria-expanded="${open}">
      <span class="t"><span class="dw">${esc(d.dow)}</span><span class="dd">${fmtDate(d.date)}</span>${isToday ? '<span class="badge today">HEUTE</span>' : ''}</span>
      <span class="row" style="flex-wrap:nowrap">${dayBadge(d)}<span class="chev">${uiIcon('chev', 18)}</span></span></button>`}
    <div class="day-b" ${opts.noHead ? 'style="padding-top:12px"' : ''}>
      ${d.sessions.map(s => sessionCard({ ...s, date: d.date })).join('')}
      ${(d.moved || []).map(m => `<div class="moved-note">${icon(m.sport)}<span>${esc(m.title)} wurde auf <b>${dowShort(m.to)} ${fmtDate(m.to)}</b> verschoben.</span></div>`).join('')}
      ${customs.map(w => customCard(w, d.date)).join('')}
      ${addBlock(d.date)}
    </div></section>`;
}
export function weekStrip(week, jump?) {
  const t = todayStr();
  return `<div class="strip">${week.days.map(d => {
    const x = dayStats(d);
    const real = d.sessions.filter(s => s.sport !== 'rest');
    const cls = [d.date === t ? 'today' : '',
      x.sick ? 'sick' : '',
      x.total && x.done && x.done + x.skipped + x.sick === x.total ? 'complete' : (x.done ? 'partial' : ''),
      x.missed ? 'missed' : '',
      x.total && x.skipped === x.total ? 'excused' : ''].filter(Boolean).join(' ');
    const dots = real.map(s => `<i style="--c:${(SPORTS[s.sport] || SPORTS.rest).color}"></i>`).join('') + (x.custom ? `<i style="--c:var(--accent)"></i>` : '');
    return `<button class="tile-day ${cls}" data-act="${jump ? 'strip-jump' : 'go-plan-day'}" data-date="${d.date}" aria-label="${dowLong(d.date)} ${fmtDate(d.date)}, ${x.done} von ${x.total} erledigt">
      <span class="dw">${dowShort(d.date)}</span><span class="dd">${fmtDate(d.date)}</span><span class="dots">${dots}</span></button>`;
  }).join('')}</div>`;
}
export function weekProgress(week) {
  let done = 0, total = 0, sick = 0, skipped = 0;
  week.days.forEach(d => { const x = dayStats(d); done += x.done; total += x.total; sick += x.sick; skipped += x.skipped; });
  const pct = v => total ? (v / total * 100).toFixed(1) : 0;
  return { done, total, sick, skipped, html: `<div class="progress" role="img" aria-label="${done} von ${total} erledigt"><i style="width:${pct(done)}%;background:var(--good)"></i><i style="width:${pct(skipped)}%;background:var(--rest);opacity:.6"></i><i style="width:${pct(sick)}%;background:var(--bad);opacity:.45"></i></div>` };
}

/* ================= Check-in form ================= */
export const CHECKIN_GROUPS: any[] = [
  { t: 'Nacht (Oura)', keys: [['sleepHours', 'Schlaf h'], ['sleepQuality', 'Qualität /10'], ['restingHR', 'Ruhepuls'], ['hrv', 'HFV ms'], ['bodyTemp', 'Temp.-Abw. °C', true], ['breathingRate', 'Atemfreq.'], ['remSleep', 'REM min'], ['deepSleep', 'Tiefschlaf min'], ['sleepLatency', 'Latenz min'], ['spo2', 'SpO2 %']] },
  { t: 'Status (Garmin)', keys: [['ctl', 'CTL'], ['atl', 'ATL'], ['tsb', 'TSB', true], ['vo2max', 'VO2max'], ['cardioRecovery', 'Cardio-Erh.']] }
];
export function checkinFields(prefix, date) {
  const p: any = trendAt(date) || {};
  return CHECKIN_GROUPS.map(g => `<div><div class="fgroup-t">${g.t}</div><div class="fgrid">${g.keys.map(([k, l, signed]) =>
    `<div class="fld"><label for="${prefix}-${k}">${l}</label><input class="inp" id="${prefix}-${k}" type="number" step="any" ${signed ? '' : 'inputmode="decimal"'} value="${p[k] ?? ''}"></div>`).join('')}</div></div>`).join('') +
    `<div class="fld"><label for="${prefix}-illness">Symptome, Verletzung, Notiz</label><input class="inp" id="${prefix}-illness" type="text" value="${esc(p.illness || '')}" placeholder="z. B. Halskratzen, Muskelkater"></div>`;
}
