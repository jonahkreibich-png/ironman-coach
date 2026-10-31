/* Auftrag 17, Punkt 6: Aussagen über erreichte Leistungen werden vor dem Anzeigen gegen die echten Daten geprüft – deterministisch, nicht von
   der KI. Gilt für den Regel-Coach (Engine, Chat) und für die KI-Antworten (Workers AI, Claude).
   Geprüft wird nur, was als ERREICHT behauptet wird („100 m Kraul geschafft“, „neue Bestmarke 100 m“, „Deine Schwimm-Stufe: 100-m-Stücke“,
   „12 km gelaufen“). Bedingungen und Fragen („wenn du 100 m zweimal schaffst“) sind keine Behauptung, Plan- und Ziel-Teile eines Satzes
   („geplant waren 100 m“, „(Ziel war 100 m)“) werden vor der Prüfung entfernt.
   Belegt sind nur eingetragene oder gemessene Werte (shared/results.ts), nie das Soll einer Einheit. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { doneItems, valsOf } from './review';
import { sleepNeed } from '../profile';

export interface ClaimFacts {
  /** längste Strecke Kraul am Stück (Einzelwert), bestätigt (in 2 Einheiten) und eigene Angabe im Profil */
  crawlBest: number; crawlConfirmed: number; crawlProfile: number;
  pullBest?: number; pullConfirmed?: number; pullProfile?: number;
  /** längste wirklich gelaufene / gefahrene Strecke (km) und Dauer (min), längste Schwimmstrecke (m) der letzten 6 Wochen */
  runKm: number; bikeKm: number; runMin: number; bikeMin: number; swimM: number;
  /** Auftrag 18: Ursachen-Daten der Tage, um die es geht (Ursache und Wirkung müssen am selben Tag belegt sein) */
  days?: DayFacts[];
}
export function claimFacts(ctx: EngineCtx, date?: string): ClaimFacts {
  const pr = C.swimProofs(ctx.state, ctx.baseWeeks || [], ctx.today, 84);
  const crawls = pr.map((p: any) => p.crawl).filter(Boolean) as number[];
  const pulls = pr.map((p: any) => p.pull).filter(Boolean) as number[];
  const items = doneItems(ctx, C.addDays(ctx.today, -42), ctx.today).map(d => ({ d, v: valsOf(d) }));
  const max = (sport: string, k: 'km' | 'min' | 'meters') => Math.max(0, ...items.filter(x => x.d.sport === sport).map(x => Number((x.v as any)[k]) || 0));
  const sk: any = (ctx.profile && ctx.profile.skills) || {};
  const ev = sk.swimEvidence && sk.swimEvidence.crawl;
  let days: DayFacts[] = [];
  try { days = causeDays(ctx, date); } catch (e) { days = []; }
  return { crawlBest: Math.max(0, ...crawls), crawlConfirmed: C.confirmedOf(crawls), crawlProfile: ev && ev.manual ? Number(sk.swimCrawlM) || 0 : 0,
    pullBest: Math.max(0,...pulls), pullConfirmed: C.confirmedOf(pulls), pullProfile: sk.swimEvidence?.pull?.manual ? Number(sk.swimPullM) || 0 : 0,
    runKm: max('run', 'km'), bikeKm: max('bike', 'km'), runMin: max('run', 'min'), bikeMin: max('bike', 'min'), swimM: max('swim', 'meters'), days };
}

/* ---------- Auftrag 18, Punkt 1: Ursachen und Zusammenhänge nur mit Daten ----------
   „Der wenige Schlaf erklärt den höheren Puls“ ist nur erlaubt, wenn für genau diesen Tag beide Werte vorliegen (Schlaf UND Puls der Einheit)
   und die Abweichung zur eigenen Basis wirklich besteht (Schlaf unter Bedarf bzw. unter 6 h; Puls bei gleicher Pace mindestens 5 Schläge über
   dem 6-Wochen-Schnitt). Sonst höchstens neutral: „Du hast nur 5,5 h geschlafen, mach heute lieber locker.“ */
