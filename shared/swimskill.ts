/* Schwimmen automatisch weiterstufen (Auftrag 9), für alle: Die Stufe richtet sich nach der längsten Strecke Kraul am Stück
   (Feld „längste Strecke Kraul am Stück“, Uhr, Kraul-Check oder Satz im Coach) und der Strecke mit Pull Buoy.
   25 m → 50 m → 100 m → 200 m → 400 m → Ausdauer-Kraul. Wer weiterkommt, bekommt sofort ALLE kommenden Schwimmeinheiten in der neuen
   Stufe (als Anpassung mit Rückgängig), nicht nur die der nächsten Woche. Zurückgestuft wird nie automatisch. */
import * as C from './core';
import * as W from './workouts';

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

/* Beste Strecken der letzten 6 Wochen aus erledigten Schwimmeinheiten (Felder oder Uhr) */
export function swimBests(state: any, weeks: any[], today: string): { crawl: number; pull: number } {
  let crawl = 0, pull = 0;
  const look = (st: any) => {
    if (!st || !st.completed) return;
    const m = st.metrics || {};
    const act = st.activityId ? (state.activities || {})[st.activityId] : null;
    crawl = Math.max(crawl, num(m.longestCrawl) || 0, (act && act.swim && act.swim.longestContinuousM) || 0);
    pull = Math.max(pull, num(m.longestPull) || 0);
  };
  C.planDays(weeks).filter((d: any) => d.date <= today && d.date > C.addDays(today, -42)).forEach((d: any) => d.sessions.filter((s: any) => s.sport === 'swim').forEach((s: any) => look((state.sessions || {})[s.id])));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]: any) => { if (d <= today && d > C.addDays(today, -42)) (l || []).forEach((c: any) => { if (c && c.sport === 'swim') look({ ...c, completed: true }); }); });
  return { crawl, pull };
}

/* Stufe aus den Strecken (Kraul-Weg; null = normales Schwimmen: ab 200 m am Stück, bei „kann kraulen“ ab 50 m) */
export function stageFor(crawlM: number, breast: boolean, canCrawl = false): { ladder: 'swim' | 'swimBreast'; n: number } | null {
  if (crawlM >= W.SWIM_NORMAL_M || (canCrawl && crawlM >= 50)) return null;
  if (crawlM <= 0) return breast ? { ladder: 'swimBreast', n: 0 } : { ladder: 'swim', n: 0 };
  return W.swimLadderStart({ swimCrawl: 'some', swimCrawlM: crawlM }) as any;
}

export interface SwimSkillUpdate { skills: { swimCrawlM: number; swimPullM?: number; swimCrawl: 'some' | 'yes' }; adjustments: any[]; text: string; stage: { ladder: string; n: number } | null }
/* Neue Bestwerte (aus Daten oder Coach) übernehmen: Können im Profil und alle kommenden Schwimmeinheiten neu stufen */
export function swimSkillUpdate(profile: any, weeks: any[], adjustments: any, today: string, best: { crawl?: number | null; pull?: number | null }, now = Date.now(), source = 'deine Werte'): SwimSkillUpdate | null {
  const sk = profile.skills || {};
  const crawl = Math.max(sk.swimCrawlM || 0, best.crawl || 0), pull = Math.max(sk.swimPullM || 0, best.pull || 0);
  if (crawl <= (sk.swimCrawlM || 0) && pull <= (sk.swimPullM || 0)) return null;
  const canCrawl = sk.swimCrawl === 'yes' || crawl >= W.SWIM_NORMAL_M;
  const stage = stageFor(crawl, !!sk.swimBreast, canCrawl);
  const repOld = W.swimRepMax(sk), repNew = W.swimRepMax({ swimCrawlM: crawl });
  const eff = C.applyAdjustments(weeks, adjustments || {});
  const adj: any[] = [];
  const g = 'swimstage-' + now;
  for (const d of C.planDays(eff)) {
    if (d.date <= today) continue;
    for (const s of d.sessions) {
      if (s.sport !== 'swim' || s.cancelled || (s.stage && s.stage.ladder === 'runwalk')) continue;
      const cur = s.stage;
      const ctx = (s.spec && s.spec.ctx) || {};
      const fill = (s.spec && s.spec.fillMin) || s.plannedMinutes || 45;
      let spec: W.Spec;
      if (!cur) {
        // normales Training: längere Stücke erst, wenn die Strecke am Stück eine Stufe weiter ist (Tests und Freiwasser bleiben)
        const k = s.spec && s.spec.kind;
        if (stage || repNew <= repOld || !['technique', 'endurance', 'css'].includes(k)) continue;
        spec = W.swimNormal(ctx, k, s.plannedMinutes || 45, 'base', repNew);
        if (s.spec && s.spec.why) spec.why = s.spec.why;
      } else {
        const sameOrHigher = stage && (stage.ladder === cur.ladder ? stage.n <= cur.n : stage.ladder === 'swimBreast');
        if (sameOrHigher && (cur.pull || 0) >= pull) continue;
        spec = stage ? W.swimLearn(ctx, { ladder: stage.ladder, n: sameOrHigher ? cur.n : stage.n, breast: !!sk.swimBreast, pull }, s.spec && s.spec.why, fill)
          : W.swimNormal(ctx, 'technique', fill, 'base', repNew);
      }
      const b = W.build(spec);
      adj.push({ id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set: { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, stage: b.stage || null, zone: b.zone },
        what: `${s.title} → ${b.title}`, reason: `Neue Bestwerte (${source}): ${crawl} m Kraul am Stück${pull ? `, ${pull} m mit Pull Buoy` : ''}` });
    }
  }
  const label = stage ? (stage.ladder === 'swimBreast' ? 'Brust und Kraul-Technik' : W.SWIM_LADDER[stage.n].label) : `normales Training mit Stücken bis ${repNew} m`;
  return { skills: { swimCrawlM: crawl, ...(pull ? { swimPullM: pull } : {}), swimCrawl: canCrawl ? 'yes' : 'some' }, adjustments: adj, stage,
    text: `Eingetragen: ${crawl} m Kraul am Stück${pull ? `, ${pull} m mit Pull Buoy` : ''}. Deine Schwimm-Stufe: ${label}.${adj.length ? ` ${adj.length} kommende Schwimmeinheiten sind angepasst.` : ''}${crawl >= 400 ? ' Ab jetzt gibt es CSS-Tests und Zonen nach Pace pro 100 m.' : ''}` };
}

/* Satz im Coach: „ich schaffe jetzt 100 m Kraul am Stück“, „50 m mit Pull Buoy“ */
export function parseSwimSkill(text: string): { crawl?: number; pull?: number } | null {
  const t = text.toLowerCase().replace(/ß/g, 'ss');
  if (!/kraul|freistil|pull|pullbuoy|pull-buoy|am stück|am stueck|durchschwimmen/.test(t)) return null;
  const out: { crawl?: number; pull?: number } = {};
  const re = /(\d{2,4})\s*(?:m|meter)\b([^.,;\d]{0,40})/g; let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = +m[1]; if (v < 10 || v > 5000) continue;
    const ctxAfter = m[2] || '';
    const before = t.slice(Math.max(0, m.index - 25), m.index);
    if (/pull/.test(ctxAfter) || /pull/.test(before)) out.pull = v; else out.crawl = v;
  }
  if (!out.crawl && !out.pull) return null;
  if (!/schaff|kann|geschafft|am st|durch|bin|komme|jetzt/.test(t)) return null;
  return out;
}
