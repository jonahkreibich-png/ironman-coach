/* Sync mit dem eigenen Server (Cloudflare Worker).
   Datensatz-Ebene: jede Einheit, jeder Trend-Tag usw. hat einen eigenen updatedAt.
   Konflikte: die neueste Änderung pro Datensatz gewinnt. Offline bleibt alles in der Warteschlange.
   Dazu: Einrichtung (Einrichtungscode, Kopplung, Einladung), allgemeiner Server-Aufruf, KI-Status, Mitteilungen. */
// @ts-nocheck
import { STATE, PLAN_KEY, LS_KEY, mergeIntoDefaults, rebuildPlanIndex, onSave, wipeLocalData, hasLocalData } from './store';
import { esc, fmtDate, ymd } from './util';
import { toast } from './toast';
import { STORAGE, API_BASE, APP_VERSION, APP_RELEASE } from './config';
import { nav } from './nav';
import { t } from '../../shared/i18n';

const AUTH_KEY = STORAGE.syncAuth;
/* Datensatz-Arten, die als Wörterbuch im Zustand liegen: kind → Feld */
export const DICT_KINDS: Record<string, string> = { goal: 'goals', activity: 'activities', coachMsg: 'coachMsgs', coachNote: 'coachNotes', raceResult: 'raceResults', meal: 'meals', analysis: 'analysis', strengthTemplate: 'strengthTemplates' };
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
  Object.entries(DICT_KINDS).forEach(([kind, field]) => Object.entries(STATE[field] || {}).forEach(([k, v]) => put(kind, k, v)));
  if (STATE.profile) put('profile', 'main', STATE.profile);
  { const raw = rawPlan(); if (raw) m.set('plan|main', { kind: 'plan', key: 'main', data: null, raw }); }
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
let planChanged = false, adjustChanged = false, dictChanged = false;
function applyRecord(rec) {
  const k = rec.kind + '|' + rec.key;
  const p = META.pending[k];
  if (p && p.updatedAt > rec.updatedAt) return false; // lokale Änderung ist neuer und wird noch hochgeladen
  const d = rec.data, del = rec.deleted;
  const field = DICT_KINDS[rec.kind];
  if (field) { STATE[field] = STATE[field] || {}; if (del) delete STATE[field][rec.key]; else STATE[field][rec.key] = d; dictChanged = true; }
  else switch (rec.kind) {
    case 'profile': if (!del && d) STATE.profile = d; dictChanged = true; break;
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
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION, 'X-App-Release': APP_RELEASE }, (!noAuth && AUTH) ? { Authorization: 'Bearer ' + AUTH.token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw Object.assign(new Error((data && data.error) || ('Fehler ' + res.status)), { status: res.status });
  if (data && data.time) META.offset = data.time - Date.now();
  return data;
}

/* Antwort als Strom lesen (Auftrag 12, KI-Coach): jede Zeile ist ein JSON-Objekt. Liefert das letzte Objekt („done“ oder „error“). */
export async function apiStream(path: string, body: any, onLine: (o: any) => void): Promise<any> {
  if (!AUTH) throw Object.assign(new Error(t('sync.notConnected')), { status: 0 });
  const res = await fetch(API + path, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION, 'X-App-Release': APP_RELEASE, Authorization: 'Bearer ' + AUTH.token }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) { let d: any = null; try { d = await res.json(); } catch (e) {} throw Object.assign(new Error((d && d.error) || ('Fehler ' + res.status)), { status: res.status }); }
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let last: any = null;
  for (;;) {
    const { value, done } = await rd.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { last = JSON.parse(line); onLine(last); } catch (e) { /* halbe Zeile */ } }
    if (done) break;
  }
  return last;
}

