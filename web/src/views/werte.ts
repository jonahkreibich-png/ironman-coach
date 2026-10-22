import { renderLoadValues } from './loadvalues';
/* Werte & Erholung: Morgenwerte mit Quelle, Verläufe, Belastung. Eingabe nur noch unter „Bearbeiten“,
   weil die Werte im Alltag automatisch kommen. Von Hand korrigierte Werte gelten, bis man sie zurücksetzt. */
import * as C from '../../../shared/core';
import { STATE, saveState } from '../store';
import { esc, fmtDate, dowShort, todayStr, parseNum } from '../util';
import { t, num, temp } from '../../../shared/i18n';
import { D } from '../data';
import { on, onChange, sec, srcBadge, openSheet, refreshSheet, ic, termLink } from '../kit';
import { setManual, resetToOriginal, hasOriginal, bestAuto, SOURCE_LABEL } from '../../../shared/activity/merge';
import { nav } from '../nav';
import { toast } from '../toast';

const FIELDS: [string, string, number][] = [
  ['sleepHours', 'v.sleepH', 1], ['sleepQuality', 'v.sleepQ', 0], ['hrv', 'v.hrvMs', 0], ['restingHR', 'v.rhr', 0], ['bodyTemp', 'v.temp', 2],
  ['breathingRate', 'v.breath', 1], ['spo2', 'v.spo2', 1], ['remSleep', 'v.rem', 0], ['deepSleep', 'v.deep', 0], ['sleepLatency', 'v.latency', 0]
];
/* Auftrag 14: Gefühl (1 sehr frisch … 5 sehr müde) und Muskelkater (0 keiner … 3 stark) zählen für die Ampel */
const MORNING_FEEL: [string, string][] = [['1', 'v.feel1'], ['2', 'v.feel2'], ['3', 'v.feel3'], ['4', 'v.feel4'], ['5', 'v.feel5']];
const SORENESS: [string, string][] = [['0', 'v.sore0'], ['1', 'v.sore1'], ['2', 'v.sore2'], ['3', 'v.sore3']];
const pointOf = (date: string) => (STATE.trend || []).find((p: any) => p.date === date) || null;

function tile(field: string, label: string, unit: string, dec: number): string {
  const series = (STATE.trend || []).filter((p: any) => p[field] != null).slice(-21);
  const last = series[series.length - 1];
  const prev = series.length > 7 ? series.slice(-8, -1).reduce((a: number, p: any) => a + p[field], 0) / 7 : null;
  const v = last ? last[field] : null;
  const delta = v != null && prev != null ? v - prev : null;
  return `<button class="crit" data-act="checkin-open" data-date="${last ? last.date : todayStr()}"><div class="k">${esc(label)} ${last ? srcBadge((last._src || {})[field]) : ''}</div>
    <div class="v">${v != null ? (field === 'bodyTemp' ? (v > 0 ? '+' : '') + num(v, dec) : num(v, dec)) : '–'}<small class="xs"> ${unit}</small></div>
    <div class="n">${last && last.date !== todayStr() ? fmtDate(last.date) + ' · ' : ''}${delta != null ? (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + t('v.vs7') : ''}</div></button>`;
}

export function renderWerte(): string {
  let h = `<div class="crit-grid">${tile('hrv', t('v.hrv'), 'ms', 0)}${tile('restingHR', t('v.rhr'), 'bpm', 0)}${tile('sleepHours', t('v.sleep'), 'h', 1)}${tile('bodyTemp', t('v.tempShort'), '°C', 1)}${tile('spo2', 'SpO2', '%', 1)}${tile('breathingRate', t('v.breathShort'), '/min', 1)}</div><p class="xs muted" data-term-links>${termLink('HFV')} · ${termLink('Ruhepuls')} · ${termLink('SpO2')} · ${termLink('Körpertemperatur', t('v.tempShort'))}</p>
    <button class="btn ghost block" data-act="checkin-open" data-date="${todayStr()}" style="margin-top:var(--s3)">${ic('edit')} ${esc(t('v.edit'))}</button>`;
  h += renderLoadValues();
  // Tabelle
  const rows = (STATE.trend || []).filter((p: any) => C.hasRecovery(p) || p.illness).slice(-10).reverse();
  if (rows.length) h += sec(t('v.nights'), `<div class="card tight scroll-x"><table class="tbl"><thead><tr><th>${esc(t('common.date'))}</th><th>${esc(t('v.sleep'))}</th><th>${esc(t('v.hrv'))}</th><th>${esc(t('v.rhr'))}</th><th>${esc(t('v.tempShort'))}</th><th></th></tr></thead><tbody>${rows.map((p: any) => `<tr><td><button class="link" data-act="checkin-open" data-date="${p.date}">${dowShort(p.date)} ${fmtDate(p.date)}</button></td><td>${num(p.sleepHours, 1)}</td><td>${p.hrv ?? '–'}</td><td>${p.restingHR ?? '–'}</td><td>${p.bodyTemp != null ? temp(p.bodyTemp, true) : '–'}</td><td>${[...new Set(Object.values(p._src || {}))].map((s: any) => srcBadge(s)).join(' ')}</td></tr>`).join('')}</tbody></table></div>`);
  return h;
}

