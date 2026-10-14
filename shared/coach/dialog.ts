/* Coach-Chat mit Zusammenhang (Auftrag 5 D): jede Nachricht bekommt eine Antwort, Rückfragen werden aufgelöst („ja“, „nein“,
   „Samstag“, „lieber Sonntag“, „mach das“), Planänderungen laufen über feste Aktionen (shared/coach/ops.ts) mit Vorschau,
   Bestätigen und Rückgängig, und nie gegen eine harte Regel der Person (shared/constraints.ts).
   Ohne KI: Wörter, Tage, Sportarten, Mengen und Daten werden erkannt. Mit KI-Schlüssel übernimmt die KI das Verstehen und
   Formulieren, die Änderungen laufen aber durch dieselben Aktionen und Regeln.
   Versteht der Coach etwas nicht, fragt er gezielt nach und zeigt Knöpfe, statt mit einer Floskel zu antworten. */
import * as C from '../core';
import * as W from '../workouts';
import type { EngineCtx } from './engine';
import { understand as answerQuestion, norm, has, dayIn, sportIn, bodyIn, weeksOf, dayOf, live, fmtD, sessLine, easyToday } from './intents';
import { checkMessage } from './safety';
import { joinDe } from './texts';
import { rulesOf, evaluate, describe as ruleText, type Rule } from '../constraints';
import { parseRules, parseFor } from '../ruleparse';
import { paceCtx } from '../plangen';
import { GOALS, mainGoal, type Goal, type GoalType } from '../goals';
import { isMinor } from '../profile';
import type { Op } from './ops';
import { explainDay, explainWanted, limitIn } from './explain';
import { parseSwimSkill, swimSkillUpdate } from '../swimskill';

export interface Opt { label: string; say: string }
export interface Pending { kind: 'confirm' | 'move-day' | 'which' | 'scope' | 'period' | 'pain' | 'rule-scope' | 'goal-date' | 'what'; at: number; ops?: Op[]; data?: any; options?: Opt[] }
export interface DialogState { pending?: Pending | null; focus?: { sid: string; date: string } | null }
export interface Reply { intent: string; text: string; options?: Opt[]; apply?: Op[]; pending?: Pending | null; suggestions?: string[] }
type Extra = { scores?: any[]; prognosis?: any };
type Sx = { s: any; date: string };
type AdjOp = Extract<Op, { op: 'adjust' }>;

const YES = ['ja', 'jo', 'jep', 'jup', 'jaa', 'yes', 'ok', 'okay', 'oki', 'okey', 'passt', 'gerne', 'gern', 'klar', 'genau', 'einverstanden', 'super', 'perfekt', 'top', 'stimmt', 'richtig', 'uebernehmen', 'uebernimm', 'mach', 'machs', 'machen', 'bitte', 'gut', 'sicher', 'logo', 'yep'];
const NO = ['nein', 'nee', 'ne', 'no', 'noe', 'nicht', 'abbrechen', 'stopp', 'stop', 'vergiss', 'falsch', 'lieber nicht', 'doch nicht', 'lass es', 'lass mal'];
const isYes = (t: string[]) => t.length <= 6 && t.some(x => YES.includes(x)) && !t.some(x => ['nein', 'nee', 'noe', 'nicht'].includes(x));
const isNo = (t: string[]) => t.length <= 6 && (has(t, ['nein', 'nee', 'noe', 'abbrechen', 'vergiss', 'stopp']) || /\b(lieber nicht|doch nicht|lass es|lass mal|ne)\b/.test(t.join(' ')));
const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const gid = (ctx: EngineCtx) => 'chat-' + ctx.now + '-' + Math.random().toString(36).slice(2, 6);
const done = (ctx: EngineCtx, s: any) => !!((ctx.state.sessions || {})[s.id] || {}).completed;
const own = (s: any) => s && s.sport !== 'rest' && !s.fixed && !s.race && !s.cancelled && !s.removed;
const rulesFor = (ctx: EngineCtx) => rulesOf(ctx.profile, parseFor(ctx.today));
const YES_OPTS = (yes = 'Ja, übernehmen'): Opt[] => [{ label: yes, say: 'ja' }, { label: 'Nein', say: 'nein' }];

