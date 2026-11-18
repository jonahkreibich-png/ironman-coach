/* Auftrag 35, Punkt 1: Werte nach Abschnitten (Aufwärmen, Hauptteil, Ausklang; Schwimmen: Einschwimmen, Technik, Hauptserie, Ausschwimmen).
   Problem vorher: Bei gleichmäßigen Einheiten gab es nur Werte für die ganze Einheit. Beim Aufwärmen ist der Puls noch nicht in der
   Zielzone, der Durchschnitt wirkte zu niedrig und der Coach bewertete falsch.
   - Von Hand: metrics.sections (Liste je Abschnitt mit denselben Feldern wie die Einheit), Hand gewinnt (wie bei den Intervallen).
     Die Gesamtwerte der Einheit werden aus den Abschnitten berechnet, solange sie nicht selbst eingetragen wurden (Quelle „sections“).
   - Automatisch aus der Uhr: Runden der Uhr mit Aufwärmen/Ausklang (Workout), sonst aus dem Minuten-Verlauf (activity.series, ab 3.23
     beim Einlesen gespeichert), sonst aus den km-Splits. Aufwärmen endet, wenn der Puls die Zielzone erreicht (ohne Ziel: das Niveau
     des Hauptteils); Ausklang beginnt, wenn Puls bzw. Tempo am Ende deutlich abfallen. Die Grenzen kann man korrigieren
     (metrics.sectionBounds: Aufwärmen bis Minute X, Ausklang ab Minute Y).
   - Coach, Scores, Trends: mainPart() liefert die Werte des Hauptteils und die Zeit in der Zielzone. Aerobe Entkopplung bleibt
     unverändert (viele Uhren liefern sie nur für die ganze Einheit). */
import { HR_ZONES } from './sports';
import type { RawActivity } from './activity/types';

export type SecPart = 'warm' | 'tech' | 'main' | 'cool';
export type SecSport = 'run' | 'bike' | 'swim';
/** Ein Abschnitt; Werte wie die Felder der Einheit (Strings von Hand, Zahlen aus der Uhr) */
export interface SecRow { part: SecPart; min?: any; km?: any; meters?: any; hr?: any; maxHr?: any; pace?: any; power?: any; speed?: any; pace100?: any;
  /** Auftrag 37: aus dem Soll gefüllt („Wie geplant gemacht“, nicht gemessen) bzw. vom Nutzer gelöscht (nicht gemacht) */ plan?: boolean; off?: boolean; /** von Hand hinzugefügt (noch ohne Werte) */ added?: boolean }
export interface Unit { sec: number; m: number | null; hr: number | null; hx: number | null; w: number | null }
export interface MinuteSeries { step: number; hr: (number | null)[]; hx: (number | null)[]; m: (number | null)[]; w?: (number | null)[] }
export type SecSource = 'manual' | 'plan' | 'watch' | 'series' | 'splits' | 'none';
export interface SecResult {
  rows: SecRow[]; source: SecSource;
  /** Grenzen in Minuten ab Start (nur bei automatischer Erkennung) */ warmEnd?: number | null; coolStart?: number | null; totalMin?: number | null;
  /** von Hand korrigierte Grenzen */ corrected?: boolean;
}
export interface MainPart { sec: number; hr: number | null; maxHr: number | null; paceSec: number | null; speed: number | null; power: number | null; pace100: number | null;
  /** Sekunden je Pulszone 1-5 im Hauptteil (nur mit Verlauf) */ zoneSec: number[] | null; source: SecSource; warmMin: number | null; coolMin: number | null }

