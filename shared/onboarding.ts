/* Onboarding für neue Nutzer: Fragen in Blöcken, mit Fortschritt, überspringbar, später unter „Profil“ ergänzbar.
   Was verbundene Dienste schon wissen (Trainings der letzten 3 Monate, Ruhepuls, Schlaf), wird nicht gefragt,
   sondern vorgeschlagen und nur bestätigt. Pflicht (*) sind nur Fragen, ohne die kein sicherer Plan möglich ist. */
import { defaultProfile, type Profile, type SportKey, type DayWindow } from './profile';
import { GOALS, type Goal, type GoalType } from './goals';
import { generatePlan, type GenResult } from './plangen';
import { addDays } from './core';

export type QType = 'goals' | 'select' | 'multi' | 'number' | 'text' | 'yesno' | 'windows' | 'fixed' | 'connect' | 'info';
export interface Question { id: string; label: string; type: QType; required?: boolean; options?: [string, string][]; unit?: string; hint?: string; min?: number; max?: number; show?: (a: Answers) => boolean }
export interface Block { id: string; title: string; intro: string; questions: Question[] }
export type Answers = Record<string, any>;

const SPORTS: [string, string][] = [['swim', 'Schwimmen'], ['bike', 'Rad'], ['run', 'Laufen'], ['strength', 'Kraft'], ['football', 'Teamsport']];
export const BLOCKS: Block[] = [
  { id: 'goal', title: 'Ziel und Motivation', intro: 'Worauf trainierst du hin?', questions: [
    { id: 'goals', label: 'Dein Ziel', type: 'goals', required: true, hint: 'Art, Datum und Priorität. Mehrere Ziele sind möglich.' },
    { id: 'outcome', label: 'Was willst du erreichen?', type: 'select', options: [['finish', 'Gesund ankommen'], ['time', 'Persönliche Bestzeit'], ['place', 'Platzierung']] },
    { id: 'targetTime', label: 'Wunschzeit (h:mm)', type: 'text', show: a => a.outcome === 'time' },
    { id: 'why', label: 'Warum dieses Ziel? Was wäre ein Erfolg?', type: 'text', hint: 'Hilft dem Coach, dich zu motivieren.' },
    { id: 'testRaces', label: 'Gibt es Wettkämpfe davor, die als Test dienen könnten?', type: 'text' }
  ] },
  { id: 'person', title: 'Person und Gesundheit', intro: 'Damit der Plan sicher ist.', questions: [
    { id: 'birthYear', label: 'Geburtsjahr', type: 'number', required: true, min: 1930, max: 2020 },
    { id: 'sex', label: 'Geschlecht (optional)', type: 'select', options: [['', 'keine Angabe'], ['f', 'weiblich'], ['m', 'männlich'], ['d', 'divers']] },
    { id: 'heightCm', label: 'Größe (optional)', type: 'number', unit: 'cm', min: 120, max: 230 },
    { id: 'weightKg', label: 'Gewicht (optional)', type: 'number', unit: 'kg', min: 30, max: 200 },
    { id: 'injuries', label: 'Aktuelle Verletzungen oder Beschwerden', type: 'text', required: true, hint: '„keine“ ist auch eine Antwort.' },
    { id: 'pastInjuries', label: 'Frühere Verletzungen, die öfter wiederkommen', type: 'text' },
    { id: 'medical', label: 'Gibt es gesundheitliche Einschränkungen (Herz, Asthma, Diabetes, Schwangerschaft …)?', type: 'yesno', hint: 'Bei Ja: bitte vor dem Start ärztlich abklären. Der Plan startet dann besonders vorsichtig.' },
    { id: 'cycle', label: 'Zyklus berücksichtigen?', type: 'yesno', show: a => a.sex === 'f' }
  ] },
  { id: 'background', title: 'Sport-Hintergrund', intro: 'Wo stehst du gerade?', questions: [
    { id: 'experienceYears', label: 'Wie lange machst du schon Ausdauersport?', type: 'number', unit: 'Jahre', min: 0, max: 60 },
    { id: 'sports', label: 'Welche Sportarten machst du?', type: 'multi', options: SPORTS, required: true },
    { id: 'teamSportName', label: 'Welcher Teamsport?', type: 'text', show: a => (a.sports || []).includes('football') },
    { id: 'weeklyHoursNow', label: 'Stunden pro Woche in den letzten 4-8 Wochen (alle Sportarten)', type: 'number', unit: 'h', required: true, min: 0, max: 40 },
    { id: 'longest', label: 'Längste Einheit zuletzt', type: 'text', hint: 'z. B. „Lauf 75 min, Rad 2 h“' },
    { id: 'tests', label: 'Bekannte Werte (Schwellenpuls, FTP, CSS, 5-km-Zeit …)', type: 'text' },
    { id: 'swimStrokes', label: 'Schwimmen: welche Lagen?', type: 'multi', options: [['free', 'Kraul'], ['breast', 'Brust'], ['back', 'Rücken'], ['fly', 'Delfin']], show: a => (a.sports || []).includes('swim') },
    { id: 'swimContinuous', label: 'Wie viele Meter Kraul am Stück?', type: 'number', unit: 'm', show: a => (a.sports || []).includes('swim') },
    { id: 'openWater', label: 'Freiwasser-Erfahrung?', type: 'yesno', show: a => (a.sports || []).includes('swim') },
    { id: 'bikeSetup', label: 'Rad: was hast du?', type: 'multi', options: [['road', 'Rennrad'], ['tt', 'Zeitfahrrad'], ['trainer', 'Rollentrainer'], ['power', 'Wattmessung'], ['clip', 'Klickpedale'], ['group', 'fahre in Gruppen']], show: a => (a.sports || []).includes('bike') },
    { id: 'runSurface', label: 'Laufen: Untergrund, Schuhe, typische Beschwerden', type: 'text', show: a => (a.sports || []).includes('run') }
  ] },
  { id: 'time', title: 'Zeit und Alltag', intro: 'Der Plan passt sich deinem Leben an, nicht umgekehrt.', questions: [
    { id: 'windows', label: 'Wann kannst du trainieren?', type: 'windows', required: true, hint: 'z. B. Di 6:15-6:55 vor der Schule' },
    { id: 'weeklyHours', label: 'Höchstens so viele Stunden pro Woche', type: 'number', unit: 'h', required: true, min: 1, max: 30 },
    { id: 'maxDayHours', label: 'Höchstens so lange an einem Wochenendtag', type: 'number', unit: 'h', required: true, min: 0.5, max: 10 },
    { id: 'fixed', label: 'Feste Termine (Teamsport-Training, Spiele, Schule, Arbeit …)', type: 'fixed' },
    { id: 'busy', label: 'Bekannte Engpässe (Prüfungen, Urlaub, Reisen)', type: 'text' },
    { id: 'facilities', label: 'Zugang zu', type: 'multi', options: [['pool', 'Schwimmbad'], ['track', 'Laufbahn'], ['gym', 'Fitnessstudio']] },
    { id: 'poolDays', label: 'Schwimmbad an welchen Tagen?', type: 'text', show: a => (a.facilities || []).includes('pool') },
    { id: 'timeOfDay', label: 'Lieber morgens oder abends?', type: 'select', options: [['', 'egal'], ['morning', 'morgens'], ['evening', 'abends']] },
    { id: 'social', label: 'Lieber allein oder in der Gruppe?', type: 'select', options: [['', 'egal'], ['alone', 'allein'], ['group', 'Gruppe']] }
  ] },
  { id: 'recovery', title: 'Erholung und Lebensstil', intro: 'Erholung ist Teil des Trainings.', questions: [
    { id: 'sleep', label: 'Übliche Schlafdauer', type: 'number', unit: 'h', min: 3, max: 12 },
    { id: 'bedtime', label: 'Übliche Schlafenszeit', type: 'text' },
    { id: 'stress', label: 'Stress (Schule, Job)', type: 'select', options: [['low', 'wenig'], ['mid', 'mittel'], ['high', 'viel']] },
    { id: 'diet', label: 'Ernährung', type: 'select', options: [['', 'alles'], ['vegetarian', 'vegetarisch'], ['vegan', 'vegan']] },
    { id: 'allergies', label: 'Allergien oder Unverträglichkeiten', type: 'text' },
    { id: 'trackCalories', label: 'Kalorien tracken?', type: 'yesno' }
  ] },
  { id: 'prefs', title: 'Vorlieben für den Plan', intro: 'Wie soll dein Coach planen?', questions: [
    { id: 'planStyle', label: 'Plan genau vorgeben oder flexibel?', type: 'select', options: [['flexible', 'flexibel mit Vorschlägen'], ['strict', 'genau vorgeben']] },
    { id: 'likes', label: 'Was magst du lieber?', type: 'select', options: [['balanced', 'ausgewogen'], ['intensity', 'harte Einheiten'], ['volume', 'lieber Umfang']] },
    { id: 'strength', label: 'Krafttraining?', type: 'select', options: [['1', '1× pro Woche'], ['2', '2× pro Woche'], ['0', 'nein']] },
    { id: 'notify', label: 'Mitteilungen vom Coach', type: 'select', options: [['normal', 'morgens und bei Änderungen'], ['few', 'nur wichtige'], ['none', 'keine']] }
  ] },
  { id: 'devices', title: 'Geräte und Verbindungen', intro: 'Verbinde deine Uhr oder deinen Ring, dann musst du weniger eintragen.', questions: [
    { id: 'devices', label: 'Was nutzt du?', type: 'multi', options: [['applewatch', 'Apple Watch'], ['oura', 'Oura'], ['garmin', 'Garmin'], ['polar', 'Polar'], ['whoop', 'WHOOP'], ['withings', 'Withings'], ['other', 'andere']] },
    { id: 'connect', label: 'Jetzt verbinden', type: 'connect' }
  ] },
  { id: 'test', title: 'Einstiegstest', intro: 'Optional, aber empfohlen.', questions: [
    { id: 'wantTests', label: 'Fehlende Schwellenwerte in den ersten 2 Wochen mit kurzen Tests bestimmen?', type: 'yesno', hint: '30-min-Lauftest, 20-min-Radtest, 400/200-m-Schwimmtest. Danach stellt die App Zonen und Plan neu ein.' }
  ] }
];

