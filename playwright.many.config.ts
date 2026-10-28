import {defineConfig} from '@playwright/test';
import storage from './playwright.storage.config';
export default defineConfig({...storage,testMatch:['auftrag15-many.spec.ts'],globalTimeout:300000,outputDir:'test-results/many-startup',use:{...storage.use,trace:'retain-on-failure'}});
