# Store-Plan (AUFTRAG-3, Teil F: nur Bericht, nichts umgesetzt)

Frage: Was bräuchte es, um die App später in App Store und Google Play anzubieten? Es wurde nichts gekauft und nichts beantragt.

## 1. Technischer Weg

| Weg | Aufwand | Vorteile | Nachteile |
|---|---|---|---|
| **Capacitor-Hülle um die bestehende Web-App** (empfohlen) | 1–2 Wochen | gleicher Code wie jetzt; HealthKit, Health Connect, echte Hintergrund-Abrufe, zuverlässigere Mitteilungen | Mac mit Xcode nötig, App-Review |
| React Native / Swift neu | Monate | ganz native Bedienung | alles doppelt, kein Mehrwert für den Inhalt |
| PWA bleibt (heute) | 0 | sofort, kostenlos | Installation über Safari-Menü, kein HealthKit, Push nur in der installierten App |

Mit Capacitor bleiben `web/`, `shared/` und der Server unverändert. Neu wären `capacitor.config.ts`, ein HealthKit-Plugin (liest dieselben Werte wie der Kurzbefehl und schickt sie mit Quelle `healthkit` an den Server – die Quelle ist im Datenmodell schon vorgesehen) und Health Connect für Android.

## 2. Konten und Kosten

| Posten | Kosten |
|---|---|
| Apple Developer Program | 99 $/Jahr |
| Google Play Console | 25 $ einmalig |
| Mac für Xcode (falls keiner da ist) | vorhandenen nutzen oder Cloud-Mac (~20–30 $/Monat) |
| Eigene Domain für Datenschutzerklärung und Support | 10–20 €/Jahr |

## 3. Was Apple und Google verlangen

- **Gesundheitsdaten (HealthKit/Health Connect):** Zweck klar erklären, nicht für Werbung nutzen, nicht verkaufen, Datenschutzerklärung als Webseite. Apple prüft Gesundheits-Apps genauer.
- **Datenschutz-Angaben** („Nutzungsdaten“ bzw. „Datensicherheit“): welche Daten, wofür, verschlüsselt, löschbar. Konto löschen muss in der App möglich sein (fehlt noch: „Konto und alle Daten löschen“).
- **KI-Funktionen:** Kennzeichnung, dass Antworten von einer KI kommen, Möglichkeit, problematische Antworten zu melden.
- **Altersfreigabe:** realistisch 12+/13+. Die Schutzmechanismen für Minderjährige gibt es schon (keine Gewichtsziele, vorsichtigere Steigerung, Eltern-Einwilligung für KI und Oura).
- **Keine Heilversprechen:** kein Medizinprodukt; Texte zu Krankheit und Schmerz verweisen an Ärzte (umgesetzt).
- **Anmeldung:** Heute nur Codes (Einrichtung, Kopplung, Einladung) – zulässig. Kommen Logins über andere Anbieter dazu, verlangt Apple meist auch „Mit Apple anmelden“.

## 4. Freischaltungen pro Nutzer (umgesetzt)

- Der Betreiber (Admin) hat immer alle Funktionen: KI-Coach, Essen per Foto, Plan-Generator.
- Andere Nutzer bekommen sie einzeln. Heute schaltet der Betreiber sie unter **Mehr → Daten und Geräte → Nutzer und Freischaltungen** frei (z. B. für Tester kostenlos).
- Später: ein Kauf im Store (Google Play Billing / Apple In-App-Kauf) setzt dieselbe Freischaltung. Dafür braucht es nur einen Server-Endpunkt, der den Kaufbeleg bei Google/Apple prüft und dann `features` setzt. Google und Apple behalten 15 % (kleine Entwickler) des Preises.
- Preis sollte die KI-Kosten decken (ca. 1 $ pro aktivem Nutzer und Monat, SPAETER.md).

## 5. Reihenfolge, falls es so weit ist

