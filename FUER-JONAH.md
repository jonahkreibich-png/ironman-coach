# Für Jonah

Nur die Schritte, die wirklich noch nötig sind. Die echte App läuft währenddessen ganz normal weiter.
Test-App: **https://stamio-test.pages.dev** · Zugangscodes: `ZUGANG.local.md` (nur auf deinem PC, nicht im Repo).
Alle Befehle im Ordner `ironman-coach` ausführen.

## 1. Verbindungen (am wichtigsten)

**Warum „Verbinden“ nicht ging:** Für Oura, Dropbox, WHOOP, Polar und Withings fehlen auf dem Server die App-Schlüssel der Anbieter. Das kannst nur du anlegen (kostenlos). Details je Dienst: [VERBINDUNGEN.md](VERBINDUNGEN.md). Garmin, COROS, Suunto und Wahoo brauchen nichts von dir: die laufen jetzt über intervals.icu (Anleitung steht in der App).

**So setzt du einen Schlüssel (immer gleich, 30 Sekunden):** Wert beim Anbieter kopieren, dann
```bash
node scripts/set-secret.mjs NAME_DES_SCHLÜSSELS
```
Das Skript nimmt den Wert aus der Zwischenablage (kein Einfügen im Terminal nötig). Zum Schluss prüfen:
```bash
node scripts/check-secrets.mjs
```
Den Status siehst du auch in der App unter Mehr → Verbindungen → „Server-Schlüssel“.

Du brauchst nur die Dienste, die du oder ein Tester wirklich nutzt.

**1a. Dropbox für HealthFit (10 min)**
1. https://www.dropbox.com/developers/apps → „Create app“ → **Scoped access** → **App folder** → Name z. B. `stamio-test-jonah`.
2. Tab *Permissions*: Haken bei `files.metadata.read`, `files.content.read`, `account_info.read` → „Submit“.
3. Tab *Settings*: Redirect URI `https://stamio-test.pages.dev/api/connect/dropbox/callback` → „Add“. Webhook URI `https://stamio-test.pages.dev/api/hooks/dropbox` → „Add“.
4. „App key“ kopieren → `node scripts/set-secret.mjs DROPBOX_APP_KEY`. „App secret“ (Show) kopieren → `node scripts/set-secret.mjs DROPBOX_APP_SECRET`.

**1b. Oura (10 min)** – du bist unter 18: laut Oura-Bedingungen vorher **mit deinen Eltern klären**.
1. https://cloud.ouraring.com/oauth/applications → „New Application“.
2. Name `Stamio Test`, Website und Privacy/Terms jeweils `https://stamio-test.pages.dev`.
3. Redirect URI: `https://stamio-test.pages.dev/api/connect/oura/callback`. Scopes: personal, daily, heartrate, session, spo2, workout.
4. Client ID → `node scripts/set-secret.mjs OURA_CLIENT_ID`, Client Secret → `node scripts/set-secret.mjs OURA_CLIENT_SECRET`.

**1c. WHOOP (10 min, nur wer WHOOP hat)**
1. https://developer-dashboard.whoop.com → Team anlegen → „Create App“, Name `Stamio Test`, Privacy-Policy `https://stamio-test.pages.dev`.
2. Redirect URL `https://stamio-test.pages.dev/api/connect/whoop/callback`. Scopes: read:recovery, read:sleep, read:workout, read:cycles, offline. Webhook (v2): `https://stamio-test.pages.dev/api/hooks/whoop`.
3. `WHOOP_CLIENT_ID` und `WHOOP_CLIENT_SECRET` wie oben setzen.

**1d. Polar (10 min, nur wer Polar hat)** – Alternative ohne Schlüssel: Polar in intervals.icu verbinden.
1. https://admin.polaraccesslink.com → mit Polar-Flow-Konto anmelden → „Create client“, Name `Stamio Test`.
2. Redirect URL `https://stamio-test.pages.dev/api/connect/polar/callback`.
3. `POLAR_CLIENT_ID` und `POLAR_CLIENT_SECRET` setzen.

