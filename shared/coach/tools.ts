/* Werkzeuge des KI-Coachs (Tool Use). Jede Planänderung läuft durch dieselbe Regel-Engine wie die automatische Anpassung.
   Kleine Änderungen gelten sofort (als Anpassung mit Rückgängig), große werden als Vorschlag mit „Übernehmen“/„Ablehnen“ gespeichert.
   Verstößt etwas gegen die Regeln, bekommt die KI eine Fehlermeldung und sucht eine andere Lösung. */
import * as C from '../core';
import { validateWeeks, isIntense, weekMinutes } from '../rules';
import { GOALS, type GoalType } from '../goals';
import { isMinor, progressionOf } from '../profile';
import type { EngineCtx } from './engine';
import { checkPlanCode } from './plancode';
import { rulesOf, hardViolations, describe as ruleText } from '../constraints';
import { parseFor, parseRules } from '../ruleparse';
import { explainDay } from './explain';
import { analyze, doneSessions } from './analysis';
import { zoneVerdict } from '../fields';
import { sportAllowed } from '../sports';
import { reviewItem, reviewWeek, doneItems } from './review';

export const TOOL_DEFS = [
  { name: 'get_data', description: 'Liest Daten des Athleten. what: "day" (Plan und Status eines Tages), "week" (Woche um ein Datum), "values" (Morgenwerte der letzten Tage), "sessions" (erledigte Einheiten mit allen Feldern: Dauer, Distanz, Pace, Puls, max. Puls, Pulszone, Entkopplung, Effizienz, Kadenz, Watt, Schwimm-Technik, RPE, Gefühl, geplant vs. gemacht).',
    input_schema: { type: 'object', properties: { what: { type: 'string', enum: ['day', 'week', 'values', 'sessions'] }, date: { type: 'string', description: 'JJJJ-MM-TT, Standard heute' }, days: { type: 'integer', minimum: 1, maximum: 42 } }, required: ['what'], additionalProperties: false } },
  { name: 'explain_day', description: 'Erklärt die Einheit(en) eines Tages Schritt für Schritt wie die App (Ein-/Aufwärmen, Hauptteil mit Wiederholungen, Pausen, Zonen mit den Pulswerten des Athleten, Ausklang) und berücksichtigt Krankheit, Wiedereinstieg, Ampel und Zeitgrenze. Liefert ggf. einen Änderungsvorschlag (noch nicht übernommen).',
    input_schema: { type: 'object', properties: { date: { type: 'string', description: 'JJJJ-MM-TT, Standard heute' }, sport: { type: 'string', enum: ['swim', 'bike', 'run', 'strength', 'football'] }, minutes: { type: 'integer', minimum: 10, maximum: 240, description: 'nur so viel Zeit' } }, additionalProperties: false } },
  { name: 'review_training', description: 'Bewertet erledigtes Training wie ein Trainer (Gut, Besser, Nächste Tage) mit den echten Werten: Plan gegen Messung, Puls und Zonen, Pace/Watt, Intervalle oder Dauerlauf, Entkopplung, Kadenz, Schwimm-Technik, Morgenwerte. Ohne Datum: die letzte erledigte Einheit. week true: die Woche.',
    input_schema: { type: 'object', properties: { date: { type: 'string', description: 'JJJJ-MM-TT' }, sport: { type: 'string', enum: ['swim', 'bike', 'run', 'strength', 'football'] }, week: { type: 'boolean' }, last_week: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'get_analysis', description: 'Ergebnis des Analyse-Coachs: Belastung (CTL/ATL/TSB, ACWR) und Erkenntnisse mit Begründung und Tipp (Trends wie aerobe Effizienz, zu hoher Puls, Ermüdung).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'move_session', description: 'Verschiebt eine geplante Einheit auf einen anderen Tag.',
    input_schema: { type: 'object', properties: { session_id: { type: 'string' }, to_date: { type: 'string' }, reason: { type: 'string', description: 'ein kurzer Satz Begründung in der du-Form, z. B. „Du hast am Dienstag keine Zeit.“' } }, required: ['session_id', 'to_date', 'reason'], additionalProperties: false } },
  { name: 'modify_session', description: 'Ändert eine geplante Einheit (Titel, Dauer, Zone, Beschreibung, Sport). Nur angegebene Felder ändern sich.',
    input_schema: { type: 'object', properties: { session_id: { type: 'string' }, sport: { type: 'string', enum: ['swim', 'bike', 'run', 'strength', 'football', 'rest'] }, title: { type: 'string' }, planned_minutes: { type: 'integer', minimum: 5, maximum: 600 }, zone: { type: 'string' }, description: { type: 'string' }, reason: { type: 'string', description: 'ein kurzer Satz in der du-Form' } }, required: ['session_id', 'reason'], additionalProperties: false } },
  { name: 'cancel_session', description: 'Lässt eine geplante Einheit entfallen.',
    input_schema: { type: 'object', properties: { session_id: { type: 'string' }, reason: { type: 'string', description: 'ein kurzer Satz in der du-Form' } }, required: ['session_id', 'reason'], additionalProperties: false } },
  { name: 'rebuild_week', description: 'Baut eine ganze Woche neu (großer Eingriff, wird als Vorschlag gezeigt). Alle 7 Tage angeben.',
    input_schema: { type: 'object', properties: { week_number: { type: 'integer' }, start_date: { type: 'string' }, focus: { type: 'string' }, days: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, sessions: { type: 'array', items: { type: 'object', properties: { sport: { type: 'string' }, title: { type: 'string' }, plannedMinutes: { type: 'integer' }, zone: { type: 'string' }, description: { type: 'string' } }, required: ['sport', 'title'] } } }, required: ['date', 'sessions'] } }, reason: { type: 'string' } }, required: ['week_number', 'start_date', 'days', 'reason'], additionalProperties: false } },
  { name: 'start_illness', description: 'Startet eine Krankheitsphase (Training pausiert, Einheiten zählen nicht als verpasst).',
    input_schema: { type: 'object', properties: { date: { type: 'string' }, note: { type: 'string' } }, required: ['date'], additionalProperties: false } },
  { name: 'end_illness', description: 'Beendet die laufende Krankheitsphase. date = letzter Tag mit Symptomen.',
    input_schema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'], additionalProperties: false } },
  { name: 'save_note', description: 'Speichert eine wichtige Tatsache als Langzeit-Notiz (z. B. Beschwerden, Vorlieben, Probleme). Der Athlet sieht und löscht Notizen selbst.',
    input_schema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } }, required: ['text'], additionalProperties: false } },
  { name: 'add_rule', description: 'Speichert eine dauerhafte Einschränkung des Athleten in seinen Regeln (z. B. „ab jetzt mittwochs kein Laufen“, „Schwimmbad nur donnerstags“, „Urlaub vom 20.12. bis 6.1.“). text ist der Satz in einfachen Worten. Wird als Vorschlag gezeigt; danach plant die App die kommenden Wochen neu.',
    input_schema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 }, reason: { type: 'string' } }, required: ['text'], additionalProperties: false } },
  { name: 'change_goal', description: 'Ändert oder legt ein Ziel an (großer Eingriff, wird als Vorschlag gezeigt).',
    input_schema: { type: 'object', properties: { goal_id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string', enum: Object.keys(GOALS) }, date: { type: 'string' }, priority: { type: 'string', enum: ['A', 'B', 'C'] }, target_time_min: { type: 'integer' }, reason: { type: 'string' } }, required: ['name', 'type', 'date', 'priority', 'reason'], additionalProperties: false } }
] as const;

export interface ToolChange { kind: string; key: string; data: any }
export interface ToolOutcome { result: string; isError: boolean; changes: ToolChange[]; proposal?: { title: string; text: string; changes: ToolChange[] } }
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const err = (msg: string): ToolOutcome => ({ result: msg, isError: true, changes: [] });

function effective(ctx: EngineCtx, extra: any[] = []) { return C.applyAdjustments(ctx.baseWeeks, Object.assign({}, ctx.state.adjustments, Object.fromEntries(extra.map(a => [a.id, a])))); }
function findSession(weeks: any[], id: string) {
  for (const w of weeks) for (const d of w.days || []) for (const s of d.sessions || []) if (s.id === id) return { w, d, s };
  return null;
}
/* Regeln für die betroffene Woche (plus Vorwoche als Vergleich) */
function ruleCheck(ctx: EngineCtx, weeks: any[], date: string): any[] {
  const i = weeks.findIndex(w => (w.days || []).some((d: any) => d.date === date));
  if (i < 0) return [];
  const prev = weeks.slice(Math.max(0, i - 2), i);
  return validateWeeks([weeks[i]], { minor: isMinor(ctx.profile, ctx.today), illness: ctx.state.illnessPeriods, maxIncPct: progressionOf(ctx.profile, ctx.today).incPct }, prev);
}
let seq = 0;
function adjId(prefix: string, ctx: EngineCtx) { return `ai-${prefix}-${ctx.now}-${++seq}`; }

/* opts.proposeOnly (Auftrag 16): Planänderungen der KI gelten nie sofort, sondern werden als Vorschlag zum Bestätigen gespeichert */
export function runTool(ctx: EngineCtx, name: string, input: any, opts: { proposeOnly?: boolean } = {}): ToolOutcome {
  const today = ctx.today;
  if (name === 'review_training') {
    if (input.week || input.last_week) return { result: reviewWeek(ctx, false, input.last_week ? 1 : 0).text, isError: false, changes: [] };
    const date = DATE.test(input.date || '') ? input.date : null;
    const items = doneItems(ctx, date || C.addDays(today, -13), date || today).filter(d => !input.sport || d.sport === input.sport);
    if (!items.length) return { result: `Keine erledigte Einheit${date ? ' am ' + date : ' in den letzten 14 Tagen'}${input.sport ? ' (' + input.sport + ')' : ''}. Nichts erfinden: sag dem Athleten, dass du keine findest und er sie abhaken oder die Uhr verbinden kann.`, isError: false, changes: [] };
    const list = date ? items : [items[items.length - 1]];
    return { result: list.map(d => reviewItem(ctx, d).text).join('\n\n'), isError: false, changes: [] };
  }
  const weeks = effective(ctx);
  if (name === 'get_data') {
    const date = DATE.test(input.date || '') ? input.date : today;
    if (input.what === 'day' || input.what === 'week') {
      const days = C.planDays(weeks).filter((d: any) => input.what === 'day' ? d.date === date : C.weekRange(date)[0] <= d.date && d.date <= C.weekRange(date)[1]);
      if (!days.length) return { result: 'Für dieses Datum gibt es keinen Plan.', isError: false, changes: [] };
      return { result: JSON.stringify(days.map((d: any) => ({ date: d.date, sessions: d.sessions.map((s: any) => ({ id: s.id, sport: s.sport, title: s.title, plannedMinutes: s.plannedMinutes, zone: s.zone, hard: isIntense(s), cancelled: !!s.cancelled, done: !!((ctx.state.sessions || {})[s.id] || {}).completed, skipped: !!((ctx.state.sessions || {})[s.id] || {}).skipped })) }))), isError: false, changes: [] };
    }
    const n = Math.min(42, input.days || 14);
    const from = C.addDays(date, -n);
    if (input.what === 'values') return { result: JSON.stringify((ctx.state.trend || []).filter((p: any) => p && p.date > from && p.date <= date).map((p: any) => ({ date: p.date, sleepHours: p.sleepHours, hrv: p.hrv, restingHR: p.restingHR, bodyTemp: p.bodyTemp, note: p.illness }))), isError: false, changes: [] };
    if (input.what === 'sessions') {
      // alle erledigten Einheiten mit ihren Feldern (Uhr, intervals.icu, von Hand, aus Notizen)
      const rows = doneSessions(ctx, C.addDays(from, 1), date).map(x => { const f = x.f; const zv = x.planned ? zoneVerdict(x.planned, (ctx.state.sessions || {})[x.id], ctx.profile.thresholds) : null;
        return Object.fromEntries(Object.entries({ date: x.date, sport: x.sport, title: x.title, min: f.min, km: f.km, meters: f.meters, pace: f.paceSec, pace100: f.pace100, hr: f.hr, maxHr: f.maxHr, zone: zv ? zv.text : null, decoupling: f.decoupling, efficiency: f.efficiency, cadence: f.cadence, power: f.power, spl: f.spl, longestCrawl: f.longestCrawl, technique: f.technique || null, rpe: f.rpe, feel: f.feel, deviation: f.deviation || null }).filter(([, v]) => v != null && v !== '')); });
      return { result: JSON.stringify(rows), isError: false, changes: [] };
    }
    return err('Unbekannte Abfrage.');
  }
  if (name === 'explain_day') {
    const date = DATE.test(input.date || '') ? input.date : today;
    const ex = explainDay(ctx, date, input.sport || null, input.minutes || null);
    // Auftrag 16: Änderung aus der Erklärung (wenig Zeit, krank, schlechte Werte) als Vorschlag zum Bestätigen
    const adj = (ex.ops || []).flatMap((o: any) => o.op === 'adjust' ? o.adj || [] : []);
    if (opts.proposeOnly && adj.length) return { result: ex.text + '\n[Als Vorschlag gespeichert: ' + adj.map((x: any) => x.what).join('; ') + '. Der Athlet bestätigt ihn selbst.]', isError: false, changes: [], proposal: { title: 'Vorschlag: ' + adj.map((x: any) => x.what).join('; '), text: String(adj[0].reason || ''), changes: adj.map((x: any) => ({ kind: 'adjust', key: x.id, data: { ...x, from_ai: true, createdAt: ctx.now, date: x.date || today } })) } };
    return { result: ex.text + (ex.ops && ex.ops.length ? '\n[Vorschlag, noch nicht übernommen: ' + ex.ops.flatMap((o: any) => o.op === 'adjust' ? o.adj.map((a: any) => a.what) : []).join('; ') + ']' : ''), isError: false, changes: [] };
  }
  if (name === 'get_analysis') {
    const a = analyze(ctx, 'view');
    return { result: JSON.stringify({ load: a.load, insights: a.insights.slice(0, 8).map(i => ({ title: i.title, why: i.why, tip: i.tip, tone: i.tone })) }), isError: false, changes: [] };
  }
  if (name === 'move_session' || name === 'modify_session' || name === 'cancel_session') {
    const hit = findSession(weeks, input.session_id || '');
    if (!hit) return err(`Die Einheit "${input.session_id}" gibt es nicht. Hole dir mit get_data die IDs.`);
    if (hit.d.date < today) return err('Vergangene Einheiten werden nicht mehr geändert.');
    const reason = String(input.reason || '').slice(0, 200);
    let a: any;
    if (name === 'move_session') {
      if (!DATE.test(input.to_date || '')) return err('to_date muss ein Datum JJJJ-MM-TT sein.');
      if (input.to_date < today) return err('Nicht in die Vergangenheit verschieben.');
      if (!C.planDays(weeks).some((d: any) => d.date === input.to_date)) return err('An diesem Tag gibt es keinen Plan.');
      a = { id: adjId('move', ctx), type: 'move', sessionId: hit.s.id, from: hit.d.date, to: input.to_date, what: `${hit.s.title}: auf ${input.to_date.slice(8)}.${input.to_date.slice(5, 7)}. verschoben`, reason };
    } else if (name === 'cancel_session') {
      a = { id: adjId('cancel', ctx), type: 'cancel', sessionId: hit.s.id, what: `${hit.s.title} entfällt`, reason };
    } else {
      const set: any = {};
      // Auftrag 15: nur Sportarten, die der Athlet gewählt hat (Teamsport nur, wenn angegeben)
      if (input.sport && !sportAllowed(ctx.profile, input.sport)) return err(`Abgelehnt: ${input.sport} hat der Athlet nicht gewählt. Plane nur mit seinen Sportarten (${(ctx.profile.sports || []).join(', ')}).`);
      if (input.sport) set.sport = input.sport;
      if (input.title) set.title = String(input.title).slice(0, 80);
      if (input.planned_minutes) set.plannedMinutes = input.planned_minutes;
      if (input.planned_minutes && !input.title && /\b\d{1,3} min\b/.test(hit.s.title || '')) set.title = String(hit.s.title).replace(/\b\d{1,3} min\b/, input.planned_minutes + ' min');
      if (input.zone) set.zone = String(input.zone).slice(0, 30);
      if (input.description) set.description = String(input.description).slice(0, 400);
      if (!Object.keys(set).length) return err('Es wurde nichts geändert.');
      a = { id: adjId('mod', ctx), type: 'modify', sessionId: hit.s.id, set, what: `${hit.s.title} → ${set.title || hit.s.title}${set.plannedMinutes ? ` (${set.plannedMinutes} min)` : ''}`, reason };
    }
    a.from_ai = true; a.createdAt = ctx.now; a.date = today; a.group = 'ai-' + ctx.now;
    const after = effective(ctx, [a]);
    const target = name === 'move_session' ? input.to_date : hit.d.date;
    const problems = [...ruleCheck(ctx, after, target), ...(name === 'move_session' ? ruleCheck(ctx, after, hit.d.date) : [])];
    // Verstöße, die schon vorher bestanden, zählen nur, wenn die Änderung sie verschlimmert (mehr Umfang)
    const key = (v: any) => v.rule + '|' + (v.week ?? v.date ?? '');
    const before = new Set([...ruleCheck(ctx, weeks, target), ...ruleCheck(ctx, weeks, hit.d.date)].map(key));
    const minsOf = (ws: any[], d: string) => { const w = ws.find(x => (x.days || []).some((dd: any) => dd.date === d)); return w ? weekMinutes(w) : 0; };
    const more = minsOf(after, target) > minsOf(weeks, target);
    const fresh = [...new Map(problems.filter(v => !before.has(key(v)) || ((v.rule === 'volume' || v.rule === 'runVolume') && more)).map(v => [key(v), v.msg])).values()];
    if (fresh.length) return err('Abgelehnt von der Regel-Engine: ' + fresh.join(' ') + ' Finde eine andere Lösung.');
    // harte Regeln des Athleten (Tage, Orte, Zeiträume, Tagesgrenzen) gelten auch für die KI
    const rules = rulesOf(ctx.profile, parseFor(today));
    const had = new Set(hardViolations(weeks, rules, today).map(v => v.msg));
    const broken = hardViolations(after, rules, today).filter(v => !had.has(v.msg));
    if (broken.length) return err('Abgelehnt: ' + broken[0].msg + '. Diese Regel hat der Athlet selbst festgelegt, sie darf nicht gebrochen werden. Schlage einen erlaubten Tag oder eine andere Lösung vor.');
    // groß: Dauer um mehr als 30 % höher, eine lockere Einheit wird hart
    const s2 = findSession(after, hit.s.id);
    const grows = s2 && hit.s.plannedMinutes && s2.s.plannedMinutes && s2.s.plannedMinutes > hit.s.plannedMinutes * 1.3;
    const harder = s2 && !isIntense(hit.s) && isIntense(s2.s);
    const change = { kind: 'adjust', key: a.id, data: a };
    if (grows || harder || opts.proposeOnly) return { result: 'Als Vorschlag gespeichert. Der Athlet sieht ihn im Chat und entscheidet selbst.', isError: false, changes: [], proposal: { title: 'Vorschlag: ' + a.what, text: reason, changes: [change] } };
    return { result: 'Erledigt: ' + a.what + '.', isError: false, changes: [change] };
  }
  if (name === 'rebuild_week') {
    const wrong = (input.days || []).flatMap((d: any) => (d.sessions || []).map((x: any) => x && x.sport)).filter((sp: any) => sp && !sportAllowed(ctx.profile, sp));
    if (wrong.length) return err(`Abgelehnt: ${[...new Set(wrong)].join(', ')} hat der Athlet nicht gewählt. Plane nur mit seinen Sportarten (${(ctx.profile.sports || []).join(', ')}).`);
    const code = JSON.stringify({ mode: 'merge', weeks: [{ weekNumber: input.week_number, label: 'Woche ' + input.week_number, startDate: input.start_date, focus: input.focus || '', days: (input.days || []).map((d: any) => ({ date: d.date, sessions: (d.sessions || []).map((s: any, i: number) => ({ id: `ai-w${input.week_number}-${d.date}-${i + 1}`, ...s })) })) }] });
    const chk = checkPlanCode(code, { meta: ctx.planMeta, weeks: ctx.baseWeeks }, { minor: isMinor(ctx.profile, today) });
    if (!chk.ok) return err('Abgelehnt: ' + chk.errors.join(' ') + ' Bitte anders planen.');
    if (chk.warnings.some(w => /Umfang|Laufumfang/.test(w))) return err('Abgelehnt von der Regel-Engine: ' + chk.warnings.join(' '));
    return { result: 'Als Vorschlag gespeichert. Der Athlet entscheidet.', isError: false, changes: [], proposal: { title: `Vorschlag: Woche ${input.week_number} neu`, text: String(input.reason || ''), changes: [{ kind: 'plan', key: 'main', data: chk.plan }] } };
  }
  if (name === 'start_illness') {
    if (!DATE.test(input.date || '')) return err('date fehlt.');
    if (C.illnessAt(ctx.state.illnessPeriods, input.date)) return { result: 'Es läuft schon eine Krankheitsphase.', isError: false, changes: [] };
    const p = { id: 'ill-ai-' + ctx.now, start: input.date, end: null, note: String(input.note || '').slice(0, 120) };
    return { result: 'Krankheitsphase gestartet. Training pausiert.', isError: false, changes: [{ kind: 'illness', key: p.id, data: p }] };
  }
  if (name === 'end_illness') {
    const cur = (ctx.state.illnessPeriods || []).find((p: any) => p && !p.end);
    if (!cur) return err('Es läuft keine Krankheitsphase.');
    const end = DATE.test(input.date || '') && input.date >= cur.start ? input.date : today;
    return { result: 'Krankheitsphase beendet. Ab jetzt gilt der Stufenplan.', isError: false, changes: [{ kind: 'illness', key: cur.id, data: { ...cur, end } }] };
  }
  if (name === 'save_note') {
    const text = String(input.text || '').trim().slice(0, 200);
    if (!text) return err('Leere Notiz.');
    const id = 'note-' + ctx.now + '-' + (++seq);
    return { result: 'Notiz gespeichert.', isError: false, changes: [{ kind: 'coachNote', key: id, data: { id, text, createdAt: ctx.now, from: 'ai' } }] };
  }
  if (name === 'add_rule') {
    const text = String(input.text || '').trim().slice(0, 200);
    const r = parseRules(text, today).rules.filter(x => x.kind !== 'info');
    if (!r.length) return err('Diesen Satz verstehe ich nicht als Regel. Formuliere ihn einfacher, z. B. „mittwochs kein Laufen“ oder „Urlaub vom 20.12. bis 6.1.“.');
    const prof = { ...ctx.profile, rules: [...(ctx.profile.rules || []), ...r.map(x => ({ ...x, source: 'ai' as const, text }))], notes: [...new Set([...(ctx.profile.notes || []), text])], updatedAt: ctx.now };
    return { result: 'Als Vorschlag gespeichert: ' + r.map(ruleText).join('; ') + '. Der Athlet entscheidet.', isError: false, changes: [], proposal: { title: 'Neue Regel: ' + r.map(ruleText).join('; '), text: String(input.reason || text), changes: [{ kind: 'profile', key: 'main', data: prof }] } };
  }
  if (name === 'change_goal') {
    if (!GOALS[input.type as GoalType]) return err('Unbekannte Zielart.');
    if (!DATE.test(input.date || '') || input.date < today) return err('Das Datum muss in der Zukunft liegen.');
    const age = ctx.profile.birthYear ? +input.date.slice(0, 4) - ctx.profile.birthYear : null;
    const min = GOALS[input.type as GoalType].minAge;
    if (age != null && min && age < min) return err(`Abgelehnt: Für diese Distanz gilt ein Mindestalter von ${min} Jahren. Schlage eine kürzere Distanz vor.`);
    const id = input.goal_id || 'goal-' + ctx.now;
    const prev = (ctx.goals || []).find(g => g.id === id) || {};
    const g = { ...prev, id, name: String(input.name).slice(0, 60), type: input.type, date: input.date, priority: input.priority, ...(input.target_time_min ? { targetTimeSec: input.target_time_min * 60 } : {}) };
    return { result: 'Als Vorschlag gespeichert. Der Athlet entscheidet.', isError: false, changes: [], proposal: { title: 'Vorschlag: Ziel ' + g.name, text: String(input.reason || ''), changes: [{ kind: 'goal', key: id, data: g }] } };
  }
  return err('Unbekanntes Werkzeug.');
}
