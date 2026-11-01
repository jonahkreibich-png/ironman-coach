import { appTz } from '../../shared/tz';
import { applyCustomPlanAdjustments } from '../../shared/custom-locations26';
import { safeBackup } from './backup-validation';
import { mergeStored } from './storage-merge';
import { storage as localStorage } from "./persistence";
/* Plan und Zustand der App (localStorage), Plan-Index mit Anpassungen. */
import * as CoachCore from '../../shared/core';
import { clone, todayStr } from './util';
import { toast } from './toast';
import { STORAGE } from './config';
import { type Profile, profileFromLegacy, mergeProfile } from '../../shared/profile';
import { type Goal, goalFromPlanMeta } from '../../shared/goals';
import { setLang, setUnits } from '../../shared/i18n';
import { migrateNotes } from '../../shared/fields';
import { sanitizeProfile, ghostGames } from '../../shared/sanity';

export const PLAN_KEY = STORAGE.plan;
export const LS_KEY = STORAGE.state;
const UI_KEY = STORAGE.ui;
export const DEFAULT_ZONES = [
  { zone: 1, label: 'Recovery', low: 0, high: 81 }, { zone: 2, label: 'Aerobic (Grundlage)', low: 81, high: 89 },
  { zone: 3, label: 'Tempo', low: 90, high: 93 }, { zone: 4, label: 'Schwelle', low: 94, high: 102 }, { zone: 5, label: 'VO2max/Anaerob', low: 102, high: 999 }
];
export function readPlan(): any {
  try { return JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); } catch (e) { localStorage.block(PLAN_KEY); return null; }
}
const PLAN_RAW = readPlan();
export const HAS_PLAN = !!(PLAN_RAW && Array.isArray(PLAN_RAW.weeks) && PLAN_RAW.weeks.length);
export const PLAN: any = HAS_PLAN ? PLAN_RAW : { meta: {}, weeks: [], keyDates: [] };
if (!PLAN.meta) PLAN.meta = {};
if (!PLAN.meta.baseScores) PLAN.meta.baseScores = { swim: 20, bike: 20, run: 20, strength: 20 };
if (!Array.isArray(PLAN.zonePercents) || !PLAN.zonePercents.length) PLAN.zonePercents = DEFAULT_ZONES;
if (!Array.isArray(PLAN.keyDates)) PLAN.keyDates = [];

/* ---------- Zustand ---------- */
export function defaultState(): any {
  return {
    sessions: clone(PLAN.seedSessions || {}),
    trend: clone(PLAN.seedTrend || []),
    scoreAdjust: { swim: 0, bike: 0, run: 0, strength: 0 },
    customWorkouts: {}, openDays: {},
    milestones: clone(PLAN.seedMilestones || []),
    // Keine Schwellen als Vorgabe: sie stehen im Profil (eigene Werte oder aus dem Profil geschätzt)
    settings: { readiness: { tempMax: 0.5 } },
    weekNotes: {}, nutrition: {},
    nutritionProfile: { pal: 1.4 },
    illnessPeriods: clone(PLAN.seedIllness || []),
    adjustments: {},
    profile: null, goals: {}, activities: {}, coachMsgs: {}, coachNotes: {}, raceResults: {}, meals: {}, strengthTemplates: {}, workoutTemplates: {},
    lastBackupAt: null
  };
}
export function mergeIntoDefaults(partial: any): any {
  const base = defaultState();
  const out = Object.assign(base, partial || {});
  if (!Array.isArray(out.trend) || !out.trend.length) out.trend = base.trend;
  if (!out.scoreAdjust) out.scoreAdjust = base.scoreAdjust;
  if (!out.sessions) out.sessions = {};
  if (!out.customWorkouts) out.customWorkouts = {};
  if (!out.openDays) out.openDays = {};
  if (!Array.isArray(out.milestones)) out.milestones = base.milestones;
  if (!out.settings) out.settings = base.settings;
  if (!out.settings.readiness) out.settings.readiness = defaultState().settings.readiness;
  if (!out.weekNotes) out.weekNotes = {};
  if (!out.nutrition) out.nutrition = {};
  if (!out.nutritionProfile) out.nutritionProfile = base.nutritionProfile;
  if (!Array.isArray(out.illnessPeriods)) out.illnessPeriods = clone(PLAN.seedIllness || []);
  if (!out.adjustments || typeof out.adjustments !== 'object') out.adjustments = {};
  ['goals', 'activities', 'coachMsgs', 'coachNotes', 'raceResults', 'meals', 'analysis', 'strengthTemplates', 'workoutTemplates'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
  out.trend.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
let stateReadable = true;
export function canPersist() { return stateReadable && !localStorage.blocked; }
function readFailure(key: string) { stateReadable = false; localStorage.block(key); }
function loadState(): any {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const data = JSON.parse(raw); if (!safeBackup(data)) throw Error('Ungueltiger Zustand'); return mergeIntoDefaults(data); } } catch (e) { readFailure(LS_KEY); return mergeIntoDefaults(null); }
  for (const k of STORAGE.legacyState) { try { const old = localStorage.getItem(k); if (old) return mergeIntoDefaults(JSON.parse(old)); } catch (e) {} }
  return mergeIntoDefaults(null);
}