/* ---------- Morgenwerte eintragen / korrigieren ---------- */
let CHECK_DATE = '';
export function openCheckin(date: string): void {
  CHECK_DATE = date;
  openSheet(t('v.editTitle'), checkinSheet);
}
function checkinSheet(): string {
  const p: any = pointOf(CHECK_DATE) || {};
  return `<div class="stack">
    <div class="fld"><label for="ck-date">${esc(t('common.date'))}</label><input class="inp" type="date" id="ck-date" value="${CHECK_DATE}" max="${todayStr()}" data-ch="ck-date"></div>
    <div class="fld wide"><span class="lab">${esc(t('v.feelMorning'))} ${srcBadge((p._src || {}).feel)}</span><div class="chips" style="flex-wrap:wrap">${MORNING_FEEL.map(([v, l]) => `<button class="chip ${String(p.feel ?? '') === v ? 'on' : ''}" aria-pressed="${String(p.feel ?? '') === v}" data-act="ck-chip" data-k="feel" data-v="${v}">${esc(t(l))}</button>`).join('')}</div></div>
    <div class="fld wide"><span class="lab">${esc(t('v.soreness'))} ${srcBadge((p._src || {}).soreness)}</span><div class="chips" style="flex-wrap:wrap">${SORENESS.map(([v, l]) => `<button class="chip ${String(p.soreness ?? '') === v ? 'on' : ''}" aria-pressed="${String(p.soreness ?? '') === v}" data-act="ck-chip" data-k="soreness" data-v="${v}">${esc(t(l))}</button>`).join('')}</div></div>
    <div class="fgrid">${FIELDS.map(([k, lk]) => {
      const src = (p._src || {})[k];
      const orig = hasOriginal(p, k) ? bestAuto(p, k, STATE.settings) : null;
      return `<div class="fld"><label for="ck-${k}">${esc(t(lk))} ${srcBadge(src)}</label><input class="inp" id="ck-${k}" type="text" inputmode="decimal" data-ch="ck-field" data-k="${k}" value="${esc(p[k] ?? '')}">
        ${orig ? `<button class="link" data-act="ck-reset" data-k="${k}">${ic('back').replace('<svg', '<svg width="12" height="12"')} ${esc(t('v.original', { v: num(orig.value, 1), s: SOURCE_LABEL[orig.source] || orig.source }))}</button>` : ''}</div>`;
    }).join('')}</div>
    <div class="fld"><label for="ck-note">${esc(t('v.note'))}</label><input class="inp" id="ck-note" type="text" data-ch="ck-note" value="${esc(p.illness || '')}" placeholder="${esc(t('v.notePh'))}"></div>
    <div class="hint">${esc(t('v.editHint'))}</div>
    <button class="btn block" data-act="sheet-close">${esc(t('common.done'))}</button></div>`;
}
function savePoint(p: any) {
  STATE.trend = (STATE.trend || []).filter((x: any) => x.date !== p.date).concat([p]).sort((a: any, b: any) => a.date.localeCompare(b.date));
  saveState(); nav.rerender();
}
onChange('ck-date', el => { CHECK_DATE = (el as HTMLInputElement).value || todayStr(); refreshSheet(); });
onChange('ck-field', el => {
  const k = el.dataset.k!; const raw = (el as HTMLInputElement).value.trim();
  const v = raw === '' ? null : parseNum(raw);
  savePoint(setManual(pointOf(CHECK_DATE), CHECK_DATE, k, v));
  refreshSheet();
});
onChange('ck-note', el => {
  const p = { ...(pointOf(CHECK_DATE) || { date: CHECK_DATE }) };
  p.illness = (el as HTMLInputElement).value.trim() || null;
  savePoint(p);
});
on('ck-chip', el => {
  const k = el.dataset.k!; const p: any = pointOf(CHECK_DATE) || {};
  const v = String(p[k] ?? '') === el.dataset.v ? null : Number(el.dataset.v);
  savePoint(setManual(pointOf(CHECK_DATE), CHECK_DATE, k, v));
  refreshSheet();
});
on('ck-reset', el => { savePoint(resetToOriginal(pointOf(CHECK_DATE), el.dataset.k!, STATE.settings)); refreshSheet(); toast(t('common.resetDone')); });
on('checkin-open', el => openCheckin(el.dataset.date || D().today));
