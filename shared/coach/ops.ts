import { nextAdjustmentTime } from '../adjustment-clock';
import * as C from '../core';
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
  /** Auftrag 27: „Doch noch krank“ – die zuletzt beendete Phase läuft wieder */
  | { op: 'illness-reopen' }
  /** Auftrag 27: „Wieder schmerzfrei“ – Beschwerde-Regeln aus dem Schmerz-Ablauf entfernen, ältere Schmerz-Notizen zählen nicht mehr */
  | { op: 'injury-end' }
  | { op: 'add-rules'; rules: Rule[]; text: string }
  | { op: 'goal'; goal: Goal }
  | { op: 'freq'; sport: string; n: number }
  | { op: 'replan'; reason: string }
  | { op: 'swim-skill'; skills: Record<string, any> }
  /** Auftrag 18: Notiz in die Tageswerte (z. B. „Knie 5/10“), die tägliche Anpassung liest sie (Schmerz ab 4/10: Laufen ersetzen) */
  | { op: 'trend-note'; text: string };
/* illnessEnd: früher ein Objekt, seit Auftrag 27 eine Liste (alle offenen Phasen werden beendet); alte Nachrichten mit Objekt bleiben rückgängig machbar */
export interface Undo { skills?: any; adj: string[]; illness: string[]; illnessEnd?: { id: string; prev: string | null } | { id: string; prev: string | null }[]; illnessRemoved?: any[]; trendNote?: { date: string; prev: string | null; created: boolean }; injury?: { rules: Rule[]; notes: string[]; prevCleared: string | null }; rules: string[]; note?: string; goal?: { id: string; prev: Goal | null }; freq?: { sport: string; prev: any } }
export interface OpStore { state: any; profile: Profile; goals: Record<string, Goal>; saveProfile(p: Profile): void }
export interface Applied { undo: Undo; summary: string[]; replan: string | null; adjChanged: boolean }

/* Auftrag 27: Beschwerden aus dem Schmerz-Ablauf (Coach: „Knie: Beschwerden seit …“) – nur diese Regeln hebt „Wieder schmerzfrei“ auf,
   selbst eingetragene Berücksichtigungen bleiben. */
export const INJURY_NOTE = /: Beschwerden seit \d/;
export const isInjuryRule = (r: Rule): boolean => !!r && (r as any).source !== 'manual' && INJURY_NOTE.test(String((r as any).text || ''));
/** Auftrag 27: aktuelle Beschwerden für Heute und Coach: Regeln aus dem Schmerz-Ablauf oder Schmerz über 2/10 in Notizen der letzten 7 Tage
    (nach „Wieder schmerzfrei“ nur neuere). since = Datum aus „Beschwerden seit TT.MM.JJJJ“, sonst null. */
