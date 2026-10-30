# Trainingsregeln

Diese Regeln gelten für jeden Plan und alle Nutzer. Der Generator hält sie ein, der Plan-Check korrigiert jeden neuen oder geänderten Plan, bevor man ihn sieht, und der Coach kennt sie. Die Datei entsteht aus `shared/trainingknowledge.ts` (`npx vite-node scripts/trainingsregeln.ts`).

Markierung: **war schon da** / **verbessert** / **neu** (Stand Auftrag 18).

## Belastung und Erholung

### Ruhetage (verbessert)

Mindestens 1 echter Ruhetag pro Woche (kein Training, höchstens Mobility). Unter 18 und Einsteiger 2, wenn die festen Termine es zulassen. Teamsport-Tage zählen als Trainingstage. Der Ruhetag liegt möglichst jede Woche am selben Tag, gern zwischen harten Tagen oder vor einem Spiel. Auftrag 19: Geht mit Teamsport ein Ruhetag pro Woche nicht ohne Schlüsseleinheiten zu verlieren, dann mindestens alle 2 Wochen einer und in jeder Erholungswoche zwei; der Coach erklärt das einmal.

- Warum: Im Ruhetag passt sich der Körper an; ohne ihn steigt das Risiko für Überlastung. Für Jugendliche empfiehlt die AAP 1-2 freie Tage pro Woche.
- Quelle: American Academy of Pediatrics (AAP), Bericht zu Überlastungsverletzungen bei Jugendlichen; ACSM-Empfehlungen
- Umgesetzt: Plan-Check (Ruhetag-Korrektur): lockere Einheit verschieben, sonst weglassen (Prüfung „restDay“)

### Jugendliche: Stunden pro Woche (neu)

Unter 18 nie mehr Stunden Training pro Woche als das Alter in Jahren (Teamsport zählt mit). Die Kürzung wird so oft wiederholt, bis die Grenze hält, auch am Ende aller Plan-Korrekturen; lässt sich nichts mehr kürzen, fällt eine Kraft-Einheit weg, nie eine Ausdauer-Einheit.

- Warum: Faustregel gegen Überlastung im Wachstum.
- Quelle: AAP (Brenner u. a.), Sport-Spezialisierung bei Jugendlichen
- Umgesetzt: Plan-Check kürzt die eigenen Einheiten (Prüfung „teenHours“)

### Lange Tage nicht hintereinander (neu)

Nach einem Tag mit langer Einheit plus Koppellauf oder mit über 2,5 h Training folgt kein langer oder harter Lauf, sondern Ruhe, Lockeres und Kurzes oder Schwimmen. Lange Ausfahrt am Samstag und langer Lauf am Sonntag ist erlaubt – dann ohne Koppel am Samstag und ohne Tempo am Sonntag. In Koppel-Wochen ist der Sonntag locker und kürzer (etwa 2/3 des langen Laufs). Koppellauf bei Triathlon-Zielen ab dem Aufbau etwa jede 3. Woche, 10-15 min (Auftrag 20). Steht am Tag danach ein Test oder der Qualitätslauf vor dem Laufziel, wird der große Tag kleiner.

- Warum: Zwei lange oder harte Tage hintereinander summieren die Ermüdung; der Lauf am zweiten Tag hat das höchste Verletzungsrisiko.
- Quelle: Trainingslehre Ausdauer (Belastung–Erholung), Triathlon-Trainingspraxis
- Umgesetzt: Plan-Check (Tag danach locker und kürzer) (Prüfung „bigDayNext“)

### Höchstens 2 Sportarten pro Tag (verbessert)

Höchstens 2 Sportarten an einem Tag; ein Koppellauf zählt als Laufen. Dreifach-Tage nur als Wettkampf-Simulation (spezifische Phase, höchstens 2-3 pro Saison, ab 16).

- Warum: Mehr als zwei Einheiten an einem Tag lassen kaum Erholung und passen selten in den Alltag.
- Quelle: Trainingspraxis Triathlon
- Umgesetzt: Plan-Check (Einheit an einen anderen Tag, sonst Koppellauf weg) (Prüfung „maxSports“)

