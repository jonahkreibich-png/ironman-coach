/* Auftrag 32: Tagesentscheidung – eine Frage, eine Entscheidung, eine Antwort.
   Vorher entschieden Regel-Coach, KI und Karten getrennt: Bei „Fußball fällt aus, soll ich noch was machen?“ verbot die KI Ersatz,
   weil das Wochenraster („Rad nie Mo“) als „Regel, nie brechen“ im Kontext stand, kannte die erledigte Kraft-Einheit nicht und nahm
   ihr eigenes Angebot in der nächsten Nachricht zurück. Jetzt gilt für Fragen rund um „heute (noch) trainieren“, Ersatz für
   ausgefallenes Training, „wie lange?“, „lieber laufen?“ und „wie locker?“ genau dieser Ablauf:
   (1) Frage verstehen (auch Folgefragen zum offenen Angebot) → (2) eine Entscheidung mit allen Daten (heute erledigt, noch offen,
   Ampel, Krankheit, Beschwerden, Woche, morgen, Teamsport, Regeln) → (3) kurzer Text: erst die Antwort, dann kurz das Warum →
   (4) höchstens ein Vorschlag zum Übernehmen. Regel-Coach (dialog.ts) und KI-Weg (server/src/wai.ts, ai.ts) nutzen dieselbe Funktion.
   Grundsätze: Regeln schützen vor Überlastung, verbieten aber nicht grundsätzlich; das Wochenraster sagt, wann der Plan Einheiten
   legt – für Ersatz oder spontane lockere Einheiten ist es kein Verbot. „Nicht im Plan“ ist nie ein Grund. Abgeraten wird nur bei
   echtem Risiko (krank, rote Ampel, Beschwerden, schon viel Belastung) – mit Begründung und einer leichteren Alternative.
   Ein Angebot bleibt gültig, bis es angenommen oder abgelehnt wird; ändert sich die Lage, beginnt die Antwort mit „Korrektur:“. */
import * as C from '../core';
import * as W from '../workouts';
import type { EngineCtx, CoachMsg } from './engine';
import { readinessOf, readinessFacts } from './engine';
import { doneItems, valsOf } from './review';
import { norm, painMention } from './intents';
import { rulesOf, breaks, describe as describeRule, type Rule } from '../constraints';
import { parseFor } from '../ruleparse';
import { sportAllowed } from '../sports';
import { paceCtx } from '../plangen';
import { isHardSession, isGameOrRace, isTestSession } from '../intensity';
import { activeInjury, type Op } from './ops';
import { hrZonesFor } from '../sports';
import { isMinor } from '../profile';

export type AskKind = 'today' | 'replace' | 'how-long' | 'which-sport' | 'how-easy' | 'decline';
export interface Offer { id: string; date: string; sport: string; minutes: number; zone: number; title: string; adjIds: string[]; status?: 'open' | 'accepted' | 'rejected'; /** Lage beim Angebot (für eine begründete Korrektur) */ level?: number | null; doneMin?: number }
export interface Decision {
  kind: AskKind;
  /** go = Einheit empfohlen, easy = nur locker/kürzer, rest = heute nichts (mit leichter Alternative), info = reine Auskunft */
  verdict: 'go' | 'easy' | 'rest' | 'info';
  text: string;
  offer?: Offer | null;
  ops?: Op[];
  /** Vorschlag im Format der Server-Vorschläge (eine Karte, ein „Übernehmen“) */
  proposal?: { title: string; text: string; changes: { kind: 'adjust'; key: string; data: any }[] } | null;
  /** Fakten, auf denen die Entscheidung beruht (für Tests und KI-Kontext) */
  facts: string[];
}

