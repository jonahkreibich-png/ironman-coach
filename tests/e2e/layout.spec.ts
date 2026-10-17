/* Auftrag 5 C: Nichts darf aus dem Bildschirm ragen. Jeder Bildschirm (automatisch aus web/src/main.ts gelesen, neue laufen mit)
   in jedem Zustand (leer, normal, sehr voll mit langen Texten, Fehler) wird auf 320, 375, 390 und 430 px sowie mit 130 % Zoom
   (390 px / 1,3 = 300 px CSS-Breite) in WebKit geprüft, hell und dunkel, dazu geöffnete Sheets.
   Regeln: die Seite scrollt nie seitlich, kein sichtbares Element ragt über den Rand. Tabellen und Diagramme dürfen nur in ihrem
   eigenen Kasten scrollen (der Kasten selbst muss passen). */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
// @ts-ignore – reines JS ohne Typen
import { makeDemo } from '../../fixtures/demo.mjs';
import { TODAY } from './helpers';

const MAIN = fs.readFileSync('web/src/main.ts', 'utf8');
const TABS = [...MAIN.matchAll(/\{ id: '(\w+)', icon: '\w+', render: /g)].map(m => m[1]);
const SUBS = [...(/const SUBS: Record<string, \(\) => string> = \{([\s\S]*?)\n\};/.exec(MAIN) || ['', ''])[1].matchAll(/(\w+): /g)].map(m => m[1]);
const WIDTHS: [string, number][] = [['320', 320], ['375', 375], ['390', 390], ['430', 430], ['zoom130', 300]];
const LONG = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhalterung';

test.skip(({ browserName }) => browserName !== 'webkit', 'Layout wird in WebKit (iPhone) geprüft');

test('Bildschirme werden aus dem Code gefunden', () => {
  expect(TABS).toEqual(['heute', 'plan', 'coach', 'fortschritt', 'mehr']);
  expect(SUBS.length).toBeGreaterThanOrEqual(11);
});

type State = 'leer' | 'normal' | 'voll' | 'fehler';
function data(state: State) {
  const demo = makeDemo(TODAY);
  if (state === 'voll') {
    demo.profile = { ...(demo.profile || {}), name: 'Maximilian-Alexander von Hohenzollern-Sigmaringen', sports: ['swim', 'bike', 'run', 'strength', 'football'], teamSport: { name: 'Fußball ' + LONG, trainingDays: [1, 5], trainingMinutes: 90, gameDays: [6], gameMinutes: 90 },
      notes: [`${LONG} ${LONG}`, 'kann mittwochs nicht laufen, nur Samstag oder Sonntag', 'Schwimmbad nur Di, Mi und So', 'Urlaub vom 20.12. bis 6.1.', 'https://sehr-lange-adresse.example.com/pfad/zu/einer/datei/die/niemand/umbrechen/will'] };
    demo.goals = { g1: { id: 'g1', type: 'tri_long', name: 'Langdistanz ' + LONG, date: '2027-07-18', priority: 'A' }, g2: { id: 'g2', type: 'run_half', name: 'Halbmarathon am Bodensee mit sehr langem Namen', date: '2026-11-22', priority: 'B', targetTimeSec: 6300 } };
    const msgs: any = {};
    for (let i = 0; i < 30; i++) msgs['m' + i] = { id: 'm' + i, at: Date.parse(TODAY + 'T06:00:00Z') - i * 3600e3, date: TODAY, kind: i % 3 ? 'answer' : 'adjust', from: i % 2 ? 'coach' : 'user', title: i % 2 ? 'Plan angepasst: ' + LONG : undefined, text: `${LONG} ${'Wort '.repeat(30)} https://example.com/${LONG}`, actions: i === 1 ? [{ label: 'Ja, ' + LONG, kind: 'say', payload: 'x' }] : [] };
    demo.coachMsgs = msgs;
    // Auftrag 9: Zeitleiste mit vielen Phasen, langen Zielnamen und Platzhaltern
    demo.plan.meta.timeline = { from: TODAY, to: '2029-09-16', segments: [['base', '2026-10-19', '2027-02-21', 's'], ['build', '2027-02-22', '2027-05-09', 's'], ['specific', '2027-05-10', '2027-06-06', 's'], ['race', '2027-06-07', '2027-06-13', 's'], ['build', '2027-06-14', '2027-08-15', 'o'], ['taper', '2027-08-16', '2027-08-22', 'o'], ['race', '2027-08-23', '2027-08-29', 'o'], ['base', '2027-08-30', '2029-08-31', 'A'], ['race', '2029-09-01', '2029-09-16', 'A']].map(([phase, from, to, goalId]) => ({ phase, from, to, goalId })),
      goals: [{ id: 's', name: 'Sprint-Triathlon ' + LONG, date: '2027-06-13', priority: 'C', placeholder: true }, { id: 'o', name: 'Olympische Distanz am See mit sehr langem Namen', date: '2027-08-29', priority: 'B', placeholder: true }, { id: 'A', name: 'Langdistanz ' + LONG, date: '2029-09-15', priority: 'A' }] };
    // Auftrag 7: langer Plan (über 60 Wochen, wie nach dem Fragebogen mit Ziel in 3 Jahren). Daran ragte „Umfang pro Woche“ heraus.
    const ws = demo.plan.weeks; const last = ws[ws.length - 1];
    const add = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    for (let i = 1; i <= 64; i++) {
      const mon = add(last.startDate, 7 * i);
      ws.push({ weekNumber: last.weekNumber + i, label: 'Woche ' + (last.weekNumber + i), startDate: mon, endDate: add(mon, 6), isRecoveryWeek: i % 4 === 0,
        headline: `Woche ${last.weekNumber + i} · Block ${2 + Math.floor((i - 1) / 4)}, Woche ${((i - 1) % 4) + 1} → Langdistanz ${LONG}`, focus: 'Grundlage: ' + LONG,
        days: Array.from({ length: 7 }, (_, k) => ({ date: add(mon, k), sessions: k % 2 ? [{ id: `x${i}-${k}`, sport: k % 3 ? 'run' : 'bike', title: `Lockerer Lauf ${LONG}`, plannedMinutes: 40 + i, zone: 'Zone 2', description: LONG }] : [{ id: `x${i}-${k}-r`, sport: 'rest', title: 'Ruhetag' }] })) });
    }
  }
  return demo;
}
async function prepare(page: Page, state: State, dark: boolean) {
  const demo = data(state);
  const plan = demo.plan; const st: any = { ...demo }; delete st.plan;
  await page.addInitScript(([p, s, empty, err]) => {
    if (sessionStorage.getItem('__keep')) return;
    localStorage.clear();
    localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
    if (!empty) { localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); }
    if (err) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: 'ungueltig', deviceId: 'dev-x', userId: 2 })); localStorage.setItem('ec_err_log', JSON.stringify([{ msg: 'TypeError: ' + 'x'.repeat(200), where: 'plan.ts:1', at: 1 }])); }
  }, [JSON.stringify(plan), JSON.stringify(st), state === 'leer', state === 'fehler']);
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
}
/* Was ragt heraus? Elemente in einem eigenen Scroll-Kasten zählen nicht, der Kasten selbst schon. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    // Auftrag 15: Safari auf dem iPhone zeichnet Datums-/Zeitfelder mit eigener Mindestbreite (etwa 250 px), WebKit auf dem PC nicht.
    // Nachgestellt für alle Felder, die noch die System-Darstellung haben (nur appearance: none passt sich der Spalte an).
    for (const el of Array.from(document.querySelectorAll('input[type="date"], input[type="time"], input[type="month"]')) as HTMLElement[]) {
      const cs = getComputedStyle(el) as any; if ((cs.webkitAppearance || cs.appearance) !== 'none') el.style.minWidth = '250px';
    }
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}${(el as HTMLElement).dataset && (el as HTMLElement).dataset.act ? `[${(el as HTMLElement).dataset.act}]` : ''} „${(el.textContent || '').trim().slice(0, 40)}“`;
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    // in einem zugeklappten Abschnitt (auch verschachtelt, Auftrag 15) ist nichts sichtbar, außer der eigenen Überschrift
    const hiddenIn = (el: Element) => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!(d as HTMLDetailsElement).open) { const sm = el.closest('summary'); if (!sm || sm.parentElement !== d) return true; } } return false; };
    const scroller = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return p; } return null; };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('[aria-hidden="true"]') && el.tagName !== 'svg') continue;
      // Inhalt zugeklappter Abschnitte ist nicht sichtbar (WebKit meldet trotzdem eine Position)
      if (hiddenIn(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (cs.position === 'fixed' && (r.top > window.innerHeight || r.bottom < 0)) continue;
      if (scroller(el)) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`${desc(el)} ragt heraus (${Math.round(r.left)}..${Math.round(r.right)} bei ${W})`);
      // Auftrag 7: auch nicht aus der eigenen Karte (oben, unten, seitlich), z. B. umbrechende Diagramm-Balken über die nächste Karte
      const card = el.parentElement && el.parentElement.closest('.card');
      if (card && cs.position !== 'fixed' && cs.position !== 'absolute') {
        const cr = card.getBoundingClientRect();
        if (r.bottom > cr.bottom + 2 || r.top < cr.top - 2 || r.right > cr.right + 2 || r.left < cr.left - 2) out.push(`${desc(el)} ragt aus seiner Karte (${Math.round(r.top)}..${Math.round(r.bottom)} statt ${Math.round(cr.top)}..${Math.round(cr.bottom)})`);
      }
      // Auftrag 7: Wörter in Knöpfen, Chips, Pillen und großen Zahlen nicht mitten im Wort umbrechen („Ver-lau-f“, „0/ 10“)
      if (el.matches('.btn, .chip, .pill, .big') && (el.textContent || '').trim()) {
        // jedes Wort einzeln: liegt es auf zwei Zeilen, ist es mitten im Wort umgebrochen (Kunstwörter über 24 Zeichen dürfen das)
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let broken = false;
        for (let n = walker.nextNode(); n && !broken; n = walker.nextNode()) {
          const txt = n.textContent || '';
          for (const m of txt.matchAll(/\S+/g)) {
            if (m[0].length > 24) continue;
            const r = document.createRange(); r.setStart(n, m.index!); r.setEnd(n, m.index! + m[0].length);
            const tops = new Set(Array.from(r.getClientRects()).filter(x => x.width > 0).map(x => Math.round(x.top)));
            if (tops.size > 1) { broken = true; break; }
          }
        }
        if (broken) out.push(`${desc(el)} bricht mitten im Wort um`);
      }
      // Text, der abgeschnitten wird, ohne „…“
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && (el.textContent || '').trim()) out.push(`${desc(el)} schneidet Text ab`);
    }
    // Auftrag 10: Text darf nicht über seinen eigenen Kasten hinauslaufen (geschrumpfte Spalte mit nicht umbrechendem Text)
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const par = n.parentElement; if (!par || !(n.textContent || '').trim()) continue;
      const pcs = getComputedStyle(par); if (pcs.display === 'none' || pcs.visibility === 'hidden' || par.closest('[hidden]')) continue;
      if (hiddenIn(par)) continue;
      // eigener Scroll-Kasten oder bewusst abgeschnitten (mit „…“ eigener Test oben)
      if (scroller(par) || pcs.overflowX !== 'visible') continue;
      const pr = par.getBoundingClientRect(); if (pr.width < 1) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of Array.from(rg.getClientRects())) if (b.width > 0 && (b.right > pr.right + 2 || b.right > W + 1)) { out.push(`${desc(par)} Text läuft aus seinem Kasten (${Math.round(b.right)} > ${Math.round(pr.right)})`); break; }
    }
    return [...new Set(out)].slice(0, 15);
  });
}
const SCREENS = (state: State) => state === 'leer' ? ['/', '/?go=onboarding', '/?go=daten', '/?go=verbindungen', '/?go=feedback', '/?invite=ABCDEFGH', '#intro'] : [...TABS.map(x => '/?go=' + x), ...SUBS.map(x => '/?go=' + x)];

for (const [wname, w] of WIDTHS) {
  for (const dark of [false, true]) {
    for (const state of ['leer', 'normal', 'voll', 'fehler'] as State[]) {
      if (dark && state === 'fehler') continue;
      test(`${wname} px, ${dark ? 'dunkel' : 'hell'}, ${state}`, async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: w, height: 760 });
        await prepare(page, state, dark);
        const problems: string[] = [];
        for (const url of SCREENS(state)) {
          if (url === '#intro') {
            // Begrüßung neuer Tester mit Wiederherstellungscode, alle 3 Seiten
            await page.evaluate(() => { sessionStorage.setItem('__keep', '1'); localStorage.removeItem('ec_invite'); localStorage.setItem('ec_intro', '1'); localStorage.setItem('ec_rc_show', 'ABCD-EFGH-JKLM-NPQR'); });
            await page.goto('/');
            for (let i = 1; i <= 3; i++) { await expect(page.locator(`[data-intro="${i}"]`)).toBeVisible(); (await overflow(page)).forEach(p => problems.push(`Begrüßung ${i}: ${p}`)); if (i < 3) await page.locator('[data-act="intro-next"]').click(); }
            continue;
          }
          await page.goto(url);
          await expect(page.locator('#app')).not.toBeEmpty();
          await page.waitForTimeout(60);
          (await overflow(page)).forEach(p => problems.push(`${url}: ${p}`));
          // Fragebogen: alle Blöcke und die Zusammenfassung
          if (url.endsWith('onboarding')) {
            for (let i = 1; i < 9; i++) { const b = page.locator(`[data-act="ob-jump"][data-i="${i}"]`); if (!(await b.count())) break; await b.click(); (await overflow(page)).forEach(p => problems.push(`${url} Block ${i + 1}: ${p}`)); }
          }
          // Sheets: Einheit, Werte eintragen, Coach-Notizen, Plan bearbeiten
          if (state !== 'leer') {
            const sheets: [string, string][] = url.endsWith('=heute') ? [['[data-act="checkin-open"]', 'Werte'], ['[data-act="sess-open"]', 'Einheit']] : url.endsWith('=coach') ? [['[data-act="notes-open"]', 'Notizen']] : url.endsWith('=plan') ? [['[data-act="sess-open"]', 'Einheit']] : [];
            for (const [sel, name] of sheets) {
              const b = page.locator(sel).first(); if (!(await b.count())) continue;
              await b.click(); await page.waitForTimeout(60);
              (await overflow(page)).forEach(p => problems.push(`${url} Sheet ${name}: ${p}`));
              await page.keyboard.press('Escape');
            }
          }
          // Auftrag 6: vorgemerkte Änderung – Leiste unten und Vorschau-Sheet
          if (url.endsWith('beruecksichtigungen') && state !== 'leer') {
            const cell = page.locator('[data-act="rule-cell"]:not(.notime)').first(); // Tage ohne Zeit sind gesperrt
            if (await cell.count()) {
              await cell.click(); await expect(page.locator('[data-stage-bar]')).toBeVisible();
              (await overflow(page)).forEach(p => problems.push(`${url} Leiste „übernehmen“: ${p}`));
              await page.locator('[data-act="stage-apply"]').click(); await expect(page.locator('[data-stage-sheet]')).toBeVisible();
              (await overflow(page)).forEach(p => problems.push(`${url} Sheet Vorschau: ${p}`));
              await page.locator('[data-act="stage-back"]').click(); await page.locator('[data-act="stage-discard"]').click();
            }
          }
        }
        expect(problems).toEqual([]);
      });
    }
  }
}

/* Wörter in Tab-Leiste und Knöpfen dürfen nicht mitten im Wort getrennt werden */
for (const [wname, w] of WIDTHS) test(`${wname} px: Tab-Beschriftungen einzeilig`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 760 });
  await prepare(page, 'normal', false);
  await page.goto('/?go=heute');
  const lines = await page.locator('.tab span').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '14'))));
  lines.forEach(n => expect(n).toBeLessThanOrEqual(1));
  const cut = await page.locator('.tab span').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  expect(cut).toEqual([]);
});

