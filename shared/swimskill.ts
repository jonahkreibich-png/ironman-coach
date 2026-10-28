/* Schwimmen automatisch weiterstufen (Auftrag 9), für alle: Die Stufe richtet sich nach der längsten Strecke Kraul am Stück
   (Feld „längste Strecke Kraul am Stück“, Uhr, Kraul-Check oder Satz im Coach) und der Strecke mit Pull Buoy.
   25 m → 50 m → 100 m → 200 m → 400 m → Ausdauer-Kraul. Wer weiterkommt, bekommt sofort ALLE kommenden Schwimmeinheiten in der neuen
   Stufe als Änderungsvorschlag, nicht nur die der nächsten Woche. Korrigierte oder gelöschte Ergebnisnachweise
   werden neu ausgewertet; eigene Profil- und Coachangaben bleiben erhalten. */
import * as C from './core';
import * as W from './workouts';
import * as K from './keysessions';
import { actualMetrics } from './results';
import { swimDistancesFromText } from './fields';
import type { Skills } from './profile';

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

/* Strecken der letzten 6 Wochen aus erledigten Schwimmeinheiten, nur tatsächlich eingetragene oder gemessene Werte (Auftrag 17).
   crawl/pull: bestätigt, also in mindestens 2 verschiedenen Einheiten geschafft (zählt fürs Können und die Stufe).
   best/bestPull: der beste Einzelwert (Bestmarke, aber noch keine neue Stufe). */
export function swimBests(state: any, weeks: any[], today: string): { crawl: number; pull: number; best: number; bestPull: number; n: number; authoritative: true } {
  const pr = C.swimProofs(state, weeks, today, 42);
  const crawls = pr.map((p: any) => p.crawl), pulls = pr.map((p: any) => p.pull);
  return { crawl: C.confirmedOf(crawls), pull: C.confirmedOf(pulls), best: Math.max(0, ...crawls.filter(Boolean)), bestPull: Math.max(0, ...pulls.filter(Boolean)), n: crawls.filter(Boolean).length, authoritative: true };
}

/* Auftrag 17: eigene Schwimm-Pace mit Pausen ins Profil, wenn sie sich deutlich (mehr als 10 %) ändert. Rückgabe: neuer Wert oder undefined. */
export function swimRateUpdate(profile: any, state: any, weeks: any[], today: string): number | null | undefined {
  const cur = num((profile.skills || {}).swimMPerMin);
  const rate = C.swimRate(state, weeks, today);
  if (rate == null) return undefined;
  if (cur && Math.abs(rate / cur - 1) <= 0.1) return undefined;
  return rate;
}

/* Auftrag 20: eigenes Tempo ohne Pausen (s/100 m) ins Profil, wenn es sich um mehr als 4 s ändert. Rückgabe: neuer Wert oder undefined. */
export function swimPaceUpdate(profile: any, state: any, weeks: any[], today: string): number | undefined {
  const cur = num((profile.skills || {}).swimPace100);
  const pace = C.swimPace100(state, weeks, today);
  if (pace == null || (cur && Math.abs(pace - cur) <= 4)) return undefined;
  return pace;
}

/* Coach-Text zur Anpassung an das eigene Tempo */
export function swimRateText(rate: number | null, pace: number | null): string {
  const mm = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const bits = [pace ? `Du schwimmst etwa ${mm(pace)} min pro 100 m (ohne Pausen)` : '', rate ? `${pace ? 'und ' : 'Du schwimmst '}im Schnitt etwa ${String(rate).replace('.', ',')} m pro Minute (mit Pausen)` : ''].filter(Boolean);
  return `${bits.join(' ')}. Die kommenden Schwimmeinheiten rechnen damit: Meter × dein Tempo je Lage, dazu die Pausen und die Technik.`;
}

/* Stufe aus den Strecken (Kraul-Weg; null = normales Schwimmen: ab 200 m am Stück, bei „kann kraulen“ ab 50 m) */
export function stageFor(crawlM: number, breast: boolean, canCrawl = false): { ladder: 'swim' | 'swimBreast'; n: number } | null {
  if (crawlM >= W.SWIM_NORMAL_M || (canCrawl && crawlM >= 50)) return null;
  if (crawlM <= 0) return breast ? { ladder: 'swimBreast', n: 0 } : { ladder: 'swim', n: 0 };
  return W.swimLadderStart({ swimCrawl: 'some', swimCrawlM: crawlM }) as any;
}

