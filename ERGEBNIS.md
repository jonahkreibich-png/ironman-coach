# Auftrag 26: Ruhiger Start + Farben zum neuen Icon (1.11.)

**Stand:** Punkt 2 (Flackern) ist behoben und als Version 3.14.0 veröffentlicht (erst Test-App, dann echte App, vorher beide gesichert). **Punkt 1 (Design) wartet auf deine Wahl.**

## 1. Design – bitte wählen
Link (am besten auf dem iPhone): https://claude.ai/artifact/SNSLRpqJxcrCQD6DtR4YaT – oben das neue Icon, dann je Variante Heute, Plan, Einheit, Coach, Fortschritt, Mehr, dunkel und hell. Lokal: `design-varianten-2.html`.
- **A Tiefes Petrol:** Hintergrund sehr dunkles Petrol, Akzent Türkis, Orange nur für Wichtiges (Ziel, Wettkampf, neue Nachrichten).
- **B Mitternacht + Petrol:** fast neutral dunkel mit leichtem Blau-Grün-Stich, Akzente Petrol, Orange ganz sparsam.
- **C Ozean:** Verlauf von Petrol (oben) nach fast Schwarz, mattes Glas, Akzent Türkis, Hauptknöpfe Orange.

Ausprobieren: **Test-App → Mehr → Darstellung → Farbvariante**. Mischen ist erlaubt. Alle Varianten erfüllen WCAG AA (auch auf den Glas-Karten), die Ampel bleibt rot/gelb/grün. Nach deiner Wahl baue ich sie überall ein (eine zentrale Farbquelle, Startbilder, Layout-Test hell/dunkel).

## 2. Flackern beim Öffnen – gemessen und behoben
Gemessen in WebKit (Safari-Engine) mit einer Kopie deiner echten Daten auf meinem Rechner, Safari- und Homescreen-Modus, vom Öffnen bis die App ruhig ist.

| Ursache (gemessen) | behoben |
|---|---|
| Weißer Blitz: Das Design kam erst mit dem nachgeladenen App-Code, bis dahin war die Seite weiß | Design lädt mit der Seite |
| Ganze Ansicht 4-mal neu aufgebaut (Start, Verbindungen geladen, 2× nach dem Sync) | nur noch geänderte Teile werden angepasst, sanft |
| 3 Sprünge um 46 px: Ladehinweis und „Wird gespeichert“ blitzten über dem Inhalt auf | Hinweise nur noch, wenn es wirklich länger dauert |
| Neuer Plan vom Server (anderes Gerät, automatische Anpassung) lud die Seite neu | Plan wird ohne Neuladen übernommen |
| Konto und KI-Stand wurden doppelt abgefragt | je einmal |
| Service Worker: lädt beim Öffnen **nicht** neu (Updates erst beim nächsten Start/„Aktualisieren“) | war schon richtig |
| Schriften: laden nicht nach, ändern keinen Text | war schon richtig |

Neue Daten aus dem Sync gleiten jetzt kurz an ihren Platz, statt zu springen.

**Vorher / nachher** (WebKit; erstes Bild = App mit deinen Daten sichtbar):

| | erstes Bild | Neuaufbauten | Verschiebung (CLS) | heller Blitz | Neuladen |
|---|---|---|---|---|---|
| Deine Daten, vorher | 242 ms | 4 | 0,16 | ja | – |
| Deine Daten, nachher (Safari / Homescreen) | 221 / 212 ms | 1 | 0 | nein | nein |
| 1 Jahr Daten, vorher | 254 ms | 3 | 0,11 | ja | ja, bei neuem Plan |
| 1 Jahr Daten, nachher | 231 ms | 1 | 0 (ohne neue Daten) | nein | nein |

Ein iPhone ist langsamer als mein Rechner, die Unterschiede bleiben aber gleich. „Vorher“ im Homescreen-Modus habe ich nicht getrennt gemessen.

