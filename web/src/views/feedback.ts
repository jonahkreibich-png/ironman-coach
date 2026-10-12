/* „Fehler melden / Idee“ (Auftrag 4 F1, Auftrag 5 B): kurzer Text, dazu automatisch die letzten Bildschirme, App-Version, Gerät und
   die letzten Fehlermeldungen, optional ein Screenshot (ein Tipp öffnet die Fotos) und – nur wenn der Nutzer es ankreuzt – Trainingsdaten
   für genau diese Meldung. Meldungen gehen nie verloren: ohne Verbindung landen sie im Ausgang und werden beim nächsten Abgleich gesendet.
   Der Nutzer sieht seine Meldungen mit Status und Antwort. Der Betreiber hat einen Posteingang (neu / in Arbeit / erledigt),
   antwortet direkt und kopiert eine Meldung mit einem Tipp als Text für Claude Code. */
import { UI, saveUi } from '../store';
import { esc, fmtDate, ymd, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, empty, pill, ic } from '../kit';
import { readErrors } from '../errlog';
import { APP_VERSION } from '../config';
import { apiCall, isSyncOn, isAdmin, deviceName, onSynced } from '../sync';
import { isStandalone } from './einstellungen';
import { nav } from '../nav';
import { toast } from '../toast';
import { D } from '../data';
import { rulesOf, describe as ruleText } from '../../../shared/constraints';
import { parseFor } from '../../../shared/ruleparse';

let KIND: 'bug' | 'idea' = 'bug';
let LIST: any[] | null = null;
let MINE: any[] | null = null;
let ERRS: any[] | null = null;
let SENT: '' | 'sent' | 'queued' = '';
let SHOT: string | null = null;
let SHARE = false;
let FILTER: 'neu' | 'arbeit' | 'erledigt' | 'alle' = 'neu';
/* Entwurf: übersteht jedes Neuzeichnen (z. B. wenn im Hintergrund die eigenen Meldungen geladen werden) */
let DRAFT = '';
document.addEventListener('input', e => { const el = e.target as HTMLElement; if (el && el.id === 'fb-text') DRAFT = (el as HTMLTextAreaElement).value; });
const SHOTS: Record<string, string> = {};
const OUTBOX_KEY = 'ec_fb_outbox';

/* Gerät ohne persönliche Kennungen: Gerätetyp, Browser-Familie, installiert oder nicht */
export function deviceInfo(): string {
  const ua = navigator.userAgent;
  const ios = /OS (\d+)[_.](\d+)/.exec(ua);
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  return `${deviceName()}${ios ? ' iOS ' + ios[1] + '.' + ios[2] : ''}, ${browser}${isStandalone() ? ', als App installiert' : ''}, ${window.innerWidth}×${window.innerHeight}`;
}
export function context() {
  const trail: string[] = (UI.trail || []).slice(-5);
  return { screen: trail.join(' → '), version: APP_VERSION, device: deviceInfo(), errors: readErrors().slice(-5).map(e => ({ msg: e.msg, where: e.where, at: e.at })) };
}
/* Nur mit ausdrücklicher Freigabe: was der Betreiber zum Nachstellen braucht (Plan dieser Woche, Regeln, Ampel) */
function sharedData() {
  const d = D(); const p = d.profile;
  const w = d.engine.baseWeeks.find((x: any) => x.startDate <= d.today && x.endDate >= d.today);
  return {
    today: d.today, readiness: d.readiness ? { level: d.readiness.level, score: d.readiness.score } : null,
    sports: p.sports, freq: p.freq, dayLoad: p.dayLoad, rules: rulesOf(p, parseFor(d.today)).filter(r => !r.hidden).map(ruleText),
    week: w ? w.days.map((x: any) => `${x.date}: ${x.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => `${s.title} (${s.plannedMinutes || '-'} min)`).join(', ') || 'Ruhetag'}`) : []
  };
}

