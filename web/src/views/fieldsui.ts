import {customDraft} from './custom-draft27';
/* Felder statt Notizfeld (Auftrag 7, Punkt 3): gemeinsamer Baustein für geplante Einheiten und Extra-Einheiten.
   Je Sportart die Werte aus shared/fields.ts, jedes Feld mit Quelle (Uhr, intervals.icu, aus Notiz, von Hand), änderbar.
   Darunter für alle: RPE, Gefühl, „geplant vs. gemacht“ und eine optionale Notiz. Automatisch: Pulszone und CTL/ATL/TSB des Tages. */
import { findCustomRecord, STATE, BASE_WEEKS, saveSoon, saveState, profile } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, onInput, CHANGE, srcBadge, more, refreshSheet, timeField, readTime, secToMmss } from '../kit';
import { SPORT_FIELDS, FEEL, zoneVerdict, loadOn, type FieldDef } from '../../../shared/fields';
import { setSessionMetricManual, resetSessionMetrics } from '../../../shared/activity/merge';
import { nav } from '../nav';
import { toast } from '../toast';
import { checkTestResult, checkSwimSkill } from '../testupdate';
import { reviewSoon } from '../review';
import * as C from '../../../shared/core';
import { strengthNumber } from '../../../shared/strength';
import { editStrengthTemplate } from './strength';
import { intervalsBlock, registerIntervalHost, registerPlannedLookup } from './intervalsui';
import { checkField, crossCheck, applyDoubtFix } from '../../../shared/validate';
import { actualMetrics } from '../../../shared/results';