/* Alle Daten des Nutzers auf diesem Gerät löschen (Nutzerwechsel, Abmelden, Zurücksetzen durch den Betreiber).
   Nur die Darstellung (hell/dunkel) bleibt. keepAuth: die Anmeldung bleibt (z. B. beim Zurücksetzen). */
export async function wipeLocalData(keepAuth = false): Promise<void> {
  localStorage.beginChange();
  try {
    // Meldungen im Ausgang bleiben (keine Gesundheitsdaten), damit „Fehler melden“ vor der Einrichtung nicht verloren geht
    const keep = new Set<string>([STORAGE.theme, 'ec_fb_outbox', ...(keepAuth ? [STORAGE.syncAuth, STORAGE.owner] : [])]);
    const keys = localStorage.keys().filter(k => /^ec_/.test(k) && !keep.has(k));
    await localStorage.commit(keys.map(k => [k,null]));
  } finally { localStorage.endChange(); }
  const fresh = mergeIntoDefaults(null);
  Object.keys(STATE).forEach(k => { delete STATE[k]; });
  Object.assign(STATE, fresh);
  acceptPersistedState();
  Object.keys(UI).forEach(k => { delete UI[k]; });
  Object.assign(UI, { view: 'heute', tab: 'heute' });
}
/* Liegen auf diesem Gerät schon Daten (Plan, Einheiten, Werte, Profil)? */
export function hasLocalData(): boolean {
  return HAS_PLAN || !!STATE.profile || Object.keys(STATE.sessions || {}).length > 0 || (STATE.trend || []).length > 0 || !!STATE.onboarding;
}

/* STATE ist ein fester Behälter. replaceState tauscht den Inhalt aus, damit alle Module dieselbe Referenz behalten. */
export const STATE: any = loadState();
// Auftrag 22: Zeitzone des Geräts in den Einstellungen, damit der Server morgens zur richtigen Ortszeit plant (wird beim nächsten Speichern abgeglichen)
try { const tz = appTz(); if (STATE.settings && STATE.settings.tz !== tz) STATE.settings.tz = tz; } catch (_) { /* egal */ }
/* Auftrag 27: Wer aus STATE abgeleitete Daten zwischenspeichert (data.ts D()), muss nach einem Austausch neu rechnen. Vorher zeigte der
   Zwischenspeicher nach jedem Hintergrund-Abgleich auf die alten Objekte: „Wieder gesund“ setzte das Ende an einer veralteten Kopie. */
const replaced: (() => void)[] = [];
export function onStateReplaced(fn: () => void): void { replaced.push(fn); }
/** Teile von STATE wurden ersetzt (z. B. Datensätze vom Server übernommen): Zwischenspeicher leeren */
export function notifyStateChanged(): void { replaced.forEach(fn => { try { fn(); } catch (e) { /* nie scheitern */ } }); }
export function replaceState(next: any): void {
  if (next === STATE) return;
  Object.keys(STATE).forEach(k => { delete STATE[k]; });
  Object.assign(STATE, next);
  replaced.forEach(fn => { try { fn(); } catch (e) { /* Zwischenspeicher leeren darf nie scheitern */ } });
}