### Harte Einheiten (war schon da)

Höchstens 2 eigene harte Einheiten pro Woche plus Teamsport-Spiel (Einsteiger 0-1, sehr Erfahrene bis 3). Nie zwei harte Tage hintereinander, nichts Hartes am Tag vor einem Spiel oder Wettkampf. Tests zählen als hart und liegen nie direkt neben einem Spiel oder Wettkampf.

- Warum: Etwa 80 % locker, 20 % hart bringt die meisten Fortschritte bei wenig Risiko (polarisiertes Training).
- Quelle: Seiler (polarisiertes Training), Auftrag 14/17
- Umgesetzt: Generator, Intensitäts- und Plan-Check (Prüfung „hardCount“)

### Mindest-Häufigkeit je Sportart (neu)

Laufziel ab 10 km: mindestens 3 Läufe pro Woche (wenig Zeit: 2; ein Koppellauf zählt halb; Teamsport mit viel Laufen wie Fußball oder Handball zählt je Termin halb, höchstens ein Lauf pro Woche, Auftrag 20). Triathlon: jede Sportart mindestens 2× pro Woche. Muss für den Ruhetag etwas weg, fällt zuerst eine Nebeneinheit (zweite Kraft, kurzes Rad), nie die Hauptsportart des nächsten Ziels. Passt es nicht, steht es ehrlich in der Woche. Eine weitere Einheit gibt es erst, wenn der Wochenumfang der Sportart sie mit sinnvoller Länge trägt (Laufen/Schwimmen 25 min, Rad 30 min, plus 5 min Puffer, damit eine kleine automatische Anpassung die Regel nicht umkippt).

- Warum: Für Anpassungen von Sehnen, Laufökonomie und Technik zählt die Häufigkeit mehr als einzelne lange Einheiten.
- Quelle: Trainingspraxis Lauf und Triathlon (Daniels, Friel); Auftrag 19
- Umgesetzt: Generator und Plan-Check (Nebeneinheit tauschen oder ergänzen) (Prüfung „minFreq“)

### Tempo im langen Lauf (neu)

Tempo-Teil im langen Lauf nur in den letzten 6-8 Wochen vor einem Laufziel, höchstens jede 2. Woche und nie in einer Woche mit einem harten Qualitätslauf.

- Warum: Ein langer Lauf mit Tempo ist eine der härtesten Einheiten; zweimal pro Woche oder jede Woche kostet mehr Erholung als er bringt.
- Quelle: Pfitzinger/Douglas (Advanced Marathoning); Auftrag 19
- Umgesetzt: Generator und Plan-Check (Prüfung „longRunTempo“)

### Schwelle regelmäßig anheben (neu)

Jede Sportart bekommt ihre Qualität aus der Einheiten-Bibliothek: Laufen Grundlage Steigerungen/Hügelsprints/Tempowechsel, Aufbau Schwelle (3×8 → 3×10 → 2×15 → 20-25 min am Stück) mit kurzen Intervallen alle 2-3 Wochen, spezifisch Wettkampftempo; Rad im Wechsel Sweet Spot, Schwelle, Over-Unders, VO2max, niedrige Kadenz; Schwimmen in einer von zwei Einheiten ein kurzer harter Teil (Lernende kurze schnelle 25er). Höchstens 2 harte Einheiten plus Spiel pro Woche; die Sportart mit dem größten Rückstand bekommt öfter Qualität. Eine Stufe höher nur, wenn die letzte laut Messdaten geklappt hat; zweimal nicht geschafft: eine Stufe zurück. Geplante Intervall-Werte zählen nie als geschafft: die nächste Stufe nur, wenn die eingetragenen oder gemessenen Intervalle passen (alle gemacht, keines abgebrochen, mehrheitlich im Zielbereich, Abfall unter 5 %, Erholung in den Pausen mindestens 12 Schläge), und auch dann höchstens eine Stufe weiter.

