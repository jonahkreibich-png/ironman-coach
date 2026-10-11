/* Profil und Ziele: persönliche Angaben statt fester Werte im Code, mehrere Ziele mit Priorität, Sprache und Einheiten. */
import { STATE, saveState, profile, goals, saveProfile } from '../store';
import { esc, fmtDate, parseNum, paceToSec, secToPace, todayStr } from '../util';
import { t, hhmm } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, openSheet, closeSheet, refreshSheet, field, select, toggle, armed, more, sportLabel, timeField, readTime } from '../kit';
import { realism } from '../../../shared/goalcheck';
import { GOALS, mainGoal, type Goal, type GoalType } from '../../../shared/goals';
import { ageOf, isMinor, type Profile, type SportKey } from '../../../shared/profile';
import { goalAllowed } from '../../../shared/rules';
import { daysUntil } from '../../../shared/race';
import { invalidate } from '../data';
import { nav } from '../nav';
import { toast } from '../toast';

const SPORT_KEYS: SportKey[] = ['swim', 'bike', 'run', 'strength', 'football'];
export const goalLabel = (type: string) => t('goal.' + type);

export function renderProfil(): string {
  const p = profile(), today = todayStr();
  const gl = goals().sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const main = mainGoal(gl, today);
  let h = sec(t('prof.goals'), `<div class="list">${gl.map(g => `<button class="li" data-act="goal-open" data-id="${esc(g.id)}"><span class="ic" style="--c:var(--accent)">${ic(g.result ? 'trophy' : 'target')}</span>
      <span class="grow"><span class="t">${esc(g.name)}</span> ${pill(g.priority, g.priority === 'A' ? 'accent' : '')}${main && main.id === g.id ? ' ' + pill(t('prof.main'), 'good') : ''}<br>
      <span class="s">${esc(goalLabel(g.type))}${g.date ? ' · ' + fmtDate(g.date) + (g.date >= today ? ' · ' + t('prof.inDays', { n: daysUntil(today, g.date) }) : '') : ''}${g.result && g.result.timeSec ? ' · ' + hhmm(g.result.timeSec) : ''}</span></span><span class="chev">${ic('right')}</span></button>`).join('') || `<div class="li"><span class="muted">${esc(t('prof.noGoals'))}</span></div>`}</div>
    <button class="btn ghost block" data-act="goal-new" style="margin-top:var(--s2)">${ic('plus')} ${esc(t('prof.addGoal'))}</button>`, t('prof.goalsAside'));
  h += sec(t('prof.person'), `<div class="card"><div class="fgrid">
    ${field('pf-name', t('prof.name'), p.name, { data: 'data-ch="pf" data-k="name"' })}
    ${field('pf-birth', t('prof.birthYear'), p.birthYear ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="birthYear" data-num="1"' })}
    ${select('pf-sex', t('prof.sex'), p.sex || '', [['', t('prof.sexNone')], ['f', t('prof.sexF')], ['m', t('prof.sexM')], ['d', t('prof.sexD')]], 'data-ch="pf" data-k="sex"')}
    ${field('pf-h', t('prof.height'), p.heightCm ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="heightCm" data-num="1"' })}
    ${field('pf-w', t('prof.weight'), p.weightKg ?? '', { inputmode: 'decimal', data: 'data-ch="pf" data-k="weightKg" data-num="1"' })}
    ${select('pf-pal', t('prof.pal'), String(p.pal), [['1.2', t('prof.pal12')], ['1.4', t('prof.pal14')], ['1.6', t('prof.pal16')], ['1.8', t('prof.pal18')]], 'data-ch="pf" data-k="pal" data-num="1"')}
    </div>${ageOf(p, todayStr()) != null ? `<div class="hint">${esc(t('prof.age', { n: ageOf(p, todayStr()) }))}${isMinor(p, todayStr()) ? ' · ' + esc(t('prof.minorHint')) : ''}</div>` : ''}</div>`);
  h += sec(t('prof.training'), `<div class="card"><div class="lbl">${esc(t('prof.sports'))}</div><div class="chips" style="margin:6px 0 var(--s3)">${SPORT_KEYS.map(s => `<button class="chip ${p.sports.includes(s) ? 'on' : ''}" data-act="pf-sport" data-s="${s}" aria-pressed="${p.sports.includes(s)}">${esc(s === 'football' && p.teamSportName ? p.teamSportName : sportLabel(s))}</button>`).join('')}</div>
    <div class="fgrid">${p.sports.includes('football') ? field('pf-team', t('prof.teamSport'), p.teamSportName, { data: 'data-ch="pf" data-k="teamSportName"' }) : ''}
    ${field('pf-wh', t('prof.weeklyHours'), p.weeklyHours, { inputmode: 'decimal', data: 'data-ch="pf" data-k="weeklyHours" data-num="1"' })}
    ${field('pf-dh', t('prof.maxDayHours'), p.maxDayHours, { inputmode: 'decimal', data: 'data-ch="pf" data-k="maxDayHours" data-num="1"' })}
    ${field('pf-exp', t('prof.experience'), p.experienceYears ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="experienceYears" data-num="1"' })}
    ${select('pf-style', t('prof.planStyle'), p.planStyle, [['flexible', t('prof.flexible')], ['strict', t('prof.strict')]], 'data-ch="pf" data-k="planStyle"')}
    ${select('pf-likes', t('prof.likes'), p.likesIntensity, [['balanced', t('prof.balanced')], ['intensity', t('prof.intensity')], ['volume', t('prof.volume')]], 'data-ch="pf" data-k="likesIntensity"')}</div>
    <div class="fld wide"><label for="pf-inj">${esc(t('prof.injuries'))}</label><input class="inp" id="pf-inj" data-ch="pf" data-k="injuries" value="${esc(p.injuries)}" placeholder="${esc(t('prof.injuriesPh'))}"></div>
    ${toggle('pf-med', t('prof.medical'), p.medicalCaution, 'data-ch="pf" data-k="medicalCaution" data-bool="1"')}
    ${toggle('pf-veg', t('prof.vegetarian'), !!p.vegetarian, 'data-ch="pf" data-k="vegetarian" data-bool="1"')}
    <div class="hint">${esc(t('prof.thresholdsHint'))}</div><button class="btn ghost sm" data-act="go-sub" data-sub="einstellungen">${esc(t('prof.toZones'))}</button></div>`);
  h += sec(t('prof.lang'), `<div class="card"><div class="fgrid">${select('pf-lang', t('prof.language'), p.lang, [['de', 'Deutsch'], ['en', 'English (beta)']], 'data-ch="pf" data-k="lang"')}${select('pf-units', t('prof.units'), p.units, [['metric', t('prof.metric')], ['imperial', t('prof.imperial')]], 'data-ch="pf" data-k="units"')}</div></div>`);
  h += `<button class="btn ghost block" data-act="go-sub" data-sub="onboarding" style="margin-top:var(--s3)">${ic('wand')} ${esc(t('prof.redoOnboarding'))}</button>`;
  return h;
}

