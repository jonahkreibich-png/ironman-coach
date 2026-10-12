/* Einschränkungen (Auftrag 5 A1): ein gemeinsames Modell für alles, was eine Person über ihren Alltag angibt.
   Quellen: Wochenraster (Sportart × Wochentag), Freitext (shared/ruleparse.ts), Coach-Chat, später die KI.
   Jede Regel hat Art, Bezug und Stärke: hart = darf nie verletzt werden, weich = möglichst einhalten.
   Plan-Generator, wöchentliche Anpassung, Verschieben durch die Engine, Vorschläge des Coaches und „Plan bearbeiten“
   prüfen Einheiten mit denselben Funktionen (evaluate, dayLimit, hardViolations). */
import type { Profile } from './profile';

export type RuleSport = 'run' | 'bike' | 'swim' | 'strength';
export type RuleKind =
  | 'onlyDays'   // Sportart nur an bestimmten Tagen („Laufen nur Sa/So“)
  | 'neverDays'  // Sportart nie an bestimmten Tagen („mittwochs kein Laufen“)
  | 'dayOff'     // Tag ganz frei („dienstags gar nichts“)
  | 'maxDay'     // Höchstdauer an einem Tag
  | 'placeDays'  // Ort oder Gerät nur bzw. nie an bestimmten Tagen/Monaten („Schwimmbad nur Do“, „Rolle nur im Winter“)
  | 'period'     // Zeitraum ohne oder mit wenig Training (Urlaub, Prüfungen)
  | 'body'       // Körper-Einschränkung mit Folgen („Knie: keine Lauf-Intervalle, kein Bergablaufen“)
  | 'prefer'     // Vorliebe („langer Lauf lieber sonntags“), immer weich
  | 'info';      // verstanden, ohne Einfluss auf Tage (z. B. „Laufband im Keller“)
export type Place = 'pool' | 'trainer' | 'outdoor' | 'gym' | 'treadmill' | 'track';
export type Strength = 'hard' | 'soft';

export interface Rule {
  id: string;
  kind: RuleKind;
  strength: Strength;
  /** Sportart; leer = alle Sportarten */
  sport?: RuleSport | null;
  /** Wochentage 0=So … 6=Sa */
  days?: number[];
  /** gilt nur in diesen Monaten (1-12), z. B. Winter */
  months?: number[];
  /** maxDay: Minuten */
  minutes?: number;
  /** placeDays: Ort/Gerät; placeOnly true = nur dann, false = dann nie */
  place?: Place;
  placeOnly?: boolean;
  /** period: von … bis (inklusive), none = kein Training, low = wenig Training */
  from?: string; to?: string; level?: 'none' | 'low';
  /** body: Körperteil und Folgen */
  body?: string; noIntervals?: boolean; noDownhill?: boolean; volume?: number; caution?: boolean;
  /** betrifft nur lange oder harte Einheiten (z. B. „langer Lauf lieber So“) */
  what?: 'long' | 'hard';
  /** Originalsatz und Herkunft */
  text?: string;
  source?: 'grid' | 'text' | 'chat' | 'ai' | 'note' | 'onboarding';
  /** zusätzliche Erklärung (info) */
  note?: string;
  createdAt?: number;
}

export const DOW_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const SPORT_NAME: Record<RuleSport, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' };
const PLACE_NAME: Record<Place, string> = { pool: 'Schwimmbad', trainer: 'Rolle', outdoor: 'Rad draußen', gym: 'Fitnessstudio', treadmill: 'Laufband', track: 'Laufbahn' };
const BODY_NAME: Record<string, string> = { knee: 'Knie', achilles: 'Achillessehne', shin: 'Schienbein', hip: 'Hüfte', back: 'Rücken', shoulder: 'Schulter', foot: 'Fuß/Sprunggelenk', groin: 'Leiste', calf: 'Wade', thigh: 'Oberschenkel', neck: 'Nacken', injury: 'Beschwerden', heart: 'Herz/Kreislauf', asthma: 'Asthma' };
export const WINTER = [11, 12, 1, 2, 3];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const monthOf = (d: string) => +d.slice(5, 7);