- Warum: Ohne steigende Reize bleibt die Schwelle stehen; Abwechslung und Steigerung nach Nachweis verhindern Überforderung.
- Quelle: Seiler, Coggan/Allen (Training and Racing with a Power Meter), Swim Smooth (CSS); Auftrag 19
- Umgesetzt: shared/workoutlib.ts, Generator, Wochenanpassung

### Qualität passend zum Ziel (verbessert)

Vor einem Laufziel (z. B. Halbmarathon) in den letzten 7 Wochen jede normale Woche ein Schwellen- oder Wettkampftempo-Lauf, dann ist der Sonntag locker. Ist unter der Woche kein Lauftag ohne harten Nachbartag frei, zieht ein lockerer Lauf auf einen freien Tag (Kraft tauscht oder fällt diese Woche weg); erst wenn das nicht geht, kommt die Qualität in den langen Lauf (höchstens jede 2. Woche), und der Tag davor bleibt ohne lange Ausfahrt. Unter 18 statt Tempowechsel kontrollierte Schwelle. Für Triathlon passende Qualität je Sportart und Phase.

- Warum: Wettkampftempo muss man üben; ohne regelmäßige Qualität bleibt die Form unter den Möglichkeiten.
- Quelle: Daniels’ Running Formula, Pfitzinger; Auftrag 14
- Umgesetzt: Generator und Plan-Check (Prüfung „goalQuality“)

### Lange Einheiten (verbessert)

Lange Einheiten passend zum nächsten Ziel (Halbmarathon höchstens etwa 105 min, später mehr). Der lange Lauf wächst höchstens 10 min pro Woche, die lange Ausfahrt höchstens 15 min, jeweils vom wirklich Gemachten aus.

- Warum: Zu schnelle Steigerung der langen Einheit ist ein häufiger Grund für Überlastung. Rad belastet Sehnen und Gelenke weniger als Laufen, deshalb dort 15 min.
- Quelle: Trainingslehre (10-%-Regel), Auftrag 15/17
- Umgesetzt: Generator und Plan-Check (Prüfung „longCap“)

### Gleiche Sportart nicht an Folgetagen (war schon da)

Dieselbe Sportart nicht an zwei Tagen hintereinander (sonst eine Einheit locker und kurz, mit Begründung). Kraft für die Beine nie am Tag vor oder an einem Spiel, Wettkampf oder langen Lauf.

- Warum: Gleiche Muskeln und Sehnen brauchen 48 h; frische Beine am wichtigen Tag.
- Quelle: Auftrag 15/18
- Umgesetzt: Plan-Regeln (planrules.ts) und Plan-Check (Prüfung „legsStrength“)

### Kraft am Spieltag (neu)

Kraft für den Oberkörper am Spieltag ist okay, aber kurz (höchstens 30 min) und nicht direkt vor dem Spiel. In der Wettkampfwoche keine Kraft.

- Warum: Das Spiel ist die harte Einheit des Tages.
- Quelle: Auftrag 18, Punkt 5
- Umgesetzt: Plan-Check (Prüfung „strengthGameDay“)

### Erholungswochen ohne Intervalle (verbessert)

Alle 3-4 Wochen eine Erholungswoche mit etwa 2/3 des Umfangs. Darin keine Intervalle, nur Tests (höchstens ein harter Test), und kein Test direkt neben einem Spiel.

- Warum: Die Anpassung an das Training passiert in der Erholung; Tests brauchen frische Beine.
- Quelle: Periodisierung (Bompa), Auftrag 17
- Umgesetzt: Generator und Plan-Check (Prüfung „recoveryIntervals“)

### Aufwärmen und Auslaufen (war schon da)

Jede harte Einheit mit mindestens 10-15 min Aufwärmen (mit Steigerungen) und 5-10 min Auslaufen. Lockere Einheiten starten sanft.

- Warum: Bereitet Herz, Muskeln und Sehnen vor und senkt das Verletzungsrisiko.
- Quelle: Trainingslehre
- Umgesetzt: Einheiten-Bausteine (workouts.ts), Plan-Check (Prüfung „warmup“)

