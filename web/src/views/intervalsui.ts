/* Auftrag 22: Bereich „Intervalle“ unter den Werten einer Einheit (Laufen, Rad, Schwimmen, Koppel).
   Auftrag 36: übersichtlich nach Sätzen gruppiert („4 × 100 m Kraul · Pull Buoy“). Eine kurze Zeile je Wiederholung mit den wichtigsten
   Werten und dem Urteil; Antippen öffnet die Details (alle Felder, Pause, Lage/Hilfsmittel/Zone bzw. Art/Untergrund, Titel, Knöpfe).
   Je Satz: Titel, Lage bzw. Art, Hilfsmittel, Zone, Untergrund für alle Wiederholungen; „ganzer Satz gleich“ (z. B. alle 4 × 100 m in 2:30),
   einzelne Wiederholungen weichen über ihre Details ab; Satz hinzufügen, löschen, verschieben, Wiederholung hinzufügen.
   Soll-Werte nur als Platzhalter. Werte der Uhr stehen drin (mit Quelle); wer etwas ändert, bekommt eine eigene Liste (Hand gewinnt),
   „Uhrwerte verwenden“ holt sie zurück. Enter springt zum nächsten Feld (öffnet die nächste Wiederholung). */
import { esc } from '../util';
import { on, onChange, srcBadge, armed } from '../kit';
import { toast } from '../toast';
import { evaluateIntervals, plannedIntervals, actualRows, paceToSec, secToPace, IV_LIMITS, ivLimit, ivGroups, ivAttrs, stampRows, targetOfRow, rowHasValues,
  IV_STROKES, IV_GEAR, IV_TYPES, IV_TERRAIN, type IvRow, type IvEval, type IvTarget, type IvThresholds, type IvLine } from '../../../shared/intervals';
import { setSessionMetricManual } from '../../../shared/activity/merge';
import { parseInput } from '../../../shared/validate';

export interface IvHost { rec: (tg: any) => any; put: (tg: any, next: any) => void; redraw: () => void; rev: (tg: any) => void; activities: () => Record<string, any>; thresholds: () => IvThresholds }
let HOST: IvHost | null = null;
export function registerIntervalHost(h: IvHost) { HOST = h; }

type F = { k: keyof IvRow; label: string; unit?: string; kind: 'clock' | 'num' | 'pace' | 'text'; mode?: string };
const COMMON_END: F[] = [{ k: 'rpe', label: 'RPE', kind: 'num' }, { k: 'note', label: 'Notiz', kind: 'text' }];
export const IV_FIELDS: Record<string, F[]> = {
  run: [{ k: 'sec', label: 'Dauer', unit: 'min:s', kind: 'clock' }, { k: 'm', label: 'Strecke', unit: 'm', kind: 'num' }, { k: 'pace', label: 'Pace', unit: '/km', kind: 'pace' }, { k: 'hr', label: 'Ø Puls', kind: 'num' }, { k: 'maxHr', label: 'max. Puls', kind: 'num' }, { k: 'cad', label: 'Schrittfrequenz', unit: 'spm', kind: 'num' }, ...COMMON_END],
  bike: [{ k: 'sec', label: 'Dauer', unit: 'min:s', kind: 'clock' }, { k: 'power', label: 'Ø Watt', unit: 'W', kind: 'num' }, { k: 'speed', label: 'Ø Tempo', unit: 'km/h', kind: 'num' }, { k: 'hr', label: 'Ø Puls', kind: 'num' }, { k: 'maxHr', label: 'max. Puls', kind: 'num' }, { k: 'cad', label: 'Trittfrequenz', unit: 'rpm', kind: 'num' }, ...COMMON_END],
  swim: [{ k: 'm', label: 'Strecke', unit: 'm', kind: 'num' }, { k: 'sec', label: 'Dauer', unit: 'min:s', kind: 'clock' }, { k: 'pace100', label: 'Pace', unit: '/100 m', kind: 'pace' }, { k: 'spl', label: 'Züge pro Bahn', kind: 'num' }, { k: 'hr', label: 'Ø Puls', kind: 'num' }, ...COMMON_END]
};
/* „ganzer Satz gleich“: die wichtigsten Werte je Sportart */
const SAME: Record<string, (keyof IvRow)[]> = { run: ['sec', 'pace', 'hr'], bike: ['sec', 'power', 'hr'], swim: ['sec', 'pace100', 'hr'] };
const REST: F[] = [{ k: 'restSec', label: 'Pause', unit: 'min:s', kind: 'clock' }, { k: 'restHr', label: 'Puls am Ende der Pause', kind: 'num' }];
const SRC: Record<string, string> = { manual: 'manual', watch: 'file', laps: 'file', stream: 'file', icu: 'intervals' };
const VERDICT: Record<string, [string, string]> = { ok: ['im Ziel', 'good'], hard: ['zu hart', 'bad'], easy: ['zu locker', 'warn'], short: ['kürzer/abgebrochen', 'warn'], missing: ['nicht gemacht', ''] };

