/* Auftrag 30, Punkt 5: Bestwert, Tageswert und Trend – für alle Werte und Sportarten.
   Gemeldeter Fehler: „von 50 m (Di 13.10.) auf 75 m (Fr 6.11.)“, obwohl der Bestwert 100 m (27.10.) war und 75 m nur ein Tageswert. */
import { describe, test, expect } from 'vitest';
import { valueStory, storyText, STORY_METRICS } from '../../shared/valuestory';
import { checkProgressClaims } from '../../shared/coach/claims';

const T = '2026-11-06';
const jonah = [{ date: '2026-10-13', v: 50 }, { date: '2026-10-27', v: 100 }, { date: '2026-11-06', v: 75 }];

describe('Bestwert / Tageswert / Trend', () => {
  test('Jonahs Fall: Tageswert 75 m, Bestwert 100 m (27.10.), kein Trend aus 3 Werten, kein „von 50 auf 75“', () => {
    const s = valueStory(jonah, true);
    expect(s.day).toEqual({ date: T, v: 75 }); expect(s.best).toEqual({ date: '2026-10-27', v: 100 });
    expect(s.trend).toBeNull(); expect(s.isNewBest).toBe(false);
    const txt = storyText(s, { ...STORY_METRICS.crawl, today: T });
    expect(txt).toBe('Heute 75 m Kraul am Stück, dein Bestwert sind 100 m (27.10.).');
    expect(txt).not.toMatch(/von 50/);
  });
  test('neuer Bestwert: mit vorherigem Bestwert; einzelner Spitzenwert ist noch kein neues Niveau (Stufe erst beim 2. Mal)', () => {
    const s = valueStory([...jonah, { date: '2026-11-08', v: 150 }], true);
    expect(s.isNewBest).toBe(true);
    const txt = storyText(s, { ...STORY_METRICS.crawl, today: '2026-11-08' });
    expect(txt).toMatch(/^Heute 150 m Kraul am Stück – neuer Bestwert \(vorher 100 m am 27\.10\.\)\./);
    expect(txt).toMatch(/noch kein neues Niveau/);
  });
  test('ein schwächerer Tag ist kein Rückschritt; Trend erst ab mehreren Einheiten', () => {
    const up = valueStory([40, 45, 50, 60, 70, 80].map((v, i) => ({ date: `2026-10-0${i + 1}`, v })), true);
    expect(up.trend).toBe('up');
    const dip = valueStory([60, 62, 61, 63, 62, 55].map((v, i) => ({ date: `2026-10-0${i + 1}`, v })), true);
    expect(dip.trend).toBe('flat');
    expect(storyText(dip, { ...STORY_METRICS.crawl, today: '2026-10-06' })).not.toMatch(/Rückschritt(?! ist)|schlechter/);
  });
  test('Pace (niedriger ist besser), Watt, Strecke: gleiche Regeln', () => {
    const pace = valueStory([{ date: '2026-10-01', v: 330 }, { date: '2026-10-10', v: 300 }, { date: '2026-10-20', v: 315 }], false);
    expect(pace.best!.v).toBe(300); expect(storyText(pace, { ...STORY_METRICS.run5k, today: '2026-10-20' })).toBe('Heute 5:15 min pro km (Lauf ab 5 km), dein Bestwert ist 5:00 min (10.10.).');
    const watt = valueStory([{ date: '2026-10-01', v: 210 }, { date: '2026-10-08', v: 230 }], true);
    expect(storyText(watt, { ...STORY_METRICS.bike20, today: '2026-10-09' })).toMatch(/^Gestern 230 W Ø-Leistung \(ab 20 min\) – neuer Bestwert \(vorher 210 W am 1\.10\.\)\.$/);
    // zwei Einheiten an einem Tag = ein Tageswert (der bessere)
    expect(valueStory([{ date: '2026-10-01', v: 50 }, { date: '2026-10-01', v: 75 }], true).n).toBe(1);
  });
  test('Prüfer: „von 50 m auf 75 m“ unter dem Bestwert wird richtig eingeordnet; „Rückschritt“ ohne schwächeren Trend auch', () => {
    const stories = { crawl: valueStory(jonah, true) } as any;
    const r = checkProgressClaims('Kraul am Stück wird länger: von 50 m (Di 13.10.) auf 75 m (Fr 6.11.). Weiter so mit der Atmung.', stories, T);
    expect(r.text).toBe('Heute 75 m Kraul am Stück, dein Bestwert sind 100 m (27.10.). Weiter so mit der Atmung.');
    expect(r.fixed.length).toBe(1);
    const r2 = checkProgressClaims('Beim Kraulen am Stück ein Rückschritt: nur 75 m.', stories, T);
    expect(r2.text).toMatch(/dein Bestwert sind 100 m/);
    // richtige Aussagen bleiben
    const ok = checkProgressClaims('Neuer Bestwert: von 75 m auf 100 m Kraul am Stück.', { crawl: valueStory([{ date: '2026-10-13', v: 75 }, { date: '2026-10-27', v: 100 }], true) } as any, '2026-10-27');
    expect(ok.fixed).toEqual([]);
    expect(checkProgressClaims('Wenn du von 50 m auf 75 m kommst, steigt die Stufe.', stories, T).fixed).toEqual([]);
  });
});
