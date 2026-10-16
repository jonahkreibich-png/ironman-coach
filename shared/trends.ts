/* Auftrag 13, Punkt 3: Trends im Bereich „Fortschritt“. Jeder Trend: eine große Zahl, eine kurze Veränderung, ein Satz
   (was er bedeutet und ob es gut ist) und der Verlauf. Zeitraum 4 Wochen / 3 Monate / 1 Jahr. Trends ohne genug Daten
   zeigen „ab X … verfügbar“ statt einer wackligen Zahl. Extra-Einheiten zählen überall mit (sie stecken in activities). */
import * as C from './core';
import type { Activity } from './activity/analyze';
import { sleepNeed, type Profile } from './profile';

export type Period = '4w' | '3m' | '1y';
export const PERIOD_DAYS: Record<Period, number> = { '4w': 28, '3m': 91, '1y': 365 };
export type TrendGroup = 'recovery' | 'fitness' | 'efficiency' | 'intensity' | 'swim' | 'bests' | 'long' | 'relations';
export const GROUPS: TrendGroup[] = ['recovery', 'fitness', 'efficiency', 'intensity', 'swim', 'bests', 'long', 'relations'];
export interface Pt { date: string; [k: string]: number | string | null }
export interface TrendSeries { key: string; name: string; color: string; dashed?: boolean }
export interface TrendCard {
  id: string; group: TrendGroup; title: string;
  /** große Zahl (fertig formatiert) und Einheit */
  value: string | null; unit?: string;
  /** Veränderung im Zeitraum, kurz („▲ 4 %“) */
  delta?: string;
  /** ein Satz: was es bedeutet und ob es gut ist */
  text: string;
  tone: 'good' | 'warn' | 'info';
  /** kleine Linie (Sparkline) */
  spark?: number[];
  /** Verlauf für die Detailansicht */
  chart?: { pts: Pt[]; series: TrendSeries[]; lines?: { v: number; label: string; color?: string }[]; invert?: boolean; fmt?: 'pace' | 'pace100' | 'num' | 'pct' | 'h' };
  /** Liste statt Zahl (Bestwerte, Intensität) */
  rows?: { label: string; value: string; date?: string; badge?: 'neu' | 'best' }[];
  /** zu wenig Daten: Hinweis statt Zahl */
  locked?: string;
}
export interface TrendInput {
  today: string; period: Period;
  activities: Activity[];
  trend: any[]; illness: any[];
  profile: Profile;
  /** App-Zustand (sessions, customWorkouts, nutrition …) und Plan-Wochen für die Belastung */
  state: any; weeks: any[];
}

/* ---------- kleine Helfer ---------- */
const de = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const mmss = (s: number) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const pctTxt = (p: number) => `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : '± '}${de(Math.abs(p), Math.abs(p) < 10 ? 1 : 0)} %`;
const monday = (d: string) => C.weekRange(d)[0];
/* Anfang gegen Ende des Zeitraums: Mittel des ersten und letzten Drittels (mindestens 2 Werte je Seite) */
function firstLast(vals: number[]): { first: number; last: number } | null {
  if (vals.length < 4) return null;
  const k = Math.max(2, Math.floor(vals.length / 3));
  return { first: avg(vals.slice(0, k))!, last: avg(vals.slice(-k))! };
}
const isHardAct = (a: Activity) => !!(a.intervals && a.intervals.count >= 2) || /intervall|schwelle|tempo|test|vo2|sweet|rennen|wettkampf/i.test(a.name || '');
const runs = (I: TrendInput, from: string) => I.activities.filter(a => a.sport === 'run' && a.date >= from && a.date <= I.today);
const rides = (I: TrendInput, from: string) => I.activities.filter(a => a.sport === 'bike' && a.date >= from && a.date <= I.today);
const swims = (I: TrendInput, from: string) => I.activities.filter(a => a.sport === 'swim' && a.date >= from && a.date <= I.today);
const sorted = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => x.date.localeCompare(y.date));
const lock = (id: string, group: TrendGroup, title: string, need: number, have: number, what: string): TrendCard =>
  ({ id, group, title, value: null, text: '', tone: 'info', locked: `ab ${need} ${what} verfügbar (bisher ${have})` });