/* Eingaben: „4:45“, „4.45“, „4,45“ oder „445“; Dauer auch „4“ (Minuten) */
export function parseClock(v: string, kind: 'clock' | 'pace'): number | null | typeof NaN {
  const s = String(v || '').trim(); if (!s) return null;
  let m = /^(\d{1,3})[:.,](\d{1,2})$/.exec(s);
  if (m) { if (+m[2] > 59 || m[2].length !== 2) return NaN; return +m[1] * 60 + +m[2]; }
  m = /^(\d{1,4})$/.exec(s); if (!m) return NaN;
  const d = m[1];
  if (d.length <= 2) return +d * 60;
  const sec = +d.slice(-2); if (sec > 59) return NaN; return +d.slice(0, -2) * 60 + sec;
}
const fmtClock = (sec: any) => (sec == null || sec === '' ? '' : secToPace(+sec));
function ph(f: { k: keyof IvRow }, t: IvTarget | null, sport: string): string {
  if (!t) return '';
  switch (f.k) {
    case 'sec': return t.sec ? fmtClock(t.sec) : '';
    case 'm': return t.m ? String(t.m) : '';
    case 'pace': return t.pace ? `${secToPace(t.pace[0])}-${secToPace(t.pace[1])}` : '';
    case 'pace100': return t.pace100 ? `${secToPace(t.pace100[0])}-${secToPace(t.pace100[1])}` : '';
    case 'power': return t.power ? `${t.power[0]}-${t.power[1]}` : '';
    case 'speed': return t.speed ? `${String(t.speed[0]).replace('.', ',')}-${String(t.speed[1]).replace('.', ',')}` : '';
    case 'hr': return t.hr ? `${t.hr[0]}${t.hr[1] ? '-' + t.hr[1] : '+'}` : '';
    case 'rpe': return `${t.rpe[0]}-${t.rpe[1]}`;
    case 'restSec': return t.restSec ? fmtClock(t.restSec) : '';
    case 'cad': return sport === 'bike' ? '85-95' : '';
    default: return '';
  }
}
const valOf = (f: F, r: IvRow | null) => { const v = r ? (r as any)[f.k] : null; if (v == null || v === '') return ''; return f.kind === 'clock' ? fmtClock(v) : String(v).replace(/^(\d+)\.(\d)$/, '$1,$2'); };

export function ivContext(tg: any, st: any): { e: IvEval | null; targets: IvTarget[] } {
  if (!HOST || !['run', 'bike', 'swim'].includes(tg.sport)) return { e: null, targets: [] };
  const act = st && st.activityId ? HOST.activities()[st.activityId] || null : null;
  const thr = HOST.thresholds();
  const targets = plannedIntervals(tg.planned, thr);
  return { e: evaluateIntervals(tg.planned || { sport: tg.sport }, st, act, thr, tg.sport), targets };
}
/* Liste zum Bearbeiten: von Hand wie gespeichert, sonst die zugeordneten Werte der Uhr in Reihenfolge des Plans, dann zusätzliche */
export function editableRows(tg: any, st: any): IvRow[] {
  const ar = actualRows(st, st && st.activityId && HOST ? HOST.activities()[st.activityId] : null);
  if (ar.source === 'manual') return ar.rows.map(r => ({ ...r }));
  const { e, targets } = ivContext(tg, st);
  if (!e) return targets.map(() => ({}));
  const matched = e.lines.filter(l => !l.extra).map(l => (l.row ? { ...l.row } : {}));
  return [...matched, ...e.lines.filter(l => l.extra).map(l => ({ ...l.row! }))];
}