/* Auftrag 10: ALLE Wochen eines echten, langen Plans (Einstieg, Tests, Erholung, Platzhalter-Ziele, Zeitleiste, Prozent-Zusatz),
   nicht nur die aktuelle Woche. Daran ragte „±Y % zur letzten Aufbauwoche“ ab Woche 6 aus dem Wochenkopf. Dazu lange Texte. */
import { patternPlan } from '../../fixtures/pattern-person';
for (const [wname, w] of WIDTHS) {
  for (const dark of [false, true]) {
    test(`${wname} px, ${dark ? 'dunkel' : 'hell'}: Plan, alle Wochen mit echten Zusätzen`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: w, height: 760 });
      const demo = makeDemo(TODAY);
      const plan = patternPlan(true).plan;
      // ein langer Zielname und eine lange Beschreibung in einer späteren Woche
      plan.meta.timeline.goals[0].name += ' am Baggersee ' + LONG;
      plan.weeks[plan.weeks.length - 3].focus = 'Erholungswoche ' + LONG + ' mit sehr langer Beschreibung, die umbrechen muss';
      const st: any = { ...demo, goals: {} }; delete st.plan;
      await page.addInitScript(([p, s]) => { if (sessionStorage.getItem('__keep')) return; localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); sessionStorage.setItem('__keep', '1'); }, [JSON.stringify(plan), JSON.stringify(st)]);
      await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await page.goto('/?go=plan');
      await expect(page.locator('[data-timeline]')).toBeVisible();
      const problems: string[] = [];
      const n = await page.locator('[data-act="plan-week"]').count();
      expect(n).toBe(plan.weeks.length);
      for (let i = 0; i < n; i++) {
        await page.evaluate(k => (document.querySelectorAll('[data-act="plan-week"]')[k] as HTMLElement).click(), i);
        await page.waitForTimeout(20);
        (await overflow(page)).forEach(p => problems.push(`Woche ${plan.weeks[i].weekNumber}: ${p}`));
      }
      // eine Schwimmeinheit (Stufe, Pull Buoy) und ein Test im Sheet
      for (const sel of ['[data-act="sess-open"]']) { const b = page.locator(sel).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(40); (await overflow(page)).forEach(p => problems.push(`Sheet: ${p}`)); await page.keyboard.press('Escape'); } }
      expect(problems).toEqual([]);
    });
  }
}
