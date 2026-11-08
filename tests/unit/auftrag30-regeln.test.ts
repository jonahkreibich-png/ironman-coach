/* Auftrag 30, Punkt 7: Trainingswissen ergänzt – Erholungstiefe, Rhythmus, Kraft je Phase/Alter, Schwimm-Intensität, Teamsport-Belastung,
   Wettkampf-Bedingungen, persönliche Reaktion, „härter als geplant“ wirkt auf den nächsten Tag. Mit echten Plänen der Test-Personen. */
import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { applyOnboarding } from '../../shared/onboarding';
import { generatePlan } from '../../shared/plangen';
import { checkTrainingRules, addRaceConditions } from '../../shared/trainingrules';
import { swimFast, sessionMarks } from '../../shared/intensity';
import { personalResponse } from '../../shared/response';
import { world } from '../helpers/chat-world';

const gen = (id: string, patch: (p: any) => void = () => {}) => {
  const per = PERSONAS.find(x => x.id === id)!; const r = applyOnboarding(per.answers, PERSONA_TODAY);
  const profile = JSON.parse(JSON.stringify(r.profile)); patch(profile);
  return { profile, goals: r.goals, plan: generatePlan({ profile, goals: r.goals, today: PERSONA_TODAY }).plan };
};
const own = (w: any) => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && !s.fixed && !s.race && s.sport !== 'football').reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
function recoveryRatios(weeks: any[]) {
  const out: number[] = [];
  weeks.forEach((w: any, i: number) => { if (!w.isRecoveryWeek || i === 0 || w.partial) return; let j = i - 1; while (j >= 0 && (weeks[j].isRecoveryWeek || weeks[j].phase === 'taper' || weeks[j].phase === 'race' || weeks[j].entry)) j--; const raceNear = [w, weeks[i - 1]].some((x: any) => x && ((x.races || []).length || x.days.some((d: any) => d.sessions.some((s: any) => s && s.race)))); if (j >= 0 && own(weeks[j]) >= 120 && !raceNear) out.push(own(w) / own(weeks[j])); });
  return out;
}
const ALL = PERSONAS.map(p => p.id);

describe('Erholungswoche etwa 60–70 % der Aufbauwoche (alle Test-Personen)', () => {
  for (const id of ALL) test(id, () => {
    const { plan, profile, goals } = gen(id);
    const r = recoveryRatios(plan.weeks);
    for (const x of r) { expect(x, `${id}: ${Math.round(x * 100)} %`).toBeGreaterThanOrEqual(0.5); expect(x, `${id}: ${Math.round(x * 100)} %`).toBeLessThanOrEqual(0.78); }
    expect(checkTrainingRules(plan.weeks, profile, { goals, today: PERSONA_TODAY }).filter(i => i.rule === 'recoveryDepth')).toEqual([]);
  });
});

describe('Rhythmus nach Person: Einsteiger 2+1, sonst 3+1', () => {
  // Abstand zwischen Erholungswochen, nur innerhalb eines Blocks (kein Tapering/Rennen dazwischen)
  const gap = (weeks: any[]) => { const idx = weeks.map((w: any, i: number) => w.isRecoveryWeek && w.phase !== 'race' && w.phase !== 'taper' ? i : -1).filter(i => i >= 0); return idx.slice(1).map((v, k) => weeks.slice(idx[k], v).some((w: any) => w.phase === 'taper' || w.phase === 'race') ? 99 : v - idx[k]); };
  test('Einsteiger: Erholungswoche jede 3. Woche', () => {
    const { plan } = gen('einsteiger-sprint');
    expect(gap(plan.weeks).filter(g => g < 6).every(g => g <= 3)).toBe(true);
  });
  test('erfahren: 3+1', () => {
    const { plan } = gen('erfahren-md-marathon');
    expect(gap(plan.weeks).filter(g => g < 6).some(g => g === 4)).toBe(true);
  });
  test('langsame Erholung laut eigenen Daten → 2+1, tiefere Erholung, vorsichtig steigern', () => {
    const per = PERSONAS.find(x => x.id === 'erfahren-md-marathon')!; const r = applyOnboarding(per.answers, PERSONA_TODAY);
    const resp: any = { recovery: 'slow', buildWeeks: 2, depth: [0.55, 0.65], incMax: 6, longTaper: true, n: 3, text: '' };
    const plan = generatePlan({ profile: r.profile, goals: r.goals, today: PERSONA_TODAY, response: resp }).plan;
    expect(gap(plan.weeks).filter(g => g < 6).every(g => g <= 3)).toBe(true);
    for (const x of recoveryRatios(plan.weeks)) expect(x).toBeLessThanOrEqual(0.7);
  });
});

