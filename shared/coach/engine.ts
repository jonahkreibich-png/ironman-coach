/* Coach-Engine (Algorithmus, ohne KI). Läuft auf dem Server bei jedem neuen Datenpunkt (Einheit, Nachtwerte,
   Krankheits-Notiz, Essen) und zusätzlich täglich und wöchentlich. Wertet aus, passt den Plan nach festen Regeln an
   und schreibt jede Änderung mit Grund als Nachricht in den Coach-Chat. Funktioniert ohne KI und ohne Einwilligung. */
import * as C from '../core';
import type { Profile } from '../profile';
import { sleepNeed, isMinor } from '../profile';
import type { Goal } from '../goals';
import { mainGoal } from '../goals';
import { T, pick, de, mmss, joinDe, dowName } from './texts';
import { checkData, type SafetyHit } from './safety';
import { underEatingCheck } from '../nutrition';
import { doneItems, autoReview, type Done } from './review';
import { extraChecks } from './extra';

export interface CoachMsg {
  id: string; at: number; date: string;
  kind: 'adjust' | 'briefing' | 'session' | 'week' | 'warning' | 'answer' | 'info' | 'proposal' | 'user';
  from: 'coach' | 'ai' | 'user';
  title?: string; text: string;
  important?: boolean;
  refs?: { sessionId?: string; activityId?: string; adjustmentIds?: string[] };
  proposal?: { changes: any[]; status: 'open' | 'accepted' | 'rejected' } | null;
  readiness?: { level: number; score: number | null };
}
export interface EngineCtx {
  today: string; now: number;
  state: any;          // sessions, customWorkouts, trend, illnessPeriods, weekNotes, adjustments, nutrition, settings, activities, coachMsgs
  baseWeeks: any[];
  planMeta: any;
  profile: Profile;
  goals: Goal[];
}
export type EngineEvent = { type: 'activity'; activityIds?: string[]; sessionIds?: string[] } | { type: 'trend'; dates: string[] } | { type: 'illness' } | { type: 'nutrition' } | { type: 'daily' } | { type: 'weekly' };
export interface EngineOut { adjustments: any[]; messages: CoachMsg[] }

const has = (ctx: EngineCtx, id: string) => !!(ctx.state.coachMsgs || {})[id];
function msg(ctx: EngineCtx, m: Omit<CoachMsg, 'at' | 'from'> & { from?: CoachMsg['from'] }): CoachMsg { return { from: 'coach', at: ctx.now, ...m }; }
/* Eingabe für die Ampel: eigene Grenzen, Schlafbedarf und Belastung (Fitness/Müdigkeit aus intervals.icu, sonst aus den Einheiten) */
export function readinessFallback(ctx: EngineCtx) {
  const fb: any = { ...(ctx.state.settings && ctx.state.settings.readiness || {}), sleepNeed: sleepNeed(ctx.profile, ctx.today) };
  if (fb.load === undefined) { try { const L = C.loadBaseline(ctx.state, C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {}), ctx.today); fb.load = L.ctl != null && L.atl != null ? { ctl: L.ctl, atl: L.atl } : null; } catch (e) { fb.load = null; } }
  return fb;
}
export function readinessOf(ctx: EngineCtx, date = ctx.today) { return C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, date, readinessFallback(ctx)); }
const fallback = readinessFallback;
function effWeeks(ctx: EngineCtx, extra?: any[]) { return C.applyAdjustments(ctx.baseWeeks, Object.assign({}, ctx.state.adjustments, Object.fromEntries((extra || []).map(a => [a.id, a])))); }
function dayOf(weeks: any[], date: string) { return C.planDays(weeks).find((d: any) => d.date === date) || null; }
function live(day: any) { return day ? day.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled) : []; }
const sessLabel = (s: any) => `${s.title}${s.plannedMinutes ? ` (${s.plannedMinutes} min)` : ''}`;

