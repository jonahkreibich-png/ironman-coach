# Für Jonah

Nur das, was du selbst tun musst.

## A. Schwimm-Hilfsmittel eintragen (1 Minute, du und Papa, neu am 17.10.)

Mehr → Berücksichtigungen → Können und Ausrüstung → **Schwimm-Hilfsmittel** antippen (Kickbrett, Pull Buoy, Flossen, Paddles, Frontschnorchel). Nur was ihr habt (oder im Bad leihen könnt), kommt in die Einheiten. Bis dahin plant die App ohne Hilfsmittel. Der Coach erinnert euch auch.

## B. Dropbox-Schlüssel (mit Claude im Chat, 5 min)

Die echte App liest Dropbox schon seit 16.10. (eine echte FIT-Datei wurde übernommen). Wenn du eine neue Dropbox-App mit „Full Dropbox“ anlegst, führt dich Claude durch das Setzen von App key und App secret (Wert kopieren, „kopiert“ schreiben, Claude setzt ihn, ohne ihn anzuzeigen). Redirect URIs der App: `https://coach-app-efc7.pages.dev/api/connect/dropbox/callback` und `https://stamio-test.pages.dev/api/connect/dropbox/callback`.

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
