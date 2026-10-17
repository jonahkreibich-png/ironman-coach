// Auswertung Intensität (Auftrag 14), nur mit AUDIT=1: Tabelle je Person (Qualitätseinheiten je Sportart und Phase, locker/hart, Fehler).
import { test } from 'vitest';
import fs from 'node:fs';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { NEW_USERS, NEWUSER_TODAY } from '../../fixtures/newusers';
import { randomUsers, RANDOM_TODAY } from '../../fixtures/randomusers';
import { patternPlan, profile as patProfile } from '../../fixtures/pattern-person';
import { applyOnboarding } from '../../shared/onboarding';
import { generatePlan } from '../../shared/plangen';
import { intensityStats, checkIntensity } from '../../shared/intensity';
import { withEstimates } from '../../shared/profile';

test.skipIf(!process.env.AUDIT)('Auswertung Intensität', async () => {
  const rows: [string, string, any[], any, string, any?][] = [];
  for (const p of PERSONAS) { const r = applyOnboarding(p.answers, PERSONA_TODAY); rows.push([p.id, p.label, r.gen!.plan.weeks, r.profile, PERSONA_TODAY, r.gen!.plan.meta.intensityOpts]); }
  for (const p of NEW_USERS) { const r = applyOnboarding(p.answers, NEWUSER_TODAY); rows.push([p.id, p.label, r.gen!.plan.weeks, r.profile, NEWUSER_TODAY, r.gen!.plan.meta.intensityOpts]); }
  for (const p of randomUsers()) { const r = applyOnboarding(p.answers, RANDOM_TODAY); rows.push([p.id, p.label, r.gen!.plan.weeks, r.profile, RANDOM_TODAY, r.gen!.plan.meta.intensityOpts]); }
  { const r = patternPlan(true); rows.push(['fester-wochenaufbau', 'Test-Person mit festem Wochenaufbau', r.plan.weeks.filter((w: any) => w.startDate >= '2026-10-19'), patProfile, '2026-10-14']); }
  if (fs.existsSync('scratch/prod.sqlite')) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('scratch/prod.sqlite');
    for (const [uid, name] of [[1, 'Jonah'], [2, 'Papa']] as const) {
      const prof = withEstimates(JSON.parse((db.prepare('SELECT data FROM records WHERE user_id=? AND kind=\'profile\' AND deleted=0').get(uid) as any).data), '2026-10-17');
      const goals = (db.prepare('SELECT data FROM records WHERE user_id=? AND kind=\'goal\' AND deleted=0').all(uid) as any[]).map(x => JSON.parse(x.data));
      const g = generatePlan({ profile: prof, goals, today: '2026-10-17', from: '2026-10-19', maxWeeks: 40 });
      rows.push([name.toLowerCase(), name + ' (echte Daten, neu berechnet)', g.plan.weeks, prof, '2026-10-17', g.plan.meta.intensityOpts]);
    }
  }
  const PH = ['base', 'build', 'specific', 'taper'];
  const lines: string[] = [];
  for (const [id, label, weeks, prof, today, io] of rows) {
    const st = intensityStats(weeks, prof);
    const iss = checkIntensity(weeks, prof, today, io || {});
    const cell = (ph: string) => { const B = st.byPhase[ph]; if (!B) return '–'; return ['swim', 'bike', 'run'].filter(s => B[s]).map(s => `${{ swim: 'S', bike: 'R', run: 'L' }[s]} ${B[s].hard}/${B[s].light}`).join(', ') || '–'; };
    lines.push(`| ${id} | ${st.level} | ${PH.map(cell).join(' | ')} | ${Math.round(st.easyShare * 100)} % | ${iss.length} |`);
    if (process.env.AUDIT === '2') { console.log(id, label); iss.slice(0, 12).forEach(i => console.log('   ', i.rule, i.msg)); }
  }
  console.log(['| Person | Niveau | Grundlage | Aufbau | Spezifisch | Tapering | locker | Fehler |', '|---|---|---|---|---|---|---|---|', ...lines].join('\n'));
}, 600000);
