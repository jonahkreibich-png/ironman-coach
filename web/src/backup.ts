/* Backup als Text oder Datei, Wiederherstellen. */
import { STATE, PLAN, HAS_PLAN, PLAN_KEY, BASE_WEEKS, readPlan, mergeIntoDefaults, replaceState, rebuildPlanIndex, saveState } from './store';
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
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('kein JSON');
  return JSON.parse(raw.slice(a, b + 1));
}
export function isBackup(o) { return !!o && typeof o === 'object' && (Array.isArray(o.trend) || (o.sessions && typeof o.sessions === 'object')); }
export function isPlan(o) { return !!o && typeof o === 'object' && Array.isArray(o.weeks); }
export function markBackedUp() { STATE.lastBackupAt = new Date().toISOString(); saveState(); }
/* Liefert true, wenn die Seite neu geladen wird (Plan geändert). */
export function applyBackup(data) {
  const plan = data.plan;
  delete data.plan; delete data.exportedAt; delete data.backupVersion;
  replaceState(mergeIntoDefaults(data));
  STATE.lastBackupAt = STATE.lastBackupAt || new Date().toISOString();
  rebuildPlanIndex();
  saveState();
  if (isPlan(plan)) {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch (e) { toast('Speichern nicht möglich. Ist der Speicher voll?'); return false; }
    location.reload(); return true;
  }
  return false;
}

/* Backup-Datei über das Teilen-Menü sichern, sonst als Download. */
export async function shareBackupFile(after?: () => void): Promise<void> {
  const txt = backupText();
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
    setTimeout(() => URL.revokeObjectURL(url), 4000); markBackedUp(); toast('Backup-Datei erstellt'); after && after();
  } catch (err) { toast('Sichern als Datei klappt hier nicht. Nutze „Backup kopieren“.'); }
}
