import { STATE, PLAN, saveState } from '../store';
import { storage, storageMessage } from '../persistence';
import { esc, todayStr } from '../util';
import { on, onChange, onInput, openSheet, closeSheet, refreshSheet, field, select, sportLabel, armed } from '../kit';
import { nav } from '../nav';
import { toast } from '../toast';
import { propose } from './planedit';
import { makeTrainingTemplate, templateSession, applyTemplate, templateTotals, adaptStrengthTemplate, describeTrainingBlocks, type TrainingTemplate, type TrainingBlock, type TrainingSport } from '../../../shared/training-templates26';

const sports = ['swim', 'bike', 'run', 'strength'];
const uid = () => 'template-' + crypto.randomUUID();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const own = (): Record<string, TrainingTemplate> => STATE.workoutTemplates || {};
const all = () => [...Object.values(own()), ...Object.values(STATE.strengthTemplates || {}).map((x: any) => adaptStrengthTemplate(x))];
const get = (id: string) => all().find(t => t.id === id);
let query = '', filter = '';
let picker: { date: string; sessionId?: string } | null = null;
let preview: { template: TrainingTemplate; session: any; mode: 'replace' | 'append'; target: { date: string; sessionId?: string }; source: string } | null = null;
let draft: TrainingTemplate | null = null;
let editSession: { id: string; date: string } | null = null;
const value = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
function findSession(id: string): any {
  const planned = PLAN.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions)).find((s: any) => s.id === id);
  if (planned) return planned;
  const custom = Object.values(STATE.customWorkouts || {}).flat().find((s: any) => s.id === id) as any;
  if (!custom) return null;
  const out = clone(custom);
  Object.values(STATE.adjustments || {}).filter((a: any) => !a.undone && a.type === 'modify' && a.sessionId === id).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0)).forEach((a: any) => Object.assign(out, a.set));
  return out;
}
function mutable(id: string): boolean {
  const custom = Object.values(STATE.customWorkouts || {}).flat().find((s: any) => s.id === id) as any;
  const s = findSession(id);
  return !!s && !s.completed && !STATE.sessions[id]?.completed && (!custom || custom.completed === false);
}
function totalsText(t: TrainingTemplate): string {
  const x = templateSession(t, 'summary-preview');
  return `${x.plannedMinutes == null ? 'Dauer offen - Zeitvorgabe fehlt' : `${Math.round(x.plannedMinutes * 10) / 10} min${x.plannedDurationEstimated ? ' (geschaetzt / uebernommene Planvorgabe)' : ''}`}${x.plannedKm != null ? ` · ${Math.round(x.plannedKm * 1000)} m` : ''}`;
}
const previewHtml = (t: TrainingTemplate) => `<div class="card flat stack"><b>${esc(t.name)}</b><p class="muted">${esc(sportLabel(t.sport))} · ${esc(totalsText(t))}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc([t.description, describeTrainingBlocks(t.blocks, 0, t.sport)].filter(Boolean).join('\n'))}</div></div>`;
function filters(): string {
  return `<div class="fgrid">${field('tpl-query', 'Vorlagen suchen', query, { data: 'data-ch="tpl-search"' })}${select('tpl-filter', 'Sportart', filter, [['', 'Alle Sportarten'], ...sports.map(s => [s, sportLabel(s)] as [string, string])], 'data-ch="tpl-filter"')}</div>`;
}
function listHtml(pick = false): string {
  const list = all().filter(t => (!filter || t.sport === filter) && `${t.name} ${t.description} ${describeTrainingBlocks(t.blocks, 0, t.sport)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return list.length ? list.map(t => `<div class="card stack" data-training-template="${esc(t.id)}"><h2>${esc(t.name)}</h2><p class="muted">${esc(sportLabel(t.sport))} · ${esc(totalsText(t))}${t.readOnly ? ' · Bestehende Kraftvorlage (Original bleibt erhalten)' : ''}</p><div class="row" style="flex-wrap:wrap">${pick ? `<button class="btn" data-act="tpl-pick" data-id="${esc(t.id)}">Auswaehlen und Vorschau</button>` : `<button class="btn" data-act="tpl-start" data-id="${esc(t.id)}">Als Einheit einfuegen</button><button class="btn ghost sm" data-act="tpl-view" data-id="${esc(t.id)}">Vorschau</button>${t.readOnly ? '' : `<button class="btn ghost sm" data-act="tpl-edit" data-id="${esc(t.id)}">Bearbeiten</button>`}<button class="btn ghost sm" data-act="tpl-copy" data-id="${esc(t.id)}">Duplizieren${t.readOnly ? ' und bearbeiten' : ''}</button>${t.readOnly ? '' : `<button class="btn ghost sm danger" data-act="tpl-delete" data-id="${esc(t.id)}">Loeschen</button>`}`}</div></div>`).join('') : '<p class="empty">Keine passenden Vorlagen.</p>';
}
export function renderTrainingTemplates(): string {
  return `<div class="stack" data-templates><p class="muted">Vorlagen fuer Schwimmen, Radfahren, Laufen und Kraft. Jede eingefuegte Einheit erhaelt eine eigene Kopie. Pausen gelten zwischen Wiederholungen und Saetzen.</p><button class="btn block" data-act="tpl-new">+ Trainingsvorlage erstellen</button><button class="btn ghost block" data-act="go-sub" data-sub="strength">Bestehende Kraftvorlagen bearbeiten</button>${filters()}<div class="stack" id="tpl-list">${listHtml()}</div></div>`;
}
function refreshList() { const el = document.getElementById('tpl-list'); if (el) el.innerHTML = listHtml(!!picker); }
onInput('tpl-search', el => { query = (el as HTMLInputElement).value; refreshList(); });
onChange('tpl-filter', el => { filter = (el as HTMLSelectElement).value; refreshList(); });
const blank = (): TrainingBlock => ({ name: '', repeat: 1 });
function pathBlock(path: string): TrainingBlock {
  const indices = path.split('-').map(Number); let list = draft!.blocks; let b: TrainingBlock;
  for (const i of indices) { b = list[i]; list = b.blocks || []; } return b!;
}
function pathList(path: string): { list: TrainingBlock[]; index: number } { const parts = path.split('-'); const index = +parts.pop()!; return { list: parts.length ? pathBlock(parts.join('-')).blocks! : draft!.blocks, index }; }
function readDraft() {
  if (!draft) return;
  draft.name = value('tpl-name'); draft.description = value('tpl-description'); draft.sport = (value('tpl-sport') || draft.sport) as TrainingSport;
  document.querySelectorAll<HTMLInputElement>('[data-tpl-path]').forEach(el => {
    const b = pathBlock(el.dataset.tplPath!); const key = el.dataset.tplKey!;
    if (key === 'equipment') b.equipment = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else (b as any)[key] = key === 'paceSecPerKm' && el.value.trim() ? Number(el.value.replace(',', '.')) * Number(el.dataset.tplScale || 1) : el.value;
  });
}
function blockEditor(blocks: TrainingBlock[], prefix = ''): string {
  return blocks.map((b, i) => {
    const p = prefix + i;
    const f = (k: string, label: string, numeric = false) => field(`tpl-${p}-${k}`, label, k === 'equipment' ? b.equipment?.join(', ') : k === 'paceSecPerKm' && draft!.sport === 'swim' && b.paceSecPerKm != null && String(b.paceSecPerKm).trim() !== '' ? Number(b.paceSecPerKm) / 10 : (b as any)[k], { inputmode: numeric ? 'decimal' : 'text', data: `data-tpl-path="${p}" data-tpl-key="${k}" data-tpl-scale="${k === 'paceSecPerKm' && draft!.sport === 'swim' ? 10 : 1}"` });
    return `<div class="card flat stack" style="margin-left:${prefix ? '8px' : '0'}" data-template-block="${p}"><b>${b.blocks ? 'Wiederkehrende Serie' : draft!.sport === 'strength' ? 'Uebung' : 'Baustein'} ${i + 1}</b><div class="fgrid">${f('name', 'Bezeichnung')}${b.blocks && draft!.sport === 'strength' ? f('timeBudgetSec', 'Zeitbudget fuer alle Uebungen (s), geschaetzt', true) : ''}${f('repeat', 'Wiederholungen der ' + (b.blocks ? 'Serie' : 'Einheit'), true)}${f('restSec', 'Pause zwischen Wiederholungen/Saetzen (s)', true)}${b.blocks ? '' : f('durationSec', draft!.sport === 'strength' ? 'Dauer je Satz (s), optional' : 'Dauer je Wiederholung (s)', true)}${!b.blocks && draft!.sport !== 'strength' ? f('distanceM', 'Distanz je Wiederholung (m)', true) + f(draft!.sport === 'bike' ? 'speedKmh' : 'paceSecPerKm', draft!.sport === 'bike' ? 'Geschwindigkeit (km/h), optional' : draft!.sport === 'swim' ? 'Pace (Sekunden/100 m), optional' : 'Pace (Sekunden/km), optional', true) : ''}${!b.blocks && draft!.sport === 'strength' ? f('sets', 'Saetze', true) + f('reps', 'Wiederholungen / Haltezeit') + f('kg', 'Gewicht (kg)', true) : ''}${f('intensity', draft!.sport === 'bike' ? 'Zone / Watt / Herzfrequenz' : 'Intensitaet / Zone')}${f('equipment', 'Ausruestung (Komma getrennt)')}${f('description', 'Hinweise')}</div>${b.blocks ? blockEditor(b.blocks, p + '-') + `<button class="btn ghost sm" data-act="tpl-row-add" data-parent="${p}">+ Baustein in Serie</button>` : ''}<div class="row" style="flex-wrap:wrap"><button class="btn ghost sm" data-act="tpl-row-move" data-path="${p}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>Nach oben</button><button class="btn ghost sm" data-act="tpl-row-move" data-path="${p}" data-dir="1" ${i === blocks.length - 1 ? 'disabled' : ''}>Nach unten</button><button class="btn ghost sm danger" data-act="tpl-row-delete" data-path="${p}">Entfernen</button></div></div>`;
  }).join('');
}
function editor(): string {
  if (!draft) return '';
  return `<div class="stack" data-template-editor>${field('tpl-name', 'Name', draft.name)}${select('tpl-sport', 'Sportart', draft.sport, sports.map(s => [s, sportLabel(s)] as [string, string]), 'data-ch="tpl-editor-sport"')}${field('tpl-description', 'Beschreibung', draft.description)}<p class="hint">Zeit und Distanz gelten pro Wiederholung, bei Kraft pro Satz. Pausen liegen zwischen Wiederholungen/Saetzen. Bei Distanz ohne Pace und Kraft ohne Satzdauer bleibt die Gesamtdauer offen.</p>${blockEditor(draft.blocks)}<div class="row" style="flex-wrap:wrap"><button class="btn ghost" data-act="tpl-row-add">+ Baustein / Uebung</button><button class="btn ghost" data-act="tpl-group-add">+ Wiederkehrende Serie</button></div><button class="btn block" data-act="tpl-save">${editSession ? 'Vorschau der Einheit' : 'Vorlage speichern'}</button></div>`;
}
export function editTrainingTemplate(template?: TrainingTemplate) {
  picker = null; preview = null; editSession = null;
  draft = template ? clone(template) : { id: uid(), name: '', sport: 'run', description: '', blocks: [blank()], updatedAt: Date.now() };
  openSheet('Trainingsvorlage', editor);
}
export function openSessionPrescriptionEditor(sessionId: string, date: string) {
  if (!mutable(sessionId)) { toast('Bereits absolvierte Einheiten bleiben unveraendert.'); return; }
  const s = findSession(sessionId); if (!s?.trainingBlocks) { toast('Diese Einheit hat noch keine Vorlagenbausteine.'); return; }
  editSession = { id: sessionId, date }; picker = null; preview = null;
  draft = { id: uid(), name: s.title, sport: s.sport, description: s.trainingTemplateSnapshot?.description || '', blocks: clone(s.trainingBlocks), updatedAt: Date.now(), ...(s.trainingTemplateSnapshot?.prescriptionSummary ? { prescriptionSummary: clone(s.trainingTemplateSnapshot.prescriptionSummary) } : {}), ...(s.trainingTemplateSnapshot?.sourceSpec ? { sourceSpec: clone(s.trainingTemplateSnapshot.sourceSpec), sourcePlannedMinutes: s.trainingTemplateSnapshot.sourcePlannedMinutes, sourcePlannedKm: s.trainingTemplateSnapshot.sourcePlannedKm } : {}) };
  openSheet('Trainingsbausteine bearbeiten', editor);
}
onChange('tpl-editor-sport', () => {
  readDraft(); if (!draft) return;
  const clean = (blocks: TrainingBlock[]) => blocks.forEach(b => {
    const remove = draft!.sport === 'strength' ? ['distanceM', 'paceSecPerKm', 'speedKmh'] : ['sets', 'reps', 'kg', 'timeBudgetSec', draft!.sport === 'bike' ? 'paceSecPerKm' : 'speedKmh'];
    remove.forEach(k => { delete (b as any)[k]; }); if (b.blocks) clean(b.blocks);
  });
  clean(draft.blocks); delete draft.prescriptionSummary; refreshSheet(); toast('Sportart gewechselt. Sportfremde Vorgaben wurden im Entwurf entfernt.');
});
on('tpl-new', () => editTrainingTemplate());
on('tpl-edit', el => { const t = get(el.dataset.id!); if (t && !t.readOnly) editTrainingTemplate(t); });
on('tpl-copy', el => { const t = get(el.dataset.id!); if (t) editTrainingTemplate({ ...clone(t), id: uid(), readOnly: false, legacyId: undefined, name: t.name + ' (Kopie)' }); });
on('tpl-view', el => { const t = get(el.dataset.id!); if (t) openSheet('Trainingsvorlage', () => previewHtml(t)); });
on('tpl-row-add', el => { readDraft(); if (!draft) return; (el.dataset.parent ? pathBlock(el.dataset.parent).blocks! : draft.blocks).push(blank()); refreshSheet(); });
on('tpl-group-add', () => { readDraft(); draft?.blocks.push({ name: 'Serie', repeat: 2, blocks: [blank()] }); refreshSheet(); });
on('tpl-row-delete', el => { readDraft(); if (!draft) return; const { list, index } = pathList(el.dataset.path!); list.splice(index, 1); refreshSheet(); });
on('tpl-row-move', el => { readDraft(); if (!draft) return; const { list, index } = pathList(el.dataset.path!); const j = index + +el.dataset.dir!; if (j >= 0 && j < list.length) [list[index], list[j]] = [list[j], list[index]]; refreshSheet(); });
on('tpl-save', async () => {
  readDraft(); if (!draft) return;
  try {
    const t = makeTrainingTemplate(draft);
    if (editSession) { if (!mutable(editSession.id)) throw Error('Bereits absolvierte Einheiten bleiben unveraendert.'); showPreview(t, { date: editSession.date, sessionId: editSession.id }, 'replace'); return; }
    (STATE.workoutTemplates ||= {})[t.id] = t;
    saveState();
    if (!await storage.settled()) { toast(storageMessage() || 'Vorlage noch nicht gespeichert. App offen lassen und Backup exportieren.'); return; }
    closeSheet(); nav.rerender(); toast('Trainingsvorlage gespeichert.');
  } catch (e) { toast((e as Error).message); }
});
on('tpl-delete', async el => {
  if (!armed(el, 'Vorlage wirklich loeschen?')) return;
  const t = own()[el.dataset.id!]; if (!t) return; delete STATE.workoutTemplates[t.id];
  saveState();
  if (!await storage.settled()) { toast(storageMessage() || 'Loeschung noch nicht gespeichert. App offen lassen und Backup exportieren.'); return; } nav.rerender();
});

