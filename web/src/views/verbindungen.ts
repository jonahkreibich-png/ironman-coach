/* Verbindungen: Dienste verbinden (OAuth), intervals.icu-Schlüssel, Apple-Health-Kurzbefehl, Datei-Import,
   Quellen-Reihenfolge je Messwert. Hinweise, wenn eine Verbindung neu angemeldet werden muss. */
import { STATE, saveState } from '../store';
import { esc, fmtDate, ymd } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, openSheet, refreshSheet, closeSheet, armed, field, more, empty } from '../kit';
import { apiCall, isSyncOn, syncNow, uploadFiles, ago } from '../sync';
import { DEFAULT_PRIORITY, SOURCE_LABEL, priorityOf } from '../../../shared/activity/merge';
import { API_BASE } from '../config';
import { nav } from '../nav';
import { toast } from '../toast';

let CONN: any[] | null = null;
let LOADING = false;
let ERR = '';
let NEW_KEY: { id: string; key: string } | null = null;

export async function loadConnections(force = false) {
  if (!isSyncOn() || LOADING || (CONN && !force)) return;
  LOADING = true; ERR = '';
  try { CONN = (await apiCall('GET', '/api/connections')).connections; } catch (e: any) { ERR = e.message; }
  LOADING = false; nav.rerender();
}
/* Für „Heute“: Verbindungen, die neu angemeldet werden müssen */
export function reauthHints(): string[] {
  return (CONN || []).filter(c => c.status === 'reauth').map(c => t('conn.reauthHint', { name: c.label }));
}

const stateText = (c: any) => c.status === 'connected' ? t('conn.connected') : c.status === 'reauth' ? t('conn.reauth') : t('conn.notConnected');
const stateKind = (c: any) => c.status === 'connected' ? 'good' : c.status === 'reauth' ? 'warn' : '';
function lastLine(c: any) {
  const parts: string[] = [];
  if (c.lastOkAt) parts.push(t('conn.lastOk', { ago: ago(c.lastOkAt) }));
  if (c.error) parts.push(c.error);
  if (c.stats && c.stats.folder) parts.push(t('conn.folder', { f: c.stats.folder }));
  return parts.join(' · ');
}

function row(c: any): string {
  const sub = c.availability === 'partner' ? t('conn.partner') : c.availability === 'prepared' ? t('conn.prepared') : !c.configured ? t('conn.notConfigured') : lastLine(c) || t('conn.desc.' + c.id);
  return `<button class="li" data-act="conn-open" data-id="${esc(c.id)}"><span class="ic" style="--c:${c.status === 'reauth' ? 'var(--warn)' : c.status === 'connected' ? 'var(--good)' : 'var(--ink-3)'}">${ic(c.status === 'connected' ? 'check' : 'link')}</span>
    <span class="grow"><span class="t">${esc(c.label)}</span><br><span class="s">${esc(sub)}</span></span>${c.availability === 'ready' && c.configured ? pill(stateText(c), stateKind(c)) : ''}<span class="chev">${ic('right')}</span></button>`;
}

export function renderVerbindungen(): string {
  if (!isSyncOn()) return `<div class="card"><div class="hint">${esc(t('conn.needSync'))}</div><button class="btn" data-act="go-sub" data-sub="daten">${esc(t('conn.toSync'))}</button></div>` + importSection();
  if (!CONN) { loadConnections(); return `<div class="card">${empty(ERR || t('common.loading'))}</div>`; }
  const ORDER = ['shortcut', 'dropbox', 'intervals', 'oura', 'whoop', 'polar', 'withings'];
  const ready = CONN.filter(c => c.availability === 'ready').sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);
  const later = CONN.filter(c => c.availability !== 'ready');
  const reauth = CONN.filter(c => c.status === 'reauth');
  let h = reauth.length ? `<div class="banner warn">${esc(reauthHints().join(' '))}</div>` : '';
  h += `<div class="hint" style="margin:0 2px var(--s3)">${esc(t('conn.intro'))}</div>`;
  h += sec(t('conn.sources'), `<div class="list">${ready.map(row).join('')}</div>`);
  h += importSection();
  h += sec(t('conn.priority'), priorityList(), t('conn.priorityAside'));
  h += sec(t('conn.later'), `<div class="list">${later.map(row).join('')}</div>`, t('conn.laterAside'));
  return h;
}

