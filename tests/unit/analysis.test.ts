/* Auftrag 7, Punkt 6: Analyse-Coach. 30 Testfälle mit Jonahs echten Daten (nur lokal) und Grundtests, die immer laufen. */
import { test, expect, describe } from 'vitest';
import { analyze } from '../../shared/coach/analysis';
import { hasRealData, realCtx } from '../helpers/real-data';
import { world, CHAT_TODAY } from '../helpers/chat-world';
import * as C from '../../shared/core';

const own = (ctx: any, from: string, to: string) => C.planDays(C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments)).filter((d: any) => d.date >= from && d.date <= to);
const apply = (ctx: any, list: any[]) => list.forEach(a => { ctx.state.adjustments[a.id] = a; });

describe.skipIf(!hasRealData())('Analyse mit echten Daten (30 Fälle)', () => {
  const days = ['2026-09-21', '2026-09-25', '2026-09-30', '2026-10-03', '2026-10-06', '2026-10-09', '2026-10-11', '2026-10-13'];
  for (const d of days) test(`${d}: läuft, höchstens 3 Top-Erkenntnisse, jede mit Begründung und Tipp`, () => {
    const r = analyze(realCtx(d), 'morning');
    expect(r.top.length).toBeLessThanOrEqual(3);
    for (const i of r.insights) { expect(i.why.length).toBeGreaterThan(15); expect(i.tip.length).toBeGreaterThan(10); }
  }); // 8 Fälle
  test('während der Erkältung (9.10.) steht die Krankheit oben', () => { expect(analyze(realCtx('2026-10-09')).top[0].id).toBe('ill'); });
  test('13.10.: Wiedereinstieg und gesunkene Fitness werden erkannt, keine Überlastung', () => {
    const ids = analyze(realCtx('2026-10-13')).insights.map(i => i.id);
    expect(ids).toContain('ret'); expect(ids).toContain('acwr-low-ill'); expect(ids).not.toContain('acwr-high');
  });
  test('13.10.: Belastung entspricht intervals.icu (CTL 22, ATL 3)', () => { const L = analyze(realCtx('2026-10-13')).load; expect([Math.round(L.ctl!), Math.round(L.atl!)]).toEqual([22, 3]); expect(L.source).toBe('intervals.icu'); });
  test('nach der Krankheit heißt es „noch nicht ganz erholt“ statt „Ermüdung steigt“', () => { const f = analyze(realCtx('2026-10-13')).insights.find(i => i.id === 'fatigue'); if (f) expect(f.title).toMatch(/Krankheit/); });
  test('Ende September (Schnupfen, Ruhepuls hoch) erkennt die Analyse Ermüdung', () => { expect(analyze(realCtx('2026-09-30')).insights.map(i => i.id)).toContain('fatigue'); });
  test('aerobe Effizienz aus den Lauf-Feldern, mit Bezug zum Ziel 4:30/km bei Puls 120', () => {
    const e = analyze(realCtx('2026-10-06')).insights.find(i => /^eff-/.test(i.id))!;
    expect(e).toBeTruthy(); expect(e.why).toMatch(/4:30\/km bei Puls 120/);
  });
  test('Technik-Problem aus der Schwimm-Notiz wird zum Tipp', () => { const t = analyze(realCtx('2026-10-03')).insights.find(i => i.id === 'swim-tech')!; expect(t.why).toMatch(/beine sinken/); expect(t.tip).toMatch(/Kopf ruhig/); });
  test('Entkopplung der längeren Einheiten wird bewertet', () => { expect(analyze(realCtx('2026-10-06')).insights.some(i => /^decoupling/.test(i.id))).toBe(true); });
  test('ausgelassene Einheiten (ohne Krankheitstage) werden gezählt', () => { expect(analyze(realCtx('2026-10-06')).insights.find(i => i.id === 'consistency')!.why).toMatch(/\d+ von \d+/); });
  // Block 2 mit gespielten Werten auf echten Daten
  const block2 = () => { const ctx = realCtx('2026-11-13'); const runs = own(ctx, '2026-10-19', '2026-11-12').flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'run' && !C.isHard(s)).map((s: any) => s)); return { ctx, runs }; };
  test('3 lockere Läufe in Folge mit zu hohem Puls → Erkenntnis mit Puls-Grenze 155 (aerobe Schwelle)', () => {
    const { ctx, runs } = block2(); expect(runs.length).toBeGreaterThanOrEqual(3);
    runs.slice(-3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, metrics: { min: '40', km: '6.2', hr: '166' } }; });
    const r = analyze(ctx, 'activity'); const i = r.insights.find(x => x.id === 'run-hr-high')!;
    expect(i.tone).toBe('warn'); expect(i.why).toMatch(/bis etwa 155/);
  });
  test('… und kleine Änderung automatisch: Puls-Grenze im nächsten lockeren Lauf, mit Mitteilung und Rückgängig-Bezug', () => {
    const { ctx, runs } = block2(); runs.slice(-3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, metrics: { min: '40', km: '6.2', hr: '166' } }; });
    const r = analyze(ctx, 'activity');
    expect(r.auto.length).toBe(1); expect(r.auto[0].type).toBe('modify'); expect(Object.keys(r.auto[0].set)).toEqual(['description']); expect(r.auto[0].set.description).toMatch(/unter 155/);
    const m = r.messages.find(x => x.kind === 'adjust')!; expect(m.refs!.adjustmentIds).toEqual([r.auto[0].id]);
  });
  test('… die automatische Änderung kommt nur einmal', () => {
    const { ctx, runs } = block2(); runs.slice(-3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, metrics: { min: '40', km: '6.2', hr: '166' } }; });
    const r1 = analyze(ctx, 'activity'); apply(ctx, r1.auto); r1.messages.forEach(m => { ctx.state.coachMsgs[m.id] = m; });
    const r2 = analyze(ctx, 'activity'); expect(r2.auto).toEqual([]); expect(r2.messages.filter(m => m.kind !== 'proposal')).toEqual([]);
  });
  test('lockere Läufe mit Puls unter 155: keine Warnung', () => {
    const { ctx, runs } = block2(); runs.slice(-3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, metrics: { min: '40', km: '6.2', hr: '146' } }; });
    expect(analyze(ctx).insights.map(i => i.id)).not.toContain('run-hr-high');
  });
  const tiredCtx = () => { const ctx = realCtx('2026-10-28'); const tr = ctx.state.trend; for (let d = '2026-10-14'; d <= '2026-10-28'; d = C.addDays(d, 1)) tr.push({ date: d, ctl: 30, atl: 50, tsb: -20, restingHR: 55, hrv: 62, sleepHours: 8.6 }); const done = own(ctx, '2026-10-21', '2026-10-27').flatMap((d: any) => d.sessions.filter((s: any) => ['run', 'bike', 'swim'].includes(s.sport))); done.slice(0, 3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, feel: '5', rpe: '8', metrics: { min: '40' } }; }); return ctx; };
  test('ACWR über 1,5 → „Belastung steigt zu schnell“ ganz oben', () => { const r = analyze(tiredCtx()); expect(r.top[0].id).toBe('acwr-high'); expect(r.top[0].why).toMatch(/ACWR 1,67/); });
  test('Gefühl „sehr müde“ und hohe RPE bei lockeren Einheiten → „Einheiten fühlen sich schwer an“', () => { expect(analyze(tiredCtx()).insights.map(i => i.id)).toContain('feel'); });
  test('mehrere Müdigkeitszeichen → Vorschlag: nächste Woche 15 % leichter (nicht automatisch)', () => {
    const r = analyze(tiredCtx(), 'weekly'); const p = r.proposals[0];
    expect(p.title).toMatch(/15 % leichter/); expect(p.changes.length).toBeGreaterThan(0);
    expect(r.auto.filter(a => a.group && a.group.startsWith('ana-week'))).toEqual([]);
    expect(r.messages.some(m => m.kind === 'proposal' && m.proposal!.status === 'open')).toBe(true);
  });
  test('… Annehmen kürzt die Ausdauer-Einheiten der nächsten Woche, Lernstufen bleiben', () => {
    const ctx = tiredCtx(); const r = analyze(ctx, 'weekly'); const p = r.proposals[0];
    const ids = p.changes.map(c => c.data.sessionId);
    const before = own(ctx, '2026-11-02', '2026-11-08').flatMap((d: any) => d.sessions).filter((s: any) => ids.includes(s.id)).reduce((a: number, s: any) => a + s.plannedMinutes, 0);
    apply(ctx, p.changes.map(c => c.data));
    const after = own(ctx, '2026-11-02', '2026-11-08').flatMap((d: any) => d.sessions).filter((s: any) => ids.includes(s.id)).reduce((a: number, s: any) => a + s.plannedMinutes, 0);
    expect(after).toBeLessThan(before);
    expect(own(ctx, '2026-11-02', '2026-11-08').flatMap((d: any) => d.sessions).filter((s: any) => s.stage && ids.includes(s.id))).toEqual([]);
  });
  test('Schwimm-Fortschritt aus den Feldern: Kraul am Stück von 12,5 m auf 25 m', () => {
    const ctx = realCtx('2026-10-21'); const s = own(ctx, '2026-10-20', '2026-10-20')[0].sessions.find((x: any) => x.sport === 'swim');
    ctx.state.sessions[s.id] = { completed: true, metrics: { meters: '900', min: '35', longestCrawl: '25' } };
    const i = analyze(ctx).insights.find(x => x.id === 'swim-crawl')!; expect(i.why).toMatch(/12,5 m .* auf 25 m/);
  });
  test('Wochen-Auslöser schreibt „Was der Coach gerade sieht“ als Nachricht', () => { expect(analyze(realCtx('2026-10-11'), 'weekly').messages.some(m => m.title === 'Was der Coach gerade sieht')).toBe(true); });
  test('Ansicht in der App: keine Lob-Nachrichten, nur Warnungen', () => { expect(analyze(realCtx('2026-10-06'), 'view').messages.every(m => m.kind !== 'info')).toBe(true); });
  test('Top 3: höchstens 2 Erkenntnisse derselben Art', () => { for (const d of ['2026-09-30', '2026-10-06', '2026-10-13']) { const r = analyze(realCtx(d)); const kinds = r.top.map(i => i.kind); kinds.forEach(k => expect(kinds.filter(x => x === k).length).toBeLessThanOrEqual(2)); } });
  test('automatische Änderungen verschieben, streichen oder verschärfen nie etwas', () => {
    const { ctx, runs } = block2(); runs.slice(-3).forEach((s: any) => { ctx.state.sessions[s.id] = { completed: true, metrics: { min: '40', hr: '170', km: '6' } }; });
    analyze(ctx, 'activity').auto.forEach(a => { expect(a.type).toBe('modify'); expect(a.set.hard).toBeUndefined(); expect(a.set.plannedMinutes).toBeUndefined(); });
  });
});

