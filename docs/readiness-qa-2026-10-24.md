# Trainingsampel: technische Prüfung vom 24.10.2026

Geprüfter Ausgangsstand: `ce49fcafd43adb6506a7f99bcc8ebbe3b78d63d9`, Version 3.7.0. Ausschließlich synthetische Daten und nachgebaute Modellantworten; keine externen KI-Aufrufe oder produktiven Schreibzugriffe.

## Reproduzierte Ursachen

1. `aiSafeCtx` entfernt Oura-Werte einschließlich persönlicher Vergleichswerte. `compactContext` und `buildContext` berechneten danach eine neue Ampel aus den verbleibenden Daten. Konkreter Test: acht vergangene Oura-Ruhepulswerte von 60, heute manuell Ruhepuls 55 und Schlaf 6,5 h, feste Ersatzgrenze 50. Vollständiger Stand: GELB. Gefilterter KI-Kontext: ROT (44/100), weil die persönliche Basis verschwunden ist. Der Regressionstest scheiterte vor der Korrektur genau an diesem roten Kontext.
2. `readinessFallback` übernahm vorhandenes `settings.readiness.load`, während Heute die aktuelle Belastung berechnete. Ein veralteter Wert CTL 40 / ATL 100 änderte die Coach-Ampel auf ROT. Auch dieser Test war zunächst rot.
3. `get_analysis` enthielt keine verbindliche Ampel mit Datum und Herkunft. Die KI konnte aus Belastung und Texten eine andere Farbe ableiten. Der neue Test scheiterte zunächst am fehlenden Feld.
4. Browser-Tagesdatum und Server-Tagesdatum konnten voneinander abweichen (Gerätezeitzone gegenüber Europe/Berlin). Zudem fehlte im Bildschirmcache die Prüfung auf Tageswechsel.

## Änderung

`shared/core.ts` berechnet (gemeinsam exportiert über `shared/readiness.ts`) aus vollständigem aktuellem Zustand die gemeinsame Ampel einschließlich Last, Profil-Schlafbedarf, Datum, Messdatum, Herkunft und deterministischer Eingabeversion. Gespeicherte abgeleitete Last wird überschrieben. Heute, Regel-Coach, Schnellfragen und Werkzeug-/KI-Kontexte verwenden diesen Pfad. Eingabekorrekturen führen zu einer neuen Version. Fehlende aktuelle Morgenwerte bleiben unsicher; gestrige gute Werte werden nicht zu einem heutigen Grün.

Oura-Schutz bleibt bestehen: Bei vorhandenen Oura-Quellen bekommt das externe Modell weder vollständige Farbe/Score noch Gründe oder Rohwerte daraus. Es erhält einen gesperrten Ampelkontext und darf keinen Ersatz aus Teilwerten berechnen. Die sichtbare Antwort erzeugt die App nach dem Modellaufruf aus dem vollständigen Zustand. Eine Ampelfrage oder eine modellseitige Farbaussage wird durch diese verbindliche App-Antwort ersetzt. Beide Anbieter puffern Modelltext bis zur Prüfung, damit eine falsche Farbe auch nicht kurz im Stream erscheint. Validierter Text wird danach weiterhin in Stücken übertragen. Diese Prüfung erhöht die Zeit bis zum ersten sichtbaren Text.

App-Ampelantworten tragen `aiExcluded` und werden nicht bei der nächsten Frage an Modelle weitergegeben. Bei gesperrter Ampel werden frühere Ampelnachrichten ebenfalls aus dem Modellverlauf entfernt. Der Test für diesen Rückkanal scheiterte zunächst und besteht nach der Änderung. Die Sperre erfolgt bewusst konservativ auch bei alten Oura-Quellen; sie ist kein Versuch, Vertragsausnahmen für abgeleitete Daten zu behaupten.

Die sichtbare Antwort enthält verständlichen Status und Datumsbezug. Technische Version/Herkunft verbleiben in strukturierten Daten und Modellkontexten. Der Trainingstag richtet sich einheitlich nach Europe/Berlin; der Cache prüft bei jedem Zugriff auf einen neuen Trainingstag.

## Nachweise und Grenzen

- Acht neue Unit-Regressionen in `tests/unit/readiness-consistency.test.ts`: persönliche Oura-Basis, Werkzeug-Snapshot, veraltete Last, Korrektur/Version und gestrige Werte, widersprechender Modelltext, erneuter Modellverlauf.
- Je ein zusätzlicher API-/Streamtest in `server/test/ai.test.ts` und `server/test/wai.test.ts`: Modell behauptet ROT, vollständige App-Daten sind GELB; nur GELB wird angezeigt. Der Claude-Test scheitert nachweislich bei vorübergehend ausgeschaltetem Ausgabeprüfer.
- Bestehende Readiness- und Coach-Tests sowie beide Anbieter-Tests erneut ausgeführt; genaue Gesamtergebnisse stehen im Abschlussbericht des Hauptauftrags.
- Keine Änderung der bestehenden 70/45-Scoregrenzen oder individuellen Messwertregeln. Die Tests prüfen deren konsistente Anwendung, keine medizinische Eignung oder individuell richtige Trainingsfreigabe.
- Der Versionsbeleg ist ein Änderungsbeleg, kein kryptografischer Sync-Nachweis. Abweichende Datenstände auf noch nicht synchronisierten Geräten sind weiterhin verschiedene Zustände; Datum/Messdatum und strukturierte Version machen das prüfbar.
- Keine echten Modellantworten oder externen Dienste getestet. Sprachliche Farbaussagen werden gezielt erkannt; eine beliebige indirekte Halluzination in freier Sprache lässt sich damit nicht vollständig ausschließen.

## Ergänzung nach unabhängiger Codeprüfung

Zwei weitere Regressionen zuerst fehlgeschlagen, danach behoben: Auch der direkte Aufruf von core.dailyAdjustments benutzt jetzt dieselbe aktuelle Ampel und ignoriert gespeicherte Lastableitungen. Der Integrationstest kontrolliert tatsächliche Plananpassungen und das Briefing der Tages-Engine sowie den direkten Core-Aufruf.

Die Datenschutzprüfung umfasst nun auch vollständigen buildContext-Text und echte Payloads von explain_day, get_analysis und get_data. Oura-begründete Plananpassungen enthielten zuvor weiterhin Schlafwerte in reason/description. Die KI-Projektion kopiert und entfernt freie Plan-/Anpassungstexte konservativ einschließlich verschachtelter Spezifikationen; das Original der App bleibt unverändert. Bei vorhandenen Oura-Quellen werden alle früheren Nicht-Nutzer-Chatnachrichten und Coach-Notizen aus dem KI-Kontext genommen, weil ältere Datensätze keine verlässliche Provenienz besitzen. Neue betroffene Anpassungen und daraus erzeugte Nachrichten tragen aiExcluded; auch nach Entfernung der Quelle werden ihre Texte nicht an ein Modell weitergereicht. Die Projektion behält IDs, Termine, Sportart und strukturierte Trainingsangaben; frühere freie Begründungen fehlen dem Modell bewusst.
