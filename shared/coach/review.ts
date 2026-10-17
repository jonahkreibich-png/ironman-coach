/* Trainings-Bewertung des kostenlosen Coachs (Auftrag 12): „Wie war mein Training heute?“, „Wie war mein Lauf?“, „Wie war meine Woche?“,
   „Wie war das Schwimmen gestern?“, „Vergleich mit letzter Woche“ – auch umgangssprachlich und mit Tippfehlern.
   Wertet erledigte Einheiten mit allen Feldern und Uhrdaten aus: Vorgabe (Dauer, Zone, Pace/Watt/km/h, Wiederholungen), ähnliche frühere
   Einheiten (gleiche Pace bei weniger Puls …), Zeit in Zonen, Entkopplung, Splits, Kadenz, Schwimm-Züge und Kraul am Stück, RPE und Gefühl,
   Morgenwerte und Schlaf. Antwort in 3 Teilen wie ein Trainer: Was gut war (mit Zahlen), Was besser geht (mit Grund), Was das für die
   nächsten Tage heißt. Kurz, ehrlich, nie nur Lob. Fehlen Daten, sagt der Coach, was fehlt, und bietet das Eintragen an. */
import * as C from '../core';
import * as W from '../workouts';
import type { EngineCtx } from './engine';
import { readinessFacts } from './engine';
import { fieldsOf } from '../fields';
import { HR_ZONES } from '../sports';
import { paceCtx } from '../plangen';
import { speedRange, kindOf, bikeSpeedsOf } from '../bikespeed';
import { de, mmss, dowName, joinDe } from './texts';

export interface ReviewOpt { label: string; say: string; go?: string }
export interface Review { intent: 'review'; text: string; options: ReviewOpt[]; good: string[]; better: string[]; next: string[]; missing: string[]; items: number }

const SPORT: Record<string, string> = { run: 'Lauf', bike: 'Radfahrt', swim: 'Schwimmen', strength: 'Kraft', football: 'Teamsport' };
const fmtD = (d: string) => `${dowName(d).slice(0, 2)} ${d.slice(8)}.${d.slice(5, 7)}.`;
const weeksOf = (ctx: EngineCtx) => C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {});
const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

/* ---------- Erledigte Einheiten finden ---------- */
export interface Done { key: string; date: string; sport: string; title: string; planned: any | null; st: any; act: any | null; custom: boolean }
export function doneItems(ctx: EngineCtx, from: string, to: string): Done[] {
  const out: Done[] = []; const usedActs = new Set<string>();
  const acts: Record<string, any> = ctx.state.activities || {};
  C.planDays(weeksOf(ctx)).filter((d: any) => d.date >= from && d.date <= to).forEach((d: any) => d.sessions.forEach((s: any) => {
    if (s.sport === 'rest' || s.cancelled) return;
    const st = (ctx.state.sessions || {})[s.id];
    if (!st || !st.completed) return;
    const act = st.activityId ? acts[st.activityId] || null : Object.values(acts).find((a: any) => a && !a.mergedInto && a.sessionId === s.id) || null;
    if (act) usedActs.add(act.id);
    out.push({ key: s.id, date: d.date, sport: s.sport, title: s.title, planned: s, st, act, custom: false });
  }));
  Object.entries(ctx.state.customWorkouts || {}).forEach(([d, l]: any) => (l || []).forEach((w: any) => {
    if (d < from || d > to) return;
    const act = w.activityId ? acts[w.activityId] || null : null; if (act) usedActs.add(act.id);
    out.push({ key: w.id, date: d, sport: w.sport, title: w.title || SPORT[w.sport] || 'Einheit', planned: null, st: w, act, custom: true });
  }));
  Object.values(acts).forEach((a: any) => {
    if (!a || a.mergedInto || usedActs.has(a.id) || a.date < from || a.date > to || a.sessionId) return;
    out.push({ key: a.id, date: a.date, sport: a.sport, title: a.name || SPORT[a.sport] || 'Einheit', planned: null, st: {}, act: a, custom: true });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.act && b.act ? a.act.startMs - b.act.startMs : 0));
}

/* Werte einer Einheit: Uhr/Datei zuerst, sonst die Felder */
export interface Vals { min: number | null; km: number | null; meters: number | null; hr: number | null; pace: number | null; speed: number | null; power: number | null; cadence: number | null; dec: number | null;
  splits: { km: number; pace: string; hr: number | null }[]; hrZones: number[] | null; intervals: any; spl: number | null; dps: number | null; longest: number | null; pace100: number | null; crawlShare: number | null;
  rpe: number | null; feel: number | null; deviation: string; notes: string; technique: string; tempC: number | null; ascent: number | null; indoor: boolean; bikeType: string | null; fromWatch: boolean }
