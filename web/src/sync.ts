/* Sync mit dem eigenen Server (Cloudflare Worker).
   Datensatz-Ebene: jede Session, jeder Trend-Tag usw. hat einen eigenen updatedAt.
   Konflikte: die neueste Änderung pro Datensatz gewinnt. Offline bleibt alles in der Warteschlange. */
import { STATE, HAS_PLAN, PLAN_KEY, LS_KEY, mergeIntoDefaults, rebuildPlanIndex, onSave, saveState } from './store';
import { $, esc, fmtDate, ymd, todayStr, dowShort } from './util';
import { toast, armed } from './toast';
import { STORAGE, API_BASE, APP } from './config';
import { nav } from './nav';
import { VS } from './viewstate';
import { applyBackup } from './backup';
import { renderSheet, closeSheet, isIOS, isStandalone } from './views/sheets';

const AUTH_KEY = STORAGE.syncAuth;
const META_KEY = STORAGE.syncMeta;
const API = API_BASE;

/* ---------- Speicher ---------- */
function readJson(k, fb) { try { return JSON.parse(localStorage.getItem(k) || 'null') || fb; } catch (e) { return fb; } }
function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
let AUTH = readJson(AUTH_KEY, null);
const META = Object.assign({ cursor: 0, hashes: {}, pending: {}, lastSyncAt: null, offset: 0, lastError: null }, readJson(META_KEY, {}));
function saveMeta() { writeJson(META_KEY, META); }
function now() { return Date.now() + (META.offset || 0); }

/* ---------- Datensätze aus dem Zustand ---------- */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + str.length;
}
function itemKey(o, prefix) { return o.id || (prefix + ':' + (o.start || o.date || '') + ':' + (o.text || o.note || '')); }
function rawPlan() { try { return localStorage.getItem(PLAN_KEY); } catch (e) { return null; } }
function collect() {
  const m = new Map();
  const put = (kind, key, data) => { if (key != null && key !== '') m.set(kind + '|' + key, { kind, key: String(key), data }); };
  Object.entries(STATE.sessions || {}).forEach(([id, s]) => put('session', id, s));
  (STATE.trend || []).forEach(p => put('trend', p.date, p));
  Object.entries(STATE.nutrition || {}).forEach(([d, v]) => put('nutrition', d, v));
  Object.entries(STATE.customWorkouts || {}).forEach(([d, list]) => (list || []).forEach(w => put('custom', w.id, Object.assign({}, w, { date: d }))));
  (STATE.illnessPeriods || []).forEach(p => put('illness', itemKey(p, 'ill'), p));
  (STATE.milestones || []).forEach(p => put('milestone', itemKey(p, 'ms'), p));
  Object.entries(STATE.weekNotes || {}).forEach(([w, t]) => put('weekNote', w, t));
  Object.entries(STATE.adjustments || {}).forEach(([id, a]) => put('adjust', id, a));
  put('settings', 'main', { settings: STATE.settings, nutritionProfile: STATE.nutritionProfile, scoreAdjust: STATE.scoreAdjust, scoreCalibVersion: STATE.scoreCalibVersion ?? null });
  if (HAS_PLAN) { const raw = rawPlan(); if (raw) m.set('plan|main', { kind: 'plan', key: 'main', data: null, raw }); }
  return m;
}
function recHash(r) { return hash(r.raw != null ? r.raw : JSON.stringify(r.data)); }