function importSection(): string {
  return sec(t('conn.import'), `<div class="card"><div class="hint">${esc(t('conn.importHint'))}</div>
    <label class="btn ghost block" for="imp-file">${ic('upload')} ${esc(t('conn.importPick'))}</label><input type="file" id="imp-file" data-ch="imp-file" accept=".fit,.gpx,.tcx,.FIT,.GPX,.TCX,application/octet-stream,application/gpx+xml,application/xml" multiple hidden></div>`);
}

/* Quellen-Reihenfolge: je Gruppe eine Liste, nach oben schieben */
const GROUPS = ['workouts', 'sleep', 'hrv', 'restingHR', 'temp', 'spo2', 'breath', 'load', 'weight'];
function priorityList(): string {
  const used = new Set((CONN || []).filter(c => c.status === 'connected').map(c => c.id === 'dropbox' ? 'healthfit' : c.id));
  used.add('manual');
  return `<div class="list">${GROUPS.filter(g => (DEFAULT_PRIORITY as any)[g]).map(g => {
    const order = priorityOf(STATE.settings, g as any).filter(s => used.has(s) || s === 'healthkit' && used.has('shortcut'));
    return `<button class="li" data-act="prio-open" data-g="${g}"><span class="grow"><span class="t">${esc(t('group.' + g))}</span><br><span class="s">${esc(order.length ? order.map(s => SOURCE_LABEL[s] || s).join(' → ') : t('conn.noSources'))}</span></span><span class="chev">${ic('right')}</span></button>`;
  }).join('')}</div>`;
}
let PRIO_G = '';
function prioSheet(): string {
  const order = priorityOf(STATE.settings, PRIO_G as any);
  return `<div class="stack"><div class="hint">${esc(t('conn.prioHint'))}</div><div class="list">${order.map((s, i) => `<div class="li"><span class="grow"><span class="t">${i + 1}. ${esc(SOURCE_LABEL[s] || s)}</span></span>${i > 0 ? `<button class="icon-btn" data-act="prio-up" data-s="${s}" aria-label="${esc(t('conn.up'))}">${ic('up')}</button>` : ''}</div>`).join('')}</div>
    <button class="btn ghost" data-act="prio-reset">${esc(t('conn.prioReset'))}</button></div>`;
}
on('prio-open', el => { PRIO_G = el.dataset.g!; openSheet(t('group.' + PRIO_G), prioSheet); });
on('prio-up', el => {
  const order = priorityOf(STATE.settings, PRIO_G as any); const i = order.indexOf(el.dataset.s as any); if (i < 1) return;
  [order[i - 1], order[i]] = [order[i], order[i - 1]];
  STATE.settings.sourcePriority = { ...(STATE.settings.sourcePriority || {}), [PRIO_G]: order };
  saveState(); refreshSheet(); nav.rerender();
});
on('prio-reset', () => { const sp = { ...(STATE.settings.sourcePriority || {}) }; delete sp[PRIO_G]; STATE.settings.sourcePriority = sp; saveState(); refreshSheet(); nav.rerender(); });

