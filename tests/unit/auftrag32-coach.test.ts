/* Auftrag 32: Coach grundlegend repariert – eine Frage, eine Entscheidung, eine Antwort.
   1) Coach-Testlabor: 21 Test-Nutzer × 36 Fragen, automatische Prüfungen + Bewertungsregeln (läuft vor jedem Release in `npm test`).
   2) Jonahs Gespräch vom 9.11. (nachgestellt, erfundene Daten): Ersatz für ausgefallenes Fußball-Training, Folgefragen, kein Widerspruch.
   3) Prüfer für KI-Antworten mit den drei echten schlechten Antworten vom 9.11. (Text, keine Nutzerdaten).
   4) Eine Antwort je Frage (Hinweis und Vorschläge an derselben Nachricht), eine Bewertung je Aufzeichnung. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { runLab, summary, LAB_USERS, QUESTIONS_PER_USER, judgeOk, labWorld, CONVS, runConv } from '../helpers/coachlab32';
import { converse } from '../../shared/coach/dialog';
import { stripPlanAsReason, suggestsDoneAgain, contradictsOffer, ruleLinesForAi, decide, openOffer } from '../../shared/coach/decide';
import { focusedPrompt, coachSkill } from '../../shared/coach/freeai';
import { oneAnswer } from '../../shared/coach/answer';
import { reviewMsgId } from '../../shared/coach/review';
import { arrangeFeed, duplicateMsgIds } from '../../shared/coach/feed';

describe('Coach-Testlabor', () => {
  const turns = runLab();
  const s = summary(turns);
  if (process.env.LAB_REPORT) {
    fs.mkdirSync('docs/coach-labor-32', { recursive: true });
    fs.writeFileSync('docs/coach-labor-32/ergebnis.json', JSON.stringify({ ...s, users: LAB_USERS.map(u => ({ id: u.id, label: u.label })), questions: CONVS }, null, 1));
  }
  test('mindestens 20 Test-Nutzer × mindestens 30 Fragen', () => {
    expect(LAB_USERS.length).toBeGreaterThanOrEqual(20);
    expect(QUESTIONS_PER_USER).toBeGreaterThanOrEqual(30);
    expect(turns.length).toBe(LAB_USERS.length * QUESTIONS_PER_USER);
  });
  test('alle automatischen Prüfungen bestanden (eine Antwort, kein Widerspruch, kennt den Tag, sinnvoll, kurz, keine Wiederholung, Zahlen/Daten, Folgefragen)', () => {
    const bad = turns.filter(t => t.fails.length).map(t => `${t.user} | ${t.q} → ${t.fails.join('; ')} | ${t.reply.text.slice(0, 160)}`);
    expect(bad).toEqual([]);
  });
  test('Bewertungsregeln: jede Antwort mindestens 3/5 in Sinn, Verständlichkeit und Hilfsbereitschaft, Schnitt ≥ 4,5', () => {
    const bad = turns.filter(t => !judgeOk(t.judge)).map(t => `${t.user} | ${t.q} → ${JSON.stringify(t.judge)}`);
    expect(bad).toEqual([]);
    expect(s.judge.sinn).toBeGreaterThanOrEqual(4.5); expect(s.judge.klar).toBeGreaterThanOrEqual(4.5); expect(s.judge.hilfe).toBeGreaterThanOrEqual(4.5);
    expect(s.pct).toBe(100);
  });
});

describe('Jonahs Gespräch vom 9.11. (nachgestellt)', () => {
  const u = LAB_USERS.find(x => x.id === 'u01-jonah-aehnlich')!;
  test('Ersatz statt Verbot, kennt die erledigte Kraft-Einheit, gleiche Zahl bei den Folgefragen', () => {
    const W = labWorld(u); let d: any = {}; let t = Date.parse(W.today + 'T17:46:00Z');
    const say = (q: string) => { t += 60000; W.now = t; const r = converse(W.ctx() as any, d, q); d = r.dialog; W.state.coachMsgs['a' + t] = { id: 'a' + t, at: t, date: W.today, kind: 'answer', from: 'coach', chat: true, intent: r.reply.intent, text: r.reply.text, offer: r.reply.offer, decision: r.reply.decision }; return r.reply; };
    const a1 = say('soll ich heute noch was machen weil fußballtraining fällt aus');
    expect(a1.offer).toBeTruthy(); const m = a1.offer!.minutes;
    expect(a1.offer!.sport).not.toBe('strength');
    expect(m).toBeGreaterThanOrEqual(30); expect(m).toBeLessThanOrEqual(45);   // gelbe Ampel: höchstens 45 min
    expect(a1.text).toMatch(/schon erledigt/);
    expect(a1.text).not.toMatch(/nicht im Plan|laut deinen Regeln|nicht vorgesehen/i);
    expect((a1.options || []).map(o => o.label)).toEqual(['Übernehmen', 'Nein danke']);
    const a2 = say('aber ich will heute irgendwas machen');
    expect(a2.text).toMatch(new RegExp(`Bleibt dabei: ${m} min`));
    const a3 = say('wie lange soll ich radfahren');
    expect(a3.text).toContain(`${m} min`);
    for (const a of [a1, a2, a3]) { expect(suggestsDoneAgain(W.ctx() as any, a.text)).toBeNull(); expect(stripPlanAsReason(a.text).removed).toEqual([]); }
    const a4 = say('ja');
    expect(openOffer(W.ctx() as any)).toBeTruthy();
    expect(a4.apply && a4.apply.length).toBe(1);
  });
  test('Wochenraster ist kein Verbot: an Tagen ohne Raster-Freigabe trotzdem Ersatz (mit Hinweis nur bei reinem Extra)', () => {
    const W = labWorld({ ...u, teamGone: false, doneToday: null });
    const r = converse(W.ctx() as any, {}, 'Fußball fällt heute aus, was soll ich machen?').reply;
    expect(r.offer).toBeTruthy(); expect(r.text).not.toMatch(/Wochenraster/);   // Ersatz im freien Zeitfenster: kein Hinweis nötig
  });
});

describe('KI-Antworten prüfen (die drei echten Antworten vom 9.11.)', () => {
  const A1 = 'Da du das Fußball-Training am Mo 09.11. ausgelassen hast, ist heute erst einmal nichts mehr geplant. Da heute laut deinen Regeln ohnehin kein Laufen, Radfahren, Schwimmen oder Krafttraining vorgesehen ist, bleibt der Tag zur Erholung frei. Nutze die Pause für aktive Regeneration, damit du morgen am Di 10.11. voll für das Schwimmen und Krafttraining bereit bist.';
  const A2 = 'Da du heute Mo 09.11. laut deinen Regeln kein Krafttraining machen möchtest, wäre das heute nicht ideal. Da das Fußballtraining ausfällt, könntest du alternativ eine lockere Einheit am Rad oder beim Laufen einplanen, sofern du das für dich passend findest. Beachte aber, dass du laut Plan morgen Di 10.11. bereits Schwimmen und Kraft auf dem Programm hast.';
  const A3 = 'Da du heute Mo 09.11. laut deinen Regeln nicht Rad fahren solltest, empfehle ich dir, diese Regel einzuhalten. Wenn du unbedingt etwas machen möchtest, wäre Krafttraining eine Option, da du heute bereits eine Einheit absolviert hast. Eine genaue Dauer für eine zusätzliche Radfahrt kann ich dir nicht nennen, da dies nicht in deinem Plan steht.';
  test('„laut deinen Regeln … nicht“ und „nicht im Plan“ als Grund werden erkannt', () => {
    expect(stripPlanAsReason(A1).removed.length).toBe(1);
    expect(stripPlanAsReason(A2).removed.length).toBe(1);
    expect(stripPlanAsReason(A3).removed.length).toBe(2);   // der Kraft-Satz ist kein Plan-Grund, den findet suggestsDoneAgain
    expect(stripPlanAsReason('Heute steht nichts im Plan. Mach 40 min locker Rad.').removed).toEqual([]);
  });
  test('Kraft vorgeschlagen, obwohl heute schon gemacht → erkannt; Rad-Angebot zurückgenommen → erkannt', () => {
    const W = labWorld(LAB_USERS.find(x => x.id === 'u01-jonah-aehnlich')!);
    expect(suggestsDoneAgain(W.ctx() as any, A3)).toMatch(/Kraft/);
    expect(suggestsDoneAgain(W.ctx() as any, 'Kraft hast du heute schon gemacht, also 40 min Rad.')).toBeNull();
    const offer: any = { id: 'x', date: W.today, sport: 'bike', minutes: 40, zone: 2, title: 'Lockeres Rad', adjIds: [], status: 'open' };
    expect(contradictsOffer(A3, offer)).toBe(true);
    expect(contradictsOffer('Korrektur: Deine Ampel ist rot, deshalb heute doch kein Rad.', offer)).toBe(false);
    expect(contradictsOffer('Ja, 40 min locker Rad fahren.', offer)).toBe(false);
  });
  test('KI-Kontext: Wochenraster getrennt und als „kein Verbot“, heute Erledigtes steht drin', () => {
    const W = labWorld(LAB_USERS.find(x => x.id === 'u01-jonah-aehnlich')!);
    const ctx: any = W.ctx();
    const lines = ruleLinesForAi(ctx).join('\n');
    expect(lines).toMatch(/Wochenraster \(so verteilt die App die GEPLANTEN Einheiten; kein Verbot/);
    expect(lines).toMatch(/plant die App nie/);
    expect(lines).toMatch(/„Steht nicht im Plan“ ist nie ein Grund/);
    const fp = focusedPrompt(ctx, 'was meinst du zu heute', 'Stamio', null);
    expect(fp.system).toMatch(/HEUTE ERLEDIGT: Kraft: [^\n]*\(40 min\)/);
    expect(fp.system).not.toMatch(/Regeln des Athleten \(nie brechen[^\n]*\n- Schwimmen: nie/);
    expect(coachSkill(ctx, 'Stamio')).toMatch(/kein Verbot für Ersatz/);
  });
  test('Tagesentscheidung greift vor der KI (Server nutzt dieselbe Funktion)', () => {
    const W = labWorld(LAB_USERS.find(x => x.id === 'u01-jonah-aehnlich')!);
    const d = decide(W.ctx() as any, 'soll ich heute noch was machen weil fußballtraining fällt aus');
    expect(d && d.proposal && d.proposal.changes.length).toBeGreaterThanOrEqual(1);
    expect(decide(W.ctx() as any, 'Was ist Zone 2?')).toBeNull();
    expect(decide(W.ctx() as any, 'Verschieb das Schwimmen auf Donnerstag')).toBeNull();
    expect(decide(W.ctx() as any, 'Was soll ich vor dem Training essen?')).toBeNull();
    expect(decide(W.ctx() as any, 'Mir tut das Knie weh, soll ich heute laufen oder Rad fahren?')).toBeNull();
  });
});

describe('Eine Antwort je Frage', () => {
  test('Hinweis und mehrere Vorschläge landen in EINER Nachricht mit EINEM Vorschlag', () => {
    const ans: any = { id: 'msg-ai-1', at: 1, date: '2026-11-09', kind: 'answer', from: 'ai', text: 'Ich habe dir einen Vorschlag gemacht.' };
    const p = (id: string, title: string) => ({ id, at: 2, date: '2026-11-09', kind: 'proposal', from: 'ai', title, text: '', proposal: { status: 'open', changes: [{ kind: 'adjust', key: id, data: { id, type: 'modify', sessionId: id, what: title } }] } }) as any;
    const out = oneAnswer(ans, ['Iss nach dem Training etwas mit Eiweiß.'], [p('a', 'Ändern: Lauf kürzer'), p('b', 'Streichen: Rad')]);
    expect(out.length).toBe(1);
    expect(out[0].text).toMatch(/Eiweiß/);
    expect((out[0] as any).proposal.changes.length).toBe(2);
    expect((out[0] as any).propTitle).toBe('Vorschlag: Lauf kürzer; Rad');
    expect(oneAnswer(ans, [], []).length).toBe(1);
  });
  test('offener Vorschlag an einer Antwort zählt als offen (Gerade aktuell)', () => {
    const { feed } = arrangeFeed([{ id: 'x', at: Date.now() - 86400000 * 9, date: '2026-10-30', kind: 'answer', from: 'ai', text: 't', proposal: { status: 'open', changes: [{ kind: 'adjust', key: 'k', data: {} }] } }], Date.now(), 0, 7);
    expect(feed.length).toBe(1);
  });
});

describe('Eine Bewertung je Aufzeichnung', () => {
  test('Aufzeichnung zuerst ohne Einheit bewertet, dann Extra-Einheit „act-…“: alte Bewertung wird ersetzt', () => {
    const state: any = { coachMsgs: { 'msg-review-healthfit-strength-1': { id: 'msg-review-healthfit-strength-1', at: 10, kind: 'session', from: 'coach', title: 'Bewertung: Krafttraining', text: 'a', refs: { activityId: 'healthfit-strength-1' } } } };
    const r = reviewMsgId(state, { key: 'act-healthfit-strength-1', act: { id: 'healthfit-strength-1' } });
    expect(r.id).toBe('msg-review-act-healthfit-strength-1');
    expect(r.old && r.old.id).toBe('msg-review-healthfit-strength-1');
    expect(reviewMsgId(state, { key: 'healthfit-strength-1', act: { id: 'healthfit-strength-1' } }).old).toBeNull();
  });
  test('vorhandene doppelte Bewertungen (wie bei Nutzer 1 am 9.11.): nur die neueste wird gezeigt', () => {
    const a = { id: 'msg-review-healthfit-strength-9', at: 100, date: '2026-11-09', kind: 'session', from: 'coach', title: 'Bewertung: Krafttraining', text: 'Krafttraining …', refs: { activityId: 'healthfit-strength-9' } };
    const b = { id: 'msg-review-act-healthfit-strength-9', at: 200, date: '2026-11-09', kind: 'session', from: 'coach', title: 'Bewertung: Kraft Oberkörper', text: 'Kraft Oberkörper …', refs: {} };
    expect(duplicateMsgIds([a, b])).toEqual([a.id]);
    expect(duplicateMsgIds([b, a])).toEqual([a.id]);
  });
});

describe('Folgefragen über mehrere Nutzer', () => {
  test('„und wie lange?“ nennt immer die Minuten des offenen Angebots', () => {
    for (const u of LAB_USERS.filter(x => !x.ill && x.level !== 'red')) {
      const turns = runConv(u, CONVS[0]);
      const offer = turns[0].reply.offer;
      if (!offer) continue;
      expect(turns[1].reply.text, u.id).toContain(String(offer.minutes));
    }
  });
});
