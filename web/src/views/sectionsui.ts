/* Auftrag 35, Punkt 1: Bereich „Abschnitte“ unter den Werten einer Einheit (Laufen, Rad, Schwimmen; Koppel = Rad + Lauf).
   Aufwärmen / Hauptteil / Ausklang (Schwimmen: Einschwimmen / Technik / Hauptserie / Ausschwimmen), je mit Dauer, Strecke, Ø Puls,
   max. Puls und Pace bzw. Watt/Tempo bzw. Pace pro 100 m. Bei Intervallen nur Aufwärmen und Ausklang (die Wiederholungen stehen unter
   „Intervalle“). Werte der Uhr: erkannte Abschnitte mit „Hauptteil 40 min, Ø Puls 147 (Zone 2)“; die Grenze lässt sich korrigieren.
   Gespeichert und geprüft wie alle Felder (shared/validate checkField); die Gesamtwerte zieht shared/sections applySections nach. */
import { esc } from '../util';
import { on, onChange, srcBadge, more } from '../kit';
import { toast } from '../toast';
import { checkField, inputDisplay } from '../../../shared/validate';
import { sectionsOf, mainPart, mainText, applySections, setBounds, plannedShape, SEC_PARTS, SEC_FIELDS, type SecRow, type SecPart } from '../../../shared/sections';

export interface SecHost { rec: (tg: any) => any; put: (tg: any, next: any) => void; redraw: () => void; rev: (tg: any) => void; activities: () => Record<string, any>; thresholds: () => any; planned: (tg: any) => any; hasIntervals: (tg: any, st: any) => boolean }
let HOST: SecHost | null = null;
export function registerSectionHost(h: SecHost) { HOST = h; }
const SRC: Record<string, string> = { manual: 'manual', watch: 'file', series: 'file', splits: 'file' };

function actOf(st: any) { return st && st.activityId && HOST ? HOST.activities()[st.activityId] || null : null; }
/** welche Abschnitte: Intervalle → nur Aufwärmen und Ausklang (außer Schwimmen) */
function partsFor(tg: any, st: any): [SecPart, string][] {
  const all = (SEC_PARTS as any)[tg.sport] as [SecPart, string][] | undefined; if (!all) return [];
  if (tg.sport !== 'swim' && HOST && HOST.hasIntervals(tg, st)) return all.filter(([p]) => p !== 'main');
  return all;
}
function plannedMin(planned: any, part: SecPart): number | null {
  const steps: any[] = (planned && planned.spec && planned.spec.steps) || [];
  const ss = steps.filter(s => s.part === part && (part !== 'main' || !['drill', 'kick'].includes(s.mode)));
  if (part === 'tech') { const t = steps.filter(s => s.part === 'main' && ['drill', 'kick'].includes(s.mode)); return t.length ? t.reduce((a, s) => a + (s.reps || 1) * (s.m || 0), 0) : null; }
  if (!ss.length) return null;
  return planned.sport === 'swim' ? ss.reduce((a, s) => a + (s.reps || 1) * (s.m || 0), 0) : ss.reduce((a, s) => a + (s.reps || 1) * (s.min || 0) + Math.max(0, (s.reps || 1) - 1) * (s.restMin || 0), 0);
}
const show = (sport: string, key: string, v: any) => (v == null || v === '' ? '' : key === 'pace' || key === 'pace100' ? String(v) : inputDisplay(sport, key, v));

