import { storage, storageMessage, STORAGE_TAB } from './persistence';
import { storage as localStorage } from "./persistence";
/* Einstieg: Tabs (Heute, Plan, Coach, Fortschritt, Mehr), Unterseiten unter „Mehr“, Aktionen, Deep Links. */
import { guardLeave } from './staged';
import { morph } from './morph';
import { STATE, UI, HAS_PLAN, findDay, saveState, saveUi, refreshStoredState, rebuildPlanIndex, readPlan, replacePlanInPlace } from './store';
import { esc, todayStr, addDays } from './util';
import { t } from '../../shared/i18n';
import { ACTIONS, CHANGE, INPUT, on, ic, closeSheet, sheetOpen  } from './kit';
import { CHARTS, chartTap } from './charts';
import { effStatus } from './domain';
import { D, invalidate } from './data';
import './sync';
import { renderHeute } from './views/heute';
import { renderPlan, scrollToPlanDay, centerWeekBar } from './views/plan';
import { renderCoach, scrollCoachBottom, healthAction } from './views/coach';
import { renderFortschritt } from './views/fortschritt';
import { renderMehr, resetMehrSearch } from './views/mehr';
import { renderLexikon, setLexiconQuery } from './views/lexikon';
import { renderWerte, openCheckin } from './views/werte';
import { renderStrength } from './views/strength';
import {renderTrainingTemplates,openTemplatePicker,openSessionPrescriptionEditor} from './views/templates';
import { renderEssen } from './views/essen';
import { renderProfil } from './views/profil';
import { renderVerbindungen, handleOAuthReturn, loadConnections } from './views/verbindungen';
import { applyTheme, renderZonen, renderMitteilungen, renderDarstellung, renderCoachSet, renderEinheiten, renderSprache } from './views/einstellungen';
import { renderDaten, resetDatenCache, renderKonto, renderUeber, renderBetreiber } from './views/daten';
import { renderWettkampf } from './views/wettkampf';
import { renderBeruecksichtigungen, renderAusruestung } from './views/beruecksichtigungen';
import { focusFeedback } from './views/feedback';
import { takeInviteFromUrl, pendingInvite, inviteHtml, introStep, introHtml, maybeWhatsNew } from './views/intro';
import { renderFeedback } from './views/feedback';
import { renderOnboarding, renderWelcome } from './views/onboarding';
import './views/session';
import './views/custom';
import './views/planedit';
import { checkForUpdate, startPwa } from './pwa';
import { initErrorLog } from './errlog';
import { nav } from './nav';
import { initTabLens } from './tablens';
import { calibrateIfDue, planRulesOnStart } from './replan';
import { toast } from './toast';
import { APP, FEATURES, STORAGE } from './config';
import { isSyncOn, loadAiState, loadMe, entitled, onSynced, me, aiState } from './sync';
import { checkSwimSkill } from './testupdate';

initErrorLog();
const storageBanner = document.createElement('div');
storageBanner.id = 'storage-status'; storageBanner.setAttribute('role', 'status');
storageBanner.className = 'banner warn'; storageBanner.hidden = true; // Auftrag 26: versteckt starten, sonst erschien sie beim ersten Laden sofort
/* Auftrag 26: „Wird gespeichert“ erschien bei jedem Speichern für Sekundenbruchteile über dem Inhalt und schob ihn 46 px nach unten
   (Sprung beim Start). Jetzt erst, wenn das Speichern länger als 1,5 s dauert; Fehler und Sperre sofort. */