/* Gründe der Ampel als Sätze mit echten Zahlen */
export function readinessFacts(ctx: EngineCtx, date: string): string[] {
  const p = (ctx.state.trend || []).find((x: any) => x && x.date === date);
  if (!p) return [];
  const out: string[] = [];
  const bH = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, date, 'hrv', Math.log);
  if (p.hrv && bH && bH.n >= C.MIN_DAYS) { const norm = Math.exp(bH.mean); const pct = Math.round((1 - p.hrv / norm) * 100); if (pct >= 10) out.push(`deine HFV liegt ${pct} % unter deinem Normalwert`); }
  const bR = C.baselineOf(ctx.state.trend, ctx.state.illnessPeriods, date, 'restingHR');
  if (p.restingHR && bR && bR.n >= C.MIN_DAYS) { const d = Math.round(p.restingHR - bR.mean); if (d >= 3) out.push(`dein Ruhepuls ist ${d} Schläge höher als normal`); }
  const need = sleepNeed(ctx.profile, ctx.today);
  if (p.sleepHours != null && p.sleepHours < need[0] - 0.5) out.push(`du hast nur ${de(p.sleepHours)} h geschlafen`);
  if (p.bodyTemp != null && p.bodyTemp >= 0.3) out.push(`deine Temperatur ist um ${de(p.bodyTemp)} °C erhöht`);
  return out;
}

