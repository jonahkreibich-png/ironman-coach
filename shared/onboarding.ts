/* Onboarding für neue Nutzer: Fragen in Blöcken, mit Fortschritt, überspringbar, später unter „Profil“ ergänzbar.
   Was verbundene Dienste schon wissen (Trainings der letzten 3 Monate, Schlaf), wird nicht gefragt, sondern vorgeschlagen.
   Pflicht (*) sind nur Fragen, ohne die kein sicherer Plan möglich ist.
   Auftrag 4: Zeit pro Tag statt Uhrzeiten (B1), Häufigkeit je Sportart (B2), Teamsport (B3), Wunschzeit je Ziel (B4),
   Können und Berücksichtigungen (B5), Fahrrad-Typen (B6), Zusammenfassung „Das habe ich verstanden“ (F2). */
import { defaultProfile, withEstimates, type Profile, type SportKey, type DayWindow, type DayLoad } from './profile';
import { GOALS, type Goal, type GoalType } from './goals';
import { generatePlan, type GenResult } from './plangen';
import { replanPlan } from './replan';
import { addDays } from './core';
import { rulesOf, describe as ruleText } from './constraints';
import { parseFor } from './ruleparse';
import { weekSummary } from './weekgrid';

export type QType = 'week' | 'hoursnow' | 'grid' | 'goals' | 'select' | 'multi' | 'number' | 'text' | 'notes' | 'yesno' | 'dayload' | 'freq' | 'days' | 'date' | 'bests' | 'windows' | 'fixed' | 'connect' | 'info';
export interface Question { id: string; label: string; type: QType; required?: boolean; options?: [string, string][]; unit?: string; hint?: string; min?: number; max?: number; show?: (a: Answers) => boolean }
export interface Block { id: string; title: string; intro: string; questions: Question[] }
export type Answers = Record<string, any>;

export const SPORT_OPTIONS: [string, string][] = [['swim', 'Schwimmen'], ['bike', 'Rad'], ['run', 'Laufen'], ['strength', 'Kraft']];
/* Auftrag 19: Gelände in der Nähe (Hügel-, Bahn- und Laufband-Einheiten; ohne Angabe gibt es Ersatz) */
export const TERRAIN_OPTIONS: [string, string][] = [['hills', 'Hügel oder Berge'], ['track', 'Laufbahn'], ['treadmill', 'Laufband']];
export const SWIM_GEAR_OPTIONS: [string, string][] = [['board', 'Kickbrett'], ['buoy', 'Pull Buoy'], ['fins', 'Flossen'], ['paddles', 'Paddles'], ['snorkel', 'Frontschnorchel']];
export const BIKE_OPTIONS: [string, string][] = [['road', 'Rennrad'], ['gravel', 'Gravelbike'], ['mtb', 'Mountainbike'], ['tt', 'Triathlon-/Zeitfahrrad'], ['trekking', 'Trekking-/Stadtrad'], ['ebike', 'E-Bike'], ['trainer', 'Rollentrainer/Smarttrainer'], ['spin', 'Indoor-Bike/Spinning']];
export const DAYLOAD_OPTIONS: [DayLoad, string][] = [[0, 'kein Training'], [1, 'kurz (bis 45 min)'], [2, 'mittel (bis 90 min)'], [3, 'lang (mehr als 90 min)']];
const has = (a: Answers, s: string) => (a.sports || []).includes(s);
const MONTHS: [string, string][] = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].map((m, i) => [String(i + 1), m]);
const teamOn = (a: Answers) => a.teamYes === true;

