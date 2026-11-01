import { setAppTz } from '../../shared/tz';
import { storage } from './persistence';
import { startApplication } from './startup';
// Auftrag 26: Gestaltung gehört zum Einstieg. Vorher kam das CSS erst mit main.ts (nachgeladen): bis dahin war die Seite weiß und
// ungestaltet (weißer Blitz vor dem dunklen Design). So steht es als <link> im Kopf von index.html und gilt ab dem ersten Bild.
import './styles.css';
import './design.css';
import './palettes.css'; // Auftrag 26: Farbvarianten (nur Test-Umgebung umschaltbar)
// Auftrag 22: „heute“ und Uhrzeiten in der Zeitzone des Geräts (Reisen, Nutzer in anderen Ländern); Standard Europe/Berlin
try { setAppTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (_) { /* Standard bleibt */ }
// Messpunkte für den Start (Auftrag 26, tests/e2e/kaltstart26.spec.ts): Speicher gelesen, App-Code geladen, erstes Bild gezeichnet (main.ts)
const mark=(n:string)=>{try{performance.mark(n);}catch(_){/* alte Browser */}};
void startApplication(document.getElementById('app')!,document.getElementById('app-startup'),()=>storage.initialize().then(()=>mark('stamio:storage')),()=>import('./main').then(()=>mark('stamio:main')),600);