/* ---------- Texte in einfachen Worten ---------- */
export function daysText(days: number[] | undefined): string {
  const set = [...new Set(days || [])];
  if (!set.length) return '';
  if (set.length === 7) return 'jeden Tag';
  const order = [1, 2, 3, 4, 5, 6, 0].filter(d => set.includes(d));
  if (order.length === 2 && order[0] === 6 && order[1] === 0) return 'Sa und So';
  if (order.length === 5 && [1, 2, 3, 4, 5].every(d => set.includes(d))) return 'Mo–Fr';
  // zusammenhängende Läufe als Spanne (ab 3 Tagen)
  const idx = order.map(d => (d + 6) % 7); const parts: string[] = [];
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DOW_SHORT[(idx[i] + 1) % 7]}–${DOW_SHORT[(idx[j] + 1) % 7]}`); else for (let k = i; k <= j; k++) parts.push(DOW_SHORT[(idx[k] + 1) % 7]);
    i = j + 1;
  }
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1];
}
export function monthsText(m: number[] | undefined): string {
  if (!m || !m.length) return '';
  if (m.length === WINTER.length && WINTER.every(x => m.includes(x))) return 'im Winter (Nov–März)';
  const s = [...m]; return s.length > 2 ? `${MONTH_SHORT[s[0]]}–${MONTH_SHORT[s[s.length - 1]]}` : s.map(x => MONTH_SHORT[x]).join(' und ');
}
const dmy = (d?: string) => d ? `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '…';
export function describe(r: Rule): string {
  const soft = r.strength === 'soft' && r.kind !== 'prefer' ? ' (wenn möglich)' : '';
  const sp = r.sport ? SPORT_NAME[r.sport] : 'Training';
  const what = r.what === 'long' ? (r.sport === 'run' ? 'Langer Lauf' : r.sport === 'bike' ? 'Lange Ausfahrt' : `Lange Einheit${r.sport ? ' ' + SPORT_NAME[r.sport] : ''}`) : r.what === 'hard' ? `Harte Einheiten${r.sport ? ' ' + SPORT_NAME[r.sport] : ''}` : sp;
  const mo = r.months && r.months.length ? ' ' + monthsText(r.months) : '';
  switch (r.kind) {
    case 'onlyDays': return `${what}: nur ${daysText(r.days)}${mo}${soft}`;
    case 'neverDays': return (r.days || []).length === 7 || !(r.days || []).length ? `${what}: gar nicht${mo}${soft}` : `${what}: nie ${daysText(r.days)}${mo}${soft}`;
    case 'dayOff': return `${daysText(r.days)}: gar kein Training${mo}${soft}`;
    case 'maxDay': return `${r.days && r.days.length && r.days.length < 7 ? daysText(r.days) : 'Jeden Tag'}: höchstens ${r.minutes} min${r.sport ? ' ' + sp : ''}${soft}`;
    case 'placeDays': {
      const p = PLACE_NAME[r.place || 'pool'];
      const when = [r.days && r.days.length ? daysText(r.days) : '', r.months && r.months.length ? monthsText(r.months) : ''].filter(Boolean).join(', ');
      return r.placeOnly ? `${p}: nur ${when || 'immer'}${soft}` : `${p}: nicht ${when || 'möglich'}${soft}`.replace(': nicht möglich', ': gar nicht');
    }
    case 'period': return `${dmy(r.from)} bis ${dmy(r.to)}: ${r.level === 'low' ? 'wenig Training' : 'kein Training'}${r.note ? ` (${r.note})` : ''}`;
    case 'body': {
      const f = [r.noIntervals ? 'keine Lauf-Intervalle' : '', r.noDownhill ? 'kein Bergablaufen' : '', r.volume && r.volume < 1 ? `Laufumfang −${Math.round((1 - r.volume) * 100)} %` : '', r.caution ? 'vorsichtiger Plan, bitte ärztlich abklären' : '', r.body === 'back' ? 'Kraft ohne schwere Hebeübungen' : '', r.body === 'shoulder' ? 'weniger Schwimmumfang, Kraft ohne Liegestütz' : ''].filter(Boolean);
      return `${BODY_NAME[r.body || 'injury'] || r.body}: ${f.join(', ') || 'schonender trainieren'}`;
    }
    case 'prefer': return `${what} lieber ${daysText(r.days)}`;
    case 'info': return r.note || r.text || 'gemerkt';
  }
}
export function strengthText(r: Rule): string { return r.strength === 'hard' ? 'muss' : 'möglichst'; }

