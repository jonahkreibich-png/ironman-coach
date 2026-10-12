/* Regeln eingeben und anzeigen (Auftrag 5 A2/A3), gemeinsam für Fragebogen und „Berücksichtigungen“:
   - Wochenraster Sportart × Wochentag: geht / lieber nicht / geht nicht (Tippen wechselt). Hauptquelle.
   - Freitext als Ergänzung: nach jeder Eingabe zeigt die App, was sie verstanden hat („Stimmt“ / „Ändern“).
     Versteht sie etwas nicht, fragt sie mit einem passenden Formular nach, statt es stillschweigend zu ignorieren.
   Gespeichert wird immer im Regel-Modell (shared/constraints.ts). Der Satz bleibt als Notiz sichtbar. */
import { esc, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, ic, pill, sportLabel, armed } from '../kit';
import { toast } from '../toast';
import { nav } from '../nav';
import { aiState, apiCall } from '../sync';
import { rulesOf, cellOf, setCell, describe, ruleId, GRID_SPORTS, GRID_DAYS, type Rule, type RuleSport, type Cell, type RuleKind } from '../../../shared/constraints';
import { parseRules, parseFor, type Ask } from '../../../shared/ruleparse';

export interface RuleData { notes: string[]; rules: Rule[]; dayLoad: Record<number, number>; sports: string[]; team?: { name: string; trainingDays: number[]; gameDays: number[] } | null }
export interface RuleTarget { get(): RuleData; base?(): RuleData; set(next: { notes: string[]; rules: Rule[] }, what: string): void; setFreq?(sport: string, n: number, what: string): void }
const TARGETS: Record<string, RuleTarget> = {};
export function registerTarget(id: string, tg: RuleTarget) { TARGETS[id] = tg; }

interface Pending { text: string; rules: Rule[]; ask?: Ask; byAi?: boolean; edit?: { idx: number; draft: Partial<Rule> } | null; replaceNote?: number }
const PENDING: Record<string, Pending | null> = {};
const rerender = () => nav.rerender();

/* Alle Regeln (gespeichert + aus alten Notizen gelesen) als gespeicherte Regeln, damit sie bearbeitet werden können */
function materialize(d: RuleData): Rule[] {
  return rulesOf({ notes: d.notes, rules: d.rules } as any, parseFor(todayStr())).map(r => r.source === 'note' ? { ...r, id: ruleId('t'), source: 'text' as const } : r);
}
/* Notizen, deren Regeln alle entfernt wurden, bekommen einen unsichtbaren Merker, damit sie nicht neu gelesen werden */
function tombstones(notes: string[], rules: Rule[]): Rule[] {
  const has = new Set(rules.map(r => (r.text || '').trim().toLowerCase()));
  return [...rules, ...notes.filter(n => !has.has(n.trim().toLowerCase()) && parseRules(n, todayStr()).rules.length).map(n => ({ id: ruleId('x'), kind: 'info' as const, strength: 'soft' as const, text: n, hidden: true, note: 'angepasst' } as Rule))];
}
const visible = (r: Rule) => !(r as any).hidden;