/* ---------- Erholung ---------- */
function rollingVsBase(I: TrendInput, key: string, id: string, title: string, unit: string, betterUp: boolean, dec: number, from: string): TrendCard {
  const pts = sorted((I.trend || []).filter(p => p && num(p[key]) != null && p.date <= I.today && !C.illnessAt(I.illness, p.date)));
  const last7 = pts.filter(p => p.date > C.addDays(I.today, -7)).map(p => num(p[key])!);
  const base = pts.filter(p => p.date <= C.addDays(I.today, -7) && p.date > C.addDays(I.today, -67)).map(p => num(p[key])!);
  if (last7.length < 3 || base.length < 14) return lock(id, 'recovery', title, 14, base.length, 'Tagen mit Messwerten');
  const a7 = avg(last7)!, b60 = avg(base)!;
  const diff = a7 - b60, rel = diff / b60 * 100;
  // Verlauf: 7-Tage-Schnitt im Zeitraum, dazu die Basis als Linie
  const chartPts: Pt[] = pts.filter(p => p.date >= from).map(p => { const w = pts.filter(q => q.date <= p.date && q.date > C.addDays(p.date, -7)).map(q => num(q[key])!); return { date: p.date, v: num(p[key]), avg7: avg(w) }; });
  const good = betterUp ? rel >= -5 : diff <= 2;
  const bad = betterUp ? rel <= -10 : diff >= 5;
  const text = key === 'hrv'
    ? (rel >= 3 ? `HFV liegt über deiner Basis: dein Körper ist gut erholt.` : rel > -5 ? `HFV im normalen Bereich: Erholung passt.` : rel > -10 ? `HFV etwas unter deiner Basis: achte auf Schlaf und lockere Tage.` : `HFV deutlich unter deiner Basis: Zeichen von Müdigkeit oder Stress, lieber locker trainieren.`)
    : (diff <= -1 ? `Ruhepuls unter deiner Basis: gutes Zeichen für Fitness und Erholung.` : diff < 3 ? `Ruhepuls normal: Erholung passt.` : diff < 5 ? `Ruhepuls leicht erhöht: etwas mehr Erholung tut gut.` : `Ruhepuls deutlich erhöht: Müdigkeit oder ein Infekt im Anmarsch? Lieber locker.`);
  return { id, group: 'recovery', title, value: de(a7, dec), unit, delta: key === 'hrv' ? pctTxt(Math.round(rel * 10) / 10) + ' zur Basis' : (Math.round(diff) === 0 ? '± 0' : `${diff > 0 ? '▲ +' : '▼ '}${de(Math.abs(diff), 0)}`) + ' zur Basis', text, tone: good ? 'good' : bad ? 'warn' : 'info',
    spark: chartPts.map(p => p.avg7 as number).filter(v => v != null), chart: { pts: chartPts, series: [{ key: 'v', name: title, color: 'var(--info)' }, { key: 'avg7', name: '7-Tage-Schnitt', color: 'var(--accent)' }], lines: [{ v: Math.round(b60 * 10) / 10, label: '60-Tage-Basis' }] } };
}
function sleepCard(I: TrendInput, from: string): TrendCard {
  const pts = sorted((I.trend || []).filter(p => p && num(p.sleepHours) != null && p.date >= from && p.date <= I.today));
  if (pts.length < 5) return lock('sleep', 'recovery', 'Schlaf', 5, pts.length, 'Nächten mit Schlafwerten');
  const need = sleepNeed(I.profile, I.today);
  const last7 = pts.filter(p => p.date > C.addDays(I.today, -7)).map(p => num(p.sleepHours)!);
  const a7 = avg(last7.length ? last7 : pts.slice(-7).map(p => num(p.sleepHours)!))!;
  const short = pts.filter(p => num(p.sleepHours)! < need[0]).length;
  const fl = firstLast(pts.map(p => num(p.sleepHours)!));
  return { id: 'sleep', group: 'recovery', title: 'Schlaf', value: de(a7, 1), unit: 'h', delta: fl ? `${fl.last - fl.first >= 0 ? '▲ +' : '▼ '}${de(Math.abs(fl.last - fl.first), 1)} h` : undefined,
    text: a7 >= need[0] ? `Im Schnitt ${de(a7, 1)} h, dein Bedarf ist ${de(need[0], 1)}-${de(need[1], 1)} h: genug für gute Erholung.` : `Im Schnitt ${de(a7, 1)} h, dein Bedarf ist ${de(need[0], 1)}-${de(need[1], 1)} h. ${short} von ${pts.length} Nächten waren zu kurz – mehr Schlaf ist die einfachste Leistungsreserve.`,
    tone: a7 >= need[0] ? 'good' : a7 >= need[0] - 0.5 ? 'info' : 'warn', spark: pts.map(p => num(p.sleepHours)!),
    chart: { pts: pts.map(p => ({ date: p.date, v: num(p.sleepHours) })), series: [{ key: 'v', name: 'Schlaf (h)', color: 'var(--info)' }], lines: [{ v: need[0], label: 'Bedarf' }], fmt: 'h' } };
}
function readinessCard(I: TrendInput, from: string, n: number): TrendCard {
  const hist = C.readinessHistory(I.trend, I.illness, I.today, n, (I.state.settings || {}).readiness).filter((h: any) => h.score != null && h.level !== 3 && !h.ill && h.date >= from); // Krankheitstage zählen nicht
  if (hist.length < 7) return lock('readiness', 'recovery', 'Bereitschaft', 7, hist.length, 'Tagen mit Morgenwerten');
  const g = hist.filter((h: any) => h.level === 0).length, y = hist.filter((h: any) => h.level === 1).length, r = hist.filter((h: any) => h.level === 2).length;
  const last7 = avg(hist.slice(-7).map((h: any) => h.score))!;
  const share = g / hist.length;
  return { id: 'readiness', group: 'recovery', title: 'Bereitschaft', value: String(Math.round(last7)), unit: '/100', delta: `🟢 ${g} · 🟡 ${y} · 🔴 ${r}`,
    text: share >= 0.7 ? `Meist grün: Training und Erholung sind im Gleichgewicht.` : share >= 0.5 ? `Viele gelbe Tage: die Erholung kommt gerade knapp.` : `Oft gelb oder rot: dein Körper braucht mehr Erholung, als er bekommt.`,
    tone: share >= 0.7 ? 'good' : share >= 0.5 ? 'info' : 'warn', spark: hist.map((h: any) => h.score),
    chart: { pts: hist.map((h: any) => ({ date: h.date, v: h.score })), series: [{ key: 'v', name: 'Bereitschaft', color: 'var(--good)' }] } };
}

