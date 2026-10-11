/* Extra-Einheiten (nicht im Plan): anlegen, ansehen, korrigieren, entfernen. */
import { STATE, saveState, saveSoon, profile } from '../store';
import { esc, fmtDate, dowShort, parseNum } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, openSheet, closeSheet, field, select, armed, srcBadge } from '../kit';
import { activityDetails } from './session';
import { nav } from '../nav';
import { toast } from '../toast';

let CUR: { id: string | null; date: string } = { id: null, date: '' };
const find = () => ((STATE.customWorkouts || {})[CUR.date] || []).find((w: any) => w.id === CUR.id);
/* Teamsport nur für Nutzer mit Teamsport (Auftrag 4 B3) */
const SPORTS = (): [string, string][] => { const p = profile(); const team = !!(p.teamSport || p.sports.includes('football')); return ['run', 'bike', 'swim', 'strength', ...(team ? ['football'] : [])].map(k => [k, k === 'football' && p.teamSport ? p.teamSport.name : t('sport.' + k)] as [string, string]); };

function addSheet(): string {
  return `<div class="stack"><div class="hint">${dowShort(CUR.date)} ${fmtDate(CUR.date)}</div><div class="fgrid">
    ${select('ca-sport', t('common.sport'), 'run', SPORTS())}${field('ca-title', t('common.title'), '', { placeholder: t('plan.extraPh'), wide: true })}
    ${field('ca-min', t('m.min'), '', { inputmode: 'decimal' })}${field('ca-km', t('m.km'), '', { inputmode: 'decimal' })}</div>
    <button class="btn block" data-act="custom-save">${esc(t('common.save'))}</button></div>`;
}
function viewSheet(): string {
  const w = find(); if (!w) return '';
  const act = w.activityId ? (STATE.activities || {})[w.activityId] : null;
  const m = w.metrics || {};
  return `<div class="stack"><div class="hint">${esc(t('sport.' + w.sport))} · ${dowShort(CUR.date)} ${fmtDate(CUR.date)} ${srcBadge(w.source)}</div>
    <div class="fgrid">${field('cw-min', t('m.min'), m.min ?? w.plannedMinutes ?? '', { inputmode: 'decimal', data: 'data-ch="custom-metric" data-k="min"' })}${field('cw-km', t('m.km'), m.km ?? w.plannedKm ?? '', { inputmode: 'decimal', data: 'data-ch="custom-metric" data-k="km"' })}${field('cw-hr', t('m.hr'), m.hr ?? '', { inputmode: 'numeric', data: 'data-ch="custom-metric" data-k="hr"' })}</div>
    ${act ? activityDetails(act) : ''}
    <div class="fld"><label for="cw-desc">${esc(t('sess.notes'))}</label><textarea class="inp" id="cw-desc" rows="2" data-ch="custom-desc">${esc(w.description || '')}</textarea></div>
    <button class="btn danger" data-act="custom-remove">${esc(t('plan.removeExtra'))}</button></div>`;
}
on('custom-add', el => { CUR = { id: null, date: el.dataset.date! }; openSheet(t('plan.addExtra'), addSheet); });
on('custom-open', el => { CUR = { id: el.dataset.cid!, date: el.dataset.date! }; const w = find(); openSheet(w ? w.title : '', viewSheet); });
on('custom-save', () => {
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const entry = { id: 'custom-' + CUR.date + '-' + Date.now(), sport: v('ca-sport'), title: v('ca-title').trim() || t('plan.extraDefault'), description: '', plannedMinutes: parseNum(v('ca-min')), plannedKm: parseNum(v('ca-km')), metrics: { ...(v('ca-min') ? { min: v('ca-min') } : {}), ...(v('ca-km') ? { km: v('ca-km') } : {}) } };
  (STATE.customWorkouts[CUR.date] = STATE.customWorkouts[CUR.date] || []).push(entry);
  saveState(); closeSheet(); nav.rerender(); toast(t('plan.extraAdded'));
});
on('custom-remove', el => {
  if (!armed(el, t('common.reallyRemove'))) return;
  STATE.customWorkouts[CUR.date] = (STATE.customWorkouts[CUR.date] || []).filter((w: any) => w.id !== CUR.id);
  saveState(); closeSheet(); nav.rerender();
});
onChange('custom-metric', el => { const w = find(); if (!w) return; const k = el.dataset.k!; w.metrics = { ...(w.metrics || {}) }; const v = (el as HTMLInputElement).value.trim(); if (v) w.metrics[k] = v; else delete w.metrics[k]; w.metricsManual = { ...(w.metricsManual || {}), [k]: true }; saveSoon(); nav.rerender(); });
onChange('custom-desc', el => { const w = find(); if (!w) return; w.description = (el as HTMLTextAreaElement).value; saveSoon(); });