let saveListener: (() => void) | null = null;
export function onSave(fn: () => void): void { saveListener = fn; }
let baseline = clone(STATE);
export function acceptPersistedState() { baseline = clone(STATE); }
/* Vor dem Schreiben Daten anderer Tabs einlesen, ohne eigene Aenderungen zu verlieren. */
export function refreshStoredState(): boolean {
  if (!canPersist()) return false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const remote = JSON.parse(raw);
      if (!safeBackup(remote)) throw Error('Ungueltiger Zustand');
      const conflicts: any[] = [];
      const merged = mergeStored(baseline, STATE, mergeIntoDefaults(remote), conflicts);
      // Konflikte bleiben privat im persoenlichen Backup, statt einen Wert lautlos zu verlieren.
      if (conflicts.length) merged.storageConflicts = [...(merged.storageConflicts || []), { at: Date.now(), values: conflicts }];
      replaceState(merged); baseline = clone(mergeIntoDefaults(remote));
    }
    return true;
  } catch (_) { readFailure(LS_KEY); return false; }
}
export function saveState(remote = false): boolean {
  if (localStorage.changing || !refreshStoredState()) return false;
  if (saveListener && !remote) STATE._storageRevision = Math.max(Date.now(), STATE._storageRevision || 0, baseline._storageRevision || 0) + 1;
  const ok = localStorage.setMergedItem(LS_KEY, JSON.stringify(STATE), JSON.stringify(baseline));
  baseline = clone(STATE);
  if (saveListener) saveListener();
  return ok;
}
// Nutzereingaben nicht bis zu einem potenziell ausbleibenden pagehide aufschieben.
export function saveSoon(): void { saveState(); }
window.addEventListener('beforeunload', e => {
  if (localStorage.status !== 'saved') { e.preventDefault(); e.returnValue = ''; }
});

if (PLAN.meta.scoreCalibration && STATE.scoreCalibVersion !== PLAN.meta.scoreCalibration.version) {
  STATE.scoreAdjust = { swim: 0, bike: 0, run: 0, strength: 0 };
  STATE.scoreCalibVersion = PLAN.meta.scoreCalibration.version;
  saveState();
}

/* ---------- UI-Zustand ---------- */
function loadUi(): any { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; } }
export const UI: any = Object.assign({ view: 'heute', perfSport: 'swim', volMode: null }, loadUi());
export function saveUi(): void { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) {} }

/* ---------- Plan-Index ---------- */
/* PLAN.weeks ist der effektive Plan: Coach-Plan (BASE_WEEKS, bleibt unverändert) plus aktive Anpassungen. */
export const BASE_WEEKS: any[] = clone(PLAN.weeks);
export const DAYS: any[] = [];
export const DAY_BY_DATE: Record<string, any> = {};
export const SESS: any[] = [];
export const SESS_BY_ID: Record<string, any> = {};
export function rebuildPlanIndex(): void {
  PLAN.weeks = CoachCore.applyAdjustments(BASE_WEEKS, STATE.adjustments || {});
  DAYS.length = 0; SESS.length = 0;
  Object.keys(DAY_BY_DATE).forEach(k => delete DAY_BY_DATE[k]); Object.keys(SESS_BY_ID).forEach(k => delete SESS_BY_ID[k]);
  PLAN.weeks.forEach((w, wi) => w.days.forEach(d => DAYS.push({ ...d, weekIdx: wi })));
  DAYS.forEach(d => { DAY_BY_DATE[d.date] = d; });
  DAYS.forEach(d => d.sessions.forEach(s => { const x = { ...s, date: d.date }; SESS.push(x); SESS_BY_ID[s.id] = x; }));
}
rebuildPlanIndex();
/* Neuen Plan übernehmen, ohne die Seite neu zu laden (alle Module behalten ihre Referenzen) */
export function replacePlanInPlace(next: any): void {
  if (!canPersist()) throw new Error('Plan konnte nicht sicher geladen werden.');
  localStorage.setItem(PLAN_KEY, JSON.stringify(next));
  Object.keys(PLAN).forEach(k => { delete PLAN[k]; });
  Object.assign(PLAN, clone(next));
  if (!Array.isArray(PLAN.zonePercents) || !PLAN.zonePercents.length) PLAN.zonePercents = DEFAULT_ZONES;
  if (!Array.isArray(PLAN.keyDates)) PLAN.keyDates = [];
  BASE_WEEKS.length = 0; clone(next.weeks || []).forEach((w: any) => BASE_WEEKS.push(w));
  rebuildPlanIndex();
}
export function findDay(date: string): any { return DAY_BY_DATE[date] || null; }
export function currentWeekIdx(): number {
  if (!PLAN.weeks.length) return 0;
  const t = todayStr(); const d = findDay(t);
  if (d) return d.weekIdx;
  return t < PLAN.weeks[0].startDate ? 0 : PLAN.weeks.length - 1;
}
export function mergePlan(cur: any, upd: any): any {
  if (upd.meta && upd.weeks && upd.replace !== false && upd.mode !== 'merge') return upd;
  const out = clone(cur && cur.weeks ? cur : { meta: {}, weeks: [] });
  if (upd.meta) out.meta = Object.assign(out.meta || {}, upd.meta);
  (upd.weeks || []).forEach(w => {
    const i = out.weeks.findIndex(x => x.weekNumber === w.weekNumber);
    if (i >= 0) out.weeks[i] = w; else out.weeks.push(w);
  });
  out.weeks.sort((a, b) => a.startDate.localeCompare(b.startDate));
  ['keyDates', 'zonePercents', 'seedMetrics'].forEach(k => { if (Array.isArray(upd[k])) out[k] = upd[k]; });
  return out;
}

