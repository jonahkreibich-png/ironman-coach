import {swimReviewMessages} from '../../shared/coach/analysis';
/* Nach dem Schwellentest die Zonen automatisch übernehmen (Auftrag 7), sobald der Test erledigt ist und Werte hat.
   Derselbe Schritt läuft auf dem Server (Werte von der Uhr ohne App). */
import { STATE, PLAN, BASE_WEEKS, profile, saveProfile, rebuildPlanIndex, replacePlanInPlace } from './store';
import { refreshFuture, refreshAdjustments } from '../../shared/refresh';
import { swimBests, swimSkillUpdate, legacySwimReview, swimRateUpdate, swimPaceUpdate, swimStrokeUpdate, swimRateText } from '../../shared/swimskill';
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
  // Auftrag 17: eigene Schwimm-Pace (mit Pausen) → kommende Schwimmeinheiten mit realistischen Metern
  const rate = swimRateUpdate(profile(), STATE, BASE_WEEKS, today);
  // Auftrag 20: eigenes Tempo ohne Pausen (s/100 m) gleich mit, damit Meter und Dauer realistisch sind
  const pace = swimPaceUpdate(profile(), STATE, BASE_WEEKS, today);
  const strokes = swimStrokeUpdate(profile(), STATE, BASE_WEEKS, today);
  if (rate !== undefined || pace !== undefined || strokes) {
    const p0 = profile(); saveProfile({ ...p0, skills: { ...(p0.skills || {}), ...(rate !== undefined ? { swimMPerMin: rate } : {}), ...(pace !== undefined ? { swimPace100: pace } : {}), ...(strokes || {}) } });
    const rf = refreshFuture(BASE_WEEKS, profile(), today, STATE);
    if (rf.changed) {
      replacePlanInPlace({ ...PLAN, weeks: rf.weeks });
      const mid = 'msg-swimrate-' + today;
      if (!STATE.coachMsgs[mid]) STATE.coachMsgs[mid] = { id: mid, at: Date.now(), date: today, kind: 'adjust', from: 'coach', title: 'Schwimmen an dein Tempo angepasst', text: swimRateText(rate ?? profile().skills?.swimMPerMin ?? null, pace ?? null), unread: true };
    }
  }
  // Auftrag 21: kommende automatische Anpassungen mit dem aktuellen Tempo/den Zonen neu rechnen (alte Vorgaben nie stehen lassen)
  const stale = refreshAdjustments(BASE_WEEKS, STATE.adjustments || {}, profile(), today);
  if (stale.length) { stale.forEach(a => { STATE.adjustments[a.id] = a; }); rebuildPlanIndex(); }
  const best = swimBests(STATE, BASE_WEEKS, today);
  const u = legacySwimReview(profile(), BASE_WEEKS, STATE.adjustments || {}, today, best, Date.now(), STATE) || swimSkillUpdate(profile(), BASE_WEEKS, STATE.adjustments || {}, today, best, Date.now(), undefined, STATE);
  const noticeChanges=swimReviewMessages({state:STATE,profile:profile(),baseWeeks:BASE_WEEKS,today,now:Date.now()} as any,u);
  const newlyVisible=noticeChanges.some(m=>m.proposal?.status==='open' && !STATE.coachMsgs[m.id]);
  noticeChanges.forEach(m=>{STATE.coachMsgs[m.id]=m;});
  if (!u) { if (stale.length) { lastSwimInputs = signature(); invalidate(); } return noticeChanges.length>0 || stale.length > 0; }
  if(u.reviewOnly && !noticeChanges.length){lastSwimInputs=signature();return false;}
  // Auftrag 21: feste Kennung je Anlass (dieselbe wie auf dem Server), nie doppelt
  const id = 'msg-' + u.key;
  const p = profile(); if (!u.reviewOnly) saveProfile({ ...p, skills: { ...(p.skills || {}), ...u.skills } });
  const now = Date.now();
  if (u.reviewOnly) {
    // Nachricht und Status stammen aus derselben geteilten Deduplizierung wie auf dem Server.
  } else {
    // Auftrag 17: Korrekturen und bestätigte Fortschritte wirken sofort auf die kommenden Schwimmeinheiten (rückgängig machbar)
    u.adjustments.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: today }; });
    if (u.adjustments.length) rebuildPlanIndex();
    if (!u.silent && !STATE.coachMsgs[id]) STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: /^Korrigiert/.test(u.text) ? 'Schwimmen korrigiert' : 'Schwimm-Stufe', text: u.text, unread: true, important: true };
  }
  lastSwimInputs = signature();
  invalidate(); if((!u.reviewOnly && !u.silent) || newlyVisible)toast(u.reviewOnly ? 'Schwimmen: bitte prüfen' : 'Schwimm-Stufe aktualisiert');
  return true;
}
export function checkTestResult(): boolean {
  const u = runTestUpdate(STATE, PLAN.weeks, profile(), todayStr());
  if (!u) return false;
  saveProfile(applyTestUpdate(profile(), u));
  // alle kommenden Einheiten bekommen die neuen Vorgaben, der Coach zeigt ein Beispiel vorher/nachher
  const rf = refreshFuture(BASE_WEEKS, profile(), todayStr(), STATE);
  if (rf.changed) replacePlanInPlace({ ...PLAN, weeks: rf.weeks });
  const more = rf.changed ? ` ${rf.changed} kommende Einheiten rechnen ab jetzt damit.${rf.example ? ' Zum Beispiel ' + rf.example + '.' : ''}` : '';
  const id = 'msg-test-' + u.sessionId;
  STATE.coachMsgs[id] = { id, at: Date.now(), date: todayStr(), kind: 'info', from: 'coach', title: u.title, text: u.text + more, unread: true, important: true };
  invalidate(); toast(u.sport === 'swim' ? 'Schwimmtest ausgewertet' : u.sport === 'bike' ? 'Rad-Zonen aus dem Test übernommen' : 'Zonen aus dem Lauftest übernommen');
  return true;
}
