/* Coach: Nachrichten der Engine (und später der KI), Schnellfragen, „Mit Claude besprechen“, Plan-Code einfügen,
   Vorschläge mit Übernehmen/Ablehnen, Langzeit-Notizen. Hauptaktion: eine Frage stellen. */
import { STATE, PLAN, BASE_WEEKS, PLAN_KEY, readPlan, saveState, UI } from '../store';
import { esc, fmtDate, dowShort, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { D } from '../data';
import { on, onChange, ic, openSheet, closeSheet, refreshSheet, armed, sec, empty } from '../kit';
import { QUICK, answerQuick, type QuickId } from '../../../shared/coach/quick';
import { buildContext } from '../../../shared/coach/summary';
import { checkPlanCode } from '../../../shared/coach/plancode';
import { withoutSource } from '../../../shared/activity/merge';
import { checkMessage } from '../../../shared/coach/safety';
import { APP } from '../config';
import { nav } from '../nav';
import { toast } from '../toast';
import { aiState, apiCall, syncNow, isSyncOn } from '../sync';

const time = (ms: number) => { const d = new Date(ms); return `${dowShort(d.toISOString().slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function msgHtml(m: any): string {
  const cls = m.from === 'user' ? 'user' : `coach ${m.kind === 'warning' ? 'warning' : m.kind === 'adjust' ? 'adjust' : m.kind === 'proposal' ? 'proposal' : ''}`;
  const head = m.from !== 'user' && m.title ? `<div class="h">${m.kind === 'warning' ? ic('info') : m.kind === 'adjust' ? ic('calendar') : m.from === 'ai' ? ic('wand') : ''}${esc(m.title)}</div>` : '';
  const prop = m.kind === 'proposal' && m.proposal ? (m.proposal.status === 'open'
    ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="prop" data-id="${esc(m.id)}" data-ok="1">${esc(t('coach.accept'))}</button><button class="btn ghost sm" data-act="prop" data-id="${esc(m.id)}" data-ok="0">${esc(t('coach.reject'))}</button></div>`
    : `<div class="xs muted" style="margin-top:6px">${esc(m.proposal.status === 'accepted' ? t('coach.accepted') : t('coach.rejected'))}</div>`) : '';
  return `<div class="msg ${cls}">${head}${esc(m.text)}${prop}<div class="time">${time(m.at)}</div></div>`;
}

export function renderCoach(): string {
  const msgs = Object.values(STATE.coachMsgs || {}).filter((m: any) => m && !m.deleted).sort((a: any, b: any) => a.at - b.at) as any[];
  const shown = msgs.slice(-(UI.coachShow || 25));
  const ai = aiState();
  let h = `<div class="chips" style="margin-bottom:var(--s3)">${QUICK.map(q => `<button class="chip" data-act="quick" data-q="${q.id}">${esc(t('quick.' + q.id))}</button>`).join('')}</div>`;
  h += `<div class="row" style="margin-bottom:var(--s3)"><button class="btn grow" data-act="claude-open">${ic('share')} ${esc(t('coach.claude'))}</button><button class="btn ghost" data-act="plancode-open" aria-label="${esc(t('coach.planCode'))}">${ic('doc')}</button><button class="btn ghost" data-act="notes-open" aria-label="${esc(t('coach.notes'))}">${ic('user')}</button></div>`;
  h += msgs.length > shown.length ? `<button class="link" data-act="coach-more">${esc(t('coach.older'))}</button>` : '';
  h += `<div class="feed">${shown.length ? shown.map(msgHtml).join('') : empty(t('coach.empty'))}</div>`;
  if (ai.active) h += `<div class="composer"><textarea id="coach-in" rows="1" placeholder="${esc(t('coach.ask'))}" aria-label="${esc(t('coach.ask'))}"></textarea><button class="btn" data-act="coach-send" aria-label="${esc(t('coach.send'))}">${ic('right')}</button></div><div class="xs muted" style="text-align:center;margin-top:6px">${esc(t('coach.aiCost', { used: ai.monthUsd.toFixed(2), budget: ai.budgetUsd.toFixed(2) }))}</div>`;
  else h += `<div class="hint" style="text-align:center;margin-top:var(--s4)">${esc(t('coach.freeMode'))} <button class="link" data-act="go-sub" data-sub="einstellungen">${esc(t('coach.aiSettings'))}</button></div>`;
  return h;
}
export function scrollCoachBottom() { const f = document.querySelector('.feed'); if (f) window.scrollTo(0, document.body.scrollHeight); }

