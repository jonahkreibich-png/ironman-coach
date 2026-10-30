/* Auftrag 22: Bereich „Intervalle“ unter den Werten einer Einheit (Laufen, Rad, Schwimmen, Koppel).
   Liste aus dem Plan, Soll-Werte nur als Platzhalter. Je Intervall Dauer bzw. Strecke, Puls, Pace/Watt/km/h/Pace pro 100 m, Kadenz,
   Züge pro Bahn, RPE, Notiz; je Pause Dauer und Puls am Ende. Hinzufügen, löschen, verschieben, „wie vorheriges“, abgebrochen.
   Werte der Uhr stehen drin (mit Quelle); wer etwas ändert, bekommt eine eigene Liste (Hand gewinnt), „Uhrwerte“ holt sie zurück.
   Enter springt zum nächsten Feld. Darüber: kleine Balken je Intervall (Soll gegen Ist) mit Wort und Farbe. */
import { esc } from '../util';
import { on, onChange, srcBadge, more } from '../kit';
import { toast } from '../toast';
import { evaluateIntervals, plannedIntervals, actualRows, paceToSec, secToPace, IV_LIMITS, type IvRow, type IvEval, type IvTarget, type IvThresholds } from '../../../shared/intervals';
import { setSessionMetricManual } from '../../../shared/activity/merge';

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
function ph(f: F, t: IvTarget | null, sport: string): string {
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

export function intervalsBlock(tg: any, st: any, attrs: string): string {
  const { e, targets } = ivContext(tg, st);
  if (!e && !targets.length) return '';
  const sport = tg.sport; const fields = IV_FIELDS[sport];
  const manual = e && e.source === 'manual';
  const act = st && st.activityId && HOST ? HOST.activities()[st.activityId] : null;
  const autoAvail = !!act && manual && actualRows({}, act).rows.length > 0;
  const rows = editableRows(tg, st);
  const n = Math.max(rows.length, targets.length);
  const srcName = e && e.source !== 'none' ? SRC[e.source] : null;
  const lines = e ? e.lines : [];
  const verdictOfRow = (i: number) => (manual ? lines[i] : lines.filter(l => !l.extra)[i] || lines.filter(l => l.extra)[i - targets.length]);
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
  // Balken je Intervall: Breite = Ist/Soll (Dauer bzw. Strecke), Farbe = im Ziel / zu hart / zu locker
  const bars = lines.map((l, i) => {
    const t = l.target; const r = l.row;
    const size = t ? (sport === 'swim' ? t.m : t.sec) : null, got = r ? (sport === 'swim' ? r.m : r.sec) : null;
    const pct = size && got ? Math.min(100, got / size * 100) : l.done ? 100 : 0;
    const [word, cls] = l.extra ? ['zusätzlich', 'info'] : VERDICT[l.verdict || ''] || ['ohne Ziel', ''];
    const col = cls === 'good' ? 'var(--good)' : cls === 'bad' ? 'var(--bad)' : cls === 'warn' ? 'var(--warn)' : cls === 'info' ? 'var(--info)' : 'var(--rest)';
    return `<li class="iv-bar"><span class="iv-n">${i + 1}</span><span class="iv-soll">${esc(t ? t.label : '–')}</span><span class="bar" style="--c:${col}" aria-hidden="true"><i style="width:${pct.toFixed(0)}%"></i></span><span class="pill ${cls}">${esc(word)}</span>${l.why ? `<span class="xs muted iv-why">${esc(l.why)}</span>` : ''}</li>`;
  }).join('');
  const inp = (i: number, f: F, r: IvRow | null, t: IvTarget | null) => {
    const id = `iv-${i}-${String(f.k)}`;
    const mode = f.kind === 'text' ? 'text' : f.k === 'speed' ? 'decimal' : 'decimal';
    return `<label class="fld ${f.kind === 'text' ? 'wide' : ''}" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="iv" data-iv-in data-i="${i}" data-f="${String(f.k)}" data-kind="${f.kind}" ${attrs} type="text" inputmode="${mode}" enterkeyhint="next" autocomplete="off" aria-label="Intervall ${i + 1}: ${esc(f.label)}" value="${esc(valOf(f, r))}" placeholder="${esc(ph(f, t, sport))}"></label>`;
  };
  const cards = Array.from({ length: n }, (_, i) => {
    const r = rows[i] || null, t = targets[i] || null;
    const l = verdictOfRow(i);
    const [word, cls] = l && l.extra ? ['zusätzlich', 'info'] : l ? VERDICT[l.verdict || ''] || ['', ''] : ['', ''];
    return `<div class="card flat stack iv-card" data-iv-row="${i}"><div class="spread"><b class="xs">Intervall ${i + 1}${t ? ` · Soll ${esc(t.label)}` : ' · zusätzlich'}</b>${word ? `<span class="pill ${cls}">${esc(word)}</span>` : ''}</div>
      <div class="fgrid">${fields.map(f => inp(i, f, r, t)).join('')}</div>
      <div class="fgrid">${REST.map(f => inp(i, f, r, t)).join('')}</div>
      <div class="row" style="flex-wrap:wrap;gap:6px">${i > 0 ? `<button class="btn ghost sm" data-act="iv-copy" data-i="${i}" ${attrs}>wie vorheriges</button>` : ''}<button class="btn ghost sm" data-act="iv-abort" data-i="${i}" ${attrs} aria-pressed="${!!(r && r.aborted)}">${r && r.aborted ? 'abgebrochen ✓' : 'abgebrochen'}</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="-1" ${attrs} ${i === 0 ? 'disabled' : ''} aria-label="Intervall ${i + 1} nach oben">↑</button><button class="btn ghost sm" data-act="iv-move" data-i="${i}" data-dir="1" ${attrs} ${i >= n - 1 ? 'disabled' : ''} aria-label="Intervall ${i + 1} nach unten">↓</button><button class="btn ghost sm danger" data-act="iv-del" data-i="${i}" ${attrs} aria-label="Intervall ${i + 1} löschen">löschen</button></div></div>`;
  }).join('');
  return `<div class="fld wide stack" data-intervals="${esc(sport)}"><div class="spread"><span class="lab">Intervalle ${srcName ? srcBadge(srcName) : ''}</span>${autoAvail ? `<button class="link" data-act="iv-reset" ${attrs}>Uhrwerte verwenden</button>` : ''}</div>
    ${sum.length ? `<div class="xs" data-iv-sum>${sum.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : `<div class="xs muted">Geplante Werte stehen grau im Feld. Sie zählen erst, wenn du etwas einträgst oder die Uhr es misst.</div>`}
    ${bars ? `<ol class="iv-bars" aria-label="Intervalle Soll gegen Ist">${bars}</ol>` : ''}
    ${more(manual ? 'Intervalle bearbeiten' : 'Intervalle eintragen oder korrigieren', `<div class="stack">${cards}<button class="btn ghost sm" data-act="iv-add" ${attrs}>+ Intervall hinzufügen</button></div>`, !!manual)}</div>`;
}

/* ---------- Ändern ---------- */
function save(tg: any, rows: IvRow[]) {
  if (!HOST) return; const st = HOST.rec(tg); if (!st) return;
  HOST.put(tg, setSessionMetricManual(st, 'intervals', rows));
}
const tgOf = (el: HTMLElement) => ({ kind: el.dataset.tk as any, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport!, planned: plannedOf(el) });
let plannedLookup: (id: string, date: string) => any = () => null;
export function registerPlannedLookup(fn: (id: string, date: string) => any) { plannedLookup = fn; }
const plannedOf = (el: HTMLElement) => (el.dataset.tk === 'session' ? plannedLookup(el.dataset.tid!, el.dataset.tdate!) : null);
const rowsFor = (tg: any) => { const st = HOST!.rec(tg) || {}; return editableRows(tg, st); };
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
  const n = parseFloat(v.replace(',', '.'));
  if (!Number.isFinite(n) || !/^-?\d+([.,]\d+)?$/.test(v)) return { ok: false, msg: 'Bitte eine Zahl eingeben.' };
  const lim = IV_LIMITS[f];
  if (lim && (n < lim[0] || n > lim[1])) return { ok: false, msg: f === 'hr' || f === 'maxHr' || f === 'restHr' ? `Puls ${n} ist unrealistisch (möglich: 30 bis 230).` : f === 'rpe' ? 'RPE geht von 1 (sehr leicht) bis 10 (maximal).' : `${n} ist hier unrealistisch (möglich: ${lim[0]} bis ${lim[1]}).` };
  return { ok: true, v: f === 'speed' ? Math.round(n * 10) / 10 : Math.round(n) };
}
onChange('iv', el => {
  if (!HOST) return; const tg = tgOf(el); const i = +el.dataset.i!; const f = el.dataset.f!;
  const res = readIvValue(f, el.dataset.kind || 'num', (el as HTMLInputElement).value, tg.sport);
  if (res.ok === false) { toast(res.msg); return; }
  const rows = rowsFor(tg); while (rows.length <= i) rows.push({});
  (rows[i] as any)[f] = res.v; if (res.v == null) delete (rows[i] as any)[f];
  // Rückfrage bei widersprüchlichen Werten (max. Puls unter Ø Puls)
  const r = rows[i]; if (r.hr != null && r.maxHr != null && r.maxHr < r.hr) toast(`Max. Puls ${r.maxHr} liegt unter dem Ø Puls ${r.hr}. Bitte prüfen.`);
  save(tg, rows); HOST.rev(tg); HOST.redraw();
});
on('iv-add', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const n = Math.max(rows.length, plannedIntervals(tg.planned, HOST.thresholds()).length); while (rows.length < n) rows.push({}); rows.push({}); save(tg, rows); HOST.redraw(); });
on('iv-del', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); rows.splice(+el.dataset.i!, 1); save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-move', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!, j = i + +el.dataset.dir!; while (rows.length <= Math.max(i, j)) rows.push({}); if (j < 0) return; [rows[i], rows[j]] = [rows[j], rows[i]]; save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-copy', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; while (rows.length <= i) rows.push({}); const { note, aborted, ...prev } = rows[i - 1] || {} as IvRow; rows[i] = { ...prev }; save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-abort', el => { if (!HOST) return; const tg = tgOf(el); const rows = rowsFor(tg); const i = +el.dataset.i!; while (rows.length <= i) rows.push({}); rows[i] = { ...rows[i], aborted: !rows[i].aborted }; if (!rows[i].aborted) delete rows[i].aborted; save(tg, rows); HOST.rev(tg); HOST.redraw(); });
on('iv-reset', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; const next = setSessionMetricManual(st, 'intervals', ''); delete next.metricsManual.intervals; HOST.put(tg, next); HOST.rev(tg); HOST.redraw(); toast('Werte der Uhr gelten wieder.'); });
/* Enter springt zum nächsten Feld der Intervall-Liste */
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  const el = e.target as HTMLElement | null;
  if (e.key !== 'Enter' || !el || !el.hasAttribute || !el.hasAttribute('data-iv-in')) return;
  e.preventDefault();
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('[data-iv-in]'));
  const i = all.indexOf(el as HTMLInputElement);
  (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  const id = all[i + 1] && all[i + 1].id;
  setTimeout(() => { const nx = id ? document.getElementById(id) as HTMLInputElement | null : null; if (nx) { nx.focus(); nx.select && nx.select(); } }, 0);
});
export { paceToSec };
