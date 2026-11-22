/* Auftrag 41, Punkt 5: Wiederholungs-Prüfer (dauerhaft, ganze Fehlerart). Über alle Hauptbildschirme (Heute, Plan, Einheit vor und nach
   dem Training mit offener Änderungs-Box, Coach, Fortschritt, Mehr) für Testnutzer aus den erfundenen Profilen (simulierte Monate) und den
   Demo-Nutzer. Gesucht im sichtbaren Text:
   - gleiche oder fast gleiche Zeilen im selben Kasten (Karte, Zeile, Kopf, Box, Hinweis) – Listen/Tabellen/Abläufe ausgenommen
   - derselbe Satzteil mehrfach in einer Zeile („3 × 100 m + 4 × 100 m + 4 × 100 m“)
   - „X → X“ (vorher = nachher), leere vorher/nachher
   - doppelte Abzeichen in einer Zeile bzw. im Kopf („erledigt“ und „✓ erledigt“), „Geplant“ zweimal
   - interne Platzhalter („Begründung nicht für die KI freigegeben“) */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { manyUsers, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate } from '../helpers/many-sim';
import { seed, TODAY } from './helpers';

const PICK = ['n06-fitness', 'n22-run-half', 'n25-tri-sprint', 'n28-tri-long', 'n31-bike-event', 'n32-swim-goal', 'n57-mama', 'n60-team-tri'];
const USERS = manyUsers().filter(u => PICK.includes(u.id));

/** Prüfung im Browser: liefert gefundene Wiederholungen (mit Stelle) */
export async function repeats(page: Page, where: string): Promise<string[]> {
  const found: string[] = await page.evaluate(() => {
    const out: string[] = [];
    const vis = (el: Element) => { const h = el as HTMLElement; if (!h.offsetParent && getComputedStyle(h).position !== 'fixed') return false; for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!(d as HTMLDetailsElement).open && !el.closest('summary')) return false; } return true; };
    const norm = (s: string) => s.toLowerCase().replace(/[›‹»«„“"'()]/g, '').replace(/\s+/g, ' ').trim();
    const roots = [document.querySelector('#app'), document.querySelector('#sheetPanel'), document.querySelector('#subPanel')].filter(r => r && (r as HTMLElement).offsetParent !== null) as HTMLElement[];
    const near = (a: string, b: string) => {
      if (a === b) return true; if (Math.min(a.length, b.length) < 24) return false;
      if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.1) return false;
      // Levenshtein mit Abbruch (fast gleich = höchstens 8 % anders)
      const lim = Math.floor(Math.max(a.length, b.length) * 0.08); let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 1; i <= a.length; i++) { const cur = [i]; let mn = i; for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); mn = Math.min(mn, cur[j]); } if (mn > lim) return false; prev = cur; }
      return prev[b.length] <= lim;
    };
    const LISTY = 'ol, ul, table, .list, .ablauf, .week, .crit-grid, .steps, [data-missed-list], .feed, .tbl, .wo-diagram-wrap, .scroll-x, .pm-bars, .chips, select, .fgrid';
    for (const root of roots) {
      const text = root.innerText || '';
      // interne Platzhalter
      if (/Begründung nicht für die KI freigegeben|Trainingsangabe \(/.test(text)) out.push('interner Platzhalter im Text');
      // X → X
      for (const line of text.split('\n')) {
        const m = /(?:^|[:\s])([^→\n:]{3,90}?)\s+→\s+([^→\n]{3,90})$/.exec(line.trim());
        if (m && norm(m[1]) === norm(m[2])) out.push(`„X → X“: ${line.trim().slice(0, 120)}`);
        if (/^(vorher|nachher):\s*(–|-)?\s*$/i.test(line.trim())) out.push(`leeres vorher/nachher: ${line.trim()}`);
        // derselbe Satzteil mehrfach in einer Zeile
        const parts = line.split(/\s(?:\+|·|;|\|)\s|,\s/).map(norm).filter(p => p.length >= 6 && /\D/.test(p));
        const seen = new Set<string>();
        for (const p of parts) { if (seen.has(p)) { out.push(`Satzteil doppelt in einer Zeile: ${line.trim().slice(0, 120)}`); break; } seen.add(p); }
      }
      // gleiche bzw. fast gleiche Zeilen im selben Kasten
      const boxes = Array.from(root.querySelectorAll('[data-kopf], .adj-info, .banner, .session-hero, .msg, .coach-review, .card, .li, .hint')).filter(b => vis(b) && !b.querySelector(LISTY) && !b.closest(LISTY.replace(/, \.list/, '')));
      for (const b of boxes) {
        const lines = ((b as HTMLElement).innerText || '').split('\n').map(norm).filter(l => l.length >= 8);
        for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (near(lines[i], lines[j])) { out.push(`Zeile doppelt: „${lines[i].slice(0, 80)}“ (${(b as HTMLElement).className || b.tagName})`); i = lines.length; break; }
        const geplant = lines.filter(l => /^geplant:/.test(l)).length; if (geplant > 1) out.push(`„Geplant“ ${geplant}× im selben Kasten`);
      }
      // doppelte Abzeichen in einer Zeile bzw. im Kopf
      for (const row of Array.from(root.querySelectorAll('.li, .session-hero, [data-kopf], .adj-info summary')).filter(vis)) {
        const pills = Array.from(row.querySelectorAll('.pill')).filter(p => vis(p) && p.closest('.li, .session-hero, [data-kopf], .adj-info summary') === row).map(p => norm((p as HTMLElement).innerText || '').replace(/^✓\s*/, ''));
        for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) if (pills[i] && pills[j] && (pills[i] === pills[j] || pills[i].startsWith(pills[j] + ' ') || pills[j].startsWith(pills[i] + ' '))) out.push(`Abzeichen doppelt: „${pills[i]}“ / „${pills[j]}“`);
      }
    }
    return [...new Set(out)];
  });
  return found.map(f => `${where}: ${f}`);
}
const closeAll = async (page: Page) => { for (let i = 0; i < 3; i++) { if (await page.locator('#sub:not([hidden])').count() || await page.locator('#sheet:not([hidden])').count()) await page.keyboard.press('Escape'); } };
async function openBoxes(page: Page) { await page.evaluate(() => { document.querySelectorAll('#sheetPanel details.adj-info, #sheetPanel details.sess-guide').forEach(d => { (d as HTMLDetailsElement).open = true; }); }); }