1. Testphase mit Einladungen abschließen, Rückmeldungen einarbeiten.
2. Fehlendes ergänzen: Konto löschen, Datenschutzerklärung, Impressum, Support-Adresse.
3. Capacitor-Hülle, HealthKit-Plugin, TestFlight mit wenigen Testern.
4. Store-Einträge (Texte, Screenshots aus `scripts/screens.mjs`), Review.
5. Erst danach: KI-Coach für alle (Kosten pro Nutzer siehe SPAETER.md) und ggf. ein Bezahlmodell – Achtung: Für den Oura-Zugang darf kein Geld verlangt werden.

## 6. Privatsphäre gegenüber dem Betreiber (Auftrag 5 E2, umgesetzt)

- **Was der Betreiber sieht:** von anderen Nutzern nur Name, Status (Test-Nutzer, Freischaltungen), App-Version, Zahl der Geräte und wann zuletzt aktiv, Zahl der Meldungen, die Meldungen selbst (Text, Bildschirm, Version, Gerät, optional Screenshot) und Fehlertexte der App (ohne Zahlen, ohne Gesundheitsdaten).
- **Was er nicht sieht:** Trainingsplan, Einheiten, Morgenwerte, Profil, Ziele, Essen, Verbindungen. Ausnahme: Ein Nutzer kreuzt bei einer Meldung „Trainingsdaten für diese Meldung freigeben“ an; dann gehen nur für diese Meldung Plan der Woche, Regeln und Ampel mit.
- **Geprüft im Server, nicht nur in der Oberfläche:** Jeder Lese-Endpunkt arbeitet ausschließlich mit der Nutzer-Nummer des angemeldeten Geräts; es gibt keinen Parameter, mit dem der Betreiber fremde Datensätze abrufen kann. Die Betreiber-Endpunkte geben nur die oben genannten Felder zurück. Ein Server-Test (`server/test/account.test.ts`) sucht in allen Antworten an den Betreiber nach Gesundheits- und Trainingsfeldern.
- **Datenexport und Löschen:** „Meine Daten als Datei“ (alles Eigene als JSON) und „Konto löschen“ (sofort alles, Verbindungen getrennt, nächtliche Sicherungen nach 30 Tagen) sind unter Mehr → Daten und Geräte. Für den Store nötig, für die DSGVO (Art. 15, 17, 20) ebenfalls.
- **Technisch kann der Betreiber die Datenbank lesen** (Cloudflare-Konto). Für einen Store-Start gehört das in die Datenschutzerklärung; eine Ende-zu-Ende-Verschlüsselung der Gesundheitsdaten wäre der nächste Schritt (macht aber Server-Funktionen wie Mitteilungen und Coach-Engine aufwendiger).

## 7. Wachstum: 100 und 1.000 Nutzer mit je 1 Jahr Daten (Auftrag 21)

**Grundlage:** gemessen an der echten Datenbank vom 28.10. (Jonah, 1 Monat) und hochgerechnet. Gratis-Kontingente Cloudflare (Stand Oktober 2026, bitte vor einer Umstellung kurz in der Cloudflare-Übersicht prüfen): Workers 100.000 Aufrufe/Tag und 10 ms Rechenzeit je Aufruf; D1 500 MB je Datenbank, 10 Datenbanken, 5 Mio. gelesene und 100.000 geschriebene Zeilen/Tag; Workers AI 10.000 Neurons/Tag; 5 Zeitpläne; Pages-Aufrufe unbegrenzt.

**Gemessen je Nutzer:** Datensätze 2,3 MB nach 1 Monat, davon 1,4 MB doppelte Schwimm-Hinweise (jetzt aufgeräumt), Plan 0,46 MB, Anpassungen 0,3 MB; Server-Sicherung bisher 30 volle Kopien (~0,65 MB je Tag); etwa 450 Datensätze.

