/* Coach (Auftrag 5 D): oben „Gerade aktuell“ (heutige Lage, offene Vorschläge), darunter das Gespräch. Jede Nachricht bekommt eine
   Antwort; Rückfragen und Knöpfe statt Raten; Planänderungen mit Vorschau, Bestätigen und Rückgängig über dieselben Aktionen
   (shared/coach/ops.ts) und Regeln wie überall. Alte Briefings und Kommentare wandern nach 3/7/14 Tagen in den Verlauf,
   erledigte Gespräche werden nach 3 Tagen zu einer Zeile. Mit aktivem KI-Coach antwortet der Server, die Oberfläche bleibt gleich. */
import { STATE, saveState, UI, profile, saveProfile, rebuildPlanIndex } from '../store';
import { esc, fmtDate, dowShort, todayStr, addDays } from '../util';
import { t } from '../../../shared/i18n';
import { D, invalidate } from '../data';
import { on, onChange, ic, openSheet, refreshSheet, empty, pill } from '../kit';
import { type ChatAction } from '../../../shared/coach/intents';
import { converse, quickOptions, type Opt } from '../../../shared/coach/dialog';
import { applyOps, undoOps, type Op } from '../../../shared/coach/ops';
import { arrangeFeed, searchMsgs, isOpen } from '../../../shared/coach/feed';
import { nav } from '../nav';
import { toast } from '../toast';
import { aiState, apiCall, syncNow } from '../sync';
import { propose } from './planedit';
import { replanFuture } from '../replan';
import { fixConflict } from './rules';
import * as C from '../../../shared/core';

const time = (ms: number) => { const d = new Date(ms); return `${dowShort(d.toISOString().slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const keepDays = () => [3, 7, 14].includes(+((STATE.settings || {}).coachKeepDays)) ? +STATE.settings.coachKeepDays : 7;
const lastMsgId = () => { const l = Object.values(STATE.coachMsgs || {}).filter((m: any) => m && !m.deleted).sort((a: any, b: any) => a.at - b.at) as any[]; return l.length ? l[l.length - 1].id : null; };

function msgHtml(m: any, latest: boolean): string {
  const cls = m.from === 'user' ? 'user' : `coach ${m.kind === 'warning' ? 'warning' : m.kind === 'adjust' ? 'adjust' : m.kind === 'proposal' || m.kind === 'proposal-local' ? 'proposal' : ''}`;
  const head = m.from !== 'user' && m.title ? `<div class="h">${m.kind === 'warning' ? ic('info') : m.kind === 'adjust' ? ic('calendar') : m.from === 'ai' ? ic('wand') : ''}${esc(m.title)}</div>` : '';
  const prop = m.kind === 'proposal' && m.proposal ? (m.proposal.status === 'open'
    ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="prop" data-id="${esc(m.id)}" data-ok="1">${esc(t('coach.accept'))}</button><button class="btn ghost sm" data-act="prop" data-id="${esc(m.id)}" data-ok="0">${esc(t('coach.reject'))}</button></div>`
    : `<div class="xs muted" style="margin-top:6px">${esc(m.proposal.status === 'accepted' ? t('coach.accepted') : t('coach.rejected'))}</div>`) : '';
  const acts = (m.actions || []).length && !m.actionsDone ? `<div class="suggest">${m.actions.map((a: ChatAction, i: number) => `<button class="btn sm ${i ? 'ghost' : ''}" data-act="chat-action" data-id="${esc(m.id)}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : m.actionsDone ? `<div class="xs muted" style="margin-top:6px">${esc(m.actionsDone)}</div>` : '';
  // Knöpfe einer Rückfrage: nur bei der letzten Nachricht aktiv (sonst gehört die Antwort nicht mehr dazu)
  const opts = (m.options || []).length && latest && !m.answered ? `<div class="suggest" data-chat-options>${m.options.map((o: Opt, i: number) => `<button class="btn sm ${i ? 'ghost' : ''}" data-act="chat-opt" data-id="${esc(m.id)}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>` : '';
  const undo = m.undo && !m.undone ? `<div class="row" style="margin-top:6px"><button class="btn ghost sm" data-act="chat-undo" data-id="${esc(m.id)}">${ic('back')} ${esc(t('chat.undo'))}</button></div>` : m.undone ? `<div class="xs muted" style="margin-top:6px">${esc(t('chat.undone'))}</div>` : '';
  const sugg = (m.suggestions || []).length && latest ? `<div class="suggest">${m.suggestions.map((s: string) => `<button class="chip" data-act="chat-say" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
  const pin = m.from !== 'user' ? `<button class="msg-pin ${m.pinned ? 'on' : ''}" data-act="chat-pin" data-id="${esc(m.id)}" aria-label="${esc(m.pinned ? t('chat.unpin') : t('chat.pin'))}" title="${esc(m.pinned ? t('chat.unpin') : t('chat.pin'))}">${ic('flag')}</button>` : '';
  return `<div class="msg ${cls}${m.pinned ? ' pinned' : ''}" data-msg="${esc(m.id)}">${pin}${head}${esc(m.text)}${prop}${acts}${opts}${undo}${sugg}<div class="time">${time(m.at)}</div></div>`;
}

