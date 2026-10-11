/* Einstieg: Rendern, Navigation, Klick- und Eingabe-Aktionen. */
import './styles.css';
import * as CoachCore from '../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, PLAN_KEY, findDay, readPlan, mergePlan, rebuildPlanIndex, saveState, saveSoon, saveUi } from './store';
import { $, todayStr, addDays, fmtDate, parseNum, paceToSec } from './util';
import { toast, armed } from './toast';
import { effStatus, ensureSess, activeIllness, returnPhase, forgottenSessions, upsertTrendPoint } from './domain';
import { CHECKIN_GROUPS } from './components';
import { CHARTS, chartTap } from './charts';
import { MEALS } from './nutrition';
import { buildExportText, buildWeekReport } from './exporttext';
import { backupText, parseBackupText, isBackup, isPlan, applyBackup, markBackedUp, shareBackupFile } from './backup';
import { adjustmentGroups, renderPlan } from './views/plan';
import { renderHeute } from './views/heute';
import { renderWerte } from './views/werte';
import { renderFortschritt } from './views/fortschritt';
import { renderEssen } from './views/essen';
import { renderHeader } from './views/header';
import { openSheet, closeSheet, renderSheet, renderWelcome } from './views/sheets';
import { syncOnSettingsOpen } from './sync';
import { checkForUpdate, startPwa } from './pwa';
import { initErrorLog } from './errlog';
import { nav } from './nav';
import { VS } from './viewstate';
import { STORAGE } from './config';

