import {customDraft} from './custom-draft27';
/* Felder statt Notizfeld (Auftrag 7, Punkt 3): gemeinsamer Baustein für geplante Einheiten und Extra-Einheiten.
   Je Sportart die Werte aus shared/fields.ts, jedes Feld mit Quelle (Uhr, intervals.icu, aus Notiz, von Hand), änderbar.
   Darunter für alle: RPE, Gefühl, „geplant vs. gemacht“ und eine optionale Notiz. Automatisch: Pulszone und CTL/ATL/TSB des Tages. */
import { findCustomRecord, STATE, BASE_WEEKS, saveSoon, saveState, profile } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, onInput, CHANGE, srcBadge, more, refreshSheet, timeField, readTime, tfRead, tfInvalid, tfAsking, tfData, tfHint, durHint, secToMmss, termLink, ic } from '../kit';
import { SPORT_FIELDS, FEEL, zoneVerdict, loadOn, type FieldDef } from '../../../shared/fields';
import { setSessionMetricManual, resetSessionMetrics } from '../../../shared/activity/merge';
import { nav } from '../nav';
import { toast } from '../toast';
import { checkTestResult, checkSwimSkill } from '../testupdate';
import { reviewSoon } from '../review';
import * as C from '../../../shared/core';
import { strengthNumber, lastStrengthExercises } from '../../../shared/strength';
import { editStrengthTemplate } from './strength';
import './intervalsui';
import './sectionsui';
import { ablaufBlock } from './ablaufui';
import { registerAbHost, UIH, SUB, setSubKey } from './ablaufstate';
import { registerUndoHost } from '../undo';
import { checkField, crossCheck, applyDoubtFix, parseNum, inputDisplay, timeSpecOf, paceLimits } from '../../../shared/validate';
import { actualMetrics, CHANGE_KINDS, CHANGE_REASONS, changedOf, intervalsMode } from '../../../shared/results';

export type Target = { kind: 'session' | 'custom'; id: string; date: string; sport: string; planned?: any };
/* Datensatz der Einheit (Zustand einer geplanten Einheit oder die Extra-Einheit selbst) */
function rec(tg: Target): any {
  if (tg.kind === 'session') { if (!STATE.sessions[tg.id]) STATE.sessions[tg.id] = { completed: false, notes: '' }; return STATE.sessions[tg.id]; }
  return customDraft(tg.id) || findCustomRecord(tg.id);
}
function put(tg: Target, next: any) {
  // Auftrag 29: bei einer erledigten Extra-Einheit sind Dauer/Distanz der Liste dieselben Werte wie in der Einheit (eine Quelle, auch beim Nachtragen)
  if (tg.kind === 'custom' && next && next.completed !== false && (next.source === 'manual' || next.plannedMinutes == null) && !next.trainingBlocks && !next.strengthTemplateId) { const n = (v: any) => { const x = parseNum(v); return x == null || !Number.isFinite(x) ? null : x; }; next = { ...next, plannedMinutes: n(next.metrics?.min) }; if (tg.sport === 'run' || tg.sport === 'bike') next.plannedKm = n(next.metrics?.km); }
  const draft=customDraft(tg.id);if(tg.kind==='custom' && draft){Object.keys(draft).forEach(k=>delete draft[k]);Object.assign(draft,next);return;}
  if (tg.kind === 'session') { STATE.sessions[tg.id] = next; return; }
  for (const list of Object.values(STATE.customWorkouts||{}) as any[][]) { const i=list.findIndex((w:any)=>w.id===tg.id); if(i>=0){list[i]=next;return;} }
}
const attrs = (tg: Target) => `data-tk="${tg.kind}" data-tid="${esc(tg.id)}" data-tdate="${tg.date}" data-tsport="${tg.sport}"`;
const tgOf = (el: HTMLElement): Target => ({ kind: el.dataset.tk as any, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport! });
const paceSecOf = (v: any): number | null => { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };

/* Auftrag 29: Normalized Power nur mit echten Wattdaten (Leistungsmesser, Smart Trainer oder Watt aus der Aufzeichnung), nie auf einer einfachen Rolle */
function realWatts(st: any): boolean {
  const m = st.metrics || {}; if (m.indoor === 'basic') return false;
  if (m.np != null && m.np !== '') return true;
  const p: any = profile(); const act = st.activityId ? (STATE.activities || {})[st.activityId] : null;
  return !!(p.powerMeter || (m.indoor === 'in' && p.trainerType === 'smart') || (act && (act.avgPower || act.np)) || (st.metricsSrc && st.metricsSrc.power && st.metricsSrc.power !== 'manual'));
}
function oneField(tg: Target, f: FieldDef, st: any): string {
  const m = st.metrics || {}; const src = (st.metricsSrc || {})[f.key] || (st.metricsManual && st.metricsManual[f.key] ? 'manual' : null);
  const lab = `${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''} ${srcBadge(src)}${f.key === 'np' ? ' ' + termLink('Normalized Power', '?') : ''}`;
  const id = `fd-${f.key}`;
  // Auftrag 39: Pace und Testzeiten in einem Feld (Ziffern → Doppelpunkt von selbst), Art und Grenzen aus shared/validate
  if (f.kind === 'pace') { const ts = timeSpecOf(f.key) || { kind: 'pace' as const, lim: null }; return timeField(id, f.label + (f.unit ? ` (${f.unit})` : ''), paceSecOf(m[f.key]), ts.kind, `data-ch="fd" data-k="${f.key}" data-pace="1" ${attrs(tg)}`, { lim: ts.lim, unit: f.unit && f.unit.startsWith('/') ? 'pro ' + f.unit.slice(1) : '' }); }
  if (f.kind === 'select') return `<div class="fld"><label for="${id}">${lab}</label><select class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)}>${(f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(m[f.key] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  if (f.kind === 'text') return `<div class="fld wide"><label for="${id}">${lab}</label><input class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)} value="${esc(m[f.key] ?? '')}" placeholder="${esc(f.ph || '')}"></div>`;
  if (f.kind === 'splits') return splitsHtml(tg, m.splits || []);
  if (f.kind === 'exercises') return '';
  // Auftrag 39: Dauer wie eine Zeit (90 = 90 min, 4530 = 45:30, 45,30 = 45 min 30 s), darunter die verstandene Dauer
  const dur = f.key === 'min';
  return `<div class="fld"><label for="${id}">${lab}</label><input class="inp" id="${id}" type="text" inputmode="decimal" data-ch="fd" data-k="${f.key}" ${dur ? tfData('min', [60, 86400]) : ''} ${attrs(tg)} value="${esc(inputDisplay(tg.sport, f.key, m[f.key]))}" placeholder="${esc(inputDisplay(tg.sport, f.key, (st.metricsAuto || {})[f.key]))}">${dur ? tfHint(durHint(m[f.key])) : ''}</div>`;
}
function splitsHtml(tg: Target, list: any[]): string {
  return `<div class="fld wide" data-splits><span class="lab">${esc(t('fd.splits'))}</span>${list.length ? `<div class="splits">${list.map((s: any, i: number) => `<div class="split-row"><b class="xs">${s.km} km</b>
    <span class="split-pace"><input class="inp sm" id="fd-split-${i}" inputmode="decimal" autocomplete="off" ${tfData('pace', paceLimits('pace'), 'pro km')} aria-label="${esc(t('fd.splitPace', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="pace" ${attrs(tg)} value="${esc(s.pace || '')}" placeholder="620">${tfHint()}</span>
    <input class="inp sm" inputmode="numeric" autocomplete="off" aria-label="${esc(t('fd.splitHr', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="hr" ${attrs(tg)} value="${esc(s.hr ?? '')}" placeholder="${esc(t('m.hr'))}">
    <button class="btn ghost sm" data-act="fd-split-del" data-i="${i}" ${attrs(tg)} aria-label="${esc(t('common.remove'))}">×</button></div>`).join('')}</div>` : ''}
    <button class="btn ghost sm" data-act="fd-split-add" ${attrs(tg)}>+ ${esc(t('fd.splitAdd'))}</button></div>`;
}
/* Auftrag 36: frühere Krafteinheiten mit eingetragenen Übungen (geplante und Extra-Einheiten) für „Wie letztes Mal“ */
function strengthHistory(): { date: string; id: string; exercises: any[] }[] {
  const out: { date: string; id: string; exercises: any[] }[] = [];
  for (const d of C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}))) for (const s of d.sessions || []) {
    if (s.sport !== 'strength') continue; const st = STATE.sessions?.[s.id]; if (!st || !st.completed) continue;
    out.push({ date: d.date, id: s.id, exercises: (st.metrics || {}).exercises });
  }
  for (const [d, list] of Object.entries(STATE.customWorkouts || {}) as [string, any[]][]) for (const w of list || []) if (w && w.sport === 'strength' && w.completed !== false) out.push({ date: d, id: w.id, exercises: (w.metrics || {}).exercises });
  return out;
}
const dmy = (d: string) => `${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
function strengthExtras(tg: Target, st: any): string {
  const list = (st.metrics || {}).exercises;
  const planned = tg.planned?.spec?.exercises || [];
  const last = lastStrengthExercises(strengthHistory(), tg.date, tg.id);
  const templates = Object.values(STATE.strengthTemplates || {}) as any[];
  /* Auftrag 37: die Übungen selbst stehen als Zeilen im Ablauf (Antippen → Fenster); hier nur „Wie letztes Mal“ und Vorlagen */
  return `<div class="stack" data-strength-extra>
    ${last ? `<button class="btn ghost sm" data-act="fd-ex-last" ${attrs(tg)}>Wie letztes Mal (${dmy(last.date)}: ${last.exercises.length} Übungen mit Gewichten)</button>` : ''}
    <button class="btn ghost sm" data-act="fd-template-save" ${attrs(tg)}>Als Kraftvorlage speichern</button>
    ${templates.length ? `<label class="fld"><span class="lab">Kraftvorlage</span><select class="inp" data-template-select aria-label="Kraftvorlage"><option value="">Vorlage auswählen</option>${templates.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><button class="btn ghost sm" data-act="fd-template-apply" ${attrs(tg)}>Übungen durch Vorlage ersetzen</button>` : '<p class="xs muted">Eigene Kraftvorlagen findest du unter Mehr → Trainingsvorlagen.</p>'}
    ${!Array.isArray(list) && planned.length ? `<div class="xs muted">${esc(t('fd.exFromPlan'))}</div>` : ''}</div>`;
}

/* Auftrag 37: die Einheit in Bausteinen, in der Reihenfolge der Seite: „Wie lief es?“ (Kopf) → Ablauf → Gesamtwerte → Gefühl/Notiz.
   session.ts setzt sie für geplante Einheiten zusammen, fieldsBlock (Extra-Einheiten) ebenso. Keine Angabe steht doppelt. */
function defsOf(tg: Target, st: any): FieldDef[] {
  // Testfelder nur bei Tests (Lauftest, Radtest, Schwimmtest); Übungen stehen im Ablauf
  const isTest = /test/i.test(String((tg.planned && tg.planned.title) || ''));
  return (SPORT_FIELDS[tg.sport] || [{ key: 'min', label: t('m.min'), unit: 'min', kind: 'num' as const }]).filter(f => (!f.test || isTest) && (f.key !== 'np' || realWatts(st)) && f.kind !== 'exercises');
}
/** Urteil zur Pulszone der Einheit (für den Kopf) */
export function zonePill(tg: Target): string {
  const st = rec(tg) || {}; const prof = profile();
  const actZ = st.activityId ? (STATE.activities || {})[st.activityId] : null;
  const zv = tg.planned ? zoneVerdict({ ...tg.planned, sport: tg.sport }, st, prof.thresholds, actZ) : zoneVerdict({ sport: tg.sport }, st, prof.thresholds, actZ);
  return zv ? `<span class="pill ${zv.over ? 'warn' : 'good'}" data-zone>${esc(t('fd.zone'))}: ${esc(zv.text)}</span>` : '';
}
/** Auftrag 38: Knöpfe „Wie geplant gemacht“ / „Anders gemacht“ entfernt – der Ablauf ist der einzige Ort für das Gemachte (Titel, Coach,
    Belastung folgen daraus). Ohne Werte abgehakt gilt still „wie geplant (nicht gemessen)“. Ältere Einheiten mit einer früher gewählten
    Änderung zeigen sie weiter als Hinweis (zählt weiter so) und können sie entfernen. Dazu Rückfragen bei widersprüchlichen Werten. */
export function changeBlock(tg: Target): string {
  const st = rec(tg) || {};
  return `${tg.kind === 'session' && tg.planned ? legacyChangeHtml(tg, st) : ''}${doubtsHtml(tg, st)}`;
}
function legacyChangeHtml(tg: Target, st: any): string {
  const c = changedOf(st); if (!c) return '';
  const label = (CHANGE_KINDS.find(([k]) => k === c.kind) || [null, 'anders'])[1];
  const why = (CHANGE_REASONS.find(([k]) => k === c.reason) || [])[1];
  return `<div class="hint" data-legacy-change><b>Früher eingetragen: ${esc(label)}${c.kind === 'otherSport' && c.sport ? ' (' + esc(c.sport === 'run' ? 'Laufen' : c.sport === 'bike' ? 'Rad' : c.sport === 'swim' ? 'Schwimmen' : c.sport === 'strength' ? 'Kraft' : 'Teamsport') + ')' : ''}${why ? ', Grund: ' + esc(why) : ''}</b><br><span class="xs">Zählt weiter so. Neu trägst du Änderungen direkt im Ablauf ein.</span> <button class="link" data-act="fd-chg-clear" ${attrs(tg)}>Hinweis entfernen</button></div>`;
}
/** Ablauf (Abschnitte, Sätze, Wiederholungen bzw. Übungen) */
export function ablaufPart(tg: Target, editable = true): string {
  const st = rec(tg) || {};
  return ablaufBlock(tg, { editable, extra: tg.sport === 'strength' && editable ? strengthExtras(tg, st) : '' });
}
/** Gesamtwerte: eingeklappt, wenn sie von der Uhr kommen (dann stimmen sie meist); selten genutzte unter „Weitere Werte“ */
export function totalsBlock(tg: Target, after = ''): string {
  const st = rec(tg) || {};
  const defs = defsOf(tg, st);
  const main = defs.filter(f => !f.more), extra = defs.filter(f => f.more);
  const ld = loadOn(STATE, C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}), tg.date);
  const srcs = [...new Set(Object.values(st.metricsSrc || {}).filter(Boolean))] as string[];
  const hasOrig = st.metricsAuto && Object.keys(st.metricsAuto).length && Object.keys(st.metricsManual || {}).length;
  const watch = !!(st.activityId || (st.metricsAuto && Object.keys(st.metricsAuto).length));
  const m = st.metrics || {};
  const sum = [m.min ? `${String(m.min).replace('.', ',')} min` : '', tg.sport === 'swim' && m.meters ? `${m.meters} m` : m.km ? `${String(m.km).replace('.', ',')} km` : '', m.hr ? `Ø Puls ${m.hr}` : ''].filter(Boolean).join(' · ');
  const body = `<div class="stack">${hasOrig ? `<button class="link" data-act="fd-reset" ${attrs(tg)}>${esc(t('common.resetOriginal'))}</button>` : ''}
    <div class="fgrid">${main.map(f => oneField(tg, f, st)).join('')}</div>
    ${extra.length || ld ? more(t('fd.more'), `<div class="fgrid">${extra.map(f => oneField(tg, f, st)).join('')}</div>${ld ? `<div class="row" style="gap:6px;flex-wrap:wrap" data-auto><span class="pill" data-load>CTL ${ld.ctl} · ATL ${ld.atl} · TSB ${ld.tsb > 0 ? '+' : ''}${ld.tsb}</span></div>` : ''}`, extra.some(f => { const v = (st.metrics || {})[f.key]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); })) : ''}${after}</div>`;
  return `<details class="card flat tight totals" data-fields="${tg.sport}" data-key="totals-${esc(tg.id)}" ${watch ? '' : 'open'}><summary class="spread"><span class="lbl">Gesamtwerte ${srcs.map(x => srcBadge(x)).join(' ')}</span><span class="small muted num" data-totals-sum>${esc(sum)}</span><span class="chev">${ic('down')}</span></summary>${body}</details>`;
}
/** Gefühl und Notiz: RPE, Gefühl, (alte) Abweichung, Notiz */
export function feelBlock(tg: Target): string {
  const st = rec(tg) || {};
  return `<div class="card flat tight stack" data-feel>
    <div class="fld wide"><span class="lab">${esc(t('fd.rpe'))}</span><div class="rpe-row" role="group" aria-label="${esc(t('fd.rpe'))}">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button class="chip ${String(st.rpe ?? '') === String(n) ? 'on' : ''}" aria-pressed="${String(st.rpe ?? '') === String(n)}" data-act="fd-rpe" data-v="${n}" ${attrs(tg)}>${n}</button>`).join('')}</div><div class="xs muted">${esc(t('fd.rpeHint'))}</div></div>
    <div class="fld wide"><span class="lab">${esc(t('fd.feel'))}</span><div class="chips" style="flex-wrap:wrap">${FEEL.map(([v, l]) => `<button class="chip ${String(st.feel ?? '') === v ? 'on' : ''}" aria-pressed="${String(st.feel ?? '') === v}" data-act="fd-feel" data-v="${v}" ${attrs(tg)}>${esc(l)}</button>`).join('')}</div></div>
    ${/* Auftrag 30: altes Freitextfeld „Abweichung“ ist doppelt zu „Anders gemacht“ – nur noch sichtbar, wenn dort schon etwas steht */ (st.deviation || '').trim() ? `<div class="fld wide"><label for="fd-dev">${esc(t('fd.deviation'))}</label><input class="inp" id="fd-dev" data-ch="fd-top" data-k="deviation" ${attrs(tg)} value="${esc(st.deviation || '')}" placeholder="${esc(t('fd.deviationPh'))}"></div>` : ''}
    <div class="fld wide"><label for="fd-notes">${esc(t('fd.note'))}</label><textarea class="inp" id="fd-notes" rows="2" data-ch="fd-top" data-k="${tg.kind === 'custom' ? 'description' : 'notes'}" ${attrs(tg)} placeholder="${esc(t('sess.notesPh'))}">${esc((tg.kind === 'custom' ? st.description : st.notes) || '')}</textarea></div>
  </div>`;
}
/** Extra-Einheiten: Ablauf → Gesamtwerte → Gefühl/Notiz (dieselben Bausteine wie die geplante Einheit) */
export function fieldsBlock(tg: Target): string {
  return `<div class="stack" data-fields-block>${changeBlock(tg)}${ablaufPart(tg)}${totalsBlock(tg)}${feelBlock(tg)}</div>`;
}

const redraw = () => { saveSoon(); refreshSheet(); nav.rerender(); };
/* Auftrag 38: ältere Änderung entfernen (dann zählt der Ablauf bzw. der Plan) */
on('fd-chg-clear', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; delete st.changed; delete st.asPlanned; redraw(); rev(tg); });
function plannedFor(tg: Target): any { const d = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((x: any) => x.date === tg.date); return (d && d.sessions.find((x: any) => x.id === tg.id)) || null; }
function tg0(el: HTMLElement): Target { return tgOf(el); }
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
/* Auftrag 22/35/37: Ablauf (Abschnitte, Sätze, Wiederholungen, Übungen) nutzt denselben Datensatz, dieselbe Speicherung und dieselbe
   Neubewertung wie die übrigen Werte – ein Host statt vorher drei (Intervalle, Abschnitte, Plan-Suche). */
const ivThr = () => { const p = profile(); const th: any = p.thresholds || {}; return { lthrRun: th.lthrRun, lthrBike: th.lthrBike, ftp: p.powerMeter || p.trainerType === 'smart' ? th.ftp : null, runThrSec: th.thresholdPaceRunSec, css: th.cssSec }; };
registerAbHost({ rec, put, redraw, rev: (tg: Target) => rev(tg), activities: () => STATE.activities || {}, thresholds: ivThr,
  planned: (tg: Target) => (tg.kind === 'session' ? plannedFor(tg) : null),
  mode: (tg: Target) => (tg.kind === 'session' ? intervalsMode(rec(tg)) : 'planned') });
/* Auftrag 37: Rückgängig – Stand der Einheit zurückschreiben, speichern, neu bewerten */
registerUndoHost({ rec: (tg: any) => rec(tg), put: (tg: any, next: any) => put(tg, next), after: (tg: any) => { saveState(); refreshSheet(); nav.rerender(); rev(tg); } });
/* Bewertung aktualisieren, wenn die Einheit erledigt ist (Auftrag 12) */
const rev = (tg: Target) => { if(customDraft(tg.id))return; const st = rec(tg); if (st && (tg.kind === 'custom' ? st.completed !== false : st.completed)) reviewSoon(tg.id, tg.date); };
// Beim Tippen sichern, ohne Formular/Fokus neu aufzubauen. Fachliche
// Neubewertung und Meldungen folgen weiterhin erst beim bestaetigten change.
/* Auftrag 29: Stand vor dem Tippen merken. Beim Tippen werden gültige Zwischenstände gesichert („1“ auf dem Weg zu „102“);
   ist die fertige Eingabe ungültig, gilt wieder der Wert von vorher – nie der Zwischenstand (Schrittlänge 102 → 1). */
const BEFORE = new WeakMap<HTMLElement, { has: boolean; v: any; manual: any; src: any }>();
function remember(el: HTMLElement, st: any, k: string) { if (!BEFORE.has(el)) BEFORE.set(el, { has: Object.prototype.hasOwnProperty.call(st.metrics || {}, k), v: (st.metrics || {})[k], manual: (st.metricsManual || {})[k], src: (st.metricsSrc || {})[k] }); }
function restore(el: HTMLElement, tg: Target, st: any, k: string) {
  const b = BEFORE.get(el); BEFORE.delete(el); if (!b) return;
  const next = { ...st, metrics: { ...(st.metrics || {}) }, metricsManual: { ...(st.metricsManual || {}) }, metricsSrc: { ...(st.metricsSrc || {}) } };
  if (b.has) next.metrics[k] = b.v; else delete next.metrics[k];
  if (b.manual != null) next.metricsManual[k] = b.manual; else delete next.metricsManual[k];
  if (b.src != null) next.metricsSrc[k] = b.src; else delete next.metricsSrc[k];
  put(tg, next); saveSoon();
}
onInput('fd', el => {
  const tg=tgOf(el), st=rec(tg); if(!st)return; remember(el, st, el.dataset.k!);
  let value:any=(el as HTMLInputElement).value.trim();
  if(el.dataset.pace || el.dataset.tf){const sec=readTime(el);if(sec!=null && isNaN(sec))return;value=sec?secToMmss(sec):'';}
  // Auftrag 22: unvollständige oder unmögliche Werte beim Tippen nicht speichern (Prüfung mit Hinweis beim Verlassen des Felds)
  const c=checkField(tg.sport,el.dataset.k!,value);if(!c.ok)return;
  put(tg,setSessionMetricManual(st,el.dataset.k!,c.value));saveSoon();
});
onInput('fd-top',(el,ev)=>CHANGE['fd-top'](el,ev));
onInput('fd-split',(el,ev)=>{
  const value=(el as HTMLInputElement).value.trim();
  if(el.dataset.f==='pace' && value && !checkField('run','pace',value).ok)return;
  return CHANGE['fd-split'](el,ev);
});
onInput('fd-ex',(el,ev)=>{
  const f=el.dataset.f!,value=(el as HTMLInputElement).value.trim();
  if(el.dataset.tfkind){const s=readTime(el);if(value && (s==null||isNaN(s)))return;}
  else if(['sets','kg','restSec'].includes(f)){try{strengthNumber(value,f,f!=='kg',f==='sets');}catch(_){return;}}
  return CHANGE['fd-ex'](el,ev);
});
onChange('fd', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const k = el.dataset.k!;
  let v: any = (el as HTMLInputElement).value.trim();
  // Auftrag 39: unklare Zeit („5,3“) → Nachfrage unter dem Feld; bis zur Antwort gilt der Wert von vorher (nie ein Zwischenstand)
  if (tfAsking(el)) { restore(el, tg, st, k); return; }
  if (el.dataset.pace || el.dataset.tf) { const s = readTime(el); if (s != null && isNaN(s)) { restore(el, tg, st, k); tfInvalid(el); return; } v = s ? secToMmss(s) : ''; }
  // Auftrag 22: Grenzen je Feld – unmögliche Werte freundlich ablehnen, der gespeicherte Wert bleibt
  const chk = checkField(tg.sport, k, v);
  if (!chk.ok) { restore(el, tg, st, k); el.setAttribute('aria-invalid', 'true'); toast(chk.msg!); refreshSheet(); nav.rerender(); return; }
  BEFORE.delete(el); el.removeAttribute('aria-invalid');
  if (chk.note) toast(chk.note);
  // Auftrag 29: das Feld zeigt sofort, was gespeichert ist (z. B. „1:05“ → 65 min, „1,02 m“ → 102 cm)
  if (el.tagName === 'INPUT' && !el.dataset.pace && !el.dataset.tf) (el as HTMLInputElement).value = inputDisplay(tg.sport, k, chk.value);
  put(tg, setSessionMetricManual(rec(tg) || st, k, chk.value));
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
  // Auftrag 39: Pace je km wie jede Pace (530, 5,30, 5:30; „5,3“ → Nachfrage; Grenzen 2:20 bis 20:00)
  if (el.dataset.f === 'pace') { if (tfAsking(el)) return; const c = checkField('run', 'pace', v); if (!c.ok) { toast(c.msg!); return; } l[i].pace = c.value || ''; }
  else l[i].hr = v ? Math.round(+v.replace(',', '.')) || null : null;
  put(tg, setSessionMetricManual(st, 'splits', l)); saveSoon();
});
/* Übungen */
on('fd-ex-add', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); l.push({ name: '', sets: null, reps: '', kg: null }); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); UIH.open({ ...tg, planned: plannedFor(tg) }, 'ex:' + (l.length - 1)); });
function exList(tg: Target, st: any): any[] {
  const own = listOf(st, 'exercises'); if (Array.isArray(st.metrics?.exercises)) return own;
  const day = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((d: any) => d.date === tg.date);
  const s = day && day.sessions.find((x: any) => x.id === tg.id);
  // Auftrag 38: die übrigen geplanten Übungen gelten als „wie geplant“, wenn die erste geändert wird (abgehakt ohne Werte = wie geplant)
  return ((s && s.spec && s.spec.exercises) || []).map((e: any) => ({ ...e, kg: null, ...(st.completed ? { plan: true } : {}) }));
}
onChange('fd-ex', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); const i = +el.dataset.i!; if (!l[i]) return;
  const v = (el as HTMLInputElement).value.trim(); const f = el.dataset.f!;
  if (tfAsking(el)) return;
  delete l[i].plan; // Auftrag 37: eigener Wert statt „wie geplant“
  // Auftrag 39: Pause und Haltezeit als Zeit (Sekunden); Haltezeit gespeichert wie bisher als Text „45 s“
  if (el.dataset.tfkind) {
    const r = tfRead(el);
    if (r.err) { tfInvalid(el); return; }
    if (r.out) { toast(f === 'restSec' ? 'Pause bitte zwischen 0 und 15 min.' : 'Haltezeit bitte zwischen 1 s und 30 min.'); return; }
    if (f === 'restSec') { if (r.sec == null) delete l[i].restSec; else l[i].restSec = r.sec; } else l[i].reps = r.sec == null ? '' : `${r.sec} s`;
    put(tg, setSessionMetricManual(st, 'exercises', l)); saveSoon(); return;
  }
  try { l[i][f] = ['sets', 'kg', 'restSec'].includes(f) ? strengthNumber(v, f === 'sets' ? 'Sätze' : f === 'kg' ? 'Gewicht' : 'Pause', f !== 'kg', f === 'sets') : v; }
  catch (error) { toast((error as Error).message); (el as HTMLInputElement).value = String(l[i][f] ?? ''); return; }
  put(tg, setSessionMetricManual(st, 'exercises', l)); saveSoon();
});
on('fd-ex-del', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; const l = exList(tg, st); l.splice(+el.dataset.i!, 1); setSubKey(''); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); });
on('fd-ex-move', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; const l = exList(tg, st), i = +el.dataset.i!, j = i + +el.dataset.dir!; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; if (SUB.key === 'ex:' + i) setSubKey('ex:' + j); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); });
on('fd-ex-last', el => {
  const tg = tgOf(el), st = rec(tg); if (!st) return;
  const last = lastStrengthExercises(strengthHistory(), tg.date, tg.id); if (!last) { toast('Noch keine frühere Krafteinheit mit Übungen.'); return; }
  put(tg, setSessionMetricManual(st, 'exercises', last.exercises)); redraw(); toast(`Übungen und Gewichte vom ${dmy(last.date)} übernommen. Ändere nur, was heute anders war.`);
});
on('fd-template-save', el => { const tg = tgOf(el), st = rec(tg); if (!st) return; editStrengthTemplate(st.title || tg.planned?.title || 'Mein Kraftplan', exList(tg, st)); });
on('fd-template-apply', el => {
  const tg = tgOf(el), st = rec(tg); if (!st) return;
  const select = el.closest('[data-exercises]')?.querySelector('[data-template-select]') as HTMLSelectElement;
  const template = STATE.strengthTemplates?.[select?.value]; if (!template) { toast('Bitte eine Vorlage auswählen.'); return; }
  put(tg, setSessionMetricManual(st, 'exercises', template.exercises.map((e: any) => ({ ...e })))); redraw(); toast('Vorlage übernommen.');
});