function addMsgs(list: any[]) { list.forEach(m => { STATE.coachMsgs[m.id] = m; }); saveState(); nav.rerender(); scrollCoachBottom(); }
on('quick', el => {
  const id = el.dataset.q as QuickId;
  const now = Date.now();
  const q = QUICK.find(x => x.id === id)!;
  const answer = answerQuick(D().engine, id, { scores: D().scores, prognosis: D().prognosis });
  addMsgs([{ id: `msg-q-${now}`, at: now, date: todayStr(), kind: 'user', from: 'user', text: t('quick.' + q.id) }, { id: `msg-a-${now}`, at: now + 1, date: todayStr(), kind: 'answer', from: 'coach', text: answer }]);
});
on('coach-more', () => { UI.coachShow = (UI.coachShow || 25) + 25; nav.rerender(); });
on('coach-send', async el => {
  const ta = document.getElementById('coach-in') as HTMLTextAreaElement; const text = ta.value.trim(); if (!text) return;
  (el as HTMLButtonElement).disabled = true;
  try {
    const r = await apiCall('POST', '/api/coach/chat', { text });
    addMsgs(r.messages || []);
    if (r.applied) await syncNow();
  } catch (e) {
    // Sicherheitsantworten gehen auch ohne Verbindung
    const hits = checkMessage(text);
    if (hits.length) addMsgs([{ id: `msg-u-${Date.now()}`, at: Date.now(), date: todayStr(), kind: 'user', from: 'user', text }, { id: `msg-s-${Date.now()}`, at: Date.now() + 1, date: todayStr(), kind: 'warning', from: 'coach', text: hits[0].text }]);
    else toast((e as Error).message);
  }
  (el as HTMLButtonElement).disabled = false;
});
on('prop', async el => {
  try { await apiCall('POST', '/api/coach/proposal/' + el.dataset.id, { accept: el.dataset.ok === '1' }); await syncNow(); toast(el.dataset.ok === '1' ? t('coach.accepted') : t('coach.rejected')); }
  catch (e) { toast((e as Error).message); }
});

/* Mit Claude besprechen: kompakte Zusammenfassung ins Teilen-Menü (Claude-App), ohne Zusatzkosten.
   Oura-Werte bleiben draußen (Oura-Vertrag erlaubt keine Weitergabe an KI). */
