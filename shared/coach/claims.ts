/* Auftrag 17, Punkt 6: Aussagen über erreichte Leistungen werden vor dem Anzeigen gegen die echten Daten geprüft – deterministisch, nicht von
   der KI. Gilt für den Regel-Coach (Engine, Chat) und für die KI-Antworten (Workers AI, Claude).
   Geprüft wird nur, was als ERREICHT behauptet wird („100 m Kraul geschafft“, „neue Bestmarke 100 m“, „Deine Schwimm-Stufe: 100-m-Stücke“,
   „12 km gelaufen“). Bedingungen und Fragen („wenn du 100 m zweimal schaffst“) sind keine Behauptung, Plan- und Ziel-Teile eines Satzes
   („geplant waren 100 m“, „(Ziel war 100 m)“) werden vor der Prüfung entfernt.
   Belegt sind nur eingetragene oder gemessene Werte (shared/results.ts), nie das Soll einer Einheit. */
import * as C from '../core';
import type { EngineCtx } from './engine';
import { doneItems, valsOf } from './review';

export interface ClaimFacts {
  /** längste Strecke Kraul am Stück (Einzelwert), bestätigt (in 2 Einheiten) und eigene Angabe im Profil */
  crawlBest: number; crawlConfirmed: number; crawlProfile: number;
  /** längste wirklich gelaufene / gefahrene Strecke (km) und Dauer (min), längste Schwimmstrecke (m) der letzten 6 Wochen */
  runKm: number; bikeKm: number; runMin: number; bikeMin: number; swimM: number;
}
export function claimFacts(ctx: EngineCtx): ClaimFacts {
  const pr = C.swimProofs(ctx.state, ctx.baseWeeks || [], ctx.today, 84);
  const crawls = pr.map((p: any) => p.crawl).filter(Boolean) as number[];
  const items = doneItems(ctx, C.addDays(ctx.today, -42), ctx.today).map(d => ({ d, v: valsOf(d) }));
  const max = (sport: string, k: 'km' | 'min' | 'meters') => Math.max(0, ...items.filter(x => x.d.sport === sport).map(x => Number((x.v as any)[k]) || 0));
  const sk: any = (ctx.profile && ctx.profile.skills) || {};
  const ev = sk.swimEvidence && sk.swimEvidence.crawl;
  return { crawlBest: Math.max(0, ...crawls), crawlConfirmed: C.confirmedOf(crawls), crawlProfile: ev && ev.manual ? Number(sk.swimCrawlM) || 0 : 0,
    runKm: max('run', 'km'), bikeKm: max('bike', 'km'), runMin: max('run', 'min'), bikeMin: max('bike', 'min'), swimM: max('swim', 'meters') };
}

// Bedingungen und Fragen behaupten nichts; Plan- und Ziel-Teile eines Satzes werden vor der Prüfung entfernt
const CONDITIONAL = /\b(wenn|sobald|falls|bis du|würde|könnte|möchte|willst|vielleicht)\b|\?/i;
const PLAN_PART = /\([^)]*\)|\b(geplant\w*|ziel\w*|vorgabe\w*|vorgegeben|soll\w*|nächste\w* (stufe|mal|einheit)|noch nicht|nicht|fehl\w*|statt)\b[^,;.]*/gi;
const ACHIEVED = /\b(geschafft|schaffst du jetzt|kannst du jetzt|gekrault|geschwommen|durchgeschwommen|erreicht|bestätigt|bestmarke|bestwert|bestzeit|rekord|neue stufe|eine stufe weiter|gelaufen|gefahren|absolviert|eingetragen)\b|\bdeine (schwimm-)?stufe\b/i;

/* Unbelegte Behauptungen in einem Text (leer = alles belegt) */
export function unsupportedClaims(text: string, f: ClaimFacts): string[] {
  const out: string[] = [];
  const sentences = String(text || '').replace(/\n+/g, '. ').split(/(?<=[.!])\s+/);
  for (const s0 of sentences) {
    const full = s0.trim(); if (!full || CONDITIONAL.test(full)) continue;
    const s = full.replace(PLAN_PART, ' ');
    if (!ACHIEVED.test(s)) continue;
    // Schwimmen: Meter Kraul (am Stück), Stufen mit Stück-Länge
    if (/kraul|am stück|schwimm|stufe|-m-stücke|bahn/i.test(s)) {
      const ms = [...s.matchAll(/(\d{2,4})(?:\s*m\b|-m-Stück)/gi)].map(m => +m[1]);
      const stage = /neue stufe|eine stufe weiter|kannst du jetzt|bestätigt|deine (schwimm-)?stufe|-m-stück/i.test(s);
      const allowed = stage ? Math.max(f.crawlConfirmed, f.crawlProfile) : Math.max(f.crawlBest, f.crawlProfile, /geschwommen|bahn/i.test(s) && !/kraul|am stück/i.test(s) ? f.swimM : 0);
      if (ms.some(m => m > allowed + 0.5) || (/bestmarke|bestwert|rekord/i.test(s) && ms.some(m => m > f.crawlBest))) out.push(full);
      continue;
    }
    // Laufen und Rad: Kilometer und Minuten, die als gemacht behauptet werden
    const sport = /lauf|gelaufen|joggen/i.test(s) ? 'run' : /\brad|gefahren|ausfahrt/i.test(s) ? 'bike' : null;
    if (!sport) continue;
    const kmMax = sport === 'run' ? f.runKm : f.bikeKm, minMax = sport === 'run' ? f.runMin : f.bikeMin;
    if ([...s.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*km\b/gi)].some(m => +m[1].replace(',', '.') > kmMax * 1.05 + 0.2)
      || [...s.matchAll(/(\d{2,3})\s*min\b/gi)].some(m => +m[1] > minMax * 1.05 + 2)) out.push(full);
  }
  return [...new Set(out)];
}

/* Für den Regel-Coach: unbelegte Sätze entfernen (statt eine falsche Leistung zu zeigen) */
export function stripUnsupported(text: string, f: ClaimFacts): string {
  const bad = unsupportedClaims(text, f); if (!bad.length) return text;
  let t = String(text);
  for (const b of bad) t = t.split(b).join('');
  return t.replace(/[ \t]+\./g, '.').replace(/\.\s*\./g, '.').replace(/[ \t]{2,}/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}
