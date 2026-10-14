/* Felder statt Notizfeld (Auftrag 7, Punkt 3): gemeinsamer Baustein für geplante Einheiten und Extra-Einheiten.
   Je Sportart die Werte aus shared/fields.ts, jedes Feld mit Quelle (Uhr, intervals.icu, aus Notiz, von Hand), änderbar.
   Darunter für alle: RPE, Gefühl, „geplant vs. gemacht“ und eine optionale Notiz. Automatisch: Pulszone und CTL/ATL/TSB des Tages. */
import { STATE, BASE_WEEKS, saveSoon, saveState, profile } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, srcBadge, more, refreshSheet, timeField, readTime, secToMmss } from '../kit';
import { SPORT_FIELDS, FEEL, zoneVerdict, loadOn, type FieldDef } from '../../../shared/fields';
import { setSessionMetricManual, resetSessionMetrics } from '../../../shared/activity/merge';
import { nav } from '../nav';
import { toast } from '../toast';
import { checkTestResult } from '../testupdate';
import * as C from '../../../shared/core';

export type Target = { kind: 'session' | 'custom'; id: string; date: string; sport: string; planned?: any };
/* Datensatz der Einheit (Zustand einer geplanten Einheit oder die Extra-Einheit selbst) */
function rec(tg: Target): any {
  if (tg.kind === 'session') { if (!STATE.sessions[tg.id]) STATE.sessions[tg.id] = { completed: false, notes: '' }; return STATE.sessions[tg.id]; }
  return ((STATE.customWorkouts || {})[tg.date] || []).find((w: any) => w.id === tg.id) || null;
}
function put(tg: Target, next: any) {
  if (tg.kind === 'session') { STATE.sessions[tg.id] = next; return; }
  const list = STATE.customWorkouts[tg.date] || []; const i = list.findIndex((w: any) => w.id === tg.id); if (i >= 0) list[i] = next;
}
const attrs = (tg: Target) => `data-tk="${tg.kind}" data-tid="${esc(tg.id)}" data-tdate="${tg.date}" data-tsport="${tg.sport}"`;
const tgOf = (el: HTMLElement): Target => ({ kind: el.dataset.tk as any, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport! });
const paceSecOf = (v: any): number | null => { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };

