/* Auftrag 16: Coach-„Skill“ für die kostenlose KI (Cloudflare Workers AI) – und genauso für Claude, wenn hinterlegt.
   Enthält: Anweisung (System-Prompt), kompakte Zusammenfassung des Nutzers, Werkzeuge im OpenAI-Format und den Zahlen-Wächter.
   Harte Regeln und Zahlen kommen immer aus der Regel-Engine (Werkzeuge, Zusammenfassung); die KI formuliert nur.
   Oura-Daten sind vorher entfernt (aiSafeCtx auf dem Server), eine unvollständige Ampel wird niemals neu berechnet. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { readinessOf } from './engine';
import { readinessContextLine } from '../readiness';
import { ageOf, isMinor } from '../profile';
import { mainGoal } from '../goals';
import { rulesOf, describe as ruleText } from '../constraints';
import { parseFor } from '../ruleparse';
import { doneItems, valsOf, isReviewQuestion, norm2 } from './review';
import { mmss } from './texts';
import { TOOL_DEFS } from './tools';
import { rulesForAi, KNOWLEDGE } from '../trainingknowledge';
/* Auftrag 18: Ursachen nur mit Daten (gilt für jede KI; zusätzlich prüft claims.ts jede Antwort deterministisch) */
export const CAUSE_RULE = 'Ursachen und Zusammenhänge (z. B. Schlaf → Puls, Müdigkeit → Pace, Hitze → Puls) nennst du nur, wenn beide Werte für genau diese Einheit bzw. diesen Tag in den Daten stehen und die Abweichung zur eigenen Basis wirklich besteht (z. B. Puls bei gleicher Pace mindestens 5 Schläge über dem 6-Wochen-Schnitt, Temperatur über 25 °C gemessen). Sonst höchstens neutral, z. B. „Du hast nur 5,5 h geschlafen, mach heute lieber locker.“ Kein Puls eingetragen heißt: keine Aussage über den Puls.';