## Wettkämpfe und Saison

### Nach dem Wettkampf (verbessert)

Nach 5 km/10 km 3 Tage, nach Halbmarathon und Olympischer Distanz 7 Tage, nach Mittel- und Langdistanz bzw. Marathon 10-14 Tage nur locker und kurz (die ersten 2 Tage höchstens 45 min, danach 60 min), keine lange Ausfahrt direkt danach.

- Warum: Muskeln und Sehnen brauchen nach dem Wettkampf Tage bis Wochen; sonst steigt das Verletzungsrisiko.
- Quelle: Trainingspraxis Lauf/Triathlon
- Umgesetzt: Generator und Plan-Check (Prüfung „afterRace“)

### Wettkampfwoche (neu)

In der Wettkampfwoche keine Kraft und nichts Hartes außer kurzen Aktivierungen (Steigerungen). Ist 1-2 Tage vorher ein festes Teamsport-Spiel, wird die ganze Woche leichter, und der Coach rät, nur kurz zu spielen.

- Warum: Frisch an den Start; ein Spiel kurz davor kostet viel Frische.
- Quelle: Tapering-Forschung (Mujika), Auftrag 18
- Umgesetzt: Plan-Check (Prüfung „raceWeek“)

### Tapering vor dem Wettkampf (war schon da)

Vor A-Wettkämpfen Umfang um 40-60 % senken, kurze Intensität bleibt: Sprint/10 km etwa 1 Woche, Olympisch/Halbmarathon 1-1,5 Wochen, Mittel- und Langdistanz 2 Wochen. C-Wettkämpfe als Training ohne Tapering.

- Warum: Weniger Umfang bei kurzer Intensität bringt die beste Form am Wettkampftag.
- Quelle: Mujika & Padilla (Tapering)
- Umgesetzt: Phasen im Generator (periodize.ts)

### Wenige Hauptwettkämpfe (neu)

Höchstens 2-3 A-Wettkämpfe pro Jahr mit genug Abstand. Weitere Rennen als B (kurzes Tapering) oder C (Training).

- Warum: Jede echte Form-Spitze braucht Vorbereitung, Tapering und Erholung.
- Quelle: Periodisierung
- Umgesetzt: Hinweis bei den Zielen (goalcheck.ts)

### Generalprobe und Wechsel (neu)

Vor einem Triathlon 1-2 Wettkampf-Generalproben in der spezifischen Phase (Schwimmen, Rad und Koppellauf an einem Tag, ab 16) und den Wechsel üben (Wechselzone, Neopren aus, Schuhe).

- Warum: Wechsel und Verpflegung sind Übungssache.
- Quelle: Triathlon-Trainingspraxis
- Umgesetzt: Generator (Generalprobe), Einheiten-Text (Prüfung „raceSim“)

### Rennplan und Auswertung (verbessert)

Vor jedem Wettkampf ein Rennplan: Tempo je Disziplin (Puls, Watt, Pace), Verpflegung, Aufwärmen. Danach kurze Auswertung mit dem Coach.

- Warum: Ein Plan verhindert zu schnelles Anlaufen; die Auswertung macht das nächste Rennen besser.
- Quelle: Trainingspraxis
- Umgesetzt: Mehr → Wettkampf, Coach nach dem Wettkampf

## Pausen, Krankheit, verpasste Einheiten

### Wiedereinstieg nach Pausen (neu)

Nach Pausen ohne Krankheit (Urlaub, Prüfungen, Verletzung): bis 1 Woche etwa 90 % Umfang, 2-4 Wochen 60-75 %, über 4 Wochen ein neuer Grundlagenblock. Intensität erst nach 1-2 Wochen.

- Warum: Ausdauer und Sehnen bauen in Pausen ab; ein zu schneller Wiedereinstieg überlastet.
- Quelle: Detraining-Forschung (Mujika & Padilla)
- Umgesetzt: Generator (Wiedereinstieg nach Trainingspause)

