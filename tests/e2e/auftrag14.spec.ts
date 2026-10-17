/* Auftrag 14: Ampel auf „Heute“ zeigt einen Wert (Ring, Wort, Satz und Farbe gleich), Einzelwerte mit eigener Farbe,
   „unsicher“ ohne Morgenwerte; Morgen-Eingabe mit Gefühl und Muskelkater. Erfundene Daten. */
import { test, expect } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

const LEVEL_CLASS: Record<string, string> = { Bereit: 'l0', Locker: 'l1', Ruhe: 'l2', Unsicher: 'l3' };

test('Papas Fall: kurzer Schlaf, Normalbereich noch nicht gelernt → gelb überall, Einzelwerte farbig', async ({ page }) => {
  await seed(page, { extra: d => { d.trend = [{ date: '2026-10-13', restingHR: 46 }, { date: TODAY, restingHR: 53, hrv: 65, sleepHours: 5.3, sleepQuality: 6 }];
    // eine alte, widersprüchliche Morgen-Nachricht darf den Text nicht bestimmen
    d.coachMsgs = { ...(d.coachMsgs || {}), ['msg-brief-' + TODAY]: { id: 'msg-brief-' + TODAY, at: Date.now(), date: TODAY, kind: 'briefing', from: 'coach', title: 'Ampel 🟢', text: 'Morgen! Alles im grünen Bereich. Ampel grün (100/100).' } }; } });
  await open(page, '/');
  const card = page.locator('.answer');
  const word = (await card.locator('.status-word').textContent())!.trim();
  // 5,3 h Schlaf: höchstens gelb (die Belastung aus den Demo-Einheiten kann es auch rot machen) – aber Ring, Wort, Farbe und Satz gleich
  expect(['Locker', 'Ruhe']).toContain(word);
  await expect(card).toHaveClass(new RegExp(LEVEL_CLASS[word]));
  const score = +(await card.locator('.ring .rv b').textContent())!;
  if (word === 'Locker') { expect(score).toBeGreaterThanOrEqual(45); expect(score).toBeLessThanOrEqual(69); } else expect(score).toBeLessThan(45);
  await expect(card.locator('.coach-line')).toContainText(`${score}/100: ${word === 'Locker' ? 'lockerer trainieren' : 'Ruhe oder nur ganz locker'}`);
  await expect(card.locator('.coach-line')).not.toContainText('grün');
  await card.locator('details.more summary').click();
  await expect(card.locator('.crit.warn')).toContainText('Schlaf');
  // jeder Einzelwert hat eine eigene Ampelfarbe (grau = fehlt oder wird gelernt)
  const cls = await card.locator('.crit').evaluateAll(els => els.map(e => e.className));
  expect(cls.length).toBeGreaterThanOrEqual(3);
  for (const c of cls) expect(c).toMatch(/crit (ok|warn|bad|none)/);
});

test('keine Morgenwerte → „Ampel unsicher – keine Morgenwerte“, grauer Ring ohne Zahl', async ({ page }) => {
  await seed(page, { extra: d => { d.trend = (d.trend || []).filter((p: any) => p.date < TODAY); } });
  await open(page, '/');
  const card = page.locator('.answer');
  await expect(card.locator('.status-word')).toHaveText('Unsicher');
  await expect(card).toHaveClass(/l3/);
  await expect(card.locator('.coach-line')).toContainText('Ampel unsicher – keine Morgenwerte');
  await expect(card.locator('.ring .rv b')).toHaveText('–');
});

test('Morgenwerte: Gefühl und Muskelkater eintragen ändert die Ampel', async ({ page }) => {
  await seed(page, { extra: d => { d.trend = (d.trend || []).filter((p: any) => p.date < TODAY).concat([{ date: TODAY, hrv: 60, restingHR: 50, sleepHours: 8.5, sleepQuality: 8 }]); } });
  await open(page, '/');
  await page.locator('[data-act="checkin-open"]').first().click();
  await page.locator('[data-act="ck-chip"][data-k="feel"][data-v="5"]').click();
  await page.locator('[data-act="ck-chip"][data-k="soreness"][data-v="3"]').click();
  await page.locator('.sheet .btn.block[data-act="sheet-close"]').click();
  await expect(page.locator('.answer .status-word')).not.toHaveText('Bereit');
  await page.locator('.answer details.more summary').click();
  await expect(page.locator('.answer .crit.warn')).toContainText(['Gefühl']);
});
