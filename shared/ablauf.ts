/* Auftrag 37: der „Ablauf“ einer Einheit – eine Liste von oben nach unten: Aufwärmen → Sätze mit Wiederholungen → Ausklang
   (Schwimmen: Einschwimmen → Technik → Sätze → Ausschwimmen; gleichmäßige Einheiten: Aufwärmen / Hauptteil / Ausklang; Kraft: Übungen).
   Vorher standen „Abschnitte“ (Auftrag 35) und „Intervalle“ (Auftrag 22/36) getrennt mit je eigener Liste und eigenem Bearbeiten.
   Ein Modell für Anzeige und Bearbeiten: jede Zeile hat Soll (grau), Ist (fett) und ein kurzes Urteil (✓, zu hart, zu locker, anders …).
   Gespeichert wird weiter in den bestehenden Feldern (metrics.sections, metrics.intervals, metrics.exercises), damit vorhandene Daten,
   Coach, Scores, Schwimm-Stufen und Sync unverändert weiterlaufen (siehe ENTSCHEIDUNGEN.md). */
import { plannedIntervals, evaluateIntervals, actualRows, stampRows, ivGroups, ivAttrs, ivDiff, targetOfRow, rowHasValues, secToPace, strokeLabel, stepOrder,
  type IvRow, type IvTarget, type IvThresholds, type IvLine, type IvEval } from './intervals';
