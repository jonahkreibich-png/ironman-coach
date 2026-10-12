/* Freitext → Regeln (Auftrag 5 A3). Versteht deutsche Sätze mit Wochentagen („mittwochs“, „am Wochenende“, „unter der Woche“,
   „Mo-Fr“), Sportarten mit Synonymen (joggen = Laufen, Radfahren = Rad, Kraul = Schwimmen …), Verneinungen („nicht“, „kein“, „nie“),
   „nur“, Höchstdauern („höchstens 60 min“), Zeiträumen („vom 20.12. bis 6.1.“), Jahreszeiten, Orten und Körperteilen.
   Tippfehler und Umgangssprache („ned“, „mitwochs“) werden toleriert.
   Beispiel: „kann mittwochs nicht laufen, nur Samstag oder Sonntag“ → Laufen nie Mi (hart) + Laufen nur Sa/So (hart).
   Was nicht verstanden wird, wird nicht ignoriert: das Ergebnis enthält dann eine gezielte Rückfrage (ask). */
import { type Rule, type RuleSport, type Place, WINTER, ruleId } from './constraints';

export interface AskOption { label: string; value: string }
export interface Ask { kind: 'days' | 'what' | 'period' | 'unknown'; text: string; partial?: Partial<Rule>; options?: AskOption[] }
export interface ParseResult { rules: Rule[]; understood: boolean; ask?: Ask }

/* ---------- Text vorbereiten ---------- */
export function fold(s: string): string {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}
function lev(a: string, b: string): number {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/* exakt, Wortanfang (ab 4 Zeichen) oder 1-2 Tippfehler bei langen Wörtern */
function hit(tok: string, key: string, prefix = true): boolean {
  if (tok === key) return true;
  if (prefix && key.length >= 4 && tok.startsWith(key)) return true;
  if (key.length >= 6 && tok.length >= 5 && lev(tok, key) <= 1) return true;
  if (key.length >= 9 && Math.abs(tok.length - key.length) <= 1 && lev(tok, key) <= 2) return true;
  return false;
}
const any = (tok: string, keys: string[], prefix = true) => keys.some(k => hit(tok, k, prefix));

/* ---------- Wörter ---------- */
const DAY_FULL: [string[], number][] = [
  [['montag', 'montags'], 1], [['dienstag', 'dienstags'], 2], [['mittwoch', 'mittwochs'], 3], [['donnerstag', 'donnerstags'], 4],
  [['freitag', 'freitags'], 5], [['samstag', 'samstags', 'sonnabend', 'sonnabends'], 6], [['sonntag', 'sonntags'], 0]];
const DAY_SHORT: Record<string, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0, mon: 1, die: -1, mit: -1, don: 4, sam: 6, son: -1 };
const DAY_CTX = new Set(['und', 'oder', 'bis', 'nur', 'am', 'an', 'jeden', 'jede', 'immer', 'ausser', '/', '-', ',', 'u', 'od', 'auch', 'sowie', 'nicht', 'kein', 'keine', 'nie', 'lieber']);
const DAY_CTX_STRONG = new Set(['nur', 'am', 'an', 'jeden', 'jede', 'immer', 'bis', '-', '/', 'ausser', 'lieber', 'nicht', 'kein', 'keine', 'nie', 'ausgenommen']);
const NOT_DAY = new Set(['feiertag', 'feiertags', 'feiertage', 'freitagabend']);
const SPORTS: [RuleSport, string[], boolean][] = [
  ['run', ['lauf', 'laeuf', 'jogg', 'dauerlauf', 'run', 'running', 'lauftreff', 'laufrunde', 'rennen gehen'], true],
  ['bike', ['rad', 'rads', 'radl', 'radel', 'radeln', 'radfahr', 'radtour', 'radtrain', 'radrunde', 'radeinheit', 'radausfahrt', 'fahrrad', 'rennrad', 'gravel', 'mtb', 'mountainbike', 'bike', 'biken', 'ausfahrt', 'radfahren', 'velo'], true],
  ['swim', ['schwimm', 'schwimen', 'kraul', 'bahnen', 'brustschwimm'], true],
  ['strength', ['kraft', 'krafttraining', 'stabi', 'hantel', 'gewichte', 'athletik'], true]];
const PLACES: [Place, string[], RuleSport | null][] = [
  ['pool', ['schwimmbad', 'hallenbad', 'freibad', 'bad', 'pool', 'schwimmhalle'], 'swim'],
  ['trainer', ['rolle', 'rollen', 'rollentrainer', 'smarttrainer', 'trainer', 'indoor', 'zwift', 'drinnen', 'spinning', 'ergometer', 'heimtrainer', 'indoorbike'], 'bike'],
  ['outdoor', ['draussen', 'outdoor', 'strasse', 'freien'], null],
  ['gym', ['fitnessstudio', 'studio', 'gym', 'kraftraum', 'muckibude'], 'strength'],
  ['treadmill', ['laufband'], 'run'],
  ['track', ['laufbahn', 'tartanbahn', 'sportplatz'], 'run']];
