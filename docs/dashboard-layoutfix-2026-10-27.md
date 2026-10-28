# Dashboard-Layoutkorrektur – 27.10.2026

Die 14 gemeldeten Layoutfehler haben dieselbe Ursache: Das Unicode-Pfeilzeichen im neuen Dashboard-Schalter laeuft in WebKit bei 320/300 CSS-Pixeln um 3 bis 5 Pixel aus seinem eigenen Kasten. Bei 300 Pixeln bricht ausserdem Trainingsdashboard mitten im Wort um. Alle gelieferten Fehlerkontexte wurden ausgewertet.

Korrektur ausschliesslich in Dashboarddarstellung, dessen Schalter und zugehoerigem CSS:

- Bestehendes SVG-Pfeilicon statt fontabhaengigem Textzeichen, feste Breite 18 Pixel ohne Schrumpfen.
- Eigener flexibler Titelbereich mit Umbruch an Wortgrenzen und angepasster Schriftgroesse auf kleinen Ansichten.
- Pfeilrichtung folgt aria-expanded per CSS; der Klickhandler veraendert keinen Text mehr.
- Ein-/Ausklappen und gespeicherte Auswahl bleiben erhalten. Keine Speicher-, API- oder Datenbankaenderung in diesem Korrekturschritt.

Nachweise bisher: neuer Browser-Regressionstest reproduziert vor der Korrektur beide Fehler bei 300 Pixeln in WebKit. Nach Korrektur bestehen beide Browserprojekte fuer 300/320/375/390 Pixel, hell/dunkel und offen/geschlossen. Typecheck, Build und elf Dashboard-/Zusammenfassungs-Unitpruefungen bestanden.

Vollstaendiger gezielter Browserlauf abgeschlossen: 69 bestanden, 51 unveraendert vorgesehene Chromium-Layout-Skips, Exit 0, Laufzeit 6,0 Minuten. Darin bestehen alle 51 vorhandenen WebKit-Layoutpruefungen, einschliesslich aller 14 gemeldeten Fehlerfaelle, sowie 16 Extraeinheitenpruefungen und zwei neue Titelregressionen in Chromium/WebKit. layout.spec.ts und dessen Assertions bleiben unveraendert. Kein Deployment in diesem Schritt; bestehende Produktionsfreigabe bleibt gueltig, Freigabetests werden nicht umgangen.

Die lokale HTTP-Minimalprobe scheitert weiterhin mit EACCES. Die Browserpruefung verwendet deshalb denselben isolierten In-Prozess-Transport wie zuvor. Kein gruener kompletter regulaerer Standardlauf wird behauptet. Fuer diesen reinen UI-Fix wurden Typecheck, Build, elf betroffene Unitpruefungen und die gesamte Layoutmatrix erneut ausgefuehrt; der zuvor protokollierte Standardlauf und seine HTTP-Blockade bleiben in docs/dashboard-extra-2026-10-27.md dokumentiert.

Jonahs Produktionsfreigabe gilt weiterhin. Restschritt ausserhalb dieser Sitzung: node "C:\Users\Anwender\Downloads\ironman-coach-app\ironman-coach\scripts\veroeffentlichen.mjs". Der Helfer wiederholt die vollstaendigen Standardtests, validiert Sicherungen und veroeffentlicht/prueft erst die Testseite, danach die echte App; Fehler stoppen den Ablauf.
