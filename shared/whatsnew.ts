/* „Neu in dieser Version“ (Auftrag 5 E6): nach einem Update einmal 2-3 Punkte, damit Tester wissen, was sie ausprobieren sollen. */
export const WHATS_NEW: { version: string; items: string[] }[] = [
  { version: '3.13.2', items: [
    'Neues App-Icon: eine Welle, die in einen Bogen nach oben übergeht, mit dem Ziel als orangem Punkt. Das iPhone zeigt es erst, wenn du die App neu zum Home-Bildschirm hinzufügst. So geht nichts verloren: neue App in Safari hinzufügen, dort mit deinem Konto verbinden (in der alten App Mehr → Konto → „Gerät hinzufügen“, Code in der neuen eingeben), erst dann das alte Icon löschen.'
  ] },
  { version: '3.13.1', items: [
    'Mitteilungen gehen jetzt: Mehr → Einstellungen → Mitteilungen → „Mitteilungen erlauben“ (auf dem iPhone in der App vom Home-Bildschirm). Ein Fehler hatte das bisher verhindert.',
    'Die App startet jetzt auch ohne Internet vom Home-Bildschirm und zeigt „Neue Version“, wenn es ein Update gibt.',
    'Verbindungen stehen jetzt unter Einstellungen. Der alte Plan-Generator ist weg: Den Plan erstellt der Fragebogen, Änderungen am Profil planen automatisch neu.'
  ] },
  { version: '3.13.0', items: [
    'Mehr ist neu sortiert wie die iPhone-Einstellungen: Suche oben, deine Profilkarte mit Bild, dann Konto, Training, Verbindungen, Einstellungen, Daten und Datenschutz, Hilfe und Über. Nichts ist weggefallen, nur besser einsortiert. Zurück-Wischen bringt dich zur Liste.',
    'Der KI-Coach bekommt nur noch die Daten, die zur Frage passen: schnellere und genauere Antworten. Er beachtet eine eingetragene Krankheit, ändert nur das Training und den Tag, die du nennst, und schreibt nichts als erledigt, was erst ein Vorschlag ist.',
    'Der Regel-Coach versteht Daten wie „auf den 3.11“ und „den Lauftest“ und schreibt ohne doppelte Punkte und Floskeln.'
  ] },
  { version: '3.12.0', items: [
    'Tab-Leiste wie in iOS 26: eine einzige Glas-Linse, die mit Feder gleitet, sich beim schnellen Ziehen dehnt und weich am nächsten Tab einrastet. Antippen gleitet ebenso, ohne Ruckeln beim Wechsel.',
    'Prognose: „Erwartet am Wettkampftag“ rechnet jetzt immer mit deiner Entwicklung bis dahin – ohne viele eigene Daten mit typischen Fortschritten (nach Niveau, Alter, Sportart, Umfang), mit mehr Daten zählt dein eigener Trend mehr. „Warum?“ sagt, woraus die Hochrechnung stammt.',
    'Prognosen nur für deine Sportarten: Passt ein Ziel nicht dazu (z. B. Triathlon ohne Laufen), steht beim Ziel ein kurzer Hinweis statt einer Prognose.'
  ] },
  { version: '3.11.0', items: [
    'Fortschritt: eine eigene Prognose für jedes Ziel (das nächste zuerst, Platzhalter-Termine gekennzeichnet), heute und am Wettkampftag, mit „Zuletzt aktualisiert“ und „Warum?“. Ziele in über einem Jahr zeigen einen ehrlichen Bereich (z. B. „ca. 11–13 h, wenn du den Plan durchziehst“); Einsteiger, Schwimm-Technik und Jugendliche entwickeln sich in der Rechnung jetzt realistisch schneller.',
    'Wunschzeit: je Disziplin, was nötig wäre und was die Prognose sagt, ob sie realistisch, ambitioniert oder sehr unwahrscheinlich ist, der größte Hebel und Pacing passend zur Wunschzeit. Der Plan ändert sich dadurch nicht – nur wenn du „Plan auf Wunschzeit ausrichten“ (mit Vorschau) bestätigst.',
    'Alle Bereiche im Fortschritt lassen sich einklappen (die App merkt es sich). Tab-Leiste: gedrückt halten oder über die Leiste wischen zeigt eine Glas-Linse, die dem Finger folgt; loslassen öffnet den Tab.'
  ] },
  { version: '3.10.0', items: [
    'Neu: Intervalle eintragen und auswerten. Unter den Werten jeder Intervall-Einheit steht die geplante Liste (z. B. 2×10 min Sweet Spot) mit Dauer, Puls, Pace oder Watt, Kadenz, RPE und Pause. Werte der Uhr (Runden, intervals.icu oder der Puls-Verlauf) stehen automatisch drin, von Hand Eingetragenes gilt. Kleine Balken zeigen je Intervall: im Ziel, zu hart oder zu locker.',
    'Der Coach bewertet die Intervalle (gleichmäßig, Pulsanstieg, Erholung in den Pausen, Vergleich mit derselben Einheit vor 2-4 Wochen) und gibt die nächste Stufe nur frei, wenn die Ist-Werte passen. Unmögliche Werte (z. B. Puls 300 oder 200 km in 30 min) werden freundlich abgelehnt oder hinterfragt.',
    'Mehr Sicherheit: Änderungen am iPhone und am PC an derselben Einheit gehen nicht mehr verloren, die App rechnet in deiner Zeitzone (auch auf Reisen), größere Schrift aus den iPhone-Einstellungen wirkt jetzt, und Farben haben mehr Kontrast.'
  ] },
  { version: '3.9.0', items: [
    'Neu: „Jetzt abrufen“ bei jeder Verbindung und in jeder Einheit – mit klarer Rückmeldung, ob eine Aufzeichnung gefunden und eingetragen wurde. Frühere Workouts (bis 12 Monate) kommen einmalig dazu und machen die Scores genauer.',
    'Mehr Werte unter „Weitere Werte“ (z. B. Höhenmeter, Temperatur, Schuh, Normalized Power, Verpflegung, Puls und Brust-Tempo beim Schwimmen, Sprints). Scores zählen jetzt alle Einheiten des letzten Jahres, ältere mit weniger Gewicht; von Hand Eingetragenes zählt wie von der Uhr.',
    'Schwimmen: Hilfsmittel stehen an jeder Einheit, Kickbrett und Pull Buoy im Wechsel, Tempo-Vorgaben aus deinem echten Tempo je Lage. Kraul und Pull Buoy werden gleich bewertet, jede Coach-Meldung kommt nur noch einmal, und Vorschläge zeigen klar, was von wann nach wann geht.'
  ] },
  { version: '3.8.0', items: [
    'Plan mit Trainingsdashboard zum Einklappen. Einheiten bleiben direkt abhakbar; Verschieben und Tauschen funktionieren ueber mehrere Wochen.',
    'Trainingsvorlagen fuer Schwimmen, Rad, Laufen und Kraft: Vorschau, Ersetzen oder Ergaenzen bestehender Einheiten und neue Einheiten aus Vorlagen.',
    'Extraeinheiten direkt mit allen Werten erfassen, Kraft ohne Kilometer. Wiederholen fehlgeschlagener Speicherungen behaelt neue Eintraege.'
  ] },
  { version: '3.7.2', items: [
    'Speichern wird erst nach bestaetigtem Browserspeicher abgeschlossen. Nicht gespeicherte Aenderungen bleiben sichtbar; fehlgeschlagene Lesevorgaenge ersetzen keine vorhandenen Daten.',
    'Backups werden vor dem Wiederherstellen geprueft. Der vorherige Stand bleibt als Rueckfallkopie erhalten.',
    'Verschobene Einheiten behalten Beschreibung und Werte. Veraltete Tagesverweise werden entfernt; absolvierte Einheiten bleiben geschuetzt.'
  ] },
  { version: '3.7.1', items: [
    'Heute und Coach verwenden dieselbe aktuelle Trainingsampel. Vor einer KI-Frage werden neue Einträge synchronisiert; ohne Verbindung antwortet der Regel-Coach mit den Daten auf deinem Gerät.',
    'Neuplanung schützt vergangene und bereits erledigte Einheiten. Beim Verlängern des Plans werden auch die Abstände zur vorherigen Woche berücksichtigt.',
    'Manuelle Messkorrekturen werden vollständiger übernommen. Die Auswertung großer Trainingshistorien ist schneller.'
  ] },
  { version: '3.7.0', items: [
    'Scores zuverlässiger: Watt zählen nur von Wattmesser oder Smart-Trainer, die Geschwindigkeit von der Rolle zählt nie, Laufband weniger, GPS-Fehler gar nicht. Jeder Score startet vorsichtig, steht als „vorläufig“ da, bis 5 brauchbare Einheiten oder ein Test da sind, und bewegt sich ohne Test höchstens etwa 3 Punkte pro Woche. „Warum?“ zeigt je Einheit, ob sie gezählt hat.',
    'Neue Frage unter Mehr → Berücksichtigungen: Rolle mit Watt (Smart-Trainer) oder einfache Rolle.',
    'Schwimmen dauert im Plan so lange wie bei dir wirklich (dein Tempo, Pausen, Technik). In der Grundlage wechseln sich Steigerungen und Hügelsprints ab, Koppelläufe sind kurz (10-15 min) und Teamsport wie Fußball zählt bei den Läufen halb.'
  ] },
  { version: '3.6.1', items: [
    'Plan-Tab neu: oben ein Balken pro Tag, darunter jeder Tag als Zeile. Heute ist aufgeklappt, andere Tage klappst du mit einem Tipp auf; unter jeder Einheit steht kurz, was du machen sollst.',
    'Auf Heute: „Ich bin krank“ und „Schmerzen / verletzt“ direkt sichtbar. Krank pausiert den Plan sofort, bei Schmerzen fragt der Coach wo und wie stark und plant danach schonender.'
  ] },
  { version: '3.6.0', items: [
    'Scores neu: Jeder Wert ist jetzt eine laufende Schätzung mit Bereich (z. B. ± 3). Tests und harte Einheiten zählen am meisten, fehlende Werte sind unbekannt statt schlecht, und nach einer Pause sinkt der Wert nur langsam. „Warum?“ zeigt die letzten Einheiten mit + und −.',
    'Mehr Abwechslung und Steigerung: Einheiten kommen aus einer Bibliothek (Mehr → Lexikon → Einheiten, mit Bild), werden nur schwerer, wenn die letzte geklappt hat, und jede Sportart bekommt regelmäßig Qualität – auch Schwimmen.',
    'Plan nach neuen Regeln: genug Läufe vor Laufzielen, Ruhetage auch mit Teamsport (mindestens alle 2 Wochen), Tempo im langen Lauf nur jede 2. Woche. Neue Frage: Hügel oder Laufbahn in der Nähe?'
  ] },
  { version: '3.5.0', items: [
    'Plan nach festen Trainingsregeln: mindestens ein Ruhetag pro Woche, nach einem langen Tag kein langer oder harter Lauf, vor einem Laufziel jede Woche ein Lauf im Wettkampftempo, in der Wettkampfwoche keine Kraft und nach dem Wettkampf erst mal locker. Frag den Coach „Warum habe ich heute frei?“.',
    'Plan-Tab aufgeräumt: Die Wochenleiste bleibt bei der gewählten Woche, „Heute“ springt zurück. Jede Woche zeigt eine Zeile (Phase, Ziel, Stunden) und die 7 Tage mit Ruhetagen; Details beim Antippen.',
    'Der Coach nennt Ursachen nur noch, wenn deine Daten sie zeigen. Neu im Lexikon: „Training verstehen“ (Schmerz, Pause, Krankheit, Schlaf, Hitze, Technik-Übungen).'
  ] },
  { version: '3.4.0', items: [
    'Ehrlich gezählt: Fortschritt, Bestwerte und Schwimm-Stufen kommen nur noch aus dem, was du eingetragen hast oder die Uhr gemessen hat, nie aus dem Plan. Korrigierst du einen Wert, rechnet die App alles neu und sagt „Korrigiert: …“. Die nächste Kraul-Stufe kommt, wenn du sie in 2 Einheiten geschafft hast.',
    'Plan in Balance: höchstens 2 harte Einheiten pro Woche plus Spiel, keine drei Termine an einem Tag, der lange Lauf bleibt locker und wächst von dem, was du wirklich gemacht hast. Einheiten haben klare Namen (z. B. „Lauf-Intervalle 6×1 min zügig“).',
    'Alle Fachbegriffe stehen jetzt unter Mehr → Lexikon, nach Themen und mit Suche. In den Ansichten führt ein unterstrichener Begriff direkt dorthin.'
  ] },
  { version: '3.3.0', items: [
    'Neu: Der Coach kann deine Fragen mit einer KI beantworten, kostenlos. Einmal kurz zustimmen (unter 16 mit Eltern), abschaltbar unter Einstellungen. Zahlen und Planänderungen kommen weiter aus der App, Änderungen gelten erst nach deinem OK. Werte von Oura bekommt die KI nie.',
    "Trainingsbewertung: Automatische Runden der Uhr (z. B. jeder Kilometer) zählen nicht mehr als Intervalle. Die App erkennt Dauerlauf, Intervalle, Fahrtspiel, Hügel und „ab km 8 schneller geworden“ und vergleicht mit dem Plan."
  ] },
  { version: '3.2.0', items: [
    'Dein Plan enthält nur noch die Sportarten, die du gewählt hast. Dieselbe Sportart liegt nicht mehr an zwei Tagen hintereinander; geht es nicht anders, ist eine Einheit locker und kurz und sagt, warum.',
    'Verbinden geht jetzt für alle: Tipp bei Oura, Dropbox oder intervals.icu auf „Verbinden“, die App legt dabei ein privates Konto für dich an. Erholungswochen sind spürbar leichter.',
    'Fachbegriffe wie Schwelle, Sweet Spot oder HFV sind kurz erklärt.'
  ] },
  { version: '3.1.0', items: [
    'Die Ampel auf „Heute“ zeigt jetzt einen klaren Wert: Ring, Wort, Farbe und Satz passen immer zusammen. Unter „Warum?“ hat jeder Einzelwert seine eigene Farbe. Fehlen die Morgenwerte, steht dort „Ampel unsicher“. Neu: Gefühl und Muskelkater am Morgen eintragen.',
    'Schwimmen ehrlich gerechnet: Meter und Dauer passen zu deinem Tempo, mit Pausen. Jede Einheit als Liste (Einschwimmen, Technik, Hauptteil, Ausschwimmen) mit erklärten Übungen. Trag unter Berücksichtigungen deine Hilfsmittel ein (Kickbrett, Pull Buoy …).',
    'Der Plan hat jetzt feste Regeln für harte Einheiten: passend zu Ziel, Phase, Niveau und Alter, nie zwei harte Tage hintereinander, Intervalle steigen von Woche zu Woche.'
  ] },
  { version: '3.0.0', items: [
    'Neues Design „Glas“: Karten wie Glas über einem weichen Farbverlauf, die Tab-Leiste schwebt unten, große Zahlen, Knöpfe, die beim Drücken federn. Hell und dunkel, mit „Bewegung reduzieren“ und „Transparenz reduzieren“ aus den iPhone-Einstellungen.',
    'Unter Fortschritt gibt es jetzt Trends (Erholung, Fitness, Effizienz, locker/hart, Schwimmen, Bestwerte), je mit einem Satz, was sie bedeuten.',
    'Selbst hinzugefügte Einheiten bekommen die Daten deiner Uhr automatisch, und Verbindungen zeigen klar, was los ist.'
  ] },
  { version: '2.9.0', items: [
    'Neue Trends unter Fortschritt: Erholung (HFV, Ruhepuls, Schlaf), Fitness und Belastung, Effizienz (Pace bzw. Watt bei gleichem Puls), locker/hart, Schwimmen, Bestwerte und lange Einheiten. Zeitraum 4 Wochen, 3 Monate oder 1 Jahr, jeder Trend mit einem Satz, was er bedeutet.',
    'Selbst hinzugefügte Einheiten bekommen die Daten deiner Uhr (HealthFit, intervals.icu) automatisch, ohne doppelte Einheiten. Eine harte Extra-Einheit prüft den nächsten harten Tag, eine zu volle Woche bekommt einen Entlastungs-Vorschlag.',
    'Verbindungen zeigen jetzt klar: verbunden oder Fehler mit Grund, letzte Datei, letzter Abruf und „Jetzt abrufen“.'
  ] },
  { version: '2.8.0', items: [
    'Neue Score-Skala: 20 Einsteiger, 50 solider Hobbysportler, 70 stark, 85 Spitzenamateur, 100 Elite (nach Alter und Geschlecht bereinigt). Statt „Ziel“ siehst du „Für dein Ziel nötig“, dein nächstes Etappenziel und die Wunschzeit. Antippen zeigt, was zählt und was am meisten bringt.',
    'Prognose für heute und für den Wettkampftag, mit Ausdauer, Rad-Physik, Strecke und Pacing-Plan. Nach einem Rennen Ergebnis eintragen, dann lernt sie dazu. Rad-Zonen gibt es jetzt auch in km/h.',
    'Frag den Coach „Wie war mein Lauf?“ oder „Wie war meine Woche?“: Er sagt, was gut war, was besser geht und was das für die nächsten Tage heißt, auch automatisch nach jeder Einheit.'
  ] },
  { version: '2.7.0', items: [
    'Änderungen gelten sofort: Fragebogen, Profil, Berücksichtigungen und Coach passen den Plan ab heute an (ab 18 Uhr ab morgen). Erledigtes und Vergangenes bleibt.',
    'Ein Wochenraster für die Zeit: pro Tag die Zeit und welche Sportart geht. Stunden, längster Tag und Häufigkeit rechnet die App daraus.',
    'Schwimmen passt besser: wer kraulen kann, trainiert normal (Stücke nach der Strecke am Stück), dazu Beckenlänge und Freiwasser. Teamsport ohne Spiele hat keine Spieltage mehr.'
  ] },
  { version: '2.6.0', items: [
    'Mehr Abwechslung: Die Schlüsseleinheiten steigern sich (Sweet Spot, Kraftausdauer, Schwelle, Over-Unders, VO2max), die lange Ausfahrt und das Schwimmen haben jede Woche einen anderen Schwerpunkt.',
    'Laufen mit Qualität: in der Grundlage Hügelsprints und Fahrtspiel, im Aufbau Schwelle, vor dem Wettkampf Wettkampftempo.',
    'Nach jedem Wettkampf erst ein paar lockere Tage, je nach Distanz. Im Plan ragt der Wochenkopf nicht mehr heraus.'
  ] },
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
