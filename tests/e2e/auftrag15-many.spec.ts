/* Auftrag 15, Punkt 5: alle 60 Test-Nutzer nach 3 simulierten Wochen in der App (normale Nutzer, kein Betreiber).
   Je Nutzer: Heute, Plan (mit geöffneter Einheit), Coach, Fortschritt, Mehr, Profil, Werte, Verbindungen, Daten, Einstellungen,
   Berücksichtigungen. Geprüft: nichts ragt aus dem Bildschirm, keine Fehler in der Konsole, keine Betreiber-Infos oder Fachbegriffe wie
   Server/API/Secret, zentrales Lexikon separat geprüft, Ampel-Farbe passt zum Wert, keine nicht gewählte Sportart im Plan der nächsten Tage.
   Chromium für alle 60, WebKit (iPhone) für jeden vierten. */
import { test, expect, type Page } from '@playwright/test';
import { manyUsers, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate } from '../helpers/many-sim';
// Zentrales Lexikon statt Erklärblöcken je Karte: siehe lexikon.spec.ts.
import * as C from '../../shared/core';

const USERS = manyUsers();
const TECH = /\bServer\b|\bAPI\b|Secret|TOKEN_KEY|_CLIENT_|APP_SECRET|Betreiber|wrangler|FUER-JONAH|Sync einrichten|Einrichtungscode/;
const SCREENS = ['heute', 'plan', 'coach', 'fortschritt', 'mehr', 'profil', 'werte', 'verbindungen', 'daten', 'einstellungen', 'beruecksichtigungen'];
const SPORT_TITLE: Record<string, RegExp> = { run: /Lauf|Fahrtspiel|Hügelsprints/, bike: /Ausfahrt|Rad |Rolle|Sweet Spot|Over-Unders/, swim: /Schwimm|Kraul|Freiwasser/ };

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth; const out: string[] = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    const hidden = (el: Element) => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) if (!(d as HTMLDetailsElement).open && !(el.closest('summary') && el.closest('summary')!.parentElement === d)) return true; return false; };
    const scroller = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return true; } return false; };
    for (const el of Array.from(document.querySelectorAll('#app *, #sheetPanel *'))) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || hidden(el) || scroller(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (cs.position === 'fixed' && (r.top > innerHeight || r.bottom < 0)) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} „${(el.textContent || '').trim().slice(0, 30)}“ ragt heraus`);
    }
    return [...new Set(out)].slice(0, 5);
  });
}

for (const [i, u] of USERS.entries()) {
  test(`${u.id}: alle Bildschirme sauber`, async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && i % 4 !== 0, 'WebKit: jeder vierte Nutzer');
    test.setTimeout(90000);
    const sim = simulate(u, MANY_TODAY);
    const today = sim.today;
    const st: any = { ...sim.state, profile: { ...sim.profile, updatedAt: 1 }, goals: Object.fromEntries(sim.goals.map((g: any) => [g.id, g])), settings: { ...(sim.state.settings || {}), planRules15: 'x' } };
    const errors: string[] = [];
    page.on('pageerror', e => errors.push('Fehler: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_CONNECTION|404|status of 40[0-9]/i.test(m.text())) errors.push('Konsole: ' + m.text().slice(0, 160)); });
    await page.addInitScript(([p, s]) => {
      if (sessionStorage.getItem('__m')) return;
      localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
      localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); sessionStorage.setItem('__m', '1');
    }, [JSON.stringify(sim.plan), JSON.stringify(st)]);
    await page.clock.setFixedTime(new Date(`${today}T07:30:00+01:00`));
    const found: string[] = [];
    for (const sc of SCREENS) {
      await page.goto('/?go=' + sc);
      await expect(page.locator('#app')).not.toBeEmpty();
      await page.waitForTimeout(80);
      (await problems(page)).forEach(p => found.push(`${sc}: ${p}`));
      const text = await page.locator('#app').innerText();
      const tech = TECH.exec(text); if (tech) found.push(`${sc}: „${tech[0]}“ sichtbar: …${text.slice(Math.max(0, tech.index - 40), tech.index + 40).replace(/\s+/g, ' ')}…`);
      if (sc === 'heute') {
        // Ampel: Farbe passt zum Wert (ab 70 grün, 45-69 gelb, darunter rot, ohne Wert grau)
        const card = page.locator('.answer').first();
        if (await card.count()) {
          const cls = (await card.getAttribute('class')) || ''; const v = (await card.locator('.ring .rv b').first().textContent().catch(() => '') || '').trim();
          const n = /^\d+$/.test(v) ? +v : null; const want = n == null ? 'l3' : n >= 70 ? 'l0' : n >= 45 ? 'l1' : 'l2';
          if (!new RegExp('\\b' + want + '\\b').test(cls) && !/ill|krank/i.test(cls)) found.push(`Ampel: Wert ${v}, Klasse ${cls}`);
        }
      }
      if (sc === 'plan') {
        const b = page.locator('[data-act="sess-open"]').first();
        if (await b.count()) { await b.click(); await page.waitForTimeout(60); (await problems(page)).forEach(p => found.push(`Einheit: ${p}`)); const t = await page.locator('#sheetPanel').innerText().catch(() => ''); const tech2 = TECH.exec(t); if (tech2) found.push(`Einheit: „${tech2[0]}“`); await page.keyboard.press('Escape'); }
      }
    }
    // keine nicht gewählte Sportart in den nächsten 14 Tagen
    const days = C.planDays(C.applyAdjustments(sim.plan.weeks, sim.state.adjustments || {})).filter((d: any) => d.date >= today && d.date <= C.addDays(today, 13));
    for (const d of days) for (const s of d.sessions) if (s && s.sport !== 'rest' && !s.race && !(sim.profile.sports || []).includes(s.sport) && !(s.sport === 'football' && sim.profile.teamSport) && !(s.sport === 'strength' && ((sim.profile.freq || {}).strength || [0])[0] > 0)) found.push(`Plan ${d.date}: ${s.title} (${s.sport}) nicht gewählt`);
    void SPORT_TITLE;
    expect([...errors, ...found]).toEqual([]);
  });
}