/* ---------- Fitness ---------- */
/* Tagesbelastung aus allen erledigten Einheiten (Plan, Extra, Uhr) – gleiche Formel wie im Coach (sessionLoad) */
export function loadsFromActivities(I: TrendInput): Record<string, number> {
  const out: Record<string, number> = {};
  const thr = I.profile.thresholds || {};
  for (const a of I.activities) {
    if (!a || a.date > I.today || !a.min) continue;
    const l = C.sessionLoad({ sport: a.sport === 'walk' ? 'run' : a.sport, title: a.name || '', plannedMinutes: a.min }, { metrics: { min: a.min, hr: a.avgHr }, rpe: a.rpe }, thr);
    if (l > 0) out[a.date] = (out[a.date] || 0) + l;
  }
  return out;
}
function loadSeries(I: TrendInput): { date: string; ctl: number; atl: number; tsb: number; src: string }[] {
  const icu = sorted((I.trend || []).filter(p => p && num(p.ctl) != null && num(p.atl) != null && p.date <= I.today && p.ctl > 0));
  // intervals.icu, wenn aktuell; sonst eigene Rechnung aus allen Einheiten (auch Extra-Einheiten)
  if (icu.length && icu[icu.length - 1].date >= C.addDays(I.today, -7)) return icu.map(p => ({ date: p.date, ctl: p.ctl, atl: p.atl, tsb: Math.round((p.ctl - p.atl) * 10) / 10, src: 'intervals.icu' }));
  const loads = loadsFromActivities(I);
  const days = Object.keys(loads).sort();
  if (!days.length) return [];
  let ctl = 0, atl = 0; const out: any[] = [];
  for (let d = days[0]; d <= I.today; d = C.addDays(d, 1)) { const l = loads[d] || 0; ctl += (l - ctl) / 42; atl += (l - atl) / 7; out.push({ date: d, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round((ctl - atl) * 10) / 10, src: 'eigene Einheiten' }); }
  return out;
}
function loadCard(I: TrendInput, from: string): TrendCard {
  const s = loadSeries(I);
  const inP = s.filter(p => p.date >= from);
  if (inP.length < 14 || !s.length || s[s.length - 1].ctl < 1) return lock('load', 'fitness', 'Fitness, Müdigkeit, Form', 14, inP.length, 'Tagen mit Training');
  const last = s[s.length - 1], first = inP[0];
  const tsb = last.tsb;
  const text = tsb > 10 ? `Form (TSB) +${de(tsb, 0)}: du bist frisch, gut vor einem Wettkampf – auf Dauer verliert man so Fitness.` : tsb >= -10 ? `Form (TSB) ${de(tsb, 0)}: ausgeglichen, Fitness wächst, ohne dich zu überlasten.` : tsb >= -25 ? `Form (TSB) ${de(tsb, 0)}: du trainierst produktiv hart, plane bald lockere Tage ein.` : `Form (TSB) ${de(tsb, 0)}: sehr müde. Jetzt Erholung, sonst steigt das Risiko für Krankheit und Verletzung.`;
  const pts = inP.filter((_, i) => inP.length <= 120 || i % Math.ceil(inP.length / 120) === 0 || i === inP.length - 1);
  return { id: 'load', group: 'fitness', title: 'Fitness, Müdigkeit, Form', value: de(last.ctl, 0), unit: 'CTL', delta: `${last.ctl - first.ctl >= 0 ? '▲ +' : '▼ '}${de(Math.abs(last.ctl - first.ctl), 0)} im Zeitraum`,
    text, tone: tsb < -25 ? 'warn' : tsb > 25 ? 'info' : 'good', spark: inP.map(p => p.ctl),
    chart: { pts: pts.map(p => ({ date: p.date, ctl: p.ctl, atl: p.atl, tsb: p.tsb })), series: [{ key: 'ctl', name: 'Fitness (CTL)', color: 'var(--accent)' }, { key: 'atl', name: 'Müdigkeit (ATL)', color: 'var(--warn)' }, { key: 'tsb', name: 'Form (TSB)', color: 'var(--good)', dashed: true }] } };
}
const SPORT_DE: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft', football: 'Teamsport', walk: 'Gehen', multi: 'Multisport', other: 'Sonstiges' };
const SPORT_COL: Record<string, string> = { swim: 'var(--swim)', bike: 'var(--bike)', run: 'var(--run)', strength: 'var(--strength)', football: 'var(--football)' };
function volumeCard(I: TrendInput, from: string): TrendCard {
  const acts = I.activities.filter(a => a.date >= from && a.date <= I.today && a.min);
  const weeks: Record<string, Record<string, number>> = {};
  for (const a of acts) { const w = monday(a.date); const sp = a.sport === 'walk' ? 'run' : a.sport; (weeks[w] = weeks[w] || {})[sp] = ((weeks[w] || {})[sp] || 0) + (a.min || 0) / 60; }
  const keys = Object.keys(weeks).sort();
  if (keys.length < 3) return lock('volume', 'fitness', 'Wochenumfang je Sportart', 3, keys.length, 'Wochen mit Training');
  const sports = [...new Set(acts.map(a => a.sport === 'walk' ? 'run' : a.sport))].filter(s => SPORT_COL[s]);
  const tot = (w: string) => Object.values(weeks[w]).reduce((x, y) => x + y, 0);
  const done = keys.filter(k => k < monday(I.today));
  const lastFull = done.length ? done.slice(-4) : keys.slice(-1);
  const a4 = avg(lastFull.map(tot))!;
  const fl = firstLast(done.map(tot));
  const rows = sports.map(s => ({ label: SPORT_DE[s], value: `${de(avg(lastFull.map(w => weeks[w][s] || 0))!, 1)} h/Woche` }));
  const grow = fl ? (fl.last - fl.first) / Math.max(0.5, fl.first) * 100 : 0;
  return { id: 'volume', group: 'fitness', title: 'Wochenumfang je Sportart', value: de(a4, 1), unit: 'h/Woche', delta: fl ? pctTxt(grow) : undefined, rows,
    text: grow > 25 ? `Der Umfang steigt schnell. Mehr als etwa 10 % pro Woche erhöht das Verletzungsrisiko.` : grow >= -10 ? `Umfang ${grow >= 3 ? 'steigt gleichmäßig' : 'ist stabil'}: gute Grundlage für Fortschritt.` : `Weniger Umfang als zu Beginn des Zeitraums${I.illness.some((p: any) => p.start >= from) ? ' (Krankheit eingerechnet)' : ''}.`,
    tone: grow > 25 ? 'warn' : grow >= -10 ? 'good' : 'info', spark: keys.map(tot),
    chart: { pts: keys.map(k => ({ date: k, ...Object.fromEntries(sports.map(s => [s, Math.round((weeks[k][s] || 0) * 10) / 10])), total: Math.round(tot(k) * 10) / 10 })), series: [{ key: 'total', name: 'Gesamt', color: 'var(--ink-2)', dashed: true }, ...sports.map(s => ({ key: s, name: SPORT_DE[s], color: SPORT_COL[s] }))], fmt: 'h' } };
}
function acwrCard(I: TrendInput, from: string): TrendCard {
  const loads = loadsFromActivities(I);
  const sumOf = (end: string, n: number) => { let s = 0; for (let i = 0; i < n; i++) s += loads[C.addDays(end, -i)] || 0; return s; };
  const days = Object.keys(loads).filter(d => d <= I.today).sort();
  if (!days.length || days[0] > C.addDays(I.today, -28)) return lock('acwr', 'fitness', 'Belastungssteigerung (ACWR)', 4, days.length ? Math.max(0, Math.floor((+new Date(I.today) - +new Date(days[0])) / 6048e5)) : 0, 'Wochen Trainingsdaten');
  const ratio = (d: string) => { const ch = sumOf(d, 28) / 4; return ch > 0 ? Math.round(sumOf(d, 7) / ch * 100) / 100 : null; };
  const pts: Pt[] = []; for (let d = from; d <= I.today; d = C.addDays(d, from < C.addDays(I.today, -100) ? 7 : 1)) { if (d >= C.addDays(days[0], 28)) pts.push({ date: d, v: ratio(d) }); }
  const r = ratio(I.today);
  if (r == null) return lock('acwr', 'fitness', 'Belastungssteigerung (ACWR)', 4, 0, 'Wochen Trainingsdaten');
  return { id: 'acwr', group: 'fitness', title: 'Belastungssteigerung (ACWR)', value: de(r, 2), unit: '', delta: 'letzte 7 gegen 28 Tage',
    text: r > 1.5 ? `Diese Woche viel mehr als sonst: hohes Verletzungsrisiko, die nächsten Tage lockerer.` : r > 1.3 ? `Etwas mehr als gewohnt: noch ok, aber nicht weiter steigern.` : r >= 0.8 ? `Im grünen Bereich (0,8-1,3): du steigerst dich in einem gesunden Tempo.` : `Weniger als gewohnt: gut in Erholungswochen, sonst verliert man langsam Fitness.`,
    tone: r > 1.5 ? 'warn' : r >= 0.8 && r <= 1.3 ? 'good' : 'info', spark: pts.map(p => p.v as number).filter(v => v != null),
    chart: { pts, series: [{ key: 'v', name: 'ACWR', color: 'var(--accent)' }], lines: [{ v: 1.3, label: '1,3', color: 'var(--warn)' }, { v: 0.8, label: '0,8', color: 'var(--ink-3)' }], fmt: 'num' } };
}

