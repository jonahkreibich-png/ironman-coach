/* Start ohne Daten und Fragebogen (Onboarding): Blöcke mit Fortschritt, überspringbar, Vorbefüllung aus verbundenen Daten,
   Pflichtfragen mit *. Am Ende „Das habe ich verstanden“ mit „Ändern“ (F2), erst dann wird der Plan gebaut.
   Auftrag 4: Zeit pro Tag statt Uhrzeiten, Häufigkeit je Sportart, Teamsport, Wunschzeit je Ziel mit Realismus-Check,
   Können, Fahrrad-Typen, Berücksichtigungen, Zeitfelder mit getrennten Min/Sek-Feldern. */
import { STATE, HAS_PLAN, PLAN_KEY, readPlan, saveState, profile, saveProfile } from '../store';
import { esc, todayStr, parseNum } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, ic, field, select, armed, more, sportLabel, timeField, readTime } from '../kit';
import { BLOCKS, visibleQuestions, missingRequired, progress, prefillFromData, applyOnboarding, profileFromAnswers, understood, availableDays, goalTarget, DAYLOAD_OPTIONS, type Answers, type Question } from '../../../shared/onboarding';
import { GOALS, type GoalType } from '../../../shared/goals';
import { transitionPlan } from '../../../shared/plangen';
import { goalAllowed } from '../../../shared/rules';
import { realism } from '../../../shared/goalcheck';
import { parseBackupText, isBackup, isPlan, applyBackup } from '../backup';
import { connectPanel, installSteps } from './daten';
import { connectList } from './verbindungen';
import { isSyncOn, syncNow, isAdmin } from '../sync';
import { isIOS, isStandalone } from './einstellungen';
import { goalLabel } from './profil';
import { D, invalidate } from '../data';
import { APP } from '../config';
import { nav } from '../nav';
import { toast } from '../toast';

const DOW = [1, 2, 3, 4, 5, 6, 0];
const draft = (): { answers: Answers; block: number; done?: boolean; confirmed?: boolean } => (STATE.onboarding = STATE.onboarding || { answers: {}, block: 0 });