/* ---------- Profil und Ziele ---------- */
/* Profil: gespeichert, sonst aus den alten Einstellungen abgeleitet (einmalig übernommen und gespeichert). */
export function profile(): Profile {
  const fb = profileFromLegacy({ ...STATE, planWeeks: BASE_WEEKS }, todayStr());
  return mergeProfile(STATE.profile, fb, todayStr());
}
export function goals(): Goal[] { return Object.values(STATE.goals || {}).filter(Boolean) as Goal[]; }
export function ensureProfileAndGoals(): boolean {
  let changed = false;
  if (HAS_PLAN && !STATE.profile) { STATE.profile = { ...profile(), updatedAt: Date.now() }; changed = true; }
  if (HAS_PLAN && !Object.keys(STATE.goals || {}).length) {
    const g = goalFromPlanMeta(PLAN.meta);
    if (g) { STATE.goals = { [g.id]: { ...g, createdAt: Date.now() } }; changed = true; }
  }
  const p = profile();
  setLang(p.lang); setUnits(p.units);
  return changed;
}
/* Profil-Schwellen spiegeln in die alten settings-Felder, die Teile der App und der Server noch lesen */
export function saveProfile(p: Profile): void {
  STATE.profile = { ...p, updatedAt: Date.now() };
  Object.assign(STATE.settings, { lthrRun: p.thresholds.lthrRun, lthrBike: p.thresholds.lthrBike, thresholdPaceRunSec: p.thresholds.thresholdPaceRunSec, thresholdSpeedBikeKmh: p.thresholds.thresholdSpeedBikeKmh });
  const age = p.birthYear ? +todayStr().slice(0, 4) - p.birthYear : null;
  STATE.nutritionProfile = { ...STATE.nutritionProfile, ...(age ? { age } : {}), ...(p.heightCm ? { heightCm: p.heightCm } : {}), ...(p.weightKg ? { weightKg: p.weightKg } : {}), pal: p.pal };
  setLang(p.lang); setUnits(p.units);
  saveState();
}
/* Einmalige Bereinigung (Auftrag 4 A1): Frühere Versionen haben auf jedem Gerät die Werte des Betreibers als Standard gespeichert
   (Schwellenpuls 170/162 bzw. 165, Schwellen-Pace 5:39, Rad 28 km/h). Auf Geräten, die nicht zum Betreiber-Konto gehören, gelten sie
   ab jetzt als „geschätzt“ und werden aus dem eigenen Profil neu berechnet. Eigene Eingaben (andere Zahlen) bleiben. */
