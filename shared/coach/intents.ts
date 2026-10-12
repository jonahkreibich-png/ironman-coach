/* Freies Schreiben mit dem Coach ohne KI (Auftrag 4 D2): die Engine erkennt typische Fragen und Aussagen
   (mehr als 40 Absichten, viele Formulierungen, Tippfehler-tolerant) und antwortet mit echten Daten.
   Antworten können Aktionen vorschlagen (Krankheit eintragen, Woche umplanen, Einheit verschieben …),
   die erst nach Bestätigung im Chat ausgeführt werden. Versteht sie etwas nicht, sagt sie ehrlich, was sie kann. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { readinessFacts } from './engine';
import { answerQuick } from './quick';
import { checkMessage } from './safety';
import { joinDe, de, dowName } from './texts';
import { sleepNeed, isMinor } from '../profile';
import { mainGoal, nextGoal, GOALS } from '../goals';
import { parseConsiderations } from '../considerations';
import { hrZonesFor } from '../sports';

export interface ChatAction { label: string; kind: 'illness-start' | 'illness-end' | 'add-note' | 'adjust' | 'go' | 'say' | 'rule-fix'; payload?: any }
export interface ChatReply { intent: string; text: string; actions?: ChatAction[]; suggestions?: string[] }
type Extra = { scores?: any[]; prognosis?: any };

/* ---------- Text normalisieren und unscharf vergleichen ---------- */
export function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a: string, b: string): number {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/* Wortanfang passt (Knie → knies, knieschmerzen) oder höchstens 1-2 Tippfehler */
function wordHit(tok: string, key: string): boolean {
  if (tok === key) return true;
  if (key.length >= 4 && tok.startsWith(key)) return true;
  if (key.length >= 5 && tok.length >= 5 && lev(tok.slice(0, key.length + 1), key) <= 1) return true;
  if (key.length >= 8 && lev(tok, key) <= 2) return true;
  return false;
}
function has(toks: string[], words: string[]): boolean {
  return words.some(w => w.includes(' ') ? toks.join(' ').includes(w) : toks.some(t => wordHit(t, w)));
}

/* ---------- Erkennung von Tagen, Sportarten, Körperteilen ---------- */
const DAYS: [string[], number][] = [[['montag', 'mo'], 1], [['dienstag', 'di'], 2], [['mittwoch', 'mi'], 3], [['donnerstag', 'do'], 4], [['freitag', 'fr'], 5], [['samstag', 'sa', 'sonnabend'], 6], [['sonntag', 'so'], 0]];
function dayIn(toks: string[], today: string): string | null {
  if (toks.includes('heute')) return today;
  if (toks.includes('morgen') && !toks.includes('guten')) return C.addDays(today, 1);
  if (toks.includes('uebermorgen')) return C.addDays(today, 2);
  for (const [w, d] of DAYS) if (toks.some(t => w.includes(t) && (t.length > 2 || w[1] === t) || w.some(x => x.length > 3 && wordHit(t, x)))) {
    for (let i = 0; i < 7; i++) { const dt = C.addDays(today, i); if (new Date(dt + 'T12:00:00Z').getUTCDay() === d) return dt; }
  }
  return null;
}
const SPORT_WORDS: [string[], string][] = [[['lauf', 'laufen', 'joggen', 'lauf', 'run', 'langen lauf', 'langer lauf'], 'run'], [['rad', 'radfahren', 'fahrrad', 'ausfahrt', 'bike', 'rolle'], 'bike'], [['schwimmen', 'schwimm', 'kraulen'], 'swim'], [['kraft', 'krafttraining', 'gym'], 'strength']];
function sportIn(toks: string[]): string | null { for (const [w, s] of SPORT_WORDS) if (has(toks, w)) return s; return null; }
const BODY: [string, string][] = [['knie', 'Knie'], ['leiste', 'Leiste'], ['achilles', 'Achillessehne'], ['wade', 'Wade'], ['schienbein', 'Schienbein'], ['ruecken', 'Rücken'], ['schulter', 'Schulter'], ['huefte', 'Hüfte'], ['fuss', 'Fuß'], ['sprunggelenk', 'Sprunggelenk'], ['oberschenkel', 'Oberschenkel'], ['nacken', 'Nacken'], ['ferse', 'Ferse']];
function bodyIn(toks: string[]): string | null { for (const [k, l] of BODY) if (toks.some(t => wordHit(t, k))) return l; return null; }

/* ---------- Plan-Hilfen ---------- */
const weeksOf = (ctx: EngineCtx) => C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {});
const dayOf = (ctx: EngineCtx, date: string) => C.planDays(weeksOf(ctx)).find((d: any) => d.date === date) || null;
const live = (d: any) => d ? d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.removed) : [];
const sessLine = (s: any) => `${s.title}${s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''}`;
const fmtD = (d: string) => `${dowName(d)} ${d.slice(8)}.${d.slice(5, 7)}.`;
const gid = () => 'chat-' + Date.now();

