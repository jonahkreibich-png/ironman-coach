/* Auftrag 35, Punkt 4: Knopf an jeder Einheit „Lieber Intervalle / locker / länger / kürzer“. Vorschlag aus shared/convert.ts
   (gleiche Sportart, sinnvolle Dauer, Tempo/km aus den eigenen Werten), dann Prüfung wie beim Bearbeiten (planedit freshWarnings:
   eigene Regeln, harte Tage nebeneinander, zu viele harte Einheiten, Teamsport/Spiel, Umfang) plus Ampel heute und Erholungswoche.
   Bei Bedenken ehrlich sagen und eine leichtere Variante anbieten – nie blockieren, „Trotzdem übernehmen“ geht immer.
   Auftrag 38: Vorschau vor dem Übernehmen: Vorher → Nachher (Titel, Dauer/Strecke, Ablauf, Belastung, Auswirkung auf die Woche, Hinweise);
   „Andere Vorschläge“ mit 2-3 weiteren Varianten; direkt nach dem Übernehmen „Rückgängig“ im Hinweis; an der Einheit „Original
   wiederherstellen“, solange sie umgewandelt ist (auch Tage später und nach dem Neuladen – die Umwandlung ist eine gespeicherte Anpassung).
   Übernommen wird als eigene Anpassung; Coach, Bewertung, Woche und Chat lesen den Plan mit Anpassungen. */
import { STATE, PLAN, SESS_BY_ID, saveState, rebuildPlanIndex } from '../store';
import { esc, todayStr, fmtDate, dowShort } from '../util';
import { on, openSheet, closeSheet, refreshSheet } from '../kit';
import * as C from '../../../shared/core';
import { convertKinds, convertVariants, CONV_LABEL, type ConvKind, type ConvOption, type ConvVariant } from '../../../shared/convert';
import { shortPlan } from '../../../shared/workouts';
import { freshWarnings, commitAdjustments } from './planedit';
import { D } from '../data';
import { structureHtml, metaLine } from './session';
import { nav } from '../nav';
import { toast } from '../toast';

