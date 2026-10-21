/* Nach dem Schwellentest die Zonen automatisch übernehmen (Auftrag 7), sobald der Test erledigt ist und Werte hat.
   Derselbe Schritt läuft auf dem Server (Werte von der Uhr ohne App). */
import { STATE, PLAN, BASE_WEEKS, profile, saveProfile, rebuildPlanIndex, replacePlanInPlace } from './store';
import { refreshFuture } from '../../shared/refresh';
import { swimBests, swimSkillUpdate, legacySwimReview } from '../../shared/swimskill';
import { todayStr } from './util';
import { runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { invalidate } from './data';
import { toast } from './toast';
import { evidenceSignature } from '../../shared/results';

/* Neue Bestwerte im Schwimmen (Feld „längste Strecke Kraul am Stück“ oder mit Pull Buoy): Können eintragen, alle kommenden Schwimmeinheiten neu stufen */
let lastSwimInputs = '';
export function checkSwimSkill(): boolean {
  const today = todayStr();
  const signature = () => today + evidenceSignature(STATE, BASE_WEEKS) + JSON.stringify(profile().skills) + JSON.stringify(BASE_WEEKS.map(w => w.days?.map((d: any) => [d.date, d.sessions?.map((s: any) => [s.id, s.sport])])));
  const current = signature(); if (current === lastSwimInputs) return false;
  lastSwimInputs = current;
  const best = swimBests(STATE, BASE_WEEKS, today);
  const u = legacySwimReview(profile(), BASE_WEEKS, STATE.adjustments || {}, today, best) || swimSkillUpdate(profile(), BASE_WEEKS, STATE.adjustments || {}, today, best);
  if (!u) return false;
  const id = u.reviewOnly ? 'msg-swim-legacy-' + evidenceSignature(STATE, BASE_WEEKS) : 'msg-swim-' + Date.now();
  if (u.reviewOnly && STATE.coachMsgs[id]) return false;
  const p = profile(); if (!u.reviewOnly) saveProfile({ ...p, skills: { ...(p.skills || {}), ...u.skills } });
  const now = Date.now();
  if (u.reviewOnly) {
    // alte Profilangabe ohne Herkunft: nur ein Vorschlag, erst die Zustimmung ändert Profil und Plan
    STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'proposal', from: 'coach', title: 'Schwimmen: bitte prüfen', text: u.text + (u.adjustments.length ? '\n\n' + u.adjustments.map(a => a.what).join('\n') : ''), unread: true, important: true,
      proposal: { status: 'open', skillsOnly: true, evidenceSignature: evidenceSignature(STATE, BASE_WEEKS), changes: [{ kind: 'profile', key: 'main', data: { skills: u.skills } }, ...u.adjustments.map((a, i) => ({ kind: 'adjust', key: a.id, data: { ...a, createdAt: now + i, date: today } }))] } };
  } else {
    // Auftrag 17: Korrekturen und bestätigte Fortschritte wirken sofort auf die kommenden Schwimmeinheiten (rückgängig machbar)
    u.adjustments.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: today }; });
    if (u.adjustments.length) rebuildPlanIndex();
    STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: /^Korrigiert/.test(u.text) ? 'Schwimmen korrigiert' : 'Schwimm-Stufe', text: u.text, unread: true, important: true };
  }
  lastSwimInputs = signature();
  invalidate(); toast(u.reviewOnly ? 'Schwimmen: bitte prüfen' : 'Schwimm-Stufe aktualisiert');
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
