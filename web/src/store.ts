/* Plan und Zustand der App (localStorage), Plan-Index mit Anpassungen. */
import * as CoachCore from '../../shared/core';
import { clone, todayStr } from './util';
import { toast } from './toast';
import { STORAGE } from './config';
import { type Profile, profileFromLegacy, mergeProfile } from '../../shared/profile';
import { type Goal, goalFromPlanMeta } from '../../shared/goals';
import { setLang, setUnits } from '../../shared/i18n';

export const PLAN_KEY = STORAGE.plan;
export const LS_KEY = STORAGE.state;
const UI_KEY = STORAGE.ui;
export const DEFAULT_ZONES = [
  { zone: 1, label: 'Recovery', low: 0, high: 81 }, { zone: 2, label: 'Aerobic (Grundlage)', low: 81, high: 89 },
  { zone: 3, label: 'Tempo', low: 90, high: 93 }, { zone: 4, label: 'Schwelle', low: 94, high: 102 }, { zone: 5, label: 'VO2max/Anaerob', low: 102, high: 999 }
];
export function readPlan(): any {
  try { return JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); } catch (e) { return null; }
}
const PLAN_RAW = readPlan();
export const HAS_PLAN = !!(PLAN_RAW && Array.isArray(PLAN_RAW.weeks) && PLAN_RAW.weeks.length);
export const PLAN: any = HAS_PLAN ? PLAN_RAW : { meta: { eventDate: '2029-09-15' }, weeks: [], keyDates: [] };
if (!PLAN.meta) PLAN.meta = { eventDate: '2029-09-15' };
if (!PLAN.meta.eventDate) PLAN.meta.eventDate = '2029-09-15';
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
    settings: {
      lthrRun: PLAN.meta.defaultLthrRun || 170, lthrBike: PLAN.meta.defaultLthrBike || 165,
      thresholdPaceRunSec: PLAN.meta.defaultThresholdPaceRunSec || 339, thresholdSpeedBikeKmh: PLAN.meta.defaultThresholdSpeedBikeKmh || 28,
      readiness: { rhrMax: 56, hrvMin: 65, tempMax: 0.5 }
    },
    weekNotes: {}, nutrition: {},
    nutritionProfile: { age: 17, heightCm: 184, weightKg: 73, pal: 1.4 },
    illnessPeriods: clone(PLAN.seedIllness || []),
    adjustments: {},
    profile: null, goals: {}, activities: {}, coachMsgs: {}, coachNotes: {}, raceResults: {}, meals: {},
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
  const bs = defaultState().settings;
  ['lthrRun', 'lthrBike', 'thresholdPaceRunSec', 'thresholdSpeedBikeKmh'].forEach(k => { if (out.settings[k] == null) out.settings[k] = bs[k]; });
  if (!out.settings.readiness) out.settings.readiness = bs.readiness;
  if (!out.weekNotes) out.weekNotes = {};
  if (!out.nutrition) out.nutrition = {};
  if (!out.nutritionProfile) out.nutritionProfile = base.nutritionProfile;
  if (!Array.isArray(out.illnessPeriods)) out.illnessPeriods = clone(PLAN.seedIllness || []);
  if (!out.adjustments || typeof out.adjustments !== 'object') out.adjustments = {};
  ['goals', 'activities', 'coachMsgs', 'coachNotes', 'raceResults', 'meals'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
  out.trend.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
function loadState(): any {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return mergeIntoDefaults(JSON.parse(raw)); } catch (e) {}
  for (const k of STORAGE.legacyState) { try { const old = localStorage.getItem(k); if (old) return mergeIntoDefaults(JSON.parse(old)); } catch (e) {} }
  return mergeIntoDefaults(null);
}

/* STATE ist ein fester Behälter. replaceState tauscht den Inhalt aus, damit alle Module dieselbe Referenz behalten. */
export const STATE: any = loadState();
export function replaceState(next: any): void {
  Object.keys(STATE).forEach(k => { delete STATE[k]; });
  Object.assign(STATE, next);
}

let saveListener: (() => void) | null = null;
export function onSave(fn: () => void): void { saveListener = fn; }
let saveWarned = false;
let saveTimer: any = null;
export function saveState(): void {
  clearTimeout(saveTimer); saveTimer = null;
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast('Dieser Browser speichert gerade nicht. Mach ein Backup unter Einstellungen.'); } }
  if (saveListener) saveListener();
}
export function saveSoon(): void { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 350); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveState(); });
window.addEventListener('pagehide', () => { if (saveTimer) saveState(); });

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
  return mergeProfile(STATE.profile, fb);
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
if (ensureProfileAndGoals()) saveState();