/* ---------- Effizienz ---------- */
/* Tempo bzw. Leistung auf einen Bezugspuls umrechnen (über die Herzfrequenz-Reserve, nur nahe am Bezugspuls) */
function atRef(val: number, hr: number, ref: number, rest: number): number | null {
  if (!(hr > rest + 10) || Math.abs(hr - ref) / ref > 0.12) return null;
  return val * (ref - rest) / (hr - rest);
}
function refHr(I: TrendInput, sport: 'run' | 'bike') { const t: any = I.profile.thresholds || {}; const l = sport === 'bike' ? t.lthrBike : t.lthrRun; return Math.round((l || (sport === 'bike' ? 160 : 168)) * 0.82); }
function restHr(I: TrendInput) { const v = (I.trend || []).filter(p => p && num(p.restingHR) != null).slice(-14).map(p => num(p.restingHR)!); return v.length ? median(v)! : 55; }
function runPaceCard(I: TrendInput, from: string): TrendCard {
  const ref = refHr(I, 'run'), rest = restHr(I);
  const pts = sorted(runs(I, from).filter(a => a.avgHr && a.speedKmh && (a.min || 0) >= 15 && !isHardAct(a)).map(a => ({ date: a.date, sp: atRef(a.speedKmh!, a.avgHr!, ref, rest) })).filter(p => p.sp != null && p.sp > 4 && p.sp < 25)) as { date: string; sp: number }[];
  if (pts.length < 4) return lock('runpace', 'efficiency', `Laufen: Pace bei Puls ${ref}`, 4, pts.length, 'lockeren Läufen mit Puls');
  const fl = firstLast(pts.map(p => p.sp))!;
  const pace = (sp: number) => 3600 / sp;
  const rel = (fl.last - fl.first) / fl.first * 100;
  return { id: 'runpace', group: 'efficiency', title: `Laufen: Pace bei Puls ${ref}`, value: mmss(pace(fl.last)), unit: '/km', delta: `${rel >= 0 ? '▲' : '▼'} ${mmss(Math.abs(pace(fl.first) - pace(fl.last)))} ${rel >= 0 ? 'schneller' : 'langsamer'}`,
    text: rel >= 2 ? `Bei gleichem Puls läufst du schneller: deine Grundlagenausdauer wird besser.` : rel > -2 ? `Bei gleichem Puls etwa gleich schnell: stabil. Fortschritt zeigt sich hier über Wochen.` : `Bei gleichem Puls etwas langsamer. Häufige Gründe: Müdigkeit, Hitze, wenig Schlaf.`,
    tone: rel >= 2 ? 'good' : rel > -2 ? 'info' : 'warn', spark: pts.map(p => -pace(p.sp)),
    chart: { pts: pts.map(p => ({ date: p.date, v: Math.round(pace(p.sp)) })), series: [{ key: 'v', name: `Pace bei Puls ${ref}`, color: 'var(--run)' }], invert: true, fmt: 'pace' } };
}
function bikeCard(I: TrendInput, from: string): TrendCard {
  const ref = refHr(I, 'bike'), rest = restHr(I);
  const all = rides(I, from).filter(a => a.avgHr && (a.min || 0) >= 20 && !isHardAct(a));
  const withW = all.filter(a => a.avgPower);
  const usePower = withW.length >= 4;
  const pts = sorted((usePower ? withW : all.filter(a => a.speedKmh && !a.indoor)).map(a => ({ date: a.date, v: atRef(usePower ? a.avgPower! : a.speedKmh!, a.avgHr!, ref, rest) })).filter(p => p.v != null && p.v > 0)) as { date: string; v: number }[];
  const title = usePower ? `Rad: Watt bei Puls ${ref}` : `Rad: km/h bei Puls ${ref}`;
  if (pts.length < 4) return lock('bikehr', 'efficiency', title, 4, pts.length, 'lockeren Fahrten mit Puls');
  const fl = firstLast(pts.map(p => p.v))!;
  const rel = (fl.last - fl.first) / fl.first * 100;
  return { id: 'bikehr', group: 'efficiency', title, value: de(fl.last, usePower ? 0 : 1), unit: usePower ? 'W' : 'km/h', delta: pctTxt(rel),
    text: (rel >= 2 ? `Mehr ${usePower ? 'Leistung' : 'Tempo'} bei gleichem Puls: deine Rad-Ausdauer wächst.` : rel > -2 ? `Etwa gleich viel ${usePower ? 'Leistung' : 'Tempo'} bei gleichem Puls: stabil.` : `Weniger ${usePower ? 'Leistung' : 'Tempo'} bei gleichem Puls. Oft Müdigkeit${usePower ? '' : ', Wind oder Strecke'}.`) + (usePower ? '' : ' Ohne Wattmessung beeinflussen Wind und Steigung den Wert.'),
    tone: rel >= 2 ? 'good' : rel > -2 ? 'info' : 'warn', spark: pts.map(p => p.v), chart: { pts: pts.map(p => ({ date: p.date, v: Math.round(p.v * 10) / 10 })), series: [{ key: 'v', name: title, color: 'var(--bike)' }], fmt: 'num' } };
}
function decouplingCard(I: TrendInput, from: string): TrendCard {
  const pts = sorted(I.activities.filter(a => (a.sport === 'run' || a.sport === 'bike') && a.date >= from && a.date <= I.today && a.decouplingPct != null && (a.min || 0) >= 45 && !isHardAct(a)).map(a => ({ date: a.date, v: a.decouplingPct!, sport: a.sport })));
  if (pts.length < 3) return lock('decoupling', 'efficiency', 'Aerobe Entkopplung', 3, pts.length, 'langen lockeren Einheiten (ab 45 min)');
  const last3 = avg(pts.slice(-3).map(p => p.v))!;
  return { id: 'decoupling', group: 'efficiency', title: 'Aerobe Entkopplung', value: de(last3, 1), unit: '%', delta: 'Schnitt der letzten 3',
    text: last3 <= 5 ? `Unter 5 %: der Puls bleibt in langen Einheiten stabil – deine Grundlage trägt.` : last3 <= 8 ? `Leicht über 5 %: in der zweiten Hälfte steigt der Puls. Lange Einheiten ruhiger beginnen.` : `Deutlich über 5 %: die Grundlage reicht für diese Dauer noch nicht. Mehr lange, lockere Einheiten helfen.`,
    tone: last3 <= 5 ? 'good' : last3 <= 8 ? 'info' : 'warn', spark: pts.map(p => -p.v),
    chart: { pts: pts.map(p => ({ date: p.date, [p.sport]: Math.round(p.v * 10) / 10 })), series: [{ key: 'run', name: 'Laufen', color: 'var(--run)' }, { key: 'bike', name: 'Rad', color: 'var(--bike)' }], lines: [{ v: 5, label: '5 %', color: 'var(--good)' }], invert: true, fmt: 'pct' } };
}
function efCard(I: TrendInput, from: string): TrendCard {
  const r = sorted(runs(I, from).filter(a => a.avgHr && a.speedKmh && (a.min || 0) >= 15 && !isHardAct(a)).map(a => ({ date: a.date, run: Math.round(a.speedKmh! * 1000 / 60 / a.avgHr! * 100) / 100 })));
  const b = sorted(rides(I, from).filter(a => a.avgHr && a.avgPower && (a.min || 0) >= 20 && !isHardAct(a)).map(a => ({ date: a.date, bike: Math.round(a.avgPower! / a.avgHr! * 100) / 100 })));
  const main = r.length >= b.length ? r.map(p => p.run) : b.map(p => p.bike);
  if (main.length < 4) return lock('ef', 'efficiency', 'Efficiency Factor', 4, Math.max(r.length, b.length), 'lockeren Einheiten mit Puls');
  const fl = firstLast(main)!; const rel = (fl.last - fl.first) / fl.first * 100;
  const isRun = r.length >= b.length;
  return { id: 'ef', group: 'efficiency', title: 'Efficiency Factor', value: de(fl.last, 2), unit: isRun ? 'm/min pro Schlag' : 'W pro Schlag', delta: pctTxt(rel),
    text: `${isRun ? 'Meter pro Minute' : 'Watt'} je Herzschlag in lockeren Einheiten. ${rel >= 2 ? 'Steigt: du wirst ökonomischer.' : rel > -2 ? 'Stabil.' : 'Sinkt etwas: oft ein Zeichen von Müdigkeit.'}`,
    tone: rel >= 2 ? 'good' : rel > -2 ? 'info' : 'warn', spark: main,
    chart: { pts: sorted([...r, ...b] as any[]), series: [...(r.length ? [{ key: 'run', name: 'Laufen (m/min/Schlag)', color: 'var(--run)' }] : []), ...(b.length ? [{ key: 'bike', name: 'Rad (W/Schlag)', color: 'var(--bike)' }] : [])], fmt: 'num' } };
}

