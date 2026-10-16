/* Auftrag 13: Extra-Einheiten (nicht im Plan) wirken auf den Plan wie geplante.
   - Harte Extra-Einheit (hoher Puls, hohe Anstrengung, Intervalle, Spiel) → die nächste harte Einheit am selben oder nächsten Tag
     wird geprüft; der Coach schlägt vor, sie locker zu machen (nie zwei harte Tage hintereinander).
   - Woche durch Extras deutlich voller als geplant (über 115 % der geplanten Belastung) → Vorschlag, die restlichen lockeren
     Einheiten der Woche zu kürzen.
   Beides als Vorschlag mit „Übernehmen“: der Athlet entscheidet. */
import * as C from '../core';
import { doneItems, valsOf, type Done } from './review';
import { dowName } from './texts';
import type { CoachMsg, EngineCtx } from './engine';

const SPORT: Record<string, string> = { run: 'Extra-Lauf', bike: 'Extra-Radfahrt', swim: 'Extra-Schwimmen', strength: 'Extra-Krafttraining', football: 'Extra-Teamsport' };
const round5 = (x: number) => Math.max(10, Math.round(x / 5) * 5);

/* Ist die erledigte Extra-Einheit hart? Liefert den Grund in Worten oder null. */
export function hardReason(ctx: EngineCtx, d: Done): string | null {
  const v = valsOf(d);
  const thr = ctx.profile.thresholds || ({} as any);
  const lthr = d.sport === 'bike' ? thr.lthrBike : d.sport === 'run' ? thr.lthrRun : null;
  if (v.hr && lthr && (v.min || 0) >= 20 && v.hr >= 0.9 * lthr) return `Puls Ø ${Math.round(v.hr)}, ${Math.round(v.hr / lthr * 100)} % deiner Schwelle`;
  if (v.intervals && v.intervals.count >= 2) return `${v.intervals.count} harte Abschnitte`;
  if (v.rpe != null && v.rpe >= 7) return `Anstrengung ${v.rpe}/10`;
  if (d.sport === 'football' && (v.min || 0) >= 45) return `${v.min} min Teamsport`;
  return null;
}

