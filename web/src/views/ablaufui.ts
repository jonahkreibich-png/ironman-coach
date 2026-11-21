/* Auftrag 37: der „Ablauf“ einer Einheit – eine Liste von oben nach unten (Aufwärmen → Sätze mit Wiederholungen → Ausklang; Kraft: Übungen).
   Jede Zeile: Ist fett, Soll grau, kurzes Urteil. Antippen öffnet ein Fenster von unten nur für diesen Teil (sectionsui.ts, intervalsui.ts,
   Übung hier). In der Liste klappt nichts auf. Das Diagramm oben dient der Übersicht; Antippen öffnet dasselbe Fenster (kein zweiter Weg).
   „+ Abschnitt / Satz hinzufügen“ am Ende. Auftrag 38: der Ablauf ist der einzige Ort für das Gemachte (keine Knöpfe „Wie geplant“ /
   „Anders gemacht“ mehr); er enthält die ganze Einheit, darunter die Summe geplant / gemacht. */
import { esc } from '../util';
import { on, openSub, srcBadge, tfData, tfHint } from '../kit';
import { fmtTimeInput } from '../../../shared/validate';
import { repsOf } from '../../../shared/strength';
import { buildAblauf, type Ablauf, type AbSec, type AbSet, type AbEx } from '../../../shared/ablauf';
import { mainPart, mainText, plannedShape, partLabel } from '../../../shared/sections';
import { secToPace } from '../../../shared/intervals';
import { diagramSvg } from '../../../shared/workoutdiagram';
import { totals as specTotals } from '../../../shared/workouts';
import { actualMetrics } from '../../../shared/results';
import { HOST, attrsOf, tgOf, actOf, SUB, setSubKey, UIH, type Tg } from './ablaufstate';
import { subOpen } from '../kit';
import { repLine, repSheet, repTitle, setSheet, setTitle } from './intervalsui';
import { secSheet, secTitle } from './sectionsui';
import { undoCount, lastStepLabel, undoToast, undoOne } from '../undo';

const SRC: Record<string, string> = { manual: 'manual', plan: 'manual', watch: 'file', laps: 'file', stream: 'file', icu: 'intervals', series: 'file', splits: 'file' };
const verdictPill = (v: { word: string; cls: string } | null) => (v ? `<span class="pill ${v.cls}">${esc(v.word)}</span>` : '');
const sportOk = (s: string) => ['run', 'bike', 'swim', 'strength'].includes(s);
/** geplante Einheit nur, wenn sie zur tatsächlichen Sportart passt (anders gemacht: andere Sportart → ohne Soll) */
export function plannedFor(tg: Tg): any { const p = tg.planned; return p && p.sport === tg.sport ? p : null; }
function ablaufOf(tg: Tg, st: any) {
  const mode = HOST!.mode(tg);
  return buildAblauf(plannedFor(tg), st, actOf(st), HOST!.thresholds(), tg.sport, { done: !!st.completed, free: mode === 'free', none: mode === 'none' } as any);
}