export const BLOCKS: Block[] = [
  { id: 'goal', title: 'Ziele und Wunschzeiten', intro: 'Worauf trainierst du hin? Mehrere Ziele sind möglich.', questions: [
    { id: 'goals', label: 'Deine Ziele', type: 'goals', required: true, hint: 'Pro Ziel: Art, Datum, Priorität (A = Hauptziel, B = wichtig, C = Trainingsrennen) und, wenn du willst, eine Wunschzeit für genau dieses Ziel.' },
    { id: 'why', label: 'Warum diese Ziele? Was wäre ein Erfolg?', type: 'text', hint: 'Hilft dem Coach, dich zu motivieren.' }
  ] },
  { id: 'person', title: 'Person und Gesundheit', intro: 'Damit der Plan sicher ist.', questions: [
    { id: 'birthYear', label: 'Geburtsjahr', type: 'number', required: true, min: 1930, max: 2020 },
    { id: 'sex', label: 'Geschlecht (optional)', type: 'select', options: [['', 'keine Angabe'], ['f', 'weiblich'], ['m', 'männlich'], ['d', 'divers']] },
    { id: 'heightCm', label: 'Größe (optional)', type: 'number', unit: 'cm', min: 120, max: 230 },
    { id: 'weightKg', label: 'Gewicht (optional)', type: 'number', unit: 'kg', min: 30, max: 200 },
    { id: 'injuries', label: 'Aktuelle Verletzungen oder Beschwerden', type: 'text', required: true, hint: '„keine“ ist auch eine Antwort.' },
    { id: 'medical', label: 'Gibt es gesundheitliche Einschränkungen (Herz, Asthma, Diabetes, Schwangerschaft …)?', type: 'yesno', hint: 'Bei Ja: bitte vor dem Start ärztlich abklären. Der Plan startet dann besonders vorsichtig.' }
  ] },
  { id: 'background', title: 'Sportarten und Erfahrung', intro: 'Wo stehst du gerade?', questions: [
    { id: 'sports', label: 'Welche Sportarten willst du trainieren?', type: 'multi', options: SPORT_OPTIONS, required: true, hint: 'Teamsport kommt gleich extra.' },
    { id: 'experienceYears', label: 'Wie lange machst du schon Ausdauersport?', type: 'number', unit: 'Jahre', min: 0, max: 60 },
    { id: 'weeklyHoursNow', label: 'Wie viele Stunden pro Woche hast du in den letzten 4-8 Wochen trainiert (alle Sportarten)?', type: 'hoursnow', unit: 'h', required: true, min: 0, max: 40, hint: 'Grob reicht. Rechner: wie oft pro Woche × wie lange. „Weiß ich nicht“ geht auch: dann startet der Plan vorsichtig und passt sich nach 2 Wochen an deine echten Daten an.' },
    { id: 'bests', label: 'Bestzeiten (optional, macht die Zonen genauer)', type: 'bests', show: a => has(a, 'run') || has(a, 'swim') }
  ] },
  { id: 'skills', title: 'Können und Ausrüstung', intro: 'Damit der Plan nichts verlangt, was du (noch) nicht kannst.', questions: [
    { id: 'swimCrawl', label: 'Schwimmen: Kannst du kraulen?', type: 'select', required: true, hint: '„ja“ heißt: du schwimmst Kraul ohne Hilfe, auch wenn nur kurz. „ein bisschen“: ein paar Züge, die Atmung klappt noch nicht.', options: [['yes', 'ja'], ['some', 'ein bisschen'], ['no', 'nein']], show: a => has(a, 'swim') },
    { id: 'swimCrawlM', label: 'Wie weit kraulst du am Stück?', type: 'number', unit: 'm', min: 0, max: 5000, show: a => has(a, 'swim') && (a.swimCrawl === 'yes' || a.swimCrawl === 'some') },
    { id: 'swimBreast', label: 'Kannst du Brust schwimmen?', type: 'yesno', show: a => has(a, 'swim') && a.swimCrawl !== 'yes' },
    // Auftrag 11: Beckenlänge (Stücke gehen auf) und Freiwasser
    { id: 'poolM', label: 'Wie lang ist dein Becken?', type: 'select', options: [['25', '25 m'], ['50', '50 m'], ['both', 'beides']], show: a => has(a, 'swim'), hint: 'Danach richten sich die Stücke, z. B. keine 75 m im 25-m-Becken.' },
    // Auftrag 14: nur vorhandene Hilfsmittel werden eingeplant
    { id: 'swimGear', label: 'Welche Hilfsmittel hast du?', type: 'multi', options: SWIM_GEAR_OPTIONS, show: a => has(a, 'swim'), hint: 'Nur was du hast (oder im Bad leihen kannst), kommt in den Plan. Nichts davon? Einfach nichts antippen.' },
    { id: 'openWater', label: 'Schwimmst du auch im Freiwasser (See, Meer)?', type: 'yesno', show: a => has(a, 'swim') },
    { id: 'openWaterFrom', label: 'Freiwasser-Saison von', type: 'select', options: MONTHS, show: a => has(a, 'swim') && a.openWater === true },
    { id: 'openWaterTo', label: 'Freiwasser-Saison bis', type: 'select', options: MONTHS, show: a => has(a, 'swim') && a.openWater === true, hint: 'In der Saison und vor Triathlons plant die App ab und zu Freiwasser-Einheiten (Sichten, Orientierung, Start, Neopren).' },
    { id: 'runContinuousMin', label: 'Laufen: Wie lange kannst du am Stück locker laufen?', type: 'number', unit: 'min', min: 0, max: 400, show: a => has(a, 'run') },
    { id: 'bikeLongestMin', label: 'Rad: Längste Fahrt in letzter Zeit?', type: 'number', unit: 'min', min: 0, max: 900, show: a => has(a, 'bike') },
    { id: 'bikes', label: 'Welche Räder hast du?', type: 'multi', options: BIKE_OPTIONS, show: a => has(a, 'bike') },
    { id: 'powerMeter', label: 'Hast du einen Wattmesser am Rad?', type: 'yesno', hint: 'Pedale, Kurbel oder Nabe mit Wattmessung. Die Rolle fragen wir extra. Im Zweifel: Nein.', show: a => has(a, 'bike') },
    // Auftrag 20: Watt von der Rolle zählen nur beim Smart-Trainer; bei der einfachen Rolle sind Watt und Geschwindigkeit geschätzt
    { id: 'trainerType', label: 'Rolle: Smart-Trainer mit Watt oder einfache Rolle?', type: 'select', options: [['smart', 'Smart-Trainer mit Watt'], ['basic', 'einfache Rolle (ohne Watt)']], show: a => has(a, 'bike') && Array.isArray(a.bikes) && (a.bikes.includes('trainer') || a.bikes.includes('spin')), hint: 'Bei einer einfachen Rolle schätzt die App Watt und Geschwindigkeit nur. Dann zählen für den Score Puls, Dauer und Gefühl.' },
    { id: 'terrain', label: 'Was hast du in der Nähe?', type: 'multi', options: TERRAIN_OPTIONS, show: a => has(a, 'run') || has(a, 'bike'), hint: 'Für Berg- und Bahn-Einheiten. Ohne Angabe gibt es Ersatz (z. B. Steigerungen in der Ebene, Rolle mit hohem Widerstand). Die Rolle wählst du oben bei den Rädern.' }
  ] },
  { id: 'team', title: 'Teamsport', intro: 'Fußball, Handball, Basketball oder feste Gruppentermine (z. B. Lauftreff): zählen im Plan als feste Termine und Belastung.', questions: [
    { id: 'teamYes', label: 'Machst du Teamsport oder hast du feste Gruppentermine?', type: 'yesno' },
    { id: 'teamName', label: 'Welche Sportart?', type: 'text', show: teamOn },
    { id: 'teamTrainingDays', label: 'An welchen Tagen ist Training?', type: 'days', show: teamOn },
    { id: 'teamTrainingMinutes', label: 'Wie lange dauert ein Training?', type: 'number', unit: 'min', min: 15, max: 240, show: teamOn },
    // Auftrag 11: erst fragen, ob es überhaupt Spiele gibt; ohne Spiele keine Spiel-Einheiten und keine Spieltag-Regeln
    { id: 'teamGames', label: 'Gibt es Spiele oder Wettkämpfe?', type: 'yesno', show: teamOn },
    { id: 'teamGameDays', label: 'An welchen Tagen sind meist Spiele?', type: 'days', show: a => teamOn(a) && a.teamGames === true },
    { id: 'teamGameMinutes', label: 'Wie lange dauert ein Spiel?', type: 'number', unit: 'min', min: 15, max: 240, show: a => teamOn(a) && a.teamGames === true },
    { id: 'teamSeasonFrom', label: 'Saison von (optional)', type: 'date', show: teamOn },
    { id: 'teamSeasonTo', label: 'Saison bis (optional)', type: 'date', show: teamOn, hint: 'Leer lassen, wenn das ganze Jahr gespielt wird.' }
  ] },
  // Auftrag 11: Zeit nur einmal abfragen – ein Wochenraster, daraus Stunden, längster Tag und Häufigkeit (änderbare Zusammenfassung)
  { id: 'time', title: 'Wochenraster', intro: 'Wann hast du wie viel Zeit, und welche Sportart geht an welchem Tag? Der Plan passt sich deinem Leben an, nicht umgekehrt.', questions: [
    { id: 'dayLoad', label: 'Dein Wochenraster', type: 'week', required: true, hint: 'Zeile „Zeit“: antippen, bis die Zeit für den Tag passt (– kein Training, 45 min, 90 min, lang). Darunter je Sportart: ✓ geht, – lieber nicht, ✕ geht nicht. Teamsport musst du nicht einrechnen.' }
  ] },
  { id: 'notes', title: 'Berücksichtigungen', intro: 'Was soll der Plan noch wissen?', questions: [
    { id: 'notes', label: 'Was soll der Plan noch berücksichtigen?', type: 'notes', hint: 'Ein Satz pro Sache, z. B. „kann mittwochs nicht laufen, nur Samstag oder Sonntag“, „Knie zwickt beim Bergablaufen“, „Urlaub vom 20.12. bis 6.1.“. Die App zeigt dir, was sie verstanden hat.' },
    { id: 'sleep', label: 'Übliche Schlafdauer', type: 'number', unit: 'h', min: 3, max: 12 },
    { id: 'diet', label: 'Ernährung', type: 'select', options: [['', 'alles'], ['vegetarian', 'vegetarisch'], ['vegan', 'vegan']] },
    { id: 'planStyle', label: 'Plan genau vorgeben oder flexibel?', type: 'select', options: [['flexible', 'flexibel mit Vorschlägen'], ['strict', 'genau vorgeben']] }
  ] },
  { id: 'devices', title: 'Geräte und Verbindungen', intro: 'Verbinde deine Uhr oder deinen Ring, dann musst du weniger eintragen.', questions: [
    { id: 'timeOfDay', label: 'Mitteilungen eher …', type: 'select', options: [['', 'egal'], ['morning', 'morgens'], ['evening', 'abends']], hint: 'Nur für die Uhrzeit der Erinnerungen.' },
    { id: 'devices', label: 'Was nutzt du?', type: 'multi', options: [['applewatch', 'Apple Watch'], ['garmin', 'Garmin'], ['coros', 'COROS'], ['suunto', 'Suunto'], ['wahoo', 'Wahoo'], ['polar', 'Polar'], ['oura', 'Oura'], ['whoop', 'WHOOP'], ['withings', 'Withings'], ['other', 'andere']] },
    { id: 'connect', label: 'Jetzt verbinden', type: 'connect' }
  ] },
  { id: 'test', title: 'Einstiegstest', intro: 'Optional, aber empfohlen.', questions: [
    { id: 'wantTests', label: 'Fehlende Werte in den ersten 2 Wochen mit kurzen Tests bestimmen?', type: 'yesno', hint: '30-min-Lauftest, 20-min-Radtest, 400/200-m-Schwimmtest (nur wenn du schon kraulen kannst). Danach stellt die App Zonen und Plan neu ein.' }
  ] }
];