export interface SessionFacts { sport: string; hr: number | null; hrDelta: number | null; paceDelta: number | null; rpe: number | null; rpeHigh: boolean; dec: number | null; tempC: number | null; hard: boolean }
export interface DayFacts {
  date: string;
  /** Schlaf (h) und ob er wirklich kurz war (unter 6 h oder deutlich unter dem Bedarf) */ sleepH: number | null; sleepShort: boolean;
  /** Morgenwerte mit echter Abweichung */ hrvLow: boolean; rhrHigh: boolean; feelTired: boolean; ill: boolean; tempUp: boolean;
  /** höchste gemessene Temperatur einer Einheit an dem Tag */ tempC: number | null;
  sessions: SessionFacts[];
}
export const HR_DELTA = 5;
export const HEAT_C = 25;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
/* Puls einer Einheit gegen den 6-Wochen-Schnitt ähnlicher Einheiten (gleiche Sportart, gleich hart, gleiche Pace ±10 s/km bzw. gleiches
   Tempo/gleiche Leistung ±5 %). Liefert die Abweichung in Schlägen (null ohne mindestens 2 Vergleichswerte). */
export function hrVsBase(ctx: EngineCtx, d: any, v: any): { delta: number; n: number } | null {
  if (!v || !v.hr || !(d.sport === 'run' || d.sport === 'bike')) return null;
  const list = doneItems(ctx, C.addDays(d.date, -42), C.addDays(d.date, -1)).filter(x => x.sport === d.sport && x.key !== d.key).map(x => ({ x, w: valsOf(x) }))
    .filter(({ w }) => w.hr && (d.sport === 'run' ? (v.pace && w.pace && Math.abs(w.pace - v.pace) <= 10) : v.power && w.power ? Math.abs(w.power / v.power - 1) <= 0.05 : (v.speed && w.speed && !w.indoor === !v.indoor && Math.abs(w.speed / v.speed - 1) <= 0.05)));
  if (list.length < 2) return null;
  const avg = list.reduce((a, y) => a + (y.w.hr as number), 0) / list.length;
  return { delta: Math.round(v.hr - avg), n: list.length };
}
/* Pace bei gleichem Puls (±3 Schläge) gegen den 6-Wochen-Schnitt: positiv = langsamer (s/km) */
function paceVsBase(ctx: EngineCtx, d: any, v: any): number | null {
  if (d.sport !== 'run' || !v || !v.hr || !v.pace) return null;
  const list = doneItems(ctx, C.addDays(d.date, -42), C.addDays(d.date, -1)).filter(x => x.sport === 'run' && x.key !== d.key).map(x => valsOf(x)).filter(w => w.hr && w.pace && Math.abs((w.hr as number) - v.hr) <= 3);
  if (list.length < 2) return null;
  return Math.round(v.pace - list.reduce((a, w) => a + (w.pace as number), 0) / list.length);
}
export function causeDays(ctx: EngineCtx, date?: string): DayFacts[] {
  const dates = new Set<string>();
  for (const base of [ctx.today, date].filter(Boolean) as string[]) for (let k = 0; k <= 2; k++) dates.add(C.addDays(base, -k));
  const need = sleepNeed(ctx.profile || {} as any, ctx.today);
  const out: DayFacts[] = [];
  for (const day of [...dates].sort()) {
    const p = (ctx.state.trend || []).find((x: any) => x && x.date === day) || {};
    const sl = typeof p.sleepHours === 'number' ? p.sleepHours : null;
    const bH = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, day, 'hrv', Math.log);
    const bR = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, day, 'restingHR');
    const sess = doneItems(ctx, day, day).map(d => {
      const v = valsOf(d); const hb = hrVsBase(ctx, d, v);
      const hard = !!d.planned && (C.isIntervals(d.planned) || C.isGame(d.planned) || C.isTestOrRace(d.planned));
      return { sport: d.sport, hr: v.hr, hrDelta: hb ? hb.delta : null, paceDelta: paceVsBase(ctx, d, v), rpe: v.rpe, rpeHigh: v.rpe != null && (hard ? v.rpe >= 9 : v.rpe >= 6), dec: v.dec, tempC: v.tempC, hard } as SessionFacts;
    });
    const temps = sess.map(s => s.tempC).filter((x): x is number => typeof x === 'number');
    out.push({ date: day, sleepH: sl, sleepShort: sl != null && (sl < 6 || sl < need[0] - 0.5),
      hrvLow: !!(p.hrv && bH && bH.n >= C.MIN_DAYS && p.hrv < Math.exp(bH.mean) * 0.9), rhrHigh: !!(p.restingHR && bR && bR.n >= C.MIN_DAYS && p.restingHR - bR.mean >= 3),
      feelTired: (typeof p.feel === 'number' && p.feel >= 4) || sess.some(s => s.rpeHigh), ill: !!C.illnessAt(ctx.state.illnessPeriods, day), tempUp: typeof p.bodyTemp === 'number' && p.bodyTemp >= 0.3,
      tempC: temps.length ? Math.max(...temps) : null, sessions: sess });
  }
  return out;
}
void median;

