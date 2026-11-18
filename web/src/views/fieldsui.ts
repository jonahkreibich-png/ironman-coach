import {customDraft} from './custom-draft27';
/* Felder statt Notizfeld (Auftrag 7, Punkt 3): gemeinsamer Baustein für geplante Einheiten und Extra-Einheiten.
   Je Sportart die Werte aus shared/fields.ts, jedes Feld mit Quelle (Uhr, intervals.icu, aus Notiz, von Hand), änderbar.
   Darunter für alle: RPE, Gefühl, „geplant vs. gemacht“ und eine optionale Notiz. Automatisch: Pulszone und CTL/ATL/TSB des Tages. */
import { findCustomRecord, STATE, BASE_WEEKS, saveSoon, saveState, profile } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, onInput, CHANGE, srcBadge, more, refreshSheet, timeField, readTime, secToMmss, termLink, ic } from '../kit';
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
import { fillAsPlanned } from '../../../shared/ablauf';
import { checkField, crossCheck, applyDoubtFix, parseNum, inputDisplay } from '../../../shared/validate';
import { actualMetrics, CHANGE_KINDS, CHANGE_REASONS, CHANGE_ZONES, changedOf, changeZone, changeParts, intervalsMode, omitOptions, placeLabel } from '../../../shared/results';

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
  if (f.kind === 'pace') return timeField(id, f.label + (f.unit ? ` (${f.unit})` : ''), paceSecOf(m[f.key]), 'ms', `data-ch="fd" data-k="${f.key}" data-pace="1" ${attrs(tg)}`);
  if (f.kind === 'select') return `<div class="fld"><label for="${id}">${lab}</label><select class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)}>${(f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(m[f.key] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  if (f.kind === 'text') return `<div class="fld wide"><label for="${id}">${lab}</label><input class="inp" id="${id}" data-ch="fd" data-k="${f.key}" ${attrs(tg)} value="${esc(m[f.key] ?? '')}" placeholder="${esc(f.ph || '')}"></div>`;
  if (f.kind === 'splits') return splitsHtml(tg, m.splits || []);
  if (f.kind === 'exercises') return '';
  return `<div class="fld"><label for="${id}">${lab}</label><input class="inp" id="${id}" type="text" inputmode="decimal" data-ch="fd" data-k="${f.key}" ${attrs(tg)} value="${esc(inputDisplay(tg.sport, f.key, m[f.key]))}" placeholder="${esc(inputDisplay(tg.sport, f.key, (st.metricsAuto || {})[f.key]))}"></div>`;
}
function splitsHtml(tg: Target, list: any[]): string {
  return `<div class="fld wide" data-splits><span class="lab">${esc(t('fd.splits'))}</span>${list.length ? `<div class="splits">${list.map((s: any, i: number) => `<div class="split-row"><b class="xs">${s.km} km</b>
    <input class="inp sm" inputmode="numeric" aria-label="${esc(t('fd.splitPace', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="pace" ${attrs(tg)} value="${esc(s.pace || '')}" placeholder="6:20">
    <input class="inp sm" inputmode="numeric" aria-label="${esc(t('fd.splitHr', { n: s.km }))}" data-ch="fd-split" data-i="${i}" data-f="hr" ${attrs(tg)} value="${esc(s.hr ?? '')}" placeholder="${esc(t('m.hr'))}">
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
/** „Wie lief es? Wie geplant gemacht / Anders gemacht“ mit den Angaben dazu und Rückfragen bei widersprüchlichen Werten */
export function changeBlock(tg: Target): string {
  const st = rec(tg) || {};
  const moved = tg.kind === 'session' && tg.planned ? movedKeys(st) : [];
  return `${tg.kind === 'session' && tg.planned ? changeHtml(tg, st, defsOf(tg, st).filter(f => moved.includes(f.key))) : ''}${doubtsHtml(tg, st)}`;
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
  // Auftrag 30: Dauer/Distanz stehen bei „kürzer/länger/abgebrochen“ oben im Änderungs-Block (dieselben Felder, keine doppelten)
  const moved = tg.kind === 'session' && tg.planned ? movedKeys(st) : [];
  const main = defs.filter(f => !f.more && !moved.includes(f.key)), extra = defs.filter(f => f.more && !moved.includes(f.key));
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
/* Auftrag 29/30: „So wie geplant / Anders gemacht“ – je Art die passenden Felder, optional der Grund */
const DUR_KINDS = ['shorter', 'longer', 'aborted'];
function movedKeys(st: any): string[] { const c = changedOf(st); return c && DUR_KINDS.includes(c.kind) ? ['min', 'km', 'meters'] : []; }
function changeHtml(tg: Target, st: any, durDefs: FieldDef[]): string {
  const c = st.changed || {}; const other = st.asPlanned === false; const s = tg.planned;
  const chip = (act: string, v: string, label: string, on: boolean) => `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="${act}" data-v="${esc(v)}" ${attrs(tg)}>${esc(label)}</button>`;
  const sports: [string, string][] = [['run', 'Laufen'], ['bike', 'Rad'], ['swim', 'Schwimmen'], ['strength', 'Kraft'], ['football', 'Teamsport']];
  const endurance = ['run', 'bike', 'swim'].includes(s.sport);
  const kinds = CHANGE_KINDS.filter(([k]) => endurance || !['otherIntervals', 'place', 'split'].includes(k));
  let detail = '';
  if ((c.kind === 'easy' || c.kind === 'harder') && !endurance) detail = '<div class="xs muted">Wie anstrengend es war, trägst du unten als RPE ein.</div>';
  else if (c.kind === 'easy' || c.kind === 'harder') { const z = changeZone(st, s); detail = `<span class="lab">Tatsächliche Intensität</span><div class="chips" style="flex-wrap:wrap" data-change-zone>${CHANGE_ZONES.filter(([n]) => c.kind === 'easy' ? n <= 3 : n >= 3).map(([n, l]) => chip('fd-chg-zone', String(n), l, z === n)).join('')}</div><div class="xs muted">Dein Gefühl (RPE) trägst du unten ein.</div>`; }
  else if (DUR_KINDS.includes(c.kind)) detail = `<div class="fgrid" data-change-dur>${durDefs.map(f => oneField(tg, f.key === 'min' && c.kind === 'aborted' ? { ...f, label: 'Abgebrochen nach' } : f, st)).join('')}</div>`;
  else if (c.kind === 'otherSport') detail = `<label class="fld"><span class="lab">Sportart</span><select class="inp" data-ch="fd-chg-sport" ${attrs(tg)}><option value="">–</option>${sports.filter(([k]) => k !== s.sport).map(([k, l]) => `<option value="${k}" ${c.sport === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${c.sport ? '<div class="xs muted">Unten stehen jetzt die Felder dieser Sportart.</div>' : ''}`;
  else if (c.kind === 'place') detail = `<span class="lab">Wo?</span><div class="chips" data-change-place>${chip('fd-chg-place', 'in', placeLabel(s.sport, 'in'), c.place === 'in')}${chip('fd-chg-place', 'out', placeLabel(s.sport, 'out'), c.place === 'out')}</div>`;
  else if (c.kind === 'split') {
    const parts: any[] = Array.isArray(c.parts) && c.parts.length ? c.parts : [null, null]; const sum = changeParts(st).reduce((x, y) => x + y, 0);
    detail = `<span class="lab">Teile</span><div class="stack" data-change-parts>${parts.map((v, i) => `<div class="row" style="gap:6px;flex-wrap:wrap;align-items:flex-end"><label class="fld grow" for="fd-part-${i}"><span class="lab">Teil ${i + 1} <span class="muted">(min)</span></span><input class="inp" id="fd-part-${i}" inputmode="text" data-ch="fd-chg-part" data-i="${i}" ${attrs(tg)} value="${esc(v ?? '')}" placeholder="z. B. 30 oder 1:05"></label>${parts.length > 2 ? `<button class="btn ghost sm" data-act="fd-chg-part-del" data-i="${i}" ${attrs(tg)} aria-label="Teil ${i + 1} entfernen">×</button>` : ''}</div>`).join('')}
      <button class="btn ghost sm" data-act="fd-chg-part-add" ${attrs(tg)}>+ Teil</button>${sum ? `<div class="xs muted" data-parts-sum>Zusammen ${Math.round(sum)} min</div>` : ''}</div>`;
  }
  else if (c.kind === 'omit') detail = `<span class="lab">Was hast du weggelassen?</span><div class="chips" style="flex-wrap:wrap" data-change-omit>${omitOptions(s).map(([k, l]) => chip('fd-chg-omit', k, l, c.omit === k)).join('')}</div>`;
  else if (c.kind === 'otherIntervals') detail = '<div class="xs muted">Trag unten im Ablauf ein, was du gemacht hast (+ Satz hinzufügen).</div>';
  return `<div class="fld wide" data-as-planned><span class="lab">Wie lief es?</span><div class="chips" role="group" aria-label="Wie lief es?" style="flex-wrap:wrap">${chip('fd-asplanned', '1', 'Wie geplant gemacht', st.asPlanned === true)}${chip('fd-asplanned', '0', 'Anders gemacht', other)}</div>
    ${other ? `<span class="lab">Was hast du gemacht?</span><div class="chips" style="flex-wrap:wrap" data-change-kind>${kinds.map(([k, l]) => chip('fd-chg-kind', k, l, c.kind === k)).join('')}</div>
      ${detail ? `<div class="stack" data-change-detail="${esc(c.kind)}">${detail}</div>` : ''}
      <span class="lab">Grund (optional)</span><div class="chips" style="flex-wrap:wrap" data-change-reason>${CHANGE_REASONS.map(([k, l]) => chip('fd-chg-reason', k, l, c.reason === k)).join('')}</div>` : ''}</div>`;
}
function setChange(tg: Target, f: (st: any) => void) { const st = rec(tg); if (!st) return; f(st); if (st.asPlanned === false && !st.changed) st.changed = {}; redraw(); rev(tg); }
const indoorPlanned = (s: any) => !!s && (s.indoor === true || /rolle|indoor|drinnen|laufband|halle/i.test(String(s.title || '')));
/* Auftrag 37: „Wie geplant gemacht“ füllt den ganzen Ablauf mit dem Soll (als „wie geplant“ markiert, nicht als gemessen) und hakt die
   Einheit ab. Uhrdaten und eigene Einträge bleiben (Vorrang). Danach ändert man nur, was anders war. */
on('fd-asplanned', el => {
  const tg = tg0(el);
  if (el.dataset.v !== '1') { setChange(tg, st => { st.asPlanned = false; }); return; }
  const st0 = rec(tg); if (!st0) return;
  const planned = plannedFor(tg); const act = st0.activityId ? (STATE.activities || {})[st0.activityId] : null;
  const next = fillAsPlanned(planned && planned.sport === tg.sport ? planned : null, { ...st0, asPlanned: true, changed: undefined }, act, ivThr(), tg.sport);
  delete next.changed; next.asPlanned = true;
  if (tg.kind === 'session' && !next.completed) { next.completed = true; next.skipped = false; }
  put(tg, next); saveState(); redraw(); rev(tg);
});
on('fd-chg-kind', el => {
  const tg = tg0(el); const planned = plannedFor(tg);
  setChange(tg, st => {
    const k = el.dataset.v!; const prev = st.changed || {};
    // nur passende Angaben behalten; beim Wechsel der Art fallen die der alten weg (der Grund bleibt)
    st.asPlanned = false; st.changed = k === prev.kind ? { ...prev } : { kind: k, ...(prev.reason ? { reason: prev.reason } : {}) };
    if (k === 'place' && !st.changed.place) st.changed.place = indoorPlanned(planned) ? 'out' : 'in';
  });
});
on('fd-chg-reason', el => setChange(tg0(el), st => { st.changed = { ...(st.changed || {}) }; st.changed.reason = st.changed.reason === el.dataset.v ? undefined : el.dataset.v; }));
on('fd-chg-zone', el => setChange(tg0(el), st => { st.changed = { ...(st.changed || {}), zone: +el.dataset.v! }; }));
on('fd-chg-place', el => setChange(tg0(el), st => { st.changed = { ...(st.changed || {}), place: el.dataset.v }; }));
on('fd-chg-omit', el => setChange(tg0(el), st => { st.changed = { ...(st.changed || {}) }; st.changed.omit = st.changed.omit === el.dataset.v ? undefined : el.dataset.v; }));
onChange('fd-chg-sport', el => setChange(tg0(el), st => { st.changed = { ...(st.changed || {}), kind: 'otherSport', sport: (el as HTMLSelectElement).value || undefined }; }));
/* Aufgeteilt: Teile mit je Dauer; die Summe ist die Dauer der Einheit (dasselbe Feld wie überall) */
function setParts(tg: Target, parts: any[]) {
  const st = rec(tg); if (!st) return;
  const nums = parts.map(v => (v == null || v === '' ? null : +v)).filter((v): v is number => v != null && v > 0);
  let next: any = { ...st, changed: { ...(st.changed || {}), kind: 'split', parts } };
  if (nums.length) next = setSessionMetricManual(next, 'min', String(Math.round(nums.reduce((a, b) => a + b, 0))));
  put(tg, next); redraw(); rev(tg);
}
const partsOf = (st: any): any[] => Array.isArray(st.changed?.parts) && st.changed.parts.length ? [...st.changed.parts] : [null, null];
onChange('fd-chg-part', el => {
  const tg = tg0(el); const st = rec(tg); if (!st) return; const i = +el.dataset.i!;
  const raw = (el as HTMLInputElement).value.trim(); const parts = partsOf(st);
  if (raw) { const chk = checkField(tg.sport, 'min', raw); if (!chk.ok) { el.setAttribute('aria-invalid', 'true'); toast(chk.msg!); (el as HTMLInputElement).value = parts[i] ?? ''; return; } parts[i] = +chk.value; } else parts[i] = null;
  el.removeAttribute('aria-invalid'); setParts(tg, parts);
});
on('fd-chg-part-add', el => { const tg = tg0(el); const st = rec(tg); if (!st) return; const parts = partsOf(st); parts.push(null); setParts(tg, parts); });
on('fd-chg-part-del', el => { const tg = tg0(el); const st = rec(tg); if (!st) return; const parts = partsOf(st); parts.splice(+el.dataset.i!, 1); setParts(tg, parts); });
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
  if (el.dataset.f === 'pace') { const m = /^(\d{1,2})[:.,]?(\d{2})$/.exec(v.replace(/\s/g, '')); if (v && !m) { toast(t('time.invalid')); return; } l[i].pace = m ? `${+m[1]}:${m[2]}` : ''; }
  else l[i].hr = v ? Math.round(+v.replace(',', '.')) || null : null;
  put(tg, setSessionMetricManual(st, 'splits', l)); saveSoon();
});
/* Übungen */
on('fd-ex-add', el => { const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); l.push({ name: '', sets: null, reps: '', kg: null }); put(tg, setSessionMetricManual(st, 'exercises', l)); redraw(); UIH.open({ ...tg, planned: plannedFor(tg) }, 'ex:' + (l.length - 1)); });
function exList(tg: Target, st: any): any[] {
  const own = listOf(st, 'exercises'); if (Array.isArray(st.metrics?.exercises)) return own;
  const day = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {})).find((d: any) => d.date === tg.date);
  const s = day && day.sessions.find((x: any) => x.id === tg.id);
  return ((s && s.spec && s.spec.exercises) || []).map((e: any) => ({ ...e, kg: null }));
}
onChange('fd-ex', el => {
  const tg = tgOf(el); const st = rec(tg); if (!st) return; const l = exList(tg, st); const i = +el.dataset.i!; if (!l[i]) return;
  const v = (el as HTMLInputElement).value.trim(); const f = el.dataset.f!;
  delete l[i].plan; // Auftrag 37: eigener Wert statt „wie geplant“
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
