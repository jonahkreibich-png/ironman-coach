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
import { paceCtx } from './plangen';

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

/* Strecken der letzten 6 Wochen aus erledigten Schwimmeinheiten, nur tatsächlich eingetragene oder gemessene Werte (Auftrag 17).
   crawl/pull: bestätigt, also in mindestens 2 verschiedenen Einheiten geschafft (zählt fürs Können und die Stufe).
   best/bestPull: der beste Einzelwert (Bestmarke, aber noch keine neue Stufe). */
export interface SwimBests { crawl: number; pull: number; best: number; bestPull: number; n: number; authoritative: true;
  /** Auftrag 21: alle Einzelwerte und das Datum des Bestwerts, gleich für Kraul und Pull Buoy */
  crawls: number[]; pulls: number[]; bestDate: string | null; bestPullDate: string | null; proofs: { date: string; crawl: number | null; pull: number | null }[] }
export function swimBests(state: any, weeks: any[], today: string): SwimBests {
  const pr = C.swimProofs(state, weeks, today, 42);
  const vals = (k: 'crawl' | 'pull') => pr.map((p: any) => p[k]).filter((v: any) => v != null && v > 0) as number[];
  const bestOf = (k: 'crawl' | 'pull') => { const v = vals(k); const b = Math.max(0, ...v); const p = b ? [...pr].reverse().find((x: any) => x[k] === b) : null; return { b, d: p ? p.date : null }; };
  const c = bestOf('crawl'), p = bestOf('pull');
  return { crawl: C.confirmedOf(vals('crawl')), pull: C.confirmedOf(vals('pull')), best: c.b, bestPull: p.b, n: vals('crawl').length, authoritative: true,
    crawls: vals('crawl'), pulls: vals('pull'), bestDate: c.d, bestPullDate: p.d, proofs: pr.map((x: any) => ({ date: x.date, crawl: x.crawl || null, pull: x.pull || null })) };
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

/* Auftrag 21: Tempo je Lage ins Profil, wenn es sich um mehr als 4 s ändert. Rückgabe: geänderte Felder oder undefined. */
export function swimStrokeUpdate(profile: any, state: any, weeks: any[], today: string): { swimPaceCrawl?: number; swimPaceBreast?: number } | undefined {
  const sk = profile.skills || {}; const r = C.swimStrokePaces(state, weeks, today); const out: any = {};
  if (r.crawl && !(num(sk.swimPaceCrawl) && Math.abs(r.crawl - num(sk.swimPaceCrawl)!) <= 4)) out.swimPaceCrawl = r.crawl;
  if (r.breast && !(num(sk.swimPaceBreast) && Math.abs(r.breast - num(sk.swimPaceBreast)!) <= 4)) out.swimPaceBreast = r.breast;
  return Object.keys(out).length ? out : undefined;
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

export interface SwimSkillUpdate { skills: Pick<Skills, 'swimCrawlM' | 'swimPullM' | 'swimCrawl' | 'swimEvidence'>; adjustments: any[]; text: string; stage: { ladder: string; n: number } | null; reviewOnly?: true;
  /** Auftrag 21: nur der interne Nachweis-Stand hat sich geändert (keine Meldung) */ silent?: true;
  /** Auftrag 21: feste Kennung des Anlasses (dieselbe Meldung in App und Server, nie doppelt) */ key: string }
const dm = (d: string | null | undefined) => d ? `${d.slice(8)}.${d.slice(5, 7)}.` : '';
/* Auftrag 21: eine Regel für Kraul und Pull Buoy. Bestätigt = zwei Nachweise: zwei Einheiten oder deine eigene Angabe plus eine Einheit.
   Ein einzelner neuer Wert ist ein Bestwert (wird gemeldet), zählt aber erst mit dem zweiten Nachweis für Stufe und Stücklänge. */
function phrase(label: string, value: number, own: number | null, vals: number[], best: number, bestDate: string | null, old = value): string {
  const confirmed = C.confirmedOf(vals);
  const twice = confirmed >= value && value > 0;
  const ownToo = own != null && own >= value && vals.some(v => v >= value);
  const src = !value ? '' : twice ? ' (in 2 Einheiten geschafft)' : ownToo ? ' (deine Angabe, in einer Einheit bestätigt)' : own != null && own >= value ? ' (deine Angabe)' : '';
  const head = value ? (value > old ? `Neu bestätigt: ${value} m ${label.replace(/^Mit /, "mit ")}${src}` : `${label}: ${value} m${src}`) : `${label}: noch nichts bestätigt`;
  const more = best > value ? `; am ${dm(bestDate)} ${best} m geschafft (Bestwert) – zählt für deine Stufe, sobald du es ein zweites Mal schaffst` : '';
  return head + more;
}
/* Bestwerte oder vollständigen Ergebnis-Scan auswerten. Rückgabe enthält Profiländerungen und Planvorschläge, keine Mutation. */
export function swimSkillUpdate(profile: any, weeks: any[], adjustments: any, today: string, best: { crawl?: number | null; pull?: number | null; authoritative?: boolean; crawls?: number[]; pulls?: number[]; best?: number; bestPull?: number; bestDate?: string | null; bestPullDate?: string | null; proofs?: { date: string; crawl: number | null; pull: number | null }[] }, now = Date.now(), source = 'deine Werte', state?: any): SwimSkillUpdate | null {
  const sk = profile.skills || {};
  const evidence: NonNullable<Skills['swimEvidence']> = JSON.parse(JSON.stringify(sk.swimEvidence || {}));
  // Auftrag 21: Kraul und Pull Buoy laufen durch denselben Weg. Vorher blieb eine eigene Angabe für immer stehen, auch wenn spätere
  // Einheiten mehr belegten, und eine einzelne neue Bestmarke wurde nicht gemeldet.
  const reconcile = (key: 'crawl' | 'pull', stored: any, incoming: any): number | null => {
    const current = num(stored), record: any = evidence[key], observed = num(incoming);
    if (!best.authoritative) {
      const next = Math.max(current || 0, observed || 0) || null;
      if (next !== current) evidence[key] = { value: next, baseline: next, manual: true, at: today } as any;
      return next;
    }
    // Eine eigene Angabe (Coach, Profil, Korrektur) gilt, bis Einheiten NACH der Angabe mehr belegen: die Angabe zählt dabei als ein
    // Nachweis, eine spätere Einheit als der zweite (vorher blieb sie für immer stehen, auch wenn später mehr geschwommen wurde).
    if (record && (record.manual || current !== record.value)) {
      const own = current || 0;
      const at = record.manual && record.value === current && record.at ? String(record.at) : today;
      const later = (best.proofs || []).filter(p => p.date > at).map(p => (p as any)[key] || 0).filter((v: number) => v > 0);
      const next = Math.max(own, later.length ? C.confirmedOf([...later, own]) : 0) || null;
      evidence[key] = next !== (current || null) ? { value: next, baseline: record.baseline ?? null } : { value: current, baseline: current, manual: true, at } as any;
      return next;
    }
    const baseline = record ? record.baseline : current;
    const next = Math.max(baseline || 0, observed || 0) || null;
    if (record || next !== current) evidence[key] = { value: next, baseline };
    return next;
  };
  const crawlValue = reconcile('crawl', sk.swimCrawlM, best.crawl);
  const pullValue = reconcile('pull', sk.swimPullM, best.pull);
  // Auftrag 21: neuer Bestwert (einmal geschafft) wird einmal gemeldet, gleich für Kraul und Pull Buoy
  const bestC = best.authoritative ? best.best || 0 : 0, bestP = best.authoritative ? best.bestPull || 0 : 0;
  const prevBest = (evidence as any).best || {};
  const newBest = (bestC > (crawlValue || 0) && bestC > (prevBest.crawl || 0)) || (bestP > (pullValue || 0) && bestP > (prevBest.pull || 0));
  if (best.authoritative && (bestC !== (prevBest.crawl || 0) || bestP !== (prevBest.pull || 0)) && (bestC || bestP || (evidence as any).best)) (evidence as any).best = { crawl: bestC, pull: bestP };
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
  const key = 'swim-' + C.hashOf(JSON.stringify([crawlValue, pullValue, mode, bestC, bestP]));
  if (!skillChanged && !newBest) return { skills: { swimCrawlM: crawlValue, swimPullM: pullValue, swimCrawl: mode, swimEvidence: evidence }, adjustments: [], stage: null, text: '', silent: true, key };
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
      // Auftrag 21: Tempo-Vorgaben aus dem aktuellen Profil, nicht aus dem alten Bauplan der Einheit (sonst blieben alte Paces stehen)
      let fresh: any = {}; try { fresh = paceCtx({ ...profile, skills: { ...sk }, thresholds: profile.thresholds || {} }, false, null, today); } catch (e) { fresh = {}; }
      const ctx: W.PaceCtx = { ...((s.spec && s.spec.ctx) || {}), ...fresh,
        gear: Array.isArray(fresh.gear) ? [...fresh.gear] : Array.isArray(sk.swimGear) ? [...sk.swimGear] : [], pool: sk.poolM === 50 ? 50 : 25 };
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
  const oldPull = num(sk.swimPullM) || 0;
  const ownOf = (k: 'crawl' | 'pull', v: number | null) => { const r: any = evidence[k]; return r && r.manual ? v : null; };
  let text: string;
  if (!best.authoritative) {
    text = [crawl !== old || !(pull && pull !== oldPull) ? (crawl ? `Deine Angabe: ${crawl} m Kraul am Stück` : 'Keine Kraulstrecke am Stück eingetragen') : '', pull && pull !== oldPull ? `Deine Angabe: ${pull} m mit Pull Buoy am Stück` : ''].filter(Boolean).join('. ');
  } else {
    const lines = [phrase('Kraul am Stück', crawl, ownOf('crawl', crawlValue), best.crawls || (best.crawl ? [best.crawl, best.crawl] : []), bestC, best.bestDate || null, old),
      (pull || bestP || oldPull) ? phrase('Mit Pull Buoy am Stück', pull, ownOf('pull', pullValue), best.pulls || (best.pull ? [best.pull, best.pull] : []), bestP, best.bestPullDate || null, oldPull) : ''].filter(Boolean);
    const fix = crawl < old ? (crawl ? `Korrigiert: Kraul am Stück jetzt ${crawl} m statt ${old} m (nach deinen geänderten Werten)` : `Korrigiert: keine bestätigte Strecke Kraul am Stück mehr (vorher ${old} m)`)
      : pull < oldPull ? (pull ? `Korrigiert: mit Pull Buoy am Stück jetzt ${pull} m statt ${oldPull} m (nach deinen geänderten Werten)` : `Korrigiert: keine bestätigte Strecke mit Pull Buoy mehr (vorher ${oldPull} m)`) : '';
    text = fix ? [fix, ...lines.slice(crawl < old ? 1 : 0, crawl < old ? 2 : 1)].join('. ') : lines.join('. ');
  }
  return { skills: { swimCrawlM: crawlValue, swimPullM: pullValue, swimCrawl: mode, swimEvidence: evidence }, adjustments: adj, stage, key,
    text: `${text}. Deine Schwimm-Stufe: ${label}.${adj.length ? ` ${adj.length} kommende Schwimmeinheiten sind angepasst (rückgängig machbar).` : ''}${crawl >= 400 ? ' Ab jetzt gibt es CSS-Tests und Zonen nach Pace pro 100 m.' : ''}` };
}

/* Alte Profilwerte haben keine sichere Herkunft. Niedrigere echte Ergebnisse sind deshalb nur ein Pruefvorschlag.
   Weder das Profil noch der bestehende Plan werden hier veraendert; Uebernahme erst nach Zustimmung. */
export function legacySwimReview(profile: any, weeks: any[], adjustments: any, today: string,
  best: { crawl?: number | null; pull?: number | null; authoritative?: boolean; crawls?: number[]; pulls?: number[]; best?: number; bestPull?: number; bestDate?: string | null; bestPullDate?: string | null; proofs?: { date: string; crawl: number | null; pull: number | null }[] }, now = Date.now(), state?: any): SwimSkillUpdate | null {
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