**Fester Test:** `tests/e2e/kaltstart26.spec.ts` (Kaltstart mit einem Jahr Daten, mit und ohne Änderung von einem anderen Gerät, und erstes Öffnen) in Chromium und WebKit. In der Test-App fand ich so noch einen Sprung beim allerersten Öffnen, auch behoben. Messwerkzeug: `node scripts/startmessung.mjs`.

---

# Auftrag 25: Icon-Varianten, Mehr-Tab neu, Coach-KI gezielter, Gesamttest (31.10.)

## Nachtrag 3.13.2: neues Icon
- **2a (Petrol)** ist eingebaut: Home-Bildschirm-Icon, Browser-Icon, Android-Icon, alle iPhone-Startbilder hell und dunkel, kleines Zeichen oben in der App.
- **Auf dem iPhone** erscheint das neue Icon erst, wenn du die App neu zum Home-Bildschirm hinzufügst (Anleitung in FUER-JONAH.md).

## Nachtrag 3.13.1
- **Mitteilungen gingen nie:** Der Service Worker (Hintergrund-Teil der App) war seit dem Umbau am 11.10. kaputt, eine Zeile fehlte. In der echten App gab es deshalb keine einzige Mitteilungs-Anmeldung, dazu keinen Offline-Start und keinen Update-Hinweis. Repariert, Server-Antworten werden dabei nie zwischengespeichert. Neue feste Tests prüfen den Service Worker (auch in WebKit/Safari).
- **Verbindungen** stehen jetzt in der Gruppe Einstellungen.
- **Plan-Generator entfernt:** altes Test-Werkzeug, nur du sahst es. Den Plan erstellt der Fragebogen, Profiländerungen planen automatisch neu (gleiche Plan-Logik).
- **Icon-Varianten** als Link: https://claude.ai/artifact/AbEz9tVJufVYtKhXbwdnPt

**Stand:** Punkte 2–4 fertig und live als Version 3.13.0: erst Test-Umgebung (mit echten KI-Fragen geprüft), dann echte App. Vorher beide gesichert; alle 3 Konten laden an einer Kopie der echten Daten fehlerfrei. **Icon: Du wählst** – die 4 Varianten liegen in `icon-varianten.html`. Nach deiner Wahl baue ich das Icon überall ein (Manifest, Icons, Startbilder).

## 1. Icon (wartet auf deine Wahl)
Link: https://claude.ai/artifact/AbEz9tVJufVYtKhXbwdnPt (am besten auf dem iPhone). Je Variante: Homescreen in echter Größe (hell und dunkel), kleine Größen bis 16 px, Startbild.
1. **Welle → Straße** – Schwimmwellen werden zur ansteigenden Straße, am Ende das Ziel
2. **Puls-Bogen** – Herzschlag geht in einen Bogen nach oben über
3. **Tempo-Form** – drei schräge Balken in Schwimm-, Rad- und Lauffarbe
4. **Fortschritts-Ring** – fast geschlossener Ring Schwimmen → Rad → Laufen

## 2. Mehr-Tab
- **Oben:** Suche und Profilkarte mit Name und Bild (Bild wählen/entfernen im Profil, klein gespeichert).
- **Gruppen wie in den iPhone-Einstellungen:** Konto · Training (Profil und Ziele, Berücksichtigungen, Zonen und Tests, Ausrüstung, Trainingsvorlagen, Fragebogen) · Werte und Essen · Verbindungen · Einstellungen (Mitteilungen, Darstellung, Coach und KI, Einheiten, Sprache) · Daten und Datenschutz · Hilfe (Lexikon, Fehler melden / Idee) · Über · Betreiber (nur du).
- **Nichts verloren:** Die alten langen Seiten „Einstellungen“ und „Daten und Geräte“ sind aufgeteilt. Krankheitsphasen und Zyklus stehen jetzt unter Berücksichtigungen, Räder, Hilfsmittel und Laufschuhe unter Ausrüstung. Ein Test prüft, dass jeder alte Bereich noch da ist.
- **Neu:** E-Mail (freiwillig) unter Konto, Liste der Tests aus dem Plan unter Zonen und Tests, Zurück-Wischen auf dem iPhone führt zur Liste.

