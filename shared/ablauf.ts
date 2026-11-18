/* Auftrag 37: der „Ablauf“ einer Einheit – eine Liste von oben nach unten: Aufwärmen → Sätze mit Wiederholungen → Ausklang
   (Schwimmen: Einschwimmen → Technik → Sätze → Ausschwimmen; gleichmäßige Einheiten: Aufwärmen / Hauptteil / Ausklang; Kraft: Übungen).
   Vorher standen „Abschnitte“ (Auftrag 35) und „Intervalle“ (Auftrag 22/36) getrennt mit je eigener Liste und eigenem Bearbeiten.
   Ein Modell für Anzeige und Bearbeiten: jede Zeile hat Soll (grau), Ist (fett) und ein kurzes Urteil (✓, zu hart, zu locker, anders …).
   Gespeichert wird weiter in den bestehenden Feldern (metrics.sections, metrics.intervals, metrics.exercises), damit vorhandene Daten,
   Coach, Scores, Schwimm-Stufen und Sync unverändert weiterlaufen (siehe ENTSCHEIDUNGEN.md). */
import { plannedIntervals, evaluateIntervals, actualRows, stampRows, ivGroups, ivAttrs, ivDiff, targetOfRow, rowHasValues, secToPace, strokeLabel,
  type IvRow, type IvTarget, type IvThresholds, type IvLine, type IvEval } from './intervals';
import { sectionsOf, SEC_PARTS, plannedShape, zoneOfHr, applyTotals, type SecRow, type SecPart, type SecResult } from './sections';

export type AbSport = 'run' | 'bike' | 'swim' | 'strength';
export interface AbVerdict { word: string; cls: '' | 'good' | 'bad' | 'warn' | 'info' | 'plan' }
export interface AbSec { kind: 'sec'; key: string; part: SecPart; label: string; soll: string; ist: string; verdict: AbVerdict | null; plan: boolean; row: SecRow | null }
export interface AbRep { kind: 'rep'; key: string; i: number; n: number; soll: string; ist: string; verdict: AbVerdict | null; plan: boolean; line: IvLine | null }
export interface AbSet { kind: 'set'; key: string; gi: number; idx: number[]; label: string; count: string; reps: AbRep[] }
export interface AbEx { kind: 'ex'; key: string; i: number; label: string; soll: string; ist: string; verdict: AbVerdict | null; plan: boolean }
export type AbItem = AbSec | AbSet | AbEx;
export interface Ablauf { sport: string; items: AbItem[]; e: IvEval | null; targets: IvTarget[]; rows: IvRow[]; sec: SecResult | null; missingParts: SecPart[]; ivSource: string; secSource: string }

