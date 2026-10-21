/* Auftrag 17, Punkt 3: zentrale Liste aller Einheitstypen (Schwimmen, Rad, Laufen, Kraft, Koppel, Teamsport) mit festem Namen,
   Zweck und Aufbau. Plan (Titel), Anzeige (Lexikon unter Mehr) und Coach nutzen dieselben Begriffe. Strukturierte Intervalle heißen
   „Intervalle“ (z. B. „Lauf-Intervalle 6×1 min zügig“), alles andere bekommt einen Namen, der sagt, was man tut
   („Lockerer Lauf mit Steigerungen“). Die Titel selbst baut shared/workouts.ts (title) aus diesen Namen und den Zahlen der Einheit. */
export type TypeIntensity = 'locker' | 'mittel' | 'hart' | 'Test' | 'Technik' | 'Kraft' | 'Teamsport' | 'Wettkampf';
export interface SessionType { key: string; sport: 'run' | 'bike' | 'swim' | 'strength' | 'brick' | 'team'; name: string; purpose: string; structure: string; intensity: TypeIntensity }

export const SESSION_TYPES: SessionType[] = [
  // Laufen
  { key: 'run.easy', sport: 'run', name: 'Lockerer Lauf', intensity: 'locker', purpose: 'Grundlagenausdauer aufbauen, ohne müde zu machen.', structure: 'Einlaufen ganz locker, Hauptteil locker in Zone 2 (Sprechen geht noch), locker auslaufen.' },
  { key: 'run.strides', sport: 'run', name: 'Lockerer Lauf mit Steigerungen', intensity: 'locker', purpose: 'Locker laufen und mit kurzen, schnellen Schritten den Laufstil schulen.', structure: 'Locker in Zone 2, am Ende 4-6 × 15-20 s zügig steigern, dazwischen gehen.' },
  { key: 'run.hills', sport: 'run', name: 'Lockerer Lauf mit Hügelsprints', intensity: 'locker', purpose: 'Kraft und Laufökonomie, ohne müde zu machen.', structure: 'Locker in Zone 2, dann 8 × 10-15 s zügig bergauf, langsam zurückgehen.' },
  { key: 'run.fartlek', sport: 'run', name: 'Lauf-Intervalle 6×1 min zügig', intensity: 'mittel', purpose: 'Erste, kontrollierte Tempoarbeit in der Grundlage.', structure: '10 min einlaufen, 6 × 1 min zügig (Zone 3) mit je 2 min Traben, locker auslaufen.' },
  { key: 'run.intervals', sport: 'run', name: 'Lauf-Intervalle', intensity: 'hart', purpose: 'Tempo und Sauerstoffaufnahme verbessern.', structure: '15 min einlaufen mit Steigerungen, Wiederholungen hart mit Trabpause, 10 min auslaufen.' },
  { key: 'run.threshold', sport: 'run', name: 'Lauf-Intervalle an der Schwelle', intensity: 'hart', purpose: 'Das Tempo heben, das du lange halten kannst.', structure: '15 min einlaufen, 2-4 × 8-20 min an der Schwelle (Zone 4) mit 2 min Traben, 10 min auslaufen.' },
  { key: 'run.tempo', sport: 'run', name: 'Tempolauf', intensity: 'hart', purpose: 'Zügiges Tempo lange halten (Vorbereitung auf die Schwelle).', structure: 'Einlaufen, ein oder mehrere zügige Abschnitte in Zone 3, auslaufen.' },
  { key: 'run.vo2', sport: 'run', name: 'Lauf-Intervalle sehr hart', intensity: 'hart', purpose: 'Maximale Sauerstoffaufnahme (VO2max) für 5 und 10 km.', structure: '15 min einlaufen, 4-6 × 3-5 min sehr hart (Zone 5), gleich lange Trabpause, auslaufen.' },
  { key: 'run.racepace', sport: 'run', name: 'Lauf im Wettkampftempo', intensity: 'hart', purpose: 'Das Renntempo üben, damit es sich vertraut anfühlt.', structure: 'Einlaufen, Abschnitte im geplanten Wettkampftempo mit Trabpause, auslaufen.' },
  { key: 'run.long', sport: 'run', name: 'Langer Lauf', intensity: 'locker', purpose: 'Ausdauer für lange Strecken; immer locker.', structure: 'Ganz locker beginnen, durchgehend Zone 2, ruhig zu Ende laufen. Essen und Trinken ab 75 min.' },
  { key: 'run.longq', sport: 'run', name: 'Langer Lauf mit Tempo-Teil', intensity: 'hart', purpose: 'Nur in den letzten Wochen vor einem Laufziel: Renntempo auf müden Beinen.', structure: 'Erst locker, dann der Tempo-Teil (z. B. 2 × 15 min im Wettkampftempo), locker auslaufen.' },
  { key: 'run.runwalk', sport: 'run', name: 'Lauf-Geh-Wechsel', intensity: 'locker', purpose: 'Schritt für Schritt zu 30 min am Stück.', structure: 'Abwechselnd laufen und gehen, Stufe für Stufe längere Laufstücke.' },
  { key: 'run.test', sport: 'run', name: 'Lauftest 30 min', intensity: 'Test', purpose: 'Schwellenpuls und Schwellen-Pace messen, daraus kommen deine Zonen.', structure: '15 min einlaufen, 30 min so schnell, wie du gleichmäßig halten kannst, 10 min auslaufen.' },
  { key: 'run.brick', sport: 'run', name: 'Koppellauf', intensity: 'locker', purpose: 'Laufen direkt nach dem Rad gewöhnt die Beine an den Wechsel.', structure: 'Direkt nach der Ausfahrt 10-20 min locker laufen; nur jede 2.-3. Woche im Aufbau.' },
  // Rad
  { key: 'bike.easy', sport: 'bike', name: 'Lockere Ausfahrt', intensity: 'locker', purpose: 'Grundlage auf dem Rad, schont die Gelenke.', structure: 'Locker einrollen, Hauptteil in Zone 2, locker ausrollen.' },
  { key: 'bike.long', sport: 'bike', name: 'Lange Ausfahrt', intensity: 'locker', purpose: 'Ausdauer für lange Strecken; immer locker, mit Essen und Trinken.', structure: 'Locker einrollen, lange in Zone 2, alle 20-30 min essen und trinken.' },
  { key: 'bike.sweetspot', sport: 'bike', name: 'Rad-Intervalle Sweet Spot', intensity: 'hart', purpose: 'Die Schwelle heben, ohne so müde zu machen wie Schwellen-Intervalle.', structure: '15 min einrollen, 2-3 Abschnitte knapp unter der Schwelle (oberes Zone 3) mit kurzer Pause, ausrollen.' },
  { key: 'bike.threshold', sport: 'bike', name: 'Rad-Intervalle an der Schwelle', intensity: 'hart', purpose: 'Das Tempo heben, das du lange halten kannst.', structure: '15 min einrollen, Abschnitte an der Schwelle (Zone 4), dazwischen locker rollen, ausrollen.' },
  { key: 'bike.overunder', sport: 'bike', name: 'Rad-Intervalle Over-Unders', intensity: 'hart', purpose: 'Tempowechsel knapp über und unter der Schwelle verkraften.', structure: 'Einrollen, Abschnitte mit je 2 min knapp über und 2 min knapp unter der Schwelle, ausrollen.' },
  { key: 'bike.vo2', sport: 'bike', name: 'Rad-Intervalle sehr hart', intensity: 'hart', purpose: 'Maximale Sauerstoffaufnahme (VO2max) für kurze Rennen.', structure: 'Einrollen, 4-6 × 3-4 min sehr hart (Zone 5), gleich lange Pause, ausrollen.' },
  { key: 'bike.force', sport: 'bike', name: 'Rad-Intervalle Kraftausdauer', intensity: 'hart', purpose: 'Kraft für Anstiege und lange Strecken.', structure: 'Einrollen, Abschnitte mit niedriger Trittfrequenz (60-70) im Sitzen, ausrollen.' },
  { key: 'bike.climb', sport: 'bike', name: 'Rad-Intervalle am Anstieg', intensity: 'hart', purpose: 'Lange Anstiege knapp unter der Schwelle üben.', structure: 'Einrollen, mehrere Anstiege (oder Rolle mit Steigung) knapp unter der Schwelle, bergab locker.' },
  { key: 'bike.racepace', sport: 'bike', name: 'Rad im Wettkampftempo', intensity: 'hart', purpose: 'Das Renntempo auf dem Rad üben, mit Essen und Trinken.', structure: 'Einrollen, Abschnitte im geplanten Renntempo, ausrollen.' },
  { key: 'bike.longq', sport: 'bike', name: 'Lange Ausfahrt mit Intervallen', intensity: 'hart', purpose: 'Qualität und Ausdauer in einer Einheit (spät im Aufbau).', structure: 'Erst locker, dann der harte Block, locker zu Ende fahren.' },
  { key: 'bike.test', sport: 'bike', name: 'Radtest 20 min', intensity: 'Test', purpose: 'Schwelle auf dem Rad messen, daraus kommen deine Zonen.', structure: '20 min einrollen mit kurzen Antritten, 5 min hart, locker, 20 min maximal gleichmäßig, ausrollen.' },
  // Schwimmen
  { key: 'swim.learn', sport: 'swim', name: 'Kraul lernen', intensity: 'Technik', purpose: 'Kraul Schritt für Schritt, nie längere Stücke, als du schon am Stück schaffst.', structure: 'Einschwimmen, Technik-Übungen, Kraul-Stücke so lang wie deine Stufe, Brust für die Ausdauer, ausschwimmen.' },
  { key: 'swim.breast', sport: 'swim', name: 'Brust und Kraul-Technik', intensity: 'Technik', purpose: 'Ausdauer im Wasser mit Brust, dazu die ersten Kraul-Übungen.', structure: 'Einschwimmen Brust, Kraul-Beinschlag und Übungen, Brust-Strecken, ausschwimmen.' },
  { key: 'swim.technique', sport: 'swim', name: 'Schwimmen: Technik + Ausdauer', intensity: 'Technik', purpose: 'Technik verbessern und dabei Ausdauer im Wasser sammeln.', structure: 'Einschwimmen, Übungen, lockere Kraul-Stücke, ausschwimmen.' },
  { key: 'swim.endurance', sport: 'swim', name: 'Schwimmen: Grundlage', intensity: 'locker', purpose: 'Ausdauer im Wasser, locker und gleichmäßig.', structure: 'Einschwimmen, Übungen, längere lockere Kraul-Stücke, ausschwimmen.' },
  { key: 'swim.css', sport: 'swim', name: 'Schwimm-Intervalle', intensity: 'hart', purpose: 'Schneller schwimmen an der Schwelle (CSS).', structure: 'Einschwimmen, Übungen, Wiederholungen zügig bis hart mit kurzer Pause, ausschwimmen.' },
  { key: 'swim.openwater', sport: 'swim', name: 'Freiwasser', intensity: 'Technik', purpose: 'Orientierung, Sichten und Start üben – nie allein.', structure: 'Einschwimmen, Sichten alle 6 Züge, Starts und Wenden um eine Boje, locker zurück.' },
  { key: 'swim.check', sport: 'swim', name: 'Schwimmtest: Kraul-Check', intensity: 'Technik', purpose: 'Zeigt, wie weit du am Stück kraulen kannst und wie effizient.', structure: 'Einschwimmen, so weit wie möglich Kraul am Stück, 4 × 25 m, dann Technik wie gewohnt.' },
  { key: 'swim.test', sport: 'swim', name: 'Schwimmtest 400/200 m', intensity: 'Test', purpose: 'Schwimm-Schwelle (CSS) messen.', structure: 'Einschwimmen, 400 m und 200 m Kraul auf Zeit mit Pause dazwischen, ausschwimmen.' },
  // Kraft
  { key: 'strength.lower', sport: 'strength', name: 'Kraft Unterkörper', intensity: 'Kraft', purpose: 'Kräftige Beine und Hüfte schützen Knie und Sehnen und machen ökonomischer.', structure: 'Aufwärmen, 4-6 Übungen in 2-3 Sätzen, ruhig ausführen.' },
  { key: 'strength.upper', sport: 'strength', name: 'Kraft Oberkörper', intensity: 'Kraft', purpose: 'Schultern und Rücken stärken, hilft beim Kraulen.', structure: 'Aufwärmen, 4-6 Übungen in 2-3 Sätzen.' },
  { key: 'strength.core', sport: 'strength', name: 'Kraft Rumpf', intensity: 'Kraft', purpose: 'Stabiler Rumpf für Haltung beim Laufen, Rad und Schwimmen.', structure: 'Kurze Rumpf-Übungen in 2-3 Durchgängen.' },
  { key: 'strength.full', sport: 'strength', name: 'Kraft', intensity: 'Kraft', purpose: 'Stabile Muskeln und Sehnen schützen vor Verletzungen. Im Aufbau als Erhaltung 2 × 25-30 min.', structure: 'Aufwärmen, Ganzkörper-Übungen in 2-3 Sätzen.' },
  // Koppel und Teamsport
  { key: 'brick', sport: 'brick', name: 'Koppeltraining Rad + Lauf', intensity: 'mittel', purpose: 'Den Wechsel vom Rad zum Laufen üben.', structure: 'Ausfahrt, direkt danach ein kurzer lockerer Lauf.' },
  { key: 'team.training', sport: 'team', name: 'Teamsport-Training', intensity: 'Teamsport', purpose: 'Fester Termin; zählt voll in die Belastung.', structure: 'Wie im Verein.' },
  { key: 'team.game', sport: 'team', name: 'Spiel', intensity: 'Teamsport', purpose: 'Zählt als harter Tag; am Tag davor nichts Hartes.', structure: 'Wie im Verein.' }
];
const BY_KEY: Record<string, SessionType> = Object.fromEntries(SESSION_TYPES.map(t => [t.key, t]));
export const typeByKey = (k: string): SessionType | null => BY_KEY[k] || null;