export function visibleQuestions(b: Block, a: Answers): Question[] { return b.questions.filter(q => !q.show || q.show(a)); }
export function missingRequired(a: Answers): { block: string; q: Question }[] {
  const out: { block: string; q: Question }[] = [];
  for (const b of BLOCKS) for (const q of visibleQuestions(b, a)) {
    if (!q.required) continue;
    const v = a[q.id];
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (q.type === 'windows' && !Object.keys(v || {}).length);
    if (empty) out.push({ block: b.id, q });
  }
  return out;
}
export function progress(a: Answers): number {
  let n = 0, done = 0;
  for (const b of BLOCKS) for (const q of visibleQuestions(b, a)) { if (q.type === 'info' || q.type === 'connect') continue; n++; const v = a[q.id]; if (!(v == null || v === '' || (Array.isArray(v) && !v.length))) done++; }
  return n ? Math.round(done / n * 100) : 0;
}

/* Vorschläge aus verbundenen Daten: Stunden pro Woche, Sportarten, Schlaf, längste Einheiten */
export function prefillFromData(acts: any[], trend: any[], today: string): Answers {
  const from = addDays(today, -91);
  const recent = (acts || []).filter(a => a && !a.mergedInto && a.date >= from && a.date <= today);
  const out: Answers = {};
  if (recent.length) {
    const last8 = recent.filter(a => a.date >= addDays(today, -56));
    out.weeklyHoursNow = Math.round(last8.reduce((s, a) => s + (a.min || 0), 0) / 60 / 8 * 10) / 10;
    const sp = new Set(recent.map(a => a.sport === 'walk' ? 'run' : a.sport).filter(s => ['swim', 'bike', 'run', 'strength', 'football'].includes(s)));
    out.sports = [...sp];
    const longest = (s: string) => Math.max(0, ...recent.filter(a => a.sport === s).map(a => a.min || 0));
    out.longest = [['run', 'Lauf'], ['bike', 'Rad'], ['swim', 'Schwimmen']].filter(([s]) => longest(s)).map(([s, l]) => `${l} ${longest(s)} min`).join(', ');
    const sw = recent.filter(a => a.swim && a.swim.longestContinuousM).map(a => a.swim.longestContinuousM);
    if (sw.length) out.swimContinuous = Math.max(...sw);
  }
  const sl = (trend || []).filter(p => p && p.date >= addDays(today, -28) && p.sleepHours).map(p => p.sleepHours);
  if (sl.length) out.sleep = Math.round(sl.reduce((a, b) => a + b, 0) / sl.length * 10) / 10;
  return out;
}

