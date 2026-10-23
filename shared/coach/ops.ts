/* Planänderungen aus dem Coach-Chat (Auftrag 5 D3): ein kleiner Satz an Aktionen, den der regelbasierte Chat, der KI-Coach und
   die Tests gleich benutzen. Jede Aktion liefert eine Rückgängig-Information. Ausführen (applyOps) arbeitet auf einem einfachen
   Speicher-Objekt, damit App und Tests denselben Code nutzen. Neue Einschränkungen gehen ins Regel-Modell (dauerhaft). */
import type { Rule } from '../constraints';
import type { Goal } from '../goals';
import type { Profile } from '../profile';

export type Op =
  | { op: 'adjust'; adj: any[] }
  | { op: 'illness-start'; date: string; note?: string }
  | { op: 'illness-end'; date: string }
  | { op: 'add-rules'; rules: Rule[]; text: string }
  | { op: 'goal'; goal: Goal }
  | { op: 'freq'; sport: string; n: number }
  | { op: 'replan'; reason: string }
  | { op: 'swim-skill'; skills: Record<string, any> }
  /** Auftrag 18: Notiz in die Tageswerte (z. B. „Knie 5/10“), die tägliche Anpassung liest sie (Schmerz ab 4/10: Laufen ersetzen) */
  | { op: 'trend-note'; text: string };
export interface Undo { skills?: any; adj: string[]; illness: string[]; illnessEnd?: { id: string; prev: string | null }; rules: string[]; note?: string; goal?: { id: string; prev: Goal | null }; freq?: { sport: string; prev: any } }
export interface OpStore { state: any; profile: Profile; goals: Record<string, Goal>; saveProfile(p: Profile): void }
export interface Applied { undo: Undo; summary: string[]; replan: string | null; adjChanged: boolean }

export function applyOps(store: OpStore, ops: Op[], now: number, today: string): Applied {
  const undo: Undo = { adj: [], illness: [], rules: [] };
  const summary: string[] = []; let replan: string | null = null; let adjChanged = false;
  const st = store.state;
  st.adjustments = st.adjustments || {}; st.illnessPeriods = st.illnessPeriods || [];
  ops.forEach((o, k) => {
    if (o.op === 'adjust') {
      o.adj.forEach((a, i) => { st.adjustments[a.id] = { ...a, createdAt: now + k * 10 + i, date: today, from_chat: true }; undo.adj.push(a.id); if (a.what) summary.push(a.what); });
      adjChanged = true;
    }
    if (o.op === 'illness-start') {
      if (!st.illnessPeriods.some((p: any) => p && !p.end)) { const id = 'ill-' + now; st.illnessPeriods.push({ id, start: o.date, end: null, note: o.note || '' }); undo.illness.push(id); summary.push('Krankheitsphase ab ' + o.date.split('-').reverse().join('.')); }
    }
    if (o.op === 'illness-end') {
      const ill = st.illnessPeriods.find((p: any) => p && (!p.end || p.end >= today));
      if (ill) {
        if (ill.start > o.date) { st.illnessPeriods = st.illnessPeriods.filter((p: any) => p !== ill); summary.push('Krankheitsphase entfernt'); }
        else { undo.illnessEnd = { id: ill.id, prev: ill.end }; ill.end = o.date; summary.push('Krankheitsphase beendet, Wiedereinstieg beginnt'); }
      }
    }
    if (o.op === 'add-rules') {
      const p = { ...store.profile };
      const rules = o.rules.map(r => ({ ...r, text: o.text, source: r.source === 'ai' ? 'ai' as const : 'chat' as const }));
      p.rules = [...(p.rules || []), ...rules];
      if (!(p.notes || []).includes(o.text)) { p.notes = [...(p.notes || []), o.text]; undo.note = o.text; }
      store.saveProfile(p); store.profile = p;
      undo.rules.push(...rules.map(r => r.id));
      summary.push('Neue Regel: ' + o.text);
    }
    if (o.op === 'goal') {
      const prev = store.goals[o.goal.id] || null;
      store.goals[o.goal.id] = { ...(prev || {}), ...o.goal, createdAt: (prev as any)?.createdAt || now } as any;
      undo.goal = { id: o.goal.id, prev };
      summary.push((prev ? 'Ziel geändert: ' : 'Neues Ziel: ') + o.goal.name);
    }
    if (o.op === 'freq') {
      const p = { ...store.profile }; undo.freq = { sport: o.sport, prev: (p.freq || {})[o.sport as 'run'] ?? null };
      p.freq = { ...(p.freq || {}), [o.sport]: [o.n, o.n] }; store.saveProfile(p); store.profile = p;
    }
    if (o.op === 'swim-skill') {
      const p = { ...store.profile }; undo.skills = { ...(p.skills || {}) };
      p.skills = { ...(p.skills || {}), ...o.skills }; store.saveProfile(p); store.profile = p;
      summary.push('Schwimmen: ' + (o.skills.swimCrawlM ? o.skills.swimCrawlM + ' m Kraul am Stück' : '') + (o.skills.swimPullM ? ', ' + o.skills.swimPullM + ' m mit Pull Buoy' : ''));
    }
    if (o.op === 'trend-note') {
      st.trend = st.trend || []; let tp = st.trend.find((x: any) => x && x.date === today);
      if (!tp) { tp = { date: today }; st.trend.push(tp); st.trend.sort((a: any, b: any) => a.date.localeCompare(b.date)); }
      tp.illness = [tp.illness, o.text].filter(Boolean).join('; ');
      summary.push('Notiz: ' + o.text);
    }
    if (o.op === 'replan') replan = o.reason;
  });
  return { undo, summary, replan, adjChanged };
}
/* Rückgängig: alles genau so zurück, wie es vorher war */
export function undoOps(store: OpStore, u: Undo): void {
  const st = store.state;
  u.adj.forEach(id => { if (st.adjustments && st.adjustments[id]) st.adjustments[id] = { ...st.adjustments[id], undone: true }; });
  if (u.illness.length) st.illnessPeriods = (st.illnessPeriods || []).filter((p: any) => !u.illness.includes(p.id));
  if (u.illnessEnd) { const p = (st.illnessPeriods || []).find((x: any) => x.id === u.illnessEnd!.id); if (p) p.end = u.illnessEnd.prev; }
  if (u.rules.length || u.note || u.freq || u.skills) {
    const p = { ...store.profile };
    if (u.skills) p.skills = u.skills;
    if (u.rules.length) p.rules = (p.rules || []).filter(r => !u.rules.includes(r.id));
    if (u.note) p.notes = (p.notes || []).filter(n => n !== u.note);
    if (u.freq) { const f: any = { ...(p.freq || {}) }; if (u.freq.prev) f[u.freq.sport] = u.freq.prev; else delete f[u.freq.sport]; p.freq = f; }
    store.saveProfile(p); store.profile = p;
  }
  if (u.goal) { if (u.goal.prev) store.goals[u.goal.id] = u.goal.prev; else delete store.goals[u.goal.id]; }
}
