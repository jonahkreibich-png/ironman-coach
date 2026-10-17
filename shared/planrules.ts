/* Plan-Regeln aus Auftrag 15 (für jeden Plan, Prüfung und Korrektur):
   1. Nur gewählte Sportarten (Teamsport nur, wenn angegeben). Was nicht gewählt ist, fliegt aus dem Plan.
   2. Gleiche Sportart nicht an zwei Tagen hintereinander, auch nicht über die Wochengrenze (So → Mo); Kraft nicht zweimal
      hintereinander für dieselbe Muskelgruppe. Geht es wegen fester Termine, Schwimmbad-Tagen oder Zeit nicht anders, bleibt es
      bei zwei Tagen hintereinander, aber eine der beiden Einheiten ist locker und kurz und sagt, warum (adjacentOk).
   Nie zwei harte Tage hintereinander prüft und korrigiert shared/intensity.ts.
   Feste Termine, Wettkämpfe, Spiele, Tests, Lernstufen, Erledigtes und Tage vor „from“ werden nicht verändert. */
import type { Profile } from './profile';
import { sportAllowed } from './sports';
import * as W from './workouts';
import { isLightQuality } from './intensity';

export interface RuleIssue { rule: 'sport' | 'sameSport' | 'strengthGroup'; week?: number; date?: string; msg: string }
const SPORT_DE: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Teamsport' };
/* längstens so lang darf die „kurze“ Einheit an einem Ausnahme-Tag sein */
export const SHORT_MIN = 45;

const live = (d: any) => (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && !s.removed);
/* Koppellauf gehört zur Radeinheit, er zählt nicht als eigener Lauftag */
const brick = (s: any) => /^(Koppellauf|Wechsel-Lauf)/.test(s.title || '');
const counts = (s: any) => !!s && !s.race && s.sport !== 'football' && s.sport !== 'rest' && !brick(s);
/* Kraft: Ganzkörper (ohne Bereich) überschneidet sich mit allem, sonst nur gleicher Bereich */
const sameGroup = (a: any, b: any) => a.sport === 'strength' && b.sport === 'strength' ? (!a.area || !b.area || a.area === b.area) : a.sport === b.sport;
const hardOf = (s: any) => !!s && (!!s.hard || !!s.race);
const gameOf = (s: any) => !!s && s.sport === 'football' && /spiel|match/i.test(s.title || '') && !/training/i.test(s.title || '');
/* lange Einheit (nicht nach dem Titel: „Langer Lauf 60 min mit Tempo“ ist eine Qualitätseinheit) */
const longOf = (s: any) => !!s && (!!s.long || (s.spec ? s.spec.kind === 'long' : /^Lang/.test(s.title || '')));
/* ausgenommene Paare: die eine Einheit ist als Ausnahme markiert, locker und kurz */
const excused = (s: any) => !!s.adjacentOk && !hardOf(s) && ((s.plannedMinutes || 0) <= SHORT_MIN + 1 || !!s.stage);
const allDays = (weeks: any[]) => weeks.flatMap((w: any) => (w.days || []).map((d: any) => ({ w, d })));
const nextDate = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

/* ---------- Prüfen ---------- */
export function checkPlanRules(weeks: any[], p: Profile, o: { from?: string | null } = {}): RuleIssue[] {
  const out: RuleIssue[] = [];
  const D = allDays(weeks).filter(x => !o.from || x.d.date >= o.from);
  for (const { w, d } of D) for (const s of live(d)) {
    if (s.race || sportAllowed(p, s.sport)) continue;
    out.push({ rule: 'sport', week: w.weekNumber, date: d.date, msg: `${d.date}: ${s.title} (${SPORT_DE[s.sport] || s.sport}), obwohl ${s.sport === 'football' ? 'kein Teamsport angegeben ist' : 'diese Sportart nicht gewählt ist'}.` });
  }
  for (let i = 1; i < D.length; i++) {
    const a = D[i - 1], b = D[i];
    if (nextDate(a.d.date) !== b.d.date) continue;
    for (const s of live(b.d).filter(counts)) {
      const other = live(a.d).filter(counts).find((x: any) => sameGroup(x, s));
      if (!other) continue;
      // zwei feste Termine der Person kann der Plan nicht ändern
      if ((other.fixed || other.frozen) && (s.fixed || s.frozen)) continue;
      if (excused(s) || excused(other)) continue;
      out.push({ rule: s.sport === 'strength' ? 'strengthGroup' : 'sameSport', week: b.w.weekNumber, date: b.d.date,
        msg: s.sport === 'strength' ? `${a.d.date} und ${b.d.date}: Kraft für dieselbe Muskelgruppe an zwei Tagen hintereinander.` : `${a.d.date} und ${b.d.date}: zweimal ${SPORT_DE[s.sport] || s.sport} hintereinander (${other.title} / ${s.title}).` });
    }
  }
  return out;
}

