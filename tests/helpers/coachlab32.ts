/* Auftrag 32: Coach-Testlabor (dauerhaft, läuft in `npm test` und damit vor jedem Release).
   21 erfundene Test-Nutzer (verschiedene Sportarten, Ziele, Niveaus, mit/ohne Teamsport, krank/verletzt, Ampel grün/gelb/rot, erledigte
   und offene Einheiten am Tag) × 34 Fragen in Gesprächen (Folgefragen wie „und wie lange?“). Jede Antwort wird automatisch geprüft
   (eine Antwort, kein Widerspruch, kennt den Tag, sinnvolle Empfehlung, Länge, keine Wiederholung, Zahlen/Daten, Folgefragen) und von
   Bewertungsregeln benotet (Sinn, Verständlichkeit, Hilfsbereitschaft, je 1–5). Keine echten Personen, keine echten Daten. */
import { world, type World } from './chat-world';
import { converse, type Reply } from '../../shared/coach/dialog';
import { applyOps } from '../../shared/coach/ops';
import { stripPlanAsReason, suggestsDoneAgain, contradictsOffer, dayFacts, openOffer, type Offer } from '../../shared/coach/decide';
import { illnessAt } from '../../shared/core';
import * as C from '../../shared/core';

export const LAB_BASE = '2026-10-21';
type Level = 'green' | 'yellow' | 'red' | null;
export interface LabUser {
  id: string; persona: string; label: string;
  /** Tag wählen: erster Tag ab LAB_BASE mit … */ dayWith?: 'team' | 'open' | 'rest';
  level: Level; teamGone?: boolean; doneToday?: { sport: string; title: string; min: number; area?: string } | null;
  ill?: boolean; knee?: boolean; gridNoToday?: boolean; doneOpen?: boolean;
}
export const LAB_USERS: LabUser[] = [
  { id: 'u01-jonah-aehnlich', persona: 'jugend-langdistanz', label: '17, Langdistanz, Fußball fällt aus, Kraft schon erledigt, Ampel gelb, Raster sperrt den Tag', dayWith: 'team', level: 'yellow', teamGone: true, doneToday: { sport: 'strength', title: 'Kraft Oberkörper', min: 40, area: 'upper' }, gridNoToday: true },
  { id: 'u02-jugend-gruen-team', persona: 'jugend-langdistanz', label: '17, Fußball-Tag, Ampel grün, Training findet statt', dayWith: 'team', level: 'green' },
  { id: 'u03-jugend-krank', persona: 'jugend-langdistanz', label: '17, krank eingetragen', dayWith: 'open', level: 'yellow', ill: true },
  { id: 'u04-vater-gruen-offen', persona: 'vater-rad-lauf', label: '~50, Rad/Lauf, Einheit heute offen, Ampel grün', dayWith: 'open', level: 'green' },
  { id: 'u05-vater-knie', persona: 'vater-rad-lauf', label: '~50, Knie-Beschwerden, Ruhetag', dayWith: 'rest', level: 'green', knee: true },
  { id: 'u06-laeuferin-gelb', persona: 'laeuferin-hm', label: 'nur Laufen, Halbmarathon, Ampel gelb, Einheit offen', dayWith: 'open', level: 'yellow' },
  { id: 'u07-laeuferin-rot', persona: 'laeuferin-hm', label: 'nur Laufen, Ampel rot, Ruhetag', dayWith: 'rest', level: 'red' },
  { id: 'u08-einsteiger-ruhetag', persona: 'einsteiger-sprint', label: 'Einsteiger Sprint, Ruhetag, keine Ampelwerte', dayWith: 'rest', level: null },
  { id: 'u09-einsteiger-erledigt', persona: 'einsteiger-sprint', label: 'Einsteiger, heutige Einheit schon erledigt', dayWith: 'open', level: 'green', doneOpen: true },
  { id: 'u10-md-gruen', persona: 'erfahren-md-marathon', label: 'Mitteldistanz/Marathon erfahren, Ampel grün, offen', dayWith: 'open', level: 'green' },
  { id: 'u11-md-rot-offen', persona: 'erfahren-md-marathon', label: 'erfahren, Ampel rot, Einheit offen', dayWith: 'open', level: 'red' },
  { id: 'u12-regeln-ruhetag', persona: 'vater-regeln', label: 'viele eigene Regeln, Ruhetag', dayWith: 'rest', level: 'green' },
  { id: 'u13-regeln-gelb', persona: 'vater-regeln', label: 'viele eigene Regeln, Ampel gelb, offen', dayWith: 'open', level: 'yellow' },
  { id: 'u14-marathon-anf', persona: 'marathon-anfaenger', label: 'Marathon-Anfänger, Ruhetag, keine Werte', dayWith: 'rest', level: null },
  { id: 'u15-marathon-anf-erledigt', persona: 'marathon-anfaenger', label: 'Anfänger, Lauf heute erledigt, Ampel grün', dayWith: 'open', level: 'green', doneOpen: true },
  { id: 'u16-rad-event', persona: 'rad-event', label: 'Rad-Event Alpen, Ampel grün, Ruhetag', dayWith: 'rest', level: 'green' },
  { id: 'u17-rad-event-krank', persona: 'rad-event', label: 'Rad-Event, krank', dayWith: 'open', level: null, ill: true },
  { id: 'u18-oly-gelb-ruhetag', persona: 'olympisch-erfahren', label: 'Olympisch erfahren, Ampel gelb, Ruhetag', dayWith: 'rest', level: 'yellow' },
  { id: 'u19-oly-kraft-erledigt', persona: 'olympisch-erfahren', label: 'Olympisch, Kraft heute erledigt, Ampel grün', dayWith: 'rest', level: 'green', doneToday: { sport: 'strength', title: 'Kraft Ganzkörper', min: 35, area: 'full' } },
  { id: 'u20-profi-gruen', persona: 'langdistanz-profi', label: 'Ironman-Profi 15 h, Ampel grün, offen', dayWith: 'open', level: 'green' },
  { id: 'u21-profi-viel', persona: 'langdistanz-profi', label: 'Profi, heute schon 2 h Rad gefahren', dayWith: 'rest', level: 'green', doneToday: { sport: 'bike', title: 'Lange Ausfahrt', min: 130 } }
];

