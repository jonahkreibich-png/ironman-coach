/* Auftrag 19, Punkt 1c: zentrale Einheiten-Bibliothek für alle Sportarten. Generator, Plan-Anzeige, Lexikon und Coach schöpfen daraus.
   Übernommen und vereinheitlicht aus shared/keysessions.ts (Leitern Rad/Lauf, Varianten) und shared/workouts.ts (Bausteine, Lernstufen,
   Technikübungen); nichts doppelt: die Bausteine bleiben in workouts.ts, hier stehen Beschreibung, Einordnung und Auswahl.
   Jede Einheit hat: Name, Sportart, Zweck (1 Satz), Niveau (ab Einsteiger/Fortgeschritten/Erfahren), Phasen, Ziele, Aufbau, Steigerungsstufen,
   Belastung (locker/mittel/hart), Ausrüstung bzw. Gelände (mit Ersatz) und Ausschlüsse bei Beschwerden.
   Die Bausteine (W.Spec) baut shared/workoutbuild.ts. Diese Datei hat keine Abhängigkeiten (auch für Lexikon und Einheitstypen nutzbar). */

export type LPhase = 'base' | 'build' | 'specific' | 'taper' | 'recovery';
export type LLevel = 'beginner' | 'advanced' | 'experienced';
export type LLoad = 'locker' | 'mittel' | 'hart';
export type LGoal = '5k' | '10k' | 'half' | 'marathon' | 'sprint' | 'olympic' | 'middle' | 'long' | 'bike' | 'swim' | 'fitness' | 'duathlon' | 'aquathlon';
export type LNeed = 'hills' | 'track' | 'trainer' | 'buoy' | 'board' | 'paddles' | 'openwater';
export type LExclude = 'achilles' | 'knee' | 'back' | 'shoulder' | 'runEasyOnly';
export interface WorkoutDef {
  key: string; sport: 'run' | 'bike' | 'swim' | 'tri';
  name: string; purpose: string;
  /** ab diesem Niveau (beginner = alle) */ level: LLevel;
  phases: LPhase[]; goals: LGoal[] | 'all';
  example: string; structure: string; stages: string[];
  load: LLoad; zone: string;
  /** nötige Ausrüstung bzw. Gelände; fehlt es, gilt alt (Ersatz) */ needs?: LNeed[]; alt?: string; altText?: string;
  excludes?: LExclude[];
  /** Schwimmen: ab so vielen Metern Kraul am Stück */ swimMin?: number;
  /** Zone 5 (unter 18 und ab 60 nicht bzw. dosiert) */ z5?: boolean;
  /** zählt als Qualitätseinheit (hart oder mittel) */ quality?: boolean;
}
const A: LGoal[] | 'all' = 'all';
const RUNG: LGoal[] = ['5k', '10k', 'half', 'marathon'];
const TRI: LGoal[] = ['sprint', 'olympic', 'middle', 'long', 'duathlon', 'aquathlon'];

