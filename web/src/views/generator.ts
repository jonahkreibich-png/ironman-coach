import { storage as localStorage } from "../persistence";
/* Plan-Generator (regelbasiert). Nur in der Testumgebung sichtbar (FEATURES.generator).
   Vorschau aus Profil und Hauptziel, dann Übernahme: vergangene Tage bleiben, ab heute gilt der neue Plan. */
import { STATE, PLAN, HAS_PLAN, PLAN_KEY, readPlan, profile } from '../store';
import { esc, todayStr, addDays, fmtDate } from '../util';
import { t, hours } from '../../../shared/i18n';
import { on, onChange, sec, select, field, armed, more, empty, pill } from '../kit';
import { generatePlan, transitionPlan, continuationOf, weekMinutes, type GenResult } from '../../../shared/plangen';
import * as C from '../../../shared/core';
import { D } from '../data';
import { goalLabel } from './profil';
import { nav } from '../nav';
import { toast } from '../toast';

let GOAL_ID = '';
let WEEKS = 0;
let TESTS = false;
let RES: GenResult | null = null;

export function renderGenerator(): string {
  const d = D();
  const gl = d.goals.filter(g => !g.result);
  if (!gl.length) return `<div class="card stack">${empty(t('gen.noGoal'))}<button class="btn" data-act="go-sub" data-sub="profil">${esc(t('gen.toGoals'))}</button></div>`;
  if (!GOAL_ID || !gl.some(g => g.id === GOAL_ID)) GOAL_ID = (d.goal || gl[0]).id;
  const hist = recentHours();
  let h = `<div class="banner info">${esc(t('gen.testOnly'))}</div>`;
  h += `<div class="card stack"><div class="fgrid">${select('gen-goal', t('gen.goal'), GOAL_ID, gl.map(g => [g.id, `${g.name} (${goalLabel(g.type)}${g.date ? ', ' + fmtDate(g.date) : ''})`] as [string, string]), 'data-ch="gen-goal"')}
    ${select('gen-weeks', t('gen.weeks'), String(WEEKS), [['0', t('gen.weeksAll')], ['4', '4'], ['8', '8'], ['12', '12']], 'data-ch="gen-weeks"')}</div>
    <label class="switch"><input type="checkbox" data-ch="gen-tests" ${TESTS ? 'checked' : ''}><span>${esc(t('gen.tests'))}</span></label>
    <div class="hint">${esc(t('gen.inputs', { h: hours(profile().weeklyHours), now: hist == null ? '–' : hours(hist) }))}</div>
    <button class="btn block" data-act="gen-run">${esc(t('gen.preview'))}</button></div>`;
  if (RES) {
    const bad = RES.violations;
    h += sec(t('gen.result'), `<div class="card stack">${RES.summary.map(s => `<p class="small" style="margin:0">${esc(s)}</p>`).join('')}</div>
      <div class="card">${RES.phases.map(p => `<div class="kv"><span>${esc(t('phase.' + p.phase))}</span><span class="muted small">${fmtDate(p.from)} – ${fmtDate(p.to)} · ${p.weeks} ${esc(t('ob.weeks'))}</span></div>`).join('')}</div>
      ${bad.length ? `<div class="banner warn">${esc(t('gen.violations', { n: bad.length }))}<ul class="small" style="margin:4px 0 0;padding-left:18px">${bad.slice(0, 6).map(v => `<li>${esc(v.msg)}</li>`).join('')}</ul></div>` : `<div class="banner good">${esc(t('gen.rulesOk'))}</div>`}
      <div class="list">${RES.plan.weeks.map((w: any) => `<details class="li more" style="display:block"><summary class="spread" style="list-style:none;cursor:pointer"><span><b>${esc(t('plan.weekShort', { n: w.weekNumber }))}</b> <span class="small muted">${fmtDate(w.startDate)} · ${esc(w.focus || '')}</span>${w.isRecoveryWeek ? ' ' + pill(t('plan.recovery')) : ''}</span><span class="num small">${esc(hours(weekMinutes(w) / 60))}</span></summary>
        ${w.days.map((d: any) => `<div class="kv small"><span>${esc(t('dow.' + new Date(d.date + 'T12:00:00').getDay()))} ${fmtDate(d.date)}</span><span style="text-align:right">${esc(d.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => `${s.title} ${s.plannedMinutes ? s.plannedMinutes + "'" : ''}`).join(' · ') || '–')}</span></div>`).join('')}</details>`).join('')}</div>
      <button class="btn block" data-act="gen-apply">${esc(HAS_PLAN ? t('gen.applyReplace') : t('gen.apply'))}</button>
      <div class="hint">${esc(t('gen.applyHint'))}</div>`);
  }
  if (localStorage.getItem(PLAN_KEY + '_prev')) h += `<button class="btn ghost block" data-act="gen-undo" style="margin-top:var(--s3)">${esc(t('gen.undo'))}</button>`;
  return h;
}

/* Gemessene Stunden der letzten 6 Wochen (erledigte Einheiten + Aktivitäten) */
function recentHours(): number | null {
  const d = D(); const from = addDays(d.today, -42);
  const acts = d.activities.filter(a => a.date >= from && a.date <= d.today);
  if (!acts.length) return null;
  return Math.round(acts.reduce((s, a: any) => s + (a.min || 0), 0) / 60 / 6 * 10) / 10;
}
onChange('gen-goal', el => { GOAL_ID = (el as HTMLSelectElement).value; RES = null; nav.rerender(); });
onChange('gen-weeks', el => { WEEKS = +(el as HTMLSelectElement).value; RES = null; nav.rerender(); });
onChange('gen-tests', el => { TESTS = (el as HTMLInputElement).checked; RES = null; });
on('gen-run', () => {
  const d = D(); const goal = d.goals.find(g => g.id === GOAL_ID); if (!goal) return;
  const p = profile();
  try {
    const old = HAS_PLAN ? readPlan() : null;
    RES = generatePlan({ profile: p, goal: { ...goal, date: goal.date || addDays(d.today, 84) }, today: d.today, currentWeeklyHours: recentHours(), continueFrom: old ? continuationOf(old, d.today, STATE) : null, load: C.loadBaseline(STATE, PLAN.weeks, d.today), needTests: TESTS ? { run: p.sports.includes('run'), bike: p.sports.includes('bike'), swim: p.sports.includes('swim') } : undefined, maxWeeks: WEEKS || undefined });
  } catch (e: any) { toast(e.message); return; }
  nav.rerender();
});
on('gen-apply', el => {
  if (!RES) return;
  if (HAS_PLAN && !armed(el, t('ob.applySure'))) return;
  const old = readPlan();
  try {
    if (old) localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old));
    localStorage.setItem(PLAN_KEY, JSON.stringify(old ? transitionPlan(old, RES.plan, todayStr()) : RES.plan));
  } catch (e) { toast(t('common.storageFull')); return; }
  toast(t('ob.applied')); setTimeout(() => { location.href = location.pathname + '?go=plan'; }, 700);
});
on('gen-undo', el => {
  if (!armed(el, t('common.sure'))) return;
  const prev = localStorage.getItem(PLAN_KEY + '_prev'); if (!prev) return;
  localStorage.setItem(PLAN_KEY, prev); localStorage.removeItem(PLAN_KEY + '_prev');
  toast(t('gen.undone')); setTimeout(() => location.reload(), 600);
});
void STATE; void PLAN; void more; void field;
