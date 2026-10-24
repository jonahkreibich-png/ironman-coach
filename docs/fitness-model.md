# Fitnesswerte: Bedeutung und Grenzen

Die Sportwerte beschreiben die zuletzt beobachtete Fähigkeit auf der bisherigen festen Skala. Sie sind keine medizinisch validierte Leistungsdiagnostik. 50 steht weiter für das bisherige Hobbysport-Niveau; 100 ist keine harte Obergrenze. Gleiche Zahlen verschiedener Sportarten sind Orientierung, keine physiologisch gleichwertigen Leistungen.

## Messungen zusammenfassen

- Laufen: Schwellen-Pace aus geeigneten harten Abschnitten oder vorsichtiger aus lockerem Tempo und Puls. Rad: bevorzugt FTP, sonst Schwellen-Geschwindigkeit mit bisheriger Radtyp-Umrechnung. Schwimmen: bisherige CSS-Schätzung, kontinuierliche Strecke und Zugtechnik.
- Zuerst wird innerhalb jeder Aktivität ein gewichteter Median gebildet. Anschließend stimmen Aktivitäten ab. Vierzig identische Runden eines Trainings sind damit keine vierzig unabhängigen Messungen. Doppelte Aktivitäts-IDs und zusammengeführte Originale zählen nicht nochmals.
- Der gewichtete Median begrenzt den Einfluss einzelner Ausreißer. Er garantiert keine Richtigkeit bei wenigen oder systematisch falschen Messungen. Nicht endliche Werte werden verworfen; eine nicht endliche Dauer wird nicht als Ausdauer-Rekord gewertet.
- Einheiten im letzten Messfenster werden mit einer Halbwertszeit von 42 Tagen relativ zur jüngsten Einheit gewichtet. Krankheit und die beiden Folgetage halbieren das Gewicht. Die Zahlen sind transparente Produkt-Heuristiken, keine individuell bestimmte Anpassungskurve.
- Profil-Schwellen dienen als Startwert, solange keine passende Aktivitätsmessung vorliegt. Das Profil wird nicht jeden Tag als frischer Test in die Messreihe geschrieben. Ein einzelnes neues Ergebnis kann daher den Startwert ersetzen; seine Sicherheit bleibt niedrig.

## Keine doppelte Bewertung

Bei Laufen und Rad fließt die aus lockerem Tempo/Puls geschätzte Schwelle bereits in den Hauptwert ein. Die Effizienz bleibt als Erklärung sichtbar, hat aber kein zusätzliches Score-Gewicht. Hauptleistung zählt 65 %, nachgewiesene Ausdauer 20 %, Entkopplung 15 %. Fehlende Teile werden aus dem gewichteten Mittel herausgenommen. Unbekannte Kraulstrecke ist kein gemessener Nullwert; ausdrücklich eingetragene null Meter bleiben null.

Die anderen Bausteine können ebenfalls zusammenhängen. Diese Gewichtung beseitigt die direkte Doppelzählung gleicher Tempo/Puls-Daten, nicht sämtliche physiologischen Korrelationen. Ausdauer und Entkopplung sind ergänzende Indikatoren und keine unabhängigen Labortests.

## Ruhetage und Sicherheit

Das Messfenster umfasst 42 Tage vor der letzten verwertbaren Sporteinheit. Ohne neue Sporteinheit bleibt die geschätzte Fähigkeit bestehen; ein langer Lauf fällt an einem Ruhetag nicht plötzlich heraus. Neue Einheiten verschieben das Fenster. Das ist bewusst eine Schätzung der zuletzt belegten Fähigkeit, keine Behauptung, Fitness bleibe bei einer langen Pause unverändert.

Die Sicherheit nimmt dagegen mit der tatsächlichen Zeit seit der letzten Leistungsmessung exponentiell ab, ebenfalls mit 42 Tagen Halbwertszeit. Sie berücksichtigt Mess-Tage statt Rundenanzahl, Aktualität, geringeres Gewicht indirekter Schätzungen, Quellenqualität, Abdeckung der Teilwerte und robuste Streuung. Ohne Aktivitätsnachweis bleibt nur ein sehr unsicherer Profil-Startwert. Der Sicherheitswert ist keine statistisch kalibrierte Wahrscheinlichkeit.