/* ---------- Einheiten finden ---------- */
function upcoming(ctx: EngineCtx, days = 7): Sx[] {
  const end = C.addDays(ctx.today, days - 1);
  return C.planDays(weeksOf(ctx)).filter((d: any) => d.date >= ctx.today && d.date <= end).flatMap((d: any) => live(d).filter((s: any) => own(s) && !done(ctx, s)).map((s: any) => ({ s, date: d.date })));
}
const isLong = (s: any) => C.isLong(s) || /lang/i.test(s.title || '');
const isHard = (s: any) => C.isHard(s) && !isLong(s);
/* Tage im Text: Quelle (von/statt/am) und Ziel (auf/nach/zum/lieber) */
const TARGET = ['auf', 'nach', 'zum', 'lieber', 'stattdessen', 'besser', 'eher', 'in', 'bis'];
function daysOf(ctx: EngineCtx, toks: string[]): { from: string | null; to: string | null; any: string[] } {
  const found: { d: string; i: number; role: 'from' | 'to' | '' }[] = [];
  for (let i = 0; i < toks.length; i++) {
    const d = dayIn([toks[i]], ctx.today); if (!d) continue;
    if (['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].includes(toks[i]) && !(found.length || ['am', 'auf', 'nach', 'zum', 'von', 'vom', 'statt', 'lieber', 'und', 'oder'].includes(toks[i - 1] || ''))) continue;
    const prev = toks.slice(Math.max(0, i - 3), i);
    const role = prev.some(x => ['statt', 'anstatt', 'anstelle', 'von', 'vom'].includes(x)) ? 'from' : prev.some(x => TARGET.includes(x)) ? 'to' : '';
    found.push({ d, i, role });
  }
  let from = found.find(f => f.role === 'from')?.d || null, to = found.find(f => f.role === 'to')?.d || null;
  const free = found.filter(f => !f.role).map(f => f.d);
  if (!from && free.length) from = to ? free[0] : free[0];
  if (!to && from && free.length > 1) to = free.find(d => d !== from) || null;
  if (from && to && from === to) to = null;
  return { from, to, any: found.map(f => f.d) };
}
function pickSessions(ctx: EngineCtx, toks: string[], date: string | null, d?: DialogState): Sx[] {
  const sport = sportIn(toks); const long = has(toks, ['lang', 'langen', 'langer', 'lange']); const hard = has(toks, ['intervall', 'intervalle', 'harte', 'hart', 'tempo', 'schwelle']);
  const pron = has(toks, ['ihn', 'sie', 'es', 'den', 'die', 'das']) && !sport && !date;
  let list = upcoming(ctx, 8);
  if (pron && d && d.focus) { const f = list.find(x => x.s.id === d.focus!.sid); if (f) return [f]; }
  if (date) list = list.filter(x => x.date === date);
  if (sport) list = list.filter(x => x.s.sport === sport);
  if (long) list = list.filter(x => isLong(x.s));
  if (hard) list = list.filter(x => isHard(x.s));
  if (!date && !sport && !long && !hard) list = list.filter(x => x.date === ctx.today).length ? list.filter(x => x.date === ctx.today) : list.slice(0, 1);
  else if (!date) list = list.slice(0, sport || long || hard ? 1 : 3);
  return list;
}
const label = (x: Sx) => `${x.s.title} (${fmtD(x.date)})`;

/* ---------- Regeln und erlaubte Tage ---------- */
function allowedDays(ctx: EngineCtx, x: Sx, rules: Rule[]): string[] {
  const w = weeksOf(ctx).find((ww: any) => ww.days.some((dd: any) => dd.date === x.date));
  // heute nur, solange der Tag noch nicht gelaufen ist (ab 18 Uhr in Berlin nicht mehr anbieten)
  const late = ctx.now != null && parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(new Date(ctx.now)), 10) >= 18;
  const days = (w ? w.days : []).map((dd: any) => dd.date).filter((dt: string) => (late ? dt > ctx.today : dt >= ctx.today) && dt !== x.date);
  return days.filter((dt: string) => { const l = live(dayOf(ctx, dt)); return !l.some((y: any) => y.sport === x.s.sport) && C.ruleOk(rules, x.s, dt, l) && (!isHard(x.s) || !l.some((y: any) => C.isHard(y))); })
    .sort((a: string, b: string) => live(dayOf(ctx, a)).length - live(dayOf(ctx, b)).length || a.localeCompare(b));
}
function blockReason(rules: Rule[], s: any, date: string): string | null {
  const ev = evaluate(rules, s, date).hard; if (ev.length) return `„${ruleText(ev[0])}“`;
  return null;
}

/* ---------- Aktionen bauen ---------- */
function moveOp(ctx: EngineCtx, x: Sx, to: string, why = 'Wunsch im Coach-Chat'): AdjOp { const g = gid(ctx); return { op: 'adjust', adj: [{ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: x.date, to, what: `${x.s.title}: ${fmtD(x.date)} → ${fmtD(to)}`, reason: why }] }; }
function cancelOp(ctx: EngineCtx, list: Sx[], why = 'Wunsch im Coach-Chat'): AdjOp { const g = gid(ctx); return { op: 'adjust', adj: list.map(x => ({ id: `${g}-${x.s.id}`, group: g, type: 'cancel', sessionId: x.s.id, what: `${x.s.title} (${fmtD(x.date)}) entfällt`, reason: why })) }; }
function scaleOp(ctx: EngineCtx, list: Sx[], f: number, why = 'Wunsch im Coach-Chat', minutes?: number): AdjOp {
  const g = gid(ctx);
  return { op: 'adjust', adj: list.filter(x => x.s.plannedMinutes).map(x => {
    const ff = minutes ? minutes / x.s.plannedMinutes : f;
    const rb = !x.s.stage ? W.rebuildScaled(x.s, ff) : null;
    const set = rb || { plannedMinutes: Math.max(10, Math.round(x.s.plannedMinutes * ff / 5) * 5), ...(x.s.plannedKm ? { plannedKm: Math.round(x.s.plannedKm * ff * 10) / 10 } : {}) };
    return { id: `${g}-${x.s.id}`, group: g, type: 'modify', sessionId: x.s.id, set, what: `${x.s.title}: ${x.s.plannedMinutes} → ${set.plannedMinutes} min`, reason: why };
  }) };
}
function easyOp(ctx: EngineCtx, list: Sx[], why = 'Wunsch im Coach-Chat'): AdjOp {
  const g = gid(ctx);
  return { op: 'adjust', adj: list.map(x => {
    const min = Math.min(45, x.s.plannedMinutes || 45);
    const pc = paceCtx(ctx.profile, false, null, ctx.today);
    const b = x.s.sport === 'run' ? W.build(W.runEasy(pc, min)) : x.s.sport === 'bike' ? W.build(W.bikeEasy(pc, min)) : null;
    const set = b ? { title: 'Locker statt: ' + x.s.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, zone: 'Zone 2', hard: false }
      : { title: 'Locker statt: ' + x.s.title, zone: 'Zone 2', plannedMinutes: min, plannedKm: null, hard: false, spec: null, description: 'Auf deinen Wunsch locker in Zone 2 statt hart. Du kannst noch ganze Sätze sprechen.' };
    return { id: `${g}-${x.s.id}`, group: g, type: 'modify', sessionId: x.s.id, set, what: `${x.s.title} (${fmtD(x.date)}) → locker, ${set.plannedMinutes} min`, reason: why };
  }) };
}
function hardOp(ctx: EngineCtx, x: Sx, rules: Rule[]): { op?: Op; why?: string } {
  if (x.s.sport === 'run' && (rules.some(r => r.kind === 'body' && r.noIntervals) || (isMinor(ctx.profile, ctx.today) && !ctx.planMeta.runIntervalsAllowed))) return { why: rules.some(r => r.kind === 'body' && r.noIntervals) ? 'wegen deiner Beschwerden (keine Lauf-Intervalle)' : 'Lauf-Intervalle sind für dich noch nicht freigegeben' };
  const near = [C.addDays(x.date, -1), C.addDays(x.date, 1)].some(d => live(dayOf(ctx, d)).some((y: any) => C.isHard(y)));
  if (near) return { why: 'am Tag davor oder danach ist schon etwas Hartes. Zwei harte Tage hintereinander sind zu viel' };
  const g = gid(ctx); const pc = paceCtx(ctx.profile, x.s.sport === 'bike' && /rolle/i.test(x.s.title), null, ctx.today);
  const min = x.s.plannedMinutes || 45;
  const b = x.s.sport === 'run' ? W.build(W.runTempo(pc, Math.max(10, Math.round((min - 25) / 5) * 5), 3)) : x.s.sport === 'bike' ? W.build(W.bikeIntervals(pc, 3, Math.max(6, Math.round((min - 30) / 3)), 3, 4)) : null;
  const set = b ? { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, zone: b.zone || 'Zone 3', hard: true } : { plannedMinutes: Math.round(min * 1.15 / 5) * 5 };
  return { op: { op: 'adjust', adj: [{ id: `${g}-${x.s.id}`, group: g, type: 'modify', sessionId: x.s.id, set, what: `${x.s.title} (${fmtD(x.date)}) → ${set.title || 'etwas härter'}, ${set.plannedMinutes} min`, reason: 'Wunsch im Coach-Chat' }] } };
}
/* Tag frei: Einheiten auf erlaubte freie Tage derselben Woche, sonst streichen */
function dayOffOps(ctx: EngineCtx, date: string, why = 'Du hast an dem Tag keine Zeit'): { op: Op | null; lines: string[] } {
  const rules = rulesFor(ctx);
  const list = live(dayOf(ctx, date)).filter((s: any) => own(s) && !s.locked && !done(ctx, s)).map((s: any) => ({ s, date }));
  if (!list.length) return { op: null, lines: [] };
  const g = gid(ctx); const adj: any[] = []; const lines: string[] = []; const used: Record<string, string[]> = {};
  for (const x of list) {
    const to = allowedDays(ctx, x, rules).filter(d => !(used[d] || []).includes(x.s.sport) && (used[d] || []).length + live(dayOf(ctx, d)).length < 2)[0];
    if (to) { adj.push({ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: date, to, what: `${x.s.title}: ${fmtD(date)} → ${fmtD(to)}`, reason: why }); (used[to] = used[to] || []).push(x.s.sport); lines.push(`${x.s.title} auf ${fmtD(to)}`); }
    else { adj.push({ id: `${g}-${x.s.id}`, group: g, type: 'cancel', sessionId: x.s.id, what: `${x.s.title} (${fmtD(date)}) entfällt`, reason: why + ', kein passender Tag frei' }); lines.push(`${x.s.title} entfällt`); }
  }
  return { op: { op: 'adjust', adj }, lines };
}
function weekRest(ctx: EngineCtx): Sx[] {
  const w = weeksOf(ctx).find((x: any) => x.days.some((d: any) => d.date === ctx.today)); if (!w) return [];
  return w.days.filter((d: any) => d.date >= ctx.today).flatMap((d: any) => live(d).filter((s: any) => own(s) && !s.locked && !s.stage && !done(ctx, s) && s.plannedMinutes).map((s: any) => ({ s, date: d.date })));
}

/* ---------- Vorschau und Antworten ---------- */
function propose(intent: string, text: string, ops: Op[], options?: Opt[]): Reply {
  return { intent, text, pending: { kind: 'confirm', at: Date.now(), ops }, options: options || YES_OPTS() };
}
const apply = (intent: string, ops: Op[], text: string): Reply => ({ intent, text, apply: ops, pending: null });
const linesOf = (ops: Op[]) => ops.flatMap(o => o.op === 'adjust' ? o.adj.map((a: any) => a.what) : []);
/* Was ist passiert? In einfachen Worten, mit Rückgängig in der App */
function doneText(ops: Op[], fallback?: string): string {
  const out: string[] = [];
  for (const o of ops) {
    if (o.op === 'illness-start') out.push('Krankheitsphase ab heute eingetragen, der Plan pausiert. Gute Besserung!');
    if (o.op === 'illness-end') out.push('Krankheitsphase beendet. Die nächsten Tage steigst du in Stufen wieder ein.');
    if (o.op === 'add-rules') out.push(`Gespeichert: ${joinDe(o.rules.map(ruleText))}.`);
    if (o.op === 'goal') out.push(`Ziel gespeichert: ${o.goal.name}${o.goal.date ? ' am ' + o.goal.date.split('-').reverse().join('.') : ''}.`);
  }
  const adj = linesOf(ops);
  if (adj.length) out.push(`${joinDe(adj).replace(/\.$/, '')}.`);
  if (ops.some(o => o.op === 'replan')) out.push('Die kommenden Wochen sind angepasst.');
  return 'Erledigt: ' + (out.join(' ') || (fallback ? fallback + '.' : 'übernommen.'));
}

/* ---------- Ziele ---------- */
const GOAL_WORDS: [RegExp, GoalType][] = [[/halbmarathon|halbmara|\bhm\b|21 ?km/, 'run_half'], [/marathon|42 ?km/, 'run_marathon'], [/\b10 ?km\b|zehn kilometer|\b10er\b/, 'run_10k'], [/\b5 ?km\b|fuenf kilometer|\b5er\b/, 'run_5k'],
  [/langdistanz|ironman|226/, 'tri_long'], [/mitteldistanz|halbdistanz|70 ?3/, 'tri_middle'], [/olympisch|kurzdistanz|\bod\b/, 'tri_olympic'], [/sprint ?triathlon|sprintdistanz|volkstriathlon|jedermann/, 'tri_sprint'], [/radmarathon|rtf|radrennen|gran ?fondo/, 'bike_event'], [/duathlon/, 'duathlon'], [/triathlon/, 'tri_sprint']];
const MONTHS = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
function dateIn(raw: string, today: string): string | null {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})?/.exec(raw);
  const y0 = +today.slice(0, 4);
  if (m) { let y = m[3] ? +m[3] : y0; let d = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; if (!m[3] && d < today) d = `${y + 1}${d.slice(4)}`; return d; }
  const mo = MONTHS.findIndex(x => raw.includes(x));
  if (mo >= 0) { const yy = /\b(20\d\d)\b/.exec(raw); let y = yy ? +yy[1] : y0; let d = `${y}-${String(mo + 1).padStart(2, '0')}-15`; if (!yy && d < today) d = `${y + 1}${d.slice(4)}`; return C.addDays(d, (7 - dowOf(d)) % 7); } // nur Monat: der Sonntag ab Monatsmitte
  return null;
}
function timeIn(raw: string): number | null {
  const a = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw); if (a) return a[3] ? +a[1] * 3600 + +a[2] * 60 + +a[3] : (+a[1] < 10 ? +a[1] * 3600 + +a[2] * 60 : +a[1] * 60 + +a[2]);
  const h = /(\d+(?:[.,]\d+)?)\s*(stunden|stunde|std|h)\b/.exec(raw); if (h) return Math.round(+h[1].replace(',', '.') * 3600);
  const mn = /(\d+)\s*(minuten|min)\b/.exec(raw); if (mn) return +mn[1] * 60;
  return null;
}
const hms = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}${x ? ':' + String(x).padStart(2, '0') : ''} h` : `${m} min`; };

/* ---------- Hauptfunktion ---------- */
export function converse(ctx: EngineCtx, dialog: DialogState, input: string, extra: Extra = {}): { reply: Reply; dialog: DialogState } {
  let reply: Reply;
  const next: DialogState = { ...dialog };
  try { reply = step(ctx, next, String(input || '').slice(0, 500), extra); }
  catch (e) { reply = clarify(ctx, [], 'Da ist bei mir etwas schiefgelaufen.'); }
  if (!reply || !reply.text || !reply.text.trim()) reply = clarify(ctx, [], '');
  next.pending = reply.pending === undefined ? null : reply.pending;
  return { reply, dialog: next };
}

function step(ctx: EngineCtx, d: DialogState, raw: string, extra: Extra): Reply {
  const toks = norm(raw).split(' ').filter(Boolean);
  // Sicherheit zuerst (Notfall, Fieber, Medikamente)
  const hits = checkMessage(raw);
  if (hits.length) {
    const h = hits[0];
    if (h.flag === 'fever' && !C.illnessAt(ctx.state.illnessPeriods, ctx.today)) return propose('sick', h.text + ' Soll ich ab heute eine Krankheitsphase eintragen?', [{ op: 'illness-start', date: ctx.today }], YES_OPTS('Ja, Krankheit eintragen'));
    return { intent: 'safety', text: h.text };
  }
  if (!toks.length) return { intent: 'empty', text: 'Schreib mir einfach, was los ist, oder tipp auf einen der Knöpfe.', options: quickOptions(ctx, d) };
  // 1) offene Rückfrage auflösen
  const p = d.pending;
  if (p && Date.now() - p.at < 60 * 60 * 1000) { const r = resolve(ctx, d, p, toks, raw); if (r) return r; }
  // 2) Einheit tagesgenau erklären (Auftrag 7): „Was genau soll ich heute beim Schwimmen machen?“, „Ich hab nur 20 min“
  const j0 = toks.join(' ');
  if (explainWanted(toks, raw) || (limitIn(j0) && /\b(hab|habe)\b/.test(j0) && !/\b(verschieb|streich|tausch)/.test(j0))) {
    const date = dayIn(toks, ctx.today) || daysOf(ctx, toks).any[0] || ctx.today;
    const ex = explainDay(ctx, date, sportIn(toks), limitIn(j0));
    const sx = (dayOf(ctx, date) ? live(dayOf(ctx, date)) : []).find((x: any) => !sportIn(toks) || x.sport === sportIn(toks));
    if (sx) d.focus = { sid: sx.id, date };
    if (ex.ops && ex.ops.length) return propose('explain', ex.text, ex.ops, [{ label: ex.yes || 'Ja, ändern', say: 'ja' }, { label: 'Nein, so lassen', say: 'nein' }]);
    return { intent: 'explain', text: ex.text, options: ex.options };
  }
  // 3) Aktionen und Plan-Wünsche
  const a = action(ctx, d, toks, raw);
  if (a) return a;
  // 3) Fragen (Wissen, Werte, Plan)
  const q = answerQuestion(ctx, raw, extra);
  if (q.intent !== 'unknown') {
    // „ändern“-Antworten mit alten Aktionen in Optionen übersetzen
    const opts: Opt[] = (q.actions || []).flatMap((x: any) => x.kind === 'go' ? [] : x.kind === 'illness-start' ? [{ label: x.label, say: 'ich bin krank' }] : x.kind === 'illness-end' ? [{ label: x.label, say: 'ich bin wieder gesund' }] : []);
    const goTo = (q.actions || []).find((x: any) => x.kind === 'go');
    return { intent: q.intent, text: q.text, options: opts.length ? opts : undefined, suggestions: q.suggestions, ...(goTo ? { go: goTo.payload } as any : {}) };
  }
  // 4) Nicht verstanden: gezielt nachfragen
  return clarify(ctx, toks, '');
}

/* ---------- Rückfragen auflösen ---------- */
function resolve(ctx: EngineCtx, d: DialogState, p: Pending, toks: string[], raw: string): Reply | null {
  // eine neue, vollständige Bitte geht vor der alten Rückfrage (Antworten auf Rückfragen sind kurz, außer Daten und Stärke)
  if (toks.length > 4 && !['period', 'goal-date', 'pain', 'rule-scope'].includes(p.kind) && !isYes(toks.slice(0, 2)) && !isNo(toks.slice(0, 2))) return null;
  if ((p.kind === 'what' || p.kind === 'which' || p.kind === 'move-day') && sportIn(toks) && toks.length > 2) {
    const cur = p.kind === 'move-day' ? [p.data.x] : (p.data.list || []);
    if (!cur.some((x: Sx) => x.s.sport === sportIn(toks))) return null;
  }
  if (toks.length > 3 && /\b(krank|urlaub|schmerz|weh|verletzt|ziel|regel|ab jetzt)\b/.test(toks.join(' ')) && p.kind !== 'period' && p.kind !== 'pain') return null;
  const day = dayIn(toks, ctx.today) || (toks.length <= 3 ? daysOf(ctx, toks).any[0] || null : null);
  if (p.kind === 'confirm') {
    if (p.data && p.data.move && day && day !== p.data.move.date) return moveTo(ctx, d, p.data.move as Sx, day, true);
    if (isYes(toks) || has(toks, ['uebernehmen', 'ja bitte'])) return apply(p.data?.intent || 'apply', p.ops || [], doneText(p.ops || [], p.data?.done));
    if (isNo(toks)) return { intent: 'cancelled', text: 'Okay, ich lasse alles, wie es ist.', pending: null, options: quickOptions(ctx, d) };
    if (p.data && p.data.move && has(toks, ['anderer tag', 'anderen tag', 'anders'])) return askDay(ctx, d, p.data.move as Sx);
    return null;
  }
  if (p.kind === 'move-day') {
    const x = p.data.x as Sx;
    if (day) return moveTo(ctx, d, x, day, true);
    if (has(toks, ['streich', 'streichen', 'ausfallen', 'weglassen', 'absagen'])) return apply('cancel', [cancelOp(ctx, [x])], `Erledigt: ${x.s.title} (${fmtD(x.date)}) entfällt.`);
    if (isNo(toks)) return { intent: 'cancelled', text: `Okay, ${x.s.title} bleibt am ${fmtD(x.date)}.`, pending: null };
    return null;
  }
  if (p.kind === 'which') {
    const list = p.data.list as Sx[];
    const n = /^(\d)$/.exec(toks[0] || ''); const byNum = n ? list[+n[1] - 1] : null;
    const sport = sportIn(toks);
    const pick = byNum || list.find(x => day && x.date === day && (!sport || x.s.sport === sport)) || (sport ? list.find(x => x.s.sport === sport) : null) || list.find(x => norm(x.s.title).split(' ').some(w => w.length > 3 && toks.includes(w)));
    if (pick) { d.focus = { sid: pick.s.id, date: pick.date }; return runVerb(ctx, d, p.data.verb, [pick], p.data, toks); }
    if (isNo(toks)) return { intent: 'cancelled', text: 'Okay, dann lasse ich alles, wie es ist.', pending: null };
    return null;
  }
  if (p.kind === 'scope') {
    if (has(toks, ['heute'])) return dayOff(ctx, d, ctx.today);
    if (has(toks, ['woche', 'ganze woche', 'diese woche'])) return weekLittle(ctx);
    if (day) return dayOff(ctx, d, day);
    return null;
  }
  if (p.kind === 'rule-scope') {
    if (has(toks, ['immer', 'ab jetzt', 'dauerhaft', 'jede woche', 'grundsaetzlich', 'regel'])) return ruleFrom(ctx, p.data.text, true);
    if (has(toks, ['diese woche', 'nur diese', 'einmalig', 'nur einmal', 'diesmal', 'nur jetzt'])) { const off = dayOff(ctx, d, p.data.date); return off; }
    return null;
  }
  if (p.kind === 'period') {
    const r = parseRules(p.data.word + ' ' + raw, ctx.today).rules.filter(x => x.kind === 'period');
    if (r.length) return ruleOps(ctx, r, `${p.data.word} ${raw}`.trim(), 'period');
    if (isNo(toks)) return { intent: 'cancelled', text: 'Okay. Sag einfach Bescheid, wenn die Daten feststehen.', pending: null };
    return null;
  }
  if (p.kind === 'pain') {
    const lvl = has(toks, ['stark', 'sehr', 'schlimm', 'heftig']) || /\b([7-9]|10)\b/.test(raw) ? 3 : has(toks, ['mittel', 'maessig']) || /\b[4-6]\b/.test(raw) ? 2 : has(toks, ['leicht', 'wenig', 'bisschen', 'kaum']) || /\b[1-3]\b/.test(raw) ? 1 : 0;
    if (lvl) return painOps(ctx, p.data.body, lvl);
    return null;
  }
  if (p.kind === 'goal-date') {
    const dt = dateIn(norm(raw).replace(/ /g, ' '), ctx.today) || dateIn(raw.toLowerCase(), ctx.today);
    if (dt) return goalOps(ctx, { ...p.data.goal, date: dt });
    if (isNo(toks)) return { intent: 'cancelled', text: 'Okay, kein neues Ziel.', pending: null };
    return null;
  }
  if (p.kind === 'what') {
    const x = (p.data.list as Sx[])[0];
    const verb = verbOf(toks);
    if (verb && x) return runVerb(ctx, d, verb, p.data.list, p.data, toks);
    return null;
  }
  return null;
}

/* ---------- Absicht erkennen ---------- */
type Verb = 'move' | 'swap' | 'shorter' | 'longer' | 'easier' | 'harder' | 'cancel';
function verbOf(t: string[]): Verb | null {
  const j = t.join(' ');
  if (has(t, ['tausch', 'tauschen', 'vertauschen', 'tauschen'])) return 'swap';
  if (has(t, ['verschieb', 'verschieben', 'verlege', 'verlegen', 'schieb', 'schieben', 'umlegen', 'legen']) || /\b(auf|nach) (montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|uebermorgen|mo|di|mi|do|fr|sa|so)\b.*\b(machen|legen|schieben|verschieben|laufen|fahren|schwimmen)\b/.test(j) || /\blieber am\b|\bstatt am\b|\bstattdessen am\b/.test(j)) return 'move';
  if (has(t, ['kuerzer', 'verkuerz', 'verkuerzen', 'kuerzen', 'weniger lang']) || /\bnur (\d+|eine|ne|halbe) (min|minuten|stunde)/.test(j)) return 'shorter';
  if (has(t, ['laenger', 'verlaengern', 'verlaenger'])) return 'longer';
  if (has(t, ['leichter', 'lockerer', 'locker', 'ruhiger', 'einfacher', 'sanfter', 'gemuetlicher', 'entspannter', 'easy']) || /nicht so hart|nicht so schnell|weniger hart|weniger intensiv/.test(j)) return 'easier';
  if (has(t, ['haerter', 'intensiver', 'schwerer', 'anspruchsvoller']) || /mehr gas|schneller machen|mehr tempo/.test(j)) return 'harder';
  if (has(t, ['streich', 'streichen', 'absagen', 'absag', 'weglassen', 'ausfallen', 'faellt aus', 'skip', 'skippen', 'auslassen', 'loeschen', 'entfallen']) || /\blass(e)? .* weg\b|\bnicht machen\b|kein bock|keine lust/.test(j)) return 'cancel';
  return null;
}
function action(ctx: EngineCtx, d: DialogState, toks: string[], raw: string): Reply | null {
  const j = toks.join(' ');
  // Schwimmen: „ich schaffe jetzt 100 m Kraul am Stück“ → eintragen und alle kommenden Schwimmeinheiten neu stufen
  const sw = parseSwimSkill(raw);
  if (sw) {
    const u = swimSkillUpdate(ctx.profile, ctx.baseWeeks, ctx.state.adjustments || {}, ctx.today, sw, ctx.now, 'Coach-Chat');
    if (!u) return { intent: 'swim-skill', text: `Das ist schon eingetragen: ${(ctx.profile.skills || {}).swimCrawlM || 0} m Kraul am Stück${(ctx.profile.skills || {}).swimPullM ? `, ${(ctx.profile.skills || {}).swimPullM} m mit Pull Buoy` : ''}. Deine Schwimmeinheiten passen schon dazu.` };
    return apply('swim-skill', [{ op: 'swim-skill', skills: u.skills }, ...(u.adjustments.length ? [{ op: 'adjust', adj: u.adjustments } as Op] : [])], 'Super! ' + u.text);
  }
  const illNow = C.illnessAt(ctx.state.illnessPeriods, ctx.today);
  // Gesund / krank
  if (has(toks, ['wieder gesund', 'wieder fit', 'symptomfrei', 'nicht mehr krank', 'bin gesund', 'geht wieder', 'gesund'])) {
    if (!illNow) return { intent: 'healthy', text: 'Schön! Du bist nicht als krank eingetragen, der Plan läuft normal weiter.' };
    return propose('healthy', 'Schön! Soll ich die Krankheitsphase mit gestern beenden? Dann beginnt heute der Wiedereinstieg: die ersten Tage nur locker.', [{ op: 'illness-end', date: C.addDays(ctx.today, -1) }], YES_OPTS('Ja, Krankheit beenden'));
  }
  if (has(toks, ['krank', 'erkaeltet', 'erkaeltung', 'grippe', 'halsschmerzen', 'schnupfen', 'husten', 'corona', 'covid', 'infekt', 'magen darm', 'uebel', 'kopfweh', 'kopfschmerzen', 'migraene', 'nicht gut', 'schlecht drauf', 'unwohl', 'angeschlagen']) && !has(toks, ['nicht mehr', 'wieder gesund'])) {
    if (illNow) return { intent: 'sick', text: 'Du bist schon als krank eingetragen. Schlafen, trinken, genug essen. Sag mir Bescheid, wenn du 24 Stunden ohne Symptome bist, dann starten wir in Stufen.', options: [{ label: 'Wieder gesund', say: 'Ich bin wieder gesund' }] };
    const mild = has(toks, ['nicht gut', 'unwohl', 'angeschlagen', 'schlecht drauf', 'kopfweh', 'kopfschmerzen']) && !has(toks, ['krank', 'fieber', 'grippe']);
    if (mild) {
      const e = easyToday(ctx);
      return { intent: 'unwell', text: `Gute Besserung! Wenn du dich nur etwas schlapp fühlst, reicht heute locker oder Pause. Bist du richtig krank (Fieber, Halsweh, Gliederschmerzen), trage ich eine Krankheitsphase ein.`, pending: { kind: 'confirm', at: Date.now(), ops: e.length ? [{ op: 'adjust', adj: e }] : [], data: { done: 'heute nur locker' } },
        options: [...(e.length ? [{ label: 'Heute nur locker', say: 'ja' }] : []), { label: 'Ich bin richtig krank', say: 'Ich bin krank' }, { label: 'Heute ganz frei', say: 'heute frei' }] };
    }
    return propose('sick', 'Gute Besserung! Soll ich ab heute eine Krankheitsphase eintragen? Dann pausiert der Plan, und danach steigen wir in Stufen wieder ein. Bei Fieber gilt: kein Training.', [{ op: 'illness-start', date: ctx.today }], [{ label: 'Ja, Krankheit eintragen', say: 'ja' }, { label: 'Nur heute locker', say: 'heute nur locker' }, { label: 'Nein', say: 'nein' }]);
  }
  // Während einer Krankheitsphase: Fragen nach Training beantwortet der Coach zur Krankheit, statt den Plan zu ändern
  if (illNow && /^(kann|darf|soll|koennte|duerfte|sollte) ich\b|\b(wieder|schon) (trainieren|laufen|schwimmen|radfahren|rad fahren|fahren|sport)\b/.test(j) && !verbOf(toks.filter(x => x !== 'locker' && x !== 'lockerer'))) {
    const days = Math.round((Date.parse(ctx.today) - Date.parse(illNow.start)) / 86400000) + 1;
    return { intent: 'sick-question', text: `Du bist seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} als krank eingetragen${illNow.note ? ` (${illNow.note})` : ''}. Solange du krank bist: kein Training, bei Fieber erst recht nicht. Wenn du 24 Stunden ohne Fieber und ohne Symptome bist, tipp auf „Wieder gesund“. Dann beginnt der Wiedereinstieg in Stufen: die ersten Tage nur locker und kurz.`,
      options: [{ label: 'Wieder gesund', say: 'Ich bin wieder gesund' }, { label: 'Immer noch krank', say: 'Ich bin noch krank' }] };
  }
  // Schmerzen / Verletzung
  const body = bodyIn(toks);
  if ((body && has(toks, ['schmerz', 'schmerzen', 'weh', 'zwickt', 'zieht', 'tut', 'verletzt', 'probleme', 'beschwerden', 'entzuendet', 'umgeknickt', 'gezerrt', 'zerrung'])) || has(toks, ['verletzt', 'verletzung', 'umgeknickt', 'zerrung', 'gezerrt'])) {
    const b = body || 'Verletzung';
    return { intent: 'pain', text: `Danke, dass du es sagst. Wie stark sind die Schmerzen (${b})?`, pending: { kind: 'pain', at: Date.now(), data: { body: b } },
      options: [{ label: 'Leicht (1-3)', say: 'leicht' }, { label: 'Mittel (4-6)', say: 'mittel' }, { label: 'Stark (7-10)', say: 'stark' }] };
  }
  // Urlaub, Prüfungen, Reise: Zeitraum
  const periodWord = /\b(urlaub|ferien|verreist|reise|dienstreise|pruefung|pruefungen|klausur|klausuren|examen|abi|lernphase)\b/.exec(j);
  if (periodWord && !has(toks, ['wann', 'was'])) {
    const r = parseRules(raw, ctx.today).rules.filter(x => x.kind === 'period');
    if (r.length) return ruleOps(ctx, r, raw, 'period');
    return { intent: 'period', text: `Von wann bis wann ist ${/pruef|klausur|examen|abi|lern/.test(periodWord[1]) ? 'die Prüfungszeit' : 'der Urlaub'}? Zum Beispiel „vom 20.12. bis 6.1.“.`, pending: { kind: 'period', at: Date.now(), data: { word: periodWord[1] } },
      options: [{ label: 'Nächste Woche', say: 'nächste Woche' }, { label: 'Diese Woche', say: 'diese Woche' }, { label: 'Abbrechen', say: 'nein' }] };
  }
  // Neue dauerhafte Einschränkung („ab jetzt mittwochs kein Laufen“)
  const ruleish = /\b(ab jetzt|ab sofort|in zukunft|kuenftig|immer|grundsaetzlich|jede woche|dauerhaft|generell)\b/.test(j) || /\b(montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags|wochentags|werktags|am wochenende nie)\b/.test(j);
  const pr = parseRules(raw, ctx.today);
  const dayRules = pr.rules.filter(r => ['onlyDays', 'neverDays', 'dayOff', 'maxDay', 'placeDays', 'prefer', 'body'].includes(r.kind));
  if (ruleish && dayRules.length && !verbOf(toks)) return ruleOps(ctx, dayRules, raw, 'rule');
  // Keine Zeit
  const ds = daysOf(ctx, toks);
  const noTime = /\bkeine zeit\b|\bkann (ich )?(am|an dem|da|heute|morgen)? ?(nicht|net|ned)\b|\bverhindert\b|\bschaffe? (es )?(heute|morgen|am \w+)? ?nicht\b|\bbin (unterwegs|nicht da|weg)\b|\bhab (da|dann) (was|termin)\b|\btermin\b/.test(j) || has(toks, ['keine zeit']);
  if (noTime && !verbOf(toks)) {
    if (/\b(diese woche|die woche|ganze woche)\b/.test(j)) return weekLittle(ctx);
    if (ds.from) {
      if (ruleish && dayRules.length) return { intent: 'rule-scope', text: `Gilt das nur diese Woche oder ab jetzt immer?`, pending: { kind: 'rule-scope', at: Date.now(), data: { text: raw, date: ds.from } }, options: [{ label: 'Nur diese Woche', say: 'nur diese Woche' }, { label: 'Ab jetzt immer', say: 'ab jetzt immer' }] };
      return dayOff(ctx, d, ds.from);
    }
    return { intent: 'scope', text: 'Meinst du heute oder die ganze Woche?', pending: { kind: 'scope', at: Date.now() }, options: [{ label: 'Heute', say: 'heute' }, { label: 'Morgen', say: 'morgen' }, { label: 'Die ganze Woche', say: 'die ganze Woche' }] };
  }
  // Tag frei
  if (/\b(tag frei|frei haben|freien tag|ruhetag|pause machen|heute frei|pause heute|heute pause)\b/.test(j) && !verbOf(toks)) return dayOff(ctx, d, ds.from || ctx.today, 'Wunsch: Tag frei');
  // Woche leichter / wenig Zeit
  if (/\b(woche)\b/.test(j) && (has(toks, ['leichter', 'lockerer', 'weniger', 'ruhiger', 'entspannter']) || /zu viel|zu hart|zu anstrengend/.test(j))) return weekScale(ctx, 0.85, 'Woche leichter');
  if (/\b(woche)\b/.test(j) && /wenig zeit|stressig|stress|viel los|kaum zeit/.test(j)) return weekLittle(ctx);
  if (/zu viel|zu hart|zu anstrengend|ueberfordert|schaffe das nicht/.test(j) && !verbOf(toks)) return weekScale(ctx, 0.9, 'Woche leichter');
  if (/zu leicht|zu wenig|unterfordert|kann mehr/.test(j) && !verbOf(toks)) return weekScale(ctx, 1.1, 'Woche schwerer');
  // Ziel
  const goal = goalFrom(ctx, raw, toks);
  if (goal) return goal;
  // Fragen („Warum soll ich heute locker …?“) beantwortet das Wissen, nicht eine Änderung
  if (['warum', 'wieso', 'weshalb', 'was', 'wie', 'wann', 'welche', 'welcher', 'welches', 'wo', 'wieviel', 'wozu'].includes(toks[0])) return null;
  // Einheit ändern
  const verb = verbOf(toks);
  if (verb) {
    if (verb === 'swap' && ds.from && ds.to) return swapDays(ctx, ds.from, ds.to);
    if (verb === 'swap' && !ds.to) {
      const src = pickSessions(ctx, toks, ds.from, d);
      if (src.length) return { intent: 'swap', text: `Mit welchem Tag soll ich ${src.length === 1 ? src[0].s.title + ' (' + fmtD(src[0].date) + ')' : fmtD(src[0].date)} tauschen?`, pending: { kind: 'move-day', at: Date.now(), data: { x: src[0] } }, options: dayOptions(ctx, src[0]) };
    }
    const list = pickSessions(ctx, toks, ds.from, d);
    if (!list.length) return noSession(ctx, toks, ds.from, verb);
    if (list.length > 1 && verb !== 'cancel' && verb !== 'easier') return { intent: 'which', text: 'Welche Einheit meinst du?', pending: { kind: 'which', at: Date.now(), data: { verb, list, to: ds.to, raw } }, options: list.map((x, i) => ({ label: label(x), say: String(i + 1) })) };
    d.focus = { sid: list[0].s.id, date: list[0].date };
    return runVerb(ctx, d, verb, list, { to: ds.to, raw }, toks);
  }
  // „Kann ich den langen Lauf am Sonntag machen?“
  if (ds.to || (ds.from && /\b(machen|laufen|fahren|schwimmen)\b/.test(j) && /\b(kann|koennte|darf|geht)\b/.test(j) && sportIn(toks))) {
    const target = ds.to || ds.from!;
    const list = pickSessions(ctx, toks, ds.to ? ds.from : null, d).filter(x => x.date !== target);
    if (list.length === 1) return moveTo(ctx, d, list[0], target, false);
  }
  return null;
}

function runVerb(ctx: EngineCtx, d: DialogState, verb: Verb, list: Sx[], data: any, toks: string[]): Reply {
  const rules = rulesFor(ctx);
  const x = list[0];
  const raw = norm(data.raw || '');
  const mins = /\b(?:auf|nur|noch)? ?(\d{2,3}) ?(min|minuten)\b/.exec(raw);
  if (verb === 'move') return data.to ? moveTo(ctx, d, x, data.to, false) : askDay(ctx, d, x);
  if (verb === 'swap') return askDay(ctx, d, x);
  if (verb === 'cancel') return withMove(propose('cancel', `${joinDe(list.map(label))} streichen?${list.length === 1 && C.isKey(x.s) ? ' Es ist eine wichtige Einheit, ich kann sie stattdessen auch verschieben.' : ''}`, [cancelOp(ctx, list)], [{ label: 'Ja, streichen', say: 'ja' }, ...(list.length === 1 ? [{ label: 'Lieber verschieben', say: 'anderer Tag' }] : []), { label: 'Nein', say: 'nein' }]), list.length === 1 ? x : null);
  if (verb === 'easier') {
    const hard = list.filter(y => C.isHard(y.s) || (y.s.plannedMinutes || 0) > 60);
    if (!hard.length) return { intent: 'easier', text: `${joinDe(list.map(label))} ${list.length > 1 ? 'sind' : 'ist'} schon locker. Soll ich es kürzer machen oder ganz streichen?`, pending: { kind: 'what', at: Date.now(), data: { list } }, options: [{ label: 'Kürzer', say: 'kürzer' }, { label: 'Streichen', say: 'streichen' }, { label: 'So lassen', say: 'nein' }] };
    return propose('easier', `${joinDe(hard.map(label))} locker statt hart, höchstens 45 min?`, [easyOp(ctx, hard)]);
  }
  if (verb === 'shorter' || verb === 'longer') {
    const target = mins ? +mins[1] : null;
    const f = verb === 'shorter' ? 0.75 : 1.2;
    if (verb === 'longer') {
      const want = target || Math.round((x.s.plannedMinutes || 45) * f / 5) * 5;
      if (!C.ruleOk(rules, { ...x.s, plannedMinutes: want }, x.date, live(dayOf(ctx, x.date)))) return { intent: 'longer', text: `Länger geht an dem Tag nicht: ${blockReason(rules, { ...x.s, plannedMinutes: want }, x.date) ? 'deine Regel ' + blockReason(rules, { ...x.s, plannedMinutes: want }, x.date) : 'deine Zeit für den Tag ist sonst überschritten'}.`, options: [{ label: 'Auf anderen Tag', say: 'verschieben' }] };
    }
    const op = scaleOp(ctx, [x], f, 'Wunsch im Coach-Chat', target || undefined);
    if (!op.adj.length) return { intent: verb, text: `${x.s.title} hat keine feste Dauer, die ich ändern kann.` };
    return propose(verb, `${op.adj[0].what}?`, [op]);
  }
  if (verb === 'harder') {
    const h = hardOp(ctx, x, rules);
    if (!h.op) return { intent: 'harder', text: `Härter mache ich ${x.s.title} lieber nicht: ${h.why}.`, options: [{ label: 'Etwas länger statt härter', say: 'länger' }] };
    return propose('harder', `${h.op.op === 'adjust' ? h.op.adj[0].what : ''}?`, [h.op]);
  }
  return clarify(ctx, toks, '');
}
function withMove(r: Reply, x: Sx | null): Reply { if (x && r.pending) r.pending.data = { ...(r.pending.data || {}), move: x }; return r; }
function noSession(ctx: EngineCtx, toks: string[], date: string | null, verb: Verb): Reply {
  const sport = sportIn(toks);
  const next = upcoming(ctx, 8).filter(x => !sport || x.s.sport === sport).slice(0, 3);
  const where = date ? `Am ${fmtD(date)}` : 'In den nächsten Tagen';
  if (!next.length) return { intent: 'no-session', text: `${where} finde ich keine passende Einheit${sport ? ' dieser Sportart' : ''}. Was soll ich tun?`, options: quickOptions(ctx, {}) };
  return { intent: 'which', text: `${where} steht ${sport ? 'keine solche Einheit' : 'nichts'} an, das ich ändern kann. Meinst du eine davon?`, pending: { kind: 'which', at: Date.now(), data: { verb, list: next, raw: toks.join(' ') } }, options: next.map((x, i) => ({ label: label(x), say: String(i + 1) })) };
}
function dayOptions(ctx: EngineCtx, x: Sx): Opt[] {
  const rules = rulesFor(ctx);
  return [...allowedDays(ctx, x, rules).slice(0, 3).map(dt => ({ label: fmtD(dt), say: DOWL[dowOf(dt)] })), { label: 'Streichen', say: 'streichen' }];
}
function askDay(ctx: EngineCtx, d: DialogState, x: Sx): Reply {
  const opts = dayOptions(ctx, x);
  d.focus = { sid: x.s.id, date: x.date };
  if (opts.length === 1) return { intent: 'move', text: `Für ${x.s.title} finde ich diese Woche keinen anderen erlaubten Tag. Soll ich die Einheit streichen?`, pending: { kind: 'move-day', at: Date.now(), data: { x } }, options: [{ label: 'Ja, streichen', say: 'streichen' }, { label: 'Nein', say: 'nein' }] };
  const names = opts.slice(0, -1).map(o => o.label);
  return { intent: 'move', text: `Soll ich ${x.s.title} (${fmtD(x.date)}) auf ${names.length > 1 ? names.slice(0, -1).join(', ') + ' oder ' + names[names.length - 1] : names[0]} legen?`, pending: { kind: 'move-day', at: Date.now(), data: { x } }, options: opts };
}
/* Verschieben auf einen Tag: nie gegen eine harte Regel; bei schon gewähltem Tag direkt ausführen (die Frage war die Vorschau) */
function moveTo(ctx: EngineCtx, d: DialogState, x: Sx, to: string, chosen: boolean): Reply {
  const rules = rulesFor(ctx);
  if (to === x.date) return { intent: 'move', text: `${x.s.title} liegt schon am ${fmtD(to).replace(/.$/, '')}. Auf welchen Tag soll die Einheit?`, pending: { kind: 'move-day', at: Date.now(), data: { x } }, options: dayOptions(ctx, x) };
  if (to < ctx.today) return { intent: 'move', text: 'In die Vergangenheit kann ich nichts verschieben.', options: dayOptions(ctx, x) };
  if (!dayOf(ctx, to)) return { intent: 'move', text: `Für ${fmtD(to)} gibt es noch keinen Plan.`, options: dayOptions(ctx, x) };
  const block = blockReason(rules, x.s, to);
  if (block) return { intent: 'move', text: `${fmtD(to)} geht nicht wegen deiner Regel ${block}.${dayOptions(ctx, x).length > 1 ? ' Möglich wäre:' : ' Einen anderen erlaubten Tag gibt es diese Woche nicht.'}`, pending: { kind: 'move-day', at: Date.now(), data: { x } }, options: dayOptions(ctx, x) };
  const there = live(dayOf(ctx, to));
  if (!C.ruleOk(rules, x.s, to, there)) return { intent: 'move', text: `Am ${fmtD(to)} wäre es zu lang für deine Tagesgrenze. Möglich wäre:`, pending: { kind: 'move-day', at: Date.now(), data: { x } }, options: dayOptions(ctx, x) };
  const same = there.find((y: any) => y.sport === x.s.sport && own(y) && y.id !== x.s.id);
  if (same) {
    const op = swapOps(ctx, [x], [{ s: same, date: to }]);
    return withMove(propose('swap', `Am ${fmtD(to)} ist schon ${same.title}. Soll ich die beiden tauschen?`, [op], YES_OPTS('Ja, tauschen')), x);
  }
  const hardNear = C.isHard(x.s) && [C.addDays(to, -1), to, C.addDays(to, 1)].some(dd => live(dayOf(ctx, dd)).some((y: any) => y.id !== x.s.id && C.isHard(y)));
  const op = moveOp(ctx, x, to);
  d.focus = { sid: x.s.id, date: to };
  if (chosen && !hardNear) return apply('move', [op], `Erledigt: ${x.s.title} liegt jetzt am ${fmtD(to).replace(/\.$/, '')}.`);
  return withMove(propose('move', `${x.s.title} von ${fmtD(x.date)} auf ${fmtD(to)} verschieben?${hardNear ? ' Achtung: dann liegen zwei harte Einheiten direkt nebeneinander.' : ''}`, [op], [{ label: 'Ja, verschieben', say: 'ja' }, { label: 'Anderer Tag', say: 'anderer Tag' }, { label: 'Nein', say: 'nein' }]), x);
}
function swapOps(ctx: EngineCtx, a: Sx[], b: Sx[]): Op {
  const g = gid(ctx); const adj: any[] = [];
  const da = a[0].date, db = b[0].date;
  a.forEach(x => adj.push({ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: da, to: db, what: `${x.s.title}: ${fmtD(da)} → ${fmtD(db)}`, reason: 'Tage getauscht' }));
  b.forEach(x => adj.push({ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: db, to: da, what: `${x.s.title}: ${fmtD(db)} → ${fmtD(da)}`, reason: 'Tage getauscht' }));
  return { op: 'adjust', adj };
}
function swapDays(ctx: EngineCtx, a: string, b: string): Reply {
  const rules = rulesFor(ctx);
  const la = live(dayOf(ctx, a)).filter((s: any) => own(s) && !done(ctx, s)).map((s: any) => ({ s, date: a }));
  const lb = live(dayOf(ctx, b)).filter((s: any) => own(s) && !done(ctx, s)).map((s: any) => ({ s, date: b }));
  if (!la.length && !lb.length) return { intent: 'swap', text: `Am ${fmtD(a)} und ${fmtD(b)} ist nichts zum Tauschen geplant.` };
  if (a < ctx.today || b < ctx.today) return { intent: 'swap', text: 'Tage in der Vergangenheit tausche ich nicht mehr.' };
  for (const x of la) { const r = blockReason(rules, x.s, b); if (r) return { intent: 'swap', text: `Tauschen geht nicht: ${x.s.title} am ${fmtD(b)} bricht deine Regel ${r}.` }; }
  for (const x of lb) { const r = blockReason(rules, x.s, a); if (r) return { intent: 'swap', text: `Tauschen geht nicht: ${x.s.title} am ${fmtD(a)} bricht deine Regel ${r}.` }; }
  const g = gid(ctx);
  const op: Op = { op: 'adjust', adj: [
    ...la.map((x: Sx) => ({ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: a, to: b, what: `${x.s.title}: ${fmtD(a)} → ${fmtD(b)}`, reason: 'Tage getauscht' })),
    ...lb.map((x: Sx) => ({ id: `${g}-${x.s.id}`, group: g, type: 'move', sessionId: x.s.id, from: b, to: a, what: `${x.s.title}: ${fmtD(b)} → ${fmtD(a)}`, reason: 'Tage getauscht' }))] };
  return propose('swap', `${fmtD(a)} und ${fmtD(b)} tauschen? ${joinDe(linesOf([op]))}.`, [op], YES_OPTS('Ja, tauschen'));
}
function dayOff(ctx: EngineCtx, d: DialogState, date: string, why?: string): Reply {
  const r = dayOffOps(ctx, date, why);
  if (!r.op) return { intent: 'day-off', text: `Am ${fmtD(date)} ist nichts geplant, das ich verschieben müsste. Genieß den freien Tag!` };
  const one = r.op.op === 'adjust' && r.op.adj.length === 1 ? r.op.adj[0] : null;
  if (one && one.type === 'move') {
    // wie im Gespräch: „Soll ich den Lauf auf Donnerstag oder Samstag legen?“
    const x = live(dayOf(ctx, date)).filter((s: any) => s.id === one.sessionId).map((s: any) => ({ s, date }))[0];
    if (x) return askDay(ctx, d, x);
  }
  return propose('day-off', `Vorschlag für ${fmtD(date)}: ${joinDe(r.lines)}. Passt das?`, [r.op], YES_OPTS('Ja, so umplanen'));
}
function weekScale(ctx: EngineCtx, f: number, why: string): Reply {
  const list = weekRest(ctx);
  if (!list.length) return { intent: 'week', text: 'Diese Woche ist nichts mehr offen, das ich ändern könnte.' };
  if (f > 1) {
    const rules = rulesFor(ctx);
    const ok = list.filter(x => C.ruleOk(rules, { ...x.s, plannedMinutes: Math.round(x.s.plannedMinutes * f / 5) * 5 }, x.date, live(dayOf(ctx, x.date))));
    if (!ok.length) return { intent: 'week', text: 'Mehr passt diese Woche nicht in deine Zeiten und Regeln.' };
    return propose('week-harder', `Die restlichen Einheiten dieser Woche um 10 % verlängern (${ok.length} Einheiten)? Mehr als 10 % pro Woche ist riskant.`, [scaleOp(ctx, ok, f, why)]);
  }
  return propose('week-easier', `Die restlichen ${list.length} Einheiten dieser Woche um ${Math.round((1 - f) * 100)} % kürzen?`, [scaleOp(ctx, list, f, why)]);
}
function weekLittle(ctx: EngineCtx): Reply {
  const list = weekRest(ctx);
  if (!list.length) return { intent: 'week', text: 'Diese Woche ist nichts mehr offen. Für die nächste Woche: sag mir, an welchen Tagen du keine Zeit hast.' };
  const keys = list.filter(x => C.isKey(x.s)).slice(0, 2);
  const rest = list.filter(x => !keys.includes(x));
  const ops: Op[] = [scaleOp(ctx, keys, 0.75, 'Woche mit wenig Zeit')];
  if (rest.length) ops.push({ op: 'adjust', adj: rest.map(x => { const m = Math.min(30, x.s.plannedMinutes || 30); const g = gid(ctx); const rb = !x.s.stage ? W.rebuildScaled(x.s, m / (x.s.plannedMinutes || m)) : null; return { id: `${g}-${x.s.id}`, group: g, type: 'modify', sessionId: x.s.id, set: rb || { plannedMinutes: m }, what: `${x.s.title} (${fmtD(x.date)}): nur ${(rb && rb.plannedMinutes) || m} min`, reason: 'Woche mit wenig Zeit' }; }) });
  return propose('week-little', `Woche mit wenig Zeit: die wichtigsten Einheiten bleiben (etwas kürzer), alles andere wird zu kurzen Einheiten von höchstens 30 min. Übernehmen?`, ops);
}
function painOps(ctx: EngineCtx, body: string, lvl: number): Reply {
  const pr = parseRules(`${body}: Schmerzen`, ctx.today).rules.filter(r => r.kind === 'body');
  const rules = pr.length ? pr : parseRules('Schmerzen', ctx.today).rules;
  const e = easyToday(ctx);
  const ops: Op[] = [{ op: 'add-rules', rules, text: `${body}: Beschwerden seit ${ctx.today.split('-').reverse().join('.')}` }, { op: 'replan', reason: 'Beschwerden' }];
  if (lvl >= 3) {
    const next = upcoming(ctx, 3).filter(x => x.s.sport === 'run' || C.isHard(x.s));
    if (next.length) ops.push(cancelOp(ctx, next, `${body}: starke Schmerzen`));
    return propose('injury', `Bei starken Schmerzen bitte nicht trainieren und ärztlich anschauen lassen. Ich streiche ${next.length ? joinDe(next.map(label)) : 'nichts weiter'} und plane die kommenden Wochen schonender (${joinDe(rules.map(ruleText))}). Übernehmen?`, ops);
  }
  if (e.length) ops.push({ op: 'adjust', adj: e });
  return propose('pain', `Dann plane ich schonender: ${joinDe(rules.map(ruleText))}.${e.length ? ' Heute machst du nur locker.' : ''} Bei Schmerzen über 2 von 10 lieber nichts Hartes. Wird es nicht besser: bitte ärztlich anschauen lassen. Übernehmen?`, ops);
}
/* Neue Regeln oder Zeiträume: dauerhaft über das Regel-Modell, danach neu planen */
function ruleOps(ctx: EngineCtx, rules: Rule[], text: string, kind: 'rule' | 'period'): Reply {
  const lines = rules.map(ruleText);
  return propose(kind, `${kind === 'period' ? 'Verstanden' : 'Neue Regel'}: ${joinDe(lines)}. ${kind === 'period' ? 'In dem Zeitraum plane ich entsprechend um.' : 'Sie gilt ab jetzt dauerhaft, die kommenden Wochen plane ich danach um.'} Stimmt das?`,
    [{ op: 'add-rules', rules, text }, { op: 'replan', reason: kind === 'period' ? 'Zeitraum eingetragen' : 'neue Regel' }], [{ label: 'Stimmt', say: 'ja' }, { label: 'Nein', say: 'nein' }]);
}
function ruleFrom(ctx: EngineCtx, text: string, _always: boolean): Reply {
  const r = parseRules(text, ctx.today).rules.filter(x => x.kind !== 'info');
  if (!r.length) return { intent: 'rule', text: 'Das konnte ich nicht als Regel lesen. Trag es am besten unter Mehr → Berücksichtigungen ein, dort gibt es ein Formular.', go: 'beruecksichtigungen' } as any;
  return ruleOps(ctx, r, text, 'rule');
}
function goalFrom(ctx: EngineCtx, raw: string, toks: string[]): Reply | null {
  const j = toks.join(' '); const low = raw.toLowerCase();
  const timeWish = /\b(wunschzeit|zielzeit|in unter|unter \d|sub \d|schaffen in|laufen in|finishen in)\b/.test(j) && timeIn(low);
  const wantGoal = /\b(neues ziel|ziel aendern|anderes ziel|ziel hinzufuegen|ich will|ich moechte|ich plane|melde mich an|angemeldet|teilnehmen|mitmachen)\b/.test(j);
  const type = GOAL_WORDS.find(([re]) => re.test(j))?.[1] || null;
  if (timeWish && !wantGoal) {
    const sec = timeIn(low)!;
    const g = (type ? (ctx.goals || []).find(x => x.type === type && !x.result) : null) || mainGoal(ctx.goals, ctx.today);
    if (!g) return { intent: 'goal', text: 'Du hast noch kein Ziel. Für welchen Wettkampf ist die Wunschzeit?', go: 'profil' } as any;
    return propose('goal-time', `Wunschzeit für ${g.name} auf ${hms(sec)} setzen?`, [{ op: 'goal', goal: { ...g, targetTimeSec: sec, outcome: 'time' } as Goal }, { op: 'replan', reason: 'Wunschzeit geändert' }]);
  }
  if (!wantGoal || !type) return wantGoal && /\bziel\b/.test(j) ? { intent: 'goal', text: 'Welches Ziel? Zum Beispiel „Ich will im April einen Halbmarathon laufen“.', options: [{ label: 'Halbmarathon', say: 'Ich will einen Halbmarathon laufen' }, { label: '10 km', say: 'Ich will 10 km laufen' }, { label: 'Triathlon', say: 'Ich will einen Sprint-Triathlon machen' }] } : null;
  const date = dateIn(j, ctx.today);
  const sec = timeIn(low.replace(/\b\d+ ?km\b/g, '').replace(/\d{1,2}\.\s*\d{1,2}\.(\d{4})?/g, ''));
  const name = (GOALS as any)[type] ? ({ run_half: 'Halbmarathon', run_marathon: 'Marathon', run_10k: '10 km', run_5k: '5 km', tri_long: 'Langdistanz', tri_middle: 'Mitteldistanz', tri_olympic: 'Olympische Distanz', tri_sprint: 'Sprint-Triathlon', bike_event: 'Radmarathon', duathlon: 'Duathlon' } as any)[type] || type : type;
  const hasA = (ctx.goals || []).some(g => g.priority === 'A' && !g.result && (!g.date || g.date >= ctx.today));
  const goal: any = { id: 'goal-chat-' + ctx.now, type, name, priority: hasA ? 'B' : 'A', ...(sec ? { targetTimeSec: sec, outcome: 'time' } : { outcome: 'finish' }) };
  if (!date) return { intent: 'goal', text: `${name}: wann ist der Wettkampf? Zum Beispiel „am 12.4.“ oder „im April“.`, pending: { kind: 'goal-date', at: Date.now(), data: { goal } } };
  return goalOps(ctx, { ...goal, date });
}
function goalOps(ctx: EngineCtx, goal: any): Reply {
  if (goal.date < ctx.today) return { intent: 'goal', text: 'Das Datum liegt in der Vergangenheit. Wann genau ist der Wettkampf?', pending: { kind: 'goal-date', at: Date.now(), data: { goal } } };
  const age = ctx.profile.birthYear ? +goal.date.slice(0, 4) - ctx.profile.birthYear : null;
  const min = (GOALS as any)[goal.type]?.minAge;
  if (age != null && min && age < min) return { intent: 'goal', text: `Für ${goal.name} gilt ein Mindestalter von ${min} Jahren. Wie wäre eine kürzere Distanz?` };
  return propose('goal', `Neues Ziel: ${goal.name} am ${goal.date.split('-').reverse().join('.')} (Priorität ${goal.priority}${goal.targetTimeSec ? ', Wunschzeit ' + hms(goal.targetTimeSec) : ''}). Danach plane ich die kommenden Wochen passend um. Übernehmen?`, [{ op: 'goal', goal }, { op: 'replan', reason: 'neues Ziel' }]);
}

/* ---------- Nicht verstanden: gezielt nachfragen (D5) ---------- */
export function clarify(ctx: EngineCtx, toks: string[], pre: string): Reply {
  const ds = toks.length ? daysOf(ctx, toks) : { from: null };
  const sport = toks.length ? sportIn(toks) : null;
  const list = toks.length ? pickSessions(ctx, toks, ds.from, {}) : [];
  if ((ds.from || sport) && list.length) {
    const x = list[0];
    return { intent: 'clarify', text: `${pre ? pre + ' ' : ''}Was soll ich mit ${x.s.title} (${fmtD(x.date)}) machen?`, pending: { kind: 'what', at: Date.now(), data: { list: [x] } },
      options: [{ label: 'Verschieben', say: 'verschieben' }, { label: 'Kürzer', say: 'kürzer' }, { label: 'Lockerer', say: 'lockerer' }, { label: 'Streichen', say: 'streichen' }] };
  }
  if (ds.from) return { intent: 'clarify', text: `${pre ? pre + ' ' : ''}Was ist am ${fmtD(ds.from)}? Hast du da keine Zeit, oder geht es um etwas anderes?`, options: [{ label: 'Keine Zeit an dem Tag', say: `Am ${DOWL[dowOf(ds.from)]} habe ich keine Zeit` }, { label: 'Was steht da an?', say: `Was steht am ${DOWL[dowOf(ds.from)]} an?` }] };
  return { intent: 'unknown', text: `${pre ? pre + ' ' : ''}Das habe ich nicht genau verstanden. Geht es um heute, um deine Woche oder um deine Ziele?`, options: quickOptions(ctx, {}).slice(0, 4) };
}

/* ---------- Schnellaktionen je nach Lage (D4) ---------- */
export function quickOptions(ctx: EngineCtx, d: DialogState): Opt[] {
  if (d.pending && d.pending.options && d.pending.options.length) return d.pending.options;
  if (C.illnessAt(ctx.state.illnessPeriods, ctx.today)) return [{ label: 'Wieder gesund', say: 'Ich bin wieder gesund' }, { label: 'Immer noch krank', say: 'Ich bin noch krank' }, { label: 'Was ist erlaubt?', say: 'Kann ich trainieren?' }];
  const today = live(dayOf(ctx, ctx.today)).filter((s: any) => own(s) && !done(ctx, s));
  const out: Opt[] = [];
  if (today.length) {
    out.push({ label: 'Keine Zeit heute', say: 'Ich habe heute keine Zeit' }, { label: "Mir geht's nicht gut", say: 'Mir geht es nicht gut' });
    if (today.some((s: any) => C.isHard(s))) out.push({ label: 'Lieber locker', say: 'Mach es heute lieber locker' });
    else out.push({ label: 'Kürzer', say: 'Mach die Einheit heute kürzer' });
    out.push({ label: 'Tag tauschen', say: 'Tag tauschen' });
  } else {
    out.push({ label: 'Was steht morgen an?', say: 'Was steht morgen an?' }, { label: 'Woche leichter', say: 'Mach die Woche leichter' }, { label: 'Urlaub eintragen', say: 'Ich habe Urlaub' });
  }
  out.push({ label: 'Wie läuft mein Ziel?', say: 'Wie läuft es mit meinem Ziel?' });
  return out;
}
export { sessLine };
