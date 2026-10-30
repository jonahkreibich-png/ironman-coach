/* Ist die Wunschzeit realistisch? (Auftrag 4 B4, Auftrag 23)
   Vorher eine eigene, grobe Rechnung (Schwelle × Faktor, +0,4-0,8 % pro Woche), die anders rechnete als die Prognose im Fortschritt.
   Jetzt eine Rechnung für alles: die Ziel-Prognose (shared/prognosis.ts). Ohne Messwerte (Onboarding) aus den Profilwerten.
   Die Wunschzeit ändert den Plan nicht. Sie zeigt je Disziplin, was nötig wäre, wie wahrscheinlich das ist und wo der größte Hebel liegt. */
import type { Goal } from './goals';
import { legsOf } from './goals';
import type { Profile } from './profile';
import { withEstimates } from './profile';
import { prognosis, type Prognosis, type Prediction } from './prognosis';
import type { Estimates } from './scores';

export type Verdict = 'realistisch' | 'ambitioniert' | 'sehr unwahrscheinlich';
export interface Realism { low: number; high: number; ok: boolean | null; text: string; verdict?: Verdict }
const fmt = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
export const hm = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`; };

export function emptyEstimates(): Estimates {
  return { runThrSpeed: null, runEff: null, bikeThrKmh: null, ftp: null, swimCss: null, nRun: 0, nBike: 0, nSwim: 0, runManual: 1, bikeManual: 1, swimManual: 1 };
}
/* Prognose nur aus dem Profil (Onboarding, noch keine Einheiten) */
export function profilePrognosis(g: Goal, profile0: Profile, today: string): Prognosis | null {
  if (!g.date || g.type === 'fitness' || !legsOf(g).length) return null;
  const p = withEstimates(profile0, today);
  const th: any = p.thresholds || {};
  const crawl = p.skills && p.skills.swimCrawl ? p.skills.swimCrawl !== 'no' : undefined;
  const est: Estimates = { ...emptyEstimates(), ftp: th.ftp || null, ...(crawl != null ? { swimCanCrawl: crawl } : {}) };
  try { return prognosis(g, est, { profile: p, today }); } catch (e) { return null; }
}
export function predictGoal(g: Goal, profile0: Profile, today: string): { low: number; high: number } | null {
  const p = profilePrognosis(g, profile0, today); const r = p && (p.race ? p.race.total : p.total);
  return r ? { low: Math.round(r.low), high: Math.round(r.high) } : null;
}
/* Wunschzeit gesamt; bei Triathlon mit Wunschzeit je Disziplin die Summe (fehlende Disziplinen und Wechsel aus der Prognose) */
export function wishTarget(g: Goal, p: Prognosis | null): number | null {
  if (g.targetTimeSec) return g.targetTimeSec;
  const sp: any = g.splits || {}; const v = Object.values(sp).filter((x: any) => x > 0) as number[];
  if (!v.length) return null;
  const ref = p ? (p.race ? p.race.parts : p.parts) || [] : [];
  return ref.reduce((a, x) => a + (x.sport && x.sport !== 'trans' && sp[x.sport] > 0 ? 0 : x.best), 0) + v.reduce((a, x) => a + x, 0);
}
/* realistisch: wahrscheinlichste Zeit oder langsamer; ambitioniert: schneller, bis etwas über das schnelle Ende des Bereichs hinaus (das ist
   keine feste Grenze, nur unwahrscheinlich); sehr unwahrscheinlich: deutlich schneller als das schnelle Ende */
export function verdictOf(wish: number, r: { best: number; low: number }): Verdict {
  return wish >= r.best * 0.995 ? 'realistisch' : wish >= r.low - (r.best - r.low) * 0.5 ? 'ambitioniert' : 'sehr unwahrscheinlich';
}
/* Eine Zeile für Profil und Onboarding. prog: die Prognose mit allen Daten (sonst nur aus dem Profil). */
export function realism(g: Goal, p: Profile, today: string, prog?: Prognosis | null): Realism | null {
  const pr = prog === undefined ? profilePrognosis(g, p, today) : prog;
  if (!pr || !pr.ok || !pr.total) return null;
  const r = pr.race ? pr.race.total : pr.total;
  const est = prog === undefined && ((p.thresholds && p.thresholds.estimated) || []).length > 0;
  const range = pr.race && pr.race.approx ? `ca. ${pr.race.approx}` : `${fmt(r.low)} bis ${fmt(r.high)}`;
  const wish = wishTarget(g, pr);
  if (!wish) return { low: r.low, high: r.high, ok: null, text: `Realistisch bis zum Termin: etwa ${range}${est ? ' (grob, aus geschätzten Werten)' : ''}.` };
  const v = verdictOf(wish, r);
  const text = v === 'realistisch' ? `Deine Wunschzeit ${fmt(wish)} ist realistisch (Prognose ${range}${est ? ', grob geschätzt' : ''}).`
    : v === 'ambitioniert' ? `Deine Wunschzeit ${fmt(wish)} ist ambitioniert, aber möglich (Prognose ${range}${est ? ', grob geschätzt' : ''}).`
      : `${fmt(wish)} ist bis zum Termin sehr unwahrscheinlich. Realistisch wären etwa ${range}${est ? ' (grob geschätzt, ein Test macht es genauer)' : ''}.`;
  return { low: r.low, high: r.high, ok: v !== 'sehr unwahrscheinlich', text, verdict: v };
}

/* ---------- Wunschzeit gegen Prognose je Disziplin (Auftrag 23) ---------- */
export interface WishRow { sport: 'swim' | 'bike' | 'run' | 'trans'; label: string; need: number; pred: number; low: number; gap: number; lever: boolean; verdict: Verdict }
export interface WishCheck { target: number; pred: Prediction; verdict: Verdict; rows: WishRow[]; lever: WishRow | null; text: string; leverText: string; date: string | null }
/* Wie viel Zeit ist in einer Disziplin bis zum Rennen zusätzlich drin? Abstand zur eigenen Grenze (Entwicklungsmodell), mindestens das
   schnelle Ende des Bereichs; wer noch Brust schwimmt, hat im Schwimmen deutlich mehr. */
function potentialOf(x: { sport?: string; best: number; low: number; note?: string }, p: Prognosis): number {
  const g = p.race && p.race.growth ? p.race.growth.find(y => y.sport === x.sport) : null;
  let f = 0.03;
  if (g && g.ceiling > g.to) f = Math.max(f, x.sport === 'bike' ? 1 - Math.cbrt(g.to / g.ceiling) : 1 - g.to / g.ceiling);
  if (x.sport === 'swim' && x.note && /Brust/.test(x.note)) f += 0.1;
  return Math.max(x.best * f, x.best - x.low);
}
export function wishCheck(g: Goal, p: Prognosis | null): WishCheck | null {
  if (!p || !p.ok || !p.total) return null;
  const target = wishTarget(g, p); if (!target) return null;
  const pred = p.race ? p.race.total : p.total;
  const parts = (p.race ? p.race.parts : p.parts) || [];
  const sp: any = g.splits || {};
  // je Sportart zusammenfassen (Duathlon hat zwei Läufe)
  const by = new Map<string, { sport: any; label: string; best: number; low: number; high: number; note?: string }>();
  for (const x of parts) { const k = x.sport || x.label; const o = by.get(k); if (o) { o.best += x.best; o.low += x.low; o.high += x.high; } else by.set(k, { sport: x.sport, label: x.label.replace(/ \(.*\)$/, ''), best: x.best, low: x.low, high: x.high, note: x.note }); }
  const list = [...by.values()];
  const disc = list.filter(x => x.sport !== 'trans');
  const fixed = disc.filter(x => sp[x.sport] > 0), free = disc.filter(x => !(sp[x.sport] > 0));
  const trans = list.find(x => x.sport === 'trans');
  // Was in den nicht vorgegebenen Disziplinen gespart werden muss, verteilt nach dem, was dort noch drin ist (wo es am leichtesten geht)
  const rest = target - fixed.reduce((a, x) => a + sp[x.sport], 0) - (trans ? trans.best : 0);
  const save = free.reduce((a, x) => a + x.best, 0) - rest;
  const pot = free.map(x => potentialOf(x, p)); const potSum = pot.reduce((a, x) => a + x, 0) || 1;
  const rows: WishRow[] = disc.map(x => {
    const i = free.indexOf(x);
    const need = sp[x.sport] > 0 ? sp[x.sport] : x.best - save * pot[i] / potSum;
    return { sport: x.sport, label: x.label, need, pred: x.best, low: x.low, gap: x.best - need, lever: false, verdict: verdictOf(need, x) };
  });
  if (trans) rows.push({ sport: 'trans', label: 'Wechsel', need: trans.best, pred: trans.best, low: trans.low, gap: 0, lever: false, verdict: 'realistisch' });
  // größter Hebel: wo am meisten Zeit zu holen ist (nicht unbedingt die größte Lücke)
  const verdict = verdictOf(target, pred);
  let lever: WishRow | null = null;
  if (target < pred.best && disc.length > 1) {
    const best = disc.map(x => ({ x, pot: potentialOf(x, p) })).sort((a, b) => b.pot - a.pot)[0];
    lever = rows.find(r => r.sport === best.x.sport) || null;
    if (lever) lever.lever = true;
  }
  const range = p.race && p.race.approx ? `ca. ${p.race.approx}` : `${hm(pred.low)} – ${hm(pred.high)}`;
  const text = verdict === 'realistisch' ? `${hm(target)} ist realistisch: Die Prognose liegt bei ${range}${target > pred.high ? ', du hast Luft' : ''}.`
    : verdict === 'ambitioniert' ? (target >= pred.low ? `${hm(target)} ist ambitioniert: schneller als die wahrscheinlichste Zeit (${hm(pred.best)}), aber im möglichen Bereich (${range}). Dafür muss das Training gut laufen.` : `${hm(target)} ist ambitioniert: knapp schneller als das schnelle Ende der Prognose (${range}). Das klappt nur, wenn das Training sehr gut läuft und du gut darauf ansprichst.`)
      : `${hm(target)} ist bis zum Termin sehr unwahrscheinlich: deutlich schneller als das schnelle Ende der Prognose (${hm(pred.low)}).`;
  const leverText = lever ? `Größter Hebel: ${lever.label} (${hm(lever.need)} nötig, Prognose ${hm(lever.pred)}).` : '';
  return { target, pred, verdict, rows, lever, text, leverText, date: p.race ? p.race.date : null };
}

/* Auftrag 18: höchstens 2-3 A-Wettkämpfe pro Jahr mit genug Abstand (sonst Hinweis: weitere als B oder C) */
export function seasonHint(goals: Goal[], today: string): string | null {
  const a = (goals || []).filter(g => g && g.priority === 'A' && g.date && g.date >= today && !g.result && g.type !== 'fitness').sort((x, y) => x.date!.localeCompare(y.date!));
  for (let i = 0; i < a.length; i++) {
    const within = a.filter(g => g.date! >= a[i].date! && +new Date(g.date! + 'T12:00:00Z') - +new Date(a[i].date! + 'T12:00:00Z') < 365 * 86400000);
    if (within.length > 3) return `${within.length} Hauptziele (A) innerhalb eines Jahres: Mehr als 2-3 echte Form-Spitzen pro Jahr gehen kaum. Mach die weniger wichtigen zu B (kurzes Tapering) oder C (als Training).`;
  }
  for (let i = 1; i < a.length; i++) {
    const d = (+new Date(a[i].date! + 'T12:00:00Z') - +new Date(a[i - 1].date! + 'T12:00:00Z')) / 86400000;
    if (d < 42) return `${a[i - 1].name} und ${a[i].name} sind beide Hauptziele (A), aber nur ${Math.round(d / 7)} Wochen auseinander. Zwischen zwei A-Wettkämpfen braucht es Erholung und Aufbau: eins davon besser als B oder C planen.`;
  }
  return null;
}