/* ---------- Wochenraster ---------- */
const SYM: Record<Cell, string> = { yes: '✓', soft: '–', no: '✕' };
export function gridHtml(tid: string): string {
  const d = TARGETS[tid].get();
  const rules = rulesOf({ notes: d.notes, rules: d.rules } as any, parseFor(todayStr()));
  // vorgemerkt, noch nicht übernommen (Auftrag 6): geänderte Felder markieren
  const bd = TARGETS[tid].base ? TARGETS[tid].base!() : null;
  const brules = bd ? rulesOf({ notes: bd.notes, rules: bd.rules } as any, parseFor(todayStr())) : null;
  const sports = GRID_SPORTS.filter(s => d.sports.includes(s));
  if (!sports.length) return `<div class="hint">${esc(t('rules.gridNoSports'))}</div>`;
  const team = d.team;
  const head = `<span></span>${GRID_DAYS.map(x => `<b class="rg-h">${esc(t('dow.' + x))}${team && (team.trainingDays.includes(x) || team.gameDays.includes(x)) ? `<i class="rg-team" title="${esc(team.name)}">${team.gameDays.includes(x) ? '●' : '○'}</i>` : ''}</b>`).join('')}`;
  const rows = sports.map(s => `<span class="rg-l">${esc(sportLabel(s))}</span>${GRID_DAYS.map(x => {
    const c = cellOf(rules, s, x, d.dayLoad);
    const chg = !!brules && !c.noTime && cellOf(brules, s, x, bd!.dayLoad).state !== c.state;
    const label = `${sportLabel(s)} ${t('dow.' + x)}: ${t('rules.cell.' + (c.noTime ? 'noTime' : c.state))}${chg ? ' (' + t('stage.changedCell') + ')' : ''}`;
    return `<button class="rg-c ${c.state}${c.noTime ? ' notime' : ''}${chg ? ' chg' : ''}"${chg ? ' data-chg="1"' : ''} data-act="rule-cell" data-t="${tid}" data-s="${s}" data-d="${x}" aria-label="${esc(label)}" title="${esc(label)}">${SYM[c.state]}</button>`;
  }).join('')}`).join('');
  return `<div class="rgrid" role="group" aria-label="${esc(t('rules.grid'))}">${head}${rows}</div>
    <div class="xs muted rg-legend">${esc(t('rules.legend'))}${team ? ' ' + esc(t('rules.teamLegend', { n: team.name })) : ''}</div>`;
}
on('rule-cell', el => {
  const tid = el.dataset.t!; const tg = TARGETS[tid]; if (!tg) return;
  const d = tg.get(); const s = el.dataset.s as RuleSport; const dow = +el.dataset.d!;
  const all = materialize(d);
  const c = cellOf(all, s, dow, d.dayLoad);
  if (c.noTime) { toast(t('rules.noTimeToast')); return; }
  const next: Cell = c.state === 'yes' ? 'soft' : c.state === 'soft' ? 'no' : 'yes';
  const rules = tombstones(d.notes, setCell(all, s, dow, next));
  tg.set({ notes: d.notes, rules }, `${sportLabel(s)} ${t('dow.' + dow)}: ${t('rules.cell.' + next)}`);
});

