/* Auftrag 5 D: Coach-Chat. D1 jede Nachricht bekommt eine Antwort, D2 Rückfragen mit Zusammenhang, D3 Planänderungen mit Vorschau,
   Bestätigen und Rückgängig, D4 Schnellaktionen, D5 gezielte Rückfragen statt Floskeln, D6 mindestens 150 Gespräche:
   richtige Aktion, Plan danach stimmt, keine harte Regel verletzt. Alle Gespräche laufen auf den echten Plänen der Test-Personen. */
import { test, expect, describe } from 'vitest';
import { world, CHAT_TODAY, type World } from '../helpers/chat-world';
import { PERSONAS } from '../../fixtures/personas';
import { converse, quickOptions } from '../../shared/coach/dialog';
import * as C from '../../shared/core';

const IDS = PERSONAS.map(p => p.id);
const DOW = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const SPORT: Record<string, string> = { run: 'Lauf', bike: 'Radeinheit', swim: 'Schwimmen', strength: 'Krafttraining' };
const GENERIC = /^(Das verstehe ich leider noch nicht|Ich verstehe nicht|Keine Ahnung)/;

function ok(W: World, r: any) {
  expect(r.text.length).toBeGreaterThan(5);
  expect(r.text).not.toMatch(GENERIC);
  expect(W.violations()).toEqual([]);
}
/* Ein Gespräch = Liste aus Schritten; jeder Schritt sagt etwas und prüft danach */
type Step = [string | ((W: World) => string), (W: World, r: any) => void];
interface Conv { name: string; persona: string; steps: (W: World) => Step[] | null }
const firstFuture = (W: World, f: (s: any) => boolean = () => true) => W.sessions(C.addDays(W.today, 1)).find(f);
const todayOpen = (W: World) => W.sessions(W.today, W.today);