/* Text zu einer Gruppe von Anpassungen: was, warum, wie es weitergeht */
export function adjustmentText(ctx: EngineCtx, list: any[], date: string): string {
  const parts: string[] = [];
  const facts = readinessFacts(ctx, date);
  const why = facts.length ? joinDe(facts).replace(/^d/, 'D') + '.' : '';
  for (const a of list) {
    if (a.type === 'move') parts.push(`Ich habe „${a.what.split(':')[0]}“ auf ${dowName(a.to)} geschoben, weil du die Einheit verpasst hast und dort Platz ist.`);
    else if (a.type === 'cancel') parts.push(`„${a.what.replace(/ entfällt$/, '')}“ entfällt dafür.`);
    else if (a.type === 'modify' && /^Locker statt/.test((a.set && a.set.title) || '')) parts.push(`Ich habe deine harte Einheit heute durch ${a.set.plannedMinutes || 25} min ganz locker ersetzt.`);
    else if (a.type === 'modify' && /^Zone 2 statt/.test((a.set && a.set.title) || '')) parts.push(`Statt Intervallen heute ${a.set.plannedMinutes ? a.set.plannedMinutes + ' min ' : ''}locker in Zone 2.`);
    else if (a.type === 'modify' && /ladder/.test(a.id)) parts.push(`Rad-Leiter: ${a.what}. ${a.reason.replace(/^Intervall-Leiter Rad: /, '').replace(/^./, (c: string) => c.toUpperCase())}.`);
    else if (a.type === 'modify' && /-vol-/.test(a.id)) { /* Umfang: steht in der Zusammenfassung */ }
    else if (a.type === 'note') parts.push(`${a.what}. ${a.reason}.`);
    else parts.push(`${a.what}.`);
  }
  const vol = list.filter(a => /-vol-/.test(a.id));
  if (vol.length) parts.push(`Bei ${vol.length} Einheiten habe ich die Dauer angepasst.`);
  const guard = list.find(a => /^guard-/.test(a.id));
  const reason = guard ? guard.reason + '.' : why;
  return [...parts, reason].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/* Kommentar nach einer Einheit: Vergleich mit einer ähnlichen früheren Einheit, Intervalle, Schwimmtechnik */
export function sessionComment(ctx: EngineCtx, act: any, s: any): string {
  const seed = act.id;
  const acts = Object.values(ctx.state.activities || {}).filter((x: any) => x && !x.mergedInto && x.id !== act.id && x.sport === act.sport && x.date < act.date && x.date > C.addDays(act.date, -56)) as any[];
  const lines: string[] = [];
  const hard = s ? C.isIntervals(s) : !!(act.intervals && act.intervals.count >= 2);
  // Gleiche Runde: Distanz ±10 %, Tempo ±4 %
  if ((act.sport === 'run' || act.sport === 'bike') && act.avgHr && act.km && act.speedKmh) {
    const same = acts.filter(x => x.avgHr && x.km && x.speedKmh && Math.abs(x.km / act.km - 1) <= 0.1 && Math.abs(x.speedKmh / act.speedKmh - 1) <= 0.04 && !(x.intervals && x.intervals.count >= 2)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (same) {
      const d = Math.round(same.avgHr - act.avgHr);
      const weeks = Math.max(1, Math.round((+new Date(act.date) - +new Date(same.date)) / (7 * 86400000)));
      if (d >= 2) lines.push(`${d} Schläge weniger Puls als bei derselben Runde vor ${weeks === 1 ? 'einer Woche' : weeks + ' Wochen'}. Dein Herz arbeitet sparsamer.`);
      else if (d <= -4) lines.push(`Puls ${-d} Schläge höher als bei derselben Runde vor ${weeks === 1 ? 'einer Woche' : weeks + ' Wochen'}${act.tempC && act.tempC > 22 ? `, bei ${de(act.tempC, 0)} °C ist das normal` : '. Wenn das öfter vorkommt, brauchst du mehr Erholung'}.`);
    }
  }
  if (act.intervals && act.intervals.count >= 2) {
    const iv = act.intervals;
    const drift = Math.max(iv.hrDriftPct || 0, iv.dropPct || 0);
    lines.push(drift < 5 ? `${iv.count} Intervalle, sehr gleichmäßig (Abfall nur ${de(drift)} %).` : `${iv.count} Intervalle, im letzten ${de(drift)} % schwächer als im ersten. Beim nächsten Mal etwas ruhiger anfangen.`);
    if (iv.recoveryHrDrop) lines.push(`In den Pausen fiel dein Puls um ${iv.recoveryHrDrop} Schläge.`);
  }
  if (act.sport === 'swim' && act.swim) {
    const prev = acts.filter(x => x.swim && x.swim.strokesPerLength).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (act.swim.strokesPerLength && prev && prev.swim.strokesPerLength - act.swim.strokesPerLength >= 0.8) lines.push(`Nur noch ${de(act.swim.strokesPerLength)} Züge pro Bahn (vorher ${de(prev.swim.strokesPerLength)}). Dein Zug wird länger.`);
    if (act.swim.longestContinuousM && act.swim.longestContinuousM >= 400) lines.push(`${act.swim.longestContinuousM} m am Stück geschwommen.`);
  }
  if (act.decouplingPct != null && act.min >= 60) lines.push(act.decouplingPct <= 5 ? `Entkopplung ${de(act.decouplingPct)} %: deine Grundlage trägt.` : `Entkopplung ${de(act.decouplingPct)} %: in der zweiten Hälfte stieg der Puls. Mehr lange, lockere Einheiten helfen.`);
  const facts: string[] = [];
  if (act.km != null && act.sport !== 'swim') facts.push(`${de(act.km)} km`);
  if (act.sport === 'swim' && act.km) facts.push(`${Math.round(act.km * 1000)} m`);
  if (act.min) facts.push(`${act.min} min`);
  if (act.sport === 'run' && act.paceSecKm) facts.push(`${mmss(act.paceSecKm)}/km`);
  if (act.avgHr) facts.push(`Puls ${act.avgHr}`);
  const head = `${s ? s.title : (act.name || 'Einheit')}: ${facts.join(', ')}.`;
  const tone = hard ? T.doneHard(seed) : (act.avgHr && act.avgHr <= 0.89 * (act.sport === 'bike' ? ctx.profile.thresholds.lthrBike : ctx.profile.thresholds.lthrRun) ? T.doneEasy(seed) : T.doneGeneric(seed));
  return [head, ...(lines.length ? lines.slice(0, 2) : [tone])].join(' ');
}

export function morningBriefing(ctx: EngineCtx, date: string, adjustments: any[]): CoachMsg {
  const R = C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, date, fallback(ctx));
  const weeks = effWeeks(ctx, adjustments);
  const list = live(dayOf(weeks, date));
  const ill = C.illnessAt(ctx.state.illnessPeriods, date);
  const seed = 'brief-' + date;
  const name = (ctx.profile.name || '').split(' ')[0];
  const lines: string[] = [T.greet(seed, name)];
  if (ill) lines.push('Heute kein Training. Schlafen, trinken, genug essen. Sag mir Bescheid, wenn es dir besser geht.');
  else if (R.level === 3) {
    lines.push(R.uncertain === 'few' ? C.readinessLine(R) : 'Ampel unsicher – noch keine Morgenwerte. Sobald Schlaf und Ruhepuls da sind, sage ich dir, wie hart es heute sein darf.' + (R.staleLevel != null ? ` Nach den letzten Werten sah es ${['gut', 'eher nach locker', 'nach Ruhe'][R.staleLevel] || 'unklar'} aus.` : ''));
  }
  else {
    // Auftrag 14: derselbe Wert wie im Ring auf „Heute“ (Farbe aus dem Wert)
    const facts = readinessFacts(ctx, date);
    if (R.level === 0) lines.push(`${T.green(seed)} Ampel grün (${R.score}/100): normal trainieren.`);
    else lines.push(`Ampel ${R.level === 1 ? 'gelb' : 'rot'} (${R.score}/100): ${R.level === 1 ? 'lockerer trainieren, Intensität raus' : 'Ruhe oder nur ganz locker'}. ${facts.length ? joinDe(facts).replace(/^d/, 'D') + '.' : (R.reasons.join(', ') + '.')}`);
  }
  if (!ill) lines.push(list.length ? `Heute: ${joinDe(list.map(sessLabel))}.` : 'Heute ist kein Training geplant. Genieß den Ruhetag.');
  const zoneTip = list.find((s: any) => C.zoneBpm(s, ctx.profile.thresholds, null));
  if (zoneTip && !ill) lines.push(`Puls für ${zoneTip.title}: ${C.zoneBpm(zoneTip, ctx.profile.thresholds, null)}.`);
  return msg(ctx, { id: 'msg-brief-' + date, date, kind: 'briefing', title: R.level === 3 ? 'Guten Morgen' : `Ampel ${['🟢', '🟡', '🔴'][R.level] || ''}`, text: lines.join(' '), important: R.level === 2, readiness: { level: R.level, score: R.score } });
}

export function weeklyReview(ctx: EngineCtx, date: string, adjustments: any[], summary: any): CoachMsg {
  const S = summary || C.weekSummary(ctx.state, ctx.baseWeeks, date);
  const weeks = effWeeks(ctx, adjustments);
  const next = C.planDays(weeks).filter((d: any) => d.date > date && d.date <= C.addDays(date, 7)).flatMap((d: any) => live(d).map((s: any) => ({ ...s, date: d.date })));
  const hours = Math.round(next.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0) / 6) / 10;
  const key = next.filter((s: any) => C.isKey(s)).map((s: any) => `${dowName(s.date).slice(0, 2)} ${s.title}`);
  const note = adjustments.find(a => a.type === 'note');
  const lines = [
    `Deine Woche: ${S.nDone} von ${S.nPlanned} Einheiten${S.ratio != null ? `, ${Math.round(S.ratio * 100)} % der geplanten Belastung` : ''}.`,
    S.withValues ? `${S.green} grüne, ${S.yellow} gelbe und ${S.red} rote Tage.` : '',
    S.sleepAvg != null ? `Schlaf im Schnitt ${de(S.sleepAvg)} h${S.sleepAvg < sleepNeed(ctx.profile, ctx.today)[0] ? ', da geht noch was' : ''}.` : '',
    note ? `${note.what}: ${note.reason}.` : '',
    next.length ? `Nächste Woche: ${next.length} Einheiten, ${de(hours)} h${key.length ? `, wichtig sind ${joinDe(key.slice(0, 3))}` : ''}.` : 'Für nächste Woche steht noch kein Plan.',
    pick(['Gute Erholung am Sonntagabend!', 'Starte gut in die neue Woche.', 'Weiter so!'], 'week-' + date)
  ].filter(Boolean);
  return msg(ctx, { id: 'msg-week-' + date, date, kind: 'week', title: 'Wochenrückblick', text: lines.join(' '), important: true });
}