**1e. Withings (10 min, nur wer Withings hat)**
1. https://developer.withings.com/dashboard → „Create an application“ → „Public API integration“, Name `Stamio Test`.
2. Callback URL `https://stamio-test.pages.dev/api/connect/withings/callback`.
3. Client ID → `WITHINGS_CLIENT_ID`, Consumer Secret → `WITHINGS_CLIENT_SECRET`.

**1f. intervals.icu für dich (3 min, falls noch nicht gemacht)** – Test-App → Mehr → Verbindungen → intervals.icu → Athleten-ID und API-Schlüssel (intervals.icu → Einstellungen → Developer Settings).

## 2. Papa neu testen lassen (5 min)

Papa hatte die App nur auf seinem iPhone, ohne Konto auf dem Server. Deshalb sah er die alten Standardwerte (behoben) und konnte nichts verbinden.
1. Gib ihm den **Einladungscode aus `ZUGANG.local.md`** (Abschnitt „Test-Zugang für Papa“, gilt 14 Tage).
2. Auf seinem iPhone: Test-App öffnen → Mehr → Daten und Geräte → „Ich habe eine Einladung“ → Code und „Papa“ → „Einladung einlösen“. Den Schalter „Daten auf diesem Gerät gehören mir“ **aus** lassen: dann löscht die App die alten Daten und er beginnt mit dem neuen Fragebogen.
3. Fehler oder Ideen kann er direkt in der App schicken (Mehr → „Fehler melden / Idee“). Du siehst alle Meldungen dort ganz unten.
4. Später neu anfangen lassen: Mehr → Daten und Geräte → Nutzer → bei Papa „Zurücksetzen“.

## 3. Was von vorher noch offen ist

1. **Test-App auf dein iPhone (5 min).** In der Test-Datenbank sind bisher nur deine zwei PCs angemeldet. Safari → https://stamio-test.pages.dev → Teilen → „Zum Home-Bildschirm“ → öffnen → „Schon dabei?“ → „Server zum ersten Mal einrichten“ → Einrichtungscode aus `ZUGANG.local.md`. Deine Daten kommen vom Server.
2. **Mitteilungen erlauben (2 min).** Mehr → Einstellungen → Mitteilungen → „Mitteilungen erlauben“ → „Test senden“.
3. **Apple-Health-Kurzbefehl (20 min).** Mehr → Verbindungen → „Apple Health (Kurzbefehl)“ → „Schlüssel erzeugen“, dann die Schritte unter „So baust du den Kurzbefehl“ (2 Automationen: 6:30 Uhr und „Training beendet“).
4. **1-2 Wochen benutzen** – und Papa auch. Was stört: „Fehler melden / Idee“ in der App.

## Optional
- **Automatischer Deploy aus GitHub (10 min).** Cloudflare → My Profile → API Tokens → „Edit Cloudflare Workers“ + Pages-Rechte; in GitHub → Settings → Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Ohne das deployt Claude von Hand.

## Freigeben (wenn du zufrieden bist)
- **„Freigeben“ zu Claude sagen.** Claude führt `scripts/release.md` aus (neue Datenbank aus frischer Kopie, Umstellung, echte Adresse https://stamio.pages.dev). Die alte App bleibt 4 Wochen als Rückfall. Danach iPhone umziehen (neue Adresse, neuer Einrichtungscode, Dienste neu verbinden; die App-Schlüssel aus Schritt 1 brauchst du dann einmal für die echte Umgebung: gleiche Befehle, Claude passt das Skript an) und das Repository in `stamio` umbenennen.

## Später (kostet Geld, siehe SPAETER.md)
- KI-Coach: Anthropic-Konto + API-Schlüssel (geschätzt unter 1 $ im Monat für dich), mit Einwilligung deiner Eltern.
- Echte iPhone-App mit HealthKit: 99 $/Jahr.
