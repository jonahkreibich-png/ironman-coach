/* Schnellfragen: die Engine beantwortet sie aus den Daten, ganz ohne KI. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { readinessFacts, readinessFallback } from './engine';
import { joinDe, de, dowName, mmss } from './texts';
import { mainGoal, GOALS } from '../goals';
import { sleepNeed } from '../profile';

export const QUICK = [
  { id: 'why-easy', q: 'Warum heute locker?' },
  { id: 'week', q: 'Wie war meine Woche?' },
  { id: 'intervals', q: 'Wann wieder Intervalle?' },
  { id: 'improved', q: 'Was hat sich verbessert?' },
  { id: 'goal', q: 'Wie läuft es mit dem Ziel?' }
] as const;
export type QuickId = typeof QUICK[number]['id'];

const fb = readinessFallback;
function weeks(ctx: EngineCtx) { return C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {}); }

export function answerQuick(ctx: EngineCtx, id: QuickId, extra?: { scores?: any[]; prognosis?: any }): string {
  const today = ctx.today;
  if (id === 'why-easy') {
    const ill = C.illnessAt(ctx.state.illnessPeriods, today);
    if (ill) return 'Du bist gerade krank. Training würde die Genesung verlängern. Erst wenn du 24-48 h symptomfrei bist, geht es in Stufen weiter.';
    if (C.returnStageActive(ctx.state.illnessPeriods, today)) return 'Du kommst gerade aus einer Krankheit. In den ersten Tagen danach gibt es nur lockere Einheiten, damit dein Körper sich ganz erholt. Intervalle kommen ab Tag 6 zurück, wenn Ruhepuls und HFV passen.';
    const R = C.readinessFor(ctx.state.trend, ctx.state.illnessPeriods, today, fb(ctx));
    const facts = readinessFacts(ctx, today);
    const day = C.planDays(weeks(ctx)).find((d: any) => d.date === today);
    const adj = day ? day.sessions.filter((s: any) => s._adj && s._adj.length) : [];
    if (R.level === 3) return 'Für heute fehlen noch Morgenwerte. Ohne Schlaf, Ruhepuls und HFV entscheide ich vorsichtig.';
    if (R.level === 0 && !adj.length) {
      const easy = day ? day.sessions.filter((s: any) => s.sport !== 'rest' && !C.isHard(s)) : [];
      return easy.length ? `Deine Werte sind gut (Ampel grün, ${R.score}/100). Locker ist heute einfach so geplant: etwa 80 % des Trainings sind locker, damit die harten Tage richtig hart sein können.` : `Heute ist gar nicht locker geplant: deine Werte sind gut (${R.score}/100), Intensität ist möglich.`;
    }
    const why = facts.length ? joinDe(facts) : R.reasons.join(', ');
    return `Deine Ampel steht auf ${R.level === 1 ? 'Gelb' : 'Rot'} (${R.score}/100): ${why}. ${R.level === 1 ? 'Lockere Einheiten bauen trotzdem Grundlage auf, Intervalle bringen an solchen Tagen wenig und erhöhen das Risiko.' : 'Heute ist Erholung das beste Training.'}${adj.length ? ' Ich habe den Plan deshalb angepasst, das Original siehst du in der Einheit.' : ''}`;
  }
  if (id === 'week') {
    const S = C.weekSummary(ctx.state, ctx.baseWeeks, today);
    const sleepNeedLow = sleepNeed(ctx.profile, today)[0];
    return [
      `Diese Woche: ${S.nDone} von ${S.nPlanned} Einheiten erledigt${S.ratio != null ? ` (${Math.round(S.ratio * 100)} % der geplanten Belastung)` : ''}.`,
      S.withValues ? `Ampel: ${S.green}× grün, ${S.yellow}× gelb, ${S.red}× rot.` : '',
      S.sleepAvg != null ? `Schlaf im Schnitt ${de(S.sleepAvg)} h${S.sleepAvg < sleepNeedLow ? `, etwas wenig (Bedarf ab ${de(sleepNeedLow)} h)` : ', gut'}.` : '',
      S.missedKey.length ? `Verpasst: ${joinDe(S.missedKey)}.` : 'Keine wichtige Einheit verpasst.',
      S.sick ? 'Du warst krank, deshalb zählt die Woche weniger.' : ''
    ].filter(Boolean).join(' ');
  }
  if (id === 'intervals') {
    if (C.illnessAt(ctx.state.illnessPeriods, today)) return 'Erst wenn du gesund bist und der Stufenplan durch ist, frühestens 6 Tage nach dem letzten Krankheitstag.';
    const next = C.planDays(weeks(ctx)).filter((d: any) => d.date >= today).flatMap((d: any) => d.sessions.filter((s: any) => !s.cancelled && C.isIntervals(s)).map((s: any) => ({ ...s, date: d.date })))[0];
    const pain = C.painFlag(ctx.state, weeks(ctx), today);
    const lines: string[] = [];
    if (next) lines.push(`Die nächsten Intervalle sind am ${dowName(next.date)}, ${next.date.slice(8)}.${next.date.slice(5, 7)}.: ${next.title}.`);
    else lines.push('In den nächsten Wochen sind keine Intervalle geplant.');
    if (!ctx.planMeta.runIntervalsAllowed) lines.push('Lauf-Intervalle sind noch nicht freigegeben, beim Laufen bleibt es vorerst locker.');
    if (pain) lines.push(`Wegen ${pain === 'Schmerz' ? 'Schmerzen' : 'Schmerzen (' + pain + ')'} über 2/10 in deinen Notizen gibt es beim Laufen gerade keine Intensität.`);
    lines.push('Ob sie stattfinden, entscheidet die Ampel am Morgen.');
    return lines.join(' ');
  }
  if (id === 'improved') {
    const sc = extra && extra.scores ? extra.scores : [];
    const parts = sc.filter((s: any) => s.trend && s.trend.length > 1).map((s: any) => ({ s, d: s.trend[s.trend.length - 1].score - s.trend[0].score })).sort((a: any, b: any) => b.d - a.d);
    const label: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' };
    const up = parts.filter((x: any) => x.d > 0);
    if (!up.length) return 'In den letzten 6 Wochen sind deine Scores ungefähr gleich geblieben. Das ist normal in Phasen mit viel Grundlage. Sobald mehr Einheiten mit Puls und Tempo dazukommen, sehe ich Veränderungen genauer.';
    return up.slice(0, 3).map((x: any) => `${label[x.s.sport]} +${x.d} in 6 Wochen${x.s.why && x.s.why[0] ? ': ' + x.s.why[0].replace(/^[+−±]\d+ \w+: /, '') : ''}.`).join(' ');
  }
  if (id === 'goal') {
    const g = mainGoal(ctx.goals, today);
    if (!g) return 'Du hast noch kein Ziel eingetragen. Unter Mehr → Profil und Ziele kannst du eins anlegen, dann plane ich darauf hin.';
    const days = g.date ? Math.round((+new Date(g.date + 'T12:00:00Z') - +new Date(today + 'T12:00:00Z')) / 86400000) : null;
    const lines = [`${g.name}${days != null ? ` in ${days} Tagen` : ''}.`];
    const p = extra && extra.prognosis;
    if (p && p.ok && p.total) {
      const fmt = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`; };
      lines.push(`Prognose aus deinen Daten: ${fmt(p.total.low)} bis ${fmt(p.total.high)} (Vertrauen ${p.confidence}).`);
      if (g.targetTimeSec) lines.push(g.targetTimeSec >= p.total.low ? 'Deine Zielzeit ist realistisch.' : `Für deine Zielzeit (${fmt(g.targetTimeSec)}) fehlt noch etwas. ${p.improve || ''}`);
      else if (p.improve) lines.push(p.improve);
    } else if (p && p.missing) lines.push(`Für eine Prognose fehlt noch: ${joinDe(p.missing)}.`);
    const def = GOALS[g.type];
    if (days != null && days < def.prepWeeks[0] * 7) lines.push('Bis zum Ziel ist es knapp. Wir konzentrieren uns aufs gesunde Ankommen.');
    void mmss;
    return lines.join(' ');
  }
  return '';
}
