/* Auftrag 16, Punkt 1: Ein lockerer langer Lauf wurde als Intervalltraining bewertet (automatische Runden je 1 km).
   Jetzt: Intervalle nur bei deutlichem Wechsel hart/locker; gleichmäßige automatische Runden = Dauerlauf. Die Art der Einheit kommt
   aus dem Plan, die Messdaten bestätigen oder widersprechen. Geprüft mit Jonahs echtem Lauf (18.10.), echten FIT-Dateien und
   nachgebauten Läufen: automatische Runden, echte Intervalle (Runden von Hand, automatisch, ohne Runden), Fahrtspiel, Hügel, Rad. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { analyze } from '../../shared/activity/analyze';
import { isAutoLaps, lapKinds, intervalsOf, patternOf, paceTrend } from '../../shared/activity/structure';
import { parseFit } from '../../shared/activity/fit';
import { reviewAnswer } from '../../shared/coach/review';
import { sessionComment } from '../../shared/coach/engine';
import { simulate, pace, fromFixture, type Part } from '../helpers/runsim';
import { world } from '../helpers/chat-world';

const A = (raw: any) => analyze(raw, { source: 'file', lthr: { run: 170, bike: 165 } });
const E = pace('6:50'), J = pace('7:20'), F = pace('4:10');
const jonah = JSON.parse(fs.readFileSync('fixtures/runs/jonah-long-autolap.json', 'utf8'));
const ivParts: Part[] = [{ sec: 600, speed: E, hr: 140 }, ...Array.from({ length: 5 }, () => [{ sec: 240, speed: F, hr: 172 }, { sec: 120, speed: J, hr: 145 }]).flat(), { sec: 600, speed: E, hr: 140 }];
const fartParts: Part[] = [{ sec: 600, speed: E, hr: 140 }, ...[30, 90, 60, 150, 45, 120, 40].map((s, i) => [{ sec: s, speed: pace('4:30'), hr: 165 }, { sec: [60, 180, 90, 100, 240, 70, 120][i], speed: E, hr: 145 }]).flat(), { sec: 600, speed: E, hr: 140 }];
const hillParts: Part[] = [{ sec: 600, speed: E, hr: 140 }, ...Array.from({ length: 8 }, () => [{ sec: 90, speed: pace('6:00'), hr: 170, power: 300, grade: 7 }, { sec: 150, speed: pace('6:30'), hr: 140, power: 150, grade: -4.2 }]).flat(), { sec: 600, speed: E, hr: 140 }];
// welliger Dauerlauf mit gleicher Anstrengung: bergauf langsamer, bergab schneller, Puls gleich
const rolling: Part[] = Array.from({ length: 10 }, (_, i) => ({ sec: 300, speed: i % 2 ? E / (1 + 0.033 * 3) : E / (1 - 0.018 * 3), hr: 146, grade: i % 2 ? 3 : -3 }));

describe('Erkennung: Dauerlauf oder Intervalle', () => {
  test('Jonahs langer Lauf (18.10., Apple Watch, automatische Runden je 1 km): Dauerlauf, keine Intervalle', () => {
    const a = A(fromFixture(jonah));
    expect(a.intervals).toBeNull();
    expect(a.laps.every(l => l.kind === 'steady')).toBe(true);
    expect(a.pattern).toMatchObject({ type: 'steady', autoLaps: true });
  });
  test('gespeicherte Aktivität von heute (alte Auswertung) bleibt ohne Intervalle', () => {
    const stored = { sport: 'run', laps: jonah.laps.map((l: any, i: number) => ({ n: i + 1, sec: l.sec, m: l.dist, avgHr: l.avgHr, maxHr: l.maxHr, speed: l.avgSpeed, power: l.avgPower, kind: 'steady' })), intervals: null, splits: jonah.splits };
    expect(intervalsOf(stored)).toBeNull(); expect(patternOf(stored)).toMatchObject({ type: 'steady', autoLaps: true });
  });
  test('alte Aktivität mit falsch gezählten automatischen Runden (Puls-Drift am Ende) wird beim Lesen richtig', () => {
    const laps = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, sec: 410 - (i > 8 ? 25 : 0), m: 1000, avgHr: 140 + i * 2, maxHr: 150 + i * 2, speed: i > 8 ? 2.6 : 2.44, power: null, kind: i > 8 ? 'work' : 'steady' }));
    const old = { sport: 'run', laps, intervals: { count: 3, workSec: 1155, avgHrWork: 160, hrDriftPct: 2, dropPct: 0, recoveryHrDrop: null, lapsHr: [] } };
    expect(isAutoLaps(laps)).toBe(true);
    expect(intervalsOf(old)).toBeNull();
  });
  test('gleichmäßiger Lauf mit automatischen Runden', () => { const a = A(simulate([{ sec: 75 * 60, speed: E, hr: 145 }])); expect(a.intervals).toBeNull(); expect(a.pattern!.type).toBe('steady'); });
  test('ab km 8 deutlich schneller (automatische Runden): schneller werdend, keine Intervalle', () => {
    const a = A(simulate([{ sec: 8 * 410, speed: E, hr: 145 }, { sec: 4 * 350, speed: pace('5:50'), hr: 160 }]));
    expect(a.intervals).toBeNull(); expect(a.pattern).toMatchObject({ type: 'progression', fromKm: 8 });
  });
  test('echte Intervalle 5×4 min mit Runden von Hand', () => {
    const a = A(simulate(ivParts, { laps: 'manual' }));
    expect(a.intervals!.count).toBe(5); expect(a.pattern).toMatchObject({ type: 'intervals', from: 'laps', reps: 5 });
    expect(a.laps.map(l => l.kind[0]).join('')).toBe('wwrwrwrwrwcc'.replace(/^w/, 'w'));
  });
  test('echte Intervalle, aber die Uhr setzt nur automatische Runden: aus dem Verlauf erkannt', () => {
    const a = A(simulate(ivParts)); expect(a.intervals!.count).toBe(5); expect(a.pattern).toMatchObject({ type: 'intervals', from: 'stream', autoLaps: true });
    expect(a.pattern!.workSec!.every(s => Math.abs(s - 240) <= 15)).toBe(true);
  });
  test('Intervalle ganz ohne Runden', () => { const a = A(simulate(ivParts, { laps: 'none' })); expect(a.intervals!.count).toBe(5); });
  test('Fahrtspiel (unregelmäßige Tempowechsel)', () => { const a = A(simulate(fartParts)); expect(a.pattern).toMatchObject({ type: 'fartlek', reps: 7 }); });
  test('Hügel-Wiederholungen mit Höhe', () => { const a = A(simulate(hillParts, { alt: true })); expect(a.pattern).toMatchObject({ type: 'hills', reps: 8 }); });
  test('Hügel-Wiederholungen mit Laufleistung (Watt)', () => { const a = A(simulate(hillParts, { alt: true, power: true })); expect(a.pattern).toMatchObject({ type: 'hills', reps: 8 }); });
  test('welliger Dauerlauf (bergauf langsamer, bergab schneller, Puls gleich) ist kein Fahrtspiel – mit und ohne Höhe', () => {
    expect(A(simulate(rolling, { alt: true })).pattern!.type).toBe('steady');
    expect(A(simulate(rolling)).pattern!.type).toBe('steady');
  });
  test('Rad: gleichmäßig mit schwankender Leistung bleibt Dauerfahrt, 4×8 min ist Intervall', () => {
    expect(A(simulate([{ sec: 90 * 60, speed: 8, hr: 135, power: 180 }], { sport: 'bike', power: true, autoLapM: 5000, noise: 0.08 })).intervals).toBeNull();
    const iv = A(simulate([{ sec: 900, speed: 8, hr: 130, power: 160 }, ...Array.from({ length: 4 }, () => [{ sec: 480, speed: 10, hr: 160, power: 270 }, { sec: 240, speed: 7.5, hr: 130, power: 140 }]).flat(), { sec: 600, speed: 8, hr: 130, power: 150 }], { sport: 'bike', power: true, autoLapM: 5000 }));
    expect(iv.intervals!.count).toBe(4);
  });
  test('Tempolauf: Einlaufen, 20 min schnell, Auslaufen (Runden von Hand) ist ein Block, kein Intervall', () => {
    const a = A(simulate([{ sec: 900, speed: E, hr: 140 }, { sec: 1200, speed: pace('4:50'), hr: 165 }, { sec: 600, speed: E, hr: 145 }], { laps: 'manual' }));
    expect(a.intervals).toBeNull(); expect(a.pattern).toMatchObject({ type: 'tempo', reps: 1 });
  });
  test('echte FIT-Dateien (Garmin, Edge, COROS …) haben keine erfundenen Intervalle', () => {
    for (const f of ['garmin-fenix-5-run.fit', 'activity-small-fenix2-run.fit', 'garmin-fenix-5-bike.fit', 'garmin-edge-820-bike.fit', 'sample-activity.fit', 'Activity.fit', 'coros-pace-2-cycling-misaligned-fields.fit']) {
      const raws = parseFit(new Uint8Array(fs.readFileSync('fixtures/fit/' + f)).buffer as any);
      for (const r of (Array.isArray(raws) ? raws : [raws])) { const a = A(r); expect(a.intervals, f).toBeNull(); }
    }
  });
  test('Runden von Hand, gleichmäßig (Runde bei km 5 und 10 gedrückt): kein Intervall', () => {
    const laps = [{ sec: 2050, m: 5000, speed: 2.44, avgHr: 145 }, { sec: 2040, m: 5000, speed: 2.45, avgHr: 149 }, { sec: 900, m: 2200, speed: 2.44, avgHr: 152 }].map((l, i) => ({ ...l, n: i + 1, maxHr: null, power: null, kind: 'steady' as const }));
    expect(lapKinds(laps).every(l => l.kind === 'steady')).toBe(true);
  });
  test('Splits: schneller ab km 8, nachlassend, gleichmäßig', () => {
    const sp = (ps: string[]) => ps.map((p, i) => ({ km: i + 1, pace: p }));
    expect(paceTrend(sp(['6:50', '6:52', '6:49', '6:51', '6:50', '6:48', '6:52', '6:50', '5:55', '5:50', '5:48']))).toMatchObject({ type: 'progression', fromKm: 8 });
    expect(paceTrend(sp(['5:30', '5:31', '5:29', '5:32', '5:30', '6:10', '6:20', '6:25']))).toMatchObject({ type: 'fade', fromKm: 5 });
    expect(paceTrend(jonah.splits)).toBeNull();
  });
});

/* Bewertung: Plan zuerst. Ein Persona-Plan mit eigenen Einheiten an einem Tag. */
function ctxWith(session: any, raw: any) {
  const W = world('jugend-langdistanz', '2026-10-21');
  const ctx: any = W.ctx();
  const act = { ...A(raw), id: 'act-1', date: '2026-10-21', sessionId: session.id };
  const week = { weekNumber: 1, label: 'Woche 1', startDate: '2026-10-19', endDate: '2026-10-25', days: [{ date: '2026-10-21', sessions: [session] }, { date: '2026-10-22', sessions: [{ id: 'nx', sport: 'bike', title: 'Lockere Ausfahrt', plannedMinutes: 60, zone: 'Zone 2' }] }] };
  ctx.baseWeeks = [week];
  ctx.state = { ...ctx.state, activities: { 'act-1': act }, sessions: { [session.id]: { completed: true, activityId: 'act-1', rpe: '4' } } };
  return { ctx, act };
}
const longRun = { id: 'lr', sport: 'run', title: 'Langer Lauf 80 min', plannedMinutes: 80, zone: 'Zone 2', long: true, spec: { sport: 'run', kind: 'long', ctx: {}, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 70, zone: 2 }] } };
const ivRun = { id: 'iv', sport: 'run', title: 'Intervalle 5×4 min', plannedMinutes: 50, zone: 'Zone 4', spec: { sport: 'run', kind: 'intervals', ctx: {}, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', reps: 5, min: 4, zone: 4, restMin: 2 }, { part: 'cool', min: 10, zone: 1 }] } };
const answer = (ctx: any) => reviewAnswer(ctx, 'Wie war mein Training heute?')!.text;

describe('Bewertung: Art der Einheit kommt aus dem Plan', () => {
  test('lockerer langer Lauf mit automatischen Runden: kein Wort von Intervallen, „gleichmäßig“ wird bestätigt', () => {
    const { ctx } = ctxWith(longRun, simulate([{ sec: 80 * 60, speed: E, hr: 145 }]));
    const t = answer(ctx);
    expect(t).not.toMatch(/Intervall(?!e\))|prüf die Runden|harte Einheit/);
    expect(t).toMatch(/Gleichmäßig gelaufen, die automatischen Runden der Uhr sind alle ähnlich \(Dauerlauf, keine Intervalle\)/);
  });
  test('Jonahs Lauf als langer Lauf geplant: gleichmäßig, Zone 2 gelobt, nicht „nur Zone 2“', () => {
    const { ctx } = ctxWith({ ...longRun, plannedMinutes: 55, title: 'Langer Lauf 55 min' }, fromFixture(jonah));
    const t = answer(ctx);
    expect(t).not.toMatch(/nur Zone|Bei Intervallen|prüf die Runden/); expect(t).toMatch(/Gleichmäßig gelaufen/);
  });
  test('langer Lauf, ab km 8 deutlich schneller: „Du bist ab km 8 deutlich schneller geworden …“', () => {
    const { ctx } = ctxWith(longRun, simulate([{ sec: 8 * 410, speed: E, hr: 145 }, { sec: 5 * 350, speed: pace('5:50'), hr: 160 }]));
    expect(answer(ctx)).toMatch(/Du bist ab km 8 deutlich schneller geworden \(5:5\d statt 6:5\d\/km\)\. Für einen lockeren langen Lauf lieber gleichmäßig bleiben/);
  });
  test('langer Lauf, aber Tempowechsel gemessen (Fahrtspiel): Messung widerspricht dem Plan, freundlich', () => {
    const { ctx } = ctxWith(longRun, simulate([...fartParts, { sec: 1800, speed: E, hr: 145 }]));
    expect(answer(ctx)).toMatch(/Geplant war ein lockerer langer Lauf\. Deine Daten zeigen 7 Tempowechsel wie bei einem Fahrtspiel/);
  });
  test('geplante Intervalle, Runden von Hand: 5 von 5, Länge passt, Puls in den Belastungen', () => {
    const { ctx } = ctxWith(ivRun, simulate(ivParts, { laps: 'manual' }));
    const t = answer(ctx);
    // Auftrag 22: „Puls in den Belastungen“ steckt jetzt in der Intervall-Bewertung (Soll gegen Ist je Intervall, Puls im Ziel)
    expect(t).toMatch(/5 von 5 Intervallen geschafft, je etwa 4 min wie geplant/); expect(t).toMatch(/In den Belastungen Puls Ø 1[67]\d \(Zone 4\)|Alle 5 Intervalle im Zielbereich/);
  });
  test('geplante Intervalle, nur automatische Runden: trotzdem erkannt (Verlauf)', () => {
    const { ctx } = ctxWith(ivRun, simulate(ivParts));
    expect(answer(ctx)).toMatch(/5 von 5 Intervallen geschafft/);
  });
  test('geplante Intervalle, aber gleichmäßig gelaufen: ehrlich sagen, warum nichts zu sehen ist', () => {
    const { ctx } = ctxWith(ivRun, simulate([{ sec: 50 * 60, speed: E, hr: 150 }]));
    expect(answer(ctx)).toMatch(/In deinen Daten sehe ich keine Tempowechsel \(die Uhr hat nur automatisch Runden gesetzt/);
  });
  test('Kommentar nach der Einheit nennt bei einem lockeren Lauf keine Intervalle', () => {
    const { ctx, act } = ctxWith(longRun, simulate([{ sec: 8 * 410, speed: E, hr: 145 }, { sec: 4 * 350, speed: pace('5:50'), hr: 160 }]));
    expect(sessionComment(ctx, act, longRun)).not.toMatch(/Intervall/);
  });
  test('Hügel ohne Plan (eigene Einheit): erkannt und als harte Einheit gezählt', () => {
    const W = world('jugend-langdistanz', '2026-10-21'); const ctx: any = W.ctx();
    const act = { ...A(simulate(hillParts, { alt: true })), id: 'h1', date: '2026-10-21' };
    ctx.state = { ...ctx.state, activities: { h1: act }, sessions: {} };
    expect(reviewAnswer(ctx, 'Wie war mein Lauf heute?')!.text).toMatch(/Erkannt: 8 harte Abschnitte bergauf/);
  });
});

/* ---------- Punkt 2: kostenlose KI – Hilfsfunktionen (ohne echte Aufrufe) ---------- */
import { autoTool, isChangeRequest, claimsChange, inventedNumbers, cleanAnswer, cleanPartial, leaksInternals, compactContext, coachSkill } from '../../shared/coach/freeai';
import { converse } from '../../shared/coach/dialog';

describe('Kostenlose KI: Werkzeug vorher, Änderungswünsche, Wächter', () => {
  const ctx = () => world('jugend-langdistanz', '2026-10-21').ctx();
  test('Bewertungsfragen bekommen review_training, Tagesfragen explain_day (mit Datum, Sportart, Zeitgrenze)', () => {
    expect(autoTool(ctx(), 'wie war mein training heute')).toEqual({ name: 'review_training', input: { date: '2026-10-21' } });
    expect(autoTool(ctx(), 'Wie war meine Woche?')).toMatchObject({ name: 'review_training', input: { week: true } });
    expect(autoTool(ctx(), 'was mache ich morgen genau')).toEqual({ name: 'explain_day', input: { date: '2026-10-22' } });
    expect(autoTool(ctx(), 'was genau soll ich heute beim radfahren machen')).toEqual({ name: 'explain_day', input: { date: '2026-10-21', sport: 'bike' } });
    expect(autoTool(ctx(), 'ich habe heute nur 20 minuten, was soll ich machen')).toMatchObject({ name: 'explain_day', input: { minutes: 20 } });
    expect(autoTool(ctx(), 'kann ich morgen intervalle machen?')).toMatchObject({ name: 'explain_day', input: { date: '2026-10-22' } });
    expect(autoTool(ctx(), 'wie wird meine form in den nächsten wochen')).toEqual({ name: 'get_analysis', input: {} });
    expect(autoTool(ctx(), 'ist mein puls beim laufen zu hoch?')).toEqual({ name: 'review_training', input: { sport: 'run' } });
    expect(autoTool(ctx(), 'was ist zone 2')).toBeNull();
    expect(autoTool(ctx(), 'verschieb den lauf auf morgen')).toBeNull();
  });
  test('Änderungswünsche erkennen (dann muss ein Werkzeug her), Fragen nicht', () => {
    for (const q of ['verschieb das schwimmen von dienstag auf mittwoch', 'ab jetzt mittwochs kein rad mehr', 'streich die kraft am freitag', 'mach den lauf am donnerstag 10 min kürzer', 'ich hab morgen keine zeit']) expect(isChangeRequest(q), q).toBe(true);
    for (const q of ['kann ich statt schwimmen laufen gehen', 'was ist zone 2', 'wie war mein lauf', 'wie viel schlaf brauche ich']) expect(isChangeRequest(q), q).toBe(false);
  });
  test('Behauptete Änderung ohne Vorschlag wird erkannt, Verneinung nicht', () => {
    expect(claimsChange('Ich habe dir einen Vorschlag gemacht, du kannst ihn unten bestätigen.')).toBe(true);
    expect(claimsChange('Ich habe das Rad am Mittwoch gestrichen.')).toBe(true);
    expect(claimsChange('Das Schwimmen habe ich nicht verschoben, weil deine Regel das verbietet.')).toBe(false);
    expect(claimsChange('Zone 2 ist locker.')).toBe(false);
  });
  test('Zahlen-Wächter: Puls, Pace, Watt, km/h und Wiederholungen müssen belegt sein', () => {
    const src = ['Zone 2: 6:30–7:07/km, Puls 138–151', 'Langer Lauf 55 min, 185 W'];
    expect(inventedNumbers('Lauf in Zone 2 mit 6:30 bis 7:07/km und Puls 138-151.', src)).toEqual([]);
    expect(inventedNumbers('Lauf mit Puls 163 und 4:12/km.', src)).toEqual(['Puls 163', '4:12/km']);
    expect(inventedNumbers('Fahr 250 W.', src)).toEqual(['250 W']);
    expect(inventedNumbers('Mach 5×4 min schnell.', src)).toEqual(['5×4 min']);
    expect(inventedNumbers('Iss 2-3 Stunden vorher, schlaf 8 bis 10 Stunden.', src)).toEqual([]);
  });
  test('Denk-Teile werden entfernt (fertig und im Strom), Werkzeug-Namen erkannt', () => {
    expect(cleanAnswer('<|channel>thought Überlegung <channel|>Schlaf ist wichtig.')).toBe('Schlaf ist wichtig.');
    expect(cleanAnswer('<think>hmm</think>\n\nLocker bleiben.')).toBe('Locker bleiben.');
    expect(cleanAnswer('**Wichtig:** locker')).toBe('Wichtig: locker');
    expect(cleanPartial('<|channel>thought noch am Denken')).toBe('');
    expect(cleanPartial('<|channel>thought x<channel|>Hallo <|')).toBe('Hallo ');
    expect(leaksInternals('Nutze bitte get_analysis.')).toBe(true); expect(leaksInternals('[{"name": "x"}]')).toBe(true); expect(leaksInternals('Alles gut.')).toBe(false);
  });
  test('Anweisung und Zusammenfassung: Coach-Regeln, Profil, Ziel, Phase, heute, nächste Tage, letzte 7 Tage, Ampel', () => {
    const c = ctx();
    const sk = coachSkill(c, 'App');
    expect(sk).toMatch(/Erfinde nichts/); expect(sk).toMatch(/„Das weiß ich nicht“/); expect(sk).toMatch(/Keine medizinischen Diagnosen/); expect(sk).toMatch(/Vorschlag/);
    expect(sk).toMatch(/minderjährig/); // Persona ist 17
    const cc = compactContext(c);
    for (const k of ['PROFIL:', 'ZIEL:', 'PHASE:', 'HEUTE:', 'NÄCHSTE TAGE:', 'LETZTE 7 TAGE:', 'AMPEL HEUTE:']) expect(cc).toContain(k);
    expect(cc).toMatch(/\[id [\w-]+\]/);
    expect(cc.length).toBeLessThan(6000);
  });
});

describe('Regel-Coach: Fehler aus dem Vergleich behoben', () => {
  const W = () => world('jugend-langdistanz');
  test('„Schreib mir ein Gedicht über Pizza“ ist weder Krankheit noch Gewicht', () => {
    const r = converse(W().ctx(), {}, 'schreib mir ein gedicht über pizza').reply;
    expect(r.intent).not.toMatch(/sick|weight/);
  });
  test('„mir ist übel“ bleibt Krankheit', () => { expect(converse(W().ctx(), {}, 'mir ist übel').reply.intent).toBe('sick'); });
  test('„10 min kürzer“ heißt minus 10 (nicht auf 10)', () => {
    const ctx = W().ctx();
    // Parser-Test unabhängig von einer wechselnden generierten Wochenbelegung.
    ctx.baseWeeks = [{ days: [{ date: ctx.today, sessions: [{ id: 'short-run', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40, zone: 'Zone 2' }] }] }];
    const r = converse(ctx, {}, 'mach den lauf am mittwoch 10 min kürzer').reply;
    expect(r.intent).toBe('shorter'); expect(r.text).not.toMatch(/→ 1\d min/);
    const m = /(\d+) → (\d+) min/.exec(r.text)!; expect(+m[1] - +m[2]).toBeGreaterThanOrEqual(8); expect(+m[1] - +m[2]).toBeLessThanOrEqual(13);
  });
});