export type Target = { kind: 'session' | 'custom'; id: string; date: string; sport: string; planned?: any };
/* Datensatz der Einheit (Zustand einer geplanten Einheit oder die Extra-Einheit selbst) */
function rec(tg: Target): any {
  if (tg.kind === 'session') { if (!STATE.sessions[tg.id]) STATE.sessions[tg.id] = { completed: false, notes: '' }; return STATE.sessions[tg.id]; }
  return customDraft(tg.id) || findCustomRecord(tg.id);
}
function put(tg: Target, next: any) {
  const draft=customDraft(tg.id);if(tg.kind==='custom' && draft){Object.keys(draft).forEach(k=>delete draft[k]);Object.assign(draft,next);return;}
  if (tg.kind === 'session') { STATE.sessions[tg.id] = next; return; }
  for (const list of Object.values(STATE.customWorkouts||{}) as any[][]) { const i=list.findIndex((w:any)=>w.id===tg.id); if(i>=0){list[i]=next;return;} }
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
  const planned = tg.planned?.spec?.exercises || [];
  const rows: any[] = Array.isArray(list) ? list : planned.map((e: any) => ({ ...e, kg: null }));
  const templates = Object.values(STATE.strengthTemplates || {}) as any[];
  return `<div class="fld wide stack" data-exercises><span class="lab">${esc(t('fd.exercises'))}</span>
    ${rows.map((e, i) => `<div class="card flat stack"><b class="xs">Übung ${i + 1}</b><div class="fgrid">${(['name', 'sets', 'reps', 'kg', 'restSec'] as const).map((f, j) => `<label class="fld ${f === 'name' ? 'wide' : ''}"><span class="lab">${['Übung', 'Sätze', 'Wiederholungen / Dauer', 'Gewicht (kg)', 'Pause (Sekunden)'][j]}</span><input class="inp" aria-label="${['Übung', 'Sätze', 'Wiederholungen / Dauer', 'Gewicht (kg)', 'Pause (Sekunden)'][j]}" data-ch="fd-ex" data-i="${i}" data-f="${f}" ${attrs(tg)} inputmode="${f === 'kg' ? 'decimal' : ['sets', 'restSec'].includes(f) ? 'numeric' : 'text'}" value="${esc(e[f] ?? '')}"></label>`).join('')}</div><div class="row" style="flex-wrap:wrap"><button class="btn ghost sm" data-act="fd-ex-move" data-i="${i}" data-dir="-1" ${attrs(tg)} ${i === 0 ? 'disabled' : ''} aria-label="Übung ${i + 1} nach oben">↑</button><button class="btn ghost sm" data-act="fd-ex-move" data-i="${i}" data-dir="1" ${attrs(tg)} ${i === rows.length - 1 ? 'disabled' : ''} aria-label="Übung ${i + 1} nach unten">↓</button><button class="btn ghost sm danger" data-act="fd-ex-del" data-i="${i}" ${attrs(tg)}>Übung entfernen</button></div></div>`).join('')}
    <button class="btn ghost sm" data-act="fd-ex-add" ${attrs(tg)}>+ ${esc(t('fd.exAdd'))}</button>
    <button class="btn ghost sm" data-act="fd-template-save" ${attrs(tg)}>Als Kraftvorlage speichern</button>
    ${templates.length ? `<label class="fld"><span class="lab">Kraftvorlage</span><select class="inp" data-template-select aria-label="Kraftvorlage"><option value="">Vorlage auswählen</option>${templates.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><button class="btn ghost sm" data-act="fd-template-apply" ${attrs(tg)}>Übungen durch Vorlage ersetzen</button>` : '<p class="xs muted">Eigene Kraftvorlagen findest du unter Mehr → Trainingsvorlagen.</p>'}
    ${!Array.isArray(list) && planned.length ? `<div class="xs muted">${esc(t('fd.exFromPlan'))}</div>` : ''}</div>`;
}

/* Der ganze Block: Werte je Sportart, berechnete Angaben, RPE, Gefühl, Abweichung, Notiz */
export function fieldsBlock(tg: Target): string {
  const st = rec(tg) || {};
  // Testfelder nur bei Tests (Lauftest, Radtest, Schwimmtest)
  const isTest = /test/i.test(String((tg.planned && tg.planned.title) || ''));
  const defs = (SPORT_FIELDS[tg.sport] || [{ key: 'min', label: t('m.min'), unit: 'min', kind: 'num' as const }]).filter(f => !f.test || isTest);
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
    ${doubtsHtml(tg, st)}
    <div class="fgrid">${main.map(f => oneField(tg, f, st)).join('')}</div>
    ${intervalsBlock(tg, st, attrs(tg))}
    ${extra.length ? more(t('fd.more'), `<div class="fgrid">${extra.map(f => oneField(tg, f, st)).join('')}</div>`, extra.some(f => { const v = (st.metrics || {})[f.key]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); })) : ''}
    <div class="fld wide"><span class="lab">${esc(t('fd.rpe'))}</span><div class="rpe-row" role="group" aria-label="${esc(t('fd.rpe'))}">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button class="chip ${String(st.rpe ?? '') === String(n) ? 'on' : ''}" aria-pressed="${String(st.rpe ?? '') === String(n)}" data-act="fd-rpe" data-v="${n}" ${attrs(tg)}>${n}</button>`).join('')}</div><div class="xs muted">${esc(t('fd.rpeHint'))}</div></div>
    <div class="fld wide"><span class="lab">${esc(t('fd.feel'))}</span><div class="chips" style="flex-wrap:wrap">${FEEL.map(([v, l]) => `<button class="chip ${String(st.feel ?? '') === v ? 'on' : ''}" aria-pressed="${String(st.feel ?? '') === v}" data-act="fd-feel" data-v="${v}" ${attrs(tg)}>${esc(l)}</button>`).join('')}</div></div>
    <div class="fld wide"><label for="fd-dev">${esc(t('fd.deviation'))}</label><input class="inp" id="fd-dev" data-ch="fd-top" data-k="deviation" ${attrs(tg)} value="${esc(st.deviation || '')}" placeholder="${esc(t('fd.deviationPh'))}"></div>
    ${more(t('fd.note'), `<textarea class="inp" id="fd-notes" rows="3" data-ch="fd-top" data-k="${tg.kind === 'custom' ? 'description' : 'notes'}" ${attrs(tg)} placeholder="${esc(t('sess.notesPh'))}">${esc((tg.kind === 'custom' ? st.description : st.notes) || '')}</textarea>`, !!((tg.kind === 'custom' ? st.description : st.notes) || '').trim())}
  </div>`;
}

