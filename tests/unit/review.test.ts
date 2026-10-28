/* Auftrag 12, Punkt 2: Der kostenlose Coach bewertet Trainings. Über 60 Testfragen: Jonahs echte Daten (nur lokal, sonst übersprungen)
   und die Test-Personen mit gespielten Einheiten. Jede Bewertung hat 3 Teile (Gut, Besser, Nächste Tage), echte Zahlen, nie nur Lob. */
import { test, expect, describe } from 'vitest';
import { converse } from '../../shared/coach/dialog';
import { isReviewQuestion, reviewAnswer, doneItems } from '../../shared/coach/review';
import { runEngine } from '../../shared/coach/engine';
import { latestCtx, hasLatestData } from '../helpers/real-data';
import { world, CHAT_TODAY } from '../helpers/chat-world';
import { PERSONAS } from '../../fixtures/personas';
import * as C from '../../shared/core';

const THREE = /👍 Gut: [\s\S]+\n🔧 Besser: [\s\S]+\n➡️ Nächste Tage: /;
const clean = (t: string) => { expect(t).not.toMatch(/undefined|NaN|null|\[object/); expect(t).not.toMatch(/\.\.(\s|$)/); };
function checkReview(text: string) { expect(text).toMatch(THREE); clean(text); expect(text).toMatch(/\d/); }

describe('Fragen erkennen (auch Umgangssprache und Tippfehler)', () => {
  const yes = ['Wie war mein Training heute?', 'Wie war mein Lauf?', 'Wie war meine Woche?', 'Wie war das Schwimmen gestern?', 'Vergleich mit letzter Woche', 'wie wa mein trainig heute', 'na wie wars beim radeln',
    'Bewerte meinen Lauf vom Donnerstag', 'feedback zu meinem lauf', 'wie bin ich geschwommen', 'wie war meine wochee', 'Rückblick auf die Woche', 'was sagst du zu meiner radtour', 'war der lauf zu schnell?', 'wie gings beim schwimmen'];
  const no = ['Was steht morgen an?', 'Verschieb den Lauf auf Samstag', 'Ich bin krank', 'Warum heute locker?', 'Was genau soll ich heute machen?', 'Wie läuft es mit meinem Ziel?', 'Ich habe am Mittwoch keine Zeit'];
  for (const q of yes) test(`„${q}“ ist eine Bewertungsfrage`, () => { expect(isReviewQuestion(q)).toBe(true); });
  for (const q of no) test(`„${q}“ ist keine`, () => { expect(isReviewQuestion(q)).toBe(false); });
});

describe.skipIf(!hasLatestData())('Jonahs echte Daten (15.10.)', () => {
  const ask = (q: string, day = '2026-10-15') => converse(latestCtx(day), {}, q).reply;
  const QS = ['Wie war mein Training heute?', 'Wie war mein Lauf?', 'wie war mein lauf heute', 'wie wa mein trainig heute', 'Analysier mein Training', 'wie bin ich gelaufen', 'war der lauf zu schnell?',
    'Wie war meine Einheit heute, ehrlich?', 'Bewerte meinen Lauf vom Donnerstag', 'feedback zu meinem lauf bitte', 'na wie wars beim radeln', 'wie war die rolle gestern', 'wie lief das radfahren', 'Wie fandest du meine Radfahrt?',
    'was sagst du zu meinem schwimmen', 'wie war mein schwimmen am dienstag', 'wie gings beim schwimmen', 'wie war mein krafttraining', 'bewertung meiner letzten einheit', 'Wie war das Training gestern?'];
  for (const q of QS) test(`„${q}“ → Bewertung in 3 Teilen`, () => { const r = ask(q); expect(r.intent).toBe('review'); checkReview(r.text); });
  test('Lauf heute: Zahlen aus den Feldern, Zone 2 gelobt, Entkopplung als Verbesserung', () => {
    const t = ask('Wie war mein Lauf?').text;
    expect(t).toMatch(/6:39\/km/); expect(t).toMatch(/Puls Ø 145 in Zone 2/); expect(t).toMatch(/Entkopplung 7,4\s%/);
  });
  test('Rolle gestern: locker trotz „Intervalle“ im Titel, Vergleich mit einer ähnlichen Fahrt, RPE fehlt → Eintragen anbieten', () => {
    const r = ask('wie war die rolle gestern');
    expect(r.text).toMatch(/Zone 1/); expect(r.text).toMatch(/pro Herzschlag als am/); expect(r.text).toMatch(/Es fehlen: Anstrengung/);
    expect(r.options![0]).toMatchObject({ label: 'Werte eintragen', go: 'session:w5-wed-bike' });
  });
  test('Schwimmen: Züge pro Bahn, Kraul am Stück, Technik-Thema mit Tipp', () => {
    const t = ask('was sagst du zu meinem schwimmen').text;
    expect(t).toMatch(/14,4 Züge pro Bahn/); expect(t).toMatch(/50 m Kraul am Stück/); expect(t).toMatch(/Technik-Thema „Beinkick“/);
  });
  test('Woche: Anzahl, Umfang und Vergleich mit der Vorwoche', () => {
    const t = ask('Wie war meine Woche?').text;
    expect(t).toMatch(/^Diese Woche \(Mo 12\.10\. bis Do 15\.10\.\): 4 Einheiten/); expect(t).toMatch(/📊 Vergleich: Umfang/); checkReview(t);
  });
  test('Vergleich mit letzter Woche nennt beide Wochen', () => { const t = ask('Vergleich mit letzter Woche').text; expect(t).toMatch(/statt/); expect(t).toMatch(/Einheiten/); });
  test('Letzte Woche mit Erkältung: Krankheitstage zählen nicht, Pause wird gelobt', () => {
    const t = ask('Wie war meine letzte Woche?').text;
    expect(t).toMatch(/Krank von Mi 07\.10\./); expect(t).not.toMatch(/Nur \d+ von \d+ Einheiten/); checkReview(t);
  });
  test('Schwimmen gestern gab es nicht: ehrlich sagen, nichts erfinden', () => {
    const r = ask('Wie war das Schwimmen gestern?');
    expect(r.text).toMatch(/Ich finde gestern keine Schwimm-Einheit/); expect(r.text).not.toMatch(/Gut:/);
  });
  test('Tippfehler bei der Woche', () => { checkReview(ask('wie war meine wochee').text); });
  test('Rückblick auf die Woche am 6.10. (Tag nach dem Fußballspiel)', () => { const r = ask('Rückblick auf die Woche', '2026-10-06'); expect(r.intent).toBe('review'); clean(r.text); });
  test('Lauf am 26.09. (eigene Einheit, Entkopplung 6,5 %)', () => { const t = ask('Wie war mein Lauf?', '2026-09-27').text; expect(t).toMatch(/Entkopplung 6,5\s%/); checkReview(t); });
  test('nie nur Lob: jede Antwort hat einen „Besser“-Teil', () => {
    for (const q of QS) { const t = ask(q).text; expect(t).toMatch(/🔧 Besser: \S+/); }
  });
});

describe('Test-Personen mit gespielten Einheiten', () => {
  const ids = PERSONAS.map(p => p.id);
  /* Woche bis heute ausfüllen: erledigt mit Werten je Sportart */
  function played(id: string, o: { hr?: number; rpe?: string; feel?: string; noValues?: boolean } = {}) {
    const W = world(id);
    const [mon] = C.weekRange(CHAT_TODAY);
    W.sessions(C.addDays(mon, -7), CHAT_TODAY).forEach((s: any, i: number) => {
      const min = s.plannedMinutes || 40;
      const m: any = o.noValues ? {} : s.sport === 'run' ? { min: String(min), km: String(Math.round(min / 6.4 * 10) / 10), hr: String(o.hr || 142 + (i % 3)), cadence: '166', decoupling: '3.1' }
        : s.sport === 'bike' ? { min: String(min), speed: '26.5', hr: String(o.hr ? o.hr - 8 : 128), cadence: '88' }
        : s.sport === 'swim' ? { min: String(min), meters: String(Math.round(min * 30 / 25) * 25), spl: '19', longestCrawl: '200' } : { min: String(min) };
      W.state.sessions[s.id] = { completed: true, metrics: m, ...(o.noValues ? {} : { rpe: o.rpe || '4', feel: o.feel || '2' }) };
    });
    return W;
  }
  for (const id of ids) {
    test(`${id}: „Wie war meine Woche?“`, () => { const W = played(id); const r = W.say('Wie war meine Woche?'); expect(r.intent).toBe('review'); checkReview(r.text); });
    test(`${id}: „Wie war mein letztes Training?“`, () => { const W = played(id); const r = W.say('Wie war mein letztes Training?'); expect(r.intent).toBe('review'); checkReview(r.text); });
    test(`${id}: „Vergleich mit letzter Woche“`, () => { const W = played(id); const r = W.say('Vergleich mit letzter Woche'); expect(r.intent).toBe('review'); expect(r.text).toMatch(/📊 Vergleich/); clean(r.text); });
  }
  test('zu hoher Puls beim lockeren Lauf → Grund und konkrete Pace fürs nächste Mal', () => {
    const W = played('laeuferin-hm', { hr: 176 });
    W.sessions(C.addDays(CHAT_TODAY, -9), CHAT_TODAY).filter((s: any) => s.sport === 'run' && C.isHard(s)).forEach((s: any) => { delete W.state.sessions[s.id]; });
    const t = W.say('Wie war mein Lauf?').text;
    expect(t).toMatch(/lag in Zone [345], geplant war Zone 2/); expect(t).toMatch(/Nächstes Mal langsamer, etwa \d:\d\d-\d:\d\d\/km/);
  });
  test('müde (RPE 8 locker, Gefühl sehr müde) → Nächste Tage vorsichtig, Knopf „lockerer“', () => {
    const W = played('erfahren-md-marathon', { rpe: '8', feel: '5' });
    const r = W.say('Wie war mein letztes Training?');
    expect(r.text).toMatch(/Gefühl 8\/10 für eine lockere Einheit ist hoch|sehr müde/);
    const hardSoon = W.sessions(W.today, C.addDays(W.today, 3)).some((s: any) => C.isHard(s) && !W.state.sessions[s.id]?.completed);
    if (hardSoon && /Müdigkeit/.test(r.text)) expect((r.options || []).some(o => /lockerer/.test(o.label))).toBe(true);
    else expect(r.text).toMatch(/locker|Erholung/);
  });
  test('Werte fehlen → sagen, was fehlt, und Eintragen anbieten', () => {
    const W = played('marathon-anfaenger', { noValues: true });
    const r = W.say('Wie war mein Lauf?');
    expect(r.text).toMatch(/Es fehlen: .*Puls/); expect((r.options || [])[0]).toMatchObject({ label: 'Werte eintragen' });
    expect(String((r.options || [])[0].go)).toMatch(/^session:/);
  });
  test('ähnliche frühere Einheit: gleiche Pace bei weniger Puls wird erkannt', () => {
    const W = played('laeuferin-hm');
    const runs = W.sessions(C.addDays(CHAT_TODAY, -9), CHAT_TODAY).filter((s: any) => s.sport === 'run' && !C.isHard(s));
    const a = runs[0], b = runs[runs.length - 1];
    W.sessions(C.addDays(CHAT_TODAY, -14), CHAT_TODAY).filter((s: any) => s.sport === 'run').forEach((s: any) => { delete W.state.sessions[s.id]; });
    W.state.sessions[a.id] = { completed: true, rpe: '4', metrics: { min: '45', km: '7', hr: '150' } };
    W.state.sessions[b.id] = { completed: true, rpe: '4', metrics: { min: '45', km: '7', hr: '144' } };
    const d = doneItems(W.ctx(), b.date, b.date).find(x => x.key === b.id)!;
    expect(d).toBeTruthy();
    const t = W.say(`Wie war mein Lauf am ${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date(b.date + 'T12:00:00Z').getUTCDay()]}?`).text;
    expect(t).toMatch(/6 Schläge weniger Puls/);
  });
  test('Nichtkrauler (Sprint-Einsteiger): Schwimmen wird bewertet, ohne Kraul-Lob', () => {
    const W = played('einsteiger-sprint');
    const r = W.say('Wie war das Schwimmen?'); expect(r.intent).toBe('review'); clean(r.text);
  });
  test('ohne erledigte Einheit: ehrliche Antwort mit Weg zum Eintragen', () => {
    const W = world('vater-rad-lauf'); const r = W.say('Wie war mein Training heute?');
    expect(r.text).toMatch(/keine/); expect((r.options || []).length).toBeGreaterThan(0);
  });
  test('nach jeder erledigten Einheit: Bewertung automatisch (Engine), abschaltbar', () => {
    const W = played('olympisch-erfahren');
    const ctx = W.ctx();
    const out = runEngine(ctx, { type: 'activity' });
    const rv = out.messages.filter(m => m.id.startsWith('msg-review-'));
    expect(rv.length).toBeGreaterThan(0); rv.forEach(m => { expect(m.title).toMatch(/^Bewertung: /); checkReview(m.text); });
    const off = runEngine({ ...ctx, state: { ...ctx.state, settings: { coachReview: 'off' } } }, { type: 'activity' });
    expect(off.messages.filter(m => m.id.startsWith('msg-review-'))).toEqual([]);
    const short = runEngine({ ...ctx, state: { ...ctx.state, settings: { coachReview: 'short' } } }, { type: 'activity' });
    short.messages.filter(m => m.id.startsWith('msg-review-')).forEach(m => expect(m.text.length).toBeLessThan(rv[0].text.length + 1));
  });
  test('reviewAnswer gibt bei normalen Fragen nichts zurück (andere Absichten bleiben)', () => {
    const W = played('vater-regeln'); expect(reviewAnswer(W.ctx(), 'Was steht morgen an?')).toBeNull();
  });
});


describe('Synthetische SOLL-/IST-Regressionen', () => {
  test('Bewertung nennt beide Schwimmnachweise auch neben Dauer und Zugzahl', () => {
    const W = world('einsteiger-sprint');
    W.plan.weeks = [{ days: [{ date: W.today, sessions: [{ id: 'swim-proof', sport: 'swim', title: 'Schwimmen', plannedMinutes: 40 }] }] }] as any;
    W.state.sessions['swim-proof'] = { completed: true, metrics: { min: '40', meters: '600', longestCrawl: '100', longestPull: '100', spl: '20' }, rpe: 4 };
    const answer = reviewAnswer(W.ctx(), 'Wie war mein Schwimmen heute?')!;
    expect(answer.text).toContain('100 m Kraul am Stück'); expect(answer.text).toContain('100 m mit Pull Buoy am Stück');
  });
  test('ohne tatsächlichen Kraftbereich wird der geplante Unterkörper nicht als Erfolg bestätigt', () => {
    const W = world('einsteiger-sprint');
    W.plan.weeks = [{ days: [{ date: W.today, sessions: [{ id: 'unknown-strength', sport: 'strength', area: 'lower', title: 'Kraft Unterkörper', plannedMinutes: 30 }] }] }] as any;
    W.state.sessions['unknown-strength'] = { completed: true, metrics: { min: '30' }, rpe: 4 };
    const answer = reviewAnswer(W.ctx(), 'Wie war mein Krafttraining heute?')!;
    expect(answer.text).toMatch(/^Krafttraining/); expect(answer.missing).toContain('tatsächlich trainierter Kraftbereich');
    expect(answer.good.join(' ')).not.toContain('Unterkörper');
  });
});