function parseHm(s: string): number | null { const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s || '').trim()); return m ? +m[1] * 3600 + (+(m[2] || 0)) * 60 : null; }

/* Antworten → Profil, Ziele, Plan */
export function applyOnboarding(a: Answers, today: string, base?: Profile): { profile: Profile; goals: Goal[]; gen: GenResult | null; warnings: string[] } {
  const p: Profile = { ...defaultProfile(), ...(base || {}) };
  const warnings: string[] = [];
  if (a.birthYear) p.birthYear = +a.birthYear;
  if (a.sex) p.sex = a.sex;
  if (a.heightCm) p.heightCm = +a.heightCm;
  if (a.weightKg) p.weightKg = +a.weightKg;
  p.injuries = [a.injuries, a.pastInjuries ? 'früher: ' + a.pastInjuries : ''].filter(x => x && !/^keine?$/i.test(String(x).trim())).join('; ');
  p.medicalCaution = !!a.medical;
  if (a.medical) warnings.push('Bitte lass vor dem Start ärztlich abklären, ob du trainieren darfst. Der Plan startet besonders vorsichtig.');
  if (a.experienceYears != null) p.experienceYears = +a.experienceYears;
  if (Array.isArray(a.sports) && a.sports.length) p.sports = a.sports as SportKey[];
  if (a.strength === '0') p.sports = p.sports.filter(s => s !== 'strength');
  else if (a.strength && !p.sports.includes('strength')) p.sports = [...p.sports, 'strength'];
  if (a.teamSportName) p.teamSportName = String(a.teamSportName);
  if (a.weeklyHours) p.weeklyHours = +a.weeklyHours;
  if (a.maxDayHours) p.maxDayHours = +a.maxDayHours;
  if (a.windows && typeof a.windows === 'object') p.availability = a.windows as Record<number, DayWindow[]>;
  if (Array.isArray(a.fixed)) p.fixed = a.fixed;
  if (a.diet === 'vegetarian' || a.diet === 'vegan') p.vegetarian = true;
  p.trackCalories = !!a.trackCalories;
  p.planStyle = a.planStyle === 'strict' ? 'strict' : 'flexible';
  p.likesIntensity = a.likes === 'intensity' ? 'intensity' : a.likes === 'volume' ? 'volume' : 'balanced';
  p.answers = { ...a };
  const goals: Goal[] = (Array.isArray(a.goals) ? a.goals : []).filter((g: any) => g && GOALS[g.type as GoalType]).map((g: any, i: number) => ({
    id: g.id || `goal-${i + 1}`, type: g.type, name: g.name || g.type, date: g.date || null, priority: g.priority || (i === 0 ? 'A' : 'B'),
    outcome: a.outcome || 'finish', targetTimeSec: i === 0 && a.outcome === 'time' ? parseHm(a.targetTime) : null, why: a.why || undefined
  }));
  const main = goals.find(g => g.priority === 'A') || goals[0];
  let gen: GenResult | null = null;
  if (main) {
    const need = a.wantTests ? { run: p.sports.includes('run'), bike: p.sports.includes('bike'), swim: p.sports.includes('swim') } : undefined;
    gen = generatePlan({ profile: p, goal: { ...main, date: main.date || addDays(today, 84) }, today, currentWeeklyHours: a.weeklyHoursNow != null ? +a.weeklyHoursNow : null, needTests: need });
    gen.violations.filter(v => v.rule === 'age').forEach(v => warnings.push(v.msg));
  }
  return { profile: p, goals, gen, warnings };
}
