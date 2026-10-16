# Für Jonah

Nur das, was du selbst tun musst.

## A. HealthFit über Dropbox reparieren (10 min, neu am 16.10.)

Deine Dropbox-App hat nur Zugriff auf ihren eigenen Ordner („App folder“). HealthFit speichert aber in `/Apps/HealthFit`. Den Zugriff kann man nicht ändern, deshalb eine neue App:

1. https://www.dropbox.com/developers/apps → **Create app** → **Scoped access** → **Full Dropbox** → Name z. B. `stamio-healthfit-jonah` → Create.
2. Tab **Permissions**: Haken bei `files.metadata.read`, `files.content.read`, `account_info.read` → **Submit**.
3. Tab **Settings** → Redirect URIs: `https://coach-app-efc7.pages.dev/api/connect/dropbox/callback` → **Add**.
4. Im Ordner `ironman-coach`: „App key“ kopieren → `node scripts/set-secret.mjs DROPBOX_APP_KEY echt`. „App secret“ (Show) kopieren → `node scripts/set-secret.mjs DROPBOX_APP_SECRET echt`.
5. In HealthFit: Einstellungen → Automatischer Export → **Dropbox** an, Format **FIT**.
6. In der App: Mehr → Verbindungen → Dropbox → **Neu verbinden**. Danach steht dort „verbunden“ und die letzte Datei.

**Statt Dropbox (ohne eigene App):** HealthFit → Einstellungen → **Intervals.icu** → anmelden, automatisch hochladen. In der App: Mehr → Verbindungen → intervals.icu → Athleten-ID und API-Schlüssel (intervals.icu → Settings → Developer Settings).

## 0. Papa: Geburtsjahr neu eintragen (1 Minute, neu am 15.10.)

Papa hatte als Geburtsjahr „197“ eingegeben. Die App hat das gelöscht und rechnet bis dahin mit Standardwerten. Sag ihm: App öffnen → Mehr → Profil und Ziele → Geburtsjahr mit vier Ziffern eintragen. Der Coach erinnert ihn auch.

## 1. KI-Coach einschalten (wenn du willst)

Ohne Schlüssel funktioniert alles weiter mit dem Regel-Coach (kostenlos). Mit Schlüssel formuliert Claude frei, die Regeln und Zahlen bleiben dieselben.

**Was es kostet** (Schätzung mit deinen echten Daten, Sonnet 5.5 für Gespräche, Haiku 5.5 für kurze Texte):

| Nutzung | pro Monat |
|---|---|
| 1 Frage pro Tag | ca. 1,50 $ |
| 3 Fragen pro Tag | ca. 4 $ |
| 8 Fragen pro Tag | ca. 9 $ |

Eine Frage kostet etwa 3 bis 4 Cent, halb so viel wie mit Opus. Mitteilungen umformulieren, Regeln lesen und Essensfotos kosten zusammen unter 30 Cent im Monat. Die App hört beim Monatsbudget auf (einstellbar 2, 5, 10 oder 20 $) und antwortet dann wieder kostenlos mit dem Regel-Coach.

**In 3 Schritten:**

1. Auf **console.anthropic.com** anmelden, unter „Billing“ Guthaben aufladen (z. B. 5 $; das kaufst du selbst, Claude kauft nichts) und dort ein Monatslimit setzen. Dann unter „API Keys“ einen Schlüssel anlegen und **kopieren** (beginnt mit `sk-ant-`).
2. Im Ordner `ironman-coach` im Terminal: `node scripts/set-secret.mjs ANTHROPIC_API_KEY echt` (nimmt den Schlüssel aus der Zwischenablage, zeigt ihn nicht an). Zum Ausprobieren in der Test-App ohne `echt`.
3. In der App: Mehr → Einstellungen → KI-Coach → Einwilligung lesen und bestätigen, Schalter an, Budget wählen.

## 2. Namen wählen (wenn du magst)

[NAMEN.md](NAMEN.md): 10 freie Namen, Empfehlung „Tempendo“. Vor der Wahl in der Instagram-App nach dem Namen suchen. Dann Claude den Namen sagen; die Adresse bleibt gleich.

## 3. Termine für Sprint, Olympisch, Halb-Ironman

Sobald du sie kennst: Mehr → Profil und Ziele → Ziel antippen → Datum eintragen. Der Plan baut sie dann als B/C-Ziele ein.

## Noch offen von vorher

- **App-Schlüssel der Anbieter** (Oura, Dropbox …) nur für Dienste, die du nutzt: [VERBINDUNGEN.md](VERBINDUNGEN.md).
- **In 4 Wochen** fragt Claude, ob die alte App (alter Server, alte Datenbank, GitHub Pages) gelöscht werden darf. Vorher wird sie gesichert.