let QUESTION = '';
function summary(): string {
  const e = D().engine;
  const safe = { ...e, state: { ...e.state, trend: withoutSource(e.state.trend, 'oura') } };
  return buildContext(safe, { days: 28, question: QUESTION || undefined, forShare: true, scores: D().scores, appName: APP.name });
}
function claudeSheet(): string {
  return `<div class="stack"><div class="hint">${esc(t('coach.claudeHint'))}</div>
    <div class="fld"><label for="cl-q">${esc(t('coach.yourQuestion'))}</label><textarea class="inp" id="cl-q" rows="3" data-ch="cl-q" placeholder="${esc(t('coach.questionPh'))}">${esc(QUESTION)}</textarea></div>
    <div class="row"><button class="btn grow" data-act="claude-share">${ic('share')} ${esc(t('coach.share'))}</button><button class="btn ghost" data-act="claude-copy">${esc(t('coach.copy'))}</button></div>
    <details class="more"><summary>${esc(t('coach.preview'))}<span class="chev">${ic('down')}</span></summary><div class="body"><pre class="small" style="white-space:pre-wrap;margin:0;font-family:ui-monospace,Menlo,monospace">${esc(summary())}</pre></div></details>
    <div class="hint">${esc(t('coach.claudeAfter'))}</div><button class="btn ghost block" data-act="plancode-open">${ic('doc')} ${esc(t('coach.planCode'))}</button></div>`;
}
on('claude-open', () => openSheet(t('coach.claude'), claudeSheet));
onChange('cl-q', el => { QUESTION = (el as HTMLTextAreaElement).value; });
on('claude-share', async () => {
  const text = summary();
  try { if (typeof navigator.share === 'function') { await navigator.share({ text }); return; } } catch (e) { if ((e as any).name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast(t('coach.copied')); } catch (e) { toast(t('coach.copyFail')); }
});
on('claude-copy', async () => { try { await navigator.clipboard.writeText(summary()); toast(t('coach.copied')); } catch (e) { toast(t('coach.copyFail')); } });

/* Plan-Code einfügen: prüfen, Vorschau mit Fehlern in einfachen Worten, dann übernehmen */
let CODE = ''; let CHECK: any = null;
function codeSheet(): string {
  let h = `<div class="stack"><div class="hint">${esc(t('coach.codeHint'))}</div>
    <textarea class="inp" rows="6" data-ch="code-in" placeholder="${esc(t('coach.codePh'))}" style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${esc(CODE)}</textarea>
    <button class="btn ghost block" data-act="code-check">${esc(t('coach.codeCheck'))}</button>`;
  if (CHECK) {
    if (CHECK.errors.length) h += `<div class="banner bad"><b>${esc(t('coach.codeErrors'))}</b><br>${CHECK.errors.map((e: string) => esc(e)).join('<br>')}</div>`;
    if (CHECK.warnings.length) h += `<div class="banner">${CHECK.warnings.map((e: string) => esc(e)).join('<br>')}</div>`;
    if (CHECK.preview.length) h += `<div class="list">${CHECK.preview.map((p: any) => `<div class="li"><span class="grow"><span class="t">${esc(p.label)}</span><br><span class="s">${fmtDate(p.from)} – ${fmtDate(p.to)} · ${p.sessions} ${esc(t('coach.units'))} · ${Math.round(p.minutes / 6) / 10} h</span></span><span class="pill ${p.status === 'neu' ? 'good' : p.status === 'ersetzt' ? 'warn' : ''}">${esc(t('coach.st.' + p.status))}</span></div>`).join('')}</div>`;
    if (CHECK.ok) h += `<button class="btn block" data-act="code-apply">${esc(CHECK.mode === 'replace' ? t('coach.codeReplace') : t('coach.codeApply'))}</button>`;
  }
  return h + '</div>';
}
on('plancode-open', () => { CHECK = null; openSheet(t('coach.planCode'), codeSheet); });
onChange('code-in', el => { CODE = (el as HTMLTextAreaElement).value; CHECK = null; });
on('code-check', () => { CHECK = checkPlanCode(CODE, readPlan() || { ...PLAN, weeks: BASE_WEEKS }, { minor: D().minor }); refreshSheet(); });
on('code-apply', el => {
  if (!CHECK || !CHECK.ok) return;
  if (CHECK.mode === 'replace' && !armed(el, t('coach.codeReplaceSure'))) return;
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(CHECK.plan)); } catch (e) { toast(t('common.storageFull')); return; }
  STATE.coachMsgs['msg-code-' + Date.now()] = { id: 'msg-code-' + Date.now(), at: Date.now(), date: todayStr(), kind: 'info', from: 'coach', title: t('coach.codeTitle'), text: t('coach.codeDone', { n: CHECK.preview.length }) };
  saveState(); closeSheet(); toast(t('coach.codeApplied')); setTimeout(() => location.reload(), 500);
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
void sec; void isSyncOn;
