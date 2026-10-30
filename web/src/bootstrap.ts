import { setAppTz } from '../../shared/tz';
import { storage } from './persistence';
import { startApplication } from './startup';
// Auftrag 22: „heute“ und Uhrzeiten in der Zeitzone des Geräts (Reisen, Nutzer in anderen Ländern); Standard Europe/Berlin
try { setAppTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (_) { /* Standard bleibt */ }
void startApplication(document.getElementById('app')!,document.getElementById('app-startup'),()=>storage.initialize(),()=>import('./main'));