/* ---------- Einheit gegen Regeln prüfen ---------- */
export interface SessLike { sport: string; title?: string; hard?: boolean; long?: boolean; race?: boolean; fixed?: boolean; spec?: any; plannedMinutes?: number; indoor?: boolean; place?: Place }
export function placeOf(s: SessLike): Place | null {
  if (s.place) return s.place;
  if (s.sport === 'swim') return 'pool';
  if (s.sport === 'bike') return (s.indoor || (s.spec && s.spec.ctx && s.spec.ctx.indoor) || /rolle|indoor|zwift/i.test(s.title || '')) ? 'trainer' : 'outdoor';
  if (s.sport === 'run' && /laufband/i.test(s.title || '')) return 'treadmill';
  return null;
}
const isHardS = (s: SessLike) => !!s.hard || /intervall|schwelle|tempo|sweet|css|\d\s*[×x]\s*\d|test/i.test(s.title || '');
const isLongS = (s: SessLike) => !!s.long || (s.spec && s.spec.kind === 'long') || /^lange|langer|lange ausfahrt/i.test(s.title || '');
function sportMatch(r: Rule, s: SessLike): boolean {
  if (r.sport && r.sport !== s.sport) return false;
  if (!r.sport && !['run', 'bike', 'swim', 'strength'].includes(s.sport)) return false; // Teamsport ist ein fester Termin
  if (r.what === 'long' && !isLongS(s)) return false;
  if (r.what === 'hard' && !isHardS(s)) return false;
  return true;
}
const inMonths = (r: Rule, date: string) => !r.months || !r.months.length || r.months.includes(monthOf(date));
/* Verletzt die Einheit an diesem Datum die Regel? (prefer und maxDay prüfen hier nicht: maxDay ist eine Tagesgrenze) */
export function breaks(r: Rule, s: SessLike, date: string): boolean {
  if (s.race) return false;
  const dow = dowOf(date);
  switch (r.kind) {
    case 'onlyDays': return sportMatch(r, s) && inMonths(r, date) && !(r.days || []).includes(dow);
    case 'neverDays': return sportMatch(r, s) && inMonths(r, date) && (!(r.days || []).length || (r.days || []).includes(dow));
    case 'dayOff': return ['run', 'bike', 'swim', 'strength'].includes(s.sport) && inMonths(r, date) && (r.days || []).includes(dow);
    case 'period': return r.level !== 'low' && ['run', 'bike', 'swim', 'strength'].includes(s.sport) && !!r.from && date >= r.from && date <= (r.to || r.from);
    case 'placeDays': {
      if (placeOf(s) !== r.place) return false;
      const dayHit = !r.days || !r.days.length || r.days.includes(dow);
      const monHit = !r.months || !r.months.length || r.months.includes(monthOf(date));
      return r.placeOnly ? !(dayHit && monHit) : (dayHit && monHit);
    }
    case 'body': return !!r.noIntervals && s.sport === 'run' && isHardS(s) && !/test/i.test(s.title || '');
    case 'maxDay': return !!r.sport && r.sport === s.sport && (s.plannedMinutes || 0) > (r.minutes || 0) + 1 && (!(r.days || []).length || (r.days || []).includes(dow)) && inMonths(r, date);
    default: return false;
  }
}
/* Passt eine Vorliebe? (nur für die Bewertung beim Verteilen) */
export function prefers(r: Rule, s: SessLike, date: string): boolean | null {
  if (r.kind !== 'prefer' || !sportMatch(r, s)) return null;
  return (r.days || []).includes(dowOf(date));
}
export interface Eval { hard: Rule[]; soft: Rule[] }
export function evaluate(rules: Rule[], s: SessLike, date: string): Eval {
  const out: Eval = { hard: [], soft: [] };
  for (const r of rules || []) {
    if (r.kind === 'prefer') { if (prefers(r, s, date) === false) out.soft.push(r); continue; }
    if (breaks(r, s, date)) (r.strength === 'hard' ? out.hard : out.soft).push(r);
  }
  return out;
}
export const allowedHard = (rules: Rule[], s: SessLike, date: string) => !evaluate(rules, s, date).hard.length;