export function valsOf(d: Done): Vals {
  const f = fieldsOf(d.st || {}, d.sport); const a = d.act || {};
  const sw = a.swim || {};
  const sp = d.sport === 'bike' ? (a.speedKmh ?? f.speed ?? (f.km && f.min ? f.km / (f.min / 60) : null)) : null;
  return {
    min: a.min ?? f.min ?? (d.custom && !d.act ? num(d.st.plannedMinutes) : null), km: d.sport === 'swim' ? null : (a.km ?? f.km), meters: d.sport === 'swim' ? (a.km ? Math.round(a.km * 1000) : f.meters) : null,
    hr: a.avgHr ?? f.hr, pace: d.sport === 'run' ? (a.paceSecKm ?? f.paceSec) : null, speed: sp ? Math.round(sp * 10) / 10 : null, power: a.avgPower ?? f.power, cadence: a.avgCadence ?? f.cadence, dec: a.decouplingPct ?? f.decoupling,
    splits: (a.splits && a.splits.length ? a.splits : f.splits) || [], hrZones: a.hrZones || null, intervals: a.intervals || null,
    spl: sw.strokesPerLength ?? f.spl, dps: sw.metersPerStroke ?? f.dps, longest: sw.longestContinuousM ?? f.longestCrawl, pace100: sw.pace100 ?? f.pace100, crawlShare: f.crawlShare,
    rpe: f.rpe ?? num(a.rpe), feel: f.feel, deviation: f.deviation, notes: f.notes, technique: f.technique, tempC: a.tempC ?? null, ascent: a.ascentM ?? null,
    indoor: !!(a.indoor || f.indoor || /rolle|trainer|indoor|zwift/i.test(d.title)), bikeType: f.bikeType || a.bikeType || null, fromWatch: !!d.act && d.act.source !== 'manual'
  };
}
const hrZoneOf = (hr: number, lthr: number): number => { const p = hr / lthr * 100; return p < 81 ? 1 : p <= 89.5 ? 2 : p <= 93.5 ? 3 : p <= 102 ? 4 : 5; };
const zoneRange = (lthr: number, z: number) => { const zz = HR_ZONES[z - 1]; return { lo: Math.round(lthr * zz.low / 100), hi: zz.high >= 999 ? null : Math.round(lthr * zz.high / 100) }; };
function plannedZone(s: any): number | null {
  if (!s) return null;
  const m = /zone\s*(\d)/i.exec(s.zone || ''); if (m) return +m[1];
  const main = s.spec && (s.spec.steps || []).filter((x: any) => x.part === 'main');
  if (main && main.length) return Math.max(...main.map((x: any) => x.zone || 2));
  return C.isHard(s) ? 4 : 2;
}
const EASY_T = /(keine|ohne) (intervall|harte)|ganz locker|\blocker(e|er|es)?\b|grundlage|regeneration/i;
const isHardDone = (d: Done, v: Vals) => d.sport === 'football' && /spiel|match/i.test(d.title || '') ? true : d.planned ? C.isHard(d.planned) && !EASY_T.test(d.title || '') : !!(v.intervals && v.intervals.count >= 2) || /intervall|schwelle|tempo|sweet|hart|vo2|test|spiel/i.test(d.title);

/* Ähnliche frühere Einheit: gleiche Sportart, ähnlich lang (±30 %), gleich hart, mit Puls, in den 8 Wochen davor */
function similarBefore(ctx: EngineCtx, d: Done, v: Vals): { d: Done; v: Vals } | null {
  if (!v.hr || !v.min) return null;
  const hard = isHardDone(d, v);
  const list = doneItems(ctx, C.addDays(d.date, -56), C.addDays(d.date, -1)).filter(x => x.sport === d.sport && x.key !== d.key)
    .map(x => ({ d: x, v: valsOf(x) })).filter(x => x.v.hr && x.v.min && Math.abs(x.v.min / v.min! - 1) <= 0.3 && isHardDone(x.d, x.v) === hard && (d.sport !== 'bike' || x.v.indoor === v.indoor));
  return list.length ? list[list.length - 1] : null;
}

