/* Auftrag 32: Pro Frage genau EINE Antwort. Vorher kamen auf eine Frage bis zu drei Nachrichten (KI-Antwort, Hinweis, ein oder mehrere
   Vorschlags-Karten), die sich teils widersprachen. Jetzt: Hinweis (höchstens einer) steht unter der Antwort, alle Vorschläge werden zu
   EINEM Vorschlag zusammengefasst und hängen an derselben Nachricht (ein „Übernehmen“). Gilt für die kostenlose KI und für Claude. */
import { mergeSwapProposals } from './tools';
import type { CoachMsg } from './engine';

export function oneAnswer(ans: CoachMsg, hints: string[], props: CoachMsg[]): CoachMsg[] {
  const m: any = { ...ans };
  const hint = (hints || []).map(h => String(h || '').trim()).find(h => h && !m.text.includes(h));
  if (hint) m.text = m.text + '\n\n' + hint;
  const merged = mergeSwapProposals((props || []).filter(p => p && p.proposal && (p.proposal.changes || []).length) as any[]) as any[];
  if (merged.length) {
    const seen = new Set<string>();
    const changes = merged.flatMap(p => p.proposal.changes).filter((c: any) => { const k = c.kind + ':' + c.key; if (seen.has(k)) return false; seen.add(k); return true; });
    const titles = [...new Set(merged.map(p => String(p.title || '').trim()).filter(Boolean))];
    m.proposal = { changes, status: 'open', ...(merged.find(p => p.proposal.evidenceSignature) ? { evidenceSignature: merged.find(p => p.proposal.evidenceSignature).proposal.evidenceSignature } : {}), ...(merged.every(p => p.proposal.skillsOnly) ? { skillsOnly: true } : {}) };
    m.propTitle = titles.length === 1 ? titles[0] : 'Vorschlag: ' + titles.map(t => t.replace(/^(Vorschlag|Verschieben|Streichen|Ändern|Tauschen):\s*/, '')).join('; ');
  }
  return [m];
}
