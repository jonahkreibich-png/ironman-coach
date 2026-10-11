/* „Fehler melden / Idee“ (Auftrag 4 F1): kurzer Text, dazu automatisch die letzten Bildschirme, App-Version, Gerät und die
   letzten Fehlermeldungen – keine Gesundheitsdaten. Der Betreiber sieht alle Meldungen als Liste. */
import { UI } from '../store';
import { esc, fmtDate, ymd } from '../util';
import { t } from '../../../shared/i18n';
import { on, sec, empty, pill } from '../kit';
import { readErrors } from '../errlog';
import { APP_VERSION } from '../config';
import { apiCall, isSyncOn, isAdmin, deviceName } from '../sync';
import { isStandalone } from './einstellungen';
import { nav } from '../nav';
import { toast } from '../toast';

let KIND: 'bug' | 'idea' = 'bug';
let LIST: any[] | null = null;
let SENT = false;
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

export function renderFeedback(): string {
  const c = context();
  let h = SENT ? `<div class="banner good" data-feedback-sent>${esc(t('fb.thanks'))}</div>` : '';
  h += `<div class="card stack"><div class="seg" role="group">${[['bug', t('fb.bug')], ['idea', t('fb.idea')]].map(([k, l]) => `<button class="${KIND === k ? 'on' : ''}" aria-pressed="${KIND === k}" data-act="fb-kind" data-v="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="fld"><label for="fb-text">${esc(KIND === 'bug' ? t('fb.whatBug') : t('fb.whatIdea'))}</label><textarea class="inp" id="fb-text" rows="5" placeholder="${esc(KIND === 'bug' ? t('fb.phBug') : t('fb.phIdea'))}"></textarea></div>
    <details class="more"><summary>${esc(t('fb.attached'))}</summary><div class="body small"><div>${esc(t('fb.screen'))}: ${esc(c.screen || '–')}</div><div>${esc(t('fb.version'))}: ${esc(c.version)}</div><div>${esc(t('fb.device'))}: ${esc(c.device)}</div><div>${esc(t('fb.errors'))}: ${c.errors.length ? esc(c.errors.map(e => e.msg).join(' | ')) : '–'}</div><div class="hint">${esc(t('fb.noHealth'))}</div></div></details>
    <button class="btn block" data-act="fb-send">${esc(t('fb.send'))}</button>${!isSyncOn() ? `<div class="hint">${esc(t('fb.noSync'))}</div>` : ''}</div>`;
  if (isAdmin()) {
    if (LIST == null) { LIST = []; apiCall('GET', '/api/admin/feedback').then(r => { LIST = r.feedback || []; nav.rerender(); }).catch(() => {}); }
    h += sec(t('fb.all'), LIST.length ? `<div class="list" data-feedback-list>${LIST.map(f => `<div class="li" style="display:block"><div class="spread"><span class="t">${esc(f.user)} · ${fmtDate(ymd(new Date(f.at)))}</span>${pill(f.kind === 'idea' ? t('fb.idea') : t('fb.bug'), f.kind === 'idea' ? 'accent' : 'warn')}</div>
      <div style="white-space:pre-line;margin:4px 0">${esc(f.text)}</div><div class="xs muted">${esc([f.screen, f.version, f.device].filter(Boolean).join(' · '))}</div>${f.errors && f.errors.length ? `<div class="xs muted">${esc(f.errors.map((e: any) => e.msg).join(' | '))}</div>` : ''}
      <button class="link" data-act="fb-done" data-id="${f.id}" data-done="${f.done ? 0 : 1}">${esc(f.done ? t('fb.reopen') : t('fb.markDone'))}</button></div>`).join('')}</div>` : `<div class="card">${empty(t('fb.none'))}</div>`, t('fb.allAside'));
  }
  return h;
}
on('fb-kind', el => { KIND = el.dataset.v === 'idea' ? 'idea' : 'bug'; SENT = false; nav.rerender(); });
on('fb-send', async el => {
  const text = ((document.getElementById('fb-text') as HTMLTextAreaElement).value || '').trim();
  if (!text) { toast(t('fb.empty')); return; }
  const body = { kind: KIND, text, ...context() };
  if (!isSyncOn()) {
    const txt = `${KIND === 'bug' ? 'Fehler' : 'Idee'}: ${text}\n${body.screen} · ${body.version} · ${body.device}${body.errors.length ? '\n' + body.errors.map(e => e.msg).join(' | ') : ''}`;
    try { await navigator.clipboard.writeText(txt); toast(t('fb.copied')); } catch (e) { toast(t('common.copyManual')); }
    return;
  }
  (el as HTMLButtonElement).disabled = true;
  try { await apiCall('POST', '/api/feedback', body); SENT = true; LIST = null; nav.rerender(); toast(t('fb.thanksShort')); }
  catch (e: any) { toast(e.message); (el as HTMLButtonElement).disabled = false; }
});
on('fb-done', async el => { try { await apiCall('POST', '/api/admin/feedback/' + el.dataset.id, { done: el.dataset.done === '1' }); LIST = null; nav.rerender(); } catch (e: any) { toast(e.message); } });