/* Gerade aktuell: heutige Lage und offene Punkte */
function nowCard(open: any[]): string {
  const d = D();
  const today = C.planDays(C.applyAdjustments(d.engine.baseWeeks, STATE.adjustments || {})).find((x: any) => x.date === d.today);
  const list = today ? today.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled) : [];
  const done = list.filter((s: any) => ((STATE.sessions || {})[s.id] || {}).completed).length;
  const R = d.readiness; const lvl = d.ill ? t('chat.now.sick') : R && R.level < 3 ? [t('chat.now.green'), t('chat.now.yellow'), t('chat.now.red')][R.level] : '';
  const line = list.length ? `${t('chat.now.today')}: ${list.map((s: any) => s.title).join(', ')}${done ? ` (${done}/${list.length} ${t('chat.now.done')})` : ''}` : t('chat.now.rest');
  return `<div class="card now-card" data-now><div class="spread"><b>${esc(t('chat.now.title'))}</b>${lvl ? pill(lvl, R && R.level === 0 ? 'good' : R && R.level === 1 ? 'warn' : 'bad') : ''}</div>
    <div class="small">${esc(line)}</div>${open.length ? `<div class="small" data-now-open>${esc(t('chat.now.open', { n: open.length }))}: ${open.map(m => `<button class="link" data-act="chat-jump" data-id="${esc(m.id)}">${esc((m.title || m.text || '').slice(0, 50))}</button>`).join(' · ')}</div>` : ''}</div>`;
}

export function renderCoach(): string {
  const all = Object.values(STATE.coachMsgs || {}).filter((m: any) => m && !m.deleted) as any[];
  const seen = UI.coachSeenPrev || UI.coachSeenAt || 0;
  const { feed, archived } = arrangeFeed(all, Date.now(), seen, keepDays());
  const ai = aiState();
  const last = lastMsgId();
  const open = all.filter(m => isOpen(m)).sort((a, b) => b.at - a.at).slice(0, 3);
  let h = nowCard(open);
  h += `<div class="spread" style="margin:var(--s3) 0"><span class="xs muted">${esc(ai.active ? t('coach.aiMode') : t('coach.freeMode2'))}</span><span class="row nowrap" style="gap:4px"><button class="btn ghost sm" data-act="chat-history" aria-label="${esc(t('chat.history'))}">${ic('doc')} ${esc(t('chat.history'))}${archived.length ? ` (${archived.length})` : ''}</button><button class="btn ghost sm" data-act="notes-open" aria-label="${esc(t('coach.notes'))}">${ic('user')} ${esc(t('coach.notesShort'))}</button></span></div>`;
  h += `<div class="feed">${feed.length ? feed.map(f => f.type === 'line' ? `<div class="msg-line" data-line>${esc(f.line!)}</div>` : msgHtml(f.msg, f.msg.id === last)).join('') : empty(t('coach.empty'))}</div>`;
  const dlg = STATE.chatDialog || {};
  const quick = quickOptions(D().engine, dlg).slice(0, 5);
  h += `<div class="chips quick" style="margin:var(--s3) 0 var(--s2)" data-quick>${quick.map(q => `<button class="chip" data-act="chat-say" data-text="${esc(q.say)}">${esc(q.label)}</button>`).join('')}</div>`;
  h += `<div class="composer"><textarea id="coach-in" rows="1" placeholder="${esc(t('coach.ask'))}" aria-label="${esc(t('coach.ask'))}"></textarea><button class="btn" data-act="coach-send" aria-label="${esc(t('coach.send'))}">${ic('right')}</button></div>`;
  if (ai.active) h += `<div class="xs muted" style="text-align:center;margin-top:6px">${esc(t('coach.aiCost', { used: ai.monthUsd.toFixed(2), budget: ai.budgetUsd.toFixed(2) }))}</div>`;
  else h += `<div class="hint" style="text-align:center;margin-top:var(--s2)"><button class="link" data-act="go-sub" data-sub="einstellungen">${esc(t('coach.aiSettings'))}</button></div>`;
  return h;
}
export function scrollCoachBottom() { const f = document.querySelector('.feed'); if (f) window.scrollTo(0, document.body.scrollHeight); }

