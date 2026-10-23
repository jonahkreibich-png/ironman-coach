/* Auftrag 18: Trainingswissen der App an einer Stelle. Daraus entstehen docs/TRAININGSREGELN.md (scripts/trainingsregeln.ts), der kurze
   Kontext für den KI-Coach (rulesForAi) und die Lexikon-Artikel „Training verstehen“. Jede Regel: was gilt, warum (Quelle), wo sie
   umgesetzt ist und ob sie schon da war, verbessert wurde oder neu ist. Gilt für alle Nutzer. */
export type Status = 'war schon da' | 'verbessert' | 'neu';
export interface Knowledge { id: string; topic: string; title: string; rule: string; why: string; source: string; status: Status; where: string; /** Plan-Check-Regel (shared/trainingrules.ts) */ check?: string }

export const TOPICS = ['Belastung und Erholung', 'Wettkämpfe und Saison', 'Pausen, Krankheit, verpasste Einheiten', 'Schmerzen und Überlastung', 'Essen und Trinken', 'Schlaf und Alltag', 'Wetter und Umgebung', 'Kraft', 'Alter und Geschlecht', 'Technik', 'Coach'] as const;

export const KNOWLEDGE: Knowledge[] = [
  // ---------- Belastung und Erholung ----------
  { id: 'rest', topic: 'Belastung und Erholung', title: 'Ruhetage', check: 'restDay', status: 'verbessert',
    rule: 'Mindestens 1 echter Ruhetag pro Woche (kein Training, höchstens Mobility). Unter 18 und Einsteiger 2, wenn die festen Termine es zulassen. Teamsport-Tage zählen als Trainingstage. Der Ruhetag liegt möglichst jede Woche am selben Tag, gern zwischen harten Tagen oder vor einem Spiel. Auftrag 19: Geht mit Teamsport ein Ruhetag pro Woche nicht ohne Schlüsseleinheiten zu verlieren, dann mindestens alle 2 Wochen einer und in jeder Erholungswoche zwei; der Coach erklärt das einmal.',
    why: 'Im Ruhetag passt sich der Körper an; ohne ihn steigt das Risiko für Überlastung. Für Jugendliche empfiehlt die AAP 1-2 freie Tage pro Woche.', source: 'American Academy of Pediatrics (AAP), Bericht zu Überlastungsverletzungen bei Jugendlichen; ACSM-Empfehlungen', where: 'Plan-Check (Ruhetag-Korrektur): lockere Einheit verschieben, sonst weglassen' },
  { id: 'teen-hours', topic: 'Belastung und Erholung', title: 'Jugendliche: Stunden pro Woche', check: 'teenHours', status: 'neu',
    rule: 'Unter 18 nie mehr Stunden Training pro Woche als das Alter in Jahren (Teamsport zählt mit).', why: 'Faustregel gegen Überlastung im Wachstum.', source: 'AAP (Brenner u. a.), Sport-Spezialisierung bei Jugendlichen', where: 'Plan-Check kürzt die eigenen Einheiten' },
  { id: 'long-days', topic: 'Belastung und Erholung', title: 'Lange Tage nicht hintereinander', check: 'bigDayNext', status: 'neu',
    rule: 'Nach einem Tag mit langer Einheit plus Koppellauf oder mit über 2,5 h Training folgt kein langer oder harter Lauf, sondern Ruhe, Lockeres und Kurzes oder Schwimmen. Lange Ausfahrt am Samstag und langer Lauf am Sonntag ist erlaubt – dann ohne Koppel am Samstag und ohne Tempo am Sonntag. In Koppel-Wochen ist der Sonntag locker und kürzer (etwa 2/3 des langen Laufs). Steht am Tag danach ein Test oder der Qualitätslauf vor dem Laufziel, wird der große Tag kleiner.',
    why: 'Zwei lange oder harte Tage hintereinander summieren die Ermüdung; der Lauf am zweiten Tag hat das höchste Verletzungsrisiko.', source: 'Trainingslehre Ausdauer (Belastung–Erholung), Triathlon-Trainingspraxis', where: 'Plan-Check (Tag danach locker und kürzer)' },
  { id: 'max-sports', topic: 'Belastung und Erholung', title: 'Höchstens 2 Sportarten pro Tag', check: 'maxSports', status: 'verbessert',
    rule: 'Höchstens 2 Sportarten an einem Tag; ein Koppellauf zählt als Laufen. Dreifach-Tage nur als Wettkampf-Simulation (spezifische Phase, höchstens 2-3 pro Saison, ab 16).',
    why: 'Mehr als zwei Einheiten an einem Tag lassen kaum Erholung und passen selten in den Alltag.', source: 'Trainingspraxis Triathlon', where: 'Plan-Check (Einheit an einen anderen Tag, sonst Koppellauf weg)' },
  { id: 'hard', topic: 'Belastung und Erholung', title: 'Harte Einheiten', check: 'hardCount', status: 'war schon da',
    rule: 'Höchstens 2 eigene harte Einheiten pro Woche plus Teamsport-Spiel (Einsteiger 0-1, sehr Erfahrene bis 3). Nie zwei harte Tage hintereinander, nichts Hartes am Tag vor einem Spiel oder Wettkampf. Tests zählen als hart und liegen nie direkt neben einem Spiel oder Wettkampf.',
    why: 'Etwa 80 % locker, 20 % hart bringt die meisten Fortschritte bei wenig Risiko (polarisiertes Training).', source: 'Seiler (polarisiertes Training), Auftrag 14/17', where: 'Generator, Intensitäts- und Plan-Check' },
  { id: 'min-freq', topic: 'Belastung und Erholung', title: 'Mindest-Häufigkeit je Sportart', check: 'minFreq', status: 'neu',
    rule: 'Laufziel ab 10 km: mindestens 3 Läufe pro Woche (wenig Zeit: 2; ein Koppellauf zählt halb). Triathlon: jede Sportart mindestens 2× pro Woche. Muss für den Ruhetag etwas weg, fällt zuerst eine Nebeneinheit (zweite Kraft, kurzes Rad), nie die Hauptsportart des nächsten Ziels. Passt es nicht, steht es ehrlich in der Woche.',
    why: 'Für Anpassungen von Sehnen, Laufökonomie und Technik zählt die Häufigkeit mehr als einzelne lange Einheiten.', source: 'Trainingspraxis Lauf und Triathlon (Daniels, Friel); Auftrag 19', where: 'Generator und Plan-Check (Nebeneinheit tauschen oder ergänzen)' },
  { id: 'long-tempo', topic: 'Belastung und Erholung', title: 'Tempo im langen Lauf', check: 'longRunTempo', status: 'neu',
    rule: 'Tempo-Teil im langen Lauf nur in den letzten 6-8 Wochen vor einem Laufziel, höchstens jede 2. Woche und nie in einer Woche mit einem harten Qualitätslauf.',
    why: 'Ein langer Lauf mit Tempo ist eine der härtesten Einheiten; zweimal pro Woche oder jede Woche kostet mehr Erholung als er bringt.', source: 'Pfitzinger/Douglas (Advanced Marathoning); Auftrag 19', where: 'Generator und Plan-Check' },
  { id: 'threshold-up', topic: 'Belastung und Erholung', title: 'Schwelle regelmäßig anheben', status: 'neu',
    rule: 'Jede Sportart bekommt ihre Qualität aus der Einheiten-Bibliothek: Laufen Grundlage Steigerungen/Hügelsprints/Tempowechsel, Aufbau Schwelle (3×8 → 3×10 → 2×15 → 20-25 min am Stück) mit kurzen Intervallen alle 2-3 Wochen, spezifisch Wettkampftempo; Rad im Wechsel Sweet Spot, Schwelle, Over-Unders, VO2max, niedrige Kadenz; Schwimmen in einer von zwei Einheiten ein kurzer harter Teil (Lernende kurze schnelle 25er). Höchstens 2 harte Einheiten plus Spiel pro Woche; die Sportart mit dem größten Rückstand bekommt öfter Qualität. Eine Stufe höher nur, wenn die letzte laut Messdaten geklappt hat; zweimal nicht geschafft: eine Stufe zurück.',
    why: 'Ohne steigende Reize bleibt die Schwelle stehen; Abwechslung und Steigerung nach Nachweis verhindern Überforderung.', source: 'Seiler, Coggan/Allen (Training and Racing with a Power Meter), Swim Smooth (CSS); Auftrag 19', where: 'shared/workoutlib.ts, Generator, Wochenanpassung' },
  { id: 'goal-quality', topic: 'Belastung und Erholung', title: 'Qualität passend zum Ziel', check: 'goalQuality', status: 'verbessert',
    rule: 'Vor einem Laufziel (z. B. Halbmarathon) in den letzten 7 Wochen jede normale Woche ein Schwellen- oder Wettkampftempo-Lauf, dann ist der Sonntag locker. Ist unter der Woche kein Lauftag ohne harten Nachbartag frei, zieht ein lockerer Lauf auf einen freien Tag (Kraft tauscht oder fällt diese Woche weg); erst wenn das nicht geht, kommt die Qualität in den langen Lauf (höchstens jede 2. Woche), und der Tag davor bleibt ohne lange Ausfahrt. Unter 18 statt Tempowechsel kontrollierte Schwelle. Für Triathlon passende Qualität je Sportart und Phase.',
    why: 'Wettkampftempo muss man üben; ohne regelmäßige Qualität bleibt die Form unter den Möglichkeiten.', source: 'Daniels’ Running Formula, Pfitzinger; Auftrag 14', where: 'Generator und Plan-Check' },
  { id: 'long', topic: 'Belastung und Erholung', title: 'Lange Einheiten', check: 'longCap', status: 'verbessert',
    rule: 'Lange Einheiten passend zum nächsten Ziel (Halbmarathon höchstens etwa 105 min, später mehr). Der lange Lauf wächst höchstens 10 min pro Woche, die lange Ausfahrt höchstens 15 min, jeweils vom wirklich Gemachten aus.',
    why: 'Zu schnelle Steigerung der langen Einheit ist ein häufiger Grund für Überlastung. Rad belastet Sehnen und Gelenke weniger als Laufen, deshalb dort 15 min.', source: 'Trainingslehre (10-%-Regel), Auftrag 15/17', where: 'Generator und Plan-Check' },
  { id: 'same-sport', topic: 'Belastung und Erholung', title: 'Gleiche Sportart nicht an Folgetagen', status: 'war schon da',
    rule: 'Dieselbe Sportart nicht an zwei Tagen hintereinander (sonst eine Einheit locker und kurz, mit Begründung). Kraft für die Beine nie am Tag vor oder an einem Spiel, Wettkampf oder langen Lauf.',
    why: 'Gleiche Muskeln und Sehnen brauchen 48 h; frische Beine am wichtigen Tag.', source: 'Auftrag 15/18', where: 'Plan-Regeln (planrules.ts) und Plan-Check', check: 'legsStrength' },
  { id: 'game-strength', topic: 'Belastung und Erholung', title: 'Kraft am Spieltag', check: 'strengthGameDay', status: 'neu',
    rule: 'Kraft für den Oberkörper am Spieltag ist okay, aber kurz (höchstens 30 min) und nicht direkt vor dem Spiel. In der Wettkampfwoche keine Kraft.',
    why: 'Das Spiel ist die harte Einheit des Tages.', source: 'Auftrag 18, Punkt 5', where: 'Plan-Check' },
  { id: 'recovery-week', topic: 'Belastung und Erholung', title: 'Erholungswochen ohne Intervalle', check: 'recoveryIntervals', status: 'verbessert',
    rule: 'Alle 3-4 Wochen eine Erholungswoche mit etwa 2/3 des Umfangs. Darin keine Intervalle, nur Tests (höchstens ein harter Test), und kein Test direkt neben einem Spiel.',
    why: 'Die Anpassung an das Training passiert in der Erholung; Tests brauchen frische Beine.', source: 'Periodisierung (Bompa), Auftrag 17', where: 'Generator und Plan-Check' },
  { id: 'warmup', topic: 'Belastung und Erholung', title: 'Aufwärmen und Auslaufen', check: 'warmup', status: 'war schon da',
    rule: 'Jede harte Einheit mit mindestens 10-15 min Aufwärmen (mit Steigerungen) und 5-10 min Auslaufen. Lockere Einheiten starten sanft.',
    why: 'Bereitet Herz, Muskeln und Sehnen vor und senkt das Verletzungsrisiko.', source: 'Trainingslehre', where: 'Einheiten-Bausteine (workouts.ts), Plan-Check' },
  // ---------- Wettkämpfe und Saison ----------
  { id: 'after-race', topic: 'Wettkämpfe und Saison', title: 'Nach dem Wettkampf', check: 'afterRace', status: 'verbessert',
    rule: 'Nach 5 km/10 km 3 Tage, nach Halbmarathon und Olympischer Distanz 7 Tage, nach Mittel- und Langdistanz bzw. Marathon 10-14 Tage nur locker und kurz (die ersten 2 Tage höchstens 45 min, danach 60 min), keine lange Ausfahrt direkt danach.',
    why: 'Muskeln und Sehnen brauchen nach dem Wettkampf Tage bis Wochen; sonst steigt das Verletzungsrisiko.', source: 'Trainingspraxis Lauf/Triathlon', where: 'Generator und Plan-Check' },
  { id: 'race-week', topic: 'Wettkämpfe und Saison', title: 'Wettkampfwoche', check: 'raceWeek', status: 'neu',
    rule: 'In der Wettkampfwoche keine Kraft und nichts Hartes außer kurzen Aktivierungen (Steigerungen). Ist 1-2 Tage vorher ein festes Teamsport-Spiel, wird die ganze Woche leichter, und der Coach rät, nur kurz zu spielen.',
    why: 'Frisch an den Start; ein Spiel kurz davor kostet viel Frische.', source: 'Tapering-Forschung (Mujika), Auftrag 18', where: 'Plan-Check' },
  { id: 'taper', topic: 'Wettkämpfe und Saison', title: 'Tapering vor dem Wettkampf', status: 'war schon da',
    rule: 'Vor A-Wettkämpfen Umfang um 40-60 % senken, kurze Intensität bleibt: Sprint/10 km etwa 1 Woche, Olympisch/Halbmarathon 1-1,5 Wochen, Mittel- und Langdistanz 2 Wochen. C-Wettkämpfe als Training ohne Tapering.',
    why: 'Weniger Umfang bei kurzer Intensität bringt die beste Form am Wettkampftag.', source: 'Mujika & Padilla (Tapering)', where: 'Phasen im Generator (periodize.ts)' },
  { id: 'a-races', topic: 'Wettkämpfe und Saison', title: 'Wenige Hauptwettkämpfe', status: 'neu',
    rule: 'Höchstens 2-3 A-Wettkämpfe pro Jahr mit genug Abstand. Weitere Rennen als B (kurzes Tapering) oder C (Training).',
    why: 'Jede echte Form-Spitze braucht Vorbereitung, Tapering und Erholung.', source: 'Periodisierung', where: 'Hinweis bei den Zielen (goalcheck.ts)' },
  { id: 'rehearsal', topic: 'Wettkämpfe und Saison', title: 'Generalprobe und Wechsel', status: 'neu', check: 'raceSim',
    rule: 'Vor einem Triathlon 1-2 Wettkampf-Generalproben in der spezifischen Phase (Schwimmen, Rad und Koppellauf an einem Tag, ab 16) und den Wechsel üben (Wechselzone, Neopren aus, Schuhe).',
    why: 'Wechsel und Verpflegung sind Übungssache.', source: 'Triathlon-Trainingspraxis', where: 'Generator (Generalprobe), Einheiten-Text' },
  { id: 'race-plan', topic: 'Wettkämpfe und Saison', title: 'Rennplan und Auswertung', status: 'verbessert',
    rule: 'Vor jedem Wettkampf ein Rennplan: Tempo je Disziplin (Puls, Watt, Pace), Verpflegung, Aufwärmen. Danach kurze Auswertung mit dem Coach.',
    why: 'Ein Plan verhindert zu schnelles Anlaufen; die Auswertung macht das nächste Rennen besser.', source: 'Trainingspraxis', where: 'Mehr → Wettkampf, Coach nach dem Wettkampf' },
  // ---------- Pausen, Krankheit, verpasste Einheiten ----------
  { id: 'pause', topic: 'Pausen, Krankheit, verpasste Einheiten', title: 'Wiedereinstieg nach Pausen', status: 'neu',
    rule: 'Nach Pausen ohne Krankheit (Urlaub, Prüfungen, Verletzung): bis 1 Woche etwa 90 % Umfang, 2-4 Wochen 60-75 %, über 4 Wochen ein neuer Grundlagenblock. Intensität erst nach 1-2 Wochen.',
    why: 'Ausdauer und Sehnen bauen in Pausen ab; ein zu schneller Wiedereinstieg überlastet.', source: 'Detraining-Forschung (Mujika & Padilla)', where: 'Generator (Wiedereinstieg nach Trainingspause)' },
  { id: 'neck', topic: 'Pausen, Krankheit, verpasste Einheiten', title: 'Krankheit: Hals-Regel', status: 'verbessert',
    rule: 'Beschwerden nur über dem Hals (Schnupfen) ohne Fieber: höchstens locker und kurz. Unter dem Hals (Husten, Gliederschmerzen) oder Fieber: kein Training, danach Wiedereinstieg in Stufen.',
    why: 'Bei Infekten im Körper kann Training das Herz belasten (Herzmuskelentzündung).', source: 'Sportmedizinische Empfehlung („Neck-Check“)', where: 'Coach (krank melden), Krankheits-Stufenplan' },
  { id: 'missed', topic: 'Pausen, Krankheit, verpasste Einheiten', title: 'Verpasste Einheiten', status: 'verbessert',
    rule: 'Nie durch Stapeln nachholen. Lockere Einheiten verfallen. Eine Schlüsseleinheit darf innerhalb von 48 h verschoben werden, aber nie neben eine andere harte. Fehlt der Großteil einer Woche, wird die nächste Woche wiederholt statt gesteigert.',
    why: 'Nachholen auf einen Schlag bringt mehr Ermüdung als Nutzen.', source: 'Trainingspraxis', where: 'Tägliche und wöchentliche Anpassung (core.ts)' },
  // ---------- Schmerzen und Überlastung ----------
  { id: 'pain', topic: 'Schmerzen und Überlastung', title: 'Schmerzen', status: 'verbessert',
    rule: 'Schmerz 0-3 von 10, gleichbleibend, kein Hinken: weiter, aber beobachten. Ab 4, zunehmend oder mit verändertem Laufbild: abbrechen, Laufen durch Rad oder Schwimmen ersetzen (gleiche Dauer, locker), bei Bedarf Arzt oder Physio.',
    why: 'Die Schmerzskala trennt harmlose Beschwerden von beginnenden Verletzungen.', source: 'Schmerz-Monitoring-Modell (Silbernagel)', where: 'Tägliche Anpassung, Coach' },
  { id: 'run-volume', topic: 'Schmerzen und Überlastung', title: 'Laufumfang vorsichtig', status: 'war schon da',
    rule: 'Laufen belastet am meisten: Laufumfang separat und vorsichtiger steigern als den Gesamtumfang. Bei Laufbeschwerden mehr Rad und Schwimmen statt Laufen.',
    why: 'Die meisten Überlastungsverletzungen im Ausdauersport kommen vom Laufen.', source: 'Nielsen u. a. (Laufverletzungen)', where: 'Generator (Laufumfang), Regeln bei Beschwerden' },
  { id: 'overreach', topic: 'Schmerzen und Überlastung', title: 'Überlastung früh erkennen', status: 'war schon da',
    rule: 'Mehrere Zeichen über mindestens 3 Tage (HFV runter, Ruhepuls hoch, schlechter Schlaf, Leistung schlechter bei gleichem Puls, Gefühl schlechter): Entlastungstage oder eine leichtere Woche. Ohne Puls schätzt die App die Belastung aus Anstrengung × Dauer.',
    why: 'Früh reagieren verhindert Übertraining.', source: 'Meeusen u. a. (Overtraining-Konsens), Foster (Session-RPE)', where: 'Analyse und Vorschlag „Woche leichter“' },
  { id: 'easy-easy', topic: 'Schmerzen und Überlastung', title: 'Locker heißt locker', status: 'war schon da',
    rule: 'Sind lockere Einheiten regelmäßig zu hart (Puls über Zone 2), sagt der Coach es und nennt eine Puls-Grenze für die kommenden lockeren Einheiten.',
    why: 'Zu schnelle lockere Einheiten machen müde, ohne die Grundlage besser zu trainieren.', source: 'Seiler (polarisiertes Training)', where: 'Analyse, Bewertung nach der Einheit' },
  // ---------- Essen und Trinken ----------
  { id: 'fuel', topic: 'Essen und Trinken', title: 'Verpflegung beim Training', status: 'verbessert',
    rule: 'Ab etwa 75-90 min unterwegs Kohlenhydrate (30-60 g pro Stunde), trinken nach Durst und Hitze. Bei langen Einheiten in der spezifischen Phase die Wettkampf-Verpflegung üben.',
    why: 'Volle Speicher halten Tempo und Konzentration; der Magen muss Wettkampf-Verpflegung lernen.', source: 'ACSM/IOC-Ernährungsempfehlungen, Jeukendrup', where: 'Text der langen Einheiten' },
  { id: 'recover-food', topic: 'Essen und Trinken', title: 'Essen nach dem Training', status: 'verbessert',
    rule: 'Nach harten oder langen Einheiten innerhalb von 1-2 h eine Mahlzeit mit Kohlenhydraten und Eiweiß. Unter 18 normale Lebensmittel statt Nahrungsergänzung, keine Gewichtsziele.',
    why: 'Schnellere Erholung; Jugendliche brauchen Energie zum Wachsen.', source: 'ISSN/IOC-Empfehlungen', where: 'Text der harten und langen Einheiten, Essen-Bereich' },
  { id: 'reds', topic: 'Essen und Trinken', title: 'Zu wenig Energie (RED-S)', status: 'verbessert',
    rule: 'Warnzeichen (dauernd müde, häufige Verletzungen oder Infekte, Leistungseinbruch, bei Frauen Zyklus-Veränderungen): vorsichtiger Hinweis des Coachs und Rat zum Arzt, keine Diagnose.',
    why: 'Zu wenig Energie schadet Knochen, Hormonen und Leistung.', source: 'IOC-Konsens RED-S (Mountjoy u. a.)', where: 'Essen-Bereich, Analyse' },
  // ---------- Schlaf und Alltag ----------
  { id: 'sleep', topic: 'Schlaf und Alltag', title: 'Schlaf', status: 'verbessert',
    rule: 'Jugendliche brauchen etwa 8-10 h, Erwachsene 7-9 h. Kurzer Schlaf (unter 6 h oder deutlich unter dem Bedarf): Intensität raus, aber nicht automatisch absagen.',
    why: 'Schlaf ist die wichtigste Erholung.', source: 'American Academy of Sleep Medicine', where: 'Ampel und tägliche Anpassung' },
  { id: 'exams', topic: 'Schlaf und Alltag', title: 'Prüfungs- und Stresswochen', status: 'war schon da',
    rule: 'Prüfungs- oder Stresswochen (in Berücksichtigungen eingetragen oder im Coach gesagt): Umfang 20-40 % runter, Intensität kurz halten.',
    why: 'Stress und Training belasten denselben Körper.', source: 'Trainingspraxis', where: 'Berücksichtigungen („wenig Training“ im Zeitraum)' },
  // ---------- Wetter und Umgebung ----------
  { id: 'heat', topic: 'Wetter und Umgebung', title: 'Hitze, Kälte, Regen', status: 'neu',
    rule: 'Hitze (über etwa 25 °C): nach Puls statt Pace, Intensität runter, mehr trinken, lieber früh oder spät. Kälte: länger aufwärmen. Regen oder Glätte: Rad nach drinnen.',
    why: 'Bei Hitze steigt der Puls bei gleichem Tempo; bei Kälte sind Muskeln langsamer bereit.', source: 'ACSM (Hitze), Trainingspraxis', where: 'Hinweis in den Einheiten (Sommer/Winter), Coach' },
  { id: 'indoor', topic: 'Wetter und Umgebung', title: 'Rad drinnen', status: 'verbessert',
    rule: 'Drinnen ist Rad intensiver (kein Rollen): für den gleichen Reiz etwa 20-25 % kürzer. Lange Rad-Einheiten drinnen höchstens etwa 2 h.',
    why: 'Auf der Rolle tritt man ohne Pause.', source: 'Trainingspraxis Rad', where: 'Obergrenzen der langen Einheiten (periodize.ts)' },
  // ---------- Kraft ----------
  { id: 'strength', topic: 'Kraft', title: 'Kraft über die Saison', status: 'verbessert',
    rule: 'Grundlage: Technik und mehr Kraft. Aufbau und spezifisch: Erhaltung (kurz, 2 × 25-30 min). Wettkampfwoche: keine. Schwerpunkte: Waden, Hüfte/Gesäß, Rumpf, Adduktoren, Rücken und Schulter (Schwimmen). Sprünge nur dosiert und mit Grundlage; Jugendliche mit sauberer Technik und ohne Maximalgewichte.',
    why: 'Kraft schützt vor Verletzungen und macht ökonomischer, darf aber die Ausdauer-Einheiten nicht stören.', source: 'Rønnestad & Mujika (Krafttraining für Ausdauersportler), NSCA (Jugendliche)', where: 'Generator (Kraft je Phase)' },
  // ---------- Alter und Geschlecht ----------
  { id: 'age50', topic: 'Alter und Geschlecht', title: 'Ab 50 Jahren', status: 'war schon da',
    rule: 'Mehr Erholung (2 Wochen Aufbau, 1 Woche Erholung), mehr Kraft und Mobility, längeres Aufwärmen.',
    why: 'Erholung dauert länger, Muskelmasse nimmt ab.', source: 'ACSM (ältere Sportler)', where: 'Generator (Rhythmus, Hinweise)' },
  { id: 'cycle', topic: 'Alter und Geschlecht', title: 'Zyklus (freiwillig)', status: 'neu',
    rule: 'Wer möchte, trägt den Zyklus ein; die App gibt Hinweise statt starrer Regeln (z. B. an schweren Tagen lieber locker).',
    why: 'Viele Frauen merken Unterschiede, die Forschung zeigt aber keine allgemeingültigen Regeln.', source: 'McNulty u. a. (Zyklus und Leistung, Meta-Analyse)', where: 'Einstellungen, Heute' },
  // ---------- Technik ----------
  { id: 'tech-run', topic: 'Technik', title: 'Lauftechnik', status: 'verbessert',
    rule: 'Lauf-ABC und Steigerungen regelmäßig. Schrittfrequenz etwa 165-180 als Richtung, nicht als Zwang. Laufschuhe nach etwa 600-800 km prüfen.',
    why: 'Bessere Technik spart Kraft; abgelaufene Schuhe dämpfen weniger.', source: 'Heiderscheit (Schrittfrequenz), Trainingspraxis', where: 'Lockere Läufe, Bewertung, Schuh-Kilometer in den Einstellungen' },
  { id: 'tech-bike', topic: 'Technik', title: 'Radtechnik', status: 'verbessert',
    rule: 'Kadenz-Übungen, drinnen auch Einbein-Fahren. Bei Knie- oder Rückenbeschwerden auf dem Rad die Rad-Einstellung (Bike-Fit) prüfen lassen.',
    why: 'Runder Tritt spart Kraft; eine falsche Sitzposition ist oft Ursache von Beschwerden.', source: 'Trainingspraxis Rad', where: 'Rad-Einheiten, Coach' },
  { id: 'tech-swim', topic: 'Technik', title: 'Schwimmtechnik', status: 'verbessert',
    rule: 'Technik vor Umfang. Übungen mit kurzer Erklärung (Abschlag, Catch-up, Seitlage, 6-3-6, Faustschwimmen …) im Lexikon. Vor Triathlons Freiwasser-Fähigkeiten (Orientieren, Start im Feld).',
    why: 'Im Wasser entscheidet die Technik mehr als die Kraft.', source: 'Schwimm-Trainingslehre', where: 'Schwimmeinheiten, Lexikon' },
  // ---------- Coach ----------
  { id: 'scores', topic: 'Coach', title: 'Scores als laufende Schätzung', status: 'neu',
    rule: 'Der Score je Sportart ist eine laufende Schätzung mit Bereich (±). Tests und Wettkämpfe zählen am meisten, dann harte Einheiten mit Puls oder Watt, dann lockere Einheiten mit Puls (Hitze und Höhenmeter herausgerechnet), dann Tempo nach Gefühl. Fehlende Werte sind unbekannt, nicht schlecht. Ohne Training sinkt der Wert langsam (ab 10 Tagen etwa 1 % pro Woche, mit anderem Ausdauertraining halb so viel), Krankheit macht Messungen unsicherer. „Warum?“ zeigt die letzten Einheiten mit +/− und Grund.',
    why: 'Ein einzelner Lauf sagt wenig; viele Messungen mit ihrer Genauigkeit gewichtet ergeben ein ehrliches Bild (Prinzip des Kalman-Filters).', source: 'Kalman-Filter (Schätzung mit Unsicherheit); Mujika/Padilla (Formverlust bei Pausen); Auftrag 19', where: 'shared/scorefilter.ts, shared/scores.ts' },
  { id: 'causes', topic: 'Coach', title: 'Keine Ursache ohne Daten', status: 'neu',
    rule: 'Der Coach nennt Ursachen (z. B. Schlaf → Puls) nur, wenn beide Werte für genau diesen Tag da sind und die Abweichung zur eigenen Basis wirklich besteht (Puls bei gleicher Pace mindestens 5 Schläge über dem 6-Wochen-Schnitt). Sonst bleibt er neutral.',
    why: 'Erfundene Zusammenhänge führen zu falschen Entscheidungen.', source: 'Auftrag 18, Punkt 1', where: 'Prüfer vor jeder Coach-Antwort (claims.ts)' },
  { id: 'coach-rules', topic: 'Coach', title: 'Der Coach kennt die Regeln', status: 'neu',
    rule: 'Der KI-Coach bekommt diese Regeln als kurzen Kontext; der Regel-Coach erklärt sie (z. B. „Warum habe ich heute frei?“).',
    why: 'Erklärte Regeln werden besser eingehalten.', source: 'Auftrag 18, Punkt 6', where: 'KI-Anweisung, Regel-Coach (dialog.ts), Lexikon „Training verstehen“' }
];

