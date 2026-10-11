/* Start ohne Daten und Fragebogen (Onboarding): Blöcke mit Fortschritt, überspringbar, Vorbefüllung aus verbundenen Daten,
   Pflichtfragen mit *, am Ende Plan-Vorschau mit Zusammenfassung in 5 Sätzen. */
import { STATE, HAS_PLAN, PLAN_KEY, readPlan, saveState, profile, saveProfile } from '../store';
import { esc, todayStr, parseNum } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, ic, field, select, toggle, armed, more, sportLabel } from '../kit';
import { BLOCKS, visibleQuestions, missingRequired, progress, prefillFromData, applyOnboarding, type Answers, type Question } from '../../../shared/onboarding';
import { GOALS, type GoalType } from '../../../shared/goals';
import { transitionPlan } from '../../../shared/plangen';
import { goalAllowed } from '../../../shared/rules';
import { parseBackupText, isBackup, isPlan, applyBackup } from '../backup';
import { connectPanel, installSteps } from './daten';
import { isIOS, isStandalone } from './einstellungen';
import { goalLabel } from './profil';
import { D, invalidate } from '../data';
import { APP } from '../config';
import { nav } from '../nav';
import { toast } from '../toast';

const DOW = [1, 2, 3, 4, 5, 6, 0];
const draft = (): { answers: Answers; block: number; done?: boolean } => (STATE.onboarding = STATE.onboarding || { answers: {}, block: 0 });

/* ---------- Start (noch kein Plan) ---------- */
export function renderWelcome(): string {
  const needInstall = isIOS() && !isStandalone();
  return `<div class="welcome stack">
    <div style="text-align:center;margin:var(--s4) 0 var(--s2)"><img src="icons/icon-192.png" alt="" width="72" height="72" style="border-radius:18px"><h1 style="margin:var(--s2) 0 4px">${esc(APP.name)}</h1><div class="muted">${esc(t('welcome.tagline'))}</div></div>
    ${needInstall ? `<div class="card stack"><div class="lbl">${esc(t('welcome.step1'))}</div><div class="hint">${esc(t('welcome.installFirst'))}</div>${installSteps()}</div>` : ''}
    <div class="card stack"><div class="lbl">${esc(t('welcome.newTitle'))}</div><div class="hint">${esc(t('welcome.newHint'))}</div><button class="btn block" data-act="ob-start">${ic('wand')} ${esc(t('welcome.newBtn'))}</button></div>
    <div class="card stack"><div class="lbl">${esc(t('welcome.haveTitle'))}</div>${connectPanel()}</div>
    <div class="card">${more(t('welcome.backupTitle'), `<div class="hint">${esc(t('welcome.backupHint'))}</div><textarea class="inp" id="bk-in" rows="3" placeholder="${esc(t('data.restorePh'))}" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea>
      <div class="row"><button class="btn" data-act="welcome-load">${esc(t('welcome.load'))}</button><label class="btn ghost" for="bk-file">${esc(t('data.pickFile'))}</label><input type="file" id="bk-file" data-ch="bk-file" accept="application/json,.json,.txt,text/plain" hidden></div>`)}</div>
    <div class="hint" style="text-align:center">${esc(t('welcome.privacy'))}</div></div>`;
}
on('welcome-load', () => {
  const raw = ((document.getElementById('bk-in') as HTMLTextAreaElement)?.value || '').trim();
  if (!raw) { toast(t('data.restoreEmpty')); return; }
  let data: any; try { data = parseBackupText(raw); } catch (e) { toast(t('data.restoreInvalid')); return; }
  if (!isBackup(data)) { toast(t('data.restoreNoBackup')); return; }
  if (!isPlan(data.plan)) { toast(t('welcome.noPlanInBackup')); return; }
  applyBackup(data);
});
on('ob-start', () => { const d = draft(); if (!Object.keys(d.answers).length) d.answers = { ...prefillFromData(D().activities, STATE.trend, todayStr()), ...fromProfile() }; d.block = 0; d.done = false; saveState(); nav.go('mehr:onboarding'); });