let pendingSince = 0, pendingTimer = 0;
const updateStorageBanner = () => {
  const st = storage.status;
  storageBanner.dataset.status = st; // für Tests und Hilfsmittel: genauer Speicherstand, auch während die Leiste noch wartet
  if (st === 'pending') {
    if (!pendingSince) { pendingSince = Date.now(); clearTimeout(pendingTimer); pendingTimer = window.setTimeout(updateStorageBanner, 1600); }
    if (Date.now() - pendingSince < 1500) { if (storageBanner.hidden) return; }
  } else { pendingSince = 0; clearTimeout(pendingTimer); }
  storageBanner.textContent = storageMessage(); storageBanner.hidden = st === 'saved';
  if (storage.status === 'error') {
    const button = document.createElement('button'); button.className = 'btn'; button.textContent = 'Backup exportieren';
    button.onclick = () => nav.go('daten'); storageBanner.appendChild(button);
  }
};
document.body.insertBefore(storageBanner, document.getElementById('app'));
const syncBanner = document.createElement('div'); syncBanner.id = 'global-sync-status'; syncBanner.className = 'banner warn'; syncBanner.hidden = true; syncBanner.setAttribute('role','status');
const syncLabel = document.createElement('span'); syncLabel.setAttribute('data-global-sync-label',''); syncBanner.appendChild(syncLabel); document.body.insertBefore(syncBanner, document.getElementById('app'));
storage.onChange = updateStorageBanner; updateStorageBanner();
let knownPlan = JSON.stringify(readPlan());
let otherTabRender = false;
const refreshFromOtherTab = async () => {
  try {
    await storage.refresh();
    if (refreshStoredState()) {
      const plan = readPlan(), raw = JSON.stringify(plan);
      if (plan && raw !== knownPlan) { knownPlan = raw; replacePlanInPlace(plan); }
      rebuildPlanIndex(); invalidate();
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) otherTabRender = true;
      else nav.rerender();
    }
  } catch (_) { storage.block('ec_state_v2'); }
};
window.addEventListener('storage', e => { if (e.key === STORAGE.state || e.key === STORAGE.plan) void refreshFromOtherTab(); });
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('stamio-storage');
  channel.onmessage = e => { if (e.data?.tab !== STORAGE_TAB) void refreshFromOtherTab(); };
}

document.addEventListener('focusout', () => { if (otherTabRender) { otherTabRender = false; setTimeout(() => nav.rerender(), 0); } });

type Tab = 'heute' | 'plan' | 'coach' | 'fortschritt' | 'mehr';
const TABS: { id: Tab; icon: string; render: () => string }[] = [
  { id: 'heute', icon: 'sun', render: renderHeute },
  { id: 'plan', icon: 'calendar', render: renderPlan },
  { id: 'coach', icon: 'chat', render: renderCoach },
  { id: 'fortschritt', icon: 'trend', render: renderFortschritt },
  { id: 'mehr', icon: 'grid', render: renderMehr }
];
const SUBS: Record<string, () => string> = {
  lexikon: renderLexikon, strength: renderStrength, vorlagen: renderTrainingTemplates, werte: renderWerte, essen: renderEssen, profil: renderProfil, verbindungen: renderVerbindungen,
  daten: renderDaten, konto: renderKonto, ueber: renderUeber, betreiber: renderBetreiber, zonen: renderZonen, ausruestung: renderAusruestung,
  mitteilungen: renderMitteilungen, darstellung: renderDarstellung, coachset: renderCoachSet, einheiten: renderEinheiten, sprache: renderSprache, wettkampf: renderWettkampf, onboarding: renderOnboarding, beruecksichtigungen: renderBeruecksichtigungen, feedback: renderFeedback
};
/* Unterseiten, die auch ohne Plan erreichbar sind (Start, Verbinden) */
const NO_PLAN_SUBS = new Set(['onboarding', 'daten', 'konto', 'ueber', 'verbindungen', 'feedback', 'lexikon']);
/* Auftrag 25: alte Namen (Links aus Mitteilungen, gespeicherter Zustand) führen auf die neue Seite; „einstellungen“ ist jetzt die Gruppe im Mehr-Tab */
const SUB_ALIAS: Record<string, string | null> = { einstellungen: null, settings: null, generator: null, notify: 'mitteilungen', ki: 'coachset' };

/* Alter UI-Zustand: view = heute|plan|werte|fortschritt|essen */
if (!UI.tab) {
  const v = UI.view;
  if (v === 'werte' || v === 'essen') { UI.tab = 'mehr'; UI.sub = v; } else UI.tab = TABS.some(x => x.id === v) ? v : 'heute';
}
if (!TABS.some(x => x.id === UI.tab)) UI.tab = 'heute';
if (UI.sub && UI.sub in SUB_ALIAS) UI.sub = SUB_ALIAS[UI.sub];
if (UI.sub && !SUBS[UI.sub]) UI.sub = null;

