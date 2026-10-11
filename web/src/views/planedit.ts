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
import { isMinor } from '../../../shared/profile';
import { nav } from '../nav';
import { toast } from '../toast';

export const editing = () => !!UI.planEdit;
const uid = () => 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

/* ---------- Prüfung: welche Hinweise kommen durch die Änderung neu dazu? ---------- */
function issuesOf(adjustments: any): string[] {
  const weeks = C.applyAdjustments(BASE_WEEKS, adjustments);
  const today = todayStr();
  const fut = weeks.filter((w: any) => w.endDate >= today);
  const p = profile();
  const out = [
    ...validateWeeks(fut, { minor: isMinor(p, today) }).map(v => v.msg),
    ...checkPlan(fut, p, goals(), today).filter(i => i.rule === 'dayTime' || i.rule === 'teamSport' || (i.rule === 'strength' && /harten Tag/.test(i.msg))).map(i => i.msg)
  ];
  return [...new Set(out)];
}
let PENDING: { adj: any[]; warnings: string[]; label: string } | null = null;
/* Änderung vorschlagen: ohne neue Hinweise sofort übernehmen, sonst freundlich nachfragen */
function propose(adj: any[], label: string) {
  const before = new Set(issuesOf(STATE.adjustments));
  const after = issuesOf({ ...STATE.adjustments, ...Object.fromEntries(adj.map(a => [a.id, a])) });
  const fresh = after.filter(x => !before.has(x));
  if (!fresh.length) { commit(adj, label); return; }
  PENDING = { adj, warnings: fresh, label };
  openSheet(t('edit.checkTitle'), () => `<div class="stack" data-edit-warn><div class="banner warn">${fresh.slice(0, 4).map(w => esc(friendly(w))).join('<br>')}</div><div class="hint">${esc(t('edit.checkHint'))}</div>
    <button class="btn block" data-act="edit-anyway">${esc(t('edit.anyway'))}</button><button class="btn ghost block" data-act="edit-cancel">${esc(t('common.cancel'))}</button></div>`);
}
function friendly(msg: string): string {
  if (/beide hart/.test(msg)) return t('edit.w.hard', { msg });
  if (/% mehr|steigt um/.test(msg)) return t('edit.w.volume', { msg });
  return msg;
}
function commit(adj: any[], label: string) {
  const now = Date.now();
  adj.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: todayStr(), from_user: true }; });
  rebuildPlanIndex(); saveState(); closeSheet(); nav.rerender(); toast(label);
}
on('edit-anyway', () => { if (!PENDING) return; const p = PENDING; PENDING = null; commit(p.adj, p.label); });
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
on('edit-toggle', () => { UI.planEdit = !UI.planEdit; saveUi(); nav.rerender(); });
on('edit-undo', () => {
  const g = userGroupsActive()[0]; if (!g) return;
  Object.values(STATE.adjustments).forEach((a: any) => { if (a && (a.group || a.id) === g) STATE.adjustments[a.id] = { ...a, undone: true }; });
  rebuildPlanIndex(); saveState(); nav.rerender(); toast(t('plan.undone'));
});
on('edit-restore', () => {
  Object.values(STATE.adjustments).forEach((a: any) => { if (a && a.from_user && !a.undone) STATE.adjustments[a.id] = { ...a, undone: true }; });
  rebuildPlanIndex(); saveState(); nav.rerender(); toast(t('edit.restored'));
});