function secRow(it: AbSec, attrs: string, editable: boolean): string {
  const inner = `<span class="ab-n ab-n-part" aria-hidden="true"></span><span class="ab-txt"><span class="ab-lab">${esc(it.label)}</span>${it.ist ? `<b class="ab-ist">${esc(it.ist)}</b>` : ''}<span class="ab-soll">${esc(it.soll ? (it.ist ? it.soll : 'Soll ' + it.soll) : it.ist ? '' : 'noch nichts eingetragen')}</span></span>${verdictPill(it.verdict)}`;
  const label = `${it.label}: ${it.ist || (it.soll ? 'Soll ' + it.soll : 'noch nichts eingetragen')}${it.verdict ? ', ' + it.verdict.word : ''}`;
  return `<li class="ab-item ab-sec" data-sec-part="${it.part}">${editable ? `<button type="button" class="ab-row" data-act="ab-open" data-key="${it.key}" ${attrs} aria-label="${esc(label)}">${inner}</button>` : `<div class="ab-row">${inner}</div>`}</li>`;
}
function setRow(it: AbSet, attrs: string, editable: boolean): string {
  const head = `<span class="ab-set-t iv-set-t">${esc(it.label)}</span>${it.count ? `<span class="xs muted ab-count">${esc(it.count)}</span>` : ''}`;
  return `<li class="ab-item ab-set iv-set" data-iv-set="${it.gi}">${editable ? `<button type="button" class="ab-set-h" data-act="ab-open" data-key="${it.key}" ${attrs} aria-label="Satz ${esc(it.label)}${it.count ? ', ' + esc(it.count) : ''} bearbeiten">${head}</button>` : `<div class="ab-set-h">${head}</div>`}
    <ol class="ab-reps iv-rows" aria-label="${esc(it.label)}">${it.reps.map(r => `<li>${repLine(r, attrs, editable)}</li>`).join('')}</ol></li>`;
}
function exRow(it: AbEx, attrs: string, editable: boolean): string {
  const inner = `<span class="ab-n">${it.i + 1}</span><span class="ab-txt"><span class="ab-lab">${esc(it.label)}</span>${it.ist ? `<b class="ab-ist">${esc(it.ist)}</b>` : ''}${it.soll && it.soll !== it.ist ? `<span class="ab-soll">${esc(it.ist ? 'Soll ' + it.soll : 'Soll ' + it.soll)}</span>` : ''}</span>${verdictPill(it.verdict)}`;
  return `<li class="ab-item ab-ex" data-ex="${it.i}">${editable ? `<button type="button" class="ab-row" data-act="ab-open" data-key="${it.key}" ${attrs} aria-label="Übung ${it.i + 1}: ${esc(it.label)}${it.ist ? ', ' + esc(it.ist) : ''}">${inner}</button>` : `<div class="ab-row">${inner}</div>`}</li>`;
}
/** Diagramm: Balken → Teil des Ablaufs (Aufwärmen, Wiederholung, Ausklang …), dieselben Schlüssel wie die Liste */
function diagram(tg: Tg, ab: Ablauf, attrs: string, editable: boolean): string {
  const p = plannedFor(tg); const spec = p && p.spec;
  if (!spec || !Array.isArray(spec.steps) || spec.steps.length < 2 || tg.sport === 'strength') return '';
  const sets = ab.items.filter(x => x.kind === 'set') as AbSet[];
  const has = (k: string) => ab.items.some(x => x.key === k);
  const keyOf = (si: number, k: number): string | null => {
    const st = spec.steps[si]; if (!st) return null;
    // Wiederholung: die Zeile, die zu diesem Soll gehört (ti), sonst der Satz
    const t = ab.targets.find(x => x.set === si && (x.rep === k || x.reps === 1));
    if (t) { const i = ab.rows.findIndex(r => r && r.ti === t.i); if (i >= 0) return 'rep:' + i; const s0 = sets.find(s => s.idx.some(j => ab.rows[j] && ab.rows[j].set === si)); if (s0) return s0.key; }
    const part = st.part === 'main' && tg.sport === 'swim' && ['drill', 'kick'].includes(st.mode) ? 'tech' : st.part;
    if (has('sec:' + part)) return 'sec:' + part;
    return sets.length ? sets[0].key : null;
  };
  return `<div class="wo-diagram-wrap" data-diagram${editable ? ' data-diagram-tap' : ''}>${diagramSvg(spec, { label: 'Ablauf als Bild – antippen öffnet den Teil', ...(editable ? { keyOf: (si: number, k: number) => keyOf(si, k), attrs } : {}) })}</div>`;
}