export function visibleQuestions(b: Block, a: Answers): Question[] { return b.questions.filter(q => !q.show || q.show(a)); }
function isEmpty(q: Question, v: any): boolean {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return true;
  if (q.type === 'dayload' || q.type === 'week') return !Object.values(v || {}).some((x: any) => +x > 0);
  if (q.type === 'windows') return !Object.keys(v || {}).length;
  return false;
}
export function missingRequired(a: Answers): { block: string; q: Question }[] {
  const out: { block: string; q: Question }[] = [];
  for (const b of BLOCKS) for (const q of visibleQuestions(b, a)) {
    if (!q.required) continue;
    // alte Antworten mit Zeitfenstern gelten auch
    if ((q.type === 'dayload' || q.type === 'week') && a.windows && Object.keys(a.windows).length) continue;
    if (isEmpty(q, a[q.id])) out.push({ block: b.id, q });
  }
  return out;
}
export function progress(a: Answers): number {
  let n = 0, done = 0;
  for (const b of BLOCKS) for (const q of visibleQuestions(b, a)) { if (q.type === 'info' || q.type === 'connect') continue; n++; if (!isEmpty(q, a[q.id])) done++; }
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
    const sp = new Set(recent.map(a => a.sport === 'walk' ? 'run' : a.sport).filter(s => ['swim', 'bike', 'run', 'strength'].includes(s)));
    out.sports = [...sp];
    const longest = (s: string) => Math.max(0, ...recent.filter(a => a.sport === s).map(a => a.min || 0));
    if (longest('run')) out.runContinuousMin = Math.round(longest('run'));
    if (longest('bike')) out.bikeLongestMin = Math.round(longest('bike'));
    const sw = recent.filter(a => a.swim && a.swim.longestContinuousM).map(a => a.swim.longestContinuousM);
    if (sw.length) { out.swimCrawlM = Math.max(...sw); out.swimCrawl = 'yes'; }
    if (recent.some(a => a.sport === 'football')) out.teamYes = true;
  }
  const sl = (trend || []).filter(p => p && p.date >= addDays(today, -28) && p.sleepHours).map(p => p.sleepHours);
  if (sl.length) out.sleep = Math.round(sl.reduce((a, b) => a + b, 0) / sl.length * 10) / 10;
  return out;
}