/* Tag freimachen: Einheiten auf freie Tage derselben Woche verschieben, sonst streichen */
export function clearDay(ctx: EngineCtx, date: string): { adj: any[]; text: string } {
  const weeks = weeksOf(ctx);
  const w = weeks.find((x: any) => x.days.some((d: any) => d.date === date));
  const day = dayOf(ctx, date);
  const list = live(day).filter((s: any) => !s.fixed && !s.race && !s.locked && !((ctx.state.sessions || {})[s.id] || {}).completed);
  if (!list.length) return { adj: [], text: `Am ${fmtD(date)} ist nichts geplant, das ich verschieben müsste.` };
  const group = gid(); const adj: any[] = []; const done: string[] = [];
  const free = (w ? w.days : []).filter((d: any) => d.date !== date && d.date >= ctx.today).map((d: any) => ({ d, n: live(d).length, hard: live(d).some((s: any) => C.isHard(s)) }));
  for (const s of list) {
    const hard = C.isHard(s);
    const cand = free.filter(x => x.n < 2 && !x.d.sessions.some((y: any) => y.sport === s.sport && !y.cancelled) && !(hard && (x.hard || free.some(z => z.hard && Math.abs(+new Date(z.d.date) - +new Date(x.d.date)) === 86400000)))).sort((a, b) => a.n - b.n)[0];
    if (cand) { adj.push({ id: `${group}-${s.id}`, group, type: 'move', sessionId: s.id, from: date, to: cand.d.date, what: `${s.title} → ${fmtD(cand.d.date)}`, reason: 'Du hast an dem Tag keine Zeit' }); cand.n++; if (hard) cand.hard = true; done.push(`${s.title} auf ${fmtD(cand.d.date)}`); }
    else { adj.push({ id: `${group}-${s.id}`, group, type: 'cancel', sessionId: s.id, what: `${s.title} entfällt`, reason: 'Du hast an dem Tag keine Zeit, kein passender Platz in der Woche' }); done.push(`${s.title} entfällt`); }
  }
  return { adj, text: `Vorschlag für ${fmtD(date)}: ${joinDe(done)}.` };
}

/* ---------- Absichten ---------- */
interface Intent { id: string; when: (toks: string[], raw: string) => boolean; answer: (ctx: EngineCtx, toks: string[], raw: string, x: Extra) => ChatReply | string }
const A = (...g: string[][]) => (toks: string[]) => g.every(words => has(toks, words));