/* ---------- Korrigieren ---------- */
export interface RepairCtx {
  from?: string | null;
  /** Minuten an diesem Tag (0 = kein Training) */ dayCap?: (date: string) => number;
  /** darf die Einheit an diesem Tag liegen (harte Regeln, Schwimmbad)? */ allowed?: (s: any, date: string) => boolean;
  /** Einheiten, die bleiben müssen (z. B. heute schon erledigt) */ keep?: (s: any) => boolean;
  /** passende Qualität für eine (lange) Einheit dieser Phase, z. B. Tempo im langen Lauf */ quality?: (s: any, date: string, phase: string, from?: any) => any | null;
}
let KEEP: ((s: any) => boolean) | undefined;
const movable = (s: any, date: string, from?: string | null) => !!s && !s.fixed && !s.race && !s.frozen && !s.locked && !s.test && !/test/i.test(s.title || '') && s.sport !== 'football' && (!from || date >= from) && !brick(s) && !(KEEP && KEEP(s));

/* Nicht gewählte Sportarten entfernen (bewegliche Einheiten); liefert, was geändert wurde */
export function repairSports(weeks: any[], p: Profile, o: { from?: string | null } = {}): string[] {
  const fixes: string[] = [];
  for (const { d } of allDays(weeks)) {
    if (o.from && d.date < o.from) continue;
    const bad = live(d).filter((s: any) => !s.race && !sportAllowed(p, s.sport) && !s.frozen);
    if (!bad.length) continue;
    d.sessions = d.sessions.filter((s: any) => !bad.includes(s));
    bad.forEach((s: any) => fixes.push(`${d.date}: ${s.title} entfällt (${SPORT_DE[s.sport] || s.sport} nicht gewählt)`));
    if (!d.sessions.length) d.sessions = [{ id: `${bad[0].id || d.date}-rest`, sport: 'rest', title: 'Ruhetag' }];
  }
  return fixes;
}

/* Locker und kurz machen, mit Begründung in der Einheit */
export function easyShort(s: any, reason: string, maxMin = SHORT_MIN): any {
  const SHORT = Math.max(15, Math.min(SHORT_MIN, maxMin));
  const sp: W.Spec | undefined = s.spec;
  let nx: any = { ...s };
  const note = `Ausnahme: ${reason} Deshalb locker und kurz.`;
  let built = false;
  // Hügelsprints, Fahrtspiel, Steigerungen bleiben (nur kürzer); Schwimmen hat immer Technik und wird normal locker
  const keepLight = sp && !s.stage && (s.sport === 'run' || s.sport === 'bike') && isLightQuality(s) && !s.hard;
  if (keepLight && (s.plannedMinutes || 0) > SHORT) {
    let r = W.rebuildScaled({ ...s, spec: { ...sp, why: `${note} ${sp.why || ''}`.trim() } }, SHORT / s.plannedMinutes);
    for (let k = 0; k < 3 && r && r.plannedMinutes > SHORT; k++) r = W.rebuildScaled({ ...s, ...r }, SHORT / r.plannedMinutes * 0.95);
    if (r && r.plannedMinutes <= SHORT) { nx = { ...s, ...r, plannedKm: r.plannedKm ?? undefined }; built = true; }
  }
  if (built) { /* schon fertig */ } else if (keepLight && (s.plannedMinutes || 0) <= SHORT) {
    nx = { ...s, spec: { ...sp, why: `${note} ${sp.why || ''}`.trim() } }; nx.description = W.build(nx.spec).description; built = true;
  } else if (sp && !s.stage && sp.sport !== 'strength') {
    const ctx = sp.ctx;
    const min = Math.min(SHORT, s.plannedMinutes || SHORT);
    const e = s.sport === 'run' ? W.runEasy(ctx, Math.max(Math.min(20, SHORT), min)) : s.sport === 'bike' ? W.bikeEasy(ctx, Math.max(Math.min(30, SHORT), Math.min(SHORT, min))) : s.sport === 'swim' ? W.swimNormal(ctx, 'endurance', Math.max(Math.min(25, SHORT), min), 'base', Math.max(25, ...sp.steps.filter(x => x.mode === 'crawl' || x.mode === 'pull').map(x => x.m || 0))) : null;
    if (e) {
      e.why = `${note} ${s.sport === 'swim' ? 'Wassergefühl und Grundlage, ohne müde zu machen.' : 'Grundlage, ohne müde zu machen.'}`;
      if (sp.tip) e.tip = sp.tip;
      let b = W.build(e);
      for (let k = 0; k < 4 && b.plannedMinutes > SHORT; k++) b = W.build(W.scaleSpec(b.spec, SHORT / b.plannedMinutes * 0.97));
      const { hard, long, ...rest } = s; void hard; void long;
      nx = { ...rest, ...b, id: s.id }; built = true;
    }
  } else if (sp && sp.sport === 'strength' && (s.plannedMinutes || 0) > SHORT) {
    const r = W.rebuildScaled({ ...s, spec: { ...sp, why: `${note} ${sp.why || ''}`.trim() } }, SHORT / s.plannedMinutes); if (r) { nx = { ...s, ...r, plannedKm: undefined }; built = true; }
  }
  if (!built) {
    if (nx.spec) nx.spec = { ...nx.spec, why: `${note} ${nx.spec.why || ''}`.trim() };
    const d = String(nx.description || '');
    nx.description = d.includes('Warum: ') ? d.replace('Warum: ', `Warum: ${note} `) : `${d}\nWarum: ${note}`.trim();
  }
  nx.adjacentOk = reason;
  return nx;
}

