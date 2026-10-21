import { STATE, saveState } from '../store';
import { esc, todayStr } from '../util';
import { on, openSheet, closeSheet, refreshSheet, field, armed } from '../kit';
import { nav } from '../nav';
import { toast } from '../toast';
import { makeStrengthTemplate, startStrengthWorkout, type StrengthTemplate } from '../../../shared/strength';
import { openCustomWorkout } from './custom';

const templates = (): Record<string, StrengthTemplate> => STATE.strengthTemplates || (STATE.strengthTemplates = {});
const uid = () => 'strength-' + crypto.randomUUID();
let draft: { id: string; name: string; exercises: any[] } | null = null;
let afterSave: (() => void) | undefined;
const blank = () => ({ name: '', sets: null, reps: '', kg: null, restSec: null });

export function renderStrength(): string {
  const list = Object.values(templates()).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="stack"><p class="muted">Eigene Kraftpläne speichern und für jedes Training neu verwenden. Änderungen am Training lassen die Vorlage unverändert.</p><button class="btn block" data-act="strength-new">+ Kraftvorlage erstellen</button>${list.length ? list.map(x => `<div class="card stack" data-strength-template="${esc(x.id)}"><h2>${esc(x.name)}</h2><p class="muted">${x.exercises.length} Übungen · ${x.exercises.map(e => esc(e.name)).join(', ')}</p><button class="btn" data-act="strength-start" data-id="${esc(x.id)}">Training starten</button><div class="row" style="flex-wrap:wrap"><button class="btn ghost sm" data-act="strength-edit" data-id="${esc(x.id)}">Bearbeiten</button><button class="btn ghost sm" data-act="strength-copy" data-id="${esc(x.id)}">Duplizieren</button><button class="btn ghost sm danger" data-act="strength-delete" data-id="${esc(x.id)}">Löschen</button></div></div>`).join('') : '<div class="empty">Noch keine Kraftvorlagen. Erstelle deine erste Vorlage.</div>'}</div>`;
}
function editor(): string {
  if (!draft) return '';
  return `<div class="stack">${field('strength-name', 'Name der Vorlage', draft.name)}${draft.exercises.map((e, i) => `<div class="card flat stack" data-strength-row="${i}"><b>Übung ${i + 1}</b><div class="fgrid">${(['name', 'sets', 'reps', 'kg', 'restSec'] as const).map((k, n) => field(`strength-${i}-${k}`, ['Übung', 'Sätze', 'Wiederholungen / Dauer', 'Gewicht (kg)', 'Pause (Sekunden)'][n], e[k], { wide: k === 'name', inputmode: ['sets', 'restSec'].includes(k) ? 'numeric' : k === 'kg' ? 'decimal' : 'text' })).join('')}</div><div class="row" style="flex-wrap:wrap"><button class="btn ghost sm" data-act="strength-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Übung ${i + 1} nach oben">↑</button><button class="btn ghost sm" data-act="strength-move" data-i="${i}" data-dir="1" ${i === draft.exercises.length - 1 ? 'disabled' : ''} aria-label="Übung ${i + 1} nach unten">↓</button><button class="btn ghost sm danger" data-act="strength-row-delete" data-i="${i}">Übung entfernen</button></div></div>`).join('')}<button class="btn ghost" data-act="strength-row-add">+ Übung hinzufügen</button><button class="btn block" data-act="strength-save">Vorlage speichern</button></div>`;
}
function readDraft() {
  if (!draft) return;
  draft.name = (document.getElementById('strength-name') as HTMLInputElement).value;
  draft.exercises = draft.exercises.map((_, i) => Object.fromEntries(['name', 'sets', 'reps', 'kg', 'restSec'].map(k => [k, (document.getElementById(`strength-${i}-${k}`) as HTMLInputElement).value])));
}
export function editStrengthTemplate(name = '', exercises: any[] = [], done?: () => void, id = uid()) {
  draft = { id, name, exercises: exercises.length ? exercises.map(e => ({ ...e })) : [blank()] }; afterSave = done;
  openSheet('Kraftvorlage', editor);
}
on('strength-new', () => editStrengthTemplate());
on('strength-edit', el => { const x = templates()[el.dataset.id!]; if (x) editStrengthTemplate(x.name, x.exercises, undefined, x.id); });
on('strength-copy', el => { const x = templates()[el.dataset.id!]; if (x) editStrengthTemplate(x.name + ' (Kopie)', x.exercises); });
on('strength-row-add', () => { readDraft(); draft?.exercises.push(blank()); refreshSheet(); });
on('strength-row-delete', el => { readDraft(); draft?.exercises.splice(+el.dataset.i!, 1); refreshSheet(); });
on('strength-move', el => { readDraft(); if (!draft) return; const i = +el.dataset.i!, j = i + +el.dataset.dir!; if (j < 0 || j >= draft.exercises.length) return; [draft.exercises[i], draft.exercises[j]] = [draft.exercises[j], draft.exercises[i]]; refreshSheet(); });
on('strength-save', () => {
  readDraft(); if (!draft) return;
  try { const x = makeStrengthTemplate(draft.id, draft.name, draft.exercises); templates()[x.id] = x; saveState(); closeSheet(); nav.rerender(); toast('Kraftvorlage gespeichert.'); const done = afterSave; afterSave = undefined; done?.(); }
  catch (e) { toast((e as Error).message); }
});
on('strength-delete', el => { if (!armed(el, 'Vorlage wirklich löschen?')) return; delete templates()[el.dataset.id!]; saveState(); nav.rerender(); });
on('strength-start', el => {
  const x = templates()[el.dataset.id!]; if (!x) return;
  openSheet('Training starten', () => `<div class="stack"><p>${esc(x.name)}</p>${field('strength-date', 'Trainingsdatum', todayStr(), { type: 'date' })}<p class="muted">Das Training bleibt ein Entwurf, bis du es als abgeschlossen markierst.</p><button class="btn block" data-act="strength-start-confirm" data-id="${esc(x.id)}">Training anlegen</button></div>`);
});
on('strength-start-confirm', el => {
  const x = templates()[el.dataset.id!]; if (!x) return;
  const date = (document.getElementById('strength-date') as HTMLInputElement).value;
  try { const workout = startStrengthWorkout(x, date, uid()); (STATE.customWorkouts[date] ||= []).push(workout); saveState(); nav.rerender(); openCustomWorkout(workout.id, date); }
  catch (e) { toast((e as Error).message); }
});
