/* Einheit: Ansicht und Bearbeiten im Sheet, Abhaken. Werte von der Uhr tragen ihre Quelle,
   Korrekturen von Hand gelten ab dann, „Auf Original zurücksetzen“ holt die Werte der Uhr zurück. */
import * as C from '../../../shared/core';
import { STATE, SESS_BY_ID, saveState, saveSoon, profile } from '../store';
import { esc, fmtDate, dowShort, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { duration, dist, num, pace, swimPace, speed, mmss } from '../../../shared/i18n';
import { on, onChange, openSheet, refreshSheet, closeSheet, srcBadge, sportIc, sportLabel, more, field, ic, pill, timeField, readTime, secToMmss } from '../kit';
import { sessState, ensureSess, effStatus } from '../domain';
import { setSessionMetricManual, resetSessionMetrics } from '../../../shared/activity/merge';
import { nav } from '../nav';
import { fieldsBlock } from './fieldsui';
import { checkTestResult } from '../testupdate';
import { structureOf } from '../../../shared/coach/explain';
import { toast } from '../toast';
import { SPORT_COLOR } from '../icons';

export function zoneText(s: any): string {
  const bpm = C.zoneBpm(s, profile().thresholds, null);
  return [s.zone, bpm].filter(Boolean).join(' · ');
}
export function metaLine(s: any): string {
  return [s.plannedMinutes ? duration(s.plannedMinutes) : null, s.plannedKm ? (s.sport === 'swim' ? `${Math.round(s.plannedKm * 1000)} m` : dist(s.plannedKm)) : null, zoneText(s) || null].filter(Boolean).join(' · ');
}
export function doneLine(s: any): string {
  const m = (sessState(s.id).metrics) || {};
  const parts: string[] = [];
  if (m.min) parts.push(duration(+String(m.min).replace(',', '.')));
  if (s.sport === 'swim' && m.meters) parts.push(`${m.meters} m`); else if (m.km) parts.push(dist(+String(m.km).replace(',', '.')));
  if (m.pace && s.sport === 'run') parts.push(`${m.pace}/km`);
  if (m.pace100 && s.sport === 'swim') parts.push(`${m.pace100}/100 m`);
  if (m.hr) parts.push(`${t('m.hr')} ${m.hr}`);
  return parts.join(' · ');
}
export function statusIcon(status: string): string {
  return ({ done: pill('✓ ' + t('st.done'), 'good'), skipped: pill(t('st.skipped')), sick: pill(t('st.sick'), 'bad'), missed: pill(t('st.missed'), 'warn'), cancelled: pill(t('st.cancelled')) } as any)[status] || '';
}
/* Kompakte Zeile für Listen */
export function sessionRow(s: any, opts: { check?: boolean } = {}): string {
  const st = sessState(s.id);
  const status = effStatus(s);
  const sub = status === 'done' ? (doneLine(s) || metaLine(s)) : metaLine(s);
  const badges = (s._adj && s._adj.length ? pill(s.movedFrom ? t('st.moved') : t('st.adjusted'), 'warn') : '') + (st.source ? ' ' + srcBadge(st.source) : '');
  const check = opts.check !== false && s.sport !== 'rest' && status !== 'cancelled' && status !== 'sick'
    ? `<button class="check ${st.completed ? 'on' : ''}" data-act="sess-toggle" data-sid="${esc(s.id)}" aria-pressed="${!!st.completed}" aria-label="${esc(st.completed ? t('sess.undone') : t('sess.done'))}">${ic('check')}</button>` : statusIcon(status);
  return `<div class="li wo ${status === 'cancelled' ? 'cancelled' : ''}" style="--c:${SPORT_COLOR[s.sport] || 'var(--rest)'}">
    <button class="row grow" data-act="sess-open" data-sid="${esc(s.id)}" style="border:0;background:none;text-align:left;padding:0;color:inherit;min-height:44px">
      ${sportIc(s.sport)}<span class="grow"><span class="t">${esc(s.title)}</span> ${badges}<br><span class="s">${esc(sub)}</span></span></button>
    <span class="wo-status">${status === 'done' || status === 'open' || status === 'missed' ? check : statusIcon(status)}</span></div>`;
}

/* ---------- Sheet ---------- */
const FIELDS: Record<string, [string, string, string?][]> = {
  run: [['km', 'm.km'], ['min', 'm.min'], ['hr', 'm.hr'], ['pace', 'm.pace', '5:30']],
  bike: [['km', 'm.km'], ['min', 'm.min'], ['hr', 'm.hr'], ['speed', 'm.speed'], ['power', 'm.power']],
  swim: [['meters', 'm.meters'], ['min', 'm.min'], ['pace100', 'm.pace100', '2:10'], ['spl', 'm.spl'], ['dps', 'm.dps']],
  strength: [['min', 'm.min'], ['liftKg', 'm.liftKg']],
  football: [['min', 'm.min'], ['hr', 'm.hr']]
};
export function openSession(id: string): void {
  const s = SESS_BY_ID[id]; if (!s) return;
  openSheet(s.title, () => sessionSheet(id));
}
function sessionSheet(id: string): string {
  const s = SESS_BY_ID[id]; if (!s) return '';
  const st = sessState(id);
  const status = effStatus(s);
  const act = st.activityId ? (STATE.activities || {})[st.activityId] : null;
  const man = st.metricsManual || {};
  const auto = st.metricsAuto || {};
  const fields = FIELDS[s.sport] || [['min', 'm.min']];
  let h = `<div class="stack">
    <div class="row">${sportIc(s.sport)}<div class="grow"><div class="lbl">${esc(sportLabel(s.sport))} · ${dowShort(s.date)} ${fmtDate(s.date)}</div><div class="small muted">${esc(metaLine(s))}</div></div>${statusIcon(status)}</div>
    ${structureHtml(s)}`;
  if (s._adj && s._adj.length) {
    const list = s._adj.map((aid: string) => STATE.adjustments[aid]).filter(Boolean);
    const o = s._orig || {};
    h += `<div class="banner">${list.map((a: any) => `<b>${esc(a.what || '')}</b><br>${esc(t('adj.why'))}: ${esc(a.reason || '')}`).join('<br>')}${o.title ? `<br><span class="muted">${esc(t('adj.original'))}: ${esc([o.title, o.plannedMinutes ? o.plannedMinutes + ' min' : null, o.zone].filter(Boolean).join(' · '))}</span>` : ''}</div>`;
  }
  if (s.sport !== 'rest' && status !== 'cancelled') {
    h += `<div class="row">
      <button class="btn ${st.completed ? '' : 'ghost'} grow" data-act="sess-toggle" data-sid="${esc(id)}">${ic('check')} ${esc(st.completed ? t('sess.isDone') : t('sess.markDone'))}</button>
      <button class="btn ghost" data-act="sess-skip" data-sid="${esc(id)}" aria-pressed="${!!st.skipped}">${esc(st.skipped ? t('sess.unskip') : t('sess.skip'))}</button></div>`;
  }
  if (st.skipped) h += field('f-skipReason', t('sess.skipReason'), st.skipReason || '', { data: `data-sf="skipReason" data-sid="${esc(id)}"`, wide: true });
  // Felder statt Notizfeld (Auftrag 7): Werte je Sportart mit Quelle, RPE, Gefühl, Abweichung, optionale Notiz
  if (s.sport !== 'rest' && (st.completed || status === 'missed' || status === 'open' || status === 'skipped')) h += fieldsBlock({ kind: 'session', id, date: s.date, sport: s.sport, planned: s });
  if (act) h += activityDetails(act);
  if (s.sport !== 'rest') h += more(t('sess.time'), `<div class="fgrid">${field('f-time', t('sess.time'), st.time || '', { type: 'time', data: `data-sf="time" data-sid="${esc(id)}"` })}</div>`);
  return h + '</div>';
}
/* Ablauf der Einheit in Schritten (Auftrag 7): Ein-/Aufwärmen, Hauptteil mit Wiederholungen, Pausen und Zonen, Ausklang */
export function structureHtml(s: any): string {
  const x = s.sport !== 'rest' ? structureOf(s, profile(), todayStr()) : null;
  if (!x || !x.parts.length) return s.description ? `<div class="hint" style="white-space:pre-line">${esc(s.description)}</div>` : '';
  const when = s.spec && s.spec.when ? `<div class="xs muted">${esc(s.spec.when)}</div>` : s.slot === 'am' ? `<div class="xs muted">${esc(t('sess.morning'))}</div>` : '';
  return `<div class="card flat tight structure" data-structure>${when}<ol class="steps">${x.parts.map(p => `<li data-part="${p.part}"><b>${esc(p.label)}</b><ul>${p.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></li>`).join('')}</ol>
    ${x.how ? `<div class="small"><b>${esc(t('sess.how'))}:</b> ${esc(x.how)}</div>` : ''}${x.tip ? `<div class="small"><b>${esc(t('sess.tip'))}:</b> ${esc(x.tip)}</div>` : ''}${x.why ? `<div class="small muted"><b>${esc(t('sess.why'))}:</b> ${esc(x.why)}</div>` : ''}
    ${x.derived && s.description ? more(t('sess.original'), `<div class="hint" style="white-space:pre-line">${esc(s.description)}</div>`) : ''}</div>`;
}
export function activityDetails(a: any): string {
  const rows: string[] = [];
  if (a.hrZones) { const tot = a.hrZones.reduce((x: number, y: number) => x + y, 0) || 1; rows.push(`<div class="lbl">${esc(t('act.zones'))}</div><div class="row" style="gap:3px;height:12px;border-radius:6px;overflow:hidden">${a.hrZones.map((sec: number, i: number) => `<i style="flex:${sec / tot};height:12px;background:${['var(--rest)', 'var(--info)', 'var(--good)', 'var(--warn)', 'var(--bad)'][i]}" title="Z${i + 1}: ${Math.round(sec / 60)} min"></i>`).join('')}</div><div class="xs muted">${a.hrZones.map((sec: number, i: number) => `Z${i + 1} ${Math.round(sec / 60)}′`).join(' · ')}</div>`); }
  const kv: [string, string][] = [];
  if (a.decouplingPct != null) kv.push([t('act.decoupling'), num(a.decouplingPct, 1) + ' %']);
  if (a.efficiency != null) kv.push([t('act.efficiency'), num(a.efficiency, 2) + (a.sport === 'bike' && a.avgPower ? ' W/' : ' m/') + t('act.beat')]);
  if (a.ascentM) kv.push([t('act.ascent'), Math.round(a.ascentM) + ' m']);
  if (a.tempC != null) kv.push([t('act.temp'), num(a.tempC, 0) + ' °C']);
  if (a.swim) {
    if (a.swim.pace100) kv.push([t('m.pace100'), swimPace(a.swim.pace100)]);
    if (a.swim.strokesPerLength) kv.push([t('m.spl'), num(a.swim.strokesPerLength, 1)]);
    if (a.swim.metersPerStroke) kv.push([t('m.dps'), num(a.swim.metersPerStroke, 2) + ' m']);
    if (a.swim.longestContinuousM) kv.push([t('act.longest'), a.swim.longestContinuousM + ' m']);
  }
  if (a.paceSecKm) kv.push([t('m.pace'), pace(a.paceSecKm)]);
  if (a.speedKmh && a.sport === 'bike') kv.push([t('m.speed'), speed(a.speedKmh)]);
  if (kv.length) rows.push(kv.map(([k, v]) => `<div class="kv"><span class="muted">${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join(''));
  if (a.intervals) {
    const iv = a.intervals;
    rows.push(`<div class="lbl">${esc(t('act.intervals'))}</div><div class="hint">${esc(t('act.ivLine', { n: iv.count, drift: iv.hrDriftPct != null ? num(iv.hrDriftPct, 1) : '–', drop: iv.dropPct != null ? num(iv.dropPct, 1) : '–', rec: iv.recoveryHrDrop ?? '–' }))}</div>`);
  }
  if (a.laps && a.laps.length > 1) {
    rows.push(`<div class="scroll-x"><table class="tbl"><thead><tr><th>#</th><th>${esc(t('act.lapKind'))}</th><th>${esc(t('m.min'))}</th><th>${esc(a.sport === 'swim' ? 'm' : 'km')}</th><th>${esc(t('m.hr'))}</th></tr></thead><tbody>${a.laps.slice(0, 30).map((l: any) => `<tr><td>${l.n}</td><td>${esc(t('lap.' + l.kind))}</td><td>${mmss(l.sec)}</td><td>${l.m != null ? (a.sport === 'swim' ? l.m : num(l.m / 1000, 2)) : '–'}</td><td>${l.avgHr ?? '–'}</td></tr>`).join('')}</tbody></table></div>`);
  }
  if (!rows.length) return '';
  return `<div class="card flat tight"><div class="spread"><div class="lbl">${esc(t('act.details'))}</div><span>${(a.sources || [a.source]).map((x: string) => srcBadge(x)).join(' ')}</span></div>${rows.join('')}</div>`;
}

/* ---------- Aktionen ---------- */
on('sess-open', el => openSession(el.dataset.sid!));
on('sess-toggle', el => {
  const st = ensureSess(el.dataset.sid!);
  st.completed = !st.completed;
  if (st.completed) st.skipped = false;
  saveState(); nav.rerender(); refreshSheet();
  if (st.completed) toast(t('sess.toastDone'));
  if (st.completed && checkTestResult()) { saveState(); nav.rerender(); }
});
on('sess-skip', el => {
  const st = ensureSess(el.dataset.sid!);
  st.skipped = !st.skipped; if (st.skipped) st.completed = false; else st.skipReason = '';
  saveState(); nav.rerender(); refreshSheet();
});
on('sess-reset', el => {
  const id = el.dataset.sid!;
  STATE.sessions[id] = resetSessionMetrics(sessState(id));
  saveState(); refreshSheet(); nav.rerender(); toast(t('common.resetDone'));
});
/* "5:30" oder Zahl → Sekunden (für die Min/Sek-Felder) */
function paceSecOf(v: any): number | null { if (v == null || v === '') return null; const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v).trim()); return m ? +m[1] * 60 + +m[2] : null; }
onChange('sess-metric', el => {
  const id = el.dataset.sid!; const k = el.dataset.sm!;
  let val = (el as HTMLInputElement).value.trim();
  if (el.dataset.tf) { const sec = readTime(el); if (sec != null && isNaN(sec)) { toast(t('time.invalid')); return; } val = sec ? secToMmss(sec) : ''; }
  STATE.sessions[id] = setSessionMetricManual(ensureSess(id), k, val);
  saveSoon(); nav.rerender();
});
onChange('sess-field', el => {
  const st = ensureSess(el.dataset.sid!); const k = el.dataset.sf!;
  st[k] = (el as HTMLInputElement).value;
  saveSoon();
});
export function closeIfOpen() { closeSheet(); }
void todayStr;