export function openTemplatePicker(target: { date: string; sessionId?: string }) {
  if (target.sessionId && !mutable(target.sessionId)) { toast('Bereits absolvierte Einheiten bleiben unveraendert.'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target.date) || Number.isNaN(Date.parse(target.date)) || new Date(target.date).toISOString().slice(0, 10) !== target.date) { toast('Bitte ein gueltiges Datum waehlen.'); return; }
  picker = { ...target }; preview = null;
  query = ''; filter = target.sessionId ? findSession(target.sessionId)?.sport || '' : '';
  openSheet('Aus Trainingsvorlage', () => `<div class="stack" data-template-picker><p>${esc(target.date)}${target.sessionId ? ' · Bestehende Einheit' : ' · Neue Einheit'}</p>${filters()}<div class="stack" id="tpl-list">${listHtml(true)}</div></div>`);
}
function showPreview(t: TrainingTemplate, target: { date: string; sessionId?: string }, mode: 'replace' | 'append', stableId?: string) {
  if (target.sessionId && !mutable(target.sessionId)) { toast('Bereits absolvierte Einheiten bleiben unveraendert.'); return; }
  const source = target.sessionId ? findSession(target.sessionId) : null;
  const session = source ? applyTemplate(source, t, mode) : templateSession(t, stableId || 'u-' + crypto.randomUUID());
  preview = { template: clone(t), target: { ...target }, session, mode, source: JSON.stringify(source) };
  openSheet('Vorlage uebernehmen – Vorschau', () => `<div class="stack" data-template-preview><p>${esc(target.date)} · ${source ? mode === 'append' ? 'Geplanten Inhalt ergaenzen' : 'Geplanten Inhalt ersetzen' : 'Neue Einheit anlegen'}</p>${source ? `<div class="hint">Bisher: ${esc(source.title)} · ${source.plannedMinutes == null ? 'Dauer offen' : `${esc(source.plannedMinutes)} min`}</div>` : ''}${previewHtml({ ...session.trainingTemplateSnapshot, name: session.title })}${source ? '<p class="hint">Die ID bleibt erhalten. Erfasste Istwerte bleiben unveraendert.</p><div class="row"><button class="btn ghost" data-act="tpl-mode" data-mode="replace">Ersetzen</button><button class="btn ghost" data-act="tpl-mode" data-mode="append">Ergaenzen</button></div>' : ''}<button class="btn block" data-act="tpl-confirm">${source ? 'Aenderung bestaetigen' : 'Neue Einheit bestaetigen'}</button><button class="btn ghost block" data-act="tpl-cancel">Abbrechen</button></div>`);
}
on('tpl-pick', el => { const t = get(el.dataset.id!); if (t && picker) { try { showPreview(t, picker, 'replace'); } catch (e) { toast((e as Error).message); } } });
on('tpl-mode', el => { if (!preview) return; try { showPreview(preview.template, preview.target, el.dataset.mode as any, preview.session.id); } catch (e) { toast((e as Error).message); } });
on('tpl-cancel', () => { preview = null; picker = null; closeSheet(); });
on('tpl-start', el => {
  const t = get(el.dataset.id!); if (!t) return; picker = null;
  openSheet('Einheit aus Vorlage', () => `<div class="stack">${previewHtml(t)}${field('tpl-date', 'Trainingsdatum', todayStr(), { type: 'date' })}<button class="btn block" data-act="tpl-start-preview" data-id="${esc(t.id)}">Vorschau</button></div>`);
});
on('tpl-start-preview', el => { const t = get(el.dataset.id!); const date = value('tpl-date'); if (!t) return; if (!PLAN.weeks.some((w: any) => w.days.some((d: any) => d.date === date))) { toast('Bitte einen Tag im Trainingsplan waehlen.'); return; } showPreview(t, { date }, 'replace'); });
on('tpl-confirm', () => {
  if (!preview) return; const p = preview;
  if (p.target.sessionId) {
    if (!mutable(p.target.sessionId)) { preview = null; toast('Bereits absolvierte Einheiten bleiben unveraendert.'); return; }
    if (JSON.stringify(findSession(p.target.sessionId)) !== p.source) { preview = null; toast('Die Einheit wurde inzwischen geaendert. Bitte Vorlage neu auswaehlen.'); return; }
  } else if (!PLAN.weeks.some((w: any) => w.days.some((d: any) => d.date === p.target.date))) { toast('Der Zieltag ist nicht mehr im Trainingsplan.'); return; }
  preview = null; picker = null; const group = 'user-' + crypto.randomUUID();
  if (p.target.sessionId) {
    // No actual data, identity, status, source or journal fields in a modify adjustment.
    const fields = ['sport', 'title', 'description', 'plannedMinutes', 'plannedKm', 'plannedDurationUnknown', 'plannedDurationEstimated', 'trainingBlocks', 'trainingTemplateSnapshot', 'spec', 'hard', 'long', 'zone'];
    const set = Object.fromEntries(fields.map(k => [k, clone(p.session[k] ?? null)]));
    propose([{ id: group + '-template', group, type: 'modify', sessionId: p.target.sessionId, set, what: `Vorlage: ${p.template.name}`, reason: 'Von dir bestaetigt' }], 'Trainingsvorlage uebernommen.');
  } else propose([{ id: group + '-template', group, type: 'add', to: p.target.date, session: clone(p.session), what: `Hinzugefuegt: ${p.template.name}`, reason: 'Von dir bestaetigt' }], 'Einheit aus Vorlage hinzugefuegt.');
});