/* Vergleicht den aktuellen Zustand mit dem zuletzt bekannten und legt Änderungen in die Warteschlange. */
function detect(ts?) {
  const cur = collect();
  const t = ts || now();
  let n = 0;
  cur.forEach((r, k) => {
    const h = recHash(r);
    if (META.hashes[k] === h) return;
    const data = r.raw != null ? JSON.parse(r.raw) : r.data;
    META.pending[k] = { kind: r.kind, key: r.key, data, updatedAt: t };
    META.hashes[k] = h; n++;
  });
  Object.keys(META.hashes).forEach(k => {
    if (cur.has(k)) return;
    const [kind, ...rest] = k.split('|');
    META.pending[k] = { kind, key: rest.join('|'), deleted: true, updatedAt: t };
    delete META.hashes[k]; n++;
  });
  if (n) saveMeta();
  return n;
}
function rebaseline() {
  const cur = collect(); const h = {};
  cur.forEach((r, k) => { h[k] = recHash(r); });
  META.hashes = h; saveMeta();
}

/* ---------- Datensätze vom Server übernehmen ---------- */
let planChanged = false, adjustChanged = false;
function applyRecord(rec) {
  const k = rec.kind + '|' + rec.key;
  const p = META.pending[k];
  if (p && p.updatedAt > rec.updatedAt) return false; // lokale Änderung ist neuer und wird noch hochgeladen
  const d = rec.data, del = rec.deleted;
  switch (rec.kind) {
    case 'session': if (del) delete STATE.sessions[rec.key]; else STATE.sessions[rec.key] = d; break;
    case 'trend': {
      STATE.trend = STATE.trend.filter(x => x.date !== rec.key);
      if (!del) STATE.trend.push(d);
      STATE.trend.sort((a, b) => a.date.localeCompare(b.date)); break;
    }
    case 'nutrition': if (del) delete STATE.nutrition[rec.key]; else STATE.nutrition[rec.key] = d; break;
    case 'custom': {
      Object.keys(STATE.customWorkouts).forEach(date => {
        STATE.customWorkouts[date] = STATE.customWorkouts[date].filter(w => w.id !== rec.key);
        if (!STATE.customWorkouts[date].length) delete STATE.customWorkouts[date];
      });
      if (!del && d && d.date) (STATE.customWorkouts[d.date] = STATE.customWorkouts[d.date] || []).push(d);
      break;
    }
    case 'illness': {
      STATE.illnessPeriods = STATE.illnessPeriods.filter(x => itemKey(x, 'ill') !== rec.key);
      if (!del) STATE.illnessPeriods.push(d); break;
    }
    case 'milestone': {
      STATE.milestones = STATE.milestones.filter(x => itemKey(x, 'ms') !== rec.key);
      if (!del) STATE.milestones.push(d); break;
    }
    case 'weekNote': if (del) delete STATE.weekNotes[rec.key]; else STATE.weekNotes[rec.key] = d; break;
    case 'adjust': {
      STATE.adjustments = STATE.adjustments || {};
      if (del) delete STATE.adjustments[rec.key]; else STATE.adjustments[rec.key] = d;
      adjustChanged = true; break;
    }
    case 'settings': {
      if (del || !d) break;
      if (d.settings) STATE.settings = d.settings;
      if (d.nutritionProfile) STATE.nutritionProfile = d.nutritionProfile;
      if (d.scoreAdjust) STATE.scoreAdjust = d.scoreAdjust;
      if (d.scoreCalibVersion != null) STATE.scoreCalibVersion = d.scoreCalibVersion;
      break;
    }
    case 'plan': {
      if (del || !d) break;
      const raw = JSON.stringify(d);
      if (raw !== rawPlan()) { try { localStorage.setItem(PLAN_KEY, raw); planChanged = true; } catch (e) { return false; } }
      META.hashes[k] = hash(raw);
      if (p && p.updatedAt <= rec.updatedAt) delete META.pending[k];
      return true;
    }
    default: return false;
  }
  if (del) delete META.hashes[k]; else META.hashes[k] = hash(JSON.stringify(rec.kind === 'settings' ? collect().get('settings|main').data : d));
  if (p && p.updatedAt <= rec.updatedAt) delete META.pending[k];
  return true;
}