const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const paceSec = (v: any): number | null => { if (typeof v === 'number') return v; const m = /^(\d+)[:.,](\d{2})$/.exec(String(v == null ? '' : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };
const de = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');
const clock = (sec: number) => secToPace(sec);
const minTxt = (sec: number) => (sec < 60 ? `${Math.round(sec)} s` : sec % 60 ? `${clock(sec)} min` : `${sec / 60} min`);

export const VERDICT: Record<string, AbVerdict> = {
  ok: { word: '✓', cls: 'good' }, hard: { word: 'zu hart', cls: 'bad' }, easy: { word: 'zu locker', cls: 'warn' }, short: { word: 'kürzer', cls: 'warn' },
  plan: { word: 'wie geplant', cls: 'plan' }, missing: { word: 'nicht gemacht', cls: '' }, extra: { word: 'zusätzlich', cls: 'info' }, other: { word: 'anders', cls: 'info' }
};
/** „Kraul statt Brust“ → „Kraul (statt Brust)“ */
export const diffText = (d: string[]) => d.map(x => x.replace(/^(.*?) statt (.*)$/, '$1 (statt $2)')).join(', ');

/* ---------- Wiederholungen ---------- */
/** Liste zum Bearbeiten: von Hand bzw. „wie geplant“ wie gespeichert, sonst die zugeordneten Werte der Uhr in Reihenfolge des Plans, dann zusätzliche.
    (vorher editableRows in web/src/views/intervalsui.ts) */
export function ivRowsFor(planned: any, st: any, act: any, thr: IvThresholds, sport: string): { rows: IvRow[]; targets: IvTarget[]; e: IvEval | null } {
  const targets = ['run', 'bike', 'swim'].includes(sport) ? plannedIntervals(planned, thr) : [];
  if (!['run', 'bike', 'swim'].includes(sport)) return { rows: [], targets, e: null };
  const e = evaluateIntervals(planned || { sport }, st || {}, act, thr, sport);
  const ar = actualRows(st || {}, act, sport);
  let rows: IvRow[];
  if (ar.source === 'manual' || ar.source === 'plan') rows = ar.rows.map(r => ({ ...r }));
  else if (!e) rows = targets.map(() => ({}));
  else rows = [...e.lines.filter(l => !l.extra).map(l => (l.row ? { ...l.row } : {})), ...e.lines.filter(l => l.extra).map(l => ({ ...l.row! }))];
  return { rows: stampRows(rows, targets, sport), targets, e };
}
/** Urteil zu Zeile i: von Hand über die Zeile selbst, sonst die zugeordnete Zeile */
function lineOf(e: IvEval | null, rows: IvRow[], i: number, own: boolean, nTargets: number): IvLine | null {
  if (!e) return null;
  if (own) { const r = rows[i]; return e.lines.find(l => l.row === r) || null; }
  return e.lines.filter(l => !l.extra)[i] || e.lines.filter(l => l.extra)[i - nTargets] || null;
}
/** Soll einer Wiederholung in Worten („100 m Brust · 1:50-1:58/100 m“) */
export function repSoll(t: IvTarget | null, sport: string): string {
  if (!t) return 'ohne Soll';
  const size = sport === 'swim' ? (t.m ? `${t.m} m` : t.label) : t.sec ? minTxt(t.sec) : t.label;
  const what = sport === 'swim' ? [strokeLabel(t.stroke), (t.gear || []).length ? `mit ${t.gear!.map(g => g === 'buoy' ? 'Pull Buoy' : g === 'board' ? 'Kickboard' : g === 'paddles' ? 'Paddles' : g === 'fins' ? 'Flossen' : g).join(' und ')}` : ''].filter(Boolean).join(' ') : `Zone ${t.zone}`;
  const perf = sport === 'swim' && t.pace100 ? `${clock(t.pace100[0])}-${clock(t.pace100[1])}/100 m` : sport === 'run' && t.pace ? `${clock(t.pace[0])}-${clock(t.pace[1])}/km` : sport === 'bike' && t.power ? `${t.power[0]}-${t.power[1]} W` : t.hr ? `Puls ${t.hr[0]}${t.hr[1] ? '-' + t.hr[1] : '+'}` : '';
  return [[size, what].filter(Boolean).join(' '), perf].filter(Boolean).join(' · ');
}
/** Ist einer Wiederholung („1:41 · 1:41/100 m · Puls 150“); Strecke bzw. Dauer nur, wenn anders als geplant */
export function repIst(r: IvRow, t: IvTarget | null, sport: string): string {
  if (!rowHasValues(r)) return '';
  if (r.plan) return 'wie geplant';
  const bits: string[] = [];
  if (sport === 'swim') {
    const m = num(r.m) || (t ? t.m : null);
    if (r.m && (!t || r.m !== t.m)) bits.push(`${r.m} m`);
    if (r.sec) bits.push(clock(r.sec));
    const p = r.pace100 || (r.sec && m ? secToPace(r.sec / (m / 100)) : '');
    if (p) bits.push(`${p}/100 m`);
  } else {
    if (r.sec && (!t || Math.abs(r.sec - (t.sec || 0)) > 2)) bits.push(minTxt(r.sec)); else if (r.m) bits.push(`${r.m} m`); else if (r.sec) bits.push(minTxt(r.sec));
    if (sport === 'run' && (r.pace || (r.sec && r.m))) bits.push(`${r.pace || secToPace(r.sec! / (r.m! / 1000))}/km`);
    if (sport === 'bike' && r.power) bits.push(`${r.power} W`); else if (sport === 'bike' && r.speed) bits.push(`${String(r.speed).replace('.', ',')} km/h`);
  }
  if (r.hr) bits.push(`Puls ${r.hr}`);
  if (!bits.length && r.rpe) bits.push(`RPE ${r.rpe}`);
  if (r.aborted) bits.push('abgebrochen');
  return bits.join(' · ');
}
function repVerdict(l: IvLine | null, r: IvRow, t: IvTarget | null, done: boolean): AbVerdict | null {
  const diff = l && l.diff && l.diff.length;
  if (l && l.extra) return VERDICT.extra;
  if (!rowHasValues(r)) return t && done ? VERDICT.missing : t ? null : VERDICT.extra;
  if (!t) return VERDICT.extra;
  const v = l ? l.verdict : null;
  if (v === 'plan') return diff ? VERDICT.other : VERDICT.plan;
  if (v && VERDICT[v]) return VERDICT[v];
  return diff ? VERDICT.other : null;
}

/* ---------- Abschnitte ---------- */
/** geplante Minuten (Schwimmen: Meter) eines Abschnitts (vorher plannedMin in web/src/views/sectionsui.ts) */
export function plannedPart(planned: any, part: SecPart): number | null {
  const steps: any[] = (planned && planned.spec && planned.spec.steps) || [];
  if (part === 'tech') { const t = steps.filter(s => s.part === 'main' && ['drill', 'kick'].includes(s.mode)); return t.length ? t.reduce((a, s) => a + (s.reps || 1) * (s.m || 0), 0) : null; }
  const ss = steps.filter(s => s.part === part && (part !== 'main' || !['drill', 'kick'].includes(s.mode)));
  if (!ss.length) return null;
  return planned.sport === 'swim' ? ss.reduce((a, s) => a + (s.reps || 1) * (s.m || 0), 0) : ss.reduce((a, s) => a + (s.reps || 1) * (s.min || 0) + Math.max(0, (s.reps || 1) - 1) * (s.restMin || 0), 0);
}
/** Welche Abschnitte zeigt der Ablauf? Alle der Sportart; mit Sätzen kein „Hauptteil“ (die Sätze sind der Hauptteil);
    Schwimm-Technik nur, wenn geplant oder eingetragen; gelöschte (off) nicht. */
export function partsShown(sport: string, planned: any, secRows: SecRow[], hasSets: boolean): { shown: SecPart[]; missing: SecPart[] } {
  const all = ((SEC_PARTS as any)[sport] || []).map((x: any) => x[0]) as SecPart[];
  const rowOf = (p: SecPart) => secRows.find(r => r.part === p);
  const has = (p: SecPart) => { const r = rowOf(p); return !!r && !r.off && (!!r.added || Object.keys(r).some(k => k !== 'part' && (r as any)[k] != null && (r as any)[k] !== '')); };
  const want = all.filter(p => {
    const r = rowOf(p); if (r && r.off) return false;
    if (has(p)) return true;
    if (p === 'main' && hasSets) return false;
    if (p === 'tech') return plannedPart(planned, 'tech') != null;
    return true;
  });
  return { shown: want, missing: all.filter(p => !want.includes(p)) };
}
function secSoll(planned: any, part: SecPart, sport: string): string {
  const pm = plannedPart(planned, part); if (pm == null) return planned && planned.spec ? '' : '';
  const z = part === 'main' ? plannedShape(planned).zone : part === 'warm' || part === 'cool' ? 1 : null;
  return [sport === 'swim' ? `${pm} m` : `${pm} min`, z && sport !== 'swim' ? `Zone ${z}` : ''].filter(Boolean).join(' · ');
}
export function secIst(r: SecRow | null, sport: string): string {
  if (!r || r.off) return '';
  if (r.plan) return 'wie geplant';
  const bits: string[] = [];
  if (num(r.min) != null) bits.push(`${de(num(r.min)!)} min`);
  if (sport === 'swim' && num(r.meters) != null) bits.push(`${Math.round(num(r.meters)!)} m`); else if (num(r.km) != null) bits.push(`${de(num(r.km)!, 2)} km`);
  if (sport === 'run' && paceSec(r.pace)) bits.push(`${clock(paceSec(r.pace)!)}/km`);
  if (sport === 'swim' && paceSec(r.pace100)) bits.push(`${clock(paceSec(r.pace100)!)}/100 m`);
  if (sport === 'bike' && num(r.power) != null) bits.push(`${Math.round(num(r.power)!)} W`); else if (sport === 'bike' && num(r.speed) != null) bits.push(`${de(num(r.speed)!)} km/h`);
  if (num(r.hr) != null) bits.push(`Puls ${Math.round(num(r.hr)!)}`);
  return bits.join(' · ');
}
function secVerdict(r: SecRow | null, part: SecPart, planned: any, sport: string, lthr: number | null | undefined): AbVerdict | null {
  if (!r || r.off || !secIst(r, sport)) return null;
  if (r.plan) return VERDICT.plan;
  const z = part === 'main' ? plannedShape(planned).zone : null;
  if (z && lthr && num(r.hr) != null && sport !== 'swim') { const got = zoneOfHr(num(r.hr)!, lthr); return got > z ? VERDICT.hard : got < z - 1 ? VERDICT.easy : VERDICT.ok; }
  const pm = plannedPart(planned, part);
  const got = sport === 'swim' ? num(r.meters) : num(r.min);
  if (pm && got != null && Math.abs(got - pm) / pm > 0.25) return VERDICT.other;
  return VERDICT.ok;
}

/* ---------- Kraft ---------- */
export function exercisesFor(planned: any, st: any): { list: any[]; own: boolean } {
  const m = (st && st.metrics) || {};
  if (Array.isArray(m.exercises)) return { list: m.exercises.map((e: any) => ({ ...e })), own: true };
  return { list: ((planned && planned.spec && planned.spec.exercises) || []).map((e: any) => ({ ...e, kg: null })), own: false };
}
const exTxt = (e: any) => [e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.sets ? `${e.sets} Sätze` : e.reps ? String(e.reps) : '', num(e.kg) != null ? `${de(num(e.kg)!)} kg` : ''].filter(Boolean).join(' · ');

/* ---------- alles zusammen ---------- */
export function buildAblauf(planned: any, st: any, act: any, thr: IvThresholds, sport: string, o: { done?: boolean; free?: boolean; none?: boolean } = {}): Ablauf {
  const items: AbItem[] = [];
  if (sport === 'strength') {
    const { list, own } = exercisesFor(planned, st);
    const soll: any[] = (planned && planned.spec && planned.spec.exercises) || [];
    list.forEach((e, i) => {
      const p = soll.find(x => x.name === e.name) || null;
      const ist = own ? exTxt(e) : '';
      const v = !own ? null : e.plan ? VERDICT.plan : !p ? VERDICT.extra : String(p.sets) === String(e.sets) && String(p.reps) === String(e.reps) ? VERDICT.ok : VERDICT.other;
      items.push({ kind: 'ex', key: 'ex:' + i, i, label: e.name || `Übung ${i + 1}`, soll: p ? exTxt(p) : own ? '' : exTxt(e), ist: e.plan ? 'wie geplant' : ist, verdict: v, plan: !!e.plan });
    });
    return { sport, items, e: null, targets: [], rows: [], sec: null, missingParts: [], ivSource: 'none', secSource: 'none' };
  }
  if (!['run', 'bike', 'swim'].includes(sport)) return { sport, items, e: null, targets: [], rows: [], sec: null, missingParts: [], ivSource: 'none', secSource: 'none' };
  const pl = o.free && planned ? { ...planned, spec: null } : planned;
  const r0 = o.none ? { rows: [] as IvRow[], targets: [] as IvTarget[], e: null } : ivRowsFor(pl, st, act, thr, sport);
  const { targets, e } = r0; let rows = r0.rows;
  // andere Intervalle als geplant: eigene Liste ohne Soll, gleich mit einer leeren Zeile
  if (o.free && !rows.length) rows = [{ ti: null }];
  const ar = actualRows(st || {}, act, sport);
  const own = ar.source === 'manual' || ar.source === 'plan';
  const sec = sectionsOf(planned || { sport }, st || {}, act, thr, sport);
  const hasSets = !o.none && (rows.length > 0 || targets.length > 0 || !!o.free);
  const { shown, missing } = partsShown(sport, planned, sec.rows, hasSets);
  const lthr = sport === 'bike' ? thr.lthrBike : thr.lthrRun;
  // von Hand: mit den vervollständigten Zeilen bewerten (gleiche Objekte → Urteil je Zeile eindeutig)
  const e2 = own ? evaluateIntervals(pl || { sport }, { ...(st || {}), metrics: { ...((st && st.metrics) || {}), intervals: rows }, metricsSrc: { ...((st && st.metricsSrc) || {}), intervals: 'manual' } }, act, thr, sport) : e;
  const secItem = (p: SecPart): AbSec => {
    const r = sec.rows.find(x => x.part === p) || null;
    return { kind: 'sec', key: 'sec:' + p, part: p, label: ((SEC_PARTS as any)[sport] as [SecPart, string][]).find(x => x[0] === p)![1], soll: secSoll(planned, p, sport), ist: secIst(r, sport), verdict: secVerdict(r, p, planned, sport, lthr), plan: !!(r && r.plan), row: r };
  };
  const before = shown.filter(p => p === 'warm' || p === 'tech'), after = shown.filter(p => p === 'main' || p === 'cool');
  before.forEach(p => items.push(secItem(p)));
  if (hasSets) {
    ivGroups(rows, targets, sport).forEach((g, gi) => {
      const reps: AbRep[] = g.idx.map((i, k) => {
        const r = rows[i] || {}; const t = targetOfRow(rows, targets, i); const l = lineOf(e2, rows, i, own, targets.length);
        const d = l && l.diff && l.diff.length ? l.diff : rowHasValues(r) ? ivDiff(ivAttrs(r, t, sport), t, sport) : [];
        const ist = [repIst(r, t, sport), d.length ? diffText(d) : ''].filter(Boolean).join(' · ');
        return { kind: 'rep', key: 'rep:' + i, i, n: k + 1, soll: repSoll(t, sport), ist, verdict: repVerdict(l, r, t, !!o.done), plan: !!r.plan, line: l };
      });
      // Satz-Kopf: „3 × 100 m Brust · 2/3 im Ziel“ bzw. bei gemischten Lagen „3 × 100 m (2 Brust, 1 Kraul)“
      let label = g.label;
      if (sport === 'swim' && g.reps > 1 && !g.attrs.ownTitle) {
        const cnt = new Map<string, number>(); g.idx.forEach(i => { const a = ivAttrs(rows[i], targetOfRow(rows, targets, i), sport); const k = strokeLabel(a.stroke) || '?'; cnt.set(k, (cnt.get(k) || 0) + 1); });
        if (cnt.size > 1) { const m0 = /^(\d+ × [\d,.]+ m)/.exec(g.label); if (m0) label = `${m0[1]} (${[...cnt.entries()].map(([k, n]) => `${n} ${k}`).join(', ')})`; }
      }
      const entered = reps.filter(r => r.ist).length, ok = reps.filter(r => r.verdict === VERDICT.ok).length, judged = reps.filter(r => r.verdict && ['good', 'bad', 'warn'].includes(r.verdict.cls) && r.verdict !== VERDICT.short).length;
      const planN = reps.filter(r => r.verdict === VERDICT.plan).length;
      const count = judged ? `${ok}/${g.reps} im Ziel` : planN === g.reps ? 'wie geplant' : entered ? `${entered}/${g.reps} eingetragen` : '';
      items.push({ kind: 'set', key: 'set:' + gi, gi, idx: g.idx, label, count, reps });
    });
  }
  after.forEach(p => items.push(secItem(p)));
  return { sport, items, e: e2, targets, rows, sec, missingParts: missing, ivSource: ar.source, secSource: sec.source };
}

/* ---------- „Wie geplant gemacht“ ---------- */
/** Füllt den ganzen Ablauf mit dem Soll (markiert „wie geplant“, nicht als gemessen). Was schon eingetragen oder von der Uhr gemessen ist,
    bleibt (Uhrdaten haben Vorrang). Gesamtwerte folgen aus dem Ablauf, solange sie nicht selbst eingetragen bzw. gemessen sind. */
export function fillAsPlanned(planned: any, st0: any, act: any, thr: IvThresholds, sport: string): any {
  let st = { ...(st0 || {}), metrics: { ...((st0 && st0.metrics) || {}) }, metricsSrc: { ...((st0 && st0.metricsSrc) || {}) }, metricsManual: { ...((st0 && st0.metricsManual) || {}) } };
  if (sport === 'strength') {
    const { list, own } = exercisesFor(planned, st);
    if (!own && list.length) { st.metrics.exercises = list.map(e => ({ ...e, plan: true })); st.metricsSrc.exercises = 'manual'; }
    return st;
  }
  if (!['run', 'bike', 'swim'].includes(sport)) return st;
  const { rows, targets } = ivRowsFor(planned, st, act, thr, sport);
  const ar = actualRows(st, act, sport);
  const watchIv = ar.source !== 'manual' && ar.source !== 'plan' && ar.source !== 'none';
  let ivRows: IvRow[] | null = null;
  if (!watchIv && rows.length) {
    ivRows = rows.map((r, i) => {
      if (rowHasValues(r)) return r;
      const t = targetOfRow(rows, targets, i); if (!t) return r;
      return { ...r, plan: true, ti: t.i, set: r.set ?? t.set, ...(sport === 'swim' ? { m: t.m, stroke: r.stroke || t.stroke || null, gear: Array.isArray(r.gear) ? r.gear : [...(t.gear || [])] } : { sec: t.sec }), ...(t.restSec ? { restSec: t.restSec } : {}) };
    });
    st.metrics.intervals = ivRows;
    if (ar.source === 'manual') st.metricsSrc.intervals = 'manual'; else { st.metricsSrc.intervals = 'plan'; delete st.metricsManual.intervals; }
  }
  const sec = sectionsOf(planned || { sport }, st, act, thr, sport);
  const watchSec = sec.source !== 'manual' && sec.source !== 'plan' && sec.source !== 'none';
  if (!watchSec) {
    const hasSets = rows.length > 0 || targets.length > 0;
    const { shown } = partsShown(sport, planned, sec.rows, hasSets);
    const cur = sec.rows.map(r => ({ ...r }));
    const next: SecRow[] = [];
    for (const p of ((SEC_PARTS as any)[sport] as [SecPart, string][]).map(x => x[0])) {
      const r = cur.find(x => x.part === p);
      if (r && (r.off || secIst(r, sport))) { next.push(r); continue; }
      if (!shown.includes(p)) continue;
      const pm = plannedPart(planned, p); if (pm == null) continue;
      next.push({ part: p, plan: true, ...(sport === 'swim' ? { meters: String(pm) } : { min: String(pm) }) });
    }
    if (next.some(r => r.plan || secIst(r, sport))) {
      st.metrics.sections = next;
      st.metricsSrc.sections = sec.source === 'manual' ? 'manual' : 'plan';
      if (sec.source !== 'manual') delete st.metricsManual.sections;
    }
  }
  return applyTotals(st, sport, ivRows ?? undefined, targets);
}
