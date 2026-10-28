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
  const dups = new Set(duplicateMsgIds(all || []));
  const msgs = (all || []).filter(m => m && !m.deleted && !dups.has(m.id)).sort((a, b) => a.at - b.at);
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
  const dups = new Set(duplicateMsgIds(all || []));
  const list = (all || []).filter(m => m && !m.deleted && !dups.has(m.id)).sort((a, b) => b.at - a.at);
  return n ? list.filter(m => `${m.title || ''} ${m.text || ''}`.toLowerCase().includes(n)) : list;
}

/* ---------- Auftrag 21: jede Meldung höchstens einmal je Anlass ----------
   Anlass = Art, Titel und Text derselben Coach-Meldung am selben Tag. Gespräche (Nutzer, Chat-Antworten) sind nie doppelt.
   Bleibt: die entschiedene Fassung (angenommen/abgelehnt), sonst die offene, sonst die älteste. Gilt für alle Meldungsarten,
   auf dem Server (vor dem Speichern) und in der App (Anzeige und Aufräumen alter Duplikate). */
const norm = (s: any) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
export function occasionKey(m: any): string | null {
  if (!m || m.deleted || m.from === 'user' || m.chat || m.intent || m.kind === 'answer') return null;
  const text = norm(m.text);
  if (!text && !m.title) return null;
  const day = m.date || (m.at ? new Date(m.at).toISOString().slice(0, 10) : '');
  return [m.kind || '', norm(m.title).replace(/prue/g, 'prü'), text.replace(/prue/g, 'prü'), day].join('|');
}
const rank = (m: any) => (m.proposal && ['accepted', 'rejected'].includes(m.proposal.status) ? 0 : m.proposal && m.proposal.status === 'open' ? 1 : 2);
const better = (a: any, b: any) => rank(a) - rank(b) || (a.at || 0) - (b.at || 0) || String(a.id).localeCompare(String(b.id));
/* Ids aller doppelten Meldungen (die beste je Anlass bleibt) */
export function duplicateMsgIds(all: any[]): string[] {
  const best = new Map<string, any>(); const out: string[] = [];
  for (const m of (all || []).filter(Boolean)) {
    const k = occasionKey(m); if (!k) continue;
    const cur = best.get(k);
    if (!cur) { best.set(k, m); continue; }
    if (better(m, cur) < 0) { out.push(cur.id); best.set(k, m); } else out.push(m.id);
  }
  return out;
}
/* Neue Meldungen gegen den vorhandenen Verlauf prüfen: Duplikate unter anderer Id fallen weg, alte Duplikate werden gelöscht */
export function dedupeIncoming(existing: Record<string, any>, incoming: any[]): { keep: any[]; drop: string[] } {
  const merged: Record<string, any> = { ...(existing || {}) };
  for (const m of incoming) if (m && m.id) merged[m.id] = m;
  const dups = new Set(duplicateMsgIds(Object.values(merged)));
  return { keep: incoming.filter(m => !m || !dups.has(m.id)), drop: [...dups].filter(id => existing && existing[id]) };
}

/* Auftrag 21: entschiedene oder überholte Vorschläge brauchen nach 7 Tagen keinen vollständigen Bauplan mehr (Speicher bei vielen Nutzern).
   Es bleiben Titel, Text, Status und die Zeilen „was, von wann, nach wann“. Liefert die verkleinerte Meldung oder null. */
export function compactDecided(m: any, now: number): any | null {
  const p = m && m.proposal;
  if (!p || p.status === 'open' || !Array.isArray(p.changes) || !p.changes.length || (m.at || 0) > now - 7 * 86400000) return null;
  const lines = p.changes.filter((c: any) => c && c.data && c.data.what).map((c: any) => ({ kind: c.kind, key: c.key, data: { what: String(c.data.what) } }));
  return { ...m, proposal: { ...p, changes: lines, compacted: true } };
}