export function sectionsBlock(tg: any, st: any, attrs: string): string {
  if (!HOST || !['run', 'bike', 'swim'].includes(tg.sport)) return '';
  const parts = partsFor(tg, st); if (!parts.length) return '';
  const thr = HOST.thresholds(); const act = actOf(st);
  const r = sectionsOf(tg.planned || { sport: tg.sport }, st, act, thr, tg.sport);
  const manual = r.source === 'manual';
  const lthr = tg.sport === 'bike' ? thr.lthrBike : thr.lthrRun;
  const shape = plannedShape(tg.planned);
  const mp = mainPart(tg.planned || { sport: tg.sport }, st, act, thr, tg.sport);
  const summary = mp ? `<div class="small" data-sec-main><b>${esc(mainText(mp, tg.sport === 'swim' ? null : lthr, tg.sport, shape.zone))}</b></div>` : '';
  const auto = !manual && r.rows.length && r.source !== 'none';
  const bounds = auto && r.totalMin ? `<div class="xs muted" data-sec-bounds>${esc(`Erkannt aus ${r.source === 'splits' ? 'den km-Splits' : r.source === 'watch' ? 'den Runden der Uhr' : 'dem Pulsverlauf'}: Aufwärmen ${r.warmEnd ? `bis Minute ${Math.round(r.warmEnd)}` : 'keins'}, Ausklang ${r.coolStart != null ? `ab Minute ${Math.round(r.coolStart)}` : 'keiner'}.`)}</div>
    ${r.source !== 'watch' ? `<div class="fgrid" data-sec-fix><label class="fld"><span class="lab">Aufwärmen bis Minute</span><input class="inp" id="sec-b-warm" type="text" inputmode="decimal" data-ch="sec-bound" data-b="warm" ${attrs} value="${r.corrected && r.warmEnd != null ? Math.round(r.warmEnd) : ''}" placeholder="${r.warmEnd != null ? Math.round(r.warmEnd) : ''}"></label><label class="fld"><span class="lab">Ausklang ab Minute</span><input class="inp" id="sec-b-cool" type="text" inputmode="decimal" data-ch="sec-bound" data-b="cool" ${attrs} value="${r.corrected && r.coolStart != null ? Math.round(r.coolStart) : ''}" placeholder="${r.coolStart != null ? Math.round(r.coolStart) : Math.round(r.totalMin)}"></label></div>
    ${r.corrected ? `<button class="link" data-act="sec-bound-reset" ${attrs}>Grenzen wieder automatisch erkennen</button>` : ''}` : ''}` : '';
  const fields = (SEC_FIELDS as any)[tg.sport] as { key: keyof SecRow; label: string; unit?: string; pace?: boolean }[];
  const rowOf = (p: SecPart): SecRow | null => (manual ? r.rows.find(x => x.part === p) || null : null);
  const autoOf = (p: SecPart): SecRow | null => (!manual ? r.rows.find(x => x.part === p) || null : null);
  const cards = parts.map(([p, label]) => {
    const row = rowOf(p), au = autoOf(p); const pm = plannedMin(tg.planned, p);
    const inputs = fields.map(f => {
      const id = `sec-${p}-${String(f.key)}`;
      const ph = au && (au as any)[f.key] != null ? show(tg.sport, String(f.key), (au as any)[f.key]) : f.key === 'min' && pm && tg.sport !== 'swim' ? String(pm) : f.key === 'meters' && pm && tg.sport === 'swim' ? String(pm) : f.pace ? (tg.sport === 'swim' ? '2:10' : '5:30') : '';
      return `<label class="fld" for="${id}"><span class="lab">${esc(f.label)}${f.unit ? ` <span class="muted">(${esc(f.unit)})</span>` : ''}</span><input class="inp" id="${id}" data-ch="sec" data-p="${p}" data-f="${String(f.key)}" ${attrs} type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(label)}: ${esc(f.label)}" value="${esc(show(tg.sport, String(f.key), row ? (row as any)[f.key] : ''))}" placeholder="${esc(ph)}"></label>`;
    }).join('');
    return `<div class="card flat stack sec-card" data-sec-part="${p}"><b class="xs">${esc(label)}${pm ? ` <span class="muted">· geplant ${tg.sport === 'swim' ? `${pm} m` : `${pm} min`}</span>` : ''}</b><div class="fgrid">${inputs}</div></div>`;
  }).join('');
  const hint = manual ? 'Die Gesamtwerte oben werden aus den Abschnitten berechnet, solange du sie nicht selbst einträgst.' : 'Beim Aufwärmen ist der Puls noch nicht in der Zielzone. Trägst du die Abschnitte ein, bewertet der Coach die Zone nur am Hauptteil.';
  return `<div class="fld wide stack" data-sections="${esc(tg.sport)}"><div class="spread"><span class="lab">Abschnitte ${r.source !== 'none' ? srcBadge(SRC[r.source]) : ''}</span>${manual ? `<button class="link" data-act="sec-clear" ${attrs}>Abschnitte leeren</button>` : ''}</div>
    ${summary}${bounds}
    ${more(manual ? 'Abschnitte bearbeiten' : parts.length === 2 ? 'Aufwärmen und Ausklang eintragen' : 'Abschnitte eintragen', `<div class="stack"><div class="xs muted">${esc(hint)}</div>${cards}</div>`, manual)}</div>`;
}