async function tour(page: Page, found: string[]) {
  const check = async (w: string) => { await page.waitForTimeout(60); found.push(...await repeats(page, w)); };
  await page.goto('/?go=heute'); await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'ready', { timeout: 15000 });
  await check('Heute');
  await page.goto('/?go=plan'); await check('Plan');
  // Einheiten: offene (vor dem Training), angepasste (Box offen), nach dem Abhaken (nach dem Training)
  const n = Math.min(5, await page.locator('[data-act="sess-open"]').count());
  for (let i = 0; i < n; i++) {
    await closeAll(page);
    await page.locator('[data-act="sess-open"]').nth(i).click();
    await expect(page.locator('#sheetPanel')).toBeVisible();
    await openBoxes(page); await check(`Einheit ${i + 1}`);
    const tog = page.locator('#sheetPanel .sess-actions [data-act="sess-toggle"]').first();
    if (i < 2 && await tog.count()) {
      await tog.click(); await page.waitForTimeout(120); await openBoxes(page); await check(`Einheit ${i + 1} nach dem Abhaken`);
      const back = page.locator('#sheetPanel .sess-actions [data-act="sess-toggle"]').first(); if (await back.count()) await back.click();
    }
  }
  await closeAll(page);
  await page.goto('/?go=coach'); await check('Coach');
  await page.goto('/?go=fortschritt'); await check('Fortschritt');
  await page.goto('/?go=mehr'); await check('Mehr');
}