/* ---------- Netzwerk ---------- */
async function api(method, path, body?, noAuth?) {
  const res = await fetch(API + path, {
    method, cache: 'no-store',
    headers: Object.assign({ 'Content-Type': 'application/json' }, (!noAuth && AUTH) ? { Authorization: 'Bearer ' + AUTH.token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw Object.assign(new Error((data && data.error) || ('Fehler ' + res.status)), { status: res.status });
  if (data && data.time) META.offset = data.time - Date.now();
  return data;
}

let STATUS = 'idle'; // idle | syncing | ok | offline | error
let syncing = false, again = false;
export async function syncNow(opts?) {
  opts = opts || {};
  if (!AUTH) return;
  if (syncing) { again = true; return; }
  detect();
  if (opts.onlyIfPending && !Object.keys(META.pending).length) return;
  syncing = true; STATUS = 'syncing'; updateStatusEls();
  let appliedAny = false;
  try {
    let more = true, guard = 0;
    while (more && guard++ < 50) {
      const sent = Object.values(META.pending).slice(0, 800);
      const res = await api('POST', '/api/sync', { since: META.cursor || 0, changes: sent });
      sent.forEach(c => { const k = c.kind + '|' + c.key; if (META.pending[k] && META.pending[k].updatedAt === c.updatedAt) delete META.pending[k]; });
      (res.records || []).forEach(r => { if (applyRecord(r)) appliedAny = true; });
      META.cursor = res.cursor;
      if (res.intervals) META.intervals = res.intervals;
      more = !!res.more || Object.keys(META.pending).length > 0;
    }
    META.lastSyncAt = Date.now(); META.lastError = null; STATUS = 'ok';
  } catch (e) {
    if (e.status === 401) { disconnect(true); toast('Dieses Gerät wurde vom Sync entfernt.'); }
    STATUS = (e.status && e.status !== 0) ? 'error' : 'offline';
    META.lastError = e.message;
  } finally {
    syncing = false; saveMeta();
    if (appliedAny) afterRemoteApply();
    updateStatusEls();
    if (again) { again = false; setTimeout(() => syncNow(), 50); }
  }
}
function afterRemoteApply() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) {}
  if (planChanged) { planChanged = false; toast('Neuer Stand vom Server. App lädt neu …'); setTimeout(() => location.reload(), 900); return; }
  if (adjustChanged) { adjustChanged = false; if (true) rebuildPlanIndex(); }
  safeRerender();
}
let rerenderPending = false;
function safeRerender() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { rerenderPending = true; return; }
  if (!HAS_PLAN) return;
  if (true) nav.rerender();
}
document.addEventListener('focusout', () => { if (rerenderPending) setTimeout(() => { if (!rerenderPending) return; const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; rerenderPending = false; nav.rerender(); }, 300); });

/* ---------- Auslöser ---------- */
let notifyTimer = null;
export function syncNotify() {
  if (!AUTH) return;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => syncNow({ onlyIfPending: true }), 1500);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
window.addEventListener('online', () => syncNow());
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 3 * 60 * 1000);
setInterval(updateStatusEls, 30 * 1000);

/* ---------- Verbinden / Trennen ---------- */
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone'; if (/iPad/.test(ua)) return 'iPad'; if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows-PC'; if (/Mac/.test(ua)) return 'Mac'; return 'Gerät';
}
function connected(res, first) {
  AUTH = { token: res.token, deviceId: res.deviceId, connectedAt: Date.now() };
  writeJson(AUTH_KEY, AUTH);
  META.cursor = 0; META.hashes = {}; META.pending = {}; META.lastSyncAt = null; saveMeta();
  // Einmalige Migration: der vorhandene Stand dieses Geräts wird hochgeladen.
  // Das erste Gerät gewinnt mit "jetzt", ein gekoppeltes Gerät füllt nur Lücken (Zeitstempel 1).
  if (HAS_PLAN) detect(first ? now() : 1);
}
async function setupFirst() {
  const res = await api('POST', '/api/setup', { name: deviceName() }, true);
  connected(res, true);
  await syncNow(); rebaseline();
}
async function pairWith(code) {
  const res = await api('POST', '/api/pair/redeem', { code, name: deviceName() }, true);
  connected(res, false);
  await syncNow();
  if (!planChanged) rebaseline();
}
function disconnect(silent?) {
  AUTH = null; try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  META.cursor = 0; META.hashes = {}; META.pending = {}; META.lastSyncAt = null; saveMeta();
  if (!silent) toast('Sync auf diesem Gerät beendet. Die Daten bleiben hier gespeichert.');
}