/* ---------- Start (noch kein Plan) ---------- */
export function renderWelcome(): string {
  const needInstall = isIOS() && !isStandalone();
  const d = STATE.onboarding;
  return `<div class="welcome stack">
    <div style="text-align:center;margin:var(--s4) 0 var(--s2)"><img src="icons/icon-192.png" alt="" width="72" height="72" style="border-radius:18px"><h1 style="margin:var(--s2) 0 4px">${esc(APP.name)}</h1><div class="muted">${esc(t('welcome.tagline'))}</div></div>
    ${needInstall ? `<div class="card stack"><div class="lbl">${esc(t('welcome.step1'))}</div><div class="hint">${esc(t('welcome.installFirst'))}</div>${installSteps()}</div>` : ''}
    <div class="card stack"><div class="lbl">${esc(t('welcome.newTitle'))}</div><div class="hint">${esc(t('welcome.newHint'))}</div><button class="btn block" data-act="ob-start">${ic('wand')} ${esc(t(d && Object.keys(d.answers || {}).length ? 'welcome.continue' : 'welcome.newBtn'))}</button></div>
    ${isSyncOn() ? `<div class="banner info"><b>${esc(t('welcome.connectedNoData'))}</b><br>${esc(t(isAdmin() ? 'welcome.connectedNoDataHint' : 'welcome.connectedNoDataUser'))}</div><button class="btn ghost" data-act="sync-recheck">${ic('sync')} ${esc(t('welcome.recheck'))}</button>` : `<div class="card stack"><div class="lbl">${esc(t('welcome.haveTitle'))}</div>${connectPanel()}</div>`}
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
on('ob-start', () => { const d = draft(); if (!Object.keys(d.answers).length) { d.answers = { ...prefillFromData(D().activities, STATE.trend, todayStr()), ...fromProfile() }; d.block = 0; d.done = false; } saveState(); nav.go('mehr:onboarding'); });

/* Bekanntes aus dem Profil übernehmen (beim erneuten Durchlaufen) */
function fromProfile(): Answers {
  if (!STATE.profile) return {};
  const p = profile(); const a: Answers = { ...(p.answers || {}) };
  if (p.birthYear) a.birthYear = p.birthYear; if (p.heightCm) a.heightCm = p.heightCm; if (p.weightKg) a.weightKg = p.weightKg;
  if (p.sex) a.sex = p.sex; a.sports = p.sports.filter(s => s !== 'football'); a.weeklyHours = p.weeklyHours; a.maxDayHours = p.maxDayHours;
  if (Object.keys(p.dayLoad || {}).length) a.dayLoad = p.dayLoad;
  if (Object.keys(p.freq || {}).length) a.freq = p.freq;
  if (p.teamSport) { a.teamYes = true; a.teamName = p.teamSport.name; a.teamTrainingDays = p.teamSport.trainingDays; a.teamTrainingMinutes = p.teamSport.trainingMinutes; a.teamGameDays = p.teamSport.gameDays; a.teamGameMinutes = p.teamSport.gameMinutes; a.teamSeasonFrom = p.teamSport.seasonFrom; a.teamSeasonTo = p.teamSport.seasonTo; }
  const sk = p.skills || {}; Object.assign(a, { swimCrawl: sk.swimCrawl ?? a.swimCrawl, swimCrawlM: sk.swimCrawlM ?? a.swimCrawlM, swimBreast: sk.swimBreast ?? a.swimBreast, runContinuousMin: sk.runContinuousMin ?? a.runContinuousMin, bikeLongestMin: sk.bikeLongestMin ?? a.bikeLongestMin });
  if ((p.bikes || []).length) a.bikes = p.bikes; a.powerMeter = p.powerMeter;
  if (Object.keys(p.bests || {}).length) a.bests = p.bests;
  if ((p.notes || []).length) a.notes = p.notes.join('\n');
  if (a.injuries == null) a.injuries = p.injuries || '';
  a.goals = D().goals.filter(g => !g.result).map(g => ({ id: g.id, type: g.type, name: g.name, date: g.date, priority: g.priority, targetTime: g.splits ? null : g.targetTimeSec || null, timeMode: g.splits ? 'split' : 'total', splits: g.splits || undefined }));
  return a;
}

/* ---------- Fragebogen ---------- */
export function renderOnboarding(): string {
  const d = draft();
  if (!Object.keys(d.answers).length) d.answers = { ...prefillFromData(D().activities, STATE.trend, todayStr()), ...fromProfile() };
  if (d.done) return d.confirmed ? preview() : understoodPage();
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
      <span class="row" style="gap:8px"><button class="btn ghost" data-act="ob-skip">${esc(t('ob.skip'))}</button><button class="btn" data-act="ob-next">${esc(d.block === BLOCKS.length - 1 ? t('ob.toSummary') : t('common.next'))}</button></span></div>
    <div class="row" style="justify-content:center;gap:6px;flex-wrap:wrap">${BLOCKS.map((x, i) => `<button class="chip ${i === d.block ? 'on' : ''}" data-act="ob-jump" data-i="${i}" aria-label="${esc(x.title)}">${i + 1}</button>`).join('')}</div></div>`;
}
const star = (q: Question) => q.required ? ' *' : '';
const DAYS = (sel: number[], q: string) => `<div class="daychips">${DOW.map(d => { const on = sel.includes(d); return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="ob-day" data-q="${q}" data-d="${d}">${esc(t('dow.' + d))}</button>`; }).join('')}</div>`;
function question(q: Question, a: Answers): string {
  const v = a[q.id]; const lab = esc(q.label) + star(q) + (q.unit ? ` <span class="muted">(${esc(q.unit)})</span>` : '');
  const hint = q.hint ? `<div class="hint">${esc(q.hint)}</div>` : '';
  const pre = (D().activities.length && ['weeklyHoursNow', 'sports', 'runContinuousMin', 'bikeLongestMin', 'swimCrawlM', 'sleep'].includes(q.id) && v != null) ? ` <span class="pill">${esc(t('ob.prefilled'))}</span>` : '';
  switch (q.type) {
    case 'number': return `<div class="fld wide" data-qid="${q.id}"><label for="q-${q.id}">${lab}${pre}</label><input class="inp" id="q-${q.id}" inputmode="decimal" data-ch="ob-q" data-q="${q.id}" data-t="number" value="${esc(v ?? '')}"></div>${hint}`;
    case 'text': return `<div class="fld wide" data-qid="${q.id}"><label for="q-${q.id}">${lab}${pre}</label><input class="inp" id="q-${q.id}" data-ch="ob-q" data-q="${q.id}" data-t="text" value="${esc(v ?? '')}"></div>${hint}`;
    case 'date': return `<div class="fld wide" data-qid="${q.id}"><label for="q-${q.id}">${lab}</label><input class="inp" type="date" id="q-${q.id}" data-ch="ob-q" data-q="${q.id}" data-t="text" value="${esc(v ?? '')}"></div>${hint}`;
    case 'notes': return `<div class="fld wide" data-qid="${q.id}"><label for="q-${q.id}">${lab}</label><textarea class="inp" id="q-${q.id}" rows="4" data-ch="ob-q" data-q="${q.id}" data-t="text">${esc(Array.isArray(v) ? v.join('\n') : v ?? '')}</textarea></div>${hint}`;
    case 'select': return `<div class="fld wide" data-qid="${q.id}"><label for="q-${q.id}">${lab}</label><select class="inp" id="q-${q.id}" data-ch="ob-q" data-q="${q.id}">${(q.options || []).map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>${hint}`;
    case 'yesno': return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${lab}</span><div class="seg">${[['1', t('common.yes')], ['0', t('common.no')]].map(([k, l]) => `<button class="${(v === true && k === '1') || (v === false && k === '0') ? 'on' : ''}" data-act="ob-yn" data-q="${q.id}" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>${hint}`;
    case 'multi': return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${lab}${pre}</span><div class="chips" style="flex-wrap:wrap">${(q.options || []).map(([k, l]) => { const on = Array.isArray(v) && v.includes(k); return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="ob-multi" data-q="${q.id}" data-v="${esc(k)}">${esc(l)}</button>`; }).join('')}</div></div>${hint}`;
    case 'days': return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${lab}</span>${DAYS(Array.isArray(v) ? v.map(Number) : [], q.id)}</div>${hint}`;
    case 'dayload': return dayLoadQ(q, a) + hint;
    case 'freq': return freqQ(q, a) + hint;
    case 'bests': return bestsQ(q, a) + hint;
    case 'goals': return goalsQ(q, a) + hint;
    case 'connect': return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${lab}</span>${connectList('onboarding')}</div>${hint}`;
    default: return `<div class="hint">${lab}</div>`;
  }
}
/* B1: pro Tag kurz/mittel/lang statt Uhrzeiten */
function dayLoadQ(q: Question, a: Answers): string {
  const dl = a.dayLoad || {};
  return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${esc(q.label)}${star(q)}</span><div class="dl-grid">${DOW.map(d => `<b class="small">${esc(t('dow.' + d))}</b><div class="seg" role="group" aria-label="${esc(t('dow.' + d))}">${DAYLOAD_OPTIONS.map(([k]) => `<button class="${(+(dl[d] || 0)) === k ? 'on' : ''}" aria-pressed="${(+(dl[d] || 0)) === k}" data-act="ob-dl" data-d="${d}" data-v="${k}">${esc(t('ob.dl' + k))}</button>`).join('')}</div>`).join('')}</div>
    <div class="xs muted">${esc(t('ob.dlLegend'))}</div></div>`;
}
/* B2: wie oft pro Woche je Sportart, mit verfügbaren Tagen */
function freqQ(q: Question, a: Answers): string {
  const sports = (a.sports || []).filter((s: string) => ['swim', 'bike', 'run', 'strength'].includes(s));
  if (!sports.length) return `<div class="hint">${esc(t('ob.freqNoSports'))}</div>`;
  const days = availableDays(a);
  const f = a.freq || {};
  const def: Record<string, [number, number]> = { run: [2, 3], bike: [1, 2], swim: [1, 2], strength: [1, 2] };
  return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${esc(q.label)}</span><div class="hint">${esc(t('ob.freqDays', { n: days }))}</div>${sports.map((s: string) => { const v = f[s] || def[s]; return `<div class="freq-row"><span>${esc(sportLabel(s))}</span><span class="stepper"><button class="btn ghost sm" data-act="ob-freq" data-s="${s}" data-d="-1" aria-label="${esc(t('ob.less'))}">−</button><b data-freq="${s}">${v[0] === v[1] ? v[0] : `${v[0]}-${v[1]}`}×</b><button class="btn ghost sm" data-act="ob-freq" data-s="${s}" data-d="1" aria-label="${esc(t('ob.more'))}">+</button></span></div>`; }).join('')}
    <div class="xs muted">${esc(t('ob.freqHint'))}</div></div>`;
}
const FREQ_STEPS: [number, number][] = [[0, 0], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [7, 7]];
/* Bestzeiten mit getrennten Feldern (A7) */
function bestsQ(q: Question, a: Answers): string {
  const b = a.bests || {};
  const rows: [string, string, 'ms' | 'hms'][] = [];
  if ((a.sports || []).includes('run')) rows.push(['run5k', '5 km', 'hms'], ['run10k', '10 km', 'hms'], ['runHalf', t('goal.run_half'), 'hms'], ['runMarathon', t('goal.run_marathon'), 'hms']);
  if ((a.sports || []).includes('swim')) rows.push(['swim400', '400 m ' + t('ob.crawl'), 'ms']);
  return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${esc(q.label)}</span><div class="fgrid">${rows.map(([k, l, kind]) => timeField('qb-' + k, l, typeof b[k] === 'number' ? b[k] : null, kind, `data-ch="ob-best" data-k="${k}"`)).join('')}</div></div>`;
}
/* B4: Ziele mit eigener Wunschzeit, Triathlon gesamt oder je Disziplin, Realismus direkt sichtbar */
function goalsQ(q: Question, a: Answers): string {
  const list: any[] = Array.isArray(a.goals) ? a.goals : [];
  const age = parseNum(a.birthYear) ? +todayStr().slice(0, 4) - +a.birthYear : null;
  const prof = profileFromAnswers(a, todayStr()).profile;
  return `<div class="fld wide" data-qid="${q.id}"><span class="lab">${esc(q.label)}${star(q)}</span>${list.map((g, i) => {
    const al = goalAllowed(g.type, age);
    const tri = GOALS[g.type as GoalType] && GOALS[g.type as GoalType].group === 'tri' && g.type !== 'duathlon' && g.type !== 'aquathlon';
    const target = goalTarget(g);
    const r = g.date ? realism({ ...g, targetTimeSec: target }, prof, todayStr()) : null;
    const legs = tri ? ['swim', 'bike', 'run'] : [];
    return `<div class="card flat tight stack" data-gi="${i}">
      <div class="fgrid">${select('og-type-' + i, t('goal.type'), g.type, (Object.keys(GOALS) as GoalType[]).map(k => [k, goalLabel(k)] as [string, string]), `data-ch="ob-goal" data-k="type" data-i="${i}"`)}
      ${field('og-date-' + i, t('goal.date'), g.date || '', { type: 'date', data: `data-ch="ob-goal" data-k="date" data-i="${i}"` })}
      ${select('og-prio-' + i, t('goal.priority'), g.priority || (i ? 'B' : 'A'), [['A', t('goal.prioA')], ['B', t('goal.prioB')], ['C', t('goal.prioC')]], `data-ch="ob-goal" data-k="priority" data-i="${i}"`)}
      ${field('og-name-' + i, t('goal.name'), g.name || '', { placeholder: goalLabel(g.type), data: `data-ch="ob-goal" data-k="name" data-i="${i}"` })}</div>
      ${g.type !== 'fitness' ? `${tri ? `<div class="seg" role="group">${[['total', t('ob.timeTotal')], ['split', t('ob.timeSplit')]].map(([k, l]) => `<button class="${(g.timeMode || 'total') === k ? 'on' : ''}" data-act="ob-goal-mode" data-i="${i}" data-v="${k}">${esc(l)}</button>`).join('')}</div>` : ''}
        ${tri && g.timeMode === 'split' ? `<div class="fgrid">${legs.map(s => timeField(`og-sp-${i}-${s}`, sportLabel(s), (g.splits || {})[s], 'hms', `data-ch="ob-goal-split" data-i="${i}" data-s="${s}"`)).join('')}</div>`
          : timeField('og-time-' + i, t('ob.wishTime', { name: g.name || goalLabel(g.type) }), typeof g.targetTime === 'number' ? g.targetTime : target, 'hms', `data-ch="ob-goal-time" data-i="${i}"`, { wide: true, hint: t('ob.wishHint') })}
        ${r ? `<div class="banner ${r.ok === false ? 'warn' : 'info'}" data-realism="${i}">${esc(r.text)}</div>` : ''}` : ''}
      ${!al.ok ? `<div class="banner warn">${esc(al.msg || '')}</div>` : ''}<button class="link" data-act="ob-goal-del" data-i="${i}">${esc(t('common.remove'))}</button></div>`; }).join('')}
    <button class="btn ghost" data-act="ob-goal-add">${ic('plus')} ${esc(t('ob.addGoal'))}</button></div>`;
}