Akute Müdigkeit, Tagesform und Trainingslast werden nicht vom Sportwert abgezogen. Belastung und Erholung gehören in die getrennte Belastungsdarstellung. Verbesserungen entstehen durch neue Leistungsdaten; mehr Training allein beweist noch keine schnellere Schwelle.

## Historische Werte und verbleibende Unsicherheit

Aktivitäten nach dem jeweiligen Stichtag zählen nicht. Eine Profil-Aktualisierung mit bekanntem `thresholds.trendAt` wird vor diesem Datum nicht als damals bekannte Schwelle benutzt. Die Alterskorrektur verwendet den historischen Stichtag. Für undatierte Profilwerte, Gewicht, Radtyp und Fähigkeiten existiert bisher keine vollständige Versionshistorie; historische Verläufe können daher nicht vollständig gegen spätere Profiländerungen abgeschirmt werden.

Die bisherigen Formeln für Pulsanteile, Hitze, Höhenmeter, Alters-/Geschlechtskorrektur, CSS und Wattfaktoren bleiben Näherungen. Wind, Untergrund, Messfehler, Medikamente, Schwimmhilfen und Technik können Ergebnisse verzerren. Ein Labor- oder standardisierter Feldtest ist aussagekräftiger.

Kraft hat bislang keine verlässlich zugeordneten Übungen, Wiederholungen und Lasten als Zeitreihe. Deshalb zeigt der bestehende Kraftwert vor allem Regelmäßigkeit, keine gemessene Maximalkraft. Ein unspezifischer `liftKg`-Wert wird nicht aus irgendeinem Eingabefeld erfunden. Geplante Vorlagen mit `completed: false` zählen weder als Einheit noch als Fitnessbeleg; ältere manuelle Einträge ohne dieses neue Feld bleiben kompatibel.

## Automatische Prüfung

`tests/unit/fitness-quality.test.ts` prüft Runden-Doppelzählung, stabile Fähigkeit bei Pause mit sinkender Sicherheit, unbekannte Schwimmdaten, leere Einträge, historische Profilgrenzen, Profil-Startwerte, fehlende Effizienz-Doppelzählung, ungültige Dauer und unerledigte Kraftvorlagen. Die vorhandenen Score- und Planfortsetzungs-Tests bleiben maßgeblich für Skalen, Marken und Erhalt bei Planwechsel.

## Auftrag 20: Datenqualität, Startwert, Grenzen

- Datenqualität je Wert: Watt zählen nur von einem Wattmesser (draußen, `powerMeter`) oder einem Smart-Trainer (drinnen, `trainerType: 'smart'`). Die Geschwindigkeit von der Rolle zählt nie. Laufband-Pace hat 1,6-fache Unsicherheit. GPS-Fehler (Lauf über 23 km/h, Rad über 52 km/h im Schnitt, unmögliche Strecke/Zeit) zählen nicht, auch nicht für das Messfenster. Unter 80 % der Schwelle wächst die Unsicherheit der Puls-Hochrechnung, unter 60 % zählt die Einheit nicht. Ein nur geschätzter Schwellenpuls macht alle Puls-Werte 1,3-mal unsicherer.
- Startwert: Profilwert (Test, Trend, Bestzeit) oder vorsichtige Schätzung aus Erfahrung und Alter, immer mit eigener Unsicherheit (laufende Schätzung in `shared/scorefilter.ts`, `runFilter20`). Bis 5 brauchbare Einheiten oder ein Test da sind, ist der Wert „vorläufig“ (Bereich mindestens ±5) und eine Einheit verschiebt den Hauptwert höchstens um 8 Punkte.
- Ausreißer (über 2,5 Standardabweichungen) zählen gedämpft, bis ein zweiter ähnlicher Wert (±3 %, innerhalb 6 Wochen) kommt. Ohne Test bewegt sich ein belegter Hauptwert höchstens ±4 Punkte (Score etwa ±3) in 7 Tagen. Tests und Wettkämpfe (gesund) zählen voll.
- Obergrenze ohne Test für Hochrechnungen aus lockeren Einheiten: unter 15 Einheiten in der Sportart Lauf-Niveau + 12 (mindestens 50), 15-39 Einheiten + 25 (mindestens 65), ab 40 keine.
- „Warum?“ nennt je Einheit gezählt, gedämpft, bestätigt, begrenzt, gedeckelt oder ignoriert mit Grund. Die Rechnung von Auftrag 19 bleibt 4 Wochen zum Vergleich (`legacy`).