/* ---------- Hauptfunktion ---------- */
export function runEngine(ctx: EngineCtx, ev: EngineEvent): EngineOut {
  const out: EngineOut = { adjustments: [], messages: [] };
  const today = ctx.today;
  // Schlafbedarf aus dem Profil auch für die Ampel in den Regeln
  ctx = { ...ctx, state: { ...ctx.state, profile: ctx.profile, settings: { ...(ctx.state.settings || {}), readiness: fallback(ctx) } } };
  const push = (m: CoachMsg) => { if (!has(ctx, m.id) && !out.messages.some(x => x.id === m.id)) out.messages.push(m); };

  // Warnzeichen in den Daten (einmal pro Art und Woche)
  const flags: SafetyHit[] = checkData(ctx.state, today);
  for (const f of flags) push(msg(ctx, { id: `msg-flag-${f.flag}-${C.weekRange(today)[0]}`, date: today, kind: 'warning', title: f.urgent ? 'Bitte ernst nehmen' : 'Achtung', text: f.text, important: true }));

  if (ev.type === 'activity') {
    const weeks = effWeeks(ctx);
    const byId: Record<string, any> = {};
    C.planDays(weeks).forEach((d: any) => d.sessions.forEach((s: any) => { byId[s.id] = { ...s, date: d.date }; }));
    const acts = Object.values(ctx.state.activities || {}).filter((a: any) => a && !a.mergedInto && (!ev.activityIds || ev.activityIds.includes(a.id)) && a.date >= C.addDays(today, -2)) as any[];
    // Auftrag 12: Bewertung in 3 Teilen (Einstellung „Bewertung nach jeder Einheit“: ausführlich, kurz oder aus)
    const mode = ((ctx.state.settings || {}).coachReview || 'full') as 'full' | 'short' | 'off';
    const seen = new Set<string>();
    for (const a of acts) {
      const s = a.sessionId ? byId[a.sessionId] : null;
      if (mode === 'off') continue;
      const key = a.sessionId || a.id; seen.add(key);
      const d: Done = doneItems(ctx, a.date, a.date).find(x => x.key === key || (x.act && x.act.id === a.id)) || { key, date: a.date, sport: a.sport, title: s ? s.title : (a.name || 'Einheit'), planned: s, st: (ctx.state.sessions || {})[key] || {}, act: a, custom: !s };
      let text: string; try { text = autoReview(ctx, d, mode); } catch (e) { text = sessionComment(ctx, a, s); }
      push(msg(ctx, { id: 'msg-review-' + key, date: a.date, kind: 'session', title: 'Bewertung: ' + (s ? s.title : (a.name || 'Einheit')), text, refs: { activityId: a.id, sessionId: a.sessionId || undefined } }));
    }
    // von Hand abgehakte Einheiten ohne Aufzeichnung (heute und gestern)
    if (mode !== 'off') for (const d of doneItems(ctx, C.addDays(today, -1), today)) {
      if (d.act || seen.has(d.key)) continue;
      let text: string; try { text = autoReview(ctx, d, mode); } catch (e) { continue; }
      push(msg(ctx, { id: 'msg-review-' + d.key, date: d.date, kind: 'session', title: 'Bewertung: ' + d.title, text, refs: { sessionId: d.custom ? undefined : d.key } }));
    }
    // Auftrag 13: Extra-Einheiten zählen für den Plan (harte Extra-Einheit → nächster harter Tag, volle Woche → Entlastung)
    try { for (const m of extraChecks(ctx)) push(m); } catch (e) { /* Prüfung darf die Bewertung nicht verhindern */ }
  }

  if (ev.type === 'trend' || ev.type === 'daily' || ev.type === 'illness') {
    const p = (ctx.state.trend || []).find((x: any) => x && x.date === today);
    const haveValues = C.hasRecovery(p);
    // Auftrag 14: Kommen später am Morgen weitere Werte (z. B. erst Ruhepuls, dann Schlaf), wird die Morgen-Nachricht mit dem neuen Wert erneuert
    const brief: any = (ctx.state.coachMsgs || {})['msg-brief-' + today];
    const Rnow = C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, today, ctx.state.settings.readiness);
    const changedR = !!brief && haveValues && (!brief.readiness || brief.readiness.level !== Rnow.level || brief.readiness.score !== Rnow.score);
    const dailyDone = (Object.values(ctx.state.adjustments || {}).some((a: any) => a && a.group === 'daily-' + today) || !!brief) && !changedR;
    if ((haveValues || ev.type === 'daily') && !dailyDone) {
      const adj = C.dailyAdjustments(ctx.state, ctx.baseWeeks, today, { planMeta: ctx.planMeta, now: ctx.now });
      out.adjustments.push(...adj);
      const groups: Record<string, any[]> = {};
      adj.forEach(a => { (groups[a.group || a.id] = groups[a.group || a.id] || []).push(a); });
      Object.entries(groups).forEach(([g, list]) => push(msg(ctx, { id: 'msg-adj-' + g, date: today, kind: 'adjust', title: 'Plan angepasst', text: adjustmentText(ctx, list, today), important: true, refs: { adjustmentIds: list.map(a => a.id) } })));
      const b = morningBriefing(ctx, today, adj);
      if (changedR) out.messages.push({ ...b, at: brief.at || b.at }); else push(b);
    }
  }

  // Auftrag 14: Schwimm-Hilfsmittel fehlen noch → einmal fragen (bis dahin plant die App ohne Hilfsmittel)
  if ((ev.type === 'daily' || ev.type === 'trend') && (ctx.profile.sports || []).includes('swim') && (ctx.profile.skills || {}).swimGear == null)
    push(msg(ctx, { id: 'msg-swimgear', date: today, kind: 'info', title: 'Welche Schwimm-Hilfsmittel hast du?', text: 'Damit deine Schwimmeinheiten passen: Hast du Kickbrett, Pull Buoy, Flossen, Paddles oder Frontschnorchel (oder kannst du sie im Bad leihen)? Tipp sie unter Mehr → Berücksichtigungen → Können und Ausrüstung an. Bis dahin plane ich ohne Hilfsmittel, z. B. Beinschlag in Seitlage statt mit Brett.' }));

  if (ev.type === 'illness') {
    const ill = C.illnessAt(ctx.state.illnessPeriods, today);
    const ended = (ctx.state.illnessPeriods || []).filter((p: any) => p && p.end && p.end <= today).sort((a: any, b: any) => b.end.localeCompare(a.end))[0];
    if (ill) push(msg(ctx, { id: 'msg-ill-start-' + ill.start, date: today, kind: 'info', title: 'Gute Besserung', text: 'Ich habe alle Einheiten bis auf Weiteres ausgesetzt, sie zählen nicht als verpasst. Kein Training, bis du 24-48 h symptomfrei bist. Danach steigen wir in Stufen wieder ein. Bei Fieber über 39 °C, Atemnot oder Brustschmerzen bitte zum Arzt.', important: true }));
    else if (ended && ended.end >= C.addDays(today, -1)) push(msg(ctx, { id: 'msg-ill-end-' + ended.end, date: today, kind: 'info', title: 'Willkommen zurück', text: `Schön, dass es dir besser geht. So steigen wir ein: Tag 1 noch Pause, Tag 2-3 20-30 min ganz locker, Tag 4-5 lockere Zone-2-Einheiten, ab Tag 6 wieder Intervalle, wenn Ruhepuls und HFV passen. Ich passe den Plan entsprechend an.` }));
  }

  if (ev.type === 'nutrition') {
    const days: { kcal: number | null; low: number }[] = [];
    for (let i = 6; i >= 1; i--) { const d = C.addDays(today, -i); const e = (ctx.state.nutrition || {})[d]; days.push({ kcal: e && e.kcal != null ? e.kcal : null, low: C.nutritionKcalLow(ctx.state, effWeeks(ctx), d, ctx.state.nutritionProfile) }); }
    const chk = underEatingCheck(days, isMinor(ctx.profile, today));
    if (chk.level) push(msg(ctx, { id: `msg-food-${chk.level}-${C.weekRange(today)[0]}`, date: today, kind: chk.level === 2 ? 'warning' : 'info', title: 'Genug gegessen?', text: chk.text, important: chk.level === 2 }));
  }

  if (ev.type === 'weekly') {
    const W = C.weeklyAdjustments(ctx.state, ctx.baseWeeks, today, { planMeta: ctx.planMeta, now: ctx.now });
    out.adjustments.push(...W.adjustments);
    push(weeklyReview(ctx, today, W.adjustments, W.summary));
  }
  return out;
}

/* Hauptziel für Texte */
export function goalLine(ctx: EngineCtx): string {
  const g = mainGoal(ctx.goals, ctx.today);
  if (!g || !g.date) return '';
  const days = Math.round((+new Date(g.date + 'T12:00:00Z') - +new Date(ctx.today + 'T12:00:00Z')) / 86400000);
  return `${g.name} in ${days} Tagen`;
}
