/* Auftrag 35/37: Abschnitte einer Einheit (Laufen, Rad, Schwimmen; Koppel = Rad + Lauf): Aufwärmen / Hauptteil / Ausklang
   (Schwimmen: Einschwimmen / Technik / Hauptserie / Ausschwimmen), je mit Dauer, Strecke, Ø Puls, max. Puls und Pace bzw. Watt/Tempo.
   Auftrag 37: angezeigt im „Ablauf“ (ablaufui.ts) zusammen mit den Sätzen; hier steht das Fenster für einen Abschnitt (Werte, bei Werten der Uhr
   die korrigierbare Grenze, Löschen). Gelöschte Abschnitte stehen als { part, off: true } in metrics.sections und lassen sich über
   „+ Abschnitt / Satz hinzufügen“ wieder anlegen. Gespeichert und geprüft wie alle Felder (shared/validate checkField); die Gesamtwerte zieht
   shared/sections applySections aus dem ganzen Ablauf nach. */
import { esc } from '../util';
import { on, onChange, srcBadge } from '../kit';
import { toast } from '../toast';
import { checkField, inputDisplay } from '../../../shared/validate';
import { sectionsOf, applySections, setBounds, SEC_PARTS, SEC_FIELDS, partLabel, type SecRow, type SecPart } from '../../../shared/sections';
import { plannedPart, buildAblauf, type AbSec } from '../../../shared/ablauf';
import { plannedIntervals } from '../../../shared/intervals';
import { HOST, tgOf, actOf, plannedIv, setSubKey, UIH, type Tg } from './ablaufstate';

const SRC: Record<string, string> = { manual: 'manual', watch: 'file', series: 'file', splits: 'file' };
const show = (sport: string, key: string, v: any) => (v == null || v === '' ? '' : key === 'pace' || key === 'pace100' ? String(v) : inputDisplay(sport, key, v));
const resOf = (tg: Tg, st: any) => sectionsOf(tg.planned || { sport: tg.sport }, st, actOf(st), HOST!.thresholds(), tg.sport);
const verdictPill = (v: { word: string; cls: string } | null) => (v ? `<span class="pill ${v.cls}">${esc(v.word)}</span>` : '');