export function scrubLegacyDefaults(): boolean {
  let owner: any = null; try { owner = JSON.parse(localStorage.getItem(STORAGE.owner) || 'null'); } catch (e) {}
  if (owner === 1 || STATE.legacyScrubbed) return false;
  const OLD: Record<string, number[]> = { lthrRun: [170], lthrBike: [162, 165], thresholdPaceRunSec: [339], thresholdSpeedBikeKmh: [28] };
  const s = STATE.settings || {};
  const looksOld = (o: any) => !!o && o.lthrRun === 170 && o.thresholdPaceRunSec === 339 && o.thresholdSpeedBikeKmh === 28;
  let changed = false;
  if (looksOld(s)) { Object.keys(OLD).forEach(k => { delete s[k]; }); changed = true; }
  if (s.readiness && s.readiness.rhrMax === 65 && s.readiness.hrvMin === 35) { s.readiness = { tempMax: s.readiness.tempMax ?? 0.5 }; changed = true; }
  const th = STATE.profile && STATE.profile.thresholds;
  if (looksOld(th)) {
    const est = new Set<string>(th.estimated || []);
    Object.entries(OLD).forEach(([k, vals]) => { if (vals.includes(th[k])) { th[k] = 0; est.add(k); } });
    th.estimated = [...est]; changed = true;
    STATE.profile = { ...profile(), updatedAt: Date.now() }; // Schätzungen gleich speichern (auch für den Server)
  }
  STATE.legacyScrubbed = true;
  void changed; return true; // beim ersten Lauf immer speichern (Merker legacyScrubbed)
}
{ const a = scrubLegacyDefaults(); const b = ensureProfileAndGoals(); if (a || b) saveState(); }
/* Auftrag 11: unplausible Profildaten reparieren (z. B. Geburtsjahr „197“ → negative Pulswerte) und Spiele ohne Spieltage entfernen */
export function repairOnStart(): boolean {
  if (!STATE.profile) return false;
  const today = todayStr(); let changed = false;
  const fx = sanitizeProfile(profile(), today);
  if (fx.changed) {
    saveProfile(fx.profile); changed = true;
    if (STATE.nutritionProfile && (STATE.nutritionProfile.age > 110 || STATE.nutritionProfile.age < 5)) delete STATE.nutritionProfile.age;
    if (fx.badBirthYear != null) {
      const id = 'msg-birthyear-' + today;
      STATE.coachMsgs[id] = { id, at: Date.now(), date: today, kind: 'info', from: 'coach', title: 'Bitte Geburtsjahr prüfen', unread: true, important: true,
        text: `Als Geburtsjahr stand „${fx.badBirthYear}“ im Profil. Damit konnte ich Alter und Pulsbereiche nicht richtig berechnen. Trag es bitte unter Mehr → Profil und Ziele ein (vier Ziffern, z. B. 1975). Bis dahin rechne ich mit vorsichtigen Standardwerten.` };
    }
  }
  const ghosts = ghostGames(BASE_WEEKS, profile(), today);
  if (ghosts.length) {
    const now = Date.now();
    ghosts.forEach((g, i) => { const id = `nogame-${g.id}`; if (!STATE.adjustments[id]) { STATE.adjustments[id] = { id, group: 'nogame-' + today, type: 'cancel', removed: true, sessionId: g.id, date: today, createdAt: now + i, what: `${g.title} entfällt`, reason: 'Keine Spiele eingetragen' }; changed = true; } });
    if (changed) rebuildPlanIndex();
  }
  return changed;
}
{ try { if (repairOnStart()) saveState(); } catch (e) { /* nie den Start verhindern */ } }
/* Einmalig je Einheit: Werte aus alten Notizen in die Felder übertragen (Auftrag 7). Die Notiz bleibt. */
{ try { if (migrateNotes(STATE, BASE_WEEKS)) saveState(); } catch (e) { /* nie den Start verhindern */ } }

/* Anzeige arbeitet mit abgeleiteten Orten; Istwerte werden am unveraenderten Original bearbeitet. */
export function effectiveCustomWorkouts(): Record<string,any[]> { return applyCustomPlanAdjustments(STATE.customWorkouts||{},STATE.adjustments||{}); }
export function findCustomRecord(id:string):any { return Object.values(STATE.customWorkouts||{}).flat().find((w:any)=>w.id===id)||null; }