const SPORT: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Teamsport', rest: 'Ruhe', walk: 'Gehen' };
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dd = (d: string) => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`;
const AREA: Record<string, string> = { upper: 'Oberkörper', lower: 'Unterkörper', core: 'Rumpf', full: 'Ganzkörper' };
const PHASE: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Tapering (vor dem Wettkampf weniger)', race: 'Wettkampfwoche', recovery: 'Erholung', transition: 'Übergang' };

/* Anweisung an die KI: erfahrener Ausdauer-Coach, kurz, ehrlich, Deutsch, nur echte Daten */
export function coachSkill(ctx: EngineCtx, appName: string): string {
  const age = ageOf(ctx.profile, ctx.today);
  const minor = isMinor(ctx.profile, ctx.today);
  const L = [
    `Du bist der Coach in der Trainings-App „${appName}“: ein erfahrener Ausdauer-Coach für Laufen, Radfahren, Schwimmen, Triathlon und Kraft. Heute ist ${ctx.today} (${dd(ctx.today)}).`,
    'So antwortest du:',
    '- Beantworte zuerst die konkrete Frage in einem direkten Satz. Begruende kurz mit aktuellen Daten; weitere Analyse nur, wenn sie fuer diese Frage hilft. Trenne Empfehlung, Messung, Eingabe und Schaetzung.',
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
    '- Beim Verschieben, Tauschen oder Streichen fragst du nie nach dem Grund: der Grund ist freiwillig. Zum Tauschen zweier Einheiten rufst du move_session für beide auf; die App zeigt es als einen Vorschlag „Tauschen“.',
    '- Tage nennst du immer mit Wochentag UND Datum genau so, wie sie in den Daten stehen (z. B. „Di 28.10.“); rechne Wochentage nie selbst aus.',
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
  const S = contextParts(ctx);
  return [S.profile, S.thresholds, S.injuries, S.swim, S.goal, S.moreGoals, S.phase, S.today, S.next, S.last7, S.readiness].filter(Boolean).join('\n');
}

/* Auftrag 25: dieselben Angaben als einzelne Abschnitte, damit die kostenlose KI nur das bekommt, was zur Frage passt */
export interface ContextParts { profile: string; thresholds: string; injuries: string; swim: string; goal: string; moreGoals: string; phase: string; today: string; next: string; last7: string; readiness: string; last7Of: (sport?: string) => string }
export function contextParts(ctx: EngineCtx): ContextParts {
  const p = ctx.profile; const today = ctx.today; let L: string[] = [];
  const S: any = {}; const cut = (k: string) => { S[k] = L.join('\n'); L = []; };
  const age = ageOf(p, today);
  const t = p.thresholds || ({} as any);
  L.push('PROFIL: ' + [age != null ? `${age} Jahre` : null, `Sportarten: ${(p.sports || []).map(s => s === 'football' ? p.teamSportName || 'Teamsport' : SPORT[s] || s).join(', ')}`, p.weeklyHours ? `${p.weeklyHours} h pro Woche` : null].filter(Boolean).join(', '));
  const thr = [(p.sports || []).includes('run') && t.lthrRun ? `Laufen Schwellenpuls ${t.lthrRun}, Schwellen-Pace ${mmss(t.thresholdPaceRunSec)}/km` : null, (p.sports || []).includes('bike') && t.lthrBike ? `Rad Schwellenpuls ${t.lthrBike}${t.ftp ? `, FTP ${t.ftp} W` : ''}` : null, (p.sports || []).includes('swim') && t.cssSec ? `Schwimmen CSS ${mmss(t.cssSec)}/100 m` : null].filter(Boolean);
  cut('profile');
  if (thr.length) L.push('SCHWELLEN: ' + thr.join('; '));
  cut('thresholds');
  if (p.injuries) L.push('BESCHWERDEN: ' + String(p.injuries).slice(0, 160));
  cut('injuries');
  // Auftrag 17: Ausrüstung und belegtes Können (nur echte Werte)
  const sk: any = p.skills || {};
  const GEAR: Record<string, string> = { board: 'Kickbrett', buoy: 'Pull Buoy', fins: 'Flossen', paddles: 'Paddles', snorkel: 'Schnorchel' };
  if ((p.sports || []).includes('swim')) {
    L.push('AUSRÜSTUNG SCHWIMMEN: ' + ((sk.swimGear || []).map((g: string) => GEAR[g] || g).join(', ') || 'keine'));
    try {
      const pr=C.swimProofs(ctx.state,ctx.baseWeeks||[],today,42);
      for (const [key,label] of [['crawl','Kraul ohne Hilfsmittel'],['pull','Kraul mit Pull Buoy']] as const) {
        const vals=pr.map(x=>x[key]).filter(Boolean) as number[];
        L.push(label+': Bestwert '+(vals.length?Math.max(...vals)+' m':'unbekannt')+', bestätigt '+(C.confirmedOf(vals)?C.confirmedOf(vals)+' m':'unbekannt')+' (zwei Einheiten).');
      }
      L.push('Profilangabe (eigene oder abgeleitete Angabe, kein zusätzlicher Ergebnisnachweis): Kraul '+(sk.swimCrawlM??'unbekannt')+' m; Pull Buoy '+(sk.swimPullM??'unbekannt')+' m. Neue Trainingsstufe erst nach zwei Ergebnisnachweisen.');
    } catch (e) { /* ohne Nachweise */ }
  }
  cut('swim');
  const g = mainGoal(ctx.goals, today);
  if (g) {
    const weeks = g.date ? Math.max(0, Math.round((Date.parse(g.date) - Date.parse(today)) / (7 * 86400000))) : null;
    L.push(`ZIEL: ${g.name}${g.priority ? ` (${g.priority}-Ziel)` : ''}${g.date ? ` am ${dd(g.date)}${g.date.slice(0, 4)}, noch ${weeks} Wochen` : ''}`);
  } else L.push('ZIEL: keins eingetragen (allgemeine Fitness)');
  cut('goal');
  const more = (ctx.goals || []).filter(x => x && x !== g && !x.result && (!x.date || x.date >= today)).slice(0, 4);
  if (more.length) L.push('WEITERE ZIELE: ' + more.map(x => `${x.name}${x.priority ? ` (${x.priority})` : ''}${x.date ? ' am ' + dd(x.date) + x.date.slice(0, 4) : ' (Datum noch offen)'}`).join('; '));
  cut('moreGoals');
  const weeks = C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {});
  const wk = weeks.find((w: any) => (w.days || []).some((d: any) => d.date === today));
  if (wk) L.push(`PHASE: ${PHASE[wk.phase] || wk.phase || '–'}${wk.isRecoveryWeek ? ', Erholungswoche' : ''}${wk.focus ? ` – ${String(wk.focus).slice(0, 100)}` : ''}`);
  cut('phase');
  const days = C.planDays(weeks);
  const st = ctx.state.sessions || {};
  const line = (s: any) => `${SPORT[s.sport] || s.sport}: ${s.title}${s.plannedMinutes && !/\d+\s*min/.test(s.title || '') ? ` (${s.plannedMinutes} min)` : ''}${s.zone ? `, ${s.zone}` : ''}${C.isIntervals(s) || C.isGame(s) ? ', hart' : ''}${s.cancelled ? ' [entfällt]' : ''}${(st[s.id] || {}).completed ? ' [erledigt]' : (st[s.id] || {}).skipped ? ' [ausgelassen]' : ''} [id ${s.id}]`;
  const plan = (from: string, n: number) => days.filter((d: any) => d.date >= from && d.date < C.addDays(from, n)).map((d: any) => {
    const l = d.sessions.filter((s: any) => s.sport !== 'rest');
    return `${dd(d.date)}: ${l.length ? l.map(line).join(' | ') : 'Ruhetag'}`;
  });
  const td = plan(today, 1); L.push('HEUTE (' + dd(today) + '): ' + (td[0] ? td[0].replace(/^\S+ \S+: /, '') : 'kein Plan'));
  const ill = C.illnessAt(ctx.state.illnessPeriods, today);
  if (ill) L.push(`KRANK EINGETRAGEN seit ${dd(ill.start)}: kein Training, auch nicht locker, bis 24 Stunden ohne Fieber und Symptome; dann „Wieder gesund“ tippen.`);
  cut('today');
  L.push('NÄCHSTE TAGE:', ...plan(C.addDays(today, 1), 8));
  cut('next');
  // letzte 7 Tage: erledigt mit Messwerten, ausgelassen
  L.push('LETZTE 7 TAGE:');
  const rows: { sport: string; line: string }[] = [];
  const push0 = L.push.bind(L); L.push = (...xs: string[]) => { xs.forEach(x => rows.push({ sport: (/^- \S+ \S+ (\S+)/.exec(x) || [])[1] || '', line: x })); return push0(...xs); };
  const from = C.addDays(today, -7);
  const done = doneItems(ctx, from, today);
  done.forEach(d => {
    const v = valsOf(d);
    const vals = [v.min ? `${Math.round(v.min)} min` : null, v.km ? `${String(Math.round(v.km * 10) / 10).replace('.', ',')} km` : null, v.meters ? `${v.meters} m` : null, v.pace ? `${mmss(v.pace)}/km` : null, v.power ? `${Math.round(v.power)} W` : null, v.hr ? `Puls ${Math.round(v.hr)}` : null, v.rpe != null ? `Anstrengung ${v.rpe}/10` : null].filter(Boolean).join(', ');
    const crawlSoll = d.planned && d.sport === 'swim' ? Math.max(0, ...((d.planned.spec && d.planned.spec.steps) || []).filter((x: any) => x.mode === 'crawl').map((x: any) => x.m || 0)) : 0;
    const swimIst = d.sport === 'swim' ? (v.longest != null ? `, Kraul am Stück ${v.longest} m` : ', Kraul am Stück nicht eingetragen') + (v.longestPull != null ? ', Pull Buoy am Stück '+v.longestPull+' m' : ', Pull Buoy am Stück nicht eingetragen') : '';
    const ex = Array.isArray(v.exercises) && v.exercises.length ? ', Übungen IST: ' + JSON.stringify(v.exercises).slice(0, 300) : '';
    L.push(`- ${dd(d.date)} ${SPORT[d.sport] || d.sport}: SOLL ${d.title}${crawlSoll ? ` (Kraul-Stücke ${crawlSoll} m)` : ''} – IST erledigt${vals ? ': ' + vals : ''}${swimIst}${d.sport === 'strength' ? ', Bereich IST: ' + (AREA[v.area] || v.area || 'unbekannt') + ex : ''}`);
  });
  days.filter((d: any) => d.date >= from && d.date < today).forEach((d: any) => d.sessions.forEach((s: any) => {
    if (s.sport === 'rest' || s.cancelled || (st[s.id] || {}).completed) return;
    L.push(`- ${dd(d.date)} ${SPORT[s.sport] || s.sport}: ${s.title} – ${(st[s.id] || {}).skipped ? 'ausgelassen' : C.illnessAt(ctx.state.illnessPeriods, d.date) ? 'krank' : 'nicht gemacht'}`);
  }));
  if (!done.length) L.push('- keine erledigte Einheit eingetragen');
  L.push = push0; cut('last7');
  // Ampel (ohne Oura-Werte, die sind vorher entfernt)
  try {
    L.push('AMPEL HEUTE: ' + readinessContextLine(readinessOf(ctx)));
  } catch (e) { L.push('AMPEL HEUTE: keine Werte'); }
  cut('readiness');
  S.last7Of = (sport?: string) => { if (!sport) return S.last7; const name = SPORT[sport] || sport; const r = rows.filter(x => x.sport.replace(/:$/, '') === name); return 'LETZTE 7 TAGE (' + name + '):\n' + (r.length ? r.map(x => x.line).join('\n') : '- keine ' + name + '-Einheit'); };
  return S as ContextParts;
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
  if ((/\b(form|fitness|belastung|ermuedung|muedigkeit|trend\w*|acwr|uebertrain\w*|fortschritt\w*)\b/.test(j) && /\b(wie|was|bin|ist|wird|werde)\b/.test(j)) || /\b(besser|schneller|fitter|staerker) geworden\b/.test(j)) return { name: 'get_analysis', input: {} };
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
  if (/\b(montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags|wochenends)\b.*\b(nicht|kein\w*|nie)\b|\b(will|moechte|mag)\b.*\bnicht mehr\b/.test(j)) return true;
  return /\b(verschieb\w*|versetz\w*|streich\w*|tausch\w*|keine zeit|absag\w*|ausfallen|kuerzer|laenger|verkuerz\w*|verlaenger\w*|ab jetzt|ab sofort|nie mehr|nur noch|leichter machen|schwerer machen)\b|\bkein\w* \w+ mehr\b|\b(mach|ersetz\w*)\b.*\b(statt|anstatt)\b|\baender\w* (die|den|das|mein\w*)\b/.test(j);
}
/* Die KI behauptet eine Änderung, hat aber keinen Vorschlag erzeugt → nicht glauben (Regel-Coach antwortet) */
export function claimsChange(answer: string): boolean {
  // Sätze mit Verneinung („habe ich nicht verschoben“) zählen nicht
  return answer.split(/(?<=[.!?])\s+/).filter(x => !/\b(nicht|kein\w*|leider)\b/i.test(x) || /\b(notiert|vermerkt|berücksichtige|passen den plan)\b/i.test(x)).some(x => /(\b(habe ich|hab ich|ich habe|ich hab|ist) (es |das |dir )?(notiert|vermerkt|gespeichert)|\bich (werde|werd) das .{0,40}berücksichtigen|\bwir passen den plan\b|vorschlag gemacht|vorschlag (erstellt|gespeichert)|\bhabe\b[^.!?]{0,40}\b(verschoben|gestrichen|gekürzt|verkürzt|verlängert|gespeichert|geändert|eingetragen|angepasst|getauscht)\b|\bich (verschiebe|streiche|kürze|ändere|speichere|trage)\b|\b(ist|wurde|wird) (jetzt )?(verschoben|gestrichen|gekürzt|gespeichert|geändert)\b)/i.test(x));
}
/* Werkzeug-Namen oder Code in der Antwort → kaputte Antwort */
export function leaksInternals(answer: string): boolean {
  return /\b(get_data|get_analysis|explain_day|review_training|move_session|modify_session|cancel_session|add_rule|session_id|tool_call)\b|^\s*[[{]\s*["{]/.test(answer);
}

/* ---------- Auftrag 25: gezielter Kontext für die kostenlose KI ----------
   Vorher bekam jede Frage alles (Anweisung, alle 40 Trainingsregeln, alle Daten, 8 Werkzeuge: etwa 5.300 Tokens je Aufruf, 2-4 Aufrufe je Frage).
   Jetzt: kurze Grundanweisung, nur die zur Frage passenden Daten, höchstens 3 passende Regeln aus docs/TRAININGSREGELN.md und nur die
   nötigen Werkzeuge. Hat die App das Werkzeug schon vorab ausgeführt (autoTool), gibt es keine Werkzeuge mehr: ein einziger Aufruf. */
export type Topic = 'change' | 'review' | 'day' | 'form' | 'health' | 'goal' | 'nutrition' | 'knowledge' | 'general';
const RULE_WORDS: Record<string, RegExp> = {
  rest: /\b(ruhetag\w*|frei|pause\w*|erholung\w*)\b/, hard: /\b(hart\w*|intervall\w*|intensiv\w*)\b/, 'long-days': /\b(koppel\w*|hintereinander|doppel\w*)\b/,
  'max-sports': /\b(zwei|drei|2|3) (sportarten|einheiten)\b/, 'min-freq': /\b(wie oft|haeufig\w*|mal pro woche)\b/, 'long-tempo': /\blang\w* lauf\w*\b.*\btempo\b|\btempo\b.*\blang\w* lauf\w*/,
  'threshold-up': /\b(schwelle\w*|stufe\w*|schneller werden|fortschritt\w*)\b/, long: /\blang\w* (lauf|ausfahrt|einheit)\w*\b/, 'same-sport': /\b(gleiche? sportart|folgetag\w*)\b/,
  'game-strength': /\bspiel\w*\b.*\bkraft\b|\bkraft\b.*\bspiel\w*/, 'recovery-week': /\b(erholungswoche\w*|entlastungswoche\w*|leichte woche)\b/, warmup: /\b(aufwaerm\w*|einlauf\w*|auslauf\w*|einschwimm\w*)\b/,
  'after-race': /\bnach dem (wettkampf|rennen)\b/, 'race-week': /\b(wettkampfwoche|rennwoche|vor dem (rennen|wettkampf))\b/, taper: /\btaper\w*\b/, 'a-races': /\b(wettkaempfe pro|rennen pro jahr|a-ziel)\b/,
  rehearsal: /\b(generalprobe|wechselzone|wechsel)\b/, 'race-plan': /\b(rennplan|pacing|renntag)\b/, pause: /\b(wiedereinstieg|nach (der|einer) pause|lange nicht)\b/, neck: /\b(krank\w*|erkaelt\w*|schnupfen|husten|fieber|hals\w*)\b/,
  missed: /\b(verpasst\w*|ausgelassen|nachholen|ausgefallen)\b/, pain: /\b(schmerz\w*|weh|verletz\w*|knie|achilles\w*|schienbein\w*)\b/, 'run-volume': /\b(laufumfang|mehr laufen|kilometer pro woche)\b/,
  overreach: /\b(muede|muedigkeit|ueberlast\w*|uebertrain\w*|erschoepf\w*)\b/, 'easy-easy': /\b(locker\w*|zone 2|grundlage\w*)\b/, fuel: /\b(gel\w*|riegel|trinken|verpflegung|unterwegs essen)\b/,
  'recover-food': /\b(nach dem training|eiweiss|protein)\b/, reds: /\b(abnehm\w*|diaet|zu wenig essen)\b/, sleep: /\b(schlaf\w*|muede)\b/, exams: /\b(pruefung\w*|klausur\w*|stress\w*)\b/,
  heat: /\b(hitze|kaelte|regen|wetter)\b/, indoor: /\b(rolle|indoor|drinnen|smart ?trainer)\b/, strength: /\b(kraft\w*|gym|gewichte)\b/, age50: /\b(ab 50|aelter werden)\b/, cycle: /\b(zyklus|periode|menstruation)\b/,
  'tech-run': /\b(lauftechnik|schrittfrequenz|laufstil)\b/, 'tech-bike': /\b(radtechnik|trittfrequenz|schalten)\b/, 'tech-swim': /\b(schwimmtechnik|kraul\w*|atmung|atmen|wasserlage|beinschlag)\b/,
  scores: /\b(score\w*)\b/
};
export function relevantRules(text: string, max = 3): string {
  const j = norm2(text);
  const first = (x: string) => (x.match(/^.*?[.!](?=\s|$)/) || [x])[0];
  const hits = KNOWLEDGE.filter(k => RULE_WORDS[k.id] && RULE_WORDS[k.id].test(j)).slice(0, max);
  return hits.length ? 'PASSENDE TRAININGSREGELN DER APP:\n' + hits.map(k => `- ${k.title}: ${first(k.rule)}`).join('\n') : '';
}
export function topicOf(text: string, pre: { name: string } | null): Topic {
  const j = norm2(text);
  if (isChangeRequest(text)) return 'change';
  if (pre) return pre.name === 'review_training' ? 'review' : pre.name === 'explain_day' ? 'day' : 'form';
  if (/\b(krank\w*|schmerz\w*|verletz\w*|fieber|erkaelt\w*|weh)\b/.test(j)) return 'health';
  if (/\b(ziel\w*|wettkampf\w*|rennen|prognose\w*|zielzeit|wunschzeit|schaffe ich)\b/.test(j)) return 'goal';
  if (/\b(essen|esse|isst|ernaehr\w*|trinken|rezept\w*|kohlenhydrat\w*|protein|eiweiss|fruehstueck|snack\w*)\b/.test(j)) return 'nutrition';
  if (/\b(mein\w*|ich|mir|mich|heute|morgen|gestern|woche|plan)\b/.test(j)) return 'general';
  return 'knowledge';
}
const SPORT_OF: [RegExp, string][] = [[/\b(lauf\w*|joggen|gelaufen|laeuf\w*)\b/, 'run'], [/\b(rad\w*|bike|rolle|ausfahrt|fahrrad)\b/, 'bike'], [/\b(schwimm\w*|kraul\w*|bahnen)\b/, 'swim'], [/\b(kraft\w*|gym)\b/, 'strength']];
const BASE_RULES = (today: string) => [
  `Heute ist ${dd(today)}${today.slice(0, 4)}, morgen ist ${dd(C.addDays(today, 1))}, übermorgen ${dd(C.addDays(today, 2))}.`,
  '- Antworte auf Deutsch in der du-Form, natürlich und kurz: höchstens 4 Sätze, kein Markdown, keine Aufzählungen. Keine Floskeln, nichts doppelt sagen.',
  '- Beantworte zuerst genau die Frage. Nutze nur die DATEN unten und Ergebnisse der App; erfinde keine Zahlen, Termine, Messwerte oder Ergebnisse. SOLL ist der Plan, IST das Gemachte; ein Planwert ist kein Ergebnis.',
  '- Tage nennst du genau wie in den Daten (z. B. „Di 03.11.“), rechne Wochentage nie selbst aus. Nenne nie Werkzeug-Namen oder IDs.',
  '- Keine Diagnosen, keine Medikamente. Bei Schmerzen, Krankheit, Fieber, Brustschmerz oder Schwindel: pausieren oder nur ganz locker, ärztlich abklären lassen.'
];
export interface FocusedPrompt { system: string; tools: any[]; topic: Topic; maxRounds: number }
export function focusedPrompt(ctx: EngineCtx, text: string, appName: string, pre: { name: string; input: any } | null): FocusedPrompt {
  const topic = topicOf(text, pre);
  const j = norm2(text);
  const sport = (SPORT_OF.find(([re]) => re.test(j)) || [])[1];
  const S = contextParts(ctx);
  const minor = isMinor(ctx.profile, ctx.today);
  const L: string[] = [`Du bist der Coach in der Trainings-App „${appName}“, ein erfahrener Ausdauer-Coach (Laufen, Rad, Schwimmen, Triathlon, Kraft).`, ...BASE_RULES(ctx.today)];
  if (pre) L.push('- Unten steht die Auswertung der App zu dieser Frage. Sag in deinen Worten das Wichtigste zuerst und gib einen konkreten Tipp. Zahlen und Tage übernimmst du genau.');
  if (topic === 'change') L.push('- Den Plan änderst du nur über die Werkzeuge (move_session, modify_session, cancel_session, add_rule) mit den IDs aus den Daten. Zum Tauschen zweier Einheiten rufst du move_session für beide auf. Frag nie nach dem Grund und schreib keinen Grund, den der Athlet nicht genannt hat. Schreib nie, dass schon etwas geändert ist: es ist erst ein Vorschlag.',
    '- Danach sagst du: „Ich habe dir einen Vorschlag gemacht, du kannst ihn unten bestätigen.“ Lehnt die App ab, nenne kurz den Grund und einen erlaubten Tag. Fehlt dir der Zieltag, frag nur danach.');
  if (topic === 'review' || topic === 'form' || topic === 'general') L.push(`- ${CAUSE_RULE}`, '- Eine einzelne Einheit ist noch kein Trend. Lob nur, wenn es stimmt; ist etwas nicht gut, sag es freundlich.');
  if (topic === 'knowledge' || topic === 'nutrition') L.push('- Allgemeine Fragen zu Training, Technik, Zonen, Essen, Schlaf und Material beantwortest du aus deinem Wissen, praxisnah. Nur bei Themen ganz ohne Sportbezug sagst du in einem Satz, dass du nur fürs Training da bist.');
  if (topic === 'general') L.push('- Fehlen dir Daten zu einem anderen Tag oder einer Einheit, nutze get_data, review_training, explain_day oder get_analysis. Sonst sag ehrlich, was fehlt.');
  const swimQ = sport === 'swim' || /\b(hilfsmittel|pull ?buoy|kickbrett|flossen)\b/.test(j);
  if (S.swim && swimQ) L.push('- Hilfsmittel nur, wenn sie unter AUSRÜSTUNG stehen.');
  if (minor) L.push(`- Der Athlet ist ${ageOf(ctx.profile, ctx.today)} Jahre alt (minderjährig): keine Gewichtsziele, keine Diät, kein Kalorienzählen, kein Druck. Schule und Schlaf gehen vor. Bei Schmerzen immer Eltern und Arzt einbeziehen.`);
  if (topic === 'change' || topic === 'day' || topic === 'general') {
    const rs = rulesOf(ctx.profile, parseFor(ctx.today)).filter(r => !r.hidden && r.kind !== 'info');
    if (rs.length) L.push('Eigene Regeln des Athleten (nie brechen; „möglichst“ darf mit Begründung abweichen):', ...rs.slice(0, 8).map(r => '- ' + ruleText(r) + (r.strength === 'soft' ? ' (möglichst)' : '')));
  }
  const rules = relevantRules(text); if (rules) L.push(rules);
  // Daten: immer Profil, Ziel und heute; der Rest nach Thema
  const D: string[] = [S.profile, S.goal, S.today];
  if (topic === 'change' || topic === 'general' || topic === 'day') D.push(S.next);
  if (topic === 'review' || topic === 'general' || topic === 'form') D.push(S.last7Of(topic === 'general' ? undefined : sport));
  if (topic === 'goal' || topic === 'general') D.push(S.phase);
  if (topic === 'goal') D.push(S.moreGoals);
  if (topic === 'form' || topic === 'health' || /\b(ampel|form|muede|schlaf|ruhepuls|hrv)\b/.test(j)) D.push(S.readiness);
  if (topic === 'health' || /\b(knie|schmerz\w*|beschwerd\w*)\b/.test(j)) D.push(S.injuries);
  if (/\b(zone\w*|puls|pace|tempo|ftp|watt|css|schwelle\w*)\b/.test(j)) D.push(S.thresholds);
  if (swimQ) D.push(S.swim);
  const system = L.join('\n') + '\n\nDATEN DES ATHLETEN:\n' + [...new Set(D.filter(Boolean))].join('\n');
  const all = shortTools(); const pick = (names: string[]) => all.filter(x => names.includes(x.function.name));
  const tools = pre ? [] : topic === 'change' ? pick(['move_session', 'modify_session', 'cancel_session', 'add_rule', 'get_data'])
    : topic === 'knowledge' || topic === 'nutrition' ? [] : pick(['get_data', 'review_training', 'explain_day', 'get_analysis']);
  return { system, tools, topic, maxRounds: tools.length ? 3 : 1 };
}

/* Auftrag 25: kurze Beschreibungen der Werkzeuge (die langen kosteten etwa 1.300 Tokens je Aufruf); Parameter unverändert */
const SHORT: Record<string, string> = {
  get_data: 'Liest Plan oder Werte: what "day" (ein Tag), "week" (Woche um date), "values" (Morgenwerte), "sessions" (erledigte Einheiten mit Messwerten).',
  explain_day: 'Erklärt die Einheiten eines Tages Schritt für Schritt (mit Zonen und Puls des Athleten).',
  review_training: 'Bewertet erledigtes Training mit den echten Werten (date, sport oder week).',
  get_analysis: 'Belastung (CTL/ATL/TSB, ACWR) und Trends.',
  move_session: 'Verschiebt eine Einheit (session_id aus den Daten) auf to_date (JJJJ-MM-TT). Wird als Vorschlag gezeigt.',
  modify_session: 'Ändert eine Einheit (session_id): Dauer planned_minutes, Zone, Titel oder Sportart. Wird als Vorschlag gezeigt.',
  cancel_session: 'Lässt eine Einheit (session_id) entfallen. Wird als Vorschlag gezeigt.',
  add_rule: 'Speichert eine dauerhafte Regel in einfachen Worten (z. B. „mittwochs kein Rad“). Wird als Vorschlag gezeigt.'
};
const stripDesc = (o: any): any => Array.isArray(o) ? o.map(stripDesc) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'description').map(([k, v]) => [k, stripDesc(v)])) : o;
export function shortTools(): any[] {
  return openAiTools().map(t => ({ type: 'function', function: { name: t.function.name, description: SHORT[t.function.name] || t.function.description, parameters: stripDesc(t.function.parameters) } }));
}
/* Änderungswunsch mit Ziel (Tag, Dauer, Regel): die KI muss gleich ein Werkzeug nutzen. Ohne Ziel („auf einen anderen Tag“) darf sie zuerst nachfragen. */
export function changeHasTarget(text: string): boolean {
  const j = norm2(text);
  return !/\b(anderen tag|anderer tag|wann anders|irgendwann|spaeter)\b/.test(j);
}

/* Auftrag 25: Nennt die Frage einen Tag, dürfen Vorschläge nur Einheiten dieses Tages betreffen (Qwen strich bei „morgen keine Zeit“
   sieben Einheiten an drei Tagen). Ein Tag nach „auf/nach/zum“ ist das Ziel und begrenzt nichts. Doppelte Vorschläge fallen weg. */
const WD: [RegExp, number][] = [[/^(montag|montags|mo)$/, 1], [/^(dienstag|dienstags|di)$/, 2], [/^(mittwoch|mittwochs|mi)$/, 3], [/^(donnerstag|donnerstags|do)$/, 4], [/^(freitag|freitags|fr)$/, 5], [/^(samstag|samstags|sa|sonnabend)$/, 6], [/^(sonntag|sonntags|so)$/, 0]];
export function mentionedDays(text: string, today: string): { date: string; target: boolean }[] {
  const low = String(text).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const toks = low.replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).map(x => /^\d{1,2}\.\d{1,2}\.?$/.test(x) ? x : x.replace(/\./g, '')).filter(Boolean);
  const out: { date: string; target: boolean }[] = [];
  toks.forEach((tk, i) => {
    const prev = toks[i - 1] || '', prev2 = toks[i - 2] || '';
    const target = /^(auf|nach|zum|bis)$/.test(prev) || (/^(den|dem|am)$/.test(prev) && /^(auf|nach|zum)$/.test(prev2));
    let d: string | null = null;
    if (tk === 'heute') d = today; else if (tk === 'morgen' && prev !== 'guten') d = C.addDays(today, 1); else if (tk === 'uebermorgen') d = C.addDays(today, 2);
    else {
      const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(tk);
      if (m) { const y = +today.slice(0, 4); let x = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; if (x < C.addDays(today, -60)) x = `${y + 1}${x.slice(4)}`; d = x; }
      else { const w = WD.find(([re]) => re.test(tk)); if (w && (tk.length > 2 || /^(am|ab|bis|auf|nach|vom|von)$/.test(prev))) for (let k = 0; k < 7; k++) { const dt = C.addDays(today, k); if (new Date(dt + 'T12:00:00Z').getUTCDay() === w[1]) { d = dt; break; } } }
    }
    if (d) out.push({ date: d, target });
  });
  return out;
}
export function limitToMentioned<T extends { proposal?: any }>(ctx: EngineCtx, text: string, props: T[]): T[] {
  const src = new Set(mentionedDays(text, ctx.today).filter(x => !x.target).map(x => x.date));
  const days = C.planDays(C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {}));
  const sessOf = (id: string) => { for (const d of days as any[]) { const s = (d.sessions || []).find((x: any) => x.id === id); if (s) return { s, date: d.date }; } return null; };
  const j = norm2(text);
  const sports = new Set(SPORT_OF.filter(([re]) => re.test(j)).map(([, s]) => s));
  const wantsLong = /\blang\w*\b/.test(j), wantsTest = /\w*test\b/.test(j);
  const swap = /\btausch\w*\b/.test(j);
  const ruleWanted = /\b(ab jetzt|ab sofort|nie mehr|nicht mehr|immer|nur noch|grundsaetzlich|jede[nr]?|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags|urlaub)\b/.test(j);
  const seen = new Set<string>();
  const kept = props.filter(m => {
    const ch = ((m.proposal && m.proposal.changes) || []) as any[];
    if (ch.some(c => c && c.kind === 'profile' || (c && c.kind === 'rule')) && !ruleWanted) return false;
    const keyOf = ch.map(c => c && c.data ? c.data.type + ':' + c.data.sessionId : '').join('|');
    if (keyOf && seen.has(keyOf)) return false; if (keyOf) seen.add(keyOf);
    return ch.every(c => {
      if (!c || c.kind !== 'adjust' || !c.data || !c.data.sessionId) return true;
      const hit = sessOf(c.data.sessionId); const date = c.data.from || (hit && hit.date) || '';
      if (c.data.type === 'move' && c.data.to === date) return false;
      if (src.size && !src.has(date)) return false;
      if (hit && !swap) {
        if (sports.size && !sports.has(hit.s.sport)) return false;
        if (wantsLong && !(C.isLong(hit.s) || /lang/i.test(hit.s.title || ''))) return false;
        if (wantsTest && !/test|check/i.test(hit.s.title || '')) return false;
      }
      return true;
    });
  });
  if (swap && kept.filter(m => ((m.proposal && m.proposal.changes) || []).some((c: any) => c && c.data && c.data.type === 'move')).length < 2) return [];
  return kept;
}
