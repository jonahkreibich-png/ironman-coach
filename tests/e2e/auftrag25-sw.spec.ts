/* Auftrag 25: echter Service Worker (sonst im Test abgeschaltet): registriert, aktiv, App startet offline, Server-Anfragen bleiben frisch. */
import { test, expect } from '@playwright/test';
import { seed } from './helpers';

test.use({ serviceWorkers: 'allow' });
test('Service Worker startet, App öffnet offline, /api wird nie zwischengespeichert', async ({ page, context }) => {
  await seed(page);
  await page.goto('/?go=heute');
  await expect(page.locator('#app')).not.toBeEmpty();
  const st = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 15000))]) as any; return r ? !!r.active : false; });
  expect(st).toBe(true);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('#tabs .tab').first()).toBeVisible();
  const api = await page.evaluate(() => fetch('./api/health').then(r => 'antwort ' + r.status, () => 'kein netz'));
  expect(api).toBe('kein netz');
  await context.setOffline(false);
});