/* Gleiche Sportart (bzw. Muskelgruppe) an zwei Tagen hintereinander: erst verschieben, sonst eine Einheit locker und kurz (mit Grund) */
export function repairSpacing(weeks: any[], p: Profile, o: RepairCtx = {}): string[] {
  const fixes: string[] = [];
  void p; KEEP = o.keep;
  const D0 = () => allDays(weeks);
  /* Passt die Einheit an diesen Tag, wenn „ohne“ dort bzw. daneben nicht mehr liegt? */
  const fitsDay = (D: any[], s: any, j: number, without: any[]): boolean => {
    const d = D[j].d;
    if (o.from && d.date < o.from) return false;
    const l = live(d).filter((y: any) => !without.includes(y));
    if (l.some((y: any) => y.race || gameOf(y) || sameGroup(y, s))) return false;
    if (l.filter((y: any) => !y.fixed || y.sport === 'football').length >= 2) return false;
    const near = [D[j - 1], D[j + 1]].filter(Boolean).filter(y => nextDate(y.d.date) === d.date || nextDate(d.date) === y.d.date);
    if (near.some(y => live(y.d).filter(counts).some((z: any) => !without.includes(z) && z !== s && sameGroup(z, s)))) return false;
    // harte Einheit: nie neben einem harten Tag oder Spiel, nicht am harten Tag
    if (hardOf(s) && (l.some((z: any) => hardOf(z) || gameOf(z)) || near.some(y => live(y.d).some((z: any) => !without.includes(z) && z !== s && (hardOf(z) || gameOf(z)))))) return false;
    // Kraft nicht am harten Tag und nicht am Tag davor
    if (s.sport === 'strength' && (l.some(hardOf) || (D[j + 1] && live(D[j + 1].d).some((z: any) => !without.includes(z) && (hardOf(z) || gameOf(z)))))) return false;
    const used = l.filter((y: any) => !(y.fixed && y.sport === 'football')).reduce((m: number, y: any) => m + (y.plannedMinutes || 0), 0);
    if (o.dayCap && used + (s.plannedMinutes || 0) > o.dayCap(d.date)) return false;
    if (o.allowed && !o.allowed(s, d.date)) return false;
    return true;
  };
  const put = (from: any, to: any, s: any) => {
    from.sessions = from.sessions.filter((y: any) => y !== s);
    if (!live(from).length && !from.sessions.some((y: any) => y.sport === 'rest')) from.sessions.push({ id: `${s.id}-rest`, sport: 'rest', title: 'Ruhetag' });
    to.sessions = [...to.sessions.filter((y: any) => y.sport !== 'rest'), s];
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 1; i < D0().length; i++) {
      const D = D0();
      const a = D[i - 1], b = D[i];
      if (nextDate(a.d.date) !== b.d.date) continue;
      for (const s of [...live(b.d)].filter(counts)) {
        const other = live(a.d).filter(counts).find((x: any) => sameGroup(x, s));
        if (!other || excused(s) || excused(other)) continue;
        if ((other.fixed || other.frozen) && (s.fixed || s.frozen)) continue;
        // 1) verschieben: lieber die lockere Einheit, nie die lange, an einen Tag derselben Woche ohne Nachbarn derselben Sportart
        const pick = [{ s, x: b }, { s: other, x: a }].filter(c => movable(c.s, c.x.d.date, o.from) && !longOf(c.s)).sort((u, v) => +hardOf(u.s) - +hardOf(v.s));
        let done = false;
        for (const c of pick) {
          const idx = D.indexOf(c.x);
          const js = D.map((y, j) => ({ y, j })).filter(({ y }) => y.w === c.x.w && y !== c.x).sort((u, v) => Math.abs(u.j - idx) - Math.abs(v.j - idx));
          const t = js.find(({ j }) => fitsDay(D, c.s, j, [c.s]));
          if (t) { put(c.x.d, t.y.d, c.s); fixes.push(`${c.s.title}: ${c.x.d.date} → ${t.y.d.date} (nicht zweimal ${SPORT_DE[c.s.sport]} hintereinander)`); done = true; break; }
          // 2) tauschen: mit einer lockeren Einheit einer anderen Sportart an einem anderen Tag derselben Woche
          for (const { y, j } of js) {
            const sw = live(y.d).find((z: any) => movable(z, y.d.date, o.from) && !longOf(z) && !hardOf(z) && z.sport !== c.s.sport && !sameGroup(z, c.s)
              && fitsDay(D, c.s, j, [c.s, z]) && fitsDay(D, z, idx, [c.s, z]));
            if (!sw) continue;
            c.x.d.sessions = c.x.d.sessions.map((q: any) => q === c.s ? sw : q);
            y.d.sessions = y.d.sessions.map((q: any) => q === sw ? c.s : q);
            fixes.push(`${c.s.title} (${c.x.d.date}) ↔ ${sw.title} (${y.d.date}) getauscht (nicht zweimal ${SPORT_DE[c.s.sport]} hintereinander)`);
            done = true; break;
          }
          if (done) break;
        }
        if (done) { changed = true; break; }
        // 3) geht nicht anders: eine Einheit locker und kurz, mit Grund. Lange Einheiten bleiben lang; liegt eine harte Einheit daneben,
        //    wandert ihre Qualität in die lange Einheit (z. B. Tempo im langen Lauf), die harte wird locker und kurz.
        const both = [{ s, x: b }, { s: other, x: a }];
        const cands = both.filter(c => !longOf(c.s) && (movable(c.s, c.x.d.date, o.from) || (c.s.stage && (!o.from || c.x.d.date >= o.from) && !c.s.frozen && !c.s.fixed && !(KEEP && KEEP(c.s)))));
        if (!cands.length) continue;
        cands.sort((u, v) => (+hardOf(u.s) - +hardOf(v.s)) || (+longOf(u.s) - +longOf(v.s)) || (+isLightQuality(u.s) - +isLightQuality(v.s)) || ((u.s.plannedMinutes || 0) - (v.s.plannedMinutes || 0)));
        const c = cands[0];
        const fixedNear = [a, b].some(x => live(x.d).some((y: any) => y.fixed && y.sport !== 'football' && sameGroup(y, c.s)));
        const why = c.s.sport === 'swim' ? 'zwei Tage hintereinander Schwimmen, weil nur an wenigen Tagen ein Schwimmbad geht oder Zeit ist.'
          : fixedNear ? `zwei Tage hintereinander ${SPORT_DE[c.s.sport]}, weil am Tag daneben ein fester Termin ist.`
          : c.s.sport === 'strength' ? 'zwei Tage hintereinander Kraft für dieselben Muskeln, weil an den anderen Tagen keine Zeit ist.'
          : `zwei Tage hintereinander ${SPORT_DE[c.s.sport]}, weil an den anderen Tagen keine Zeit oder schon etwas anderes geplant ist.`;
        const usedBy = (d: any) => live(d).filter((y: any) => y !== c.s && !(y.fixed && y.sport === 'football')).reduce((m: number, y: any) => m + (y.plannedMinutes || 0), 0);
        const room = o.dayCap ? o.dayCap(c.x.d.date) - usedBy(c.x.d) : SHORT_MIN;
        const nx = easyShort(c.s, why, room);
        // die harte Einheit wird locker: ihre Qualität wandert in die lange Einheit daneben (z. B. Tempo im langen Lauf), wenn dort Platz für Hartes ist
        const ot = both.find(y => y !== c)!;
        if (hardOf(c.s) && o.quality && longOf(ot.s) && !hardOf(ot.s) && movable(ot.s, ot.x.d.date, o.from)) {
          const j = D.indexOf(ot.x);
          const near = [D[j - 1], D[j + 1]].filter(Boolean).filter(y => y !== c.x);
          if (!near.some(y => live(y.d).some((z: any) => hardOf(z) || gameOf(z))) && !live(ot.x.d).some((z: any) => z !== ot.s && (hardOf(z) || gameOf(z)))) {
            const q = o.quality(ot.s, ot.x.d.date, ot.x.w.phase, c.s);
            if (q && hardOf(q)) { ot.x.d.sessions = ot.x.d.sessions.map((y: any) => y === ot.s ? q : y); fixes.push(`${ot.x.d.date}: ${ot.s.title} → ${q.title} (Qualität aus ${c.s.title})`); }
          }
        }
        c.x.d.sessions = c.x.d.sessions.map((y: any) => y === c.s ? nx : y);
        fixes.push(`${c.x.d.date}: ${c.s.title} → ${nx.title} (${why})`);
        changed = true; break;
      }
    }
    if (!changed) break;
  }
  KEEP = undefined;
  return fixes;
}