### Krankheit: Hals-Regel (verbessert)

Beschwerden nur über dem Hals (Schnupfen) ohne Fieber: höchstens locker und kurz. Unter dem Hals (Husten, Gliederschmerzen) oder Fieber: kein Training, danach Wiedereinstieg in Stufen.

- Warum: Bei Infekten im Körper kann Training das Herz belasten (Herzmuskelentzündung).
- Quelle: Sportmedizinische Empfehlung („Neck-Check“)
- Umgesetzt: Coach (krank melden), Krankheits-Stufenplan

### Verpasste Einheiten (verbessert)

Nie durch Stapeln nachholen. Lockere Einheiten verfallen. Eine Schlüsseleinheit darf innerhalb von 48 h verschoben werden, aber nie neben eine andere harte. Fehlt der Großteil einer Woche, wird die nächste Woche wiederholt statt gesteigert.

- Warum: Nachholen auf einen Schlag bringt mehr Ermüdung als Nutzen.
- Quelle: Trainingspraxis
- Umgesetzt: Tägliche und wöchentliche Anpassung (core.ts)

## Schmerzen und Überlastung

### Schmerzen (verbessert)

Schmerz 0-3 von 10, gleichbleibend, kein Hinken: weiter, aber beobachten. Ab 4, zunehmend oder mit verändertem Laufbild: abbrechen, Laufen durch Rad oder Schwimmen ersetzen (gleiche Dauer, locker), bei Bedarf Arzt oder Physio.

- Warum: Die Schmerzskala trennt harmlose Beschwerden von beginnenden Verletzungen.
- Quelle: Schmerz-Monitoring-Modell (Silbernagel)
- Umgesetzt: Tägliche Anpassung, Coach

### Laufumfang vorsichtig (war schon da)

Laufen belastet am meisten: Laufumfang separat und vorsichtiger steigern als den Gesamtumfang. Bei Laufbeschwerden mehr Rad und Schwimmen statt Laufen.

- Warum: Die meisten Überlastungsverletzungen im Ausdauersport kommen vom Laufen.
- Quelle: Nielsen u. a. (Laufverletzungen)
- Umgesetzt: Generator (Laufumfang), Regeln bei Beschwerden

### Überlastung früh erkennen (war schon da)

Mehrere Zeichen über mindestens 3 Tage (HFV runter, Ruhepuls hoch, schlechter Schlaf, Leistung schlechter bei gleichem Puls, Gefühl schlechter): Entlastungstage oder eine leichtere Woche. Ohne Puls schätzt die App die Belastung aus Anstrengung × Dauer.

- Warum: Früh reagieren verhindert Übertraining.
- Quelle: Meeusen u. a. (Overtraining-Konsens), Foster (Session-RPE)
- Umgesetzt: Analyse und Vorschlag „Woche leichter“

### Locker heißt locker (war schon da)

Sind lockere Einheiten regelmäßig zu hart (Puls über Zone 2), sagt der Coach es und nennt eine Puls-Grenze für die kommenden lockeren Einheiten.

- Warum: Zu schnelle lockere Einheiten machen müde, ohne die Grundlage besser zu trainieren.
- Quelle: Seiler (polarisiertes Training)
- Umgesetzt: Analyse, Bewertung nach der Einheit

## Essen und Trinken

### Verpflegung beim Training (verbessert)

Ab etwa 75-90 min unterwegs Kohlenhydrate (30-60 g pro Stunde), trinken nach Durst und Hitze. Bei langen Einheiten in der spezifischen Phase die Wettkampf-Verpflegung üben.

- Warum: Volle Speicher halten Tempo und Konzentration; der Magen muss Wettkampf-Verpflegung lernen.
- Quelle: ACSM/IOC-Ernährungsempfehlungen, Jeukendrup
- Umgesetzt: Text der langen Einheiten

### Essen nach dem Training (verbessert)

Nach harten oder langen Einheiten innerhalb von 1-2 h eine Mahlzeit mit Kohlenhydraten und Eiweiß. Unter 18 normale Lebensmittel statt Nahrungsergänzung, keine Gewichtsziele.