const SPORT_NAME: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft', football: 'Teamsport', walk: 'Gehen' };
const ACT: Record<string, string> = { run: 'locker laufen', bike: 'locker Rad fahren', swim: 'locker schwimmen' };
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const dd = (d: string) => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`;
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const ENDURANCE = ['bike', 'run', 'swim'];

/* ---------- (1) Frage verstehen ---------- */
const CANCEL_RE = /\b(faellt|fallt|fiel|fallen)\b[\w ]{0,25}\baus\b|\bausgefallen\b|\bausfaellt\b|\babgesagt\b|\bfindet\b[\w ]{0,15}\bnicht statt\b|\b(kein|keinen)\s+(fussball|fussballtraining|training|spiel|handball|basketball|volleyball|hockey|teamsport|mannschaftstraining)\b(?![\w ]{0,12}\bmehr\b)/;
const SPORT_RE: [RegExp, string][] = [[/\b(rad\w*|fahrrad\w*|bike|rolle|radeln|radel|ausfahrt|radfahren)\b/, 'bike'], [/\b(lauf\w*|laeuf\w*|joggen|jogge|rennen gehen)\b/, 'run'], [/\b(schwimm\w*|kraul\w*|bahnen)\b/, 'swim'], [/\b(kraft\w*|gym|fitnessstudio)\b/, 'strength']];
export function sportsIn(j: string): string[] { return SPORT_RE.filter(([re]) => re.test(j)).map(([, s]) => s); }
const WANTS_RE = /\b(soll|sollte|kann|koennte|darf|muss|lohnt)\b[\w ]{0,30}\b(ich|sich)\b[\w ]{0,25}\b(noch|trotzdem|irgendwas|irgendetwas|was|etwas|sport|trainier\w*|training|machen|bewegen)\b|\b(will|moechte|wuerde|haette|hab|habe)\b[\w ]{0,20}\b(gern|gerne|lust|bock)?\b[\w ]{0,15}\b(irgendwas|irgendetwas|was|etwas|sport|trainier\w*)\b[\w ]{0,15}\b(machen|tun|trainieren)?\b|\b(ersatz|stattdessen|alternative|ersetzen)\b|\bwas (soll|kann|koennte|mache) ich\b[\w ]{0,20}\b(stattdessen|jetzt|noch|heute)\b/;
const TODAY_Q_RE = /\b(soll|sollte|kann|darf)\b[\w ]{0,6}\bich\b[\w ]{0,10}\b(heute|jetzt)\b[\w ]{0,10}\b(trainieren|training|sport machen)\b|\b(heute|jetzt)\b[\w ]{0,15}\b(trainieren|training machen)\b[\w ]{0,10}\b(oder|ja|nein|lieber)\b|\b(soll|sollte|kann|darf) ich (heute )?(ueberhaupt |trotzdem )?trainieren\b/;
const HOWLONG_RE = /\bwie lang\w*\b|\bwie viele? (minuten|min)\b|\bwie weit\b|\bwieviel(e)? minuten\b/;
const HOWEASY_RE = /\bwie (schnell|hart|intensiv|locker|zuegig)\b|\bwelche[rn]? (zone|puls|tempo|intensitaet)\b|\bin welche[rn]? zone\b/;
const DECLINE_RE = /^(nein|nee|ne|noe|lieber nicht|doch nicht|nein danke|ne danke|lass mal|keine lust|mag nicht|will nicht)\b/;
const NOT_FOR_US = /^warum\b|\bwarum (soll|muss|ist|sind|darf|habe|hab)\b|\bwieder (trainier\w*|sport|laufen|schwimmen|rad\w*)\b|\b(verschieb\w*|tausch\w*|streich\w*|krank\w*|fieber|erkaelt\w*|schmerz\w*|weh|verletz\w*|zwickt|gestern|vorgestern|wie war|bewert\w*|morgen|uebermorgen|naechste woche|woche|urlaub|ziel\w*|wettkampf|rennen am)\b/;

/** Offenes Angebot von heute (das jüngste); angenommen = Einheit steht im Plan, abgelehnt = Nein oder Vorschlag abgelehnt */
export function openOffer(ctx: EngineCtx): Offer | null {
  const msgs = (Object.values(ctx.state.coachMsgs || {}) as any[]).filter(m => m && !m.deleted && m.date === ctx.today).sort((a, b) => a.at - b.at);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.offer && !m.offer.superseded) return { ...m.offer, status: offerStatus(ctx, m) };
    if (m.decision && m.decision.kind === 'decline') return null;
  }
  return null;
}
function offerStatus(ctx: EngineCtx, m: any): 'open' | 'accepted' | 'rejected' {
  const p = m.proposal && m.proposal.status;
  if (p === 'accepted') return 'accepted';
  if (p === 'rejected' || p === 'superseded') return 'rejected';
  const adj = ctx.state.adjustments || {};
  if ((m.offer.adjIds || []).some((id: string) => adj[id] && !adj[id].undone && adj[id].type === 'add')) return 'accepted';
  return 'open';
}

/** Letzte Tagesentscheidung von heute (auch ohne Angebot, z. B. „heute lieber Pause“) – Folgefragen beziehen sich darauf */
export function lastDecision(ctx: EngineCtx): any | null {
  const msgs = (Object.values(ctx.state.coachMsgs || {}) as any[]).filter(m => m && !m.deleted && m.date === ctx.today && m.from !== 'user').sort((x, y) => y.at - x.at);
  const m = msgs.find(x => x.decision || x.offer);
  return m ? m : null;
}
const NOT_TRAINING_Q = /\b(essen|esse|isst|trinken|trinke|ernaehr\w*|fruehstueck\w*|snack\w*|schlaf\w*|atme\w*|atmung|witz\w*|wetter|regen)\b/;
const TRAIN_WORD = /\b(machen|mache|tun|trainier\w*|training|sport|einheit|bewegen|bewegung|aktiv|radeln|rad\w*|laufen|joggen|schwimmen)\b/;
/** Was will die Person? null = keine Tagesentscheidung (andere Absicht: verschieben, Bewertung, Wissen …) */
export function askKind(ctx: EngineCtx, text: string): { kind: AskKind; sport: string | null; cancelled: boolean } | null {
  const j = norm(text); if (!j) return null;
  if (painMention(j.split(' '))) return null;
  const sports = sportsIn(j).filter(s => s !== 'strength' || /\bkraft\w*\b/.test(j));
  const sport = sports.length === 1 ? sports[0] : null;
  const offer = openOffer(ctx);
  const last = lastDecision(ctx);
  const cancelled = CANCEL_RE.test(j) && !/\b(morgen|uebermorgen|naechste|am (montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag))\b/.test(j);
  if (offer && offer.status === 'open' && DECLINE_RE.test(j) && j.split(' ').length <= 6) return { kind: 'decline', sport: null, cancelled: false };
  // „wie lange soll ich morgen laufen“, Essen, Schlaf, Bewertungen … gehören nicht hierher
  if ((NOT_FOR_US.test(j) || NOT_TRAINING_Q.test(j)) && !cancelled) return null;
  if (cancelled) return { kind: 'replace', sport, cancelled: true };
  const short = j.split(' ').length <= 7;
  if (HOWLONG_RE.test(j) && (offer || sport || (last && short) || /\b(heute|noch|jetzt|ersatz)\b/.test(j)) && !/\b(dauert|brauche ich|fuer einen|fuer die|halbmarathon|marathon|ironman|triathlon|regeneration|erholung|pause)\b/.test(j)) return { kind: 'how-long', sport, cancelled: false };
  if ((offer || (last && short)) && HOWEASY_RE.test(j)) return { kind: 'how-easy', sport, cancelled: false };
  if ((offer || last) && sports.length && /\b(lieber|auch|stattdessen|oder|eher|besser|alternativ|statt)\b/.test(j)) return { kind: 'which-sport', sport: sports.length > 1 ? null : sport, cancelled: false };
  if (sports.length >= 2 && /\boder\b/.test(j) && /\b(soll|lieber|sinnvoller|besser|eher)\b/.test(j)) return { kind: 'which-sport', sport: null, cancelled: false };
  // Wunsch für HEUTE („noch“, „jetzt“, „irgendwas“ …); „ich will doppelt so viel trainieren“ ist ein Plan-Wunsch, keine Tagesfrage
  const forToday = /\b(heute|jetzt|noch|gleich|irgendwas|irgendetwas|stattdessen|ersatz|alternative)\b/.test(j) && !/\b(doppelt|pro woche|jede woche|ab jetzt|ab sofort|immer)\b/.test(j);
  if (((WANTS_RE.test(j) && TRAIN_WORD.test(j) && forToday) || TODAY_Q_RE.test(j)) || ((offer || last) && /\b(aber ich will|ich will aber|trotzdem|will (heute )?(irgendwas|was|etwas))\b/.test(j))) {
    if (/\bwas genau\b|\bwie genau\b|\bablauf\b|\bbeim (schwimmen|laufen|radfahren|rad)\b/.test(j)) return null;
    return { kind: 'today', sport, cancelled: false };
  }
  return null;
}

/* ---------- (2) Tageslage ---------- */
export interface DayFacts {
  date: string;
  done: { title: string; sport: string; min: number; hard: boolean }[];
  open: any[];             // geplante, noch offene Einheiten (ohne Teamsport-Termine)
  team: any[];             // Teamsport/feste Termine heute
  skipped: any[];          // ausgelassen oder entfallen
  doneMin: number; hardDone: boolean;
}
const weeksOf = (ctx: EngineCtx) => C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {});
const st = (ctx: EngineCtx, s: any) => (ctx.state.sessions || {})[s.id] || {};
const isTeam = (s: any) => s.sport === 'football' || (s.fixed && !ENDURANCE.includes(s.sport) && s.sport !== 'strength');
export function dayFacts(ctx: EngineCtx, date = ctx.today): DayFacts {
  const day = C.planDays(weeksOf(ctx)).find((d: any) => d.date === date);
  const sessions = day ? day.sessions.filter((s: any) => s.sport !== 'rest' && !s.removed) : [];
  const done = doneItems(ctx, date, date).map(d => { const v = valsOf(d); const min = Math.round(v.min || (d.planned && d.planned.plannedMinutes) || 0); return { title: d.title, sport: d.sport, min, hard: !!(d.planned && isHardSession(d.planned)) || (v.rpe != null && v.rpe >= 7) }; });
  const doneIds = new Set(doneItems(ctx, date, date).map(d => d.key));
  const skipped = sessions.filter((s: any) => s.cancelled || st(ctx, s).skipped);
  const left = sessions.filter((s: any) => !s.cancelled && !st(ctx, s).skipped && !st(ctx, s).completed && !doneIds.has(s.id));
  return { date, done, open: left.filter((s: any) => !isTeam(s)), team: left.filter(isTeam), skipped, doneMin: done.reduce((a, d) => a + d.min, 0), hardDone: done.some(d => d.hard) };
}
const hardish = (s: any) => !!s && (isHardSession(s) || C.isLong(s) || isGameOrRace(s) || isTestSession(s));
function dayList(ctx: EngineCtx, date: string): any[] { const d = C.planDays(weeksOf(ctx)).find((x: any) => x.date === date); return d ? d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.removed) : []; }
function weekLoad(ctx: EngineCtx): { planned: number; done: number; recovery: boolean } {
  const wk: any = weeksOf(ctx).find((w: any) => (w.days || []).some((d: any) => d.date === ctx.today));
  if (!wk) return { planned: 0, done: 0, recovery: false };
  const planned = (wk.days || []).reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.removed).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  const first = wk.days[0].date;
  const done = doneItems(ctx, first, ctx.today).reduce((a, d) => a + Math.round(valsOf(d).min || (d.planned && d.planned.plannedMinutes) || 0), 0);
  return { planned, done, recovery: !!wk.isRecoveryWeek };
}

/* Sportart für Ersatz oder Extra: gewünschte zuerst, sonst gelenkschonend und nicht die Sportart, die morgen hart/lang ansteht.
   Tages-, Orts- und Zeitregeln (auch das Wochenraster) regeln die PLANUNG: für eine lockere Ausnahme heute sind sie kein Verbot – die
   Antwort nennt sie aber. Echte Risiken (Beschwerden) schließen eine Sportart aus. Eine heute schon gemachte Sportart nie doppelt. */
interface Pick { sport: string; grid: boolean; rule: Rule | null; why: string | null }
function rulesFor(ctx: EngineCtx): Rule[] { return rulesOf(ctx.profile, parseFor(ctx.today)).filter(r => !r.hidden && r.kind !== 'info'); }
function blockedBy(ctx: EngineCtx, sport: string): { own: Rule | null; grid: Rule | null } {
  const probe = { sport, hard: false, long: false, title: 'Locker ' + (SPORT_NAME[sport] || sport), plannedMinutes: 30 };
  const rs = rulesFor(ctx).filter(r => r.kind !== 'prefer' && r.kind !== 'maxDay' && r.kind !== 'body' && breaks(r, probe, ctx.today));
  return { own: rs.find(r => r.source !== 'grid' && r.strength === 'hard') || null, grid: rs.find(r => r.source === 'grid') || null };
}
function pickSport(ctx: EngineCtx, wanted: string | null, avoid: Set<string>, doneSports: Set<string>): Pick | { sport: null; why: string } {
  const mine = ENDURANCE.filter(s => sportAllowed(ctx.profile, s));
  if (!mine.length) return { sport: null, why: 'Du hast keine Ausdauer-Sportart gewählt' };
  const inj = activeInjury(ctx.state, ctx.profile, weeksOf(ctx), ctx.today);
  const lowerBody = inj && /knie|achilles|wade|schienbein|fuss|fuß|sprung|ferse|huefte|hüfte|leiste|oberschenkel|beschwerden/i.test(inj.part);
  const shoulder = inj && /schulter/i.test(inj.part);
  const okInj = (s: string) => !(s === 'run' && lowerBody) && !(s === 'swim' && shoulder);
  const res = (sp: string, why: string | null = null): Pick => { const b = blockedBy(ctx, sp); return { sport: sp, grid: !!b.grid && !b.own, rule: b.own, why }; };
  const free = mine.filter(s => !doneSports.has(s));
  if (wanted && ENDURANCE.includes(wanted)) {
    if (!mine.includes(wanted)) return { sport: null, why: `${SPORT_NAME[wanted]} hast du nicht als Sportart gewählt` };
    if (okInj(wanted) && !doneSports.has(wanted)) return res(wanted);
    const why = doneSports.has(wanted) ? `${SPORT_NAME[wanted]} hast du heute schon gemacht` : `wegen deiner Beschwerden (${inj!.part}) lieber nicht`;
    const alt = pickSport(ctx, null, new Set([...avoid, wanted]), new Set([...doneSports, wanted]));
    return alt.sport ? { ...alt, why } : { sport: null, why };
  }
  const cand = free.filter(okInj);
  if (!cand.length) return { sport: null, why: free.length ? `deine Beschwerden (${inj ? inj.part : 'Beschwerden'}) lassen gerade keine passende Ausdauer-Einheit zu` : `${[...doneSports].filter(x => ENDURANCE.includes(x)).map(x => SPORT_NAME[x]).join(' und ')} hast du heute schon gemacht – das reicht für heute` };
  const order = ['bike', 'run', 'swim'];
  const score = (s: string) => (avoid.has(s) ? 10 : 0) + (blockedBy(ctx, s).own ? 6 : 0) + (blockedBy(ctx, s).grid ? 1 : 0) + order.indexOf(s);
  return res([...cand].sort((x, y) => score(x) - score(y))[0]);
}

/* Einheit als Plan-Baustein (Dauer aus den Bausteinen, wie überall) */
function buildSession(ctx: EngineCtx, sport: string, minutes: number): any {
  const bikes: string[] = (ctx.profile as any).bikes || [];
  const indoor = sport === 'bike' && bikes.includes('trainer') && (bikes.every(b => b === 'trainer') || [11, 12, 1, 2].includes(+ctx.today.slice(5, 7)));
  const pc = paceCtx(ctx.profile, !!indoor, null, ctx.today);
  const spec = sport === 'run' ? W.runEasy(pc, minutes) : sport === 'bike' ? W.bikeEasy(pc, minutes) : W.swimNormal(pc, 'endurance', minutes, 'base', W.swimRepMax((ctx.profile as any).skills || {}));
  const b = W.build({ ...spec, why: 'Ersatz bzw. Extra: locker, damit morgen wieder alles geht.' } as any);
  return b;
}
function hrLine(ctx: EngineCtx, sport: string): string {
  const t: any = (ctx.profile as any).thresholds || {};
  const lthr = sport === 'bike' ? t.lthrBike || t.lthrRun : sport === 'run' ? t.lthrRun : null;
  if (!lthr) return '';
  const z = hrZonesFor(lthr).find((x: any) => x.zone === 2) as any;
  return z && z.hi ? `, Puls bis etwa ${z.hi}` : '';
}

/* ---------- (2)+(3) Entscheiden und formulieren ---------- */
export function decide(ctx: EngineCtx, text: string): Decision | null {
  const a = askKind(ctx, text); if (!a) return null;
  try { return decideFor(ctx, a); } catch (e) { return null; }
}
export function decideFor(ctx: EngineCtx, a: { kind: AskKind; sport: string | null; cancelled: boolean }): Decision {
  const today = ctx.today;
  const facts: string[] = [];
  const offer = openOffer(ctx);
  const F = dayFacts(ctx);
  const R: any = readinessOf(ctx);
  const level = R && typeof R.level === 'number' && R.level <= 2 ? R.level : null;
  const why = readinessFacts(ctx, today);
  const ill = C.illnessAt(ctx.state.illnessPeriods, today);
  const inj = activeInjury(ctx.state, ctx.profile, weeksOf(ctx), today);
  const minor = isMinor(ctx.profile, today);
  if (F.done.length) facts.push('heute erledigt: ' + F.done.map(d => `${d.title}${d.min ? ` (${d.min} min)` : ''}`).join(', '));
  if (F.open.length) facts.push('heute noch offen: ' + F.open.map(s => `${s.title}${s.plannedMinutes ? ` (${s.plannedMinutes} min)` : ''}`).join(', '));
  if (F.skipped.length) facts.push('heute entfallen/ausgelassen: ' + F.skipped.map(s => s.title).join(', '));
  if (level != null) facts.push(`Ampel ${['grün', 'gelb', 'rot'][level]}${why.length ? ': ' + why.join(', ') : ''}`);
  const tomorrow = dayList(ctx, C.addDays(today, 1)).filter(s => !st(ctx, s).completed);
  if (tomorrow.length) facts.push(`morgen (${dd(C.addDays(today, 1))}): ` + tomorrow.map(s => s.title).join(', '));
  // Ein offenes Angebot von heute wird nur mit „Korrektur:“ zurückgenommen
  const out = (verdict: Decision['verdict'], text: string, extra: Partial<Decision> = {}): Decision => {
    let t = text.replace(/\s+/g, ' ').trim();
    // Folgefrage („und wie lange?“) nach einem „heute nicht“: kurz und ohne denselben Satzanfang
    if (verdict === 'rest' && (a.kind === 'how-long' || a.kind === 'how-easy' || a.kind === 'which-sport')) t = t.replace(/^Heute (keine weitere Einheit|lieber kein Ersatz-Training|kein Training|lieber nichts|keine Ersatz-Einheit):\s*/, 'Heute gar nicht: ');
    if (verdict === 'rest' && offer && offer.status === 'open' && !/^Korrektur:/.test(t)) t = 'Korrektur: ' + t.charAt(0).toLowerCase() + t.slice(1);
    return { kind: a.kind, verdict, text: t, facts, offer: null, ops: [], proposal: null, ...extra };
  };

  // Ablehnen eines offenen Angebots
  if (a.kind === 'decline') return out('info', 'Alles klar, dann heute ohne Extra-Einheit. Ein ruhiger Abend schadet nicht – morgen geht es normal weiter.');

  // Folgefragen zum offenen Angebot: gleiche Zahl, gleiche Sportart (keine neue Rechnung, kein Widerspruch)
  if (offer && offer.status !== 'rejected' && (a.kind === 'how-long' || a.kind === 'how-easy') && (!a.sport || a.sport === offer.sport)) {
    const still = stillValid(ctx, offer, F, level, ill);
    if (still) return out('info', still);
    if (a.kind === 'how-long') return out('go', `${offer.minutes} min, ganz locker (Zone 2${hrLine(ctx, offer.sport)}). Fühlst du dich nach der Hälfte schlapp, darfst du früher aufhören.${offer.status === 'accepted' ? '' : ' Mit „Übernehmen“ steht es im Plan.'}`, { offer: { ...offer } });
    return out('go', `Ganz locker (Zone 2${hrLine(ctx, offer.sport)}): Du kannst dich dabei noch unterhalten und atmest ruhig. Kein Tempo, keine Intervalle – es soll erholen, nicht ermüden.`, { offer: { ...offer } });
  }

  // geplante Einheit heute noch offen (und keine ausgefallene genannt): Entscheidung über diese Einheit
  if (!a.cancelled && F.open.length && a.kind !== 'which-sport' && !(a.kind === 'how-long' && a.sport && !F.open.some(s => s.sport === a.sport))) {
    const s = (a.sport && F.open.find(x => x.sport === a.sport)) || F.open[0];
    if (ill) return out('rest', `Heute kein Training, auch nicht ${s.title}: Du bist als krank eingetragen. Erst wenn du 24 Stunden ohne Fieber und Symptome bist, geht es locker weiter.`);
    if (level === 2) return out('rest', `Heute lieber Pause statt ${s.title}: Deine Ampel ist rot${why.length ? ' (' + why[0] + ')' : ''}. Wenn du dich bewegen willst: 20–30 min ruhig spazieren oder dehnen.`);
    if (a.kind === 'how-long') return out('info', `${s.title}: ${s.plannedMinutes || '–'} min${level === 1 && isHardSession(s) ? ', heute wegen der gelben Ampel lieber locker statt hart' : ''}.`);
    if (level === 1 && isHardSession(s)) return out('easy', `Ja, aber locker: ${s.title} heute ohne harte Teile, ${Math.max(20, r5((s.plannedMinutes || 45) * 0.8))} min in Zone 2. Deine Ampel ist gelb${why.length ? ' (' + why[0] + ')' : ''}.`);
    return out('go', `Ja: ${s.title}${s.plannedMinutes && !/\d+\s*min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''} steht heute noch an.${level === 1 ? ' Ampel gelb: ruhig angehen.' : ''}${F.done.length ? ` ${F.done.map(d => d.title).join(' und ')} hast du heute schon erledigt.` : ''}`);
  }

  // ---- Ersatz oder Extra-Einheit ----
  const cancelledTeam = F.team[0] || F.skipped.find(isTeam) || null;
  // Ersatz-Lage: ausgefallen genannt, oder der Teamsport-Termin heute ist schon als ausgelassen/entfallen markiert
  const teamGone = F.skipped.find(isTeam) || null;
  const cancelledAny = a.cancelled ? (cancelledTeam || F.skipped[0] || null) : teamGone && !F.team.length ? teamGone : null;
  if (ill) return out('rest', 'Heute kein Training: Du bist als krank eingetragen. Ruh dich aus, trink genug. Erst 24 Stunden ohne Fieber und Symptome, dann steigen wir locker wieder ein.');
  if (inj && inj.level != null && inj.level >= 5) return out('rest', `Heute lieber nichts: Deine Beschwerden (${inj.part}, ${inj.level}/10) brauchen Ruhe. Leichte Bewegung ohne Schmerz, zum Beispiel spazieren, ist okay. Wird es nicht besser, lass es bitte ärztlich anschauen.`);
  if (level === 2) return out('rest', `Heute lieber kein Ersatz-Training: Deine Ampel ist rot${why.length ? ' (' + why.join(', ') + ')' : ''}. Wenn du dich bewegen willst, reichen 20–30 min ruhig spazieren oder dehnen. Morgen schauen wir neu.`);
  // Belastung heute und in der Woche
  const wl = weekLoad(ctx);
  if (F.doneMin >= 120 || (F.hardDone && F.doneMin >= 75)) return out('rest', `Für heute reicht es: Du hast schon ${F.done.map(d => d.title).join(' und ')} gemacht (${F.doneMin} min). Mehr bringt heute keinen Fortschritt, nur Müdigkeit für ${tomorrow.length ? dd(C.addDays(today, 1)) : 'morgen'}.`);
  // Sportart
  const avoid = new Set<string>(tomorrow.filter(hardish).map(s => s.sport));
  const p = pickSport(ctx, a.sport, avoid, new Set(F.done.map(d => d.sport)));
  if (!p.sport) return out('rest', `Heute keine weitere Einheit: ${p.why}. Wenn du dich bewegen willst: locker spazieren oder dehnen.`);
  const pk = p as Pick;
  // Dauer
  let min: number;
  if (cancelledAny) {
    const m = cancelledAny.plannedMinutes || 60;
    min = isTeam(cancelledAny) ? Math.min(60, Math.max(30, m * 0.6)) : Math.min(m, 60);
  } else min = F.open.length || F.team.length ? 30 : 40;
  const notes: string[] = [];
  if (level === 1) { min = Math.min(min * 0.75, 45); notes.push(`Deine Ampel ist gelb${why.length ? ' (' + why[0] + ')' : ''}, deshalb nur locker und nicht länger`); }
  if (wl.recovery) { min = Math.min(min, 50); if (!notes.length) notes.push('Es ist eine Erholungswoche, deshalb locker'); }
  if (tomorrow.some(hardish)) { min = Math.min(min, 45); notes.push(`Morgen steht ${tomorrow.filter(hardish).map(s => s.title.replace(/\s*\(.*$/, '')).join(' und ')} an, dafür bleibst du frisch`); }
  if (F.doneMin) { min = Math.min(min, Math.max(30, 75 - F.doneMin * 0.5)); }
  if (wl.planned && wl.done >= wl.planned * 1.05) { min = Math.min(min, 30); notes.push('Deine Woche ist schon voll'); }
  if (minor) min = Math.min(min, 60);
  const maxDay = rulesFor(ctx).find(r => r.kind === 'maxDay' && (!r.days || !r.days.length || r.days.includes(new Date(today + 'T12:00:00Z').getUTCDay())) && r.strength === 'hard');
  if (maxDay && maxDay.minutes) min = Math.min(min, Math.max(15, maxDay.minutes - F.doneMin));
  min = r5(min);
  const session = buildSession(ctx, p.sport, min);
  const minutes = session.plannedMinutes || min;
  const sid = `chat-extra-${today}-${p.sport}`;
  const adds: any[] = [];
  const g = `chat-extra-${today}`;
  if (cancelledAny && !cancelledAny.cancelled && !st(ctx, cancelledAny).skipped && !st(ctx, cancelledAny).completed) adds.push({ id: `${g}-cancel-${cancelledAny.id}`, group: g, type: 'cancel', sessionId: cancelledAny.id, what: `${cancelledAny.title} (${dd(today)}) fällt aus`, reason: 'Ausgefallen laut Coach-Chat' });
  adds.push({ id: `${g}-add-${p.sport}`, group: g, type: 'add', to: today, session: { ...session, id: sid, title: session.title, extraFor: cancelledAny ? cancelledAny.id : undefined }, what: `${session.title} (${dd(today)})`, reason: cancelledAny ? `Ersatz für ${cancelledAny.title}` : 'Extra-Einheit laut Coach-Chat' });
  const newOffer: Offer = { id: sid, date: today, sport: p.sport, minutes, zone: 2, title: session.title, adjIds: adds.map(x => x.id), status: 'open', level, doneMin: F.doneMin };
  // Folgefrage „wie lange …?“ ohne Angebot, aber mit gleicher Lage: einfach die Dauer nennen
  const act = ACT[p.sport];
  const reason = cancelledAny ? `Das ersetzt ${cancelledAny.title.replace(/\s*\(.*$/, '')} mit ruhigerer Belastung` : F.done.length || F.open.length || F.team.length ? '' : 'Heute ist sonst nichts geplant, eine lockere Einheit tut gut, ohne dich müde zu machen';
  const doneLine = F.done.length ? `${F.done.map(d => `${d.title}${d.min ? ` (${d.min} min)` : ''}`).join(' und ')} hast du heute schon erledigt` : '';
  // Tagesregeln regeln die Planung: Ausnahme nennen statt verbieten
  const gridLine = pk.rule ? `Deine Regel „${describeRule(pk.rule)}“ gilt für die Planung – für eine lockere Ausnahme heute passt es` : pk.grid && !cancelledAny ? `Dein Wochenraster plant ${dd(today).slice(0, 2)} sonst kein ${SPORT_NAME[p.sport]} – als Ausnahme passt es heute trotzdem` : '';
  const swapLine = p.why ? `${SPORT_NAME[a.sport || ''] || 'Das'} lieber nicht: ${p.why}` : '';
  // Korrektur, wenn ein offenes Angebot von heute nicht mehr passt (andere Sportart nur, wenn die Person nicht selbst gewechselt hat)
  let prefix = '';
  if (offer && offer.status === 'open' && (offer.sport !== p.sport || Math.abs(offer.minutes - minutes) >= 10)) {
    if (a.kind === 'which-sport' || (a.sport && a.sport !== offer.sport)) prefix = '';
    else {
      const lvlWas = offer.level == null ? null : offer.level;
      const why0 = level !== lvlWas && level != null ? `deine Ampel ist inzwischen ${['grün', 'gelb', 'rot'][level]}` : F.doneMin > (offer.doneMin || 0) ? 'du hast inzwischen trainiert' : 'sich dein Plan für heute geändert hat';
      prefix = `Korrektur, weil ${why0}: statt ${offer.minutes} min ${SPORT_NAME[offer.sport]} jetzt `;
    }
  } else if (offer && offer.status === 'accepted' && offer.sport === p.sport) {
    return out('go', `${offer.title} steht schon in deinem Plan für heute: ${offer.minutes} min ganz locker. Viel Spaß!`, { offer: { ...offer } });
  } else if (offer && offer.status === 'open' && offer.sport === p.sport) {
    // gleiches Angebot: bleibt gültig, nichts Neues erfinden
    const head = a.kind === 'how-long' ? `${offer.minutes} min, ganz locker (Zone 2${hrLine(ctx, offer.sport)}).` : `Bleibt dabei: ${offer.minutes} min ${act} (Zone 2).`;
    return out('go', `${head} Mit „Übernehmen“ steht es im Plan.`, { offer: { ...offer } });
  }
  const verdict: Decision['verdict'] = level === 1 || F.doneMin ? 'easy' : 'go';
  const z2 = `(Zone 2${hrLine(ctx, p.sport)})`;
  const first = prefix || a.kind === 'how-long' ? `${minutes} min ${act} ${z2}.` : `${cancelledAny || a.kind === 'today' ? 'Ja' : 'Gern'}: ${minutes} min ${act} ${z2}.`;
  const lines = [prefix + first, swapLine, gridLine && pk.rule ? gridLine : '', reason, doneLine, notes[0] || '', gridLine && !pk.rule ? gridLine : ''].filter(Boolean).map(x => /[.!?]$/.test(x) ? x : x + '.');
  // höchstens 4 Sätze plus der Hinweis aufs Übernehmen
  const textOut = lines.slice(0, 4).join(' ') + ' Mit „Übernehmen“ steht es im Plan.';
  const proposal = { title: (cancelledAny ? 'Ersatz: ' : 'Extra: ') + `${session.title} heute`, text: '', changes: adds.map(x => ({ kind: 'adjust' as const, key: x.id, data: { ...x, from_chat: true, createdAt: ctx.now, date: today } })) };
  return out(verdict, textOut, { offer: newOffer, ops: [{ op: 'adjust', adj: adds }], proposal });
}

/* Offenes Angebot noch richtig? Sonst Korrektur mit Grund (nur wenn die Lage sich wirklich geändert hat) */
function stillValid(ctx: EngineCtx, offer: Offer, F: DayFacts, level: number | null, ill: any): string | null {
  if (ill) return `Korrektur: Du bist inzwischen als krank eingetragen, deshalb heute doch kein ${SPORT_NAME[offer.sport]}. Erst gesund werden.`;
  if (level === 2) return `Korrektur: Deine Ampel ist inzwischen rot, deshalb heute doch kein ${SPORT_NAME[offer.sport]}. Höchstens ruhig spazieren.`;
  if (offer.status === 'open' && F.done.some(d => d.sport === offer.sport)) return `${SPORT_NAME[offer.sport]} hast du heute schon gemacht – damit ist der Vorschlag erledigt.`;
  return null;
}

/* ---------- Prüfer für KI-Antworten ---------- */
/** Sätze, die „steht nicht im Plan“ bzw. Wochenraster/Regeln als Verbot benutzen, fallen weg (nie ein Grund). Liefert den Rest. */
export function stripPlanAsReason(text: string): { text: string; removed: string[] } {
  const parts = String(text || '').split(/(?<=[.!?])\s+/);
  const removed: string[] = [];
  const bad = (x: string) => {
    const j = x.toLowerCase();
    return /\b(nicht|kein\w*)\b[^.!?]{0,60}\b(im|in deinem|laut (deinem|dem)) plan\b[^.!?]{0,40}\b(steht|vorgesehen|geplant)\b[^.!?]{0,40}\b(daher|deshalb|darum|also)\b/.test(j)
      || /\b(da|weil|deshalb|daher|darum)\b[^.!?]{0,60}\b(nicht|kein\w*)\b[^.!?]{0,30}\b(im|in deinem) plan\b/.test(j)
      || /\b(da|weil)\b[^.!?]{0,40}\b(im|in deinem) plan\b[^.!?]{0,30}\b(nicht|kein\w*)\b/.test(j)
      || /\blaut (deinen|den|deiner|der) (regeln?|vorgaben|wochenraster)\b[^.!?]{0,80}\b(nicht|kein\w*|nie)\b/.test(j)
      || /\b(nicht|kein\w*)\b[^.!?]{0,60}\blaut (deinen|den) regeln\b/.test(j)
      || /\b(kann|darf)\b[^.!?]{0,40}\bnicht\b[^.!?]{0,40}\b(da|weil)\b[^.!?]{0,40}\b(plan|regel\w*)\b/.test(j)
      || /\b(nicht|kein\w*)\b[^.!?]{0,40}\b(im plan|in deinem plan)\b[^.!?]{0,20}\b(steht|stehen)\b[^.!?]{0,10}[.!?]?$/.test(j) && /\b(dauer|nennen|empfehlen|kann ich dir)\b/.test(j)
      || /\bregel[^.!?]{0,30}\beinzuhalten\b/.test(j)
      // „… steht nicht im Plan, deshalb lassen wir es“ / „nicht im Plan, also besser nicht“
      || (/\bnicht (im|in deinem) plan\b|\bnicht geplant\b/.test(j) && /\b(deshalb|daher|darum|also|lassen|lieber nicht|besser nicht|solltest (du )?nicht|kann ich (dir )?nicht|nicht empfehlen)\b/.test(j));
  };
  const kept = parts.filter(x => { if (bad(x)) { removed.push(x); return false; } return true; });
  return { text: kept.join(' ').trim(), removed };
}
/** Widerspricht eine Antwort dem offenen Angebot (Sportart verboten/abgeraten), ohne „Korrektur:“ und Grund? */
export function contradictsOffer(text: string, offer: Offer | null): boolean {
  if (!offer || offer.status === 'rejected') return false;
  const j = norm(text);
  if (/^korrektur\b/.test(j)) return false;
  const sp: Record<string, string> = { bike: '(rad\\w*|radfahren|fahrrad)', run: '(lauf\\w*|laufen|joggen)', swim: '(schwimm\\w*)' };
  const s = sp[offer.sport]; if (!s) return false;
  return new RegExp(`\\b(nicht|kein\\w*|nie)\\b[\\w ]{0,30}\\b${s}\\b|\\b${s}\\b[\\w ]{0,30}\\b(nicht|lieber nicht|keine gute idee|nicht ideal)\\b`).test(j);
}
/** Kennt die Antwort den Tag? Schlägt sie etwas vor, das heute schon erledigt ist (z. B. Kraft)? */
export function suggestsDoneAgain(ctx: EngineCtx, text: string): string | null {
  const F = dayFacts(ctx);
  const j = norm(text);
  for (const d of F.done) {
    const words = d.sport === 'strength' ? 'kraft\\w*' : d.sport === 'bike' ? 'rad\\w*' : d.sport === 'run' ? 'lauf\\w*' : d.sport === 'swim' ? 'schwimm\\w*' : null;
    if (!words) continue;
    if (new RegExp(`\\b${words}\\b[\\w ]{0,40}\\b(waere|ist|als|eine) (eine )?(option|moeglichkeit|idee)\\b|\\b(mach|mache|empfehle|schlage)\\b[\\w ]{0,30}\\b${words}\\b|\\b${words}\\b[\\w ]{0,20}\\b(machen|einplanen)\\b`).test(j)
      // „Kraft hast du heute schon gemacht“ ist kein Vorschlag (nur wenn die Sportart selbst als erledigt genannt wird)
      && !new RegExp(`\\b${words}\\b (\\d+ min )?(hast du|hast|habe ich|hab ich)( heute)? (schon|bereits)\\b|\\b(schon|bereits)( heute)? (ein |eine |dein |deine )?${words}\\b|\\b${words}\\b( heute)? (schon|bereits) (gemacht|erledigt|absolviert)\\b`).test(j)) return d.title;
  }
  return null;
}
/** Kurzfassung der Tageslage für den KI-Kontext */
export function dayFactsLine(ctx: EngineCtx): string {
  const F = dayFacts(ctx);
  const o = openOffer(ctx);
  return [
    'HEUTE ERLEDIGT: ' + (F.done.length ? F.done.map(d => `${SPORT_NAME[d.sport] || d.sport}: ${d.title}${d.min ? ` (${d.min} min)` : ''}`).join(' | ') : 'noch nichts'),
    F.skipped.length ? 'HEUTE ENTFALLEN/AUSGELASSEN: ' + F.skipped.map(s => s.title).join(' | ') : '',
    o && o.status !== 'rejected' ? `OFFENES ANGEBOT VON HEUTE (gilt, bis angenommen oder abgelehnt; nur mit „Korrektur:“ und Grund ändern): ${o.minutes} min ${ACT[o.sport] || o.sport}${o.status === 'accepted' ? ' – schon übernommen' : ''}` : ''
  ].filter(Boolean).join('\n');
}

/* Eine Antwort-Nachricht aus der Entscheidung (Server-Weg): Text, Angebot und höchstens ein Vorschlag in DERSELBEN Nachricht */
export function decisionMessage(dec: Decision, today: string, at: number, extraText = ''): CoachMsg & { offer?: Offer | null; decision?: any } {
  const m: any = { id: `msg-dec-${at}`, at, date: today, kind: 'answer', from: 'coach', text: dec.text + (extraText ? '\n\n' + extraText : ''), offer: dec.offer || null, decision: { kind: dec.kind, verdict: dec.verdict } };
  if (dec.proposal && dec.proposal.changes.length) m.proposal = { changes: dec.proposal.changes, status: 'open' };
  return m;
}
/* Regeln für die KI: eigene Regeln getrennt vom Wochenraster (das Raster ist kein Verbot für Ersatz oder spontane lockere Einheiten) */
export function ruleLinesForAi(ctx: EngineCtx, max = 8): string[] {
  const rs = rulesFor(ctx);
  const own = rs.filter(r => r.source !== 'grid'), grid = rs.filter(r => r.source === 'grid');
  const L: string[] = [];
  const txt = (r: Rule) => describeRule(r) + (r.strength === 'soft' ? ' (möglichst)' : '');
  if (own.length) L.push('Eigene Regeln des Athleten (beim Planen nie brechen; „möglichst“ darf mit Begründung abweichen):', ...own.slice(0, max).map(r => '- ' + txt(r)));
  if (grid.length) L.push('Wochenraster (so verteilt die App die GEPLANTEN Einheiten; kein Verbot für Ersatz oder spontane lockere Einheiten):', ...grid.slice(0, max).map(r => '- ' + txt(r).replace(/: nie /, ': plant die App nie ')));
  L.push('- Regeln schützen vor Überlastung, sie verbieten nicht grundsätzlich. Wünscht der Athlet Ersatz oder eine zusätzliche Einheit, schlage eine sinnvolle lockere vor (Dauer nennen). Abraten nur bei Krankheit, roter Ampel, Schmerzen oder zu viel Belastung, dann mit Grund und leichterer Alternative. „Steht nicht im Plan“ ist nie ein Grund.');
  L.push('- Schlage nie vor, was heute schon erledigt ist (siehe HEUTE ERLEDIGT). Ein offenes Angebot von heute nimmst du nicht zurück; nur mit „Korrektur:“ und Grund.');
  return L;
}