const uid = () => 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
/** Umwandlungen dieser Einheit, die gerade gelten (nicht zurückgenommen) */
function convAdjs(s: any): any[] { return ((s && s._adj) || []).map((id: string) => STATE.adjustments[id]).filter((a: any) => a && !a.undone && !a.deleted && a.set && a.set.converted); }
export function convertBlock(s: any, completed: boolean): string {
  if (completed || !s) return '';
  const conv = convAdjs(s);
  const orig = conv.length ? `<div class="hint" data-conv-orig>Umgewandelt${s._orig && s._orig.title ? ` aus „${esc(s._orig.title)}“` : ''}. <button class="link" data-act="conv-restore" data-sid="${esc(s.id)}">Original wiederherstellen</button></div>` : '';
  if (!s.date || s.date < todayStr()) return orig ? `<div class="card flat tight stack" data-convert>${orig}</div>` : '';
  const kinds = convertKinds(s); if (!kinds.length && !orig) return '';
  return `<div class="card flat tight stack" data-convert><b class="small">Einheit umwandeln</b>${orig}${kinds.length ? `<div class="row" style="flex-wrap:wrap;gap:6px">${kinds.map(k => `<button class="btn ghost sm" data-act="conv" data-k="${k}" data-sid="${esc(s.id)}">${esc(CONV_LABEL[k])}</button>`).join('')}</div>` : ''}</div>`;
}
let CUR: { s: any; kind: ConvKind; list: ConvVariant[]; pick: number; warn: string[]; rule: boolean } | null = null;
const adjOf = (s: any, o: ConvOption) => { const group = uid(); return { id: group + '-cv', group, type: 'modify', sessionId: s.id, set: { ...o.set, converted: o.kind }, what: `Umgewandelt: ${o.what}`, reason: `von dir: ${CONV_LABEL[o.kind]}${o.lighter ? ' (leichtere Variante)' : ''}` }; };
const weekOf = (date: string) => PLAN.weeks.find((w: any) => w.days.some((d: any) => d.date === date));
const dayOf = (date: string) => C.planDays(C.applyAdjustments(PLAN.weeks, STATE.adjustments || {})).find((d: any) => d.date === date);
/** Bedenken: Regel-Engine (neu dazugekommene Hinweise) + Ampel heute + Erholungswoche + Spiel am Tag danach */
export function concernsFor(s: any, o: ConvOption): { warn: string[]; rule: boolean } {
  const f = freshWarnings([adjOf(s, o)]);
  // weniger Belastung (kürzer, locker) ist nie ein Grund für Umfang-Hinweise („nächste Woche % mehr als diese“ entsteht nur rechnerisch)
  const less = o.kind === 'shorter' || o.kind === 'easy';
  const warn = f.warnings.filter(x => !(less && /Umfang|% mehr|steigt um/.test(x)));
  const harder = o.kind === 'intervals' || o.kind === 'longer';
  if (harder && s.date === todayStr()) {
    const d = D(); const lv = d.ill ? 2 : d.readiness && d.readiness.level;
    if (d.ill) warn.push('Du bist als krank eingetragen. Heute lieber locker oder Pause.');
    else if (lv === 1 || lv === 2) warn.push(`Deine Ampel steht heute auf ${lv === 2 ? 'Rot' : 'Gelb'}${d.readiness.reasons && d.readiness.reasons.length ? ` (${d.readiness.reasons.join(', ')})` : ''}. ${o.kind === 'intervals' ? 'Harte Intervalle' : 'Mehr Umfang'} kosten heute mehr Erholung als sonst.`);
  }
  const w = weekOf(s.date);
  if (harder && w && w.isRecoveryWeek) warn.push('Diese Woche ist eine Erholungswoche: weniger und lockerer hilft, dass das Training der letzten Wochen wirkt.');
  if (harder) { const nx = dayOf(C.addDays(s.date, 1)); if (nx && nx.sessions.some((x: any) => !x.cancelled && C.isGame(x))) warn.push(`Am ${dowShort(nx.date)} ${fmtDate(nx.date)} ist ein Spiel. Am Tag davor ist locker besser.`); }
  return { warn: [...new Set(warn)], rule: f.rule };
}
/** Woche mit bzw. ohne diese Umwandlung: geschätzte Belastung und harte Einheiten */
export function weekEffect(s: any, o: ConvOption): { before: number; after: number; hardBefore: number; hardAfter: number } | null {
  const w = weekOf(s.date); if (!w) return null;
  const dates = new Set(w.days.map((d: any) => d.date));
  const sum = (adjs: any) => { let load = 0, hard = 0; C.planDays(C.applyAdjustments(PLAN.weeks, adjs)).filter((d: any) => dates.has(d.date)).forEach((d: any) => d.sessions.forEach((x: any) => { if (x.cancelled || x.sport === 'rest') return; load += C.plannedLoad(x); if (C.isHard(x)) hard++; })); return { load, hard }; };
  const a = sum(STATE.adjustments || {}); const adj = adjOf(s, o); const b = sum({ ...(STATE.adjustments || {}), [adj.id]: { ...adj, createdAt: Date.now() + 1e6, from_user: true } });
  return { before: a.load, after: b.load, hardBefore: a.hard, hardAfter: b.hard };
}
function compare(s: any, o: ConvVariant, warn: string[]): string {
  const ns = { ...s, ...o.set, _adj: null };
  const lb = C.plannedLoad(s), la = C.plannedLoad(ns);
  const we = weekEffect(s, o);
  const pct = (a: number, b: number) => (a ? `${b >= a ? '+' : ''}${Math.round((b - a) / a * 100)} %` : '');
  const row = (k: string, a: string, b: string, key: string) => `<tr data-cmp="${key}"><th scope="row">${esc(k)}</th><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`;
  return `<div class="scroll-x"><table class="tbl conv-cmp" data-conv-compare><thead><tr><th></th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>
    ${row('Titel', s.title, o.set.title, 'title')}
    ${row('Dauer', metaLine(s), metaLine(ns), 'amount')}
    ${row('Ablauf', shortPlan(s.spec), shortPlan(o.set.spec), 'ablauf')}
    ${row('Belastung', `${lb}`, `${la} (${pct(lb, la) || '±0 %'})`, 'load')}
    ${we ? row('Woche', `${we.before} Belastung, ${we.hardBefore} harte`, `${we.after} Belastung (${pct(we.before, we.after) || '±0 %'}), ${we.hardAfter} harte`, 'week') : ''}
  </tbody></table></div>
  ${warn.length ? `<div class="banner warn" data-conv-warn>${warn.slice(0, 5).map(x => esc(x)).join('<br>')}</div>` : `<div class="hint" data-conv-ok>Passt zur Woche und zu den nächsten Tagen.</div>`}`;
}
function sheet(): string {
  if (!CUR) return '';
  const { s, list, pick, warn } = CUR; const o = list[pick];
  const ns = { ...s, ...o.set, _adj: null };
  const others = list.map((x, i) => ({ x, i })).filter(z => z.i !== pick);
  return `<div class="stack" data-conv-sheet data-pick="${pick}"><div class="hint">${esc(dowShort(s.date))} ${esc(fmtDate(s.date))}: statt „${esc(s.title)}“</div>
    <div class="card flat stack" data-conv-main><b>${esc(o.set.title)}</b><div class="small muted">${esc(metaLine(ns))}</div></div>
    ${compare(s, o, warn)}
    <button class="btn block" data-act="conv-apply" data-v="${pick}">${warn.length ? 'Trotzdem übernehmen' : 'Übernehmen'}</button>
    ${others.length ? `<div class="lbl">Andere Vorschläge</div><div class="stack" data-conv-others>${others.map(({ x, i }) => `<button class="btn ghost block conv-alt" data-act="conv-pick" data-v="${i}"><span class="small"><b>${esc(x.set.title)}</b>${x.lighter ? ' · leichter' : ''}</span><br><span class="xs muted">${esc(metaLine({ ...s, ...x.set, _adj: null }))}</span></button>`).join('')}</div>` : ''}
    <details class="more" data-conv-detail><summary>Ablauf im Detail</summary><div class="body">${structureHtml(ns, { noToggle: true })}</div></details>
    <button class="btn ghost block" data-act="conv-cancel">Abbrechen</button></div>`;
}
function choose(i: number) {
  if (!CUR || !CUR.list[i]) return;
  const c = concernsFor(CUR.s, CUR.list[i]);
  CUR.pick = i; CUR.warn = c.warn; CUR.rule = c.rule;
}
/* Auftrag 41: immer vom Original aus umwandeln (Einheit ohne frühere Umwandlungen) – sonst entstanden Titel wie „Zone 2 statt: Rad-Intervalle …“
   aus einer schon umgewandelten Einheit; die vorige Umwandlung wird beim Übernehmen ersetzt */