/* ---------- Einheit bearbeiten ---------- */
let SID = '';
const sess = () => PLAN.weeks.flatMap((w: any) => w.days.map((d: any) => ({ d, s: d.sessions.find((x: any) => x.id === SID) }))).find((x: any) => x.s) as { d: any; s: any } | undefined;
const INT: [string, string][] = [['easy', 'edit.int.easy'], ['long', 'edit.int.long'], ['tempo', 'edit.int.tempo'], ['intervals', 'edit.int.intervals']];
function weekOf(date: string) { return PLAN.weeks.find((w: any) => w.days.some((d: any) => d.date === date)); }
function editSheet(): string {
  const x = sess(); if (!x) return '';
  const { d, s } = x;
  const w = weekOf(d.date);
  const kind = s.spec ? (['intervals', 'threshold'].includes(s.spec.kind) ? 'intervals' : s.spec.kind === 'tempo' ? 'tempo' : s.spec.kind === 'long' ? 'long' : 'easy') : 'easy';
  return `<div class="stack" data-edit-sheet><div class="hint">${esc(dowLong(d.date))}, ${fmtDate(d.date)} · ${esc(s.title)}</div>
    <div class="fgrid">${select('ed-day', t('edit.day'), d.date, w.days.map((x: any) => [x.date, `${dowShort(x.date)} ${fmtDate(x.date)}`] as [string, string]))}
    ${select('ed-sport', t('common.sport'), s.sport, ['run', 'bike', 'swim', 'strength'].map(k => [k, sportLabel(k)] as [string, string]))}
    ${field('ed-min', t('m.min'), s.plannedMinutes || '', { inputmode: 'numeric' })}
    ${s.sport !== 'strength' ? field('ed-km', s.sport === 'swim' ? t('edit.meters') : t('m.km'), s.plannedKm ? (s.sport === 'swim' ? Math.round(s.plannedKm * 1000) : s.plannedKm) : '', { inputmode: 'decimal' }) : ''}
    ${s.sport === 'run' || s.sport === 'bike' ? select('ed-int', t('edit.intensity'), kind, INT.map(([k, l]) => [k, t(l)] as [string, string])) : ''}</div>
    ${toggle('ed-lock', t('edit.lock'), !!s.locked)}<div class="hint">${esc(t('edit.lockHint'))}</div>
    <button class="btn block" data-act="edit-save">${esc(t('common.save'))}</button>
    <button class="btn danger" data-act="edit-del">${esc(t('edit.delete'))}</button></div>`;
}
export function openEdit(id: string) { SID = id; const x = sess(); if (x) openSheet(t('edit.session'), editSheet); }
on('sess-edit', el => openEdit(el.dataset.sid!));

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
  const day = v('ed-day'), sport = v('ed-sport'), min = +v('ed-min') || s.plannedMinutes || 30, kmRaw = v('ed-km').replace(',', '.'), kind = v('ed-int') || 'easy';
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
  propose(adj, t('edit.saved'));
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
    if (s.sport === 'rest' || s.cancelled || s.fixed || s.race || s.locked || d.date < todayStr()) return;
    const rb = W.rebuildScaled(s, f);
    adj.push({ id: `${group}-${s.id}`, group, type: 'modify', sessionId: s.id, set: rb || { plannedMinutes: Math.max(5, Math.round((s.plannedMinutes || 0) * f / 5) * 5) }, what: `${s.title} ${f > 1 ? '+' : '−'}10 %`, reason: t('edit.byYou') });
  }));
  if (!adj.length) { toast(t('edit.nothing')); return; }
  propose(adj, f > 1 ? t('edit.harderDone') : t('edit.easierDone'));
});
let SWAP_W = 0;
on('edit-swap', el => {
  SWAP_W = +el.dataset.w!; const w = PLAN.weeks.find((x: any) => x.weekNumber === SWAP_W); if (!w) return;
  const opts = w.days.filter((d: any) => d.date >= todayStr()).map((d: any) => [d.date, `${dowShort(d.date)} ${fmtDate(d.date)}`] as [string, string]);
  if (opts.length < 2) { toast(t('edit.nothing')); return; }
  openSheet(t('edit.swap'), () => `<div class="stack"><div class="fgrid">${select('sw-a', t('edit.dayA'), opts[0][0], opts)}${select('sw-b', t('edit.dayB'), opts[1][0], opts)}</div><button class="btn block" data-act="edit-swap-go">${esc(t('edit.swapGo'))}</button></div>`);
});
on('edit-swap-go', () => {
  const a = (document.getElementById('sw-a') as HTMLSelectElement).value, b = (document.getElementById('sw-b') as HTMLSelectElement).value;
  if (a === b) { toast(t('edit.sameDay')); return; }
  const w = PLAN.weeks.find((x: any) => x.weekNumber === SWAP_W); const group = uid(); const adj: any[] = [];
  const day = (dt: string) => w.days.find((d: any) => d.date === dt);
  day(a).sessions.filter((s: any) => s.sport !== 'rest' && !s.fixed && !s.race).forEach((s: any) => adj.push({ id: `${group}-${s.id}`, group, type: 'move', sessionId: s.id, from: a, to: b, what: t('edit.moved', { t: s.title, d: `${dowShort(b)} ${fmtDate(b)}` }), reason: t('edit.byYou') }));
  day(b).sessions.filter((s: any) => s.sport !== 'rest' && !s.fixed && !s.race).forEach((s: any) => adj.push({ id: `${group}-${s.id}`, group, type: 'move', sessionId: s.id, from: b, to: a, what: t('edit.moved', { t: s.title, d: `${dowShort(a)} ${fmtDate(a)}` }), reason: t('edit.byYou') }));
  if (!adj.length) { toast(t('edit.nothing')); return; }
  propose(adj, t('edit.swapped'));
});
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
  const b = W.build(specFor(v('ad-sport'), v('ad-int'), +v('ad-min') || 40));
  const group = uid(); const id = 'u-' + Date.now();
  propose([{ id: group + '-a', group, type: 'add', to: v('ad-day'), session: { id, ...b }, what: t('edit.added', { t: b.title }), reason: t('edit.byYou') }], t('edit.addedToast'));
});
onChange('ed-noop', () => {});
void refreshSheet; void STATE;