// Ursache, Wirkung und ein Wort, das beides verknüpft
const CAUSE: [string, RegExp][] = [
  ['sleep', /schlaf|geschlafen|nacht\b|kurze nacht/i], ['heat', /hitze|\bhei(ß|ss)\w*|\d\s*°\s*c|temperatur/i], ['fatigue', /müdigkeit|müde|erschöpf|ermüd|platt|ausgelaugt|belastung der letzten/i],
  ['ill', /krank|infekt|erkält|schnupfen/i], ['hrv', /\bhfv\b|\bhrv\b|herzfrequenzvariab/i], ['rhr', /ruhepuls/i], ['morning', /morgenwerte/i], ['stress', /stress|prüfung/i]
];
const EFFECT: [string, RegExp][] = [
  ['hr', /\bpuls\b|herzfrequenz\b/i], ['pace', /\bpace\b|tempo|langsamer|schneller|\/km/i], ['rpe', /\bschwer(er)?\b|anstrengung|\brpe\b|gefühl \d|fühlte sich|zäh/i],
  ['dec', /entkopplung/i], ['perf', /leistung|watt|effizienz|pro herzschlag/i]
];
const LINK = /\berklär\w*|\bweil\b|\bda du\b|\bliegt\b[^.]{0,20}\ban\b|\bwegen\b|\bkommt\b[^.]{0,15}\b(von|vom|durch)\b|\bverursach\w*|\bführt\w* zu|\bsorgt\w* für|\bspricht\w* für|\bzeichen (von|für)\b|\bdeutet\w* auf|\bgrund (dafür|für)\b|\bder grund\b|\bdeshalb\b|\bdaher\b|\bdarum\b|\bdurch (den|die|das|deinen|deine)\b|\bist (das |dies )?normal\b|\bist dein[^.]{0,25}normal\b|\bnormal bei\b|\bbei[^.]{0,30}(hitze|°\s*c)[^.]{0,40}normal\b|\berhöh\w*|\btreib\w* [^.]{0,20}hoch|\bbrems\w*|\bmacht\w* [^.]{0,15}(langsam|schwer|müde)|\bpasst (gut )?(zusammen|zu)\b|\bhängt [^.]{0,15}zusammen|\bausgelöst/i;
// allgemeines Wissen ohne Bezug auf die Person bleibt erlaubt („Hitze erhöht die Entkopplung.“)
const PERSONAL = /\b(du|dein\w*|dir|dich|heute|gestern|vorgestern|diese[mnrs]?|heutige\w*|gestrige\w*)\b|\b(der|den|dem|die|das) (wenige|kurze|schlechte|höhere|hohe|erhöhte|langsamere|schwere|zähe)\b|\b(der|die|das|diese[rs]?) (einheit|lauf|ausfahrt|radfahrt|training|woche)\b/i;
// vorsichtig formuliert (Frage, Möglichkeiten, Aufforderung zum Prüfen) ist keine Behauptung
const HEDGE = /\?|\bmögliche\w* gründe\b|\bkann viele gründe\b|\bprüf\w*|\bachte\w* auf\b|\bfalls\b|\bwenn\b|\bob\b/i;