describe('Kraft je Phase und Alter', () => {
  const strengthByPhase = (weeks: any[]) => { const m: Record<string, number[]> = {}; weeks.filter((w: any) => !w.isRecoveryWeek && !w.partial).forEach((w: any) => { (m[w.phase] = m[w.phase] || []).push(w.days.flatMap((d: any) => d.sessions).filter((s: any) => s.sport === 'strength' && !s.cancelled).length); }); return m; };
  test('Grundlage 2× (wer Kraft mit bis zu 2× gewählt hat), spezifisch höchstens 2×', () => {
    for (const id of ALL) {
      const { plan, profile } = gen(id); if (!(profile.sports || []).includes('strength') || profile.strengthPlan) continue;
      const m = strengthByPhase(plan.weeks); const f = (profile.freq || {}).strength;
      if (m.base && (!f || f[1] >= 2)) expect(Math.max(...m.base), id).toBeGreaterThanOrEqual(2);
      if (m.specific) expect(Math.max(...m.specific), id).toBeLessThanOrEqual(2);
    }
  });
  test('ab 50 mehr Kraft im Aufbau', () => {
    const { plan } = gen('erfahren-md-marathon', p => { p.birthYear = 1968; p.sports = [...new Set([...(p.sports || []), 'strength'])]; p.freq = { ...(p.freq || {}), strength: [1, 3] }; });
    const m = strengthByPhase(plan.weeks);
    if (m.build) expect(Math.max(...m.build)).toBeGreaterThanOrEqual(2);
  });
});

describe('Schwimm-Intensität sichtbar (⚡)', () => {
  test('kurze schnelle Stücke zählen als ⚡', () => {
    expect(swimFast({ sport: 'swim', spec: { lib: { key: 'swim.fast' }, steps: [] } })).toBe(true);
    expect(sessionMarks({ sport: 'swim', title: 'Schwimmen', spec: { steps: [{ part: 'main', reps: 8, m: 25, zone: 3, mode: 'crawl' }] } })).toContain('hard');
    expect(swimFast({ sport: 'swim', spec: { steps: [{ part: 'main', reps: 4, m: 50, zone: 2, mode: 'drill' }] } })).toBe(false);
  });
  test('Triathlon-Pläne: in normalen Wochen mit 2 Schwimmeinheiten eine mit ⚡', () => {
    const { plan } = gen('olympisch-erfahren');
    const ws = plan.weeks.filter((w: any) => !w.isRecoveryWeek && !w.partial && w.phase !== 'race' && w.phase !== 'taper');
    const withSwim2 = ws.filter((w: any) => w.days.flatMap((d: any) => d.sessions).filter((s: any) => s.sport === 'swim' && !s.cancelled).length >= 2);
    expect(withSwim2.filter((w: any) => w.days.flatMap((d: any) => d.sessions).some(swimFast)).length).toBeGreaterThanOrEqual(Math.floor(withSwim2.length * 0.6));
  });
});

describe('Teamsport-Belastung aus Dauer, Puls bzw. RPE', () => {
  test('Spiel > Training, Turnier höher; mit RPE zählt die Anstrengung', () => {
    const tr = C.sessionLoad({ sport: 'football', title: 'Fußball-Training', plannedMinutes: 90 }, { completed: true, metrics: { min: '90' } });
    const game = C.sessionLoad({ sport: 'football', title: 'Fußball: Spiel', plannedMinutes: 90 }, { completed: true, metrics: { min: '90' } });
    const tour = C.sessionLoad({ sport: 'football', title: 'Fußball: Turnier', plannedMinutes: 90 }, { completed: true, metrics: { min: '90' } });
    expect(game).toBeGreaterThan(tr); expect(tour).toBeGreaterThan(game);
    expect(C.sessionLoad({ sport: 'football', title: 'Fußball-Training', plannedMinutes: 90 }, { completed: true, rpe: '9', metrics: { min: '90' } })).toBeGreaterThan(tr);
    expect(C.sessionLoad({ sport: 'football', title: 'Fußball-Training', plannedMinutes: 90 }, { completed: true, metrics: { min: '45' } })).toBeLessThan(tr);
  });
});