const byId = (id: string) => document.getElementById(id)!;
/* Auftrag 18: mit Sync erst nach dem ersten Abgleich automatisch am Plan ändern (Schwimm-Stufe, Kalibrierung) */
let autoReady = !isSyncOn();

function coachUnread(): number {
  const seen = UI.coachSeenAt || 0;
  return Object.values(STATE.coachMsgs || {}).filter((m: any) => m && m.from !== 'user' && (m.at || 0) > seen).length;
}

function renderTop() {
  const sub = UI.tab === 'mehr' || !HAS_PLAN ? UI.sub : null;
  const title = sub === 'vorlagen' ? 'Trainingsvorlagen' : sub ? t('sub.' + sub, { app: APP.name }) : HAS_PLAN ? t('tab.' + UI.tab) : APP.name;
  morph(byId('top'), sub
    ? `<button class="icon-btn" data-act="back" aria-label="${esc(t('common.back'))}">${ic('back')}</button><h1 class="top-title">${esc(title)}</h1><span style="width:40px"></span>`
    : `<h1 class="top-title"><img class="mark" src="icons/icon-192.png" alt="" aria-hidden="true" width="26" height="26">${esc(title)}</h1>${HAS_PLAN && UI.tab === 'heute' ? `<button class="icon-btn" data-act="checkin-open" aria-label="${esc(t('heute.enterValues'))}">${ic('heart')}</button>` : '<span style="width:40px"></span>'}`);
  document.title = sub || UI.tab !== 'heute' ? `${title} · ${APP.name}` : APP.name;
}
function renderTabs() {
  if (!HAS_PLAN) { morph(byId('tabs'), ''); return; }
  const unread = coachUnread();
  morph(byId('tabs'), TABS.map(x => `<button class="tab ${UI.tab === x.id ? 'on' : ''}" data-act="go-tab" data-tab="${x.id}" ${UI.tab === x.id ? 'aria-current="page"' : ''}>${ic(x.icon)}<span>${esc(t('tab.' + x.id))}</span>${x.id === 'coach' && unread && UI.tab !== 'coach' ? `<i class="dot" aria-label="${esc(t('tab.unread', { n: unread }))}">${unread > 9 ? '9+' : unread}</i>` : ''}</button>`).join(''));
}

