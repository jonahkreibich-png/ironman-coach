/* Auftrag 16: Coach-„Skill“ für die kostenlose KI (Cloudflare Workers AI) – und genauso für Claude, wenn hinterlegt.
   Enthält: Anweisung (System-Prompt), kompakte Zusammenfassung des Nutzers, Werkzeuge im OpenAI-Format und den Zahlen-Wächter.
   Harte Regeln und Zahlen kommen immer aus der Regel-Engine (Werkzeuge, Zusammenfassung); die KI formuliert nur.
   Oura-Daten sind vorher entfernt (aiSafeCtx auf dem Server), auch die Ampel wird ohne sie berechnet. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { readinessFallback } from './engine';
import { ageOf, isMinor } from '../profile';
import { mainGoal } from '../goals';
import { rulesOf, describe as ruleText } from '../constraints';
import { parseFor } from '../ruleparse';
import { doneItems, valsOf, isReviewQuestion, norm2 } from './review';
import { mmss } from './texts';
import { TOOL_DEFS } from './tools';
import { rulesForAi } from '../trainingknowledge';
/* Auftrag 18: Ursachen nur mit Daten (gilt für jede KI; zusätzlich prüft claims.ts jede Antwort deterministisch) */
export const CAUSE_RULE = 'Ursachen und Zusammenhänge (z. B. Schlaf → Puls, Müdigkeit → Pace, Hitze → Puls) nennst du nur, wenn beide Werte für genau diese Einheit bzw. diesen Tag in den Daten stehen und die Abweichung zur eigenen Basis wirklich besteht (z. B. Puls bei gleicher Pace mindestens 5 Schläge über dem 6-Wochen-Schnitt, Temperatur über 25 °C gemessen). Sonst höchstens neutral, z. B. „Du hast nur 5,5 h geschlafen, mach heute lieber locker.“ Kein Puls eingetragen heißt: keine Aussage über den Puls.';

