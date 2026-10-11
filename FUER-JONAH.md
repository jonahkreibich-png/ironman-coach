# Für Jonah

Was nur du machen kannst, in dieser Reihenfolge. Die echte App läuft währenddessen ganz normal weiter.
Test-App: **https://stamio-test.pages.dev** · Einrichtungscode: steht in `ZUGANG.local.md` (nur auf deinem PC, nicht im Repo).

Befehle immer im Ordner `ironman-coach` ausführen. Für `wrangler`-Befehle in `server` wechseln.

## Pflicht (zusammen ca. 45 min)

1. **Deine echten Daten in die Testumgebung kopieren (10 min, am PC).**
   ```bash
   node scripts/copy-prod-to-test.mjs
   ```
   Liest die echte Datenbank nur (Sicherung landet in `data-export/`, nicht im Repo), spielt sie in die Test-Datenbank und testet dabei die Umstellung auf mehrere Nutzer. Am Ende steht „Fertig“. Steht da „ACHTUNG“: nichts freigeben, Ausgabe an Claude geben.
   *Alternative ohne PC:* alte App → Einstellungen → „Backup kopieren“, dann in der Test-App auf dem Startbildschirm „Backup laden“.

2. **Test-App aufs iPhone (5 min).** Safari → https://stamio-test.pages.dev → drei Punkte → Teilen → „Zum Home-Bildschirm“. Über das neue Icon öffnen → „Schon dabei?“ → „Server zum ersten Mal einrichten“ → Einrichtungscode eingeben. Deine Daten kommen vom Server. Das alte Icon bleibt, beide Apps laufen getrennt.

3. **Mitteilungen erlauben (2 min).** Test-App → Mehr → Einstellungen → Mitteilungen → „Mitteilungen erlauben“ → „Test senden“.

4. **Apple-Health-Kurzbefehl bauen (20 min).** Test-App → Mehr → Verbindungen → „Apple Health (Kurzbefehl)“ → „Schlüssel erzeugen“, Schlüssel kopieren. Die Schritte stehen direkt darunter („So baust du den Kurzbefehl“), das Format in VERBINDUNGEN.md. Zwei Automationen:
   - täglich **6:30 Uhr** „Werte senden“ (ohne Nachfrage ausführen),
   - **„Training beendet“** der Apple Watch, oder falls es das bei dir nicht gibt: **stündlich 6–22 Uhr**.

5. **intervals.icu verbinden (3 min).** Test-App → Verbindungen → intervals.icu → Athleten-ID und API-Schlüssel (intervals.icu → Einstellungen → Developer Settings).

6. **1–2 Wochen benutzen.** Was stört oder fehlt: einfach Claude sagen.

## Empfohlen (je 10–15 min)

7. **HealthFit über Dropbox (15 min).** https://www.dropbox.com/developers/apps → „Create app“ → Scoped access → App folder → Name z. B. „stamio-test“. Unter *Permissions*: `files.metadata.read`, `files.content.read`, `account_info.read`. Unter *Settings*: Redirect URI `https://stamio-test.pages.dev/api/connect/dropbox/callback`, Webhook `https://stamio-test.pages.dev/api/hooks/dropbox`. Dann:
   ```bash
   cd server
   npx wrangler secret put DROPBOX_APP_KEY --env test
   npx wrangler secret put DROPBOX_APP_SECRET --env test
   ```
   In HealthFit: Einstellungen → Automatischer Export → Dropbox, Format FIT. In der Test-App: Verbindungen → Dropbox (HealthFit) → Verbinden.

8. **Oura (15 min).** https://cloud.ouraring.com/oauth/applications → neue Anwendung, Redirect URI `https://stamio-test.pages.dev/api/connect/oura/callback`. Weil du unter 18 bist, verlangen die Oura-Bedingungen die **Einwilligung deiner Eltern** – bitte vorher mit ihnen klären. Dann `OURA_CLIENT_ID` und `OURA_CLIENT_SECRET` wie oben mit `--env test` setzen.

9. **Optional: WHOOP, Polar, Withings (je 10 min),** nur wenn du die Geräte hast. Gleiches Muster: Entwickler-App anlegen, Redirect `https://stamio-test.pages.dev/api/connect/<whoop|polar|withings>/callback`, Secrets `<NAME>_CLIENT_ID` und `<NAME>_CLIENT_SECRET` mit `--env test`.

10. **Optional: automatischer Deploy aus GitHub (10 min).** Cloudflare → My Profile → API Tokens → „Edit Cloudflare Workers“ + Pages-Rechte. In GitHub → Repository → Settings → Secrets: `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`. Ohne das deployt Claude von Hand.

## Freigeben (wenn du zufrieden bist)

11. **„Freigeben“ zu Claude sagen.** Claude führt `scripts/release.md` aus: neue Datenbank aus einer frischen Kopie, Umstellung, echte Adresse **https://stamio.pages.dev**, Tests. Die alte App bleibt 4 Wochen als Rückfall.

12. **iPhone umziehen (10 min).** Safari → https://stamio.pages.dev → Zum Home-Bildschirm → mit dem neuen Einrichtungscode verbinden (bekommst du von Claude in `ZUGANG.local.md`) → Mitteilungen erlauben → Kurzbefehl auf die neue Adresse und einen neuen Schlüssel umstellen → Dienste (Dropbox, Oura …) unter Verbindungen neu verbinden → altes Icon und Test-Icon löschen.

13. **Repository umbenennen (2 min, nach dem Umzug).** GitHub → Repository → Settings → Name `stamio`.

## Später (kostet Geld, siehe SPAETER.md)
- KI-Coach einschalten: Anthropic-Konto + API-Schlüssel (geschätzt unter 1 $ im Monat), mit Einwilligung deiner Eltern.
- Echte iPhone-App mit HealthKit: 99 $/Jahr.
