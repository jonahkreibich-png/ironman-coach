import { storage, storageMessage, STORAGE_TAB } from './persistence';
import { storage as localStorage } from "./persistence";
/* Einstieg: Tabs (Heute, Plan, Coach, Fortschritt, Mehr), Unterseiten unter „Mehr“, Aktionen, Deep Links. */
import { guardLeave } from './staged';
import './styles.css';
import './design.css';
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
import { renderCoach, scrollCoachBottom } from './views/coach';
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
import { renderGenerator } from './views/generator';
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
import { isSyncOn, loadAiState, loadMe, entitled, onSynced } from './sync';
import { checkSwimSkill } from './testupdate';
export const canGenerate = () => FEATURES.generator || entitled('generator');

initErrorLog();
const storageBanner = document.createElement('div');
storageBanner.id = 'storage-status'; storageBanner.setAttribute('role', 'status');
storageBanner.className = 'banner warn';
const updateStorageBanner = () => {
  storageBanner.textContent = storageMessage(); storageBanner.hidden = storage.status === 'saved';
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
  mitteilungen: renderMitteilungen, darstellung: renderDarstellung, coachset: renderCoachSet, einheiten: renderEinheiten, sprache: renderSprache, wettkampf: renderWettkampf, onboarding: renderOnboarding, beruecksichtigungen: renderBeruecksichtigungen, feedback: renderFeedback, generator: () => canGenerate() ? renderGenerator() : renderMehr()
};
/* Unterseiten, die auch ohne Plan erreichbar sind (Start, Verbinden) */
const NO_PLAN_SUBS = new Set(['onboarding', 'daten', 'konto', 'ueber', 'verbindungen', 'feedback', 'lexikon']);
/* Auftrag 25: alte Namen (Links aus Mitteilungen, gespeicherter Zustand) führen auf die neue Seite; „einstellungen“ ist jetzt die Gruppe im Mehr-Tab */
const SUB_ALIAS: Record<string, string | null> = { einstellungen: null, settings: null, notify: 'mitteilungen', ki: 'coachset' };

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
  byId('top').innerHTML = sub
    ? `<button class="icon-btn" data-act="back" aria-label="${esc(t('common.back'))}">${ic('back')}</button><h1 class="top-title">${esc(title)}</h1><span style="width:40px"></span>`
    : `<h1 class="top-title"><span class="mark" aria-hidden="true">${esc(APP.mark)}</span>${esc(title)}</h1>${HAS_PLAN && UI.tab === 'heute' ? `<button class="icon-btn" data-act="checkin-open" aria-label="${esc(t('heute.enterValues'))}">${ic('heart')}</button>` : '<span style="width:40px"></span>'}`;
  document.title = sub || UI.tab !== 'heute' ? `${title} · ${APP.name}` : APP.name;
}
function renderTabs() {
  if (!HAS_PLAN) { byId('tabs').innerHTML = ''; return; }
  const unread = coachUnread();
  byId('tabs').innerHTML = TABS.map(x => `<button class="tab ${UI.tab === x.id ? 'on' : ''}" data-act="go-tab" data-tab="${x.id}" ${UI.tab === x.id ? 'aria-current="page"' : ''}>${ic(x.icon)}<span>${esc(t('tab.' + x.id))}</span>${x.id === 'coach' && unread && UI.tab !== 'coach' ? `<i class="dot" aria-label="${esc(t('tab.unread', { n: unread }))}">${unread > 9 ? '9+' : unread}</i>` : ''}</button>`).join('');
}

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
  byId('app').innerHTML = `<div class="view" data-view="${esc(UI.sub && (UI.tab === 'mehr' || !HAS_PLAN) ? UI.sub : UI.tab)}">${html}</div>`;
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
nav.render = render; nav.rerender = rerender; nav.go = go;

/* ---------- Aktionen ---------- */
on('go-tab', el => { if (sheetOpen()) closeSheet(); const tab = el.dataset.tab!; if (tab === UI.tab && !UI.sub) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } if (tab === 'plan') UI.planDate = null; go(tab); });
on('lex', el => { if (sheetOpen()) closeSheet(); setLexiconQuery(el.dataset.q || ''); go('lexikon'); });
on('go-sub', el => { if (sheetOpen()) closeSheet(); go(el.dataset.sub!); });
on('back', () => { if (guardLeave('mehr', () => ACTIONS.back(document.body, new Event('click') as any))) return; leaveSubHistory(); UI.sub = null; saveUi(); render(); window.scrollTo(0, 0); });
on('ill-start', () => { STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: todayStr(), end: null, note: '' }); saveState(); rerender(); toast(t('ill.started')); });
on('ill-end', () => {
  const ill = D().ill; if (!ill) return; const t0 = todayStr();
  // Am selben Tag begonnen und beendet: war ein Versehen, Phase entfernen. Sonst endet sie gestern, heute beginnt der Wiedereinstieg.
  if (ill.start >= t0) STATE.illnessPeriods = STATE.illnessPeriods.filter((p: any) => p !== ill); else ill.end = addDays(t0, -1);
  saveState(); rerender(); toast(t('ill.ended'));
});
on('ill-reopen', () => { const r = D().ret; if (r) { r.period.end = null; saveState(); rerender(); toast(t('ill.reopened')); } });
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
{ const cal = () => { try { if (HAS_PLAN && calibrateIfDue()) rerender(); } catch (e) { /* nie den Start verhindern */ } };
  if (isSyncOn()) onSynced(() => { if (!autoReady) { autoReady = true; cal(); rerender(); } }); else cal(); }
// Auftrag 15: nur gewählte Sportarten, gleiche Sportart nicht an zwei Tagen hintereinander. Mit Sync erst nach dem ersten Abgleich
// (sonst könnte ein alter Stand auf diesem Gerät den neueren Plan vom Server überschreiben).
{ let ran = false; const check = () => { if (ran) return; ran = true; try { if (HAS_PLAN && planRulesOnStart()) rerender(); } catch (e) { /* nie den Start verhindern */ } };
  if (isSyncOn()) onSynced(check); else check(); }
render();
if (UI.sub) pushSub();
openFromUrl(location.href);
startPwa();
setTimeout(maybeWhatsNew, 400);
if (isSyncOn()) { loadMe().then(() => { if (UI.tab === 'mehr') rerender(); }); loadAiState().then(() => { if (UI.tab === 'coach' || UI.sub === 'coachset') rerender(); }); loadConnections(); }
let renderedDay = todayStr();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && todayStr() !== renderedDay) { renderedDay = todayStr(); rerender(); } });
void checkForUpdate;

on('template-add',el=>openTemplatePicker({date:el.dataset.date||todayStr()}));
on('template-insert',el=>openTemplatePicker({date:el.dataset.date!,sessionId:el.dataset.sid!}));
on('template-edit',el=>openSessionPrescriptionEditor(el.dataset.sid!,el.dataset.date!));
