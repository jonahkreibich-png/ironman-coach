import {defineConfig} from '@playwright/test';
import storage from './playwright.storage.config';
/* Die zehn gemeldeten Fehlerfaelle plus passende Gegenproben, gleicher isolierter Transport. */
export default defineConfig({...storage,testMatch:['auftrag4.spec.ts','auftrag6.spec.ts','layout.spec.ts'],grep:/A1\/F4\/F1|Bildschirm mit offenen|versehentlicher Tipp|Übernehmen zeigt|hell, fehler/,globalTimeout:360000,outputDir:'test-results/reported-regressions'});
