import { proposePlanAction, assertPlanAdjustments, parsePlanNumbers, applyCustomPlanAdjustments, type PlanAction26 } from '../../../shared/plan-actions26';
import { nextAdjustmentTime } from '../../../shared/adjustment-clock';
/* Plan bearbeiten (Auftrag 4 C5): Einheit verschieben, ändern (Dauer, Distanz, Art, Intensität), löschen, hinzufügen,
   Tage tauschen, ganze Woche leichter oder schwerer, Einheit „fest“ markieren (die Engine ändert sie dann nicht mehr).
   Jede Änderung ist eine Anpassung (Gruppe „user-…“) wie die des Coachs: Rückgängig und „Original wiederherstellen“ gehen immer.
   Vor dem Übernehmen prüft die Regel-Engine und warnt freundlich. Übernehmen darf man trotzdem, es ist dein Plan. */
import { STATE, PLAN, BASE_WEEKS, UI, saveState, rebuildPlanIndex, saveUi, profile, goals } from '../store';
import { esc, fmtDate, dowShort, dowLong, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, openSheet, closeSheet, refreshSheet, field, select, toggle, sportLabel, ic } from '../kit';
import * as C from '../../../shared/core';
import * as W from '../../../shared/workouts';
import { paceCtx } from '../../../shared/plangen';
import { validateWeeks } from '../../../shared/rules';
import { checkPlan } from '../../../shared/plancheck';
import { checkIntensity } from '../../../shared/intensity';
import { rulesOf, hardViolations, describe as ruleText } from '../../../shared/constraints';
import { parseFor } from '../../../shared/ruleparse';
import { isMinor, progressionOf } from '../../../shared/profile';
import { nav } from '../nav';
import { toast } from '../toast';

export const editing = () => !!UI.planEdit;
const uid = () => 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

/* ---------- Prüfung: welche Hinweise kommen durch die Änderung neu dazu? ---------- */
/* Harte Regeln der Person (Auftrag 5 A4): Verstöße durch die Änderung */
function ruleBreaks(adjustments: any): string[] {
  const today = todayStr();
  const weeks = C.applyAdjustments(BASE_WEEKS, adjustments).filter((w: any) => w.endDate >= today);
  return hardViolations(weeks, rulesOf(profile(), parseFor(today)), today).map(v => t('edit.w.rule', { r: ruleText(v.rule), s: v.title }));
}
function issuesOf(adjustments: any): string[] {
  const weeks = C.applyAdjustments(BASE_WEEKS, adjustments);
  const today = todayStr();
  const fut = weeks.filter((w: any) => w.endDate >= today);
  const p = profile();
  const out = [
    ...validateWeeks(fut, { minor: isMinor(p, today), maxIncPct: progressionOf(p, today).incPct }).map(v => v.msg),
    ...checkPlan(fut, p, goals(), today).filter(i => i.rule === 'dayTime' || i.rule === 'teamSport' || (i.rule === 'strength' && /harten Tag/.test(i.msg))).map(i => i.msg),
    // Auftrag 14: eigene Änderungen werden geprüft (zwei harte Tage, zu viele harte Tage), aber nicht ungefragt geändert
    ...checkIntensity(fut, p, today, { from: today }).filter(i => i.rule === 'adjacent' || i.rule === 'tooMany').map(i => i.msg)
  ];
  return [...new Set(out)];
}
let PENDING: { adj: any[]; warnings: string[]; label: string; rule: boolean } | null = null;
/* Änderung vorschlagen: ohne neue Hinweise sofort übernehmen, sonst freundlich nachfragen */
export function propose(adj: any[], label: string) {
  try { assertPlanAdjustments(PLAN.weeks, STATE, adj); } catch(e) { toast((e as Error).message); return; }
  const next = { ...STATE.adjustments, ...Object.fromEntries(adj.map(a => [a.id, a])) };
  const before = new Set(issuesOf(STATE.adjustments));
  const rb = new Set(ruleBreaks(STATE.adjustments));
  const freshRules = ruleBreaks(next).filter(x => !rb.has(x));
  const fresh = [...freshRules, ...issuesOf(next).filter(x => !before.has(x))];
  if (!fresh.length) { commit(adj, label); return; }
  PENDING = { adj, warnings: fresh, label, rule: freshRules.length > 0 };
  openSheet(t('edit.checkTitle'), () => `<div class="stack" data-edit-warn><div class="banner warn">${fresh.slice(0, 4).map(w => esc(friendly(w))).join('<br>')}</div><div class="hint">${esc(t(PENDING.rule ? 'edit.ruleHint' : 'edit.checkHint'))}</div>
    <button class="btn block" data-act="edit-anyway">${esc(t(PENDING.rule ? 'edit.ruleAnyway' : 'edit.anyway'))}</button><button class="btn ghost block" data-act="edit-cancel">${esc(t('common.cancel'))}</button></div>`);
}
function friendly(msg: string): string {
  if (/beide hart/.test(msg)) return t('edit.w.hard', { msg });
  if (/% mehr|steigt um/.test(msg)) return t('edit.w.volume', { msg });
  return msg;
}
function commit(adj: any[], label: string) {
  try { assertPlanAdjustments(PLAN.weeks, STATE, adj); } catch(e) { PENDING = null; closeSheet(); toast((e as Error).message); return; }
  const now = nextAdjustmentTime(STATE.adjustments, Date.now());
  adj.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: todayStr(), from_user: true }; });
  rebuildPlanIndex(); saveState(); closeSheet(); nav.rerender(); toast(label);
}
on('edit-anyway', () => { if (!PENDING) return; const p = PENDING; PENDING = null; commit(p.rule ? p.adj.map(a => ({ ...a, override: true })) : p.adj, p.label); });
on('edit-cancel', () => { PENDING = null; closeSheet(); });

