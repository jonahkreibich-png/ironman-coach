/* Auftrag 22: Täglicher Daten-Check für alle Nutzer (läuft nachts auf dem Server, nur prüfen).
   Findet: widersprüchliche oder unmögliche Werte, doppelte Einheiten, doppelte Meldungen, Verstöße gegen die Trainingsregeln,
   Stufen im Plan höher als die Ist-Werte erlauben, verwaiste Anpassungen.
   Sichere Fälle werden repariert (nur löschen, was eindeutig doppelt ist); alles andere wird gemeldet.
   Die Texte enthalten keine Gesundheitswerte (Betreiber-Posteingang), nur Art, Datum und Anzahl. */
import * as C from './core';
import { actualMetrics } from './results';
import { checkField, crossCheck } from './validate';
import { IV_LIMITS } from './intervals';
import { duplicateMsgIds } from './coach/feed';
import { checkTrainingRules, TRULE_LABEL } from './trainingrules';
import { mainGoal } from './goals';
import { sameWorkout } from './activity/merge';
import { LIB } from './workoutlib';
import { effectiveCustomBuckets } from './custom-state26';

export type DCGroup = 'values' | 'duplicates' | 'messages' | 'rules' | 'stage' | 'orphans';
export const DC_LABEL: Record<DCGroup, string> = { values: 'Widersprüchliche Werte', duplicates: 'Doppelte Einheiten', messages: 'Doppelte Meldungen', rules: 'Plan-Regel verletzt', stage: 'Stufe passt nicht zu den Ist-Werten', orphans: 'Verwaiste Anpassung' };
export interface DCFinding { group: DCGroup; key: string; text: string; date?: string; fixed?: boolean }
export interface DCFix { kind: 'custom' | 'coachMsg'; key: string; why: string }
export interface DCInput { state: any; baseWeeks: any[]; profile: any; goals?: any[]; today: string }
export interface DCResult { findings: DCFinding[]; fixes: DCFix[] }