const SPORT: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Teamsport', rest: 'Ruhe', walk: 'Gehen' };
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dd = (d: string) => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`;
const PHASE: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Tapering (vor dem Wettkampf weniger)', race: 'Wettkampfwoche', recovery: 'Erholung', transition: 'Übergang' };

/* Anweisung an die KI: erfahrener Ausdauer-Coach, kurz, ehrlich, Deutsch, nur echte Daten */
export function coachSkill(ctx: EngineCtx, appName: string): string {
  const age = ageOf(ctx.profile, ctx.today);
  const minor = isMinor(ctx.profile, ctx.today);
  const L = [
    `Du bist der Coach in der Trainings-App „${appName}“: ein erfahrener Ausdauer-Coach für Laufen, Radfahren, Schwimmen, Triathlon und Kraft. Heute ist ${ctx.today} (${dd(ctx.today)}).`,
    'So antwortest du:',
    '- Immer auf Deutsch, in der du-Form, kurz: höchstens 5 Sätze (etwa 80 Wörter), außer der Athlet will ausdrücklich mehr. Kein Markdown, keine Überschriften, keine Tabellen, keine Sternchen.',
    '- Ehrlich und konkret wie ein guter Trainer. Lob nur, wenn es stimmt. Wenn etwas nicht gut war, sag es freundlich.',
    '- Nutze nur die Daten unten und die Ergebnisse der Werkzeuge. Erfinde nichts: keine Zahlen, Einheiten, Termine, Messwerte oder Wettkämpfe. Puls, Pace, Watt, Minuten und Zonen übernimmst du genau so, wie sie dort stehen.',
    '- Für Fragen zu eigenen Einheiten, Werten, Terminen oder dem Plan rufst du zuerst ein Werkzeug auf (review_training, explain_day, get_data, get_analysis) statt zu raten. Nur wenn auch das Werkzeug nichts liefert, sagst du „Das weiß ich nicht“ und was fehlt. Nenne dem Athleten nie Werkzeug-Namen.',
    '- SOLL ist der Plan, IST ist, was der Athlet eingetragen hat oder was gemessen wurde. Erreicht ist nur, was als IST in den Daten oder in einem Werkzeug-Ergebnis steht. Ein Plan-Wert ist nie ein Ergebnis. Fehlt der IST-Wert, frag nach (z. B. „Wie weit bist du am Stück gekrault?“), statt den Plan-Wert zu nennen.',
    '- Frühere Coach-Nachrichten sind keine Daten. Widerspricht etwas den aktuellen Werten, gelten die aktuellen Werte. Wurde ein Wert korrigiert, nenne den neuen.',
    '- Bewerte vorsichtig: eine einzelne Einheit oder ein einzelner Wert ist noch kein Trend. Wenn Daten fehlen oder du unsicher bist, sag das offen.',
    `- ${CAUSE_RULE}`,
    '- Hilfsmittel (Kickbrett, Pull Buoy, Flossen …) nur, wenn sie unter AUSRÜSTUNG stehen. Setze nichts voraus, was fehlt.',
    '- Keine medizinischen Diagnosen und keine Medikamente. Bei Schmerzen, Verletzung, Krankheit, Fieber, Brustschmerz oder Schwindel: Training pausieren oder nur ganz locker und zum Arzt bzw. zur Ärztin raten.',
    '- Den Plan änderst du nie selbst. Für Änderungen nutzt du die Werkzeuge (move_session, modify_session, cancel_session, add_rule). Jede Änderung wird dem Athleten als Vorschlag gezeigt, er bestätigt sie selbst. Sag danach: „Ich habe dir einen Vorschlag gemacht, du kannst ihn unten bestätigen.“ Lehnt die App ab, erkläre kurz warum und nenne eine erlaubte Lösung.',
    '- Die Regeln der App gelten immer: keine zwei harten Tage hintereinander, Umfang nicht zu schnell steigern, nur die Sportarten des Athleten, seine eigenen Regeln.',
    '- Werkzeuge: „Wie war mein Training/Lauf/meine Woche?“ → review_training. „Was mache ich heute/morgen genau?“ → explain_day. Form, Müdigkeit, Trends → get_analysis. Andere Tage oder Einheiten-IDs → get_data mit what "week". Allgemeine Wissensfragen (z. B. „Was ist Zone 2?“) beantwortest du ohne Werkzeug.',
    '- Fragen zu Training, Technik (z. B. Kraul-Atmung), Zonen, Essen und Trinken rund ums Training (auch Rezept-Ideen), Material, Schlaf und Erholung beantwortest du immer, auch allgemein. Nur bei Themen ganz ohne Sport-Bezug (Fußball-Ergebnisse, Gedichte, Hausaufgaben, Unsinn) sagst du in einem Satz freundlich, dass du nur fürs Training da bist.'
  ];
  L.push(rulesForAi());
  if (minor) L.push(`- Der Athlet ist ${age} Jahre alt (minderjährig): keine Gewichtsziele, keine Diät, keine Kalorien zählen, kein Druck. Schule und Schlaf gehen vor. Bei Schmerzen immer Eltern und Arzt einbeziehen.`);
  const rs = rulesOf(ctx.profile, parseFor(ctx.today)).filter(r => !r.hidden && r.kind !== 'info');
  if (rs.length) L.push('Regeln des Athleten (nie brechen; „möglichst“ darf mit Begründung abweichen):', ...rs.map(r => '- ' + ruleText(r) + (r.strength === 'soft' ? ' (möglichst)' : '')));
  return L.join('\n');
}

/* Kompakte Zusammenfassung: Profil, Ziel, Phase, heutige Einheit, nächste Tage, letzte 7 Tage, Ampel (etwa 1.000 Tokens) */
export function compactContext(ctx: EngineCtx): string {
  const p = ctx.profile; const today = ctx.today; const L: string[] = [];
  const age = ageOf(p, today);
  const t = p.thresholds || ({} as any);
  L.push('PROFIL: ' + [age != null ? `${age} Jahre` : null, `Sportarten: ${(p.sports || []).map(s => s === 'football' ? p.teamSportName || 'Teamsport' : SPORT[s] || s).join(', ')}`, p.weeklyHours ? `${p.weeklyHours} h pro Woche` : null].filter(Boolean).join(', '));
  const thr = [(p.sports || []).includes('run') && t.lthrRun ? `Laufen Schwellenpuls ${t.lthrRun}, Schwellen-Pace ${mmss(t.thresholdPaceRunSec)}/km` : null, (p.sports || []).includes('bike') && t.lthrBike ? `Rad Schwellenpuls ${t.lthrBike}${t.ftp ? `, FTP ${t.ftp} W` : ''}` : null, (p.sports || []).includes('swim') && t.cssSec ? `Schwimmen CSS ${mmss(t.cssSec)}/100 m` : null].filter(Boolean);
  if (thr.length) L.push('SCHWELLEN: ' + thr.join('; '));
  if (p.injuries) L.push('BESCHWERDEN: ' + String(p.injuries).slice(0, 160));
  // Auftrag 17: Ausrüstung und belegtes Können (nur echte Werte)
  const sk: any = p.skills || {};
  const GEAR: Record<string, string> = { board: 'Kickbrett', buoy: 'Pull Buoy', fins: 'Flossen', paddles: 'Paddles', snorkel: 'Schnorchel' };
  if ((p.sports || []).includes('swim')) {
    L.push('AUSRÜSTUNG SCHWIMMEN: ' + ((sk.swimGear || []).map((g: string) => GEAR[g] || g).join(', ') || 'keine'));
    try { const pr = C.swimProofs(ctx.state, ctx.baseWeeks || [], today, 84).map((x: any) => x.crawl).filter(Boolean); L.push(`KÖNNEN SCHWIMMEN (IST): Kraul am Stück bestätigt ${C.confirmedOf(pr) || sk.swimCrawlM || 'unbekannt'} m${pr.length ? `, bester eingetragener Wert ${Math.max(...pr)} m` : ''}; die nächste Stufe gibt es erst, wenn die längere Strecke in 2 Einheiten geschafft ist.`); } catch (e) { /* ohne Nachweise */ }
  }
  const g = mainGoal(ctx.goals, today);
  if (g) {
    const weeks = g.date ? Math.max(0, Math.round((Date.parse(g.date) - Date.parse(today)) / (7 * 86400000))) : null;
    L.push(`ZIEL: ${g.name}${g.priority ? ` (${g.priority}-Ziel)` : ''}${g.date ? ` am ${dd(g.date)}${g.date.slice(0, 4)}, noch ${weeks} Wochen` : ''}`);
  } else L.push('ZIEL: keins eingetragen (allgemeine Fitness)');
  const more = (ctx.goals || []).filter(x => x && x !== g && !x.result && (!x.date || x.date >= today)).slice(0, 4);
  if (more.length) L.push('WEITERE ZIELE: ' + more.map(x => `${x.name}${x.priority ? ` (${x.priority})` : ''}${x.date ? ' am ' + dd(x.date) + x.date.slice(0, 4) : ' (Datum noch offen)'}`).join('; '));
  const weeks = C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {});
  const wk = weeks.find((w: any) => (w.days || []).some((d: any) => d.date === today));
  if (wk) L.push(`PHASE: ${PHASE[wk.phase] || wk.phase || '–'}${wk.isRecoveryWeek ? ', Erholungswoche' : ''}${wk.focus ? ` – ${String(wk.focus).slice(0, 100)}` : ''}`);
  const days = C.planDays(weeks);
  const st = ctx.state.sessions || {};
  const line = (s: any) => `${SPORT[s.sport] || s.sport}: ${s.title}${s.plannedMinutes && !/\d+\s*min/.test(s.title || '') ? ` (${s.plannedMinutes} min)` : ''}${s.zone ? `, ${s.zone}` : ''}${C.isIntervals(s) || C.isGame(s) ? ', hart' : ''}${s.cancelled ? ' [entfällt]' : ''}${(st[s.id] || {}).completed ? ' [erledigt]' : (st[s.id] || {}).skipped ? ' [ausgelassen]' : ''} [id ${s.id}]`;
  const plan = (from: string, n: number) => days.filter((d: any) => d.date >= from && d.date < C.addDays(from, n)).map((d: any) => {
    const l = d.sessions.filter((s: any) => s.sport !== 'rest');
    return `${dd(d.date)}: ${l.length ? l.map(line).join(' | ') : 'Ruhetag'}`;
  });
  const td = plan(today, 1); L.push('HEUTE: ' + (td[0] ? td[0].replace(/^\S+ \S+: /, '') : 'kein Plan'));
  L.push('NÄCHSTE TAGE:', ...plan(C.addDays(today, 1), 8));
  // letzte 7 Tage: erledigt mit Messwerten, ausgelassen
  L.push('LETZTE 7 TAGE:');
  const from = C.addDays(today, -7);
  const done = doneItems(ctx, from, today);
  done.forEach(d => {
    const v = valsOf(d);
    const vals = [v.min ? `${Math.round(v.min)} min` : null, v.km ? `${String(Math.round(v.km * 10) / 10).replace('.', ',')} km` : null, v.meters ? `${v.meters} m` : null, v.pace ? `${mmss(v.pace)}/km` : null, v.power ? `${Math.round(v.power)} W` : null, v.hr ? `Puls ${Math.round(v.hr)}` : null, v.rpe != null ? `Anstrengung ${v.rpe}/10` : null].filter(Boolean).join(', ');
    const crawlSoll = d.planned && d.sport === 'swim' ? Math.max(0, ...((d.planned.spec && d.planned.spec.steps) || []).filter((x: any) => x.mode === 'crawl').map((x: any) => x.m || 0)) : 0;
    const swimIst = d.sport === 'swim' ? (v.longest != null ? `, Kraul am Stück ${v.longest} m` : ', Kraul am Stück nicht eingetragen') : '';
    L.push(`- ${dd(d.date)} ${SPORT[d.sport] || d.sport}: SOLL ${d.title}${crawlSoll ? ` (Kraul-Stücke ${crawlSoll} m)` : ''} – IST erledigt${vals ? ': ' + vals : ''}${swimIst}`);
  });
  days.filter((d: any) => d.date >= from && d.date < today).forEach((d: any) => d.sessions.forEach((s: any) => {
    if (s.sport === 'rest' || s.cancelled || (st[s.id] || {}).completed) return;
    L.push(`- ${dd(d.date)} ${SPORT[s.sport] || s.sport}: ${s.title} – ${(st[s.id] || {}).skipped ? 'ausgelassen' : C.illnessAt(ctx.state.illnessPeriods, d.date) ? 'krank' : 'nicht gemacht'}`);
  }));
  if (!done.length) L.push('- keine erledigte Einheit eingetragen');
  // Ampel (ohne Oura-Werte, die sind vorher entfernt)
  try {
    const R = C.readinessFor(ctx.state.trend || [], ctx.state.illnessPeriods || [], today, readinessFallback(ctx));
    L.push('AMPEL HEUTE: ' + (C.illnessAt(ctx.state.illnessPeriods, today) ? 'krank gemeldet' : C.readinessLine(R)) + ((ctx as any).ouraHidden ? ' (Werte von Oura gibt die App nicht an die KI weiter; die vollständige Ampel steht auf der Seite „Heute“.)' : ''));
  } catch (e) { L.push('AMPEL HEUTE: keine Werte'); }
  return L.join('\n');
}

/* Werkzeuge im OpenAI-Format (Workers AI). Dieselben wie für Claude, ergänzt um review_training; nur, was der Coach wirklich braucht. */
const FREE_TOOLS = ['review_training', 'explain_day', 'get_analysis', 'get_data', 'move_session', 'modify_session', 'cancel_session', 'add_rule'];
export function openAiTools(): any[] {
  return TOOL_DEFS.filter(t => FREE_TOOLS.includes(t.name)).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/* Zahlen-Wächter: Puls, Pace, Watt, km/h und Wiederholungen in der Antwort müssen in den Daten, Werkzeug-Ergebnissen oder der Frage stehen.
   Liefert die erfundenen Angaben (leer = alles belegt). Allgemeines Wissen (Zonen-Prozente, „2-3 Tage“) wird nicht geprüft. */
export function inventedNumbers(answer: string, sources: string[]): string[] {
  const src = sources.join('\n').replace(/ /g, ' ');
  const nums = new Set<string>();
  src.replace(/\d+(?:[.,]\d+)?/g, m => { nums.add(m.replace(',', '.')); return m; });
  // auch Paces (5:30) als Ganzes
  const paces = new Set<string>(); src.replace(/\d{1,2}:\d{2}/g, m => { paces.add(m); return m; });
  const out: string[] = [];
  const txt = answer.replace(/ /g, ' ');
  const check = (re: RegExp, kind: (m: RegExpExecArray) => string[]) => { let m: RegExpExecArray | null; re.lastIndex = 0; while ((m = re.exec(txt))) { const vals = kind(m); if (vals.some(v => !(v.includes(':') ? paces.has(v) : nums.has(v)))) out.push(m[0].trim()); } };
  // Puls / bpm / Schläge
  check(/(?:Puls|Herzfrequenz|HF)\s*(?:Ø|von|bei|unter|über|um|bis|zwischen|im Schnitt)?\s*(\d{2,3})(?:\s*(?:-|–|bis|und)\s*(\d{2,3}))?/gi, m => [m[1], m[2]].filter(Boolean) as string[]);
  check(/(\d{2,3})(?:\s*(?:-|–|bis)\s*(\d{2,3}))?\s*(?:bpm|Schläge)/gi, m => [m[1], m[2]].filter(Boolean) as string[]);
  // Pace m:ss/km bzw. /100 m
  check(/(\d{1,2}:\d{2})(?:\s*(?:-|–|bis)\s*(\d{1,2}:\d{2}))?\s*(?:min)?\s*\/\s*(?:km|100)/gi, m => [m[1], m[2]].filter(Boolean) as string[]);
  // Watt und km/h
  check(/(\d{2,4})(?:\s*(?:-|–|bis)\s*(\d{2,4}))?\s*(?:W|Watt)\b/g, m => [m[1], m[2]].filter(Boolean) as string[]);
  check(/(\d{1,2}(?:[.,]\d)?)(?:\s*(?:-|–|bis)\s*(\d{1,2}(?:[.,]\d)?))?\s*km\/h/gi, m => [m[1], m[2]].filter(Boolean).map(x => x!.replace(',', '.')) as string[]);
  // Wiederholungen 5×4 min, 6 x 50 m
  check(/(\d{1,2})\s*[×x]\s*(\d{1,4})\s*(?:min|m\b|s\b|sek)/gi, m => [m[1], m[2]]);
  return [...new Set(out)];
}

/* Denk-Teile der Modelle entfernen (Gemma: <|channel>thought … <channel|>, Qwen: <think> … </think>) */
function stripThinking(t: string): string {
  return t.replace(/<\|channel\|?>[\s\S]*?<\|?channel\|>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\|?[a-z_]+\|?>/gi, '').replace(/^\s*(thought)+\s*/i, '');
}
/* Für den Strom: wie stripThinking, aber ein noch offener Denk-Teil (oder ein angefangenes „<“) wird zurückgehalten */
export function cleanPartial(t: string): string {
  let s = t.replace(/<\|channel\|?>[\s\S]*?<\|?channel\|>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = s.search(/<\|channel|<think>/); if (open >= 0) s = s.slice(0, open);
  const lt = s.lastIndexOf('<'); if (lt >= 0 && lt > s.length - 12 && !s.slice(lt).includes('>')) s = s.slice(0, lt);
  return s.replace(/<\|?[a-z_]+\|?>/gi, '').replace(/^\s*(thought)+\s*/i, '').replace(/^\s+/, '');
}
/* Antwort aufräumen: Denk-Teil (<think>), Markdown-Sternchen und Überschriften entfernen */
export function cleanAnswer(t: string): string {
  return stripThinking(String(t || '')).replace(/^\s*<\/?think>\s*/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
}

/* Erkannte Fragen bekommen das passende Werkzeug schon vom Server (kleine Modelle rufen es sonst oft nicht auf und raten):
   „Wie war mein Training?“ → review_training, „Was mache ich heute/morgen genau?“ → explain_day. Die KI formuliert dann nur. */
const DAYW: [RegExp, number][] = [[/\bmontag\b/, 1], [/\bdienstag\b/, 2], [/\bmittwoch\b/, 3], [/\bdonnerstag\b/, 4], [/\bfreitag\b/, 5], [/\bsamstag\b/, 6], [/\bsonntag\b/, 0]];
const SPORTW: [RegExp, string][] = [[/\b(lauf\w*|joggen|gelaufen)\b/, 'run'], [/\b(rad\w*|bike|rolle|ausfahrt|fahrrad)\b/, 'bike'], [/\b(schwimm\w*|kraul)\b/, 'swim'], [/\b(kraft\w*|gym)\b/, 'strength']];
export function autoTool(ctx: EngineCtx, text: string): { name: string; input: any } | null {
  const j = norm2(text);
  if (isReviewQuestion(text)) {
    const date = /\bvorgestern\b/.test(j) ? C.addDays(ctx.today, -2) : /\bgestern\b/.test(j) ? C.addDays(ctx.today, -1) : /\bheute\b/.test(j) ? ctx.today : undefined;
    const sport = (SPORTW.find(([re]) => re.test(j)) || [])[1];
    if (/\bwoch\w*\b|\bvorwoche\b/.test(j)) return { name: 'review_training', input: { week: !/\b(letzte|vorige|vergangene) woche\b/.test(j), last_week: /\b(letzte|vorige|vergangene) woche\b/.test(j) } };
    return { name: 'review_training', input: { ...(date ? { date } : {}), ...(sport ? { sport } : {}) } };
  }
  if (isChangeRequest(text) || /\bkrank\b/.test(j)) return null;
  // Form, Müdigkeit, Trends → Analyse
  if (/\b(form|fitness|belastung|ermuedung|muedigkeit|trend\w*|acwr|uebertrain\w*|fortschritt\w*)\b/.test(j) && /\b(wie|was|bin|ist|wird|werde)\b/.test(j)) return { name: 'get_analysis', input: {} };
  const sp0 = (SPORTW.find(([re]) => re.test(j)) || [])[1];
  // eigene Werte der letzten Einheit (Puls zu hoch? zu schnell?)
  if (sp0 && /\b(puls|herzfrequenz|tempo|pace|zu (hoch|schnell|langsam))\b/.test(j) && /\b(mein\w*|ich|war|ist)\b/.test(j) && !/\b(naechst\w*|morgen)\b/.test(j)) return { name: 'review_training', input: { sport: sp0 } };
  // nächste Einheit einer Sportart
  if (/\bnaechst\w*\b/.test(j) && sp0) { const d = C.planDays(C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {})).find((x: any) => x.date >= ctx.today && x.sessions.some((s: any) => s.sport === sp0 && !s.cancelled && !((ctx.state.sessions || {})[s.id] || {}).completed)); if (d) return { name: 'explain_day', input: { date: d.date, sport: sp0 } }; }
  const when = /\buebermorgen\b/.test(j) ? 2 : /\bmorgen\b/.test(j) ? 1 : /\bheute\b/.test(j) ? 0 : null;
  const dw = DAYW.find(([re]) => re.test(j));
  const asks = (/\b(was|wie|welche\w*)\b/.test(j) && /\b(mach\w*|soll|steht|genau|training|trainier\w*|einheit|ablauf|plan|tun)\b/.test(j)) || /\b(kann|darf|soll) ich\b/.test(j);
  if (!asks || (when == null && !dw)) return null;
  let date = C.addDays(ctx.today, when ?? 0);
  if (when == null && dw) for (let i = 0; i < 7; i++) { const d = C.addDays(ctx.today, i); if (new Date(d + 'T12:00:00Z').getUTCDay() === dw[1]) { date = d; break; } }
  const sport = (SPORTW.find(([re]) => re.test(j)) || [])[1];
  const mins = /\bnur (\d{1,3}) ?(min|minuten)\b/.exec(j);
  return { name: 'explain_day', input: { date, ...(sport ? { sport } : {}), ...(mins ? { minutes: Math.max(10, +mins[1]) } : {}) } };
}

/* Wunsch nach einer Planänderung: dann muss die KI ein Werkzeug aufrufen (sonst behauptet sie nur, etwas geändert zu haben) */
export function isChangeRequest(text: string): boolean {
  const j = norm2(text);
  return /\b(verschieb\w*|versetz\w*|streich\w*|tausch\w*|keine zeit|absag\w*|ausfallen|kuerzer|laenger|verkuerz\w*|verlaenger\w*|ab jetzt|ab sofort|nie mehr|nur noch|leichter machen|schwerer machen)\b|\bkein\w* \w+ mehr\b|\b(mach|ersetz\w*)\b.*\b(statt|anstatt)\b|\baender\w* (die|den|das|mein\w*)\b/.test(j);
}
/* Die KI behauptet eine Änderung, hat aber keinen Vorschlag erzeugt → nicht glauben (Regel-Coach antwortet) */
export function claimsChange(answer: string): boolean {
  // Sätze mit Verneinung („habe ich nicht verschoben“) zählen nicht
  return answer.split(/(?<=[.!?])\s+/).filter(x => !/\b(nicht|kein\w*|leider)\b/i.test(x)).some(x => /(vorschlag gemacht|vorschlag (erstellt|gespeichert)|\bhabe\b[^.!?]{0,40}\b(verschoben|gestrichen|gekürzt|verkürzt|verlängert|gespeichert|geändert|eingetragen|angepasst|getauscht)\b|\bich (verschiebe|streiche|kürze|ändere|speichere|trage)\b|\b(ist|wurde|wird) (jetzt )?(verschoben|gestrichen|gekürzt|gespeichert|geändert)\b)/i.test(x));
}
/* Werkzeug-Namen oder Code in der Antwort → kaputte Antwort */
export function leaksInternals(answer: string): boolean {
  return /\b(get_data|get_analysis|explain_day|review_training|move_session|modify_session|cancel_session|add_rule|session_id|tool_call)\b|^\s*[[{]\s*["{]/.test(answer);
}