export interface SwimSkillUpdate { skills: Pick<Skills, 'swimCrawlM' | 'swimPullM' | 'swimCrawl' | 'swimEvidence'>; adjustments: any[]; text: string; stage: { ladder: string; n: number } | null; reviewOnly?: true }
/* Bestwerte oder vollständigen Ergebnis-Scan auswerten. Rückgabe enthält Profiländerungen und Planvorschläge, keine Mutation. */
export function swimSkillUpdate(profile: any, weeks: any[], adjustments: any, today: string, best: { crawl?: number | null; pull?: number | null; authoritative?: boolean }, now = Date.now(), source = 'deine Werte', state?: any): SwimSkillUpdate | null {
  const sk = profile.skills || {};
  const evidence: NonNullable<Skills['swimEvidence']> = JSON.parse(JSON.stringify(sk.swimEvidence || {}));
  const reconcile = (key: 'crawl' | 'pull', stored: any, incoming: any): number | null => {
    const current = num(stored), record = evidence[key], observed = num(incoming);
    if (!best.authoritative) {
      const next = Math.max(current || 0, observed || 0) || null;
      if (next !== current) evidence[key] = { value: next, baseline: next, manual: true };
      return next;
    }
    // Eine Profilkorrektur nach der letzten Ableitung gehoert der Person, nicht dem Scanner.
    if (record && (record.manual || current !== record.value)) {
      evidence[key] = { value: current, baseline: current, manual: true };
      return current;
    }
    const baseline = record ? record.baseline : current;
    const next = Math.max(baseline || 0, observed || 0) || null;
    if (record || next !== current) evidence[key] = { value: next, baseline };
    return next;
  };
  const crawlValue = reconcile('crawl', sk.swimCrawlM, best.crawl);
  const pullValue = reconcile('pull', sk.swimPullM, best.pull);
  const crawl = crawlValue || 0, pull = pullValue || 0;
  const storedMode = sk.swimCrawl || null;
  const modeRecord = evidence.mode;
  let mode: Skills['swimCrawl'] = storedMode;
  if (modeRecord && (modeRecord.manual || storedMode !== modeRecord.value)) {
    evidence.mode = { value: storedMode, baseline: storedMode, manual: true };
  } else {
    const baseline = modeRecord ? modeRecord.baseline : storedMode;
    // Auftrag 17: die Kraul-Art steigt nur mit echtem Nachweis, nie aus einer gespeicherten Zahl allein
    const seen = best.authoritative ? Math.min(crawl, num(best.crawl) || 0) : crawl;
    mode = seen >= W.SWIM_NORMAL_M ? 'yes' : seen > 0 ? (baseline === 'yes' ? 'yes' : 'some') : baseline;
    if (modeRecord || mode !== storedMode) evidence.mode = { value: mode, baseline };
  }
  if (!best.authoritative && crawlValue !== num(sk.swimCrawlM)) evidence.mode = { value: mode || null, baseline: mode || null, manual: true };
  const skillChanged = crawlValue !== num(sk.swimCrawlM) || pullValue !== num(sk.swimPullM) || mode !== storedMode;
  if (!skillChanged && JSON.stringify(evidence) === JSON.stringify(sk.swimEvidence || {})) return null;
  const canCrawl = mode === 'yes';
  const stage = stageFor(crawl, !!sk.swimBreast, canCrawl);
  const repOld = W.swimRepMax(sk), repNew = W.swimRepMax({ swimCrawlM: crawl });
  const manualSessions = new Set(C.activeAdjustments(adjustments || {}).filter((a: any) => a.from_user && (a.sessionId || a.session?.id)).map((a: any) => a.sessionId || a.session?.id));
  const eff = C.applyAdjustments(weeks, adjustments || {});
  const adj: any[] = [];
  const g = 'swimstage-' + now;
  for (const d of C.planDays(eff)) {
    if (!skillChanged) break;
    if (d.date <= today) continue;
    for (const s of d.sessions) {
      if (s.sport !== 'swim' || manualSessions.has(s.id) || s.cancelled || s.locked || s.fixed || s.pinned || s.frozen || s._done || s.completed || state?.sessions?.[s.id]?.completed || C.isTestOrRace(s) || s.spec?.kind === 'openwater' || (s.stage && s.stage.ladder === 'runwalk')) continue;
      const cur = s.stage;
      const ctx: W.PaceCtx = { ...((s.spec && s.spec.ctx) || {}),
        gear: Array.isArray(sk.swimGear) ? [...sk.swimGear] : [], pool: sk.poolM === 50 ? 50 : 25 };
      const fill = (s.spec && s.spec.fillMin) || s.plannedMinutes || 45;
      let spec: W.Spec;
      if (!cur) {
        // normales Training: längere Stücke erst, wenn die Strecke am Stück eine Stufe weiter ist (Tests und Freiwasser bleiben)
        const k = s.spec && s.spec.kind;
        if (!['technique', 'endurance', 'css', ...(best.authoritative ? ['openwater'] : [])].includes(k)) continue;
        if (!best.authoritative && (stage || repNew <= repOld)) continue;
        spec = stage ? W.swimLearn(ctx, { ...stage, breast: !!sk.swimBreast, pull }, s.spec && s.spec.why, fill)
          : W.swimNormal(ctx, k === 'openwater' ? 'endurance' : k, s.plannedMinutes || 45, 'base', repNew);
        if (s.spec && s.spec.why) spec.why = s.spec.why;
      } else {
        const sameOrHigher = stage && (stage.ladder === cur.ladder ? stage.n <= cur.n : stage.ladder === 'swimBreast');
        if (!best.authoritative && sameOrHigher && (cur.pull || 0) >= pull) continue;
        spec = stage ? W.swimLearn(ctx, { ladder: stage.ladder, n: !best.authoritative && sameOrHigher ? cur.n : stage.n, breast: !!sk.swimBreast, pull }, s.spec && s.spec.why, fill)
          : W.swimNormal(ctx, 'technique', fill, 'base', repNew);
      }
      // Auftrag 17: Schwerpunkt der Einheit bleibt, Hilfsmittel nach der aktuellen Ausrüstung (Kickbrett, Pull Buoy …)
      spec = K.swimVariant(spec, K.swimFocusIndex(s.spec && s.spec.variant, ctx.gear, spec.stage), 1, 'base');
      spec = K.fitSwim(spec, fill);
      const b = W.build(spec);
      adj.push({ id: `${g}-${s.id}`, group: g, type: 'modify', sessionId: s.id, set: { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, stage: b.stage || null, zone: b.zone },
        what: `${s.title} → ${b.title}`, reason: `${best.authoritative ? 'Aktualisierte Schwimmnachweise' : 'Neue Bestwerte'} (${source}): ${crawl} m Kraul am Stück${pull ? `, ${pull} m mit Pull Buoy` : ''}` });
    }
  }
  const label = stage ? (stage.ladder === 'swimBreast' ? 'Brust und Kraul-Technik' : W.SWIM_LADDER[stage.n].label) : `normales Training mit Stücken bis ${repNew} m`;
  // Auftrag 17: klar sagen, was passiert ist (Korrektur nach geänderten Werten, neue Stufe nach 2 Einheiten, eigene Angabe)
  const old = num(sk.swimCrawlM) || 0;
  const head = !best.authoritative ? (crawl ? `Deine Angabe: ${crawl} m Kraul am Stück` : 'Keine Kraulstrecke am Stück eingetragen')
    : crawl < old ? (crawl ? `Korrigiert: Kraul am Stück jetzt ${crawl} m statt ${old} m (nach deinen geänderten Werten)` : `Korrigiert: keine bestätigte Strecke Kraul am Stück mehr (vorher ${old} m)`)
    : crawl > old ? `Neu bestätigt: ${crawl} m Kraul am Stück (in 2 Einheiten geschafft)`
    : crawl ? `Bestätigt: ${crawl} m Kraul am Stück` : 'Noch keine bestätigte Strecke Kraul am Stück';
  return { skills: { swimCrawlM: crawlValue, swimPullM: pullValue, swimCrawl: mode, swimEvidence: evidence }, adjustments: adj, stage,
    text: `${head}${pull ? `, ${pull} m mit Pull Buoy` : ''}. Deine Schwimm-Stufe: ${label}.${adj.length ? ` ${adj.length} kommende Schwimmeinheiten sind angepasst (rückgängig machbar).` : ''}${crawl >= 400 ? ' Ab jetzt gibt es CSS-Tests und Zonen nach Pace pro 100 m.' : ''}` };
}