/* ---------- Intensitätsverteilung ---------- */
function intensityCard(I: TrendInput, from: string): TrendCard {
  const acts = I.activities.filter(a => a.date >= from && a.date <= I.today && ['run', 'bike', 'swim'].includes(a.sport) && (a.min || 0) > 0);
  let easy = 0, mid = 0, hard = 0, n = 0;
  for (const a of acts) {
    const min = a.min || 0;
    if (a.hrZones && a.hrZones.some(z => z > 0)) { const z = a.hrZones; const s = z.reduce((x, y) => x + y, 0) || 1; easy += min * (z[0] + z[1]) / s; mid += min * z[2] / s; hard += min * (z[3] + z[4]) / s; n++; continue; }
    const t: any = I.profile.thresholds || {}; const l = a.sport === 'bike' ? t.lthrBike : a.sport === 'run' ? t.lthrRun : null;
    if (a.avgHr && l) { const f = a.avgHr / l; if (isHardAct(a)) { hard += min * 0.3; easy += min * 0.7; } else if (f < 0.87) easy += min; else if (f < 0.95) mid += min; else hard += min; n++; continue; }
    if (a.rpe != null || isHardAct(a)) { const r = a.rpe != null ? a.rpe : 7; if (isHardAct(a)) { hard += min * 0.3; easy += min * 0.7; } else if (r <= 4) easy += min; else if (r <= 6) mid += min; else hard += min; n++; }
  }
  if (n < 5) return lock('intensity', 'intensity', 'Locker / mittel / hart', 5, n, 'Einheiten mit Puls oder Anstrengung');
  const tot = easy + mid + hard;
  const pe = Math.round(easy / tot * 100), ph = Math.round(hard / tot * 100), pm = 100 - pe - ph;
  return { id: 'intensity', group: 'intensity', title: 'Locker / mittel / hart', value: `${pe}/${pm}/${ph}`, unit: '%', delta: 'Ziel etwa 80/0-10/20',
    rows: [{ label: 'locker (Zone 1-2)', value: `${pe} %` }, { label: 'mittel (Zone 3)', value: `${pm} %` }, { label: 'hart (Zone 4-5)', value: `${ph} %` }],
    text: pe >= 75 && pm <= 15 ? `Gut verteilt: viel locker, wenig hart – so wächst die Ausdauer am besten.` : pm > 15 ? `Viel Zeit im mittleren Bereich: zu hart für Erholung, zu locker für echten Reiz. Lockeres lockerer, Hartes härter.` : `Zu wenig locker: mehr ruhige Einheiten (Zone 2) schützen vor Übermüdung.`,
    tone: pe >= 75 && pm <= 15 ? 'good' : 'warn', spark: [pe, pm, ph] };
}

