/* Einstieg: Tabs (Heute, Plan, Coach, Fortschritt, Mehr), Unterseiten unter „Mehr“, Aktionen, Deep Links. */
import './styles.css';
import { STATE, UI, HAS_PLAN, findDay, saveState, saveUi } from './store';
import { esc, todayStr, addDays } from './util';
import { t } from '../../shared/i18n';
import { ACTIONS, CHANGE, on, ic, closeSheet, sheetOpen } from './kit';
import { CHARTS, chartTap } from './charts';
import { effStatus } from './domain';
import { D, invalidate } from './data';
import './sync';
import { renderHeute } from './views/heute';
import { renderPlan, scrollToPlanDay } from './views/plan';
import { renderCoach, scrollCoachBottom } from './views/coach';
import { renderFortschritt } from './views/fortschritt';
import { renderMehr } from './views/mehr';
import { renderWerte, openCheckin } from './views/werte';
import { renderEssen } from './views/essen';
import { renderProfil } from './views/profil';
import { renderVerbindungen, handleOAuthReturn, loadConnections } from './views/verbindungen';
import { renderEinstellungen, applyTheme } from './views/einstellungen';
import { renderDaten, resetDatenCache } from './views/daten';
import { renderGenerator } from './views/generator';
import { renderWettkampf } from './views/wettkampf';
import { renderBeruecksichtigungen } from './views/beruecksichtigungen';
import { renderFeedback } from './views/feedback';
import { renderOnboarding, renderWelcome } from './views/onboarding';
import './views/session';
import './views/custom';
import './views/planedit';
import { checkForUpdate, startPwa } from './pwa';
import { initErrorLog } from './errlog';
import { nav } from './nav';
import { toast } from './toast';
import { APP, FEATURES, STORAGE } from './config';
import { isSyncOn, loadAiState, loadMe, entitled } from './sync';
export const canGenerate = () => FEATURES.generator || entitled('generator');

initErrorLog();

type Tab = 'heute' | 'plan' | 'coach' | 'fortschritt' | 'mehr';
const TABS: { id: Tab; icon: string; render: () => string }[] = [
  { id: 'heute', icon: 'sun', render: renderHeute },
  { id: 'plan', icon: 'calendar', render: renderPlan },
  { id: 'coach', icon: 'chat', render: renderCoach },
  { id: 'fortschritt', icon: 'trend', render: renderFortschritt },
  { id: 'mehr', icon: 'grid', render: renderMehr }
];
const SUBS: Record<string, () => string> = {
  werte: renderWerte, essen: renderEssen, profil: renderProfil, verbindungen: renderVerbindungen, einstellungen: renderEinstellungen,
  daten: renderDaten, wettkampf: renderWettkampf, onboarding: renderOnboarding, beruecksichtigungen: renderBeruecksichtigungen, feedback: renderFeedback, generator: () => canGenerate() ? renderGenerator() : renderMehr()
};
/* Unterseiten, die auch ohne Plan erreichbar sind (Start, Verbinden) */
const NO_PLAN_SUBS = new Set(['onboarding', 'daten', 'verbindungen', 'feedback']);

/* Alter UI-Zustand: view = heute|plan|werte|fortschritt|essen */
if (!UI.tab) {
  const v = UI.view;
  if (v === 'werte' || v === 'essen') { UI.tab = 'mehr'; UI.sub = v; } else UI.tab = TABS.some(x => x.id === v) ? v : 'heute';
}
if (!TABS.some(x => x.id === UI.tab)) UI.tab = 'heute';
if (UI.sub && !SUBS[UI.sub]) UI.sub = null;

const byId = (id: string) => document.getElementById(id)!;

function coachUnread(): number {
  const seen = UI.coachSeenAt || 0;
  return Object.values(STATE.coachMsgs || {}).filter((m: any) => m && m.from !== 'user' && (m.at || 0) > seen).length;
}

function renderTop() {
  const sub = UI.tab === 'mehr' || !HAS_PLAN ? UI.sub : null;
  const title = sub ? t('sub.' + sub) : HAS_PLAN ? t('tab.' + UI.tab) : APP.name;
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
  invalidate();
  for (const k in CHARTS) delete (CHARTS as any)[k];
  document.body.classList.toggle('no-plan', !HAS_PLAN);
  let html: string;
  if (!HAS_PLAN) html = UI.sub && NO_PLAN_SUBS.has(UI.sub) ? SUBS[UI.sub]() : renderWelcome();
  else if (UI.tab === 'mehr' && UI.sub && SUBS[UI.sub]) html = SUBS[UI.sub]();
  else html = TABS.find(x => x.id === UI.tab)!.render();
  byId('app').innerHTML = `<div class="view" data-view="${esc(UI.sub && (UI.tab === 'mehr' || !HAS_PLAN) ? UI.sub : UI.tab)}">${html}</div>`;
  if (HAS_PLAN && UI.tab === 'coach') { UI.coachSeenAt = Date.now(); saveUi(); }
  // Letzte Bildschirme (für „Fehler melden“)
  const here = UI.sub && (UI.tab === 'mehr' || !HAS_PLAN) ? UI.sub : (HAS_PLAN ? UI.tab : 'start');
  const trail: string[] = UI.trail || []; if (trail[trail.length - 1] !== here && here !== 'feedback') { UI.trail = [...trail, here].slice(-6); saveUi(); }
  renderTop(); renderTabs(); updateBadge();
}
function go(target: string, scroll?: string | null) {
  const [a, b] = target.split(':');
  if (SUBS[a] && !b) { UI.tab = 'mehr'; UI.sub = a; }
  else { UI.tab = (TABS.some(x => x.id === a) ? a : 'heute') as Tab; UI.sub = b && SUBS[b] ? b : null; }
  if (UI.sub === 'daten') resetDatenCache();
  saveUi(); render();
  if (scroll) { const el = document.getElementById(scroll); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); return; } }
  if (UI.tab === 'plan' && !UI.sub && UI.planDate) { scrollToPlanDay(); return; }
  if (UI.tab === 'coach' && !UI.sub) { scrollCoachBottom(); return; }
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
nav.render = render; nav.rerender = rerender; nav.go = go;

/* ---------- Aktionen ---------- */
on('go-tab', el => { if (sheetOpen()) closeSheet(); const tab = el.dataset.tab!; if (tab === UI.tab && !UI.sub) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } if (tab === 'plan') UI.planDate = null; go(tab); });
on('go-sub', el => { if (sheetOpen()) closeSheet(); go(el.dataset.sub!); });
on('back', () => { UI.sub = null; saveUi(); render(); window.scrollTo(0, 0); });
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
  const view = u.searchParams.get('go'), open = u.searchParams.get('open');
  if (!view && !open && !u.searchParams.get('verbunden') && !u.searchParams.get('fehler')) return;
  if (sheetOpen()) closeSheet();
  const map: Record<string, string> = { settings: 'einstellungen', verbindungen: 'verbindungen', wettkampf: 'wettkampf', daten: 'daten', profil: 'profil', onboarding: 'onboarding' };
  if (open && map[open]) go(map[open]);
  else if (open === 'export' || open === 'week') go('coach');
  else if (view) go(view);
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
render();
openFromUrl(location.href);
startPwa();
if (isSyncOn()) { loadMe().then(() => { if (UI.tab === 'mehr') rerender(); }); loadAiState().then(() => { if (UI.tab === 'coach' || UI.sub === 'einstellungen') rerender(); }); loadConnections(); }
let renderedDay = todayStr();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && todayStr() !== renderedDay) { renderedDay = todayStr(); rerender(); } });
void checkForUpdate;