/* Tagesgrenze aus den Regeln (Minuten), Infinity = keine; noHard = an dem Tag nichts Hartes */
export function dayLimit(rules: Rule[], date: string, soft = true): { cap: number; noHard: boolean; why: Rule[] } {
  let cap = Infinity, noHard = false; const why: Rule[] = [];
  const dow = dowOf(date);
  for (const r of rules || []) {
    if (!soft && r.strength === 'soft') continue;
    if (r.kind === 'dayOff' && (r.days || []).includes(dow) && inMonths(r, date)) { cap = 0; why.push(r); }
    if (r.kind === 'period' && r.from && date >= r.from && date <= (r.to || r.from)) { if (r.level === 'low') { cap = Math.min(cap, 40); noHard = true; } else cap = 0; why.push(r); }
    if (r.kind === 'maxDay' && !r.sport && (!(r.days || []).length || (r.days || []).includes(dow)) && inMonths(r, date)) { cap = Math.min(cap, r.minutes || 0); why.push(r); }
  }
  return { cap, noHard, why };
}

/* ---------- Plan gegen harte Regeln prüfen ---------- */
export interface RuleViolation { date: string; sessionId?: string; title: string; rule: Rule; msg: string }
/* Alle Verstöße gegen harte Regeln ab `from` (Einheiten mit bewusster Ausnahme des Nutzers zählen nicht) */
export function hardViolations(weeks: any[], rules: Rule[], from?: string): RuleViolation[] {
  const out: RuleViolation[] = [];
  const hard = (rules || []).filter(r => r.strength === 'hard');
  for (const w of weeks || []) for (const d of w.days || []) {
    if (from && d.date < from) continue;
    const list = (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && !s.removed && !s.race);
    for (const s of list) {
      if (s.ruleOverride || s.fixed && s.sport === 'football') continue;
      for (const r of hard) if (breaks(r, s, d.date)) out.push({ date: d.date, sessionId: s.id, title: s.title, rule: r, msg: `${s.title} am ${DOW_SHORT[dowOf(d.date)]} ${d.date.slice(8)}.${d.date.slice(5, 7)}. bricht „${describe(r)}“` });
    }
    // Tagesgrenzen (eigene Einheiten ohne feste Termine)
    const lim = dayLimit(hard, d.date, false);
    const own = list.filter((s: any) => !s.fixed && !s.ruleOverride).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    if (own > lim.cap + 5 && lim.why.length) out.push({ date: d.date, title: `${own} min`, rule: lim.why[0], msg: `${DOW_SHORT[dowOf(d.date)]} ${d.date.slice(8)}.${d.date.slice(5, 7)}.: ${own} min, Regel „${describe(lim.why[0])}“` });
  }
  return out;
}