let STATUS = 'idle'; // idle | syncing | ok | offline | error
/* Nach jedem erfolgreichen Abgleich (z. B. Ausgang für Meldungen leeren) */
const SYNCED: (() => void)[] = [];
export function onSynced(fn: () => void) { SYNCED.push(fn); }
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
    SYNCED.forEach(f => { try { f(); } catch (e) {} });
  } catch (e) {
    if (e.status === 401) { disconnect(true); toast(t('sync.removed')); }
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
  if (planChanged) { planChanged = false; toast(t('sync.reloading')); setTimeout(() => location.reload(), 900); return; }
  if (adjustChanged) { adjustChanged = false; if (true) rebuildPlanIndex(); }
  safeRerender();
}
let rerenderPending = false;
function safeRerender() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { rerenderPending = true; return; }
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
/* Wem gehören die Daten auf diesem Gerät? (Nutzer-Nummer auf dem Server, null = noch nie verbunden) */
export function localOwner(): number | null { const o = readJson(STORAGE.owner, null); return typeof o === 'number' ? o : null; }
/* Vor dem Verbinden: Daten einer anderen Person entfernen. keep: Nutzer hat bestätigt, dass die Daten auf diesem Gerät seine eigenen sind. */
function prepareDevice(uid: number | null, keep: boolean) {
  const owner = localOwner();
  if (owner != null && uid != null && owner !== uid) { wipeLocalData(); return; }
  if (owner == null && !keep && hasLocalData()) wipeLocalData();
}
function connected(res, first) {
  AUTH = { token: res.token, deviceId: res.deviceId, connectedAt: Date.now() };
  writeJson(AUTH_KEY, AUTH);
  if (res.userId != null) writeJson(STORAGE.owner, res.userId);
  META.cursor = 0; META.hashes = {}; META.pending = {}; META.lastSyncAt = null; saveMeta();
  // Einmalige Migration: der vorhandene Stand dieses Geräts wird hochgeladen.
  // Das erste Gerät gewinnt mit "jetzt", ein gekoppeltes Gerät füllt nur Lücken (Zeitstempel 1).
  detect(first ? now() : 1);
}
async function pairWith(code, keep?: boolean) {
  const res = await api('POST', '/api/pair/redeem', { code, name: deviceName() }, true);
  prepareDevice(res.userId ?? null, !!keep);
  connected(res, false);
  await syncNow();
  if (!planChanged) rebaseline();
  if (!keep) reloadSoon();
}
function reloadSoon() { try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) {} setTimeout(() => location.reload(), 600); }
function disconnect(silent?) {
  AUTH = null; ME = null; try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem('ec_me'); } catch (e) {}
  META.cursor = 0; META.hashes = {}; META.pending = {}; META.lastSyncAt = null; saveMeta();
  if (!silent) toast(t('sync.stopped'));
}

