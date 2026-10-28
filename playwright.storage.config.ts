import fs from 'node:fs';
import path from 'node:path';
import {defineConfig} from '@playwright/test';
import base from './playwright.config';
process.env.STAMIO_STORAGE_IN_PROCESS='1';
const installed = process.env.USERPROFILE && path.join(process.env.USERPROFILE,'AppData','Local','ms-playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && installed && fs.existsSync(installed)) process.env.PLAYWRIGHT_BROWSERS_PATH=installed;
export default defineConfig({...base,webServer:undefined,testMatch:['storage-recovery24.spec.ts','strength-templates.spec.ts','load-values.spec.ts','readiness24.spec.ts'],use:{...base.use,launchOptions:{downloadsPath:path.resolve('scratch/storage-downloads')}},globalTimeout:180000,outputDir:'test-results/storage-in-process'});