const byId = (id: string): any => document.getElementById(id);
initErrorLog();
const VIEWS = { heute: renderHeute, plan: renderPlan, werte: renderWerte, fortschritt: renderFortschritt, essen: renderEssen };
function render() {
  if (!HAS_PLAN) { renderWelcome(); renderHeader(); document.body.classList.add('no-plan'); return; }
  document.body.classList.remove('no-plan');
  if (!VIEWS[UI.view]) UI.view = 'heute';
  for (const k in CHARTS) delete CHARTS[k];
  VIEWS[UI.view]();
  renderHeader();
  updateBadge();
  document.querySelectorAll(".tab").forEach((b: any) => { const on = b.dataset.go === UI.view; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function go(view, scrollTarget?) {
  UI.view = view; saveUi(); render();
  if (scrollTarget) { const el = byId(scrollTarget); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); return; } }
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
nav.render = render; nav.rerender = rerender; nav.go = go;
function applyTheme(v) {
  if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(STORAGE.theme, v); } catch (e) {}
}

/* ================= Click actions ================= */
document.addEventListener('click', async e => {
  if (chartTap(e)) return;
  const navEl = (e.target as any).closest('[data-go]');
  if (navEl) { go(navEl.dataset.go); return; }
  const b = (e.target as any).closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const sEl = b.closest('[data-sid]');
  const cEl = b.closest('[data-cid]');
  const t = todayStr();
  switch (act) {
    case 'sess-toggle': {
      const st = ensureSess(sEl.dataset.sid); st.completed = !st.completed;
      if (st.completed) { st.skipped = false; if (!st.quality) st.quality = 'ok'; }
      saveState(); rerender(); if (st.completed) toast('Erledigt. Stark!'); break;
    }
    case 'sess-skip': {
      const st = ensureSess(sEl.dataset.sid); st.skipped = !st.skipped;
      if (st.skipped) st.completed = false; else st.skipReason = '';
      saveState(); rerender(); break;
    }
    case 'sess-quality': { const st = ensureSess(sEl.dataset.sid); st.quality = b.dataset.q; saveState(); rerender(); break; }
    case 'cust-quality': {
      const w = (STATE.customWorkouts[cEl.dataset.cdate] || []).find(x => x.id === cEl.dataset.cid); if (w) w.quality = b.dataset.q; saveState(); rerender(); break;
    }
    case 'cust-remove': {
      if (!armed(b, 'Wirklich entfernen?')) return;
      const d = cEl.dataset.cdate; STATE.customWorkouts[d] = (STATE.customWorkouts[d] || []).filter(x => x.id !== cEl.dataset.cid);
      saveState(); rerender(); toast('Einheit entfernt'); break;
    }
    case 'expand': {
      const p = b.previousElementSibling; if (!p) return; p.classList.toggle('clamp'); b.textContent = p.classList.contains('clamp') ? 'Mehr anzeigen' : 'Weniger anzeigen'; break;
    }
    case 'add-open': VS.ADD_OPEN = b.dataset.date; rerender(); { const f = $('#add-title'); if (f) f.focus(); } break;
    case 'add-cancel': VS.ADD_OPEN = null; rerender(); break;
    case 'add-save': {
      const date = b.dataset.date;
      const entry = { id: 'custom-' + date + '-' + Date.now(), sport: $('#add-sport').value, title: $('#add-title').value.trim() || 'Zusätzliche Einheit',
        description: $('#add-desc').value.trim(), plannedMinutes: parseNum($('#add-min').value), plannedKm: parseNum($('#add-km').value), quality: 'ok' };
      (STATE.customWorkouts[date] = STATE.customWorkouts[date] || []).push(entry);
      VS.ADD_OPEN = null; saveState(); rerender(); toast('Einheit hinzugefügt'); break;
    }
    case 'day-toggle': {
      const card = b.closest('.day'); const open = !card.classList.contains('open');
      card.classList.toggle('open', open); b.setAttribute('aria-expanded', open); STATE.openDays[card.dataset.date] = open; saveSoon(); break;
    }
    case 'strip-jump': {
      const d = b.dataset.date; const card = byId('day-' + d); if (!card) return;
      card.classList.add('open'); STATE.openDays[d] = true; saveSoon();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => window.scrollBy({ top: -76, behavior: 'smooth' }), 350); break;
    }
    case 'go-plan-day': {
      const d = b.dataset.date; const day = findDay(d); if (day) VS.PLAN_WEEK = day.weekIdx; STATE.openDays[d] = true; go('plan', 'day-' + d); break;
    }
    case 'missed-all': VS.SHOW_ALL_MISSED = !VS.SHOW_ALL_MISSED; rerender(); break;
    case 'missed-skip-all': {
      if (!armed(b, 'Alle markieren? Nochmal tippen')) return;
      const list = forgottenSessions(); list.forEach(s => { const st = ensureSess(s.id); st.skipped = true; st.completed = false; });
      saveState(); rerender(); toast(`${list.length} Einheiten als ausgefallen markiert`); break;
    }
    case 'week': VS.PLAN_WEEK = parseInt(b.dataset.i); VS.ADD_OPEN = null; rerender(); break;
    case 'adj-undo': {
      const g = adjustmentGroups().find(x => x.id === b.closest('[data-group]').dataset.group); if (!g) return;
      const undo = !g.items.every(a => a.undone);
      g.items.forEach(a => { STATE.adjustments[a.id] = Object.assign({}, a, { undone: undo }); });
      rebuildPlanIndex(); saveState(); rerender(); toast(undo ? 'Anpassung rückgängig gemacht' : 'Anpassung wieder angewendet'); break;
    }
    case 'score': STATE.scoreAdjust[b.dataset.sport] = (STATE.scoreAdjust[b.dataset.sport] || 0) + parseInt(b.dataset.dir); saveState(); rerender(); break;
    case 'perf': UI.perfSport = b.dataset.sport; saveUi(); rerender(); break;
    case 'vol': UI.volMode = b.dataset.mode; saveUi(); rerender(); break;
    case 'checkin-save': {
      const pre = b.dataset.prefix; const date = pre === 'h' ? t : ($('#w-date').value || t);
      const f: any = {}; CHECKIN_GROUPS.forEach(g => g.keys.forEach(([k]) => { const el = byId(pre + '-' + k); if (el) f[k] = parseNum(el.value); }));
      const il = byId(pre + '-illness'); f.illness = il && il.value.trim() ? il.value.trim() : null;
      upsertTrendPoint(date, f); saveState(); rerender(); toast(`Werte für ${fmtDate(date)} gespeichert`); break;
    }
    case 'ill-start': {
      STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: t, end: null, note: '' }); saveState(); rerender(); toast('Krankheitsphase gestartet. Gute Besserung!'); break;
    }
    case 'ill-end': {
      const ill = activeIllness(); if (!ill) return;
      let end = $('#ill-end').value || addDays(t, -1); if (end < ill.start) end = ill.start; if (end > t) end = t;
      ill.end = end; saveState(); rerender(); toast('Pause beendet. Jetzt langsam wieder einsteigen.'); break;
    }
    case 'ill-reopen': { const r = returnPhase(t); if (r) { r.period.end = null; saveState(); rerender(); toast('Krankheitsphase läuft wieder'); } break; }
    case 'ill-add': STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: t, end: t, note: '' }); saveState(); renderSheet(); render(); break;
    case 'ill-del': {
      if (!armed(b, 'Wirklich löschen?')) return;
      const id = b.closest('[data-ill]').dataset.ill; STATE.illnessPeriods = STATE.illnessPeriods.filter(p => p.id !== id); saveState(); renderSheet(); render(); break;
    }
    case 'ms-add': {
      const text = $('#ms-text').value.trim(); if (!text) { toast('Schreib kurz, was du geschafft hast.'); $('#ms-text').focus(); return; }
      STATE.milestones.push({ id: 'ms-' + Date.now(), date: $('#ms-date').value || t, text }); saveState(); rerender(); toast('Meilenstein gespeichert'); break;
    }
    case 'ms-del': {
      if (!armed(b, 'Löschen?')) return;
      const id = b.closest('[data-mid]').dataset.mid; STATE.milestones = STATE.milestones.filter(m => m.id !== id); saveState(); rerender(); break;
    }
    case 'go-essen': VS.NUT_DATE = t; go('essen'); break;
    case 'nut-save': {
      const date = VS.NUT_DATE || t; const prev = STATE.nutrition[date] || {};
      const v = id => { const n = parseNum($('#nut-' + id).value); return n == null || n < 0 ? null : n; };
      STATE.nutrition[date] = { ...prev, kcal: v('kcal'), carbs: v('carbs'), protein: v('protein'), fat: v('fat'), weight: v('weight'), typeOverride: prev.typeOverride || null };
      saveState(); rerender(); toast('Ernährung gespeichert'); break;
    }
    case 'nut-add': {
      const m = MEALS[b.dataset.cat][parseInt(b.dataset.i)]; const date = VS.NUT_DATE || t;
      const e0 = STATE.nutrition[date] = STATE.nutrition[date] || {};
      e0.kcal = (e0.kcal || 0) + m.k; e0.carbs = (e0.carbs || 0) + m.c; e0.protein = (e0.protein || 0) + m.pr; e0.fat = (e0.fat || 0) + m.f;
      saveState(); rerender(); toast(`${m.n}: +${m.k} kcal`); break;
    }
    case 'nut-settings': {
      const val = (id, lo, hi) => { const n = parseNum($(id).value); return n != null && n >= lo && n <= hi ? n : null; };
      const pr = STATE.nutritionProfile; const a = val('#np-age', 10, 60), h = val('#np-h', 120, 220), w = val('#np-w', 30, 150), p = val('#np-pal', 1.2, 2.0);
      if (a != null) pr.age = a; if (h != null) pr.heightCm = h; if (w != null) pr.weightKg = w; if (p != null) pr.pal = p;
      saveState(); rerender(); toast('Einstellungen gespeichert'); break;
    }
    case 'export-open': openSheet('export', b.dataset.date || t); break;
    case 'export-mode': VS.SHEET.mode = b.dataset.mode; VS.SHEET.arg = ($('#ex-date') || {}).value || VS.SHEET.arg; renderSheet(); break;
    case 'export-copy': {
      const ta = $('#ex-text');
      try { await navigator.clipboard.writeText(ta.value); toast('Kopiert. Jetzt im Chat einfügen.'); }
      catch (err) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Kopiert. Jetzt im Chat einfügen.'); } catch (e2) { toast('Text ist markiert. Bitte manuell kopieren.'); } }
      break;
    }
    case 'settings-open': openSheet("settings"); syncOnSettingsOpen(); break;
    case 'sheet-close': closeSheet(); break;
    case 'theme': applyTheme(b.dataset.v); renderSheet(); rerender(); break;
    case 'save-ready': {
      const R = STATE.settings.readiness; const a = parseNum($('#r-rhr').value), h = parseNum($('#r-hrv').value), tm = parseNum($('#r-temp').value);
      if (a != null) R.rhrMax = a; if (h != null) R.hrvMin = h; if (tm != null) R.tempMax = tm; saveState(); render(); toast('Grenzwerte gespeichert'); break;
    }
    case 'save-zones': {
      const S = STATE.settings; const lr = parseNum($('#z-lr').value), lb = parseNum($('#z-lb').value), tp = paceToSec($('#z-tp').value), ts = parseNum($('#z-ts').value);
      if (lr) S.lthrRun = lr; if (lb) S.lthrBike = lb; if (tp) S.thresholdPaceRunSec = tp; if (ts) S.thresholdSpeedBikeKmh = ts;
      saveState(); renderSheet(); render(); toast('Zonen gespeichert'); break;
    }
    case 'backup-copy': {
      const ta = $('#bk-out'); ta.value = backupText();
      try { await navigator.clipboard.writeText(ta.value); markBackedUp(); toast('Backup kopiert'); }
      catch (err) { ta.focus(); ta.select(); toast('Backup ist markiert. Bitte manuell kopieren.'); }
      break;
    }
    case 'backup-load': {
      const raw = $('#bk-in').value.trim(); if (!raw) { toast('Füge zuerst einen Backup-Text ein oder wähle eine Datei.'); return; }
      let data; try { data = parseBackupText(raw); } catch (err) { toast('Das ist kein gültiges Backup. Prüfe, ob der ganze Text kopiert wurde.'); return; }
      if (!armed(b, 'Alles ersetzen? Nochmal tippen')) return;
      if (!isBackup(data)) { toast('Das sieht nicht wie ein Backup aus.'); return; }
      if (applyBackup(data)) return;
      closeSheet(); render(); toast('Backup geladen'); break;
    }
    case 'welcome-load': {
      const raw = $('#bk-in').value.trim(); if (!raw) { toast('Füge zuerst den Backup-Text ein oder wähle eine Datei.'); return; }
      let data; try { data = parseBackupText(raw); } catch (err) { toast('Das ist kein gültiges Backup. Prüfe, ob der ganze Text kopiert wurde.'); return; }
      if (!isBackup(data)) { toast('Das sieht nicht wie ein Backup aus.'); return; }
      if (!isPlan(data.plan)) { toast('In diesem Backup fehlt der Trainingsplan. Kopiere es nochmal aus der aktuellen Version der alten App.'); return; }
      applyBackup(data); break;
    }
    case 'plan-load': {
      const raw = $('#pl-in').value.trim(); if (!raw) { toast('Füge zuerst den Plan-Code ein.'); return; }
      let obj; try { obj = parseBackupText(raw); } catch (err) { toast('Der Plan-Code ist unvollständig. Kopiere ihn nochmal ganz.'); return; }
      const upd = obj.plan && !obj.weeks ? obj.plan : obj;
      if (!isPlan(upd)) { toast('Das ist kein Plan-Code.'); return; }
      const next = mergePlan(readPlan() || Object.assign({}, PLAN, { weeks: BASE_WEEKS }), upd);
      try { localStorage.setItem(PLAN_KEY, JSON.stringify(next)); } catch (err) { toast('Speichern nicht möglich.'); return; }
      toast('Plan übernommen'); setTimeout(() => location.reload(), 600); break;
    }
    case 'backup-file': await shareBackupFile(rerender); break;
    case 'export-share': {
      try { await navigator.share({ text: $('#ex-text').value }); } catch (err) { if (err && err.name !== 'AbortError') toast('Teilen nicht möglich. Nutze Kopieren.'); }
      break;
    }
    case 'app-update': if (typeof checkForUpdate === 'function') checkForUpdate(true); break;
    case 'reload': location.reload(); break;
  }
});