- Warum: Schnellere Erholung; Jugendliche brauchen Energie zum Wachsen.
- Quelle: ISSN/IOC-Empfehlungen
- Umgesetzt: Text der harten und langen Einheiten, Essen-Bereich

### Zu wenig Energie (RED-S) (verbessert)

Warnzeichen (dauernd müde, häufige Verletzungen oder Infekte, Leistungseinbruch, bei Frauen Zyklus-Veränderungen): vorsichtiger Hinweis des Coachs und Rat zum Arzt, keine Diagnose.

- Warum: Zu wenig Energie schadet Knochen, Hormonen und Leistung.
- Quelle: IOC-Konsens RED-S (Mountjoy u. a.)
- Umgesetzt: Essen-Bereich, Analyse

## Schlaf und Alltag

### Schlaf (verbessert)

Jugendliche brauchen etwa 8-10 h, Erwachsene 7-9 h. Kurzer Schlaf (unter 6 h oder deutlich unter dem Bedarf): Intensität raus, aber nicht automatisch absagen.

- Warum: Schlaf ist die wichtigste Erholung.
- Quelle: American Academy of Sleep Medicine
- Umgesetzt: Ampel und tägliche Anpassung

### Prüfungs- und Stresswochen (war schon da)

Prüfungs- oder Stresswochen (in Berücksichtigungen eingetragen oder im Coach gesagt): Umfang 20-40 % runter, Intensität kurz halten.

- Warum: Stress und Training belasten denselben Körper.
- Quelle: Trainingspraxis
- Umgesetzt: Berücksichtigungen („wenig Training“ im Zeitraum)

## Wetter und Umgebung

### Hitze, Kälte, Regen (neu)

Hitze (über etwa 25 °C): nach Puls statt Pace, Intensität runter, mehr trinken, lieber früh oder spät. Kälte: länger aufwärmen. Regen oder Glätte: Rad nach drinnen.

- Warum: Bei Hitze steigt der Puls bei gleichem Tempo; bei Kälte sind Muskeln langsamer bereit.
- Quelle: ACSM (Hitze), Trainingspraxis
- Umgesetzt: Hinweis in den Einheiten (Sommer/Winter), Coach

### Rad drinnen (verbessert)

Drinnen ist Rad intensiver (kein Rollen): für den gleichen Reiz etwa 20-25 % kürzer. Lange Rad-Einheiten drinnen höchstens etwa 2 h.

- Warum: Auf der Rolle tritt man ohne Pause.
- Quelle: Trainingspraxis Rad
- Umgesetzt: Obergrenzen der langen Einheiten (periodize.ts)

## Kraft

### Kraft über die Saison (verbessert)

Grundlage: Technik und mehr Kraft. Aufbau und spezifisch: Erhaltung (kurz, 2 × 25-30 min). Wettkampfwoche: keine. Schwerpunkte: Waden, Hüfte/Gesäß, Rumpf, Adduktoren, Rücken und Schulter (Schwimmen). Sprünge nur dosiert und mit Grundlage; Jugendliche mit sauberer Technik und ohne Maximalgewichte.

- Warum: Kraft schützt vor Verletzungen und macht ökonomischer, darf aber die Ausdauer-Einheiten nicht stören.
- Quelle: Rønnestad & Mujika (Krafttraining für Ausdauersportler), NSCA (Jugendliche)
- Umgesetzt: Generator (Kraft je Phase)

## Alter und Geschlecht

### Ab 50 Jahren (war schon da)

Mehr Erholung (2 Wochen Aufbau, 1 Woche Erholung), mehr Kraft und Mobility, längeres Aufwärmen.

- Warum: Erholung dauert länger, Muskelmasse nimmt ab.
- Quelle: ACSM (ältere Sportler)
- Umgesetzt: Generator (Rhythmus, Hinweise)

### Zyklus (freiwillig) (neu)