function withoutConversions(s0: any): any {
  const ids = new Set(convAdjs(s0).map((a: any) => a.id)); if (!ids.size) return { ...s0 };
  const rest = Object.fromEntries(Object.entries(STATE.adjustments || {}).filter(([id]) => !ids.has(id)));
  const x = C.planDays(C.applyAdjustments(PLAN.weeks, rest)).flatMap((d: any) => d.sessions).find((y: any) => y.id === s0.id);
  return x ? { ...x, _adj: s0._adj, _orig: s0._orig } : { ...s0 };
}
on('conv', el => {
  const s0 = SESS_BY_ID[el.dataset.sid!]; if (!s0) return;
  const s = withoutConversions(s0); const kind = el.dataset.k as ConvKind;
  const list = convertVariants(s, kind); if (!list.length) return;
  CUR = { s, kind, list, pick: 0, warn: [], rule: false };
  choose(0);
  openSheet(CONV_LABEL[kind], sheet);
});
on('conv-pick', el => { choose(+el.dataset.v!); refreshSheet(); });
on('conv-apply', el => {
  if (!CUR) return; const o = CUR.list[+el.dataset.v!] || CUR.list[CUR.pick]; const s = CUR.s;
  const rule = concernsFor(s, o).rule;
  CUR = null; closeSheet();
  const adj = adjOf(s, o);
  // die vorige Umwandlung dieser Einheit gilt nicht mehr (Box zeigt nur Original → jetzt)
  const prev = SESS_BY_ID[s.id] ? convAdjs(SESS_BY_ID[s.id]).map((a: any) => a.id) : [];
  prev.forEach((id: string) => { const a = STATE.adjustments[id]; if (a) STATE.adjustments[id] = { ...a, undone: true, retired: true, replacedBy: adj.id, updatedAt: Date.now() }; });
  commitAdjustments([adj], `Umgewandelt: ${o.set.title}`, rule);
  // Auftrag 38: Rückgängig direkt nach dem Antippen
  if (STATE.adjustments[adj.id]) toast(`Umgewandelt: ${o.set.title}`, { label: 'Rückgängig', run: () => setUndone([adj.id], true, 'Umwandlung zurückgenommen.') });
});
on('conv-cancel', () => { CUR = null; closeSheet(); });
function setUndone(ids: string[], undone: boolean, msg: string) {
  ids.forEach(id => { const a = STATE.adjustments[id]; if (a) STATE.adjustments[id] = { ...a, undone, createdAt: a.createdAt, updatedAt: Date.now() }; if (!undone) delete STATE.adjustments[id].undone; });
  rebuildPlanIndex(); saveState(); nav.rerender(); refreshSheet(); toast(msg);
}
/* Original wiederherstellen: alle Umwandlungen dieser Einheit zurücknehmen; danach „Rückgängig“ */
on('conv-restore', el => {
  const s = SESS_BY_ID[el.dataset.sid!]; if (!s) return;
  const ids = convAdjs(s).map((a: any) => a.id); if (!ids.length) return;
  setUndone(ids, true, 'Original wiederhergestellt.');
  toast('Original wiederhergestellt.', { label: 'Rückgängig', run: () => setUndone(ids, false, 'Umwandlung gilt wieder.') });
});