/* ---------- F2: „Das habe ich verstanden“ ---------- */
function understoodPage(): string {
  const a = draft().answers;
  const miss = missingRequired(a);
  if (miss.length) return `<div class="card stack"><div class="lbl">${esc(t('ob.missingTitle'))}</div><ul class="small" style="padding-left:18px;margin:0">${miss.map(m => `<li><button class="link" data-act="ob-jump" data-i="${BLOCKS.findIndex(b => b.id === m.block)}">${esc(m.q.label)}</button></li>`).join('')}</ul></div>`;
  const u = understood(a, todayStr());
  return `<div class="stack understood"><h2 style="margin:var(--s2) 0 0">${esc(t('ob.understoodTitle'))}</h2><div class="hint">${esc(t('ob.understoodHint'))}</div>
    <div class="list">${u.map(x => `<div class="li" data-u="${esc(x.label)}"><span class="grow"><span class="lbl">${esc(x.label)}</span><br><span class="t">${esc(x.text)}</span></span><button class="btn ghost sm" data-act="ob-jump" data-i="${BLOCKS.findIndex(b => b.id === x.block)}">${esc(t('ob.change'))}</button></div>`).join('')}</div>
    <button class="btn block" data-act="ob-confirm">${ic('wand')} ${esc(t('ob.buildPlan'))}</button></div>`;
}

