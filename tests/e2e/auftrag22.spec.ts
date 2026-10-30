/* Auftrag 22: Intervalle eintragen (Soll als Platzhalter, Enter springt weiter, „wie vorheriges“, Grenzen), große Schrift,
   Bedienbarkeit mit VoiceOver (jedes Bedienelement hat einen Namen), leere Grenzfälle. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, TODAY, openPlanSession, stored, writeStored } from './helpers';
import * as W from '../../shared/workouts';

async function sweetSpotToday(page: Page): Promise<string> {
  const b = W.build(W.bikeSweetSpot({ lthrBike: 165, indoor: true } as any, 2, 10, 70));
  await seed(page);
  await open(page, '/?go=plan');
  const sid = await page.evaluate(today => { const p = JSON.parse(localStorage.getItem('ec_plan') || '{"weeks":[]}'); for (const w of p.weeks) for (const d of w.days) for (const x of d.sessions || []) if (x.sport === 'bike' && d.date <= today) return x.id; return ''; }, TODAY);
  expect(sid).not.toBe('');
  const st = await stored(page);
  st.adjustments = { ...(st.adjustments || {}), 'a22-ss': { id: 'a22-ss', type: 'modify', sessionId: sid, set: { title: b.title, description: b.description, spec: b.spec, plannedMinutes: b.plannedMinutes }, what: 'Test', reason: 'Test', createdAt: 1, date: TODAY } };
  st.sessions = { ...(st.sessions || {}), [sid]: { completed: true, notes: '', metrics: { min: '70' } } };
  await writeStored(page, st); await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, sid);
  return sid;
}

test('Intervalle: Soll als Platzhalter, Eingabe mit Enter weiter, wie vorheriges, Grenzen, gespeichert', async ({ page }) => {
  const sid = await sweetSpotToday(page);
  const box = page.locator('#sheet [data-intervals]');
  await expect(box).toBeVisible();
  await expect(box.locator('.iv-bar')).toHaveCount(2);
  await expect(box.locator('.iv-bar').first()).toContainText('nicht gemacht');
  await box.locator('summary', { hasText: 'Intervalle eintragen' }).click();
  const sec = page.locator('#iv-0-sec');
  await expect(sec).toHaveValue('');
  await expect(sec).toHaveAttribute('placeholder', '10:00');
  await sec.fill('1000'); await sec.press('Enter');
  await expect(page.locator('#iv-0-power')).toBeFocused();
  await page.locator('#iv-0-power').fill('228'); await page.locator('#iv-0-power').press('Enter');
  await expect(page.locator('#iv-0-speed')).toBeFocused();
  // unmöglicher Puls: freundlich abgelehnt, nichts gespeichert
  await page.locator('#iv-0-hr').fill('300'); await page.locator('#iv-0-hr').press('Tab');
  await expect(page.locator('#toast')).toContainText('unrealistisch');
  await page.locator('#iv-0-hr').fill('150'); await page.locator('#iv-0-hr').press('Tab');
  await page.locator('#sheet [data-act="iv-copy"][data-i="1"]').click();
  await expect(page.locator('#iv-1-power')).toHaveValue('228');
  await expect(page.locator('#sheet [data-iv-sum]')).toContainText('228 W');
  await expect(page.locator('#sheet [data-iv-sum]')).toContainText('2 von 2 gemacht');
  const st = await stored(page);
  expect(st.sessions[sid].metrics.intervals.slice(0, 2)).toEqual([expect.objectContaining({ sec: 600, power: 228, hr: 150 }), expect.objectContaining({ sec: 600, power: 228, hr: 150 })]);
  expect(st.sessions[sid].metricsSrc.intervals).toBe('manual');
  // Intervall hinzufügen und löschen
  await page.locator('#sheet [data-act="iv-add"]').click();
  await expect(page.locator('#sheet .iv-card')).toHaveCount(3);
  await page.locator('#sheet [data-act="iv-del"][data-i="2"]').click();
  await expect(page.locator('#sheet .iv-card')).toHaveCount(2);
});

/* Alle sichtbaren Bedienelemente haben einen Namen für VoiceOver (Beschriftung, aria-label oder Text) */
async function unnamed(page: Page, scope: string): Promise<string[]> {
  return page.evaluate(sel => {
    const root = document.querySelector(sel) || document.body;
    const out: string[] = [];
    root.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=button], a[href]').forEach((el: any) => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[hidden]')) return;
      const lab = (el.getAttribute('aria-label') || '').trim() || (el.labels && el.labels.length ? Array.from(el.labels).map((l: any) => l.textContent).join(' ').trim() : '') ||
        (el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || '').trim() : '') || (el.textContent || '').trim() || (el.getAttribute('title') || '').trim() || (el.getAttribute('placeholder') || '').trim();
      if (!lab) out.push(el.outerHTML.slice(0, 120));
    });
    return out;
  }, scope);
}
test('VoiceOver: Einheit abhaken, Werte und Intervalle eintragen, Coach – jedes Bedienelement hat einen Namen', async ({ page }) => {
  await sweetSpotToday(page);
  await page.locator('#sheet summary', { hasText: 'Intervalle eintragen' }).click();
  expect(await unnamed(page, '#sheet')).toEqual([]);
  await page.keyboard.press('Escape');
  await open(page, '/?go=heute');
  expect(await unnamed(page, '#app')).toEqual([]);
  await open(page, '/?go=coach');
  expect(await unnamed(page, '#app')).toEqual([]);
  await expect(page.getByRole('textbox').first()).toBeVisible();
});

