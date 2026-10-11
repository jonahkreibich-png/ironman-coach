/* Coach: Nachrichten der Engine (und später der KI), freies Schreiben (Auftrag 4 D2), Schnellfragen als Vorschläge,
   Vorschläge mit Übernehmen/Ablehnen, Langzeit-Notizen. Der Coach ist in der App: kein Teilen an andere Apps.
   Ohne KI-Schlüssel versteht die Engine typische Sätze (shared/coach/intents.ts) und antwortet mit echten Daten;
   mit aktivem KI-Coach übernimmt der Server, die Oberfläche bleibt gleich. */
import { STATE, saveState, UI, profile, saveProfile } from '../store';
import { esc, fmtDate, dowShort, todayStr, addDays } from '../util';
import { t } from '../../../shared/i18n';
import { D, invalidate } from '../data';
import { on, ic, openSheet, refreshSheet, empty } from '../kit';
import { understand, SUGGEST, type ChatAction } from '../../../shared/coach/intents';
import { checkMessage } from '../../../shared/coach/safety';
import { nav } from '../nav';
import { toast } from '../toast';
import { aiState, apiCall, syncNow } from '../sync';
import { propose } from './planedit';
import { replanFuture } from '../replan';

const time = (ms: number) => { const d = new Date(ms); return `${dowShort(d.toISOString().slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function msgHtml(m: any): string {
  const cls = m.from === 'user' ? 'user' : `coach ${m.kind === 'warning' ? 'warning' : m.kind === 'adjust' ? 'adjust' : m.kind === 'proposal' ? 'proposal' : ''}`;
  const head = m.from !== 'user' && m.title ? `<div class="h">${m.kind === 'warning' ? ic('info') : m.kind === 'adjust' ? ic('calendar') : m.from === 'ai' ? ic('wand') : ''}${esc(m.title)}</div>` : '';
  const prop = m.kind === 'proposal' && m.proposal ? (m.proposal.status === 'open'
    ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="prop" data-id="${esc(m.id)}" data-ok="1">${esc(t('coach.accept'))}</button><button class="btn ghost sm" data-act="prop" data-id="${esc(m.id)}" data-ok="0">${esc(t('coach.reject'))}</button></div>`
    : `<div class="xs muted" style="margin-top:6px">${esc(m.proposal.status === 'accepted' ? t('coach.accepted') : t('coach.rejected'))}</div>`) : '';
  const acts = (m.actions || []).length && !m.actionsDone ? `<div class="suggest">${m.actions.map((a: ChatAction, i: number) => `<button class="btn sm ${i ? 'ghost' : ''}" data-act="chat-action" data-id="${esc(m.id)}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : m.actionsDone ? `<div class="xs muted" style="margin-top:6px">${esc(m.actionsDone)}</div>` : '';
  const sugg = (m.suggestions || []).length ? `<div class="suggest">${m.suggestions.map((s: string) => `<button class="chip" data-act="chat-say" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
  return `<div class="msg ${cls}" data-msg="${esc(m.id)}">${head}${esc(m.text)}${prop}${acts}${sugg}<div class="time">${time(m.at)}</div></div>`;
}

export function renderCoach(): string {
  const msgs = Object.values(STATE.coachMsgs || {}).filter((m: any) => m && !m.deleted).sort((a: any, b: any) => a.at - b.at) as any[];
  const shown = msgs.slice(-(UI.coachShow || 25));
  const ai = aiState();
  let h = `<div class="spread" style="margin-bottom:var(--s3)"><span class="xs muted">${esc(ai.active ? t('coach.aiMode') : t('coach.freeMode2'))}</span><button class="btn ghost sm" data-act="notes-open" aria-label="${esc(t('coach.notes'))}">${ic('user')} ${esc(t('coach.notesShort'))}</button></div>`;
  h += msgs.length > shown.length ? `<button class="link" data-act="coach-more">${esc(t('coach.older'))}</button>` : '';
  h += `<div class="feed">${shown.length ? shown.map(msgHtml).join('') : empty(t('coach.empty'))}</div>`;
  h += `<div class="chips" style="margin:var(--s3) 0 var(--s2)">${SUGGEST.slice(0, 5).map(q => `<button class="chip" data-act="chat-say" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  h += `<div class="composer"><textarea id="coach-in" rows="1" placeholder="${esc(t('coach.ask'))}" aria-label="${esc(t('coach.ask'))}"></textarea><button class="btn" data-act="coach-send" aria-label="${esc(t('coach.send'))}">${ic('right')}</button></div>`;
  if (ai.active) h += `<div class="xs muted" style="text-align:center;margin-top:6px">${esc(t('coach.aiCost', { used: ai.monthUsd.toFixed(2), budget: ai.budgetUsd.toFixed(2) }))}</div>`;
  else h += `<div class="hint" style="text-align:center;margin-top:var(--s2)"><button class="link" data-act="go-sub" data-sub="einstellungen">${esc(t('coach.aiSettings'))}</button></div>`;
  return h;
}
export function scrollCoachBottom() { const f = document.querySelector('.feed'); if (f) window.scrollTo(0, document.body.scrollHeight); }