import { sectionsOf, SEC_PARTS, plannedShape, zoneOfHr, applyTotals, plannedPart, type SecRow, type SecPart, type SecResult } from './sections';
export { plannedPart };
import { changedOf, actualTitle } from './results';

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
  if (ar.source === 'manual' || ar.source === 'plan') {
    rows = ar.rows.map(r => ({ ...r }));
    // Auftrag 38: Listen von vor 3.26 kennen die lockeren Teile des Hauptteils nicht – an ihrer Stelle (leer, also „wie geplant“) einfügen
    if (!rows.some(r => r && r.full) && targets.some(t => t.steady)) rows = withSteady(stampRows(rows, targets, sport), targets);
  }
  else if (!e) rows = stepOrder(targets).map(t => ({ ti: t.i }));
  else rows = [...e.lines.filter(l => !l.extra).map(l => (l.row ? { ...l.row, ti: l.target ? l.target.i : null } : { ti: l.target ? l.target.i : null })), ...e.lines.filter(l => l.extra).map(l => ({ ...l.row!, ti: null }))];
  return { rows: stampRows(rows, targets, sport), targets, e };
}
/** fehlende lockere Teile an ihrer Stelle einfügen (Reihenfolge der Einheit) */
function withSteady(rows: IvRow[], targets: IvTarget[]): IvRow[] {
  const ord = stepOrder(targets); const pos = new Map(ord.map((t, k) => [t.i, k]));
  const used = new Set(rows.filter(r => r && r.ti != null).map(r => r.ti!));
  const out = [...rows];
  for (const t of ord) {
    if (!t.steady || used.has(t.i)) continue;
    const p = pos.get(t.i)!;
    let at = out.length; let cur = -1;
    for (let k = 0; k < out.length; k++) { const r = out[k]; if (r && r.ti != null && pos.has(r.ti)) cur = pos.get(r.ti)!; if (cur > p) { at = k; break; } }
    out.splice(at, 0, { ti: t.i, set: t.set, steady: true });
  }
  return out;
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
  const what = sport === 'swim' ? [strokeLabel(t.stroke), (t.gear || []).length ? `mit ${t.gear!.map(g => g === 'buoy' ? 'Pull Buoy' : g === 'board' ? 'Kickboard' : g === 'paddles' ? 'Paddles' : g === 'fins' ? 'Flossen' : g).join(' und ')}` : ''].filter(Boolean).join(' ') : t.title ? t.title : t.hill ? 'bergauf' : `Zone ${t.zone}`;
  const perf = sport === 'swim' && t.pace100 ? `${clock(t.pace100[0])}-${clock(t.pace100[1])}/100 m` : sport === 'run' && t.pace ? `${clock(t.pace[0])}-${clock(t.pace[1])}/km` : sport === 'bike' && t.power ? `${t.power[0]}-${t.power[1]} W` : t.hr ? `Puls ${t.hr[0]}${t.hr[1] ? '-' + t.hr[1] : '+'}` : '';
  // Auftrag 38: kurze bzw. Berg-Wiederholungen: Ausführung statt Puls bzw. Tempo
  return [[size, what].filter(Boolean).join(' '), t.cue || '', perf].filter(Boolean).join(' · ');
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
function repVerdict(l: IvLine | null, r: IvRow, t: IvTarget | null, done: boolean, watch = false): AbVerdict | null {
  const diff = l && l.diff && l.diff.length;
  if (l && l.extra) return VERDICT.extra;
  // Auftrag 38: nicht eingetragen in einer erledigten Einheit = wie geplant (nicht gemessen); nur aus der Uhr heißt „nicht gefunden“ nicht gemacht
  if (!rowHasValues(r)) return t && done ? (watch ? (t.steady ? null : VERDICT.missing) : VERDICT.plan) : t ? null : VERDICT.extra;
  if (!t) return VERDICT.extra;
  const v = l ? l.verdict : null;
  if (v === 'plan') return diff ? VERDICT.other : VERDICT.plan;
  if (v && VERDICT[v]) return VERDICT[v];
  return diff ? VERDICT.other : null;
}

/* ---------- Abschnitte ---------- */
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
function secVerdict(r: SecRow | null, part: SecPart, planned: any, sport: string, lthr: number | null | undefined, done = false, watch = false): AbVerdict | null {
  // Auftrag 38: abgehakt ohne Werte = wie geplant (nicht gemessen); aus der Uhr ohne Abschnitt kein Urteil
  if (!r || r.off || !secIst(r, sport)) return done && !watch && !(r && r.off) && plannedPart(planned, part) != null ? VERDICT.plan : null;
  if (r.plan) return VERDICT.plan;
  const z = part === 'main' ? plannedShape(planned).zone : null;
  if (z && lthr && num(r.hr) != null && sport !== 'swim') { const got = zoneOfHr(num(r.hr)!, lthr); return got > z ? VERDICT.hard : got < z - 1 && !(planned && planned.spec && planned.spec.kind === 'runwalk') /* Auftrag 40: Gehpausen drücken den Puls */ ? VERDICT.easy : VERDICT.ok; }
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
      // Auftrag 38: abgehakt ohne eigene Übungen = wie geplant (nicht gemessen)
      const v = !own ? (o.done ? VERDICT.plan : null) : e.plan ? VERDICT.plan : !p ? VERDICT.extra : String(p.sets) === String(e.sets) && String(p.reps) === String(e.reps) ? VERDICT.ok : VERDICT.other;
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
    return { kind: 'sec', key: 'sec:' + p, part: p, label: ((SEC_PARTS as any)[sport] as [SecPart, string][]).find(x => x[0] === p)![1], soll: secSoll(planned, p, sport), ist: secIst(r, sport), verdict: secVerdict(r, p, planned, sport, lthr, !!o.done, !['manual', 'plan', 'none'].includes(sec.source)), plan: !!(r && r.plan), row: r };
  };
  const before = shown.filter(p => p === 'warm' || p === 'tech'), after = shown.filter(p => p === 'main' || p === 'cool');
  before.forEach(p => items.push(secItem(p)));
  if (hasSets) {
    ivGroups(rows, targets, sport).forEach((g, gi) => {
      const reps: AbRep[] = g.idx.map((i, k) => {
        const r = rows[i] || {}; const t = targetOfRow(rows, targets, i); const l = lineOf(e2, rows, i, own, targets.length);
        const d = l && l.diff && l.diff.length ? l.diff : rowHasValues(r) ? ivDiff(ivAttrs(r, t, sport), t, sport) : [];
        const ist = [repIst(r, t, sport), d.length ? diffText(d) : ''].filter(Boolean).join(' · ');
        return { kind: 'rep', key: 'rep:' + i, i, n: k + 1, soll: repSoll(t, sport), ist, verdict: repVerdict(l, r, t, !!o.done, !own && ar.source !== 'none'), plan: !!r.plan, line: l };
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
  return applyTotals(st, sport, ivRows ?? undefined, targets, planned);
}

/* ---------- Auftrag 38: „Gemacht gilt überall“ ----------
   Aus dem eingetragenen Ablauf entsteht, was wirklich gemacht wurde: Titel („Rad 3 × 10 min Sweet Spot, statt 2 × 8 min“), die Änderungen
   in Worten („3 × 10 min statt 2 × 8 min“, „Aufwärmen 10 statt 15 min“) und ob es mehr oder weniger Belastungszeit war. Vorher wurden die
   Zahlen übernommen, Titel, Beschreibung und Coach blieben aber beim Plan. Eine Stelle für Einheit, Listen, Coach (Bewertung, Chat,
   KI-Kontext); Belastung, Scores, Woche und Trends lesen die Gesamtwerte, die applyTotals aus demselben Ablauf rechnet.
   Werte der Uhr (Runden) ändern den Titel nicht – dort ist das Gemessene ohnehin das Gemachte. */
export interface DoneSummary { changed: boolean; title: string; planTitle: string; changes: string[]; /** nur Sätze/Wiederholungen */ setChanges: string[]; short: string;
  /** Belastungszeit der harten Sätze in Minuten (Schwimmen: Meter): geplant / gemacht */ workPlan: number; workDone: number; more: 'more' | 'less' | null;
  /** Wort der Belastung („Sweet Spot“, „Schwelle“, „Zone 3“) */ word: string }
const SPN: Record<string, string> = { run: 'Lauf', bike: 'Rad', swim: 'Schwimmen' };
const ZW: Record<number, string> = { 1: 'ganz locker', 2: 'locker', 3: 'zügig', 4: 'Schwelle', 5: 'sehr hart' };
function wordOf(planned: any, t: IvTarget | null, zone: number | null, sport: string): string {
  if (t && t.title) return t.title;
  if (t && t.hill) return 'bergauf';
  if (sport === 'swim') return t && t.stroke ? strokeLabel(t.stroke) : '';
  const z = zone ?? (t ? t.zone : null);
  if (planned && planned.spec && planned.spec.kind === 'sweetspot' && z === 3) return 'Sweet Spot';
  return z ? ZW[z] || `Zone ${z}` : '';
}
const sizeT = (v: number | null, sport: string) => (v == null ? '' : sport === 'swim' ? `${Math.round(v)} m` : minTxt(v));
const descT = (n: number, size: number | null, sport: string) => `${n > 1 ? `${n} × ` : ''}${sizeT(size, sport)}`.trim();
const mode = (a: number[]) => { const c = new Map<number, number>(); a.forEach(x => c.set(x, (c.get(x) || 0) + 1)); return [...c.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null; };
export function doneSummary(planned: any, st: any, act: any, thr: IvThresholds, sport: string): DoneSummary | null {
  if (!planned || !planned.spec || planned.sport !== sport || !['run', 'bike', 'swim'].includes(sport)) return null;
  const ab = buildAblauf(planned, st, act, thr, sport, { done: true });
  const own = ab.ivSource === 'manual' || ab.ivSource === 'plan';
  const swim = sport === 'swim';
  const changes: string[] = [];
  const targets = ab.targets; const rows = ab.rows;
  const byStep = new Map<number, IvTarget[]>(); stepOrder(targets).forEach(t => { const l = byStep.get(t.set) || []; l.push(t); byStep.set(t.set, l); });
  const sizeOfT = (t: IvTarget | null) => (t ? (swim ? t.m : t.sec) : null);
  let workPlan = 0, workDone = 0; const hardPlan: string[] = [], hardDone: string[] = []; let word = ''; let hardChanged = false;
  byStep.forEach(ts => { if (!ts[0].steady) { workPlan += ts.reduce((a, t) => a + (sizeOfT(t) || 0), 0); hardPlan.push(descT(ts.length, sizeOfT(ts[0]), sport)); if (!word) word = wordOf(planned, ts[0], null, sport); } });
  if (own) {
    const groups = ivGroups(rows, targets, sport);
    const seen = new Set<number>();
    groups.forEach(g => {
      const m = /^[sp](\d+)$/.exec(g.key); const si = m ? +m[1] : null;
      const ts = si != null ? byStep.get(si) || null : null;
      const t0 = ts ? ts[0] : g.target;
      const sizes = g.idx.map(i => { const r = rows[i] || {}; const v = swim ? num(r.m) : num(r.sec); return v ?? sizeOfT(targetOfRow(rows, targets, i)); }).filter((x): x is number => x != null);
      const size = mode(sizes);
      const zone = g.attrs ? g.attrs.zone : null;
      const steady = t0 ? !!t0.steady && !(zone != null && zone >= 3) : zone != null && zone <= 2;
      const w = wordOf(planned, t0, zone, sport);
      // Auftrag 41: Schwimm-Sätze immer mit Lage („3 × 100 m Brust“)
      const dDesc = swim && w ? `${descT(g.reps, size, sport)} ${w}` : descT(g.reps, size, sport);
      if (!steady) { workDone += sizes.reduce((a, x) => a + x, 0); hardDone.push(dDesc); }
      if (!ts) { changes.push(`zusätzlich ${swim ? dDesc : [dDesc, w].filter(Boolean).join(' ')}`); if (!steady) hardChanged = true; return; }
      seen.add(si!);
      const pw = swim ? wordOf(planned, ts[0], null, sport) : '';
      const pDesc = pw ? `${descT(ts.length, sizeOfT(ts[0]), sport)} ${pw}` : descT(ts.length, sizeOfT(ts[0]), sport);
      const sizeDiff = size != null && sizeOfT(ts[0]) != null && Math.abs(size - sizeOfT(ts[0])!) > (swim ? 0 : 2);
      if (g.reps !== ts.length || sizeDiff) { changes.push(`${dDesc} statt ${pDesc}`); if (!ts[0].steady || !steady) hardChanged = true; }
      if (zone != null && zone !== ts[0].zone) { changes.push(`${dDesc} in Zone ${zone} statt ${ts[0].zone}`); if (!ts[0].steady) hardChanged = true; }
    });
    byStep.forEach((ts, si) => { if (!seen.has(si) && rows.length) { changes.push(`ohne ${[descT(ts.length, sizeOfT(ts[0]), sport), wordOf(planned, ts[0], null, sport)].filter(Boolean).join(' ')}`); if (!ts[0].steady) hardChanged = true; } });
  } else workDone = workPlan;
  const setChanges = [...changes];
  // Abschnitte (Aufwärmen, Technik, Ausklang): eigene Werte gegen das Soll
  ab.items.forEach(it => {
    if (it.kind !== 'sec') return;
    const pm = plannedPart(planned, it.part); if (!pm) return;
    const r = it.row; if (!r || r.plan || !(ab.secSource === 'manual')) return;
    const got = swim ? num(r.meters) : num(r.min); if (got == null) return;
    if (Math.abs(got - pm) >= (swim ? 25 : 1) && Math.abs(got - pm) / pm >= 0.1) changes.push(`${it.label} ${String(Math.round(got * 10) / 10).replace('.', ',')} statt ${pm}${swim ? ' m' : ' min'}`);
  });
  const secs = ab.sec ? ab.sec.rows : [];
  secs.filter(r => r.off).forEach(r => { const pm = plannedPart(planned, r.part); if (pm) changes.push(`ohne ${((SEC_PARTS as any)[sport] as [SecPart, string][]).find(x => x[0] === r.part)![1]}`); });
  const planTitle = String(planned.title || '');
  const more = !own || !workPlan ? null : workDone > workPlan * 1.02 ? 'more' : workDone < workPlan * 0.98 ? 'less' : null;
  // Auftrag 41: kurzer Titel – ein Satz: „Rad 3 × 10 min Sweet Spot“; mehrere Sätze: Sportart, Gesamt und Schwerpunkt („Schwimmen 1.250 m · Kraul“),
  // ohne Gesamt der Plan-Titel. Was anders war, steht nur in „Anders als geplant“ (changes), nie als lange Liste im Titel.
  const total = swim ? (num(st && st.metrics && st.metrics.meters) ?? (act && act.totals && act.totals.distanceM) ?? null) : (num(st && st.metrics && st.metrics.min) ?? null);
  const totTxt = total ? (swim ? `${String(Math.round(total)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m` : `${Math.round(total)} min`) : '';
  const one = hardDone.length === 1 ? hardDone[0] : '';
  const title = !(hardChanged && hardDone.length) ? planTitle
    : one ? `${SPN[sport]} ${one}${word && !(swim && one.endsWith(word)) ? ' ' + word : ''}`
    : totTxt ? `${SPN[sport]} ${totTxt}${word ? ' · ' + word : ''}` : planTitle;
  return { changed: changes.length > 0, title, planTitle, changes, setChanges, short: changes.join('; '), workPlan, workDone, more, word };
}
/** Satz für den Coach („3 × 10 min statt 2 × 8 min – mehr Sweet-Spot-Zeit (30 statt 16 min), gut.“) */
export function doneSentence(d: DoneSummary | null): string {
  if (!d || !d.changed) return '';
  const unit = d.title.startsWith('Schwimmen') ? 'm' : 'min';
  const fmt = (x: number) => unit === 'm' ? `${Math.round(x)} m` : `${Math.round(x / 60)} min`;
  const w = d.word && !/locker/.test(d.word) ? `${d.word.replace(/ /g, '-')}-Zeit` : 'Belastungszeit';
  const head = (d.setChanges.length ? d.setChanges : d.changes).slice(0, 3).join(', ');
  const rest = d.setChanges.length ? d.changes.filter(x => !d.setChanges.includes(x)).slice(0, 2) : [];
  const tail = rest.length ? ` ${rest.join(', ').replace(/^./, c => c.toUpperCase())}.` : '';
  if (d.more === 'more') return `${head} – mehr ${w} (${fmt(d.workDone)} statt ${fmt(d.workPlan)})${d.workDone > d.workPlan * 2 ? ', deutlich mehr als geplant: das kostet mehr Erholung, morgen locker' : ', gut'}.${tail}`;
  if (d.more === 'less') return `${head} – weniger ${w} als geplant (${fmt(d.workDone)} statt ${fmt(d.workPlan)}); gezählt wird, was du gemacht hast.${tail}`;
  return `${head} – gezählt wird das Gemachte.${tail}`;
}
/** Titel des Gemachten für alle Stellen (frühere Änderung „anders gemacht“ zuerst, sonst der Ablauf, sonst der Plan) */
export function doneTitle(s: any, st: any, act: any, thr: IvThresholds): string {
  if (!s) return '';
  if (changedOf(st)) return actualTitle(s, st, act);
  if (!st || !st.completed) return s.title;
  try { const d = doneSummary(s, st, act, thr, s.sport); return d && d.changed ? d.title : s.title; } catch (_) { return s.title; }
}