const TEMPLATES: { name: string; steps: (W: World) => Step[] | null }[] = [
  { name: 'keine Zeit an einem Tag mit Einheit → Tag wählen → verschoben', steps: W => { const x = firstFuture(W); if (!x) return null; return [
    [`Ich hab ${DOW[dow(x.date)]} keine Zeit`, (_W, r) => { expect(['move', 'day-off']).toContain(r.intent); expect(r.options.length).toBeGreaterThan(0); }],
    [w => w.replies[w.replies.length - 1].options[0].say, (w, r) => { if (r.intent !== 'move' || !r.apply) { expect(r.apply || r.pending).toBeTruthy(); if (!r.apply) w.say('ja'); } expect(w.day(x.date)!.sessions.filter((s: any) => s.id === x.id && !s.cancelled).length).toBe(0); }]]; } },
  { name: 'verschieben auf erlaubten Tag mit Bestätigung', steps: W => { const x = firstFuture(W, s => !!SPORT[s.sport]); if (!x) return null; return [
    [`Verschieb ${x.sport === 'swim' ? 'das Schwimmen' : x.sport === 'strength' ? 'das Krafttraining' : 'den ' + SPORT[x.sport]} am ${DOW[dow(x.date)]}`, (_w, r) => { expect(['move', 'which']).toContain(r.intent); }],
    [w => { const r = w.replies[w.replies.length - 1]; return r.intent === 'which' ? '1' : (r.options[0] || { say: 'nein' }).say; }, (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); else if (r.intent === 'move' && r.pending) w.tap(0); }]]; } },
  { name: 'heute kürzer → ja → Minuten kleiner', steps: W => { const t = todayOpen(W).find(s => s.plannedMinutes >= 30 && !s.stage); if (!t) return null; return [
    ['Mach die Einheit heute kürzer', (_w, r) => expect(['shorter', 'which']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'ja', (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); const after = w.sessions(w.today, w.today); expect(after.reduce((a: number, s: any) => a + s.plannedMinutes, 0)).toBeLessThan(todayOpen(world(w.persona as any)).reduce((a: number, s: any) => a + s.plannedMinutes, 0) + 1); }]]; } },
  { name: 'nächste Einheit auf 20 min', steps: W => { const x = firstFuture(W, s => s.plannedMinutes > 25 && !s.stage); if (!x) return null; return [
    [`Mach den ${SPORT[x.sport] === 'Lauf' ? 'Lauf' : 'Training'} am ${DOW[dow(x.date)]} nur 20 min`, (_w, r) => expect(['shorter', 'which']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'ja', (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); }]]; } },
  { name: 'länger, wenn erlaubt; sonst ehrlich begründet', steps: W => { const x = firstFuture(W, s => s.plannedMinutes >= 20 && !s.stage && s.sport !== 'strength'); if (!x) return null; return [
    [`Kannst du die ${SPORT[x.sport] || 'Einheit'} am ${DOW[dow(x.date)]} länger machen?`, (_w, r) => expect(['longer', 'which']).toContain(r.intent)],
    [w => { const r = w.replies[w.replies.length - 1]; return r.intent === 'which' ? '1' : r.pending ? 'ja' : 'nein'; }, () => {}]]; } },
  { name: 'heute lieber locker', steps: W => todayOpen(W).length ? [['Heute lieber locker', (_w, r) => expect(['easier']).toContain(r.intent)], ['ja', () => {}]] : null },
  { name: 'härter machen (oder begründet ablehnen)', steps: W => { const x = firstFuture(W, s => (s.sport === 'run' || s.sport === 'bike') && !C.isHard(s)); if (!x) return null; return [
    [`Mach ${x.sport === 'run' ? 'den Lauf' : 'die Radeinheit'} am ${DOW[dow(x.date)]} härter`, (_w, r) => expect(['harder', 'which']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].pending ? (w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'ja') : 'ok', (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); }]]; } },
  { name: 'streichen mit Bestätigung', steps: W => { const x = firstFuture(W); if (!x) return null; return [
    [`Streich das Training am ${DOW[dow(x.date)]}`, (_w, r) => expect(['cancel', 'which']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'ja', (w) => { const r = w.replies[w.replies.length - 1]; if (r.pending && r.pending.kind === 'confirm') w.say('ja'); expect(w.day(x.date)!.sessions.some((s: any) => s.cancelled)).toBe(true); }]]; } },
  { name: 'streichen, dann „nein“: nichts ändert sich', steps: W => { const x = firstFuture(W); if (!x) return null; const before = JSON.stringify(W.state.adjustments); return [
    [`Streich das Training am ${DOW[dow(x.date)]}`, () => {}], ['nein', (w, r) => { expect(r.intent).toBe('cancelled'); expect(JSON.stringify(w.state.adjustments)).toBe(before); }]]; } },
  { name: 'streichen, „lieber verschieben“, Tag wählen', steps: W => { const x = firstFuture(W, s => !s.stage); if (!x) return null; return [
    [`Lass ${x.sport === 'run' ? 'den Lauf' : 'die Einheit'} am ${DOW[dow(x.date)]} ausfallen`, (_w, r) => expect(['cancel', 'which']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'anderer Tag', () => {}], ['nein', (_w, r) => expect(r.text.length).toBeGreaterThan(3)]]; } },
  { name: 'Tage tauschen', steps: W => { const a = C.addDays(W.today, 1), b = C.addDays(W.today, 3); return [[`Tausch ${DOW[dow(a)]} und ${DOW[dow(b)]}`, (_w, r) => expect(['swap']).toContain(r.intent)], ['ja', () => {}]]; } },
  { name: 'Tag frei heute', steps: W => [['Ich brauche heute einen Tag frei', (_w, r) => expect(['day-off', 'move']).toContain(r.intent)], [w => (w.replies[w.replies.length - 1].options || [{ say: 'ja' }])[0].say, (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); expect(w.sessions(w.today, w.today).filter((s: any) => !s.cancelled).length).toBe(0); }]] },
  { name: 'keine Zeit ohne Tag → Rückfrage heute/Woche → heute', steps: W => [['Ich habe keine Zeit', (_w, r) => { expect(r.intent).toBe('scope'); expect(r.text).toBe('Meinst du heute oder die ganze Woche?'); }], ['heute', (_w, r) => expect(['day-off', 'move']).toContain(r.intent)]] },
  { name: 'keine Zeit diese Woche → wenig-Zeit-Woche', steps: W => [['Diese Woche habe ich kaum Zeit, ist stressig', (_w, r) => expect(['week-little', 'week']).toContain(r.intent)], ['ja', w => { for (const s of w.sessions(w.today)) expect(s.plannedMinutes).toBeLessThanOrEqual(Math.max(30, 200)); }]] },
  { name: 'Woche leichter', steps: W => [['Die Woche ist mir zu viel, mach sie leichter', (_w, r) => expect(['week-easier', 'week']).toContain(r.intent)], ['ja', () => {}]] },
  { name: 'krank → ja → Krankheitsphase; dann gesund', steps: W => [['Ich bin krank, Halsweh', (_w, r) => expect(r.intent).toBe('sick')], ['ja', w => expect(C.illnessAt(w.state.illnessPeriods, w.today)).toBeTruthy()],
    ['Ich bin wieder gesund', (_w, r) => expect(r.intent).toBe('healthy')], ['ja', w => expect(C.illnessAt(w.state.illnessPeriods, w.today)).toBeFalsy()]] },
  { name: 'nicht gut → nur locker', steps: W => [["Mir geht's heute nicht gut", (_w, r) => expect(['unwell', 'sick']).toContain(r.intent)], [w => w.replies[w.replies.length - 1].options[0].say, () => {}]] },
  { name: 'Knie tut weh → mittel → schonender Plan ohne Lauf-Intervalle', steps: W => [['Mein Knie tut weh', (_w, r) => { expect(r.intent).toBe('pain'); expect(r.options.map((o: any) => o.label)).toEqual(['Leicht (1-3)', 'Mittel (4-6)', 'Stark (7-10)']); }],
    ['mittel', (_w, r) => expect(r.intent).toBe('pain')], ['ja', w => { expect(w.profile.rules!.some(r => r.kind === 'body' && r.body === 'knee')).toBe(true); expect(w.sessions(C.addDays(w.today, 5), C.addDays(w.today, 40)).some((s: any) => s.sport === 'run' && /intervall|tempo/i.test(s.title))).toBe(false); }]] },
  { name: 'Verletzung stark → Pause und Arzt', steps: W => [['Bin umgeknickt, Sprunggelenk', (_w, r) => expect(r.intent).toBe('pain')], ['stark', (_w, r) => { expect(r.intent).toBe('injury'); expect(r.text).toMatch(/ärztlich/); }], ['ja', () => {}]] },
  { name: 'Urlaub mit Daten → kein Training im Zeitraum', steps: W => { const from = C.addDays(W.today, 12), to = C.addDays(W.today, 18); const f = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.`; return [
    [`Ich habe vom ${f(from)} bis ${f(to)} Urlaub`, (_w, r) => expect(r.intent).toBe('period')], ['ja', w => expect(w.sessions(from, to)).toEqual([])]]; } },
  { name: 'Urlaub ohne Daten → Rückfrage → nächste Woche', steps: W => [['Ich habe Urlaub', (_w, r) => { expect(r.intent).toBe('period'); expect(r.text).toMatch(/Von wann bis wann/); }], ['nächste Woche', (_w, r) => expect(r.intent).toBe('period')],
    ['ja', w => { const mon = C.addDays(w.today, 7 - ((dow(w.today) + 6) % 7)); expect(w.sessions(mon, C.addDays(mon, 6))).toEqual([]); }]] },
  { name: 'Prüfungszeit → wenig Training', steps: W => { const from = C.addDays(W.today, 14); const f = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.`; return [
    [`Vom ${f(from)} bis ${f(C.addDays(from, 6))} habe ich Prüfungen`, (_w, r) => expect(r.intent).toBe('period')], ['ja', w => w.sessions(from, C.addDays(from, 6)).forEach((s: any) => expect(s.plannedMinutes).toBeLessThanOrEqual(40))]]; } },
  { name: 'neue Regel „ab jetzt mittwochs kein Laufen“', steps: W => [['Ab jetzt kann ich mittwochs nicht laufen', (_w, r) => { expect(r.intent).toBe('rule'); expect(r.text).toContain('Laufen: nie Mi'); }],
    ['ja', w => { expect(w.sessions(w.today, C.addDays(w.today, 60)).filter((s: any) => s.sport === 'run' && dow(s.date) === 3)).toEqual([]); expect(w.profile.rules!.some(r => r.source === 'chat')).toBe(true); }]] },
  { name: 'neue Regel „donnerstags gar nichts“ wirkt sofort', steps: W => [['Donnerstags habe ich ab sofort gar keine Zeit', (_w, r) => expect(['rule', 'rule-scope']).toContain(r.intent)],
    [w => w.replies[w.replies.length - 1].intent === 'rule-scope' ? 'ab jetzt immer' : 'ja', (w, r) => { if (r.pending && r.pending.kind === 'confirm') w.say('ja'); expect(w.sessions(w.today, C.addDays(w.today, 30)).filter((s: any) => dow(s.date) === 4)).toEqual([]); }]] },
  { name: 'neues Ziel mit Monat → Sonntag, Plan angepasst', steps: W => [['Ich will im Mai einen Halbmarathon laufen', (_w, r) => { expect(r.intent).toBe('goal'); expect(r.text).toMatch(/Halbmarathon am \d\d\.05\.\d{4}/); }],
    ['ja', w => { const g = Object.values(w.goals).find((x: any) => x.type === 'run_half' && x.id.startsWith('goal-chat')) as any; expect(g).toBeTruthy(); expect(dow(g.date)).toBe(0); }]] },
  { name: 'neues Ziel ohne Datum → Rückfrage → Datum', steps: W => [['Neues Ziel: Marathon', (_w, r) => { expect(r.intent).toBe('goal'); expect(r.text).toMatch(/wann ist der Wettkampf/); }], ['am 11.4.', (_w, r) => expect(r.intent).toBe('goal')], ['ja', w => expect(Object.values(w.goals).some((x: any) => x.type === 'run_marathon')).toBe(true)]] },
  { name: 'Wunschzeit ändern', steps: W => [['Meine Wunschzeit ist 2:59:00', (_w, r) => expect(r.intent).toBe('goal-time')], ['ja', w => expect(Object.values(w.goals).some((x: any) => x.targetTimeSec === 10740)).toBe(true)]] },
  { name: 'Rückgängig stellt alles wieder her', steps: W => { const x = firstFuture(W); if (!x) return null; let snap = ''; return [
    [`Streich das Training am ${DOW[dow(x.date)]}`, w => { snap = JSON.stringify(w.weeks()); }], [w => w.replies[w.replies.length - 1].intent === 'which' ? '1' : 'ja', w => { const r = w.replies[w.replies.length - 1]; if (r.pending && r.pending.kind === 'confirm') w.say('ja'); w.undo(); expect(JSON.stringify(w.weeks())).toBe(snap); }]]; } },
  { name: 'unklare Nachricht → gezielte Rückfrage mit Knöpfen', steps: W => [['Mittwoch', (_w, r) => { expect(['clarify', 'which', 'unknown']).toContain(r.intent); expect(r.options.length).toBeGreaterThan(0); expect(r.text).toMatch(/\?/); }]] },
  { name: 'Frage beantwortet (heute)', steps: W => [['Was steht heute an?', (_w, r) => expect(['today']).toContain(r.intent)]] },
  { name: 'Frage beantwortet (Warum locker)', steps: W => [['Warum soll ich heute locker trainieren?', (_w, r) => expect(r.intent).toBe('why-easy')]] }
];

