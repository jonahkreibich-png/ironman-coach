# Freigeben: Umstellung der echten App

Wird erst ausgeführt, wenn **alle Tests grün** sind **und Jonah „Freigeben“ gesagt hat**.

**Neutrale Namen** (hängen nicht vom App-Namen ab; der App-Name steht nur in `shared/brand.ts`, ein späterer Namenswechsel braucht keinen Umzug):

| | echte App (neu) | Test-Umgebung | alte App (Rückfall, 4 Wochen) |
|---|---|---|---|
| Adresse | https://coach-app-efc7.pages.dev | https://stamio-test.pages.dev | https://jonahkreibich-png.github.io/ironman-coach/ |
| Pages-Projekt | `coach-app-efc7` | `stamio-test` | GitHub Pages aus `main` |
| Worker | `coach-api-efc7` | `stamio-api-test` | `ironman-coach-api` |
| Datenbank (D1) | `coach-db-efc7` | `stamio-test` | `ironman` (ID f09acda6-8ded-4b02-a17c-c89aa4480ce9) |

Grundsatz: Die echte Datenbank wird nie umgebaut. Die neue App bekommt eine **neue** Datenbank aus einer Kopie. Die alte bleibt 4 Wochen unangetastet als Rückfallebene.
Alle Befehle mit `node node_modules/wrangler/bin/wrangler.js` im Ordner `server/` (npx.cmd scheitert hier an Argumenten), vorher `NODE_USE_SYSTEM_CA=1` und `NODE_EXTRA_CA_CERTS=C:\ProgramData\Norton\Antivirus\wscert.pem` setzen.

## 0. Vorher prüfen (Claude)
1. `npm run typecheck && npm test && npm run build && npm run e2e` – alles grün (E2E in Chromium und WebKit).
2. `node scripts/copy-prod-to-test.mjs ironman` lief erfolgreich: Kopie lokal umgestellt, deine Daten (Nutzer 1) in der Test-App, Zahlen je Art gleich.
3. Wichtig: Die echte Datenbank stammt aus einer früheren Fassung von 0001 **ohne Tabelle `error_log`**. Vor 0002 muss 0001 deshalb noch einmal laufen (nur „IF NOT EXISTS“, ergänzt das Fehlende). `scripts/lib/upgrade-copy.mjs` macht das lokal, Schritt 1 unten an der D1-Datenbank.

## 1. Neue Datenbank aus einer frischen Kopie (Claude, ~10 min)
```
wrangler d1 export ironman --remote --output=../data-export/prod-freigabe.sql     # nur lesen
node ../scripts/migrate-copy.mjs data-export/prod-freigabe.sql                     # (im Projektordner) Probe lokal, Zahlen müssen gleich sein
wrangler d1 create coach-db-efc7                                                   # neue, leere DB → database_id in server/wrangler.toml
wrangler d1 execute coach-db-efc7 --remote --file=../data-export/prod-freigabe.sql --yes
wrangler d1 execute coach-db-efc7 --remote --file=migrations/0001_initial.sql --yes # ergänzt error_log
wrangler d1 execute coach-db-efc7 --remote --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_initial.sql'); DELETE FROM push_subs;"
wrangler d1 migrations apply coach-db-efc7 --remote
```
- Danach Datensätze je Art in `coach-db-efc7` mit der lokalen Probe vergleichen (`SELECT kind, COUNT(*) FROM records WHERE user_id = 1 AND deleted = 0 GROUP BY kind`).
- `DELETE FROM push_subs`: Die alten Mitteilungs-Abos gehören zur alten Adresse (Safari-Mitteilungen gelten je Adresse) und zum alten VAPID-Schlüssel. Auf der neuen Adresse erlaubt das iPhone Mitteilungen einmal neu (Umzugs-Anleitung).

