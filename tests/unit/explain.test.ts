/* Auftrag 7, Punkt 4: Der Coach erklärt Einheiten tagesgenau, ohne KI, für alle Sportarten, mit „heute“, „morgen“ und Wochentagen.
   Mindestens 50 Testfragen. Jede Antwort nennt die Schritte (Ein-/Aufwärmen, Hauptteil, Ausklang) mit Zahlen; bei Krankheit,
   schlechten Werten oder wenig Zeit kommt ein Vorschlag, der erst nach „Ja“ den Plan ändert. */
import { test, expect, describe } from 'vitest';
import { world, CHAT_TODAY } from '../helpers/chat-world';
import { PERSONAS } from '../../fixtures/personas';
import { structureOf, specOf, explainWanted, fitToMinutes } from '../../shared/coach/explain';
import { norm } from '../../shared/coach/intents';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';

const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const SPW: Record<string, string> = { swim: 'beim Schwimmen', run: 'beim Laufen', bike: 'auf dem Rad', strength: 'bei der Kraft' };
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

/* 1) Viele Fragen: alle Test-Personen × Tage × Sportarten */
describe('Fragen nach dem Ablauf (alle Test-Personen)', () => {
  const cases: { id: string; q: string; date: string; sport: string | null }[] = [];
  for (const p of PERSONAS) {
    const W0 = world(p.id);
    for (let k = 0; k < 7; k++) {
      const date = C.addDays(CHAT_TODAY, k);
      const day = W0.day(date); if (!day) continue;
      const own = day.sessions.filter((s: any) => SPW[s.sport] && !s.cancelled);
      const when = k === 0 ? 'heute' : k === 1 ? 'morgen' : `am ${DOWL[dow(date)]}`;
      for (const s of own.slice(0, 2)) cases.push({ id: p.id, q: `Was genau soll ich ${when} ${SPW[s.sport]} machen?`, date, sport: s.sport });
      if (k === 2) cases.push({ id: p.id, q: `Wie läuft das Training ${when} ab?`, date, sport: null });
      if (k === 4) cases.push({ id: p.id, q: `Was mache ich ${when}?`, date, sport: null });
      if (k === 6) cases.push({ id: p.id, q: `Erklär mir das Training ${when}`, date, sport: null });
    }
  }
  test('mindestens 50 Fragen', () => expect(cases.length).toBeGreaterThanOrEqual(50));
  for (const c of cases) test(`${c.id}: ${c.q}`, () => {
    const W1 = world(c.id);
    const r = W1.say(c.q);
    expect(r.intent).toBe('explain');
    const shortDate = `${c.date.slice(8)}.${c.date.slice(5, 7)}.`;
    expect(r.text).toContain(shortDate);
    const day = W1.day(c.date)!;
    const list = day.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && (!c.sport || s.sport === c.sport));
    for (const s of list) {
      expect(r.text).toContain(s.title);
      if (s.sport !== 'football') expect(r.text).toMatch(/1\. (Einschwimmen|Einlaufen|Einrollen|Aufwärmen|Hauptteil|Übungen)/);
    }
    if (c.sport === 'swim') expect(r.text).toMatch(/\d+ m /);
    if (c.sport === 'run' || c.sport === 'bike') expect(r.text).toMatch(/Z\d|Puls|\/km/);
    if (c.sport === 'strength') expect(r.text).toMatch(/\d+×/);
    expect(r.apply || []).toEqual([]); // reine Erklärung ändert nichts
  });
});