/* ---------- Eine Einheit bewerten ---------- */
export function reviewOne(ctx: EngineCtx, d: Done): { good: string[]; better: string[]; next: string[]; missing: string[]; head: string; fatigue: number } {
  const v = valsOf(d); const p = ctx.profile; const th = p.thresholds;
  const good: string[] = [], better: string[] = [], missing: string[] = [];
  let fatigue = 0;
  const s = d.planned;
  const hard = isHardDone(d, v);
  const lthr = d.sport === 'bike' ? th.lthrBike : th.lthrRun;
  const pc = paceCtx(p, v.indoor, null, d.date);
  const z = plannedZone(s) ?? (hard ? 4 : 2);
  const facts: string[] = [];
  if (v.min) facts.push(`${Math.round(v.min)} min`);
  if (v.km) facts.push(`${de(v.km)} km`); if (v.meters) facts.push(`${v.meters} m`);
  if (v.pace) facts.push(`${mmss(v.pace)}/km`); if (v.speed && d.sport === 'bike') facts.push(`${de(v.speed)} km/h`); if (v.power) facts.push(`${Math.round(v.power)} W`);
  if (v.hr && d.sport !== 'strength') facts.push(`Puls ${Math.round(v.hr)}`);
  const head = `${d.title} (${fmtD(d.date)})${facts.length ? ': ' + facts.join(', ') : ''}.`;

  // Dauer gegen Vorgabe
  if (s && s.plannedMinutes && v.min) {
    const r = v.min / s.plannedMinutes;
    if (r >= 0.9 && r <= 1.15) good.push(`Dauer passt: ${Math.round(v.min)} von ${s.plannedMinutes} min.`);
    else if (r < 0.8) better.push(`Nur ${Math.round(v.min)} von ${s.plannedMinutes} min${v.deviation ? ` (${v.deviation})` : ''}. Wenn die Zeit fehlte, ist das okay; fehlt sie öfter, plane ich kürzer.`);
    else if (r > 1.25 && !hard) better.push(`${Math.round(v.min - s.plannedMinutes)} min länger als geplant. Locker ist das in Ordnung, aber steiger den Umfang nicht schneller als etwa 10 % pro Woche.`);
  }
  // Puls und Zone
  if (v.hr && lthr && (d.sport === 'run' || d.sport === 'bike')) {
    const hz = hrZoneOf(v.hr, lthr); const zr = zoneRange(lthr, z);
    if (!hard) {
      if (hz <= z) good.push(`Puls Ø ${Math.round(v.hr)} in Zone ${hz}${hz === z ? ` (geplant Zone ${z}, ${zr.lo ? `${zr.lo}-${zr.hi}` : `unter ${zr.hi}`})` : ''}: schön locker.`);
      else {
        let fix = '';
        if (d.sport === 'run' && v.pace) { const rg = W.runPaceRange(pc, z); fix = ` Nächstes Mal langsamer, etwa ${mmss(rg[0])}-${mmss(rg[1])}/km, auch wenn es sich zu ruhig anfühlt.`; }
        if (d.sport === 'bike') fix = ` Nächstes Mal ruhiger treten${pc.bikeKmh && !v.indoor ? `, auf flacher Strecke etwa ${speedRange(pc.bikeKmh, z)}` : ''}, bergauf kleinerer Gang.`;
        // Auftrag 14: selbst hinzugefügte Einheit: nichts war geplant – eine harte Einheit ist dann einfach hart
        if (!s && hz >= 4) better.push(`Puls Ø ${Math.round(v.hr)} in Zone ${hz}: das war eine harte Einheit, keine lockere. Sie zählt als harter Tag, der Tag danach sollte locker sein.`);
        else better.push(`Puls Ø ${Math.round(v.hr)} lag in Zone ${hz}, ${s ? 'geplant war' : 'für eine lockere Einheit passt'} Zone ${z} (bis ${zr.hi}). Locker trainiert die Grundlage, zu schnell macht nur müde.${fix}`);
        if (hz >= z + 1) fatigue += 0.5;
      }
    } else {
      if (hz >= 3) good.push(`Harte Einheit wirklich hart: Puls Ø ${Math.round(v.hr)} (Zone ${hz}).`);
      else better.push(`Puls Ø ${Math.round(v.hr)} nur Zone ${hz}. Bei Intervallen zählt der Puls in den Belastungen, der Schnitt mit Pausen ist niedriger; prüf die Runden.`);
    }
    if (v.hrZones && !hard) {
      const tot = v.hrZones.reduce((a, x) => a + x, 0) || 1; const hi = (v.hrZones[2] + v.hrZones[3] + v.hrZones[4]) / tot;
      if (hi > 0.25) better.push(`${Math.round(hi * 100)} % der Zeit in Zone 3 oder höher. Bei lockeren Einheiten sollten es unter 10 % sein.`);
      else if (tot > 600) good.push(`${Math.round((v.hrZones[0] + v.hrZones[1]) / tot * 100)} % der Zeit in Zone 1-2.`);
    }
  } else if ((d.sport === 'run' || d.sport === 'bike') && !v.hr) missing.push('Puls');
  // Tempo, Leistung, km/h gegen die Vorgabe
  if (d.sport === 'run' && v.pace && !hard) {
    const rg = W.runPaceRange(pc, z);
    if (v.pace < rg[0] - 10 && !(v.hr && lthr && hrZoneOf(v.hr, lthr) <= z)) better.push(`Mit ${mmss(v.pace)}/km schneller als die Vorgabe (${mmss(rg[0])}-${mmss(rg[1])}/km).`);
  }
  if (d.sport === 'bike' && v.power && th.ftp && p.powerMeter) {
    const pz = [0, 0.55, 0.75, 0.9, 1.05, 1.2][z]; const lo = [0, 0, 0.56, 0.76, 0.91, 1.06][z];
    if (v.power >= th.ftp * lo && v.power <= th.ftp * pz) good.push(`${Math.round(v.power)} W, genau im Zielbereich (${Math.round(th.ftp * lo)}-${Math.round(th.ftp * pz)} W).`);
    else if (v.power > th.ftp * pz && !hard) better.push(`${Math.round(v.power)} W lagen über Zone ${z} (bis ${Math.round(th.ftp * pz)} W).`);
  }
  if (d.sport === 'bike' && v.speed && !v.indoor && !v.power && !hard) {
    const k = kindOf({ indoor: v.indoor, bikeType: v.bikeType, title: d.title }, p); const thr = bikeSpeedsOf(p)[k];
    good.push(`${de(v.speed)} km/h im Schnitt (Zone ${z} flach etwa ${speedRange(thr, z)}; Wind und Hügel zählen mit).`);
  }
  // Wiederholungen und Intervall-Qualität
  const main = s && s.spec ? (s.spec.steps || []).find((x: any) => x.part === 'main' && (x.reps || 1) > 1) : null;
  if (main && v.intervals) {
    if (v.intervals.count >= main.reps) good.push(`${v.intervals.count} von ${main.reps} Intervallen geschafft.`);
    else better.push(`${v.intervals.count} von ${main.reps} Intervallen. Lieber alle etwas ruhiger als die letzten auslassen.`);
  }
  if (v.intervals && v.intervals.count >= 2) {
    const drift = Math.max(v.intervals.hrDriftPct || 0, v.intervals.dropPct || 0);
    if (drift < 5) good.push(`Intervalle sehr gleichmäßig (Abfall nur ${de(drift)} %).`);
    else if (drift > 8) better.push(`Das letzte Intervall war ${de(drift)} % schwächer als das erste: zu schnell angefangen. Die ersten zwei bewusst etwas ruhiger.`);
  }
  if (main && !v.intervals && hard && !v.fromWatch) missing.push('Runden/Intervalle (kommen automatisch mit der Uhr)');
  // Entkopplung und Splits
  if (v.dec != null && (v.min || 0) >= 30) {
    if (v.dec <= 5) good.push(`Entkopplung ${de(v.dec)} %: der Puls blieb stabil, deine Grundlage trägt.`);
    else { better.push(`Entkopplung ${de(v.dec)} %: in der zweiten Hälfte stieg der Puls. Ruhiger anfangen, unterwegs trinken; mehr lange lockere Einheiten helfen.`); fatigue += 0.3; }
  }
  if (v.splits.length >= 4) {
    const sec = (x: string) => { const m = /^(\d+):(\d{2})$/.exec(x || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const ps = v.splits.map(x => sec(x.pace)).filter((x): x is number => x != null);
    if (ps.length >= 4) {
      const h = Math.floor(ps.length / 2); const a = ps.slice(0, h).reduce((x, y) => x + y, 0) / h, b = ps.slice(-h).reduce((x, y) => x + y, 0) / h;
      if (b <= a - 3) good.push(`Zweite Hälfte schneller (${mmss(b)} statt ${mmss(a)}/km): gut eingeteilt.`);
      else if (b >= a * 1.04) better.push(`Zweite Hälfte ${Math.round(b - a)} s/km langsamer: zu schnell losgelaufen.`);
    }
  }
  // Kadenz
  if (d.sport === 'run' && v.cadence) { if (v.cadence < 160) better.push(`Schrittfrequenz ${Math.round(v.cadence)}: etwas kürzere, schnellere Schritte (Richtung 165-170) schonen Knie und Schienbein.`); else good.push(`Schrittfrequenz ${Math.round(v.cadence)}: gut.`); }
  if (d.sport === 'bike' && v.cadence) { if (v.cadence < 75) better.push(`Trittfrequenz ${Math.round(v.cadence)}: eher zu niedrig, ein leichterer Gang (85-95) schont die Beine.`); else if (v.cadence <= 100) good.push(`Trittfrequenz ${Math.round(v.cadence)}: rund.`); }
  // Schwimmen
  if (d.sport === 'swim') {
    if (v.spl) good.push(`${de(v.spl)} Züge pro Bahn${v.dps ? ` (${de(v.dps, 2)} m pro Zug)` : ''}.`);
    if (v.longest) { const best = (p.skills || {}).swimCrawlM || 0; if (v.longest >= best && v.longest >= 25) good.push(`${v.longest} m Kraul am Stück${v.longest > best ? ', neue Bestmarke' : ''}.`); }
    if (v.crawlShare != null && v.crawlShare < 70) better.push(`Kraul-Anteil ${Math.round(v.crawlShare)} %: Stück für Stück mehr Kraul, Brust nur zum Erholen.`);
    if (v.technique) better.push(`Technik-Thema „${v.technique}“: ${/bein|sinken|wasserlage|kopf/i.test(v.technique) ? 'Kopf ruhig und Blick nach unten, dann kommen die Beine hoch' : /atm/i.test(v.technique) ? 'unter Wasser lang ausatmen, beim Drehen nur einatmen' : 'eine Sache pro Bahn üben'}.`);
    if (!v.spl && !v.longest) missing.push('Züge pro Bahn oder Kraul am Stück');
    if (!v.min && !v.meters) missing.push('Dauer oder Meter');
  }
  if (d.sport === 'strength' && !v.min) missing.push('Dauer');
  if ((d.sport === 'run' || d.sport === 'bike') && !v.min && !v.km) missing.push('Dauer oder Strecke');
  if (d.sport === 'run' && !v.pace && v.hr) missing.push('Pace oder Strecke');
  // Gefühl
  if (v.rpe != null) {
    if (!hard && v.rpe >= 6 && d.sport !== 'football') { better.push(`Gefühl ${v.rpe}/10 für eine lockere Einheit ist hoch. Das spricht für Müdigkeit, Hitze oder zu schnelles Tempo.`); fatigue += 1; }
    else if (hard && v.rpe <= 4) better.push(`Nur ${v.rpe}/10 für eine harte Einheit: da wäre mehr gegangen.`);
    else good.push(`Anstrengung ${v.rpe}/10 passt zur Vorgabe.`);
  } else missing.push('Anstrengung (RPE 1-10)');
  if (v.feel != null && v.feel >= 4) { fatigue += v.feel === 5 ? 1.2 : 0.6; better.push(`Du hast dich ${v.feel === 5 ? 'sehr müde' : 'müde'} gefühlt. Das nehme ich ernst.`); }
  // Vergleich mit einer ähnlichen früheren Einheit
  const sim = similarBefore(ctx, d, v);
  if (sim && v.hr && sim.v.hr) {
    const dh = Math.round(v.hr - sim.v.hr);
    if (d.sport === 'run' && v.pace && sim.v.pace) {
      const dp = Math.round(v.pace - sim.v.pace);
      if (Math.abs(dp) <= 5 && dh <= -2) good.unshift(`Gleiche Pace wie am ${fmtD(sim.d.date)} (${mmss(v.pace)}/km), aber ${-dh} Schläge weniger Puls: du wirst fitter.`);
      else if (dp <= -5 && dh <= 2) good.unshift(`${-dp} s/km schneller als am ${fmtD(sim.d.date)} bei ${dh <= 0 ? 'weniger' : 'fast gleichem'} Puls.`);
      else if (dh >= 5 && dp >= -3) { better.push(`Puls ${dh} Schläge höher als am ${fmtD(sim.d.date)} bei ${dp > 3 ? 'langsamerer' : 'gleicher'} Pace${v.tempC && v.tempC > 22 ? ` (bei ${de(v.tempC, 0)} °C normal)` : ''}.`); fatigue += v.tempC && v.tempC > 22 ? 0 : 0.7; }
    } else if (d.sport === 'bike' && (v.power || v.speed) && (sim.v.power || sim.v.speed)) {
      const a = v.power && sim.v.power ? v.power / v.hr : v.speed && sim.v.speed ? v.speed / v.hr : null;
      const b = v.power && sim.v.power ? sim.v.power / sim.v.hr! : v.speed && sim.v.speed ? sim.v.speed / sim.v.hr! : null;
      if (a && b) { const pct = Math.round((a / b - 1) * 100); if (pct >= 3) good.unshift(`${pct} % mehr ${v.power ? 'Leistung' : 'Tempo'} pro Herzschlag als am ${fmtD(sim.d.date)}.`); else if (pct <= -5) { better.push(`${-pct} % weniger ${v.power ? 'Leistung' : 'Tempo'} pro Herzschlag als am ${fmtD(sim.d.date)}${v.power ? '' : ' (Wind und Strecke spielen mit)'}.`); fatigue += v.power ? 0.5 : 0.2; } }
    }
  } else if (sim === null && (d.sport === 'run' || d.sport === 'bike') && v.hr && v.min) { /* keine Vergleichseinheit */ }
  // Morgenwerte und Schlaf
  const mf = readinessFacts(ctx, d.date);
  if (mf.length) { better.push(`Morgenwerte: ${joinDe(mf)}. Das erklärt ${hard ? 'eine schwere Einheit' : 'einen höheren Puls'} oft schon.`); fatigue += 0.5 * mf.length; }
  else { const tr = (ctx.state.trend || []).find((x: any) => x && x.date === d.date); if (tr && tr.sleepHours != null && tr.sleepHours >= 7.5) good.push(`Gut geschlafen (${de(tr.sleepHours)} h).`); }
  return { good, better, next: [], missing, head, fatigue };
}

/* ---------- Nächste Tage ---------- */
function nextDays(ctx: EngineCtx, _after: string, fatigue: number, sport?: string): { text: string; opts: ReviewOpt[] } {
  const after = C.addDays(ctx.today, -1);
  const days = C.planDays(weeksOf(ctx)).filter((d: any) => d.date > after && d.date <= C.addDays(after, 4));
  const list = days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !((ctx.state.sessions || {})[s.id] || {}).completed).map((s: any) => ({ s, date: d.date })));
  const hardNext = list.find((x: any) => C.isHard(x.s));
  const first = list[0];
  if (fatigue >= 1.5) {
    return { text: `Dein Körper zeigt Müdigkeit. ${hardNext ? `${hardNext.s.title} am ${fmtD(hardNext.date)} nur, wenn die Ampel morgens grün ist, sonst locker.` : 'Die nächsten Tage locker bleiben.'} Schlaf und Essen gehen jetzt vor.`,
      opts: hardNext ? [{ label: 'Nächste harte Einheit lockerer', say: `Mach ${hardNext.date === ctx.today ? 'heute' : hardNext.date === C.addDays(ctx.today, 1) ? 'morgen' : dowName(hardNext.date)} lieber locker` }] : [] };
  }
  if (!first) return { text: 'Die nächsten Tage ist nichts mehr geplant: Erholung nutzen.', opts: [] };
  const same = sport ? list.find((x: any) => x.s.sport === sport) : null;
  const when = (d: string) => d === ctx.today ? 'Heute noch' : d === C.addDays(ctx.today, 1) ? 'Morgen' : `Am ${fmtD(d)}`;
  return { text: `${when(first.date)}: ${first.s.title}.${hardNext && hardNext !== first ? ` Wichtig ist ${hardNext.s.title} am ${fmtD(hardNext.date)}.` : ''}${same && same !== first ? ` Nächste${sport === 'swim' ? 's Schwimmen' : sport === 'run' ? 'r Lauf' : sport === 'bike' ? ' Radeinheit' : ' Einheit'}: ${fmtD(same.date)}.` : ''}`, opts: [] };
}

