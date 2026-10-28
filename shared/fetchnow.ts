/* Auftrag 21: „Jetzt abrufen“ – verständlicher Status ohne Technikbegriffe, gleich in Verbindungen und in jeder Einheit.
   Beispiele: „Abgerufen 18:42 – Lauf gefunden und eingetragen“, „Abgerufen 18:42 – noch keine neue Aufzeichnung“. */
export interface FetchResult { provider: string; label: string; ok: boolean; error?: string; activities: number; matched: number; days: number }
const SPORT_DE: Record<string, string> = { run: 'Lauf', bike: 'Radfahrt', swim: 'Schwimmeinheit', strength: 'Krafttraining', football: 'Teamsport' };
export const FETCH_MIN_GAP_MS = 60000;
export function fetchStatusText(at: number, results: FetchResult[], session?: { sport: string; done: boolean; before: boolean } | null): string {
  const hhmm = new Date(at).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const head = `Abgerufen ${hhmm} – `;
  const errs = results.filter(r => !r.ok && r.error);
  const acts = results.reduce((a, r) => a + (r.activities || 0), 0);
  let body: string;
  if (session && session.done && !session.before) body = `${SPORT_DE[session.sport] || 'Einheit'} gefunden und eingetragen`;
  else if (acts) body = acts === 1 ? '1 neue Aufzeichnung übernommen' : `${acts} neue Aufzeichnungen übernommen`;
  else if (!results.length) body = 'keine Verbindung eingerichtet (Mehr → Verbindungen)';
  else body = 'noch keine neue Aufzeichnung';
  return head + body + (errs.length ? '. ' + errs.map(e => `${e.label}: ${e.error}`).join(' ') : '');
}