/* ---------- Schwimmen ---------- */
function swimCards(I: TrendInput, from: string): TrendCard[] {
  const s = sorted(swims(I, from).filter(a => a.swim));
  const out: TrendCard[] = [];
  const mk = (id: string, title: string, key: (a: Activity) => number | null, unit: string, lowerBetter: boolean, fmt: (v: number) => string, good: string, bad: string, need = 3, chartFmt: any = 'num') => {
    const pts = s.map(a => ({ date: a.date, v: key(a) })).filter(p => p.v != null && p.v > 0) as { date: string; v: number }[];
    if (pts.length < need) { out.push(lock(id, 'swim', title, need, pts.length, 'Schwimmeinheiten mit Daten')); return; }
    const fl = firstLast(pts.map(p => p.v));
    const better = fl ? (lowerBetter ? fl.last < fl.first * 0.985 : fl.last > fl.first * 1.015) : false;
    const worse = fl ? (lowerBetter ? fl.last > fl.first * 1.03 : fl.last < fl.first * 0.97) : false;
    const lastV = fl ? fl.last : pts[pts.length - 1].v;
    out.push({ id, group: 'swim', title, value: fmt(lastV), unit, delta: fl ? `${better ? '▲ besser' : worse ? '▼ schlechter' : '± gleich'} (vorher ${fmt(fl.first)})` : undefined,
      text: better ? good : worse ? bad : 'Stabil. Technik-Fortschritt im Wasser braucht Geduld.', tone: better ? 'good' : worse ? 'warn' : 'info', spark: pts.map(p => lowerBetter ? -p.v : p.v),
      chart: { pts: pts.map(p => ({ date: p.date, v: Math.round(p.v * 100) / 100 })), series: [{ key: 'v', name: title, color: 'var(--swim)' }], invert: lowerBetter, fmt: chartFmt } });
  };
  mk('swimpace', 'Pace pro 100 m', a => a.swim!.pace100, '/100 m', true, v => mmss(v), 'Du schwimmst schneller pro 100 m.', 'Etwas langsamer pro 100 m, z. B. mehr Technik oder Müdigkeit.', 3, 'pace100');
  mk('dps', 'Meter pro Zug', a => a.swim!.metersPerStroke, 'm', false, v => de(v, 2), 'Mehr Meter pro Zug: dein Zug wird länger und effizienter.', 'Weniger Meter pro Zug: auf langes Gleiten achten.');
  mk('spl', 'Züge pro Bahn', a => a.swim!.strokesPerLength, '', true, v => de(v, 1), 'Weniger Züge pro Bahn: bessere Wasserlage und mehr Vortrieb.', 'Mehr Züge pro Bahn: oft ein Zeichen von Müdigkeit oder hektischem Zug.');
  const cont = s.filter(a => a.swim!.longestContinuousM).map(a => ({ date: a.date, v: a.swim!.longestContinuousM! }));
  const fieldCont = (Object.entries(I.state.customWorkouts || {}) as any[]).flatMap(([d, l]: any) => (l || []).filter((w: any) => w.sport === 'swim' && num((w.metrics || {}).longestCrawl) && d >= from).map((w: any) => ({ date: d, v: num(w.metrics.longestCrawl)! })));
  const all = sorted([...cont, ...fieldCont]);
  if (!all.length) out.push(lock('crawl', 'swim', 'Längste Strecke Kraul am Stück', 1, 0, 'Schwimmeinheit mit diesem Wert'));
  else {
    const best = Math.max(...all.map(p => p.v)); const before = all.filter(p => p.date < C.addDays(I.today, -14)).map(p => p.v);
    const prev = before.length ? Math.max(...before) : null;
    out.push({ id: 'crawl', group: 'swim', title: 'Längste Strecke Kraul am Stück', value: String(Math.round(best)), unit: 'm', delta: prev != null && best > prev ? `▲ neu (vorher ${Math.round(prev)} m)` : undefined,
      text: best >= 400 ? 'Ab 400 m am Stück trägt deine Kraul-Ausdauer für Wettkämpfe.' : 'Jede längere Strecke am Stück ist ein Meilenstein. Ruhig atmen, langsam steigern.', tone: prev != null && best > prev ? 'good' : 'info', spark: all.map(p => p.v),
      chart: { pts: all.map(p => ({ date: p.date, v: p.v })), series: [{ key: 'v', name: 'Kraul am Stück (m)', color: 'var(--swim)' }], fmt: 'num' } });
  }
  return out;
}

