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

## 4. Funktionen pro Nutzer schaltbar (vorbereitet)

Die Tabelle `users` hat ein Feld `features` (JSON), `/api/me` liefert es an die App. Damit lassen sich neue Funktionen erst für einzelne Tester freischalten, z. B. `{"ai": true, "generator": true}`, bevor sie im Store für alle kommen.

## 5. Reihenfolge, falls es so weit ist

1. Testphase mit Einladungen abschließen, Rückmeldungen einarbeiten.
2. Fehlendes ergänzen: Konto löschen, Datenschutzerklärung, Impressum, Support-Adresse.
3. Capacitor-Hülle, HealthKit-Plugin, TestFlight mit wenigen Testern.
4. Store-Einträge (Texte, Screenshots aus `scripts/screens.mjs`), Review.
5. Erst danach: KI-Coach für alle (Kosten pro Nutzer siehe SPAETER.md) und ggf. ein Bezahlmodell – Achtung: Für den Oura-Zugang darf kein Geld verlangt werden.