function oneField(tg: Target, f: FieldDef, st: any): string {
  const m = st.metrics || {}; const src = (st.metricsSrc || {})[f.key] || (st.metricsManual && st.metricsManual[f.key] ? 'manual' : null);
  const lab = `${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''} ${srcBadge(src)}`;
  const id = `fd-${f.key}`;
  if (f.kind === 'pace') return timeField(id, f.label + (f.unit ? ` (${f.unit})` : ''), paceSecOf(m[f.key]), 'ms', `data-ch="fd" data-k="${f.key}" data-pace="1" ${attrs(tg)}`);
  if (f.kind === 'select') return `<div class="fld"><label for="${id}">${lab}</label><select class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)}>${(f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(m[f.key] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  if (f.kind === 'text') return `<div class="fld wide"><label for="${id}">${lab}</label><input class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)} value="${esc(m[f.key] ?? '')}" placeholder="${esc(f.ph || '')}"></div>`;
  if (f.kind === 'splits') return splitsHtml(tg, m.splits || []);
  if (f.kind === 'exercises') return exercisesHtml(tg, m.exercises, st);
  return `<div class="fld"><label for="${id}">${lab}</label><input class="inp" id="${id}" type="text" inputmode="decimal" data-ch="fd" data-k="${f.key}" ${attrs(tg)} value="${esc(m[f.key] ?? '')}" placeholder="${esc((st.metricsAuto || {})[f.key] ?? '')}"></div>`;
}
function splitsHtml(tg: Target, list: any[]): string {
  return `<div class="fld wide" data-splits><span class="lab">${esc(t('fd.splits'))}</span>${list.length ? `<div class="splits">${list.map((s: any, i: number) => `<div class="split-row"><b class="xs">${s.km} km</b>
    <input class="inp sm" inputmode="numeric" aria-label="${esc(t('fd.splitPace', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="pace" ${attrs(tg)} value="${esc(s.pace || '')}" placeholder="6:20">
    <input class="inp sm" inputmode="numeric" aria-label="${esc(t('fd.splitHr', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="hr" ${attrs(tg)} value="${esc(s.hr ?? '')}" placeholder="${esc(t('m.hr'))}">
    <button class="btn ghost sm" data-act="fd-split-del" data-i="${i}" ${attrs(tg)} aria-label="${esc(t('common.remove'))}">×</button></div>`).join('')}</div>` : ''}
    <button class="btn ghost sm" data-act="fd-split-add" ${attrs(tg)}>+ ${esc(t('fd.splitAdd'))}</button></div>`;
}
function exercisesHtml(tg: Target, list: any, st: any): string {
  // ohne Einträge: Übungen aus dem Plan vorschlagen (Name und Sätze × Wiederholungen)
  const planned = (tg.planned && tg.planned.spec && tg.planned.spec.exercises) || [];
  const rows: any[] = Array.isArray(list) && list.length ? list : planned.map((e: any) => ({ name: e.name, sets: e.sets, reps: e.reps, kg: null, planned: true }));
  void st;
  return `<div class="fld wide" data-exercises><span class="lab">${esc(t('fd.exercises'))}</span>${rows.map((e: any, i: number) => `<div class="ex-row">
    <input class="inp sm ex-name" aria-label="${esc(t('fd.exName'))}" data-ch="fd-ex" data-i="${i}" data-f="name" ${attrs(tg)} value="${esc(e.name || '')}" placeholder="${esc(t('fd.exName'))}">
    <input class="inp sm" inputmode="numeric" aria-label="${esc(t('fd.exSets'))}" data-ch="fd-ex" data-i="${i}" data-f="sets" ${attrs(tg)} value="${esc(e.sets ?? '')}" placeholder="${esc(t('fd.exSets'))}">
    <span class="xs muted">×</span><input class="inp sm" aria-label="${esc(t('fd.exReps'))}" data-ch="fd-ex" data-i="${i}" data-f="reps" ${attrs(tg)} value="${esc(e.reps ?? '')}" placeholder="${esc(t('fd.exReps'))}">
    <span class="xs muted">×</span><input class="inp sm" inputmode="decimal" aria-label="${esc(t('fd.exKg'))}" data-ch="fd-ex" data-i="${i}" data-f="kg" ${attrs(tg)} value="${esc(e.kg ?? '')}" placeholder="kg"></div>`).join('')}
    <button class="btn ghost sm" data-act="fd-ex-add" ${attrs(tg)}>+ ${esc(t('fd.exAdd'))}</button>${!(Array.isArray(list) && list.length) && planned.length ? `<div class="xs muted">${esc(t('fd.exFromPlan'))}</div>` : ''}</div>`;
}

/* Der ganze Block: Werte je Sportart, berechnete Angaben, RPE, Gefühl, Abweichung, Notiz */
export function fieldsBlock(tg: Target): string {
  const st = rec(tg) || {};
  const defs = SPORT_FIELDS[tg.sport] || [{ key: 'min', label: t('m.min'), unit: 'min', kind: 'num' as const }];
  const main = defs.filter(f => !f.more), extra = defs.filter(f => f.more);
  const prof = profile();
  const zv = tg.planned ? zoneVerdict({ ...tg.planned, sport: tg.sport }, st, prof.thresholds) : zoneVerdict({ sport: tg.sport }, st, prof.thresholds);
  const ld = loadOn(STATE, C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}), tg.date);
  const auto = [zv ? `<span class="pill ${zv.over ? 'warn' : 'good'}" data-zone>${esc(t('fd.zone'))}: ${esc(zv.text)}</span>` : '', ld ? `<span class="pill" data-load>CTL ${ld.ctl} · ATL ${ld.atl} · TSB ${ld.tsb > 0 ? '+' : ''}${ld.tsb}</span>` : ''].filter(Boolean).join(' ');
  const srcs = [...new Set(Object.values(st.metricsSrc || {}).filter(Boolean))] as string[];
  const hasOrig = st.metricsAuto && Object.keys(st.metricsAuto).length && Object.keys(st.metricsManual || {}).length;
  return `<div class="card flat tight stack" data-fields="${tg.sport}">
    <div class="spread"><div class="lbl">${esc(t('fd.values'))} ${srcs.map(s => srcBadge(s)).join(' ')}</div>${hasOrig ? `<button class="link" data-act="fd-reset" ${attrs(tg)}>${esc(t('common.resetOriginal'))}</button>` : ''}</div>
    ${auto ? `<div class="row" style="gap:6px;flex-wrap:wrap" data-auto>${auto}</div>` : ''}
    <div class="fgrid">${main.map(f => oneField(tg, f, st)).join('')}</div>
    ${extra.length ? more(t('fd.more'), `<div class="fgrid">${extra.map(f => oneField(tg, f, st)).join('')}</div>`, extra.some(f => { const v = (st.metrics || {})[f.key]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); })) : ''}
    <div class="fld wide"><span class="lab">${esc(t('fd.rpe'))}</span><div class="rpe-row" role="group" aria-label="${esc(t('fd.rpe'))}">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button class="chip ${String(st.rpe ?? '') === String(n) ? 'on' : ''}" aria-pressed="${String(st.rpe ?? '') === String(n)}" data-act="fd-rpe" data-v="${n}" ${attrs(tg)}>${n}</button>`).join('')}</div><div class="xs muted">${esc(t('fd.rpeHint'))}</div></div>
    <div class="fld wide"><span class="lab">${esc(t('fd.feel'))}</span><div class="chips" style="flex-wrap:wrap">${FEEL.map(([v, l]) => `<button class="chip ${String(st.feel ?? '') === v ? 'on' : ''}" aria-pressed="${String(st.feel ?? '') === v}" data-act="fd-feel" data-v="${v}" ${attrs(tg)}>${esc(l)}</button>`).join('')}</div></div>
    <div class="fld wide"><label for="fd-dev">${esc(t('fd.deviation'))}</label><input class="inp" id="fd-dev" data-ch="fd-top" data-k="deviation" ${attrs(tg)} value="${esc(st.deviation || '')}" placeholder="${esc(t('fd.deviationPh'))}"></div>
    ${more(t('fd.note'), `<textarea class="inp" id="fd-notes" rows="3" data-ch="fd-top" data-k="${tg.kind === 'custom' ? 'description' : 'notes'}" ${attrs(tg)} placeholder="${esc(t('sess.notesPh'))}">${esc((tg.kind === 'custom' ? st.description : st.notes) || '')}</textarea>`, !!((tg.kind === 'custom' ? st.description : st.notes) || '').trim())}
  </div>`;
}