/* ---------- Liste: Sätze und was daraus wurde ---------- */
const strengthPill = (r: Rule) => r.kind === 'info' ? pill(t('rules.info'), '') : r.strength === 'hard' ? pill(t('rules.hard'), 'bad') : pill(t('rules.soft'), 'warn');
export function listHtml(tid: string): string {
  const d = TARGETS[tid].get();
  const all = rulesOf({ notes: d.notes, rules: d.rules } as any, parseFor(todayStr())).filter(visible);
  const byText = (n: string) => all.filter(r => (r.text || '').trim().toLowerCase() === n.trim().toLowerCase());
  const items = d.notes.map((n, i) => {
    const rs = byText(n);
    const sub = rs.length ? rs.map(r => `<span class="rl-r">${strengthPill(r)} ${esc(describe(r))}</span>`).join('') : `<span class="s">${esc(t('rules.notUnderstood'))}</span> <button class="link" data-act="rule-clarify" data-t="${tid}" data-i="${i}">${esc(t('rules.clarify'))}</button>`;
    return `<div class="li" data-cons="${i}"><span class="grow"><span class="t">${esc(n)}</span><br>${sub}</span>${rs.length ? pill(t('cons.used'), 'good') : pill(t('cons.notUsed'), 'warn')}<button class="icon-btn" data-act="rule-del-note" data-t="${tid}" data-i="${i}" aria-label="${esc(t('common.remove'))}">${ic('close')}</button></div>`;
  });
  // Regeln ohne Satz (aus dem Chat oder später der KI), ohne die Raster-Felder
  const loose = all.filter(r => !r.text && r.source !== 'grid').map(r => `<div class="li"><span class="grow"><span class="t">${esc(describe(r))}</span><br><span class="s">${esc(t('rules.from.' + (r.source || 'text')))}</span></span>${strengthPill(r)}<button class="icon-btn" data-act="rule-del" data-t="${tid}" data-id="${esc(r.id)}" aria-label="${esc(t('common.remove'))}">${ic('close')}</button></div>`);
  return `<div class="list" data-cons-list>${[...items, ...loose].join('') || `<div class="li"><span class="muted">${esc(t('cons.none'))}</span></div>`}</div>`;
}
on('rule-del-note', el => {
  if (!armed(el, '?')) return;
  const tg = TARGETS[el.dataset.t!]; const d = tg.get(); const i = +el.dataset.i!; const txt = d.notes[i] || '';
  tg.set({ notes: d.notes.filter((_, j) => j !== i), rules: d.rules.filter(r => (r.text || '').trim().toLowerCase() !== txt.trim().toLowerCase()) }, t('cons.removed', { t: txt }));
});
on('rule-del', el => {
  if (!armed(el, '?')) return;
  const tg = TARGETS[el.dataset.t!]; const d = tg.get(); const r = d.rules.find(x => x.id === el.dataset.id);
  tg.set({ notes: d.notes, rules: d.rules.filter(x => x.id !== el.dataset.id) }, t('cons.removed', { t: r ? describe(r) : '' }));
});
on('rule-clarify', el => {
  const tid = el.dataset.t!; const d = TARGETS[tid].get(); const i = +el.dataset.i!; const text = d.notes[i] || '';
  const r = parseRules(text, todayStr());
  PENDING[tid] = { text, rules: r.rules, ask: r.ask, replaceNote: i, edit: r.rules.length ? null : { idx: -1, draft: draftFromAsk(r.ask) } };
  rerender();
});