/* Dauer aus Sekunden (Zahl) oder Text: drei Teile h:mm:ss, zwei Teile je nach Art m:ss oder h:mm */
export function parseDur(s: any, two: 'ms' | 'hm'): number | null {
  if (typeof s === 'number') return s > 0 ? s : null;
  const m = /^(\d{1,3})(?::(\d{1,2}))?(?::(\d{1,2}))?$/.exec(String(s || '').trim());
  if (!m) return null;
  if (m[3] != null) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  if (m[2] != null) return two === 'ms' ? +m[1] * 60 + +m[2] : +m[1] * 3600 + +m[2] * 60;
  return two === 'ms' ? +m[1] * 60 : +m[1] * 3600;
}
export function parseHm(s: any): number | null {
  if (typeof s === 'number') return s > 0 ? s : null;
  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(String(s || '').trim());
  if (!m) return null;
  return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 3600 + (+(m[2] || 0)) * 60;
}
/* Verfügbare Tage für eine Sportart (Schwimmbad-Tage aus den Berücksichtigungen werden im Plan beachtet) */
export function availableDays(a: Answers): number {
  const dl = a.dayLoad || {};
  return Object.values(dl).filter((x: any) => +x > 0).length;
}
const num = (v: any) => (v == null || v === '' ? null : +v);
/* Wunschzeit eines Ziels: gesamt oder Summe der Disziplinen (+ Wechsel) */
export function goalTarget(g: any): number | null {
  if (g.timeMode === 'split' && g.splits && Object.values(g.splits).some((x: any) => x > 0)) {
    const sum = Object.values(g.splits).reduce((s: number, x: any) => s + (+x || 0), 0) as number;
    return sum ? sum + (GOALS[g.type as GoalType] && GOALS[g.type as GoalType].group === 'tri' ? 240 : 0) : null;
  }
  return g.targetTime != null ? parseHm(g.targetTime) : null;
}