/* ---------- Folgen für den Plan (Körper, Ausrüstung, Saison) ---------- */
export interface Effects {
  runEasyOnly?: boolean; runVolume?: number; noDownhill?: boolean;
  noSwim?: boolean; noSwimMonths?: number[];
  bikeIndoor?: boolean; bikeIndoorMonths?: number[]; noTrainerMonths?: number[]; noBike?: boolean;
  strengthBack?: boolean; strengthKnee?: boolean; strengthShoulder?: boolean;
  swimVolume?: number; caution?: boolean; gym?: boolean; treadmill?: boolean;
}
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export function effectsOf(rules: Rule[]): Effects {
  const e: Effects = {};
  for (const r of rules || []) {
    if (r.kind === 'body') {
      if (r.noIntervals) e.runEasyOnly = true;
      if (r.volume) e.runVolume = Math.min(e.runVolume ?? 1, r.volume);
      if (r.noDownhill) e.noDownhill = true;
      if (r.body === 'knee') e.strengthKnee = true;
      if (r.body === 'back') e.strengthBack = true;
      if (r.body === 'shoulder') { e.strengthShoulder = true; e.swimVolume = 0.7; }
      if (r.caution) e.caution = true;
    }
    if (r.kind === 'placeDays' && r.strength === 'hard' && !(r.days || []).length) {
      const months = r.months && r.months.length ? r.months : ALL_MONTHS;
      const notIn = ALL_MONTHS.filter(m => !months.includes(m));
      // „kein Schwimmbad (im Winter)“ bzw. „Schwimmbad nur im Sommer“
      if (r.place === 'pool') { const off = r.placeOnly ? notIn : months; if (off.length === 12) e.noSwim = true; else if (off.length) e.noSwimMonths = [...new Set([...(e.noSwimMonths || []), ...off])]; }
      // „Rad nur drinnen (im Winter)“ = draußen nie
      if (r.place === 'outdoor' && !r.placeOnly) { if (months.length === 12) e.bikeIndoor = true; else e.bikeIndoorMonths = [...new Set([...(e.bikeIndoorMonths || []), ...months])]; }
      if (r.place === 'trainer' && r.placeOnly) e.noTrainerMonths = notIn;
      if (r.place === 'trainer' && !r.placeOnly) e.noTrainerMonths = [...new Set([...(e.noTrainerMonths || []), ...months])];
    }
    if (r.kind === 'neverDays' && r.strength === 'hard' && r.sport === 'bike' && !(r.days || []).length && !(r.months || []).length) e.noBike = true;
    if (r.kind === 'neverDays' && r.strength === 'hard' && r.sport === 'swim' && !(r.days || []).length) { if ((r.months || []).length) e.noSwimMonths = [...new Set([...(e.noSwimMonths || []), ...r.months!])]; else e.noSwim = true; }
    if (r.kind === 'info' && r.place === 'gym') e.gym = true;
    if (r.kind === 'info' && r.place === 'treadmill') e.treadmill = true;
  }
  return e;
}

/* ---------- Wochenraster (Sportart × Wochentag) ---------- */
export type Cell = 'yes' | 'soft' | 'no';
export const GRID_SPORTS: RuleSport[] = ['swim', 'bike', 'run', 'strength'];
export const GRID_DAYS = [1, 2, 3, 4, 5, 6, 0];
/* Zustand eines Feldes aus den Regeln (ohne Monats- und Zeitraum-Regeln) und der Zeit pro Tag */
export function cellOf(rules: Rule[], sport: RuleSport, dow: number, dayLoad?: Record<number, number>): { state: Cell; by: Rule[]; noTime: boolean } {
  const noTime = !!dayLoad && Object.keys(dayLoad).length > 0 && !((dayLoad as any)[dow] > 0);
  const probe: SessLike = { sport, place: sport === 'swim' ? 'pool' : undefined };
  const date = dateForDow(dow);
  const by = (rules || []).filter(r => !(r.months && r.months.length) && r.kind !== 'period' && r.kind !== 'prefer' && r.kind !== 'body' && !r.what && (r.kind !== 'placeDays' || r.place === 'pool') && breaks(r, probe, date));
  const state: Cell = noTime || by.some(r => r.strength === 'hard') ? 'no' : by.length ? 'soft' : 'yes';
  return { state, by, noTime };
}
function dateForDow(dow: number): string { const base = new Date(Date.UTC(2026, 0, 4)); base.setUTCDate(base.getUTCDate() + dow); return base.toISOString().slice(0, 10); } // 4.1.2026 ist ein Sonntag
let seq = 0;
export const ruleId = (p = 'r') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
/* Feld setzen: bestehende Regeln so ändern, dass das Feld den gewünschten Zustand hat */
export function setCell(rules: Rule[], sport: RuleSport, dow: number, state: Cell): Rule[] {
  let out = (rules || []).map(r => ({ ...r, days: r.days ? [...r.days] : r.days }));
  const date = dateForDow(dow);
  const probe: SessLike = { sport, place: sport === 'swim' ? 'pool' : undefined };
  const affects = (r: Rule) => !(r.months && r.months.length) && !r.what && r.kind !== 'period' && r.kind !== 'prefer' && r.kind !== 'body' && (r.kind !== 'placeDays' || r.place === 'pool') && breaks(r, probe, date);
  // 1) alles entfernen, was das Feld heute sperrt
  out = out.flatMap(r => {
    if (!affects(r)) return [r];
    if (r.kind === 'onlyDays' || (r.kind === 'placeDays' && r.placeOnly)) {
      // nur Tage → für andere Sportarten gilt die Regel weiter
      if (!r.sport && r.kind === 'onlyDays') return [...GRID_SPORTS.filter(s => s !== sport).map(s => ({ ...r, id: ruleId('g'), sport: s })), { ...r, id: ruleId('g'), sport, days: [...new Set([...(r.days || []), dow])] }];
      return [{ ...r, days: [...new Set([...(r.days || []), dow])] }];
    }
    if (r.kind === 'neverDays' || r.kind === 'dayOff' || (r.kind === 'placeDays' && !r.placeOnly)) {
      const all = !(r.days || []).length ? [0, 1, 2, 3, 4, 5, 6] : r.days!;
      const rest = all.filter(d => d !== dow);
      if (r.kind === 'dayOff') {
        // Tag frei: für die anderen Sportarten bleibt der Tag gesperrt
        const keep = rest.length ? [{ ...r, days: rest }] : [];
        return [...keep, ...GRID_SPORTS.filter(s => s !== sport).map(s => ({ id: ruleId('g'), kind: 'neverDays' as const, strength: r.strength, sport: s, days: [dow], source: r.source, text: r.text }))];
      }
      if (!r.sport && r.kind === 'neverDays') return [...(rest.length ? [{ ...r, days: rest }] : []), ...GRID_SPORTS.filter(s => s !== sport).map(s => ({ ...r, id: ruleId('g'), sport: s, days: [dow] }))];
      return rest.length ? [{ ...r, days: rest }] : [];
    }
    return [r];
  });
  // 2) gewünschten Zustand ergänzen
  if (state !== 'yes') {
    const ex = out.find(r => r.source === 'grid' && r.kind === 'neverDays' && r.sport === sport && r.strength === (state === 'no' ? 'hard' : 'soft') && !(r.months || []).length);
    if (ex) ex.days = [...new Set([...(ex.days || []), dow])];
    else out.push({ id: ruleId('g'), kind: 'neverDays', strength: state === 'no' ? 'hard' : 'soft', sport, days: [dow], source: 'grid', createdAt: Date.now() });
  }
  return out.filter(r => !(r.kind === 'neverDays' && r.days && !r.days.length && r.source === 'grid'));
}