let softInserted: Element[] | null = null;
function render() {
  // Auftrag 18: automatische Plan-Änderungen erst nach dem ersten Abgleich (sonst überschreibt ein alter Stand auf dem Gerät den neueren Plan vom Server)
  if (HAS_PLAN && autoReady && checkSwimSkill()) saveState();
  invalidate();
  for (const k in CHARTS) delete (CHARTS as any)[k];
  document.body.classList.toggle('no-plan', !HAS_PLAN);
  let html: string;
  if (!HAS_PLAN) html = UI.sub && NO_PLAN_SUBS.has(UI.sub) ? SUBS[UI.sub]() : pendingInvite() ? inviteHtml() : introStep() ? introHtml() : renderWelcome();
  else if (UI.tab === 'mehr' && UI.sub && SUBS[UI.sub]) html = SUBS[UI.sub]();
  else html = TABS.find(x => x.id === UI.tab)!.render();
  // Auftrag 26: gleiche Ansicht nur angleichen (kein Flackern, Bilder und offene Bereiche bleiben), neue Ansicht neu aufbauen
  const viewId = UI.sub && (UI.tab === 'mehr' || !HAS_PLAN) ? UI.sub : UI.tab;
  const app = byId('app'), cur = app.firstElementChild as HTMLElement | null;
  if (cur && app.childElementCount === 1 && cur.classList.contains('view') && cur.dataset.view === viewId) morph(cur, html, softInserted || undefined);
  else app.innerHTML = `<div class="view" data-view="${esc(viewId)}">${html}</div>`;
  document.getElementById('app-startup')?.setAttribute('hidden', '');
  if (HAS_PLAN && UI.tab === 'coach') { if (!UI.coachVisit) { UI.coachSeenPrev = UI.coachSeenAt || 0; UI.coachVisit = true; } UI.coachSeenAt = Date.now(); saveUi(); } else if (UI.coachVisit) { UI.coachVisit = false; saveUi(); }
  // Letzte Bildschirme (für „Fehler melden“)
  const here = UI.sub && (UI.tab === 'mehr' || !HAS_PLAN) ? UI.sub : (HAS_PLAN ? UI.tab : 'start');
  const trail: string[] = UI.trail || []; if (trail[trail.length - 1] !== here && here !== 'feedback') { UI.trail = [...trail, here].slice(-6); saveUi(); }
  if (HAS_PLAN && UI.tab === 'plan' && !UI.sub) centerWeekBar();
  renderTop(); renderTabs(); updateBadge();
  if (HAS_PLAN) initTabLens();
}
function go(target: string, scroll?: string | null) {
  let [a, b] = target.split(':');
  if (a in SUB_ALIAS && !b) { const to = SUB_ALIAS[a]; if (to) a = to; else { a = 'mehr'; } }
  // offene, nicht übernommene Änderungen (Auftrag 6): vor dem Verlassen nachfragen
  if (guardLeave(SUBS[a] && !b ? a : b && SUBS[b] ? b : a, () => go(target, scroll))) return;
  if (SUBS[a] && !b) { UI.tab = 'mehr'; UI.sub = a; }
  else { UI.tab = (TABS.some(x => x.id === a) ? a : 'heute') as Tab; UI.sub = b && SUBS[b] ? b : null; }
  if (UI.sub === 'daten' || UI.sub === 'konto' || UI.sub === 'betreiber') resetDatenCache();
  if (UI.tab === 'mehr' && !UI.sub) resetMehrSearch();
  if (UI.sub) pushSub(); else leaveSubHistory();
  saveUi(); render();
  if (scroll) { const el = document.getElementById(scroll); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); return; } }
  if (UI.tab === 'plan' && !UI.sub && UI.planDate) { scrollToPlanDay(); return; }
  if (UI.tab === 'coach' && !UI.sub) { scrollCoachBottom(); return; }
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
/* Auftrag 26: Aktualisierung aus dem Hintergrund – gebündelt (ein Neuzeichnen je Bild), nie mitten in einer Eingabe */
let refreshFrame = 0, refreshLater = false;
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
function refresh() {
  if (typing()) { refreshLater = true; return; }
  if (refreshFrame) return;
  refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; if (typing()) { refreshLater = true; return; } softRerender(); });
}
/* Neue Daten aus dem Hintergrund gleiten an ihren Platz (240 ms) statt zu springen: Bausteine, die sich verschieben, starten an ihrer
   alten Position (FLIP), neu eingefügte blenden ein. Mit „Bewegung reduzieren“ ohne Animation. */
function softRerender() {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const view = byId('app').firstElementChild as HTMLElement | null;
  const canAnimate = !reduce && !!view && typeof (view as any).animate === 'function';
  const level1 = canAnimate ? Array.from(view!.children) as HTMLElement[] : [];
  const tracked: [HTMLElement, HTMLElement | null, number][] = [];
  for (const a of level1) { tracked.push([a, null, a.getBoundingClientRect().top]); for (const b of Array.from(a.children).slice(0, 30) as HTMLElement[]) tracked.push([b, a, b.getBoundingClientRect().top]); }
  softInserted = [];
  const inserted = softInserted;
  try { rerender(); } finally { softInserted = null; }
  if (!canAnimate) return;
  const moved = new Map<HTMLElement, number>();
  for (const [el, , top] of tracked) if (el.isConnected) moved.set(el, top - el.getBoundingClientRect().top);
  for (const [el, parent] of tracked) {
    const dy = (moved.get(el) || 0) - (parent ? moved.get(parent) || 0 : 0);
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${Math.round(dy)}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  for (const el of inserted) if ((el as HTMLElement).animate) (el as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
}
document.addEventListener('focusout', () => { if (refreshLater) setTimeout(() => { if (!refreshLater || typing()) return; refreshLater = false; refresh(); }, 300); });
/* Auftrag 25: Zurück-Wischen (iPhone, App auf dem Homescreen) und Browser-Zurück. Eine Unterseite legt einen Verlaufseintrag an;
   Zurück schließt zuerst ein offenes Blatt, sonst geht es zur Liste „Mehr“. Höchstens ein Eintrag (2 Ebenen). */
let subPushed = false, skipPop = false;
function pushSub() { if (subPushed) return; try { history.pushState({ stamio: 'sub' }, ''); subPushed = true; } catch (e) { /* ohne Verlauf */ } }
window.addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return; }
  if (!subPushed) return;
  subPushed = false;
  if (sheetOpen()) { closeSheet(); if (UI.sub) pushSub(); return; }
  if (!UI.sub) return;
  if (guardLeave('mehr', () => { UI.sub = null; saveUi(); render(); window.scrollTo(0, 0); })) { pushSub(); return; }
  UI.sub = null; saveUi(); render(); window.scrollTo(0, 0);
});
function leaveSubHistory() { if (subPushed) { subPushed = false; skipPop = true; try { history.back(); } catch (e) { skipPop = false; } } }
nav.render = render; nav.rerender = rerender; nav.refresh = refresh; nav.go = go;

