/* Einfacher Start für neue Tester (Auftrag 5 E3/E4/E6):
   - Einladung als Link (…/?invite=ABCD-EFGH): Antippen, Name eingeben, fertig. Auf dem iPhone in Safari zuerst die App auf den
     Home-Bildschirm legen; die installierte App teilt sich den Speicher nicht mit Safari, deshalb kopiert die App den Code und
     fügt ihn nach dem Öffnen mit einem Tipp ein.
   - Danach eine kurze Begrüßung in 3 Seiten: was die App kann, Home-Bildschirm (iOS 26), dann der Fragebogen.
   - Wiederherstellungscode einmal zeigen (zum Aufschreiben).
   - Nach einem Update einmal „Neu in dieser Version“. */
import { UI, saveUi, HAS_PLAN } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, ic, openSheet, closeSheet } from '../kit';
import { setupWithInvite, isSyncOn, recoverWith } from '../sync';
import { isIOS, isStandalone } from './einstellungen';
import { installSteps } from './daten';
import { APP, APP_RELEASE } from '../config';
import { newsSince } from '../../../shared/whatsnew';
import { nav } from '../nav';
import { toast } from '../toast';

const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k: string) => { try { localStorage.removeItem(k); } catch (e) {} } };
const fmtCode = (c: string) => { const x = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return x.length === 8 ? x.slice(0, 4) + '-' + x.slice(4) : x; };

/* ---------- Einladungslink ---------- */
export function takeInviteFromUrl(u: URL): boolean {
  const code = u.searchParams.get('invite'); if (!code) return false;
  if (isSyncOn()) { toast(t('intro.alreadyConnected')); return true; }
  ls.set('ec_invite', fmtCode(code)); return true;
}
export const pendingInvite = () => (!isSyncOn() && ls.get('ec_invite')) || null;
export function inviteHtml(): string {
  const code = pendingInvite()!;
  const safariFirst = isIOS() && !isStandalone();
  return `<div class="welcome stack" data-invite>
    <div style="text-align:center;margin:var(--s4) 0 var(--s2)"><img src="icons/icon-192.png" alt="" width="72" height="72" style="border-radius:18px"><h1 style="margin:var(--s2) 0 4px">${esc(t('intro.inviteTitle', { app: APP.name }))}</h1><div class="muted">${esc(t('intro.inviteSub'))}</div></div>
    ${safariFirst ? `<div class="card stack"><div class="lbl">${esc(t('intro.safariTitle'))}</div><div class="hint">${esc(t('intro.safariHint'))}</div>${installSteps()}
      <div class="pair-code num">${esc(code)}</div><button class="btn ghost" data-act="intro-copy">${esc(t('intro.copyCode'))}</button></div>` : ''}
    <div class="card stack"><div class="fld"><label for="intro-name">${esc(t('intro.yourName'))}</label><input class="inp" id="intro-name" autocomplete="given-name" placeholder="${esc(t('intro.namePh'))}"></div>
      <button class="btn block" data-act="intro-accept">${esc(t(safariFirst ? 'intro.acceptHere' : 'intro.accept'))}</button><div class="hint">${esc(t('intro.acceptHint'))}</div></div>
    <button class="link" data-act="intro-drop" style="align-self:center">${esc(t('intro.notMine'))}</button></div>`;
}
on('intro-copy', async () => { try { await navigator.clipboard.writeText(pendingInvite() || ''); toast(t('intro.copied')); } catch (e) { toast(t('common.copyManual')); } });
on('intro-accept', async el => {
  const code = pendingInvite(); if (!code) return;
  const name = ((document.getElementById('intro-name') as HTMLInputElement)?.value || '').trim();
  if (!name) { toast(t('intro.needName')); return; }
  (el as HTMLButtonElement).disabled = true;
  try { await setupWithInvite(code, name, false); ls.del('ec_invite'); toast(t('data.inviteDone')); }
  catch (e: any) { toast(e.message); (el as HTMLButtonElement).disabled = false; }
});
on('intro-drop', () => { ls.del('ec_invite'); nav.render(); });
/* In der installierten App: Einladung aus der Zwischenablage (Safari hat den Code kopiert) */
on('intro-paste', async () => {
  try { const txt = await navigator.clipboard.readText(); const m = /([A-Z0-9]{4})-?([A-Z0-9]{4})/i.exec(txt || ''); if (!m) { toast(t('intro.noCode')); return; } ls.set('ec_invite', fmtCode(m[1] + m[2])); nav.render(); }
  catch (e) { toast(t('intro.pasteManual')); }
});

