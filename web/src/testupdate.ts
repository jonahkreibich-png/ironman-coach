/* Nach dem Schwellentest die Zonen automatisch übernehmen (Auftrag 7), sobald der Test erledigt ist und Werte hat.
   Derselbe Schritt läuft auf dem Server (Werte von der Uhr ohne App). */
import { STATE, PLAN, BASE_WEEKS, profile, saveProfile, rebuildPlanIndex, replacePlanInPlace } from './store';
import { refreshFuture } from '../../shared/refresh';
import { swimBests, swimSkillUpdate } from '../../shared/swimskill';
import { todayStr } from './util';
import { runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { invalidate } from './data';
import { toast } from './toast';

/* Neue Bestwerte im Schwimmen (Feld „längste Strecke Kraul am Stück“ oder mit Pull Buoy): Können eintragen, alle kommenden Schwimmeinheiten neu stufen */
export function checkSwimSkill(): boolean {
  const today = todayStr();
  const u = swimSkillUpdate(profile(), BASE_WEEKS, STATE.adjustments || {}, today, swimBests(STATE, BASE_WEEKS, today));
  if (!u) return false;
  const p = profile(); saveProfile({ ...p, skills: { ...(p.skills || {}), ...u.skills } });
  const now = Date.now();
  u.adjustments.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: today }; });
  if (u.adjustments.length) rebuildPlanIndex();
  const id = 'msg-swim-' + now;
  STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Schwimm-Stufe aktualisiert', text: u.text, unread: true, important: true };
  invalidate(); toast('Schwimm-Stufe aktualisiert');
  return true;
}
export function checkTestResult(): boolean {
  const u = runTestUpdate(STATE, PLAN.weeks, profile(), todayStr());
  if (!u) return false;
  saveProfile(applyTestUpdate(profile(), u));
  // alle kommenden Einheiten bekommen die neuen Vorgaben, der Coach zeigt ein Beispiel vorher/nachher
  const rf = refreshFuture(BASE_WEEKS, profile(), todayStr());
  if (rf.changed) replacePlanInPlace({ ...PLAN, weeks: rf.weeks });
  const more = rf.changed ? ` ${rf.changed} kommende Einheiten rechnen ab jetzt damit.${rf.example ? ' Zum Beispiel ' + rf.example + '.' : ''}` : '';
  const id = 'msg-test-' + u.sessionId;
  STATE.coachMsgs[id] = { id, at: Date.now(), date: todayStr(), kind: 'info', from: 'coach', title: u.title, text: u.text + more, unread: true, important: true };
  invalidate(); toast(u.sport === 'swim' ? 'Schwimmtest ausgewertet' : u.sport === 'bike' ? 'Rad-Zonen aus dem Test übernommen' : 'Zonen aus dem Lauftest übernommen');
  return true;
}
