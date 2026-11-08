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
import { actualMetrics } from '../results';
import { storyText, STORY_METRICS, type Story } from '../valuestory';
import { valueStories } from './analysis';

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

/* ---------- Auftrag 29: jede Zahl einer Coach-Aussage gegen die gespeicherten Ist-Werte ----------
   „Etappenziel erreicht, aerobe Entkopplung 4,5 %“ – eingetragen waren 3 %. Geprüft werden gemessene Werte, die als Ist behauptet werden
   (Entkopplung, Puls, max. Puls, Ruhepuls, HFV, Schlaf, Pace, Leistung, Kadenz, RPE). Quelle sind die wirksamen Werte (Hand vor Uhr vor
   berechnet, shared/results.ts) des Tages, um den es geht (Datum/Wochentag/„heute“/„gestern“ im Satz, sonst der Tag der Nachricht).
   Stimmt die Zahl nicht: genau ein gespeicherter Wert → Zahl wird berichtigt; keiner oder mehrere verschiedene → Satz fällt weg.
   Ziele, Bereiche, Pläne, Durchschnitte und Bedingungen sind keine Ist-Behauptung. Läuft beim Anzeigen, also auch nach Korrekturen. */
export interface ValueItem { date: string; sport: string; v: Record<string, number | null> }
export interface ValueFacts { items: ValueItem[]; trend: Record<string, Record<string, number | null>> }
const numOrNull = (x: any): number | null => { if (x == null || x === '') return null; const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export function valueFacts(ctx: EngineCtx, days = 21): ValueFacts {
  const items: ValueItem[] = [];
  for (const d of doneItems(ctx, C.addDays(ctx.today, -days), ctx.today)) {
    const v: any = valsOf(d); const m: any = actualMetrics(d.st, d.act);
    items.push({ date: d.date, sport: d.sport, v: { dec: numOrNull(v.dec), hr: numOrNull(v.hr), maxHr: numOrNull(m.maxHr), pace: numOrNull(v.pace), power: numOrNull(v.power), cadence: numOrNull(v.cadence), rpe: numOrNull(v.rpe) } });
  }
  const trend: ValueFacts['trend'] = {};
  for (const p of (ctx.state.trend || []) as any[]) if (p && p.date >= C.addDays(ctx.today, -days)) trend[p.date] = { restingHR: numOrNull(p.restingHR), hrv: numOrNull(p.hrv), sleepHours: numOrNull(p.sleepHours) };
  return { items, trend };
}
const LEAD = String.raw`(?:\s+(?:[a-zäöüß]{1,12}\.?|\d{1,2}\.\d{1,2}\.(?:\d{4})?)){0,5}?\s*:?\s*`;
const VALUE_METRICS: { key: string; scope: 'session' | 'trend'; sport?: string; re: RegExp; sec?: boolean }[] = [
  { key: 'dec', scope: 'session', re: new RegExp(String.raw`(?:aerobe[n]?\s+)?entkopplung` + LEAD + String.raw`(-?\d+(?:[.,]\d+)?)\s*%`, 'gi') },
  { key: 'maxHr', scope: 'session', re: new RegExp(String.raw`max(?:\.|imale[rn]?)?\s*puls` + LEAD + String.raw`(\d{2,3})\b(?!\s*[-–]\s*\d)`, 'gi') },
  { key: 'restingHR', scope: 'trend', re: new RegExp(String.raw`ruhepuls` + LEAD + String.raw`(\d{2,3})\b(?!\s*[-–]\s*\d)`, 'gi') },
  { key: 'hr', scope: 'session', re: new RegExp(String.raw`(?<![a-zäöüß])(?<!max\.?\s?)(?:ø\s*|durchschnittliche[rn]?\s+)?puls` + LEAD + String.raw`(?:ø\s*)?(\d{2,3})(?:\s*(?:bpm|schläge))?\b(?!\s*[-–]\s*\d)`, 'gi') },
  { key: 'hrv', scope: 'trend', re: new RegExp(String.raw`\b(?:hfv|hrv)` + LEAD + String.raw`(\d{1,3})\s*ms\b`, 'gi') },
  { key: 'sleepHours', scope: 'trend', re: new RegExp(String.raw`\bschlaf` + LEAD + String.raw`(\d{1,2}(?:[.,]\d)?)\s*(?:h|std\.?|stunden)\b|(\d{1,2}(?:[.,]\d)?)\s*(?:h|std\.?|stunden)\s+(?:geschlafen|schlaf)\b`, 'gi') },
  { key: 'pace', scope: 'session', sport: 'run', sec: true, re: new RegExp(String.raw`\b(?:pace|tempo)` + LEAD + String.raw`(\d{1,2}:\d{2})\s*(?:min)?\s*\/\s*km`, 'gi') },
  { key: 'power', scope: 'session', re: new RegExp(String.raw`(?:ø\s*)?(?:leistung|watt)` + LEAD + String.raw`(\d{2,4})\s*(?:w|watt)\b`, 'gi') },
  { key: 'cadence', scope: 'session', re: new RegExp(String.raw`(?:kadenz|trittfrequenz)` + LEAD + String.raw`(\d{2,3})\b(?!\s*[-–]\s*\d)`, 'gi') },
  { key: 'rpe', scope: 'session', re: new RegExp(String.raw`\brpe` + LEAD + String.raw`(\d{1,2})\b(?!\s*[-–/]\s*\d)`, 'gi') }
];
// Ist-Behauptung nur mit Bezug auf Gemessenes; Ziele, Bereiche, Durchschnitte, Bedingungen und Pläne zählen nicht
const MEASURED = /\b(war|waren|lag|lagen|hattest|hatte|hast|gemessen|eingetragen|erreicht|zeigte|zeigt|betrug|gelaufen|gefahren|geschwommen|dein|deine|deinem|deinen|deiner|zuletzt|gestern|vorgestern|heute morgen|heute früh|letzte[nrm]?)\b/i;
const NOT_CLAIM = /\b(schnitt|durchschnitt der|im mittel|mittelwert|trend|basis|normalbereich|zielbereich|ziel|soll|sollte|solltest|halte|halten|bleib\w*|versuch\w*|höchstens|mindestens|zwischen|unter|über|bis zu|bis|ab|zone|schwelle|lthr|ftp|grenze|plan\w*|nächste\w*|morgen|wenn|falls|sobald|ob|etwa|ca|rund|ungefähr|prognose|score)\b|\?/i;
const DOW_RE = /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i;
function refDates(s: string, ref: string): string[] {
  const out: string[] = []; const y = +ref.slice(0, 4);
  for (const m of s.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})?/g)) { let yy = m[3] ? +m[3] : y; if (!m[3] && +m[2] > +ref.slice(5, 7) + 6) yy--; out.push(`${yy}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`); }
  if (out.length) return out;
  if (/\bvorgestern\b/i.test(s)) return [C.addDays(ref, -2)];
  if (/\bgestern\b/i.test(s)) return [C.addDays(ref, -1)];
  const w = DOW_RE.exec(s); if (w) { const idx = DOW_LONG.findIndex(x => x.toLowerCase() === w[1].toLowerCase()); for (let k = 0; k <= 7; k++) { const d = C.addDays(ref, -k); if (dowOfDate(d) === idx) return [d]; } }
  return [];
}
const sportOfSentence = (s: string) => /\b(lauf|läufe|gelaufen|laufen|joggen)/i.test(s) ? 'run' : /\b(rad|ausfahrt|gefahren|radfahrt)/i.test(s) ? 'bike' : /schwimm/i.test(s) ? 'swim' : null;
const secOf = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? +m[1] * 60 + +m[2] : NaN; };
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function fmtLike(v: number, sample: string): string {
  const dec = ((/[.,](\d+)$/.exec(sample) || [])[1] || '').length;
  const r = String(dec ? Number(v.toFixed(dec)) : Math.round(v * 10) / 10);
  return r.replace('.', ',');
}
export interface ValueCheck { text: string; corrected: string[]; dropped: string[] }
export function checkValueClaims(text: string, f: ValueFacts, refDate: string): ValueCheck {
  const corrected: string[] = [], dropped: string[] = [];
  // nicht nach einem Datum („am 5.11. war …“) trennen
  const parts = String(text || '').split(/((?<=[.!])(?<!\b\d{1,2}\.\d{1,2}\.)(?<!\b\d{1,2}\.)\s+|\n)/);
  const out: string[] = [];
  for (const part of parts) {
    if (!part || !part.trim()) { out.push(part || ''); continue; }
    let s = part; let drop = false;
    // Klammern („(Ziel war 5 %)“) zählen nicht; Positionen bleiben gleich
    const masked = s.replace(/\([^()]*\)/g, m => ' '.repeat(m.length));
    if (!MEASURED.test(masked)) { out.push(s); continue; }
    const edits: { at: number; len: number; to: string }[] = [];
    for (const M of VALUE_METRICS) {
      M.re.lastIndex = 0;
      for (const m of masked.matchAll(M.re)) {
        const numTxt = m[1] || m[2]; if (!numTxt) continue;
        const at = (m.index || 0) + m[0].lastIndexOf(numTxt);
        if (edits.some(e => e.at === at)) continue;
        // Satzteil um die Zahl: Ziel/Bereich/Durchschnitt → keine Behauptung
        const from = Math.max(masked.lastIndexOf(',', at), masked.lastIndexOf(';', at)) + 1;
        const toC = [masked.indexOf(',', at), masked.indexOf(';', at)].filter(x => x >= 0);
        const clause = masked.slice(from, toC.length ? Math.min(...toC) : masked.length);
        if (NOT_CLAIM.test(clause)) continue;
        const stated = M.sec ? secOf(numTxt) : +numTxt.replace(',', '.');
        if (!Number.isFinite(stated)) continue;
        const dates = refDates(masked, refDate); const sport = M.sport || sportOfSentence(masked);
        let vals: number[] = [];
        if (M.scope === 'trend') {
          const ds = dates.length ? dates : [refDate, C.addDays(refDate, -1)];
          for (const d of ds) { const v = f.trend[d] && f.trend[d][M.key]; if (v != null) { vals.push(v); break; } }
        } else {
          const pick = (ds: string[]) => f.items.filter(x => ds.includes(x.date) && (!sport || x.sport === sport) && x.v[M.key] != null).map(x => x.v[M.key] as number);
          vals = pick(dates.length ? dates : [refDate]);
          if (!vals.length && !dates.length) { const recent = f.items.filter(x => x.date <= refDate && x.date >= C.addDays(refDate, -7) && (!sport || x.sport === sport) && x.v[M.key] != null).sort((a, b) => b.date.localeCompare(a.date)); if (recent.length) vals = [recent[0].v[M.key] as number]; }
        }
        const dec = ((/[.,](\d+)$/.exec(numTxt) || [])[1] || '').length;
        const tol = M.sec ? 2 : M.key === 'hr' || M.key === 'maxHr' || M.key === 'restingHR' ? 1 : dec ? 0.5 * Math.pow(10, -dec) + 1e-9 : 0.5;
        if (vals.some(v => Math.abs(v - stated) <= tol)) continue;
        const uniq = [...new Set(vals.map(v => M.sec ? fmtSec(v) : fmtLike(v, numTxt)))];
        // eine Wertung („nur 6 h“, „zu wenig“) passt nicht mehr zur berichtigten Zahl → Satz weglassen statt schief berichtigen
        if (uniq.length === 1 && /\b(nur|lediglich|zu wenig|zu kurz|zu hoch|zu niedrig|wenig|kaum|deutlich|sehr|stark)\b/i.test(clause)) drop = true;
        else if (uniq.length === 1) { edits.push({ at, len: numTxt.length, to: uniq[0] }); corrected.push(`${numTxt} → ${uniq[0]}`); }
        else drop = true;
      }
    }
    if (drop) { dropped.push(part.trim()); continue; }
    for (const e of edits.sort((a, b) => b.at - a.at)) s = s.slice(0, e.at) + e.to + s.slice(e.at + e.len);
    out.push(s);
  }
  const res = out.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: res, corrected, dropped };
}
/* ---------- Auftrag 30: Verlaufs-Aussagen gegen Bestwert / Tageswert / Trend ----------
   „Kraul am Stück: von 50 m (Di 13.10.) auf 75 m (Fr 6.11.)“, obwohl der Bestwert 100 m (27.10.) war: ein Fortschritt auf einen Wert unter dem
   Bestwert ist ein Tageswert, kein neues Niveau. „Rückschritt“ ohne schwächeren Trend über mehrere Einheiten ist ein normaler schwächerer Tag.
   Solche Sätze werden durch die richtige Einordnung ersetzt („Heute 75 m am Stück, dein Bestwert sind 100 m (27.10.).“). */