test('große Schrift (doppelt so groß): nichts ragt seitlich heraus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '34px'; }); });
  await sweetSpotToday(page);
  await page.locator('#sheet summary', { hasText: 'Intervalle eintragen' }).click();
  const over = async () => page.evaluate(() => ({ page: document.scrollingElement!.scrollWidth - window.innerWidth, sheet: (() => { const s = document.querySelector('#sheetPanel') as HTMLElement | null; return s ? s.scrollWidth - s.clientWidth : 0; })() }));
  expect(await over()).toEqual({ page: 0, sheet: 0 });
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#sheet [data-intervals] .lab') as HTMLElement).fontSize))).toBeGreaterThan(20);
  await page.keyboard.press('Escape');
  for (const tab of ['heute', 'plan', 'coach', 'fortschritt', 'mehr']) { await open(page, '/?go=' + tab); const o = (await over()).page; const who = o > 0 ? await page.evaluate(() => { const W = document.documentElement.clientWidth; return Array.from(document.querySelectorAll('body *')).filter((el: any) => { const r = el.getBoundingClientRect(); return r.right > W + 1 || (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0); }).slice(-8).map((el: any) => el.tagName + '.' + el.className + ':' + Math.round(el.getBoundingClientRect().right) + '/' + el.scrollWidth + '>' + el.clientWidth + ' ' + (el.textContent || '').slice(0, 30)).join(' | '); }) : ''; expect(o, tab + ' ' + who).toBeLessThanOrEqual(0); }
});

test('neuer Nutzer ohne Daten: jeder Hauptbildschirm zeigt etwas Sinnvolles, kein Fehler', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page, { noPlan: true });
  for (const tab of ['heute', 'plan', 'coach', 'fortschritt', 'mehr']) {
    await open(page, '/?go=' + tab);
    const text = await page.locator('#app').innerText();
    expect(text.trim().length, tab).toBeGreaterThan(20);
    expect(text, tab).not.toMatch(/undefined|NaN|\[object|null\b/);
  }
  expect(errors).toEqual([]);
});

/* Grenzfälle: Plan aus dem echten Fragebogen-Ablauf, dann alle Hauptbildschirme */
import { applyOnboarding } from '../../shared/onboarding';
import { addDays } from '../../shared/core';
const base = { injuries: 'keine', medical: false, experienceYears: 2, runContinuousMin: 40, bikeLongestMin: 90, bikes: ['road'], powerMeter: false, swimCrawl: 'yes', swimCrawlM: 400, swimBreast: true, poolM: '25', swimGear: [], dayLoad: { 0: 2, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2 }, notes: [], wantTests: false };
const EDGE: [string, any][] = [
  ['nur Laufen, Ziel in 2 Wochen', { ...base, birthYear: 1990, sports: ['run'], goals: [{ id: 'g', type: 'run_10k', name: '10 km', date: addDays(TODAY, 14), priority: 'A' }], weeklyHours: 4, maxDayHours: 1.5 }],
  ['Langdistanz in 5 Jahren', { ...base, birthYear: 1985, sports: ['swim', 'bike', 'run'], goals: [{ id: 'g', type: 'tri_long', name: 'Langdistanz', date: addDays(TODAY, 1820), priority: 'A' }], weeklyHours: 10, maxDayHours: 3 }],
  ['14 Jahre, wenig Zeit', { ...base, birthYear: 2012, sports: ['run', 'swim'], goals: [{ id: 'g', type: 'tri_sprint', name: 'Sprint', date: addDays(TODAY, 120), priority: 'A' }], weeklyHours: 2, maxDayHours: 0.75 }],
  ['78 Jahre, nur Rad', { ...base, birthYear: 1948, sports: ['bike'], goals: [{ id: 'g', type: 'bike_event', name: 'Radmarathon', date: addDays(TODAY, 150), priority: 'A' }], weeklyHours: 5, maxDayHours: 2 }],
  ['sehr viel Zeit', { ...base, birthYear: 1995, sports: ['swim', 'bike', 'run', 'strength'], goals: [{ id: 'g', type: 'tri_middle', name: 'Mitteldistanz', date: addDays(TODAY, 200), priority: 'A' }], weeklyHours: 20, maxDayHours: 6 }]
];
for (const [label, answers] of EDGE) test('Grenzfall „' + label + '“: alle Hauptbildschirme sinnvoll, kein Fehler', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const r = applyOnboarding(answers, TODAY);
  expect(r.gen).toBeTruthy();
  await seed(page, { extra: d => { d.plan = r.gen!.plan; d.profile = r.profile; d.goals = Object.fromEntries(r.goals.map(g => [g.id, g])); d.sessions = {}; d.customWorkouts = {}; d.coachMsgs = {}; d.adjustments = {}; } });
  for (const tab of ['heute', 'plan', 'coach', 'fortschritt', 'mehr']) {
    await open(page, '/?go=' + tab);
    const text = await page.locator('#app').innerText();
    expect(text.trim().length, tab).toBeGreaterThan(20);
    expect(text, tab).not.toMatch(/undefined|NaN|\[object|Infinity/);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth), tab).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