/* ---------- Ändern ---------- */
const tgOf = (el: HTMLElement) => { const tg: any = { kind: el.dataset.tk, id: el.dataset.tid!, date: el.dataset.tdate!, sport: el.dataset.tsport! }; tg.planned = HOST ? HOST.planned(tg) : null; return tg; };
function rowsFor(tg: any, st: any): SecRow[] {
  const r = sectionsOf(tg.planned || { sport: tg.sport }, st, actOf(st), HOST!.thresholds(), tg.sport);
  // von Hand: gespeicherte Liste; sonst die erkannten Werte als Ausgangspunkt (Hand gewinnt danach)
  return partsFor(tg, st).map(([p]) => ({ ...(r.rows.find(x => x.part === p) || { part: p }) }));
}
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
  const rows = rowsFor(tg, st); const row = rows.find(r => r.part === el.dataset.p) as any; if (!row) return;
  if (res.v == null) delete row[el.dataset.f!]; else row[el.dataset.f!] = res.v;
  if (row.hr != null && row.maxHr != null && +row.maxHr < +row.hr) toast(`Max. Puls ${row.maxHr} liegt unter dem Ø Puls ${row.hr}. Bitte prüfen.`);
  HOST.put(tg, applySections(st, rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]))) as SecRow[], tg.sport));
  HOST.rev(tg); HOST.redraw();
});
onChange('sec-bound', el => {
  if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return;
  const raw = (el as HTMLInputElement).value.trim().replace(',', '.');
  const v = raw === '' ? null : Number(raw);
  const cur = (st.metrics && st.metrics.sectionBounds) || {};
  const r = sectionsOf(tg.planned || { sport: tg.sport }, st, actOf(st), HOST.thresholds(), tg.sport);
  if (v != null && (!Number.isFinite(v) || v < 0 || (r.totalMin != null && v > r.totalMin))) { el.setAttribute('aria-invalid', 'true'); toast(`Bitte eine Minute zwischen 0 und ${r.totalMin != null ? Math.round(r.totalMin) : 'dem Ende'} eingeben.`); return; }
  const next = { warm: cur.warm ?? null, cool: cur.cool ?? null, [el.dataset.b!]: v } as any;
  if (next.warm != null && next.cool != null && next.cool <= next.warm) { toast('Der Ausklang muss nach dem Aufwärmen beginnen.'); return; }
  HOST.put(tg, setBounds(st, next.warm, next.cool)); HOST.rev(tg); HOST.redraw();
});
on('sec-bound-reset', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; HOST.put(tg, setBounds(st, null, null)); HOST.rev(tg); HOST.redraw(); toast('Grenzen werden wieder automatisch erkannt.'); });
on('sec-clear', el => { if (!HOST) return; const tg = tgOf(el); const st = HOST.rec(tg); if (!st) return; HOST.put(tg, applySections(st, [], tg.sport)); HOST.rev(tg); HOST.redraw(); });
