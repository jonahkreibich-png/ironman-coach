/* Auftrag 22/36/37: Sätze und Wiederholungen (Laufen, Rad, Schwimmen, Koppel).
   Auftrag 37: angezeigt werden sie im „Ablauf“ der Einheit (ablaufui.ts) – eine Zeile je Wiederholung, ein Kopf je Satz. Antippen öffnet ein
   Fenster nur für diesen Teil; hier stehen die Inhalte dieser Fenster:
   - Satz: „ganzer Satz gleich“ (z. B. alle 3 × 100 m in 1:50), Titel, Lage bzw. Art, Hilfsmittel, Zone, Untergrund für alle,
     Wiederholung hinzufügen bzw. löschen, Satz verschieben bzw. löschen.
   - Wiederholung: nur diese eine (z. B. die 2. von 3 × 100 m Kraul statt Brust): Werte, Pause, Titel, Lage, Hilfsmittel, Zone,
     Art/Untergrund, „wie vorheriges“, „abgebrochen“, verschieben, löschen.
   Vorher klappten in der Liste drei Ebenen ineinander auf (Wiederholung → „Lage, Hilfsmittel …“ → „Satz bearbeiten“); nach einer Änderung
   klappten alle gleich lautenden Bereiche auf (kit.ts refreshSheet merkte sich den Überschrift-Text). Das gibt es nicht mehr.
   Soll-Werte nur als Platzhalter. Werte der Uhr stehen drin (mit Quelle); wer etwas ändert, bekommt eine eigene Liste (Hand gewinnt),
   „Uhrwerte verwenden“ holt sie zurück. Enter springt zum nächsten Feld im Fenster. */
import { esc } from '../util';
import { on, onChange, tfData, tfHint, tfAsking } from '../kit';
import { toast } from '../toast';
import { plannedIntervals, paceToSec, secToPace, IV_LIMITS, ivLimit, ivGroups, ivAttrs, stampRows, targetOfRow, rowHasValues,
  IV_STROKES, IV_GEAR, IV_TYPES, IV_TERRAIN, type IvRow, type IvTarget } from '../../../shared/intervals';
import { applyTotals } from '../../../shared/sections';
import { ivRowsFor, buildAblauf, repSoll, type AbSet, type AbRep } from '../../../shared/ablauf';
import { setSessionMetricManual } from '../../../shared/activity/merge';
import { parseInput, readTimeInput, type TimeKind } from '../../../shared/validate';
import { HOST, tgOf, plannedIv, actOf, SUB, setSubKey, UIH, type Tg } from './ablaufstate';

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
const VALUE_KEYS = new Set(['sec', 'm', 'pace', 'hr', 'maxHr', 'cad', 'power', 'speed', 'pace100', 'spl', 'rpe']);

/* Auftrag 39: Zeit-Felder einer Wiederholung – dieselbe Regel wie überall (shared/validate readTimeInput):
   Dauer 'ms' (1-2 Ziffern = Minuten, 445 = 4:45), Pause 'sec' (90 = 90 s, 3 = 3 min, 130 = 1:30), Pace 'pace' mit Grenzen je Sportart. */