/* Ist eine behauptete Ursache an einem Tag mit Daten belegt? */
function causeOk(c: string, d: DayFacts): boolean {
  if (c === 'sleep') return d.sleepShort;
  if (c === 'heat') return d.tempC != null && d.tempC >= HEAT_C;
  if (c === 'fatigue') return d.feelTired || d.hrvLow || d.rhrHigh;
  if (c === 'ill') return d.ill;
  if (c === 'hrv') return d.hrvLow;
  if (c === 'rhr') return d.rhrHigh;
  if (c === 'morning') return d.sleepShort || d.hrvLow || d.rhrHigh || d.feelTired || d.tempUp;
  return false; // Stress: keine Messdaten
}
function effectOk(e: string, d: DayFacts): boolean {
  if (e === 'hr') return d.sessions.some(s => s.hrDelta != null && s.hrDelta >= HR_DELTA);
  if (e === 'pace') return d.sessions.some(s => s.paceDelta != null && s.paceDelta >= 10);
  if (e === 'rpe') return d.sessions.some(s => s.rpeHigh);
  if (e === 'dec') return d.sessions.some(s => s.dec != null && s.dec > 5);
  if (e === 'perf') return d.sessions.some(s => (s.hrDelta != null && s.hrDelta >= HR_DELTA) || (s.paceDelta != null && s.paceDelta >= 10));
  return false;
}
/* Unbelegte Ursachen-Behauptungen in einem Text */
export function unsupportedCauses(text: string, f: ClaimFacts): string[] {
  const out: string[] = [];
  const sentences = String(text || '').replace(/\n+/g, '. ').split(/(?<=[.!:])\s+/);
  let prev = '';
  for (const s0 of sentences) {
    const s = s0.trim(); if (!s) continue;
    // „Das erklärt …“: die Ursache steht im Satz davor
    const anaphor = /^(das|dies|daher|deshalb|darum|damit)\b/i.test(s);
    const scope = anaphor ? prev + ' ' + s : s;
    prev = s;
    const causes = CAUSE.filter(([, re]) => re.test(scope)).map(([k]) => k);
    const effects = EFFECT.filter(([, re]) => re.test(s)).map(([k]) => k);
    if (!causes.length || !effects.length || !LINK.test(s) || !(PERSONAL.test(scope) || anaphor) || HEDGE.test(s)) continue;
    // belegt nur, wenn an einem Tag eine genannte Ursache UND eine genannte Wirkung mit echter Abweichung vorliegen
    const ok = (f.days || []).some(d => causes.some(c => causeOk(c, d)) && effects.some(e => effectOk(e, d)));
    if (!ok) out.push(s);
  }
  return [...new Set(out)];
}

// Bedingungen und Fragen behaupten nichts; Plan- und Ziel-Teile eines Satzes werden vor der Prüfung entfernt
const CONDITIONAL = /\b(wenn|sobald|falls|bis du|würde|könnte|möchte|willst|vielleicht)\b|\?/i;
const PLAN_PART = /\([^)]*\)|\b(geplant\w*|ziel\w*|vorgabe\w*|vorgegeben|soll\w*|nächste\w* (stufe|mal|einheit)|noch nicht|nicht|fehl\w*|statt)\b[^,;.]*/gi;
const ACHIEVED = /\b(geschafft|schaffst du jetzt|kannst du jetzt|gekrault|geschwommen|durchgeschwommen|erreicht|bestätigt|bestmarke|bestwert|bestzeit|rekord|neue stufe|eine stufe weiter|gelaufen|gefahren|absolviert|eingetragen)\b|\bdeine (schwimm-)?stufe\b/i;

