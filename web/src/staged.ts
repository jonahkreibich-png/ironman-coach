/* Bestätigen statt sofort ändern (Auftrag 6, Punkt 1).
   Einstellungen, die den Plan neu bauen (Wochenraster, Sätze, Können, Räder unter „Berücksichtigungen“; Sportarten, Stunden,
   Häufigkeit und Ziele unter „Profil und Ziele“), werden erst nur vorgemerkt: geänderte Felder sind markiert, unten steht
   „X Änderungen übernehmen“ / „Verwerfen“. „Übernehmen“ zeigt vorher kurz, was sich im Plan ändert, dann wird gespeichert
   und neu geplant. Wer den Bildschirm mit offenen Änderungen verlässt, wird gefragt. Im Fragebogen gilt das nicht. */
import { STATE, saveState, profile, saveProfile, HAS_PLAN } from './store';
import { esc, todayStr } from './util';
import { t } from '../../shared/i18n';
import { on, openSheet, closeSheet, sportLabel } from './kit';
import { invalidate } from './data';
import { nav } from './nav';
import { replanFuture, previewReplan } from './replan';
import { rulesOf, cellOf, describe, GRID_SPORTS, GRID_DAYS } from '../../shared/constraints';
import { parseFor } from '../../shared/ruleparse';
import type { Profile } from '../../shared/profile';
import type { Goal } from '../../shared/goals';

/* Felder, die den Plan bestimmen. Alles andere (Name, Gewicht, Sprache …) wird weiter sofort gespeichert. */
export const PLAN_FIELDS = ['rules', 'notes', 'skills', 'bikes', 'freq', 'sports', 'dayLoad', 'teamSport', 'weeklyHoursSet', 'weeklyHours', 'maxDayHours', 'experienceYears', 'planStyle', 'likesIntensity', 'injuries', 'medicalCaution', 'teamSportName'] as const;
const FIELD_LABEL: Record<string, string> = { sports: 'prof.sports', weeklyHours: 'prof.weeklyHours', maxDayHours: 'prof.maxDayHours', experienceYears: 'prof.experience', planStyle: 'prof.planStyle', likesIntensity: 'prof.likes', injuries: 'prof.injuries', medicalCaution: 'prof.medical', teamSportName: 'prof.teamSport', skills: 'cons.skills', bikes: 'cons.bikes', dayLoad: 'week.timeChanged', teamSport: 'cons.team' };

interface Draft { screen: string; profile: Profile; goals: Record<string, Goal> }
let DR: Draft | null = null;
let AFTER: (() => void) | null = null;
const LAST: Record<string, string> = {};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? null));
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const hasDraft = (screen?: string) => !!DR && (!screen || DR.screen === screen);
export const draftProfile = (screen: string): Profile => DR && DR.screen === screen ? DR.profile : profile();
export const draftGoals = (screen: string): Goal[] => Object.values(DR && DR.screen === screen ? DR.goals : (STATE.goals || {})).filter(Boolean) as Goal[];
export const draftGoal = (screen: string, id: string): Goal | null => ((DR && DR.screen === screen ? DR.goals : STATE.goals) || {})[id] || null;
export const lastApplied = (screen: string) => LAST[screen] || '';

/* Änderung vormerken. Ist danach nichts mehr anders als gespeichert, verschwindet die Leiste wieder. */
export function stage(screen: string, fn: (p: Profile, goals: Record<string, Goal>) => void): void {
  if (DR && DR.screen !== screen) DR = null;
  if (!DR) DR = { screen, profile: clone(profile()), goals: clone(STATE.goals || {}) };
  fn(DR.profile, DR.goals);
  delete LAST[screen];
  if (!changes().length) DR = null;
  invalidate(); nav.rerender();
}
export function discard(): void { DR = null; AFTER = null; invalidate(); }