export interface AbOpts { editable: boolean; extra?: string }
export function ablaufBlock(tg: Tg, o: AbOpts): string {
  if (!HOST || !sportOk(tg.sport)) return '';
  const st = HOST.rec(tg) || {}; const attrs = attrsOf(tg);
  const ab = ablaufOf(tg, st);
  const mode = HOST.mode(tg);
  if (!ab.items.length && tg.sport !== 'strength' && !o.editable) return '';
  const hasSets = ab.items.some(x => x.kind === 'set');
  const thr = HOST.thresholds(); const act = actOf(st); const planned = plannedFor(tg);
  // Kurzfassung: Hauptteil (Abschnitte) bzw. Ø der Intervalle
  const lthr = tg.sport === 'bike' ? thr.lthrBike : thr.lthrRun;
  const mp = tg.sport !== 'strength' ? mainPart(planned || { sport: tg.sport }, st, act, thr, tg.sport) : null;
  const sum: string[] = [];
  const e = ab.e;
  if (e && e.done + e.extra) {
    const w = e.work; const sp = tg.sport;
    const perf = sp === 'run' && w.paceSec ? `${secToPace(w.paceSec)}/km` : sp === 'bike' && w.power ? `${w.power} W` : sp === 'bike' && w.speed ? `${String(w.speed).replace('.', ',')} km/h` : sp === 'swim' && w.pace100 ? `${secToPace(w.pace100)}/100 m` : '';
    const avg = [perf, w.hr ? `Puls ${w.hr}` : '', w.rpe ? `RPE ${String(w.rpe).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
    if (avg) sum.push(`Ø Intervalle: ${avg}`);
    if (e.rest.sec || e.rest.hr) sum.push(`Ø Pausen: ${[e.rest.sec ? secToPace(e.rest.sec) + ' min' : '', e.rest.hr ? `Puls ${e.rest.hr} am Ende` : ''].filter(Boolean).join(' · ')}`);
    sum.push([`${e.done} von ${e.planned || e.done} gemacht`, e.extra ? `${e.extra} zusätzlich` : '', e.inTarget ? `${e.inTarget} im Ziel` : '', e.tooHard ? `${e.tooHard} zu hart` : '', e.tooEasy ? `${e.tooEasy} zu locker` : '', e.short ? `${e.short} kürzer` : '', e.asPlanned ? `${e.asPlanned} wie geplant` : ''].filter(Boolean).join(', '));
  }
  const srcIv = ab.ivSource !== 'none' && hasSets ? SRC[ab.ivSource] : null, srcSec = ab.secSource !== 'none' ? SRC[ab.secSource] : null;
  const autoAvail = !!act && ab.ivSource === 'manual' && hasSets;
  const when = planned && planned.spec && planned.spec.when ? `<div class="xs muted">${esc(planned.spec.when)}</div>` : '';
  // Auftrag 38: Summe des Ablaufs = Dauer bzw. Strecke der Einheit (geplant und gemacht)
  const sumLine = (() => {
    if (!planned || !planned.spec || tg.sport === 'strength') return '';
    const pt = specTotals(planned.spec); const m = actualMetrics(st, act);
    const swim = tg.sport === 'swim'; const pv = swim ? Math.round((pt.km || 0) * 1000) : planned.plannedMinutes || pt.min;
    const dv = swim ? (m.meters != null && m.meters !== '' ? Math.round(+String(m.meters).replace(',', '.')) : null) : m.min != null && m.min !== '' ? Math.round(+String(m.min).replace(',', '.')) : null;
    const u = swim ? ' m' : ' min';
    const done = st.completed ? (dv != null ? `${dv}${u}` : `${pv}${u} (wie geplant)`) : dv != null ? `${dv}${u}` : '';
    return `<div class="xs ab-sum" data-ab-sum><span class="muted">Summe:</span> geplant <b data-sum-plan>${pv}${u}</b>${done ? ` · gemacht <b data-sum-done>${esc(done)}</b>` : ''}</div>`;
  })();
  const list = ab.items.map(it => it.kind === 'sec' ? secRow(it, attrs, o.editable) : it.kind === 'set' ? setRow(it, attrs, o.editable) : exRow(it as AbEx, attrs, o.editable)).join('');
  const empty = !ab.items.length ? `<div class="xs muted" data-ab-empty>${tg.sport === 'strength' ? 'Noch keine Übungen. Füge die erste hinzu.' : 'Noch nichts eingetragen.'}</div>` : '';
  const canAdd = o.editable && (tg.sport === 'strength' || (mode !== 'none' && ['run', 'bike', 'swim'].includes(tg.sport)) || ab.missingParts.length > 0);
  const addBtn = !canAdd ? '' : tg.sport === 'strength' ? `<button class="btn ghost sm" data-act="fd-ex-add" ${attrs}>+ Übung hinzufügen</button>` : `<button class="btn ghost sm" data-act="ab-add" ${attrs}>+ Abschnitt / Satz hinzufügen</button>`;
  return `<div class="card flat tight stack ablauf" data-ablauf="${esc(tg.sport)}"${hasSets ? ` data-intervals="${esc(tg.sport)}"` : ''}${ab.items.some(x => x.kind === 'sec') ? ` data-sections="${esc(tg.sport)}"` : ''}${tg.sport === 'strength' ? ' data-exercises' : ''}>
    <div class="spread ab-head"><span class="lbl">Ablauf ${srcSec ? srcBadge(srcSec) : ''}${srcIv && srcIv !== srcSec ? ' ' + srcBadge(srcIv) : ''}</span>${autoAvail ? `<button class="link" data-act="iv-reset" ${attrs}>Uhrwerte verwenden</button>` : ''}</div>
    ${when}${diagram(tg, ab, attrs, o.editable)}
    ${mp ? `<div class="small" data-sec-main><b>${esc(mainText(mp, tg.sport === 'swim' ? null : lthr, tg.sport, plannedShape(planned).zone))}</b></div>` : ''}
    ${sum.length ? `<div class="xs" data-iv-sum>${sum.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    ${list ? `<ol class="ab-list">${list}</ol>` : empty}
    ${sumLine}
    ${o.extra || ''}
    ${addBtn}</div>`;
}

/* ---------- Fenster ---------- */
function exSheet(tg: Tg, i: number, attrs: string): string {
  const st = HOST!.rec(tg) || {}; const ab = ablaufOf(tg, st);
  const it = ab.items.find(x => x.kind === 'ex' && x.i === i) as AbEx | undefined; if (!it) return '';
  const list = Array.isArray(st.metrics?.exercises) ? st.metrics.exercises : ((plannedFor(tg)?.spec?.exercises) || []).map((e: any) => ({ ...e, kg: null }));
  const e = list[i] || {}; const n = list.length;
  /* Auftrag 39: Halteübung (z. B. Plank 45 s) → Haltezeit als Zeitfeld (45 = 0:45, 130 = 1:30); Pause ebenso (90 = 90 s, 2 = 2 min) */
  const plannedRep = ((plannedFor(tg)?.spec?.exercises) || [])[i]?.reps;
  const hold = repsOf(e.reps).holdSec != null || (!e.reps && repsOf(plannedRep).holdSec != null);
  const F: [string, string, string][] = [['name', 'Übung', 'text'], ['sets', 'Sätze', 'numeric'], ['reps', hold ? 'Haltezeit (min:s)' : 'Wiederholungen / Dauer', hold ? 'decimal' : 'text'], ['kg', 'Gewicht (kg)', 'decimal'], ['restSec', 'Pause (min:s)', 'decimal']];
  const timeOf = (f: string): number | null => f === 'restSec' ? (e.restSec != null && e.restSec !== '' && Number.isFinite(+e.restSec) ? +e.restSec : null) : f === 'reps' && hold ? repsOf(e.reps).holdSec : null;
  const tf = (f: string) => f === 'restSec' ? tfData('sec', [0, 900]) : f === 'reps' && hold ? tfData('sec', [1, 1800]) + ' data-hold="1"' : '';
  const val = (f: string) => { const s = timeOf(f); return s != null ? fmtTimeInput(s, 'sec') : e[f] ?? ''; };
  return `<div class="stack ab-sheet" data-ab-sheet="ex" data-ex="${i}">
    ${it.soll ? `<div class="small muted">Geplant: ${esc(it.soll)}</div>` : ''}${e.plan ? '<div class="hint" data-plan-hint>Wie geplant eingetragen. Trag ein, was anders war (z. B. das Gewicht).</div>' : ''}
    <div class="fgrid">${F.map(([f, l, im]) => `<label class="fld ${f === 'name' ? 'wide' : ''}" for="ex-${i}-${f}"><span class="lab">${esc(l)}</span><input class="inp" id="ex-${i}-${f}" aria-label="${esc(l)}" data-ch="fd-ex" data-i="${i}" data-f="${f}" ${tf(f)} ${attrs} inputmode="${im}" autocomplete="off" value="${esc(val(f))}">${tf(f) ? tfHint() : ''}</label>`).join('')}</div>
    <div class="row ab-btns"><button class="btn ghost sm" data-act="fd-ex-move" data-i="${i}" data-dir="-1" ${attrs} ${i === 0 ? 'disabled' : ''} aria-label="Übung nach oben">↑</button><button class="btn ghost sm" data-act="fd-ex-move" data-i="${i}" data-dir="1" ${attrs} ${i >= n - 1 ? 'disabled' : ''} aria-label="Übung nach unten">↓</button><button class="btn ghost sm danger" data-act="fd-ex-del" data-i="${i}" ${attrs}>Übung löschen</button></div>
    <button class="btn block" data-act="sub-close">Speichern</button></div>`;
}
function addSheet(tg: Tg, attrs: string): string {
  const st = HOST!.rec(tg) || {}; const ab = ablaufOf(tg, st); const mode = HOST!.mode(tg);
  const btns: string[] = [];
  const parts = ab.missingParts.filter(p => !(p === 'main' && ab.items.some(x => x.kind === 'set')));
  parts.filter(p => p === 'warm' || p === 'tech').forEach(p => btns.push(`<button class="btn ghost block" data-act="sec-add" data-p="${p}" ${attrs}>+ ${esc(partLabel(tg.sport, p))}</button>`));
  if (mode !== 'none' && ['run', 'bike', 'swim'].includes(tg.sport)) btns.push(`<button class="btn ghost block" data-act="iv-add" ${attrs}>+ Satz (Wiederholungen)</button>`);
  parts.filter(p => p === 'main' || p === 'cool').forEach(p => btns.push(`<button class="btn ghost block" data-act="sec-add" data-p="${p}" ${attrs}>+ ${esc(partLabel(tg.sport, p))}</button>`));
  if (!btns.length) return '<div class="hint">Alle Abschnitte sind schon da.</div>';
  return `<div class="stack ab-sheet" data-ab-sheet="add">${btns.join('')}<div class="xs muted">Ein neuer Satz kommt ans Ende der Sätze, Aufwärmen bzw. Ausklang an ihre Stelle im Ablauf.</div></div>`;
}
function titleOf(tg: Tg, key: string): string {
  const [k, v] = key.split(':');
  if (k === 'sec') return secTitle(tg, v as any);
  if (k === 'set') return setTitle(tg, +v);
  if (k === 'rep') return repTitle(tg, +v);
  if (k === 'ex') { const st = HOST!.rec(tg) || {}; const it = ablaufOf(tg, st).items.find(x => x.kind === 'ex' && x.i === +v); return it ? (it as AbEx).label : 'Übung'; }
  if (k === 'add') return 'Hinzufügen';
  return '';
}
function renderOf(tg: Tg): string {
  if (!HOST || !SUB.key) return '';
  const attrs = attrsOf(tg); const [k, v] = SUB.key.split(':');
  const t = { ...tg, planned: HOST.planned(tg) };
  if (k === 'sec') return secSheet(t, v as any, attrs);
  if (k === 'set') return setSheet(t, +v, attrs);
  if (k === 'rep') return repSheet(t, +v, attrs);
  if (k === 'ex') return exSheet(t, +v, attrs);
  if (k === 'add') return addSheet(t, attrs);
  return '';
}
let groupFrom = -1;
/** Fenster eines Teils öffnen. Änderungen darin: beim Schließen ein Hinweis mit „Rückgängig“ (nimmt alles aus diesem Fenster zurück). */
export function openPart(tg: Tg, key: string): void {
  if (!HOST) return;
  const t: Tg = { kind: tg.kind, id: tg.id, date: tg.date, sport: tg.sport };
  // Wechsel von einem Teil zum nächsten (z. B. Satz → Wiederholung, Hinzufügen → neuer Satz): ein gemeinsamer Hinweis beim Schließen
  const from = subOpen() && SUB.tg && SUB.tg.id === t.id && groupFrom >= 0 ? groupFrom : undoCount(t);
  SUB.tg = t; SUB.key = key; groupFrom = from;
  openSub(() => (SUB.key ? titleOf({ ...t, planned: HOST!.planned(t) }, SUB.key) : ''), () => renderOf(t), () => {
    SUB.key = ''; SUB.tg = null; groupFrom = -1; HOST!.redraw();
    if (undoCount(t) > from && !/gelöscht/.test(lastStepLabel(t))) undoToast(t, 'Übernommen', from);
  });
}
UIH.open = (tg, key) => { setSubKey(key); openPart(tg, key); };
on('ab-open', el => { const tg = tgOf(el); const key = el.dataset.key || ''; if (key) openPart(tg, key); });
on('ab-add', el => openPart(tgOf(el), 'add'));
on('undo-one', el => { const tg = tgOf(el); undoOne(tg); });