/* ---------- Anzeige ---------- */
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'gerade eben'; if (m === 1) return 'vor 1 min'; if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `vor ${h} h`;
  return `am ${fmtDate(ymd(new Date(ts)))}`;
}
function statusText() {
  if (!AUTH) return '';
  const pend = Object.keys(META.pending).length;
  if (STATUS === 'syncing') return 'Wird synchronisiert …';
  if (STATUS === 'offline' || (pend && !navigator.onLine)) return 'Offline, wird nachgeholt';
  if (STATUS === 'error') return 'Sync gerade gestört, wird nachgeholt';
  if (pend) return 'Änderungen werden gleich hochgeladen';
  if (META.lastSyncAt) return 'Synchronisiert ' + ago(META.lastSyncAt);
  return 'Noch nicht synchronisiert';
}
function statusClass() { return STATUS === 'offline' || STATUS === 'error' ? 'warn' : 'ok'; }
function updateStatusEls() {
  document.querySelectorAll('[data-sync-status]').forEach(el => { el.textContent = statusText(); el.className = 'sync-st ' + statusClass(); });
}
export const isSyncOn = () => !!AUTH;
function icuText() {
  const I = META.intervals;
  if (!I || !I.configured) return '';
  const L = I.last;
  if (!L) return 'intervals.icu: noch kein Abruf';
  const d = new Date(L.at);
  const when = (ymd(d) === todayStr() ? 'heute ' : fmtDate(ymd(d)) + ' ') + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return L.ok ? `intervals.icu: ${when}` : `intervals.icu: Fehler (${when})`;
}
export function syncStatusLine() {
  if (!AUTH) return '';
  const icu = icuText();
  return `<div class="sync-line"><span class="sync-st ${statusClass()}" data-sync-status>${esc(statusText())}</span>${icu ? `<span class="sync-icu">${esc(icu)}</span><button class="link" data-act="sync-icu-import">Jetzt abrufen</button>` : ''}</div>`;
}
function icuPanel() {
  const I = META.intervals;
  if (!I) return '';
  if (!I.configured) return `<div class="lbl">intervals.icu</div><div class="hint">Noch nicht verbunden. Der API-Schlüssel kommt als Geheimnis auf den Server (nicht in die App).</div><div class="hr"></div>`;
  const L = I.last;
  const detail = !L ? 'Noch kein Abruf.' : L.ok
    ? `Letzte Übernahme: ${esc(icuText().replace('intervals.icu: ', ''))}. ${L.wellnessDays} Tage Werte, ${L.matched} Einheiten abgehakt, ${L.extras} Extra-Einheiten.`
    : `Letzter Abruf fehlgeschlagen: ${esc(L.error || 'unbekannt')}`;
  return `<div class="lbl">intervals.icu</div><div class="hint">${detail} Automatisch alle 30 Minuten zwischen 6 und 23 Uhr. Von Hand eingetragene Werte werden nie überschrieben.</div>
    <button class="btn ghost small" data-act="sync-icu-import">Jetzt abrufen</button><div class="hr"></div>`;
}

