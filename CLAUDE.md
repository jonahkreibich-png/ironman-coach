# Feste Regeln (Jonah)

- **Autonom arbeiten, keine Fragen stellen.** Entscheidungen selbst treffen und mit Begründung in `ENTSCHEIDUNGEN.md` eintragen (fortlaufende Nummer).
- **Nichts kaufen.** Keine kostenpflichtigen Dienste, Domains, Abos oder Upgrades. Nur kostenlose Kontingente nutzen.
- **Keine Prüflisten für Jonah.** Selbst testen; Jonah bekommt nur, was er wirklich selbst tun muss (in `FUER-JONAH.md`).
- **Kurz und einfach auf Deutsch antworten.** Auch Dokumente (ERGEBNIS.md, FUER-JONAH.md) kurz und verständlich.
- **Immer erst in der Test-Umgebung testen** (`stamio-test`, https://stamio-test.pages.dev, `node scripts/deploy.mjs test`). Die echte App (`coach-app-efc7`, Worker `coach-api-efc7`, D1 `coach-db-efc7`) nur nach [scripts/release.md](scripts/release.md) ändern.
- **`ZUGANG.local.md` und Schlüssel nie committen.** Vor jedem Commit `node scripts/check-secrets.mjs`.

## Arbeitsweise
- Branch `entwicklung`; `main` nur nach scripts/release.md.
- Vor jeder Übergabe: `npm run typecheck && npm test && npm run build && npm run e2e`.
- Echte Daten nie verändern ohne vorheriges Backup (`wrangler d1 export … --remote` nach `data-export/`).
- Ergebnis eines Auftrags kurz in `ERGEBNIS.md`.
