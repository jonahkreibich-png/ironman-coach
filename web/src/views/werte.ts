/* Werte & Erholung: Morgenwerte mit Quelle, Verläufe, Belastung. Eingabe nur noch unter „Bearbeiten“,
   weil die Werte im Alltag automatisch kommen. Von Hand korrigierte Werte gelten, bis man sie zurücksetzt. */
import * as C from '../../../shared/core';
import { STATE, PLAN, saveState } from '../store';
import { esc, fmtDate, dowShort, todayStr, parseNum } from '../util';
import { t, num, temp } from '../../../shared/i18n';
import { D } from '../data';
import { on, onChange, sec, srcBadge, openSheet, refreshSheet, sparkline, ic, more } from '../kit';
import { lineChart, illnessShades } from '../charts';
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
    <div class="n">${last && last.date !== todayStr() ? fmtDate(last.date) + ' · ' : ''}${delta != null ? (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + t('v.vs7') : ''}</div>${sparkline(series.map((p: any) => p[field]), 'var(--info)')}</button>`;
}

export function renderWerte(): string {
  const d = D(); const R = STATE.settings.readiness;
  let h = `<div class="crit-grid">${tile('hrv', t('v.hrv'), 'ms', 0)}${tile('restingHR', t('v.rhr'), 'bpm', 0)}${tile('sleepHours', t('v.sleep'), 'h', 1)}${tile('bodyTemp', t('v.tempShort'), '°C', 1)}${tile('spo2', 'SpO2', '%', 1)}${tile('breathingRate', t('v.breathShort'), '/min', 1)}</div>
    <button class="btn ghost block" data-act="checkin-open" data-date="${todayStr()}" style="margin-top:var(--s3)">${ic('edit')} ${esc(t('v.edit'))}</button>`;
  const bH = C.baselineOf(STATE.trend, STATE.illnessPeriods, C.addDays(d.today, 1), 'hrv', Math.log);
  const bR = C.baselineOf(STATE.trend, STATE.illnessPeriods, C.addDays(d.today, 1), 'restingHR');
  const tr = (STATE.trend || []).filter((p: any) => p.date >= C.addDays(d.today, -60));
  const avg7 = (arr: any[], k: string, i: number) => { const sl = arr.slice(Math.max(0, i - 6), i + 1).filter(p => p[k] != null); return sl.length ? sl.reduce((a, p) => a + p[k], 0) / sl.length : null; };
  const hp = tr.filter((p: any) => p.hrv != null).map((p: any, i: number, a: any[]) => ({ date: p.date, hrv: p.hrv, avg: avg7(a, 'hrv', i), note: p.illness || '' }));
  h += sec(t('v.hrvTitle'), `<div class="card">${lineChart(hp, [{ key: 'hrv', name: t('v.hrv'), color: 'var(--info)', area: true }, { key: 'avg', name: t('v.avg7'), color: 'var(--ink-2)', dashed: true }], { legend: true, shade: illnessShades(), lines: bH && bH.n >= C.MIN_DAYS ? [{ v: Math.round(Math.exp(bH.mean)), label: t('v.normal', { v: Math.round(Math.exp(bH.mean)) }), color: 'var(--good)' }] : [{ v: R.hrvMin, label: '≥' + R.hrvMin, color: 'var(--good)' }], label: t('v.hrv') })}<div class="hint">${esc(t('v.hrvHint'))}</div></div>`);
  const rp = tr.filter((p: any) => p.restingHR != null).map((p: any) => ({ date: p.date, rhr: p.restingHR, note: p.illness || '' }));
  h += sec(t('v.rhrTitle'), `<div class="card">${lineChart(rp, [{ key: 'rhr', name: t('v.rhr'), color: 'var(--run)', area: true }], { shade: illnessShades(), lines: bR && bR.n >= C.MIN_DAYS ? [{ v: Math.round(bR.mean), label: t('v.normal', { v: Math.round(bR.mean) }), color: 'var(--good)' }] : [], label: t('v.rhr') })}</div>`);
  const sp = tr.filter((p: any) => p.sleepHours != null).map((p: any) => ({ date: p.date, s: p.sleepHours }));
  h += sec(t('v.sleepTitle'), `<div class="card">${lineChart(sp, [{ key: 's', name: t('v.sleep'), color: 'var(--strength)', area: true, fmt: (v: number) => num(v, 1) }], { h: 150, fmt: (v: number) => num(v, 1), lines: [{ v: d.fallback.sleepNeed[0], label: t('v.needLine', { h: num(d.fallback.sleepNeed[0], 1) }), color: 'var(--good)' }], label: t('v.sleep') })}</div>`);
  const tp = tr.filter((p: any) => p.bodyTemp != null).map((p: any) => ({ date: p.date, temp: p.bodyTemp }));
  if (tp.length > 1) h += sec(t('v.tempTitle'), `<div class="card">${lineChart(tp, [{ key: 'temp', name: t('v.tempShort'), color: 'var(--warn)', fmt: (v: number) => (v > 0 ? '+' : '') + num(v, 1) }], { h: 130, shade: illnessShades(), lines: [{ v: 0.3, label: '+0,3', color: 'var(--warn)' }, { v: 0.5, label: '+0,5', color: 'var(--bad)' }], label: t('v.tempShort') })}</div>`);
  // Belastung
  const own = C.ownLoadSeries(STATE, PLAN.weeks, d.today).filter(o => o.date >= C.addDays(d.today, -90));
  const icu: Record<string, any> = {}; (STATE.trend || []).filter((p: any) => p.ctl != null && p.date >= C.addDays(d.today, -90)).forEach((p: any) => { icu[p.date] = p; });
  const pts = own.map(o => ({ date: o.date, ctl: o.ctl, atl: o.atl, tsb: o.tsb, ictl: icu[o.date] ? icu[o.date].ctl : null }));
  const last = own[own.length - 1];
  h += sec(t('v.loadTitle'), `<div class="card">${last ? `<div class="row wrap" style="gap:var(--s4)"><div><div class="lbl">CTL</div><div class="big">${num(last.ctl, 0)}</div></div><div><div class="lbl">ATL</div><div class="big">${num(last.atl, 0)}</div></div><div><div class="lbl">TSB</div><div class="big" style="color:${last.tsb < -20 ? 'var(--bad)' : last.tsb < -10 ? 'var(--warn)' : 'var(--good)'}">${num(last.tsb, 0)}</div></div><div><div class="lbl">ATL/CTL</div><div class="big">${last.ctl ? num(last.atl / last.ctl, 2) : '–'}</div></div></div>` : ''}
    ${lineChart(pts, [{ key: 'ctl', name: t('v.ctl'), color: 'var(--info)', area: true }, { key: 'atl', name: t('v.atl'), color: 'var(--run)' }, { key: 'tsb', name: t('v.tsb'), color: 'var(--good)' }, ...(Object.keys(icu).length ? [{ key: 'ictl', name: 'CTL intervals.icu', color: 'var(--info)', dashed: true }] : [])], { h: 190, legend: true, shade: illnessShades(), lines: [{ v: 0, label: '' }], label: t('v.loadTitle') })}
    ${more(t('common.whatMeans'), `<div class="hint">${esc(t('v.loadHint'))}</div>`)}</div>`);
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