const FIELD_WORD: Record<string, string> = { hr: 'Puls', maxHr: 'max. Puls', km: 'Distanz', meters: 'Distanz', min: 'Dauer', pace: 'Pace', pace100: 'Pace', power: 'Watt', maxPower: 'max. Watt', speed: 'Tempo', cadence: 'Kadenz', rpe: 'RPE', spl: 'Züge pro Bahn' };
const DOUBT_WORD: Record<string, string> = { 'hr>max': 'Ø Puls über max. Puls', speed: 'Distanz und Dauer passen nicht (Tempo unmöglich)', dist0: 'Distanz 0 bei längerer Dauer', 'crawl>total': 'Kraul am Stück länger als die Gesamtstrecke', 'power>max': 'Ø Watt über max. Watt', slow: 'langsamer als Gehen' };
const dm = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}.`;

/* Beschädigte Einträge (null, falscher Typ) nicht prüfen, sondern als Befund melden – der Check darf nie abstürzen */
function cleanState(st: any, findings: DCFinding[]): any {
  const obj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
  const s: any = obj(st) ? { ...st } : {};
  let broken = 0;
  const dict = (k: string) => { if (!obj(s[k])) { if (s[k] != null) broken++; s[k] = {}; return; } const o: any = {}; for (const [key, v] of Object.entries(s[k])) { if (obj(v)) o[key] = v; else broken++; } s[k] = o; };
  ['sessions', 'activities', 'adjustments', 'coachMsgs'].forEach(dict);
  if (!obj(s.customWorkouts)) { if (s.customWorkouts != null) broken++; s.customWorkouts = {}; }
  else { const o: any = {}; for (const [d, l] of Object.entries(s.customWorkouts)) { if (!Array.isArray(l)) { broken++; continue; } const ok = l.filter((w: any) => obj(w) && typeof w.id === 'string'); broken += l.length - ok.length; if (ok.length) o[d] = ok; } s.customWorkouts = o; }
  for (const st2 of Object.values(s.sessions) as any[]) if (st2.metrics != null && !obj(st2.metrics)) { st2.metrics = {}; broken++; }
  if (broken) findings.push({ group: 'values', key: 'broken', text: `${DC_LABEL.values}: ${broken} beschädigte Einträge (leer oder falsches Format) übersprungen` });
  return s;
}
export function dataCheck(inp: DCInput): DCResult {
  const findings: DCFinding[] = []; const fixes: DCFix[] = [];
  const { baseWeeks, profile, today } = inp;
  const state = cleanState(inp.state, findings);
  const weeks = C.applyAdjustments(baseWeeks || [], state.adjustments || {});
  const days = C.planDays(weeks);
  const acts: Record<string, any> = state.activities || {};

  // 1) Werte jeder erledigten Einheit (geplant und extra)
  const items: { key: string; date: string; sport: string; st: any }[] = [];
  days.forEach((d: any) => d.sessions.forEach((s: any) => { const st = (state.sessions || {})[s.id]; if (st && st.completed && s.sport !== 'rest') items.push({ key: s.id, date: d.date, sport: s.sport, st }); }));
  Object.entries(effectiveCustomBuckets(state) || {}).forEach(([date, list]: any) => (list || []).forEach((w: any) => { if (w && w.completed !== false) items.push({ key: w.id, date, sport: w.sport, st: w }); }));
  for (const it of items) {
    const act = it.st.activityId ? acts[it.st.activityId] : null;
    const m = actualMetrics(it.st, act);
    const bad: string[] = [];
    for (const [k, v] of Object.entries(m)) { if (k.startsWith('_') || v == null || v === '' || typeof v === 'object') continue; const c = checkField(it.sport, k, v); if (!c.ok) bad.push(FIELD_WORD[k] || k); }
    for (const d of crossCheck(it.sport, m)) if (d.severe) bad.push(DOUBT_WORD[d.key] || d.key);
    const rows = Array.isArray(m.intervals) ? m.intervals : [];
    rows.forEach((r: any) => { for (const [k, lim] of Object.entries(IV_LIMITS)) { const v = r && r[k]; if (typeof v === 'number' && (v < lim[0] || v > lim[1])) { bad.push('Intervall: ' + (FIELD_WORD[k] || k)); break; } } if (r && r.hr && r.maxHr && r.maxHr < r.hr) bad.push('Intervall: Ø Puls über max. Puls'); });
    if (it.st.completed && it.st.skipped) bad.push('erledigt und ausgelassen zugleich');
    if (bad.length) findings.push({ group: 'values', key: 'values:' + it.key, date: it.date, text: `${DC_LABEL.values}: ${[...new Set(bad)].join(', ')} (${it.sport}, ${dm(it.date)})` });
  }

  // 2) Doppelte Einheiten
  const list = Object.values(acts).filter((a: any) => a && !a.mergedInto) as any[];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i].id !== list[j].id && sameWorkout(list[i], list[j]))
    findings.push({ group: 'duplicates', key: `dup-act:${[list[i].id, list[j].id].sort().join('|')}`, date: list[i].date, text: `${DC_LABEL.duplicates}: zwei Aufzeichnungen derselben Einheit nicht zusammengeführt (${list[i].sport}, ${dm(list[i].date)})` });
  const sessByAct = new Map<string, string>();
  Object.entries(state.sessions || {}).forEach(([id, st]: any) => { const aid = st && st.activityId && C.canonicalActivityId ? C.canonicalActivityId(state, st.activityId) : st && st.activityId; if (aid && st.completed) sessByAct.set(aid, id); });
  const seenCustom = new Map<string, any>();
  Object.entries(effectiveCustomBuckets(state) || {}).forEach(([date, l]: any) => (l || []).forEach((w: any) => {
    if (!w || !w.id) return;
    const aid = w.activityId && C.canonicalActivityId ? C.canonicalActivityId(state, w.activityId) : w.activityId;
    const manualTouched = Object.keys(w.metricsManual || {}).length > 0 || Object.values(w.metricsSrc || {}).includes('manual') || !!(w.description || '').trim() || w.rpe != null && w.rpe !== '';
    // automatisch angelegte Extra-Einheit zu einer Aufzeichnung, die schon an einer geplanten Einheit hängt: doppelt gezählt
    if (aid && sessByAct.has(aid) && w.auto && !manualTouched) { fixes.push({ kind: 'custom', key: w.id, why: 'Aufzeichnung hängt schon an einer geplanten Einheit' }); findings.push({ group: 'duplicates', key: 'dup-custom:' + w.id, date, text: `${DC_LABEL.duplicates}: Extra-Einheit doppelt zur geplanten (${w.sport}, ${dm(date)}) – entfernt`, fixed: true }); return; }
    // zwei Extra-Einheiten mit derselben Aufzeichnung oder genau gleichem Inhalt
    const sig = aid ? 'act:' + aid : JSON.stringify([date, w.sport, w.title || '', w.metrics || {}, w.completed ?? null, w.description || '']);
    const prev = seenCustom.get(sig);
    if (!prev) { seenCustom.set(sig, w); return; }
    const same = JSON.stringify({ ...prev, id: 0, updatedAt: 0, createdAt: 0 }) === JSON.stringify({ ...w, id: 0, updatedAt: 0, createdAt: 0 });
    if (same || (aid && w.auto && !manualTouched)) { fixes.push({ kind: 'custom', key: w.id, why: 'genaue Kopie' }); findings.push({ group: 'duplicates', key: 'dup-custom:' + w.id, date, text: `${DC_LABEL.duplicates}: Extra-Einheit doppelt (${w.sport}, ${dm(date)}) – entfernt`, fixed: true }); }
    else findings.push({ group: 'duplicates', key: 'dup-custom:' + w.id, date, text: `${DC_LABEL.duplicates}: zwei Extra-Einheiten mit derselben Aufzeichnung (${w.sport}, ${dm(date)})` });
  }));

  // 3) Doppelte Meldungen (gleicher Anlass): sicher entfernen, die beste bleibt
  const dups = duplicateMsgIds(Object.values(state.coachMsgs || {}));
  dups.forEach(id => fixes.push({ kind: 'coachMsg', key: id, why: 'doppelte Meldung' }));
  if (dups.length) findings.push({ group: 'messages', key: 'dup-msg', text: `${DC_LABEL.messages}: ${dups.length} entfernt`, fixed: true });

  // 4) Trainingsregeln ab heute
  try {
    const goals = inp.goals || [];
    const iss = checkTrainingRules(weeks, profile, { from: today, today, goals, goalType: (mainGoal(goals, today) || ({} as any)).type || null });
    const by = new Map<string, { n: number; date?: string }>();
    iss.forEach(x => { const g = by.get(x.rule) || { n: 0, date: x.date }; g.n++; by.set(x.rule, g); });
    by.forEach((v, rule) => findings.push({ group: 'rules', key: 'rule:' + rule, date: v.date, text: `${DC_LABEL.rules}: ${TRULE_LABEL[rule as keyof typeof TRULE_LABEL] || rule} (${v.n}×${v.date ? ', zuerst ' + dm(v.date) : ''})` }));
  } catch (e) { findings.push({ group: 'rules', key: 'rule:error', text: `${DC_LABEL.rules}: Prüfung fehlgeschlagen (${String((e as Error).message || e).slice(0, 60)})` }); }

  // 5) Stufen: kommende Einheiten nie höher, als die Ist-Werte erlauben
  const soon = days.filter((d: any) => d.date >= today && d.date <= C.addDays(today, 14));
  // gleiche Regel wie die Wochenanpassung (core libStatus): sie passt sonntags die nächste Woche an – geprüft wird deshalb bis Sonntag der laufenden Woche
  const weekEnd = C.weekRange(today)[1];
  const soon7 = days.filter((d: any) => d.date > today && d.date <= weekEnd);
  const ls: Record<string, any> = C.libStatus(state, weeks, today);
  for (const [key, st0] of Object.entries(ls)) {
    const ahead = soon7.flatMap((d: any) => d.sessions.filter((s: any) => s.spec && s.spec.lib && s.spec.lib.key === key && !s.cancelled && !s.locked && s.spec.lib.stage > st0.target && !((state.sessions || {})[s.id] || {}).completed).map((s: any) => ({ s, date: d.date })));
    if (ahead.length) findings.push({ group: 'stage', key: 'stage:' + key, date: ahead[0].date, text: `${DC_LABEL.stage}: ${LIB[key] ? LIB[key].name : key} Stufe ${ahead[0].s.spec.lib.stage + 1} geplant, Ist-Werte erlauben höchstens Stufe ${st0.target + 1} (${dm(ahead[0].date)})` });
  }
  const swimSoon = soon7.flatMap((d: any) => d.sessions.filter((s: any) => s.stage && s.stage.ladder === 'swim' && !s.cancelled).map((s: any) => ({ s, date: d.date })));
  if (swimSoon.length) {
    try {
      const v = C.swimStageVerdict(state, weeks, today, swimSoon[0].s.stage.n);
      const over = swimSoon.find((x: any) => x.s.stage.n > v.n);
      if (over && over.s.stage.n > v.n) findings.push({ group: 'stage', key: 'stage:swim', date: over.date, text: `${DC_LABEL.stage}: Kraul-Stufe ${over.s.stage.n} geplant, Nachweise erlauben Stufe ${v.n} (${dm(over.date)})` });
    } catch (e) { /* ohne Schwimm-Nachweise nichts zu prüfen */ }
  }

  // 6) Verwaiste Anpassungen: Einheit gibt es im Plan nicht (mehr)
  const ids = new Set<string>(); (baseWeeks || []).forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((s: any) => s && s.id && ids.add(s.id))));
  const dates = new Set<string>(); (baseWeeks || []).forEach((w: any) => (w.days || []).forEach((d: any) => dates.add(d.date)));
  const active = C.activeAdjustments(state.adjustments || {});
  active.forEach((a: any) => { if (a && a.type === 'add' && a.session && a.session.id) ids.add(a.session.id); });
  const orphans: string[] = [];
  active.forEach((a: any) => {
    if (!a) return;
    const orphan = a.type === 'add' ? !dates.has(a.to) : !!a.sessionId && !ids.has(a.sessionId);
    if (orphan) orphans.push(a.type || 'modify');
  });
  // eine Zeile je Nutzer (nach einem neuen Plan bleiben alte Anpassungen stehen; sie wirken nicht mehr, werden aber nicht gelöscht)
  if (orphans.length) findings.push({ group: 'orphans', key: 'orphans', text: `${DC_LABEL.orphans}: ${orphans.length} Anpassungen für Einheiten, die es im Plan nicht mehr gibt (wirken nicht)` });

  return { findings, fixes };
}
/** Gruppiert für die Anzeige: je Gruppe Anzahl und Beispiele */
export function summarize(findings: DCFinding[]): { group: DCGroup; label: string; count: number; fixed: number; examples: string[] }[] {
  const by = new Map<DCGroup, DCFinding[]>(); findings.forEach(f => by.set(f.group, [...(by.get(f.group) || []), f]));
  return [...by.entries()].map(([g, l]) => ({ group: g, label: DC_LABEL[g], count: l.length, fixed: l.filter(f => f.fixed).length, examples: l.slice(0, 3).map(f => f.text) }));
}