describe('Analyse: Grundtests (ohne echte Daten)', () => {
  test('neuer Nutzer ohne Daten: kein Fehler', () => { const W1 = world('vater-rad-lauf'); const r = analyze(W1.ctx() as any); expect(r.top.length).toBeLessThanOrEqual(3); expect(r.auto).toEqual([]); });
  test('zu wenig Schlaf wird erkannt', () => {
    const W1 = world('vater-rad-lauf'); for (let i = 0; i < 30; i++) W1.state.trend.push({ date: C.addDays(CHAT_TODAY, -i), sleepHours: 5.5, restingHR: 50, hrv: 60 });
    W1.state.trend.sort((a: any, b: any) => a.date.localeCompare(b.date));
    expect(analyze(W1.ctx() as any).insights.map(i => i.id)).toContain('sleep');
  });
  test('Krankheit hat Vorrang vor allem', () => { const W1 = world('jugend-langdistanz'); W1.state.illnessPeriods = [{ id: 'i', start: CHAT_TODAY, end: null }]; expect(analyze(W1.ctx() as any).top[0].id).toBe('ill'); });
});

import {swimReviewMessages} from '../../shared/coach/analysis';
import {defaultProfile} from '../../shared/profile';
describe('Synthetische Schwimmhinweise: ein Anlass, ein offener Hinweis',()=>{
 const setup=()=>({today:'2026-10-27',now:1000,profile:{...defaultProfile(),skills:{swimCrawlM:100,swimPullM:50}},baseWeeks:[],state:{sessions:{},customWorkouts:{},activities:{},adjustments:{},coachMsgs:{},profile:{skills:{swimCrawlM:100,swimPullM:50}}}} as any);
 const update=(crawl=50)=>({reviewOnly:true,skills:{swimCrawlM:crawl,swimPullM:50},text:'Bitte pruefen: aktuelle Ergebnisse belegen 50 m.',adjustments:Array.from({length:30},(_,i)=>({id:'old-'+i,sessionId:'s'+i,set:{title:'SYNTHETIC Schwimmen'},what:'SYNTHETIC neue Schwimmeinheit'}))});
 const applyMessages=(ctx:any,msgs:any[])=>msgs.forEach(m=>ctx.state.coachMsgs[m.id]=m);
 test('alte dreifache Hinweise werden ueberholt, Text bleibt kurz, Details bleiben separat',()=>{const ctx=setup();for(let i=0;i<3;i++)ctx.state.coachMsgs['msg-swim-legacy-old'+i]={id:'msg-swim-legacy-old'+i,proposal:{status:'open',skillsOnly:true,changes:[]},text:'alt'};const msgs=swimReviewMessages(ctx,update());applyMessages(ctx,msgs);const all=Object.values(ctx.state.coachMsgs) as any[];expect(all.filter(m=>m.proposal.status==='open')).toHaveLength(1);expect(all.filter(m=>m.proposal.status==='superseded')).toHaveLength(3);const current=all.find(m=>m.proposal.status==='open');expect(current.text.length).toBeLessThan(500);expect(current.details).toHaveLength(1);expect(current.proposal.changes).toHaveLength(31);});
 test('unveraenderter Anlass erzeugt keine neue ID; irrelevante Daten erneuern nur den Leseschutz',()=>{const ctx=setup();applyMessages(ctx,swimReviewMessages(ctx,update()));const id=Object.keys(ctx.state.coachMsgs)[0];ctx.state.sessions.other={completed:true,metrics:{hr:120}};ctx.now=2000;applyMessages(ctx,swimReviewMessages(ctx,update()));expect(Object.keys(ctx.state.coachMsgs)).toEqual([id]);expect(ctx.state.coachMsgs[id].at).toBe(1000);});
 test('abgelehnter Anlass bleibt erledigt, veraenderter Vorschlag ist neuer Anlass',()=>{const ctx=setup();applyMessages(ctx,swimReviewMessages(ctx,update()));const old=Object.values(ctx.state.coachMsgs)[0] as any;old.proposal.status='rejected';expect(swimReviewMessages(ctx,update())).toEqual([]);applyMessages(ctx,swimReviewMessages(ctx,update(25)));expect((Object.values(ctx.state.coachMsgs) as any[]).filter(m=>m.proposal.status==='open')).toHaveLength(1);expect(old.proposal.status).toBe('rejected');});
 test('korrigierte Daten lassen offene alte Vorschlaege nicht als aktuelle Fakten stehen',()=>{const ctx=setup();applyMessages(ctx,swimReviewMessages(ctx,update()));applyMessages(ctx,swimReviewMessages(ctx,null));expect((Object.values(ctx.state.coachMsgs) as any[]).every(m=>m.proposal.status==='superseded')).toBe(true);});
});