/* ---------- Ausführen und Rückgängig ---------- */
function store() { return { state: STATE, profile: profile(), goals: STATE.goals, saveProfile: (p: any) => saveProfile(p) }; }
export function runOps(ops: Op[]): { undo: any; summary: string[] } {
  const st = store();
  const res = applyOps(st, ops, Date.now(), todayStr());
  if (res.adjChanged) rebuildPlanIndex();
  saveState(); invalidate();
  if (res.replan) replanFuture(res.replan, t('chat.replanWhy'));
  return { undo: res.undo, summary: res.summary };
}
function addMsgs(list: any[]) { list.forEach(m => { STATE.coachMsgs[m.id] = m; }); saveState(); nav.rerender(); scrollCoachBottom(); }
/* Frage beantworten: mit aktivem KI-Coach über den Server, sonst lokal mit der Gesprächsführung */
let busy = false;
export async function ask(text: string, el?: HTMLButtonElement) {
  text = text.trim(); if (!text || busy) return;
  busy = true;
  try {
    const now = Date.now();
    // alte Knöpfe sind beantwortet
    const last = lastMsgId(); if (last && STATE.coachMsgs[last] && STATE.coachMsgs[last].options) STATE.coachMsgs[last] = { ...STATE.coachMsgs[last], answered: true, pendingOpen: false };
    const userMsg = { id: `msg-u-${now}`, at: now, date: todayStr(), kind: 'user', from: 'user', text };
    if (aiState().active && !(STATE.chatDialog && STATE.chatDialog.pending)) {
      if (el) el.disabled = true;
      try { const r = await apiCall('POST', '/api/coach/chat', { text }); addMsgs(r.messages || []); if (r.applied) await syncNow(); return; }
      catch (e) { /* ohne Verbindung oder ohne Budget: lokal antworten */ } finally { if (el) el.disabled = false; }
    }
    const d = D();
    const { reply, dialog } = converse(d.engine, STATE.chatDialog || {}, text, { scores: d.scores, prognosis: d.prognosis });
    STATE.chatDialog = dialog;
    const msg: any = { id: `msg-a-${now}`, at: now + 1, date: todayStr(), kind: reply.intent === 'safety' ? 'warning' : 'answer', from: 'coach', chat: true, intent: reply.intent, text: reply.text, options: reply.options || [], suggestions: reply.suggestions || [], pendingOpen: !!reply.pending };
    if ((reply as any).go) msg.options = [{ label: t('chat.open'), say: '', go: (reply as any).go }, ...msg.options];
    if (reply.apply && reply.apply.length) { const r = runOps(reply.apply); msg.undo = r.undo; }
    addMsgs([userMsg, msg]);
  } finally { busy = false; }
}
on('coach-send', async el => {
  const ta = document.getElementById('coach-in') as HTMLTextAreaElement; const text = ta.value; ta.value = '';
  await ask(text, el as HTMLButtonElement);
});
on('chat-say', el => ask(el.dataset.text || ''));
on('chat-opt', el => {
  const m = STATE.coachMsgs[el.dataset.id!]; const o: any = m && (m.options || [])[+el.dataset.i!]; if (!o) return;
  if (o.go) { STATE.coachMsgs[m.id] = { ...m, answered: true }; saveState(); nav.go(String(o.go)); return; }
  ask(o.say || o.label);
});
on('chat-undo', el => {
  const m = STATE.coachMsgs[el.dataset.id!]; if (!m || !m.undo) return;
  undoOps(store(), m.undo);
  rebuildPlanIndex(); STATE.coachMsgs[m.id] = { ...m, undone: true }; saveState(); invalidate();
  if ((m.undo.rules || []).length || m.undo.goal) replanFuture(t('chat.undoneReplan'), t('chat.replanWhy'));
  nav.rerender(); toast(t('chat.undone'));
});
on('chat-pin', el => { const m = STATE.coachMsgs[el.dataset.id!]; if (!m) return; STATE.coachMsgs[m.id] = { ...m, pinned: !m.pinned }; saveState(); nav.rerender(); });
on('chat-jump', el => { const n = document.querySelector(`[data-msg="${el.dataset.id}"]`); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('hl'); } else openHistory(); });