const redraw = () => { saveSoon(); refreshSheet(); nav.rerender(); };
/* Auftrag 22: Rückfrage bei widersprüchlichen Werten (z. B. 200 km in 30 min, Puls über max. Puls) mit Vorschlag */
function doubtsHtml(tg: Target, st: any): string {
  const act = st && st.activityId ? (STATE.activities || {})[st.activityId] : null;
  const list = crossCheck(tg.sport, actualMetrics(st || {}, act));
  return list.length ? `<div class="banner" role="status" data-doubts>${list.map(d => `<div class="spread" style="gap:6px;flex-wrap:wrap"><span>${esc(d.text)}</span>${d.fix ? `<button class="btn ghost sm" data-act="fd-doubt" data-k="${esc(d.fix.key)}" data-v="${esc(d.fix.value)}" ${attrs(tg)}>${esc(d.fix.label)}</button>` : ''}</div>`).join('')}</div>` : '';
}
on('fd-doubt', el => {
  const tg = tgOf(el); let st = rec(tg); if (!st) return;
  const act = st.activityId ? (STATE.activities || {})[st.activityId] : null;
  const before = actualMetrics(st, act); const after = applyDoubtFix(before, el.dataset.k!, el.dataset.v || '');
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (!k.startsWith('_') && before[k] !== after[k]) st = setSessionMetricManual(st, k, after[k] ?? '');
  put(tg, st); redraw(); rev(tg);
});
// Auftrag 22: Intervall-Liste nutzt denselben Datensatz, dieselbe Speicherung und dieselbe Neubewertung wie die übrigen Werte
registerIntervalHost({ rec, put, redraw, rev: (tg: Target) => rev(tg), activities: () => STATE.activities || {},
  thresholds: () => { const p = profile(); const th: any = p.thresholds || {}; return { lthrRun: th.lthrRun, lthrBike: th.lthrBike, ftp: p.powerMeter || p.trainerType === 'smart' ? th.ftp : null, runThrSec: th.thresholdPaceRunSec, css: th.cssSec }; } });