/* ---------- Leiste über der Woche ---------- */
export function editBar(w: any): string {
  if (!editing()) return `<button class="btn ghost block" data-act="edit-toggle" style="margin-top:var(--s3)">${ic('edit')} ${esc(t('edit.start'))}</button>`;
  const userGroups = userGroupsActive();
  return `<div class="card stack" data-edit-bar><div class="spread"><b>${esc(t('edit.title'))}</b><button class="btn sm" data-act="edit-toggle">${esc(t('common.done'))}</button></div>
    <div class="hint">${esc(t('edit.hint'))}</div>
    <div class="edit-bar"><button class="btn ghost sm" data-act="edit-week" data-f="0.9" data-w="${w.weekNumber}">${esc(t('edit.easier'))}</button><button class="btn ghost sm" data-act="edit-week" data-f="1.1" data-w="${w.weekNumber}">${esc(t('edit.harder'))}</button>
      <button class="btn ghost sm" data-act="edit-swap" data-w="${w.weekNumber}">${esc(t('edit.swap'))}</button><button class="btn ghost sm" data-act="edit-add" data-w="${w.weekNumber}">${ic('plus')} ${esc(t('edit.add'))}</button></div>
    <div class="edit-bar"><button class="btn ghost sm" data-act="edit-undo" ${userGroups.length ? '' : 'disabled'}>${esc(t('plan.undo'))}</button><button class="btn ghost sm" data-act="edit-restore" ${userGroups.length ? '' : 'disabled'}>${esc(t('edit.restore'))}</button></div></div>`;
}
function userGroupsActive(): string[] {
  const g = new Map<string, number>();
  Object.values(STATE.adjustments || {}).forEach((a: any) => { if (a && a.from_user && !a.undone) g.set(a.group || a.id, Math.max(g.get(a.group || a.id) || 0, a.createdAt || 0)); });
  return [...g.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
export function canUndoGroups(groups:string[]):boolean {
 const extras=Object.values(STATE.customWorkouts||{}).flat() as any[];
 const blocked=Object.values(STATE.adjustments||{}).some((a:any)=>a&&groups.includes(a.group||a.id)&&(STATE.sessions[a.sessionId||a.session?.id]?.completed||extras.some(s=>s.id===(a.sessionId||a.session?.id)&&s.completed!==false)));
 if(blocked)toast('Bereits absolvierte Einheiten bleiben unveraendert.');return !blocked;
}
on('edit-toggle', () => { UI.planEdit = !UI.planEdit; saveUi(); nav.rerender(); });
on('edit-undo', () => {
  const g = userGroupsActive()[0]; if (!g) return;
  if (!canUndoGroups([g])) return;
  Object.values(STATE.adjustments).forEach((a: any) => { if (a && (a.group || a.id) === g) STATE.adjustments[a.id] = { ...a, undone: true }; });
  rebuildPlanIndex(); saveState(); nav.rerender(); toast(t('plan.undone'));
});
on('edit-restore', () => {
  if (!canUndoGroups(userGroupsActive())) return;
  Object.values(STATE.adjustments).forEach((a: any) => { if (a && a.from_user && !a.undone) STATE.adjustments[a.id] = { ...a, undone: true }; });
  rebuildPlanIndex(); saveState(); nav.rerender(); toast(t('edit.restored'));
});

/* ---------- Einheit bearbeiten ---------- */
let SID = '';
const sessionsOn=(d:any)=>[...d.sessions,...(applyCustomPlanAdjustments(STATE.customWorkouts,STATE.adjustments)[d.date]||[]).map((s:any)=>({...s,_custom26:true}))];
const sess=()=>PLAN.weeks.flatMap((w:any)=>w.days.map((d:any)=>({d,s:sessionsOn(d).find((s:any)=>s.id===SID)}))).find((x:any)=>x.s) as {d:any;s:any}|undefined;
const allDayOptions=():[string,string][]=>PLAN.weeks.flatMap((w:any)=>w.days.map((d:any)=>[d.date,'W'+w.weekNumber+' · '+dowShort(d.date)+' '+fmtDate(d.date)] as [string,string]));
function actionPreview(action:PlanAction26,label:string) {
 try {const p=proposePlanAction(PLAN.weeks,STATE,action,uid());previewAdjustments(p.adjustments,label,p.warnings);}
 catch(e){toast((e as Error).message);}
}
function previewAdjustments(adj:any[],label:string,warnings:string[]=[]) {
 PENDING={adj,label,warnings,rule:false};
 openSheet('Aenderung pruefen',()=>'<div class="stack" data-edit-preview>'+adj.map(a=>'<div class="card">'+esc(a.what)+'</div>').join('')+(warnings.length?'<div class="banner warn">'+warnings.map(x=>esc(x)).join('<br>')+'</div>':'')+'<div class="hint">Rueckgaengig im Plan ueber Undo.</div><button class="btn block" data-act="edit-preview-confirm">Aenderung bestaetigen</button><button class="btn ghost block" data-act="edit-cancel">Abbrechen</button></div>');
}
on('edit-preview-confirm',()=>{if(!PENDING)return;const p=PENDING;PENDING=null;propose(p.adj,p.label);});
const INT: [string, string][] = [['easy', 'edit.int.easy'], ['long', 'edit.int.long'], ['tempo', 'edit.int.tempo'], ['intervals', 'edit.int.intervals']];
function weekOf(date: string) { return PLAN.weeks.find((w: any) => w.days.some((d: any) => d.date === date)); }
function editSheet(): string {
  const x = sess(); if (!x) return '';
  const { d, s } = x;
  const w = weekOf(d.date);
  if(s.trainingBlocks) return '<div class="stack" data-edit-sheet><b>'+esc(s.title)+'</b><div class="hint">Dauer, Sportart und Beschreibung werden gemeinsam in den Trainingsbausteinen bearbeitet.</div><button class="btn block" data-act="edit-prescription">Trainingsbausteine bearbeiten</button>'+select('ed-day',t('edit.day'),d.date,allDayOptions())+'<button class="btn ghost block" data-act="edit-move">Verschieben: Vorschau</button><button class="btn ghost block" data-act="edit-session-swap">Einzelne Einheit tauschen</button>'+(!s._custom26?'<button class="btn danger" data-act="edit-del">'+esc(t('edit.delete'))+'</button>':'')+'</div>';
  if(s._custom26) return '<div class="stack"><b>'+esc(s.title)+'</b>'+select('ed-day',t('edit.day'),d.date,allDayOptions())+'<button class="btn block" data-act="edit-move">Verschieben: Vorschau</button><button class="btn ghost block" data-act="edit-session-swap">Einzelne Einheit tauschen</button></div>';
  const kind = s.spec ? (['intervals', 'threshold'].includes(s.spec.kind) ? 'intervals' : s.spec.kind === 'tempo' ? 'tempo' : s.spec.kind === 'long' ? 'long' : 'easy') : 'easy';
  return `<div class="stack" data-edit-sheet><div class="hint">${esc(dowLong(d.date))}, ${fmtDate(d.date)} · ${esc(s.title)}</div>
    <div class="fgrid">${select('ed-day', t('edit.day'), d.date, allDayOptions())}
    ${select('ed-sport', t('common.sport'), s.sport, ['run', 'bike', 'swim', 'strength'].map(k => [k, sportLabel(k)] as [string, string]))}
    ${field('ed-min', t('m.min'), s.plannedMinutes || '', { inputmode: 'numeric' })}
    ${s.sport !== 'strength' ? field('ed-km', s.sport === 'swim' ? t('edit.meters') : t('m.km'), s.plannedKm ? (s.sport === 'swim' ? Math.round(s.plannedKm * 1000) : s.plannedKm) : '', { inputmode: 'decimal' }) : ''}
    ${s.sport === 'run' || s.sport === 'bike' ? select('ed-int', t('edit.intensity'), kind, INT.map(([k, l]) => [k, t(l)] as [string, string])) : ''}</div>
    ${toggle('ed-lock', t('edit.lock'), !!s.locked)}<div class="hint">${esc(t('edit.lockHint'))}</div>
    <button class="btn ghost block" data-act="edit-move">Verschieben: Vorschau</button><button class="btn ghost block" data-act="edit-session-swap">Einzelne Einheit tauschen</button>
    <button class="btn block" data-act="edit-save">${esc(t('common.save'))}</button>
    <button class="btn danger" data-act="edit-del">${esc(t('edit.delete'))}</button></div>`;
}
export function openEdit(id: string) { if (STATE.sessions[id]?.completed) { toast('Diese Einheit ist bereits absolviert.'); return; } SID = id; const x = sess(); if (x) openSheet(t('edit.session'), editSheet); }
on('sess-edit', el => openEdit(el.dataset.sid!));
on('edit-prescription',()=>{const x=sess();if(!x)return;const id=x.s.id,date=x.d.date;void import('./templates').then(m=>m.openSessionPrescriptionEditor(id,date));});
on('edit-move',()=>{const x=sess();if(!x)return;actionPreview({type:'move',sessionId:x.s.id,to:(document.getElementById('ed-day') as HTMLSelectElement).value},t('edit.saved'));});
on('edit-session-swap',()=>{
 const x=sess();if(!x)return;
 const opts:[string,string][]=PLAN.weeks.flatMap((w:any)=>w.days.flatMap((d:any)=>sessionsOn(d).filter((s:any)=>d.date!==x.d.date&&s.sport!=='rest'&&!s.cancelled&&!s.removed&&!s.fixed&&!s.race&&!STATE.sessions[s.id]?.completed&&(!s._custom26||s.completed===false)).map((s:any)=>[s.id,'W'+w.weekNumber+' · '+fmtDate(d.date)+' · '+s.title] as [string,string])));
 if(!opts.length){toast(t('edit.nothing'));return;}
 openSheet('Einzelne Einheiten tauschen',()=>'<div class="stack"><b>'+esc(x.s.title)+'</b>'+select('sw-session','Tauschen mit',opts[0][0],opts)+'<button class="btn block" data-act="edit-session-swap-go">Vorschau</button></div>');
});
on('edit-session-swap-go',()=>actionPreview({type:'swap',sessionId:SID,otherSessionId:(document.getElementById('sw-session') as HTMLSelectElement).value},t('edit.swapped')));

/* Neue Einheit derselben Sportart aus Bausteinen (Text und Zahlen passen zusammen) */
function specFor(sport: string, kind: string, min: number, prev?: any): W.Spec {
  const p = profile(); const today = todayStr();
  const ctx = (prev && prev.spec && prev.spec.ctx && prev.sport === sport) ? prev.spec.ctx : paceCtx(p, false, null, today);
  const m = Math.max(10, min);
  if (sport === 'run') return kind === 'intervals' ? W.scaleSpec(W.runIntervals(ctx, 5, 3, 2, 4), m / 54) : kind === 'tempo' ? W.runTempo(ctx, Math.max(10, m - 25), 3) : kind === 'long' ? W.runLong(ctx, m) : W.runEasy(ctx, m);
  if (sport === 'bike') return kind === 'intervals' ? W.scaleSpec(W.bikeIntervals(ctx, 3, 10, 4, 5), m / 70) : kind === 'tempo' ? W.bikeIntervals(ctx, 2, Math.max(8, Math.round((m - 30) / 2)), 3, 5) : kind === 'long' ? W.bikeLong(ctx, m) : W.bikeEasy(ctx, m);
  if (sport === 'swim') { const base = W.swimSession(ctx, 'endurance', [{ part: 'main', reps: 4, m: 200, zone: 2, mode: (ctx.css ? 'crawl' : 'breast') as any, restSec: 30 }]); return W.scaleSpec(base, m / Math.max(1, W.totals(base).min)); }
  return W.strengthSession(p.sports, { minutes: m });
}
on('edit-save', () => {
  const x = sess(); if (!x) return; const { d, s } = x;
  const v = (id: string) => ((document.getElementById(id) as HTMLInputElement | null)?.value || '').trim();
  if(s.trainingBlocks) { toast('Bitte die Trainingsbausteine bearbeiten.'); return; }
  let numbers:{minutes:number;km:number|null};
  try { numbers=parsePlanNumbers(v('ed-min'),v('ed-km')); } catch(e) { toast((e as Error).message); return; }
  const day = v('ed-day'), sport = v('ed-sport'), min = numbers.minutes, kmRaw = v('ed-km').replace(',', '.'), kind = v('ed-int') || 'easy';
  const lock = !!(document.getElementById('ed-lock') as HTMLInputElement)?.checked;
  const group = uid(); const adj: any[] = [];
  let set: any = {};
  const curKind = s.spec ? (['intervals', 'threshold'].includes(s.spec.kind) ? 'intervals' : s.spec.kind) : 'easy';
  if (sport !== s.sport || (v('ed-int') && kind !== curKind)) {
    const b = W.build(specFor(sport, kind, min, s));
    set = { sport, title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, zone: b.zone || null, hard: !!b.hard, stage: null };
  } else if (min !== s.plannedMinutes || (kmRaw && s.plannedKm && Math.abs(+kmRaw / (s.sport === 'swim' ? 1000 : 1) - s.plannedKm) > 0.01)) {
    const f = min !== s.plannedMinutes ? min / (s.plannedMinutes || min) : (+kmRaw / (s.sport === 'swim' ? 1000 : 1)) / s.plannedKm;
    const rb = W.rebuildScaled(s, f);
    set = rb || { plannedMinutes: min, plannedKm: kmRaw ? +kmRaw / (s.sport === 'swim' ? 1000 : 1) : s.plannedKm };
  }
  if (lock !== !!s.locked) set.locked = lock;
  if (Object.keys(set).length) adj.push({ id: group + '-m', group, type: 'modify', sessionId: s.id, set, what: t('edit.changed', { t: s.title }), reason: t('edit.byYou') });
  if (day && day !== d.date) adj.push({ id: group + '-mv', group, type: 'move', sessionId: s.id, from: d.date, to: day, what: t('edit.moved', { t: s.title, d: `${dowShort(day)} ${fmtDate(day)}` }), reason: t('edit.byYou') });
  if (!adj.length) { closeSheet(); return; }
  if(adj.some(a=>a.type==='move')) previewAdjustments(adj,t('edit.saved')); else propose(adj,t('edit.saved'));
});
on('edit-del', () => {
  const x = sess(); if (!x) return; const group = uid();
  propose([{ id: group + '-c', group, type: 'cancel', removed: true, sessionId: x.s.id, what: t('edit.deleted', { t: x.s.title }), reason: t('edit.byYou') }], t('edit.deletedToast'));
});

/* ---------- Woche ---------- */
on('edit-week', el => {
  const w = PLAN.weeks.find((x: any) => x.weekNumber === +el.dataset.w!); if (!w) return;
  const f = +el.dataset.f!; const group = uid(); const adj: any[] = [];
  w.days.forEach((d: any) => d.sessions.forEach((s: any) => {
    if (s.trainingBlocks || STATE.sessions[s.id]?.completed || s.sport === 'rest' || s.cancelled || s.fixed || s.race || s.locked || d.date < todayStr()) return;
    const rb = W.rebuildScaled(s, f);
    adj.push({ id: `${group}-${s.id}`, group, type: 'modify', sessionId: s.id, set: rb || { plannedMinutes: Math.max(5, Math.round((s.plannedMinutes || 0) * f / 5) * 5) }, what: `${s.title} ${f > 1 ? '+' : '−'}10 %`, reason: t('edit.byYou') });
  }));
  if (!adj.length) { toast(t('edit.nothing')); return; }
  propose(adj, f > 1 ? t('edit.harderDone') : t('edit.easierDone'));
});
on('edit-swap', el => {
 const opts=allDayOptions();if(opts.length<2){toast(t('edit.nothing'));return;}
 const w=PLAN.weeks.find((x:any)=>x.weekNumber===+el.dataset.w!);const first=w?.days[0]?.date||opts[0][0];
 openSheet(t('edit.swap'),()=>'<div class="stack"><div class="fgrid">'+select('sw-a',t('edit.dayA'),first,opts)+select('sw-b',t('edit.dayB'),opts.find(x=>x[0]!==first)![0],opts)+'</div><button class="btn block" data-act="edit-swap-go">Vorschau</button></div>');
});
on('edit-swap-go',()=>actionPreview({type:'swapDays',from:(document.getElementById('sw-a') as HTMLSelectElement).value,to:(document.getElementById('sw-b') as HTMLSelectElement).value},t('edit.swapped')));
let ADD_W = 0;
on('edit-add', el => {
  ADD_W = +el.dataset.w!; const w = PLAN.weeks.find((x: any) => x.weekNumber === ADD_W); if (!w) return;
  const opts = w.days.map((d: any) => [d.date, `${dowShort(d.date)} ${fmtDate(d.date)}`] as [string, string]);
  const first = (w.days.find((d: any) => d.date >= todayStr()) || w.days[0]).date;
  openSheet(t('edit.add'), () => `<div class="stack"><div class="fgrid">${select('ad-day', t('edit.day'), first, opts)}${select('ad-sport', t('common.sport'), 'run', ['run', 'bike', 'swim', 'strength'].map(k => [k, sportLabel(k)] as [string, string]))}
    ${field('ad-min', t('m.min'), '40', { inputmode: 'numeric' })}${select('ad-int', t('edit.intensity'), 'easy', INT.map(([k, l]) => [k, t(l)] as [string, string]))}</div><button class="btn block" data-act="edit-add-go">${esc(t('edit.add'))}</button></div>`);
});
on('edit-add-go', () => {
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  let numbers:{minutes:number;km:number|null};
  try { numbers=parsePlanNumbers(v('ad-min')); } catch(e) { toast((e as Error).message); return; }
  const b = W.build(specFor(v('ad-sport'), v('ad-int'), numbers.minutes));
  const group = uid(); const id = 'u-' + Date.now();
  propose([{ id: group + '-a', group, type: 'add', to: v('ad-day'), session: { id, ...b }, what: t('edit.added', { t: b.title }), reason: t('edit.byYou') }], t('edit.addedToast'));
});
onChange('ed-noop', () => {});
void refreshSheet; void STATE;
