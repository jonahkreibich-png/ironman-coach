import {defineConfig,devices} from '@playwright/test';
import storage from './playwright.storage.config';
import fs from 'node:fs';import path from 'node:path';
const installed=path.join(process.env.USERPROFILE||'','AppData/Local/ms-playwright');
const firefoxAvailable=fs.existsSync(installed)&&fs.readdirSync(installed).some(n=>n.startsWith('firefox-'));
export default defineConfig({...storage,testMatch:['plan-templates26.spec.ts','template-crud26.spec.ts','plan-dashboard27.spec.ts'],globalTimeout:360000,outputDir:'test-results/plan26',projects:[
{name:'chromium-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
{name:'chromium-mobile',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},hasTouch:true}},
{name:'webkit-mobile',use:{...devices['Desktop Safari'],viewport:{width:390,height:844},hasTouch:true}},
...(firefoxAvailable?[{name:'firefox-desktop',use:{...devices['Desktop Firefox'],viewport:{width:1440,height:900}}}]:[])
]});