| je Tag / Größe | 100 Nutzer | 1.000 Nutzer | Gratis-Grenze | Stand |
|---|---|---|---|---|
| Datenbank-Größe Datensätze (1 Jahr, ~9 MB/Nutzer) | 0,9 GB | 9 GB | 0,5 GB je Datenbank | **Engpass** |
| Server-Sicherungen (vorher 30 Kopien) | 2,7 GB | 27 GB | (in derselben Datenbank) | **Engpass**, verkleinert |
| gelesene Zeilen: Zeitplan (vorher alle 30 min alle Daten) | ~11 Mio. | ~110 Mio. | 5 Mio. | **Engpass**, behoben |
| gelesene Zeilen: Coach nach jeder Eingabe (3× Daten laden) | ~6 Mio. | ~60 Mio. | 5 Mio. | **Engpass** |
| Worker-Aufrufe (App: ~30/Tag, Zeitplan 288) | ~3.300 | ~30.300 | 100.000 | ok |
| Rechenzeit Zeitplan (alle Nutzer in einem Lauf) | zu viel | zu viel | 10 ms je Aufruf | **Engpass**, verteilt |
| Workers AI (Coach-Chat, ~3 Fragen/Tag bei 20 % der Nutzer) | ~1.500 Neurons | ~15.000 Neurons | 10.000 | Engpass ab ~700 Nutzern |
| Abrufe intervals.icu / Dropbox | 1 Abruf je Nutzer alle 30 min | dito | Anbieter-Grenzen je Nutzer-Schlüssel | ok (je Nutzer eigener Zugang) |
| Ladezeit App-Start (Auswertung 1 Jahr) | ~0,4 s | ~0,4 s | – | ok (läuft auf dem Gerät) |

**Schon umgesetzt (kostenlos):**
1. Zeitplan verteilt die Nutzer auf sechs 5-Minuten-Läufe (je Lauf ein Sechstel der Last).
2. „Neue Daten?“ liest 1 Zeile (Datenstand-Zähler) statt alle Einheiten; Hinweise nach dem Abruf nur bei neuen Daten oder morgens.
3. Server-Sicherung nur bei Änderungen; 7 Tage täglich, danach nur Sonntage bis 30 Tage (statt 30 voller Kopien).
4. Doppelte Coach-Meldungen werden gelöscht; entschiedene Vorschläge verlieren nach 7 Tagen den kompletten Bauplan (Jonah: −1,4 MB).
5. Fehlerprotokoll fasst bis 5.000 Einträge gruppiert im Betreiber-Posteingang zusammen (auch Server-Fehler ohne Nutzer).

**Nächste Schritte, wenn es so weit ist (in dieser Reihenfolge, alle kostenlos):**
1. **Ab ~50 Nutzern:** Sicherungen aus D1 in R2 verschieben (R2 gratis: 10 GB) und komprimiert speichern (etwa ein Zehntel).
2. **Ab ~50 Nutzern:** Coach nach Eingaben bündeln: höchstens ein Lauf je Nutzer und 5 Minuten, Daten nur einmal laden (heute dreimal).
3. **Ab ~50 Nutzern (500 MB):** Nutzer auf mehrere D1-Datenbanken verteilen (10 × 500 MB gratis = 5 GB, reicht für ~500 Nutzer mit 1 Jahr Daten); alte Anpassungen (älter als 8 Wochen, schon vorbei) und alte Chat-Verläufe (älter als 1 Jahr) verkleinern.
4. **Ab ~700 Nutzern:** Workers AI nur noch für Chat-Fragen, Umformulieren aus; Tagesgrenze je Nutzer senken.
5. **Ab ~1.000 Nutzern:** Workers Paid (5 $/Monat: 10 Mio. Aufrufe, 30 s Rechenzeit, D1 25 Mrd. gelesene Zeilen/Monat, 10 GB je Datenbank). Erst dann – nichts kaufen ohne Jonahs Entscheidung.