/* ---------- Ende: Plan-Vorschau ---------- */
let RESULT: ReturnType<typeof applyOnboarding> | null = null;
function preview(): string {
  const a = draft().answers;
  RESULT = applyOnboarding(a, todayStr(), STATE.profile ? profile() : undefined);
  const g = RESULT.gen;
  return `<div class="stack"><h2 style="margin:var(--s2) 0 0">${esc(t('ob.planTitle'))}</h2>
    ${RESULT.warnings.map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
    ${g ? `<div class="card stack"><div class="lbl">${esc(t('ob.summary'))}</div>${g.summary.map(s => `<p class="small" style="margin:0">${esc(s)}</p>`).join('')}</div>
      <div class="card stack plan-explain"><div class="lbl">${esc(t('plan.explain'))}</div>${(g.plan.meta.explain || []).map((s: string) => `<p class="small">${esc(s)}</p>`).join('')}</div>
      ${more(t('ob.firstWeeks'), g.plan.weeks.slice(0, 2).map((w: any) => `<div class="lbl" style="margin-top:var(--s2)">${esc(w.headline || t('plan.weekShort', { n: w.weekNumber }))} · ${esc(w.focus || '')}</div>${w.days.map((d: any) => `<div class="kv small"><span>${esc(t('dow.' + new Date(d.date + 'T12:00:00').getDay()))}</span><span style="text-align:right">${esc(d.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => s.title + (s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : '')).join(', ') || t('heute.restDay'))}</span></div>`).join('')}`).join(''))}
      ${g.dropped.length ? `<div class="hint">${esc(t('ob.dropped', { list: [...new Set(g.dropped.slice(0, 4))].join('; ') }))}</div>` : ''}
      ${g.violations.filter(v => v.rule !== 'age').length ? `<div class="hint">${esc(t('ob.checked', { n: g.violations.length }))}</div>` : `<div class="hint">${esc(t('ob.rulesOk'))}</div>`}`
      : `<div class="card"><div class="hint">${esc(t('ob.noGoal'))}</div></div>`}
    <button class="btn block" data-act="ob-apply">${esc(g ? (HAS_PLAN ? t('ob.applyReplace') : t('ob.apply')) : t('ob.saveProfile'))}</button>
    <button class="btn ghost" data-act="ob-edit">${esc(t('ob.edit'))}</button></div>`;
}