export function activeInjury(state: any, profile: Profile, weeks: any[], today: string): { part: string; level: number | null; since: string | null } | null {
  const rule = (profile.rules || []).find(isInjuryRule) as any;
  const pain = (C as any).painInfo(state, weeks, today);
  const strong = pain && pain.level > 2 ? pain : null;
  if (!rule && !strong) return null;
  const m = rule ? /^(.*?): Beschwerden seit (\d{2})\.(\d{2})\.(\d{4})/.exec(String(rule.text || '')) : null;
  return { part: strong ? strong.part : m ? m[1] : 'Beschwerden', level: strong ? strong.level : null, since: m ? `${m[4]}-${m[3]}-${m[2]}` : null };
}
export function applyOps(store: OpStore, ops: Op[], now: number, today: string): Applied {
  const undo: Undo = { adj: [], illness: [], rules: [] };
  const summary: string[] = []; let replan: string | null = null; let adjChanged = false;
  const st = store.state;
  st.adjustments = st.adjustments || {}; st.illnessPeriods = st.illnessPeriods || [];
  ops.forEach((o, k) => {
    if (o.op === 'adjust') {
      const createdAt = nextAdjustmentTime(st.adjustments, now + k * 10);
      o.adj.forEach((a, i) => { if (a.sessionId && st.sessions?.[a.sessionId]?.completed) return; st.adjustments[a.id] = { ...a, createdAt: createdAt + i, date: today, from_chat: true }; undo.adj.push(a.id); if (a.what) summary.push(a.what); });
      adjChanged = true;
    }
    if (o.op === 'illness-start') {
      if (!st.illnessPeriods.some((p: any) => p && !p.end)) { const id = 'ill-' + now; st.illnessPeriods.push({ id, start: o.date, end: null, note: o.note || '' }); undo.illness.push(id); summary.push('Krankheitsphase ab ' + o.date.split('-').reverse().join('.')); }
    }
    if (o.op === 'illness-end') {
      // Auftrag 27: ALLE Phasen, die heute noch laufen (auch doppelt angelegte), enden mit o.date (gestern = letzter kranker Tag).
      // Heute begonnene (Versehen) werden entfernt. Vergangene Krank-Tage bleiben. Phasen in der Zukunft bleiben unberührt.
      const running = st.illnessPeriods.filter((p: any) => p && p.start && p.start <= today && (!p.end || p.end >= today));
      const ended: { id: string; prev: string | null }[] = []; const removed: any[] = [];
      for (const p of running) {
        if (p.start > o.date) removed.push(p);
        else { ended.push({ id: p.id, prev: p.end ?? null }); p.end = o.date; }
      }
      if (removed.length) st.illnessPeriods = st.illnessPeriods.filter((p: any) => !removed.includes(p));
      if (ended.length) undo.illnessEnd = ended;
      if (removed.length) undo.illnessRemoved = removed.map(p => ({ ...p }));
      if (running.length) summary.push(ended.length ? 'Krankheitsphase beendet, Wiedereinstieg ab heute' : 'Krankheitsphase entfernt');
    }
    if (o.op === 'illness-reopen') {
      const last = st.illnessPeriods.filter((p: any) => p && p.end && p.end < today).sort((a: any, b: any) => b.end.localeCompare(a.end))[0];
      if (last) { undo.illnessEnd = [{ id: last.id, prev: last.end }]; last.end = null; summary.push('Krankheitsphase läuft wieder'); }
    }
    if (o.op === 'injury-end') {
      const p = { ...store.profile };
      const rules = (p.rules || []).filter(isInjuryRule);
      const notes = (p.notes || []).filter(n => INJURY_NOTE.test(n));
      st.settings = st.settings || {};
      undo.injury = { rules, notes, prevCleared: st.settings.painClearedOn ?? null };
      st.settings.painClearedOn = today;
      if (rules.length || notes.length) { p.rules = (p.rules || []).filter(r => !isInjuryRule(r)); p.notes = (p.notes || []).filter(n => !INJURY_NOTE.test(n)); store.saveProfile(p); store.profile = p; replan = replan || 'Beschwerden vorbei'; }
      summary.push('Beschwerden beendet, der Plan gilt wieder normal');
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
      const created = !tp;
      if (!tp) { tp = { date: today }; st.trend.push(tp); st.trend.sort((a: any, b: any) => a.date.localeCompare(b.date)); }
      undo.trendNote = { date: today, prev: tp.illness ?? null, created };
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
  if (u.illnessEnd) for (const e of Array.isArray(u.illnessEnd) ? u.illnessEnd : [u.illnessEnd]) { const p = (st.illnessPeriods || []).find((x: any) => x.id === e.id); if (p) p.end = e.prev; }
  if (u.illnessRemoved && u.illnessRemoved.length) { st.illnessPeriods = st.illnessPeriods || []; for (const p of u.illnessRemoved) if (!st.illnessPeriods.some((x: any) => x.id === p.id)) st.illnessPeriods.push({ ...p }); }
  if (u.trendNote) { const tp = (st.trend || []).find((x: any) => x && x.date === u.trendNote!.date); if (tp) { if (u.trendNote.created && !u.trendNote.prev && Object.keys(tp).length <= 2) st.trend = st.trend.filter((x: any) => x !== tp); else if (u.trendNote.prev) tp.illness = u.trendNote.prev; else delete tp.illness; } }
  if (u.injury) {
    st.settings = st.settings || {}; if (u.injury.prevCleared) st.settings.painClearedOn = u.injury.prevCleared; else delete st.settings.painClearedOn;
    if (u.injury.rules.length || u.injury.notes.length) { const p = { ...store.profile }; p.rules = [...(p.rules || []), ...u.injury.rules.filter(r => !(p.rules || []).some(x => x.id === r.id))]; p.notes = [...(p.notes || []), ...u.injury.notes.filter(n => !(p.notes || []).includes(n))]; store.saveProfile(p); store.profile = p; }
  }
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