/* Typ einer Einheit aus ihrem Bauplan (spec.kind) und der Sportart */
export function typeKeyOf(s: any): string | null {
  if (!s) return null;
  const sp = s.spec || {}; const kind = sp.kind || '';
  if (s.sport === 'football') return kind === 'game' || /spiel|match/i.test(s.title || '') ? 'team.game' : 'team.training';
  if (s.sport === 'strength') return 'strength.' + (s.area || sp.area || 'full');
  if (s.sport === 'run') {
    if (/^(Koppellauf|Wechsel-Lauf)/.test(s.title || '')) return 'run.brick';
    if (kind === 'test') return 'run.test';
    if (kind === 'easy' || kind === 'recovery' || !kind) return /Steigerung/.test(JSON.stringify(sp.steps || []) + (s.description || '')) ? 'run.strides' : 'run.easy';
    return BY_KEY['run.' + kind] ? 'run.' + kind : 'run.easy';
  }
  if (s.sport === 'bike') { if (kind === 'test') return 'bike.test'; if (!kind || kind === 'recovery') return 'bike.easy'; return BY_KEY['bike.' + kind] ? 'bike.' + kind : 'bike.easy'; }
  if (s.sport === 'swim') {
    if (kind === 'swimlearn') return s.stage && s.stage.ladder === 'swimBreast' ? 'swim.breast' : 'swim.learn';
    if (kind === 'test') return /Kraul-Check/.test(s.title || sp.title || '') ? 'swim.check' : 'swim.test';
    return BY_KEY['swim.' + kind] ? 'swim.' + kind : 'swim.endurance';
  }
  if (kind === 'brick') return 'brick';
  return null;
}
export const typeOf = (s: any): SessionType | null => { const k = typeKeyOf(s); return k ? typeByKey(k) : null; };
/* „Warum“ in einem Satz aus der Liste, wenn die Einheit keinen eigenen hat */
export const purposeOf = (s: any): string | null => { const t = typeOf(s); return t ? t.purpose : null; };