const PROG_METRIC: [string, RegExp][] = [['pull', /pull|buoy/i], ['crawl', /kraul|am stück/i], ['bike20', /\bwatt\b|\d\s*w\b|leistung/i], ['run5k', /\bpace\b|\/\s*km|pro km/i]];
const PROGRESS = /\bvon\s+\d[\d.,:]*\s*(?:m|w|watt|min)?\b[^.!?]*?\bauf\s+\d|\b(gesteigert|verbessert|wird länger|werden länger|steigt|gestiegen|neues niveau|fortschritt)\b/i;
const REGRESS = /\b(rückschritt|verschlechtert|schlechter geworden|nachgelassen|abgebaut|eingebrochen)\b/i;
function numsFor(k: string, s: string): number[] {
  if (k === 'run5k') return [...s.matchAll(/(\d{1,2}):(\d{2})/g)].map(m => +m[1] * 60 + +m[2]);
  if (k === 'bike20') return [...s.matchAll(/(\d{2,4})\s*(?:w|watt)\b/gi)].map(m => +m[1]);
  return [...s.matchAll(/(\d{1,2}(?:\.\d{3})+|\d{2,5})\s*m\b/gi)].map(m => +m[1].replace(/\./g, ''));
}
export function checkProgressClaims(text: string, stories: Record<string, Story>, today: string): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  const parts = String(text || '').split(/((?<=[.!?])(?<!\b\d{1,2}\.\d{1,2}\.)(?<!\b\d{1,2}\.)\s+|\n)/);
  const out = parts.map(part => {
    if (!part || !part.trim() || CONDITIONAL.test(part)) return part;
    const hit = PROG_METRIC.find(([, re]) => re.test(part)); if (!hit) return part;
    const k = hit[0]; const sv = stories[k]; if (!sv || !sv.day || !sv.best) return part;
    const m = STORY_METRICS[k]; const better = (a: number, b: number) => m.higher ? a > b : a < b;
    let wrong = false;
    if (PROGRESS.test(part)) { const ns = numsFor(k, part); const to = ns[ns.length - 1]; if (to != null && better(sv.best.v, to)) wrong = true; }
    if (REGRESS.test(part) && sv.trend !== 'down') wrong = true;
    if (!wrong) return part;
    const repl = storyText(sv, { ...m, today }); fixed.push(part.trim());
    return repl || '';
  });
  const res = out.join('').replace(/[ \t]{2,}/g, ' ').trim();
  return { text: res, fixed };
}
/* Ein Prüfer für jede Coach-Nachricht (Regel-Coach, Server, KI, Etappenziele) vor dem Anzeigen */
export function verifyCoachText(text: string, ctx: EngineCtx, refDate?: string, facts?: { claims?: ClaimFacts; values?: ValueFacts; stories?: Record<string, Story> }): string {
  if (!text) return text;
  let t = fixCoachText(text, ctx);
  try { t = stripUnsupported(t, (facts && facts.claims) || claimFacts(ctx, refDate)); } catch (e) { /* Prüfung darf die Anzeige nie verhindern */ }
  try { t = checkValueClaims(t, (facts && facts.values) || valueFacts(ctx), refDate || ctx.today).text; } catch (e) { /* dito */ }
  try { t = checkProgressClaims(t, (facts && facts.stories) || valueStories(ctx, ctx.today), ctx.today).text; } catch (e) { /* dito */ }
  return t || String(text).split(/(?<=[.!?])\s/)[0];
}
