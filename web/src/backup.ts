import { prepareRestoreMeta, activateRestoreMeta } from './sync';
import { STORAGE } from './config';
import { safeBackup, safePlan } from './backup-validation';
import { storage as localStorage } from "./persistence";
/* Backup als Text oder Datei, Wiederherstellen. */
import { STATE, PLAN, HAS_PLAN, PLAN_KEY, LS_KEY, BASE_WEEKS, readPlan, mergeIntoDefaults, replaceState, replacePlanInPlace, rebuildPlanIndex, saveState, acceptPersistedState } from './store';
import { clone, todayStr } from './util';
import { toast } from './toast';
import { APP } from './config';

export function backupObject() {
  const o = clone(STATE);
  if (HAS_PLAN) o.plan = readPlan() || Object.assign({}, PLAN, { weeks: BASE_WEEKS }); // immer der Plan des Coachs, ohne Anpassungen
  o.backupVersion = 2; o.exportedAt = new Date().toISOString();
  return o;
}
export function backupText() { return JSON.stringify(backupObject()); }
export function parseBackupText(raw) {
  raw = String(raw || '').trim();
  if (raw.length > 100 * 1024 * 1024) throw new Error('Sicherung zu gross.');
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('kein JSON');
  return JSON.parse(raw.slice(a, b + 1));
}
export function isBackup(o) { return safeBackup(o); }
export function isPlan(o) { return safePlan(o); }
export function markBackedUp() { STATE.lastBackupAt = new Date().toISOString(); saveState(); }
/* Liefert true, wenn die Seite neu geladen wird (Plan geändert). */
export async function applyBackup(input): Promise<boolean> {
  if (!isBackup(input)) throw new Error('Die Sicherung ist ungueltig oder stammt aus einer neueren App-Version.');
  const data = clone(input), plan = data.plan;
  delete data.plan; delete data.exportedAt; delete data.backupVersion;
  const next = mergeIntoDefaults(data);
  const entries: [string, string | null][] = [
    ['ec_restore_previous', backupText()],
    [LS_KEY, JSON.stringify(next)]
  ];
  if (plan) entries.push([PLAN_KEY, JSON.stringify(plan)]);
  const meta = prepareRestoreMeta(next, plan);
  entries.push([STORAGE.syncMeta, JSON.stringify(meta)]);
  localStorage.beginChange();
  // Zustand, Plan und Rueckfallkopie werden in EINER Transaktion bestaetigt.
  try {
    await localStorage.commit(entries);
    replaceState(next); acceptPersistedState(); activateRestoreMeta(meta);
  } finally { localStorage.endChange(); }
  if (plan) replacePlanInPlace(plan); else rebuildPlanIndex();
  if (plan) { location.reload(); return true; }
  saveState(); return false;
}

/* Backup-Datei über das Teilen-Menü sichern, sonst als Download. */
export async function shareBackupFile(after?: () => void): Promise<void> {
  const txt = backupText();
  const fallback = () => {
    let ta = document.getElementById('bk-in') as HTMLTextAreaElement | null;
    if (!ta) {
      const box = document.createElement('div'); box.className = 'card stack';
      const label = document.createElement('p'); label.textContent = 'Persoenliches Backup: Text vollstaendig kopieren und privat als .json speichern.';
      ta = document.createElement('textarea'); ta.id = 'bk-emergency'; ta.rows = 6; ta.className = 'inp';
      box.append(label, ta); document.getElementById('app')!.appendChild(box);
    }
    const details = ta.closest?.('details'); if (details) details.open = true;
    ta.value = txt; ta.focus(); ta.select();
  };
  const name = `${APP.slug}-backup-${todayStr()}.json`;
  const tryShare = async (type: string) => {
    const f = new File([txt], name, { type });
    if ((navigator as any).canShare && (navigator as any).canShare({ files: [f] })) { await navigator.share({ files: [f], title: APP.name + ' Backup' } as any); return true; }
    return false;
  };
  try {
    if (await tryShare('application/json') || await tryShare('text/plain')) { markBackedUp(); toast('Backup gesichert'); after && after(); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  try {
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); toast('Backup-Download gestartet. Bitte pruefen, ob die Datei gespeichert wurde.'); after && after();
  } catch (err) { fallback(); toast('Download nicht moeglich. Den ausgewaehlten Backup-Text vollstaendig kopieren.'); }
}