/* Gespräche: Kategorie je Frage, Folgefragen im selben Gespräch. {alt} = eine andere Ausdauer-Sportart der Person */
export interface Conv { name: string; steps: { q: string; cat: string }[] }
export const CONVS: Conv[] = [
  { name: 'Ausfall + Folgefragen', steps: [{ q: 'Mein Training fällt heute aus, soll ich noch was machen?', cat: 'replace' }, { q: 'und wie lange?', cat: 'followup-long' }, { q: 'wie locker?', cat: 'followup-easy' }, { q: 'kann ich auch {alt}?', cat: 'followup-sport' }, { q: 'ja', cat: 'accept' }] },
  { name: 'Lust auf mehr', steps: [{ q: 'Soll ich heute noch was machen?', cat: 'today' }, { q: 'aber ich will heute irgendwas machen', cat: 'today-insist' }, { q: 'wie lange soll ich {alt}?', cat: 'followup-long' }, { q: 'nein danke', cat: 'decline' }] },
  { name: 'Kann ich trainieren', steps: [{ q: 'Kann ich heute trainieren?', cat: 'today' }, { q: 'Lohnt sich heute noch eine kurze Einheit?', cat: 'today' }] },
  { name: 'Sportwahl', steps: [{ q: 'Ich hab Lust auf Sport, was kann ich heute machen?', cat: 'today' }, { q: 'Soll ich heute lieber Rad fahren oder laufen?', cat: 'which-sport' }] },
  { name: 'Müde und kürzer', steps: [{ q: 'Ich bin müde', cat: 'tired' }, { q: 'Mach das Training heute kürzer', cat: 'shorter' }, { q: 'Ich habe heute nur 20 Minuten', cat: 'short-time' }] },
  { name: 'Planänderungen', steps: [{ q: 'Verschieb mein Training von heute auf morgen', cat: 'move' }, { q: 'nein', cat: 'decline-generic' }, { q: 'Tausch heute und morgen', cat: 'swap' }, { q: 'nein', cat: 'decline-generic' }, { q: 'Ich habe am Freitag keine Zeit', cat: 'no-time' }] },
  { name: 'Gesundheit', steps: [{ q: 'Mir tut das Knie weh', cat: 'pain' }, { q: 'Ich bin krank', cat: 'sick' }] },
  { name: 'Wissen', steps: [{ q: 'Was ist Zone 2?', cat: 'knowledge' }, { q: 'Wie atme ich beim Kraulen richtig?', cat: 'knowledge' }, { q: 'Was soll ich vor dem Training essen?', cat: 'knowledge' }, { q: 'Wie viel Schlaf brauche ich?', cat: 'knowledge' }] },
  { name: 'Bewertung und Plan', steps: [{ q: 'Wie war mein Training gestern?', cat: 'review' }, { q: 'Wie läuft es mit meinem Ziel?', cat: 'goal' }, { q: 'Was steht morgen an?', cat: 'plan' }, { q: 'Was genau mache ich heute?', cat: 'plan' }, { q: 'Warum ist heute locker?', cat: 'why' }, { q: 'Bin ich übertrainiert?', cat: 'form' }] },
  { name: 'Unsinn', steps: [{ q: 'erzähl mir einen Witz', cat: 'nonsense' }, { q: 'asdfgh', cat: 'nonsense' }, { q: 'Wer wird Fußball-Weltmeister?', cat: 'nonsense' }] }
];
export const QUESTIONS_PER_USER = CONVS.reduce((a, c) => a + c.steps.length, 0);

