/* Coach-Verlauf ordnen (Auftrag 5 D8): Briefings, Kommentare und Rückblicke verschwinden nach einigen Tagen (3/7/14, Standard 7)
   aus dem Chat ins Archiv. Erledigte Gespräche werden nach 3 Tagen zu einer Zeile zusammengeklappt („Mi: Lauf auf Samstag verschoben“).
   Sichtbar bleiben immer: offene Vorschläge und Rückfragen, ungelesene und angeheftete Nachrichten.
   Planänderungen bleiben im Anpassungs-Protokoll (Plan) und lassen sich dort rückgängig machen. */
export interface FeedItem { type: 'msg' | 'line'; msg?: any; line?: string; date: string; at: number; ids: string[] }

const DAY = 86400000;
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/* offen: Vorschlag ohne Entscheidung, Rückfrage des Chats (höchstens einen Tag) oder Knöpfe einer Coach-Nachricht ohne Antwort */
export const isOpen = (m: any, now = Date.now()) => !!m && ((m.kind === 'proposal' && m.proposal && m.proposal.status === 'open') || (!!m.pendingOpen && !m.actionsDone && now - (m.at || 0) < DAY) || (!!(m.actions && m.actions.length) && !m.actionsDone && !m.chat && m.kind !== 'answer'));
const isChat = (m: any) => m.from === 'user' || !!m.chat || !!m.intent;
export function summaryOf(thread: any[]): string {
  const done = [...thread].reverse().find(m => m.from !== 'user' && /^Erledigt: /.test(m.text || ''));
  if (done) return done.text.replace(/^Erledigt: /, '').replace(/\s+/g, ' ').slice(0, 90);
  const doneAct = [...thread].reverse().find(m => m.actionsDone);
  const user = thread.find(m => m.from === 'user');
  return ((doneAct && doneAct.actionsDone !== 'Geöffnet' ? doneAct.actionsDone + ': ' : '') + (user ? user.text : thread[0].title || thread[0].text || '')).replace(/\s+/g, ' ').slice(0, 90);
}
export function arrangeFeed(all: any[], now: number, seenAt: number, keepDays = 7): { feed: FeedItem[]; archived: any[] } {
  const msgs = (all || []).filter(m => m && !m.deleted).sort((a, b) => a.at - b.at);
  const keep = (m: any) => m.pinned || isOpen(m, now) || (m.from !== 'user' && (m.at || 0) > seenAt && !m.read);
  // Gespräche: eine Nutzer-Nachricht mit den Antworten des Coachs bis zur nächsten Nutzer-Nachricht
  const groups: any[][] = [];
  for (const m of msgs) {
    const lastG = groups[groups.length - 1]; const prev = lastG && lastG[lastG.length - 1];
    // Antwort auf eine Rückfrage gehört zum selben Gespräch
    if (m.from === 'user' && prev && prev.from !== 'user' && isChat(prev) && lastG[0].from === 'user' && ((prev.options && prev.options.length) || prev.pendingOpen) && m.at - prev.at < 30 * 60e3) lastG.push(m);
    else if (m.from === 'user') groups.push([m]);
    else if (isChat(m) && groups.length && groups[groups.length - 1][0].from === 'user' && m.at - groups[groups.length - 1][groups[groups.length - 1].length - 1].at < 6 * 3600e3) groups[groups.length - 1].push(m);
    else groups.push([m]);
  }
  const feed: FeedItem[] = []; const archived: any[] = [];
  for (const g of groups) {
    const last = g[g.length - 1]; const age = now - last.at; const pinned = g.some(keep);
    const date = new Date(last.at).toISOString().slice(0, 10);
    if (!pinned && age > keepDays * DAY) { archived.push(...g); continue; }
    if (g[0].from === 'user' && !pinned && age > 3 * DAY) { feed.push({ type: 'line', line: `${DOW[new Date(date + 'T12:00:00Z').getUTCDay()]}: ${summaryOf(g)}`, date, at: last.at, ids: g.map(m => m.id) }); continue; }
    g.forEach(m => feed.push({ type: 'msg', msg: m, date: new Date(m.at).toISOString().slice(0, 10), at: m.at, ids: [m.id] }));
  }
  return { feed, archived };
}
/* Verlauf durchsuchen (alles, auch Archiviertes) */
export function searchMsgs(all: any[], q: string): any[] {
  const n = String(q || '').toLowerCase().trim();
  const list = (all || []).filter(m => m && !m.deleted).sort((a, b) => b.at - a.at);
  return n ? list.filter(m => `${m.title || ''} ${m.text || ''}`.toLowerCase().includes(n)) : list;
}