/* ---------- Begrüßung in 3 Seiten ---------- */
export const introStep = () => { const v = ls.get('ec_intro'); return v ? Math.max(1, Math.min(3, +v || 1)) : 0; };
export function introHtml(): string {
  const n = introStep();
  const dots = `<div class="row" style="justify-content:center;gap:6px" aria-hidden="true">${[1, 2, 3].map(i => `<span class="intro-dot ${i === n ? 'on' : ''}"></span>`).join('')}</div>`;
  let body = '';
  if (n === 1) body = `<h2>${esc(t('intro.p1Title', { app: APP.name }))}</h2><ul class="intro-list">${[1, 2, 3, 4].map(i => `<li>${esc(t('intro.p1.' + i))}</li>`).join('')}</ul>`;
  if (n === 2) body = `<h2>${esc(t('intro.p2Title'))}</h2>${isStandalone() ? `<div class="banner good">${esc(t('intro.p2Done'))}</div>` : isIOS() ? `<div class="hint">${esc(t('intro.p2Hint'))}</div>${installSteps()}` : `<div class="hint">${esc(t('intro.p2Other'))}</div>`}`;
  if (n === 3) body = `<h2>${esc(t('intro.p3Title'))}</h2><div class="hint">${esc(t('intro.p3Hint'))}</div>`;
  return `<div class="welcome stack intro" data-intro="${n}">${recoveryBanner()}<div class="card stack">${body}</div>${dots}
    <div class="row" style="justify-content:space-between">${n > 1 ? `<button class="btn ghost" data-act="intro-back">${ic('back')} ${esc(t('common.back'))}</button>` : '<span></span>'}
    <button class="btn" data-act="intro-next">${esc(n === 3 ? t('intro.start') : t('common.next'))}</button></div>
    <button class="link" data-act="go-sub" data-sub="feedback" style="align-self:center">${esc(t('sub.feedback'))}</button></div>`;
}
on('intro-next', () => { const n = introStep(); if (n >= 3) { ls.del('ec_intro'); UI.seenRelease = APP_RELEASE; saveUi(); nav.go('mehr:onboarding'); return; } ls.set('ec_intro', String(n + 1)); nav.render(); window.scrollTo(0, 0); });
on('intro-back', () => { ls.set('ec_intro', String(Math.max(1, introStep() - 1))); nav.render(); });

/* ---------- Wiederherstellungscode einmal zeigen ---------- */
export function recoveryBanner(): string {
  const c = ls.get('ec_rc_show'); if (!c) return '';
  return `<div class="banner warn stack" data-recovery><b>${esc(t('intro.rcTitle'))}</b><div class="pair-code num">${esc(c)}</div><div>${esc(t('intro.rcHint'))}</div><div class="row"><button class="btn sm" data-act="rc-done">${esc(t('intro.rcDone'))}</button><button class="btn ghost sm" data-act="rc-copy">${esc(t('common.copy'))}</button></div></div>`;
}
on('rc-done', () => { ls.del('ec_rc_show'); nav.rerender(); });
on('rc-copy', async () => { try { await navigator.clipboard.writeText(ls.get('ec_rc_show') || ''); toast(t('common.copied')); } catch (e) { toast(t('common.copyManual')); } });
/* Anmelden mit Wiederherstellungscode (neues Handy, App gelöscht, Safari-Daten gelöscht) */
on('rc-recover', async el => {
  const code = ((document.getElementById('rc-code') as HTMLInputElement)?.value || '').trim();
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 16) { toast(t('intro.rcLen')); return; }
  (el as HTMLButtonElement).disabled = true;
  try { await recoverWith(code); toast(t('intro.rcRecovered')); } catch (e: any) { toast(e.message); (el as HTMLButtonElement).disabled = false; }
});

/* ---------- Neu in dieser Version ---------- */
export function maybeWhatsNew(): void {
  if (!HAS_PLAN) { if (!UI.seenRelease) { UI.seenRelease = APP_RELEASE; saveUi(); } return; }
  const seen = UI.seenRelease || '2.1.0'; // wer schon einen Plan hat, kennt mindestens 2.1.0
  const news = newsSince(seen, APP_RELEASE);
  if (!news) { if (UI.seenRelease !== APP_RELEASE) { UI.seenRelease = APP_RELEASE; saveUi(); } return; }
  openSheet(t('intro.newTitle', { v: news.version }), () => `<div class="stack" data-whatsnew><ul class="intro-list">${news.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><button class="btn block" data-act="news-ok">${esc(t('intro.newOk'))}</button></div>`);
  UI.seenRelease = APP_RELEASE; saveUi();
}
on('news-ok', () => closeSheet());