/* Was ist anders als gespeichert? Eine Zeile je Änderung (Raster: je Feld). */
export function changes(): string[] {
  if (!DR) return [];
  const today = todayStr(); const pf = parseFor(today);
  const base = profile(); const next = DR.profile; const out: string[] = [];
  // Wochenraster: jedes Feld zählt einzeln
  const rb = rulesOf(base, pf), rn = rulesOf(next, pf);
  for (const s of GRID_SPORTS) {
    if (!(next.sports || []).includes(s as any) && !(base.sports || []).includes(s as any)) continue;
    for (const d of GRID_DAYS) {
      const a = cellOf(rb, s, d, base.dayLoad || {}), b = cellOf(rn, s, d, next.dayLoad || {});
      if (a.state !== b.state && !b.noTime) out.push(`${sportLabel(s)} ${t('dow.' + d)}: ${t('rules.cell.' + b.state)}`);
    }
  }
  // Sätze
  const nb = (base.notes || []).map(x => x.trim()), nn = (next.notes || []).map(x => x.trim());
  nn.filter(x => !nb.includes(x)).forEach(x => out.push(t('stage.noteAdded', { t: x })));
  nb.filter(x => !nn.includes(x)).forEach(x => out.push(t('stage.noteRemoved', { t: x })));
  // Regeln aus einem gespeicherten Satz geändert (z. B. „hart“ statt „weich“)
  const byText = (rs: any[], x: string) => rs.filter(r => (r.text || '').trim() === x && r.source !== 'grid').map(r => [r.kind, r.strength, r.sport, r.days, r.minutes]);
  nn.filter(x => nb.includes(x)).forEach(x => { if (!same(byText(base.rules || [], x), byText(next.rules || [], x))) out.push(t('stage.noteChanged', { t: x })); });
  // Regeln ohne Satz (aus dem Chat)
  const loose = (rs: any[]) => (rs || []).filter(r => !r.text && r.source !== 'grid' && !r.hidden);
  const lb = loose(base.rules || []), ln = loose(next.rules || []);
  lb.filter(r => !ln.some(x => x.id === r.id)).forEach(r => out.push(t('stage.noteRemoved', { t: describe(r) })));
  ln.filter(r => !lb.some(x => x.id === r.id)).forEach(r => out.push(t('stage.noteAdded', { t: describe(r) })));
  // Häufigkeit je Sportart
  const fb = base.freq || {}, fn = next.freq || {};
  [...new Set([...Object.keys(fb), ...Object.keys(fn)])].forEach(s => { if (!same((fb as any)[s], (fn as any)[s])) out.push(t('stage.freq', { s: sportLabel(s), n: ((fn as any)[s] || [])[1] ?? '–' })); });
  // weitere Plan-Felder
  for (const k of Object.keys(FIELD_LABEL)) if (!same((base as any)[k], (next as any)[k])) out.push(t(FIELD_LABEL[k]));
  // Ziele
  const gb = STATE.goals || {}, gn = DR.goals || {};
  for (const id of new Set([...Object.keys(gb), ...Object.keys(gn)])) {
    const a = gb[id], b = gn[id];
    if (!a && b) out.push(t('stage.goalAdded', { n: b.name }));
    else if (a && !b) out.push(t('stage.goalRemoved', { n: a.name }));
    else if (a && b && !same(a, b)) out.push(t('stage.goalChanged', { n: b.name }));
  }
  return out;
}

/* Leiste unten: „X Änderungen übernehmen“ / „Verwerfen“ */
export function stageBarHtml(screen: string): string {
  if (!hasDraft(screen)) return '';
  const n = changes().length;
  return `<div class="stage-bar" data-stage-bar role="region" aria-label="${esc(t('stage.region'))}"><div class="small"><b>${esc(t(n === 1 ? 'stage.pending1' : 'stage.pendingN', { n }))}</b><br><span class="muted">${esc(t('stage.notYet'))}</span></div>
    <div class="row stage-btns"><button class="btn ghost sm" data-act="stage-discard">${esc(t('stage.discard'))}</button><button class="btn sm" data-act="stage-apply">${esc(t(n === 1 ? 'stage.apply1' : 'stage.applyN', { n }))}</button></div></div>`;
}