export const INTENTS: Intent[] = [
  { id: 'healthy', when: t => has(t, ['wieder gesund', 'wieder fit', 'symptomfrei', 'nicht mehr krank', 'bin gesund']),
    answer: ctx => C.illnessAt(ctx.state.illnessPeriods, ctx.today) ? { intent: 'healthy', text: 'Schön! Soll ich die Krankheitsphase mit gestern beenden? Dann beginnt heute der Wiedereinstieg: die ersten Tage nur locker.', actions: [{ label: 'Ja, Krankheit beenden', kind: 'illness-end' }] } : 'Super, dann läuft der Plan normal weiter.' },
  { id: 'sick', when: t => has(t, ['krank', 'erkaeltet', 'erkaeltung', 'fieber', 'grippe', 'halsschmerzen', 'schnupfen', 'husten', 'corona', 'covid', 'infekt']) && !has(t, ['nicht mehr', 'wieder gesund']),
    answer: ctx => C.illnessAt(ctx.state.illnessPeriods, ctx.today) ? { intent: 'sick', text: 'Du bist schon als krank eingetragen. Schlafen, trinken, genug essen. Melde dich, wenn du 24 Stunden ohne Symptome bist, dann starten wir in Stufen.' }
      : { intent: 'sick', text: 'Gute Besserung! Soll ich ab heute eine Krankheitsphase eintragen? Dann pausiert der Plan, und danach steigen wir in Stufen wieder ein. Bei Fieber gilt: kein Training.', actions: [{ label: 'Ja, Krankheit eintragen', kind: 'illness-start' }, { label: 'Nein, nur leicht angeschlagen', kind: 'say', payload: 'Ich bin müde' }] } },
  { id: 'pain', when: t => !!bodyIn(t) && has(t, ['schmerz', 'schmerzen', 'weh', 'zwickt', 'zieht', 'tut', 'verletzt', 'probleme', 'beschwerden', 'entzuendet']) || has(t, ['schmerzen', 'schmerz']) && !has(t, ['hals']),
    answer: (ctx, t) => { const b = bodyIn(t) || 'Schmerzen'; const note = `${b}: Beschwerden seit ${ctx.today.split('-').reverse().join('.')}`;
      const known = parseConsiderations([note])[0];
      return { intent: 'pain', text: `Danke, dass du es sagst. Bei Schmerzen über 2 von 10 lieber nichts Hartes, vor allem beim Laufen. Soll ich „${b}“ als Berücksichtigung eintragen? Dann plane ich die kommenden Wochen schonender (${known && known.effect ? known.effect : 'weniger Intensität'}). Wenn es nach ein paar Tagen nicht besser wird oder stärker wird: bitte ärztlich anschauen lassen.`,
        actions: [{ label: `${b} berücksichtigen`, kind: 'add-note', payload: note }, ...(easyToday(ctx).length ? [{ label: 'Heute nur locker', kind: 'adjust' as const, payload: easyToday(ctx) }] : [])] }; } },
  { id: 'no-time-day', when: (t, raw) => !!dayIn(t, '2000-01-03') && (has(t, ['keine zeit', 'verhindert', 'unterwegs', 'arbeiten', 'termin', 'nicht da']) || (has(t, ['kann', 'geht', 'schaffe', 'klappt', 'passt']) && has(t, ['nicht'])) || /keine zeit/.test(raw)),
    answer: (ctx, t) => { const d = dayIn(t, ctx.today)!; const r = clearDay(ctx, d); return r.adj.length ? { intent: 'no-time-day', text: r.text + ' Passt das?', actions: [{ label: 'Ja, so umplanen', kind: 'adjust', payload: r.adj }] } : r.text; } },
  { id: 'move-session', when: t => has(t, ['verschieb', 'verlege', 'schieb', 'tausch', 'lieber am', 'auf sonntag', 'auf samstag']) && (!!sportIn(t) || has(t, ['einheit', 'training'])),
    answer: (ctx, t) => {
      const sport = sportIn(t); const long = has(t, ['lang', 'langen', 'langer', 'lange']);
      const toDate = (() => { const i = t.findIndex(x => x === 'auf' || x === 'am' || x === 'nach'); return i >= 0 ? dayIn(t.slice(i + 1), ctx.today) : null; })();
      if (!toDate) return 'Auf welchen Tag soll ich sie verschieben? Schreib zum Beispiel „Verschieb den langen Lauf auf Sonntag“.';
      const w = weeksOf(ctx).find((x: any) => x.days.some((d: any) => d.date === toDate));
      const cands = (w ? w.days : []).filter((d: any) => d.date >= ctx.today && d.date !== toDate).flatMap((d: any) => live(d).map((s: any) => ({ s, date: d.date })))
        .filter(x => (!sport || x.s.sport === sport) && (!long || C.isLong(x.s) || /lang/i.test(x.s.title)) && !x.s.fixed && !x.s.race && !((ctx.state.sessions || {})[x.s.id] || {}).completed);
      const c = cands[0];
      if (!c) return `In der Woche von ${fmtD(toDate)} finde ich keine passende Einheit zum Verschieben.`;
      const g = gid();
      return { intent: 'move-session', text: `${c.s.title} von ${fmtD(c.date)} auf ${fmtD(toDate)} verschieben?`, actions: [{ label: 'Ja, verschieben', kind: 'adjust', payload: [{ id: `${g}-${c.s.id}`, group: g, type: 'move', sessionId: c.s.id, from: c.date, to: toDate, what: `${c.s.title} → ${fmtD(toDate)}`, reason: 'Wunsch im Coach-Chat' }] }] };
    } },
  { id: 'skip-today', when: t => has(t, ['ausfallen', 'faellt aus', 'kein training', 'keine lust', 'schaffe heute nicht', 'pause heute', 'heute frei']),
    answer: ctx => { const l = live(dayOf(ctx, ctx.today)).filter((s: any) => !((ctx.state.sessions || {})[s.id] || {}).completed && !s.fixed && !s.race);
      if (!l.length) return 'Heute ist sowieso nichts mehr offen. Genieß den Tag!';
      const g = gid();
      return { intent: 'skip-today', text: `Kein Problem, ein Tag Pause schadet nicht. Soll ich ${joinDe(l.map(sessLine))} für heute streichen? Wichtige Einheiten verschiebe ich, wenn in den nächsten zwei Tagen Platz ist.`, actions: [{ label: 'Ja, heute streichen', kind: 'adjust', payload: l.map((s: any) => ({ id: `${g}-${s.id}`, group: g, type: 'cancel', sessionId: s.id, what: `${s.title} entfällt`, reason: 'Pause laut Coach-Chat' })) }, { label: 'Nur lockerer machen', kind: 'adjust', payload: easyToday(ctx) }] }; } },
  { id: 'tired', when: t => has(t, ['muede', 'erschoepft', 'kaputt', 'platt', 'ausgelaugt', 'schlapp', 'erledigt', 'schwere beine']),
    answer: ctx => { const facts = readinessFacts(ctx, ctx.today); const e = easyToday(ctx);
      return { intent: 'tired', text: `Müdigkeit ernst nehmen ist klug.${facts.length ? ' Deine Werte zeigen es auch: ' + joinDe(facts) + '.' : ''} ${e.length ? 'Ich kann die harte Einheit heute durch eine lockere ersetzen.' : 'Heute ist sowieso nichts Hartes geplant. Locker bleiben oder ganz pausieren ist beides okay.'}`, actions: e.length ? [{ label: 'Heute nur locker', kind: 'adjust', payload: e }] : [] }; } },
  { id: 'why-easy', when: t => has(t, ['warum', 'wieso', 'weshalb']) && has(t, ['locker', 'leicht', 'easy', 'ruhig', 'langsam', 'zone 2']), answer: (ctx, _t, _r, x) => answerQuick(ctx, 'why-easy', x) },
  { id: 'pace', when: t => has(t, ['welch', 'wie schnell', 'pace']) && has(t, ['tempo', 'pace', 'schnell']),
    answer: ctx => { const p = ctx.profile.thresholds.thresholdPaceRunSec; const m = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
      return `Locker (Zone 2) etwa ${m(p * 1.15)}-${m(p * 1.26)} pro km, an der Schwelle etwa ${m(p * 0.99)}-${m(p * 1.04)} pro km. Wichtiger als das Tempo ist das Gefühl: locker heißt, du kannst reden.`; } },
  { id: 'can-intervals', when: t => has(t, ['kann', 'darf', 'soll', 'koennte']) && has(t, ['intervall', 'intervalle', 'hart', 'intensiv', 'schnell', 'tempo', 'vollgas']),
    answer: ctx => { const R = C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, ctx.today, { ...((ctx.state.settings || {}).readiness || {}), sleepNeed: sleepNeed(ctx.profile, ctx.today) });
      const pain = C.painFlag(ctx.state, weeksOf(ctx), ctx.today);
      if (C.illnessAt(ctx.state.illnessPeriods, ctx.today) || C.returnStageActive(ctx.state.illnessPeriods, ctx.today)) return 'Heute nicht: nach oder während einer Krankheit gibt es zuerst nur lockere Einheiten.';
      if (pain) return `Lieber nicht: in deinen Notizen steht ${pain} über 2/10. Locker bewegen ist okay.`;
      if (R.level === 3) return 'Ohne Morgenwerte entscheide ich vorsichtig: wenn du dich frisch fühlst und gut geschlafen hast, ja, sonst locker. Trag kurz deine Werte ein, dann weiß ich mehr.';
      if (R.level === 0) return `Ja, deine Werte sind gut (Ampel grün, ${R.score}/100). Intervalle sind heute möglich, ausreichend aufwärmen.${isMinor(ctx.profile, ctx.today) && !ctx.planMeta.runIntervalsAllowed ? ' Lauf-Intervalle sind für dich aber noch nicht freigegeben, Rad oder Schwimmen gehen.' : ''}`;
      return `Heute lieber nicht: Ampel ${R.level === 1 ? 'gelb' : 'rot'} (${R.score}/100)${R.reasons.length ? ', ' + R.reasons.join(', ') : ''}. Locker bringt heute mehr.`; } },
  { id: 'when-intervals', when: t => has(t, ['wann']) && has(t, ['intervall', 'intervalle', 'hart', 'schnell']), answer: (ctx, _t, _r, x) => answerQuick(ctx, 'intervals', x) },
  { id: 'goal', when: t => has(t, ['ziel', 'schaffe ich', 'prognose', 'zielzeit', 'wettkampf']) && has(t, ['wie', 'schaffe', 'prognose', 'laeuft', 'stand', 'realistisch', 'zielzeit']), answer: (ctx, _t, _r, x) => answerQuick(ctx, 'goal', x) },
  { id: 'week', when: t => has(t, ['woche', 'wochenrueckblick']) && has(t, ['wie war', 'war', 'rueckblick', 'bilanz', 'zusammenfassung']), answer: (ctx, _t, _r, x) => answerQuick(ctx, 'week', x) },
  { id: 'improved', when: t => has(t, ['verbessert', 'besser geworden', 'fortschritt', 'fortschritte', 'entwicklung']), answer: (ctx, _t, _r, x) => answerQuick(ctx, 'improved', x) },
  { id: 'today', when: t => has(t, ['heute']) && has(t, ['was', 'steht', 'training', 'plan', 'mache', 'machen']),
    answer: ctx => { const l = live(dayOf(ctx, ctx.today)); return l.length ? `Heute: ${joinDe(l.map(sessLine))}.${l[0].description ? ' ' + String(l[0].description).split('\n')[0] : ''}` : 'Heute ist Ruhetag. Erholung ist Teil des Trainings.'; } },
  { id: 'tomorrow', when: t => has(t, ['morgen']) && !has(t, ['guten']) && has(t, ['was', 'steht', 'training', 'plan', 'mache']),
    answer: ctx => { const d = C.addDays(ctx.today, 1); const l = live(dayOf(ctx, d)); return l.length ? `Morgen: ${joinDe(l.map(sessLine))}.` : 'Morgen ist Ruhetag.'; } },
  { id: 'readiness', when: t => has(t, ['ampel', 'erholt', 'wie geht es mir', 'readiness', 'bereit', 'form heute']),
    answer: ctx => { const R = C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, ctx.today, { ...((ctx.state.settings || {}).readiness || {}), sleepNeed: sleepNeed(ctx.profile, ctx.today) });
      if (R.level === 3) return 'Für heute fehlen Morgenwerte (Schlaf, Ruhepuls, HFV). Trag sie kurz ein oder verbinde deine Uhr.';
      return `Ampel ${['grün', 'gelb', 'rot'][R.level]} (${R.score}/100).${R.reasons.length ? ' ' + R.reasons.join(', ') + '.' : ' Alles im grünen Bereich.'}${R.personal ? '' : ' Dein persönlicher Normalbereich wird noch gelernt.'}`; } },
  { id: 'sleep', when: t => has(t, ['schlaf', 'geschlafen', 'schlafen']) && !has(t, ['wie viel schlaf brauche']),
    answer: ctx => { const p = (ctx.state.trend || []).filter((x: any) => x && x.sleepHours != null).slice(-7); const need = sleepNeed(ctx.profile, ctx.today);
      if (!p.length) return `Ich habe noch keine Schlafwerte. Du brauchst etwa ${de(need[0])}-${de(need[1])} h.`;
      const avg = p.reduce((a: number, x: any) => a + x.sleepHours, 0) / p.length;
      return `Letzte Nacht ${de(p[p.length - 1].sleepHours)} h, im Schnitt der letzten ${p.length} Nächte ${de(avg)} h. Dein Bedarf: ${de(need[0])}-${de(need[1])} h.${avg < need[0] ? ' Etwas mehr Schlaf würde dir helfen.' : ''}`; } },
  { id: 'sleep-need', when: t => has(t, ['wie viel schlaf', 'schlaf brauche', 'schlafbedarf']), answer: ctx => { const n = sleepNeed(ctx.profile, ctx.today); return `In deinem Alter etwa ${de(n[0])}-${de(n[1])} Stunden. Schlaf ist die wichtigste Erholung, wichtiger als jede Massage.`; } },
  { id: 'hrv', when: t => has(t, ['hfv', 'hrv', 'herzfrequenzvariabilitaet', 'variabilitaet']),
    answer: ctx => { const p = (ctx.state.trend || []).filter((x: any) => x && x.hrv).slice(-1)[0]; const b = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, ctx.today, 'hrv', Math.log);
      return p ? `Deine HFV zuletzt: ${p.hrv} ms (${p.date.split('-').reverse().join('.')}).${b && b.n >= C.MIN_DAYS ? ` Normal sind bei dir etwa ${Math.round(Math.exp(b.mean))} ms.` : ' Deinen Normalbereich lerne ich noch.'} Höher als normal heißt meist: gut erholt.` : 'Ich habe noch keine HFV-Werte. Mit Uhr, Ring oder dem Apple-Health-Kurzbefehl kommen sie automatisch.'; } },
  { id: 'rhr', when: t => has(t, ['ruhepuls', 'ruheherzfrequenz']),
    answer: ctx => { const p = (ctx.state.trend || []).filter((x: any) => x && x.restingHR).slice(-1)[0]; const b = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, ctx.today, 'restingHR');
      return p ? `Ruhepuls zuletzt ${p.restingHR}.${b && b.n >= C.MIN_DAYS ? ` Normal sind bei dir etwa ${Math.round(b.mean)}.` : ' Deinen Normalbereich lerne ich noch.'} 5 Schläge über normal sind ein Warnzeichen.` : 'Noch keine Ruhepuls-Werte.'; } },
  { id: 'zones', when: t => has(t, ['zone', 'zonen', 'pulsbereich', 'welcher puls', 'puls']) && !has(t, ['ruhepuls', 'zone 2 ist', 'was ist zone']),
    answer: ctx => { const th = ctx.profile.thresholds; const z = hrZonesFor(th.lthrRun); const est = (th.estimated || []).includes('lthrRun');
      return `Laufen: Zone 2 (locker) ${z[1].lo}-${z[1].hi}, Zone 4 (Schwelle) ${z[3].lo}-${z[3].hi} Schläge.${est ? ' Die Werte sind aus deinem Profil geschätzt. Ein 30-min-Lauftest macht sie genau.' : ''} Alle Zonen stehen unter Mehr → Einstellungen.`; } },
  { id: 'what-zone2', when: t => has(t, ['was ist', 'was bedeutet', 'erklaer']) && has(t, ['zone', 'grundlage', 'schwelle', 'rpe', 'hfv', 'ctl', 'tapering']),
    answer: (_c, t) => has(t, ['tapering']) ? 'Tapering heißt: vor dem Wettkampf weniger trainieren, aber kurz und knackig. So startest du frisch.' : has(t, ['rpe']) ? 'RPE ist dein Gefühl von 1 (ganz leicht) bis 10 (Maximum). 3-4 ist locker, 7-8 hart.' : has(t, ['ctl']) ? 'CTL ist deine Fitness aus den letzten etwa 6 Wochen Training, ATL die Müdigkeit der letzten Woche.' : has(t, ['schwelle']) ? 'Die Schwelle ist das Tempo, das du etwa eine Stunde halten kannst. Zone 4 liegt dort.' : 'Zone 2 ist locker: du kannst noch ganze Sätze sprechen. Dort entsteht die Grundlage, etwa 80 % deines Trainings.' },
  { id: 'nutrition', when: t => has(t, ['essen', 'ernaehrung', 'kalorien', 'kohlenhydrate', 'eiweiss', 'protein', 'hunger']) && !has(t, ['wettkampf', 'rennen']),
    answer: () => ({ intent: 'nutrition', text: 'Dein Bedarf für heute steht unter Mehr → Essen, passend zum Training. Grundregel: genug essen, Kohlenhydrate rund ums Training, Protein über den Tag verteilt.', actions: [{ label: 'Zu Essen', kind: 'go', payload: 'essen' }] }) },
  { id: 'race-fuel', when: t => has(t, ['verpflegung', 'gel', 'trinken']) && has(t, ['wettkampf', 'rennen', 'unterwegs', 'beim']), answer: () => ({ intent: 'race-fuel', text: 'Unter Mehr → Wettkampf steht dein Verpflegungsplan: wann wie viel Kohlenhydrate und Trinken. Nur Produkte, die du im Training getestet hast.', actions: [{ label: 'Zum Wettkampf-Modus', kind: 'go', payload: 'wettkampf' }] }) },
  { id: 'next-race', when: t => has(t, ['wann']) && has(t, ['wettkampf', 'rennen', 'ziel', 'triathlon', 'marathon', 'lauf']),
    answer: ctx => { const g = nextGoal(ctx.goals, ctx.today); if (!g) return 'Du hast noch kein Ziel mit Datum. Leg eins unter Mehr → Profil und Ziele an.';
      const n = Math.round((+new Date(g.date + 'T12:00:00Z') - +new Date(ctx.today + 'T12:00:00Z')) / 86400000); return `${g.name} ist am ${g.date!.split('-').reverse().join('.')}, in ${n} Tagen (Priorität ${g.priority}).`; } },
  { id: 'plan-why', when: t => has(t, ['warum', 'wieso']) && has(t, ['so oft', 'so viel', 'plan', 'aufgebaut', 'oft']),
    answer: ctx => ((ctx.planMeta && ctx.planMeta.explain) || []).join(' ') || 'Der Plan richtet sich nach deinem Hauptziel: erst Grundlage, dann Aufbau, dann wettkampfnah, vor dem Rennen weniger. Alle 3-4 Wochen eine Erholungswoche.' },
  { id: 'strength', when: t => has(t, ['kraft', 'krafttraining', 'uebungen', 'stabi']),
    answer: ctx => { const s = C.planDays(weeksOf(ctx)).filter((d: any) => d.date >= ctx.today).flatMap((d: any) => live(d).filter((x: any) => x.sport === 'strength').map((x: any) => ({ x, d: d.date })))[0];
      return s ? `Nächste Krafteinheit: ${fmtD(s.d)}. ${String(s.x.description || '').split('\n').slice(0, 5).join(' ')}` : 'Im Plan ist gerade keine Krafteinheit. Unter Mehr → Fragebogen kannst du Kraft mit Häufigkeit wählen.'; } },
  { id: 'swim-learn', when: t => has(t, ['kraulen', 'kraul']) && has(t, ['lernen', 'kann nicht', 'wie', 'atmen', 'atmung']),
    answer: () => 'Kraul lernst du in Stufen: Wassergewöhnung und Ausatmen ins Wasser, Beinschlag mit Brett, Technikübungen, dann kurze Strecken mit Pause und immer längere Stücke. Der Plan steigert erst, wenn die Stufe klappt. Ein Kurs oder eine Stunde mit Trainer hilft enorm.' },
  { id: 'test', when: t => has(t, ['test', 'schwellentest', 'ftp', 'css']) && !has(t, ['nachricht']),
    answer: ctx => { const est = ctx.profile.thresholds.estimated || []; return est.length ? `Diese Werte sind noch geschätzt: ${est.length}. Tests: 30 min Laufen so schnell wie gleichmäßig möglich, 20 min Rad volle Leistung, 400 m und 200 m Kraul schnell. Danach trägst du die Werte unter Einstellungen → Zonen ein.` : 'Deine Zonen beruhen schon auf eigenen Werten. Ein neuer Test lohnt sich etwa alle 6-8 Wochen.'; } },
  { id: 'recovery-week', when: t => has(t, ['erholungswoche', 'ruhewoche', 'entlastungswoche']),
    answer: ctx => { const w = weeksOf(ctx).find((x: any) => x.isRecoveryWeek && x.endDate >= ctx.today); return w ? `Die nächste Erholungswoche beginnt am ${w.startDate.split('-').reverse().join('.')}.` : 'In den geplanten Wochen kommt keine Erholungswoche mehr, vor dem Wettkampf wird ohnehin reduziert.'; } },
  { id: 'too-hard', when: t => has(t, ['zu viel', 'zu hart', 'zu anstrengend', 'ueberfordert', 'zu schwer', 'schaffe das nicht']),
    answer: ctx => ({ intent: 'too-hard', text: 'Danke für die ehrliche Rückmeldung, das ist wichtig. Ich kann die Woche um 10 % leichter machen. Wenn es dauerhaft zu viel ist, stell unter Mehr → Profil die Stunden pro Woche niedriger.', actions: [{ label: 'Woche leichter machen', kind: 'adjust', payload: scaleWeek(ctx, 0.9) }] }) },
  { id: 'too-easy', when: t => has(t, ['zu leicht', 'zu wenig', 'mehr training', 'kann mehr', 'unterfordert']),
    answer: ctx => ({ intent: 'too-easy', text: 'Schön, dass es gut läuft! Mehr als 10 % pro Woche mehr ist aber riskant. Ich kann die Woche um 10 % schwerer machen.', actions: [{ label: 'Woche schwerer machen', kind: 'adjust', payload: scaleWeek(ctx, 1.1) }] }) },
  { id: 'heat', when: t => has(t, ['hitze', 'heiss', 'warm', 'sommer']), answer: () => 'Bei Hitze: früh morgens oder abends trainieren, 10-20 % langsamer, viel trinken (mit Salz bei langen Einheiten). Der Puls ist bei Hitze höher, das ist normal.' },
  { id: 'rain', when: t => has(t, ['regen', 'regnet', 'schlechtes wetter', 'gewitter', 'schnee', 'glatt']), answer: () => 'Bei Gewitter oder Glätte nicht raus. Rad geht auf der Rolle, Laufen auf dem Laufband. Eine Einheit verschieben ist auch okay: schreib einfach „Verschieb das Rad auf Samstag“.' },
  { id: 'travel', when: t => has(t, ['urlaub', 'reise', 'verreist', 'unterwegs', 'weg']), answer: () => 'Schreib mir pro Tag, an dem du keine Zeit hast, zum Beispiel „Am Mittwoch habe ich keine Zeit“. Dann plane ich die Woche um. Für längere Pausen: unter Mehr → Berücksichtigungen eintragen.' },
  { id: 'motivation', when: t => has(t, ['motivation', 'motiviert', 'lust']), answer: ctx => { const g = mainGoal(ctx.goals, ctx.today); return `Das kennt jeder. Fang mit 10 Minuten an, meistens wird es dann mehr. ${g ? `Denk an ${g.name}: jede Einheit bringt dich näher hin.` : ''} Und wenn wirklich nichts geht: ein Ruhetag ist auch Training.`; } },
  { id: 'extra', when: t => has(t, ['ich war', 'zusaetzlich', 'extra']) && !!sportIn(t), answer: () => ({ intent: 'extra', text: 'Stark! Trag die Einheit im Plan unter „Extra-Einheit eintragen“ ein oder lass sie von der Uhr kommen, dann zählt sie zur Belastung.', actions: [{ label: 'Zum Plan', kind: 'go', payload: 'plan' }] }) },
  { id: 'connect', when: t => has(t, ['verbinden', 'garmin', 'polar', 'coros', 'suunto', 'wahoo', 'oura', 'whoop', 'apple health', 'uhr', 'daten kommen']),
    answer: () => ({ intent: 'connect', text: 'Unter Mehr → Verbindungen verbindest du Uhr oder Ring. Garmin, COROS, Suunto und Wahoo gehen kostenlos über intervals.icu (3 Schritte), Apple Health über den Kurzbefehl oder HealthFit.', actions: [{ label: 'Zu den Verbindungen', kind: 'go', payload: 'verbindungen' }] }) },
  { id: 'weight', when: t => has(t, ['gewicht', 'abnehmen', 'zunehmen', 'wiegen']), answer: ctx => isMinor(ctx.profile, ctx.today) ? 'Gewichtsziele setze ich unter 18 nicht. Wichtig ist, genug zu essen, damit du wachsen und trainieren kannst.' : 'Beim Ausdauertraining zählt zuerst genug Energie. Wenn du abnehmen willst: höchstens langsam, nie an harten Tagen sparen und nicht vor wichtigen Rennen.' },
  { id: 'goal-change', when: t => has(t, ['neues ziel', 'ziel aendern', 'anderes ziel', 'ziel hinzufuegen']), answer: () => ({ intent: 'goal-change', text: 'Ziele änderst du unter Mehr → Profil und Ziele. Danach baue ich den Plan passend um.', actions: [{ label: 'Zu Profil und Ziele', kind: 'go', payload: 'profil' }] }) },
  { id: 'game', when: (t) => has(t, ['spiel', 'spieltag', 'turnier']), answer: ctx => ctx.profile.teamSport ? 'Spieltag zählt als harter Tag. Am Tag davor plane ich nichts Hartes, danach locker. 3-4 Stunden vorher eine große Kohlenhydrat-Mahlzeit.' : 'Wenn du Teamsport machst, trag ihn im Fragebogen ein (Teil Teamsport). Dann plane ich Training und Spiele mit ein.' },
  { id: 'longest', when: t => has(t, ['laengste', 'langste']) && has(t, ['einheit', 'lauf', 'fahrt', 'training']),
    answer: ctx => { const a = Object.values(ctx.state.activities || {}).filter((x: any) => x && !x.mergedInto) as any[]; if (!a.length) return 'Ich habe noch keine aufgezeichneten Einheiten.'; const l = a.sort((x, y) => (y.min || 0) - (x.min || 0))[0]; return `Deine längste Einheit: ${Math.round(l.min)} min ${({ run: 'Laufen', bike: 'Rad', swim: 'Schwimmen' } as any)[l.sport] || l.sport} am ${String(l.date).split('-').reverse().join('.')}.`; } },
  { id: 'greet', when: t => t.length <= 4 && has(t, ['hallo', 'hi', 'hey', 'moin', 'servus', 'guten morgen', 'guten abend', 'gruss']), answer: ctx => { const l = live(dayOf(ctx, ctx.today)); return `Hallo! ${l.length ? `Heute steht ${joinDe(l.map(sessLine))} an.` : 'Heute ist Ruhetag.'} Was möchtest du wissen?`; } },
  { id: 'thanks', when: t => has(t, ['danke', 'merci', 'thx', 'super', 'cool', 'perfekt']) && t.length <= 6, answer: () => 'Gerne! Ich bin da, wenn du was brauchst.' },
  { id: 'help', when: t => has(t, ['hilfe', 'was kannst du', 'wie funktioniert', 'was geht', 'befehle']), answer: () => helpText() }
];

