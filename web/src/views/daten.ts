/* Daten und Geräte: Sync mit dem eigenen Server, Geräte koppeln, Server-Sicherungen, Datei-Backup,
   Einladungen (nur Admin), Fehlerprotokoll und App-Info. */
import { STATE, HAS_PLAN, hasLocalData } from '../store';
import { esc, fmtDate, dowShort, ymd, daysBetween, todayStr } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, field, armed, more, empty } from '../kit';
import { isSyncOn, syncNow, statusText, syncStatusBadge, apiCall, setupFirst, setupWithInvite, pair, stopSync, signOut, backupFromRecords, ago, syncInfo, syncNotify } from '../sync';
import { backupText, parseBackupText, isBackup, isPlan, applyBackup, markBackedUp, shareBackupFile } from '../backup';
import { readErrors } from '../errlog';
import { checkForUpdate } from '../pwa';
import { APP, APP_VERSION } from '../config';
import { isIOS, isStandalone } from './einstellungen';
import { invalidate } from '../data';
import { FEATURE_KEYS } from '../../../shared/features';
import { nav } from '../nav';
import { toast } from '../toast';

let PAIR: { code: string; expiresAt: number } | null = null;
let DEVICES: any[] | null = null, BACKUPS: any[] | null = null, ME: any = null, INVITES: any[] | null = null, NEW_INVITE: string | null = null, SERVER_ERR: any[] | null = null;
let USERS: any[] | null = null;
let loading = false;
async function loadLists() {
  if (!isSyncOn() || loading) return; loading = true;
  try {
    const [d, b, m] = await Promise.all([apiCall('GET', '/api/devices'), apiCall('GET', '/api/backups'), apiCall('GET', '/api/me')]);
    DEVICES = d.devices; BACKUPS = b.backups; ME = m;
    if (ME && ME.role === 'admin') { INVITES = (await apiCall('GET', '/api/invites')).invites; USERS = (await apiCall('GET', '/api/admin/users')).users; }
  } catch (e) { DEVICES = DEVICES || []; BACKUPS = BACKUPS || []; }
  loading = false; nav.rerender();
}
export function resetDatenCache() { DEVICES = null; BACKUPS = null; ME = null; INVITES = null; USERS = null; }
const time = (ts: number) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/* Verbinden: Einrichtungscode, Kopplungscode, Einladung. Auch auf dem Start-Bildschirm. */
/* Liegen schon Daten auf dem Gerät, fragt die App, ob es die eigenen sind. Standard: nein (dann werden sie gelöscht). */
function keepLocalToggle(id: string): string { return hasLocalData() ? `<label class="switch"><input type="checkbox" id="${id}"><span>${esc(t('data.keepLocal'))}</span></label><div class="hint">${esc(t('data.keepLocalHint'))}</div>` : ''; }
export function connectPanel(): string {
  return `<div class="stack">
    ${more(t('data.pairTitle'), `<div class="hint">${esc(t('data.pairHint'))}</div><div class="row"><input class="inp grow" id="sync-code" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH" aria-label="${esc(t('data.pairCode'))}"><button class="btn" data-act="sync-pair">${esc(t('data.pairBtn'))}</button></div>${keepLocalToggle('keep-pair')}`, true)}
    ${more(t('data.inviteTitle'), `<div class="hint">${esc(t('data.inviteHint'))}</div><div class="fgrid">${field('inv-code', t('data.inviteCode'), '', { placeholder: 'ABCD-EFGH' })}${field('inv-name', t('data.yourName'), '')}</div>${keepLocalToggle('keep-inv')}<button class="btn" data-act="sync-invite">${esc(t('data.inviteBtn'))}</button>`)}
    ${more(t('data.setupTitle'), `<div class="hint">${esc(t('data.setupHint'))}</div><div class="row"><input class="inp grow" id="setup-code" type="password" autocomplete="off" aria-label="${esc(t('data.setupCode'))}" placeholder="${esc(t('data.setupCode'))}"><button class="btn ghost" data-act="sync-setup">${esc(t('data.setupBtn'))}</button></div>`)}
  </div>`;
}

export function renderDaten(): string {
  let h = '';
  if (!isSyncOn()) h += sec(t('data.sync'), `<div class="card stack"><div class="hint">${esc(t('data.syncIntro'))}</div>${connectPanel()}</div>`);
  else {
    if (DEVICES == null) loadLists();
    const S = syncInfo();
    h += sec(t('data.sync'), `<div class="card stack"><div class="spread">${syncStatusBadge()}<button class="btn ghost sm" data-act="sync-now">${ic('sync')} ${esc(t('data.syncNow'))}</button></div>
      ${S.lastError && S.status !== 'ok' ? `<div class="hint">${esc(S.lastError)}</div>` : ''}
      <div class="lbl">${esc(t('data.devices'))}</div>
      ${DEVICES == null ? `<div class="hint">${esc(t('common.loading'))}</div>` : `<div class="list">${DEVICES.map(d => `<div class="li" data-dev="${esc(d.id)}"><span class="ic">${ic('phone')}</span><span class="grow"><span class="t">${esc(d.name)}${d.self ? ' ' + pill(t('data.thisDevice')) : ''}</span><br><span class="s">${esc(t('data.lastSeen', { ago: d.lastSeen ? ago(d.lastSeen) : '–' }))}</span></span>${d.self ? '' : `<button class="btn danger sm" data-act="dev-del">${esc(t('common.remove'))}</button>`}</div>`).join('')}</div>`}
      ${PAIR && PAIR.expiresAt > Date.now() ? `<div class="pair-code num">${esc(PAIR.code)}</div><div class="hint">${esc(t('data.pairShow', { time: time(PAIR.expiresAt) }))}</div>` : `<button class="btn ghost" data-act="pair-create">${ic('plus')} ${esc(t('data.addDevice'))}</button>`}
      <button class="link" data-act="sync-off">${esc(t('data.syncOff'))}</button></div>`);
    if (ME && ME.role === 'admin') h += sec(t('data.invites'), invitesCard(), t('data.invitesAside')) + sec(t('data.users'), usersCard(), t('data.usersAside'));
  }
  h += sec(t('data.backup'), backupCard(), STATE.lastBackupAt ? t('data.lastBackup', { d: fmtDate(STATE.lastBackupAt.slice(0, 10)) }) : '');
  if (isSyncOn() || hasLocalData()) h += sec(t('data.signOut'), `<div class="card stack"><div class="hint">${esc(t(isSyncOn() ? 'data.signOutHint' : 'data.wipeHint'))}</div><button class="btn danger" data-act="sign-out">${esc(t(isSyncOn() ? 'data.signOutBtn' : 'data.wipeBtn'))}</button></div>`);
  h += sec(t('data.errors'), errorsCard());
  h += sec(t('data.app'), appCard(), t('data.version', { v: APP_VERSION }));
  return h;
}

function invitesCard(): string {
  return `<div class="card stack"><div class="hint">${esc(t('data.invitesHint'))}</div>
    ${NEW_INVITE ? `<div class="pair-code num">${esc(NEW_INVITE)}</div><div class="hint">${esc(t('data.inviteShow'))}</div><button class="btn ghost sm" data-act="invite-copy">${esc(t('common.copy'))}</button>` : ''}
    <div class="row">${field('inv-note', t('data.inviteFor'), '', { placeholder: t('data.inviteForPh'), wide: true })}<button class="btn" data-act="invite-create" style="align-self:flex-end">${esc(t('data.inviteCreate'))}</button></div>
    <div class="list">${(INVITES || []).map(i => `<div class="li"><span class="grow"><span class="t">${esc(i.note || t('data.inviteNoNote'))}</span><br><span class="s">${esc(i.used ? t('data.inviteUsed', { d: fmtDate(ymd(new Date(i.usedAt))) }) : i.expiresAt < Date.now() ? t('data.inviteExpired') : t('data.inviteOpen', { d: fmtDate(ymd(new Date(i.expiresAt))) }))}</span></span></div>`).join('') || `<div class="li"><span class="muted">${esc(t('data.noInvites'))}</span></div>`}</div></div>`;
}

/* Nutzer und Freischaltungen (nur Admin). Der Admin selbst hat immer alles. */
function usersCard(): string {
  if (!USERS) return `<div class="card">${empty(t('common.loading'))}</div>`;
  return `<div class="card stack"><div class="hint">${esc(t('data.usersHint'))}</div><div class="list">${USERS.map(u => `<div class="li" style="display:block">
    <div class="spread"><span class="t">${esc(u.name || t('data.userN', { n: u.id }))}${u.self ? ' ' + pill(t('data.you')) : ''}</span>${u.role === 'admin' ? pill(t('data.admin'), 'accent') : ''}</div>
    <div class="chips" style="margin-top:6px">${FEATURE_KEYS.map(k => { const onK = !!u.entitlements[k]; return `<button class="chip ${onK ? 'on' : ''}" aria-pressed="${onK}" data-act="feat-toggle" data-uid="${u.id}" data-k="${k}" ${u.role === 'admin' ? 'disabled' : ''}>${esc(t('feature.' + k))}</button>`; }).join('')}</div></div>`).join('')}</div></div>`;
}
on('feat-toggle', el => busy(el, async () => {
  const u = (USERS || []).find(x => String(x.id) === el.dataset.uid); if (!u || u.role === 'admin') return;
  const next = { ...(u.features || {}) }; const k = el.dataset.k!;
  if (next[k]) delete next[k]; else next[k] = true;
  await apiCall('POST', `/api/admin/users/${u.id}/features`, { features: next });
  USERS = (await apiCall('GET', '/api/admin/users')).users; nav.rerender(); toast(t('common.saved'));
}));

function backupCard(): string {
  const srv = isSyncOn() && BACKUPS ? (BACKUPS.length ? `<div class="lbl">${esc(t('data.serverBackups'))}</div><div class="list">${BACKUPS.slice(0, 7).map(b => `<div class="li" data-bk="${esc(b.day)}"><span class="grow"><span class="t">${dowShort(b.day)} ${fmtDate(b.day)}</span></span><button class="btn ghost sm" data-act="bk-restore">${esc(t('data.restore'))}</button></div>`).join('')}</div>` : `<div class="hint">${esc(t('data.firstBackupTonight'))}</div>`) : '';
  return `<div class="card stack"><div class="hint">${esc(isSyncOn() ? t('data.backupSync') : t('data.backupLocal'))}</div>
    <div class="row"><button class="btn" data-act="backup-file">${esc(t('data.backupFile'))}</button><button class="btn ghost" data-act="backup-copy">${esc(t('data.backupCopy'))}</button></div>
    ${srv}
    ${more(t('data.restoreTitle'), `<div class="fld"><label for="bk-in">${esc(t('data.restoreLabel'))}</label><textarea class="inp" id="bk-in" rows="3" placeholder="${esc(t('data.restorePh'))}" style="font-family:ui-monospace,Menlo,monospace;font-size:11px"></textarea></div>
      <div class="row"><label class="btn ghost sm" for="bk-file">${esc(t('data.pickFile'))}</label><input type="file" id="bk-file" data-ch="bk-file" accept="application/json,.json,.txt,text/plain" hidden><button class="btn danger sm" data-act="backup-load">${esc(t('data.restoreBtn'))}</button></div>
      <div class="hint">${esc(t('data.restoreWarn'))}</div>`)}</div>`;
}
/* Erinnerung, wenn ohne Sync lange kein Backup gemacht wurde (für „Mehr“) */
export function backupDue(): boolean {
  if (isSyncOn() || !HAS_PLAN) return false;
  const last = STATE.lastBackupAt ? STATE.lastBackupAt.slice(0, 10) : null;
  return !last || daysBetween(last, todayStr()) >= 7;
}

function errorsCard(): string {
  const local = readErrors().slice(-8).reverse();
  return `<div class="card stack"><div class="hint">${esc(t('data.errorsHint'))}</div>
    ${local.length ? `<div class="list">${local.map(e => `<div class="li"><span class="grow"><span class="t small">${esc(e.msg)}</span><br><span class="s">${esc(new Date(e.at).toLocaleString('de-DE'))} · ${esc(e.where)} · ${esc(e.version)}</span></span></div>`).join('')}</div>` : empty(t('data.noErrors'))}
    ${isSyncOn() && ME && ME.role === 'admin' ? `<button class="btn ghost sm" data-act="err-server">${esc(t('data.errorsServer'))}</button>${SERVER_ERR ? `<div class="list">${SERVER_ERR.slice(0, 15).map(e => `<div class="li"><span class="grow"><span class="t small">${esc(e.msg || e.message || '')}</span><br><span class="s">${esc(new Date(e.at || e.ts || 0).toLocaleString('de-DE'))} · ${esc(e.source || '')} ${esc(e.place || '')}</span></span></div>`).join('') || empty(t('data.noErrors'))}</div>` : ''}` : ''}</div>`;
}

const DOTS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="vertical-align:-3px" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
export function installSteps(): string {
  return `<ol class="small" style="padding-left:18px;margin:0">
    <li>${t('install.s1', { dots: DOTS })}</li><li>${t('install.s2', { share: ic('share') })}</li><li>${esc(t('install.s3'))}</li><li>${esc(t('install.s4'))}</li></ol>`;
}
function appCard(): string {
  return `<div class="card stack">${isStandalone() ? `<div class="hint">${esc(t('data.installed'))}</div>` : isIOS() ? `<div class="hint">${esc(t('data.installHow'))}</div>${installSteps()}` : `<div class="hint">${esc(t('data.installOther'))}</div>`}
    <button class="btn ghost sm" data-act="app-update">${esc(t('data.update'))}</button>
    <div class="hint">${esc(t('data.about', { app: APP.name }))}</div></div>`;
}

/* ---------- Aktionen ---------- */
async function busy(el: HTMLElement, fn: () => Promise<void>) {
  (el as HTMLButtonElement).disabled = true;
  try { await fn(); } catch (e: any) { toast(e.status === 0 || e instanceof TypeError ? t('sync.offline') : e.message); }
  finally { if (el.isConnected) (el as HTMLButtonElement).disabled = false; }
}
const val = (id: string) => ((document.getElementById(id) as HTMLInputElement | null)?.value || '').trim();
on('sync-now', el => busy(el, async () => { await syncNow(); toast(statusText()); nav.rerender(); }));
on('sync-setup', el => {
  const code = val('setup-code');
  return busy(el, async () => { await setupFirst(code || undefined); resetDatenCache(); toast(t('data.setupDone')); afterConnect(); });
});
on('sync-pair', el => {
  const code = val('sync-code'); if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { toast(t('data.codeLen')); return; }
  const keep = !!(document.getElementById('keep-pair') as HTMLInputElement | null)?.checked;
  return busy(el, async () => { await pair(code, keep); resetDatenCache(); toast(t('data.paired')); afterConnect(); });
});
on('sync-invite', el => {
  const code = val('inv-code'); if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { toast(t('data.codeLen')); return; }
  const keep = !!(document.getElementById('keep-inv') as HTMLInputElement | null)?.checked;
  return busy(el, async () => { await setupWithInvite(code, val('inv-name'), keep); resetDatenCache(); toast(t('data.inviteDone')); afterConnect(); });
});
function afterConnect() {
  // Neuer Plan vom Server → die App lädt in sync.ts selbst neu. Sonst neu zeichnen.
  invalidate(); nav.render();
}
on('sign-out', el => { if (!armed(el, t('data.signOutSure'))) return; return busy(el, async () => { await signOut(); }); });
on('sync-off', el => { if (!armed(el, t('data.syncOffSure'))) return; stopSync(); resetDatenCache(); nav.rerender(); });
on('pair-create', el => busy(el, async () => { PAIR = await apiCall('POST', '/api/pair/create'); nav.rerender(); }));
on('dev-del', el => {
  if (!armed(el, t('common.reallyRemove'))) return;
  const id = (el.closest('[data-dev]') as HTMLElement).dataset.dev!;
  return busy(el, async () => { await apiCall('DELETE', '/api/devices/' + encodeURIComponent(id)); toast(t('data.devRemoved')); DEVICES = null; loadLists(); });
});
on('invite-create', el => busy(el, async () => { const r = await apiCall('POST', '/api/invites', { note: val('inv-note') }); NEW_INVITE = r.code; INVITES = (await apiCall('GET', '/api/invites')).invites; nav.rerender(); }));
on('invite-copy', async () => { if (!NEW_INVITE) return; try { await navigator.clipboard.writeText(NEW_INVITE); toast(t('common.copied')); } catch (e) { toast(t('common.copyManual')); } });
on('err-server', el => busy(el, async () => { SERVER_ERR = (await apiCall('GET', '/api/log')).errors || []; nav.rerender(); }));
on('bk-restore', el => {
  if (!armed(el, t('data.replaceAll'))) return;
  const day = (el.closest('[data-bk]') as HTMLElement).dataset.bk!;
  return busy(el, async () => {
    const res = await apiCall('GET', '/api/backups/' + day);
    if (applyBackup(backupFromRecords(res.records || []))) return;
    invalidate(); nav.render(); toast(t('data.restoredServer', { d: fmtDate(day) })); syncNotify();
  });
});
on('backup-file', () => shareBackupFile(() => nav.rerender()));
on('backup-copy', async () => {
  const txt = backupText();
  try { await navigator.clipboard.writeText(txt); markBackedUp(); toast(t('data.backupCopied')); nav.rerender(); }
  catch (e) { const ta = document.getElementById('bk-in') as HTMLTextAreaElement | null; if (ta) { ta.value = txt; ta.focus(); ta.select(); } toast(t('common.copyManual')); }
});
on('backup-load', el => {
  const raw = val('bk-in'); if (!raw) { toast(t('data.restoreEmpty')); return; }
  let data: any; try { data = parseBackupText(raw); } catch (e) { toast(t('data.restoreInvalid')); return; }
  if (!isBackup(data)) { toast(t('data.restoreNoBackup')); return; }
  if (!armed(el, t('data.replaceAll'))) return;
  if (applyBackup(data)) return;
  invalidate(); nav.render(); toast(t('data.restored'));
});
onChange('bk-file', el => {
  const file = (el as HTMLInputElement).files && (el as HTMLInputElement).files![0]; if (!file) return;
  const r = new FileReader(); r.onload = () => { const ta = document.getElementById('bk-in') as HTMLTextAreaElement | null; if (ta) ta.value = String(r.result || ''); toast(t('data.fileRead')); }; r.readAsText(file);
});
on('app-update', () => checkForUpdate(true));
void isPlan;