/* Unbelegte Behauptungen in einem Text (leer = alles belegt) */
export function unsupportedClaims(text: string, f: ClaimFacts): string[] {
  const out: string[] = [];
  const sentences = String(text || '').replace(/\n+/g, '. ').split(/(?<=[.!])\s+/);
  for (const s0 of sentences) {
    const full = s0.trim(); if (!full || CONDITIONAL.test(full)) continue;
    const s = full.replace(PLAN_PART, ' ');
    if (!ACHIEVED.test(s)) continue;
    // Schwimmen: Meter Kraul (am Stück), Stufen mit Stück-Länge
    if (/kraul|pull|buoy|am stück|schwimm|stufe|-m-stücke|bahn/i.test(s)) {
      // Equipment belongs to its own clause. A mixed sentence must satisfy both ceilings.
      for (const clause of s.split(/[,;]|\bund\b/i)) {
        const ms=[...clause.matchAll(/(\d{2,4})(?:\s*m\b|-m-Stück)/gi)].map(m=>+m[1]);
        const pull=/pull|buoy/i.test(clause) && !/ohne\s+(?:den\s+)?pull/i.test(clause);
        const best=pull?(f.pullBest||0):f.crawlBest, confirmed=pull?(f.pullConfirmed||0):f.crawlConfirmed, profile=pull?(f.pullProfile||0):f.crawlProfile;
        const stage=/neue stufe|eine stufe weiter|kannst du jetzt|bestätigt|deine (schwimm-)?stufe|-m-stück/i.test(clause);
        const total=!pull && !/kraul|am stück|ohne.*pull/i.test(clause) && /geschwommen|bahn/i.test(clause);
        const allowed=stage?confirmed:Math.max(best,profile,total?f.swimM:0);
        if (ms.some(m=>m>allowed+0.5) || (/bestmarke|bestwert|rekord/i.test(clause) && ms.some(m=>m>best))) {out.push(full);break;}
      }
      continue;
    }
    // Laufen und Rad: Kilometer und Minuten, die als gemacht behauptet werden
    const sport = /lauf|gelaufen|joggen/i.test(s) ? 'run' : /\brad|gefahren|ausfahrt/i.test(s) ? 'bike' : null;
    if (!sport) continue;
    const kmMax = sport === 'run' ? f.runKm : f.bikeKm, minMax = sport === 'run' ? f.runMin : f.bikeMin;
    if ([...s.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*km\b/gi)].some(m => +m[1].replace(',', '.') > kmMax * 1.05 + 0.2)
      || [...s.matchAll(/(\d{2,3})\s*min\b/gi)].some(m => +m[1] > minMax * 1.05 + 2)) out.push(full);
  }
  // Auftrag 18: Ursachen nur mit Daten (gilt für Regel-Coach und KI)
  if (f.days) out.push(...unsupportedCauses(text, f));
  return [...new Set(out)];
}