/* ---------- Test-Welt je Nutzer ---------- */
const trendFor = (today: string, level: Level) => {
  if (!level) return [];
  const out: any[] = []; for (let i = 14; i >= 1; i--) out.push({ date: C.addDays(today, -i), hrv: 70, restingHR: 52, sleepHours: 8 });
  out.push({ date: today, ...(level === 'green' ? { hrv: 70, restingHR: 52, sleepHours: 8 } : level === 'yellow' ? { hrv: 66, restingHR: 53, sleepHours: 6 } : { hrv: 45, restingHR: 62, sleepHours: 4.5 }) });
  return out;
};
const ENDU = ['bike', 'run', 'swim'];
export function labWorld(u: LabUser): World {
  const probe = world(u.persona, LAB_BASE);
  const days = probe.days().filter((d: any) => d.date >= LAB_BASE);
  const live = (d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled);
  const pick = days.find((d: any) => u.dayWith === 'team' ? live(d).some((s: any) => s.sport === 'football' && !/spiel/i.test(s.title)) : u.dayWith === 'rest' ? !live(d).length : live(d).some((s: any) => ENDU.includes(s.sport) && !s.race && !/test|check/i.test(s.title))) || days[0];
  const W = world(u.persona, pick.date);
  W.state.trend = trendFor(W.today, u.level);
  const today = W.day(W.today);
  if (u.teamGone) { const t = live(today).find((s: any) => s.sport === 'football'); if (t) W.state.sessions[t.id] = { skipped: true }; }
  if (u.doneOpen) { const s = live(today).find((x: any) => ENDU.includes(x.sport)); if (s) W.state.sessions[s.id] = { completed: true, metrics: { min: s.plannedMinutes || 40 }, rpe: 4 }; }
  if (u.doneToday) W.state.customWorkouts[W.today] = [{ id: 'act-lab-' + u.id, sport: u.doneToday.sport, title: u.doneToday.title, completed: true, metrics: { min: u.doneToday.min }, ...(u.doneToday.area ? { area: u.doneToday.area } : {}) }];
  if (u.ill) W.state.illnessPeriods = [{ id: 'ill-lab', start: C.addDays(W.today, -1), end: null, note: '' }];
  if (u.knee) W.profile = { ...W.profile, rules: [...(W.profile.rules || []), { id: 'r-knee', kind: 'body', strength: 'hard', body: 'knee', noIntervals: true, noDownhill: true, text: 'Knie: Beschwerden seit 18.10.2026', source: 'chat' } as any] };
  if (u.gridNoToday) { const dow = new Date(W.today + 'T12:00:00Z').getUTCDay(); W.profile = { ...W.profile, rules: [...(W.profile.rules || []), ...['swim', 'bike', 'run', 'strength'].map((sp, i) => ({ id: 'g-lab-' + i, kind: 'neverDays', strength: 'hard', sport: sp, days: [dow], source: 'grid' } as any))] }; }
  // ein paar erledigte Einheiten in den letzten Tagen (für „wie war gestern“)
  for (let k = 1; k <= 3; k++) { const d = W.day(C.addDays(W.today, -k)); if (!d) continue; for (const s of live(d)) if (ENDU.includes(s.sport) && !(s.id in W.state.sessions)) W.state.sessions[s.id] = { completed: true, metrics: { min: s.plannedMinutes || 40 }, rpe: 5 }; }
  return W;
}