let PAIR = null; // { code, expiresAt }
let DEVICES = null, BACKUPS = null;
export function syncSection() {

  if (!AUTH) {
    return `<div class="sec"><div class="sec-h"><h2>Sync</h2></div><div class="panel">
      <div class="hint">Mit Sync landen deine Daten zusätzlich sicher auf deinem eigenen Server und sind auf allen Geräten gleich. Ohne Internet speichert die App weiter hier und gleicht später ab.</div>
      <button class="btn small" data-act="sync-setup">Dieses Gerät als erstes einrichten</button>
      <div class="hint">Nur einmal und nur auf dem Gerät mit deinen Daten (dem iPhone). Die Daten von hier werden dabei hochgeladen.</div>
      <div class="hr"></div>
      <div class="fld"><label for="sync-code">Schon eingerichtet? Kopplungscode vom anderen Gerät</label><input class="inp" id="sync-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH"></div>
      <button class="btn ghost small" data-act="sync-pair">Koppeln</button></div></div>`;
  }
  const pairHtml = PAIR && PAIR.expiresAt > Date.now()
    ? `<div class="pair-code num">${esc(PAIR.code)}</div><div class="hint">Gib diesen Code auf dem neuen Gerät unter Einstellungen → Sync ein. Gültig bis ${new Date(PAIR.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.</div>`
    : `<button class="btn ghost small" data-act="sync-pair-create">Gerät hinzufügen</button>`;
  const devHtml = DEVICES == null ? '<div class="hint">Geräte werden geladen …</div>' : DEVICES.map(d =>
    `<div class="kv" data-dev="${esc(d.id)}"><span>${esc(d.name)}${d.self ? ' <span class="muted">(dieses Gerät)</span>' : ''}<br><span class="muted">zuletzt ${d.lastSeen ? ago(d.lastSeen) : '–'}</span></span>${d.self ? '' : '<button class="btn danger small" data-act="sync-dev-del">Entfernen</button>'}</div>`).join('');
  const bkHtml = BACKUPS == null ? '' : (BACKUPS.length ? `<div class="hint">Automatische Server-Backups (die letzten 30 Tage):</div>${BACKUPS.slice(0, 7).map(b =>
    `<div class="kv" data-bk="${esc(b.day)}"><span>${dowShort(b.day)} ${fmtDate(b.day)}</span><button class="btn ghost small" data-act="sync-bk-restore">Wiederherstellen</button></div>`).join('')}` : '<div class="hint">Das erste automatische Server-Backup entsteht heute Nacht.</div>');
  return `<div class="sec"><div class="sec-h"><h2>Sync</h2></div><div class="panel">
    <div class="row" style="justify-content:space-between"><span class="sync-st ${statusClass()}" data-sync-status>${esc(statusText())}</span><button class="btn ghost small" data-act="sync-now">Jetzt abgleichen</button></div>
    <div class="hr"></div>
    ${icuPanel()}
    <div class="lbl">Geräte</div>${devHtml}
    ${pairHtml}
    <div class="hr"></div>
    ${bkHtml}
    <button class="link" data-act="sync-off" style="align-self:flex-start">Sync auf diesem Gerät beenden</button></div></div>`;
}
export function syncWelcomePanel() {

  return `<div class="panel"><div class="sec-h"><h2>Schon auf einem anderen Gerät?</h2></div>
    <div class="hint">Erzeuge dort unter Einstellungen → Sync → <b>Gerät hinzufügen</b> einen Code und gib ihn hier ein. Plan und Daten kommen dann automatisch.</div>
    <div class="row"><input class="inp" id="sync-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH" style="flex:1;min-width:140px"><button class="btn" data-act="sync-pair">Koppeln</button></div></div>`;
}
/* ---------- Mitteilungen (Phase 5) ---------- */
const NOTIFY_DEFAULTS = {
  types: { morning: true, preSession: true, eveEarly: true, evening: true, warnings: true, adductors: true, food: true, weekly: true, achievements: true },
  times: { morningSchool: '06:45', morningWeekend: '09:00', eveEarly: '21:00', evening: '20:30', adductors: '19:00', food: '18:00', weekly: '18:00' },
  quietStart: '22:30', quietEnd: '06:00', holidays: false
}
const NOTIFY_ROWS: any[] = [
  ['morning', 'Morgens: Ampel und Einheit des Tages', [['morningSchool', 'Schultage'], ['morningWeekend', 'Wochenende']]],
  ['preSession', '1 h vor Nachmittagseinheiten (Puls, Snack)', []],
  ['eveEarly', 'Vorabend früher Einheiten', [['eveEarly', 'Uhrzeit']]],
  ['evening', 'Abends: „Wie war\'s?“', [['evening', 'Uhrzeit']]],
  ['warnings', 'Warnungen sofort (Rot, Temperatur, Plan angepasst)', []],
  ['adductors', 'Adduktoren-Übungen Mo/Mi/Fr', [['adductors', 'Uhrzeit']]],
  ['food', 'Essens-Hinweis an Trainingstagen', [['food', 'Uhrzeit']]],
  ['weekly', 'Sonntag: Wochenrückblick und Vorschau', [['weekly', 'Uhrzeit']]],
  ['achievements', 'Erfolge: neue Bestwerte', []]
];
function notifyPrefs() {
  const p = (STATE.settings && STATE.settings.notify) || {};
  return Object.assign({}, NOTIFY_DEFAULTS, p, { types: Object.assign({}, NOTIFY_DEFAULTS.types, p.types || {}), times: Object.assign({}, NOTIFY_DEFAULTS.times, p.times || {}) });
}
let PUSH = null; // { configured, thisDevice, devices }
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function b64ToBytes(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }
export function notifySection() {
  if (!AUTH) return "";
  const P = notifyPrefs();
  const iosNotInstalled = (typeof isIOS === 'function' && isIOS()) && !(typeof isStandalone === 'function' && isStandalone());
  let head;
  if (!pushSupported() || iosNotInstalled) head = `<div class="hint">Mitteilungen gehen auf dem iPhone nur in der <b>installierten App</b> (Home-Bildschirm, ab iOS 16.4). Öffne die App über das Icon und komm hierher zurück.</div>`;
  else if (PUSH && PUSH.configured === false) head = '<div class="hint">Auf dem Server sind Mitteilungen noch nicht eingerichtet.</div>';
  else if (Notification.permission === 'denied') head = `<div class="hint">Mitteilungen sind für diese App blockiert. Erlauben kannst du sie in den iPhone-Einstellungen → Mitteilungen → ${esc(APP.shortName)}.</div>`;
  else if (PUSH && PUSH.thisDevice && Notification.permission === 'granted') head = `<div class="row" style="justify-content:space-between"><span class="sync-st ok">Mitteilungen sind an</span><button class="btn ghost small" data-act="sync-notify-test">Test senden</button></div>`;
  else head = `<div class="hint">Damit dich die App erinnern kann, musst du Mitteilungen einmal erlauben.</div><button class="btn small" data-act="sync-notify-allow">Mitteilungen erlauben</button>`;
  const rows = NOTIFY_ROWS.map(([k, label, times]) => `<div class="nrow-set">
    <label class="switch"><input type="checkbox" data-np="types.${k}" ${P.types[k] ? 'checked' : ''}><span>${esc(label)}</span></label>
    ${times.length ? `<div class="ntimes">${times.map(([tk, tl]) => `<label>${esc(tl)} <input class="inp sm" type="time" data-np="times.${tk}" value="${esc(P.times[tk])}"></label>`).join('')}</div>` : ''}</div>`).join('');
  return `<div class="sec"><div class="sec-h"><h2>Mitteilungen</h2></div><div class="panel">${head}
    <div class="hr"></div>${rows}
    <label class="switch"><input type="checkbox" data-np="holidays" ${P.holidays ? 'checked' : ''}><span>Ferien: auch an Schultagen die Wochenend-Zeit</span></label>
    <div class="ntimes"><label>Ruhezeit von <input class="inp sm" type="time" data-np="quietStart" value="${esc(P.quietStart)}"></label><label>bis <input class="inp sm" type="time" data-np="quietEnd" value="${esc(P.quietEnd)}"></label></div>
    <div class="hint">Höchstens 4 Mitteilungen pro Tag. Ein Tipp auf die Mitteilung öffnet die passende Stelle in der App. Für die Erinnerung vor einer Einheit trägst du ihre Uhrzeit in der Einheit ein (oder sie steht im Plan).</div>
    ${PUSH && PUSH.thisDevice ? '<button class="link" data-act="sync-notify-off" style="align-self:flex-start">Mitteilungen auf diesem Gerät ausschalten</button>' : ''}</div></div>`;
}
document.addEventListener('change', e => {
  const el = e.target as any; const path = el.dataset && el.dataset.np; if (!path) return;
  STATE.settings.notify = notifyPrefs();
  const val = el.type === 'checkbox' ? el.checked : el.value;
  const parts = path.split('.');
  if (parts.length === 2) STATE.settings.notify[parts[0]][parts[1]] = val; else STATE.settings.notify[path] = val;
  saveState(); toast("Gespeichert");
});
async function loadPushStatus() {
  try { PUSH = await api('GET', '/api/push/status'); } catch (e) { PUSH = null; }
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('Ohne Erlaubnis kann die App keine Mitteilungen schicken.'), { status: 1 });
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key', null, true);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
  await loadPushStatus();
}
async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  await api('POST', '/api/push/unsubscribe');
  await loadPushStatus();
}