/* ---------- Für die Bildschirme ---------- */
export const isSyncOn = () => !!AUTH;
export { deviceName };
export function syncInfo() { return { status: STATUS, lastSyncAt: META.lastSyncAt, pending: Object.keys(META.pending).length, lastError: META.lastError, deviceId: AUTH && AUTH.deviceId, intervals: META.intervals || null }; }
/* Allgemeiner Server-Aufruf mit Geräte-Schlüssel. Fehlermeldungen kommen schon deutsch vom Server. */
export async function apiCall(method: string, path: string, body?: any): Promise<any> {
  if (!AUTH) throw Object.assign(new Error(t('sync.notConnected')), { status: 0 });
  try { return await api(method, path, body); }
  catch (e) { if (e instanceof TypeError) throw Object.assign(new Error(t('sync.offline')), { status: 0 }); throw e; }
}
export async function publicCall(method: string, path: string, body?: any): Promise<any> { return api(method, path, body, true); }
/* Datei-Import (.fit/.gpx/.tcx) */
export async function uploadFiles(files: File[]): Promise<any> {
  if (!AUTH) throw new Error(t('sync.notConnected'));
  const fd = new FormData(); files.forEach(f => fd.append('file', f, f.name));
  const res = await fetch(API + '/api/import/file', { method: 'POST', headers: { Authorization: 'Bearer ' + AUTH.token }, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'Fehler ' + res.status);
  await syncNow();
  return data;
}
/* Erstes Gerät (mit Einrichtungscode) oder neuer Nutzer (mit Einladung) */
export async function setupFirst(setupCode?: string) {
  const res = await api('POST', '/api/setup', { name: deviceName(), ...(setupCode ? { setupCode: setupCode.trim() } : {}) }, true);
  // Betreiber (Nutzer 1): vorhandene Daten dieses Geräts sind seine (alte App), außer sie gehören erkennbar jemand anderem
  prepareDevice(res.userId ?? 1, true);
  // Ein Gerät ohne eigene Daten (z. B. nach dem Umzug auf eine neue Adresse) darf nur Lücken füllen:
  // sonst würden seine leeren Standard-Einstellungen die echten auf dem Server überschreiben (Auftrag 7)
  connected(res, hasLocalData());
  remember(res);
  await syncNow(); if (!planChanged) rebaseline();
  return res;
}
/* Neuer Nutzer mit Einladung. Daten, die schon auf dem Gerät liegen, werden nur übernommen, wenn der Nutzer das ausdrücklich will
   (sonst könnten Daten einer anderen Person in sein Konto wandern). */
export async function setupWithInvite(invite: string, userName: string, keepLocal = false) {
  const res = await api('POST', '/api/setup', { name: deviceName(), invite, userName }, true);
  prepareDevice(res.userId ?? null, keepLocal);
  connected(res, true);
  remember(res);
  // neuer Tester: kurze Begrüßung vor dem Fragebogen (Auftrag 5 E3)
  if (res.newUser) try { localStorage.setItem('ec_intro', '1'); } catch (e) {}
  await syncNow(); rebaseline();
  reloadSoon();
  return res;
}
/* Auftrag 15: eigenes Konto ohne Einladung, z. B. beim ersten „Verbinden“. Was auf diesem Gerät liegt, gehört der Person (sie hatte noch
   kein Konto) und kommt mit. Kein Neuladen: danach geht es direkt weiter zur Anmeldung beim Dienst. */
export async function setupSignup(userName = '') {
  const res = await api('POST', '/api/setup', { signup: true, name: deviceName(), userName }, true);
  prepareDevice(res.userId ?? null, true);
  connected(res, true);
  remember(res);
  await syncNow(); rebaseline();
  await loadMe();
  return res;
}
/* Wiederherstellungscode einmal anzeigen (Auftrag 5 E4) */
function remember(res: any) { if (res && res.recoveryCode) try { localStorage.setItem('ec_rc_show', res.recoveryCode); } catch (e) {} }
/* Neues Gerät mit Wiederherstellungscode: das eigene Konto mit allen Daten zurück */
export async function recoverWith(code: string, name?: string) {
  const res = await api('POST', '/api/recover', { code, name: name || deviceName() }, true);
  prepareDevice(res.userId ?? null, false);
  connected(res, false);
  await syncNow(); rebaseline();
  reloadSoon();
  return res;
}
/* Konto löschen: auf dem Server alles weg (Backups nach Frist), dann das Gerät leeren */
export async function deleteAccount(confirmWord: string) {
  await apiCall('DELETE', '/api/me', { confirm: confirmWord });
  AUTH = null; wipeLocalData();
  try { localStorage.removeItem('ec_fb_outbox'); } catch (e) {}
  setTimeout(() => location.reload(), 600);
}
export async function pair(code: string, keepLocal = false) { await pairWith(code, keepLocal); }
export function stopSync() { disconnect(false); }
/* Abmelden und Gerät für eine andere Person freimachen: Gerät beim Server abmelden, alle lokalen Daten löschen */
export async function signOut() {
  if (AUTH) { try { await api('POST', '/api/devices/self/logout'); } catch (e) {} }
  disconnect(true);
  wipeLocalData();
  location.href = location.pathname;
}

/* KI-Status (der KI-Coach ist im Testbetrieb abgeschaltet, solange kein Schlüssel hinterlegt ist) */
let AI: any = { entitled: false, food: false, active: false, keyPresent: false, enabled: false, consent: false, monthUsd: 0, budgetUsd: 5, todayMessages: 0, maxPerDay: 30, free: null, chatActive: false, tier: null };
export function aiState() { return AI; }
export async function loadAiState() { if (!AUTH) return AI; try { AI = await api('GET', '/api/coach/ai/status'); } catch (e) {} return AI; }
/* Auftrag 16: gibt es kostenlose KI-Antworten? (auch ohne Konto, für das Angebot im Coach) */
let FREE_PUBLIC: boolean | null = null;
export function freePublic(): boolean { return !!FREE_PUBLIC; }
export function freePublicKnown(): boolean { return FREE_PUBLIC != null; }
export async function loadFreePublic(): Promise<boolean> { if (FREE_PUBLIC != null) return FREE_PUBLIC; try { const r = await api('GET', '/api/health', null, true); FREE_PUBLIC = !!(r && r.freeAi); } catch (e) { FREE_PUBLIC = false; } return FREE_PUBLIC; }

/* Eigenes Konto: Rolle und Freischaltungen (Admin hat immer alles) */
let ME = readJson('ec_me', null);
export function me() { return ME || { role: null, entitlements: {} }; }
export function isAdmin() { return !!ME && ME.role === 'admin'; }
export function entitled(k: string) { return !!(ME && ME.entitlements && ME.entitlements[k]); }
export async function loadMe() {
  if (!AUTH) return me();
  try {
    ME = await api('GET', '/api/me'); writeJson('ec_me', ME);
    const owner = localOwner();
    // Daten auf dem Gerät gehören zu einem anderen Konto → lokal löschen und neu vom Server holen
    if (owner != null && ME.userId != null && owner !== ME.userId) { wipeLocalData(true); writeJson(STORAGE.owner, ME.userId); resetSyncMeta(); location.reload(); return me(); }
    if (owner == null && ME.userId != null) writeJson(STORAGE.owner, ME.userId);
    // Vom Betreiber zurückgesetzt (Test-Nutzer): lokal neu anfangen
    const seen = readJson('ec_reset_seen', 0);
    if (ME.resetAt && ME.resetAt > seen) { wipeLocalData(true); writeJson('ec_reset_seen', ME.resetAt); resetSyncMeta(); location.href = location.pathname; return me(); }
  } catch (e) {}
  return me();
}
function resetSyncMeta() { META.cursor = 0; META.hashes = {}; META.pending = {}; META.lastSyncAt = null; saveMeta(); }

/* Mitteilungen (Web Push) */
export function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function b64ToBytes(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }
export async function pushStatus() { try { return await api('GET', '/api/push/status'); } catch (e) { return null; } }
export async function enablePush(prefs?: any) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('push.denied'));
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key', null, true);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), ...(prefs ? { prefs } : {}) });
}
export async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  await api('POST', '/api/push/unsubscribe');
}