/* 2) Lage berücksichtigen: Krankheit, Wiedereinstieg, Ampel, wenig Zeit */
describe('Lage des Tages', () => {
  const id = 'jugend-langdistanz';
  const firstOwn = (W1: any) => { for (let k = 0; k < 7; k++) { const d = C.addDays(CHAT_TODAY, k); const s = (W1.day(d) || { sessions: [] }).sessions.find((x: any) => ['run', 'bike', 'swim'].includes(x.sport) && (x.plannedMinutes || 0) >= 30); if (s) return { s, d, k }; } return null; };
  test('krank: heute kein Training, Knopf „Wieder gesund“', () => {
    const W1 = world(id); W1.state.illnessPeriods = [{ id: 'i', start: C.addDays(CHAT_TODAY, -1), end: null, note: 'Fieber' }];
    const r = W1.say('Was genau soll ich heute machen?');
    expect(r.text).toMatch(/krank eingetragen.*kein Training/s);
    expect((r.options || []).map(o => o.label)).toContain('Wieder gesund');
  });
  test('Wiedereinstieg nach Krankheit: Vorschlag „locker“, erst nach Ja geändert', () => {
    const W1 = world(id); const x = firstOwn(W1)!; W1.state.illnessPeriods = [{ id: 'i', start: C.addDays(x.d, -5), end: C.addDays(x.d, -2) }];
    const when = x.k === 0 ? 'heute' : x.k === 1 ? 'morgen' : `am ${DOWL[dow(x.d)]}`;
    const before = W1.day(x.d)!.sessions.find((s: any) => s.id === x.s.id).plannedMinutes;
    const r = W1.say(`Was genau soll ich ${when} machen?`);
    if (C.isHard(x.s) || before > 40) {
      expect(r.text).toMatch(/wieder gesund|locker/);
      expect(r.pending && r.pending.kind).toBe('confirm');
      expect(W1.day(x.d)!.sessions.find((s: any) => s.id === x.s.id).plannedMinutes).toBe(before);
      W1.say('ja');
      const after = W1.day(x.d)!.sessions.find((s: any) => s.id === x.s.id);
      expect(after.plannedMinutes).toBeLessThanOrEqual(40);
      expect(after.title).toMatch(/^Locker statt/);
    }
  });
  test('Ampel rot (Ruhepuls hoch, HFV tief): Vorschlag ganz locker, „nein“ lässt alles', () => {
    const W1 = world(id); const trend: any[] = [];
    for (let i = 20; i >= 1; i--) trend.push({ date: C.addDays(CHAT_TODAY, -i), restingHR: 52, hrv: 70, sleepHours: 8.5 });
    trend.push({ date: CHAT_TODAY, restingHR: 62, hrv: 38, sleepHours: 5 });
    W1.state.trend = trend;
    const today = W1.day(CHAT_TODAY)!.sessions.filter((s: any) => ['run', 'bike', 'swim', 'strength'].includes(s.sport));
    const r = W1.say('Was genau soll ich heute machen?');
    if (today.length) {
      expect(r.text).toMatch(/Werte heute sind schlecht|ganz locker/);
      W1.say('nein');
      expect(W1.day(CHAT_TODAY)!.sessions.filter((s: any) => s.title.startsWith('Locker statt'))).toEqual([]);
    }
  });
  test('Ampel grün mit Werten: Ruhepuls und HFV werden genannt', () => {
    const W1 = world(id); const trend: any[] = [];
    for (let i = 20; i >= 0; i--) trend.push({ date: C.addDays(CHAT_TODAY, -i), restingHR: 52 + (i % 2), hrv: 70 - (i % 3), sleepHours: 9 });
    W1.state.trend = trend;
    const r = W1.say('Was genau soll ich heute machen?');
    if (W1.day(CHAT_TODAY)!.sessions.some((s: any) => s.sport !== 'rest')) expect(r.text).toMatch(/Ruhepuls \d+.*HFV|Ampel grün/s);
  });
  test('„Ich hab nur 20 min“: gekürzter Vorschlag mit Struktur, nach Ja wirklich kürzer', () => {
    const W1 = world(id); const x = firstOwn(W1)!;
    const when = x.k === 0 ? 'heute' : x.k === 1 ? 'morgen' : `am ${DOWL[dow(x.d)]}`;
    const r = W1.say(`Ich hab ${when} nur 20 min, was soll ich machen?`);
    expect(r.intent).toBe('explain');
    expect(r.text).toMatch(/20 min|gekürzt/);
    expect(r.pending && r.pending.kind).toBe('confirm');
    W1.say('ja');
    const own = W1.day(x.d)!.sessions.filter((s: any) => !s.cancelled && !s.fixed && s.sport !== 'rest');
    expect(own.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0)).toBeLessThanOrEqual(25);
  });
  test('kein Schwimmen an dem Tag: ehrliche Antwort mit nächstem Schwimmtermin', () => {
    const W1 = world(id);
    const noSwim = [0, 1, 2, 3, 4, 5, 6].map(k => C.addDays(CHAT_TODAY, k)).find(d => W1.day(d) && !W1.day(d)!.sessions.some((s: any) => s.sport === 'swim'))!;
    const r = W1.say(`Was genau soll ich am ${DOWL[dow(noSwim)]} beim Schwimmen machen?`);
    expect(r.text).toMatch(/kein Schwimmen geplant/);
  });
  test('Verschieben bleibt Verschieben (keine Erklärung)', () => {
    const W1 = world(id);
    expect(W1.say('Verschieb den langen Lauf auf Sonntag').intent).not.toBe('explain');
    expect(W1.say('Mach die Einheit heute kürzer').intent).not.toBe('explain');
  });
});