/* ---------- Ausgang: nichts geht verloren ---------- */
function outbox(): any[] { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') || []; } catch (e) { return []; } }
function setOutbox(list: any[]) { try { if (list.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); else localStorage.removeItem(OUTBOX_KEY); } catch (e) {} }
let flushing = false;
export async function flushOutbox(): Promise<number> {
  if (!isSyncOn() || flushing) return 0;
  const list = outbox(); if (!list.length) return 0;
  flushing = true; let sent = 0;
  try {
    for (const item of list) { try { await apiCall('POST', '/api/feedback', item); sent++; } catch (e: any) { if (!e.status || e.status >= 500 || e.status === 401) break; sent++; /* 4xx: unbrauchbar, nicht endlos wiederholen */ } }
    setOutbox(list.slice(sent));
  } finally { flushing = false; }
  if (sent) { MINE = null; toast(t('fb.outboxSent', { n: sent })); }
  return sent;
}
onSynced(() => { flushOutbox(); });

/* Neu zeichnen, aber nie, während jemand in ein Feld tippt (sonst geht der Text verloren) */
function safeRerender() { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { setTimeout(safeRerender, 800); return; } nav.rerender(); }
/* ---------- Ansicht ---------- */
const statusPill = (s: string) => pill(t('fb.st.' + (s || 'neu')), s === 'erledigt' ? 'good' : s === 'arbeit' ? 'info' : 'warn');
export function renderFeedback(): string {
  const c = context();
  const queued = outbox().length;
  let h = SENT === 'sent' ? `<div class="banner good" data-feedback-sent>${esc(t('fb.thanks'))}</div>` : SENT === 'queued' ? `<div class="banner warn" data-feedback-queued>${esc(t('fb.queued'))}</div>` : '';
  if (queued && SENT !== 'queued') h += `<div class="banner warn" data-feedback-queued>${esc(t('fb.outbox', { n: queued }))}</div>`;
  h += `<div class="card stack"><div class="seg" role="group">${[['bug', t('fb.bug')], ['idea', t('fb.idea')]].map(([k, l]) => `<button class="${KIND === k ? 'on' : ''}" aria-pressed="${KIND === k}" data-act="fb-kind" data-v="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="fld"><label for="fb-text">${esc(KIND === 'bug' ? t('fb.whatBug') : t('fb.whatIdea'))}</label><textarea class="inp" id="fb-text" rows="5" placeholder="${esc(KIND === 'bug' ? t('fb.phBug') : t('fb.phIdea'))}">${esc(DRAFT)}</textarea></div>
    <div class="row wrap"><label class="btn ghost sm fb-shot-btn">${ic('plus')} ${esc(SHOT ? t('fb.shotChange') : t('fb.shotAdd'))}<input type="file" accept="image/*" id="fb-shot" data-ch="fb-shot" hidden></label>${SHOT ? `<img src="${SHOT}" alt="${esc(t('fb.shot'))}" class="fb-thumb"><button class="link" data-act="fb-shot-del">${esc(t('common.remove'))}</button>` : ''}</div>
    <label class="switch"><input type="checkbox" id="fb-share" data-ch="fb-share" ${SHARE ? 'checked' : ''}><span>${esc(t('fb.share'))}</span></label>
    <details class="more"><summary>${esc(t('fb.attached'))}</summary><div class="body small"><div>${esc(t('fb.screen'))}: ${esc(c.screen || '–')}</div><div>${esc(t('fb.version'))}: ${esc(c.version)}</div><div>${esc(t('fb.device'))}: ${esc(c.device)}</div><div>${esc(t('fb.errors'))}: ${c.errors.length ? esc(c.errors.map(e => e.msg).join(' | ')) : '–'}</div><div class="hint">${esc(SHARE ? t('fb.sharedHint') : t('fb.noHealth'))}</div></div></details>
    <button class="btn block" data-act="fb-send">${esc(t('fb.send'))}</button>${!isSyncOn() ? `<div class="hint">${esc(t('fb.noSync2'))}</div><button class="btn ghost" data-act="fb-copy-own">${esc(t('fb.copyOwn'))}</button>` : ''}</div>`;
  if (isSyncOn()) h += mineHtml();
  if (isAdmin()) h += inboxHtml();
  return h;
}
function mineHtml(): string {
  if (MINE == null) { MINE = []; apiCall('GET', '/api/feedback/mine').then(r => { MINE = r.feedback || []; if (MINE!.length) safeRerender(); if (MINE!.some(f => f.reply && !f.replySeen)) apiCall('POST', '/api/feedback/mine/seen', {}).catch(() => {}); }).catch(() => {}); }
  if (!MINE.length) return '';
  return sec(t('fb.mine'), `<div class="list" data-feedback-mine>${MINE.map(f => `<div class="li" style="display:block"><div class="spread"><span class="s">${fmtDate(ymd(new Date(f.at)))}</span>${statusPill(f.status)}</div>
    <div class="fb-text">${esc(f.text)}</div>${f.reply ? `<div class="banner info fb-reply"><b>${esc(t('fb.replyFrom'))}</b> ${esc(f.reply)}</div>` : ''}</div>`).join('')}</div>`);
}
/* ---------- Posteingang des Betreibers ---------- */
function inboxHtml(): string {
  if (LIST == null) { LIST = []; apiCall('GET', '/api/admin/feedback').then(r => { LIST = r.feedback || []; if (LIST!.length) safeRerender(); focus(); }).catch(() => {}); }
  if (ERRS == null) { ERRS = []; apiCall('GET', '/api/admin/errors').then(r => { ERRS = r.users || []; if (ERRS!.length) safeRerender(); }).catch(() => {}); }
  const count = (s: string) => LIST!.filter(f => (f.status || 'neu') === s).length;
  const shown = LIST.filter(f => FILTER === 'alle' || (f.status || 'neu') === FILTER);
  const filt = `<div class="seg" role="group" aria-label="${esc(t('fb.filter'))}">${(['neu', 'arbeit', 'erledigt', 'alle'] as const).map(k => `<button class="${FILTER === k ? 'on' : ''}" data-act="fb-filter" data-v="${k}">${esc(t('fb.st.' + k))}${k !== 'alle' ? ` ${count(k)}` : ''}</button>`).join('')}</div>`;
  const items = shown.map(f => `<div class="li fb-item" style="display:block" data-fb="${f.id}">
    <div class="spread"><span class="t">${esc(f.user)} · ${fmtDate(ymd(new Date(f.at)))}</span>${pill(f.kind === 'idea' ? t('fb.idea') : t('fb.bug'), f.kind === 'idea' ? 'accent' : 'warn')}</div>
    <div class="fb-text">${esc(f.text)}</div><div class="xs muted fb-meta">${esc([f.screen, f.version, f.device].filter(Boolean).join(' · '))}</div>
    ${f.errors && f.errors.length ? `<div class="xs muted fb-meta">${esc(f.errors.map((e: any) => e.msg).join(' | '))}</div>` : ''}
    ${f.hasScreenshot ? (SHOTS[f.id] ? `<img src="${SHOTS[f.id]}" alt="${esc(t('fb.shot'))}" class="fb-shot">` : `<button class="link" data-act="fb-shot-load" data-id="${f.id}">${esc(t('fb.shotShow'))}</button>`) : ''}
    ${f.shared ? `<details class="more"><summary>${esc(t('fb.sharedData'))}</summary><div class="body small fb-meta">${esc(JSON.stringify(f.shared, null, 1))}</div></details>` : ''}
    ${f.reply ? `<div class="banner info fb-reply"><b>${esc(t('fb.yourReply'))}</b> ${esc(f.reply)}</div>` : ''}
    <div class="seg sm" role="group" aria-label="${esc(t('fb.status'))}" style="margin-top:6px">${['neu', 'arbeit', 'erledigt'].map(s => `<button class="${(f.status || 'neu') === s ? 'on' : ''}" data-act="fb-status" data-id="${f.id}" data-v="${s}">${esc(t('fb.st.' + s))}</button>`).join('')}</div>
    <div class="row wrap" style="margin-top:6px"><button class="btn ghost sm" data-act="fb-copy" data-id="${f.id}">${esc(t('fb.copyText'))}</button></div>
    <div class="fld" style="margin-top:6px"><label for="fb-reply-${f.id}">${esc(t('fb.reply'))}</label><textarea class="inp" id="fb-reply-${f.id}" rows="2"></textarea></div>
    <button class="btn sm" data-act="fb-reply" data-id="${f.id}">${esc(t('fb.replySend'))}</button></div>`).join('');
  const errs = ERRS && ERRS.length ? sec(t('fb.errorsTitle'), `<div class="list" data-tester-errors>${ERRS.map(u => `<div class="li" style="display:block"><div class="spread"><span class="t">${esc(u.user)}</span>${pill(t('fb.errCount', { n: u.count }), 'bad')}</div><div class="xs muted fb-meta">${esc((u.recent || []).map((e: any) => `${e.msg}${e.place ? ' @ ' + e.place : ''}${e.version ? ' (' + e.version + ')' : ''}`).join(' | '))}</div></div>`).join('')}</div>`, t('fb.allAside')) : '';
  return sec(t('fb.inbox'), `${filt}<div class="list" data-feedback-list style="margin-top:var(--s2)">${items || `<div class="li">${empty(t('fb.none'))}</div>`}</div>`, t('fb.allAside')) + errs;
}
function focus() { const id = UI.fbFocus; if (!id) return; UI.fbFocus = null; saveUi(); setTimeout(() => { const el = document.querySelector(`[data-fb="${id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('hl'); } }, 50); }
export function focusFeedback(id: string) { UI.fbFocus = id; FILTER = 'alle'; LIST = null; saveUi(); }
/* Für Claude Code: alles Nötige in einem Block */
export function asText(f: any): string {
  return [`Meldung #${f.id} von ${f.user} (${f.kind === 'idea' ? 'Idee' : 'Fehler'}), ${new Date(f.at).toLocaleString('de-DE')}`,
    `Version ${f.version || '?'} · ${f.device || '?'} · Bildschirme: ${f.screen || '?'}`, '', f.text, '',
    f.errors && f.errors.length ? 'Letzte Fehler in der App:\n' + f.errors.map((e: any) => `- ${e.msg}${e.where ? ' @ ' + e.where : ''}`).join('\n') : 'Keine Fehler im Protokoll.',
    f.shared ? '\nVom Nutzer freigegebene Daten:\n' + JSON.stringify(f.shared, null, 1) : '', f.hasScreenshot ? '\n(Screenshot liegt in der App bei der Meldung.)' : '',
    '\nBitte zuerst mit einem Test nachstellen, dann reparieren.'].filter(x => x !== '').join('\n');
}

/* ---------- Aktionen ---------- */
on('fb-kind', el => { KIND = el.dataset.v === 'idea' ? 'idea' : 'bug'; SENT = ''; nav.rerender(); });
on('fb-filter', el => { FILTER = el.dataset.v as any; nav.rerender(); });
onChange('fb-share', el => { SHARE = (el as HTMLInputElement).checked; });
onChange('fb-shot', async el => {
  const f = (el as HTMLInputElement).files && (el as HTMLInputElement).files![0]; if (!f) return;
  try { SHOT = await shrink(f); nav.rerender(); } catch (e) { toast(t('fb.shotFail')); }
});
on('fb-shot-del', () => { SHOT = null; nav.rerender(); });
/* Bild verkleinern (höchstens 900 px, JPEG), damit es klein genug für den Server ist */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let q = 0.75, max = 900;
    for (let k = 0; k < 5; k++) {
      const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q); if (out.length < 550000) return out; q -= 0.12; max = Math.round(max * 0.8);
    }
    throw new Error('zu groß');
  } finally { URL.revokeObjectURL(url); }
}
on('fb-send', async el => {
  const ta = document.getElementById('fb-text') as HTMLTextAreaElement; const text = (ta.value || '').trim();
  if (!text) { toast(t('fb.empty')); return; }
  const body: any = { kind: KIND, text, ...context(), ...(SHOT ? { screenshot: SHOT } : {}), ...(SHARE ? { shared: sharedData() } : {}), createdAt: Date.now() };
  (el as HTMLButtonElement).disabled = true;
  if (isSyncOn()) {
    try { await apiCall('POST', '/api/feedback', body); SENT = 'sent'; DRAFT = ''; SHOT = null; SHARE = false; MINE = null; LIST = null; nav.rerender(); toast(t('fb.thanksShort')); return; }
    catch (e: any) { if (e.status && e.status < 500 && e.status !== 401) { toast(e.message); (el as HTMLButtonElement).disabled = false; return; } }
  }
  // ohne Verbindung oder Server nicht erreichbar: in den Ausgang, wird automatisch gesendet
  setOutbox([...outbox(), body]); SENT = 'queued'; DRAFT = ''; SHOT = null; SHARE = false; nav.rerender();
});
on('fb-copy-own', async () => {
  const text = ((document.getElementById('fb-text') as HTMLTextAreaElement)?.value || '').trim() || (outbox()[0] || {}).text || '';
  const c = context(); const txt = `${KIND === 'bug' ? 'Fehler' : 'Idee'}: ${text}\n${c.screen} · ${c.version} · ${c.device}`;
  try { await navigator.clipboard.writeText(txt); toast(t('fb.copied')); } catch (e) { toast(t('common.copyManual')); }
});
on('fb-status', async el => { try { await apiCall('POST', '/api/admin/feedback/' + el.dataset.id, { status: el.dataset.v }); const f = (LIST || []).find(x => String(x.id) === el.dataset.id); if (f) f.status = el.dataset.v; nav.rerender(); } catch (e: any) { toast(e.message); } });
on('fb-reply', async el => {
  const id = el.dataset.id!; const ta = document.getElementById('fb-reply-' + id) as HTMLTextAreaElement; const reply = (ta?.value || '').trim(); if (!reply) return;
  try { await apiCall('POST', '/api/admin/feedback/' + id, { reply, status: 'arbeit' }); const f = (LIST || []).find(x => String(x.id) === id); if (f) { f.reply = reply; if (f.status === 'neu') f.status = 'arbeit'; } nav.rerender(); toast(t('fb.replied')); } catch (e: any) { toast(e.message); }
});
on('fb-shot-load', async el => { try { const r = await apiCall('GET', `/api/admin/feedback/${el.dataset.id}/screenshot`); if (r.screenshot) { SHOTS[el.dataset.id!] = r.screenshot; nav.rerender(); } } catch (e: any) { toast(e.message); } });
on('fb-copy', async el => {
  const f = (LIST || []).find(x => String(x.id) === el.dataset.id); if (!f) return;
  try { await navigator.clipboard.writeText(asText(f)); toast(t('fb.copiedText')); } catch (e) { toast(t('common.copyManual')); }
});
void todayStr;
