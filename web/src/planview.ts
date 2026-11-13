/* Auftrag 35, Punkt 3: Lauf- und Radeinheiten in Minuten oder km. Die Wahl gilt für alle Ansichten (Plan, Heute, Einheit) und wird in
   den Einstellungen gemerkt (settings.planView, wird wie alle Einstellungen zwischen Geräten abgeglichen). Rechnung: shared/kmview.ts */
import { STATE, saveState, profile } from './store';
import { esc } from './util';
import { on, refreshSheet } from './kit';
import { nav } from './nav';
import { kmPlan, kmShort, totalLine, distTxt, paceEstimated, type KmPlan, type PlanView } from '../../shared/kmview';
import { shortPlan } from '../../shared/workouts';

export const planView = (): PlanView => (STATE.settings && STATE.settings.planView === 'km' ? 'km' : 'min');
/** km-Ansicht der Einheit (null: geht nicht in km, z. B. Rolle drinnen, Lauf-Geh-Wechsel, Schwimmen) */
export function kmOf(s: any): KmPlan | null {
  if (!s || !s.spec || s.race || s.cancelled || (s.sport !== 'run' && s.sport !== 'bike')) return null;
  try { return kmPlan(s.spec, { estimated: paceEstimated(profile(), s.sport) }); } catch (_) { return null; }
}
/** „Minuten | km“ (nur, wenn die Einheit in km geht) */
export function viewToggle(s: any, cls = ''): string {
  if (!kmOf(s)) return '';
  const v = planView();
  return `<div class="seg sm plan-view ${cls}" role="group" aria-label="Anzeige in Minuten oder km" data-plan-view>${([['min', 'Minuten'], ['km', 'km']] as const).map(([k, l]) => `<button type="button" class="${v === k ? 'on' : ''}" aria-pressed="${v === k}" data-act="plan-view" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
}
/** kurze Ablauf-Zeile (Plan-Tab) in der gewählten Ansicht */
export function whatText(s: any): string {
  if (!s || !s.spec) return '';
  if (planView() === 'km' && kmOf(s)) return kmShort(s.spec, { estimated: paceEstimated(profile(), s.sport) });
  return shortPlan(s.spec);
}
/** Dauer/Strecke für Listen: Minuten-Ansicht „60 min · ca. 9,5 km“, km-Ansicht „9,5 km · ca. 59 min“ */
export function amountParts(s: any): string[] | null {
  const k = kmOf(s); if (!k) return null;
  return planView() === 'km' ? [distTxt(k.km), `ca. ${k.min} min`] : [`${s.plannedMinutes || k.min} min`, `ca. ${distTxt(k.km)}`];
}
export function totalOf(s: any): string { const k = kmOf(s); return k ? totalLine(s.spec, planView(), s.plannedMinutes, { estimated: k.estimated }) : ''; }
on('plan-view', el => {
  const v = el.dataset.v === 'km' ? 'km' : 'min';
  if (!STATE.settings) (STATE as any).settings = {};
  STATE.settings.planView = v; saveState(); nav.rerender(); refreshSheet();
});