/* ---------- Aktionen ---------- */
on('go-tab', el => { if (sheetOpen()) closeSheet(); const tab = el.dataset.tab!; if (tab === UI.tab && !UI.sub) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } if (tab === 'plan') UI.planDate = null; go(tab); });
on('lex', el => { if (sheetOpen()) closeSheet(); setLexiconQuery(el.dataset.q || ''); go('lexikon'); });
on('go-sub', el => { if (sheetOpen()) closeSheet(); go(el.dataset.sub!); });
on('back', () => { if (guardLeave('mehr', () => ACTIONS.back(document.body, new Event('click') as any))) return; leaveSubHistory(); UI.sub = null; saveUi(); render(); window.scrollTo(0, 0); });
// Auftrag 27: Gesundheits-Knöpfe über den gemeinsamen Weg (views/coach.ts healthAction, shared/coach/ops): Phasen werden frisch aus STATE
// gesucht (nie aus dem Zwischenspeicher), alle laufenden Phasen enden, Rückgängig über Bestätigung und Coach-Nachricht.
on('ill-start', () => healthAction([{ op: 'illness-start', date: todayStr() }], t('ill.started')));
on('ill-end', () => healthAction([{ op: 'illness-end', date: addDays(todayStr(), -1) }], t('ill.ended')));
on('ill-reopen', () => healthAction([{ op: 'illness-reopen' }], t('ill.reopened')));
on('inj-end', () => healthAction([{ op: 'injury-end' }], t('inj.ended')));
on('reload', () => location.reload());

document.addEventListener('click', async e => {
  if (chartTap(e)) return;
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el) return;
  const fn = ACTIONS[el.dataset.act!];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  try { await fn(el, e); } catch (err: any) { toast(err && err.message ? err.message : String(err)); throw err; }
});
document.addEventListener('input', async e => {
  const el = e.target as HTMLElement, ds = el.dataset || {};
  const name = ds.ch || (ds.sm ? 'sess-metric' : ds.sf ? 'sess-field' : '');
  if (!name || !INPUT[name]) return;
  try { await INPUT[name](el, e); } catch (err: any) { toast(err?.message || String(err)); }
});

document.addEventListener('change', async e => {
  const el = e.target as HTMLElement;
  const ds = el.dataset || ({} as DOMStringMap);
  const name = ds.ch || (ds.sm ? 'sess-metric' : ds.sf ? 'sess-field' : '');
  if (!name || !CHANGE[name]) return;
  try { await CHANGE[name](el, e); } catch (err: any) { toast(err && err.message ? err.message : String(err)); throw err; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
let lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout((window as any).__rz); (window as any).__rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; rerender(); } }, 250); });