/* Für den Regel-Coach: unbelegte Sätze entfernen (statt eine falsche Leistung zu zeigen) */
export function stripUnsupported(text: string, f: ClaimFacts): string {
  const bad = unsupportedClaims(text, f); if (!bad.length) return text;
  let t = String(text);
  for (const b of bad) t = t.split(b).join('');
  return t.replace(/[ \t]+\./g, '.').replace(/\.\s*\./g, '.').replace(/[ \t]{2,}/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/* ---------- Auftrag 21: Texte des Coachs prüfen (Regel-Coach und KI) ----------
   1. Interne Texte (Platzhalter, Ids, „undefined“ …) erscheinen nie: der Satz fällt weg.
   2. Wochentag + Datum („Sa 28.10.“): der Wochentag wird aus dem Datum berichtigt. „Schwimmtest vom Samstag“ ohne Datum: gibt es
      an diesem Wochentag keine passende Einheit, aber genau eine in ±7 Tagen, wird der Wochentag berichtigt.
   3. Artikel bei Einheitennamen: eindeutig falsche Formen („den Schwimmtraining“ → „das Schwimmtraining“). */
export const INTERNAL_RE = /Begründung nicht für die KI freigegeben|Trainingsangabe \(|\bundefined\b|\bNaN\b|\[object Object\]|aiExcluded|session_id|\bto_date\b|\bmsg-[a-z]+-|\bg\d{6}w\d+-[a-z]{2}-\d|\bnull (?:min|m|km|W)\b|\{\{|\}\}/;
export function internalLeaks(text: string): string[] { return String(text || '').split(/(?<=[.!?])\s+|\n/).filter(s => INTERNAL_RE.test(s)); }
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DOW_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dowIdx = (w: string) => { const i = DOW_LONG.findIndex(x => x.toLowerCase() === w.toLowerCase()); return i >= 0 ? i : DOW_SHORT.findIndex(x => x.toLowerCase() === w.replace('.', '').toLowerCase()); };
const dowOfDate = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const NEUTER = /(?:training|schwimmen|radfahren|laufen|krafttraining|intervalltraining|koppeltraining|techniktraining|spiel|rennen)$/i;
const FEMININE = /(?:einheit|fahrt|ausfahrt|runde|intervalleinheit|übung|technikeinheit|session|pause|woche)$/i;
const MASC = /(?:test|lauf|check|ruhetag|tag|block|wettkampf|koppellauf|dauerlauf)$/i;
const SPORT_KEY: [RegExp, string][] = [[/schwimm|kraul|css/i, 'swim'], [/lauf|run/i, 'run'], [/rad|fahrt|bike|rolle/i, 'bike'], [/kraft/i, 'strength']];
export function fixCoachText(text: string, ctx?: { today: string; baseWeeks?: any[]; state?: any }): string {
  let t = String(text || '');
  // 0. Auftrag 25: „25.10..“ → „25.10.“, „…verschieben und warum?“ → „…verschieben?“, doppelte Leerzeichen
  t = t.replace(/(\d\.)\.(?!\.)/g, '$1').replace(/(?<!\.)\.\.(?!\.)/g, '.').replace(/,?\s+(und|oder) warum(?=\s*\?)/gi, '').replace(/[ \t]{2,}/g, ' ');
  // 1. interne Texte
  if (INTERNAL_RE.test(t)) t = t.split(/(?<=[.!?])\s+|\n/).filter(s => !INTERNAL_RE.test(s)).join(' ').trim();
  // 2a. Wochentag passend zum genannten Datum
  const year = ctx ? +ctx.today.slice(0, 4) : new Date().getUTCFullYear();
  t = t.replace(/\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?,? (?:den )?(\d{1,2})\.(\d{1,2})\.(\d{4})?/g, (m, w, dd, mm, yy) => {
    let y = year; if (ctx && +mm < +ctx.today.slice(5, 7) - 6) y++; if (ctx && +mm > +ctx.today.slice(5, 7) + 6) y--; if (yy) y = +yy;
    const iso = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; const real = dowOfDate(iso);
    if (!Number.isFinite(real) || dowIdx(w) === real || dowIdx(w) < 0) return m;
    const long = w.length > 3; return m.replace(w, long ? DOW_LONG[real] : DOW_SHORT[real]);
  });
  // 2b. „<Einheit> vom/am <Wochentag>“ ohne Datum gegen den Plan
  if (ctx && ctx.baseWeeks) {
    const days = C.planDays(C.applyAdjustments(ctx.baseWeeks, (ctx.state && ctx.state.adjustments) || {})).filter((d: any) => d.date >= C.addDays(ctx.today, -7) && d.date <= C.addDays(ctx.today, 7));
    t = t.replace(/\b([A-ZÄÖÜ][\wäöüß-]*(?:test|lauf|training|schwimmen|einheit|fahrt|check))\s+(vom|am|von)\s+(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b/g, (m, name, prep, w) => {
      const sport = (SPORT_KEY.find(([re]) => re.test(name)) || [null, null])[1]; const isTest = /test|check/i.test(name);
      const fit = (s: any) => s.sport !== 'rest' && (!sport || s.sport === sport) && (!isTest || /test|check/i.test(s.title || ''));
      const hits = days.filter((d: any) => d.sessions.some(fit));
      if (!hits.length || hits.some((d: any) => dowOfDate(d.date) === dowIdx(w))) return m;
      const past = hits.filter((d: any) => prep === 'vom' ? d.date <= ctx.today : true);
      const one = (past.length ? past : hits);
      if (new Set(one.map((d: any) => dowOfDate(d.date))).size !== 1) return m;
      return `${name} ${prep} ${DOW_LONG[dowOfDate(one[0].date)]}`;
    });
  }
  // 3. Artikel
  t = t.replace(/\b(den|die|dem|Den|Die|Dem)\s+([A-ZÄÖÜ][\wäöüß-]+)/g, (m, art, noun) => {
    const a = art.toLowerCase(); const cap = art[0] === art[0].toUpperCase();
    const fix = (x: string) => (cap ? x[0].toUpperCase() + x.slice(1) : x) + ' ' + noun;
    if (/intervalle$|übungen$|einheiten$/i.test(noun)) return m; // Mehrzahl
    if (NEUTER.test(noun) && (a === 'den' || a === 'die')) return fix('das');
    if (FEMININE.test(noun) && a === 'den') return fix('die');
    if (FEMININE.test(noun) && a === 'dem') return fix('der');
    if (MASC.test(noun) && a === 'die') return fix('den');
    return m;
  });
  return t.replace(/[ \t]{2,}/g, ' ').trim();
}