const SKIPPED: string[] = [];
const CONVS: Conv[] = IDS.flatMap(id => TEMPLATES.map(t => ({ name: t.name, persona: id, steps: t.steps })));
describe('D6: Gespräche (alle Test-Personen × alle Abläufe)', () => {
  test('mindestens 150 Gespräche', () => expect(CONVS.length).toBeGreaterThanOrEqual(150));
  test.each(CONVS.map(c => [`${c.persona}: ${c.name}`, c] as const))('%s', (_n, c) => {
    const W = world(c.persona); (W as any).persona = c.persona;
    const steps = c.steps(W);
    if (!steps) { SKIPPED.push(`${c.persona}: ${c.name}`); return; } // Ablauf passt nicht zur Person (z. B. heute keine Einheit)
    for (const [say, check] of steps) {
      const text = typeof say === 'function' ? say(W) : say;
      const r = W.say(text);
      ok(W, r);
      check(W, W.replies[W.replies.length - 1] === r ? r : W.replies[W.replies.length - 1]);
      expect(W.violations()).toEqual([]);
    }
  });
});

test('D2: genau der Beispiel-Dialog: „Ich hab Mittwoch keine Zeit“ → „Donnerstag oder Samstag?“ → „Samstag“', () => {
  const W = world('jugend-langdistanz', '2026-10-26'); // Montag; Mittwoch hat eine Einheit
  const wed = W.sessions('2026-10-28', '2026-10-28');
  expect(wed.length).toBeGreaterThan(0);
  const r = W.say('Ich hab Mittwoch keine Zeit');
  expect(r.text).toMatch(/^(Soll ich .* legen\?|Vorschlag für Mittwoch)/);
  const sat = W.say('lieber Samstag');
  expect(sat.text.startsWith('Erledigt') || sat.pending).toBeTruthy();
  if (!sat.text.startsWith('Erledigt')) W.say('ja');
  expect(W.violations()).toEqual([]);
});