/* ---------- Aktionen ---------- */
const A = () => draft().answers;
const redraw = () => { saveState(); nav.rerender(); };
const top = () => window.scrollTo(0, 0);
on('ob-next', () => { const d = draft(); if (d.block >= BLOCKS.length - 1) { d.done = true; d.confirmed = false; } else d.block++; redraw(); top(); });
on('ob-skip', () => { const d = draft(); if (d.block >= BLOCKS.length - 1) { d.done = true; d.confirmed = false; } else d.block++; redraw(); top(); });
on('ob-back', () => { const d = draft(); d.block = Math.max(0, d.block - 1); redraw(); top(); });
on('ob-jump', el => { const d = draft(); d.block = Math.max(0, +el.dataset.i!); d.done = false; d.confirmed = false; redraw(); top(); });
on('ob-edit', () => { const d = draft(); d.done = false; d.confirmed = false; d.block = 0; redraw(); });
on('ob-confirm', () => { const d = draft(); d.confirmed = true; redraw(); top(); });
onChange('ob-q', el => { const v = (el as HTMLInputElement).value; const a = A(); a[el.dataset.q!] = el.dataset.t === 'number' ? parseNum(v) : v; saveState(); if (el.tagName === 'SELECT') nav.rerender(); });
on('ob-yn', el => { A()[el.dataset.q!] = el.dataset.v === '1'; redraw(); });
on('ob-multi', el => { const a = A(); const k = el.dataset.q!; const cur: string[] = Array.isArray(a[k]) ? a[k] : []; a[k] = cur.includes(el.dataset.v!) ? cur.filter(x => x !== el.dataset.v) : [...cur, el.dataset.v!]; redraw(); });
on('ob-day', el => { const a = A(); const k = el.dataset.q!; const d = +el.dataset.d!; const cur: number[] = Array.isArray(a[k]) ? a[k].map(Number) : []; a[k] = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort(); redraw(); });
on('ob-dl', el => { const a = A(); a.dayLoad = { ...(a.dayLoad || {}), [el.dataset.d!]: +el.dataset.v! }; redraw(); });
on('ob-freq', el => {
  const a = A(); const s = el.dataset.s!; const f = { ...(a.freq || {}) };
  const def: Record<string, [number, number]> = { run: [2, 3], bike: [1, 2], swim: [1, 2], strength: [1, 2] };
  const cur = f[s] || def[s]; let i = FREQ_STEPS.findIndex(x => x[0] === cur[0] && x[1] === cur[1]); if (i < 0) i = 2;
  i = Math.max(0, Math.min(FREQ_STEPS.length - 1, i + +el.dataset.d!)); f[s] = FREQ_STEPS[i]; a.freq = f; redraw();
});
onChange('ob-best', el => { const a = A(); const sec = readTime(el); if (sec != null && isNaN(sec)) { toast(t('time.invalid')); return; } a.bests = { ...(a.bests || {}), [el.dataset.k!]: sec }; saveState(); });
on('ob-goal-add', () => { const a = A(); a.goals = [...(a.goals || []), { id: 'goal-' + Date.now(), type: 'run_10k', name: '', date: '', priority: (a.goals || []).length ? 'B' : 'A', timeMode: 'total' }]; redraw(); });
on('ob-goal-del', el => { const a = A(); a.goals = (a.goals || []).filter((_: any, i: number) => i !== +el.dataset.i!); redraw(); });
on('ob-goal-mode', el => { const g = (A().goals || [])[+el.dataset.i!]; if (!g) return; g.timeMode = el.dataset.v; redraw(); });
onChange('ob-goal', el => { const a = A(); const g = (a.goals || [])[+el.dataset.i!]; if (!g) return; g[el.dataset.k!] = (el as HTMLInputElement).value; redraw(); });
onChange('ob-goal-time', el => { const g = (A().goals || [])[+el.dataset.i!]; if (!g) return; const sec = readTime(el); if (sec != null && isNaN(sec)) { toast(t('time.invalid')); return; } g.targetTime = sec; saveState(); refreshRealism(+el.dataset.i!); });
onChange('ob-goal-split', el => { const g = (A().goals || [])[+el.dataset.i!]; if (!g) return; const sec = readTime(el); if (sec != null && isNaN(sec)) { toast(t('time.invalid')); return; } g.splits = { ...(g.splits || {}), [el.dataset.s!]: sec }; saveState(); refreshRealism(+el.dataset.i!); });
/* Nur den Realismus-Hinweis neu schreiben, damit der Fokus im Zeitfeld bleibt */
function refreshRealism(i: number) {
  const a = A(); const g = (a.goals || [])[i]; const box = document.querySelector(`[data-realism="${i}"]`) as HTMLElement | null; if (!g || !g.date) return;
  const r = realism({ ...g, targetTimeSec: goalTarget(g) }, profileFromAnswers(a, todayStr()).profile, todayStr());
  if (box && r) { box.textContent = r.text; box.className = `banner ${r.ok === false ? 'warn' : 'info'}`; }
}
on('ob-apply', el => {
  if (!RESULT) return;
  if (HAS_PLAN && RESULT.gen && !armed(el, t('ob.applySure'))) return;
  const r = RESULT;
  saveProfile({ ...r.profile });
  if (r.goals.length) { const next: any = {}; Object.values(STATE.goals || {}).forEach((g: any) => { if (g && g.result) next[g.id] = g; }); r.goals.forEach(g => { next[g.id] = { ...g, createdAt: Date.now() }; }); STATE.goals = next; }
  delete STATE.onboarding;
  saveState(); invalidate();
  if (!r.gen) { toast(t('common.saved')); nav.go('mehr:profil'); return; }
  const old = readPlan();
  try {
    if (old) localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old));
    const plan = old ? transitionPlan(old, r.gen.plan, todayStr()) : r.gen.plan;
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch (e) { toast(t('common.storageFull')); return; }
  toast(t('ob.applied'));
  setTimeout(() => { location.href = location.pathname + '?go=plan'; }, 700);
});
void saveProfile;

on('sync-recheck', async () => { await syncNow(); toast(t('welcome.stillNoData')); });