const redraw = () => { saveSoon(); refreshSheet(); nav.rerender(); };
onChange('fd', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const k = el.dataset.k!;
  let v: any = (el as HTMLInputElement).value.trim();
  if (el.dataset.pace || el.dataset.tf) { const s = readTime(el); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } v = s ? secToMmss(s) : ''; }
  put(tg, setSessionMetricManual(st, k, v));
  saveSoon(); if (el.tagName === 'SELECT' || k === 'hr') refreshSheet(); nav.rerender();
  if ((k === 'hr' || k === 'pace') && checkTestResult()) { saveState(); refreshSheet(); nav.rerender(); }
});
onChange('fd-top', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st[el.dataset.k!] = (el as HTMLInputElement).value; saveSoon(); });
on('fd-rpe', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st.rpe = String(st.rpe) === el.dataset.v ? '' : el.dataset.v; redraw(); });
on('fd-feel', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st.feel = String(st.feel) === el.dataset.v ? '' : el.dataset.v; redraw(); });
on('fd-reset', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; put(tg, resetSessionMetrics(st)); saveState(); refreshSheet(); nav.rerender(); toast(t('common.resetDone')); });
/* Splits je km */
const listOf = (st: any, k: string) => (Array.isArray((st.metrics || {})[k]) ? st.metrics[k].map((x: any) => ({ ...x })) : []);
on('fd-split-add', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = listOf(st, 'splits'); l.push({ km: l.length + 1, pace: '', hr: null }); put(tg, setSessionMetricManual(st, 'splits', l)); redraw(); });
on('fd-split-del', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = listOf(st, 'splits').filter((_: any, i: number) => i !== +el.dataset.i!).map((x: any, i: number) => ({ ...x, km: i + 1 })); put(tg, setSessionMetricManual(st, 'splits', l.length ? l : '')); redraw(); });
onChange('fd-split', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = listOf(st, 'splits'); const i = +el.dataset.i!; if (!l[i]) return;
  const v = (el as HTMLInputElement).value.trim();
  if (el.dataset.f === 'pace') { const m = /^(\d{1,2})[:.,]?(\d{2})$/.exec(v.replace(/\s/g, '')); if (v && !m) { toast(t('time.invalid')); return; } l[i].pace = m ? `${+m[1]}:${m[2]}` : ''; }
  else l[i].hr = v ? Math.round(+v.replace(',', '.')) || null : null;
  put(tg, setSessionMetricManual(st, 'splits', l)); saveSoon();
});
/* Übungen */
on('fd-ex-add', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); l.push({ name: '', sets: null, reps: '', kg: null }); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); });
function exList(tg: Target, st: any): any[] {
  const own = listOf(st, 'exercises'); if (own.length) return own;
  const day = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((d: any) => d.date === tg.date);
  const s = day && day.sessions.find((x: any) => x.id === tg.id);
  return ((s && s.spec && s.spec.exercises) || []).map((e: any) => ({ name: e.name, sets: e.sets, reps: e.reps, kg: null }));
}
onChange('fd-ex', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); const i = +el.dataset.i!; if (!l[i]) return;
  const v = (el as HTMLInputElement).value.trim(); const f = el.dataset.f!;
  l[i][f] = f === 'sets' ? (v ? parseInt(v, 10) || null : null) : f === 'kg' ? (v ? +v.replace(',', '.') || null : null) : v;
  put(tg, setSessionMetricManual(st, 'exercises', l.filter((e: any) => e.name || e.sets || e.reps || e.kg))); saveSoon();
});
