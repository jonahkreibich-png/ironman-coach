# Freigeben: Umstellung der echten App

Wird erst ausgeführt, wenn **alle Tests grün** sind **und Jonah die Test-App angesehen und „Freigeben“ gesagt hat**.
Bis dahin bleibt die echte App unverändert: `main` auf GitHub Pages, Worker `ironman-coach-api`, Datenbank `ironman`.

Grundsatz: Die echte Datenbank wird nie direkt umgebaut. Die neue App bekommt eine **neue** Datenbank aus einer Kopie. Die alte bleibt 4 Wochen unangetastet als Rückfallebene.

## 0. Vorher prüfen (Claude)
1. `npm run typecheck && npm test && npm run build && npm run e2e` – alles grün.
2. `node scripts/copy-prod-to-test.mjs` lief mindestens einmal erfolgreich (Migration an der Kopie getestet, Zahlen stimmen).
3. Jonah hat auf https://stamio-test.pages.dev mit seinen echten Daten geprüft und „Freigeben“ gesagt.

## 1. Neue Datenbank aus einer frischen Kopie (Claude, ~10 min)
```
cd server
npx wrangler d1 export ironman --remote --output=../data-export/prod-freigabe.sql      # nur lesen
npx wrangler d1 create stamio                                                         # neue, leere DB
```
- Die neue `database_id` in `server/wrangler.toml` oben eintragen (siehe Schritt 2).
- Kopie einspielen, als 0001 markieren, Migration 0002 anwenden, Zahlen vergleichen – genau wie in `scripts/copy-prod-to-test.mjs`, nur mit `stamio` statt `stamio-test` und ohne `--env test`.
- Kein `DELETE FROM push_subs` – die echten Mitteilungs-Abos sollen bleiben.

## 2. Konfiguration umstellen (Claude)
`server/wrangler.toml` oben:
```
name = "stamio-api"
[[d1_databases]]  database_name = "stamio", database_id = "<neu>", migrations_dir = "migrations"
[vars]  ALLOWED_ORIGINS = "https://stamio.pages.dev", PUBLIC_URL = "https://stamio.pages.dev", ENVIRONMENT = "production"
```
`pages/wrangler.prod.toml` wie `pages/wrangler.test.toml`, aber `name = "stamio"` und `service = "stamio-api"`.
`scripts/deploy.mjs` um das Ziel `production` ergänzen (gleiche Schritte, ohne `--env test`, `VITE_APP_ENV=production`).

## 3. Secrets für die echte App setzen (Claude, Werte aus den Test-Secrets bzw. neu erzeugt)
```
npx wrangler secret put TOKEN_KEY            # neu erzeugen (32 Byte hex) – nicht den Test-Schlüssel nehmen
npx wrangler secret put VAPID_PRIVATE_JWK    # den bisherigen der echten App übernehmen, sonst müssen alle Geräte Mitteilungen neu erlauben
npx wrangler secret put SETUP_CODE           # neu, nur Jonah bekommt ihn (ZUGANG.local.md)
npx wrangler secret put INTERVALS_API_KEY / INTERVALS_ATHLETE_ID   # wie bisher (oder in der App unter Verbindungen)
```
Dienst-Schlüssel (Oura, Dropbox …) nur, wenn Jonah die Apps angelegt hat (FUER-JONAH.md). Redirect-Adressen dort dann auf `https://stamio.pages.dev/api/connect/<dienst>/callback` ergänzen.

## 4. Deploy (Claude)
1. Pages-Projekt anlegen: `npx wrangler pages project create stamio --production-branch main`
2. `node scripts/deploy.mjs production`
3. Prüfen: `https://stamio.pages.dev/api/health` → `"env":"production"`, App lädt, Sync mit dem Einrichtungscode klappt, Daten sind da.

## 5. Code nach `main` (Claude) – erst nachdem Jonah umgezogen ist (Schritt 7)
Solange `main` unverändert ist, läuft die alte App auf GitHub Pages weiter. Deshalb zieht das iPhone zuerst um (Schritt 7), dann folgt dieser Schritt.
1. Pull Request `entwicklung` → `main`, CI muss grün sein, dann zusammenführen. Ab jetzt deployt die CI aus `main` (wenn `CLOUDFLARE_API_TOKEN` hinterlegt ist).
2. GitHub Pages zeigt danach nicht mehr die alte App. Damit das alte Icon auf dem iPhone nicht ins Leere führt: im Ordner `/` eine `index.html` mit Weiterleitung auf `https://stamio.pages.dev` (und Hinweis „App ist umgezogen“) belassen, oder GitHub Pages abschalten, sobald das iPhone umgezogen ist.

## 6. Umbenennen (Jonah oder Claude, ~5 min)
- GitHub: Repository `ironman-coach` → `stamio` (Settings → General → Repository name). GitHub leitet alte Adressen weiter. Danach `git remote set-url origin https://github.com/<name>/stamio.git`.
- Lokaler Ordner kann umbenannt werden (optional).

## 7. iPhone umziehen (Jonah, ~5 min, siehe FUER-JONAH.md)
Neue Adresse in Safari öffnen → Zum Home-Bildschirm → mit Einrichtungscode verbinden → Daten kommen vom Server → Mitteilungen erlauben → altes Icon löschen.

## 8. Aufräumen nach 4 Wochen (Claude, nach Rückfrage)
- Alter Worker `ironman-coach-api` löschen, alte Datenbank `ironman` vorher noch einmal exportieren (`data-export/`), dann löschen.
- GitHub Pages abschalten.

## Zurück, falls etwas schiefgeht
Die alte App läuft bis Schritt 8 weiter (alter Worker, alte Datenbank, GitHub-Pages-Adresse). iPhone einfach wieder über das alte Icon öffnen. Neue Daten seit der Umstellung liegen in `stamio` und können per Backup-Datei übertragen werden.
