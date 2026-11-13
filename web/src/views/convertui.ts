/* Auftrag 35, Punkt 4: Knopf an jeder Einheit „Lieber Intervalle / locker / länger / kürzer“. Vorschlag aus shared/convert.ts
   (gleiche Sportart, sinnvolle Dauer, Tempo/km aus den eigenen Werten), dann Prüfung wie beim Bearbeiten (planedit freshWarnings:
   eigene Regeln, harte Tage nebeneinander, zu viele harte Einheiten, Teamsport/Spiel, Umfang) plus Ampel heute und Erholungswoche.
   Bei Bedenken ehrlich sagen und eine leichtere Variante anbieten – nie blockieren, „Trotzdem übernehmen“ geht immer.
   Übernommen wird als eigene Anpassung (rückgängig im Plan); Coach, Bewertung, Woche und Chat lesen den Plan mit Anpassungen. */
import { STATE, PLAN, SESS_BY_ID } from '../store';
import { esc, todayStr, fmtDate, dowShort } from '../util';
import { on, openSheet, closeSheet } from '../kit';
import * as C from '../../../shared/core';
import { convertKinds, convertSession, CONV_LABEL, type ConvKind, type ConvOption } from '../../../shared/convert';
import { freshWarnings, commitAdjustments } from './planedit';
import { D } from '../data';
import { structureHtml, metaLine } from './session';

const uid = () => 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
export function convertBlock(s: any, completed: boolean): string {
  if (completed || !s || !s.date || s.date < todayStr()) return '';
  const kinds = convertKinds(s); if (!kinds.length) return '';
  return `<div class="card flat tight stack" data-convert><b class="small">Einheit umwandeln</b><div class="row" style="flex-wrap:wrap;gap:6px">${kinds.map(k => `<button class="btn ghost sm" data-act="conv" data-k="${k}" data-sid="${esc(s.id)}">${esc(CONV_LABEL[k])}</button>`).join('')}</div></div>`;
}
let CUR: { s: any; kind: ConvKind; main: ConvOption; lighter: ConvOption | null; warn: string[]; rule: boolean } | null = null;
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
function sheet(): string {
  if (!CUR) return '';
  const { s, main, lighter, warn } = CUR;
  const preview = (o: ConvOption, tag: string) => { const ns = { ...s, ...o.set, _adj: null }; return `<div class="card flat stack" data-conv-${tag}><b>${esc(o.set.title)}</b><div class="small muted">${esc(metaLine(ns))}</div>${structureHtml(ns)}</div>`; };
  return `<div class="stack" data-conv-sheet><div class="hint">${esc(dowShort(s.date))} ${esc(fmtDate(s.date))}: statt „${esc(s.title)}“</div>${preview(main, 'main')}
    ${warn.length ? `<div class="banner warn" data-conv-warn>${warn.slice(0, 5).map(x => esc(x)).join('<br>')}</div>${lighter ? `<div class="lbl">Leichtere Variante</div>${preview(lighter, 'lighter')}<button class="btn block" data-act="conv-apply" data-v="lighter">Leichtere Variante übernehmen</button>` : ''}<button class="btn ${lighter ? 'ghost' : ''} block" data-act="conv-apply" data-v="main">Trotzdem übernehmen</button>`
      : `<div class="hint" data-conv-ok>Passt zur Woche und zu den nächsten Tagen.</div><button class="btn block" data-act="conv-apply" data-v="main">Übernehmen</button>`}
    <button class="btn ghost block" data-act="conv-cancel">Abbrechen</button><div class="xs muted">Rückgängig jederzeit im Plan (Plan bearbeiten → Rückgängig).</div></div>`;
}
on('conv', el => {
  const s0 = SESS_BY_ID[el.dataset.sid!]; if (!s0) return;
  const s = { ...s0 }; const kind = el.dataset.k as ConvKind;
  const main = convertSession(s, kind); if (!main) return;
  const c = concernsFor(s, main);
  const lighter = c.warn.length && (kind === 'intervals' || kind === 'longer') ? convertSession(s, kind, { lighter: true }) : null;
  CUR = { s, kind, main, lighter, warn: c.warn, rule: c.rule };
  openSheet(CONV_LABEL[kind], sheet);
});
on('conv-apply', el => {
  if (!CUR) return; const o = el.dataset.v === 'lighter' && CUR.lighter ? CUR.lighter : CUR.main; const s = CUR.s;
  const rule = el.dataset.v === 'lighter' ? concernsFor(s, o).rule : CUR.rule;
  CUR = null; closeSheet();
  commitAdjustments([adjOf(s, o)], `Umgewandelt: ${o.set.title}`, rule);
});
on('conv-cancel', () => { CUR = null; closeSheet(); });
