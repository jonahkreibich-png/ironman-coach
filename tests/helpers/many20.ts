/* Auftrag 20, Punkt 3: großer Test mit Fokus auf Scores und realistische Dauer. Für jeden Test-Nutzer (fixtures/users20.ts):
   alles aus Auftrag 19 (Fragebogen → Plan → 3 Wochen → Verlängerung → alle Trainingsregeln, simulate19), dazu
   - Dauer: jede kommende Schwimmeinheit realistisch (Meter × eigenes Tempo + Pausen + Technik, etwa 18-55 m pro Minute) und jede Einheit
     so lang wie ihre Stücke samt Pausen;
   - Scores je Daten-Fall: einfache Rolle mit Fantasie-Tempo, Smart-Trainer, nur 1-2 Einheiten, Ausreißer, Pause, Test, Laufband,
     GPS-Fehler, ohne Puls, Wattmesser. */
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { simulate19, deviceActivities } from './many19';
import { sportScores } from '../../shared/scores';
import { mainGoal } from '../../shared/goals';
import { chosenSports } from '../../shared/sports';
import type { Activity } from '../../shared/activity/analyze';
import type { ManyUser20 } from '../../fixtures/users20';

export interface Finding20 { user: string; kind: string; msg: string }
const BAD_TEXT = /undefined|NaN|\[object|null min|Infinity/;

export function simulate20(u: ManyUser20, T0: string): { findings: Finding20[]; plan: any; stats: Record<string, number> } {
  const F: Finding20[] = []; const add = (kind: string, msg: string) => F.push({ user: u.id, kind, msg });
  const r = simulate19(u as any, T0);
  r.findings.forEach(f => add(f.kind, f.msg));
  const stats: Record<string, number> = { swims: 0, swimMin: 0, swimM: 0 };
  if (!r.plan) return { findings: F, plan: null, stats };
  const T3 = r.today; const profile = r.profile;
  // ---------- Dauer realistisch ----------
  for (const w of r.plan.weeks) for (const d of w.days) for (const s of d.sessions || []) {
    if (!s || !s.spec || d.date < T3 || s.race || s.fixed || s.cancelled) continue;
    const t = W.totals(s.spec);
    if (['run', 'bike', 'swim'].includes(s.sport) && Math.abs((s.plannedMinutes || 0) - t.min) > 3) add('Dauer', `${d.date} ${s.title}: ${s.plannedMinutes} min geplant, die Stücke mit Pausen ergeben ${t.min} min`);
    if (s.sport === 'swim') {
      const S = W.swimSums(s.spec); const mpm = S.meters / Math.max(1, s.plannedMinutes || S.min);
      stats.swims++; stats.swimMin += s.plannedMinutes || 0; stats.swimM += S.meters;
      if (S.meters >= 400 && (mpm < 18 || mpm > 55)) add('Dauer Schwimmen', `${d.date} ${s.title}: ${S.meters} m in ${s.plannedMinutes} min (${Math.round(mpm * 10) / 10} m/min)`);
      // Pausen nie mehr als die reine Schwimmzeit
      if (S.meters >= 400 && S.restMin > S.swimMin * 1.05 + 3) add('Dauer Schwimmen', `${d.date} ${s.title}: ${Math.round(S.restMin)} min Pause bei ${Math.round(S.swimMin)} min Schwimmen`);
    }
  }
  // ---------- Scores je Daten-Fall ----------
  try {
    const sp = (['swim', 'bike', 'run'] as const).filter(x => chosenSports(profile).includes(x));
    const g = mainGoal(r.goals, T3);
    let acts: Activity[] = deviceActivities(u as any, profile, C.addDays(T0, -56), C.addDays(T3, -1), r.state);
    const lthrR = profile.thresholds.lthrRun || 170, lthrB = profile.thresholds.lthrBike || 160;
    let n = 0; const mk = (sport: string, daysAgo: number, x: any): Activity => ({ id: `${u.id}-x${n++}`, sport, date: C.addDays(T3, -daysAgo), startMs: 0, source: 'healthfit', sources: ['healthfit'], laps: [], indoor: false, name: '', ...x } as any);
    const score = (list: Activity[], at = T3) => sportScores({ today: at, activities: list, trend: [], illness: [], profile, goal: g } as any, sp.length ? [...sp] : ['run']);
    const by = (list: any[], s: string) => list.find((x: any) => x.sport === s);
    const cs = u.case;
    if (cs === 'basicTrainer' && sp.includes('bike')) {
      const plain = [20, 16, 12, 8, 4, 1].map(d => mk('bike', d, { indoor: true, min: 60, avgHr: Math.round(lthrB * 0.77), name: 'Rolle locker' }));
      const fake = plain.map(a => ({ ...a, speedKmh: 36.4, km: 36.4, avgPower: 210 }));
      const a = by(score([...acts, ...plain]), 'bike'), b = by(score([...acts, ...fake]), 'bike');
      if (a.score !== b.score) add('Score Rolle', `Fantasie-Tempo der einfachen Rolle verändert den Rad-Score: ${a.score} → ${b.score}`);
      if (!/Rolle ohne Watt/.test(b.why.join(' '))) add('Score Rolle', 'Warum nennt die ignorierte Rolle nicht');
    }
    if (cs === 'smartTrainer' && sp.includes('bike')) {
      const ftp = profile.thresholds.ftp || 200;
      const rides = [24, 20, 16, 12, 8, 4].map(d => mk('bike', d, { indoor: true, min: 60, avgHr: Math.round(lthrB * 0.8), avgPower: Math.round(ftp * 0.62), name: 'Rolle Zone 2' }));
      const b = by(score([...acts, ...rides]), 'bike');
      if (b.parts[0].label !== 'FTP') add('Score Smart-Trainer', `Watt vom Smart-Trainer zählen nicht (${b.parts[0].label})`);
    }
    if (cs === 'few') {
      acts = acts.filter(a => a.date >= C.addDays(T3, -10)).filter((a, i, l) => l.filter(x => x.sport === a.sport).indexOf(a) < 2);
      for (const x of score(acts)) if (x.sport !== 'strength' && !x.provisional) add('Score wenig Daten', `${x.sport}: mit ${acts.filter(a => a.sport === x.sport).length} Einheiten nicht „vorläufig“`);
    }
    if (cs === 'outlier') {
      const base = score(acts);
      const out: Activity[] = [];
      if (sp.includes('run')) out.push(mk('run', 3, { min: 40, avgHr: Math.round(lthrR * 0.8), speedKmh: 16, km: 10.7 }));
      if (sp.includes('bike')) out.push(mk('bike', 3, { min: 60, avgHr: Math.round(lthrB * 0.75), speedKmh: 40, km: 40, bikeType: 'road' }));
      if (sp.includes('swim')) out.push(mk('swim', 3, { min: 40, km: 1.5, swim: { poolLengthM: 25, pace100: 75, longestContinuousM: 400, byStroke: {} } }));
      const o = score([...acts, ...out]);
      for (const x of o) { const a = by(base, x.sport); if (x.sport !== 'strength' && x.score - a.score > 3) add('Score Ausreißer', `${x.sport}: ein Ausreißer hebt den Score um ${x.score - a.score} (${a.score} → ${x.score})`); }
    }
    if (cs === 'pause') {
      const before = score(acts.filter(a => a.date < C.addDays(T3, -28)), C.addDays(T3, -28));
      const after = score(acts.filter(a => a.date < C.addDays(T3, -28)));
      for (const x of after) { const a = by(before, x.sport); if (x.sport !== 'strength' && (x.score > a.score || a.score - x.score > 6)) add('Score Pause', `${x.sport}: 4 Wochen Pause ${a.score} → ${x.score}`); }
    }
    if (cs === 'test' && sp.includes('run')) {
      // Test 10 % schneller als der aktuelle Wert: bewegt mehr als dieselbe Einheit ohne Test (die ist gedämpft bzw. auf ±3 pro Woche begrenzt)
      const base = by(score(acts), 'run');
      const v = 1000 / (base.parts[0].raw || 330) * 1.1 * 3.6;
      const one = (name: string) => mk('run', 2, { name, min: 30, avgHr: Math.round(lthrR * 1.0), speedKmh: Math.round(v * 10) / 10 });
      const t = by(score([...acts, one('Lauftest 30 min')]), 'run'), e = by(score([...acts, one('Lauf 30 min')]), 'run');
      if (t.score - base.score < 2 || t.score < e.score) add('Score Test', `ein 10 % besserer Lauftest bewegt den Score kaum (${base.score} → ${t.score}, ohne Test ${e.score})`);
      if (t.provisional) add('Score Test', 'nach einem Test noch „vorläufig“');
    }
    if (cs === 'treadmill' && sp.includes('run')) {
      const s = by(score(acts), 'run');
      if (acts.some(a => a.sport === 'run' && a.indoor && a.date > C.addDays(T3, -42)) && !/Laufband/.test(s.why.join(' ')) && s.why.some((w: string) => /Laufen: \d/.test(w))) add('Score Laufband', 'Warum nennt das Laufband nicht');
    }
    if (cs === 'gps') {
      const base = score(acts);
      const spikes: Activity[] = [];
      if (sp.includes('run')) spikes.push(mk('run', 2, { min: 40, avgHr: Math.round(lthrR * 0.85), speedKmh: 28, km: 18.7 }));
      if (sp.includes('bike')) spikes.push(mk('bike', 2, { min: 60, avgHr: Math.round(lthrB * 0.8), speedKmh: 64, km: 64, bikeType: 'road' }));
      const s2 = score([...acts, ...spikes]);
      for (const x of s2) { const a = by(base, x.sport); if ((x.sport === 'run' || x.sport === 'bike') && spikes.some(z => z.sport === x.sport) && x.score !== a.score) add('Score GPS', `${x.sport}: GPS-Fehler verändert den Score (${a.score} → ${x.score})`); }
    }
    if (cs === 'nohr') {
      // Manual device fixtures contain duration/distance/RPE but no recorded pace or power.
      // A displayed profile estimate is valid here; it must not claim measured certainty.
      for (const x of score(acts)) if (x.sport === 'run' || x.sport === 'bike') {
        if (!Number.isFinite(x.score)) add('Score ohne Puls', `${x.sport}: kein numerischer Schätzwert ohne Puls`);
        if (x.measured == null && (!x.provisional || x.confidence > 0.45 || x.range < 5 || !/Profil|Schätzung|geschätzt/i.test(x.confText))) {
          add('Score ohne Puls', `${x.sport}: unbelegte Schätzung ohne passende Unsicherheit oder Herkunft`);
        }
      }
      // Independently exercise usable no-HR evidence as well: known pace plus RPE must
      // update the performance estimate, rather than passing only on a profile prior.
      const knownPace: Activity[] = [];
      if (sp.includes('run')) knownPace.push(mk('run', 1, { min: 40, speedKmh: 10, km: 20 / 3, avgHr: null, rpe: 4 }));
      if (sp.includes('bike')) knownPace.push(mk('bike', 1, { min: 60, speedKmh: 25, km: 25, avgHr: null, avgPower: null, rpe: 4, bikeType: 'road' }));
      for (const x of score([...acts, ...knownPace])) if ((x.sport === 'run' || x.sport === 'bike') && (x.measured == null || !Number.isFinite(x.measured))) {
        add('Score ohne Puls', `${x.sport}: bekannte Pace und Belastungsgefühl liefern keinen belegten Wert ohne Puls`);
      }
    }
    // alle Fälle: gültige Werte, Bereich und „vorläufig“ passen zusammen, keine Sprünge im Verlauf
    for (const x of score(acts)) {
      if (!(Number.isFinite(x.score) && x.score >= 1 && x.score <= 120)) add('Score', `${x.sport}: ${x.score}`);
      if (x.provisional !== /vorläufig/.test(x.rangeText)) add('Score', `${x.sport}: vorläufig ${x.provisional}, Text „${x.rangeText}“`);
      if (x.provisional && x.range < 5) add('Score', `${x.sport}: vorläufig mit ± ${x.range}`);
      for (const t of [...x.why, x.confText]) if (BAD_TEXT.test(t)) add('Score-Text', `${x.sport}: ${t}`);
      // belegte Werte (nicht vorläufig): kein Sprung über 10 Punkte pro Woche; vorläufige Werte dürfen ihr Niveau finden (jede Einheit steht im Warum)
      if (x.sport !== 'strength' && !x.provisional) for (let i = 1; i < x.trend.length; i++) if (Math.abs(x.trend[i].score - x.trend[i - 1].score) > 10) add('Score-Sprung', `${x.sport}: ${x.trend[i - 1].score} → ${x.trend[i].score} in einer Woche`);
    }
  } catch (e: any) { add('Score', 'Fehler: ' + e.message); }
  return { findings: F, plan: r.plan, stats };
}
