/* Berücksichtigungen (Auftrag 4 C3, ab Auftrag 5 über das Regel-Modell): freie Notizen wie „Knie zwickt“ oder
   „Schwimmbad nur samstags“ werden mit dem Regel-Parser (shared/ruleparse.ts) zu Regeln (shared/constraints.ts).
   Was der Parser nicht versteht, bleibt sichtbar als „noch nicht berücksichtigt“, statt ignoriert zu werden. */
import { parseRules } from './ruleparse';
import { effectsOf as effectsOfRules, describe, type Rule, type Effects } from './constraints';

export type { Effects };
export interface Consideration { text: string; cats: string[]; label: string; effect: string; understood: boolean; rules: Rule[] }

const todayIso = () => new Date().toISOString().slice(0, 10);
export function parseConsiderations(notes: string[], today = todayIso()): Consideration[] {
  const out: Consideration[] = [];
  for (const raw of notes || []) {
    const text = String(raw || '').trim();
    if (!text || /^keine?\.?$/i.test(text)) continue;
    const r = parseRules(text, today);
    const cats = r.rules.map(x => x.kind === 'body' ? x.body || 'injury' : x.kind);
    const label = r.rules.map(describe).join('; ');
    out.push({ text, cats, label, effect: label, understood: r.understood, rules: r.rules });
  }
  return out;
}
export function effectsOf(list: Consideration[]): Effects { return effectsOfRules(list.flatMap(c => c.rules)); }

/* Kurzer Tipp für eine Einheit aus den Regeln (Körper) */
export function tipFor(sport: string, rules: Rule[]): string | null {
  const has = (b: string) => rules.some(x => x.kind === 'body' && x.body === b);
  if (sport === 'run') {
    if (has('knee')) return `Knie: weicher Untergrund, kurze Schritte${rules.some(x => x.noDownhill) ? ', bergab gehen statt laufen' : ''}, bei Schmerz über 2/10 abbrechen.`;
    if (has('achilles')) return 'Achillessehne: flach laufen, keine Bergsprints, bei Schmerz abbrechen.';
    if (has('shin')) return 'Schienbein: weicher Untergrund, langsam steigern.';
    if (has('foot')) return 'Fuß: gute Schuhe, weicher Untergrund.';
    if (has('groin')) return 'Leiste: keine schnellen Richtungswechsel, bei Ziehen locker bleiben.';
    if (has('calf')) return 'Wade: gut aufwärmen, keine Bergsprints.';
    if (rules.some(x => x.kind === 'body' && x.noDownhill)) return 'Strecke ohne steile Bergab-Stücke wählen.';
  }
  if (sport === 'swim' && has('shoulder')) return 'Schulter: ruhige, lange Züge, bei Schmerz Beinschlag statt Armzug.';
  if (sport === 'strength' && has('back')) return 'Rücken: Bauch anspannen, keine schweren Hebeübungen.';
  if (has('asthma')) return 'Asthma: lange aufwärmen, Spray griffbereit.';
  return null;
}
