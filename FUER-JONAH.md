# Für Jonah

Nur das, was du selbst tun musst.

## Neu am 18.10. (Auftrag 16)

**KI im Coach (kostenlos):** Im Coach erscheint einmal die Karte „KI-Antworten im Coach (kostenlos)“. Tipp auf „Einverstanden“, wenn du sie willst. Papa und Mama sehen die Karte auch, bei Mama legt die App dabei automatisch ein Konto an. Den Verbrauch siehst du unter Mehr → Daten und Geräte → „Kostenlose KI (Verbrauch)“. Heute ist das Gratis-Kontingent durch meine Tests fast leer, bis 2 Uhr nachts antwortet deshalb oft der Regel-Coach.

## Auftrag 15 (18.10.)

**Mama:** nichts zu tun. Sie öffnet die App einfach (bei „Neue Version“ einmal neu laden). Die Läufe verschwinden dann von selbst aus ihrem Plan, ab heute neu verteilt, Erledigtes bleibt. Verbinden geht jetzt direkt: Mehr → Verbindungen → z. B. Oura oder Dropbox → „Verbinden“ → anmelden → „Erlauben“. Die App legt dabei ein Konto für sie an.

**Wenn mehr Leute Oura oder Dropbox verbinden** (erst dann nötig):
- **Oura** lässt eine neue App nur von wenigen Nutzern verbinden (die App rechnet mit 10). Ab dann sehen neue Nutzer „Oura ist gerade nicht verfügbar“. Freigabe: auf cloud.ouraring.com anmelden → oben „API Applications“ (bzw. Developer) → deine App öffnen → Prüfung/Freigabe beantragen (Zweck: Trainings-App für Familie und Freunde, Daten nur für den Nutzer selbst). Nach der Freigabe sag Claude Bescheid, dann wird die Grenze aufgehoben.
- **Dropbox:** Im Dropbox App Console (dropbox.com/developers/apps → deine App → Settings) steht „Development users“. Sobald dort 50 stehen, „Apply for production“ antippen (kostenlos, ein kurzes Formular). Bis 500 Nutzer geht es auch ohne.

**Optional, nur für die Test-Umgebung:** Oura ist dort „gerade nicht verfügbar“, weil dort keine Oura-Schlüssel gesetzt sind. Wenn du Oura auch in der Test-App willst: in deiner Oura-App als zweite Redirect-Adresse `https://stamio-test.pages.dev/api/connect/oura/callback` eintragen, dann im Ordner `ironman-coach`: Client ID kopieren und `node scripts/set-secret.mjs OURA_CLIENT_ID` ausführen, danach Client Secret kopieren und `node scripts/set-secret.mjs OURA_CLIENT_SECRET`.

## A. Schwimm-Hilfsmittel eintragen (1 Minute, du und Papa, neu am 17.10.)

Mehr → Berücksichtigungen → Können und Ausrüstung → **Schwimm-Hilfsmittel** antippen (Kickbrett, Pull Buoy, Flossen, Paddles, Frontschnorchel). Nur was ihr habt (oder im Bad leihen könnt), kommt in die Einheiten. Bis dahin plant die App ohne Hilfsmittel. Der Coach erinnert euch auch.

## B. HealthFit muss deine Trainings nach Dropbox schicken (5 min, neu am 17.10.)

Die App liest Dropbox richtig, aber dort liegt nur eine Datei (16.10.). So bekommst du die Trainings rüber:
1. HealthFit öffnen → unten **Einstellungen** (Zahnrad) → **Automatischer Export** → **Dropbox** einschalten (anmelden, falls gefragt), Format **FIT**.
2. Bei „Exportieren ab“ ein Datum vor deinen letzten Trainings wählen (falls es die Einstellung gibt), sonst die letzten Trainings einzeln: Training antippen → Teilen (Pfeil) → **Dropbox**.
3. iPhone: Einstellungen → Allgemein → **Hintergrundaktualisierung** für HealthFit an. HealthFit nach dem Training einmal kurz öffnen, dann geht der Export sicher raus.
4. In der App: Mehr → Verbindungen → Dropbox → „Jetzt abrufen“. Dort steht jetzt auch, wie viele FIT-Dateien die App in deiner Dropbox findet.

Klappt Dropbox nicht: HealthFit → Einstellungen → **Intervals.icu** einschalten und in der App intervals.icu verbinden (Athleten-ID und API-Schlüssel unter intervals.icu → Settings → Developer Settings).

## 1. Claude als Premium-KI (nur wenn du willst, kostet Geld)

Nicht nötig: Ohne Schlüssel antwortet die kostenlose KI (Workers AI), sonst der Regel-Coach. Mit Schlüssel antwortet stattdessen Claude, die Regeln und Zahlen bleiben dieselben.

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
