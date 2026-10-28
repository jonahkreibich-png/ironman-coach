import {storage} from '../persistence';
import {customDraft, setCustomDraft, clearCustomDraft} from './custom-draft27';
import {structureHtml,templateButtons} from './session';
/* Extra-Einheiten (nicht im Plan): anlegen, ansehen, korrigieren, entfernen. */
import { findCustomRecord, effectiveCustomWorkouts, STATE, saveState, saveSoon, profile } from '../store';
import { esc, fmtDate, dowShort, parseNum } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, onInput, openSheet, closeSheet, refreshSheet, field, select, armed, srcBadge } from '../kit';
import { activityDetails } from './session';
import { nav } from '../nav';
import { fieldsBlock } from './fieldsui';
import { toast } from '../toast';
import { reviewSoon } from '../review';

let CUR: { id: string | null; date: string } = { id: null, date: '' };
const find = () => findCustomRecord(CUR.id!);
const visible = () => Object.values(effectiveCustomWorkouts()).flat().find((w:any)=>w.id===CUR.id) as any;
/* Teamsport nur für Nutzer mit Teamsport (Auftrag 4 B3) */
const SPORTS = (): [string, string][] => { const p = profile(); const team = !!(p.teamSport || p.sports.includes('football')); return ['run', 'bike', 'swim', 'strength', ...(team ? ['football'] : [])].map(k => [k, k === 'football' && p.teamSport ? p.teamSport.name : t('sport.' + k)] as [string, string]); };

const DRAFT_ID='custom-draft27';
let draftTitle='', draftSport='run', pendingId:string|null=null;
const savingDrafts=new WeakSet<object>();
let drafts:Record<string,any>={};
function currentDraft(){return drafts[draftSport] ||= {id:DRAFT_ID+'-'+draftSport,sport:draftSport,description:'',metrics:{}};}
function addSheet(): string {
 setCustomDraft(currentDraft());
 return `<fieldset class="stack custom-entry" data-extra-form><div class="hint">${dowShort(CUR.date)} ${fmtDate(CUR.date)}</div><div class="fgrid">
 ${select('ca-sport', t('common.sport'), draftSport, SPORTS()).replace('id="ca-sport"','id="ca-sport" data-ch="ca-sport"')}
 ${field('ca-title', t('common.title'), draftTitle, {placeholder:t('plan.extraPh'),wide:true,data:'data-ch="ca-title"'})}</div>
 <p class="hint">Trage hier deine tatsächlich absolvierten Werte ein.</p>
 ${fieldsBlock({kind:'custom',id:currentDraft().id,date:CUR.date,sport:draftSport})}
 <button class="btn ghost block" data-act="template-add" data-date="${CUR.date}">Aus Vorlage</button><button class="btn block" data-act="custom-save">${esc(t('common.save'))}</button></fieldset>`;
}
onInput('ca-title',el=>{draftTitle=(el as HTMLInputElement).value;});
onChange('ca-title',el=>{draftTitle=(el as HTMLInputElement).value;});
onChange('ca-sport',el=>{draftSport=(el as HTMLSelectElement).value;setCustomDraft(currentDraft());refreshSheet();});
function viewSheet(): string {
  const w = visible(); if (!w) return '';
  const act = w.activityId ? (STATE.activities || {})[w.activityId] : null;
  const m = w.metrics || {};
  return `<div class="stack"><div class="hint">${esc(t('sport.' + w.sport))} · ${dowShort(CUR.date)} ${fmtDate(CUR.date)} ${srcBadge(w.source)}</div>
    ${w.trainingBlocks ? structureHtml(w) : ''}${templateButtons({...w,date:CUR.date},w.completed!==false)}
    ${fieldsBlock({ kind: 'custom', id: w.id, date: CUR.date, sport: w.sport })}
    ${act ? activityDetails(act) : ''}
    ${w.completed === false ? '<p class="hint">Entwurf: zählt erst nach dem Abschluss als Training.</p><button class="btn block" data-act="custom-complete">Training abschließen</button>' : w.strengthTemplateId ? '<span class="pill good">Abgeschlossen</span><button class="btn ghost" data-act="custom-reopen">Wieder als Entwurf öffnen</button>' : ''}
    <button class="btn danger" data-act="custom-remove">${esc(t('plan.removeExtra'))}</button></div>`;
}
on('custom-add', el => { clearCustomDraft();drafts={};draftTitle='';draftSport='run';pendingId=null; CUR = { id: null, date: el.dataset.date! }; openSheet(t('plan.addExtra'), addSheet); });
on('custom-open', el => { CUR = { id: el.dataset.cid!, date: el.dataset.date! }; const w = visible(); openSheet(w ? w.title : '', viewSheet); });
export function openCustomWorkout(id: string, date: string) { CUR = { id, date }; const w = visible(); if (w) openSheet(w.title, viewSheet); }
on('custom-complete', () => { const w = find(); if (!w) return; w.completed = true; saveState(); refreshSheet(); nav.rerender(); reviewSoon(w.id, CUR.date); toast('Training abgeschlossen.'); });
on('custom-reopen', () => { const w = find(); if (!w) return; w.completed = false; saveState(); refreshSheet(); nav.rerender(); });
on('custom-save', async el => {
 const draft=customDraft(DRAFT_ID+'-'+draftSport);if(!draft||savingDrafts.has(draft))return;
 draftTitle=(document.getElementById('ca-title') as HTMLInputElement).value;
 pendingId ||= 'custom-'+CUR.date+'-'+crypto.randomUUID();
 const entry={...structuredClone(draft),id:pendingId,title:draftTitle.trim()||t('plan.extraDefault'),completed:true,source:'manual',plannedMinutes:parseNum(draft.metrics?.min),...(draftSport==='run'||draftSport==='bike'?{plannedKm:parseNum(draft.metrics?.km)}:{})};
 const list=STATE.customWorkouts[CUR.date] ||= [];const existing=list.findIndex((w:any)=>w.id===pendingId);if(existing<0)list.push(entry);else list[existing]=entry;
 const form=el.closest('fieldset') as HTMLFieldSetElement;savingDrafts.add(draft);if(form){form.disabled=true;form.setAttribute('aria-busy','true');}
 saveState();const confirmed=await storage.settled();savingDrafts.delete(draft);if(form){form.disabled=false;form.removeAttribute('aria-busy');}
 if(!confirmed){toast('Speichern noch nicht bestätigt. Bitte erneut versuchen; lasse die App geöffnet.');return;}
 if(el.isConnected && customDraft(draft.id)===draft){clearCustomDraft();closeSheet();}nav.rerender();toast(t('plan.extraAdded'));
});
on('custom-remove', el => {
  if (!armed(el, t('common.reallyRemove'))) return;
  for(const date of Object.keys(STATE.customWorkouts)) STATE.customWorkouts[date]=STATE.customWorkouts[date].filter((w:any)=>w.id!==CUR.id);
  saveState(); closeSheet(); nav.rerender();
});
onChange('custom-metric', el => { const w = find(); if (!w) return; const k = el.dataset.k!; w.metrics = { ...(w.metrics || {}) }; const v = (el as HTMLInputElement).value.trim(); if (v) w.metrics[k] = v; else delete w.metrics[k]; w.metricsManual = { ...(w.metricsManual || {}), [k]: true }; saveSoon(); nav.rerender(); });
onChange('custom-desc', el => { const w = find(); if (!w) return; w.description = (el as HTMLTextAreaElement).value; saveSoon(); });