/* Server-Sicherung (Tagesstand) → Sicherungs-Objekt wie aus der Datei */
export function backupFromRecords(records) {
  const base = mergeIntoDefaults(null);
  base.sessions = {}; base.trend = []; base.nutrition = {}; base.customWorkouts = {}; base.illnessPeriods = []; base.milestones = []; base.weekNotes = {}; base.adjustments = {};
  let plan = null;
  records.forEach(r => {
    const d = r.data; const field = DICT_KINDS[r.kind];
    if (field) (base[field] = base[field] || {})[r.key] = d;
    else if (r.kind === 'profile') base.profile = d;
    else if (r.kind === 'session') base.sessions[r.key] = d;
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
  base.trend.sort((a, b) => a.date.localeCompare(b.date));
  if (plan) base.plan = plan;
  return base;
}

/* ---------- Anzeige ---------- */
export function ago(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('sync.justNow'); if (m < 60) return t('sync.minAgo', { n: m });
  const h = Math.floor(m / 60); if (h < 24) return t('sync.hAgo', { n: h });
  return fmtDate(ymd(new Date(ts)));
}
export function statusText() {
  if (!AUTH) return '';
  const pend = Object.keys(META.pending).length;
  if (STATUS === 'syncing') return t('sync.syncing');
  if (STATUS === 'offline' || (pend && !navigator.onLine)) return t('sync.offlineQueued');
  if (STATUS === 'error') return t('sync.error');
  if (pend) return t('sync.pending');
  if (META.lastSyncAt) return t('sync.ok', { ago: ago(META.lastSyncAt) });
  return t('sync.never');
}
function statusClass() { return STATUS === 'offline' || STATUS === 'error' ? 'warn' : 'ok'; }
function updateStatusEls() {
  document.querySelectorAll('[data-sync-status]').forEach(el => { el.textContent = statusText(); el.className = 'sync-st ' + statusClass(); });
}
/* Nur sichtbar, wenn etwas nicht stimmt (offline, Fehler, Warteschlange) */
export function syncStatusLine() {
  if (!AUTH || (STATUS !== 'offline' && STATUS !== 'error' && !Object.keys(META.pending).length)) return '';
  return `<div class="sync-line"><span class="sync-st ${statusClass()}" data-sync-status>${esc(statusText())}</span></div>`;
}
export function syncStatusBadge() { return AUTH ? `<span class="sync-st ${statusClass()}" data-sync-status>${esc(statusText())}</span>` : ''; }

onSave(() => syncNotify());
if (AUTH) setTimeout(() => { syncNow(); loadAiState(); loadMe(); }, 300);
