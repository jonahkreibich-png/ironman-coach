import { storage } from './persistence';
import { startApplication } from './startup';
void startApplication(document.getElementById('app')!,document.getElementById('app-startup'),()=>storage.initialize(),()=>import('./main'));