/* ---------- Bestwerte ---------- */
interface Best { label: string; v: number; date: string; show: string; lower: boolean }
function bestsOf(acts: Activity[]): Best[] {
  const out: Best[] = [];
  const pick = (label: string, list: { v: number; date: string }[], lower: boolean, show: (v: number) => string) => {
    const l = list.filter(x => x.v > 0 && isFinite(x.v)); if (!l.length) return;
    const b = l.reduce((a, x) => (lower ? x.v < a.v : x.v > a.v) || (x.v === a.v && x.date < a.date) ? x : a);
    out.push({ label, v: b.v, date: b.date, show: show(b.v), lower });
  };
  const R = acts.filter(a => a.sport === 'run' && a.km && a.min);
  // bester 1-km-Abschnitt aus Runden (automatische Runde je km)
  pick('1 km (schnellste Runde)', R.flatMap(a => (a.laps || []).filter(l => l.m && l.m >= 950 && l.m <= 1050 && l.sec).map(l => ({ v: l.sec * 1000 / l.m!, date: a.date }))), true, v => mmss(v));
  for (const [km, lab] of [[5, '5 km'], [10, '10 km'], [21.1, 'Halbmarathon']] as [number, string][])
    pick(`${lab} (schnellster Lauf ab ${lab})`, R.filter(a => a.km! >= km * 0.98).map(a => ({ v: (a.min! * 60 / a.km!) * km, date: a.date })), true, v => fmtTime(v));
  const B = acts.filter(a => a.sport === 'bike' && a.min);
  pick('Rad: beste Ø-Leistung ab 20 min', B.filter(a => a.avgPower && a.min! >= 20).map(a => ({ v: a.avgPower!, date: a.date })), false, v => `${Math.round(v)} W`);
  pick('Rad: beste Ø-Leistung ab 60 min', B.filter(a => a.avgPower && a.min! >= 60).map(a => ({ v: a.avgPower!, date: a.date })), false, v => `${Math.round(v)} W`);
  pick('Rad: schnellste Fahrt ab 40 km (draußen)', B.filter(a => a.km && a.km >= 40 && a.speedKmh && !a.indoor).map(a => ({ v: a.speedKmh!, date: a.date })), false, v => `${de(v, 1)} km/h`);
  const S = acts.filter(a => a.sport === 'swim' && a.swim && a.swim.pace100);
  pick('Schwimmen: beste Pace ab 400 m', S.filter(a => (a.km || 0) >= 0.4).map(a => ({ v: a.swim!.pace100!, date: a.date })), true, v => `${mmss(v)}/100 m`);
  pick('Längster Lauf', R.map(a => ({ v: a.km!, date: a.date })), false, v => `${de(v, 1)} km`);
  pick('Längste Fahrt', B.filter(a => a.km).map(a => ({ v: a.km!, date: a.date })), false, v => `${de(v, 0)} km`);
  return out;
}
function fmtTime(sec: number) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
function bestsCard(I: TrendInput, from: string): TrendCard {
  const all = I.activities.filter(a => a.date <= I.today);
  const inP = bestsOf(all.filter(a => a.date >= from));
  if (!inP.length) return lock('bests', 'bests', 'Bestwerte', 1, 0, 'Einheit mit Zeit und Strecke');
  const ever = bestsOf(all);
  const before = bestsOf(all.filter(a => a.date < C.addDays(I.today, -13)));
  const rows = inP.map(b => {
    const e = ever.find(x => x.label === b.label); const old = before.find(x => x.label === b.label);
    const isEver = !!e && e.v === b.v && e.date === b.date;
    const isNew = isEver && b.date >= C.addDays(I.today, -13) && (!old || (b.lower ? b.v < old.v : b.v > old.v));
    return { label: b.label, value: b.show, date: b.date, badge: isNew ? 'neu' as const : isEver ? 'best' as const : undefined };
  });
  const nNew = rows.filter(r => r.badge === 'neu').length;
  return { id: 'bests', group: 'bests', title: 'Bestwerte', value: String(rows.length), unit: rows.length === 1 ? 'Wert' : 'Werte', delta: nNew ? `${nNew} neu in den letzten 2 Wochen` : undefined, rows,
    text: nNew ? `${nNew === 1 ? 'Ein neuer Bestwert' : nNew + ' neue Bestwerte'} – stark! Markiert mit „neu“.` : 'Beste Werte im Zeitraum. ★ = bester Wert überhaupt. Strecken-Zeiten aus dem Schnitt ganzer Einheiten.', tone: nNew ? 'good' : 'info' };
}

/* ---------- Lange Einheiten ---------- */
function longCard(I: TrendInput, from: string): TrendCard {
  const weeks: Record<string, { run: number; bike: number }> = {};
  for (const a of I.activities.filter(x => x.date >= from && x.date <= I.today && (x.sport === 'run' || x.sport === 'bike') && x.min)) {
    const w = monday(a.date); const o = (weeks[w] = weeks[w] || { run: 0, bike: 0 }); o[a.sport as 'run' | 'bike'] = Math.max(o[a.sport as 'run' | 'bike'], a.min!);
  }
  const keys = Object.keys(weeks).sort();
  if (keys.length < 3) return lock('long', 'long', 'Längster Lauf und längste Fahrt', 3, keys.length, 'Wochen mit Lauf oder Rad');
  const lr = Math.max(...keys.map(k => weeks[k].run)), lb = Math.max(...keys.map(k => weeks[k].bike));
  const recent = keys.slice(-4), early = keys.slice(0, Math.max(1, keys.length - 4));
  const grow = (sp: 'run' | 'bike') => Math.max(...recent.map(k => weeks[k][sp])) - Math.max(...early.map(k => weeks[k][sp]));
  const gr = grow('run'), gb = grow('bike');
  const h = (m: number) => m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')} h` : `${Math.round(m)} min`;
  return { id: 'long', group: 'long', title: 'Längster Lauf und längste Fahrt', value: lr ? h(lr) : h(lb), unit: lr ? 'Lauf' : 'Rad', rows: [...(lr ? [{ label: 'Längster Lauf', value: h(lr) }] : []), ...(lb ? [{ label: 'Längste Fahrt', value: h(lb) }] : [])],
    delta: gr > 0 || gb > 0 ? `▲ länger als zu Beginn` : undefined,
    text: gr > 0 || gb > 0 ? 'Die langen Einheiten werden länger: genau das baut Ausdauer für lange Wettkämpfe auf.' : 'Die langen Einheiten sind gleich lang geblieben. Für längere Wettkämpfe wachsen sie Schritt für Schritt (höchstens 10-15 min pro Woche).',
    tone: gr > 0 || gb > 0 ? 'good' : 'info', spark: keys.map(k => Math.max(weeks[k].run, weeks[k].bike)),
    chart: { pts: keys.map(k => ({ date: k, run: weeks[k].run || null, bike: weeks[k].bike || null })), series: [{ key: 'run', name: 'Längster Lauf (min)', color: 'var(--run)' }, { key: 'bike', name: 'Längste Fahrt (min)', color: 'var(--bike)' }], fmt: 'num' } };
}