export function ivTime(k: string, sport: string): { kind: TimeKind; lim: [number, number]; unit: string } {
  if (k === 'pace' || k === 'pace100') return { kind: 'pace', lim: sport === 'swim' || k === 'pace100' ? [45, 600] : [150, 1200], unit: sport === 'swim' || k === 'pace100' ? 'pro 100 m' : 'pro km' };
  if (k === 'restSec') return { kind: 'sec', lim: IV_LIMITS.restSec, unit: '' };
  return { kind: 'ms', lim: IV_LIMITS.sec, unit: '' };
}
const ivTf = (f: { k: any; kind: string }, sport: string) => { if (f.kind !== 'clock' && f.kind !== 'pace') return ''; const x = ivTime(String(f.k), sport); return tfData(x.kind, x.lim, x.unit); };
/* Eingaben: „4:45“, „4.45“, „4,45“ oder „445“; Dauer auch „4“ (Minuten). NaN = ungültig bzw. unklar */
export function parseClock(v: string, kind: 'clock' | 'pace', k = 'sec', sport = 'run'): number | null | typeof NaN {
  const t = ivTime(kind === 'pace' ? 'pace' : k, sport);
  const r = readTimeInput(v, t.kind, t.lim);
  return r.err || r.ask ? NaN : r.sec;
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
const valOf = (f: F, r: IvRow | null) => { const v = r ? (r as any)[f.k] : null; if (v == null || v === '' || (r && r.plan && VALUE_KEYS.has(String(f.k)) && f.k !== 'm' && f.k !== 'sec')) return ''; return f.kind === 'clock' ? fmtClock(v) : String(v).replace(/^(\d+)\.(\d)$/, '$1,$2'); };

/* Auswahl für Lage/Zone/Art/Untergrund und Hilfsmittel (für eine Wiederholung oder den ganzen Satz) – im Fenster immer sichtbar */
function attrControls(sport: string, idx: number[], a: { stroke: string | null; gear: string[]; zone: number | null; type: string | null; terrain: string | null; title: string; ownTitle: boolean }, attrs: string, scope: 'row' | 'set', mixed: Record<string, boolean> = {}): string {
  const ids = idx.join(',');
  const id = (f: string) => `iv-${scope}-${idx[0]}-${f}`;
  const sel = (f: string, label: string, opts: [string, string][], cur: string | null) => `<label class="fld" for="${id(f)}"><span class="lab">${esc(label)}</span><select class="inp" id="${id(f)}" data-ch="iv-attr" data-idx="${ids}" data-f="${f}" ${attrs} aria-label="${esc(label)}${scope === 'set' ? ' (ganzer Satz)' : ''}">${mixed[f] ? '<option value="" selected>unterschiedlich</option>' : f === 'zone' || f === 'stroke' ? '' : '<option value="">–</option>'}${opts.map(([k, l]) => `<option value="${esc(k)}" ${!mixed[f] && String(cur ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const out: string[] = [];
  out.push(`<label class="fld wide" for="${id('title')}"><span class="lab">Titel${scope === 'set' ? ' des Satzes' : ''}</span><input class="inp" id="${id('title')}" type="text" data-ch="iv-attr" data-idx="${ids}" data-f="title" ${attrs} autocomplete="off" aria-label="Titel${scope === 'set' ? ' des Satzes' : ''}" value="${esc(a.ownTitle && !mixed.title ? a.title : '')}" placeholder="${esc(a.title)}"></label>`);
  if (sport === 'swim') {
    out.push(sel('stroke', 'Lage bzw. Art', IV_STROKES, a.stroke));
    const none = !a.gear.length && !mixed.gear;
    out.push(`<div class="fld wide"><span class="lab">Hilfsmittel${scope === 'set' ? ' (ganzer Satz)' : ''}</span><div class="chips iv-gear" role="group" aria-label="Hilfsmittel${scope === 'set' ? ' (ganzer Satz)' : ''}">${IV_GEAR.map(([k, l]) => `<button type="button" class="chip ${!mixed.gear && a.gear.includes(k) ? 'on' : ''}" data-act="iv-gear" data-g="${k}" data-idx="${ids}" ${attrs} aria-pressed="${!mixed.gear && a.gear.includes(k)}">${esc(l)}</button>`).join('')}<button type="button" class="chip ${none ? 'on' : ''}" data-act="iv-gear" data-g="" data-idx="${ids}" ${attrs} aria-pressed="${none}">keine</button></div></div>`);
  } else {
    out.push(sel('type', 'Art', IV_TYPES[sport as 'run' | 'bike'], a.type));
    out.push(sel('terrain', sport === 'run' ? 'Untergrund' : 'Gelände', IV_TERRAIN[sport as 'run' | 'bike'], a.terrain));
  }
  out.push(sel('zone', 'Zone bzw. Intensität', [1, 2, 3, 4, 5].map(z => [String(z), `Zone ${z}`] as [string, string]), a.zone != null ? String(a.zone) : null));
  return `<div class="fgrid iv-attrs">${out.join('')}</div>`;
}

/* ---------- Daten eines Satzes bzw. einer Wiederholung ---------- */
function ctxOf(tg: Tg) {
  const st = HOST!.rec(tg) || {}; const act = actOf(st); const thr = HOST!.thresholds();
  const ab = buildAblauf(plannedIv(tg), st, act, thr, tg.sport, { done: !!st.completed, free: false });
  return { st, ab };
}
const verdictPill = (v: { word: string; cls: string } | null) => (v ? `<span class="pill ${v.cls}">${esc(v.word)}</span>` : '');
/** eine Zeile der Liste (auch im Satz-Fenster): Nummer · Ist fett · Soll grau · Urteil */
export function repLine(r: AbRep, attrs: string, editable: boolean): string {
  const inner = `<span class="ab-n">${r.n}</span><span class="ab-txt">${r.ist ? `<b class="ab-ist">${esc(r.ist)}</b>` : ''}<span class="ab-soll">${esc(r.ist ? r.soll : r.soll === 'ohne Soll' ? 'noch nichts eingetragen' : 'Soll ' + r.soll)}</span></span>${verdictPill(r.verdict)}`;
  const label = `Wiederholung ${r.n}: ${r.ist || 'Soll ' + r.soll}${r.verdict ? ', ' + r.verdict.word : ''}`;
  return editable ? `<button type="button" class="ab-row ab-rep iv-row" data-act="ab-open" data-key="${r.key}" data-iv-row="${r.i}" ${attrs} aria-label="${esc(label)}">${inner}</button>` : `<div class="ab-row ab-rep iv-row" data-iv-row="${r.i}">${inner}</div>`;
}

/* ---------- Fenster: eine Wiederholung ---------- */
export function repTitle(tg: Tg, i: number): string {
  if (!HOST) return ''; const { ab } = ctxOf(tg);
  const set = ab.items.find(x => x.kind === 'set' && x.idx.includes(i)) as AbSet | undefined; if (!set) return 'Wiederholung';
  const r = set.reps.find(x => x.i === i)!;
  return set.reps.length > 1 ? `${r.n}. von ${set.label}` : set.label;
}
export function repSheet(tg: Tg, i: number, attrs: string): string {
  if (!HOST) return '';
  const { ab } = ctxOf(tg); const rows = ab.rows; const targets = ab.targets;
  if (!rows[i]) return '';
  const set = ab.items.find(x => x.kind === 'set' && x.idx.includes(i)) as AbSet | undefined;
  const rep = set ? set.reps.find(x => x.i === i)! : null;
  const r = rows[i]; const t = targetOfRow(rows, targets, i); const l = rep ? rep.line : null;
  const sport = tg.sport; const fields = IV_FIELDS[sport]; const n = rows.length;
  const inp = (f: F) => {
    const id = `iv-${i}-${String(f.k)}`;
    return `<label class="fld ${f.kind === 'text' ? 'wide' : ''}" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="iv" data-iv-in data-i="${i}" data-f="${String(f.k)}" data-kind="${f.kind}" ${ivTf(f, sport)} ${attrs} type="text" inputmode="${f.kind === 'text' ? 'text' : 'decimal'}" enterkeyhint="next" autocomplete="off" aria-label="Wiederholung ${rep ? rep.n : i + 1}: ${esc(f.label)}" value="${esc(valOf(f, r))}" placeholder="${esc(ph(f, t, sport))}">${f.kind === 'clock' || f.kind === 'pace' ? tfHint() : ''}</label>`;
  };
  return `<div class="stack ab-sheet" data-ab-sheet="rep" data-iv-row="${i}">
    <div class="spread ab-sheet-head"><span class="small muted">Soll: ${esc(repSoll(t, sport))}</span>${rep ? verdictPill(rep.verdict) : ''}</div>
    ${r.plan ? '<div class="hint" data-plan-hint>Wie geplant eingetragen (nicht gemessen). Trag ein, was anders war – nur diese Werte zählen dann als gemessen.</div>' : ''}
    ${l && l.why && !r.plan ? `<div class="xs muted iv-why">${esc(l.why)}</div>` : ''}${l && l.diff && l.diff.length ? `<div class="xs">${esc('Anders als geplant: ' + l.diff.join(', '))}</div>` : ''}
    <div class="fgrid">${fields.map(inp).join('')}</div>
    <div class="fgrid">${REST.map(inp).join('')}</div>
    ${attrControls(sport, [i], ivAttrs(r, t, sport), attrs, 'row')}
    <div class="row ab-btns">${i > 0 ? `<button class="btn ghost sm" data-act="iv-copy" data-i="${i}" ${attrs}>wie vorheriges</button>` : ''}<button class="btn ghost sm" data-act="iv-abort" data-i="${i}" ${attrs} aria-pressed="${!!r.aborted}">${r.aborted ? 'abgebrochen ✓' : 'abgebrochen'}</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="-1" ${attrs} ${i === 0 ? 'disabled' : ''} aria-label="Wiederholung nach oben">↑</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="1" ${attrs} ${i >= n - 1 ? 'disabled' : ''} aria-label="Wiederholung nach unten">↓</button><button class="btn ghost sm danger" data-act="iv-del" data-i="${i}" ${attrs} aria-label="Wiederholung löschen">löschen</button></div>
    <button class="btn block" data-act="sub-close">Speichern</button></div>`;
}

/* ---------- Fenster: ein Satz ---------- */
export function setTitle(tg: Tg, gi: number): string { if (!HOST) return ''; const set = ctxOf(tg).ab.items.filter(x => x.kind === 'set')[gi] as AbSet | undefined; return set ? set.label : 'Satz'; }
/* Auftrag 38: sieht Satz gi aus wie der Satz davor (gleiche Art bzw. Zone, Schwimmen gleiche Lage und Hilfsmittel)? */
function sigOf(rows: IvRow[], targets: IvTarget[], g: { idx: number[] }, sport: string): string {
  const a = ivAttrs(rows[g.idx[0]], targetOfRow(rows, targets, g.idx[0]), sport);
  return sport === 'swim' ? [a.stroke, [...a.gear].sort().join('+'), a.zone].join('|') : [a.type || 'flat', a.zone].join('|');
}
export function similarToPrev(rows: IvRow[], targets: IvTarget[], sport: string, gi: number): boolean {
  const groups = ivGroups(rows, targets, sport); if (gi < 1 || !groups[gi] || !groups[gi - 1]) return false;
  return sigOf(rows, targets, groups[gi], sport) === sigOf(rows, targets, groups[gi - 1], sport);
}
export function setSheet(tg: Tg, gi: number, attrs: string): string {
  if (!HOST) return '';
  const { ab } = ctxOf(tg); const rows = ab.rows; const targets = ab.targets; const sport = tg.sport; const fields = IV_FIELDS[sport];
  const sets = ab.items.filter(x => x.kind === 'set') as AbSet[]; const g = sets[gi]; if (!g) return '';
  const groups = ivGroups(rows, targets, sport); const grp = groups[gi]; if (!grp) return '';
  const ids = g.idx.join(','); const t0 = grp.target;
  const at = g.idx.map(i => ivAttrs(rows[i], targetOfRow(rows, targets, i), sport));
  const mixed: Record<string, boolean> = { stroke: new Set(at.map(a => a.stroke)).size > 1, gear: new Set(at.map(a => [...a.gear].sort().join(','))).size > 1, zone: new Set(at.map(a => a.zone)).size > 1, type: new Set(at.map(a => a.type)).size > 1, terrain: new Set(at.map(a => a.terrain)).size > 1, title: new Set(at.map(a => a.ownTitle ? a.title : '')).size > 1 };
  const sameInp = (f: F, scope: number[]) => { const id = `iv-same-${g.idx[0]}-${String(f.k)}`; const vals = new Set(scope.map(i => valOf(f, rows[i]))); const v = vals.size === 1 ? [...vals][0] : '';
    return `<label class="fld" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="iv-same" data-idx="${scope.join(',')}" data-f="${String(f.k)}" data-kind="${f.kind}" ${ivTf(f, sport)} ${attrs} type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Ganzer Satz: ${esc(f.label)}" value="${esc(v)}" placeholder="${esc(ph(f, t0, sport))}">${f.kind === 'clock' || f.kind === 'pace' ? tfHint() : ''}</label>`; };
  // Auftrag 38: ganz oben Wiederholungen [−] n [+], Dauer bzw. Strecke, Pause; danach die Werte für alle Wiederholungen
  const sizeF = fields.find(x => x.k === (sport === 'swim' ? 'm' : 'sec'))!;
  const restF = REST[0];
  const notLast = g.idx.slice(0, -1);
  const vals = SAME[sport].filter(k => k !== sizeF.k).map(k => sameInp(fields.find(x => x.k === k)!, g.idx)).join('');
  const n = g.reps.length;
  const top = `<div class="iv-top" data-set-top>
    <div class="fld"><span class="lab">Wiederholungen</span><div class="stepper" role="group" aria-label="Wiederholungen"><button type="button" class="btn ghost sm" data-act="iv-count" data-d="-1" data-idx="${ids}" ${attrs} ${n <= 1 ? 'disabled' : ''} aria-label="Eine Wiederholung weniger">−</button><output class="num" data-set-reps aria-live="polite">${n}</output><button type="button" class="btn ghost sm" data-act="iv-count" data-d="1" data-idx="${ids}" ${attrs} aria-label="Eine Wiederholung mehr">+</button></div></div>
    <div class="fgrid">${sameInp(sizeF, g.idx)}${n > 1 ? sameInp(restF, notLast) : ''}</div></div>`;
  // Auftrag 38: neuer Satz wie der vorige → „Zu Satz X hinzufügen?“; gleiche Sätze nacheinander zusammenführen
  const similar = similarToPrev(rows, targets, sport, gi);
  const own = g.idx.every(i => rows[i] && rows[i].ti == null);
  const asked = g.idx.some(i => rows[i] && rows[i].sep);
  const prevLabel = gi > 0 ? sets[gi - 1].label : '';
  const ask = similar && own && !asked ? `<div class="banner" role="status" data-merge-ask><div>Zu Satz ${gi} (${esc(prevLabel)}) hinzufügen?</div><div class="row ab-btns"><button class="btn sm" data-act="iv-merge" data-g="${gi}" ${attrs}>Ja, hinzufügen</button><button class="btn ghost sm" data-act="iv-sep" data-idx="${ids}" ${attrs}>Nein, eigener Satz</button></div></div>`
    : similar ? `<button class="link" data-act="iv-merge" data-g="${gi}" ${attrs} data-merge-link>Mit Satz ${gi} (${esc(prevLabel)}) zusammenführen</button>` : '';
  return `<div class="stack ab-sheet" data-ab-sheet="set" data-iv-set="${gi}">
    ${ask}${top}
    ${g.count ? `<div class="small muted" data-set-count>${esc(g.count)}</div>` : ''}
    <div class="stack"><span class="lab">${n > 1 ? 'Werte für alle Wiederholungen' : 'Werte'}</span><div class="fgrid">${vals}</div>${n > 1 ? `<div class="xs muted">Weicht eine Wiederholung ab, tippe sie unten an und ändere nur sie.</div>` : ''}</div>
    ${attrControls(sport, g.idx, { ...grp.attrs }, attrs, 'set', mixed)}
    <div class="stack"><span class="lab">Wiederholungen</span><div class="ab-reps">${g.reps.map(r => `<div class="ab-rep-wrap">${repLine(r, attrs, true)}<button class="icon-btn sm danger" data-act="iv-del" data-i="${r.i}" ${attrs} aria-label="Wiederholung ${r.n} löschen">×</button></div>`).join('')}</div></div>
    <div class="row ab-btns"><button class="btn ghost sm" data-act="iv-set-move" data-g="${gi}" data-dir="-1" ${attrs} ${gi === 0 ? 'disabled' : ''} aria-label="Satz nach oben">Satz ↑</button><button class="btn ghost sm" data-act="iv-set-move" data-g="${gi}" data-dir="1" ${attrs} ${gi >= sets.length - 1 ? 'disabled' : ''} aria-label="Satz nach unten">Satz ↓</button><button class="btn ghost sm danger" data-act="iv-set-del" data-idx="${ids}" ${attrs}>Satz löschen</button></div>
    <button class="btn block" data-act="sub-close">Speichern</button></div>`;
}


/* ---------- Ändern ---------- */
function save(tg: Tg, rows: IvRow[]) {
  if (!HOST) return; const st = HOST.rec(tg); if (!st) return;
  const targets = plannedIntervals(plannedIv(tg), HOST.thresholds());
  const stamped = stampRows(rows, targets, tg.sport);
  // Auftrag 37: die Gesamtwerte passen zum Ablauf (Abschnitte + Wiederholungen), solange sie nicht selbst eingetragen bzw. gemessen sind
  HOST.put(tg, applyTotals(setSessionMetricManual(st, 'intervals', stamped), tg.sport, stamped, targets, plannedIv(tg)));
}
const done = (tg: Tg) => { HOST!.rev(tg); HOST!.redraw(); };
const rowsFor = (tg: Tg) => { const st = HOST!.rec(tg) || {}; return ivRowsFor(plannedIv(tg), st, actOf(st), HOST!.thresholds(), tg.sport).rows; };
const idxOf = (el: HTMLElement) => String(el.dataset.idx || '').split(',').filter(x => x !== '').map(Number);
/* Wert einer Zeile prüfen: freundlich ablehnen, sinnvolle Grenzen; null = leer, undefined = ungültig */
export function readIvValue(f: string, kind: string, raw: string, sport: string): { ok: true; v: any } | { ok: false; msg: string } {
  const v = raw.trim(); if (!v) return { ok: true, v: null };
  if (kind === 'text') return { ok: true, v: v.slice(0, 200) };
  if (kind === 'clock' || kind === 'pace') {
    const tk = ivTime(kind === 'pace' ? (sport === 'swim' ? 'pace100' : 'pace') : f, sport);
    const rr = readTimeInput(v, tk.kind, tk.lim);
    if (rr.ask) return { ok: false, msg: 'Meinst du ' + rr.ask.map(x => secToPace(x)).join(' oder ') + '?' };
    if (rr.err) return { ok: false, msg: 'Bitte als Minuten:Sekunden eingeben, z. B. 4:45 – oder nur Ziffern: 445.' };
    const s = rr.sec;
    if (s == null) return { ok: true, v: null };
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
function setVal(r: IvRow, f: string, v: any) {
  (r as any)[f] = v; if (v == null) delete (r as any)[f];
  // Auftrag 37: ein eigener Messwert ersetzt „wie geplant“ in dieser Wiederholung
  if (VALUE_KEYS.has(f) && r.plan) delete r.plan;
}
onChange('iv', el => {
  if (!HOST || tfAsking(el)) return; const tg = tgOf(el); const i = +el.dataset.i!; const f = el.dataset.f!;
  const res = readIvValue(f, el.dataset.kind || 'num', (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { el.setAttribute('aria-invalid', 'true'); toast(res.msg); return; }
  el.removeAttribute('aria-invalid');
  const rows = rowsFor(tg); while (rows.length <= i) rows.push({ ti: null });
  setVal(rows[i], f, res.v);
  // Rückfrage bei widersprüchlichen Werten (max. Puls unter Ø Puls)
  const r = rows[i]; if (r.hr != null && r.maxHr != null && r.maxHr < r.hr) toast(`Max. Puls ${r.maxHr} liegt unter dem Ø Puls ${r.hr}. Bitte prüfen.`);
  save(tg, rows); done(tg);
});
/* ganzer Satz gleich: ein Wert für alle Wiederholungen des Satzes */
onChange('iv-same', el => {
  if (!HOST || tfAsking(el)) return; const tg = tgOf(el); const f = el.dataset.f!;
  const res = readIvValue(f, el.dataset.kind || 'num', (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { el.setAttribute('aria-invalid', 'true'); toast(res.msg); return; }
  el.removeAttribute('aria-invalid');
  const rows = rowsFor(tg); const idx = idxOf(el);
  idx.forEach(i => { if (rows[i]) setVal(rows[i], f, res.v); });
  save(tg, rows); done(tg);
});
onChange('iv-attr', el => {
  if (!HOST) return; const tg = tgOf(el); const f = el.dataset.f!;
  const res = readIvAttr(f, (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { toast(res.msg); return; }
  const rows = rowsFor(tg); const idx = idxOf(el);
  // „unterschiedlich“ gewählt: nichts ändern
  if (res.v == null && f !== 'title' && (el as HTMLSelectElement).tagName === 'SELECT' && /unterschiedlich/.test((el as HTMLSelectElement).selectedOptions?.[0]?.textContent || '')) return;
  idx.forEach(i => { if (rows[i]) { (rows[i] as any)[f] = res.v; if (res.v == null) delete (rows[i] as any)[f]; } });
  save(tg, rows); done(tg);
});
on('iv-gear', el => {
  if (!HOST) return; const tg = tgOf(el); const g = el.dataset.g || ''; const rows = rowsFor(tg); const idx = idxOf(el);
  const targets = plannedIntervals(plannedIv(tg), HOST.thresholds());
  const cur = idx.map(i => ivAttrs(rows[i], targetOfRow(rows, targets, i), tg.sport).gear);
  const all = g && cur.every(x => x.includes(g));
  idx.forEach((i, k) => { if (!rows[i]) return; rows[i].gear = !g ? [] : all ? cur[k].filter(x => x !== g) : [...new Set([...cur[k], g])]; if (!rows[i].stroke && tg.sport === 'swim') rows[i].stroke = ivAttrs(rows[i], targetOfRow(rows, targets, i), 'swim').stroke || 'crawl'; });
  save(tg, rows); done(tg);
});
/* Satz hinzufügen: neuer Satz mit einer Wiederholung (Lage wie der letzte Satz), zusätzlich zum Plan; das Fenster zeigt den neuen Satz */
on('iv-add', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg);
  const targets = plannedIntervals(plannedIv(tg), HOST.thresholds());
  const key = Math.max(1000, ...rows.map(r => (r.set ?? 0) + 1));
  // Auftrag 38: neuer Satz übernimmt Art bzw. Zone (Schwimmen: Lage, Hilfsmittel) des letzten Satzes – sieht er gleich aus, fragt das Fenster
  // „Zu Satz X hinzufügen?“
  const li = rows.length - 1; const a = li >= 0 ? ivAttrs(rows[li], targetOfRow(rows, targets, li), tg.sport) : null;
  rows.push({ set: key, ti: null, ...(a && a.zone ? { zone: a.zone } : {}), ...(tg.sport === 'swim' ? { stroke: (a && a.stroke) || 'crawl', gear: a ? [...a.gear] : [] } : a && a.type && a.type !== 'flat' ? { type: a.type } : {}) });
  save(tg, rows);
  const gi = ivGroups(stampRows(rows, targets, tg.sport), targets, tg.sport).length - 1;
  HOST.redraw(); UIH.open(tg, 'set:' + gi);
});
/* Auftrag 38: Wiederholungen [−] n [+] – hinzufügen bzw. die letzte entfernen; vorhandene Werte bleiben. Die neue Wiederholung übernimmt
   Art, Zone, Lage und Dauer bzw. Strecke der letzten (wenn dort selbst eingetragen), nicht deren Messwerte. */
on('iv-count', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const idx = idxOf(el); if (!idx.length) return;
  const d = +el.dataset.d!;
  const lastI = idx[idx.length - 1]; const last = rows[lastI] || {};
  const setKey = last.set ?? Math.max(1000, ...rows.map(r => (r.set ?? 0) + 1));
  if (d < 0) {
    if (idx.length <= 1) return;
    if (SUB.key === 'rep:' + lastI) setSubKey('');
    rows.splice(lastI, 1);
  } else {
    // Art, Zone, Lage und Hilfsmittel wie gemacht bzw. geplant (die neue Wiederholung hat kein eigenes Soll)
    const tgs = plannedIntervals(plannedIv(tg), HOST.thresholds()); const ea = ivAttrs(last, targetOfRow(rows, tgs, lastI), sport(tg));
    const { title, terrain, sec, m, restSec } = last as any;
    const zone = ea.zone ?? undefined, type = ea.type ?? undefined, stroke = sport(tg) === 'swim' ? ea.stroke ?? undefined : undefined, gear = sport(tg) === 'swim' ? [...ea.gear] : undefined;
    const own = rowHasValues(last);
    const copy: IvRow = JSON.parse(JSON.stringify({ title, stroke, gear, zone, type, terrain, set: setKey, ti: null, ...(own && (sport(tg) === 'swim' ? m != null : sec != null) ? (sport(tg) === 'swim' ? { m } : { sec }) : {}) }));
    // Pause nach der bisher letzten Wiederholung: die des Satzes (sie ist jetzt nicht mehr die letzte)
    if (last.restSec == null) { const targets = plannedIntervals(plannedIv(tg), HOST.thresholds()); const t = idx.map(i => targetOfRow(rows, targets, i)).find(x => x && x.restSec); const r0 = idx.map(i => rows[i] && rows[i].restSec).find(x => x != null); if (r0 != null) rows[lastI] = { ...last, restSec: r0 }; else if (t && t.restSec && rowHasValues(last)) rows[lastI] = { ...last, restSec: t.restSec }; }
    void restSec;
    if (last.set == null) rows[lastI] = { ...rows[lastI], set: setKey };
    rows.splice(lastI + 1, 0, copy);
  }
  save(tg, rows); HOST.redraw();
});
const sport = (tg: Tg) => tg.sport;
/* Auftrag 38: Satz zum vorigen hinzufügen (zusammenführen) bzw. als eigenen Satz behalten */
on('iv-merge', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const gi = +el.dataset.g!;
  const targets = plannedIntervals(plannedIv(tg), HOST.thresholds());
  const groups = ivGroups(stampRows(rows, targets, tg.sport), targets, tg.sport); const g = groups[gi], p = groups[gi - 1]; if (!g || !p) return;
  const key = rows[p.idx[0]].set ?? targetOfRow(rows, targets, p.idx[0])?.set ?? Math.max(1000, ...rows.map(r => (r.set ?? 0) + 1));
  p.idx.forEach(i => { rows[i] = { ...rows[i], set: key }; });
  g.idx.forEach(i => { const r = { ...rows[i], set: key }; delete r.sep; rows[i] = r; });
  setSubKey('set:' + (gi - 1));
  save(tg, rows); done(tg); toast(`Zu Satz ${gi} hinzugefügt.`);
});
on('iv-sep', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const idx = idxOf(el);
  idx.forEach(i => { if (rows[i]) rows[i] = { ...rows[i], sep: true }; });
  save(tg, rows); done(tg);
});
on('iv-set-del', el => {
  if (!HOST) return;
  const tg = tgOf(el); const rows = rowsFor(tg); const idx = new Set(idxOf(el));
  setSubKey(''); save(tg, rows.filter((_, i) => !idx.has(i))); done(tg);
});
on('iv-set-move', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg);
  const targets = plannedIntervals(plannedIv(tg), HOST.thresholds());
  const groups = ivGroups(rows, targets, tg.sport); const gi = +el.dataset.g!, gj = gi + +el.dataset.dir!;
  if (gj < 0 || gj >= groups.length) return;
  // Satz-Kennung festhalten, damit die Gruppen nach dem Verschieben gleich bleiben
  groups.forEach((g, k) => g.idx.forEach(i => { if (rows[i].set == null) rows[i].set = 2000 + k; }));
  const order = groups.map(g => g.idx.map(i => rows[i]));
  [order[gi], order[gj]] = [order[gj], order[gi]];
  if (SUB.key === 'set:' + gi) setSubKey('set:' + gj);
  save(tg, order.flat()); done(tg);
});
on('iv-del', el => {
  if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const d = +el.dataset.i!;
  if (SUB.key === 'rep:' + d) setSubKey(''); else if (SUB.key.startsWith('rep:') && +SUB.key.slice(4) > d) setSubKey('rep:' + (+SUB.key.slice(4) - 1));
  rows.splice(d, 1); save(tg, rows); done(tg);
});
on('iv-move', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!, j = i + +el.dataset.dir!; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; if (SUB.key === 'rep:' + i) setSubKey('rep:' + j); save(tg, rows); done(tg); });
on('iv-copy', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; if (!rows[i - 1]) return; const { note, aborted, ti, set, title, ...prev } = rows[i - 1]; void note; void aborted; void ti; void set; void title; rows[i] = { ...rows[i], ...prev }; save(tg, rows); done(tg); });
on('iv-abort', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; if (!rows[i]) return; rows[i] = { ...rows[i], aborted: !rows[i].aborted }; if (!rows[i].aborted) delete rows[i].aborted; else delete rows[i].plan; save(tg, rows); done(tg); });
on('iv-reset', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; const next = setSessionMetricManual(st, 'intervals', ''); delete next.metricsManual.intervals; HOST.put(tg, applyTotals(next, tg.sport, undefined, plannedIntervals(plannedIv(tg), HOST.thresholds()), plannedIv(tg))); done(tg); toast('Werte der Uhr gelten wieder.'); });
/* Enter springt zum nächsten Feld der Wiederholung (im Fenster) */
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  const el = e.target as HTMLElement | null;
  if (e.key !== 'Enter' || !el || !el.hasAttribute || !el.hasAttribute('data-iv-in')) return;
  e.preventDefault();
  const scope = el.closest('.sheet') || document;
  const all = Array.from(scope.querySelectorAll<HTMLInputElement>('[data-iv-in]'));
  const nx0 = all[all.indexOf(el as HTMLInputElement) + 1];
  (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  const id = nx0 && nx0.id;
  if (!id) { (el as HTMLInputElement).blur(); return; }
  // Speichern zeichnet das Fenster neu (auch etwas später, z. B. unter Last): Fokus dann erneut setzen, solange niemand sonst ihn hat
  const put = (first: boolean) => { const nx = document.getElementById(id) as HTMLInputElement | null; if (!nx || document.activeElement === nx) return; const a = document.activeElement as HTMLElement | null; if (!first && a && a !== document.body && a.isConnected) return; nx.focus(); nx.select && nx.select(); };
  setTimeout(() => put(true), 0); [80, 250, 600].forEach(ms => setTimeout(() => put(false), ms));
});
export { paceToSec };