function helpText(): ChatReply {
  return { intent: 'help', text: 'Ich verstehe einfache Sätze rund um dein Training, zum Beispiel: warum heute locker ist, ob du Intervalle machen kannst, dass du krank bist oder Schmerzen hast, dass du an einem Tag keine Zeit hast, oder dass ich eine Einheit verschieben soll. Ich antworte mit deinen echten Daten.', suggestions: SUGGEST };
}
export const SUGGEST = ['Warum heute locker?', 'Kann ich heute Intervalle machen?', 'Wie läuft es mit meinem Ziel?', 'Ich habe am Mittwoch keine Zeit', 'Verschieb den langen Lauf auf Sonntag', 'Ich bin krank'];

/* Harte Einheiten heute → locker (wie bei gelber Ampel) */
function easyToday(ctx: EngineCtx): any[] {
  const g = gid();
  return live(dayOf(ctx, ctx.today)).filter((s: any) => C.isHard(s) && !s.fixed && !s.race && !((ctx.state.sessions || {})[s.id] || {}).completed).map((s: any) => ({ id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set: { title: 'Locker statt: ' + s.title, zone: 'Zone 2', plannedMinutes: Math.min(45, s.plannedMinutes || 45), plannedKm: null, hard: false, spec: null, description: 'Auf deinen Wunsch locker in Zone 2 statt hart. Du kannst noch ganze Sätze sprechen.' }, what: `${s.title} → locker`, reason: 'Wunsch im Coach-Chat' }));
}
function scaleWeek(ctx: EngineCtx, f: number): any[] {
  const g = gid();
  const w = weeksOf(ctx).find((x: any) => x.days.some((d: any) => d.date === ctx.today)); if (!w) return [];
  return w.days.filter((d: any) => d.date >= ctx.today).flatMap((d: any) => live(d).filter((s: any) => !s.fixed && !s.race && !s.locked && !s.stage && s.plannedMinutes).map((s: any) => ({ id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set: { plannedMinutes: Math.max(10, Math.round(s.plannedMinutes * f / 5) * 5), ...(s.plannedKm ? { plannedKm: Math.round(s.plannedKm * f * 10) / 10 } : {}) }, what: `${s.title} ${f > 1 ? '+' : '−'}10 %`, reason: 'Wunsch im Coach-Chat' })));
}