/* ---------- Zusammenhänge ---------- */
function sleepQualityCard(I: TrendInput, from: string): TrendCard {
  const need = sleepNeed(I.profile, I.today)[0];
  const sleepOf = (d: string) => { const p = (I.trend || []).find(x => x && x.date === d); return p ? num(p.sleepHours) : null; };
  // Qualität: Effizienz (Tempo bzw. Leistung pro Herzschlag) im Vergleich zum eigenen Mittel derselben Sportart
  const base: Record<string, number[]> = {};
  const eff = (a: Activity) => a.avgHr ? (a.sport === 'bike' && a.avgPower ? a.avgPower : a.speedKmh || 0) / a.avgHr : null;
  const acts = I.activities.filter(a => a.date >= from && a.date <= I.today && (a.sport === 'run' || a.sport === 'bike') && !isHardAct(a) && eff(a) && (a.min || 0) >= 15);
  acts.forEach(a => { (base[a.sport] = base[a.sport] || []).push(eff(a)!); });
  const pairs = acts.map(a => ({ s: sleepOf(a.date), q: eff(a)! / median(base[a.sport])! })).filter(p => p.s != null) as { s: number; q: number }[];
  const good = pairs.filter(p => p.s >= need), short = pairs.filter(p => p.s < need);
  if (good.length < 5 || short.length < 5) return lock('sleepq', 'relations', 'Schlaf und Trainingsqualität', 10, pairs.length, 'Einheiten mit Schlafwert (je 5 nach kurzen und langen Nächten)');
  // Median statt Mittel: einzelne Ausreißer (Wind, Hitze) sollen den Vergleich nicht kippen
  const diff = (median(good.map(p => p.q))! - median(short.map(p => p.q))!) * 100;
  return { id: 'sleepq', group: 'relations', title: 'Schlaf und Trainingsqualität', value: `${diff >= 0 ? '+' : ''}${de(diff, 1)}`, unit: '%', delta: `${good.length} gegen ${short.length} Einheiten`,
    text: diff >= 2 ? `Nach Nächten ab ${de(need, 1)} h bist du ${de(diff, 1)} % effizienter unterwegs (mehr Tempo pro Herzschlag). Schlaf zahlt sich bei dir messbar aus.` : diff > -2 ? `Bisher kein klarer Unterschied zwischen kurzen und langen Nächten. Mit mehr Daten wird das genauer.` : `Nach langen Nächten bisher kein Vorteil zu sehen. Das ist bei wenigen Einheiten oft Zufall – Schlaf bleibt die beste Erholung.`,
    tone: diff >= 2 ? 'good' : 'info' };
}
function weightCard(I: TrendInput, from: string, minor: boolean): TrendCard {
  const nut = I.state.nutrition || {};
  const pts = sorted(Object.entries(nut).filter(([d, n]: any) => d >= from && d <= I.today && n && num(n.weight) != null).map(([d, n]: any) => ({ date: d, v: num(n.weight)! })));
  if (pts.length < 3) return lock('weight', 'relations', 'Gewicht', 3, pts.length, 'Tagen mit Gewicht');
  const fl = firstLast(pts.map(p => p.v));
  const d = fl ? fl.last - fl.first : 0;
  return { id: 'weight', group: 'relations', title: 'Gewicht', value: de(pts[pts.length - 1].v, 1), unit: 'kg', delta: fl ? `${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '± '}${de(Math.abs(d), 1)} kg` : undefined,
    text: minor ? 'Im Wachstum verändert sich das Gewicht ganz normal. Wichtig ist, genug zu essen, damit du dich gut erholst.' : Math.abs(d) < 1 ? 'Stabil. Genug essen ist wichtiger für die Leistung als ein bestimmtes Gewicht.' : d > 0 ? 'Etwas mehr als zu Beginn. Bei viel Training oft Muskeln und Wasser, kein Grund zur Sorge.' : 'Etwas weniger als zu Beginn. Achte darauf, an Trainingstagen genug zu essen.',
    tone: 'info', spark: pts.map(p => p.v), chart: { pts: pts.map(p => ({ date: p.date, v: p.v })), series: [{ key: 'v', name: 'Gewicht (kg)', color: 'var(--ink-2)' }], fmt: 'num' } };
}

/* ---------- alle Trends ---------- */
export function trendCards(I: TrendInput): TrendCard[] {
  const from = C.addDays(I.today, -PERIOD_DAYS[I.period] + 1);
  const minor = (() => { const y = (I.profile as any).birthYear; return y ? +I.today.slice(0, 4) - y < 18 : false; })();
  const safe = (f: () => TrendCard | TrendCard[]): TrendCard[] => { try { const r = f(); return Array.isArray(r) ? r : [r]; } catch (e) { return []; } };
  const sports = (I.profile.sports || []) as string[];
  return [
    ...safe(() => rollingVsBase(I, 'hrv', 'hrv', 'HFV', 'ms', true, 0, from)),
    ...safe(() => rollingVsBase(I, 'restingHR', 'rhr', 'Ruhepuls', 'bpm', false, 0, from)),
    ...safe(() => sleepCard(I, from)),
    ...safe(() => readinessCard(I, from, PERIOD_DAYS[I.period])),
    ...safe(() => loadCard(I, from)),
    ...safe(() => volumeCard(I, from)),
    ...safe(() => acwrCard(I, from)),
    ...(sports.includes('run') || runs(I, from).length ? safe(() => runPaceCard(I, from)) : []),
    ...(sports.includes('bike') || rides(I, from).length ? safe(() => bikeCard(I, from)) : []),
    ...safe(() => decouplingCard(I, from)),
    ...safe(() => efCard(I, from)),
    ...safe(() => intensityCard(I, from)),
    ...(sports.includes('swim') || swims(I, from).length ? safe(() => swimCards(I, from)) : []),
    ...safe(() => bestsCard(I, from)),
    ...safe(() => longCard(I, from)),
    ...safe(() => sleepQualityCard(I, from)),
    ...safe(() => weightCard(I, from, minor))
  ];
}