const NEG = ['nicht', 'nich', 'ned', 'net', 'nit', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keins', 'nie', 'niemals', 'ohne', 'unmoeglich', 'verhindert', 'nix', 'nichts', 'garnicht', 'garnichts', 'keinesfalls'];
const ONLY = ['nur', 'nurr', 'blos', 'bloss', 'ausschliesslich', 'lediglich', 'ausschlieslich'];
const SOFT = ['lieber', 'liebsten', 'eher', 'moeglichst', 'moeglich', 'bevorzugt', 'bevorzuge', 'gerne', 'gern', 'ideal', 'idealerweise', 'vorzugsweise', 'wenns', 'tendenziell', 'meistens'];
const SOFT_NEG = ['schlecht', 'unguenstig', 'doof', 'bloed', 'schwierig', 'ungern', 'selten', 'stressig', 'knapp', 'mies'];
const ANYW = ['training', 'trainieren', 'trainiere', 'trainier', 'sport', 'nichts', 'garnichts', 'nix', 'frei', 'ruhetag', 'pause', 'sporteln'];
const LONG = ['lang', 'lange', 'langen', 'langer', 'langes', 'long', 'longrun', 'langstrecke'];
const HARD = ['intervall', 'intervalle', 'intervallen', 'hart', 'harte', 'harten', 'hartes', 'tempo', 'tempolauf', 'schnell', 'schnelle', 'schnellen', 'sprints', 'vollgas', 'intensiv', 'intensive', 'intensitaet'];
const DOWNHILL = ['bergab', 'bergablaufen', 'bergabs', 'abwaerts', 'downhill'];
const EXCEPT = ['ausser', 'ausgenommen'];
const REASON = ['weil', 'denn', 'wegen', 'da'];
const PERIOD_NONE = ['urlaub', 'reise', 'reisen', 'verreist', 'weg', 'ferien', 'skiurlaub', 'kur', 'krankenhaus', 'op', 'operation', 'auslandsreise', 'dienstreise', 'geschaeftsreise', 'pause'];
const PERIOD_LOW = ['pruefung', 'pruefungen', 'klausur', 'klausuren', 'examen', 'lernen', 'lernphase', 'abi', 'abitur', 'stress', 'wenig', 'weniger', 'kaum', 'projekt', 'umzug'];
const BODY: [string, string[]][] = [
  ['knee', ['knie', 'patella', 'meniskus', 'kreuzband']], ['achilles', ['achilles', 'achillessehne', 'ferse']], ['shin', ['schienbein', 'shin']],
  ['hip', ['huefte', 'hueft', 'hueftbeuger']], ['back', ['ruecken', 'bandscheib', 'lws', 'ischias', 'kreuzschmerz', 'hexenschuss']], ['shoulder', ['schulter']],
  ['foot', ['fuss', 'fuesse', 'plantar', 'sprunggelenk', 'knoechel', 'zehe']], ['groin', ['leiste', 'adduktor']], ['calf', ['wade', 'waden']],
  ['thigh', ['oberschenkel', 'hamstring', 'oberschenkels']], ['neck', ['nacken']], ['heart', ['herz', 'blutdruck', 'rhythmus', 'stent', 'herzrhythmus']], ['asthma', ['asthma']]];
const PAIN = ['schmerz', 'schmerzen', 'weh', 'zwickt', 'zwicken', 'verletz', 'zerr', 'entzuend', 'beschwerden', 'operiert', 'reizung', 'gereizt'];
const BODY_EFFECT: Record<string, Partial<Rule>> = {
  knee: { noIntervals: true, volume: 0.8 }, achilles: { noIntervals: true, volume: 0.8 }, shin: { noIntervals: true, volume: 0.7 }, hip: { noIntervals: true },
  back: {}, shoulder: {}, foot: { noIntervals: true, volume: 0.8 }, groin: { noIntervals: true }, calf: { noIntervals: true, volume: 0.8 }, thigh: { noIntervals: true },
  neck: {}, injury: { noIntervals: true }, heart: { caution: true }, asthma: { caution: true }
};
const MONTHS: [string[], number][] = [[['januar', 'jan', 'jaenner'], 1], [['februar', 'feb'], 2], [['maerz', 'mrz'], 3], [['april', 'apr'], 4], [['mai'], 5], [['juni', 'jun'], 6],
  [['juli', 'jul'], 7], [['august', 'aug'], 8], [['september', 'sep', 'sept'], 9], [['oktober', 'okt'], 10], [['november', 'nov'], 11], [['dezember', 'dez'], 12]];
const SEASONS: [string[], number[]][] = [[['winter', 'wintermonate', 'winterhalbjahr'], WINTER], [['sommer', 'sommermonate'], [6, 7, 8]], [['fruehling', 'fruehjahr'], [3, 4, 5]], [['herbst'], [9, 10, 11]]];
const monthIdx = (tok: string) => { for (const [w, m] of MONTHS) if (w.includes(tok) || (tok.length >= 5 && w.some(x => x.length >= 5 && lev(tok, x) <= 1))) return m; return 0; };

/* ---------- Datum ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
function mkDate(d: number, m: number, y: number | null, today: string, ref?: string): string | null {
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  let yy = y != null ? (y < 100 ? 2000 + y : y) : +today.slice(0, 4);
  let s = `${yy}-${pad(m)}-${pad(d)}`;
  if (y == null) {
    const base = ref || today;
    // Zeitraum in der Vergangenheit (mehr als 2 Wochen) → nächstes Jahr
    const back = new Date(base + 'T12:00:00Z'); back.setUTCDate(back.getUTCDate() - (ref ? 0 : 14));
    if (s < back.toISOString().slice(0, 10)) { yy++; s = `${yy}-${pad(m)}-${pad(d)}`; }
  }
  return s;
}
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function addD(s: string, n: number) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(s: string) { const d = new Date(s + 'T12:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return addD(s, -w); }
const NUMW: Record<string, number> = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, zehn: 10, zwoelf: 12, vierzehn: 14 };

interface PeriodHit { from: string; to: string; idx: number }
/* Zeiträume aus dem Text holen (und dort durch „ZEITRAUM“ ersetzen, damit Zahlen nicht als Minuten gelten) */
function takePeriods(t: string, today: string): { text: string; periods: PeriodHit[] } {
  const periods: PeriodHit[] = [];
  const mnames = MONTHS.flatMap(([w]) => w).sort((a, b) => b.length - a.length).join('|');
  const D = String.raw`(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}|\d{2}(?!\d)))?`;
  const rules: [RegExp, (m: RegExpExecArray) => [string | null, string | null]][] = [
    // 20.12. bis 6.1.(2027)
    [new RegExp(String.raw`(?:vom|von|ab|zwischen)?\s*${D}\s*(?:bis(?:\s+zum|\s+einschliesslich)?|-|–|und)\s*(?:zum\s*)?${D}`, 'g'),
      m => { const f = mkDate(+m[1], +m[2], m[3] ? +m[3] : null, today); const to = f ? mkDate(+m[4], +m[5], m[6] ? +m[6] : null, today, f) : null; return [f, to]; }],
    // 3. bis 10. März / 1.-14. August
    [new RegExp(String.raw`(?:vom|von)?\s*(\d{1,2})\.?\s*(?:bis|-|–)\s*(\d{1,2})\.?\s*(${mnames})\b(?:\s*(\d{4}))?`, 'g'),
      m => { const mo = monthIdx(m[3]); const f = mkDate(+m[1], mo, m[4] ? +m[4] : null, today); return [f, f ? mkDate(+m[2], mo, m[4] ? +m[4] : null, today, f) : null]; }],
    // 1.-14.8.
    [new RegExp(String.raw`(\d{1,2})\.\s*(?:-|–|bis)\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?`, 'g'),
      m => { const f = mkDate(+m[1], +m[3], m[4] ? +m[4] : null, today); return [f, f ? mkDate(+m[2], +m[3], m[4] ? +m[4] : null, today, f) : null]; }],
    // ab 5.11. für 2 Wochen / ab dem 5.11. zwei Wochen
    [new RegExp(String.raw`ab\s*(?:dem\s*)?${D}\s*(?:fuer\s*)?(\d+|ein|eine|zwei|drei|vier)\s*(woche|wochen|tag|tage)`, 'g'),
      m => { const f = mkDate(+m[1], +m[2], m[3] ? +m[3] : null, today); const n = /^\d+$/.test(m[4]) ? +m[4] : NUMW[m[4]] || 1; return [f, f ? addD(f, (/woche/.test(m[5]) ? 7 * n : n) - 1) : null]; }],
    // die nächsten 2 Wochen / für 10 Tage
    [/(?:die\s+naechsten|fuer|in\s+den\s+naechsten)\s*(\d+|ein|eine|zwei|drei|vier|fuenf|sechs|sieben|acht|zehn|vierzehn)\s*(woche|wochen|tag|tage|tagen)/g,
      m => { const n = /^\d+$/.test(m[1]) ? +m[1] : NUMW[m[1]] || 1; return [today, addD(today, (/woche/.test(m[2]) ? 7 * n : n) - 1)]; }],
    // nächste / übernächste / diese Woche
    [/(uebernaechste|naechste|diese|kommende)\s+woche/g, m => { const mon = mondayOf(today); const off = m[1] === 'uebernaechste' ? 14 : m[1] === 'diese' ? 0 : 7; const f = m[1] === 'diese' ? today : addD(mon, off); return [f, addD(mon, off + 6)]; }],
    // im August (nur zusammen mit Urlaub & Co., sonst ist es eine Jahreszeit-Regel)
    [new RegExp(String.raw`(?:im|in|den\s+ganzen|im\s+ganzen)\s+(${mnames})\b(?:\s*(\d{4}))?`, 'g'),
      m => { if (!PERIOD_NONE.concat(PERIOD_LOW).some(w => new RegExp('\\b' + w).test(t))) return [null, null]; const mo = monthIdx(m[1]); const f = mkDate(1, mo, m[2] ? +m[2] : null, today); return [f, f ? `${f.slice(0, 8)}${pad(lastDay(+f.slice(0, 4), mo))}` : null]; }],
    // am 24.12. (ein Tag)
    [new RegExp(String.raw`(?:am|den)\s*${D}`, 'g'), m => { const f = mkDate(+m[1], +m[2], m[3] ? +m[3] : null, today); return [f, f]; }]
  ];
  let text = t;
  for (const [re, fn] of rules) {
    text = text.replace(re, (...args) => {
      const m = args.slice(0, -2) as any as RegExpExecArray; const idx = args[args.length - 2] as number;
      const [f, to] = fn(m);
      if (!f || !to || to < f) return args[0];
      periods.push({ from: f, to, idx });
      return ' zeitraum ';
    });
  }
  return { text, periods };
}
/* Höchstdauer: „höchstens 60 min“, „max. 1,5 h“, „nicht mehr als eine Stunde“, „nur 30 Minuten“ */
function takeMinutes(t: string): { text: string; minutes: number | null } {
  let minutes: number | null = null;
  const val = (n: string, unit: string) => {
    const x = n === 'eine' || n === 'einer' || n === 'ein' ? 1 : n === 'halbe' || n === '1/2' ? 0.5 : n === 'anderthalb' || n === 'eineinhalb' ? 1.5 : n === 'zwei' ? 2 : n === 'drei' ? 3 : +n.replace(',', '.');
    return Math.round(/^(min|minuten|minute)$/.test(unit) ? x : x * 60);
  };
  const U = '(minuten|minute|min|stunden|stunde|std|h)\\b';
  const N = '(\\d+(?:[.,]\\d+)?|eine|einer|ein|halbe|anderthalb|eineinhalb|zwei|drei|1/2)';
  const re1 = new RegExp(`(?:hoechstens|hoechsten|maximal|max\\.?|nicht\\s+(?:mehr|laenger)\\s+als|bis\\s+zu|nur|knapp|so\\s+um\\s+die|weniger\\s+als|unter)\\s*(?:eine?n?\\s+|ne\\s+)?${N}\\s*(?:eine?\\s+)?${U}`, 'g');
  const re2 = new RegExp(`${N}\\s*${U}\\s*(?:max(?:imal)?|hoechstens|am\\s+stueck\\s+max)`, 'g');
  let text = t.replace(re1, (_a, n, u) => { minutes = val(n, u); return ' dauergrenze '; });
  text = text.replace(re2, (_a, n, u) => { minutes = val(n, u); return ' dauergrenze '; });
  // „eine halbe Stunde“ (ohne „max“) in Sätzen mit „Zeit“: „hab mittwochs nur eine halbe stunde zeit“ ist oben schon abgedeckt
  return { text, minutes };
}

/* ---------- Wörter erkennen ---------- */
interface Tok { w: string; i: number }
function tokens(t: string): Tok[] {
  const out: Tok[] = []; const re = /[a-z0-9]+|[,;.!?/\-–:]/g; let m; let i = 0;
  while ((m = re.exec(t))) out.push({ w: m[0] === '–' ? '-' : m[0], i: i++ });
  return out;
}
function dayOf(toks: Tok[], k: number): number | null {
  // Mundart: samstachs, sonntachs
  const w = toks[k].w.replace(/achs$/, 'ags').replace(/ach$/, (m) => (toks[k].w.length > 5 ? 'ag' : m));
  if (NOT_DAY.has(w)) return null;
  for (const [ws, d] of DAY_FULL) if (ws.some(x => w === x || (w.length >= 5 && lev(w, x) <= (x.length >= 9 ? 2 : 1)))) return d;
  // „montagabend“, „dienstagmorgens“
  for (const [ws, d] of DAY_FULL) if (w.length > ws[0].length + 3 && w.startsWith(ws[0]) && /(abend|morgen|mittag|nachmittag|vormittag|frueh|nacht)s?$/.test(w)) return d;
  const s = DAY_SHORT[w];
  if (s == null || s < 0) return null;
  if (w === 'so' || w === 'do') {
    const at = (i: number) => (toks[i] ? toks[i].w : '');
    const isDay = (x: string) => (DAY_SHORT[x] != null && DAY_SHORT[x] >= 0 && x !== 'so' && x !== 'do') || DAY_FULL.some(([ws]) => ws.includes(x)) || x === 'wochenende';
    const prev = at(k - 1), next = at(k + 1);
    const ok = DAY_CTX_STRONG.has(prev) || isDay(next) || isDay(prev) || (['und', 'oder', ',', 'u', 'od', 'sowie'].includes(prev) && isDay(at(k - 2)));
    if (!ok) return null;
    if (w === 'so' && /^(gut|viel|lange|oft|frueh|spaet|wie|dass|weit|schnell)$/.test(next)) return null;
  }
  return s;
}
const phrase = (t: string, p: string) => new RegExp('(^|\\s)' + p + '($|\\s)').test(t);

interface Frame {
  days: number[] | null; except: number[] | null; sports: Set<RuleSport>; places: Place[]; neg: boolean; only: boolean; soft: boolean; softNeg: boolean;
  any: boolean; long: boolean; hard: boolean; months: number[] | null; minutes: number | null; downhill: boolean; period: PeriodHit | null; text: string; onlyBefore: 'months' | 'place' | null;
  canNot: boolean; daySportOnly: boolean; reason: boolean; morning: boolean; evening: boolean; periodWord: 'none' | 'low' | null; noIntervalsWord: boolean;
}
function frameOf(toks: Tok[], raw: string): Frame {
  const f: Frame = { days: null, except: null, sports: new Set(), places: [], neg: false, only: false, soft: false, softNeg: false, any: false, long: false, hard: false, months: null, minutes: null, downhill: false, period: null, text: raw, onlyBefore: null, canNot: false, daySportOnly: false, reason: false, morning: false, evening: false, periodWord: null, noIntervalsWord: false };
  const j = toks.map(x => x.w).join(' ');
  let inExcept = false; const days: number[] = []; const exc: number[] = [];
  let onlyAt = -1, monthAt = -1, placeAt = -1, dayAt = -1, sportAt = -1;
  for (let k = 0; k < toks.length; k++) {
    const w = toks[k].w;
    if (any(w, EXCEPT, false) || (w === 'bis' && toks[k + 1] && toks[k + 1].w === 'auf')) { inExcept = true; continue; }
    // Spannen: Mo-Fr, Montag bis Freitag
    const d = dayOf(toks, k);
    if (d != null) {
      const sep = toks[k + 1] && (toks[k + 1].w === '-' || toks[k + 1].w === 'bis') ? k + 1 : -1;
      const d2 = sep > 0 && toks[sep + 1] ? dayOf(toks, sep + 1) : null;
      const list = d2 != null ? spanDays(d, d2) : [d];
      (inExcept ? exc : days).push(...list);
      if (dayAt < 0) dayAt = k;
      if (d2 != null) k = sep + 1;
      continue;
    }
    if (w === 'wochenende' || w === 'wochenendes' || w === 'weekend' || w === 'wochenenden' || (w === 'we' && /\b(am|nur|übers|ueber das|das)\s+we\b/.test(j)) || hit(w, 'wochenende', false)) { (inExcept ? exc : days).push(6, 0); continue; }
    if (any(w, ['werktags', 'wochentags', 'werktage', 'wochentage', 'arbeitstage', 'arbeitstagen'], false)) { (inExcept ? exc : days).push(1, 2, 3, 4, 5); continue; }
    if (any(w, ['taeglich', 'jeden'], false) && (w === 'taeglich' || (toks[k + 1] && toks[k + 1].w === 'tag'))) { days.push(0, 1, 2, 3, 4, 5, 6); continue; }
    const mi = monthIdx(w);
    if (mi && w.length >= 3 && !(w === 'mai' && false)) { f.months = [...new Set([...(f.months || []), mi])]; if (monthAt < 0) monthAt = k; continue; }
    const se = SEASONS.find(([ws]) => any(w, ws, false));
    if (se) { f.months = [...new Set([...(f.months || []), ...se[1]])]; if (monthAt < 0) monthAt = k; continue; }
    if (any(w, NEG, false) || /^nich/.test(w) || /^kein/.test(w)) { f.neg = true; if (w === 'nichts' || w === 'nix' || w === 'garnichts') f.any = true; }
    if (any(w, ONLY, false)) { f.only = true; if (onlyAt < 0) onlyAt = k; }
    if (any(w, SOFT, false)) f.soft = true;
    if (any(w, SOFT_NEG, false)) { f.softNeg = true; f.soft = true; }
    if (any(w, ANYW, false)) f.any = true;
    if (LONG.includes(w)) f.long = true;
    if (['kurz', 'kurze', 'kurzes', 'kuerzer', 'kurzen'].includes(w) && f.minutes == null) f.minutes = 45;
    if (any(w, HARD) && !/^schnellst/.test(w)) f.hard = true;
    if (/^intervall/.test(w)) f.noIntervalsWord = true;
    if (any(w, DOWNHILL)) { f.downhill = true; f.sports.add('run'); }
    if (/^(morgens|frueh|vormittags|morgen)$/.test(w) && !/guten morgen/.test(j)) f.morning = true;
    if (/^(abends|abend|nachmittags|feierabend)$/.test(w)) f.evening = true;
    if (REASON.includes(w) && k > 0) { /* Rest ist Begründung */ f.reason = true; break; }
    if (any(w, PERIOD_NONE, false) && w !== 'weg' || (w === 'weg' && /\b(bin|sind|weg vom|unterwegs)\b/.test(j))) f.periodWord = f.periodWord || 'none';
    if (any(w, PERIOD_LOW, false)) f.periodWord = 'low';
    let placeHit = false;
    for (const [pl, ws, sp] of PLACES) if (any(w, ws, pl !== 'trainer' && pl !== 'outdoor') && !(pl === 'pool' && w !== 'bad' && /^bad/.test(w) && w !== 'bads')) { if (!f.places.includes(pl)) f.places.push(pl); if (sp) f.sports.add(sp); placeHit = true; if (placeAt < 0) placeAt = k; }
    if (pl0(w)) continue;
    for (const [sp, ws] of SPORTS) if (any(w, ws) && !(sp === 'run' && placeHit && f.places.some(p => p === 'treadmill' || p === 'track'))) { if (!(sp === 'run' && /^laufend/.test(w))) { f.sports.add(sp); if (sportAt < 0) sportAt = k; } }
    if (w === 'kann' || w === 'koennen' || w === 'kannst') f.canNot = true;
  }
  if (phrase(j, 'unter der woche') || phrase(j, 'unter woche') || phrase(j, 'unter der wochen')) days.push(1, 2, 3, 4, 5);
  if (phrase(j, 'keine zeit') || phrase(j, 'kein training') || phrase(j, 'gar nicht') || phrase(j, 'geht nicht') || phrase(j, 'gar nichts')) { f.neg = true; if (!f.sports.size) f.any = true; }
  if (phrase(j, 'am liebsten') || phrase(j, 'wenn moeglich') || phrase(j, 'wenns geht') || phrase(j, 'wenn es geht')) f.soft = true;
  if (phrase(j, 'auf keinen fall')) f.neg = true;
  f.days = days.length ? [...new Set(days)] : null;
  f.except = exc.length ? [...new Set(exc)] : null;
  f.daySportOnly = onlyAt >= 0 && dayAt >= 0 && dayAt < onlyAt && sportAt > onlyAt;
  if (onlyAt >= 0) f.onlyBefore = monthAt > onlyAt && (placeAt < 0 || monthAt < placeAt || placeAt < onlyAt) ? 'months' : placeAt > onlyAt ? 'place' : null;
  return f;
}
function pl0(w: string) { return w === 'zeitraum' || w === 'dauergrenze'; }
function spanDays(a: number, b: number): number[] { const ia = (a + 6) % 7, ib = (b + 6) % 7; const out: number[] = []; for (let i = ia; ; i = (i + 1) % 7) { out.push((i + 1) % 7); if (i === ib || out.length > 7) break; } return out; }
const ALL7 = [0, 1, 2, 3, 4, 5, 6];

/* ---------- Hauptfunktion ---------- */
export function parseRules(input: string, today: string): ParseResult {
  const raw = String(input || '').trim().slice(0, 400);
  if (!raw || /^(keine?|nein|nichts|-|–)\.?$/i.test(raw)) return { rules: [], understood: true };
  let t = fold(raw).replace(/\bz\.\s*b\./g, ' ').replace(/\bu\.\s*a\./g, ' ');
  // Kommas in Tageslisten („Di, Mi und So“) trennen keine Teilsätze
  const DW = '(?:mo|di|mi|do|fr|sa|so|montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?|sonnabends?)';
  for (let k = 0; k < 3; k++) t = t.replace(new RegExp(`\\b(${DW})\\s*,\\s*(?=${DW}\\b)`, 'g'), '$1 und ');
  const P = takePeriods(t, today); t = P.text;
  const M = takeMinutes(t); t = M.text;
  // Sätze und Teilsätze
  const clauses: string[] = [];
  t.split(/[,;.!?\n]+|\s(?:aber|sondern|dafuer|ausserdem|jedoch|allerdings|und\s+auch|plus)\s/).forEach(c => {
    // „mittwochs nicht laufen nur samstag“: vor „nur“ teilen, wenn vorher schon eine Verneinung steht
    const m = /^(.*\b(?:nicht|nich|ned|net|kein\w*|nie|niemals)\b.*?)\s(nur\s.*)$/.exec(c.trim());
    if (m) clauses.push(m[1], m[2]); else clauses.push(c);
  });
  const frames = clauses.map(c => c.trim()).filter(Boolean).map(c => frameOf(tokens(c), c));
  if (M.minutes != null) { const fi = frames.findIndex(f => /dauergrenze/.test(f.text)); (frames[fi >= 0 ? fi : 0] || frames[0]).minutes = M.minutes; }
  P.periods.forEach(p => { const fi = frames.findIndex(f => /zeitraum/.test(f.text) && !f.period); if (fi >= 0) frames[fi].period = p; else if (frames[0]) frames[0].period = p; });

  const rules: Rule[] = [];
  const now = Date.now();
  const push = (r: Partial<Rule>) => rules.push({ id: ruleId('t'), strength: 'hard', source: 'text', text: raw, createdAt: now, ...r } as Rule);
  // Körper: für die ganze Notiz
  const ft = fold(raw);
  const btoks = tokens(ft).filter(x => !/^(fussball|fussweg|herzlich|zufuss)/.test(x.w));
  const body = BODY.find(([, ws]) => btoks.some(x => any(x.w, ws)))?.[0] || (btoks.some(x => any(x.w, PAIN)) ? 'injury' : null);
  let bodyRule: Partial<Rule> | null = body ? { kind: 'body', body, ...BODY_EFFECT[body] } : null;
  let lastSports: Set<RuleSport> = new Set(); let lastPlaces: Place[] = [];
  let anyPeriodWord: 'none' | 'low' | null = null;
  let ask: Ask | undefined;
  if (/\b(fussball|handball|basketball|volleyball|hockey|eishockey|rugby|mannschaft|verein)/.test(fold(raw)) && !frames.some(f => f.sports.size || f.places.length)) {
    push({ kind: 'info', note: 'Teamsport: trag ihn im Fragebogen unter „Teamsport“ mit seinen Tagen ein, dann plane ich ihn als festen Termin ein', strength: 'soft' });
    return { rules: dedupe(rules), understood: true };
  }
  for (const f of frames) {
    if (f.periodWord) anyPeriodWord = f.periodWord === 'low' || anyPeriodWord === 'low' ? 'low' : 'none';
    // Zeitraum
    if (f.period) {
      const lvl = f.periodWord === 'low' || (f.minutes != null) || /\b(wenig|weniger|kaum|nur kurz|kurz)\b/.test(f.text) ? 'low' : 'none';
      const note = /urlaub|ferien/.test(f.text) ? 'Urlaub' : /pruef|klausur|examen|abi/.test(f.text) ? 'Prüfungen' : /reise|verreist/.test(f.text) ? 'Reise' : undefined;
      push({ kind: 'period', from: f.period.from, to: f.period.to, level: lvl, note }); lastSports = new Set(); continue;
    }
    // Körper-Folgen aus diesem Teilsatz
    const isBodyClause = (!!body && (f.neg || f.hard || f.downhill) && !f.days) || (f.neg && (f.hard || f.downhill) && !f.days && (f.sports.size === 0 || (f.sports.size === 1 && f.sports.has('run'))));
    if (isBodyClause) {
      bodyRule = bodyRule || { kind: 'body' };
      if (f.hard && f.neg) bodyRule.noIntervals = true;
      if (f.downhill) bodyRule.noDownhill = true;
      lastSports = f.sports.size ? f.sports : lastSports;
      continue;
    }
    if (body && !f.days && !f.months && !f.minutes) { if (f.downhill) bodyRule!.noDownhill = true; lastSports = f.sports.size ? f.sports : lastSports; continue; }
    // Höchstdauer
    if (f.minutes != null) {
      const days = f.days ? (f.except ? f.days.filter(d => !f.except!.includes(d)) : f.days) : f.except ? ALL7.filter(d => !f.except!.includes(d)) : null;
      const sp = f.sports.size === 1 ? [...f.sports][0] : null;
      push({ kind: 'maxDay', minutes: f.minutes, days: days || undefined, sport: sp, strength: f.soft && !f.only ? 'soft' : 'hard' });
      lastSports = f.sports.size ? f.sports : lastSports; continue;
    }
    // Ziel der Regel: Sportarten, Orte, oder geerbt
    let sports = new Set(f.sports); let places = [...f.places];
    const hasDays = !!(f.days || f.except);
    if (!sports.size && !places.length && !f.any && hasDays && lastSports.size && !(f.neg && /\b(zeit|kann ich|ich kann|geht)\b/.test(f.text) && !f.only)) { sports = new Set(lastSports); places = [...lastPlaces]; }
    const strength = f.soft ? 'soft' : 'hard';
    const days = f.days ? (f.except ? f.days.filter(d => !f.except!.includes(d)) : f.days) : f.except ? ALL7.filter(d => !f.except!.includes(d)) : null;
    // Ort mit Tagen/Monaten (Rolle, draußen, Fitnessstudio); das Schwimmbad gilt als Schwimmen
    const placeOnlyRule = places.find(p => p === 'trainer' || p === 'outdoor');
    if (placeOnlyRule && (days || f.months)) {
      if (f.onlyBefore === 'place' && f.months && !days) {
        // „im Winter nur Rolle“ = draußen nie in diesen Monaten
        push({ kind: 'placeDays', place: placeOnlyRule === 'trainer' ? 'outdoor' : 'trainer', placeOnly: false, months: f.months, strength });
      } else push({ kind: 'placeDays', place: placeOnlyRule, placeOnly: !f.neg, days: days || undefined, months: f.months || undefined, strength });
      lastSports = new Set(['bike']); lastPlaces = places; continue;
    }
    if (places.includes('pool') && f.months && !days) {
      // „kein Schwimmbad im Winter“, „Schwimmbad nur im Sommer“
      push({ kind: 'placeDays', place: 'pool', placeOnly: f.only && !f.neg, months: f.months, strength }); lastSports = new Set(['swim']); lastPlaces = places; continue;
    }
    if (days) {
      let targets = [...sports];
      if (!targets.length && (f.long || f.hard)) targets = f.hard ? ['run', 'bike', 'swim'] : ['run', 'bike'];
      if (f.daySportOnly && targets.length && !f.neg) {
        // „mittwochs nur Laufen“: an diesen Tagen keine anderen Sportarten
        for (const sp of (['swim', 'bike', 'run', 'strength'] as RuleSport[]).filter(x => !targets.includes(x))) push({ kind: 'neverDays', sport: sp, days, months: f.months || undefined, strength });
        lastSports = sports; lastPlaces = places; continue;
      }
      const what = f.long ? 'long' : f.hard ? 'hard' : undefined;
      const months = f.months || undefined;
      if (!targets.length) {
        if (f.only && !f.neg) push({ kind: 'onlyDays', days, months, strength, sport: null });
        else if (f.neg || f.any || f.softNeg) push({ kind: 'dayOff', days, months, strength: f.softNeg && !f.neg ? 'soft' : strength });
        else if (f.soft) push({ kind: 'onlyDays', days, months, strength: 'soft', sport: null });
        else { ask = ask || { kind: 'what', text: `Was gilt am ${dayWord(days)}?`, partial: { days }, options: [{ label: 'Gar kein Training', value: 'dayOff' }, { label: 'Nur bestimmte Sportarten nicht', value: 'neverDays' }, { label: 'Nur wenig Zeit', value: 'maxDay' }] }; }
      } else for (const sp of targets) {
        if (f.neg || f.softNeg) push({ kind: 'neverDays', sport: sp, days, months, what, strength: f.softNeg && !f.neg ? 'soft' : strength });
        else if (f.only) push({ kind: 'onlyDays', sport: sp, days, months, what, strength, ...(sp === 'swim' && places.includes('pool') ? { place: 'pool' as Place } : {}) });
        else if (f.soft && (f.long || f.hard)) push({ kind: 'prefer', sport: sp, days, what, strength: 'soft' });
        else if (f.soft) push({ kind: 'onlyDays', sport: sp, days, months, what, strength: 'soft' });
        else if (f.long) push({ kind: 'prefer', sport: sp, days, what: 'long', strength: 'soft' });
        else push({ kind: 'onlyDays', sport: sp, days, months, what, strength, ...(sp === 'swim' && places.includes('pool') ? { place: 'pool' as Place } : {}) });
      }
      lastSports = sports.size ? sports : lastSports; lastPlaces = places; continue;
    }
    // Monate ohne Tage: „im Winter kein Rad“, „Laufen nur im Sommer“
    if (f.months && sports.size) {
      for (const sp of sports) push({ kind: 'neverDays', sport: sp, months: f.neg ? f.months : f.only ? ALL_MONTHS.filter(m => !f.months!.includes(m)) : f.months, strength });
      lastSports = sports; continue;
    }
    // Sportart oder Ort ohne Tage
    if (places.length && !sports.has('run') || places.includes('treadmill') || places.includes('gym')) {
      const p = places[0];
      if (p === 'pool' && f.neg) push({ kind: 'placeDays', place: 'pool', placeOnly: false, strength });
      else if ((p === 'trainer' && f.only) || (p === 'outdoor' && f.neg)) push({ kind: 'placeDays', place: 'outdoor', placeOnly: false, strength });
      else if (p === 'trainer' && f.neg) push({ kind: 'placeDays', place: 'trainer', placeOnly: false, strength });
      else push({ kind: 'info', place: p, note: p === 'treadmill' ? 'Laufband vorhanden: Läufe bei schlechtem Wetter drinnen möglich' : p === 'gym' ? 'Fitnessstudio vorhanden: Kraft mit Geräten möglich' : p === 'trainer' ? 'Rolle vorhanden' : p === 'pool' ? 'Schwimmbad vorhanden' : 'gemerkt', strength: 'soft' });
      lastSports = sports; lastPlaces = places; continue;
    }
    if (sports.size && f.neg && !f.only) {
      // „kann nicht kraulen“ ist Können, keine Regel
      if (sports.has('swim') && /kraul/.test(f.text) && f.canNot) { push({ kind: 'info', note: 'Kraulen noch nicht (steht unter Können)', strength: 'soft' }); continue; }
      for (const sp of sports) push({ kind: 'neverDays', sport: sp, what: f.long ? 'long' : f.hard ? 'hard' : undefined, strength });
      lastSports = sports; continue;
    }
    if (f.morning || f.evening) { push({ kind: 'info', note: f.morning ? 'trainiert lieber morgens' : 'trainiert lieber abends', strength: 'soft' }); continue; }
    if (sports.size) { lastSports = sports; ask = ask || { kind: 'days', text: `An welchen Tagen gilt das für ${[...sports].map(s => ({ run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' })[s]).join(' und ')}?`, partial: { sport: [...sports][0] }, options: [{ label: 'nur an diesen Tagen', value: 'onlyDays' }, { label: 'nie an diesen Tagen', value: 'neverDays' }] }; continue; }
  }
  const trainerDays = rules.find(r => r.kind === 'placeDays' && r.place === 'trainer' && r.placeOnly && r.days && r.days.length);
  if (trainerDays) rules.forEach(r => { if (r.kind === 'onlyDays' && r.sport === 'bike' && !r.what) { r.kind = 'placeDays'; r.place = 'outdoor'; r.placeOnly = true; r.sport = undefined; } });
  if (bodyRule) rules.push({ id: ruleId('t'), strength: 'hard', source: 'text', text: raw, createdAt: now, ...bodyRule } as Rule);
  if (!rules.length && !ask) {
    if (anyPeriodWord) ask = { kind: 'period', text: anyPeriodWord === 'low' ? 'Von wann bis wann hast du wenig Zeit?' : 'Von wann bis wann fällt das Training aus?', partial: { kind: 'period', level: anyPeriodWord } };
    else ask = { kind: 'unknown', text: 'Das habe ich noch nicht verstanden. Worum geht es?', options: [{ label: 'Tage für eine Sportart', value: 'days' }, { label: 'Ein Tag ganz frei', value: 'dayOff' }, { label: 'Zeitraum (Urlaub, Prüfungen)', value: 'period' }, { label: 'Beschwerden', value: 'body' }, { label: 'Nur merken', value: 'info' }] };
  }
  return { rules: dedupe(rules), understood: rules.length > 0, ask: rules.length ? undefined : ask };
}
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
function dayWord(days: number[]): string { const N = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']; return days.length === 1 ? N[days[0]] : days.map(d => N[d]).join(', '); }
function dedupe(rules: Rule[]): Rule[] {
  const seen = new Set<string>();
  return rules.filter(r => { const k = summarize(r); if (seen.has(k)) return false; seen.add(k); return true; });
}
/* Kurzform für Tests und Vergleiche, z. B. „onlyDays run 0,6 hard“ */
export function summarize(r: Partial<Rule>): string {
  const parts: string[] = [r.kind || '?'];
  if (r.sport) parts.push(r.sport);
  if (r.place) parts.push((r.placeOnly ? 'only:' : r.kind === 'placeDays' ? 'never:' : '') + r.place);
  if (r.what) parts.push(r.what);
  if (r.days && r.days.length) parts.push([...r.days].sort((a, b) => a - b).join(','));
  if (r.months && r.months.length) parts.push('m' + [...r.months].sort((a, b) => a - b).join(','));
  if (r.minutes != null) parts.push(r.minutes + 'min');
  if (r.from) parts.push(`${r.from}..${r.to}`, r.level || '');
  if (r.kind === 'body') parts.push(r.body || '-', r.noIntervals ? 'noInt' : '', r.noDownhill ? 'noDown' : '', r.caution ? 'caution' : '');
  if (r.kind !== 'body' && r.kind !== 'info' && r.kind !== 'period') parts.push(r.strength || '');
  return parts.filter(Boolean).join(' ');
}
/* Parser für rulesOf(): nur die Regeln */
export const parseFor = (today: string) => (text: string) => parseRules(text, today).rules;