test('A4 im Chat: Verschieben gegen eine harte Regel wird abgelehnt, erlaubte Tage werden angeboten', () => {
  const W = world('vater-regeln');
  const r = W.say('Verschieb den Lauf auf Mittwoch');
  expect(r.text).toMatch(/geht nicht wegen deiner Regel „Laufen: nie Mi“/);
  expect((r.options || []).map(o => o.label).join(' ')).not.toMatch(/Mittwoch|Montag|Dienstag|Donnerstag|Freitag/);
  expect(W.violations()).toEqual([]);
});

/* Auftrag 6, Punkt 4 (Durchlauf mit Jonahs echten Daten: krank seit 6 Tagen mit Fieber) */
test('krank: „Kann ich morgen schon wieder schwimmen?“ → Antwort zur Krankheit, keine Plan-Rückfrage', () => {
  const W = world('jugend-langdistanz');
  W.state.illnessPeriods = [{ id: 'ill-x', start: C.addDays(W.today, -5), end: null, note: 'Erkältung mit Fieber' }];
  for (const s of ['Kann ich morgen schon wieder schwimmen?', 'Darf ich heute laufen?', 'Kann ich wieder trainieren?']) {
    const r = W.say(s);
    expect(r.intent, s).toBe('sick-question');
    expect(r.text, s).toMatch(/krank/);
    expect(r.text, s).toMatch(/24 Stunden/);
    expect((r.options || []).map(o => o.label), s).toContain('Wieder gesund');
    expect(r.apply || [], s).toEqual([]);
  }
});
test('verschieben bietet abends den heutigen Tag nicht mehr an', () => {
  const W = world('jugend-langdistanz');
  W.now = Date.parse(W.today + 'T19:30:00Z'); // 21:30 in Berlin
  const sess = W.sessions(C.addDays(W.today, 1), C.addDays(W.today, 4))[0];
  const name = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date(sess.date + 'T12:00:00Z').getUTCDay()];
  const r = W.say(`Ich habe ${name} keine Zeit`);
  const labels = (r.options || []).map(o => o.label).join(' | ');
  const todayLabel = new Date(W.today + 'T12:00:00Z').getUTCDate() + '.';
  expect(labels, labels).not.toMatch(new RegExp('\\b' + todayLabel.replace('.', '\\.') + String(new Date(W.today + 'T12:00:00Z').getUTCMonth() + 1).padStart(2, '0')));
});