/* ---------- Freitext mit Bestätigung ---------- */
export function addHtml(tid: string): string {
  const p = PENDING[tid];
  let h = `<div class="row rl-add"><input class="inp grow" id="rule-new-${tid}" placeholder="${esc(t('cons.ph'))}" aria-label="${esc(t('rules.addLabel'))}" value="${esc(p && !p.rules.length && !p.edit ? p.text : '')}"><button class="btn" data-act="rule-check" data-t="${tid}" aria-label="${esc(t('rules.check'))}">${ic('plus')}</button></div>`;
  if (!p) return h;
  if (p.edit) return h + editorHtml(tid, p);
  h += `<div class="card stack rl-confirm" data-rule-confirm><div class="lbl">${esc(t(p.byAi ? 'rules.understoodAi' : 'rules.understoodTitle'))}</div><div class="small muted">„${esc(p.text)}“</div>
    <div class="list">${p.rules.map((r, i) => `<div class="li" data-rule-i="${i}"><span class="grow"><span class="t">${esc(describe(r))}</span></span>
      ${r.kind === 'info' || r.kind === 'body' || r.kind === 'period' ? '' : `<span class="seg sm" role="group" aria-label="${esc(t('rules.strength'))}"><button class="${r.strength === 'hard' ? 'on' : ''}" data-act="rule-str" data-t="${tid}" data-i="${i}" data-v="hard">${esc(t('rules.hardShort'))}</button><button class="${r.strength === 'soft' ? 'on' : ''}" data-act="rule-str" data-t="${tid}" data-i="${i}" data-v="soft">${esc(t('rules.softShort'))}</button></span>`}
      <button class="btn ghost sm" data-act="rule-edit" data-t="${tid}" data-i="${i}">${esc(t('ob.change'))}</button></div>`).join('')}</div>
    <div class="hint">${esc(t('rules.hardHint'))}</div>
    <div class="row"><button class="btn" data-act="rule-ok" data-t="${tid}">${esc(t('rules.ok'))}</button><button class="btn ghost" data-act="rule-edit" data-t="${tid}" data-i="-1">${esc(t('rules.addMore'))}</button><button class="btn ghost" data-act="rule-cancel" data-t="${tid}">${esc(t('common.cancel'))}</button></div></div>`;
  return h;
}
function draftFromAsk(ask?: Ask): Partial<Rule> {
  if (!ask) return { kind: 'neverDays', strength: 'hard', days: [] };
  const p = ask.partial || {};
  if (ask.kind === 'days') return { kind: 'neverDays', strength: 'hard', sport: p.sport || 'run', days: [] };
  if (ask.kind === 'what') return { kind: 'dayOff', strength: 'hard', days: p.days || [] };
  if (ask.kind === 'period') return { kind: 'period', level: (p.level as any) || 'none', from: todayStr(), to: todayStr() };
  return { kind: 'info', strength: 'soft' };
}
const KINDS: [RuleKind, string][] = [['onlyDays', 'rules.k.onlyDays'], ['neverDays', 'rules.k.neverDays'], ['dayOff', 'rules.k.dayOff'], ['maxDay', 'rules.k.maxDay'], ['period', 'rules.k.period'], ['body', 'rules.k.body'], ['info', 'rules.k.info']];
const BODIES = ['knee', 'achilles', 'shin', 'hip', 'back', 'shoulder', 'foot', 'groin', 'calf', 'injury'];
function editorHtml(tid: string, p: Pending): string {
  const r = p.edit!.draft;
  const k = r.kind || 'neverDays';
  const needSport = k === 'onlyDays' || k === 'neverDays' || k === 'maxDay';
  const needDays = k === 'onlyDays' || k === 'neverDays' || k === 'dayOff' || k === 'maxDay';
  return `<div class="card stack rl-edit" data-rule-editor>
    ${p.ask && p.edit!.idx === -1 && !p.rules.length ? `<div class="banner info">${esc(p.ask.text)}</div>` : ''}
    <div class="fld"><label for="re-kind-${tid}">${esc(t('rules.kind'))}</label><select class="inp" id="re-kind-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="kind">${KINDS.map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select></div>
    ${needSport ? `<div class="fld"><label for="re-sport-${tid}">${esc(t('common.sport'))}</label><select class="inp" id="re-sport-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="sport"><option value="">${esc(t('rules.allSports'))}</option>${GRID_SPORTS.map(s => `<option value="${s}" ${r.sport === s ? 'selected' : ''}>${esc(sportLabel(s))}</option>`).join('')}</select></div>` : ''}
    ${needDays ? `<div class="fld"><span class="lab">${esc(t('rules.days'))}</span><div class="daychips">${GRID_DAYS.map(x => { const on = (r.days || []).includes(x); return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="rule-ed-day" data-t="${tid}" data-d="${x}">${esc(t('dow.' + x))}</button>`; }).join('')}</div></div>` : ''}
    ${k === 'maxDay' ? `<div class="fld"><label for="re-min-${tid}">${esc(t('rules.minutes'))}</label><input class="inp" id="re-min-${tid}" inputmode="numeric" data-ch="rule-ed" data-t="${tid}" data-k="minutes" value="${esc(r.minutes ?? '')}"></div>` : ''}
    ${k === 'period' ? `<div class="fgrid"><div class="fld"><label for="re-from-${tid}">${esc(t('rules.from'))}</label><input class="inp" type="date" id="re-from-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="from" value="${esc(r.from || '')}"></div><div class="fld"><label for="re-to-${tid}">${esc(t('rules.to'))}</label><input class="inp" type="date" id="re-to-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="to" value="${esc(r.to || '')}"></div>
      <div class="fld"><label for="re-level-${tid}">${esc(t('rules.level'))}</label><select class="inp" id="re-level-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="level"><option value="none" ${r.level !== 'low' ? 'selected' : ''}>${esc(t('rules.level.none'))}</option><option value="low" ${r.level === 'low' ? 'selected' : ''}>${esc(t('rules.level.low'))}</option></select></div></div>` : ''}
    ${k === 'body' ? `<div class="fld"><label for="re-body-${tid}">${esc(t('rules.body'))}</label><select class="inp" id="re-body-${tid}" data-ch="rule-ed" data-t="${tid}" data-k="body">${BODIES.map(b => `<option value="${b}" ${r.body === b ? 'selected' : ''}>${esc(t('rules.b.' + b))}</option>`).join('')}</select></div>` : ''}
    ${k === 'info' ? `<div class="hint">${esc(t('rules.infoHint'))}</div>` : ''}
    ${needDays ? `<div class="seg" role="group" aria-label="${esc(t('rules.strength'))}"><button class="${r.strength !== 'soft' ? 'on' : ''}" data-act="rule-ed-str" data-t="${tid}" data-v="hard">${esc(t('rules.hardLong'))}</button><button class="${r.strength === 'soft' ? 'on' : ''}" data-act="rule-ed-str" data-t="${tid}" data-v="soft">${esc(t('rules.softLong'))}</button></div>` : ''}
    <div class="row"><button class="btn" data-act="rule-ed-save" data-t="${tid}">${esc(t('rules.apply'))}</button><button class="btn ghost" data-act="rule-ed-cancel" data-t="${tid}">${esc(t('common.cancel'))}</button></div></div>`;
}
on('rule-check', async el => {
  const tid = el.dataset.t!; const inp = document.getElementById('rule-new-' + tid) as HTMLInputElement; const text = (inp?.value || '').trim().slice(0, 200);
  if (!text) return;
  let r: { rules: Rule[]; ask?: Ask } = parseRules(text, todayStr()); let byAi = false;
  // mit aktivem KI-Coach versteht die KI den Satz (dasselbe Regel-Format, wird trotzdem zur Bestätigung gezeigt)
  if (aiState().active) { try { (el as HTMLButtonElement).disabled = true; const s = await apiCall('POST', '/api/rules/parse', { text }); if (s && Array.isArray(s.rules) && s.rules.length) { r = { rules: s.rules }; byAi = s.by === 'ai'; } } catch (e) { /* lokal */ } }
  PENDING[tid] = { text, rules: r.rules, ask: r.ask, byAi, edit: r.rules.length ? null : { idx: -1, draft: draftFromAsk(r.ask) } };
  rerender();
});
on('rule-str', el => { const p = PENDING[el.dataset.t!]; if (!p) return; const r = p.rules[+el.dataset.i!]; if (r) r.strength = el.dataset.v as any; rerender(); });
on('rule-edit', el => { const p = PENDING[el.dataset.t!]; if (!p) return; const i = +el.dataset.i!; p.edit = { idx: i, draft: i >= 0 ? { ...p.rules[i] } : { kind: 'neverDays', strength: 'hard', days: [] } }; rerender(); });
on('rule-cancel', el => { PENDING[el.dataset.t!] = null; rerender(); });
on('rule-ed-cancel', el => { const p = PENDING[el.dataset.t!]; if (!p) return; if (!p.rules.length) PENDING[el.dataset.t!] = null; else p.edit = null; rerender(); });
on('rule-ed-day', el => { const p = PENDING[el.dataset.t!]; if (!p || !p.edit) return; const d = +el.dataset.d!; const cur = p.edit.draft.days || []; p.edit.draft.days = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]; rerender(); });
on('rule-ed-str', el => { const p = PENDING[el.dataset.t!]; if (!p || !p.edit) return; p.edit.draft.strength = el.dataset.v as any; rerender(); });
onChange('rule-ed', el => {
  const p = PENDING[el.dataset.t!]; if (!p || !p.edit) return; const k = el.dataset.k!; const v = (el as HTMLInputElement).value;
  (p.edit.draft as any)[k] = k === 'minutes' ? (+v || undefined) : k === 'sport' ? (v || null) : v;
  if (k === 'kind') rerender();
});
on('rule-ed-save', el => {
  const tid = el.dataset.t!; const p = PENDING[tid]; if (!p || !p.edit) return;
  const r = p.edit.draft; const k = r.kind || 'neverDays';
  if ((k === 'onlyDays' || k === 'neverDays' || k === 'dayOff') && !(r.days || []).length) { toast(t('rules.needDays')); return; }
  if (k === 'maxDay' && !(r.minutes! > 0)) { toast(t('rules.needMinutes')); return; }
  if (k === 'period' && (!r.from || !r.to || r.to < r.from)) { toast(t('rules.needPeriod')); return; }
  const rule: Rule = { id: ruleId('t'), strength: r.strength || 'hard', source: 'text', text: p.text, createdAt: Date.now(), ...r, kind: k,
    ...(k === 'body' ? { body: r.body || 'injury', noIntervals: true } : {}), ...(k === 'info' ? { note: p.text, strength: 'soft' } : {}) } as Rule;
  if (p.edit.idx >= 0) p.rules[p.edit.idx] = rule; else p.rules.push(rule);
  p.edit = null; rerender();
});
on('rule-ok', el => {
  const tid = el.dataset.t!; const p = PENDING[tid]; const tg = TARGETS[tid]; if (!p || !tg) return;
  const d = tg.get();
  const rules = p.rules.map(r => ({ ...r, text: p.text, source: r.source === 'grid' ? 'grid' : 'text' } as Rule));
  let notes = [...d.notes];
  if (p.replaceNote != null && notes[p.replaceNote] === p.text) notes = notes.filter((_, j) => j !== p.replaceNote);
  notes.push(p.text);
  const keep = d.rules.filter(r => (r.text || '').trim().toLowerCase() !== p.text.trim().toLowerCase());
  PENDING[tid] = null;
  tg.set({ notes, rules: [...keep, ...rules] }, p.text);
  toast(t('cons.addedOk', { l: rules.map(describe).join('; ') }));
});

/* Lösung für einen Konflikt (Auftrag 5 A4): weniger Einheiten oder einen Tag zusätzlich erlauben */
export function fixConflict(tid: string, o: { sport: string; option: string; day?: number; n?: number }): string {
  const tg = TARGETS[tid]; if (!tg) return '';
  if (o.option === 'fewer' && tg.setFreq) { const msg = t('rules.fixFewer', { n: o.n || 0, s: sportLabel(o.sport) }); tg.setFreq(o.sport, o.n || 0, msg); return msg; }
  if (o.option === 'allow' && o.day != null) {
    const d = tg.get(); const msg = t('rules.fixAllow', { s: sportLabel(o.sport), d: t('dow.' + o.day) });
    tg.set({ notes: d.notes, rules: tombstones(d.notes, setCell(materialize(d), o.sport as RuleSport, o.day, 'yes')) }, msg); return msg;
  }
  return '';
}
export function conflictsHtml(tid: string, list: any[]): string {
  return (list || []).map(c => `<div class="banner warn stack" data-conflict="${esc(c.id)}"><div>${esc(c.text)}</div><div class="row" style="flex-wrap:wrap">${(c.options || []).map((o: any) => `<button class="btn sm ${o.id === 'fewer' ? '' : 'ghost'}" data-act="rule-fix" data-t="${tid}" data-s="${c.sport}" data-o="${o.id}" data-d="${o.day ?? ''}" data-n="${o.n ?? ''}">${esc(o.label)}</button>`).join('')}</div></div>`).join('');
}
on('rule-fix', el => { const msg = fixConflict(el.dataset.t!, { sport: el.dataset.s!, option: el.dataset.o!, day: el.dataset.d === '' ? undefined : +el.dataset.d!, n: el.dataset.n === '' ? undefined : +el.dataset.n! }); if (msg) toast(msg); });