/* ---------- Links aus Mitteilungen und Rückkehr von Diensten ---------- */
/* ?go=heute|plan|coach|fortschritt|mehr|werte|essen (+ alte Werte) und &open=checkin|export|week|settings|verbindungen|wettkampf */
function openFromUrl(href: string) {
  let u: URL; try { u = new URL(href, location.href); } catch (e) { return; }
  // Einladung als Link (Auftrag 5 E3)
  if (takeInviteFromUrl(u)) { UI.sub = null; render(); try { history.replaceState(null, '', location.pathname); } catch (e) {} return; }
  const view = u.searchParams.get('go'), open = u.searchParams.get('open');
  if (!view && !open && !u.searchParams.get('verbunden') && !u.searchParams.get('fehler')) return;
  if (sheetOpen()) closeSheet();
  const map: Record<string, string> = { settings: 'einstellungen', verbindungen: 'verbindungen', wettkampf: 'wettkampf', daten: 'daten', profil: 'profil', onboarding: 'onboarding' };
  if (open && map[open]) go(map[open]);
  else if (open === 'export' || open === 'week') go('coach');
  else if (view) { if (view === 'feedback' && u.searchParams.get('fb')) focusFeedback(u.searchParams.get('fb')!); go(view); }
  if (open === 'checkin' && HAS_PLAN) openCheckin(todayStr());
  if (u.searchParams.get('verbunden') || u.searchParams.get('fehler')) { if (!(open && map[open])) go('verbindungen'); handleOAuthReturn(u); }
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') openFromUrl(e.data.url); });

function updateBadge() {
  if (!HAS_PLAN || !('setAppBadge' in navigator)) return;
  const day = findDay(todayStr());
  const n = day ? day.sessions.filter((s: any) => s.sport !== 'rest' && effStatus({ ...s, date: day.date }) === 'open').length : 0;
  ((n > 0 ? (navigator as any).setAppBadge(n) : (navigator as any).clearAppBadge()) as Promise<void>).catch(() => {});
}

/* ---------- Start ---------- */
try { const th = localStorage.getItem(STORAGE.theme); if (th) applyTheme(th); } catch (e) {}
// „Stunden bisher: weiß ich nicht“: nach 2 Wochen an die echten Daten anpassen (Auftrag 11)
// Auftrag 26: nach dem ersten Abgleich nur neu zeichnen, wenn eine Prüfung wirklich etwas geändert hat (vorher immer: ganzer Neuaufbau beim Start)
{ const cal = () => { try { return HAS_PLAN && calibrateIfDue(); } catch (e) { return false; /* nie den Start verhindern */ } };
  if (isSyncOn()) onSynced(() => {
    if (autoReady) return;
    autoReady = true;
    let changed = cal();
    try { if (HAS_PLAN && checkSwimSkill()) { saveState(); changed = true; } } catch (e) { /* nie den Start verhindern */ }
    if (changed) nav.refresh();
  });
  else if (cal()) rerender(); }
// Auftrag 15: nur gewählte Sportarten, gleiche Sportart nicht an zwei Tagen hintereinander. Mit Sync erst nach dem ersten Abgleich
// (sonst könnte ein alter Stand auf diesem Gerät den neueren Plan vom Server überschreiben).
{ let ran = false; const check = () => { if (ran) return; ran = true; try { if (HAS_PLAN && planRulesOnStart()) nav.refresh(); } catch (e) { /* nie den Start verhindern */ } };
  if (isSyncOn()) onSynced(check); else check(); }
try { performance.mark('stamio:render-start'); } catch (e) { /* alte Browser */ }
render();
try { performance.mark('stamio:first-render'); } catch (e) { /* alte Browser */ }
if (UI.sub) pushSub();
openFromUrl(location.href);
startPwa();
setTimeout(maybeWhatsNew, 400);
// Auftrag 26: Konto und KI-Stand im Hintergrund; neu gezeichnet wird nur, wenn sie sich geändert haben und die Ansicht sie zeigt
if (isSyncOn()) {
  const meBefore = JSON.stringify(me()), aiBefore = JSON.stringify(aiState());
  loadMe().then(() => { if (UI.tab === 'mehr' && JSON.stringify(me()) !== meBefore) nav.refresh(); });
  loadAiState().then(() => { if ((UI.tab === 'coach' || UI.sub === 'coachset') && JSON.stringify(aiState()) !== aiBefore) nav.refresh(); });
  loadConnections();
}
let renderedDay = todayStr();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && todayStr() !== renderedDay) { renderedDay = todayStr(); rerender(); } });
void checkForUpdate;

on('template-add',el=>openTemplatePicker({date:el.dataset.date||todayStr()}));
on('template-insert',el=>openTemplatePicker({date:el.dataset.date!,sessionId:el.dataset.sid!}));
on('template-edit',el=>openSessionPrescriptionEditor(el.dataset.sid!,el.dataset.date!));