/* ---------- Detail je Dienst ---------- */
let CUR = '';
const cur = () => (CONN || []).find(c => c.id === CUR);
function connSheet(): string {
  const c = cur(); if (!c) return '';
  let h = `<div class="stack"><div class="hint">${esc(t('conn.desc.' + c.id))}</div>`;
  if (c.availability === 'partner' || c.availability === 'prepared') return h + `<div class="banner info">${esc(t(c.availability === 'partner' ? 'conn.partnerLong' : 'conn.preparedLong'))}</div></div>`;
  if (c.id === 'oura') h += `<div class="banner info">${esc(t('conn.ouraTerms'))}</div>`;
  if (c.id === 'shortcut') return h + shortcutBody(c) + '</div>';
  if (c.id === 'intervals') {
    if (c.status !== 'connected') return h + `<div class="fgrid">${field('icu-id', t('conn.icuId'), '', { placeholder: 'i123456' })}${field('icu-key', t('conn.icuKey'), '', { type: 'password' })}</div><div class="hint">${esc(t('conn.icuHow'))}</div><button class="btn block" data-act="icu-connect">${esc(t('conn.connect'))}</button></div>`;
  } else if (!c.configured) return h + `<div class="banner warn">${esc(t('conn.notConfiguredLong'))}</div></div>`;
  if (c.status === 'connected' || c.status === 'reauth') {
    h += `<div class="kv"><span class="muted">${esc(t('conn.state'))}</span><b>${esc(stateText(c))}</b></div>`;
    if (c.lastOkAt) h += `<div class="kv"><span class="muted">${esc(t('conn.lastSync'))}</span><b>${esc(ago(c.lastOkAt))}</b></div>`;
    if (c.error) h += `<div class="banner warn">${esc(c.error)}</div>`;
    if (c.id === 'dropbox') h += `<div class="row">${field('dbx-folder', t('conn.dbxFolder'), (c.stats && c.stats.folder) || '/Apps/HealthFit', { wide: true })}<button class="btn ghost" data-act="dbx-folder" style="align-self:flex-end">${esc(t('common.save'))}</button></div><div class="hint">${esc(t('conn.dbxHint'))}</div>`;
    if (c.status === 'reauth') h += `<button class="btn block" data-act="conn-start">${esc(t('conn.reconnect'))}</button>`;
    else if (c.id !== 'intervals') h += `<button class="btn ghost block" data-act="conn-sync">${ic('sync')} ${esc(t('conn.syncNow'))}</button>`;
    h += more(t('conn.disconnect'), `<div class="hint">${esc(t('conn.disconnectHint'))}</div><label class="switch"><input type="checkbox" id="conn-del" ${c.id === 'oura' ? 'checked' : ''}><span>${esc(t('conn.deleteData'))}</span></label><button class="btn danger" data-act="conn-disconnect">${esc(t('conn.disconnect'))}</button>`);
  } else h += `<button class="btn block" data-act="conn-start">${esc(t('conn.connect'))}</button>`;
  return h + '</div>';
}
function shortcutBody(c: any): string {
  const url = (API_BASE || location.origin) + '/api/ingest/shortcut';
  let h = '';
  if (NEW_KEY) h += `<div class="banner good"><b>${esc(t('conn.keyOnce'))}</b><br><code style="word-break:break-all">${esc(NEW_KEY.key)}</code></div><button class="btn ghost" data-act="key-copy">${esc(t('common.copy'))}</button>`;
  h += `<div class="kv"><span class="muted">${esc(t('conn.address'))}</span><code class="small" style="word-break:break-all">${esc(url)}</code></div>`;
  h += `<div class="list">${(c.keys || []).map((k: any) => `<div class="li"><span class="grow"><span class="t">${esc(k.label)}</span><br><span class="s">${esc(t('conn.keyMade', { d: fmtDate(ymd(new Date(k.createdAt))) }))}${k.lastUsed ? ' · ' + esc(t('conn.keyUsed', { ago: ago(k.lastUsed) })) : ''}</span></span><button class="btn danger sm" data-act="key-revoke" data-id="${esc(k.id)}">${esc(t('conn.revoke'))}</button></div>`).join('') || `<div class="li"><span class="muted">${esc(t('conn.noKeys'))}</span></div>`}</div>`;
  h += `<button class="btn block" data-act="key-new">${ic('plus')} ${esc(t('conn.keyNew'))}</button>`;
  h += more(t('conn.shortcutHow'), `<ol class="small" style="padding-left:18px;margin:0">${[1, 2, 3, 4, 5, 6].map(i => `<li>${esc(t('conn.sc' + i))}</li>`).join('')}</ol><div class="hint">${esc(t('conn.scFields'))}</div>`);
  return h;
}
on('conn-open', el => { CUR = el.dataset.id!; NEW_KEY = null; const c = cur(); openSheet(c ? c.label : '', connSheet); });
async function busy(el: HTMLElement, fn: () => Promise<void>) {
  (el as HTMLButtonElement).disabled = true;
  try { await fn(); } catch (e: any) { toast(e.message); } finally { if (el.isConnected) (el as HTMLButtonElement).disabled = false; }
}
on('conn-start', el => busy(el, async () => {
  const r = await apiCall('POST', `/api/connect/${CUR}/start`, { returnTo: 'verbindungen' });
  location.href = r.url;
}));
on('conn-sync', el => busy(el, async () => {
  const r = await apiCall('POST', `/api/connect/${CUR}/sync`);
  await syncNow(); await loadConnections(true); refreshSheet();
  const s = r.stats || {}; toast(t('conn.synced', { d: s.days || 0, a: s.activities || 0 }));
}));
on('conn-disconnect', el => {
  if (!armed(el as HTMLElement, t('common.sure'))) return;
  return busy(el, async () => {
    const del = !!(document.getElementById('conn-del') as HTMLInputElement)?.checked;
    await apiCall('POST', CUR === 'intervals' ? '/api/connect/intervals/disconnect' : `/api/connect/${CUR}/disconnect`, { deleteData: del });
    await syncNow(); await loadConnections(true); closeSheet(); toast(t('conn.disconnected'));
  });
});
on('icu-connect', el => busy(el, async () => {
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
  await apiCall('POST', '/api/connect/intervals', { athleteId: v('icu-id'), apiKey: v('icu-key') });
  await loadConnections(true); refreshSheet(); toast(t('conn.connectedToast', { name: 'intervals.icu' }));
}));
on('dbx-folder', el => busy(el, async () => {
  await apiCall('POST', '/api/connect/dropbox/folder', { folder: (document.getElementById('dbx-folder') as HTMLInputElement).value });
  await loadConnections(true); refreshSheet(); toast(t('common.saved'));
}));
on('key-new', el => busy(el, async () => {
  NEW_KEY = await apiCall('POST', '/api/ingest/keys', { label: t('conn.keyLabel') });
  await loadConnections(true); refreshSheet();
}));
on('key-copy', async () => { if (!NEW_KEY) return; try { await navigator.clipboard.writeText(NEW_KEY.key); toast(t('common.copied')); } catch (e) { toast(t('common.copyManual')); } });
on('key-revoke', el => {
  if (!armed(el as HTMLElement, t('common.sure'))) return;
  return busy(el, async () => { await apiCall('DELETE', '/api/ingest/keys/' + encodeURIComponent(el.dataset.id!)); NEW_KEY = null; await loadConnections(true); refreshSheet(); toast(t('conn.revoked')); });
});
onChange('imp-file', async el => {
  const files = Array.from((el as HTMLInputElement).files || []);
  if (!files.length) return;
  if (!isSyncOn()) { toast(t('conn.needSync')); return; }
  toast(t('conn.importing'));
  try {
    const r = await uploadFiles(files);
    toast(t('conn.imported', { a: r.activities || 0, m: r.matched || 0 }) + (r.errors && r.errors.length ? ' ' + r.errors.join(' ') : ''));
  } catch (e: any) { toast(e.message); }
  (el as HTMLInputElement).value = '';
});

/* Rückkehr vom Erlaubnis-Bildschirm (?verbunden=oura oder ?fehler=…) */
export function handleOAuthReturn(u: URL) {
  const ok = u.searchParams.get('verbunden'), err = u.searchParams.get('fehler');
  if (ok) { toast(t('conn.connectedToast', { name: SOURCE_LABEL[ok] || ok })); syncNow(); }
  if (err) toast(err);
  if (ok || err) { CONN = null; loadConnections(true); }
}