/* Alte Profilwerte haben keine sichere Herkunft. Niedrigere echte Ergebnisse sind deshalb nur ein Pruefvorschlag.
   Weder das Profil noch der bestehende Plan werden hier veraendert; Uebernahme erst nach Zustimmung. */
export function legacySwimReview(profile: any, weeks: any[], adjustments: any, today: string,
  best: { crawl?: number | null; pull?: number | null; authoritative?: boolean }, now = Date.now(), state?: any): SwimSkillUpdate | null {
  const sk = profile.skills || {};
  const current = num(sk.swimCrawlM), observed = num(best.crawl);
  if (sk.swimEvidence || !best.authoritative || !current || !observed || observed >= current) return null;
  // Nur fuer den Vorschlag behandeln wir die alte Zahl als unbestaetigte Ableitung.
  const candidateProfile = { ...profile, skills: { ...sk,
    swimEvidence: { crawl: { value: current, baseline: null } } } };
  const update = swimSkillUpdate(candidateProfile, weeks, adjustments, today, best, now, 'geprüfte Ergebnisse', state);
  if (!update) return null;
  return { ...update, reviewOnly: true,
    text: `Bitte prüfen: Im Profil stehen ${current} m Kraul am Stück; die aktuellen Ergebnisse belegen höchstens ${observed} m. Die Herkunft der alten Angabe ist unklar. Vorschlag: ${observed} m und passende künftige Schwimmeinheiten übernehmen. Erst deine Zustimmung ändert Profil und Plan.` };
}

/* Satz im Coach: „ich schaffe jetzt 100 m Kraul am Stück“, „50 m mit Pull Buoy“ */
export function parseSwimSkill(text: string): { crawl?: number; pull?: number } | null {
  if (/\?|\b(?:nicht|kein\w*|geplant|plan|soll\w*|möchte|moechte|will|würde|wuerde|könnte|koennte)\b/i.test(text)) return null;
  const t = text.toLowerCase().replace(/ß/g, 'ss');
  if (!/kraul|freistil|pull|pullbuoy|pull-buoy|am stück|am stueck|durchschwimmen/.test(t)) return null;
  const out = swimDistancesFromText(t);
  if (!out.crawl && !out.pull) return null;
  if (!/schaff|kann|geschafft|am st|durch|bin|komme|jetzt/.test(t)) return null;
  return out;
}