/* ================= Autosave inputs ================= */
document.addEventListener('input', e => {
  const el = (e.target as any); const f = el.dataset.f;
  if (!f) return;
  if (f === 'weeknote') { STATE.weekNotes[el.dataset.week] = el.value; saveSoon(); return; }
  let o = null;
  const s = el.closest('[data-sid]'); const c = el.closest('[data-cid]');
  if (s) o = ensureSess(s.dataset.sid);
  else if (c) o = (STATE.customWorkouts[c.dataset.cdate] || []).find(w => w.id === c.dataset.cid);
  if (!o) return;
  if (f.startsWith('m.')) { o.metrics = o.metrics || {}; const k = f.slice(2); if (el.value === '') delete o.metrics[k]; else o.metrics[k] = el.value; }
  else o[f] = el.value;
  saveSoon();
});
document.addEventListener('change', e => {
  const el = (e.target as any);
  if (el.id === 'ex-date') { VS.SHEET.arg = el.value || todayStr(); $('#ex-text').value = VS.SHEET.mode === 'week' ? buildWeekReport(VS.SHEET.arg) : buildExportText(VS.SHEET.arg); return; }
  if (el.id === 'w-date') { VS.WERTE_DATE = el.value || todayStr(); rerender(); return; }
  if (el.id === 'nut-date') { VS.NUT_DATE = el.value || todayStr(); rerender(); return; }
  if (el.id === 'nut-type') {
    const d = VS.NUT_DATE || todayStr(); STATE.nutrition[d] = STATE.nutrition[d] || {}; STATE.nutrition[d].typeOverride = el.value === 'auto' ? null : el.value; saveState(); rerender(); return;
  }
  if (el.dataset.illf) {
    const p = STATE.illnessPeriods.find(x => x.id === el.closest('[data-ill]').dataset.ill); if (!p) return;
    p[el.dataset.illf] = el.value || (el.dataset.illf === 'end' ? null : (el.dataset.illf === 'note' ? '' : p.start));
    if (p.end && p.start && p.end < p.start) p.end = p.start;
    saveState(); render(); return;
  }
  if (el.id === 'bk-file') {
    const file = el.files && el.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => { $('#bk-in').value = String(r.result || ''); toast(HAS_PLAN ? 'Datei gelesen. Jetzt „Einfügen und laden“ tippen.' : 'Datei gelesen. Jetzt „Daten laden“ tippen.'); }; r.readAsText(file); return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && VS.SHEET) closeSheet(); });
let lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout((window as any).__rz); (window as any).__rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; rerender(); } }, 250); });
/* ================= Mitteilungen: Ziel öffnen, App-Icon-Badge ================= */
/* Links aus Mitteilungen: ?go=heute|plan|werte|fortschritt|essen und &open=checkin|export|week|settings */
function openFromUrl(href) {
  let u; try { u = new URL(href, location.href); } catch (e) { return; }
  const view = u.searchParams.get('go'), open = u.searchParams.get('open');
  if (!view && !open) return;
  if (!HAS_PLAN) return;
  if (VS.SHEET) closeSheet();
  if (view && VIEWS[view]) go(view, open === 'checkin' ? 'checkin' : null);
  if (open === 'checkin') { const f: any = document.querySelector("#checkin details"); if (f) f.open = true; }
  if (open === 'export' || open === 'week') { openSheet('export', todayStr()); if (open === 'week') { VS.SHEET.mode = 'week'; renderSheet(); } }
  if (open === 'settings') { openSheet("settings"); syncOnSettingsOpen(); }
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') openFromUrl(e.data.url); });
function updateBadge() {
  if (!HAS_PLAN || !('setAppBadge' in navigator)) return;
  const day = findDay(todayStr());
  const n = day ? day.sessions.filter(s => { const st = effStatus({ ...s, date: day.date }); return st === 'open'; }).length : 0;
  (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/* ================= Init ================= */
try { const th = localStorage.getItem(STORAGE.theme); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) {}
render();
openFromUrl(location.href);
startPwa();
// Datumswechsel um Mitternacht oder beim Zurückkehren in die App
let renderedDay = todayStr();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && todayStr() !== renderedDay) { renderedDay = todayStr(); VS.WERTE_DATE = null; VS.NUT_DATE = null; rerender(); } });
