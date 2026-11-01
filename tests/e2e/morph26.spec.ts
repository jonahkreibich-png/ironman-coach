/* Auftrag 26: sanftes Angleichen der Ansicht (web/src/morph.ts) im echten Browser (Chromium und WebKit).
   Geprüft: unveränderte Knoten bleiben dieselben Objekte, eine neue Zeile wird eingefügt statt alle folgenden umzuschreiben,
   Eingaben im Fokus bleiben, offene „Mehr“-Bereiche bleiben offen, Attribute und Texte werden angeglichen. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { transform } from 'esbuild';

let code = '';
test.beforeAll(async () => {
  code = (await transform(fs.readFileSync('web/src/morph.ts', 'utf8'), { loader: 'ts', format: 'iife', globalName: '__morph' })).code;
});
test.beforeEach(async ({ page }) => { await page.setContent('<div id="r"></div>'); await page.addScriptTag({ content: code }); });

test('unveränderte Knoten bleiben erhalten, nur Texte und Attribute ändern sich', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('r')!; const M = (window as any).__morph;
    M.morph(el, '<header class="a"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="x"><b>alt</b></header><p data-x="1">eins</p>');
    const img = el.querySelector('img'), p = el.querySelector('p');
    const n = M.morph(el, '<header class="a b"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="x"><b>neu</b></header><p>eins</p>');
    return { sameImg: img === el.querySelector('img'), sameP: p === el.querySelector('p'), html: el.innerHTML, n };
  });
  expect(r.sameImg).toBe(true); expect(r.sameP).toBe(true);
  expect(r.html).toContain('class="a b"'); expect(r.html).toContain('<b>neu</b>'); expect(r.html).not.toContain('data-x');
  expect(r.n).toBe(3); // Klasse, Text, entferntes Attribut
});

test('neue Zeile mit Schlüssel wird eingefügt, die übrigen Zeilen bleiben dieselben', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('r')!; const M = (window as any).__morph;
    const row = (s: string) => `<button class="li" data-sid="${s}">${s}</button>`;
    M.morph(el, ['a', 'b', 'c'].map(row).join(''));
    const before = Array.from(el.children);
    const inserted: Element[] = [];
    M.morph(el, ['a', 'neu', 'b', 'c'].map(row).join(''), inserted);
    const after = Array.from(el.children);
    return { kept: [before[0] === after[0], before[1] === after[2], before[2] === after[3]], inserted: inserted.map(e => e.textContent), text: after.map(e => e.textContent) };
  });
  expect(r.kept).toEqual([true, true, true]);
  expect(r.inserted).toEqual(['neu']);
  expect(r.text).toEqual(['a', 'neu', 'b', 'c']);
});

test('Zeile entfällt und Reihenfolge ändert sich: Knoten wandern mit', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('r')!; const M = (window as any).__morph;
    const row = (s: string) => `<div data-date="${s}">${s}</div>`;
    M.morph(el, ['1', '2', '3'].map(row).join(''));
    const [one, , three] = Array.from(el.children);
    M.morph(el, ['3', '1'].map(row).join(''));
    const after = Array.from(el.children);
    return { order: after.map(e => e.textContent), moved: after[0] === three && after[1] === one };
  });
  expect(r.order).toEqual(['3', '1']); expect(r.moved).toBe(true);
});

test('Eingabe im Fokus behält ihren Text, andere Felder übernehmen den neuen Wert', async ({ page }) => {
  await page.evaluate(() => { (window as any).__morph.morph(document.getElementById('r')!, '<input id="a" value="1"><input id="b" value="1"><textarea id="t">x</textarea>'); });
  await page.locator('#a').fill('getippt'); await page.locator('#b').fill('alt');
  await page.locator('#a').focus();
  await page.evaluate(() => { (window as any).__morph.morph(document.getElementById('r')!, '<input id="a" value="2"><input id="b" value="2"><textarea id="t">y</textarea>'); });
  await expect(page.locator('#a')).toHaveValue('getippt');
  await expect(page.locator('#a')).toBeFocused();
  await expect(page.locator('#b')).toHaveValue('2');
  await expect(page.locator('#t')).toHaveValue('y');
});

test('offener „Mehr“-Bereich bleibt offen, gespeicherte Bereiche (data-fold) folgen dem neuen Zustand', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('r')!; const M = (window as any).__morph;
    const html = (fold: boolean) => `<details class="more"><summary>m</summary>x</details><details data-fold="f" ${fold ? 'open' : ''}><summary>f</summary>y</details>`;
    M.morph(el, html(true));
    (el.querySelector('details.more') as HTMLDetailsElement).open = true;
    M.morph(el, html(false));
    return { more: (el.querySelector('details.more') as HTMLDetailsElement).open, fold: (el.querySelector('[data-fold]') as HTMLDetailsElement).open };
  });
  expect(r.more).toBe(true); expect(r.fold).toBe(false);
});

test('Auswahlfeld und Kontrollkästchen folgen dem neuen Zustand', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('r')!; const M = (window as any).__morph;
    M.morph(el, '<select id="s"><option value="a" selected>a</option><option value="b">b</option></select><input type="checkbox" id="c">');
    M.morph(el, '<select id="s"><option value="a">a</option><option value="b" selected>b</option></select><input type="checkbox" id="c" checked>');
    return { s: (el.querySelector('#s') as HTMLSelectElement).value, c: (el.querySelector('#c') as HTMLInputElement).checked };
  });
  expect(r).toEqual({ s: 'b', c: true });
});
