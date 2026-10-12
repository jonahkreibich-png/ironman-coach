# Für Jonah

Nur das, was wirklich noch nötig ist. Test-App: **https://stamio-test.pages.dev** (Version 2.2.0). Die echte App läuft unverändert weiter.

## 1. Papa neu starten lassen (5 min)

Papa ist auf dem Server zurückgesetzt: seine Geräte bleiben angemeldet, die App startet bei ihm mit dem Fragebogen.
1. Papa öffnet die Test-App auf seinem iPhone (vom Home-Bildschirm). Sie zeigt den Fragebogen.
2. Neu im Fragebogen: das **Wochenraster** (Teil „Zeit und Alltag“) und Sätze in eigenen Worten (Teil „Berücksichtigungen“), z. B. „kann mittwochs nicht laufen, nur Samstag oder Sonntag“. Die App zeigt, was sie verstanden hat, er tippt „Stimmt“.
3. Bitte ihn, Fehler wieder über **Mehr → „Fehler melden / Idee“** zu schicken. Du bekommst dann sofort eine Mitteilung.
4. Unter Mehr → Daten und Geräte → „Wiederherstellung“ kann er sich einen **Wiederherstellungscode** erzeugen und aufschreiben (falls er das Handy wechselt).

## 2. Mitteilungen auf deinem iPhone erlauben (2 min)

Damit dich neue Meldungen erreichen: Test-App vom Home-Bildschirm → Mehr → Einstellungen → Mitteilungen → „Mitteilungen erlauben“ → „Test senden“. Neue Meldungen siehst du unter Mehr → „Fehler melden / Idee“ → Posteingang. „Als Text kopieren“ gibt dir die Meldung fertig für Claude Code.

## 3. Weitere Tester einladen (1 min pro Person)

Mehr → Daten und Geräte → Nutzer → Name eintragen → „Test-Nutzer anlegen“ → **„Link teilen“** (z. B. per WhatsApp). Auf dem iPhone öffnet der Tester den Link in Safari, legt die App auf den Home-Bildschirm und tippt dort „Einladung aus der Zwischenablage einfügen“. Danach kommt eine kurze Begrüßung und der Fragebogen.

## 4. Noch offen von vorher

- **App-Schlüssel der Anbieter** (Oura, Dropbox, WHOOP, Polar, Withings), nur für Dienste, die du oder ein Tester wirklich nutzt: Anleitung je Dienst in [VERBINDUNGEN.md](VERBINDUNGEN.md), Schlüssel setzen mit `node scripts/set-secret.mjs NAME`, prüfen mit `node scripts/check-secrets.mjs`. Garmin, COROS, Suunto, Wahoo laufen ohne Schlüssel über intervals.icu.
- **E-Mail bei Meldungen:** geht nur mit eigener Domain (kostet Geld, siehe SPAETER.md). Bis dahin nur Mitteilungen. Du musst nichts bestätigen.

## Freigeben (wenn du zufrieden bist)

„Freigeben“ zu Claude sagen. Claude führt `scripts/release.md` aus. Die echte App bleibt bis dahin unverändert.