export const WORKOUTS: WorkoutDef[] = [
  // ---------- Laufen ----------
  { key: 'run.easy', sport: 'run', name: 'Lockerer Lauf', purpose: 'Grundlagenausdauer aufbauen, ohne müde zu machen.', level: 'beginner', phases: ['base', 'build', 'specific', 'taper', 'recovery'], goals: A,
    example: '45 min Zone 2', structure: '10 min ganz locker einlaufen, Hauptteil locker in Zone 2 (Sprechen geht), 5 min auslaufen.', stages: ['30 min', '45 min', '60 min'], load: 'locker', zone: 'Z1-2' },
  { key: 'run.long', sport: 'run', name: 'Langer Lauf', purpose: 'Ausdauer für lange Strecken; immer locker.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '75-120 min Zone 2', structure: 'Ganz locker beginnen, durchgehend Zone 2, ab 75 min essen und trinken, ruhig zu Ende laufen.', stages: ['+10 min pro Woche bis zur Obergrenze des Ziels'], load: 'locker', zone: 'Z2' },
  { key: 'run.strides', sport: 'run', name: 'Steigerungen', purpose: 'Lockerer Lauf mit kurzen, schnellen Schritten: schult Laufstil und Tempo, ohne müde zu machen.', level: 'beginner', phases: ['base', 'build', 'specific', 'taper', 'recovery'], goals: A,
    example: '4-8×20 s locker-schnell', structure: 'Locker einlaufen, Hauptteil Zone 2, am Ende 4-8 × 20 s zügig steigern, dazwischen gehen.', stages: ['4×20 s', '6×20 s', '8×20 s'], load: 'locker', zone: 'Z2 + kurz Z4', quality: true },
  { key: 'run.abc', sport: 'run', name: 'Lauf-ABC + Steigerungen', purpose: 'Technik: Fußaufsatz, Kniehub und Armarbeit üben.', level: 'beginner', phases: ['base', 'build', 'recovery'], goals: A,
    example: '10 min ABC, 6×80 m', structure: '10 min einlaufen, 10 min Lauf-ABC (Fußgelenksarbeit, Skippings, Anfersen, Hopserlauf), locker weiter, 6 × 80 m Steigerungen, auslaufen.', stages: ['4×80 m', '6×80 m'], load: 'locker', zone: 'Z1-2', quality: true },
  { key: 'run.hillsprints', sport: 'run', name: 'Hügelsprints', purpose: 'Kraft und Laufökonomie durch kurze, steile Sprints, ohne müde zu machen.', level: 'advanced', phases: ['base', 'build'], goals: A,
    example: '6-10×10-15 s steil, voll erholen', structure: '15 min einlaufen, 6-10 × 10-15 s zügig einen steilen Hügel hinauf, langsam zurückgehen (voll erholen), locker auslaufen.', stages: ['6×10 s', '8×12 s', '8×15 s', '10×15 s'],
    load: 'locker', zone: 'kurz Z5, sonst Z2', needs: ['hills'], alt: 'run.strides', altText: 'Ohne Hügel: Laufband mit Steigung oder Steigerungen in der Ebene.', excludes: ['achilles'], quality: true },
  { key: 'run.hillreps', sport: 'run', name: 'Berg-Intervalle (Laufen)', purpose: 'Kraft und Tempo bergauf: hebt die Sauerstoffaufnahme mit wenig Stoß auf die Beine.', level: 'advanced', phases: ['build'], goals: ['5k', '10k', 'sprint', 'olympic', 'fitness'],
    example: '6-10×60-90 s bergauf, Traben zurück', structure: '15 min einlaufen mit Steigerungen, Wiederholungen hart bergauf, im Traben zurück, 10 min auslaufen.', stages: ['6×60 s', '8×60 s', '6×90 s', '8×90 s', '10×90 s'],
    load: 'hart', zone: 'Z4-5', needs: ['hills'], alt: 'run.vo2', altText: 'Ohne Hügel: Laufband mit 4-6 % Steigung oder die gleichen Stücke in der Ebene.', excludes: ['achilles'], z5: true, quality: true },
  { key: 'run.longhills', sport: 'run', name: 'Lange Hügel', purpose: 'Kraftausdauer für lange Rennen: lange Anstiege knapp unter der Schwelle.', level: 'advanced', phases: ['build'], goals: ['half', 'marathon', 'middle', 'long', 'fitness'],
    example: '4-6×3 min bergauf', structure: '15 min einlaufen, 4-6 × 3 min gleichmäßig bergauf (Zone 4), locker zurück, 10 min auslaufen.', stages: ['4×3 min', '5×3 min', '6×3 min'],
    load: 'hart', zone: 'Z4', needs: ['hills'], alt: 'run.threshold', altText: 'Ohne Hügel: Laufband mit Steigung oder Schwellen-Intervalle.', excludes: ['achilles'], quality: true },
  { key: 'run.fartlek', sport: 'run', name: 'Tempowechsel-Lauf (Fahrtspiel)', purpose: 'Abwechslung und erstes Tempo: zügige Minuten im Wechsel mit lockeren.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '8×1 min zügig / 1 min locker', structure: '10 min einlaufen, dann im Wechsel 1 min zügig (Zone 3) und 1 min locker, 10 min auslaufen.', stages: ['6×1 min / 2 min', '8×1 min / 1 min', '10×1 min / 1 min', '6×2 min / 1 min'],
    load: 'mittel', zone: 'Z3 / Z2', quality: true },
  { key: 'run.progression', sport: 'run', name: 'Progressionslauf', purpose: 'Locker beginnen und im letzten Drittel bis zur Schwelle steigern: Tempogefühl und Ausdauer.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '45 min, letztes Drittel bis Schwelle', structure: '10 min einlaufen, Zone 2, im letzten Drittel Schritt für Schritt schneller bis knapp an die Schwelle, 5 min auslaufen.', stages: ['40 min', '50 min', '60 min'],
    load: 'mittel', zone: 'Z2 → Z4', quality: true },
  { key: 'run.tempo', sport: 'run', name: 'Tempodauerlauf', purpose: 'Die Schwelle am Stück halten: hebt das Tempo, das du lange laufen kannst.', level: 'advanced', phases: ['build', 'specific'], goals: ['10k', 'half', 'marathon', 'olympic', 'middle', 'long', 'duathlon', 'fitness'],
    example: '15 → 40 min an der Schwelle', structure: '15 min einlaufen mit Steigerungen, Tempo-Abschnitt gleichmäßig an der Schwelle (Zone 4), 10 min auslaufen.', stages: ['15 min', '20 min', '25 min', '30 min', '35 min', '40 min'],
    load: 'hart', zone: 'Z4', quality: true },
  { key: 'run.threshold', sport: 'run', name: 'Schwellen-Intervalle', purpose: 'Das Tempo heben, das du lange halten kannst – in Stücken, damit es gut kontrollierbar bleibt.', level: 'beginner', phases: ['build', 'specific'], goals: A,
    example: '3-5×6-10 min, 1-2 min Trabpause', structure: '15 min einlaufen mit Steigerungen, Wiederholungen an der Schwelle (Zone 4) mit Trabpause, 10 min auslaufen. Einsteiger: kürzere Stücke.', stages: ['3×8 min', '3×10 min', '2×15 min', '20 min am Stück', '25 min am Stück'],
    load: 'hart', zone: 'Z4', quality: true },
  { key: 'run.vo2', sport: 'run', name: 'VO2max-Intervalle', purpose: 'Kurz und sehr hart: hebt die maximale Sauerstoffaufnahme, wichtig für 5 und 10 km und kurze Triathlons.', level: 'advanced', phases: ['build', 'specific'], goals: ['5k', '10k', 'half', 'sprint', 'olympic', 'duathlon', 'fitness'],
    example: '5-6×3 min, 6×1000 m, 12×400 m', structure: '15 min einlaufen mit Steigerungen, Wiederholungen sehr hart (Zone 5) mit gleich langer Trabpause, 10 min auslaufen.', stages: ['5×3 min', '6×3 min', '8×400 m', '5×4 min', '6×1000 m', '12×400 m'],
    load: 'hart', zone: 'Z5', z5: true, quality: true },
  { key: 'run.pyramid', sport: 'run', name: 'Lauf-Pyramide', purpose: 'Abwechslung im Aufbau: kurze und längere Stücke in einer Einheit.', level: 'advanced', phases: ['build'], goals: A,
    example: '1-2-3-4-3-2-1 min', structure: '15 min einlaufen, Stücke 1-2-3-4-3-2-1 min hart (Zone 4-5), Trabpause halb so lang, 10 min auslaufen.', stages: ['1-2-3-2-1 min', '1-2-3-4-3-2-1 min'],
    load: 'hart', zone: 'Z4-5', z5: true, quality: true },
  { key: 'run.3030', sport: 'run', name: '30/30', purpose: 'Einstieg in VO2max-Training: kurze schnelle Stücke, leicht zu dosieren.', level: 'beginner', phases: ['build', 'specific'], goals: A,
    example: '10-20×30 s schnell / 30 s locker', structure: '15 min einlaufen, 30 s schnell und 30 s locker im Wechsel, 10 min auslaufen. Einsteiger: wenige Wiederholungen.', stages: ['10×30/30', '12×30/30', '16×30/30', '20×30/30'],
    load: 'hart', zone: 'Z5 / Z1', z5: true, quality: true },
  { key: 'run.speed', sport: 'run', name: 'Kurze Schnelligkeit', purpose: 'Schnelligkeit und Laufökonomie für kurze Rennen.', level: 'advanced', phases: ['build', 'specific'], goals: ['5k', 'sprint'],
    example: '8-10×200 m schnell, volle Pause', structure: '15 min einlaufen mit Steigerungen, 200-m-Stücke schnell und locker, volle Pause gehend, 10 min auslaufen.', stages: ['8×200 m', '10×200 m'],
    load: 'hart', zone: 'Z5', needs: ['track'], alt: 'run.3030', altText: 'Ohne Bahn: 8-10 × 40 s schnell auf flacher Strecke.', z5: true, quality: true },
  { key: 'run.racepace', sport: 'run', name: 'Wettkampftempo-Blöcke', purpose: 'Das Renntempo der Zieldistanz üben, bis es sich vertraut anfühlt.', level: 'advanced', phases: ['specific', 'taper'], goals: A,
    example: 'HM: 3×10 → 2×20 min; Marathon: 2×30 min → 3×5 km', structure: '15 min einlaufen, Abschnitte im geplanten Wettkampftempo mit Trabpause, 10 min auslaufen.', stages: ['HM: 3×10 min', 'HM: 2×15 min', 'HM: 3×12 min', 'HM: 2×20 min', 'Marathon: 2×30 min', 'Marathon: 3×5 km', '10 km: 5×4 → 3×8 min'],
    load: 'hart', zone: 'Z3-4 (Wettkampftempo)', quality: true },
  { key: 'run.longfinish', sport: 'run', name: 'Langer Lauf mit Endbeschleunigung', purpose: 'Renntempo auf müden Beinen: die letzten Minuten des langen Laufs im Wettkampftempo.', level: 'advanced', phases: ['specific'], goals: ['half', 'marathon', 'middle', 'long'],
    example: 'letzte 15-20 min im Wettkampftempo', structure: 'Langer Lauf locker, die letzten 15-20 min im Wettkampftempo, kurz auslaufen. Nur jede 2. Woche und nie in derselben Woche wie ein harter Qualitätslauf.', stages: ['10 min', '15 min', '20 min'],
    load: 'hart', zone: 'Z2 + Z3', quality: true },
  { key: 'run.brick', sport: 'run', name: 'Koppellauf', purpose: 'Laufen direkt nach dem Rad gewöhnt die Beine an den Wechsel.', level: 'beginner', phases: ['build', 'specific'], goals: TRI,
    example: '10-30 min nach dem Rad, Start im Wettkampftempo', structure: 'Direkt nach der Ausfahrt laufen, die ersten Minuten im Wettkampftempo, dann locker. Im Aufbau jede 2.-3. Woche.', stages: ['10 min', '15 min', '20 min', '30 min'],
    load: 'mittel', zone: 'Z2-3' },
  { key: 'run.runwalk', sport: 'run', name: 'Gehen/Laufen', purpose: 'Schritt für Schritt zu 30 min am Stück.', level: 'beginner', phases: ['base', 'build', 'specific', 'recovery'], goals: A,
    example: 'Stufe 1: 8×(1 min laufen + 2 min gehen) … Stufe 8: 30 min am Stück', structure: 'Zügig gehen, abwechselnd laufen und gehen, locker gehen. Die nächste Stufe kommt, wenn die aktuelle klappt.', stages: ['Stufe 1', 'Stufe 2', 'Stufe 3', 'Stufe 4', 'Stufe 5', 'Stufe 6', 'Stufe 7', 'Stufe 8'],
    load: 'locker', zone: 'Z2' },
  // ---------- Rad ----------
  { key: 'bike.easy', sport: 'bike', name: 'Lockere Ausfahrt', purpose: 'Grundlage auf dem Rad, schont die Gelenke.', level: 'beginner', phases: ['base', 'build', 'specific', 'taper', 'recovery'], goals: A,
    example: '60 min Zone 2', structure: '10 min einrollen, Zone 2 mit 85-95 Umdrehungen, 5 min ausrollen.', stages: ['45 min', '60 min', '90 min'], load: 'locker', zone: 'Z1-2' },
  { key: 'bike.morning', sport: 'bike', name: 'Lockeres Rad am Morgen', purpose: 'Kurz und locker vor Schule oder Arbeit, auch am Spieltag: zählt nicht als hart.', level: 'beginner', phases: ['base', 'build', 'specific', 'recovery'], goals: A,
    example: '30-40 min Zone 1-2 auf der Rolle', structure: '5 min einrollen, Zone 1-2 mit hoher Trittfrequenz, 5 min ausrollen. Am Spieltag nur wirklich locker.', stages: ['30 min', '35 min', '40 min'], load: 'locker', zone: 'Z1-2' },
  { key: 'bike.long', sport: 'bike', name: 'Lange Ausfahrt', purpose: 'Ausdauer für lange Strecken; immer locker, mit Essen und Trinken.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '2-4 h Zone 2', structure: '15 min einrollen, lange in Zone 2, alle 20-30 min essen und trinken, 10 min ausrollen. Variante: hügelig, mit Kadenz-Blöcken.', stages: ['+15 min pro Woche'], load: 'locker', zone: 'Z2' },
  { key: 'bike.cadence', sport: 'bike', name: 'Kadenz-Übungen', purpose: 'Runder, ökonomischer Tritt: hohe Trittfrequenz und Einbeinfahren.', level: 'beginner', phases: ['base', 'build', 'recovery'], goals: A,
    example: 'Spin-ups 5×1 min 100-120 rpm, Einbeinfahren (Rolle)', structure: '15 min einrollen, 5 × 1 min mit 100-120 Umdrehungen (Spin-ups), auf der Rolle 4 × 30 s je Bein einbeinig, locker Zone 2, ausrollen.', stages: ['4×1 min', '5×1 min', '6×1 min'],
    load: 'locker', zone: 'Z2', quality: true },
  { key: 'bike.force', sport: 'bike', name: 'Kraftausdauer (niedrige Kadenz)', purpose: 'Kraft für Anstiege und lange Strecken: niedrige Trittfrequenz im Sitzen.', level: 'advanced', phases: ['base', 'build', 'specific'], goals: A,
    example: '4-6×5-10 min, 55-65 rpm, Zone 3', structure: '15 min einrollen, Abschnitte mit 55-65 Umdrehungen in Zone 3 im Sitzen (am Berg oder auf der Rolle), locker dazwischen, ausrollen.', stages: ['4×5 min', '5×6 min', '4×8 min', '5×8 min', '4×10 min', '6×8 min'],
    load: 'mittel', zone: 'Z3', excludes: ['knee'], quality: true },
  { key: 'bike.sweetspot', sport: 'bike', name: 'Sweet Spot', purpose: 'Die Schwelle heben, ohne so müde zu machen wie Schwellen-Intervalle.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '3×10 → 2×20 → 1×45 min', structure: '15 min einrollen mit 3 Antritten, Abschnitte im oberen Bereich von Zone 3 (88-93 % FTP), 5 min locker dazwischen, ausrollen.', stages: ['3×10 min', '3×12 min', '2×15 min', '2×20 min', '3×15 min', '2×25 min', '1×45 min'],
    load: 'hart', zone: 'Z3 oben', quality: true },
  { key: 'bike.threshold', sport: 'bike', name: 'Schwelle', purpose: 'Das Tempo heben, das du lange halten kannst.', level: 'advanced', phases: ['build', 'specific', 'taper'], goals: A,
    example: '4×8, 3×12, 2×20 min', structure: '15 min einrollen mit 3 Antritten, Abschnitte an der Schwelle (Zone 4), dazwischen locker rollen, ausrollen.', stages: ['4×8 min', '3×10 min', '3×12 min', '2×15 min', '2×20 min'],
    load: 'hart', zone: 'Z4', quality: true },
  { key: 'bike.overunder', sport: 'bike', name: 'Over-Unders', purpose: 'Tempowechsel knapp über und unter der Schwelle verkraften – wie bei Attacken und Anstiegen.', level: 'advanced', phases: ['build', 'specific'], goals: A,
    example: '3-4×9 min (2 min knapp unter / 1 min knapp über der Schwelle)', structure: '15 min einrollen, Abschnitte mit je 2 min knapp unter und 1 min knapp über der Schwelle im Wechsel, 5 min locker dazwischen, ausrollen.', stages: ['3×6 min', '3×9 min', '4×9 min', '3×12 min'],
    load: 'hart', zone: 'Z4 ±', quality: true },
  { key: 'bike.vo2', sport: 'bike', name: 'VO2max', purpose: 'Kurz und sehr hart: hebt die maximale Sauerstoffaufnahme, gut für kurze Rennen.', level: 'advanced', phases: ['build', 'specific', 'taper'], goals: A,
    example: '5×3, 4×4, 5×5 min', structure: '15 min einrollen mit Antritten, Wiederholungen sehr hart (Zone 5), gleich lange Pause locker, ausrollen.', stages: ['5×3 min', '4×4 min', '5×4 min', '5×5 min'],
    load: 'hart', zone: 'Z5', z5: true, quality: true },
  { key: 'bike.3015', sport: 'bike', name: '30/15', purpose: 'Viel Zeit nahe der maximalen Sauerstoffaufnahme in kurzen Stücken.', level: 'experienced', phases: ['specific'], goals: ['sprint', 'olympic', 'bike', 'duathlon'],
    example: '2-3 Sätze à 10-13×30 s hart / 15 s locker', structure: '20 min einrollen, Sätze aus 30 s hart und 15 s locker, 5 min locker zwischen den Sätzen, ausrollen.', stages: ['2×10', '2×13', '3×10', '3×13'],
    load: 'hart', zone: 'Z5', z5: true, quality: true },
  { key: 'bike.sprints', sport: 'bike', name: 'Sprints', purpose: 'Spritzigkeit und Kraft der Nerven-Muskel-Ansteuerung, ohne Ermüdung.', level: 'beginner', phases: ['base', 'build'], goals: A,
    example: '6-8×10-15 s voll, lange Pause', structure: '15 min einrollen, 6-8 Sprints über 10-15 s mit 3-5 min locker dazwischen, sonst Zone 2, ausrollen.', stages: ['6×10 s', '8×12 s', '8×15 s'],
    load: 'locker', zone: 'kurz maximal, sonst Z2', excludes: ['knee'], quality: true },
  { key: 'bike.tempolong', sport: 'bike', name: 'Tempo lang', purpose: 'Das Renntempo der Mittel- und Langdistanz lange halten.', level: 'experienced', phases: ['specific'], goals: ['middle', 'long', 'bike'],
    example: '2×30 → 2×60 min im Renntempo', structure: '20 min einrollen, lange Abschnitte im Renntempo (Zone 3), 10 min locker dazwischen, essen und trinken wie im Rennen, ausrollen.', stages: ['2×30 min', '2×40 min', '2×50 min', '2×60 min'],
    load: 'hart', zone: 'Z3', quality: true },
  { key: 'bike.racepaceblocks', sport: 'bike', name: 'Lange Ausfahrt mit Renntempo-Blöcken', purpose: 'Renntempo und Ausdauer in einer Einheit, mit Wettkampf-Verpflegung.', level: 'advanced', phases: ['specific'], goals: ['olympic', 'middle', 'long', 'bike'],
    example: 'z. B. 3×20 min im Renntempo', structure: 'Erst locker, dann die Blöcke im Renntempo mit 10 min locker dazwischen, locker zu Ende fahren, Verpflegung wie im Rennen.', stages: ['2×15 min', '3×15 min', '3×20 min', '2×30 min'],
    load: 'hart', zone: 'Z3', quality: true },
  { key: 'bike.climb', sport: 'bike', name: 'Berg-Intervalle (Rad)', purpose: 'Lange Anstiege knapp unter der Schwelle üben, so wie am Berg im Rennen.', level: 'advanced', phases: ['build', 'specific'], goals: A,
    example: '5-8×3-5 min Anstieg', structure: '15 min einrollen, Anstiege knapp unter der Schwelle, Trittfrequenz 70-80 im Sitzen, bergab locker, ausrollen.', stages: ['5×3 min', '6×4 min', '5×5 min', '8×4 min'],
    load: 'hart', zone: 'Z4', needs: ['hills'], alt: 'bike.force', altText: 'Ohne Berge: auf der Rolle mit hohem Widerstand und 60-70 Umdrehungen.', quality: true },
  { key: 'bike.tt', sport: 'bike', name: 'Zeitfahr-Simulation', purpose: 'Renntempo in der Wettkampf-Position, Verpflegung und Gefühl für das Tempo.', level: 'advanced', phases: ['specific'], goals: ['sprint', 'olympic', 'middle', 'duathlon'],
    example: '20-40 min Renntempo in Aero-Position', structure: '20 min einrollen, ein Abschnitt im Renntempo in der Wettkampf-Position, ausrollen.', stages: ['20 min', '30 min', '40 min'],
    load: 'hart', zone: 'Z3-4', quality: true },
  { key: 'bike.brickreps', sport: 'tri', name: 'Koppel-Wiederholungen', purpose: 'Den Wechsel Rad → Laufen mehrmals im Renntempo üben.', level: 'experienced', phases: ['specific'], goals: ['sprint', 'olympic', 'duathlon'],
    example: '3×(10 min Rad + 5 min Lauf)', structure: 'Einrollen, dann 3 Runden aus 10 min Rad und 5 min Laufen im Wettkampftempo, locker auslaufen.', stages: ['2 Runden', '3 Runden', '4 Runden'],
    load: 'hart', zone: 'Z3-4', quality: true },
  // ---------- Schwimmen (Strecken immer passend zur Strecke am Stück, Hilfsmittel nur, wenn vorhanden) ----------
  { key: 'swim.drills', sport: 'swim', name: 'Technik-Übungen', purpose: 'Bessere Wasserlage und ein langer Zug: Technik spart später viel Kraft.', level: 'beginner', phases: ['base', 'build', 'specific', 'taper', 'recovery'], goals: A,
    example: 'Abschlag, Catch-up, Faust, Seitlage, 6-1-6, Reißverschluss, Sculling', structure: 'In jeder Einheit nach dem Einschwimmen 4-8 Bahnen Übungen, ruhig und sauber.', stages: ['4×25 m', '6×25 m', '4×50 m'], load: 'locker', zone: 'Z1' },
  { key: 'swim.kick', sport: 'swim', name: 'Beinschlag-Sets', purpose: 'Eine flache Wasserlage durch einen lockeren Beinschlag aus der Hüfte.', level: 'beginner', phases: ['base', 'build', 'recovery'], goals: A,
    example: '6-8×25 m mit Kickbrett', structure: 'Nach dem Einschwimmen Beinschlag mit Kickbrett (ohne Brett in Seitlage), 30 s Pause.', stages: ['6×25 m', '8×25 m', '6×50 m'], load: 'locker', zone: 'Z1-2' },
  { key: 'swim.pull', sport: 'swim', name: 'Zug-Sets', purpose: 'Kraft im Zug und gute Wasserlage, die Beine ruhen.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '4-8×50-100 m mit Pull Buoy (± Paddles für Erfahrene)', structure: 'Kraul mit Pull Buoy zwischen den Oberschenkeln, lange Züge; Paddles nur für Geübte und ohne Schulterbeschwerden.', stages: ['4×50 m', '6×50 m', '4×100 m', '8×100 m'],
    load: 'locker', zone: 'Z2', needs: ['buoy'], alt: 'swim.drills', altText: 'Ohne Pull Buoy: normales Kraul mit ruhigen Beinen.', swimMin: 25 },
  { key: 'swim.breath', sport: 'swim', name: 'Atem-Sets', purpose: 'Ruhig und beidseitig atmen – wichtig für Rhythmus und Orientierung.', level: 'beginner', phases: ['base', 'build'], goals: A,
    example: 'Dreier-/Fünfer-Atmung', structure: 'Bahnen mit Dreier-Atmung, später einzelne mit Fünfer-Atmung. Nie Luft anhalten, keine Strecken unter Wasser.', stages: ['4×25 m', '6×25 m', '4×50 m'], load: 'locker', zone: 'Z1-2' },
  { key: 'swim.fast', sport: 'swim', name: 'Kurze schnelle Stücke', purpose: 'Tempo und Technik unter Belastung – auch für alle, die Kraul noch lernen.', level: 'beginner', phases: ['base', 'build', 'specific', 'taper'], goals: A,
    example: '8-12×25 m zügig, 30-45 s Pause', structure: 'Nach Einschwimmen und Technik kurze Stücke zügig in der eigenen Strecke, 30-45 s Pause, Technik sauber halten; mit Pull Buoy oder Kickbrett, wenn vorhanden.', stages: ['6×25 m', '8×25 m', '10×25 m', '12×25 m'],
    load: 'mittel', zone: 'Z3-4', quality: true },
  { key: 'swim.aerobic', sport: 'swim', name: 'Aerobe Wiederholungen', purpose: 'Grundlage im Wasser in gleichmäßigen Stücken.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: A,
    example: '4-8×100-200 m Zone 2', structure: 'Einschwimmen, Technik, gleichmäßige Stücke in Zone 2 mit kurzer Pause, ausschwimmen.', stages: ['4×100 m', '6×100 m', '4×200 m', '6×200 m'], load: 'locker', zone: 'Z2', swimMin: 100 },
  { key: 'swim.threshold', sport: 'swim', name: 'Schwellen-Sets', purpose: 'Schneller werden knapp unter der Schwelle.', level: 'beginner', phases: ['build', 'specific'], goals: A,
    example: '8×50, 6×100 m knapp unter der Schwelle', structure: 'Einschwimmen, Technik, Stücke knapp unter der Schwelle (Zone 4) mit 15-20 s Pause, locker ausschwimmen.', stages: ['8×50 m', '10×50 m', '6×100 m', '8×100 m'],
    load: 'hart', zone: 'Z4', swimMin: 200, quality: true },
  { key: 'swim.css', sport: 'swim', name: 'CSS-Intervalle', purpose: 'Training an der Schwimm-Schwelle (CSS) – der wichtigste Reiz für Ausdauer-Tempo im Wasser.', level: 'beginner', phases: ['build', 'specific'], goals: A,
    example: '10×100, 5×200, 3×300 m @ CSS, 10-20 s Pause', structure: 'Einschwimmen, Technik, Stücke genau im CSS-Tempo mit kurzer Pause, locker ausschwimmen.', stages: ['8×100 m', '10×100 m', '5×200 m', '3×300 m'],
    load: 'hart', zone: 'Z4 (CSS)', swimMin: 400, quality: true },
  { key: 'swim.pyramid', sport: 'swim', name: 'Pyramide', purpose: 'Abwechslung und Tempogefühl über verschiedene Strecken.', level: 'advanced', phases: ['base', 'build', 'specific'], goals: A,
    example: '100-200-300-200-100 m', structure: 'Einschwimmen, Technik, Stücke 100-200-300-200-100 m zügig (Zone 3), 20 s Pause, ausschwimmen.', stages: ['100-200-100 m', '100-200-300-200-100 m'], load: 'hart', zone: 'Z3', swimMin: 300, quality: true },
  { key: 'swim.descend', sport: 'swim', name: 'Absteigend / negativ', purpose: 'Pacing lernen: jedes Stück schneller, die zweite Hälfte schneller als die erste.', level: 'advanced', phases: ['build', 'specific'], goals: A,
    example: '4×100 m jede schneller, 400 m 2. Hälfte schneller', structure: 'Einschwimmen, Technik, 4 × 100 m jede Wiederholung schneller, dann 400 m mit schnellerer zweiter Hälfte, ausschwimmen.', stages: ['4×100 m', '2×(4×100 m)', '4×100 m + 400 m'], load: 'hart', zone: 'Z2 → Z4', swimMin: 400, quality: true },
  { key: 'swim.broken', sport: 'swim', name: 'Geteilte Strecke', purpose: 'Wettkampftempo üben: die Rennstrecke in Stücke mit kurzer Pause geteilt.', level: 'advanced', phases: ['specific'], goals: A,
    example: '400 m als 4×100 m mit 10 s Pause', structure: 'Einschwimmen, Technik, die Strecke geteilt im Wettkampftempo mit 10 s Pause, locker ausschwimmen.', stages: ['4×100 m', '8×100 m', '4×200 m'], load: 'hart', zone: 'Z4', swimMin: 100, quality: true },
  { key: 'swim.long', sport: 'swim', name: 'Langstrecke', purpose: 'Ausdauer im Wasser: lange am Stück ruhig schwimmen.', level: 'beginner', phases: ['base', 'build', 'specific'], goals: ['olympic', 'middle', 'long', 'swim', 'aquathlon'],
    example: '800-2000 m am Stück', structure: 'Einschwimmen, Technik, eine lange Strecke gleichmäßig in Zone 2, ausschwimmen.', stages: ['800 m', '1200 m', '1500 m', '2000 m'], load: 'locker', zone: 'Z2', swimMin: 400 },
  { key: 'swim.racestart', sport: 'swim', name: 'Wettkampfstart', purpose: 'Schneller Start und danach ins Renntempo finden – wie im Triathlon.', level: 'advanced', phases: ['specific'], goals: TRI,
    example: '50-100 m schnell, dann Renntempo', structure: 'Einschwimmen, Technik, 4-6 × (50 m schnell + 100 m Renntempo), Pause 30 s, ausschwimmen.', stages: ['4 Runden', '6 Runden'], load: 'hart', zone: 'Z5 → Z3', swimMin: 200, quality: true },
  { key: 'swim.openwater', sport: 'swim', name: 'Freiwasser', purpose: 'Sichten, Orientierung, Start und Neopren üben – nie allein.', level: 'beginner', phases: ['build', 'specific'], goals: TRI,
    example: 'Sichten alle 6-10 Züge, Wasserschatten, Bojen-Wende, Neopren, Massenstart', structure: 'Einschwimmen, Sichten alle 6-10 Züge, im Wasserschatten schwimmen, Wende um eine Boje, Starts üben, locker zurück.', stages: ['Sichten', 'Bojen-Wende', 'Massenstart'],
    load: 'locker', zone: 'Z2-3', needs: ['openwater'], swimMin: 200 },
  // ---------- Triathlon ----------
  { key: 'tri.brick', sport: 'tri', name: 'Koppeleinheit', purpose: 'Rad und Lauf direkt hintereinander: der Wechsel wird zur Gewohnheit.', level: 'beginner', phases: ['build', 'specific'], goals: TRI,
    example: 'lange Ausfahrt + 10-20 min Lauf', structure: 'Nach der Ausfahrt ohne Pause loslaufen, die ersten Minuten im Wettkampftempo, dann locker.', stages: ['10 min', '15 min', '20 min'], load: 'mittel', zone: 'Z2-3' },
  { key: 'tri.transition', sport: 'tri', name: 'Wechsel-Training', purpose: 'Wechselzone, Neopren aus, Helm und Schuhe – Sekunden, die man nicht trainieren muss, verliert man.', level: 'beginner', phases: ['specific'], goals: TRI,
    example: '5× Wechsel üben', structure: 'Wechselplatz aufbauen, mehrmals Neopren aus, Helm, Radschuhe, Laufschuhe – erst langsam, dann zügig.', stages: ['3 Wechsel', '5 Wechsel'], load: 'locker', zone: '–' },
  { key: 'tri.rehearsal', sport: 'tri', name: 'Wettkampf-Generalprobe', purpose: 'Schwimmen, Rad und Laufen hintereinander wie im Rennen, mit Wechseln und Verpflegung.', level: 'advanced', phases: ['specific'], goals: TRI,
    example: 'verkürzte Distanz im Renntempo', structure: 'Höchstens 2-3 pro Saison, 3-5 Wochen vor dem Rennen; unter 16 nicht als Dreifach-Tag.', stages: ['1 Generalprobe'], load: 'hart', zone: 'Z3' },
  { key: 'tri.fueling', sport: 'tri', name: 'Verpflegungs-Übung', purpose: 'Der Magen lernt die Wettkampf-Verpflegung.', level: 'beginner', phases: ['build', 'specific'], goals: ['olympic', 'middle', 'long', 'marathon', 'bike'],
    example: '60-90 g Kohlenhydrate pro Stunde in langen Einheiten', structure: 'In langen Einheiten genau die geplante Wettkampf-Verpflegung nach Zeitplan essen und trinken.', stages: ['30 g/h', '60 g/h', '90 g/h'], load: 'locker', zone: '–' }
];
export const LIB: Record<string, WorkoutDef> = Object.fromEntries(WORKOUTS.map(w => [w.key, w]));

/* Ziel des Plans → Gruppe der Bibliothek */
export function libGoal(t: string | null | undefined): LGoal {
  return ({ run_5k: '5k', run_10k: '10k', run_half: 'half', run_marathon: 'marathon', tri_supersprint: 'sprint', tri_sprint: 'sprint', tri_olympic: 'olympic', tri_middle: 'middle', tri_long: 'long',
    bike_event: 'bike', swim_goal: 'swim', fitness: 'fitness', duathlon: 'duathlon', aquathlon: 'aquathlon' } as Record<string, LGoal>)[t || ''] || 'fitness';
}
const LV: Record<LLevel, number> = { beginner: 0, advanced: 1, experienced: 2 };

/* ---------- Auswahl (Generator) ---------- */
export interface PickOpts {
  phase: LPhase; goal: string | null; level: LLevel;
  /** unter 18 oder ab 60: keine Zone 5, harte Formen dosierter, „Erfahren“-Einheiten nur mit nachgewiesener Grundlage */ noZ5?: boolean; provenBase?: boolean;
  /** Gelände und Ausrüstung (aus dem Profil: Hügel, Bahn, Rolle; Schwimm-Hilfsmittel) */ terrain?: { hills?: boolean | null; track?: boolean | null; trainer?: boolean | null } | null; gear?: string[];
  /** Beschwerden */ excludes?: LExclude[];
  /** Schwimmen: Kraul am Stück (m) */ swimCont?: number | null;
}
/* Ist die Form für diese Person erlaubt? (Niveau, Phase, Ziel, Gelände/Ausrüstung, Beschwerden, Alter) */
export function allowed(d: WorkoutDef, o: PickOpts): boolean {
  if (LV[o.level] < LV[d.level]) return false;
  if (d.level === 'experienced' && o.noZ5 && !o.provenBase) return false;
  if (d.goals !== 'all' && !d.goals.includes(libGoal(o.goal))) return false;
  if (o.noZ5 && d.z5 && d.sport !== 'swim') return false;
  if ((d.excludes || []).some(x => (o.excludes || []).includes(x))) return false;
  if (d.swimMin && (o.swimCont ?? 0) < d.swimMin) return false;
  for (const n of d.needs || []) {
    if (n === 'hills' && !(o.terrain && o.terrain.hills)) return false;
    if (n === 'track' && !(o.terrain && o.terrain.track)) return false;
    if (n === 'trainer' && !(o.terrain && o.terrain.trainer)) return false;
    if ((n === 'buoy' || n === 'board' || n === 'paddles') && !(o.gear || []).includes(n)) return false;
    if (n === 'openwater') return false;
  }
  return true;
}
/* Ersatz, wenn Gelände oder Ausrüstung fehlen (z. B. Hügelsprints → Steigerungen) */
export function resolve(key: string, o: PickOpts, depth = 0): string | null {
  const d = LIB[key]; if (!d) return null;
  if (allowed(d, o)) return key;
  if (d.alt && depth < 3) return resolve(d.alt, o, depth + 1);
  return null;
}
/* Reihenfolge der Qualitätsformen je Sportart, Phase und Ziel. Ein Eintrag mit „|“ ist eine Untergruppe, die selbst reihum geht
   (z. B. kurze Intervalle: VO2max, 30/30, Pyramide, Berg-Intervalle). So wechseln sich die Formen ab: höchstens 2 gleiche Wochen hintereinander,
   2-3 Formen je Block, und jede Form steigt mit jeder Wiederholung eine Stufe. */
// kurze Intervalle; unter 18 und ab 60 (keine Zone 5) dafür Tempowechsel oder Progression
const SHORT = 'run.vo2|run.3030|run.pyramid|run.hillreps|run.fartlek|run.progression';
export function rotation(sport: 'run' | 'bike' | 'swim', phase: LPhase, goal: LGoal): string[] {
  if (sport === 'run') {
    if (phase === 'recovery') return ['run.strides', 'run.abc'];
    if (phase === 'base') return ['run.strides', 'run.hillsprints', 'run.fartlek', 'run.abc', 'run.progression'];
    if (phase === 'taper') return ['run.racepace'];
    if (phase === 'build') {
      if (goal === '5k') return ['run.vo2|run.fartlek', 'run.threshold', 'run.speed|run.3030|run.progression', 'run.vo2|run.fartlek', 'run.hillreps|run.pyramid|run.progression'];
      if (goal === '10k') return ['run.threshold', 'run.vo2|run.fartlek', 'run.threshold', 'run.pyramid|run.hillreps|run.3030|run.progression'];
      if (goal === 'sprint' || goal === 'aquathlon') return ['run.vo2|run.fartlek', 'run.threshold', 'run.3030|run.hillreps|run.progression'];
      if (goal === 'fitness') return ['run.fartlek', 'run.progression', 'run.3030|run.pyramid', 'run.threshold'];
      if (goal === 'marathon' || goal === 'long') return ['run.threshold', 'run.tempo', 'run.longhills|' + SHORT];
      // Halbmarathon, Olympisch, Mitteldistanz, Duathlon: Schwellenläufe (3×8 → 3×10 → 2×15 → 20-25 min am Stück), alle 2-3 Wochen kurze Intervalle
      return ['run.threshold', 'run.threshold', SHORT + '|run.longhills'];
    }
    // spezifisch: Wettkampftempo der Zieldistanz
    if (goal === '5k') return ['run.vo2|run.threshold', 'run.speed|run.3030|run.fartlek', 'run.racepace'];
    if (goal === '10k' || goal === 'sprint' || goal === 'olympic' || goal === 'duathlon' || goal === 'aquathlon') return ['run.racepace', 'run.vo2|run.fartlek', 'run.racepace', 'run.threshold'];
    if (goal === 'fitness') return ['run.progression', 'run.threshold', 'run.fartlek'];
    return ['run.racepace', 'run.racepace', 'run.threshold'];
  }
  if (sport === 'bike') {
    if (phase === 'recovery') return ['bike.cadence'];
    if (phase === 'base') return ['bike.sweetspot', 'bike.force', 'bike.sweetspot', 'bike.sprints|bike.cadence'];
    if (phase === 'taper') return ['bike.threshold', 'bike.vo2'];
    if (phase === 'build') {
      if (goal === 'bike') return ['bike.threshold', 'bike.climb', 'bike.sweetspot', 'bike.vo2'];
      // Sweet Spot → Schwelle → Over-Unders → VO2max kurz und niedrige Kadenz am Berg/Rolle, im Wechsel
      return ['bike.sweetspot', 'bike.threshold', 'bike.overunder', 'bike.vo2', 'bike.force|bike.climb'];
    }
    if (goal === 'bike') return ['bike.climb', 'bike.racepaceblocks', 'bike.threshold', 'bike.vo2|bike.sweetspot'];
    if (goal === 'middle' || goal === 'long') return ['bike.tempolong|bike.racepaceblocks', 'bike.sweetspot', 'bike.threshold', 'bike.overunder|bike.force'];
    return ['bike.vo2|bike.sweetspot', 'bike.threshold', 'bike.overunder', 'bike.tt|bike.3015|bike.sweetspot'];
  }
  // Schwimmen: in einer von zwei Einheiten pro Woche ein kurzer harter Teil (passend zur Strecke am Stück)
  if (phase === 'recovery') return ['swim.drills'];
  if (phase === 'base') return ['swim.fast', 'swim.fast|swim.pyramid'];
  if (phase === 'taper') return ['swim.broken|swim.css|swim.threshold|swim.fast'];
  if (phase === 'build') return ['swim.css|swim.threshold|swim.fast', 'swim.threshold|swim.fast', 'swim.descend|swim.pyramid|swim.fast'];
  return ['swim.css|swim.threshold|swim.fast', 'swim.broken|swim.threshold|swim.fast', 'swim.racestart|swim.descend|swim.fast'];
}
/* n-te Qualitätseinheit dieser Sportart in der Phase → Form und Stufe. Die Stufe zählt, wie oft die Form vorher dran war (Leiter). */
export interface Pick { key: string; stage: number }
export function pickQuality(sport: 'run' | 'bike' | 'swim', n: number, o: PickOpts): Pick | null {
  const g = libGoal(o.goal);
  const rot = rotation(sport, o.phase, g);
  if (!rot.length) return null;
  // erlaubte Form je Platz (Untergruppen reihum), dann Stufe = Zahl der früheren Einsätze derselben Form
  const at = (i: number): string | null => {
    const slot = rot[i % rot.length]; const subs = slot.split('|');
    const round = Math.floor(i / rot.length);
    for (let k = 0; k < subs.length; k++) { const key = resolve(subs[(round + k) % subs.length], o); if (key) return key; }
    return null;
  };
  let key: string | null = null; let idx = n;
  for (let t = 0; t < rot.length && !key; t++, idx++) key = at(idx);
  if (!key) return null;
  let stage = 0; for (let i = 0; i < idx - 1; i++) if (at(i) === key) stage++;
  const d = LIB[key];
  // Einsteiger: beginnen mit der kürzesten Stufe und steigen langsamer (höchstens bis zur dritten); unter 18/ab 60: höchstens die Mitte der Leiter.
  // Oben angekommen wechseln sich die obersten zwei erlaubten Stufen ab (nie zweimal genau dieselbe Einheit hintereinander)
  const top = d.stages.length - 1;
  let raw = o.level === 'beginner' ? Math.floor(stage / 2) : stage;
  const cap = Math.min(top, o.level === 'beginner' ? 2 : top, o.noZ5 ? Math.max(0, Math.floor(top / 2)) : top);
  if (cap < top && raw > cap) raw = cap > 0 && (raw - cap) % 2 === 1 ? cap - 1 : cap;
  return { key, stage: cap < top ? raw : ladderIndex(top + 1, raw) };
}
/* Stufe einer Leiter: steigt mit jeder Einheit; oben angekommen wechseln sich die letzten Stufen ab (nie zweimal genau gleich) */
export function ladderIndex(n: number, lvl: number): number { if (lvl < n) return Math.max(0, lvl); const k = Math.min(3, n); return n - k + ((lvl - n) % k + 1) % k; }

/* Belastung einer Form; Schwimm-Intervalle für Lernende zählen nur halb (Auftrag 19, Punkt 1b) */
export function loadOf(key: string | null | undefined): LLoad | null { return key && LIB[key] ? LIB[key].load : null; }