/* geöffnete Wiederholungen bzw. Sätze bleiben nach dem Neuzeichnen offen */
const OPEN = new Set<string>();
const okey = (tg: any, k: string) => `${tg.id}|${tg.date}|${k}`;
/* nach Verschieben, Löschen, Einfügen: offene Wiederholungen (r/a + Index) und Sätze (s + Index) wandern mit */
function remapOpen(tg: any, rowMap: (i: number) => number | null, setMap: (g: number) => number | null = g => g) {
  const pre = okey(tg, ''); const next: string[] = [];
  for (const k of [...OPEN]) {
    if (!k.startsWith(pre)) continue;
    OPEN.delete(k);
    const kind = k.charAt(pre.length), n = +k.slice(pre.length + 1);
    const m = kind === 's' ? setMap(n) : rowMap(n);
    if (m != null && m >= 0) next.push(pre + kind + m);
  }
  next.forEach(k => OPEN.add(k));
}
/* Urteil zu Zeile i: von Hand über die Zeile selbst (gleiche Reihenfolge), sonst die zugeordnete Zeile */
function lineOf(lines: IvLine[], rows: IvRow[], i: number, manual: boolean, nTargets: number): IvLine | undefined {
  if (manual) { const r = rows[i]; return lines.find(l => l.row === r); }
  return lines.filter(l => !l.extra)[i] || lines.filter(l => l.extra)[i - nTargets];
}
/* kurze Zeile: die wichtigsten Werte (oder das Soll grau) */
function mainText(r: IvRow, t: IvTarget | null, sport: string): { txt: string; soll: boolean } {
  const has = rowHasValues(r);
  const bits: string[] = [];
  if (sport === 'swim') {
    const m = r.m || (has && t ? t.m : null); const p = r.pace100 || (r.sec && m ? secToPace(r.sec / (m / 100)) : '');
    if (m) bits.push(`${m} m`); if (r.sec) bits.push(fmtClock(r.sec)); if (p) bits.push(`${p}/100 m`);
  } else {
    if (r.sec) bits.push(fmtClock(r.sec) + ' min'); else if (r.m) bits.push(`${r.m} m`);
    if (sport === 'run' && (r.pace || (r.sec && r.m))) bits.push(`${r.pace || secToPace(r.sec! / (r.m! / 1000))}/km`);
    if (sport === 'bike' && r.power) bits.push(`${r.power} W`); else if (sport === 'bike' && r.speed) bits.push(`${String(r.speed).replace('.', ',')} km/h`);
  }
  if (r.hr) bits.push(`Puls ${r.hr}`);
  if (!bits.length && r.rpe) bits.push(`RPE ${r.rpe}`);
  if (bits.length) return { txt: bits.join(' · '), soll: false };
  if (!t) return { txt: 'noch nichts eingetragen', soll: true };
  const sz = sport === 'swim' ? (t.m ? `${t.m} m` : '') : t.sec ? `${fmtClock(t.sec)} min` : '';
  const perf = sport === 'swim' && t.pace100 ? `${secToPace(t.pace100[0])}-${secToPace(t.pace100[1])}/100 m` : sport === 'run' && t.pace ? `${secToPace(t.pace[0])}-${secToPace(t.pace[1])}/km` : sport === 'bike' && t.power ? `${t.power[0]}-${t.power[1]} W` : t.hr ? `Puls ${t.hr[0]}${t.hr[1] ? '-' + t.hr[1] : '+'}` : '';
  return { txt: ['Soll', sz, perf].filter(Boolean).join(' '), soll: true };
}
/* Auswahl für Lage/Zone/Art/Untergrund und Hilfsmittel (für eine Wiederholung oder den ganzen Satz) */
function attrControls(sport: string, idx: number[], a: { stroke: string | null; gear: string[]; zone: number | null; type: string | null; terrain: string | null; title: string; ownTitle: boolean }, attrs: string, scope: string, mixed: Record<string, boolean> = {}): string {
  const ids = idx.join(',');
  const id = (f: string) => `iv-${scope}-${idx[0]}-${f}`;
  const sel = (f: string, label: string, opts: [string, string][], cur: string | null) => `<label class="fld" for="${id(f)}"><span class="lab">${esc(label)}</span><select class="inp" id="${id(f)}" data-ch="iv-attr" data-idx="${ids}" data-f="${f}" ${attrs} aria-label="${esc(label)}${scope === 'set' ? ' (ganzer Satz)' : ''}">${mixed[f] ? '<option value="" selected>unterschiedlich</option>' : f === 'zone' || f === 'stroke' ? '' : '<option value="">–</option>'}${opts.map(([k, l]) => `<option value="${esc(k)}" ${!mixed[f] && String(cur ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const out: string[] = [];
  out.push(`<label class="fld wide" for="${id('title')}"><span class="lab">Titel${scope === 'set' ? ' des Satzes' : ''}</span><input class="inp" id="${id('title')}" type="text" data-ch="iv-attr" data-idx="${ids}" data-f="title" ${attrs} autocomplete="off" aria-label="Titel${scope === 'set' ? ' des Satzes' : ''}" value="${esc(a.ownTitle && !mixed.title ? a.title : '')}" placeholder="${esc(a.title)}"></label>`);
  if (sport === 'swim') {
    out.push(sel('stroke', 'Lage bzw. Art', IV_STROKES, a.stroke));
    const none = !a.gear.length && !mixed.gear;
    out.push(`<div class="fld wide"><span class="lab">Hilfsmittel</span><div class="chips iv-gear" role="group" aria-label="Hilfsmittel${scope === 'set' ? ' (ganzer Satz)' : ''}">${IV_GEAR.map(([k, l]) => `<button type="button" class="chip ${!mixed.gear && a.gear.includes(k) ? 'on' : ''}" data-act="iv-gear" data-g="${k}" data-idx="${ids}" ${attrs} aria-pressed="${!mixed.gear && a.gear.includes(k)}">${esc(l)}</button>`).join('')}<button type="button" class="chip ${none ? 'on' : ''}" data-act="iv-gear" data-g="" data-idx="${ids}" ${attrs} aria-pressed="${none}">keine</button></div></div>`);
  } else {
    out.push(sel('type', 'Art', IV_TYPES[sport as 'run' | 'bike'], a.type));
    out.push(sel('terrain', sport === 'run' ? 'Untergrund' : 'Gelände', IV_TERRAIN[sport as 'run' | 'bike'], a.terrain));
  }
  out.push(sel('zone', 'Zone bzw. Intensität', [1, 2, 3, 4, 5].map(z => [String(z), `Zone ${z}`] as [string, string]), a.zone != null ? String(a.zone) : null));
  return `<div class="fgrid iv-attrs">${out.join('')}</div>`;
}

/* free (Auftrag 30, „andere Intervalle“/„härter“): eigene Liste ohne Soll, gleich offen mit einer leeren Zeile */
export function intervalsBlock(tg: any, st: any, attrs: string, free = false): string {
  const { e, targets } = ivContext(tg, st);
  if (!e && !targets.length && !free) return '';
  const sport = tg.sport; const fields = IV_FIELDS[sport];
  const manual = !!(e && e.source === 'manual');
  const act = st && st.activityId && HOST ? HOST.activities()[st.activityId] : null;
  const autoAvail = !!act && manual && actualRows({}, act).rows.length > 0;
  let rows = editableRows(tg, st);
  if (!rows.length && free) rows = [{}];
  rows = stampRows(rows, targets, sport);
  const srcName = e && e.source !== 'none' ? SRC[e.source] : null;
  // von Hand: mit den vervollständigten Zeilen bewerten (gleiche Objekte → Urteil je Zeile eindeutig)
  const e2 = manual && HOST ? evaluateIntervals(tg.planned || { sport }, { ...st, metrics: { ...(st.metrics || {}), intervals: rows } }, act, HOST.thresholds(), sport) : e;
  const lines = e2 ? e2.lines : [];
  // Zusammenfassung: Ø nur der harten Teile und der Pausen
  const sum: string[] = [];
  if (e && e.done + e.extra) {
    const w = e.work;
    const perf = sport === 'run' && w.paceSec ? `${secToPace(w.paceSec)}/km` : sport === 'bike' && w.power ? `${w.power} W` : sport === 'bike' && w.speed ? `${String(w.speed).replace('.', ',')} km/h` : sport === 'swim' && w.pace100 ? `${secToPace(w.pace100)}/100 m` : '';
    sum.push(`Ø Intervalle: ${[perf, w.hr ? `Puls ${w.hr}` : '', w.rpe ? `RPE ${String(w.rpe).replace('.', ',')}` : ''].filter(Boolean).join(' · ') || '–'}`);
    if (e.rest.sec || e.rest.hr) sum.push(`Ø Pausen: ${[e.rest.sec ? fmtClock(e.rest.sec) + ' min' : '', e.rest.hr ? `Puls ${e.rest.hr} am Ende` : ''].filter(Boolean).join(' · ')}`);
    const cnt = [`${e.done} von ${e.planned || e.done} gemacht`, e.extra ? `${e.extra} zusätzlich` : '', e.inTarget ? `${e.inTarget} im Ziel` : '', e.tooHard ? `${e.tooHard} zu hart` : '', e.tooEasy ? `${e.tooEasy} zu locker` : '', e.short ? `${e.short} kürzer` : ''].filter(Boolean);
    sum.push(cnt.join(', '));
  }
  const inp = (i: number, f: F, r: IvRow | null, t: IvTarget | null) => {
    const id = `iv-${i}-${String(f.k)}`;
    return `<label class="fld ${f.kind === 'text' ? 'wide' : ''}" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="iv" data-iv-in data-i="${i}" data-f="${String(f.k)}" data-kind="${f.kind}" ${attrs} type="text" inputmode="${f.kind === 'text' ? 'text' : 'decimal'}" enterkeyhint="next" autocomplete="off" aria-label="Intervall ${i + 1}: ${esc(f.label)}" value="${esc(valOf(f, r))}" placeholder="${esc(ph(f, t, sport))}"></label>`;
  };
  const groups = ivGroups(rows, targets, sport);
  const n = rows.length;
  const setsHtml = groups.map((g, gi) => {
    const t0 = g.target;
    const gl = g.idx.map(i => lineOf(lines, rows, i, manual, targets.length));
    const judged = gl.filter(l => l && ['ok', 'hard', 'easy'].includes(l.verdict || '')).length, ok = gl.filter(l => l && l.verdict === 'ok').length, done = g.idx.filter(i => rowHasValues(rows[i])).length;
    const head = done ? `${done} von ${g.reps} eingetragen${judged ? `, ${ok} im Ziel` : ''}` : t0 ? 'noch nichts eingetragen' : '';
    // gemischte Angaben im Satz („unterschiedlich“)
    const at = g.idx.map(i => ivAttrs(rows[i], targetOfRow(rows, targets, i), sport));
    const mixed: Record<string, boolean> = { stroke: new Set(at.map(a => a.stroke)).size > 1, gear: new Set(at.map(a => [...a.gear].sort().join(','))).size > 1, zone: new Set(at.map(a => a.zone)).size > 1, type: new Set(at.map(a => a.type)).size > 1, terrain: new Set(at.map(a => a.terrain)).size > 1, title: new Set(at.map(a => a.ownTitle ? a.title : '')).size > 1 };
    const rowsHtml = g.idx.map((i, k) => {
      const r = rows[i] || {}; const t = targetOfRow(rows, targets, i); const l = gl[k];
      const [word, cls] = l && l.extra ? ['zusätzlich', 'info'] : l ? VERDICT[l.verdict || ''] || ['ohne Ziel', ''] : t ? VERDICT.missing : ['', ''];
      const a = ivAttrs(r, t, sport); const g0 = g.attrs;
      const own = [a.stroke !== g0.stroke ? a.title : '', a.gear.join() !== g0.gear.join() ? (a.gear.length ? 'mit Hilfsmittel' : 'ohne Hilfsmittel') : '', a.zone !== g0.zone ? `Zone ${a.zone}` : '', a.ownTitle && a.title !== g0.title ? a.title : ''].filter(Boolean);
      const mt = mainText(r, t, sport);
      const k0 = okey(tg, 'r' + i);
      const isOpen = OPEN.has(k0) || (free && n === 1 && !rowHasValues(r));
      return `<li class="iv-card iv-row" data-iv-row="${i}"><details class="iv-det" data-ivk="${esc(k0)}" ${isOpen ? 'open' : ''}><summary class="iv-bar" aria-label="Wiederholung ${i + 1}: ${esc(mt.txt)}${word ? ', ' + esc(word) : ''}"><span class="iv-n">${i + 1}</span><span class="iv-main ${mt.soll ? 'muted' : ''}">${esc(mt.txt)}${own.length ? `<span class="xs muted iv-own"> · ${esc(own.join(', '))}</span>` : ''}</span>${word ? `<span class="pill ${cls}">${esc(word)}</span>` : ''}</summary>
        <div class="iv-body stack">${l && l.why ? `<div class="xs muted">${esc(l.why)}</div>` : ''}${l && l.diff && l.diff.length ? `<div class="xs">${esc('Anders als geplant: ' + l.diff.join(', '))}</div>` : ''}
          <div class="fgrid">${fields.map(f => inp(i, f, r, t)).join('')}</div>
          <div class="fgrid">${REST.map(f => inp(i, f, r, t)).join('')}</div>
          ${more2('Lage, Hilfsmittel, Zone, Titel dieser Wiederholung', attrControls(sport, [i], a, attrs, 'row'), okey(tg, 'a' + i))}
          <div class="row" style="flex-wrap:wrap;gap:6px">${i > 0 ? `<button class="btn ghost sm" data-act="iv-copy" data-i="${i}" ${attrs}>wie vorheriges</button>` : ''}<button class="btn ghost sm" data-act="iv-abort" data-i="${i}" ${attrs} aria-pressed="${!!r.aborted}">${r.aborted ? 'abgebrochen ✓' : 'abgebrochen'}</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="-1" ${attrs} ${i === 0 ? 'disabled' : ''} aria-label="Wiederholung ${i + 1} nach oben">↑</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="1" ${attrs} ${i >= n - 1 ? 'disabled' : ''} aria-label="Wiederholung ${i + 1} nach unten">↓</button><button class="btn ghost sm danger" data-act="iv-del" data-i="${i}" ${attrs} aria-label="Wiederholung ${i + 1} löschen">löschen</button></div>
        </div></details></li>`;
    }).join('');
    const ids = g.idx.join(',');
    const same = SAME[sport].map(k => { const f = fields.find(x => x.k === k)!; const id = `iv-same-${g.idx[0]}-${String(k)}`; const vals = new Set(g.idx.map(i => valOf(f, rows[i]))); const v = vals.size === 1 ? [...vals][0] : '';
      return `<label class="fld" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="iv-same" data-idx="${ids}" data-f="${String(k)}" data-kind="${f.kind}" ${attrs} type="text" inputmode="decimal" autocomplete="off" aria-label="Ganzer Satz ${gi + 1}: ${esc(f.label)}" value="${esc(v)}" placeholder="${esc(ph(f, t0, sport))}"></label>`; }).join('');
    const edit = `${g.reps > 1 ? `<div class="stack"><span class="lab">Ganzer Satz gleich</span><div class="fgrid">${same}</div><div class="xs muted">Gilt für alle ${g.reps} Wiederholungen. Weicht eine ab, tippe sie oben an und ändere nur sie.</div></div>` : ''}
      ${attrControls(sport, g.idx, { ...g.attrs, ownTitle: g.attrs.ownTitle }, attrs, 'set', mixed)}
      <div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn ghost sm" data-act="iv-rep-add" data-idx="${ids}" ${attrs}>+ Wiederholung</button><button class="btn ghost sm" data-act="iv-set-move" data-g="${gi}" data-dir="-1" ${attrs} ${gi === 0 ? 'disabled' : ''} aria-label="Satz ${gi + 1} nach oben">Satz ↑</button><button class="btn ghost sm" data-act="iv-set-move" data-g="${gi}" data-dir="1" ${attrs} ${gi >= groups.length - 1 ? 'disabled' : ''} aria-label="Satz ${gi + 1} nach unten">Satz ↓</button><button class="btn ghost sm danger" data-act="iv-set-del" data-idx="${ids}" ${attrs} aria-label="Satz ${gi + 1} löschen">Satz löschen</button></div>`;
    return `<section class="iv-set" data-iv-set="${gi}"><div class="spread iv-set-head"><b class="iv-set-t">${esc(g.label)}</b>${head ? `<span class="xs muted">${esc(head)}</span>` : ''}</div>
      <ol class="iv-rows" aria-label="${esc(g.label)}">${rowsHtml}</ol>
      ${more2('Satz bearbeiten', edit, okey(tg, 's' + gi))}</section>`;
  }).join('');
  return `<div class="fld wide stack" data-intervals="${esc(sport)}"><div class="spread"><span class="lab">Intervalle ${srcName ? srcBadge(srcName) : ''}</span>${autoAvail ? `<button class="link" data-act="iv-reset" ${attrs}>Uhrwerte verwenden</button>` : ''}</div>
    ${sum.length ? `<div class="xs" data-iv-sum>${sum.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : `<div class="xs muted">${free ? 'Trag ein, was du gemacht hast (Dauer oder Strecke, dazu Puls, Tempo oder Leistung).' : 'Tippe eine Wiederholung an, um Werte einzutragen. Geplante Werte stehen grau im Feld; sie zählen erst, wenn du etwas einträgst oder die Uhr es misst.'}</div>`}
    <div class="iv-sets stack">${setsHtml}</div>
    <button class="btn ghost sm" data-act="iv-add" ${attrs}>+ Satz hinzufügen</button></div>`;
}
/* aufklappbarer Bereich, der nach dem Neuzeichnen offen bleibt */
function more2(summary: string, body: string, key: string): string {
  return `<details class="more iv-more" data-ivk="${esc(key)}" ${OPEN.has(key) ? 'open' : ''}><summary>${esc(summary)}</summary><div class="body">${body}</div></details>`;
}
if (typeof document !== 'undefined') document.addEventListener('toggle', ev => {
  const d = ev.target as HTMLElement | null; const k = d && d.getAttribute && d.getAttribute('data-ivk'); if (!k) return;
  if ((d as HTMLDetailsElement).open) OPEN.add(k); else OPEN.delete(k);
}, true);

/* ---------- Ändern ---------- */
function save(tg: any, rows: IvRow[]) {
  if (!HOST) return; const st = HOST.rec(tg); if (!st) return;
  const targets = plannedIntervals(tg.planned, HOST.thresholds());
  HOST.put(tg, setSessionMetricManual(st, 'intervals', stampRows(rows, targets, tg.sport)));
}
const tgOf = (el: HTMLElement) => ({ kind: el.dataset.tk as any, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport!, planned: plannedOf(el) });
let plannedLookup: (id: string, date: string) => any = () => null;
export function registerPlannedLookup(fn: (id: string, date: string) => any) { plannedLookup = fn; }
const plannedOf = (el: HTMLElement) => (el.dataset.tk === 'session' ? plannedLookup(el.dataset.tid!, el.dataset.tdate!) : null);
const rowsFor = (tg: any) => { const st = HOST!.rec(tg) || {}; const targets = plannedIntervals(tg.planned, HOST!.thresholds()); const r = editableRows(tg, st); return stampRows(r.length ? r : [], targets, tg.sport); };
const idxOf = (el: HTMLElement) => String(el.dataset.idx || '').split(',').filter(x => x !== '').map(Number);
/* Wert einer Zeile prüfen: freundlich ablehnen, sinnvolle Grenzen; null = leer, undefined = ungültig */
export function readIvValue(f: string, kind: string, raw: string, sport: string): { ok: true; v: any } | { ok: false; msg: string } {
  const v = raw.trim(); if (!v) return { ok: true, v: null };
  if (kind === 'text') return { ok: true, v: v.slice(0, 200) };
  if (kind === 'clock' || kind === 'pace') {
    const s = parseClock(v, kind as any);
    if (s == null) return { ok: true, v: null };
    if (!Number.isFinite(s)) return { ok: false, msg: 'Bitte als Minuten:Sekunden eingeben, z. B. 4:45 oder 445.' };
    if (kind === 'pace') {
      const lim = sport === 'swim' ? [45, 600] : [150, 1200];
      if (s < lim[0] || s > lim[1]) return { ok: false, msg: sport === 'swim' ? `Pace ${secToPace(s)}/100 m ist unrealistisch (möglich: ${secToPace(lim[0])} bis ${secToPace(lim[1])}).` : `Pace ${secToPace(s)}/km ist unrealistisch (möglich: ${secToPace(lim[0])} bis ${secToPace(lim[1])}).` };
      return { ok: true, v: secToPace(s) };
    }
    const lim = IV_LIMITS[f] || [0, 86400];
    if (s < lim[0] || s > lim[1]) return { ok: false, msg: `${secToPace(s)} min ist als ${f === 'restSec' ? 'Pause' : 'Dauer'} unrealistisch.` };
    return { ok: true, v: s };
  }
  // Auftrag 29: dieselbe Prüfung wie überall, ohne stilles Runden (vorher wurde z. B. 155,5 bpm still zu 156)
  const lim = ivLimit(f, sport) || [-1e9, 1e9];
  const IV: Record<string, [string, string?, Record<string, number>?]> = { m: ['Strecke', 'm', { km: 1000 }], hr: ['Ø Puls', 'bpm'], maxHr: ['max. Puls', 'bpm'], restHr: ['Puls in der Pause', 'bpm'], power: ['Leistung', 'W'], speed: ['Tempo', 'km/h'], cad: ['Kadenz', '/min', { spm: 1, rpm: 1 }], spl: ['Züge pro Bahn'], rpe: ['RPE'] };
  const d = IV[f] || ['Wert'];
  const r = parseInput({ label: d[0], unit: d[1], units: d[2], min: lim[0], max: lim[1], int: f === 'rpe' || f === 'm' }, v);
  if (!r.ok) return { ok: false, msg: r.msg! };
  return { ok: true, v: r.value };
}
/* Lage/Hilfsmittel/Zone/Art/Untergrund/Titel prüfen (nur bekannte Werte) */
export function readIvAttr(f: string, raw: string, sport: string): { ok: true; v: any } | { ok: false; msg: string } {
  const v = String(raw || '').trim();
  if (f === 'title') return { ok: true, v: v ? v.slice(0, 60) : null };
  if (!v) return { ok: true, v: null };
  if (f === 'zone') { const z = Number(v); return Number.isInteger(z) && z >= 1 && z <= 5 ? { ok: true, v: z } : { ok: false, msg: 'Zone 1 bis 5 wählen.' }; }
  const list: [string, string][] = f === 'stroke' ? IV_STROKES : f === 'type' ? (IV_TYPES as any)[sport] || [] : f === 'terrain' ? (IV_TERRAIN as any)[sport] || [] : [];
  return list.some(x => x[0] === v) ? { ok: true, v } : { ok: false, msg: 'Bitte aus der Liste wählen.' };
}
function setVal(r: IvRow, f: string, v: any) { (r as any)[f] = v; if (v == null) delete (r as any)[f]; }
onChange('iv', el => {
  if (!HOST) return; const tg = tgOf(el); const i = +el.dataset.i!; const f = el.dataset.f!;
  const res = readIvValue(f, el.dataset.kind || 'num', (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { toast(res.msg); return; }
  const rows = rowsFor(tg); while (rows.length <= i) rows.push({ ti: null });
  setVal(rows[i], f, res.v);
  // Rückfrage bei widersprüchlichen Werten (max. Puls unter Ø Puls)
  const r = rows[i]; if (r.hr != null && r.maxHr != null && r.maxHr < r.hr) toast(`Max. Puls ${r.maxHr} liegt unter dem Ø Puls ${r.hr}. Bitte prüfen.`);
  save(tg, rows); HOST.rev(tg); HOST.redraw();
});
/* ganzer Satz gleich: ein Wert für alle Wiederholungen des Satzes */
onChange('iv-same', el => {
  if (!HOST) return; const tg = tgOf(el); const f = el.dataset.f!;
  const res = readIvValue(f, el.dataset.kind || 'num', (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { toast(res.msg); return; }
  const rows = rowsFor(tg); const idx = idxOf(el);
  idx.forEach(i => { if (rows[i]) setVal(rows[i], f, res.v); });
  save(tg, rows); HOST.rev(tg); HOST.redraw();
});
onChange('iv-attr', el => {
  if (!HOST) return; const tg = tgOf(el); const f = el.dataset.f!;
  const res = readIvAttr(f, (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { toast(res.msg); return; }
  const rows = rowsFor(tg); const idx = idxOf(el);
  // „unterschiedlich“ gewählt: nichts ändern
  if (res.v == null && f !== 'title' && (el as HTMLSelectElement).tagName === 'SELECT' && /unterschiedlich/.test((el as HTMLSelectElement).selectedOptions?.[0]?.textContent || '')) return;
  idx.forEach(i => { if (rows[i]) setVal(rows[i], f, res.v); });
  save(tg, rows); HOST.rev(tg); HOST.redraw();
});
on('iv-gear', el => {
  if (!HOST) return; const tg = tgOf(el); const g = el.dataset.g || ''; const rows = rowsFor(tg); const idx = idxOf(el);
  const targets = plannedIntervals(tg.planned, HOST.thresholds());
  const cur = idx.map(i => ivAttrs(rows[i], targetOfRow(rows, targets, i), tg.sport).gear);
  const all = g && cur.every(x => x.includes(g));
  idx.forEach((i, k) => { if (!rows[i]) return; rows[i].gear = !g ? [] : all ? cur[k].filter(x => x !== g) : [...new Set([...cur[k], g])]; if (!rows[i].stroke && tg.sport === 'swim') rows[i].stroke = ivAttrs(rows[i], targetOfRow(rows, targets, i), 'swim').stroke || 'crawl'; });
  save(tg, rows); HOST.rev(tg); HOST.redraw();
});
/* Wiederholung bzw. Satz hinzufügen: neuer Satz mit einer Wiederholung (Lage wie der letzte Satz), zusätzlich zum Plan */
on('iv-add', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg);
  const key = Math.max(1000, ...rows.map(r => (r.set ?? 0) + 1));
  const last = rows[rows.length - 1] || {};
  rows.push({ set: key, ti: null, ...(tg.sport === 'swim' ? { stroke: last.stroke || 'crawl', gear: [] } : {}) });
  save(tg, rows); HOST.redraw();
});
on('iv-rep-add', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const idx = idxOf(el); if (!idx.length) return;
  const last = rows[idx[idx.length - 1]] || {};
  const { title, stroke, gear, zone, type, terrain, set } = last as any;
  const at = idx[idx.length - 1] + 1; remapOpen(tg, i => (i >= at ? i + 1 : i));
  rows.splice(at, 0, JSON.parse(JSON.stringify({ title, stroke, gear, zone, type, terrain, set: set ?? Math.max(1000, ...rows.map(r => (r.set ?? 0) + 1)), ti: null })));
  if (last.set == null) rows[idx[idx.length - 1]].set = rows[idx[idx.length - 1] + 1].set;
  save(tg, rows); HOST.redraw();
});
on('iv-set-del', el => {
  if (!HOST) return; if (!armed(el, 'Satz wirklich löschen?')) return;
  const tg = tgOf(el); const rows = rowsFor(tg); const idx = new Set(idxOf(el));
  const keep = rows.map((_, i) => i).filter(i => !idx.has(i));
  const g0 = ivGroups(rows, plannedIntervals(tg.planned, HOST.thresholds()), tg.sport).findIndex(g => g.idx.some(i => idx.has(i)));
  remapOpen(tg, i => (idx.has(i) ? null : keep.indexOf(i)), g => (g === g0 ? null : g > g0 ? g - 1 : g));
  save(tg, rows.filter((_, i) => !idx.has(i))); HOST.rev(tg); HOST.redraw();
});
on('iv-set-move', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg);
  const targets = plannedIntervals(tg.planned, HOST.thresholds());
  const groups = ivGroups(rows, targets, tg.sport); const gi = +el.dataset.g!, gj = gi + +el.dataset.dir!;
  if (gj < 0 || gj >= groups.length) return;
  // Satz-Kennung festhalten, damit die Gruppen nach dem Verschieben gleich bleiben
  groups.forEach((g, k) => g.idx.forEach(i => { if (rows[i].set == null) rows[i].set = 2000 + k; }));
  const order = groups.map(g => g.idx.map(i => rows[i]));
  const orderIdx = groups.map(g => g.idx);
  [order[gi], order[gj]] = [order[gj], order[gi]];
  [orderIdx[gi], orderIdx[gj]] = [orderIdx[gj], orderIdx[gi]];
  const flatIdx = orderIdx.flat();
  remapOpen(tg, i => flatIdx.indexOf(i), g => (g === gi ? gj : g === gj ? gi : g));
  save(tg, order.flat()); HOST.rev(tg); HOST.redraw();
});
on('iv-del', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const d = +el.dataset.i!; remapOpen(tg, i => (i === d ? null : i > d ? i - 1 : i)); rows.splice(d, 1); save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-move', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!, j = i + +el.dataset.dir!; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; remapOpen(tg, k => (k === i ? j : k === j ? i : k)); save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-copy', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; if (!rows[i - 1]) return; const { note, aborted, ti, set, title, ...prev } = rows[i - 1]; rows[i] = { ...rows[i], ...prev }; save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-abort', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; if (!rows[i]) return; rows[i] = { ...rows[i], aborted: !rows[i].aborted }; if (!rows[i].aborted) delete rows[i].aborted; save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-reset', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; const next = setSessionMetricManual(st, 'intervals', ''); delete next.metricsManual.intervals; HOST.put(tg, next); HOST.rev(tg); HOST.redraw(); toast('Werte der Uhr gelten wieder.'); });
/* Enter springt zum nächsten Feld der Intervall-Liste (die nächste Wiederholung klappt dafür auf) */
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  const el = e.target as HTMLElement | null;
  if (e.key !== 'Enter' || !el || !el.hasAttribute || !el.hasAttribute('data-iv-in')) return;
  e.preventDefault();
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('[data-iv-in]'));
  const i = all.indexOf(el as HTMLInputElement);
  const nx0 = all[i + 1];
  if (nx0) { const det = nx0.closest('details.iv-det') as HTMLDetailsElement | null; if (det && !det.open) { det.open = true; const k = det.getAttribute('data-ivk'); if (k) OPEN.add(k); } }
  (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  const id = nx0 && nx0.id;
  setTimeout(() => { const nx = id ? document.getElementById(id) as HTMLInputElement | null : null; if (nx) { nx.focus(); nx.select && nx.select(); } }, 0);
});
export { paceToSec };