/* ---------- Alle Regeln einer Person ---------- */
/* Gespeicherte Regeln plus Regeln aus Notizen, die (noch) nicht als Regel gespeichert sind (z. B. alte Berücksichtigungen) */
export function rulesOf(p: Partial<Profile> | null | undefined, parse?: (text: string) => Rule[]): Rule[] {
  if (!p) return [];
  const stored: Rule[] = Array.isArray((p as any).rules) ? (p as any).rules.filter((r: any) => r && r.kind) : [];
  if (!parse) return stored;
  const covered = new Set(stored.map(r => (r.text || '').trim().toLowerCase()).filter(Boolean));
  const extra: Rule[] = [];
  const texts = [...(p.notes || []), ...(p.injuries ? [p.injuries] : [])];
  texts.forEach((t, i) => { const k = String(t || '').trim().toLowerCase(); if (!k || covered.has(k)) return; parse(String(t)).forEach((r, j) => extra.push({ ...r, id: `note-${i}-${j}`, source: 'note', text: String(t) })); });
  return [...stored, ...extra];
}
/* Wie viele Tage pro Woche erlaubt die Regel-Lage für eine Sportart (hart, mit Zeit an dem Tag)? */
export function allowedDays(rules: Rule[], sport: RuleSport, dayHasTime: (dow: number) => boolean, date?: string): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter(d => {
    if (!dayHasTime(d)) return false;
    const dt = date ? shiftToDow(date, d) : dateForDow(d);
    return allowedHard(rules, { sport, place: sport === 'swim' ? 'pool' : undefined }, dt) && dayLimit(rules.filter(r => r.strength === 'hard'), dt, false).cap > 0;
  });
}
function shiftToDow(date: string, dow: number): string { const d = new Date(date + 'T12:00:00Z'); const cur = d.getUTCDay(); const mon = (cur + 6) % 7; d.setUTCDate(d.getUTCDate() - mon + ((dow + 6) % 7)); return d.toISOString().slice(0, 10); }