## 2. Konfiguration (Claude)
- `server/wrangler.toml` oben: `name = "coach-api-efc7"`, D1 `coach-db-efc7` mit neuer `database_id`, `workers_dev = false`, Vars `ALLOWED_ORIGINS`/`PUBLIC_URL = "https://coach-app-efc7.pages.dev"`, `ENVIRONMENT = "production"`. Die alte Konfiguration steht in der Tabelle oben (für Rückfall und Aufräumen).
- `pages/wrangler.prod.toml` (Pages `coach-app-efc7` → Worker `coach-api-efc7`) und `scripts/deploy.mjs production` sind vorbereitet; die CI (`.github/workflows/ci.yml`) deployt nach dem Zusammenführen dieselben Namen.

## 3. Secrets für die echte App (Claude)
```
wrangler secret put TOKEN_KEY            # neu erzeugen (32 Byte hex), nicht den Test-Schlüssel
wrangler secret put SETUP_CODE           # neu, nur Jonah bekommt ihn (ZUGANG.local.md)
wrangler secret put VAPID_PRIVATE_JWK    # siehe unten
```
- **VAPID:** Der private Schlüssel der alten App liegt nur als Cloudflare-Secret vor; Cloudflare gibt Secrets nicht wieder heraus, und eine lokale Kopie gibt es nicht. Er würde auch nichts nützen: Mitteilungs-Abos gelten je Adresse, das iPhone erlaubt Mitteilungen auf der neuen Adresse ohnehin neu. Deshalb wird ein neuer Schlüssel erzeugt.
- **intervals.icu:** `INTERVALS_API_KEY`/`INTERVALS_ATHLETE_ID` der alten App sind ebenfalls nicht auslesbar. In der neuen App trägt Jonah sie unter Mehr → Verbindungen → intervals.icu ein (oder `node scripts/set-secret.mjs INTERVALS_API_KEY` mit Wert aus der Zwischenablage).
- Dienst-Schlüssel (Oura, Dropbox …) nur, wenn Jonah die Apps angelegt hat. Redirect-Adressen: `https://coach-app-efc7.pages.dev/api/connect/<dienst>/callback`.

## 4. Deploy (Claude)
1. `wrangler pages project create coach-app-efc7 --production-branch main`
2. `node scripts/deploy.mjs production`
3. Prüfen: `https://coach-app-efc7.pages.dev/api/health` → `"env":"production"`, App lädt, Einrichtungscode verbindet, Daten sind da.

## 5. Code nach `main` (Claude) – erst nachdem Jonah „iPhone ist umgezogen“ geschrieben hat
Solange `main` unverändert ist, läuft die alte App auf GitHub Pages weiter.
1. Pull Request `entwicklung` → `main`, CI grün, zusammenführen. Ab jetzt deployt die CI aus `main` auf die neutralen Namen (wenn `CLOUDFLARE_API_TOKEN` hinterlegt ist).
2. Damit das alte Icon nicht ins Leere führt: im Wurzelordner von `main` eine `index.html` mit Weiterleitung auf https://coach-app-efc7.pages.dev und dem Hinweis „Die App ist umgezogen“ (GitHub Pages zeigt sonst nichts Sinnvolles mehr). Die Daten der alten App bleiben im alten Worker und der alten Datenbank.

## 6. Umbenennen (optional)
- App-Name: nur `shared/brand.ts` + `npm run icons` (NAMEN.md). Adressen bleiben.
- GitHub-Repository kann später umbenannt werden (GitHub leitet weiter), danach `git remote set-url origin …`.

## 7. iPhone umziehen (Jonah, ~5 min): Anleitung in ERGEBNIS.md unter „Freigabe“.

## 8. Aufräumen nach 4 Wochen (Claude, nur nach Rückfrage)
- Alte Datenbank `ironman` noch einmal exportieren (`data-export/`), dann alten Worker `ironman-coach-api` und Datenbank `ironman` löschen.
- GitHub Pages abschalten.

## Zurück, falls etwas schiefgeht
Die alte App läuft bis Schritt 8 weiter (alter Worker, alte Datenbank, GitHub-Pages-Adresse). iPhone einfach wieder über das alte Icon öffnen. Neue Einträge seit der Umstellung liegen in `coach-db-efc7` und lassen sich als Backup-Datei (Mehr → Daten und Geräte) übertragen.