test('Analyseversion folgt Eingangsdaten statt Chat-Lesestatus',()=>{
 const ctx={today:'2026-10-27',now:1000,profile:defaultProfile(),goals:[],baseWeeks:[],planMeta:{},state:{sessions:{},customWorkouts:{},activities:{},adjustments:{},trend:[],illnessPeriods:[],settings:{},coachMsgs:{}}} as any;
 const first=analyze(ctx,'view');expect(first.inputVersion).toMatch(/^results-/);expect(first.modelVersion).toBe('analysis-v1');
 ctx.state.coachMsgs.a={id:'a',text:'gelesen',unread:false};expect(analyze(ctx,'view').inputVersion).toBe(first.inputVersion);
 ctx.state.trend=[{date:ctx.today,ctl:20,atl:30,tsb:-10}];expect(analyze(ctx,'view').inputVersion).not.toBe(first.inputVersion);
});

test('ueberholter Schwimmvorschlag wird bei erneut passendem Anlass reaktiviert',()=>{
 const ctx={today:'2026-10-27',now:1000,profile:{...defaultProfile(),skills:{swimCrawlM:400,swimPullM:50}},baseWeeks:[],state:{sessions:{},customWorkouts:{},activities:{},adjustments:{},coachMsgs:{},profile:{skills:{swimCrawlM:400,swimPullM:50}}}} as any;
 const update=(n:number)=>({reviewOnly:true,skills:{swimCrawlM:n,swimPullM:50},text:'SYNTHETIC Pruefvorschlag',adjustments:[]});
 const apply=(n:number)=>swimReviewMessages(ctx,update(n)).forEach(m=>ctx.state.coachMsgs[m.id]=m);
 apply(50);apply(100);apply(50);const open=Object.values(ctx.state.coachMsgs).filter((m:any)=>m.proposal.status==='open') as any[];expect(open).toHaveLength(1);expect(open[0].proposal.changes[0].data.skills.swimCrawlM).toBe(50);
});