Wer möchte, trägt den Zyklus ein; die App gibt Hinweise statt starrer Regeln (z. B. an schweren Tagen lieber locker).

- Warum: Viele Frauen merken Unterschiede, die Forschung zeigt aber keine allgemeingültigen Regeln.
- Quelle: McNulty u. a. (Zyklus und Leistung, Meta-Analyse)
- Umgesetzt: Einstellungen, Heute

## Technik

### Lauftechnik (verbessert)

Lauf-ABC und Steigerungen regelmäßig. Schrittfrequenz etwa 165-180 als Richtung, nicht als Zwang. Laufschuhe nach etwa 600-800 km prüfen.

- Warum: Bessere Technik spart Kraft; abgelaufene Schuhe dämpfen weniger.
- Quelle: Heiderscheit (Schrittfrequenz), Trainingspraxis
- Umgesetzt: Lockere Läufe, Bewertung, Schuh-Kilometer in den Einstellungen

### Radtechnik (verbessert)

Kadenz-Übungen, drinnen auch Einbein-Fahren. Bei Knie- oder Rückenbeschwerden auf dem Rad die Rad-Einstellung (Bike-Fit) prüfen lassen.

- Warum: Runder Tritt spart Kraft; eine falsche Sitzposition ist oft Ursache von Beschwerden.
- Quelle: Trainingspraxis Rad
- Umgesetzt: Rad-Einheiten, Coach

### Schwimmtechnik (verbessert)

Technik vor Umfang. Übungen mit kurzer Erklärung (Abschlag, Catch-up, Seitlage, 6-3-6, Faustschwimmen …) im Lexikon. Vor Triathlons Freiwasser-Fähigkeiten (Orientieren, Start im Feld).

- Warum: Im Wasser entscheidet die Technik mehr als die Kraft.
- Quelle: Schwimm-Trainingslehre
- Umgesetzt: Schwimmeinheiten, Lexikon

## Coach

### Scores als laufende Schätzung (neu)

Der Score je Sportart ist eine laufende Schätzung mit Bereich (±). Tests und Wettkämpfe zählen am meisten, dann harte Einheiten mit Puls oder Watt, dann lockere Einheiten mit Puls (Hitze und Höhenmeter herausgerechnet), dann Tempo nach Gefühl. Fehlende Werte sind unbekannt, nicht schlecht. Ohne Training sinkt der Wert langsam (ab 10 Tagen etwa 1 % pro Woche, mit anderem Ausdauertraining halb so viel), Krankheit macht Messungen unsicherer. „Warum?“ zeigt die letzten Einheiten mit +/− und Grund.

- Warum: Ein einzelner Lauf sagt wenig; viele Messungen mit ihrer Genauigkeit gewichtet ergeben ein ehrliches Bild (Prinzip des Kalman-Filters).
- Quelle: Kalman-Filter (Schätzung mit Unsicherheit); Mujika/Padilla (Formverlust bei Pausen); Auftrag 19
- Umgesetzt: shared/scorefilter.ts, shared/scores.ts

### Keine Ursache ohne Daten (neu)

Der Coach nennt Ursachen (z. B. Schlaf → Puls) nur, wenn beide Werte für genau diesen Tag da sind und die Abweichung zur eigenen Basis wirklich besteht (Puls bei gleicher Pace mindestens 5 Schläge über dem 6-Wochen-Schnitt). Sonst bleibt er neutral.

- Warum: Erfundene Zusammenhänge führen zu falschen Entscheidungen.
- Quelle: Auftrag 18, Punkt 1
- Umgesetzt: Prüfer vor jeder Coach-Antwort (claims.ts)

### Der Coach kennt die Regeln (neu)

Der KI-Coach bekommt diese Regeln als kurzen Kontext; der Regel-Coach erklärt sie (z. B. „Warum habe ich heute frei?“).

- Warum: Erklärte Regeln werden besser eingehalten.
- Quelle: Auftrag 18, Punkt 6
- Umgesetzt: KI-Anweisung, Regel-Coach (dialog.ts), Lexikon „Training verstehen“