export function secTitle(tg: Tg, p: SecPart): string { return partLabel(tg.sport, p); }
export function secSheet(tg: Tg, p: SecPart, attrs: string): string {
  if (!HOST || !['run', 'bike', 'swim'].includes(tg.sport)) return '';
  const st = HOST.rec(tg) || {}; const act = actOf(st);
  const ab = buildAblauf(plannedIv(tg), st, act, HOST.thresholds(), tg.sport, { done: !!st.completed, free: HOST.mode(tg) === 'free' });
  const item = ab.items.find(x => x.kind === 'sec' && x.part === p) as AbSec | undefined; if (!item) return '';
  const r = resOf(tg, st); const manual = r.source === 'manual' || r.source === 'plan';
  const row = manual ? r.rows.find(x => x.part === p) || null : null, au = !manual ? r.rows.find(x => x.part === p) || null : null;
  const pm = plannedPart(tg.planned, p);
  const fields = (SEC_FIELDS as any)[tg.sport] as { key: keyof SecRow; label: string; unit?: string; pace?: boolean }[];
  const inputs = fields.map(f => {
    const id = `sec-${p}-${String(f.key)}`;
    const own = row && !row.plan ? (row as any)[f.key] : row && row.plan ? (row as any)[f.key] : '';
    const ph = au && (au as any)[f.key] != null ? show(tg.sport, String(f.key), (au as any)[f.key]) : f.key === 'min' && pm && tg.sport !== 'swim' ? String(pm) : f.key === 'meters' && pm && tg.sport === 'swim' ? String(pm) : f.pace ? (tg.sport === 'swim' ? '2:10' : '5:30') : '';
    return `<label class="fld" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="sec" data-p="${p}" data-f="${String(f.key)}" ${attrs} type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="${esc(item.label)}: ${esc(f.label)}" value="${esc(show(tg.sport, String(f.key), own))}" placeholder="${esc(ph)}"></label>`;
  }).join('');
  // Werte der Uhr: wo die Grenzen erkannt wurden, korrigierbar (Aufwärmen bis Minute X, Ausklang ab Minute Y)
  const auto = !manual && r.rows.length && r.source !== 'none';
  const bounds = auto && r.totalMin && r.source !== 'watch' && tg.sport !== 'swim' ? `<div class="xs muted" data-sec-bounds>${esc(`Erkannt aus ${r.source === 'splits' ? 'den km-Splits' : 'dem Pulsverlauf'}: Aufwärmen ${r.warmEnd ? `bis Minute ${Math.round(r.warmEnd)}` : 'keins'}, Ausklang ${r.coolStart != null ? `ab Minute ${Math.round(r.coolStart)}` : 'keiner'}.`)}</div>
    <div class="fgrid" data-sec-fix><label class="fld"><span class="lab">Aufwärmen bis Minute</span><input class="inp" id="sec-b-warm" type="text" inputmode="decimal" data-ch="sec-bound" data-b="warm" ${attrs} value="${r.corrected && r.warmEnd != null ? Math.round(r.warmEnd) : ''}" placeholder="${r.warmEnd != null ? Math.round(r.warmEnd) : ''}"></label><label class="fld"><span class="lab">Ausklang ab Minute</span><input class="inp" id="sec-b-cool" type="text" inputmode="decimal" data-ch="sec-bound" data-b="cool" ${attrs} value="${r.corrected && r.coolStart != null ? Math.round(r.coolStart) : ''}" placeholder="${r.coolStart != null ? Math.round(r.coolStart) : Math.round(r.totalMin)}"></label></div>
    ${r.corrected ? `<button class="link" data-act="sec-bound-reset" ${attrs}>Grenzen wieder automatisch erkennen</button>` : ''}` : auto && r.source === 'watch' ? '<div class="xs muted" data-sec-bounds>Aus den Runden deiner Uhr (Aufwärmen bzw. Ausklang).</div>' : '';
  return `<div class="stack ab-sheet" data-ab-sheet="sec" data-sec-part="${p}">
    <div class="spread ab-sheet-head"><span class="small muted">${item.soll ? `Geplant: ${esc(item.soll)}` : 'Nicht geplant'} ${r.source !== 'none' ? srcBadge(SRC[r.source] || null) : ''}</span>${verdictPill(item.verdict)}</div>
    ${row && row.plan ? '<div class="hint" data-plan-hint>Wie geplant eingetragen (nicht gemessen). Trag ein, was anders war.</div>' : ''}
    ${bounds}
    <div class="fgrid">${inputs}</div>
    <div class="xs muted">${esc(p === 'warm' ? 'Beim Aufwärmen ist der Puls noch nicht in der Zielzone – der Coach bewertet die Zone am Hauptteil.' : 'Die Gesamtwerte der Einheit werden aus dem Ablauf berechnet, solange du sie nicht selbst einträgst.')}</div>
    <div class="row ab-btns"><button class="btn ghost sm danger" data-act="sec-del" data-p="${p}" ${attrs}>${esc(item.label)} löschen</button></div>
    <button class="btn block" data-act="sub-close">Speichern</button></div>`;
}