/* Plan-Check für Namen (Auftrag 17): unklare Namen, Widerspruch „locker“ im Titel und harte Abschnitte, strukturierte Intervalle ohne
   „Intervalle“ im Namen, fehlender Aufbau (Aufwärmen, Hauptteil, Auslaufen) oder fehlendes „Warum“. Liefert die Probleme als Text. */
export function nameIssues(s: any): string[] {
  const out: string[] = [];
  if (!s || s.sport === 'rest' || s.race || s.sport === 'football' || s.fixed) return out;
  const t = String(s.title || ''); const sp = s.spec; const desc = String(s.description || '');
  if (/Fahrtspiel/i.test(t)) out.push(`„${t}“: unklarer Name (Fahrtspiel), besser sagen, was man tut.`);
  if (!sp || !Array.isArray(sp.steps)) return out;
  const main = sp.steps.filter((x: any) => x.part === 'main');
  // harte Abschnitte: Zone 3 und mehr, länger als 1 min am Stück (Steigerungen und Hügelsprints sind kurz)
  const hardBits = main.filter((x: any) => (x.zone || 0) >= 3 && (sp.sport === 'swim' ? (x.m || 0) >= 50 && (x.zone || 0) >= 4 : (x.min || 0) > 1));
  if (/(^|\s)locker/i.test(t) && hardBits.length && sp.sport !== 'swim') out.push(`„${t}“: „locker“ im Namen, aber Abschnitte in Zone ${Math.max(...hardBits.map((x: any) => x.zone))}.`);
  const structured = main.some((x: any) => (x.reps || 1) > 1 && (x.zone || 0) >= 3 && (sp.sport === 'swim' ? (x.zone || 0) >= 4 : (x.min || 0) >= 1));
  if (structured && !/Intervalle|mit \d|Test|Kraul-Check|Koppel|zügigen Blöcken/.test(t) && !['longq', 'test', 'swimlearn', 'technique', 'endurance', 'openwater'].includes(sp.kind)) out.push(`„${t}“: strukturierte Intervalle, aber „Intervalle“ fehlt im Namen.`);
  if (['run', 'bike'].includes(sp.sport) && (s.plannedMinutes || 0) >= 30 && !sp.stage && !/^(Koppel|Wechsel)/.test(t) && sp.kind !== 'test') {
    if (!sp.steps.some((x: any) => x.part === 'warm')) out.push(`„${t}“: kein Aufwärmen.`);
    if (!sp.steps.some((x: any) => x.part === 'cool') && !['longq', 'hills'].includes(sp.kind) && !main.some((x: any) => /auslaufen|ausrollen|zu Ende/.test(x.note || ''))) out.push(`„${t}“: kein Auslaufen.`);
  }
  if (desc && !/Warum: /.test(desc) && sp.sport !== 'strength') out.push(`„${t}“: kein „Warum“.`);
  if (!typeKeyOf(s)) out.push(`„${t}“: Einheitstyp unbekannt.`);
  return out;
}