export function extraChecks(ctx: EngineCtx): CoachMsg[] {
  const today = ctx.today;
  const out: CoachMsg[] = [];
  const has = (id: string) => !!(ctx.state.coachMsgs || {})[id];
  const weeks = C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {});
  const dayOf = (date: string) => C.planDays(weeks).find((x: any) => x.date === date);
  const done = (s: any) => { const st = (ctx.state.sessions || {})[s.id]; return !!(st && (st.completed || st.skipped)); };
  const openHard = (date: string) => ((dayOf(date) || { sessions: [] }).sessions as any[]).filter(s => s.sport !== 'rest' && !s.cancelled && !done(s) && C.isHard(s) && !C.isGame(s) && !C.isTestOrRace(s) && !s.locked && !s.race && !s.fixed);
  if (C.illnessAt(ctx.state.illnessPeriods, today)) return out;
  const extras = doneItems(ctx, C.addDays(today, -1), today).filter(d => d.custom);

  // 1) Harte Extra-Einheit → nächste harte Einheit prüfen (gleicher Tag später oder am Tag danach)
  for (const d of extras) {
    const id = `msg-extra-hard-${d.key}`;
    if (has(id)) continue;
    const why = hardReason(ctx, d);
    if (!why) continue;
    const next = [d.date, C.addDays(d.date, 1)].filter(x => x >= today).flatMap(x => openHard(x).map(s => ({ s, date: x })))[0];
    if (!next) continue;
    const s = next.s;
    const easier = C.isIntervals(s)
      ? { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', plannedMinutes: s.plannedMinutes ? round5(s.plannedMinutes * 0.8) : null, plannedKm: s.plannedKm ? Math.round(s.plannedKm * 8) / 10 : null, description: `Nach der harten Extra-Einheit am ${dowName(d.date)} locker in Zone 2, 20 % kürzer.` }
      : { title: 'Locker statt: ' + s.title, zone: 'Zone 1-2', plannedMinutes: s.plannedMinutes ? round5(s.plannedMinutes * 0.75) : null, plannedKm: s.plannedKm ? Math.round(s.plannedKm * 7.5) / 10 : null, description: `Nach der harten Extra-Einheit am ${dowName(d.date)} kürzer und locker.` };
    const adj = { id: `extra-${d.key}-${s.id}`, group: `extra-${d.key}`, type: 'modify', sessionId: s.id, set: easier, date: today, what: `${s.title} → ${easier.title.split(':')[0].toLowerCase()}${easier.plannedMinutes ? ', ' + easier.plannedMinutes + ' min' : ''}`, reason: `harte Extra-Einheit (${why})` };
    const when = next.date === today ? (d.date === today ? 'heute noch' : 'heute') : 'morgen';
    out.push({ id, at: ctx.now, date: today, kind: 'proposal', from: 'coach', title: `Vorschlag: ${s.title} lockerer`, important: true,
      text: `${SPORT[d.sport] || 'Extra-Einheit'} „${d.title}“ war hart (${why}). ${when.charAt(0).toUpperCase() + when.slice(1)} steht „${s.title}“ an. Zwei harte Einheiten so dicht hintereinander bremsen die Erholung. Ich würde sie ${C.isIntervals(s) ? 'locker in Zone 2 und 20 % kürzer' : 'locker und 25 % kürzer'} machen.`,
      proposal: { changes: [{ kind: 'adjust', key: adj.id, data: adj }], status: 'open' } } as CoachMsg);
  }

  // 2) Woche durch Extras zu voll → restliche lockere Einheiten kürzen
  const S = C.weekSummary(ctx.state, ctx.baseWeeks, today);
  const [mon, sun] = C.weekRange(today);
  const wid = `msg-extra-week-${mon}`;
  if (!has(wid) && S.planned > 0 && S.extra > 0.1 * S.planned) {
    const rest = C.planDays(weeks).filter((x: any) => x.date > today && x.date <= sun).flatMap((x: any) => x.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !done(s)).map((s: any) => ({ s, date: x.date })));
    const restLoad = rest.reduce((a: number, x: any) => a + C.plannedLoad(x.s), 0);
    const total = S.done + restLoad;
    if (total > 1.15 * S.planned) {
      const surplus = total - S.planned;
      const easy = rest.filter((x: any) => ['run', 'bike', 'swim'].includes(x.s.sport) && !C.isKey(x.s) && !C.isTestOrRace(x.s) && !x.s.locked && !x.s.race && !x.s.fixed && !x.s.stage && x.s.plannedMinutes >= 30);
      const easyLoad = easy.reduce((a: number, x: any) => a + C.plannedLoad(x.s), 0);
      if (easy.length && easyLoad > 0) {
        const f = Math.max(0.6, 1 - surplus / easyLoad); // höchstens 40 % kürzer
        const changes = easy.map((x: any) => {
          const min = round5(x.s.plannedMinutes * f); // Belastung wächst bei gleicher Intensität mit der Dauer
          const a = { id: `extra-week-${mon}-${x.s.id}`, group: `extra-week-${mon}`, type: 'modify', sessionId: x.s.id, set: { plannedMinutes: min, plannedKm: x.s.plannedKm ? Math.round(x.s.plannedKm * min / x.s.plannedMinutes * 10) / 10 : null }, date: today, what: `${x.s.title}: ${x.s.plannedMinutes} → ${min} min`, reason: 'Woche durch Extra-Einheiten voller als geplant' };
          return { kind: 'adjust', key: a.id, data: a };
        }).filter((c: any) => c.data.set.plannedMinutes < easy.find((x: any) => x.s.id === c.data.sessionId)!.s.plannedMinutes);
        if (changes.length) out.push({ id: wid, at: ctx.now + 1, date: today, kind: 'proposal', from: 'coach', title: 'Vorschlag: Rest der Woche leichter', important: true,
          text: `Mit deinen Extra-Einheiten kommt die Woche auf ${Math.round(total / S.planned * 100)} % der geplanten Belastung. Damit du erholt in die nächste Woche gehst, würde ich die lockeren Einheiten bis Sonntag kürzen: ${changes.map((c: any) => c.data.what).join(', ')}.`,
          proposal: { changes, status: 'open' } } as CoachMsg);
      }
    }
  }
  return out;
}