async function loadLists() {
  if (!AUTH) return;
  try { DEVICES = (await api('GET', '/api/devices')).devices; } catch (e) { DEVICES = []; }
  try { BACKUPS = (await api('GET', '/api/backups')).backups; } catch (e) { BACKUPS = []; }
  await loadPushStatus();
  if (VS.SHEET && VS.SHEET.kind === 'settings') { const P = $('#sheetPanel'); const y = P.scrollTop; renderSheet(); P.scrollTop = y; }
}
export function syncOnSettingsOpen() { DEVICES = null; BACKUPS = null; loadLists(); }

function backupFromRecords(records) {
  const base = mergeIntoDefaults(null);
  base.sessions = {}; base.trend = []; base.nutrition = {}; base.customWorkouts = {}; base.illnessPeriods = []; base.milestones = []; base.weekNotes = {}; base.adjustments = {};
  let plan = null;
  records.forEach(r => {
    const d = r.data;
    if (r.kind === 'session') base.sessions[r.key] = d;
    else if (r.kind === 'trend') base.trend.push(d);
    else if (r.kind === 'nutrition') base.nutrition[r.key] = d;
    else if (r.kind === 'custom' && d && d.date) (base.customWorkouts[d.date] = base.customWorkouts[d.date] || []).push(d);
    else if (r.kind === 'illness') base.illnessPeriods.push(d);
    else if (r.kind === 'milestone') base.milestones.push(d);
    else if (r.kind === 'weekNote') base.weekNotes[r.key] = d;
    else if (r.kind === 'adjust') base.adjustments[r.key] = d;
    else if (r.kind === 'settings' && d) { Object.assign(base, { settings: d.settings || base.settings, nutritionProfile: d.nutritionProfile || base.nutritionProfile, scoreAdjust: d.scoreAdjust || base.scoreAdjust }); if (d.scoreCalibVersion != null) base.scoreCalibVersion = d.scoreCalibVersion; }
    else if (r.kind === 'plan') plan = d;
  });
  if (plan) base.plan = plan;
  return base;
}

