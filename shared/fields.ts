/* Felder statt Notizfeld (Auftrag 7, Punkt 3): jede Sportart hat die Werte, die bisher in Notizen standen.
   Gespeichert wird in der Einheit (session/custom) unter metrics, je Feld mit Quelle (metricsSrc: Uhr, intervals.icu, Notiz, von Hand).
   Werte aus verbundenen Apps füllen die Felder automatisch, von Hand geändert gilt die Hand (metricsManual).
   Dazu: alte Notizen in Felder übertragen, Pulszone („Zone 3 statt 2“) und CTL/ATL/TSB des Tages berechnen.
   Scores, Coach und Analyse lesen die Felder über fieldsOf(). */
import * as C from './core';

export type FieldKind = 'num' | 'pace' | 'text' | 'select' | 'splits' | 'exercises';
export interface FieldDef { key: string; label: string; unit?: string; kind: FieldKind; options?: [string, string][]; ph?: string; more?: boolean }
export interface Split { km: number; pace: string; hr: number | null }
export interface ExerciseDone { name: string; sets: number | null; reps: string; kg: number | null }

export const SPORT_FIELDS: Record<string, FieldDef[]> = {
  run: [
    { key: 'min', label: 'Dauer', unit: 'min', kind: 'num' }, { key: 'km', label: 'Distanz', unit: 'km', kind: 'num' },
    { key: 'pace', label: 'Ø Pace', unit: '/km', kind: 'pace', ph: '6:20' }, { key: 'hr', label: 'Ø Puls', unit: 'bpm', kind: 'num' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm', kind: 'num' },
    { key: 'decoupling', label: 'aerobe Entkopplung', unit: '%', kind: 'num' }, { key: 'efficiency', label: 'aerobe Effizienz', kind: 'num' },
    { key: 'cadence', label: 'Kadenz', unit: 'spm', kind: 'num' }, { key: 'vertRatio', label: 'vertikales Verhältnis', unit: '%', kind: 'num', more: true },
    { key: 'vo2max', label: 'VO2max', kind: 'num', more: true }, { key: 'cardioRecovery', label: 'Cardio-Erholung', unit: 'bpm', kind: 'num', more: true },
    { key: 'splits', label: 'Splits je km', kind: 'splits', more: true }
  ],
  bike: [
    { key: 'min', label: 'Dauer', unit: 'min', kind: 'num' }, { key: 'km', label: 'Distanz', unit: 'km', kind: 'num' },
    { key: 'power', label: 'Ø Watt', unit: 'W', kind: 'num' }, { key: 'maxPower', label: 'max. Watt', unit: 'W', kind: 'num' },
    { key: 'cadence', label: 'Ø Trittfrequenz', unit: 'rpm', kind: 'num' }, { key: 'maxCadence', label: 'max. Trittfrequenz', unit: 'rpm', kind: 'num', more: true },
    { key: 'hr', label: 'Ø Puls', unit: 'bpm', kind: 'num' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm', kind: 'num' },
    { key: 'indoor', label: 'Wo', kind: 'select', options: [['', '–'], ['in', 'drinnen (Smart Trainer)'], ['out', 'draußen']] },
    { key: 'bikeType', label: 'Rad', kind: 'select', options: [['', '–'], ['gravel', 'Gravelbike'], ['road', 'Rennrad'], ['mtb', 'Mountainbike'], ['other', 'anderes']] },
    { key: 'speed', label: 'Ø Tempo', unit: 'km/h', kind: 'num', more: true }
  ],
  swim: [
    { key: 'min', label: 'Dauer', unit: 'min', kind: 'num' }, { key: 'meters', label: 'Distanz', unit: 'm', kind: 'num' },
    { key: 'pace100', label: 'Ø Pace Kraul', unit: '/100 m', kind: 'pace', ph: '2:30' }, { key: 'spl', label: 'Züge pro Bahn', kind: 'num' },
    { key: 'rate', label: 'Züge pro Minute', kind: 'num' }, { key: 'dps', label: 'Meter pro Zug', unit: 'm', kind: 'num' },
    { key: 'longestCrawl', label: 'längste Strecke Kraul am Stück', unit: 'm', kind: 'num' }, { key: 'crawlShare', label: 'Anteil Kraul (Rest Brust)', unit: '%', kind: 'num' },
    { key: 'technique', label: 'Technik-Schwerpunkt oder -Problem', kind: 'text', ph: 'z. B. Atmung, Beine sinken ab' }
  ],
  strength: [
    { key: 'area', label: 'Bereich', kind: 'select', options: [['', '–'], ['upper', 'Oberkörper'], ['lower', 'Unterkörper'], ['core', 'Rumpf'], ['full', 'Ganzkörper']] },
    { key: 'min', label: 'Dauer', unit: 'min', kind: 'num' },
    { key: 'exercises', label: 'Übungen (Sätze × Wdh × Gewicht)', kind: 'exercises' }
  ],
  football: [
    { key: 'kind', label: 'Art', kind: 'select', options: [['', '–'], ['training', 'Training'], ['game', 'Spiel']] },
    { key: 'min', label: 'Einsatzminuten', unit: 'min', kind: 'num' }, { key: 'hr', label: 'Ø Puls', unit: 'bpm', kind: 'num' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm', kind: 'num' }
  ]
};
/* Für alle Sportarten (oben in der Einheit, nicht in metrics) */
export const FEEL: [string, string][] = [['1', 'sehr frisch'], ['2', 'frisch'], ['3', 'normal'], ['4', 'müde'], ['5', 'sehr müde']];
export const SOURCE_NAMES: Record<string, string> = { healthfit: 'HealthFit', file: 'Datei', shortcut: 'Apple Health', healthkit: 'Apple Health', intervals: 'intervals.icu', manual: 'von Hand', note: 'aus Notiz', oura: 'Oura' };

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const paceSec = (v: any): number | null => { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

/* ---------- Werte einer Einheit lesen (für Scores, Coach, Analyse) ---------- */
export interface Fields { min: number | null; km: number | null; meters: number | null; paceSec: number | null; pace100: number | null; hr: number | null; maxHr: number | null;
  decoupling: number | null; efficiency: number | null; cadence: number | null; vertRatio: number | null; vo2max: number | null; cardioRecovery: number | null;
  power: number | null; maxPower: number | null; maxCadence: number | null; speed: number | null; indoor: boolean | null; bikeType: string | null;
  spl: number | null; rate: number | null; dps: number | null; longestCrawl: number | null; crawlShare: number | null; technique: string;
  area: string | null; exercises: ExerciseDone[]; kind: string | null; splits: Split[]; rpe: number | null; feel: number | null; deviation: string; notes: string }
export function fieldsOf(st: any, sport?: string): Fields {
  const m = (st && st.metrics) || {};
  const km = num(m.km), min = num(m.min), meters = num(m.meters);
  let pace = paceSec(m.pace); if (pace == null && km && min && sport === 'run') pace = Math.round(min * 60 / km);
  let p100 = paceSec(m.pace100); if (p100 == null && meters && min && sport === 'swim') p100 = Math.round(min * 60 / (meters / 100));
  let speed = num(m.speed); if (speed == null && km && min && sport === 'bike') speed = Math.round(km / (min / 60) * 10) / 10;
  return {
    min, km, meters, paceSec: pace, pace100: p100, hr: num(m.hr), maxHr: num(m.maxHr), decoupling: num(m.decoupling), efficiency: num(m.efficiency), cadence: num(m.cadence),
    vertRatio: num(m.vertRatio), vo2max: num(m.vo2max), cardioRecovery: num(m.cardioRecovery), power: num(m.power), maxPower: num(m.maxPower), maxCadence: num(m.maxCadence), speed,
    indoor: m.indoor === 'in' ? true : m.indoor === 'out' ? false : null, bikeType: m.bikeType || null,
    spl: num(m.spl), rate: num(m.rate), dps: num(m.dps), longestCrawl: num(m.longestCrawl), crawlShare: num(m.crawlShare), technique: String(m.technique || ''),
    area: m.area || null, exercises: Array.isArray(m.exercises) ? m.exercises : [], kind: m.kind || null, splits: Array.isArray(m.splits) ? m.splits : [],
    rpe: num(st && st.rpe), feel: num(st && st.feel), deviation: String((st && st.deviation) || ''), notes: String((st && (st.notes ?? st.description)) || '')
  };
}

/* ---------- Automatisch berechnet ---------- */
/* Pulszone aus dem Ø-Puls (Anteil vom Schwellenpuls, wie in den Zonen der App) */
export function hrZone(hr: number, lthr: number): number { const f = hr / lthr; return f < 0.81 ? 1 : f < 0.9 ? 2 : f < 0.94 ? 3 : f <= 1.02 ? 4 : 5; }
export function plannedZone(s: any): number | null { const z = [...String((s && s.zone) || '').matchAll(/\d/g)].map(x => +x[0]); return z.length ? Math.max(...z) : null; }
/* „Zone 3 statt 2“ oder „Zone 2 wie geplant“; null ohne Puls */
export function zoneVerdict(s: any, st: any, thr: any): { zone: number; planned: number | null; text: string; over: boolean } | null {
  const sport = s && s.sport; if (sport !== 'run' && sport !== 'bike' && sport !== 'football') return null;
  const f = fieldsOf(st, sport); if (!f.hr) return null;
  const lthr = sport === 'bike' ? (thr && thr.lthrBike) || 0 : (thr && thr.lthrRun) || 0; if (!lthr) return null;
  const zone = hrZone(f.hr, lthr); const planned = sport === 'football' ? null : plannedZone(s);
  const over = planned != null && zone > planned;
  return { zone, planned, over, text: planned == null ? `Zone ${zone}` : zone === planned ? `Zone ${zone} wie geplant` : `Zone ${zone} statt ${planned}` };
}
/* Fitness, Müdigkeit, Form an einem Tag: intervals.icu, sonst aus den eigenen Einheiten */
export function loadOn(state: any, weeks: any[], date: string): { ctl: number; atl: number; tsb: number; source: string } | null {
  const p = (state.trend || []).find((x: any) => x && x.date === date && num(x.ctl) != null && x.ctl > 0);
  if (p) return { ctl: Math.round(p.ctl), atl: Math.round(num(p.atl) || 0), tsb: Math.round(num(p.tsb) ?? (p.ctl - (num(p.atl) || 0))), source: 'intervals.icu' };
  const own = C.ownLoadSeries(state, weeks || [], date).find((x: any) => x.date === date);
  return own && own.ctl > 0 ? { ctl: Math.round(own.ctl), atl: Math.round(own.atl), tsb: Math.round(own.tsb), source: 'eigene Einheiten' } : null;
}

/* ---------- Werte aus Aufzeichnungen (Uhr, HealthFit, intervals.icu) ---------- */
export function splitsFromLaps(laps: any[]): Split[] {
  const km = (laps || []).filter(l => l && l.m && l.m >= 950 && l.m <= 1050 && l.sec);
  if (km.length < 2) return [];
  return km.slice(0, 50).map((l, i) => ({ km: i + 1, pace: mmss(l.sec * 1000 / l.m), hr: l.avgHr ?? null }));
}
/* Felder aus einer intervals.icu-Aktivität (nur, was die API wirklich liefert) */
export function fieldsFromIcu(a: any, sport: string): Record<string, any> {
  const m: Record<string, any> = {};
  const n = (k: string) => (typeof a[k] === 'number' && isFinite(a[k]) && a[k] > 0 ? a[k] : null);
  if (n('max_heartrate')) m.maxHr = String(Math.round(n('max_heartrate')!));
  const cad = n('average_cadence');
  if (cad && (sport === 'run' || sport === 'bike')) m.cadence = String(Math.round(sport === 'run' && cad < 120 ? cad * 2 : cad));
  const w = n('icu_average_watts') ?? n('average_watts');
  if (w && sport === 'bike') m.power = String(Math.round(w));
  if (typeof a.decoupling === 'number' && isFinite(a.decoupling) && (sport === 'run' || sport === 'bike')) m.decoupling = String(Math.round(a.decoupling * 10) / 10);
  if (n('icu_efficiency_factor') && (sport === 'run' || sport === 'bike')) m.efficiency = String(Math.round(n('icu_efficiency_factor')! * 100) / 100);
  if (sport === 'bike' && typeof a.trainer === 'boolean') m.indoor = a.trainer ? 'in' : 'out';
  return m;
}

/* ---------- Alte Notizen in Felder übertragen ---------- */
const D = '(\\d+(?:[.,]\\d+)?)';
const pick = (re: RegExp, t: string) => { const m = re.exec(t); return m ? m[1].replace(',', '.') : null; };
/* Liest typische Angaben aus einer Notiz, z. B. „5,07km, Ø6:21/km, ØHF153 (max165), aerobe Entkopplung 4,5%, Kadenz 163spm“ */
export function fieldsFromNote(text: string, sport: string): { metrics: Record<string, any>; rpe?: string; deviation?: string } {
  const t = String(text || '').toLowerCase();
  const m: Record<string, any> = {};
  const set = (k: string, v: string | null) => { if (v != null && v !== '') m[k] = v; };
  if (sport === 'swim') {
    const all = [...t.matchAll(/(\d{2,4})\s*m(?![a-zäöüß/])/g)].map(x => +x[1]).filter(x => x >= 200 && x <= 6000);
    if (all.length) set('meters', String(all[0]));
    const lc = /(\d+(?:[.,]\d+)?)\s*m\b[^,;]{0,40}?am st(?:ue|ü)ck/.exec(t); if (lc) set('longestCrawl', lc[1].replace(',', '.'));
    else if (/durchgehend\s*(\d+)\s*m\s*kraul/.test(t)) set('longestCrawl', /durchgehend\s*(\d+)\s*m\s*kraul/.exec(t)![1]);
    set('spl', pick(new RegExp(D + '\\s*z(?:ue|ü)ge\\s*pro\\s*bahn'), t));
    const tech = /(problem[^.]*|atmung[^.]*|beine sinken[^.]*)/.exec(t); if (tech) set('technique', tech[1].trim().slice(0, 80));
  } else {
    set('km', pick(new RegExp(D + '\\s*km(?!\\s*/\\s*h)'), t));
  }
  // Dauer: „44min 31sek“, „33min“, „in 32:39“
  const ms = /(\d{1,3})\s*min(?:uten)?\s*(\d{1,2})\s*se[kc]/.exec(t);
  if (ms) set('min', String(Math.round((+ms[1] + +ms[2] / 60) * 10) / 10));
  else { const mm = /(\d{1,3})\s*min(?:uten)?\b(?!\s*\/)/.exec(t); const tt = /\bin\s*(\d{1,3}):(\d{2})\b/.exec(t);
    const many = (t.match(/\d+\s*min\b/g) || []).length > 2; // „5min warm up, dann 10min …“: Abschnitte, keine Gesamtdauer
    if (tt) set('min', String(Math.round((+tt[1] + +tt[2] / 60) * 10) / 10)); else if (mm && !many) set('min', mm[1]); }
  if (sport === 'run') {
    // Ø-Pace; ohne „Ø“ lieber aus Distanz und Zeit („letzter km auf 5:20/km“ ist keine Ø-Pace), Spannen („6:20-6:40“) nie
    const avgP = /ø\s*(\d{1,2}:\d{2})(?!\s*-)\s*(?:\/\s*km|pace|min\/km)/.exec(t);
    const anyP = /(?<![-\d:])(\d{1,2}:\d{2})\s*(?:\/\s*km|pace|min\/km)/.exec(t);
    const partial = anyP && /(auf|letzte[rn]?|schneller|ende|ausprobieren|steigerung)[^,.;]{0,25}$/.test(t.slice(0, anyP.index));
    if (avgP) set('pace', avgP[1]);
    else if (anyP && !partial) set('pace', anyP[1]);
    else if (m.km && m.min) set('pace', mmss(+m.min * 60 / +m.km));
    set('cadence', pick(/(?:kadenz|økadenz)\s*(\d{2,3})\s*(?:spm)?/, t));
    set('vertRatio', pick(new RegExp('vertikales?\\s*verh(?:ae|ä)ltnis\\s*' + D), t));
    set('vo2max', pick(new RegExp('vo2\\s*max\\s*' + D), t));
  }
  if (sport === 'run' || sport === 'bike') {
    set('decoupling', pick(new RegExp('entkopplung\\s*(-?\\d+(?:[.,]\\d+)?)\\s*%'), t));
    set('efficiency', pick(new RegExp('aerobe\\s*effizienz\\s*' + D), t));
  }
  if (sport === 'bike') {
    set('power', pick(/ø\s*(\d{2,4})\s*w(?:att)?\b/, t) || pick(/(\d{2,4})\s*watt\b/, t));
    set('maxPower', pick(/max\.?\s*(\d{2,4})\s*w\b/, t));
    set('cadence', pick(/ø\s*(\d{2,3})\s*rpm/, t) || pick(/(\d{2,3})\s*rpm/, t));
    set('maxCadence', pick(/max\.?\s*(\d{2,3})\s*rpm/, t));
    set('speed', pick(new RegExp(D + '\\s*km\\s*/\\s*h'), t));
    if (/home.?trainer|smart.?trainer|\brolle\b|indoor|kuipers/.test(t)) set('indoor', 'in'); else if (/outdoor|drau(?:ss|ß)en|gravel/.test(t)) set('indoor', 'out');
    if (/gravel/.test(t)) set('bikeType', 'gravel'); else if (/rennrad/.test(t)) set('bikeType', 'road');
  }
  if (sport === 'strength' && !(/oberk(?:oe|ö)rper/.test(t) && /unterk(?:oe|ö)rper/.test(t))) { if (/oberk(?:oe|ö)rper/.test(t)) set('area', 'upper'); else if (/unterk(?:oe|ö)rper|\bbeine\b/.test(t)) set('area', 'lower'); else if (/rumpf|core/.test(t)) set('area', 'core'); }
  if (sport === 'football') { if (/\bspiel\b|gespielt|match/.test(t)) set('kind', 'game'); else if (/training/.test(t)) set('kind', 'training'); }
  // Puls: „ØHF153“, „Ø153bpm“, „durchschnittlich 149 bpm“, „Øherzfrequenz 142bpm“; max: „(max165)“, „max 158bpm“
  const hr = /ø\s*(?:hf|herzfrequenz)?\s*(\d{2,3})\s*(?:bpm)?(?![\d:]|[.,]\d|\s*(?:rpm|w\b|watt|km|spm|m\b))/.exec(t) || /durchschnittlich\s*(\d{2,3})\s*bpm/.exec(t);
  if (hr && +hr[1] >= 60 && +hr[1] <= 220) set('hr', hr[1]);
  const mx = /max\.?\s*(?:hf\s*)?(\d{2,3})(?:\s*bpm|\))/.exec(t);
  if (mx && +mx[1] >= 80 && +mx[1] <= 230) set('maxHr', mx[1]);
  const rpe = /\brpe\s*(\d{1,2})\b/.exec(t);
  const dev = /((?:getauscht|verk(?:ue|ü)rzt|abgebrochen|ausgefallen|nur \d+\s*min wegen|leicht trainiert)[^.;:\n]{0,80})/i.exec(String(text || ''));
  return { metrics: m, ...(rpe && +rpe[1] >= 1 && +rpe[1] <= 10 ? { rpe: rpe[1] } : {}), ...(dev ? { deviation: dev[1].trim() } : {}) };
}
/* Einmalig: Notizen aller Einheiten in leere Felder übertragen. Die Notiz bleibt unverändert (nichts geht verloren).
   Liefert die Zahl der geänderten Einheiten. */
export function migrateNotes(state: any, weeks: any[]): number {
  let n = 0;
  const sportOf: Record<string, string> = {};
  C.planDays(weeks || []).forEach((d: any) => d.sessions.forEach((s: any) => { sportOf[s.id] = s.sport; }));
  const apply = (st: any, sport: string, text: string) => {
    if (!st || st.fieldsFromNotes || !text || !String(text).trim()) return false;
    const r = fieldsFromNote(text, sport);
    st.metrics = { ...(st.metrics || {}) }; st.metricsSrc = { ...(st.metricsSrc || {}) };
    let any = false;
    for (const [k, v] of Object.entries(r.metrics)) if (st.metrics[k] == null || st.metrics[k] === '') { st.metrics[k] = v; st.metricsSrc[k] = 'note'; any = true; }
    if (r.rpe && (st.rpe == null || st.rpe === '')) { st.rpe = r.rpe; any = true; }
    if (r.deviation && !st.deviation) { st.deviation = r.deviation; any = true; }
    st.fieldsFromNotes = 1;
    return any || true;
  };
  for (const [id, st] of Object.entries(state.sessions || {}) as [string, any][]) { if (sportOf[id] && sportOf[id] !== 'rest' && apply(st, sportOf[id], st.notes)) n++; }
  for (const list of Object.values(state.customWorkouts || {}) as any[][]) for (const w of list || []) if (apply(w, w.sport, w.description)) n++;
  return n;
}

/* ---------- Nach dem Schwellentest: Zonen automatisch aktualisieren (Auftrag 7) ----------
   Ein erledigter Lauftest der letzten 21 Tage, der noch nicht übernommen wurde. Aus der Uhr: die Belastungsrunde von 20-35 min
   (Ø-Puls × 1,01, weil der Puls der letzten 20 Minuten etwas höher liegt als der Schnitt); sonst die eingetragenen Werte (Ø-Puls, Ø-Pace
   des Tests). Nur plausible Werte (Puls 85-110 % und Pace 75-125 % der bisherigen Werte); die aerobe Schwelle wächst im gleichen Verhältnis. */
export interface TestUpdate { sessionId: string; date: string; lthrRun: number; thresholdPaceRunSec: number | null; aetHr: [number, number] | null; text: string }
export function runTestUpdate(state: any, weeks: any[], profile: any, today: string): TestUpdate | null {
  const th = profile.thresholds || {}; const applied: string[] = profile.appliedTests || [];
  for (const d of C.planDays(weeks).filter((x: any) => x.date <= today && x.date >= C.addDays(today, -21)).reverse()) {
    for (const s of d.sessions) {
      if (s.sport !== 'run' || !/test/i.test(s.title || '') || applied.includes(s.id)) continue;
      const st = (state.sessions || {})[s.id]; if (!st || !st.completed) continue;
      const act = st.activityId ? (state.activities || {})[st.activityId] : null;
      let hr: number | null = null, pace: number | null = null;
      const lap = act && (act.laps || []).filter((l: any) => l.sec >= 1200 && l.sec <= 2100 && l.avgHr && l.kind !== 'rest').sort((a: any, b: any) => (b.avgHr || 0) - (a.avgHr || 0))[0];
      if (lap) { hr = Math.round(lap.avgHr * 1.01); pace = lap.m ? Math.round(lap.sec * 1000 / lap.m) : null; }
      else { const f = fieldsOf(st, 'run'); hr = f.hr; pace = f.paceSec; }
      if (!hr) continue;
      const okHr = !th.lthrRun || (hr >= th.lthrRun * 0.85 && hr <= th.lthrRun * 1.1);
      const okPace = pace == null || !th.thresholdPaceRunSec || (pace >= th.thresholdPaceRunSec * 0.75 && pace <= th.thresholdPaceRunSec * 1.25);
      if (!okHr || !okPace) continue;
      const k = th.lthrRun ? hr / th.lthrRun : 1;
      const aet: [number, number] | null = th.aetHr ? [Math.round(th.aetHr[0] * k), Math.round(th.aetHr[1] * k)] : null;
      const parts = [`Schwellenpuls ${th.lthrRun || '–'} → ${hr}`, pace ? `Schwellen-Pace ${th.thresholdPaceRunSec ? mmss(th.thresholdPaceRunSec) : '–'} → ${mmss(pace)}/km` : '', aet ? `aerobe Schwelle ${th.aetHr[0]}-${th.aetHr[1]} → ${aet[0]}-${aet[1]}` : ''].filter(Boolean);
      return { sessionId: s.id, date: d.date, lthrRun: hr, thresholdPaceRunSec: pace, aetHr: aet, text: `Aus deinem ${s.title} (${d.date.slice(8)}.${d.date.slice(5, 7)}.): ${parts.join(', ')}. Alle Lauf-Zonen und Einheiten rechnen ab jetzt damit. Ändern kannst du die Werte unter Mehr → Einstellungen.` };
    }
  }
  return null;
}
export function applyTestUpdate(profile: any, u: TestUpdate): any {
  const th = { ...profile.thresholds, lthrRun: u.lthrRun, ...(u.thresholdPaceRunSec ? { thresholdPaceRunSec: u.thresholdPaceRunSec } : {}), ...(u.aetHr ? { aetHr: u.aetHr } : {}), source: `Lauftest ${u.date.slice(8)}.${u.date.slice(5, 7)}.` };
  th.estimated = (th.estimated || []).filter((k: string) => k !== 'lthrRun' && k !== 'thresholdPaceRunSec');
  return { ...profile, thresholds: th, appliedTests: [...(profile.appliedTests || []), u.sessionId] };
}