/* ---------- Antwort bauen: 3 Teile, nie nur Lob ---------- */
function compose(head: string, good: string[], better: string[], next: string, missing: string[], fallbackBetter: string): string {
  const b = better.length ? better.slice(0, 2) : [fallbackBetter];
  const g = good.length ? good.slice(0, 3) : ['Du hast die Einheit gemacht, das zählt am meisten.'];
  return [head, `👍 Gut: ${g.join(' ')}`, `🔧 Besser: ${b.join(' ')}`, `➡️ Nächste Tage: ${next}`, missing.length ? `Es fehlen: ${joinDe([...new Set(missing)].slice(0, 4))}. Trag es nach, dann wird die Bewertung genauer.` : ''].filter(Boolean).join('\n').replace(/\.\.(?=\s|$)/g, '.').replace(/ %/g, '\u00a0%').replace(/\(-(\d)/g, '(−$1');
}
function fallback(sport: string, hard: boolean, indoor = false): string {
  if (sport === 'bike' && indoor) return 'Kleiner Punkt: auf der Rolle schwitzt man viel, Ventilator an und genug trinken; trag die Anstrengung (RPE) ein, dann vergleiche ich besser.';
  if (sport === 'run') return hard ? 'Kleiner Punkt: locker auslaufen und danach gleich etwas essen, dann bist du morgen frischer.' : 'Kleiner Punkt: Schultern locker, Blick nach vorne, kurze Schritte. Locker bleibt locker, auch wenn es sich zu leicht anfühlt.';
  if (sport === 'bike') return 'Kleiner Punkt: gleichmäßig treten statt Spitzen bergauf, und alle 20-30 min trinken.';
  if (sport === 'swim') return 'Kleiner Punkt: pro Bahn eine Technik-Sache bewusst machen (lang ausatmen, Kopf ruhig).';
  if (sport === 'strength') return 'Kleiner Punkt: trag Sätze, Wiederholungen und Gewicht ein, dann sehe ich die Steigerung.';
  return 'Kleiner Punkt: Werte eintragen, dann kann ich genauer bewerten.';
}

export function reviewItem(ctx: EngineCtx, d: Done): Review {
  const r = reviewOne(ctx, d);
  const n = nextDays(ctx, d.date >= ctx.today ? ctx.today : d.date, r.fatigue, d.sport);
  const text = compose(r.head, r.good, r.better, n.text, r.missing, fallback(d.sport, isHardDone(d, valsOf(d)), valsOf(d).indoor));
  const opts: ReviewOpt[] = [...n.opts];
  if (r.missing.length) opts.unshift({ label: 'Werte eintragen', say: '', go: (d.custom ? 'plan' : 'session:' + d.key) });
  return { intent: 'review', text, options: opts, good: r.good, better: r.better, next: [n.text], missing: r.missing, items: 1 };
}

/* ---------- Woche ---------- */
function weekStats(ctx: EngineCtx, from: string, to: string) {
  const items = doneItems(ctx, from, to);
  const planned = C.planDays(weeksOf(ctx)).filter((d: any) => d.date >= from && d.date <= to && !C.illnessAt(ctx.state.illnessPeriods, d.date)).flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.fixed).map((s: any) => ({ s, date: d.date })));
  const vals = items.map(d => ({ d, v: valsOf(d) }));
  const min = vals.reduce((a, x) => a + (x.v.min || (x.d.planned ? x.d.planned.plannedMinutes || 0 : 0)), 0);
  const plannedMin = planned.reduce((a: number, x: any) => a + (x.s.plannedMinutes || 0), 0);
  const missedKey = planned.filter((x: any) => C.isKey(x.s) && x.date < ctx.today && !((ctx.state.sessions || {})[x.s.id] || {}).completed && !C.illnessAt(ctx.state.illnessPeriods, x.date)).map((x: any) => x.s.title);
  const easyRuns = vals.filter(x => x.d.sport === 'run' && x.v.pace && x.v.hr && !isHardDone(x.d, x.v));
  const eff = easyRuns.length ? { pace: easyRuns.reduce((a, x) => a + x.v.pace!, 0) / easyRuns.length, hr: easyRuns.reduce((a, x) => a + x.v.hr!, 0) / easyRuns.length } : null;
  const rpes = vals.map(x => x.v.rpe).filter((x): x is number => x != null);
  const hardN = vals.filter(x => isHardDone(x.d, x.v)).length;
  const tr = (ctx.state.trend || []).filter((x: any) => x && x.date >= from && x.date <= to);
  const sleep = tr.filter((x: any) => x.sleepHours != null); const sleepAvg = sleep.length ? sleep.reduce((a: number, x: any) => a + x.sleepHours, 0) / sleep.length : null;
  const bySport: Record<string, number> = {}; vals.forEach(x => { bySport[x.d.sport] = (bySport[x.d.sport] || 0) + 1; });
  const fatigue = vals.reduce((a, x) => a + reviewOne(ctx, x.d).fatigue, 0);
  const illDays: string[] = []; for (let d = from; d <= to; d = C.addDays(d, 1)) if (C.illnessAt(ctx.state.illnessPeriods, d)) illDays.push(d);
  const ill = illDays.length ? illDays : null;
  return { items, planned, min, plannedMin, missedKey, eff, rpes, hardN, sleepAvg, bySport, fatigue, ill, vals };
}
const hh = (m: number) => de(m / 60, 1) + ' h';
export function reviewWeek(ctx: EngineCtx, compare: boolean, offset = 0): Review {
  const [mon] = C.weekRange(C.addDays(ctx.today, -7 * offset));
  const sun = C.addDays(mon, 6); const to = sun < ctx.today ? sun : ctx.today;
  const W0 = weekStats(ctx, mon, to);
  const W1 = weekStats(ctx, C.addDays(mon, -7), C.addDays(to, -7));
  const good: string[] = [], better: string[] = [], missing: string[] = [];
  const doneN = W0.items.length, planN = W0.planned.filter((x: any) => x.date <= to).length;
  const label = offset ? 'Letzte Woche' : 'Diese Woche';
  const plannedTo = W0.planned.filter((x: any) => x.date <= to).reduce((a: number, x: any) => a + (x.s.plannedMinutes || 0), 0);
  const head = `${label} (${fmtD(mon)} bis ${fmtD(to)}): ${doneN} Einheit${doneN === 1 ? '' : 'en'}${planN ? ` von ${planN} geplanten` : ''}, ${hh(W0.min)}${plannedTo ? ` (geplant ${offset || to >= sun ? '' : 'bis heute '}${hh(plannedTo)})` : ''}.`;
  if (!doneN) {
    return { intent: 'review', text: [head, `🔧 Besser: ${W0.ill ? 'Du warst krank, da ist Pause richtig.' : 'Noch keine erledigte Einheit eingetragen. Hak erledigte Einheiten im Plan ab oder verbinde deine Uhr, dann kann ich die Woche bewerten.'}`, `➡️ Nächste Tage: ${nextDays(ctx, ctx.today, 0).text}`].join('\n'), options: [{ label: 'Zum Plan', say: '', go: 'plan' }], good, better, next: [], missing: ['erledigte Einheiten'], items: 0 };
  }
  if (W0.ill) good.push(`Krank ${W0.ill.length === 1 ? 'am ' + fmtD(W0.ill[0]) : `von ${fmtD(W0.ill[0])} bis ${fmtD(W0.ill[W0.ill.length - 1])}`}: die Pause war richtig, diese Tage zählen nicht.`);
  if (planN && doneN >= planN * 0.85) good.push(`Fast alles geschafft (${doneN} von ${planN}).`);
  else if (planN && doneN < planN * 0.6) better.push(`Nur ${doneN} von ${planN} Einheiten. Wenn es zeitlich nicht passt, sag mir, welche Tage schwierig sind, dann plane ich anders.`);
  if (W0.missedKey.length) better.push(`Verpasst: ${joinDe(W0.missedKey.slice(0, 2))}. Das sind die wichtigsten Einheiten der Woche.`);
  else if (planN) good.push('Keine wichtige Einheit verpasst.');
  const sports = Object.entries(W0.bySport).map(([k, n]) => `${n}× ${SPORT[k] || k}`); if (sports.length) good.push(`Mischung: ${joinDe(sports)}.`);
  if (doneN >= 3 && W0.hardN / doneN > 0.4) better.push(`${W0.hardN} von ${doneN} Einheiten waren hart. Gut sind etwa 20 %, der Rest locker.`);
  if (W0.rpes.length) { const avg = W0.rpes.reduce((a, x) => a + x, 0) / W0.rpes.length; if (avg >= 6.5) better.push(`Ø Anstrengung ${de(avg)}/10: eher hoch.`); } else missing.push('Anstrengung (RPE) bei den Einheiten');
  if (W0.sleepAvg != null) (W0.sleepAvg < 7 ? better : good).push(`Schlaf im Schnitt ${de(W0.sleepAvg)} h${W0.sleepAvg < 7 ? ', zu wenig für gute Erholung' : ''}.`);
  // Vergleich mit der Vorwoche
  const cmp: string[] = [];
  if (W1.items.length || compare) {
    const dm = W1.min ? Math.round((W0.min / W1.min - 1) * 100) : null;
    cmp.push(`Umfang ${hh(W0.min)} statt ${hh(W1.min)}${dm != null ? ` (${dm >= 0 ? '+' : ''}${dm} %)` : ''}, ${doneN} statt ${W1.items.length} Einheiten.`);
    if (dm != null && dm > 20 && !offset) better.push(`Der Umfang ist um ${dm} % gestiegen. Mehr als 10-15 % pro Woche erhöht das Verletzungsrisiko.`);
    if (W0.eff && W1.eff) {
      const dp = Math.round(W0.eff.pace - W1.eff.pace), dh = Math.round(W0.eff.hr - W1.eff.hr);
      const line = `Lockere Läufe: Ø ${mmss(W0.eff.pace)}/km bei Puls ${Math.round(W0.eff.hr)}, letzte Woche ${mmss(W1.eff.pace)}/km bei ${Math.round(W1.eff.hr)}.`;
      cmp.push(line);
      if (dh <= -2 && dp <= 3) good.push(`Lockere Läufe effizienter: ${-dh} Schläge weniger Puls bei ${dp <= -3 ? 'schnellerer' : 'gleicher'} Pace.`);
      else if (dh >= 4 && dp >= -3) better.push(`Lockere Läufe mit ${dh} Schlägen mehr Puls als letzte Woche: Müdigkeit, Hitze oder Schlaf prüfen.`);
    }
  }
  const n = nextDays(ctx, ctx.today, offset ? 0 : W0.fatigue / Math.max(1, doneN) * 2);
  const nextTxt = offset ? `Diese Woche: ${(() => { const [m] = C.weekRange(ctx.today); const pl = C.planDays(weeksOf(ctx)).filter((d: any) => d.date >= m && d.date <= C.addDays(m, 6)).flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled)); return `${pl.length} Einheiten, ${hh(pl.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0))}`; })()}. ${n.text}` : n.text;
  const text = compose(head + (cmp.length ? '\n📊 Vergleich: ' + cmp.join(' ') : ''), good, better, nextTxt, missing, 'Kleiner Punkt: trag bei jeder Einheit Puls und Anstrengung ein, dann sehe ich Trends früher.');
  return { intent: 'review', text, options: n.opts, good, better, next: [nextTxt], missing, items: doneN };
}

