/* Auftrag 16: kostenlose KI-Antworten im Coach (Cloudflare Workers AI). Einmal kurz fragen (unter 16 mit Eltern), jederzeit abschaltbar.
   Ohne Konto legt die App beim Einschalten ein privates Konto an (wie beim Verbinden). Gespeichert in settings.freeAi. */
import { STATE, saveState } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { D } from '../data';
import { on, onChange, toggle, openSheet, closeSheet } from '../kit';
import { nav } from '../nav';
import { toast } from '../toast';
import { aiState, loadAiState, isSyncOn, setupSignup, syncNow, freePublic } from '../sync';
import { needsParentConsent } from '../../../shared/features';

const F = () => (STATE.settings && STATE.settings.freeAi) || {};
/* Soll die Karte im Coach erscheinen? Nur, solange noch nicht entschieden. */
export function freeOffer(): boolean {
  const f = F(); if (f.consentAt || f.off) return false;
  if (isSyncOn()) { const a: any = aiState(); return !!(a.free && a.free.available && !a.free.decided) && !(a.tier === 'claude'); }
  return freePublic();
}
export function freeConsentHtml(where: 'card' | 'sheet'): string {
  const parent = needsParentConsent(D().age);
  const body = `<div class="small">${esc(t('free.text'))}</div>
    <ul class="small" style="padding-left:18px;margin:6px 0">${['free.p1', 'free.p2', 'free.p3'].map(k => `<li>${esc(t(k))}</li>`).join('')}</ul>
    ${!isSyncOn() ? `<div class="hint">${esc(t('free.account'))}</div>` : ''}
    ${parent ? toggle('free-parent', t('free.parent'), false) : ''}
    <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px"><button class="btn sm" data-act="free-yes">${esc(t('free.yes'))}</button><button class="btn ghost sm" data-act="free-no">${esc(t('free.no'))}</button></div>`;
  return where === 'card' ? `<div class="card stack" data-free-consent style="margin-top:var(--s3)"><b>${esc(t('free.title'))}</b>${body}</div>` : `<div class="stack" data-free-consent>${body}</div>`;
}
export function openFreeConsent() { openSheet(t('free.title'), () => freeConsentHtml('sheet')); }
on('free-yes', async el => {
  if (needsParentConsent(D().age) && !(document.getElementById('free-parent') as HTMLInputElement | null)?.checked) { toast(t('free.parentMissing')); return; }
  (el as HTMLButtonElement).disabled = true;
  try {
    if (!isSyncOn()) await setupSignup();
    STATE.settings.freeAi = { consentAt: new Date().toISOString(), ...(needsParentConsent(D().age) ? { parentConsent: true } : {}), off: false };
    saveState(); closeSheet();
    await syncNow(); await loadAiState();
    toast(t('free.on'));
  } catch (e: any) { toast((e && e.message) || t('free.failed')); (el as HTMLButtonElement).disabled = false; }
  nav.rerender();
});
on('free-no', async () => {
  STATE.settings.freeAi = { ...F(), off: true, decidedAt: new Date().toISOString() };
  saveState(); closeSheet(); nav.rerender(); toast(t('free.offToast'));
  if (isSyncOn()) { await syncNow(); await loadAiState(); nav.rerender(); }
});
/* Einstellungen: Schalter (an = Einwilligung vorhanden und nicht aus) */
export function freeSettingsHtml(): string {
  const a: any = aiState(); const f = F(); const fr = a.free || {};
  const onNow = !!f.consentAt && !f.off;
  const status = !isSyncOn() && !freePublic() ? t('free.stOffline') : fr.available === false && isSyncOn() ? t('free.stUnavailable') : !onNow ? t('free.stOff')
    : fr.reason === 'user-limit' || fr.reason === 'user-share' ? t('free.stUserLimit') : fr.reason === 'day-limit' ? t('free.stDayLimit') : t('free.stOn');
  return `<div class="stack"><div class="small"><b>${esc(t('free.title'))}</b></div><div class="small">${esc(status)}</div>
    ${f.consentAt ? toggle('free-on', t('free.switch'), onNow, 'data-ch="free-on"') : `<button class="btn ghost sm" data-act="free-open">${esc(t('free.enable'))}</button>`}
    ${onNow && isSyncOn() && fr.maxPerDay ? `<div class="kv"><span class="muted">${esc(t('free.todayLbl'))}</span><b class="num">${fr.todayQuestions || 0} / ${fr.maxPerDay}</b></div>` : ''}
    <div class="hint">${esc(t('free.hint'))}</div></div>`;
}
on('free-open', () => openFreeConsent());
onChange('free-on', async el => {
  const v = (el as HTMLInputElement).checked;
  STATE.settings.freeAi = { ...F(), off: !v }; saveState();
  toast(v ? t('free.on') : t('free.offToast'));
  if (isSyncOn()) { await syncNow(); await loadAiState(); } nav.rerender();
});
