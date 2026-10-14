/* „Neu in dieser Version“ (Auftrag 5 E6): nach einem Update einmal 2-3 Punkte, damit Tester wissen, was sie ausprobieren sollen. */
export const WHATS_NEW: { version: string; items: string[] }[] = [
  { version: '2.5.0', items: [
    'Oben im Plan siehst du jetzt deine Zeitleiste: Phasen und Ziele bis zum Hauptziel. Ziele ohne Datum bekommen einen Platzhalter-Termin.',
    'Der Plan arbeitet in Zyklen auf deine Zwischenziele hin: Grundlage, Aufbau, wettkampfspezifisch, Tapering, Wettkampf, Erholung.',
    'Schwimmen: Trag nach jeder Einheit die längste Strecke Kraul am Stück ein (oder sag dem Coach „ich schaffe jetzt 100 m Kraul am Stück“). Alle kommenden Schwimmeinheiten passen sich an.'
  ] },
  { version: '2.4.0', items: [
    'Unter jeder Woche im Plan steht jetzt der Umfang und die Steigerung zur letzten Aufbauwoche.',
    'Neue Tests: Radtest (20 min, drinnen oder draußen) und Schwimmtest (Kraul-Check). Die App übernimmt die Werte automatisch in Zonen, Watt und Technik-Stufe.',
    'Der Plan knüpft an deine letzte Aufbauwoche an und steigt danach Woche für Woche.'
  ] },
  { version: '2.3.0', items: [
    'Felder statt Notizfeld: Bei jeder Einheit trägst du Werte direkt ein (Pace, Puls, Kadenz, Watt, Schwimm-Technik …). Uhr und intervals.icu füllen sie automatisch, alte Notizen sind schon übertragen.',
    'Frag den Coach „Was genau soll ich heute machen?“: Er erklärt die Einheit Schritt für Schritt mit deinen Pulswerten. Unter Coach siehst du außerdem, was der Coach gerade in deinen Daten sieht.',
    'Dein Plan geht weiter, auch nach dem Fragebogen: Wochen, Scores und Verlauf bleiben.'
  ] },
  { version: '2.2.0', items: [
    'Dein Plan hält sich an deine Tage: Unter Mehr → Berücksichtigungen gibt es ein Wochenraster (geht / lieber nicht / geht nicht). Sätze wie „mittwochs kein Laufen, nur Sa oder So“ versteht die App und zeigt dir, was sie verstanden hat.',
    'Der Coach-Chat versteht mehr und ändert den Plan auf Zuruf: „Ich hab Mittwoch keine Zeit“, „Mach den Lauf kürzer“, „Ich bin krank“, „Urlaub vom 20.12. bis 6.1.“ – mit Vorschau und Rückgängig.',
    '„Fehler melden / Idee“ kommt jetzt sicher an, auch ohne Verbindung. Du siehst, wenn Jonah antwortet.'
  ] }
];
/* Punkte für ein Update von `seen` auf `current` (nur Versionen dazwischen) */
export function newsSince(seen: string | null | undefined, current: string): { version: string; items: string[] } | null {
  if (!seen || seen === current) return null;
  const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const list = WHATS_NEW.filter(w => cmp(w.version, seen) > 0 && cmp(w.version, current) <= 0).sort((a, b) => cmp(b.version, a.version));
  return list.length ? { version: list[0].version, items: list.flatMap(w => w.items).slice(0, 3) } : null;
}