for (const u of USERS) {
  test(`Wiederholungen ${u.id}: ${u.label.slice(0, 50)}`, async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && USERS.indexOf(u) % 3 !== 0, 'WebKit: jeder dritte Nutzer');
    test.setTimeout(150000);
    const sim = simulate(u, MANY_TODAY);
    const st: any = { ...sim.state, profile: { ...sim.profile, updatedAt: 1 }, goals: Object.fromEntries(sim.goals.map((g: any) => [g.id, g])), settings: { ...(sim.state.settings || {}), planRules15: 'x' } };
    await page.addInitScript(([p, s]) => {
      if (sessionStorage.getItem('__w')) return;
      localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
      localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); sessionStorage.setItem('__w', '1');
    }, [JSON.stringify(sim.plan), JSON.stringify(st)]);
    await page.clock.setFixedTime(new Date(`${sim.today}T07:30:00+01:00`));
    const found: string[] = [];
    await tour(page, found);
    expect([...new Set(found)]).toEqual([]);
  });
}

test('Wiederholungen: Demo-Nutzer mit Uhr-Daten', async ({ page }) => {
  test.setTimeout(150000);
  await seed(page);
  const found: string[] = [];
  await tour(page, found);
  expect([...new Set(found)]).toEqual([]);
});

/* Der gemeldete Fall (Nutzer 1, Schwimmen So 22.11.): Box mit „vorher = nachher“ und dreimal demselben Titel. Mit Anpassungen wie in den
   echten Daten: Schwimm-Nachweis ohne Unterschied, echte Inhalts-Änderung, Verschieben, interner Platzhalter. */
test('Änderungs-Box: nur Netto-Unterschied, Schritte ohne Doppelte, kein Platzhalter', async ({ page }) => {
  await seed(page, { extra: (demo: any) => {
    const days = demo.plan.weeks.flatMap((w: any) => w.days);
    let i = days.findIndex((d: any) => d.date === TODAY) - 1; while (i > 0 && !days[i].sessions.some((x: any) => x.sport !== 'rest' && x.sport !== 'football')) i--;
    const d = days[i]; const s = d.sessions.find((x: any) => x.sport !== 'rest' && x.sport !== 'football'); const to = TODAY; // vom Vortag auf heute verschoben: im Heute-Tab sichtbar
    const t0 = Date.parse(TODAY + 'T06:00:00Z') - 86400e3;
    demo.adjustments = {
      'a-noop': { id: 'a-noop', type: 'modify', sessionId: s.id, set: { title: s.title, plannedMinutes: s.plannedMinutes, plannedKm: s.plannedKm ?? null, zone: s.zone, description: s.description, spec: s.spec }, what: `${s.title} → ${s.title}`, reason: 'Aktualisierte Schwimmnachweise (deine Werte): 100 m Kraul am Stück', createdAt: t0, date: TODAY },
      'a-noop2': { id: 'a-noop2', type: 'modify', sessionId: s.id, set: { title: s.title }, what: `${s.title} → ${s.title}`, reason: 'Aktualisierte Schwimmnachweise (deine Werte): 100 m Kraul am Stück', createdAt: t0 + 1, date: TODAY },
      'a-move': { id: 'a-move', type: 'move', sessionId: s.id, from: d.date, to, what: 'Trainingsangabe (Begründung nicht für die KI freigegeben): verschoben', reason: 'von dir geändert', createdAt: t0 + 2, date: TODAY }
    };
  } });
  await page.goto('/?go=heute');
  const sid = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ec_state_v2') || '{}').adjustments || {}).map((a: any) => a.sessionId)[0]);
  await page.locator(`.session-hero [data-act="sess-open"][data-sid="${sid}"]`).click();
  await expect(page.locator('#sheetPanel [data-adj-info]')).toBeVisible();
  await expect(page.locator('#sheetPanel [data-adj-info] summary .pill')).toHaveText('verschoben');
  await openBoxes(page);
  await expect(page.locator('#sheetPanel [data-adj-row="date"]')).toBeVisible();
  await expect(page.locator('#sheetPanel [data-adj-row="title"]')).toHaveCount(0);
  await expect(page.locator('#sheetPanel [data-adj-step]')).toHaveCount(1);
  expect(await repeats(page, 'Box')).toEqual([]);
  // die leeren Anpassungen sind beim Laden über den normalen Weg stillgelegt (mit Zeitstempel, nicht gelöscht)
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}').adjustments);
  expect(st['a-noop'].retired && st['a-noop'].undone).toBe(true);
  expect(st['a-noop2'].retired).toBe(true);
  expect(st['a-move'].undone).toBeFalsy();
  expect(st['a-move'].what).not.toMatch(/freigegeben/);
});
