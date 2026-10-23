/* Auftrag 18, Punkt 6: kurze Hinweise in den Einheiten (Trainingswissen, siehe docs/TRAININGSREGELN.md):
   Verpflegung ab etwa 80 min, Essen nach harten oder langen Einheiten, Hitze im Sommer und Kälte im Winter (draußen), Rad drinnen,
   Lauf-ABC, Einbein-Fahren auf der Rolle, Kraft für Jugendliche, Wechsel üben beim Koppellauf. Hinweise stehen in spec.notes, damit sie
   beim Kürzen oder Verschieben erhalten bleiben. */
import type { Profile } from './profile';
import { ageOf } from './profile';
import * as W from './workouts';
import { isHardSession } from './intensity';

const month = (d: string) => +d.slice(5, 7);
export const NOTE = {
  fuel: 'Essen und Trinken: ab etwa 75 min unterwegs 30-60 g Kohlenhydrate pro Stunde (z. B. Banane, Riegel, Sportgetränk), trinken nach Durst, bei Hitze mehr.',
  racefuel: 'Wettkampf-Verpflegung üben: genau das essen und trinken, was du im Rennen nehmen willst.',
  after: 'Danach: innerhalb von 1-2 h eine Mahlzeit mit Kohlenhydraten und Eiweiß.',
  afterMinor: 'Danach: innerhalb von 1-2 h eine richtige Mahlzeit mit Kohlenhydraten und Eiweiß (normale Lebensmittel, keine Nahrungsergänzung).',
  heat: 'Bei über 25 °C: nach Puls statt Pace, ruhiger, mehr trinken, lieber früh oder spät.',
  cold: 'Bei Kälte 5-10 min länger einlaufen bzw. einrollen.',
  rain: 'Bei Regen oder Glätte lieber auf die Rolle, dort etwa 20 % kürzer.',
  abc: 'Im Einlaufen 5 min Lauf-ABC (Skippings, Anfersen, Hopserlauf). Schrittfrequenz etwa 165-180 als Richtung, nicht als Zwang.',
  oneleg: 'Darin 3 × 1 min einbeinig je Bein (der andere Fuß ruht auf der Rolle): für einen runden Tritt.',
  strengthMinor: 'Saubere Technik vor Gewicht, keine Maximalgewichte, Sprünge nur wenige und weich landen.',
  transition: 'Wechsel üben: Radschuhe aus, Laufschuhe an, los – so schnell und ruhig wie im Rennen.'
} as const;

/* setzt die Hinweise für alle eigenen Einheiten ab „from“ (feste Termine, Wettkämpfe, Lernstufen ohne Änderung) */
export function addSessionNotes(weeks: any[], p: Profile, o: { from?: string | null; hasTrainer?: boolean; keep?: (s: any) => boolean } = {}): void {
  for (const w of weeks) {
    let abcDone = false;
    for (const d of w.days || []) for (let i = 0; i < (d.sessions || []).length; i++) {
      const s = d.sessions[i];
      if (!s || !s.spec || s.fixed || s.race || s.frozen || s.cancelled || (o.keep && o.keep(s)) || (o.from && d.date < o.from) || !s.spec.steps) continue;
      const minor = (ageOf(p, d.date) ?? 30) < 18;
      const notes: string[] = [];
      const min = s.plannedMinutes || 0, m = month(d.date);
      const hard = isHardSession(s) && !/Kraul-Check/.test(s.title || '');
      const long = !!s.long || s.spec.kind === 'long' || s.spec.kind === 'longq';
      const outdoor = (s.sport === 'run' || s.sport === 'bike') && !(s.spec.ctx && s.spec.ctx.indoor);
      if ((s.sport === 'run' || s.sport === 'bike') && min >= 80) notes.push(NOTE.fuel);
      if (long && min >= 80 && w.phase === 'specific') notes.push(NOTE.racefuel);
      if ((hard || (long && min >= 75)) && s.sport !== 'strength') notes.push(minor ? NOTE.afterMinor : NOTE.after);
      if (outdoor && [6, 7, 8].includes(m) && (hard || min >= 60)) notes.push(NOTE.heat);
      if (outdoor && [12, 1, 2].includes(m) && hard) notes.push(NOTE.cold);
      if (s.sport === 'bike' && outdoor && o.hasTrainer && [11, 12, 1, 2, 3].includes(m) && (long || hard)) notes.push(NOTE.rain);
      if (s.sport === 'run' && !abcDone && !hard && !long && !s.stage && (w.phase === 'base' || w.phase === 'build') && !w.isRecoveryWeek && min >= 30 && !/^(Koppellauf|Wechsel-Lauf)/.test(s.title || '')) { notes.push(NOTE.abc); abcDone = true; }
      if (s.sport === 'bike' && s.spec.ctx && s.spec.ctx.indoor && !hard && !long && min >= 40) notes.push(NOTE.oneleg);
      if (s.sport === 'strength' && minor) notes.push(NOTE.strengthMinor);
      if (/^Koppellauf/.test(s.title || '') && w.phase === 'specific') notes.push(NOTE.transition);
      const spec = { ...s.spec, notes };
      if (JSON.stringify(spec.notes) === JSON.stringify(s.spec.notes || [])) continue;
      // Zeilen, die nicht aus den Bausteinen kommen (z. B. „Ausnahme: …“), bleiben erhalten
      const base0 = new Set(W.describe(s.spec).split('\n'));
      const extra = String(s.description || '').split('\n').filter(l => l && !base0.has(l));
      d.sessions[i] = { ...s, spec, description: [W.describe(spec), ...extra].join('\n') };
    }
  }
}
