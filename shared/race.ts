/* Wettkampf-Modus: aktiv, sobald ein Ziel-Wettkampf näher als 14 Tage ist.
   Countdown, Tapering, Briefings in der Rennwoche, Pacing-Plan, Verpflegung, Pack-Checkliste, danach Rückblick und Erholung. */
import type { Goal } from './goals';
import { GOALS, legsOf } from './goals';
import { addDays } from './core';
import type { Prognosis } from './prognosis';
import { raceFuelPlan, type FuelPlan } from './nutrition';

export function daysUntil(today: string, date: string): number { return Math.round((+new Date(date + 'T12:00:00Z') - +new Date(today + 'T12:00:00Z')) / 86400000); }
export function raceModeGoal(goals: Goal[], today: string): Goal | null {
  return (goals || []).filter(g => g && g.date && !g.result && g.type !== 'fitness' && (g.priority === 'A' || g.priority === 'B'))
    .filter(g => { const d = daysUntil(today, g.date!); return d >= 0 && d <= 14; })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}
/* Nach dem Rennen bis zu 10 Tage: Ergebnis eintragen und Erholung */
export function recentRace(goals: Goal[], today: string): Goal | null {
  return (goals || []).filter(g => g && g.date && g.type !== 'fitness' && g.date < today && daysUntil(g.date, today) <= 10).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

export function briefing(goal: Goal, today: string): { title: string; text: string } {
  const d = daysUntil(today, goal.date!);
  const long = GOALS[goal.type].hours[1] >= 4;
  if (d === 0) return { title: 'Heute ist Renntag!', text: 'Frühstück 3 h vorher, ruhig ankommen, Startnummer und Zeitchip prüfen. Starte bewusst langsamer als du dich fühlst. Du bist bereit.' };
  if (d === 1) return { title: 'Morgen ist es so weit', text: 'Heute nur kurz locker bewegen mit 3 kurzen Steigerungen. Sachen packen (Checkliste), Startunterlagen holen, kohlenhydratreich essen und früh ins Bett. Schlechter Schlaf in der letzten Nacht ist normal und kostet nichts.' };
  if (d === 2) return { title: 'Noch 2 Tage', text: 'Ruhetag oder 20-30 min ganz locker. Viel trinken, normal essen, Material checken (Reifen, Schuhe, Brille).' };
  if (d <= 6) return { title: `Noch ${d} Tage`, text: 'Rennwoche: weniger Umfang, aber kurze Einheiten mit etwas Tempo halten dich frisch. Keine neuen Experimente bei Essen oder Material. Schlaf ist jetzt dein bestes Training.' };
  return { title: `Noch ${d} Tage`, text: long ? 'Das Tapering beginnt: Umfang runter, Intensität kurz halten. Die Fitness ist da, jetzt wirst du frisch.' : 'Letzte richtige Trainingswoche: eine wettkampfnahe Einheit, sonst locker. Ab nächster Woche wird reduziert.' };
}

/* Tapering-Vorschlag für die letzten 14 Tage (Anteil vom normalen Wochenumfang) */
export function taperPlan(goal: Goal): { from: string; to: string; volumePct: number; text: string }[] {
  const d = goal.date!;
  const long = GOALS[goal.type].hours[1] >= 4;
  return long
    ? [{ from: addDays(d, -13), to: addDays(d, -7), volumePct: 70, text: '70 % Umfang, eine Einheit im Renntempo' }, { from: addDays(d, -6), to: addDays(d, -1), volumePct: 40, text: '40 % Umfang, kurze Steigerungen, 2 Tage vorher Ruhe' }]
    : [{ from: addDays(d, -13), to: addDays(d, -7), volumePct: 85, text: 'normale Woche, eine wettkampfnahe Einheit' }, { from: addDays(d, -6), to: addDays(d, -1), volumePct: 55, text: '55 % Umfang, kurz und knackig, Tag vorher locker' }];
}

export interface PaceSegment { leg: string; part: string; target: string; hint: string }
/* Pacing: vorsichtig starten, gleichmäßig, am Ende zulegen. Bereiche aus Prognose und Schwellen. */
export function pacingPlan(goal: Goal, prog: Prognosis | null, thr: { lthrRun: number; lthrBike: number; ftp?: number | null }): PaceSegment[] {
  const out: PaceSegment[] = [];
  const legs = legsOf(goal);
  const long = GOALS[goal.type].hours[1] >= 4;
  const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  legs.forEach((l, i) => {
    const pred = prog && prog.parts ? prog.parts.find(p => p.label.startsWith(l.sport === 'swim' ? 'Schwimmen' : l.sport === 'bike' ? 'Rad' : 'Laufen')) : null;
    if (l.sport === 'swim') {
      const p100 = pred ? pred.best / (l.km * 10) : null;
      out.push({ leg: 'Schwimmen', part: 'Start bis Boje 1', target: p100 ? `${mmss(p100 + 3)}/100 m` : 'ruhig', hint: 'Eigenen Rhythmus finden, nicht vom Startgetümmel mitziehen lassen.' });
      out.push({ leg: 'Schwimmen', part: 'Rest', target: p100 ? `${mmss(p100)}/100 m` : 'gleichmäßig', hint: 'Lang ausatmen, alle 6-8 Züge nach vorne orientieren.' });
    }
    if (l.sport === 'bike') {
      const f = long ? [0.68, 0.75] : [0.78, 0.86];
      const hr = [Math.round(thr.lthrBike * (long ? 0.8 : 0.86)), Math.round(thr.lthrBike * (long ? 0.86 : 0.92))];
      out.push({ leg: 'Rad', part: 'erste 20 min', target: `Puls ${hr[0] - 5}-${hr[0]}${thr.ftp ? `, ${Math.round(thr.ftp * f[0])} W` : ''}`, hint: 'Bewusst ruhig, der Puls ist nach dem Schwimmen noch hoch.' });
      const pb = prog && prog.bike; const w = pb && pb.watts ? `, ${Math.round(pb.watts * 0.97)}-${Math.round(pb.watts * 1.03)} W` : thr.ftp ? `, ${Math.round(thr.ftp * f[0])}-${Math.round(thr.ftp * f[1])} W` : '';
      out.push({ leg: 'Rad', part: 'Hauptteil', target: `Puls ${hr[0]}-${hr[1]}${w}${pb ? `, Ø etwa ${String(pb.kmh).replace('.', ',')} km/h` : ''}`, hint: 'Bergauf nicht überziehen, bergab treten. Alle 20 min essen. Das Tempo hängt von Wind und Strecke ab, Puls und Watt gehen vor.' });
    }
    if (l.sport === 'run') {
      const total = pred ? pred.best : null;
      const pace = total ? total / l.km : null;
      const isFirstRun = legs.findIndex(x => x.sport === 'run') === i && legs.length > 1 && legs[0].sport === 'run';
      out.push({ leg: 'Laufen' + (legs.filter(x => x.sport === 'run').length > 1 ? (isFirstRun ? ' 1' : ' 2') : ''), part: 'erstes Drittel', target: pace ? `${mmss(pace * 1.03)}/km` : `Puls unter ${Math.round(thr.lthrRun * 0.9)}`, hint: 'Die ersten Kilometer fühlen sich zu leicht an. Genau richtig.' });
      out.push({ leg: 'Laufen', part: 'Mitte', target: pace ? `${mmss(pace)}/km` : `Puls ${Math.round(thr.lthrRun * 0.9)}-${Math.round(thr.lthrRun * 0.95)}`, hint: long ? 'Gehen an Verpflegungen ist erlaubt und klug.' : 'Gleichmäßig, Kopf hoch.' });
      out.push({ leg: 'Laufen', part: 'letztes Drittel', target: pace ? `${mmss(pace * 0.98)}/km oder schneller` : 'was noch geht', hint: 'Jetzt darfst du zulegen.' });
    }
  });
  return out;
}

export function packingList(goal: Goal): { group: string; items: string[] }[] {
  const legs = new Set(legsOf(goal).map(l => l.sport));
  const tri = GOALS[goal.type].group === 'tri';
  const out = [{ group: 'Allgemein', items: ['Startunterlagen, Ausweis, Startnummer', 'Zeitchip', 'Sicherheitsnadeln oder Startnummernband', 'Verpflegung fürs Rennen (getestet!)', 'Trinkflasche', 'Sonnencreme', 'warme Sachen für danach', 'Handtuch', 'kleines Geld'] }];
  if (legs.has('swim')) out.push({ group: 'Schwimmen', items: ['Neoprenanzug (falls erlaubt)', 'Schwimmbrille + Ersatz', 'Badekappe (vom Veranstalter)', 'Anti-Scheuer-Creme', 'Badesachen'] });
  if (legs.has('bike')) out.push({ group: 'Rad', items: ['Rad (Reifen, Bremsen, Schaltung geprüft)', 'Helm (Pflicht!)', 'Radschuhe', 'Ersatzschlauch, Reifenheber, CO2/Pumpe', 'Radbrille', 'Flaschen gefüllt'] });
  if (legs.has('run')) out.push({ group: 'Laufen', items: ['Laufschuhe (mit Schnellschnürung)', 'Mütze oder Visor', 'Socken'] });
  if (tri) out.push({ group: 'Wechselzone', items: ['Handtuch zum Markieren des Platzes', 'Schuhe offen hinstellen', 'Helm offen aufs Rad (erst Helm zu, dann Rad nehmen)', 'Gels am Rad befestigt', 'Wechselbeutel beschriften', 'Wechselzone vorher einmal ablaufen'] });
  return out;
}

/* Erholung nach dem Rennen: etwa 1 lockerer Tag pro Stunde Renndauer (mindestens 3), Laufen erst später */
export function recoveryPlan(goal: Goal, raceSec: number | null): { day: number; text: string }[] {
  const h = (raceSec || GOALS[goal.type].hours[0] * 3600) / 3600;
  const days = Math.max(3, Math.min(14, Math.round(h * 1.5)));
  const out = [{ day: 1, text: 'Ruhetag. Spazieren gehen, viel trinken, gut essen (Kohlenhydrate und Eiweiß).' }, { day: 2, text: 'Ruhe oder 20-30 min ganz locker Rad oder Schwimmen.' }];
  for (let d = 3; d <= days; d++) out.push({ day: d, text: d < days * 0.6 ? 'Locker 30-45 min, ohne Intensität. Laufen erst, wenn keine Muskelschmerzen mehr da sind.' : 'Locker, Umfang langsam zurück. Erste kurze Steigerungen, wenn sich alles frisch anfühlt.' });
  out.push({ day: days + 1, text: 'Erholung abgeschlossen: der Plan geht normal weiter.' });
  return out;
}

export function raceReview(goal: Goal, result: { timeSec?: number | null; note?: string }, prog: Prognosis | null): string {
  const t = result.timeSec;
  if (!t) return `Glückwunsch zu „${goal.name}“! Trag deine Zeit ein, dann vergleicht der Coach sie mit der Prognose.`;
  const fmt = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`; };
  if (prog && prog.total) {
    if (t < prog.total.low) return `Stark! Mit ${fmt(t)} warst du schneller als die Prognose (${fmt(prog.total.low)}-${fmt(prog.total.high)}). Deine Form ist besser, als die Daten gezeigt haben.`;
    if (t <= prog.total.high) return `Genau im erwarteten Bereich: ${fmt(t)} (Prognose ${fmt(prog.total.low)}-${fmt(prog.total.high)}). Du hast deine Form gut auf die Strecke gebracht.`;
    return `${fmt(t)} ist langsamer als erwartet (${fmt(prog.total.low)}-${fmt(prog.total.high)}). Das kann Wetter, Strecke oder ein schlechter Tag sein. Was hat sich schwer angefühlt? Schreib es dem Coach.`;
  }
  return `Glückwunsch zu ${fmt(t)} bei „${goal.name}“!`;
}

export function raceFuel(goal: Goal, prog: Prognosis | null, weightKg: number, minor: boolean, tempC?: number | null): FuelPlan {
  const min = prog && prog.total ? prog.total.best / 60 : GOALS[goal.type].hours[1] * 60;
  const g = GOALS[goal.type].group;
  return raceFuelPlan({ durationMin: min, tempC, weightKg, minor, sport: g === 'tri' ? 'tri' : goal.type.startsWith('run') ? 'run' : goal.type === 'bike_event' ? 'bike' : 'swim' });
}
