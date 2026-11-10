# Auftrag 33: Mitteilungen zuverlässig + Tab-Leiste wie iOS 26 (10.11.)

**Stand:** Umgesetzt und getestet, Version **3.21.0**. **Veröffentlicht** (erst Test-App, dann echte App, vorher beide gesichert; Start-Test mit Kopien eurer Daten: alle drei starten fehlerfrei; 10 Minuten ohne Startfehler). Keine Nutzerdaten verändert. Was du am iPhone tun kannst: FUER-JONAH.md.

## 1. Mitteilungen

**Befund bestätigt** (echte Daten nur gelesen):
- Der Mehr-Tab las einen Stand, der erst auf der Seite „Mitteilungen“ geladen wird → dort stand immer „Aus auf diesem Gerät“.
- **Warum es bei dir immer wieder „inaktiv“ hieß:** Jeder Fehler der Prüfung (kein Netz direkt nach dem Aufwecken, Zeitüberschreitung, Service Worker noch nicht bereit) wurde zu „Erneut erlauben“, obwohl die Anmeldung in Ordnung war. Dazu die neue Geräte-Kennung vom 31.10.: Vom 31.10. bis 08.11. hatte dein iPhone (neue Kennung) **keine** Anmeldung – alle Mitteilungen gingen an die alte Kennung `dev-Bved…` (zuletzt gesehen 31.10.).
- Apple antwortet mit 201, ob die Mitteilung angezeigt wird, wusste niemand.

**Behoben (für alle Nutzer):**
- Stand wird beim Start und beim Öffnen des Mehr-Tabs geprüft; solange: „Wird geprüft …“, nie fälschlich „Aus“. Einmal erlaubt bleibt „An“ (letzter sicherer Stand). „Erneut erlauben“ nur, wenn iOS die Anmeldung wirklich verworfen hat oder die Erlaubnis fehlt.
- **Empfangsbestätigung:** Nach dem Anzeigen meldet das Gerät „angekommen“. Unter Mehr → Mitteilungen: letzte 7 Tage mit „angekommen / angenommen, nicht bestätigt / abgelehnt / Ruhezeit“. Im Admin-Bereich je Nutzer: geplant · gesendet · angenommen · angekommen. „Test senden“ wartet bis zu 30 s und sagt ehrlich, ob die Mitteilung angekommen ist.
- **Alte Kennung desselben Geräts** (7 Tage nicht gesehen, durch neuere ersetzt) bekommt nichts mehr; echte Zweitgeräte bleiben. Deine alte iPhone-Kennung wird mit dem Update aussortiert.
- **Zuverlässig:** Morgen, Erinnerungen, Abend mit Urgency high und Gültigkeit, bis sie nicht mehr passen (Morgen bis 12 Uhr, „1 h vorher“ bis zum Beginn, abends bis zur Ruhezeit). Uhrzeiten und Zeitzone stimmen (geprüft, auch Zeitumstellung). Jede geplante Mitteilung geht **genau einmal** raus, auch wenn zwei Läufe gleichzeitig arbeiten.
- **Adduktoren-Erinnerung** war nicht berechtigt: Sie kam jedem Fußballer Mo/Mi/Fr. Bei dir ist keine Beschwerde eingetragen. Jetzt nur noch, solange eine Leisten-/Adduktoren-Beschwerde aktiv ist (Berücksichtigung oder Schmerz-Notiz der letzten 7 Tage).

**Deine Geräte, letzte 7 Tage** (vor 3.21 wurde „angekommen“ noch nicht gemessen; die Antwort von Apple erst seit 08.11.):
| Tag | geplant | gesendet | von Apple angenommen | angekommen |
|---|---|---|---|---|
| Di 04.11. | Morgen 07:00, Adduktoren 20:00, Vorabend 21:00 | 3 – nur an alte Kennung | nicht gespeichert | nicht gemessen |
| Mi 05.11. | Morgen 07:00, Abend 20:30, Vorabend 21:00 | 3 – nur an alte Kennung | nicht gespeichert | nicht gemessen |
| Do 06.11. | Morgen 07:00, Adduktoren 20:00, Abend 20:30 | 3 – nur an alte Kennung | nicht gespeichert | nicht gemessen |
| Fr 07.11. | Morgen 09:00, Abend 20:30, Vorabend 21:00 | 3 – nur an alte Kennung | nicht gespeichert | nicht gemessen |
| Sa 08.11. | Morgen 09:00, Woche 19:30, Abend 20:30, Test 22:55 | 4 (Test an beide Kennungen) | Test: 2 von 2 | nicht gemessen |
| So 09.11. | Morgen 07:10, Adduktoren 20:00 | 2 | 2 von 2 | nicht gemessen |
| Mo 10.11. | Morgen 07:10 | 1 | 2 von 2 | nicht gemessen |