export const SEC_PARTS: Record<SecSport, [SecPart, string][]> = {
  run: [['warm', 'Aufwärmen'], ['main', 'Hauptteil'], ['cool', 'Ausklang']],
  bike: [['warm', 'Aufwärmen'], ['main', 'Hauptteil'], ['cool', 'Ausklang']],
  swim: [['warm', 'Einschwimmen'], ['tech', 'Technik'], ['main', 'Hauptserie'], ['cool', 'Ausschwimmen']]
};
/** Felder je Abschnitt und Sportart (gleiche Schlüssel und Prüfung wie die Felder der Einheit, shared/validate checkField) */
export const SEC_FIELDS: Record<SecSport, { key: keyof SecRow; label: string; unit?: string; pace?: boolean }[]> = {
  run: [{ key: 'min', label: 'Dauer', unit: 'min' }, { key: 'km', label: 'Strecke', unit: 'km' }, { key: 'hr', label: 'Ø Puls', unit: 'bpm' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm' }, { key: 'pace', label: 'Ø Pace', unit: '/km', pace: true }],
  bike: [{ key: 'min', label: 'Dauer', unit: 'min' }, { key: 'km', label: 'Strecke', unit: 'km' }, { key: 'hr', label: 'Ø Puls', unit: 'bpm' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm' }, { key: 'power', label: 'Ø Watt', unit: 'W' }, { key: 'speed', label: 'Ø Tempo', unit: 'km/h' }],
  swim: [{ key: 'min', label: 'Dauer', unit: 'min' }, { key: 'meters', label: 'Strecke', unit: 'm' }, { key: 'hr', label: 'Ø Puls', unit: 'bpm' }, { key: 'maxHr', label: 'max. Puls', unit: 'bpm' }, { key: 'pace100', label: 'Ø Pace', unit: '/100 m', pace: true }]
};
export const partLabel = (sport: string, p: SecPart) => ((SEC_PARTS as any)[sport] || SEC_PARTS.run).find((x: any) => x[0] === p)?.[1] || p;

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const paceSec = (v: any): number | null => { if (typeof v === 'number') return v; const m = /^(\d+)[:.,](\d{2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`.replace(/:60$/, ':59');
const r1 = (x: number) => Math.round(x * 10) / 10;
const median = (a: number[]) => { const v = [...a].sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
/** Pulszone wie im Coach (Anteil vom Schwellenpuls) */
export const zoneOfHr = (hr: number, lthr: number) => { const p = hr / lthr * 100; return p < 81 ? 1 : p <= 89.5 ? 2 : p <= 93.5 ? 3 : p <= 102 ? 4 : 5; };

/* ---------- Minuten-Verlauf beim Einlesen (klein: 3 Zahlen je Minute) ---------- */
export function minuteSeries(raw: RawActivity, step = 60): MinuteSeries | null {
  const recs = (raw.records || []).filter(r => r && Number.isFinite(r.t));
  if (recs.length < 30 || !['run', 'bike', 'walk'].includes(raw.sport)) return null;
  const end = recs[recs.length - 1].t; const n = Math.min(600, Math.ceil(end / step));
  if (n < 5) return null;
  const hr: (number | null)[] = [], hx: (number | null)[] = [], m: (number | null)[] = [], w: (number | null)[] = [];
  let anyW = false, anyHr = false, i = 0;
  let lastDist = recs.find(r => r.dist != null)?.dist ?? null;
  for (let k = 0; k < n; k++) {
    const t1 = (k + 1) * step; const hs: number[] = [], ws: number[] = []; let dEnd: number | null = null;
    while (i < recs.length && recs[i].t < t1) { const r = recs[i++]; if (r.hr != null && r.hr > 30) hs.push(r.hr); if (r.power != null && r.power > 0) ws.push(r.power); if (r.dist != null) dEnd = r.dist; }
    hr.push(hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : null); hx.push(hs.length ? Math.max(...hs) : null);
    if (hs.length) anyHr = true;
    w.push(ws.length ? Math.round(ws.reduce((a, b) => a + b, 0) / ws.length) : null); if (ws.length) anyW = true;
    m.push(dEnd != null && lastDist != null ? Math.max(0, Math.round(dEnd - lastDist)) : null); if (dEnd != null) lastDist = dEnd;
  }
  if (!anyHr && !m.some(x => x)) return null;
  return { step, hr, hx, m, ...(anyW ? { w } : {}) };
}

/* ---------- Einheiten für die Erkennung ---------- */
function unitsOf(act: any): { units: Unit[]; source: SecSource } | null {
  if (!act) return null;
  const s: MinuteSeries | undefined = act.series;
  if (s && Array.isArray(s.hr) && s.hr.length >= 5) return { source: 'series', units: s.hr.map((h, i) => ({ sec: s.step || 60, hr: h, hx: s.hx?.[i] ?? h, m: s.m?.[i] ?? null, w: s.w?.[i] ?? null })) };
  const sp = act.splits as { km: number; pace: string; hr: number | null }[] | undefined;
  if (act.sport === 'run' && Array.isArray(sp) && sp.length >= 4) return { source: 'splits', units: sp.map(x => ({ sec: paceSec(x.pace) || 0, m: 1000, hr: x.hr ?? null, hx: x.hr ?? null, w: null })).filter(u => u.sec > 0) };
  return null;
}
const agg = (units: Unit[], part: SecPart, sport: string): SecRow | null => {
  const sec = units.reduce((a, u) => a + u.sec, 0); if (sec < 30) return null;
  const hrU = units.filter(u => u.hr != null); const hrSec = hrU.reduce((a, u) => a + u.sec, 0);
  const hr = hrSec ? Math.round(hrU.reduce((a, u) => a + u.hr! * u.sec, 0) / hrSec) : null;
  const hxs = units.map(u => u.hx ?? u.hr).filter((x): x is number => x != null);
  const mU = units.filter(u => u.m != null); const m = mU.length === units.length ? mU.reduce((a, u) => a + (u.m || 0), 0) : null;
  const wU = units.filter(u => u.w != null); const wSec = wU.reduce((a, u) => a + u.sec, 0);
  const row: SecRow = { part, min: r1(sec / 60) };
  if (m != null && m > 0) { if (sport === 'swim') row.meters = Math.round(m); else row.km = Math.round(m / 10) / 100; }
  if (hr != null) row.hr = hr; if (hxs.length) row.maxHr = Math.max(...hxs);
  if (m && sport === 'run') row.pace = mmss(sec / (m / 1000));
  if (m && sport === 'bike') row.speed = r1(m / sec * 3.6);
  if (wSec >= sec * 0.5 && sport === 'bike') row.power = Math.round(wU.reduce((a, u) => a + u.w! * u.sec, 0) / wSec);
  return row;
};

export interface DetectOpts { sport: string; lthr?: number | null; zone?: number | null; plannedWarm?: number | null; plannedCool?: number | null; bounds?: { warm?: number | null; cool?: number | null } | null }
/** Aufwärmen/Hauptteil/Ausklang aus gleich langen Stücken (Minuten oder km). Liefert Grenzen als Index. */
export function splitUnits(units: Unit[], o: DetectOpts): { w: number; c: number } | null {
  const n = units.length; if (n < 4) return null;
  const totalSec = units.reduce((a, u) => a + u.sec, 0); if (totalSec < 15 * 60) return null;
  // Zeit → Index (für Grenzen in Minuten)
  const idxAt = (min: number) => { let t = 0; for (let i = 0; i < n; i++) { if (t >= min * 60 - 1) return i; t += units[i].sec; } return n; };
  // von Hand korrigiert: nur die korrigierte Grenze gilt, die andere bleibt automatisch erkannt
  if (o.bounds && (o.bounds.warm != null || o.bounds.cool != null)) {
    const a = splitUnits(units, { ...o, bounds: null }) || { w: 0, c: n };
    const w = o.bounds.warm != null ? Math.max(0, Math.min(n - 1, idxAt(o.bounds.warm))) : a.w;
    const c = o.bounds.cool != null ? Math.max(w + 1, Math.min(n, idxAt(o.bounds.cool))) : Math.max(w + 1, a.c);
    return { w, c };
  }
  const hrs = units.map(u => u.hr);
  const haveHr = hrs.filter(h => h != null).length >= n * 0.6;
  const speeds = units.map(u => (u.m != null && u.sec ? u.m / u.sec : null));
  const keyOf = (i: number) => (o.sport === 'bike' && units[i].w != null ? units[i].w : speeds[i]);
  const mid = units.slice(Math.floor(n * 0.3), Math.max(Math.floor(n * 0.3) + 1, Math.ceil(n * 0.8)));
  const level = median(mid.map(u => u.hr).filter((x): x is number => x != null));
  const kMid = median(mid.map((_, j) => keyOf(Math.floor(n * 0.3) + j)).filter((x): x is number => x != null && x > 0));
  const capW = Math.max(1, Math.min(Math.floor(n * 0.35), idxAt(30)));
  const capC = Math.max(1, Math.min(Math.floor(n * 0.25), n - idxAt((totalSec / 60) - 20)));
  let w = 0, c = n;
  if (haveHr && level) {
    // Ziel: untere Grenze der Zielzone, wenn der Hauptteil sie erreicht; sonst 5 Schläge unter dem Niveau des Hauptteils
    const lo = o.lthr && o.zone ? Math.round(o.lthr * HR_ZONES[Math.max(1, Math.min(5, o.zone)) - 1].low / 100) : 0;
    const thr = lo && level >= lo && o.zone! > 1 ? Math.max(lo, level - 12) : level - 5;
    // Aufwärmen: bis der Puls (zwei Stücke hintereinander bzw. ein langes Stück) die Schwelle erreicht
    while (w < capW && !(hrs[w] != null && hrs[w]! >= thr && (units[w].sec >= 120 || hrs[w + 1] == null || hrs[w + 1]! >= thr - 2))) w++;
    if (w >= capW) w = 0;
    // Ausklang: am Ende Puls deutlich unter dem Niveau oder Tempo/Watt deutlich langsamer
    const slow = (i: number) => { const k = keyOf(i); return kMid != null && k != null && k < kMid * 0.85; };
    while (c - 1 > w && n - c < capC && hrs[c - 1] != null && (hrs[c - 1]! < level - 8 || slow(c - 1))) c--;
  } else if (kMid != null) {
    const slow = (i: number) => { const k = keyOf(i); return k != null && k < kMid * 0.88; };
    while (w < capW && slow(w)) w++;
    if (w >= capW) w = 0;
    while (c - 1 > w && n - c < capC && slow(c - 1)) c--;
  } else return null;
  // geplante Abschnitte als Vorgabe, wenn der Verlauf nichts zeigt
  if (w === 0 && o.plannedWarm && !haveHr) w = Math.min(capW, idxAt(o.plannedWarm));
  if (c === n && o.plannedCool && !haveHr) c = Math.max(w + 1, n - Math.min(capC, n - idxAt(totalSec / 60 - o.plannedCool)));
  // zu kurze Stücke zählen nicht (unter 2 min Aufwärmen bzw. Ausklang)
  const secOf = (a: number, b: number) => units.slice(a, b).reduce((s, u) => s + u.sec, 0);
  if (secOf(0, w) < 120) w = 0;
  if (secOf(c, n) < 120) c = n;
  return { w, c };
}

/** Abschnitte aus Runden der Uhr (Workout mit Aufwärmen/Ausklang) */
function fromWatchLaps(act: any, sport: string): SecRow[] | null {
  const laps: any[] = (act && act.laps) || [];
  if (!laps.some(l => l.kind === 'warmup' || l.kind === 'cooldown')) return null;
  const toUnits = (ls: any[]): Unit[] => ls.map(l => ({ sec: l.sec || 0, m: l.m ?? null, hr: l.avgHr ?? null, hx: l.maxHr ?? l.avgHr ?? null, w: l.power ?? null }));
  const warm = laps.filter(l => l.kind === 'warmup'), cool = laps.filter(l => l.kind === 'cooldown');
  const main = laps.filter(l => l.kind !== 'warmup' && l.kind !== 'cooldown');
  return [agg(toUnits(warm), 'warm', sport), agg(toUnits(main), 'main', sport), agg(toUnits(cool), 'cool', sport)].filter((x): x is SecRow => !!x);
}

/** Ziel des Hauptteils aus der geplanten Einheit (Zone und geplante Minuten Aufwärmen/Ausklang) */
export function plannedShape(planned: any): { zone: number | null; warm: number | null; cool: number | null; steady: boolean } {
  const spec = planned && planned.spec; const steps: any[] = (spec && spec.steps) || [];
  const zoneTxt = [...String((planned && planned.zone) || '').matchAll(/\d/g)].map(x => +x[0]);
  const mainSteps = steps.filter(s => s.part === 'main');
  const zone = mainSteps.length ? Math.max(...mainSteps.map(s => s.zone || 2)) : zoneTxt.length ? Math.max(...zoneTxt) : null;
  const sumMin = (part: string) => { const st = steps.filter(s => s.part === part); return st.length ? st.reduce((a, s) => a + (s.reps || 1) * (s.min || 0), 0) : null; };
  // gleichmäßig: ein durchgehender Hauptteil (keine Wiederholungen mit Pausen)
  const steady = !mainSteps.length || mainSteps.every(s => (s.reps || 1) === 1 || (s.min || 0) <= 1);
  return { zone, warm: sumMin('warm'), cool: sumMin('cool'), steady };
}

/** Abschnitte einer Einheit: von Hand (Vorrang), sonst aus der Uhr. */
export function sectionsOf(planned: any, st: any, act: any, thr: { lthrRun?: number | null; lthrBike?: number | null } = {}, sport?: string): SecResult {
  const sp = sport || (planned && planned.sport) || (act && act.sport) || 'run';
  const m = (st && st.metrics) || {};
  const own = Array.isArray(m.sections) && m.sections.some((r: any) => r && Object.keys(r).some(k => k !== 'part' && r[k] != null && r[k] !== ''));
  // Auftrag 37: „wie geplant“ gilt nur, solange die Uhr keine Abschnitte liefert (Uhrdaten haben Vorrang)
  const planOnly = own && ((st && st.metricsSrc) || {}).sections === 'plan';
  const planRows = (): SecResult => ({ rows: m.sections.map((r: any) => ({ ...r })), source: 'plan' });
  if (own && !planOnly) return { rows: m.sections.map((r: any) => ({ ...r })), source: 'manual' };
  if (sp === 'swim' || !act) return planOnly ? planRows() : { rows: [], source: 'none' };
  const bounds = m.sectionBounds && typeof m.sectionBounds === 'object' ? m.sectionBounds : null;
  if (!bounds) { const wl = fromWatchLaps(act, sp); if (wl && wl.length) return { rows: wl, source: 'watch' }; }
  const u = unitsOf(act); if (!u) return planOnly ? planRows() : { rows: [], source: 'none' };
  const shape = plannedShape(planned);
  const lthr = sp === 'bike' ? thr.lthrBike : thr.lthrRun;
  const cut = splitUnits(u.units, { sport: sp, lthr, zone: shape.zone, plannedWarm: shape.warm, plannedCool: shape.cool, bounds });
  if (!cut) return planOnly ? planRows() : { rows: [], source: 'none' };
  const minAt = (i: number) => r1(u.units.slice(0, i).reduce((a, x) => a + x.sec, 0) / 60);
  const rows = [agg(u.units.slice(0, cut.w), 'warm', sp), agg(u.units.slice(cut.w, cut.c), 'main', sp), agg(u.units.slice(cut.c), 'cool', sp)].filter((x): x is SecRow => !!x);
  return { rows, source: u.source, warmEnd: cut.w ? minAt(cut.w) : 0, coolStart: cut.c < u.units.length ? minAt(cut.c) : null, totalMin: minAt(u.units.length), corrected: !!bounds };
}

/** Hauptteil mit Zeit in den Zonen (nur, wenn es wirklich Abschnitte gibt: Aufwärmen oder Ausklang erkannt bzw. eingetragen) */
export function mainPart(planned: any, st: any, act: any, thr: { lthrRun?: number | null; lthrBike?: number | null } = {}, sport?: string): MainPart | null {
  const sp = sport || (planned && planned.sport) || (act && act.sport) || 'run';
  const r = sectionsOf(planned, st, act, thr, sp);
  const main = r.rows.find(x => x.part === 'main' && !x.off && !x.plan); if (!main) return null;
  const others = r.rows.filter(x => x.part !== 'main' && !x.off);
  if (!others.length && r.source !== 'manual') return null;
  const sec = Math.round((num(main.min) || 0) * 60); if (sec < 300) return null;
  const km = num(main.km), meters = num(main.meters);
  let pace = paceSec(main.pace); if (pace == null && km && sp === 'run') pace = Math.round(sec / km);
  let speed = num(main.speed); if (speed == null && km && sp === 'bike') speed = r1(km / (sec / 3600));
  let p100 = paceSec(main.pace100); if (p100 == null && meters && sp === 'swim') p100 = Math.round(sec / (meters / 100));
  // Zeit in der Zielzone aus dem Verlauf (Minuten-Stücke des Hauptteils)
  let zoneSec: number[] | null = null;
  const lthr = sp === 'bike' ? thr.lthrBike : thr.lthrRun;
  const u = r.source === 'series' || r.source === 'splits' ? unitsOf(act) : null;
  if (u && lthr && r.warmEnd != null) {
    const sum = (k: number) => u.units.slice(0, k).reduce((a, x) => a + x.sec, 0);
    let i0 = 0; while (i0 < u.units.length && sum(i0) < (r.warmEnd || 0) * 60 - 1) i0++;
    let i1 = u.units.length; if (r.coolStart != null) { i1 = 0; while (i1 < u.units.length && sum(i1) < r.coolStart * 60 - 1) i1++; }
    zoneSec = [0, 0, 0, 0, 0];
    u.units.slice(i0, i1).forEach(x => { if (x.hr != null) zoneSec![zoneOfHr(x.hr, lthr) - 1] += x.sec; });
    if (!zoneSec.some(Boolean)) zoneSec = null;
  }
  const warm = r.rows.find(x => x.part === 'warm'), cool = r.rows.find(x => x.part === 'cool');
  return { sec, hr: num(main.hr), maxHr: num(main.maxHr), paceSec: pace, speed, power: num(main.power), pace100: p100, zoneSec, source: r.source,
    warmMin: warm ? num(warm.min) : null, coolMin: cool ? num(cool.min) : null };
}

/** „Hauptteil 40 min, Ø Puls 147 (Zone 2)“ */
export function mainText(mp: MainPart | null, lthr: number | null | undefined, sport = 'run', zone?: number | null): string {
  if (!mp) return '';
  const parts = [`${sport === 'swim' ? 'Hauptserie' : 'Hauptteil'} ${Math.round(mp.sec / 60)} min`];
  if (mp.hr) parts.push(`Ø Puls ${Math.round(mp.hr)}${lthr ? ` (Zone ${zoneOfHr(mp.hr, lthr)})` : ''}`);
  if (mp.zoneSec && zone) { const tot = mp.zoneSec.reduce((a, b) => a + b, 0); if (tot) parts.push(`${Math.round(mp.zoneSec[zone - 1] / tot * 100)} % der Zeit in Zone ${zone}`); }
  return parts.join(', ');
}

/** Kennzeichen eines Abschnitts (keine Werte) */
const META = new Set(['part', 'plan', 'off', 'added']);
/** Auftrag 37: Wiederholungen eines Satzes als Stücke für die Gesamtwerte (Belastung + Pause danach). Pausen zählen bei Dauer und
    Strecke mit, beim Ø Puls nicht (kein Pulswert der Pause). Nicht eingetragene Wiederholungen bleiben leer → dann keine Gesamtdauer. */
export function ivUnits(ivRows: any[], sport: string, targets?: any[] | null): (SecRow & { _rest?: boolean })[] {
  const out: (SecRow & { _rest?: boolean })[] = [];
  const owned = (ivRows || []).some(x => x && x.ti != null);
  (ivRows || []).forEach((r: any, i: number) => {
    if (!r) return;
    // Pause: eingetragen, sonst die geplante (wer nichts anderes sagt, hat die Pause wie geplant gemacht)
    const t = targets ? (r.ti != null ? targets[r.ti] : owned ? null : targets[i]) : null;
    const rest = num(r.restSec) ?? (t && t.restSec ? t.restSec : null);
    const sec = num(r.sec), m = num(r.m);
    const u: any = { part: 'main', min: sec != null ? sec / 60 : null, hr: r.hr ?? null, maxHr: r.maxHr ?? null, power: r.power ?? null, speed: r.speed ?? null, pace: r.pace ?? null, pace100: r.pace100 ?? null };
    if (sport === 'swim') u.meters = m; else u.km = m != null ? m / 1000 : null;
    if (sport === 'swim' && u.min == null && m && paceSec(r.pace100)) u.min = paceSec(r.pace100)! * m / 100 / 60;
    out.push(u);
    if (rest) out.push({ part: 'main', min: rest / 60, _rest: true, ...(sport === 'swim' ? { meters: 0 } : {}) } as any);
  });
  return out;
}
/** Gesamtwerte aus Abschnitten (Dauer, Strecke, Ø Puls zeitgewichtet, max. Puls). Nur Felder mit Werten in allen nötigen Abschnitten.
    Auftrag 37: mit den Wiederholungen der Sätze (ivRows) – die Gesamtwerte passen dann zum ganzen Ablauf, nicht nur zu Aufwärmen/Ausklang. */
export function totalsFromSections(rows: SecRow[], sport: string, ivRows?: any[] | null, targets?: any[] | null): Record<string, string> {
  const own = rows.filter(r => r && !r.off && Object.keys(r).some(k => !META.has(k) && r[k as keyof SecRow] != null && r[k as keyof SecRow] !== ''));
  const R: (SecRow & { _rest?: boolean })[] = [...own, ...(ivRows && ivRows.length ? ivUnits(ivRows, sport, targets) : [])];
  if (!R.length) return {};
  // Pausen: zählen bei Dauer (und Strecke, falls bekannt), nicht beim Ø Puls
  const restOk = (r: any) => r._rest;
  const out: Record<string, string> = {};
  const mins = R.map(r => num(r.min));
  const de = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d);
  if (mins.every(x => x != null)) out.min = de(mins.reduce((a, b) => a! + b!, 0)!);
  const dk = sport === 'swim' ? 'meters' : 'km';
  // Pausen ohne bekannte Strecke (Traben, Rollen): dann keine Gesamtstrecke – sie wäre zu kurz
  const ds = R.map(r => num((r as any)[dk]) ?? (sport === 'run' && num(r.min) && paceSec(r.pace) ? num(r.min)! * 60 / paceSec(r.pace)! : sport === 'bike' && num(r.min) && num(r.speed) ? num(r.min)! / 60 * num(r.speed)! : null));
  if (ds.every(x => x != null)) out[dk] = sport === 'swim' ? String(Math.round(ds.reduce((a, b) => a! + b!, 0)!)) : de(ds.reduce((a, b) => a! + b!, 0)!, 2);
  const hrNeed = R.filter(r => !restOk(r));
  const hrRows = hrNeed.filter(r => num(r.hr) != null && num(r.min) != null);
  if (hrRows.length && hrRows.length === hrNeed.length) { const t = hrRows.reduce((a, r) => a + num(r.min)!, 0); if (t) out.hr = String(Math.round(hrRows.reduce((a, r) => a + num(r.hr)! * num(r.min)!, 0) / t)); }
  const mx = R.map(r => num(r.maxHr) ?? num(r.hr)).filter((x): x is number => x != null); if (mx.length && R.some(r => num(r.maxHr) != null)) out.maxHr = String(Math.max(...mx));
  if (sport === 'bike') { const pw = hrNeed.filter(r => num(r.power) != null && num(r.min) != null); if (pw.length && pw.length === hrNeed.length) { const t = pw.reduce((a, r) => a + num(r.min)!, 0); if (t) out.power = String(Math.round(pw.reduce((a, r) => a + num(r.power)! * num(r.min)!, 0) / t)); } }
  return out;
}
/** Abschnitte von Hand speichern: Gesamtwerte nachziehen, solange sie nicht selbst eingetragen wurden (Quelle „sections“ oder leer) */
export function applySections(st: any, rows: SecRow[], sport: string, ivRows?: any[] | null, src: 'manual' | 'plan' = 'manual', targets?: any[] | null): any {
  const out = { ...st, metrics: { ...(st.metrics || {}) }, metricsSrc: { ...(st.metricsSrc || {}) }, metricsManual: { ...(st.metricsManual || {}) } };
  const clean = rows.map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== ''))) as SecRow[];
  const any = clean.some(r => Object.keys(r).length > 1);
  if (any) { out.metrics.sections = clean; out.metricsSrc.sections = src; if (out.metricsAuto && src === 'manual') out.metricsManual.sections = true; }
  else { delete out.metrics.sections; delete out.metricsSrc.sections; delete out.metricsManual.sections; }
  return applyTotals(out, sport, ivRows, targets);
}
/** Auftrag 37: Gesamtwerte der Einheit aus dem ganzen Ablauf (eingetragene Abschnitte + Wiederholungen von Hand bzw. „wie geplant“),
    solange sie nicht selbst eingetragen oder von der Uhr gemessen wurden (Quelle „sections“ oder leer). */
export function applyTotals(st: any, sport: string, ivRows?: any[] | null, targets?: any[] | null): any {
  const out = { ...st, metrics: { ...(st.metrics || {}) }, metricsSrc: { ...(st.metricsSrc || {}) } };
  const secs: SecRow[] = Array.isArray(out.metrics.sections) && ['manual', 'plan'].includes(out.metricsSrc.sections) ? out.metrics.sections : [];
  const iv = ivRows !== undefined ? ivRows : Array.isArray(out.metrics.intervals) && ['manual', 'plan'].includes(out.metricsSrc.intervals) ? out.metrics.intervals : null;
  const any = secs.some(r => r && !r.off && Object.keys(r).some(k => !META.has(k) && (r as any)[k] != null && (r as any)[k] !== '')) || !!(iv && iv.length);
  const tot = any ? totalsFromSections(secs, sport, iv, targets) : {};
  for (const k of ['min', 'km', 'meters', 'hr', 'maxHr', 'power']) {
    const own = out.metricsSrc[k] === 'sections';
    const empty = out.metrics[k] == null || out.metrics[k] === '';
    if (tot[k] != null && (own || empty)) { out.metrics[k] = tot[k]; out.metricsSrc[k] = 'sections'; }
    else if (tot[k] == null && own) { delete out.metrics[k]; delete out.metricsSrc[k]; }
  }
  return out;
}
/** Grenze korrigieren (Minuten ab Start); null/null = automatische Erkennung */
export function setBounds(st: any, warm: number | null, cool: number | null): any {
  const out = { ...st, metrics: { ...(st.metrics || {}) } };
  if (warm == null && cool == null) delete out.metrics.sectionBounds; else out.metrics.sectionBounds = { warm, cool };
  return out;
}