/* Vorschau: was ändert sich im Plan? */
function previewSheet(): string {
  if (!DR) return '';
  const list = changes();
  const pv = HAS_PLAN ? previewReplan(DR.profile, Object.values(DR.goals || {}).filter(Boolean) as Goal[]) : null;
  const plan = !pv ? `<div class="hint">${esc(t('stage.noPlan'))}</div>`
    : !pv.ok ? `<div class="hint">${esc(pv.msg)}</div>`
    : pv.changes.length ? `<div class="stack" data-stage-preview>${[['stage.thisWeekH', pv.thisWeek], ['stage.nextWeekH', pv.nextWeek]].filter(([, l]) => l.length).map(([h, l]) => `<div class="small muted">${esc(t(h as string))}</div><div class="list">${(l as string[]).slice(0, 6).map(c => `<div class="li"><span class="t">${esc(c)}</span></div>`).join('')}${l.length > 6 ? `<div class="li"><span class="muted">${esc(t('stage.more', { n: l.length - 6 }))}</span></div>` : ''}</div>`).join('')}</div><div class="hint">${esc(t('stage.laterToo'))}</div>`
    : `<div class="hint" data-stage-preview>${esc(t('stage.noChangeSoon'))}</div>`;
  return `<div class="stack" data-stage-sheet><div class="lbl">${esc(t('stage.yourChanges'))}</div><div class="list">${list.slice(0, 10).map(c => `<div class="li"><span class="t">${esc(c)}</span></div>`).join('')}${list.length > 10 ? `<div class="li"><span class="muted">${esc(t('stage.more', { n: list.length - 10 }))}</span></div>` : ''}</div>
    ${HAS_PLAN ? `<div class="lbl">${esc(t('stage.inPlan'))}</div>` : ''}${plan}
    ${pv && pv.conflicts ? `<div class="banner warn">${esc(t('stage.conflicts', { n: pv.conflicts }))}</div>` : ''}
    <div class="row"><button class="btn" data-act="stage-confirm">${esc(t('stage.confirm'))}</button><button class="btn ghost" data-act="stage-back">${esc(t('stage.back'))}</button></div></div>`;
}
on('stage-apply', () => { if (DR) openSheet(t('stage.previewTitle'), previewSheet); });
on('stage-back', () => { AFTER = null; closeSheet(); });
on('stage-discard', () => { const next = AFTER; discard(); closeSheet(); if (next) next(); else nav.rerender(); });
on('stage-confirm', () => {
  if (!DR) { closeSheet(); return; }
  const list = changes(); const d = DR; const next = AFTER;
  // nur die Plan-Felder übernehmen; was zwischendurch sofort gespeichert wurde (Name, Gewicht …), bleibt
  const p: any = profile();
  for (const k of PLAN_FIELDS) p[k] = clone((d.profile as any)[k]);
  saveProfile(p);
  STATE.goals = clone(d.goals); saveState();
  DR = null; AFTER = null;
  let msg = t('common.saved');
  if (HAS_PLAN) {
    const r = replanFuture(t('stage.reason'), t('cons.why', { list: list.slice(0, 6).join(', ') + (list.length > 6 ? ' …' : '') }));
    msg = r.ok ? t('cons.replanned') + (r.changed && r.changed.length ? ' ' + t('cons.thisWeek', { list: r.changed.join('; ') }) : '') : r.msg;
  }
  LAST[d.screen] = msg;
  invalidate(); closeSheet();
  if (next) next(); else nav.rerender();
});

/* Verlassen mit offenen Änderungen: nachfragen. Liefert true, wenn das Verlassen angehalten wurde. */
export function guardLeave(dest: string, proceed: () => void): boolean {
  if (!DR || dest === DR.screen) return false;
  AFTER = proceed;
  const n = changes().length;
  openSheet(t('stage.leaveTitle'), () => `<div class="stack" data-stage-leave><div>${esc(t(n === 1 ? 'stage.leave1' : 'stage.leaveN', { n }))}</div>
    <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="stage-apply">${esc(t('stage.leaveApply'))}</button><button class="btn ghost" data-act="stage-discard">${esc(t('stage.discard'))}</button><button class="btn ghost" data-act="stage-stay">${esc(t('stage.stay'))}</button></div></div>`);
  return true;
}
on('stage-stay', () => { AFTER = null; closeSheet(); });
window.addEventListener('beforeunload', e => { if (DR) { e.preventDefault(); (e as any).returnValue = ''; } });