/* Antworten → Profil, Ziele, Plan */
const validGoalDate = (d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
export function profileFromAnswers(a: Answers, today: string, base?: Profile): { profile: Profile; goals: Goal[]; warnings: string[] } {
  const p: Profile = { ...defaultProfile(), ...(base || {}) };
  const warnings: string[] = [];
  if (a.birthYear) p.birthYear = +a.birthYear;
  if (a.sex !== undefined) p.sex = a.sex || null;
  if (a.heightCm) p.heightCm = +a.heightCm;
  if (a.weightKg) p.weightKg = +a.weightKg;
  p.injuries = [a.injuries, a.pastInjuries ? 'früher: ' + a.pastInjuries : ''].filter(x => x && !/^keine?\.?$/i.test(String(x).trim())).join('; ');
  p.medicalCaution = !!a.medical;
  if (a.medical) warnings.push('Bitte lass vor dem Start ärztlich abklären, ob du trainieren darfst. Der Plan startet besonders vorsichtig.');
  if (a.experienceYears != null && a.experienceYears !== '') p.experienceYears = +a.experienceYears;
  if (Array.isArray(a.sports) && a.sports.length) p.sports = a.sports.filter((s: string) => s !== 'football') as SportKey[];
  // alte Frage „Krafttraining?“
  if (a.strength === '0') p.sports = p.sports.filter(s => s !== 'strength');
  else if (a.strength && !p.sports.includes('strength')) p.sports = [...p.sports, 'strength'];
  // Teamsport
  if (a.teamYes) {
    // ohne Spiele (oder ohne Spieltage) keine Spiele im Plan (Auftrag 11); alte Antworten ohne die Frage: Spieltage zählen, wenn eingetragen
    const games = a.teamGames === false ? [] : (a.teamGameDays || []).map(Number);
    p.teamSport = { name: String(a.teamName || a.teamSportName || 'Teamsport').trim() || 'Teamsport', trainingDays: (a.teamTrainingDays || []).map(Number), trainingMinutes: num(a.teamTrainingMinutes) || 90, gameDays: games, gameMinutes: games.length ? num(a.teamGameMinutes) || 90 : 0, seasonFrom: a.teamSeasonFrom || null, seasonTo: a.teamSeasonTo || null };
    p.teamSportName = p.teamSport.name;
    if (!p.sports.includes('football')) p.sports = [...p.sports, 'football'];
  } else if (a.teamYes === false) { p.teamSport = null; p.sports = p.sports.filter(s => s !== 'football'); p.teamSportName = ''; }
  else if (Array.isArray(a.sports) && a.sports.includes('football')) { p.sports = [...p.sports, 'football']; p.teamSportName = String(a.teamSportName || 'Teamsport'); }
  if (a.weeklyHours) p.weeklyHours = +a.weeklyHours;
  if (a.maxDayHours) p.maxDayHours = +a.maxDayHours;
  if (a.dayLoad && typeof a.dayLoad === 'object') { const dl: Record<number, DayLoad> = {}; Object.entries(a.dayLoad).forEach(([k, v]) => { dl[+k] = Math.max(0, Math.min(3, +(v as any) || 0)) as DayLoad; }); p.dayLoad = dl; }
  // Stunden und längster Tag aus dem Wochenraster (Auftrag 11): nie mehr als die Zeit im Raster
  if (a.dayLoad && Object.values(a.dayLoad).some((x: any) => +x > 0)) { const ws = weekSummary({ ...a, sports: a.sports || p.sports }, today); p.weeklyHours = ws.weeklyHours; p.maxDayHours = ws.maxDayHours; }
  if (a.windows && typeof a.windows === 'object') p.availability = a.windows as Record<number, DayWindow[]>;
  if (Array.isArray(a.fixed)) p.fixed = a.fixed;
  p.timeOfDay = a.timeOfDay === 'morning' || a.timeOfDay === 'evening' ? a.timeOfDay : '';
  if (a.freq && typeof a.freq === 'object') { const f: any = {}; Object.entries(a.freq).forEach(([k, v]: any) => { if (Array.isArray(v) && v.length === 2) f[k] = [Math.max(0, +v[0] || 0), Math.max(+v[0] || 0, +v[1] || 0)]; }); p.freq = f; if (f.strength && f.strength[1] > 0 && !p.sports.includes('strength')) p.sports = [...p.sports, 'strength']; }
  // Häufigkeit nie öfter als Tage, an denen die Sportart laut Wochenraster geht
  if (a.dayLoad && Object.values(a.dayLoad).some((x: any) => +x > 0)) weekSummary({ ...a, sports: p.sports }, today).sports.forEach(x => { const f = (p.freq || {})[x.sport as SportKey]; if (f) p.freq = { ...p.freq, [x.sport]: [Math.min(f[0], x.days), Math.min(f[1], x.days)] }; });
  p.skills = {
    swimCrawl: a.swimCrawl || null, swimCrawlM: a.swimCrawl === 'yes' || a.swimCrawl === 'some' ? num(a.swimCrawlM) : null /* Auftrag 17: alte Meterangabe gilt nicht bei „kann nicht kraulen“ */, swimBreast: a.swimBreast === true ? true : a.swimBreast === false ? false : undefined,
    runContinuousMin: num(a.runContinuousMin), bikeLongestMin: num(a.bikeLongestMin),
    poolM: a.poolM === '50' || a.poolM === 50 ? 50 : a.poolM === 'both' ? 'both' : a.poolM === '25' || a.poolM === 25 ? 25 : null,
    openWater: a.openWater === true ? true : a.openWater === false ? false : null,
    openWaterFrom: a.openWater === true ? num(a.openWaterFrom) || 6 : null, openWaterTo: a.openWater === true ? num(a.openWaterTo) || 9 : null,
    swimGear: Array.isArray(a.swimGear) ? a.swimGear.filter((g: string) => ['board', 'buoy', 'fins', 'paddles', 'snorkel'].includes(g)) as any : (base && base.skills && base.skills.swimGear) || null,
    // „ja“ ohne Meterangabe: wie 100 m (Auftrag 11), nie Technik-Stufe 0
    ...(a.swimPullM != null ? { swimPullM: num(a.swimPullM) } : {})
  };
  if (Array.isArray(a.bikes)) p.bikes = a.bikes;
  // Auftrag 19: Gelände (Laufband zählt für Berg-Einheiten mit Steigung)
  if (Array.isArray(a.terrain)) p.terrain = { hills: a.terrain.includes('hills') || a.terrain.includes('treadmill'), track: a.terrain.includes('track') };
  if (Array.isArray(a.bikeSetup)) { p.bikes = [...new Set([...(p.bikes || []), ...a.bikeSetup.filter((x: string) => x !== 'power' && x !== 'clip' && x !== 'group')])]; if (a.bikeSetup.includes('power')) p.powerMeter = true; }
  if (a.powerMeter != null) p.powerMeter = !!a.powerMeter;
  if (a.trainerType === 'smart' || a.trainerType === 'basic') p.trainerType = a.trainerType;
  if (a.bests && typeof a.bests === 'object') { const b: any = {}; Object.entries(a.bests).forEach(([k, v]) => { const s = parseDur(v, k === 'runHalf' || k === 'runMarathon' ? 'hm' : 'ms'); if (s) b[k] = s; }); p.bests = b; }
  const notes = Array.isArray(a.notes) ? a.notes : String(a.notes || '').split(/\n+/);
  p.notes = notes.map((x: string) => String(x).trim()).filter(Boolean);
  if (a.poolDays) p.notes.push('Schwimmbad nur ' + a.poolDays);
  // Regeln aus Wochenraster und bestätigten Sätzen (Auftrag 5)
  if (Array.isArray(a.rules)) p.rules = a.rules.filter((r: any) => r && r.kind);
  if (a.diet === 'vegetarian' || a.diet === 'vegan') p.vegetarian = true;
  p.trackCalories = !!a.trackCalories;
  p.planStyle = a.planStyle === 'strict' ? 'strict' : 'flexible';
  p.likesIntensity = a.likes === 'intensity' ? 'intensity' : a.likes === 'volume' ? 'volume' : 'balanced';
  p.answers = { ...a };
  (Array.isArray(a.goals) ? a.goals : []).forEach((g: any) => { if (g && GOALS[g.type as GoalType] && g.date && !validGoalDate(g.date)) warnings.push('Das Zieldatum war ungültig und wurde nicht übernommen. Bitte das Datum neu wählen.'); });
  const goals: Goal[] = (Array.isArray(a.goals) ? a.goals : []).filter((g: any) => g && GOALS[g.type as GoalType]).map((g: any, i: number) => {
    const target = goalTarget(g) ?? (i === 0 && a.outcome === 'time' ? parseHm(a.targetTime) : null);
    return {
      // Auftrag 22 (Zufallstest): nur ein echtes Datum (JJJJ-MM-TT) und A/B/C; sonst stürzte der Plan-Generator ab
      id: typeof g.id === 'string' && g.id ? g.id : `goal-${i + 1}`, type: g.type, name: typeof g.name === 'string' && g.name.trim() ? g.name.slice(0, 80) : GOAL_NAMES[g.type as GoalType] || g.type, date: validGoalDate(g.date) ? g.date : null, priority: ['A', 'B', 'C'].includes(g.priority) ? g.priority : (i === 0 ? 'A' : 'B'),
      outcome: target ? 'time' : (a.outcome || 'finish'), targetTimeSec: target, splits: g.timeMode === 'split' ? g.splits || null : null, why: a.why || undefined
    } as Goal;
  });
  if (goals.length && !goals.some(g => g.priority === 'A')) goals[0].priority = 'A';
  return { profile: withEstimates(p, today), goals, warnings };
}
export const GOAL_NAMES: Record<GoalType, string> = {
  run_5k: '5 km', run_10k: '10 km', run_half: 'Halbmarathon', run_marathon: 'Marathon', tri_supersprint: 'Supersprint-Triathlon', tri_sprint: 'Sprint-Triathlon',
  tri_olympic: 'Olympischer Triathlon', tri_middle: 'Mitteldistanz', tri_long: 'Langdistanz', duathlon: 'Duathlon', aquathlon: 'Aquathlon', bike_event: 'Radmarathon', swim_goal: 'Schwimm-Ziel', fitness: 'Fitness'
};

/* Stunden der letzten Wochen: Antwort, Schätzung aus dem Rechner, oder bei „weiß ich nicht“ ein vorsichtiger Start
   (höchstens 3 h und 40 % des Wochenlimits); der Plan passt sich nach 2 Wochen an die echten Daten an (Auftrag 11) */
export function hoursNow(a: Answers, p: Profile): number | null {
  if (a.weeklyHoursNow === 'unknown') return Math.round(Math.min(3, Math.max(1, (p.weeklyHours || 5) * 0.4)) * 10) / 10;
  return a.weeklyHoursNow != null && a.weeklyHoursNow !== '' && isFinite(+a.weeklyHoursNow) ? +a.weeklyHoursNow : null;
}
/* Gibt es schon einen Plan (o.old), wird er fortgesetzt statt neu begonnen (Auftrag 7): gen.plan ist dann der ganze Plan
   mit den vergangenen Wochen, continued = true. Score-Kalibrierung, Verlauf und erledigte Einheiten bleiben. */
export function applyOnboarding(a: Answers, today: string, base?: Profile, o: { stages?: any; old?: any; state?: any; adjustments?: any; from?: string | null } = {}): { profile: Profile; goals: Goal[]; gen: GenResult | null; warnings: string[]; continued: boolean; needTests?: any } {
  const { profile: p, goals, warnings } = profileFromAnswers(a, today, base);
  let gen: GenResult | null = null; let continued = false;
  const need = a.wantTests ? { run: p.sports.includes('run'), bike: p.sports.includes('bike'), swim: p.sports.includes('swim') } : undefined;
  if (goals.length) {
    if (o.old && Array.isArray(o.old.weeks) && o.old.weeks.length) {
      const r = replanPlan(o.old, p, goals, today, { stages: o.stages, adjustments: o.adjustments, state: o.state, needTests: need, recentHours: hoursNow(a, p), from: o.from });
      if (r) { gen = { ...r.gen, plan: r.plan }; continued = true; }
    }
    if (!gen) {
      // neuer Plan ab heute (ab 18 Uhr ab morgen), nicht erst ab nächstem Montag (Auftrag 11)
      gen = generatePlan({ profile: p, goals, today, from: o.from === undefined ? today : o.from, currentWeeklyHours: hoursNow(a, p), hoursUnknown: a.weeklyHoursNow === 'unknown', needTests: need, stages: o.stages });
    }
    gen.violations.filter(v => v.rule === 'age').forEach(v => warnings.push(v.msg));
  }
  return { profile: p, goals, gen, warnings, continued, needTests: need };
}

/* „Das habe ich verstanden“ (F2): alle wichtigen Angaben in Sätzen, je mit Sprung zum Block */
export interface Understood { block: string; label: string; text: string }
const DOWS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fmtT = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}${x ? ':' + String(x).padStart(2, '0') : ''} h` : `${m}:${String(x).padStart(2, '0')} min`; };
export function understood(a: Answers, today: string): Understood[] {
  const { profile: p, goals } = profileFromAnswers(a, today);
  const out: Understood[] = [];
  const PR: Record<string, string> = { A: 'Hauptziel', B: 'wichtig', C: 'Training' };
  out.push({ block: 'goal', label: 'Ziele', text: goals.length ? goals.map(g => `${g.name}${g.date ? ' am ' + g.date.split('-').reverse().join('.') : ', noch ohne Datum (die App plant einen Platzhalter in der passenden Saison)'} (${g.priority}: ${PR[g.priority]})${g.targetTimeSec ? `, Wunschzeit ${fmtT(g.targetTimeSec)}` : ', ohne Wunschzeit'}`).join('; ') : 'noch kein Ziel' });
  const SD: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft' };
  const ws = weekSummary({ ...a, sports: p.sports, freq: p.freq as any, weeklyHours: p.weeklyHours, maxDayHours: p.maxDayHours }, today);
  const fr = (s: string) => { const f = (p.freq || {})[s as SportKey] || (ws.sports.find(x => x.sport === s) || { freq: null as any }).freq; return f ? (f[0] === f[1] ? `${f[0]}×` : `${f[0]}-${f[1]}×`) : 'nach Plan'; };
  out.push({ block: 'background', label: 'Training bisher', text: a.weeklyHoursNow === 'unknown' ? 'weiß ich nicht: vorsichtiger Start, nach 2 Wochen passt sich der Plan an deine Daten an' : a.weeklyHoursNow != null && a.weeklyHoursNow !== '' ? `${String(a.weeklyHoursNow).replace('.', ',')} h pro Woche` : 'keine Angabe' });
  out.push({ block: 'time', label: 'Sportarten und Häufigkeit', text: p.sports.filter(s => s !== 'football').map(s => `${SD[s]} ${fr(s)}`).join(', ') + ' pro Woche' });
  const dl = p.dayLoad || {};
  const LBL = ['–', 'kurz', 'mittel', 'lang'];
  out.push({ block: 'time', label: 'Tage', text: [1, 2, 3, 4, 5, 6, 0].map(d => `${DOWS[d]} ${LBL[(dl as any)[d] || 0]}`).join(', ') + `, höchstens ${String(p.weeklyHours).replace('.', ',')} h pro Woche` });
  out.push({ block: 'team', label: 'Teamsport', text: p.teamSport ? `${p.teamSport.name}: Training ${p.teamSport.trainingDays.map(d => DOWS[d]).join(', ') || '–'} (${p.teamSport.trainingMinutes} min), ${p.teamSport.gameDays.length ? 'Spiele ' + p.teamSport.gameDays.map(d => DOWS[d]).join(', ') : 'keine Spiele'}` + (p.teamSport.seasonFrom || p.teamSport.seasonTo ? `, Saison ${p.teamSport.seasonFrom || '…'} bis ${p.teamSport.seasonTo || '…'}` : '') : 'kein Teamsport' });
  const sk = p.skills || {};
  const can: string[] = [];
  if (p.sports.includes('swim')) can.push(sk.swimCrawl === 'yes' ? `Kraul${sk.swimCrawlM ? ` ${sk.swimCrawlM} m am Stück` : ''}` : sk.swimCrawl === 'some' ? `ein bisschen Kraul${sk.swimCrawlM ? ` (${sk.swimCrawlM} m)` : ''}` : sk.swimBreast ? 'nur Brust, kein Kraul' : 'kann noch nicht kraulen');
  if (p.sports.includes('swim') && sk.poolM) can.push(sk.poolM === 'both' ? '25- und 50-m-Becken' : `${sk.poolM}-m-Becken`);
  if (p.sports.includes('swim') && sk.openWater) can.push(`Freiwasser ${sk.openWaterFrom || 6}/${sk.openWaterTo || 9} (Monate)`);
  if (p.sports.includes('run') && sk.runContinuousMin != null) can.push(`${sk.runContinuousMin} min am Stück laufen`);
  if (p.sports.includes('bike') && sk.bikeLongestMin != null) can.push(`längste Radfahrt ${sk.bikeLongestMin} min`);
  if ((p.bikes || []).length) can.push('Räder: ' + p.bikes.map(b => (BIKE_OPTIONS.find(x => x[0] === b) || [b, b])[1]).join(', ') + (p.powerMeter ? ', mit Wattmessung' : ''));
  if (p.terrain && (p.terrain.hills || p.terrain.track)) can.push('in der Nähe: ' + [p.terrain.hills ? 'Hügel (oder Laufband)' : '', p.terrain.track ? 'Laufbahn' : ''].filter(Boolean).join(', '));
  out.push({ block: 'skills', label: 'Können', text: can.join('; ') || 'keine Angaben' });
  const rs = rulesOf(p, parseFor(today)).filter(r => !r.hidden && r.kind !== 'info');
  out.push({ block: 'notes', label: 'Einschränkungen', text: [...new Set(rs.map(ruleText))].join('; ') || [p.injuries, ...(p.notes || [])].filter(Boolean).join('; ') || 'keine' });
  out.push({ block: 'time', label: 'Kraft', text: p.sports.includes('strength') ? `ja, ${fr('strength')} pro Woche` : 'nein' });
  return out;
}