/* Bekanntes aus dem Profil übernehmen (beim erneuten Durchlaufen) */
function fromProfile(): Answers {
  if (!STATE.profile) return {};
  const p = profile(); const a: Answers = { ...(p.answers || {}) };
  if (p.birthYear) a.birthYear = p.birthYear; if (p.heightCm) a.heightCm = p.heightCm; if (p.weightKg) a.weightKg = p.weightKg;
  if (p.sex) a.sex = p.sex; a.sports = p.sports; a.weeklyHours = p.weeklyHours; a.maxDayHours = p.maxDayHours;
  if (Object.keys(p.availability || {}).length) a.windows = p.availability; if (p.fixed && p.fixed.length) a.fixed = p.fixed;
  if (a.injuries == null) a.injuries = p.injuries || '';
  a.goals = D().goals.filter(g => !g.result).map(g => ({ id: g.id, type: g.type, name: g.name, date: g.date, priority: g.priority }));
  return a;
}

/* ---------- Fragebogen ---------- */
export function renderOnboarding(): string {
  const d = draft();
  if (!Object.keys(d.answers).length) d.answers = { ...prefillFromData(D().activities, STATE.trend, todayStr()), ...fromProfile() };
  if (d.done) return summary();
  const b = BLOCKS[Math.min(d.block, BLOCKS.length - 1)];
  const a = d.answers;
  const pct = progress(a);
  return `<div class="stack ob">
    <div class="spread"><span class="lbl">${esc(t('ob.block', { i: d.block + 1, n: BLOCKS.length }))}</span><span class="xs muted">${esc(t('ob.progress', { p: pct }))}</span></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <div class="ob-block" data-block="${esc(b.id)}"><h2 style="margin:var(--s3) 0 2px">${esc(b.title)}</h2><div class="hint">${esc(b.intro)}</div></div>
    <div class="card stack">${visibleQuestions(b, a).map(q => question(q, a)).join('')}</div>
    <div class="hint">${esc(t('ob.requiredHint'))}</div>
    <div class="row" style="justify-content:space-between">
      ${d.block > 0 ? `<button class="btn ghost" data-act="ob-back">${ic('back')} ${esc(t('common.back'))}</button>` : '<span></span>'}
      <span class="row" style="gap:8px"><button class="btn ghost" data-act="ob-skip">${esc(t('ob.skip'))}</button><button class="btn" data-act="ob-next">${esc(d.block === BLOCKS.length - 1 ? t('ob.finish') : t('common.next'))}</button></span></div>
    <div class="row" style="justify-content:center;gap:6px">${BLOCKS.map((x, i) => `<button class="chip ${i === d.block ? 'on' : ''}" data-act="ob-jump" data-i="${i}" aria-label="${esc(x.title)}">${i + 1}</button>`).join('')}</div></div>`;
}
const star = (q: Question) => q.required ? ' *' : '';
function question(q: Question, a: Answers): string {
  const v = a[q.id]; const lab = esc(q.label) + star(q) + (q.unit ? ` <span class="muted">(${esc(q.unit)})</span>` : '');
  const hint = q.hint ? `<div class="hint">${esc(q.hint)}</div>` : '';
  const pre = (D().activities.length && ['weeklyHoursNow', 'sports', 'longest', 'swimContinuous', 'sleep'].includes(q.id) && v != null) ? ` <span class="pill">${esc(t('ob.prefilled'))}</span>` : '';
  switch (q.type) {
    case 'number': case 'text':
      return `<div class="fld wide"><label for="q-${q.id}">${lab}${pre}</label><input class="inp" id="q-${q.id}" ${q.type === 'number' ? 'inputmode="decimal"' : ''} data-ch="ob-q" data-q="${q.id}" data-t="${q.type}" value="${esc(v ?? '')}"></div>${hint}`;
    case 'select':
      return `<div class="fld wide"><label for="q-${q.id}">${lab}</label><select class="inp" id="q-${q.id}" data-ch="ob-q" data-q="${q.id}">${(q.options || []).map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>${hint}`;
    case 'yesno':
      return `<div class="fld wide"><span class="lab">${lab}</span><div class="seg">${[['1', t('common.yes')], ['0', t('common.no')]].map(([k, l]) => `<button class="${(v === true && k === '1') || (v === false && k === '0') ? 'on' : ''}" data-act="ob-yn" data-q="${q.id}" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>${hint}`;
    case 'multi':
      return `<div class="fld wide"><span class="lab">${lab}${pre}</span><div class="chips">${(q.options || []).map(([k, l]) => { const on = Array.isArray(v) && v.includes(k); return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="ob-multi" data-q="${q.id}" data-v="${esc(k)}">${esc(l)}</button>`; }).join('')}</div></div>${hint}`;
    case 'goals': return goalsQ(q, a) + hint;
    case 'windows': return windowsQ(q, a) + hint;
    case 'fixed': return fixedQ(q, a) + hint;
    case 'connect': return `<div class="fld wide"><span class="lab">${lab}</span><button class="btn ghost" data-act="go-sub" data-sub="verbindungen">${ic('link')} ${esc(t('ob.toConnections'))}</button></div>${hint}`;
    default: return `<div class="hint">${lab}</div>`;
  }
}
function goalsQ(q: Question, a: Answers): string {
  const list: any[] = Array.isArray(a.goals) ? a.goals : [];
  const age = parseNum(a.birthYear) ? +todayStr().slice(0, 4) - +a.birthYear : null;
  return `<div class="fld wide"><span class="lab">${esc(q.label)}${star(q)}</span>${list.map((g, i) => { const al = goalAllowed(g.type, age); return `<div class="card flat tight stack" data-gi="${i}">
      <div class="fgrid">${select('og-type-' + i, t('goal.type'), g.type, (Object.keys(GOALS) as GoalType[]).map(k => [k, goalLabel(k)] as [string, string]), `data-ch="ob-goal" data-k="type" data-i="${i}"`)}
      ${field('og-date-' + i, t('goal.date'), g.date || '', { type: 'date', data: `data-ch="ob-goal" data-k="date" data-i="${i}"` })}
      ${select('og-prio-' + i, t('goal.priority'), g.priority || (i ? 'B' : 'A'), [['A', t('goal.prioA')], ['B', t('goal.prioB')], ['C', t('goal.prioC')]], `data-ch="ob-goal" data-k="priority" data-i="${i}"`)}
      ${field('og-name-' + i, t('goal.name'), g.name || '', { placeholder: goalLabel(g.type), data: `data-ch="ob-goal" data-k="name" data-i="${i}"` })}</div>
      ${!al.ok ? `<div class="banner warn">${esc(al.msg || '')}</div>` : ''}<button class="link" data-act="ob-goal-del" data-i="${i}">${esc(t('common.remove'))}</button></div>`; }).join('')}
    <button class="btn ghost" data-act="ob-goal-add">${ic('plus')} ${esc(t('ob.addGoal'))}</button></div>`;
}
function windowsQ(q: Question, a: Answers): string {
  const w: Record<number, { from: string; to: string }[]> = a.windows || {};
  return `<div class="fld wide"><span class="lab">${esc(q.label)}${star(q)}</span><div class="stack">${DOW.map(d => `<div class="row" style="gap:6px;align-items:center"><span style="width:28px" class="small"><b>${esc(t('dow.' + d))}</b></span>
      ${(w[d] || []).map((x, i) => `<span class="row" style="gap:4px"><input class="inp sm" type="time" value="${esc(x.from)}" data-ch="ob-win" data-d="${d}" data-i="${i}" data-k="from" aria-label="${esc(t('ob.from'))}">–<input class="inp sm" type="time" value="${esc(x.to)}" data-ch="ob-win" data-d="${d}" data-i="${i}" data-k="to" aria-label="${esc(t('ob.to'))}"><button class="icon-btn" data-act="ob-win-del" data-d="${d}" data-i="${i}" aria-label="${esc(t('common.remove'))}">${ic('close')}</button></span>`).join('')}
      <button class="icon-btn" data-act="ob-win-add" data-d="${d}" aria-label="${esc(t('ob.addWindow'))}">${ic('plus')}</button></div>`).join('')}</div></div>`;
}
function fixedQ(q: Question, a: Answers): string {
  const list: any[] = Array.isArray(a.fixed) ? a.fixed : [];
  const sports = ['football', 'run', 'bike', 'swim', 'strength'].map(s => [s, sportLabel(s)] as [string, string]);
  return `<div class="fld wide"><span class="lab">${esc(q.label)}</span>${list.map((f, i) => `<div class="card flat tight"><div class="fgrid">
      ${select('of-dow-' + i, t('ob.weekday'), String(f.dow), DOW.map(d => [String(d), t('dow.' + d)] as [string, string]), `data-ch="ob-fix" data-k="dow" data-i="${i}"`)}
      ${select('of-sport-' + i, t('common.sport'), f.sport, sports, `data-ch="ob-fix" data-k="sport" data-i="${i}"`)}
      ${field('of-title-' + i, t('common.title'), f.title || '', { data: `data-ch="ob-fix" data-k="title" data-i="${i}"` })}
      ${field('of-time-' + i, t('ob.time'), f.time || '', { type: 'time', data: `data-ch="ob-fix" data-k="time" data-i="${i}"` })}
      ${field('of-min-' + i, t('m.min'), f.minutes || '', { inputmode: 'numeric', data: `data-ch="ob-fix" data-k="minutes" data-i="${i}"` })}</div>
      ${toggle('of-hard-' + i, t('ob.hard'), !!f.hard, `data-ch="ob-fix" data-k="hard" data-i="${i}"`)}<button class="link" data-act="ob-fix-del" data-i="${i}">${esc(t('common.remove'))}</button></div>`).join('')}
    <button class="btn ghost" data-act="ob-fix-add">${ic('plus')} ${esc(t('ob.addFixed'))}</button></div>`;
}

/* ---------- Ende: Plan-Vorschau ---------- */
let RESULT: ReturnType<typeof applyOnboarding> | null = null;
function summary(): string {
  const a = draft().answers;
  const miss = missingRequired(a);
  if (miss.length) return `<div class="card stack"><div class="lbl">${esc(t('ob.missingTitle'))}</div><ul class="small" style="padding-left:18px;margin:0">${miss.map(m => `<li><button class="link" data-act="ob-jump" data-i="${BLOCKS.findIndex(b => b.id === m.block)}">${esc(m.q.label)}</button></li>`).join('')}</ul></div>`;
  RESULT = applyOnboarding(a, todayStr(), STATE.profile ? profile() : undefined);
  const g = RESULT.gen;
  return `<div class="stack"><h2 style="margin:var(--s2) 0 0">${esc(t('ob.planTitle'))}</h2>
    ${RESULT.warnings.map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
    ${g ? `<div class="card stack"><div class="lbl">${esc(t('ob.summary'))}</div>${g.summary.map(s => `<p class="small" style="margin:0">${esc(s)}</p>`).join('')}</div>
      <div class="card"><div class="lbl">${esc(t('ob.phases'))}</div>${g.phases.map(p => `<div class="kv"><span>${esc(t('phase.' + p.phase))}</span><span class="muted small">${esc(p.from)} – ${esc(p.to)} · ${p.weeks} ${esc(t('ob.weeks'))}</span></div>`).join('')}</div>
      ${more(t('ob.firstWeeks'), g.plan.weeks.slice(0, 2).map((w: any) => `<div class="lbl" style="margin-top:var(--s2)">${esc(t('plan.weekShort', { n: w.weekNumber }))} · ${esc(w.focus || '')}</div>${w.days.map((d: any) => `<div class="kv small"><span>${esc(t('dow.' + new Date(d.date + 'T12:00:00').getDay()))}</span><span>${esc(d.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => s.title + (s.plannedMinutes ? ` (${s.plannedMinutes} min)` : '')).join(', ') || t('heute.restDay'))}</span></div>`).join('')}`).join(''))}
      ${g.violations.filter(v => v.rule !== 'age').length ? `<div class="hint">${esc(t('ob.checked', { n: g.violations.length }))}</div>` : `<div class="hint">${esc(t('ob.rulesOk'))}</div>`}`
      : `<div class="card"><div class="hint">${esc(t('ob.noGoal'))}</div></div>`}
    <button class="btn block" data-act="ob-apply">${esc(g ? (HAS_PLAN ? t('ob.applyReplace') : t('ob.apply')) : t('ob.saveProfile'))}</button>
    <button class="btn ghost" data-act="ob-edit">${esc(t('ob.edit'))}</button></div>`;
}

/* ---------- Aktionen ---------- */
const A = () => draft().answers;
const redraw = () => { saveState(); nav.rerender(); };
on('ob-next', () => { const d = draft(); if (d.block >= BLOCKS.length - 1) d.done = true; else d.block++; saveState(); nav.rerender(); window.scrollTo(0, 0); });
on('ob-skip', () => { const d = draft(); if (d.block >= BLOCKS.length - 1) d.done = true; else d.block++; saveState(); nav.rerender(); window.scrollTo(0, 0); });
on('ob-back', () => { const d = draft(); d.block = Math.max(0, d.block - 1); saveState(); nav.rerender(); window.scrollTo(0, 0); });
on('ob-jump', el => { const d = draft(); d.block = +el.dataset.i!; d.done = false; saveState(); nav.rerender(); window.scrollTo(0, 0); });
on('ob-edit', () => { const d = draft(); d.done = false; d.block = 0; saveState(); nav.rerender(); });
onChange('ob-q', el => { const v = (el as HTMLInputElement).value; const a = A(); a[el.dataset.q!] = el.dataset.t === 'number' ? parseNum(v) : v; saveState(); if (el.tagName === 'SELECT') nav.rerender(); });
on('ob-yn', el => { A()[el.dataset.q!] = el.dataset.v === '1'; redraw(); });
on('ob-multi', el => { const a = A(); const k = el.dataset.q!; const cur: string[] = Array.isArray(a[k]) ? a[k] : []; a[k] = cur.includes(el.dataset.v!) ? cur.filter(x => x !== el.dataset.v) : [...cur, el.dataset.v!]; redraw(); });
on('ob-goal-add', () => { const a = A(); a.goals = [...(a.goals || []), { id: 'goal-' + Date.now(), type: 'run_10k', name: '', date: '', priority: (a.goals || []).length ? 'B' : 'A' }]; redraw(); });
on('ob-goal-del', el => { const a = A(); a.goals = (a.goals || []).filter((_: any, i: number) => i !== +el.dataset.i!); redraw(); });
onChange('ob-goal', el => { const a = A(); const g = (a.goals || [])[+el.dataset.i!]; if (!g) return; g[el.dataset.k!] = (el as HTMLInputElement).value; if (el.dataset.k === 'type' && !g.name) g.name = ''; redraw(); });
on('ob-win-add', el => { const a = A(); const d = +el.dataset.d!; const w = { ...(a.windows || {}) }; w[d] = [...(w[d] || []), { from: d === 0 || d === 6 ? '09:00' : '17:00', to: d === 0 || d === 6 ? '11:00' : '18:30' }]; a.windows = w; redraw(); });
on('ob-win-del', el => { const a = A(); const d = +el.dataset.d!; const w = { ...(a.windows || {}) }; w[d] = (w[d] || []).filter((_: any, i: number) => i !== +el.dataset.i!); if (!w[d].length) delete w[d]; a.windows = w; redraw(); });
onChange('ob-win', el => { const a = A(); const w = a.windows || {}; const x = (w[+el.dataset.d!] || [])[+el.dataset.i!]; if (x) x[el.dataset.k!] = (el as HTMLInputElement).value; saveState(); });
on('ob-fix-add', () => { const a = A(); a.fixed = [...(a.fixed || []), { id: 'fix-' + Date.now(), dow: 3, sport: 'football', title: t('ob.fixedDefault'), time: '18:00', minutes: 90, hard: true }]; redraw(); });
on('ob-fix-del', el => { const a = A(); a.fixed = (a.fixed || []).filter((_: any, i: number) => i !== +el.dataset.i!); redraw(); });
onChange('ob-fix', el => {
  const f = (A().fixed || [])[+el.dataset.i!]; if (!f) return; const k = el.dataset.k!; const inp = el as HTMLInputElement;
  f[k] = k === 'hard' ? inp.checked : k === 'dow' || k === 'minutes' ? +inp.value || 0 : inp.value; saveState();
});
on('ob-apply', el => {
  if (!RESULT) return;
  if (HAS_PLAN && RESULT.gen && !armed(el, t('ob.applySure'))) return;
  const r = RESULT;
  saveProfile({ ...r.profile, sports: r.profile.sports });
  if (r.goals.length) { const next: any = {}; Object.values(STATE.goals || {}).forEach((g: any) => { if (g && g.result) next[g.id] = g; }); r.goals.forEach(g => { next[g.id] = { ...g, createdAt: Date.now() }; }); STATE.goals = next; }
  draft().done = false; draft().block = 0; delete STATE.onboarding;
  saveState(); invalidate();
  if (!r.gen) { toast(t('common.saved')); nav.go('mehr:profil'); return; }
  const old = readPlan();
  try {
    if (old) localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old));
    const plan = old ? transitionPlan(old, r.gen.plan, todayStr()) : r.gen.plan;
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch (e) { toast(t('common.storageFull')); return; }
  toast(t('ob.applied'));
  setTimeout(() => { location.href = location.pathname + '?go=heute'; }, 700);
});
void esc; void saveProfile;
