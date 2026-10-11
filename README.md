# Stamio

Trainingsbegleiter für Ausdauersport (Triathlon, Laufen, Rad, Schwimmen): Plan, Morgenwerte, Fortschritt, Ernährung und ein Coach, der sich nach gemessenen Werten richtet. Web-App (PWA) fürs iPhone, Server auf Cloudflare Workers mit D1.

> Testphase: nur mit Einladung. Die echte App läuft bis zum Freigeben unverändert aus `main`.

## Aufbau
| Ordner | Inhalt |
|---|---|
| `web/` | App (Vite + TypeScript), Einstieg `web/src/main.ts`, Bildschirme in `web/src/views/` |
| `shared/` | Logik für App und Server: Bereitschaft, Regeln, Plan-Generator, Scores, Prognose, Coach-Engine, FIT/GPX/TCX, Texte (`shared/lang/`) |
| `server/` | Cloudflare Worker, Migrationen, Server-Tests |
| `pages/` | Pages Function, leitet `/api` an den Worker |
| `tests/` | Unit-Tests (Vitest) und E2E (Playwright, 390 px, Chromium + WebKit) |
| `scripts/` | Testserver, Deploy (nur Test), Screenshots, Kopie echte Daten → Test, Release-Anleitung |

## Befehle
```bash
npm install
npm run dev          # Entwicklung
npm run typecheck
npm test             # Unit- und Server-Tests
npm run build
npm run e2e          # E2E (startet den lokalen Testserver)
node scripts/deploy.mjs test   # nur Testumgebung
```

## Dokumente
DESIGN.md · ENTSCHEIDUNGEN.md · VERBINDUNGEN.md · PLAN-FORMAT.md · SPAETER.md · STORE-PLAN.md · NAMEN.md · FUER-JONAH.md · ERGEBNIS.md · scripts/release.md

## Datenschutz
Keine persönlichen Daten und keine Schlüssel im Code. Schlüssel liegen als Cloudflare-Secrets, Zugangs-Tokens der Dienste verschlüsselt in der Datenbank. Oura-Daten gehen nie an eine KI.