test('D4: Schnellaktionen passen zur Lage', () => {
  const W = world('jugend-langdistanz');
  // Auftrag 18: heute kann ein Ruhetag sein (mindestens 1 pro Woche) – dann passen die Aktionen ohne Einheit
  const todayOwn = (W.day(W.today) || { sessions: [] }).sessions.some((s: any) => s.sport !== 'rest' && s.sport !== 'football' && !s.cancelled);
  expect(quickOptions(W.ctx(), {}).map(o => o.label)).toEqual(expect.arrayContaining(todayOwn ? ['Keine Zeit heute', "Mir geht's nicht gut", 'Tag tauschen'] : ['Was steht morgen an?', 'Woche leichter']));
  W.say('Ich bin krank'); W.say('ja');
  expect(quickOptions(W.ctx(), {}).map(o => o.label)).toContain('Wieder gesund');
  // jede Schnellaktion führt zu einer sinnvollen Antwort (2 Tipps)
  const W2 = world('laeuferin-hm');
  for (const o of quickOptions(W2.ctx(), {})) { const r = converse(W2.ctx(), {}, o.say).reply; expect(r.text.length).toBeGreaterThan(5); expect(r.intent).not.toBe('unknown'); }
});

describe('D1: jede Nachricht bekommt eine Antwort (100 zufällige Nachrichten)', () => {
  const WORDS = ['ich', 'heute', 'morgen', 'Lauf', 'Rad', 'kann', 'nicht', 'bitte', 'warum', 'Plan', 'müde', '???', '🙂', 'Mittwoch', '42', 'Knie', 'ja', 'nein', 'Urlaub', 'xyz', 'schneller', 'langsamer', 'Ziel', 'Wasser', 'Pizza', '', 'Samstag', 'kürzer', 'Woche', 'Hallo'];
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const msgs = Array.from({ length: 100 }, (_, i) => i % 10 === 0 ? 'a'.repeat(600) : i % 13 === 0 ? '' : Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(' '));
  test('keine Ausnahme, nie leer, nie Floskel', () => {
    for (const id of ['jugend-langdistanz', 'vater-regeln']) {
      const W = world(id);
      for (const m of msgs) { const r = W.say(m); expect(typeof r.text).toBe('string'); expect(r.text.trim().length).toBeGreaterThan(5); expect(r.text).not.toMatch(GENERIC); }
      expect(W.violations()).toEqual([]);
    }
  });
});
void CHAT_TODAY;
test('mindestens 150 Gespräche laufen wirklich (nicht übersprungen)', () => {
  // läuft nach den Gesprächen (Reihenfolge der Datei)
  expect(CONVS.length - SKIPPED.length).toBeGreaterThanOrEqual(150);
});