/* ---------- Ein Gespräch wie in der App: Antwort speichern (mit Angebot), Bestätigung ausführen ---------- */
export interface Turn { user: string; conv: string; i: number; q: string; cat: string; reply: Reply; offerBefore: Offer | null; offerAfter: Offer | null; ctxAfter: any; fails: string[]; judge: { sinn: number; klar: number; hilfe: number }; prevTexts: string[] }
export function altSport(u: LabUser, W: World, offer: Offer | null): { word: string; sport: string } {
  const mine = ENDU.filter(s => (W.profile.sports || []).includes(s as any));
  const other = mine.find(s => !offer || s !== offer.sport) || mine[0] || 'run';
  return other === 'bike' ? { word: 'Rad fahren', sport: 'bike' } : other === 'swim' ? { word: 'schwimmen', sport: 'swim' } : { word: 'laufen', sport: 'run' };
}
export function runConv(u: LabUser, conv: Conv): Turn[] {
  const W = labWorld(u);
  let dialog: any = {}; let t = Date.parse(W.today + 'T16:00:00Z');
  const turns: Turn[] = [];
  const prevTexts: string[] = [];
  conv.steps.forEach((step, i) => {
    t += 60000; W.now = t;
    const ctx0: any = W.ctx();
    const offerBefore = openOffer(ctx0);
    const alt = altSport(u, W, offerBefore);
    const q = step.q.replace('{alt}', alt.word);
    const { reply, dialog: next } = converse(ctx0, dialog, q);
    dialog = next;
    W.state.coachMsgs['u' + t] = { id: 'u' + t, at: t, date: W.today, kind: 'user', from: 'user', text: q };
    W.state.coachMsgs['a' + t] = { id: 'a' + t, at: t + 1, date: W.today, kind: 'answer', from: 'coach', chat: true, intent: reply.intent, text: reply.text, ...(reply.offer ? { offer: reply.offer } : {}), ...(reply.decision ? { decision: reply.decision } : {}) };
    if (reply.apply && reply.apply.length) { const store = { state: W.state, profile: W.profile, goals: W.goals, saveProfile: (p: any) => { W.profile = p; } }; applyOps(store, reply.apply, t, W.today); W.profile = store.profile; }
    const ctxAfter: any = W.ctx();
    const turn: Turn = { user: u.id, conv: conv.name, i, q, cat: step.cat, reply, offerBefore, offerAfter: openOffer(ctxAfter), ctxAfter, fails: [], judge: { sinn: 5, klar: 5, hilfe: 5 }, prevTexts: [...prevTexts] };
    turn.fails = checkTurn(u, W, turn, alt.sport);
    turn.judge = judge(turn);
    turns.push(turn);
    prevTexts.push(reply.text);
  });
  return turns;
}