/* ---------- Ändern ---------- */
/** alle Abschnitte der Sportart (auch gelöschte), mit dem Teil p; von Hand bzw. „wie geplant“ wie gespeichert, sonst die erkannten Werte */
function rowsFor(tg: Tg, st: any, p?: string): SecRow[] {
  const r = resOf(tg, st);
  const all = ((SEC_PARTS as any)[tg.sport] as [SecPart, string][]).map(x => x[0]);
  const rows = r.rows.map(x => ({ ...x }));
  if (p && !rows.some(x => x.part === p)) rows.push({ part: p as SecPart });
  return rows.sort((a, b) => all.indexOf(a.part) - all.indexOf(b.part));
}
const asText = (rows: SecRow[]) => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]))) as SecRow[];
const tgTargets = (tg: Tg) => plannedIntervals(plannedIv(tg), HOST!.thresholds());
const finish = (tg: Tg) => { HOST!.rev(tg); HOST!.redraw(); };
/** Wert eines Abschnitts lesen: dieselbe Prüfung wie das Feld der Einheit */
export function readSecValue(sport: string, f: string, raw: string): { ok: true; v: any } | { ok: false; msg: string } {
  const c = checkField(sport, f, raw.trim());
  return c.ok ? { ok: true, v: c.value === '' ? null : c.value } : { ok: false, msg: c.msg! };
}
onChange('sec', el => {
  if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return;
  const res = readSecValue(tg.sport, el.dataset.f!, (el as HTMLInputElement).value);
  if (res.ok === false) { el.setAttribute('aria-invalid', 'true'); toast(res.msg); return; }
  el.removeAttribute('aria-invalid');
  const rows = rowsFor(tg, st, el.dataset.p); const row = rows.find(r => r.part === el.dataset.p) as any; if (!row) return;
  // Auftrag 37: ein eigener Wert ersetzt „wie geplant“ in diesem Abschnitt
  delete row.added;
  if (row.plan) { delete row.plan; if (el.dataset.f !== 'min') delete row.min; if (el.dataset.f !== 'meters') delete row.meters; }
  if (res.v == null) delete row[el.dataset.f!]; else row[el.dataset.f!] = res.v;
  if (row.hr != null && row.maxHr != null && +row.maxHr < +row.hr) toast(`Max. Puls ${row.maxHr} liegt unter dem Ø Puls ${row.hr}. Bitte prüfen.`);
  HOST.put(tg, applySections(st, asText(rows), tg.sport, undefined, 'manual', tgTargets(tg)));
  finish(tg);
});
/* Abschnitt löschen (nicht gemacht) bzw. wieder hinzufügen */
on('sec-del', el => {
  if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; const p = el.dataset.p!;
  const rows = rowsFor(tg, st, p).map(r => (r.part === p ? { part: r.part, off: true } : r));
  setSubKey(''); HOST.put(tg, applySections(st, asText(rows), tg.sport, undefined, 'manual', tgTargets(tg))); finish(tg);
});
on('sec-add', el => {
  if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; const p = el.dataset.p!;
  const rows = rowsFor(tg, st, p).map(r => (r.part === p ? { part: r.part, added: true } : r));
  // ohne eigene Werte ist ein Abschnitt einfach wieder sichtbar (noch nichts eingetragen)
  const next = applySections(st, asText(rows), tg.sport, undefined, 'manual', tgTargets(tg));
  HOST.put(tg, next); HOST.redraw(); UIH.open(tg, 'sec:' + p);
});
onChange('sec-bound', el => {
  if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return;
  const raw = (el as HTMLInputElement).value.trim().replace(',', '.');
  const v = raw === '' ? null : Number(raw);
  const cur = (st.metrics && st.metrics.sectionBounds) || {};
  const r = resOf(tg, st);
  if (v != null && (!Number.isFinite(v) || v < 0 || (r.totalMin != null && v > r.totalMin))) { el.setAttribute('aria-invalid', 'true'); toast(`Bitte eine Minute zwischen 0 und ${r.totalMin != null ? Math.round(r.totalMin) : 'dem Ende'} eingeben.`); return; }
  const next = { warm: cur.warm ?? null, cool: cur.cool ?? null, [el.dataset.b!]: v } as any;
  if (next.warm != null && next.cool != null && next.cool <= next.warm) { toast('Der Ausklang muss nach dem Aufwärmen beginnen.'); return; }
  HOST.put(tg, setBounds(st, next.warm, next.cool)); finish(tg);
});
on('sec-bound-reset', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; HOST.put(tg, setBounds(st, null, null)); finish(tg); toast('Grenzen werden wieder automatisch erkannt.'); });