/* kurzer Kontext für den KI-Coach (eine Zeile je Regel) */
export function rulesForAi(): string {
  // kurz: je Regel der erste Satz (die App setzt die Regeln selbst durch, die KI soll sie kennen und erklären können)
  const first = (t: string) => (t.match(/^.*?[.!](?=\s|$)/) || [t])[0];
  return 'Trainingsregeln der App (gelten für jeden Plan; erkläre sie bei Fragen wie „Warum habe ich heute frei?“ mit den Daten des Plans):\n' + KNOWLEDGE.filter(k => k.topic !== 'Coach').map(k => `- ${k.title}: ${first(k.rule)}`).join('\n');
}
export const byId = (id: string) => KNOWLEDGE.find(k => k.id === id) || null;

/* docs/TRAININGSREGELN.md */
export function rulesMarkdown(): string {
  const L: string[] = ['# Trainingsregeln', '', 'Diese Regeln gelten für jeden Plan und alle Nutzer. Der Generator hält sie ein, der Plan-Check korrigiert jeden neuen oder geänderten Plan, bevor man ihn sieht, und der Coach kennt sie. Die Datei entsteht aus `shared/trainingknowledge.ts` (`npx vite-node scripts/trainingsregeln.ts`).', '', 'Markierung: **war schon da** / **verbessert** / **neu** (Stand Auftrag 18).', ''];
  for (const t of TOPICS) {
    const ks = KNOWLEDGE.filter(k => k.topic === t); if (!ks.length) continue;
    L.push(`## ${t}`, '');
    for (const k of ks) {
      L.push(`### ${k.title} (${k.status})`, '', k.rule, '', `- Warum: ${k.why}`, `- Quelle: ${k.source}`, `- Umgesetzt: ${k.where}${k.check ? ` (Prüfung „${k.check}“)` : ''}`, '');
    }
  }
  return L.join('\n');
}