onChange('pf', el => {
  const p: any = profile(); const k = el.dataset.k!;
  const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) { v = parseNum(v); if (v == null && k !== 'birthYear' && k !== 'heightCm' && k !== 'weightKg' && k !== 'experienceYears') { toast(t('common.invalidNumber')); return; } }
  if (k === 'birthYear' && v != null && (v < 1930 || v > +todayStr().slice(0, 4) - 5)) { toast(t('common.invalidNumber')); return; }
  if (k === 'sex' && !v) v = null;
  p[k] = v;
  saveProfile(p); invalidate();
  if (k === 'lang' || k === 'units' || k === 'birthYear') { nav.rerender(); toast(t('common.saved')); }
});
on('pf-sport', el => {
  const p = profile(); const s = el.dataset.s as SportKey;
  p.sports = p.sports.includes(s) ? p.sports.filter(x => x !== s) : [...p.sports, s];
  if (!p.sports.length) { toast(t('prof.oneSport')); return; }
  saveProfile(p); invalidate(); nav.rerender();
});

/* ---------- Ziel bearbeiten ---------- */
let G: Goal | null = null; let G_NEW = false;
const TYPES = Object.keys(GOALS) as GoalType[];
function goalSheet(): string {
  if (!G) return '';
  const p = profile(); const allowed = goalAllowed(G.type, ageOf(p, todayStr()));
  const past = !!G.date && G.date < todayStr();
  return `<div class="stack"><div class="fgrid">
    ${select('g-type', t('goal.type'), G.type, TYPES.map(k => [k, goalLabel(k)] as [string, string]), 'data-ch="g" data-k="type"')}
    ${field('g-name', t('goal.name'), G.name, { data: 'data-ch="g" data-k="name"', placeholder: t('goal.namePh') })}
    ${field('g-date', t('goal.date'), G.date || '', { type: 'date', data: 'data-ch="g" data-k="date"' })}
    ${select('g-prio', t('goal.priority'), G.priority, [['A', t('goal.prioA')], ['B', t('goal.prioB')], ['C', t('goal.prioC')]], 'data-ch="g" data-k="priority"')}
    ${select('g-out', t('goal.outcome'), G.outcome || 'finish', [['finish', t('goal.finish')], ['time', t('goal.time')], ['place', t('goal.place')]], 'data-ch="g" data-k="outcome"')}
    ${G.outcome === 'time' ? timeField('g-target', t('goal.target'), G.targetTimeSec, 'hms', 'data-ch="g" data-k="targetTimeSec"', { wide: true }) : ''}</div>
    ${G.date && G.type !== 'fitness' ? (() => { const r = realism(G!, profile(), todayStr()); return r ? `<div class="banner ${r.ok === false ? 'warn' : 'info'}" data-goal-realism>${esc(r.text)}</div>` : ''; })() : ''}
    ${!allowed.ok ? `<div class="banner warn">${esc(allowed.msg || '')}</div>` : ''}
    <div class="fld wide"><label for="g-why">${esc(t('goal.why'))}</label><input class="inp" id="g-why" data-ch="g" data-k="why" value="${esc(G.why || '')}"></div>
    ${past || G.result ? `<div class="card flat tight"><div class="lbl">${esc(t('goal.result'))}</div><div class="fgrid">${timeField('g-res', t('goal.resultTime'), G.result && G.result.timeSec, 'hms', 'data-ch="g" data-k="resultTime"')}${field('g-place', t('goal.resultPlace'), (G.result && G.result.place) || '', { data: 'data-ch="g" data-k="resultPlace"' })}</div></div>` : ''}
    <button class="btn block" data-act="goal-save">${esc(t('common.save'))}</button>
    ${G_NEW ? '' : `<button class="btn danger" data-act="goal-del">${esc(t('goal.delete'))}</button>`}
    <div class="hint">${esc(t('goal.planHint'))}</div></div>`;
}
const parseHm = (s: string): number | null => { const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(String(s).trim()); if (!m) return null; return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 3600 + +m[2] * 60; };
on('goal-new', () => { G = { id: 'goal-' + Date.now(), type: 'run_10k', name: goalLabel('run_10k'), date: null, priority: goals().length ? 'B' : 'A', outcome: 'finish' }; G_NEW = true; openSheet(t('prof.addGoal'), goalSheet); });
on('goal-open', el => { const g = (STATE.goals || {})[el.dataset.id!]; if (!g) return; G = JSON.parse(JSON.stringify(g)); G_NEW = false; openSheet(g.name, goalSheet); });
onChange('g', el => {
  if (!G) return; const k = el.dataset.k!; const v = (el as HTMLInputElement).value;
  if (k === 'type') { const wasDefault = !G.name || TYPES.some(x => goalLabel(x) === G!.name); G.type = v as GoalType; if (wasDefault) G.name = goalLabel(v); refreshSheet(); return; }
  if (k === 'targetTimeSec') { const s = el.dataset.tf ? readTime(el) : parseHm(v); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } G.targetTimeSec = s; const box = document.querySelector('[data-goal-realism]'); const r = G.date ? realism(G, profile(), todayStr()) : null; if (box && r) { box.textContent = r.text; box.className = `banner ${r.ok === false ? 'warn' : 'info'}`; } return; }
  if (k === 'resultTime') { const s = el.dataset.tf ? readTime(el) : parseHm(v); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } G.result = { ...(G.result || {}), timeSec: s }; return; }
  if (k === 'resultPlace') { G.result = { ...(G.result || {}), place: v }; return; }
  (G as any)[k] = v || (k === 'date' ? null : v);
  if (k === 'outcome' || k === 'date') refreshSheet();
});
on('goal-save', () => {
  if (!G) return;
  if (!G.name.trim()) { toast(t('goal.nameMissing')); return; }
  STATE.goals = { ...(STATE.goals || {}), [G.id]: { ...G, createdAt: G.createdAt || Date.now() } };
  saveState(); invalidate(); closeSheet(); nav.rerender(); toast(t('common.saved'));
});
on('goal-del', el => {
  if (!G || !armed(el, t('common.reallyDelete'))) return;
  const next = { ...(STATE.goals || {}) }; delete next[G.id]; STATE.goals = next;
  saveState(); invalidate(); closeSheet(); nav.rerender();
});
void more; void paceToSec; void secToPace;
export type { Profile };