/* 3) Struktur für jede Einheit, auch ohne Bauplan */
describe('Struktur jeder Einheit', () => {
  const W1 = world('jugend-langdistanz');
  const prof = W1.profile;
  test('alle geplanten Einheiten der Test-Personen haben eine Struktur mit Hauptteil', () => {
    for (const p of PERSONAS) {
      const Wp = world(p.id);
      for (const d of Wp.days().slice(0, 28)) for (const s of d.sessions) {
        if (s.sport === 'rest' || s.race) continue;
        const x = structureOf(s, Wp.profile, CHAT_TODAY)!;
        expect(x, s.title).toBeTruthy();
        expect(x.parts.some(pt => pt.part === 'main'), s.title).toBe(true);
      }
    }
  });
  test('alte, von Hand geschriebene Schwimm-Einheit: Text wird in Schritte zerlegt', () => {
    const x = structureOf({ id: 'a', sport: 'swim', title: 'Kraultechnik', plannedMinutes: 55, description: 'Warm-up 200m Brust. Drills 8x50m. Main 6x75m Kraul locker, 20s Pause. Cool-down 200m. Gesamt ca. 1800m.' }, prof, CHAT_TODAY)!;
    expect(x.parts.map(p => p.label)).toEqual(['Einschwimmen', 'Technik', 'Hauptteil', 'Ausschwimmen']);
    expect(x.parts[0].lines[0]).toMatch(/200 m Brust/);
    expect(x.parts[1].lines.join(' ')).toMatch(/8×50 m Kraul-Technik/);
    expect(x.parts[2].lines.join(' ')).toMatch(/6×75 m Kraul.*20 s Pause – Fokus/);
    expect(x.derived).toBe(true);
  });
  test('alte Kraft-Einheit: Übungen mit Sätzen × Wdh aus dem Text', () => {
    const x = structureOf({ id: 'k', sport: 'strength', title: 'Kraft Oberkoerper', plannedMinutes: 25, description: 'Nur 2 Runden, deutlich leichter: Liegestuetz 2x10, Ruderzug 2x10, Plank 2x30s.' }, prof, CHAT_TODAY)!;
    expect(x.parts[1].lines.slice(0, 3)).toEqual(['Liegestütz: 2×10', 'Ruderzug: 2×10', 'Plank: 2×30s']);
  });
  test('alter Lauf mit Zone: Ein-/Auslaufen ab 40 min, Puls aus den eigenen Schwellen', () => {
    const p2 = { ...prof, thresholds: { ...prof.thresholds, lthrRun: 170 } };
    const x = structureOf({ id: 'r', sport: 'run', title: 'Langer Lauf', plannedMinutes: 45, zone: 'Zone 2' }, p2, CHAT_TODAY)!;
    expect(x.parts.map(p => p.label)).toEqual(['Einlaufen', 'Hauptteil', 'Auslaufen']);
    expect(x.parts[1].lines[0]).toMatch(/30 min locker.*Puls 138–151/);
  });
  test('gespeicherter Bauplan nutzt die aktuellen Schwellen (nach dem Schwellentest neue Zahlen)', () => {
    const s = { id: 'x', sport: 'run', title: 'Lockerer Lauf 40 min', spec: W.runEasy({ lthrRun: 160, runThrSec: 360 }, 40) };
    const a = structureOf(s, { ...prof, thresholds: { ...prof.thresholds, lthrRun: 170, thresholdPaceRunSec: 339 } }, CHAT_TODAY)!;
    expect(a.parts[0].lines[0]).toMatch(/Puls 138–151/);
  });
  test('kürzen: Lernstufe bleibt Lernstufe, Kraft hat weniger Übungen', () => {
    const swim = W.swimLearn({}, { ladder: 'swim', n: 2, breast: true });
    const sh = fitToMinutes(swim, 15);
    // Auftrag 14: ehrlich gerechnet (Pausen, Serienwechsel, Beinschlag langsamer) dauert die kürzeste Lern-Einheit etwa 20 min
    expect(W.totals(sh).min).toBeLessThanOrEqual(21);
    expect(W.totals(sh).min).toBeLessThan(W.totals(swim).min);
    expect(sh.stage).toEqual(swim.stage);
    const st = W.strengthArea('lower');
    expect((fitToMinutes(st, 15).exercises || []).length).toBeLessThan((st.exercises || []).length);
  });
  test('Erkennen der Fragen', () => {
    const yes = ['Was genau soll ich heute beim Schwimmen machen?', 'Wie läuft das Training morgen ab?', 'Was mache ich am Samstag?', 'Erklär mir die Einheit am Donnerstag', 'Welche Übungen mache ich heute?', 'Wie soll ich den Lauftest machen?'];
    const no = ['Verschieb den Lauf auf Samstag', 'Ich bin krank', 'Streich das Schwimmen', 'Warum heute locker?'];
    yes.forEach(q => expect(explainWanted(norm(q).split(' '), q), q).toBe(true));
    no.forEach(q => expect(explainWanted(norm(q).split(' '), q), q).toBe(false));
    expect(specOf({ sport: 'rest' }, prof, CHAT_TODAY)).toBe(null);
  });
});