function addMsgs(list: any[]) { list.forEach(m => { STATE.coachMsgs[m.id] = m; }); saveState(); nav.rerender(); scrollCoachBottom(); }
/* Frage beantworten: mit aktivem KI-Coach über den Server, sonst lokal mit der Engine */
async function ask(text: string, el?: HTMLButtonElement) {
  text = text.trim(); if (!text) return;
  const now = Date.now();
  const userMsg = { id: `msg-u-${now}`, at: now, date: todayStr(), kind: 'user', from: 'user', text };
  if (aiState().active) {
    if (el) el.disabled = true;
    try { const r = await apiCall('POST', '/api/coach/chat', { text }); addMsgs(r.messages || []); if (r.applied) await syncNow(); if (el) el.disabled = false; return; }
    catch (e) { if (el) el.disabled = false; /* ohne Verbindung: lokal antworten */ }
  }
  const d = D();
  const r = understand(d.engine, text, { scores: d.scores, prognosis: d.prognosis });
  addMsgs([userMsg, { id: `msg-a-${now}`, at: now + 1, date: todayStr(), kind: r.intent === 'safety' ? 'warning' : 'answer', from: 'coach', intent: r.intent, text: r.text, actions: r.actions || [], suggestions: r.suggestions || [] }]);
}
on('coach-send', async el => {
  const ta = document.getElementById('coach-in') as HTMLTextAreaElement; const text = ta.value; ta.value = '';
  await ask(text, el as HTMLButtonElement);
});
on('chat-say', el => ask(el.dataset.text || ''));
on('coach-more', () => { UI.coachShow = (UI.coachShow || 25) + 25; nav.rerender(); });

/* Aktion aus einer Antwort ausführen (erst nach Tipp des Nutzers) */
on('chat-action', el => {
  const m = STATE.coachMsgs[el.dataset.id!]; if (!m || !m.actions) return;
  const a: ChatAction = m.actions[+el.dataset.i!]; if (!a) return;
  const done = (txt: string) => { STATE.coachMsgs[m.id] = { ...m, actionsDone: txt }; saveState(); invalidate(); nav.rerender(); };
  const today = todayStr();
  if (a.kind === 'illness-start') {
    if (!STATE.illnessPeriods.some((p: any) => !p.end)) STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: today, end: null, note: '' });
    done(t('chat.illStarted')); toast(t('ill.started')); return;
  }
  if (a.kind === 'illness-end') {
    const ill = STATE.illnessPeriods.find((p: any) => !p.end || p.end >= today);
    if (ill) { if (ill.start >= today) STATE.illnessPeriods = STATE.illnessPeriods.filter((p: any) => p !== ill); else ill.end = addDays(today, -1); }
    done(t('chat.illEnded')); toast(t('ill.ended')); return;
  }
  if (a.kind === 'add-note') {
    const p = profile(); p.notes = [...(p.notes || []), String(a.payload || '').slice(0, 200)]; saveProfile(p);
    const r = replanFuture(t('cons.reason'), t('cons.why', { list: a.payload }));
    done(r.ok ? t('chat.noteAddedReplan') : t('chat.noteAdded')); return;
  }
  if (a.kind === 'adjust') { if (!(a.payload || []).length) { done(t('chat.nothing')); return; } propose(a.payload, t('chat.adjusted')); done(t('chat.adjustedShort')); return; }
  if (a.kind === 'go') { done(t('chat.opened')); nav.go(String(a.payload)); return; }
  if (a.kind === 'say') { done(''); ask(String(a.payload || '')); }
});
on('prop', async el => {
  try { await apiCall('POST', '/api/coach/proposal/' + el.dataset.id, { accept: el.dataset.ok === '1' }); await syncNow(); toast(el.dataset.ok === '1' ? t('coach.accepted') : t('coach.rejected')); }
  catch (e) { toast((e as Error).message); }
});

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
void checkMessage;
