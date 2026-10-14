/* Nach dem Schwellentest die Zonen automatisch übernehmen (Auftrag 7), sobald der Test erledigt ist und Werte hat.
   Derselbe Schritt läuft auf dem Server (Werte von der Uhr ohne App). */
import { STATE, PLAN, profile, saveProfile } from './store';
import { todayStr } from './util';
import { runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { invalidate } from './data';
import { toast } from './toast';

export function checkTestResult(): boolean {
  const u = runTestUpdate(STATE, PLAN.weeks, profile(), todayStr());
  if (!u) return false;
  saveProfile(applyTestUpdate(profile(), u));
  const id = 'msg-test-' + u.sessionId;
  STATE.coachMsgs[id] = { id, at: Date.now(), date: todayStr(), kind: 'info', from: 'coach', title: u.title, text: u.text, unread: true, important: true };
  invalidate(); toast(u.sport === 'swim' ? 'Schwimmtest ausgewertet' : u.sport === 'bike' ? 'Rad-Zonen aus dem Test übernommen' : 'Zonen aus dem Lauftest übernommen');
  return true;
}