describe('Wettkampf-Bedingungen: Hitze, Freiwasser, Streckenprofil, Uhrzeit', () => {
  test('alle vier werden an lockeren Einheiten vor dem Rennen eingeplant', () => {
    const { plan, goals } = gen('olympisch-erfahren');
    const A = goals.find((g: any) => g.priority === 'A' && g.date)!;
    const g2 = goals.map((g: any) => g.id === A.id ? { ...g, course: { tempC: 30, swimVenue: 'open', wetsuit: true, bikeAscentM: 900, runAscentM: 200, startTime: '7:30' } } : g);
    const weeks = JSON.parse(JSON.stringify(plan.weeks));
    const fixes = addRaceConditions(weeks, { goals: g2 as any });
    const all = weeks.flatMap((w: any) => w.days.map((d: any) => ({ d, w }))).flatMap(({ d }: any) => d.sessions.map((s: any) => ({ s, date: d.date })));
    const before = (n: number) => all.filter(x => C.addDays(x.date, n) >= A.date! && x.date < A.date!);
    expect(before(17).some(x => x.s.heat)).toBe(true);
    if (+A.date!.slice(5, 7) >= 5 && +A.date!.slice(5, 7) <= 10) expect(before(43).some(x => x.s.openWater && /Neopren/.test(x.s.description))).toBe(true);
    expect(all.some(x => x.s.raceTime && x.s.time === '07:30')).toBe(true);
    expect(fixes.length).toBeGreaterThan(0);
    // nie an harten Einheiten, Tests oder Wettkämpfen
    for (const x of all.filter(y => y.s.heat || y.s.openWater || y.s.hilly)) { expect(x.s.race).toBeFalsy(); expect(/test/i.test(x.s.title)).toBe(false); }
  });
});

describe('„Härter als geplant“ fließt in den nächsten Tag ein (nie zwei harte Tage)', () => {
  test('locker geplant, Zone 5 gemacht → harte Einheit am nächsten Tag wird Zone 2', () => {
    const W = world('olympisch-erfahren');
    const days = W.days();
    const pair = days.map((d: any, i: number) => ({ d, nx: days[i + 1] })).find((x: any) => x.nx && x.d.date >= W.today && x.d.sessions.some((s: any) => !C.isHard(s) && ['run', 'bike'].includes(s.sport)) && x.nx.sessions.some((s: any) => C.isHard(s) && !C.isTestOrRace(s) && !C.isGame(s)));
    if (!pair) return;
    const easy = pair.d.sessions.find((s: any) => !C.isHard(s) && ['run', 'bike'].includes(s.sport));
    const W2 = world('olympisch-erfahren', pair.nx.date);
    W2.state.sessions[easy.id] = { completed: true, metrics: { min: '50' }, asPlanned: false, changed: { kind: 'harder', zone: 5 } };
    const adj = C.dailyAdjustments(W2.state, W2.plan.weeks, pair.nx.date, {});
    const h = adj.filter((a: any) => /^harder-/.test(a.id));
    expect(h.length).toBeGreaterThan(0);
    expect(h[0].set.title).toMatch(/^Zone 2 statt: /);
    // so wie geplant: nichts
    W2.state.sessions[easy.id] = { completed: true, metrics: { min: '50' }, asPlanned: true };
    expect(C.dailyAdjustments(W2.state, W2.plan.weeks, pair.nx.date, {}).filter((a: any) => /^harder-/.test(a.id))).toEqual([]);
  });
});

describe('Persönliche Reaktion lernen', () => {
  const mk = (slow: boolean) => {
    const W = world('erfahren-md-marathon', '2027-01-20');
    const weeks = W.plan.weeks; const days = C.planDays(weeks).filter((d: any) => d.date < '2027-01-20');
    days.forEach((d: any) => d.sessions.forEach((s: any) => { if (s.sport !== 'rest') W.state.sessions[s.id] = { completed: true, rpe: slow ? '6' : '4', metrics: { min: String(s.plannedMinutes || 40), hr: '140' } }; }));
    // Morgenwerte: nach harten Wochen (Montag) HFV deutlich runter, Ruhepuls hoch – bei „langsam“
    const trend: any[] = [];
    for (let d = '2026-10-01'; d < '2027-01-20'; d = C.addDays(d, 1)) { const dow = new Date(d + 'T12:00:00Z').getUTCDay(); const tired = slow && (dow === 1 || dow === 2 || dow === 3); trend.push({ date: d, hrv: tired ? 38 : 60 + (dow % 3), restingHR: tired ? 56 : 48 }); }
    W.state.trend = trend;
    return personalResponse(W.state, weeks, '2027-01-20');
  };
  test('ohne Daten keine Anpassung', () => { const W = world('erfahren-md-marathon'); expect(personalResponse(W.state, W.plan.weeks, W.today).recovery).toBeNull(); });
  test('langsam vs. schnell aus den eigenen Werten', () => {
    const s = mk(true), f = mk(false);
    if (s.n >= 2) { expect(s.recovery).toBe('slow'); expect(s.buildWeeks).toBe(2); expect(s.text).toMatch(/2\+1/); }
    if (f.n >= 2) expect(f.recovery).not.toBe('slow');
  });
});
