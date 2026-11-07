import { setAppTz } from '../../shared/tz';
import { storage } from './persistence';
import { startApplication, START_TEXT, type StartFailure } from './startup';
import { registerServiceWorker, findUpdate, activate, updateAndReload } from './swreg';
import { logError, initErrorLog } from './errlog';
// Auftrag 26: Gestaltung gehört zum Einstieg. Vorher kam das CSS erst mit main.ts (nachgeladen): bis dahin war die Seite weiß und
// ungestaltet (weißer Blitz vor dem dunklen Design). So steht es als <link> im Kopf von index.html und gilt ab dem ersten Bild.
import './styles.css';
import './design.css';
import './theme.css'; // Auftrag 27: alle Farben aus scripts/palettes.mjs (B + C)
// Auftrag 22: „heute“ und Uhrzeiten in der Zeitzone des Geräts (Reisen, Nutzer in anderen Ländern); Standard Europe/Berlin
try { setAppTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (_) { /* Standard bleibt */ }
// Auftrag 28: Fehlerprotokoll und Service Worker gleich am Anfang, unabhängig davon, ob der App-Code startet
initErrorLog();
if (document.readyState === 'complete') void registerServiceWorker(); else window.addEventListener('load', () => void registerServiceWorker(), { once: true });
// Messpunkte für den Start (Auftrag 26, tests/e2e/kaltstart26.spec.ts): Speicher gelesen, App-Code geladen, erstes Bild gezeichnet (main.ts)
const mark=(n:string)=>{try{performance.mark(n);}catch(_){/* alte Browser */}};

/* Auftrag 28: Fehlerseite mit „Erneut versuchen“ (sucht ein Update und lädt neu). Gibt es schon eine neue Version, wird sie einmal
   automatisch übernommen (höchstens alle 10 Minuten, damit nie eine Neulade-Schleife entsteht). Lokale Daten werden nie gelöscht. */
const AUTO_KEY = 'stamio_start_autoupdate';
function startFailed(kind: StartFailure, err: unknown) {
  const e = err as any;
  logError((e && e.message) || String(err), 'start:' + kind + ' ' + String((e && e.stack) || '').split('\n').slice(0, 2).join(' '), true);
  const root = document.getElementById('app')!;
  root.textContent = '';
  const card = document.createElement('div'); card.className = 'card stack start-fail'; card.style.margin = 'var(--s4, 16px)';
  const title = document.createElement('b'); title.textContent = kind === 'storage' ? 'Deine Daten konnten nicht gelesen werden.' : 'Die App konnte nicht gestartet werden.';
  const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = START_TEXT[kind];
  const btn = document.createElement('button'); btn.className = 'btn block'; btn.id = 'start-retry'; btn.textContent = 'Erneut versuchen';
  const status = document.createElement('div'); status.className = 'hint'; status.setAttribute('role', 'status'); status.id = 'start-retry-status';
  card.append(title, hint, btn, status); root.appendChild(card);
  btn.addEventListener('click', async () => {
    btn.disabled = true; status.textContent = 'Suche nach einer neuen Version …';
    await updateAndReload(async () => { const ok = await storage.settled(); if (!ok) { btn.disabled = false; status.textContent = 'Noch nicht gespeichert. Bitte kurz warten und erneut versuchen.'; } return ok; });
  });
  // Eine schon bereitliegende neue Version gleich übernehmen
  void (async () => {
    let last = 0; try { last = +(localStorage.getItem(AUTO_KEY) || 0); } catch (_) { /* privat */ }
    if (Date.now() - last < 10 * 60000) return;
    const w = await findUpdate();
    if (!w || !(await storage.settled())) return;
    try { localStorage.setItem(AUTO_KEY, String(Date.now())); } catch (_) { /* privat */ }
    status.textContent = 'Neue Version gefunden, wird geladen …';
    await activate(w); location.reload();
  })();
}
void startApplication(document.getElementById('app')!,document.getElementById('app-startup'),()=>storage.initialize().then(()=>mark('stamio:storage')),()=>import('./main').then(()=>mark('stamio:main')),600,{ onError: startFailed });