**Wenn eine Mitteilung „angenommen“, aber nicht „angekommen“ ist** (am iPhone prüfen):
1. Einstellungen → Mitteilungen → Stamio: „Mitteilungen erlauben“, Sperrbildschirm, Mitteilungszentrale und Banner an.
2. Einstellungen → Fokus: bei Schlafen/Schule/Nicht stören Stamio erlauben.
3. Einstellungen → Mitteilungen → „Zeitplan für Übersicht“: Stamio auf „Sofort“, nicht in die Übersicht.
4. Stamio nur vom Home-Bildschirm öffnen (nicht in Safari). Wurde die App vom Home-Bildschirm gelöscht und neu hinzugefügt, einmal „Erneut erlauben“.

## 2. Tab-Leiste wie iOS 26 (Fitness-Video Bild für Bild)
Beide Videos mit ffmpeg zerlegt (10 und 60 Bilder/s, Leiste in voller Auflösung), gemessen und nachgebaut. Messwerte und Vergleich: `docs/tabbar-ios26.md`; Einzelbilder nebeneinander: `docs/tabbar-ios26/vergleich-bilder.png`; Video nebeneinander: `docs/vergleich/vergleich-tableiste.mp4` (lokal, nicht in Git).

**Wichtig:** Im Fitness-Video bleibt die Leiste beim Scrollen voll – sie klappt **nicht** zu einem Knopf zusammen (das macht z. B. Apple Musik). Ich habe nach deinem Video gebaut.

| Fehler | Ursache | Jetzt | Test (scheiterte vorher) |
|---|---|---|---|
| nach dem Scrollen mehrere Tipps, Ruckeln | Leiste schrumpfte, erster Tipp vergrößerte nur | Leiste bleibt voll, 1 Tipp = Wechsel | nach Scrollen 1 Fingertipp → Tab gewechselt |
| doppelte Beschriftung beim Überscrollen | Linse + Kopie der Tabs in eigener Ebene, verschoben gegen die Leiste | Linse in der Leiste, keine Kopie | Überscrollen oben/unten: Bild der Leiste identisch, jede Beschriftung einmal |
| Flackern / klein-groß bei schnellen Wechseln | Hochspringen und Neu-Ausmessen lösten Schrumpfen aus | kein Schrumpfen, Neu-Messen ohne Folgen | 20 schnelle Wechsel: feste Ebene in jedem Bild gleich, kein Springen |
| „Fortschritt“ ragt aus der Linse | Linse zu groß/rund, Schrift fest | Markierung = Tab-Fläche, Schrift passt sich an | alle Tabs: Deutsch, Englisch, große Schrift, quer |

**Wie im Video:** Ruhe = flache dunkle Markierung. Berühren → hebt sich sofort als klarer Glastropfen (1,2× breit, ragt über die Leiste, vergrößert den Inhalt), gleitet gedehnt, schwingt nach, legt sich nach ~0,3 s flach. Halten/Ziehen: Tropfen folgt dem Finger, länger beim schnellen Ziehen, gestaucht beim Bremsen; die Leiste gibt etwa 3 % nach und federt kräftig zurück. Nur transform/opacity, „Bewegung reduzieren“ beachtet, keine Verschiebung nach Drehen oder App-Wechsel.
**Flüssig:** 16 ms je Bild (60 fps) in Chromium und WebKit. Dafür liegt der Weichzeichner auf einer eigenen, festen Ebene (sonst fiel in WebKit jedes 2.–3. Bild aus). Grenze: echte Lichtverzerrung kann Safari im Web nicht – angedeutet mit Kante, Farbrändern, Glanz und Vergrößerung.

## 3. Beim Testen gefunden: Eingabe ging manchmal verloren (alter Fehler)
Ändert man zwei Dinge schnell hintereinander (z. B. „Auch in der Schule ruhig“ an und sofort die Uhrzeit), konnte die zweite Eingabe verschwinden: Sie ging ohne Ausgangsstand zum Server und verlor gegen einen gleichzeitigen Schreibvorgang des Server-Coachs. Das gab es schon in 3.20.0 (gleicher Test dort ~1 von 8 rot). Jetzt führt der Server beide Änderungen feldweise zusammen; Gegenprobe 25 von 25 grün, dauerhafter Test dazu.

## 4. Was vorhanden war, was neu ist
- **Verbessert:** Prüfung der Anmeldung (`sync.ts`), Versand (`notify.ts`: einmal, Urgency/TTL, alte Kennungen), Seite Mitteilungen und Admin-Karte, Service Worker, Tab-Leiste (`tablens.ts`, gleiche Schnittstelle).
- **Neu, weil es fehlte:** Tabelle `push_deliveries` (Stand je Mitteilung und Gerät) und `POST /api/push/receipt` (Bestätigung vom Gerät ohne Geräte-Schlüssel, mit Einmal-Schlüssel je Mitteilung).
- **Tests:** Server `push33.mjs` (29 Prüfungen, 20 davon scheiterten mit dem alten Code), Unit `auftrag33-push.test.ts`, `sw.test.ts` (Empfang), Browser `auftrag33-push.spec.ts`, `auftrag33-tabbar.spec.ts` (WebKit + Chromium mit Touch), angepasste `tabbar.spec.ts`, `auftrag31-push.spec.ts`. Vor der Veröffentlichung: Typprüfung, 3.219 Unit-/Server-Tests und 710 Browser-Tests grün.