/* Aktion aus einer älteren Antwort (Krankheit, Notiz, Plan-Konflikt) */
on('chat-action', el => {
  const m = STATE.coachMsgs[el.dataset.id!]; if (!m || !m.actions) return;
  const a: ChatAction = m.actions[+el.dataset.i!]; if (!a) return;
  const done = (txt: string) => { STATE.coachMsgs[m.id] = { ...m, actionsDone: txt }; saveState(); invalidate(); nav.rerender(); };
  const today = todayStr();
  if (a.kind === 'illness-start') { runOps([{ op: 'illness-start', date: today }]); done(t('chat.illStarted')); toast(t('ill.started')); return; }
  if (a.kind === 'illness-end') { runOps([{ op: 'illness-end', date: addDays(today, -1) }]); done(t('chat.illEnded')); toast(t('ill.ended')); return; }
  if (a.kind === 'add-note') {
    const p = profile(); p.notes = [...(p.notes || []), String(a.payload || '').slice(0, 200)]; saveProfile(p);
    const r = replanFuture(t('cons.reason'), t('cons.why', { list: a.payload }));
    done(r.ok ? t('chat.noteAddedReplan') : t('chat.noteAdded')); return;
  }
  if (a.kind === 'adjust') { if (!(a.payload || []).length) { done(t('chat.nothing')); return; } propose(a.payload, t('chat.adjusted')); done(t('chat.adjustedShort')); return; }
  if (a.kind === 'go') { done(t('chat.opened')); nav.go(String(a.payload)); return; }
  if (a.kind === 'say') { done(''); ask(String(a.payload || '')); return; }
  if (a.kind === 'rule-fix') { const msg = fixConflict('now', a.payload || {}); done(msg || t('chat.nothing')); return; }
});
on('prop', async el => {
  try { await apiCall('POST', '/api/coach/proposal/' + el.dataset.id, { accept: el.dataset.ok === '1' }); await syncNow(); toast(el.dataset.ok === '1' ? t('coach.accepted') : t('coach.rejected')); }
  catch (e) { toast((e as Error).message); }
});

/* ---------- Verlauf (alles, auch Archiviertes), durchsuchbar ---------- */
let Q = '';
function historySheet(): string {
  const list = searchMsgs(Object.values(STATE.coachMsgs || {}), Q).slice(0, 200);
  let lastDate = '';
  return `<div class="stack" data-history><input class="inp" id="hist-q" data-ch="hist-q" placeholder="${esc(t('chat.search'))}" value="${esc(Q)}" aria-label="${esc(t('chat.search'))}">
    ${list.length ? list.map(m => { const dt = new Date(m.at).toISOString().slice(0, 10); const head = dt !== lastDate ? `<div class="lbl" style="margin-top:var(--s2)">${esc(dowShort(dt))} ${esc(fmtDate(dt))}</div>` : ''; lastDate = dt; return `${head}<div class="hist-item ${m.from === 'user' ? 'user' : ''}"><b>${esc(m.from === 'user' ? t('chat.you') : m.title || t('coach.title'))}</b> ${esc(m.text || '')}</div>`; }).join('') : empty(t('chat.historyEmpty'))}</div>`;
}
function openHistory() { openSheet(t('chat.history'), historySheet); }
on('chat-history', () => { Q = ''; openHistory(); });
onChange('hist-q', el => { Q = (el as HTMLInputElement).value; refreshSheet(); });

/* Langzeit-Notizen des Coachs: sichtbar und löschbar */
function notesSheet(): string {
  const notes = Object.values(STATE.coachNotes || {}).filter((n: any) => n && !n.deleted) as any[];
  return `<div class="stack"><div class="hint">${esc(t('coach.notesHint'))}</div>${notes.length ? `<div class="list">${notes.map(n => `<div class="li"><span class="grow">${esc(n.text)}<br><span class="s">${fmtDate(new Date(n.createdAt).toISOString().slice(0, 10))}</span></span><button class="btn danger sm" data-act="note-del" data-id="${esc(n.id)}">${esc(t('common.delete'))}</button></div>`).join('')}</div>` : empty(t('coach.noNotes'))}
    <div class="row"><input class="inp grow" id="note-new" placeholder="${esc(t('coach.notePh'))}"><button class="btn" data-act="note-add">${ic('plus')}</button></div></div>`;
}
on('notes-open', () => openSheet(t('coach.notes'), notesSheet));
on('note-del', el => { const n = STATE.coachNotes[el.dataset.id!]; if (n) { STATE.coachNotes[n.id] = { ...n, deleted: true }; saveState(); refreshSheet(); } });
on('note-add', () => {
  const inp = document.getElementById('note-new') as HTMLInputElement; const text = inp.value.trim(); if (!text) return;
  const id = 'note-' + Date.now(); STATE.coachNotes[id] = { id, text: text.slice(0, 200), createdAt: Date.now(), from: 'user' }; saveState(); refreshSheet();
});