## 3. Coach-KI
**Analyse (echte Nutzung):** Nur dein Konto nutzt die KI. 27.10.: 3 Fragen, 38.127 Eingabe-Tokens = 12.700 pro Frage, 115 Neurons pro Frage. Ursache: Jede Anfrage enthielt alles (alle 40 Trainingsregeln, alle Daten, 8 lange Werkzeug-Beschreibungen: 5.300 Tokens) und das 2–4-mal pro Frage.

**Woher die schlechten Antworten kamen** (dein Chat 25. und 27.10.):
| Antwort | von | Fehler | behoben |
|---|---|---|---|
| „Auf welches Datum … und warum?“ | KI | fragt nach dem Grund | Regel im Text + feste Bereinigung |
| „Du möchtest den Schwimmtraining verschieben.“ | KI | erfundener Grund im Vorschlag | Grund nur, wenn du einen nennst |
| „Der Schwimmtest vom Samstag“ (war Dienstag) | KI | Wochentag | Tage stehen mit Datum im Text, Prüfung im Code |
| „Was soll ich mit Langer Lauf … machen?“ | Regel-Coach | Grammatik | Titel in Anführungszeichen |
| „finde keinen anderen erlaubten Tag“ bei „auf den 1.11“ | Regel-Coach | Datum als Zahl nicht verstanden | wird verstanden |
| „Lauftest“ → „Lockerer Lauf“ | Regel-Coach | falsche Einheit | „Test“ im Text sucht den Test |
| „bleibt am Sonntag 25.10..“ | Regel-Coach | doppelter Punkt | an einer Stelle für alle Texte bereinigt |
| dreimal „Gute Besserung!“ | Regel-Coach | Wiederholung | nur noch einmal |
Wechsel mitten im Gespräch: Scheitert die KI (z. B. „Änderung ohne Werkzeug“), antwortet der Regel-Coach und behält das Gespräch. Das bleibt so (sicher), passiert aber seltener.

**Jetzt:** kurze Grundanweisung + nur die passenden Daten (heute immer; letzte 7 Tage, nächste Tage, Ampel, Zonen, Schwimmen, Krankheit je nach Frage) + höchstens 3 passende Regeln aus TRAININGSREGELN.md + nur nötige Werkzeuge. Erkannte Fragen (Bewertung, Tagesplan, Form) brauchen **einen** Aufruf.

| | vorher (27.10.) | jetzt (Gemma, 60 Fragen) |
|---|---|---|
| Eingabe-Tokens pro Frage | 12.700 | 1.730 (−86 %) |
| Aufrufe pro Frage | 2,3 | 1,2 |
| Neurons pro Frage | 115 | 18 (−85 %) |
| Fragen pro Tag im Gratis-Kontingent | ~80 | ~530 |

**Modellvergleich** (60 echte Fragen auf einer Kopie deiner Daten vom 30.10.; teure Modelle mit jeder 4. Frage, damit das Tageskontingent für die echten Nutzer reicht; Konto im Gratis-Plan, keine Kosten). Qualität und Richtigkeit habe ich jede Antwort gelesen und bewertet (1–5).

| Modell | Fragen | KI-Antwort (sonst Regel-Coach) | Qualität | Richtigkeit | Werkzeuge | Neurons/Frage | Zeit |
|---|---|---|---|---|---|---|---|
| **Gemma 4 26B** (bleibt) | 60 | 56 | 5 | 4 | 4 | 17,5 | 2,2 s |
| Qwen3 30B | 60 | 57 | 3 | 3 | 3 | 11,4 | 0,9 s |
| Mistral Small 3.1 | 15 | 14 | 3 | 2 | 2 | 71 | 3,0 s |
| Llama 3.3 70B | 15 | 12 | 4 | 3 | 3 | 94 | 3,9 s |
| gpt-oss-20b | 15 | 12 | 4 | 4 | 3 | 43 | 4,1 s |
| GLM 4.7 Flash | 60 | 24 (35× leer) | 2 | 3 | 2 | 25 | 11,5 s |