registerPlannedLookup((id, date) => { const d = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((x: any) => x.date === date); return (d && d.sessions.find((x: any) => x.id === id)) || null; });
/* Bewertung aktualisieren, wenn die Einheit erledigt ist (Auftrag 12) */
const rev = (tg: Target) => { if(customDraft(tg.id))return; const st = rec(tg); if (st && (tg.kind === 'custom' ? st.completed !== false : st.completed)) reviewSoon(tg.id, tg.date); };
// Beim Tippen sichern, ohne Formular/Fokus neu aufzubauen. Fachliche
// Neubewertung und Meldungen folgen weiterhin erst beim bestaetigten change.
onInput('fd', el => {
  const tg=tgOf(el), st=rec(tg); if(!st)return;
  let value:any=(el as HTMLInputElement).value.trim();
  if(el.dataset.pace || el.dataset.tf){const sec=readTime(el);if(sec!=null && isNaN(sec))return;value=sec?secToMmss(sec):'';}
  // Auftrag 22: unvollständige oder unmögliche Werte beim Tippen nicht speichern (Prüfung mit Hinweis beim Verlassen des Felds)
  const c=checkField(tg.sport,el.dataset.k!,value);if(!c.ok)return;
  put(tg,setSessionMetricManual(st,el.dataset.k!,value));saveSoon();
});
onInput('fd-top',(el,ev)=>CHANGE['fd-top'](el,ev));
onInput('fd-split',(el,ev)=>{
  const value=(el as HTMLInputElement).value.trim();
  if(el.dataset.f==='pace' && value && !/^(\d{1,2})[:.,]?(\d{2})$/.test(value.replace(/\s/g,'')))return;
  return CHANGE['fd-split'](el,ev);
});
onInput('fd-ex',(el,ev)=>{
  const f=el.dataset.f!,value=(el as HTMLInputElement).value.trim();
  if(['sets','kg','restSec'].includes(f)){try{strengthNumber(value,f,f!=='kg',f==='sets');}catch(_){return;}}
  return CHANGE['fd-ex'](el,ev);
});
onChange('fd', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const k = el.dataset.k!;
  let v: any = (el as HTMLInputElement).value.trim();
  if (el.dataset.pace || el.dataset.tf) { const s = readTime(el); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } v = s ? secToMmss(s) : ''; }
  // Auftrag 22: Grenzen je Feld – unmögliche Werte freundlich ablehnen, der gespeicherte Wert bleibt
  const chk = checkField(tg.sport, k, v);
  if (!chk.ok) { toast(chk.msg!); refreshSheet(); return; }
  put(tg, setSessionMetricManual(st, k, v));
  saveSoon(); if (el.tagName === 'SELECT' || k === 'hr') refreshSheet(); nav.rerender();
  if (!customDraft(tg.id) && (k === 'hr' || k === 'pace' || /^test|^css|^crawl25|^breast200/.test(k)) && checkTestResult()) { saveState(); refreshSheet(); nav.rerender(); }
  if (!customDraft(tg.id) && (k === 'longestCrawl' || k === 'longestPull') && checkSwimSkill()) { saveState(); refreshSheet(); nav.rerender(); }
  rev(tg);
});
onChange('fd-top', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st[el.dataset.k!] = (el as HTMLInputElement).value; saveSoon(); });
on('fd-rpe', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st.rpe = String(st.rpe) === el.dataset.v ? '' : el.dataset.v; redraw(); rev(tg); });
on('fd-feel', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; st.feel = String(st.feel) === el.dataset.v ? '' : el.dataset.v; redraw(); rev(tg); });
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
  const own = listOf(st, 'exercises'); if (Array.isArray(st.metrics?.exercises)) return own;
  const day = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((d: any) => d.date === tg.date);
  const s = day && day.sessions.find((x: any) => x.id === tg.id);
  return ((s && s.spec && s.spec.exercises) || []).map((e: any) => ({ ...e, kg: null }));
}
onChange('fd-ex', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); const i = +el.dataset.i!; if (!l[i]) return;
  const v = (el as HTMLInputElement).value.trim(); const f = el.dataset.f!;
  try { l[i][f] = ['sets', 'kg', 'restSec'].includes(f) ? strengthNumber(v, f === 'sets' ? 'Sätze' : f === 'kg' ? 'Gewicht' : 'Pause', f !== 'kg', f === 'sets') : v; }
  catch (error) { toast((error as Error).message); (el as HTMLInputElement).value = String(l[i][f] ?? ''); return; }
  put(tg, setSessionMetricManual(st, 'exercises', l)); saveSoon();
});
on('fd-ex-del', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; const l = exList(tg, st); l.splice(+el.dataset.i!, 1); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); });
on('fd-ex-move', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; const l = exList(tg, st), i = +el.dataset.i!, j = i + +el.dataset.dir!; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); });
on('fd-template-save', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; editStrengthTemplate(st.title || tg.planned?.title || 'Mein Kraftplan', exList(tg, st)); });
on('fd-template-apply', el => {
  const tg = tgOf(el), st = rec(tg); if (!st) return;
  const select = el.closest('[data-exercises]')?.querySelector('[data-template-select]') as HTMLSelectElement;
  const template = STATE.strengthTemplates?.[select?.value]; if (!template) { toast('Bitte eine Vorlage auswählen.'); return; }
  put(tg, setSessionMetricManual(st, 'exercises', template.exercises.map((e: any) => ({ ...e })))); redraw(); toast('Vorlage übernommen.');
});