/* Hauptfunktion: Text → Antwort */
export function understand(ctx: EngineCtx, text: string, extra: Extra = {}): ChatReply {
  const raw = String(text || '').slice(0, 500);
  const hits = checkMessage(raw);
  if (hits.length) {
    const h = hits[0];
    if (h.flag === 'fever' && !C.illnessAt(ctx.state.illnessPeriods, ctx.today)) return { intent: 'sick', text: h.text + ' Soll ich ab heute eine Krankheitsphase eintragen?', actions: [{ label: 'Ja, Krankheit eintragen', kind: 'illness-start' }] };
    return { intent: 'safety', text: h.text };
  }
  const toks = norm(raw).split(' ').filter(Boolean);
  if (!toks.length) return helpText();
  for (const it of INTENTS) {
    try {
      if (!it.when(toks, norm(raw))) continue;
      const a = it.answer(ctx, toks, norm(raw), extra);
      return typeof a === 'string' ? { intent: it.id, text: a } : a;
    } catch (e) { /* nächste Absicht probieren */ }
  }
  return { intent: 'unknown', text: 'Das verstehe ich leider noch nicht. Ich kann Fragen zu Training, Erholung, Plan und Zielen beantworten und den Plan umstellen. Probier zum Beispiel einen dieser Sätze:', suggestions: SUGGEST };
}
void GOALS; void A;
