/* Auftrag 30, Punkt 5: Bestwert, Tageswert und Trend – eine Stelle für Coach, Stufen und Scores.
   Fehler war: „von 50 m (Di 13.10.) auf 75 m (Fr 6.11.)“ – erster gegen letzten Wert, obwohl der Bestwert 100 m (27.10.) war und 75 m nur ein
   Tageswert. Hier gilt für jeden Wert (Strecke am Stück, Pace, Watt, Bestzeiten):
   - Bestwert: der beste Einzelwert (Datum = wann er zuerst erreicht wurde)
   - Tageswert: der Wert der letzten Einheit
   - Trend: erst ab mehreren Einheiten (Median der letzten 3 gegen die 3 davor), sonst keiner
   Ein schwächerer Tag ist kein Rückschritt, ein einzelner Spitzenwert noch kein neues Niveau (bestätigt = mindestens zweimal geschafft).
   Texte: „Heute 75 m am Stück, dein Bestwert sind 100 m (27.10.).“ – ohne Vergleich erster gegen letzter Wert. */
export interface Pt { date: string; v: number }
export interface Story {
  n: number; day: Pt | null; best: Pt | null; prevBest: Pt | null;
  /** bestätigt: zweitbester Wert (mindestens zweimal erreicht bzw. überboten) – nur bei Strecken sinnvoll */
  confirmed: number | null;
  trend: 'up' | 'flat' | 'down' | null; isNewBest: boolean; equalsBest: boolean;
}
const better = (a: number, b: number, higher: boolean) => higher ? a > b : a < b;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function valueStory(points: Pt[], higher = true): Story {
  const pts = (points || []).filter(p => p && p.date && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!pts.length) return { n: 0, day: null, best: null, prevBest: null, confirmed: null, trend: null, isNewBest: false, equalsBest: false };
  // je Tag nur der beste Wert (zwei Einheiten an einem Tag sind ein Tageswert)
  const byDay = new Map<string, Pt>();
  for (const p of pts) { const o = byDay.get(p.date); if (!o || better(p.v, o.v, higher)) byDay.set(p.date, p); }
  const days = [...byDay.values()];
  const pick = (list: Pt[]) => list.reduce<Pt | null>((b, p) => !b || better(p.v, b.v, higher) ? p : b, null);
  const day = days[days.length - 1];
  const best = pick(days)!; const prevBest = pick(days.slice(0, -1));
  const sorted = days.map(p => p.v).sort((a, b) => higher ? b - a : a - b);
  const confirmed = sorted.length >= 2 ? sorted[1] : null;
  let trend: Story['trend'] = null;
  if (days.length >= 4) {
    const last = days.slice(-3).map(p => p.v), before = days.slice(-6, -3).map(p => p.v);
    const a = median(last), b = median(before); const rel = (a - b) / b;
    trend = Math.abs(rel) < 0.05 ? 'flat' : (rel > 0) === higher ? 'up' : 'down';
  }
  return { n: days.length, day, best, prevBest, confirmed, trend, isNewBest: !!prevBest && better(day.v, prevBest.v, higher), equalsBest: !!prevBest && day.v === best.v && best.date !== day.date };
}
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const dm = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.`;
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export function dayWord(date: string, today: string): string {
  if (date === today) return 'Heute';
  if (date === addDays(today, -1)) return 'Gestern';
  return `Am ${DOW[new Date(date + 'T12:00:00Z').getUTCDay()]} ${dm(date)}`;
}
export interface StoryText { fmt: (v: number) => string; what: string; today: string; plural?: boolean; stage?: boolean }
/* Ein Satz (oder zwei) wie ein Trainer: Tageswert, Bestwert mit Datum, Trend nur mit mehreren Einheiten. Nie „Rückschritt“ wegen eines Tages. */
export function storyText(s: Story, o: StoryText): string {
  if (!s.day || !s.best) return '';
  const word = dayWord(s.day.date, o.today); const val = o.fmt(s.day.v);
  const verb = o.plural ? 'sind' : 'ist';
  const out: string[] = [];
  if (s.isNewBest) out.push(`${word} ${val} ${o.what} – neuer Bestwert (vorher ${o.fmt(s.prevBest!.v)} am ${dm(s.prevBest!.date)}).${o.stage && s.confirmed != null && s.confirmed < s.day.v ? ' Ein einzelner Spitzenwert ist noch kein neues Niveau: für die Stufe zählt es, sobald du es ein zweites Mal schaffst.' : ''}`);
  else if (s.n === 1) out.push(`${word} ${val} ${o.what}.`);
  else if (s.day.v === s.best.v) out.push(`${word} ${val} ${o.what} – so gut wie dein Bestwert (${dm(s.best.date)}).`);
  else out.push(`${word} ${val} ${o.what}, dein Bestwert ${verb} ${o.fmt(s.best.v)} (${dm(s.best.date)}).`);
  if (s.trend === 'up' && !s.isNewBest) out.push('Über die letzten Einheiten geht es nach oben.');
  else if (s.trend === 'down') out.push('Die letzten Einheiten waren etwas schwächer – einzelne Tage schwanken, das ist kein Rückschritt.');
  return out.join(' ');
}
// 12,5-m-Becken: halbe Meter bleiben stehen (nicht auf 13 m runden)
const fmtM = (v: number) => `${Number.isInteger(v) ? v.toLocaleString('de-DE') : String(Math.round(v * 10) / 10).replace('.', ',')} m`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/* Die Werte, für die die App Bestwert/Tageswert/Trend führt (Strecke am Stück, Pace, Watt, Bestzeiten) */
export const STORY_METRICS: Record<string, { label: string; what: string; higher: boolean; fmt: (v: number) => string; plural?: boolean; stage?: boolean }> = {
  crawl: { label: 'Kraul am Stück', what: 'Kraul am Stück', higher: true, fmt: fmtM, plural: true, stage: true },
  pull: { label: 'Pull Buoy am Stück', what: 'mit Pull Buoy am Stück', higher: true, fmt: fmtM, plural: true, stage: true },
  run5k: { label: 'Laufen: schnellster Lauf ab 5 km', what: 'pro km (Lauf ab 5 km)', higher: false, fmt: v => `${mmss(v)} min`, plural: false },
  runLong: { label: 'Längster Lauf', what: 'längster Lauf', higher: true, fmt: v => `${(Math.round(v * 10) / 10).toString().replace('.', ',')} km`, plural: false },
  bike20: { label: 'Rad: beste Ø-Leistung ab 20 min', what: 'Ø-Leistung (ab 20 min)', higher: true, fmt: v => `${Math.round(v)} W`, plural: true },
  swim400: { label: 'Schwimmen: beste Pace ab 400 m', what: 'pro 100 m (ab 400 m)', higher: false, fmt: v => `${mmss(v)} min`, plural: false },
  runContinuous: { label: 'Laufen am Stück', what: 'am Stück gelaufen', higher: true, fmt: v => `${Math.round(v)} min`, plural: true, stage: true }
};