Typische Fehler: Qwen erklärt Fachbegriffe falsch („Koppeltraining = zwei Läufe“), mischt chinesische Zeichen ein, übersieht die Krankheit; Mistral machte aus „Lauftest verschieben“ die Regel „Laufen: gar nicht“; Llama behauptete erledigte Einheiten, die es nicht gab. **Gemma 4 bleibt:** beste Antworten pro Neuron.

**Allgemein behoben aus dem Vergleich** (wirkt für jedes Modell): Vorschläge nur für den genannten Tag/Sportart/„langen“ Lauf/Test; keine Verschiebung auf denselben Tag; neue Regel nur, wenn du eine willst; „dienstags nicht mehr …“ wird als Änderung erkannt; „ich habe es notiert“ ohne Vorschlag gilt nicht; Krankheit steht bei Tagesfragen dabei; „Ich habe … gekürzt“ wird entfernt, wenn es erst ein Vorschlag ist. Gemma danach (30 Fragen Bewertung/Tag/Änderung): alle Vorschläge richtig, unpassende gehen an den Regel-Coach.

Fragen: `docs/ki-vergleich-25/fragen.json`. Alle Antworten je Modell liegen nur lokal in `data-export/ki-vergleich-25/` (enthalten deine echten Daten, deshalb nicht im Git).

## 4. Gesamttest
`docs/FUNKTIONEN.md`: alle Funktionen und Bildschirme mit Ort und Test.

**Tests:** Unit 2.640 bestanden; E2E (Chromium + WebKit) 403 bestanden, 141 nach Korrektur der zwei Funde (Wort „Server“ im neuen Datenschutz-Text, alte Erwartung „Gute Besserung“) ebenfalls. Neu: 15 Gesamt-Abläufe, 5 Mehr-Tab-Tests, 4 Große-Schrift-Durchläufe, 16 Coach-Unit-Tests. In der Test-Umgebung (stamio-test) zusätzlich geprüft: Laden, Mehr, Zurück-Wischen, 3 echte KI-Fragen.

| Funktion | getestet (wie) | Fehler | behoben |
|---|---|---|---|
| Fragebogen → Plan | E2E: Antworten, Zusammenfassung, Übernehmen, Plan da | – | – |
| Heute, Einheit, Extra-Einheit | E2E: öffnen, abhaken, Messwert, Extra anlegen; Chromium + WebKit | – | – |
| Plan (Wochen, Tag, Heute, Anpassungen) | E2E | Knopf „Anpassungen“ brach bei großer Schrift mitten im Wort | ja |
| Coach (Fragen, Schnellfragen, Änderung, Notizen, KI) | E2E + 150 Gespräche (Unit) + 60 echte KI-Fragen | siehe Punkt 3 | ja |
| Fortschritt (Scores, Trends, Prognose) | E2E | – | – |
| Essen | E2E: Mahlzeit zählt mit | bei großer Schrift auf 320 px: Seite scrollte seitlich, „Foto“ brach im Wort | ja |
| Werte, Wettkampf, Verbindungen (simuliert) | E2E | – | – |
| Mehr (alle Unterseiten), Suche, Bild, E-Mail | E2E: jede Zeile öffnet ihre Seite, nichts verloren | – | – |
| Fehler melden, Export, Konto löschen, Mitteilungen | E2E mit Test-Server | – | – |
| Offline | E2E: ohne Netz abhaken, nach Neustart noch da | – | – |
| Zurück-Wischen (iPhone) | E2E: Verlauf zurück | tat nichts | ja |
| Homescreen-Modus, Safe Area, Tastatur | E2E (WebKit) | – | – |
| Layout 320–430 px, 130 %, hell/dunkel | E2E (WebKit), alle Bildschirme | – | – |
| Große Schrift | E2E neu, alle Bildschirme, 320 + 390 px, hell/dunkel | 3 Funde (oben) | ja |
| Langzeit-Simulation, Zufallstests, Daten-Check | Unit (fest) | – | – |