/* ---------- Frage erkennen ---------- */
export function norm2(s: string): string { return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
const ASK = /\b(wie (war|wars|wa|wahr|waren|lief|liefs|ging|gings|fandest|findest|bewertest|siehst)|wi(e)? war|war (das|der|die|es|mein|meine|dein) .*\b(gut|ok|okay|in ordnung|zu (schnell|langsam|hart|viel))|bewert\w*|feedback|analys\w*|einschaetz\w*|auswert\w*|was sagst du (zu|zum|zur)|was haeltst du (von|vom)|wie bin ich (gelaufen|gefahren|geschwommen|geradelt)|zufrieden mit|rueckblick|bilanz|na wie|vergleich\w*|wie schlage ich mich|hab ich (das )?gut)\b/;
const WHAT = /\b(training|trainig|traning|trainings|einheit|lauf|laufen|gelaufen|joggen|run|rad|radfahrt|radtour|ausfahrt|fahrt|gefahren|rolle|bike|radeln|radl|geradelt|radfahren|radfahrt|fahrrad|schwimmen|geschwommen|schwimm|kraul|kraft|krafttraining|gym|workout|woche|wochen|woch\w*|heute|gestern|vorgestern|tag|letzte|letzten|letztes|es|session|intervalle|tempolauf|longrun)\b/;
export function isReviewQuestion(raw: string): boolean {
  const j = norm2(raw);
  if (/\b(was steht|was soll|was mache|was muss|wann|warum|wieso|plan fuer|morgen|naechste|naechsten|kommende)\b/.test(j) && !/\b(wie war|vergleich|gestern|letzte woche)\b/.test(j)) return false;
  if (/\b(krank|schmerz|verschieb|streich|tausch|keine zeit|urlaub)\b/.test(j)) return false;
  if (/\bvergleich\b.*\b(woche|vorwoche|letzte)\b|\b(woche|vorwoche)\b.*\bvergleich/.test(j)) return true;
  return ASK.test(j) && WHAT.test(j);
}
const SPORT_RE: [RegExp, string][] = [[/\b(lauf|laufen|gelaufen|joggen|jogging|run|laeufe|tempolauf|longrun)\b/, 'run'], [/\b(rad|radfahrt|radtour|ausfahrt|fahrt|gefahren|rolle|bike|radeln|radl|geradelt|velo|radfahren|fahrrad)\b/, 'bike'], [/\b(schwimm\w*|geschwommen|kraul|becken)\b/, 'swim'], [/\b(kraft|gym|krafttraining)\b/, 'strength']];
const DOWS: [RegExp, number][] = [[/\bmontag\b/, 1], [/\bdienstag\b/, 2], [/\bmittwoch\b/, 3], [/\bdonnerstag\b/, 4], [/\bfreitag\b/, 5], [/\bsamstag\b/, 6], [/\bsonntag\b/, 0]];
/* Hauptfunktion: Frage → Bewertung (oder null, wenn es keine Bewertungsfrage ist) */
export function reviewAnswer(ctx: EngineCtx, raw: string): Review | null {
  if (!isReviewQuestion(raw)) return null;
  const j = norm2(raw);
  if (/\bwoch\w*|\bvorwoche\b/.test(j)) return reviewWeek(ctx, /vergleich|letzte woche|vorwoche/.test(j), /\b(letzte|vorige|vergangene) woche\b/.test(j) && !/vergleich/.test(j) ? 1 : 0);
  const sport = (SPORT_RE.find(([re]) => re.test(j)) || [null, null])[1];
  let date: string | null = /\bvorgestern\b/.test(j) ? C.addDays(ctx.today, -2) : /\bgestern\b/.test(j) ? C.addDays(ctx.today, -1) : /\bheute\b/.test(j) ? ctx.today : null;
  if (!date) { const dw = DOWS.find(([re]) => re.test(j)); if (dw) for (let i = 0; i < 7; i++) { const d = C.addDays(ctx.today, -i); if (new Date(d + 'T12:00:00Z').getUTCDay() === dw[1]) { date = d; break; } } }
  const from = date || C.addDays(ctx.today, sport ? -13 : -6), to = date || ctx.today;
  let items = doneItems(ctx, from, to).filter(d => !sport || d.sport === sport).filter(d => d.sport !== 'rest');
  if (/\bvergleich\b/.test(j) && !items.length) return reviewWeek(ctx, true);
  if (!items.length) {
    const what = sport ? ({ run: 'Lauf', bike: 'Radfahrt', swim: 'Schwimm-Einheit', strength: 'Krafteinheit' } as any)[sport] : 'erledigte Einheit';
    const when = date === ctx.today ? 'heute' : date === C.addDays(ctx.today, -1) ? 'gestern' : date ? `am ${fmtD(date)}` : 'in den letzten Tagen';
    const open = date ? C.planDays(weeksOf(ctx)).find((d: any) => d.date === date) : null;
    const pl = open ? open.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && (!sport || s.sport === sport)) : [];
    return { intent: 'review', text: `Ich finde ${when} keine${what === 'Lauf' ? 'n' : ''} ${what}${pl.length ? `. Geplant war ${joinDe(pl.map((s: any) => s.title))}` : ''}. Hak die Einheit im Plan ab und trag Dauer, Puls und Gefühl ein (oder lass sie von der Uhr kommen), dann bewerte ich sie.`,
      options: pl.length ? [{ label: 'Werte eintragen', say: '', go: 'session:' + pl[0].id }] : [{ label: 'Zum Plan', say: '', go: 'plan' }], good: [], better: [], next: [], missing: ['erledigte Einheit'], items: 0 };
  }
  // ohne Datum: die letzte passende Einheit; „heute“ mit mehreren Einheiten: alle des Tages kurz
  if (!date) items = [items[items.length - 1]];
  if (items.length === 1) return reviewItem(ctx, items[0]);
  const parts = items.map(d => ({ d, r: reviewOne(ctx, d) }));
  const fat = parts.reduce((a, x) => a + x.r.fatigue, 0);
  const good = parts.flatMap(x => x.r.good.slice(0, 1).map(g => `${x.d.title}: ${g}`));
  const better = parts.flatMap(x => x.r.better.slice(0, 1).map(b => `${x.d.title}: ${b}`));
  const missing = [...new Set(parts.flatMap(x => x.r.missing))];
  const n = nextDays(ctx, to >= ctx.today ? ctx.today : to, fat);
  const text = compose(`${date === ctx.today ? 'Heute' : fmtD(date!)}: ${joinDe(parts.map(x => x.r.head.replace(/\.$/, '')))}.`, good, better, n.text, missing, fallback(parts[0].d.sport, false));
  return { intent: 'review', text, options: [...(missing.length ? [{ label: 'Werte eintragen', say: '', go: parts[0].d.custom ? 'plan' : 'session:' + parts[0].d.key }] : []), ...n.opts], good, better, next: [n.text], missing, items: parts.length };
}

/* Automatisch nach einer erledigten Einheit (Engine und App): kurz oder ausführlich je nach Einstellung */
export function autoReview(ctx: EngineCtx, d: Done, mode: 'full' | 'short'): string {
  const r = reviewItem(ctx, d);
  if (mode === 'full') return r.text;
  const o = reviewOne(ctx, d);
  return [o.head, o.good[0] ? `👍 ${o.good[0]}` : '', o.better[0] ? `🔧 ${o.better[0]}` : ''].filter(Boolean).join(' ');
}
void kindOf;