/* ---------- Klicks ---------- */
document.addEventListener('click', async e => {
  const b = (e.target as any).closest('[data-act^="sync-"]');
  if (!b) return;
  const act = b.dataset.act;
  const busy = on => { b.disabled = on; };
  try {
    if (act === 'sync-setup') {
      if (!HAS_PLAN) { toast('Lade zuerst deine Daten, dann richte den Sync ein.'); return; }
      if (!armed(b, 'Wirklich einrichten? Nochmal tippen')) return;
      busy(true); await setupFirst(); toast('Sync eingerichtet. Deine Daten sind jetzt auf dem Server.');
      syncOnSettingsOpen(); renderSheet(); nav.rerender();
    } else if (act === 'sync-pair') {
      const code = ($('#sync-code') || {}).value || '';
      if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { toast('Der Code hat 8 Zeichen, z. B. ABCD-EFGH.'); return; }
      busy(true); await pairWith(code);
      if (planChanged) { planChanged = false; toast('Gekoppelt. Daten sind da, App lädt neu …'); setTimeout(() => location.reload(), 900); return; }
      toast('Gekoppelt. Daten sind abgeglichen.'); syncOnSettingsOpen(); if (VS.SHEET) renderSheet(); nav.render();
    } else if (act === 'sync-now') {
      busy(true); await syncNow(); toast(STATUS === 'ok' ? 'Abgeglichen' : statusText()); busy(false);
    } else if (act === 'sync-icu-import') {
      busy(true); b.textContent = 'Wird abgerufen …';
      const st = await api('POST', '/api/intervals/import');
      await syncNow();
      if (!st.ok) toast(st.error || 'Abruf fehlgeschlagen');
      else toast(st.wellnessDays || st.matched || st.extras ? `Übernommen: ${st.wellnessDays} Tage Werte, ${st.matched} Einheiten, ${st.extras} Extra` : 'Nichts Neues bei intervals.icu');
      if (VS.SHEET && VS.SHEET.kind === 'settings') renderSheet(); nav.rerender();
    } else if (act === 'sync-notify-allow') {
      busy(true); await enablePush(); toast('Mitteilungen sind an'); renderSheet();
    } else if (act === 'sync-notify-test') {
      busy(true); const r = await api('POST', '/api/push/test'); toast(r.delivered ? 'Test-Mitteilung ist unterwegs' : 'Kein Gerät hat die Mitteilung angenommen'); busy(false);
    } else if (act === 'sync-notify-off') {
      if (!armed(b, 'Wirklich ausschalten?')) return;
      busy(true); await disablePush(); toast('Mitteilungen auf diesem Gerät aus'); renderSheet();
    } else if (act === 'sync-pair-create') {
      busy(true); PAIR = await api('POST', '/api/pair/create'); renderSheet();
      setTimeout(() => { if (VS.SHEET && VS.SHEET.kind === 'settings') renderSheet(); }, PAIR.expiresAt - Date.now() + 500);
    } else if (act === 'sync-dev-del') {
      if (!armed(b, 'Wirklich entfernen?')) return;
      const id = b.closest('[data-dev]').dataset.dev;
      busy(true); await api('DELETE', '/api/devices/' + encodeURIComponent(id)); toast('Gerät entfernt'); loadLists();
    } else if (act === 'sync-bk-restore') {
      if (!armed(b, 'Alles ersetzen? Nochmal tippen')) return;
      const day = b.closest('[data-bk]').dataset.bk;
      busy(true);
      const res = await api('GET', '/api/backups/' + day);
      const data = backupFromRecords(res.records || []);
      if (applyBackup(data)) return;
      closeSheet(); nav.render(); toast('Server-Backup vom ' + fmtDate(day) + ' geladen'); syncNotify();
    } else if (act === 'sync-off') {
      if (!armed(b, 'Sync hier beenden? Nochmal tippen')) return;
      disconnect(false); renderSheet(); nav.rerender();
    }
  } catch (err) {
    busy(false);
    toast(err.status === 0 || err instanceof TypeError ? 'Keine Verbindung zum Server. Bist du online?' : err.message);
  }
});

/* ---------- Start ---------- */
if (AUTH) setTimeout(() => syncNow(), 300);

onSave(() => syncNotify());