/* ---------- Automatische Prüfungen ---------- */
/* Sätze ohne Listenzeilen (• oder „1.“); ein Punkt nach einem Datum („21.10.“) beendet keinen Satz */
const isList = (l: string) => /^\s*(•|-|\d+\.\s)/.test(l);
const sentences = (t: string) => String(t || '').split('\n').filter(l => !isList(l)).join('\n').split(/(?<=[^\d][.!?])\s+|(?<=[?!])\s+|\n+/).map(x => x.trim()).filter(x => x.length > 2);
const listItems = (t: string) => String(t || '').split('\n').filter(isList).length;
const LONG_OK = new Set(['plan', 'review', 'goal', 'form', 'knowledge', 'why']);
const DECIDE_CATS = new Set(['replace', 'today', 'today-insist', 'which-sport', 'followup-long', 'followup-easy', 'followup-sport']);
const DOW_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export function checkTurn(u: LabUser, W: World, T: Turn, altSp: string): string[] {
  const f: string[] = []; const r = T.reply; const txt = String(r.text || '');
  const ctx = T.ctxAfter;
  // 1) genau eine Antwort mit Inhalt; höchstens ein Vorschlag zum Übernehmen
  if (!txt.trim()) f.push('leer');
  const props = ((r.apply || []).length ? 1 : 0) + (((r.pending && r.pending.ops) || []).length ? 1 : 0);
  if (props > 1) f.push('mehr als ein Vorschlag');
  if (((r.options || []).filter(o => /übernehmen/i.test(o.label))).length > 1) f.push('mehrere Übernehmen-Knöpfe');
  // 2) Länge: max. ca. 5 Sätze (Erklärungen mit Liste etwas mehr)
  const n = sentences(txt).length;
  const li = listItems(txt);
  const maxS = LONG_OK.has(T.cat) || li ? 8 : 6;
  if (n > maxS) f.push(`zu lang (${n} Sätze)`);
  if (li > 12) f.push(`zu lang (${li} Listenpunkte)`);
  if (txt.length > (li ? 1400 : LONG_OK.has(T.cat) ? 1000 : 520)) f.push(`zu lang (${txt.length} Zeichen)`);
  // 3) keine Wiederholung: kein Satz doppelt, nicht dieselbe Antwort wie die vorige auf eine andere Frage
  const ss = sentences(txt).map(x => x.toLowerCase());
  if (new Set(ss).size < ss.length) f.push('Satz doppelt');
  const prev = T.prevTexts[T.prevTexts.length - 1];
  if (prev && prev === txt && !/^(ja|nein|nein danke)$/i.test(T.q)) f.push('gleiche Antwort wie vorher');
  // 4) „nicht im Plan“/Regeln als Verbot ist nie ein Grund
  if (stripPlanAsReason(txt).removed.length) f.push('„nicht im Plan“/Regel als Verbot');
  if (/\bnicht (im|in deinem) plan\b|\bnicht vorgesehen\b/i.test(txt) && DECIDE_CATS.has(T.cat)) f.push('Plan als Grund');
  // 5) kennt den Tag: nichts vorschlagen, was heute schon erledigt ist
  const again = suggestsDoneAgain(ctx, txt); if (again && !/schon erledigt|schon gemacht/i.test(txt)) f.push('schlägt Erledigtes vor: ' + again);
  if (r.offer && dayFacts(ctx).done.some(d => d.sport === r.offer!.sport) && T.cat !== 'followup-sport') f.push('Angebot = heute schon erledigte Sportart');
  // 6) kein Widerspruch: ein offenes Angebot wird nur mit „Korrektur:“ geändert; Zahlen bleiben gleich
  const ob = T.offerBefore;
  if (ob && ob.status === 'open' && !/^Korrektur/.test(txt) && T.cat !== 'followup-sport' && T.cat !== 'which-sport' && T.cat !== 'decline' && T.cat !== 'accept') {
    if (contradictsOffer(txt, ob)) f.push('widerspricht dem Angebot');
    const askedSport = /(rad|lauf|laufen|schwimm)/i.test(T.q) && !!r.offer && r.offer.sport !== ob.sport;
    if (r.offer && !askedSport && (r.offer.sport !== ob.sport || r.offer.minutes !== ob.minutes)) f.push(`neues Angebot ohne Korrektur (${ob.minutes}→${r.offer.minutes} min)`);
    const mins = [...txt.matchAll(/(\d{2,3}) min\b/g)].map(m => +m[1]);
    if (DECIDE_CATS.has(T.cat) && mins.length && !mins.includes(ob.minutes) && !(r.offer && mins.includes(r.offer.minutes))) f.push('andere Minuten als im Angebot');
  }
  // 7) richtige Daten: Wochentag passt zum Datum
  for (const m of txt.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),? (\d{1,2})\.(\d{1,2})\./g)) {
    const y = +W.today.slice(0, 4); const d = `${y}-${String(+m[3]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (m[1] !== DOW_DE[dow] && m[1] !== DOW_LONG[dow]) f.push(`falscher Wochentag ${m[0]}`);
  }
  // 8) sinnvolle Empfehlung bei Tagesfragen
  const ill = !!illnessAt(ctx.state.illnessPeriods, W.today);
  if (DECIDE_CATS.has(T.cat) && T.cat !== 'followup-easy') {
    if (ill && r.offer) f.push('krank, trotzdem Training angeboten');
    if (ill && !/krank/i.test(txt)) f.push('krank nicht erwähnt');
    if (u.level === 'red' && r.offer) f.push('Ampel rot, trotzdem Training angeboten');
    if (u.level === 'red' && !/(spazier|dehn|pause|ruh)/i.test(txt)) f.push('rot ohne leichte Alternative');
    if (r.offer) {
      if (!(W.profile.sports || []).includes(r.offer.sport as any)) f.push('Sportart nicht gewählt');
      if (r.offer.minutes < 15 || r.offer.minutes > 75) f.push(`Dauer unplausibel (${r.offer.minutes} min)`);
      if (u.level === 'yellow' && r.offer.minutes > 45) f.push('gelb, aber über 45 min');
      if (u.knee && r.offer.sport === 'run') f.push('Knie-Beschwerden, trotzdem Laufen');
      if (!txt.includes(String(r.offer.minutes))) f.push('Minuten des Angebots fehlen im Text');
    }
    // nicht zu streng: gesund, nicht rot, nicht schon viel trainiert → konkreter Vorschlag (oder die offene Einheit) statt Verbot
    const heavy = dayFacts(ctx).doneMin >= 120;
    if (['replace', 'today', 'today-insist'].includes(T.cat) && !ill && u.level !== 'red' && !heavy && !u.knee && !r.offer && !/\d+ min|steht heute noch an|steht schon in deinem plan|bleibt dabei|schon (gemacht|erledigt)|wie eben gesagt/i.test(txt)) f.push('zu streng: kein konkreter Vorschlag');
    if (heavy && r.offer) f.push('schon viel trainiert, trotzdem mehr angeboten');
  }
  // 9) Folgefragen verstanden
  if (T.cat === 'followup-long' && ob && !ill && u.level !== 'red' && !txt.includes(String((r.offer || ob).minutes))) f.push('„wie lange“ ohne die Minuten des Angebots');
  if (T.cat === 'followup-long' && (ob || r.offer) && !/\d+ min/.test(txt) && !ill && u.level !== 'red' && dayFacts(ctx).doneMin < 120) f.push('„wie lange“ ohne Dauer');
  if (T.cat === 'followup-long' && !ob && !r.offer && !/\d+ min|gar nicht|schon gemacht|krank|rot/i.test(txt)) f.push('„wie lange“ nicht beantwortet');
  if (T.cat === 'followup-easy' && ob && !/zone|locker|puls|unterhalten/i.test(txt)) f.push('„wie locker“ nicht beantwortet');
  if (T.cat === 'followup-sport' && ob && r.offer && r.offer.sport !== altSp && (W.profile.sports || []).includes(altSp as any) && !(u.knee && altSp === 'run')) f.push('Sportwunsch übergangen');
  if (T.cat === 'decline' && T.offerAfter && T.offerAfter.status === 'open') f.push('Angebot nach „nein“ noch offen');
  if (T.cat === 'accept' && ob && ob.status === 'open' && !(T.offerAfter && T.offerAfter.status === 'accepted')) f.push('„ja“ hat das Angebot nicht übernommen');
  // 10) Unsinn: kein Plan-Vorschlag
  if (T.cat === 'nonsense' && (r.offer || (r.apply || []).length || (r.pending && r.pending.ops))) f.push('Unsinn mit Vorschlag beantwortet');
  // 11) keine internen Kennungen
  if (/\b(session_id|get_data|g\d{6}w\d|chat-extra-|msg-)/.test(txt)) f.push('interne Kennung im Text');
  return f;
}

/* ---------- Bewertungsregeln (zweite Meinung): Sinn, Verständlichkeit, Hilfsbereitschaft je 1–5 ---------- */
const EXPECT: Record<string, RegExp> = {
  replace: /^decide-/, today: /^decide-|^explain|^today/, 'today-insist': /^decide-/, 'which-sport': /^decide-|sport-choice/, 'followup-long': /^decide-/, 'followup-easy': /^decide-/, 'followup-sport': /^decide-/,
  accept: /^decide$|apply|decide/, decline: /decline|cancelled/, tired: /tired|easy|decide/, shorter: /shorter|scale|explain|which|confirm|short/, 'short-time': /explain|short|which|limit/,
  move: /move|which|confirm|day/, swap: /swap|which|move/, 'no-time': /no-time|day-off|which|move/, pain: /pain/, sick: /sick|safety/, knowledge: /./, review: /review/, goal: /goal|prognos/, plan: /explain|today|tomorrow|plan|day/, why: /why/, form: /form|load|analysis|tired|over/, nonsense: /unknown|offtopic|nonsense|help|smalltalk|clarify|empty|joke/, 'decline-generic': /cancel|decline/
};
export function judge(T: Turn): { sinn: number; klar: number; hilfe: number } {
  const txt = String(T.reply.text || ''); const s = sentences(txt);
  const words = txt.split(/\s+/).filter(Boolean);
  // Sinn: passende Absicht, Antwort zuerst (erster Satz nicht nur Floskel), keine harten Fehler
  let sinn = 5;
  const ex = EXPECT[T.cat]; if (ex && !ex.test(T.reply.intent || '')) sinn -= 2;
  if (/^(hallo|hi|super|gute frage|danke)\b/i.test(txt)) sinn -= 1;
  if (T.fails.some(x => /widerspr|Erledigtes|krank, trotzdem|rot, trotzdem|Plan als Grund|Verbot|zu streng|übergangen/.test(x))) sinn -= 2;
  // Verständlichkeit: kurze Sätze, keine Kennungen, keine unerklärten Abkürzungen
  let klar = 5;
  const avg = s.length ? words.length / s.length : 0;
  if (avg > 24) klar -= 1; if (avg > 32) klar -= 1;
  if (/\b(ACWR|TSB|CTL|ATL)\b/.test(txt) && !/(Belastung|Fitness|Form|Müdigkeit)/.test(txt)) klar -= 1;
  if (T.fails.some(x => /zu lang|doppelt|Kennung/.test(x))) klar -= 2;
  // Hilfsbereitschaft: konkreter nächster Schritt (Zahl, Knopf, Rat) statt bloßer Absage
  let hilfe = 5;
  const concrete = /\d/.test(txt) || (T.reply.options || []).length > 0 || /\b(tipp|probier|mach|nimm|trink|iss|schlaf|geh|ruh|dehn|spazier|frag|trag)\w*/i.test(txt) || T.cat === 'nonsense';
  if (!concrete) hilfe -= 2;
  if (/^(das (weiß|verstehe) ich (leider )?nicht|keine ahnung)/i.test(txt) && T.cat !== 'nonsense') hilfe -= 2;
  return { sinn: Math.max(1, sinn), klar: Math.max(1, klar), hilfe: Math.max(1, hilfe) };
}
export const judgeOk = (j: { sinn: number; klar: number; hilfe: number }) => j.sinn >= 3 && j.klar >= 3 && j.hilfe >= 3;

export function runLab(users = LAB_USERS): Turn[] { return users.flatMap(u => CONVS.flatMap(c => runConv(u, c))); }
export function summary(turns: Turn[]) {
  const ok = turns.filter(t => !t.fails.length && judgeOk(t.judge));
  const byCheck: Record<string, number> = {}; turns.forEach(t => t.fails.forEach(x => { const k = x.replace(/\s*\(.*\)$/, '').replace(/:.*$/, ''); byCheck[k] = (byCheck[k] || 0) + 1; }));
  const byCat: Record<string, [number, number]> = {}; turns.forEach(t => { const c = byCat[t.cat] = byCat[t.cat] || [0, 0]; c[1]++; if (!t.fails.length && judgeOk(t.judge)) c[0]++; });
  const avg = (k: 'sinn' | 'klar' | 'hilfe') => Math.round(turns.reduce((a, t) => a + t.judge[k], 0) / turns.length * 100) / 100;
  return { total: turns.length, passed: ok.length, pct: Math.round(ok.length / turns.length * 1000) / 10, byCheck, byCat, judge: { sinn: avg('sinn'), klar: avg('klar'), hilfe: avg('hilfe') } };
}
