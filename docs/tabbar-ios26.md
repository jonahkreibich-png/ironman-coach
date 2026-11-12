# Tab-Leiste: Stamio vs. iOS 26 (Auftrag 33)

Vorlage: Jonahs iPhone-Aufnahme von Apples **Fitness-App** (`docs/vergleich/ios26-fitness-tableiste.mp4`, 1170 × 2532 px = 390 × 844 pt, 57 Bilder/s), Bild für Bild mit ffmpeg zerlegt (10 und 60 Bilder/s, Ausschnitt der Leiste in voller Auflösung). Gegenprobe: Aufnahme der App vorher (`meine-app-tableiste.mp4`, Version 3.20.0).
Vergleichsvideo nebeneinander: `docs/vergleich/vergleich-tableiste.mp4` (nicht im Repository, liegt lokal; neu erzeugen siehe unten).

## Gemessen im Fitness-Video
| | Fitness-App (iOS 26) | Stamio 3.20.0 | Stamio 3.21.0 |
|---|---|---|---|
| Kapsel | 348 × 61 pt, 21 pt Rand, 22 pt über dem Rand | 366 × 66, 12 pt Rand | **348 × 61, 21 pt Rand, 22 pt** |
| Markierung in Ruhe | flache dunkle Fläche, 53 pt hoch, 4 pt Abstand | runde Linse, größer als nötig | **flache Fläche, 53 hoch, 4 Abstand** |
| Beschriftung | passt immer in die Markierung | „Fortschritt“ ragte heraus | **passt (Schrift passt sich an)** |
| Antippen | Markierung hebt sich nach ~0,03 s als klarer Glastropfen ab (1,2× breit, 1,27× hoch, ragt über die Leiste, vergrößert den Inhalt), gleitet gedehnt (~0,1 s zum Nachbarn), schwingt leicht über, legt sich ab ~0,17 s flach, Ruhe nach ~0,28 s | Linse glitt, Leiste blieb starr | **gleich (Federn nach Video abgestimmt)** |
| Leiste beim Antippen | wächst ~3 %, etwas in Bewegungsrichtung, federt zurück | nein | **ja (folgt dem Tropfen 70 ms verzögert, wie im Video)** |
| Halten / Ziehen | Tropfen bleibt gehoben, folgt dem Finger; Leiste ~3 % größer, fast gleichmäßig um die Mitte, leicht zum Finger | ganze Leiste 3,5 % größer, zur Druckstelle | **gleich; Tropfen länger beim schnellen Ziehen, gestaucht beim Bremsen** |
| Scrollen | **Leiste bleibt voll** | schrumpfte auf 88 % (mehrere Tipps nötig, Springen) | **bleibt voll** |
| Überscrollen | nichts verschiebt sich | Linse löste sich nach oben, Tab doppelt | **Linse in der Kapsel, keine Kopie → nichts doppelt** |

Hinweis: Der Auftragstext beschreibt das Zusammenklappen zu einem runden Knopf (wie Apple Musik). Die mitgeschickte Vorlage (Fitness) klappt nicht zusammen; gebaut ist die Vorlage (ENTSCHEIDUNGEN 524).

## Aufbau
- `.tabbar` (fest) → `.tabbar-glass` (Weichzeichner, bewegt sich nie) + `.tabbar-body` (sichtbare Kapsel mit Markierung und Tabs, wird verformt).
- Eine Markierung (`.tab-lens`) mit zwei Schichten: flache Fläche und Glas; überblendet wird nur die Deckkraft.
- Nur `transform` und `opacity`; Gleiten und Einrasten vorausberechnet als Web-Animation (läuft im Compositor weiter, während der neue Tab aufgebaut wird), Ziehen per `requestAnimationFrame` (Rechenzeit ~0,1 ms je Bild).
- „Bewegung reduzieren“: kein Tropfen, keine Verformung, die Markierung wechselt direkt.

## Gemessen in der App (Playwright, 390 × 844, Touch)
- Ziehen: 16,0 ms je Bild in Chromium; in WebKit 16–17 ms (erste Geste nach dem Start bis ~21 ms, Ebenen werden angelegt).
- 20 schnelle Wechsel: feste Ebene in jedem Bild exakt gleich, Kapsel nie unter 98,5 % und nie über 106 %, höchstens ~4 px Änderung je Bild.
- Unterschied zum iPhone: echte Lichtverzerrung kann Safari im Web nicht (angedeutet mit Kante, Farbrändern, Glanz und Vergrößerung). WebKit unter Windows zeichnet `backdrop-filter` gar nicht – in den WebKit-Tests ist der Weichzeichner deshalb unsichtbar (auf dem iPhone und in Chromium vorhanden).

## Tests
`tests/e2e/auftrag33-tabbar.spec.ts` (Fehler 1–4, Bildrate, „Bewegung reduzieren“) und `tests/e2e/tabbar.spec.ts`, beide in Chromium und WebKit.
Neu aufnehmen: `RECORD=1 npx playwright test tests/e2e/tabbar-video.spec.ts --project=chromium-iphone` (gleicher Ablauf wie das Fitness-Video), dann `node scripts/tabbar-vergleich.mjs`.

## Auftrag 34 (3.22.0): Linse, Lichtbrechung, Markierung, Symbole
Vergleich Bild für Bild mit `docs/vergleich/meine-app-3-21-iphone.mp4` (echtes iPhone, 3.21). Die iPhone-Videos sind H.264; das mitgelieferte ffmpeg kann das nicht lesen – deshalb liest Chrome die Videos (`scripts/tabbar-vergleich.mjs`), ffmpeg schreibt nur das Ergebnis (WebM).

| | iOS 26 Fitness | 3.21 (iPhone) | 3.22 |
|---|---|---|---|
| Markierung in Ruhe | ~92 × 50 pt, dunkel | 68 × 53, rundlich | 74 × 53 (Tab + 6), Schwarz 55 % |
| Linse beim Wechsel | flache Kapsel ~100 × 62, gedehnt über zwei Tabs | fast rund | 96 × 65, gedehnt bis 131 × 66 |
| Inhalt unter der Linse | vergrößert, Farbränder, Akzentfarbe wandert mit | kaum verändert | Kopie der Reihe 1,32 × 1,26 nur in der Linse, Akzentfarbe, Farbränder |
| Symbole | gefüllt | Umrisse | gefüllt (`icFill`) |

Aufbau der Linse: `.tab-lens` → `.tab-lens-fill` (Markierung) · `.tab-lens-mag` (deckende Fläche `.tab-lens-bg` + Kopie `.tab-lens-row`, abgeschnitten an der Linse) · `.tab-lens-glass` (Kante, Glanz, Farbränder). Die Kopie hat keine Knöpfe, ist für Screenreader verborgen und nur sichtbar, solange die Linse gehoben ist; währenddessen liegt die Linse über den Tabs. Die Kopie wird mit derselben Web-Animation bewegt (nur transform und opacity).

Gemessen (8 Tab-Wechsel per Touch, 390 × 844): 95 % der Bilder ≤ 16 ms (WebKit) bzw. ≤ 17 ms (Chromium).
Neu aufnehmen: `RECORD=1 TOUCH=1 NAME=meine-app-3-22 npx playwright test tests/e2e/tabbar-video.spec.ts --project=webkit-iphone`, dann `node scripts/tabbar-vergleich.mjs docs/vergleich/meine-app-3-22-webkit-touch.webm "Stamio 3.22"`.
