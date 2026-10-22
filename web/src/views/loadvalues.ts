import * as C from '../../../shared/core';
import { LOAD_FIELDS, validDate, recordLoadEdit, undoLoadEdit, loadConstants } from '../../../shared/load';
import { setManual, resetToOriginal } from '../../../shared/activity/merge';
import { STATE, PLAN, saveState } from '../store';
import { esc, todayStr, fmtDate } from '../util';
import { on, onChange, openSheet, refreshSheet, sec, termLink } from '../kit';
import { nav } from '../nav';
import { toast } from '../toast';

let date = todayStr();
const point = () => (STATE.trend || []).find(p => p.date === date) || { date };
const current = (d = date) => C.ownLoadSeries(STATE, PLAN.weeks || [], d).at(-1);
const label = (k: string) => k === 'loadRatio' ? 'ATL/CTL' : k.toUpperCase();
const show = (v: any) => v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 });
function put(p: any) {
  STATE.trend = (STATE.trend || []).filter(x => x.date !== date).concat(p).sort((a, b) => a.date.localeCompare(b.date));
  saveState(); nav.rerender(); refreshSheet();
}
export function renderLoadValues(): string {
  const value = current(todayStr());
  return sec('Trainingsbelastung', `<div class="card stack" data-load-values><div class="crit-grid">${LOAD_FIELDS.map(k => `<div><div class="lbl">${termLink(label(k))}</div><div class="big">${show(value?.[k])}</div></div>`).join('')}</div><div class="hint">${value ? esc(value.source) + ' · ' + fmtDate(value.date) : 'Noch keine Belastungsdaten'}</div>${value?.inconsistent ? '<div class="banner warn">Manuelle Werte widersprechen CTL und ATL.</div>' : ''}<button class="btn ghost" data-act="load-edit">Belastungswerte bearbeiten</button></div>`);
}
function sheet(): string {
  const p = point(), value = current(), constants = loadConstants(STATE.settings);
  return `<div class="stack" data-load-editor><label>Datum<input class="inp" type="date" id="load-date" data-ch="load-date" max="${todayStr()}" value="${date}"></label><div class="hint">CTL und ATL sind Tagesendwerte und dienen ab diesem Datum als Ausgangswerte. TSB und ATL/CTL werden daraus abgeleitet; separate Eingaben gelten nur an diesem Datum.</div><div class="fgrid">${LOAD_FIELDS.map(k => `<div class="fld"><label for="load-${k}">${label(k)} · ${p._manual?.[k] ? 'von Hand' : 'automatisch'}</label><input class="inp" id="load-${k}" type="text" inputmode="decimal" data-ch="load-field" data-k="${k}" value="${esc(p._manual?.[k] ? p[k] : '')}" placeholder="${esc(show(value?.[k]))}">${p._manual?.[k] ? `<button class="link" data-act="load-reset" data-k="${k}">Automatik wiederherstellen</button>` : ''}</div>`).join('')}</div>${value?.inconsistent ? '<div class="banner warn" role="status">Widerspruch: TSB oder ATL/CTL passt nicht zu CTL und ATL. Prüfe die separate Eingabe.</div>' : ''}<div class="hint">TSB am Tagesanfang: ${show(value?.tsbStart)}. Bei CTL = 0 ist ATL/CTL nicht definiert.</div><details><summary>Modell einstellen</summary><div class="fgrid">${(['ctlDays', 'atlDays'] as const).map(k => `<label>${k === 'ctlDays' ? 'CTL' : 'ATL'} Zeitkonstante (Tage)<input class="inp" type="number" min="1" max="3650" data-ch="load-model" data-k="${k}" value="${constants[k]}"></label>`).join('')}</div></details>${p._loadHistory?.length ? `<details data-load-history><summary>Änderungsverlauf (${p._loadHistory.length})</summary>${[...p._loadHistory].reverse().map(e => `<div class="small">${esc(new Date(e.at).toLocaleString('de-DE'))}: ${esc(e.action)}${e.undoneAt ? ' · rückgängig' : ''}<br>${LOAD_FIELDS.filter(k => JSON.stringify(e.before[k]) !== JSON.stringify(e.after[k])).map(k => `${label(k)}: ${show(e.before[k].value)} → ${show(e.after[k].value)}`).join(' · ')}</div>`).join('')}</details>` : ''}<button class="btn ghost" data-act="load-undo" ${p._loadHistory?.some(e => !e.undoneAt) ? '' : 'disabled'}>Letzte Änderung rückgängig</button><button class="btn ghost" data-act="load-reset-all">Alle Belastungswerte automatisch</button><button class="btn" data-act="sheet-close">Fertig</button></div>`;
}
on('load-edit', () => { date = todayStr(); openSheet('Belastungswerte', sheet); });
onChange('load-date', el => { const v = (el as HTMLInputElement).value; if (!validDate(v) || v > todayStr()) { toast('Gültiges Datum bis heute wählen.'); refreshSheet(); return; } date = v; refreshSheet(); });
onChange('load-field', el => {
  const k = el.dataset.k!; if (!(LOAD_FIELDS as readonly string[]).includes(k)) return;
  const raw = (el as HTMLInputElement).value.trim();
  const v = raw === '' ? null : Number(raw.replace(',', '.'));
  if (v != null && (!Number.isFinite(v) || (k !== 'tsb' && v < 0))) { toast('Bitte eine gültige Zahl eingeben. Nur TSB darf negativ sein.'); refreshSheet(); return; }
  const before = point(); put(recordLoadEdit(before, setManual(before, date, k, v), label(k) + (v == null ? ' automatisch' : ' geändert')));
});
on('load-reset', el => { const before = point(); put(recordLoadEdit(before, resetToOriginal(before, el.dataset.k!, STATE.settings), label(el.dataset.k!) + ' automatisch')); });
on('load-reset-all', () => { const before = point(); let after = before; for (const k of LOAD_FIELDS) after = resetToOriginal(after, k, STATE.settings); put(recordLoadEdit(before, after, 'Automatik wiederhergestellt')); });
on('load-undo', () => put(undoLoadEdit(point())));
onChange('load-model', el => { const v = Number((el as HTMLInputElement).value), k = el.dataset.k!; if (!['ctlDays', 'atlDays'].includes(k) || !Number.isFinite(v) || v < 1 || v > 3650) { toast('Zeitkonstante: 1 bis 3650 Tage.'); refreshSheet(); return; } STATE.settings.loadModel = { ...(STATE.settings.loadModel || {}), [k]: v }; saveState(); nav.rerender(); refreshSheet(); });
