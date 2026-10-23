/* Plan: Woche wählen, Tage mit Einheiten, Anpassungen mit Rückgängig. Hauptaktion: Einheit antippen. */
import { STATE, PLAN, UI, saveState, rebuildPlanIndex, currentWeekIdx, findDay, saveUi } from '../store';
import { esc, fmtDate, dowShort, dowLong, addDays, todayStr } from '../util';
import { t, num, hours } from '../../../shared/i18n';
import { on, sec, ic, pill, empty, more } from '../kit';
import { metaLine, statusIcon } from './session';
import { editBar, editing } from './planedit';
import { sportIc } from '../kit';
import { SPORT_COLOR, sportIcon } from '../icons';
import { shortPlan } from '../../../shared/workouts';
import { duration } from '../../../shared/i18n';
import { isHardSession } from '../../../shared/intensity';
import { dayStats, sessState, effStatus } from '../domain';
import { nav } from '../nav';
import { toast } from '../toast';
import { weekMinutes, weekVolume } from '../../../shared/rules';
import { renderTimeline } from './timeline';

export function adjustmentGroups() {
  const groups: Record<string, any> = {};
  Object.values(STATE.adjustments || {}).forEach((a: any) => {
    if (!a || !a.id) return;
    const g = a.group || a.id;
    (groups[g] = groups[g] || { id: g, items: [], createdAt: 0, date: a.date }).items.push(a);
    groups[g].createdAt = Math.max(groups[g].createdAt, a.createdAt || 0);
  });
  return Object.values(groups).sort((a: any, b: any) => b.createdAt - a.createdAt);
}

/* Auftrag 18, Punkt 3: Wochenleiste bleibt bei der gewählten Woche (mittig), öffnet bei der aktuellen Woche, Knopf „Heute“.
   Darunter eine Zeile zur Woche (Phase, Ziel, Stunden) und die 7 Tage als kurze Liste; Details beim Antippen der Einheit. */
const isTest = (s: any) => !!s && ((s.spec && s.spec.kind === 'test') || /(^|\s)(Lauftest|Radtest|Schwimmtest|Test)\b|Kraul-Check/.test(s.title || ''));
const liveS = (d: any) => (d.sessions || []).filter((s: any) => s.sport !== 'rest' && !s.removed && !s.cancelled);
function weekChip(x: any, i: number, sel: number, cw: number): string {
  const ss = x.days.flatMap(liveS);
  const test = ss.some(isTest), race = ss.some((s: any) => s.race);
  const sym = (x.isRecoveryWeek ? `<span class="wkc-s">${ic('moon')}</span>` : '') + (test ? `<span class="wkc-s">${ic('pulse')}</span>` : '') + (race ? `<span class="wkc-s race">${ic('flag')}</span>` : '');
  const lbl = [t('plan.weekShort', { n: x.weekNumber }), fmtDate(x.startDate), t('tl.' + (x.phase || 'base')), x.isRecoveryWeek ? t('plan.symRecovery') : '', test ? t('plan.symTest') : '', race ? t('plan.symRace') : ''].filter(Boolean).join(', ');
  return `<button class="wkc ${i === sel ? 'on' : ''} ${i === cw ? 'now' : ''}" data-act="plan-week" data-i="${i}" role="tab" aria-selected="${i === sel}" aria-label="${esc(lbl)}" title="${esc(lbl)}"><span class="wkc-t"><i class="wkc-dot tl-${esc(x.phase || 'base')}"></i>${esc(t('plan.weekShort', { n: x.weekNumber }))}</span><span class="wkc-d">${esc(shortDate(x.startDate))}</span><span class="wkc-sym">${sym}</span></button>`;
}
const shortDate = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.`;
function planRow(s: any): string {
  const st = sessState(s.id);
  const status = effStatus(s);
  const hard = isHardSession(s) && !s.race && s.sport !== 'football';
  const dur = s.plannedMinutes && !new RegExp('\\b' + s.plannedMinutes + ' min').test(s.title || '') ? duration(s.plannedMinutes) : '';
  const check = status === 'done' || status === 'open' || status === 'missed'
    ? `<button class="check sm ${st.completed ? 'on' : ''}" data-act="sess-toggle" data-sid="${esc(s.id)}" aria-pressed="${!!st.completed}" aria-label="${esc(st.completed ? t('sess.undone') : t('sess.done'))}">${ic('check')}</button>` : statusIcon(status);
  const badge = s._adj && s._adj.length ? ' ' + pill(s.movedFrom ? t('st.moved') : t('st.adjusted'), 'warn') : '';
  return `<div class="pr wo ${status === 'cancelled' ? 'cancelled' : ''}" style="--c:${SPORT_COLOR[s.sport] || 'var(--rest)'}"><button class="pr-b" data-act="sess-open" data-sid="${esc(s.id)}">${sportIc(s.sport)}<span class="pr-t"><span class="t">${esc(s.title)}</span>${hard ? ` <span class="pr-hard" role="img" aria-label="${esc(t('plan.hard'))}" title="${esc(t('plan.hard'))}">${ic('bolt')}</span>` : ''}${badge}</span>${dur ? `<span class="pr-m">${esc(dur)}</span>` : ''}</button><span class="wo-status">${check}</span></div>`;
}

export function renderPlan(): string {
  if (!PLAN.weeks.length) return empty(t('plan.none'));
  const today = todayStr();
  if (UI.planDate) { const d = findDay(UI.planDate); if (d) UI.planWeek = d.weekIdx; }
  if (UI.planWeek == null || !PLAN.weeks[UI.planWeek]) UI.planWeek = currentWeekIdx();
  const cw = currentWeekIdx();
  const w = PLAN.weeks[UI.planWeek];
  let done = 0, total = 0;
  w.days.forEach((d: any) => { const s = dayStats(d); done += s.done; total += s.total; });
  const explain: string[] = (PLAN.meta && PLAN.meta.explain) || [];
  // Umfang und Steigerung zur letzten Aufbauwoche (eigenes Training ohne Teamsport)
  const vol = weekVolume(PLAN.weeks, UI.planWeek);
  const volH = (Math.round(vol.min / 6) / 10).toString().replace('.', ',');
  const volTxt = vol.pct == null ? '' : t('plan.volumeVs', { h: volH, p: (vol.pct > 0 ? '+' : vol.pct < 0 ? '−' : '±') + Math.abs(vol.pct) });
  let h = renderTimeline(PLAN.meta && PLAN.meta.timeline, today, { from: w.startDate, to: w.endDate });
  h += explain.length ? `<div class="card plan-explain" style="margin-bottom:var(--s3)">${more(t('plan.explain'), explain.map(s => `<p class="small">${esc(s)}</p>`).join(''), false)}</div>` : '';
  // Wochenleiste: bleibt bei der gewählten Woche (centerWeekBar), „Heute“ springt zur aktuellen Woche
  h += `<div class="wkbar"><div class="wkbar-s" id="wkbar" role="tablist" aria-label="${esc(t('plan.weekBar'))}">${PLAN.weeks.map((x: any, i: number) => weekChip(x, i, UI.planWeek!, cw)).join('')}</div><button class="btn ghost sm wkbar-today" data-act="plan-today">${esc(t('plan.todayBtn'))}</button></div>`;
  const head = w.headline || [t('plan.weekShort', { n: w.weekNumber }), t('tl.' + (w.phase || 'base'))].join(' · ');
  h += `<div class="card wk-sum"><div class="spread wk-head"><div class="wk-l"><div class="lbl"><i class="wkc-dot tl-${esc(w.phase || 'base')}"></i>${fmtDate(w.startDate)} – ${fmtDate(w.endDate)}${w.isRecoveryWeek ? ' · ' + esc(t('plan.recovery')) : ''}</div><div class="week-head" data-week-head>${esc(head)}</div>${volTxt ? `<div class="xs muted" data-week-volume>${esc(volTxt)}</div>` : ''}</div>
    <div class="wk-r" data-week-count><div class="big">${done}/${total}</div><div class="xs muted">${esc(hours(vol.min / 60))}</div></div></div>
    ${w.important ? `<div class="hint" style="margin-top:6px"><b>${esc(t('plan.thisWeek'))}:</b> ${esc(w.important)}</div>` : ''}
    ${w.focus ? more(t('plan.weekMore'), `<p class="small">${esc(w.focus)}</p>`) : ''}</div>`;
  h += editBar(w);
  // Auftrag 19, Punkt 3 (Jonahs Wahl: C): Balken je Tag oben, darunter jeder Tag als Zeile, heute aufgeklappt
  h += weekMix(w, today);
  h += `<button class="btn ghost block" data-act="custom-add" data-date="${UI.planDate && w.days.some((d: any) => d.date === UI.planDate) ? UI.planDate : (w.days.some((d: any) => d.date === today) ? today : w.startDate)}" style="margin-top:var(--s3)">${ic('plus')} ${esc(t('plan.addExtra'))}</button>`;
  h += sec(t('plan.adjustments'), adjustmentsList(), t('plan.last30'));
  return h;
}
/* ---------- Auftrag 19, Punkt 3: Woche als Balken und aufklappbare Tage ---------- */
interface DayInfo { d: any; list: any[]; customs: any[]; rest: boolean; before: boolean; min: number; hard: boolean; race: boolean }
function dayInfo(d: any): DayInfo {
  const list = d.sessions.map((s: any) => ({ ...s, date: d.date })).filter((s: any) => s.sport !== 'rest' && !s.removed);
  const customs = (STATE.customWorkouts || {})[d.date] || [];
  const before = d.sessions.some((s: any) => s.sport === 'rest' && s.title === 'Vor dem Planstart');
  const live = list.filter((s: any) => !s.cancelled);
  return { d, list, customs, rest: !list.length && !customs.length, before, min: live.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0),
    hard: live.some((s: any) => isHardSession(s) && !s.race && s.sport !== 'football'), race: live.some((s: any) => s.race) };
}
function dayRows(x: DayInfo, today: string): string {
  const { d, list, customs } = x;
  return list.map((s: any) => editing() && d.date >= today && !s.race ? editRow(s) : planRow(s) + whatLine(s)).join('')
    + customs.map((c: any) => `<div class="pr"><button class="pr-b" data-act="custom-open" data-cid="${esc(c.id)}" data-date="${d.date}">${sportIc(c.sport || 'multi')}<span class="pr-t"><span class="t">${esc(c.title)}</span> ${pill(t('plan.extra'), 'accent')}</span>${c.metrics && c.metrics.min ? `<span class="pr-m">${esc(duration(+String(c.metrics.min).replace(',', '.') || 0))}</span>` : ''}</button></div>`).join('')
    + (d.moved || []).map((m: any) => `<div class="pr-x">${esc(t('plan.movedTo', { t: m.title, d: `${dowShort(m.to)} ${fmtDate(m.to)}` }))}</div>`).join('');
}
/* kurz, was man tun soll (aus dem Aufbau der Einheit; Teamsport und Wettkampf ohne) */
function whatLine(s: any): string {
  const w = s.spec && !s.race && !s.cancelled ? shortPlan(s.spec) : '';
  return w ? `<div class="pr-what" data-what>${esc(w)}</div>` : '';
}
const restRow = (x: DayInfo) => `<div class="pr pr-rest" data-rest-day><span class="ic" style="--c:var(--rest)">${ic('moon')}</span><span class="pr-t muted">${esc(x.before ? t('plan.beforeStart') : t('plan.restDay'))}</span></div>`;
/* aufgeklappter Tag: angetippt, sonst heute (in anderen Wochen keiner) */
function selDay(w: any, today: string): string | null {
  if (UI.planDate && w.days.some((d: any) => d.date === UI.planDate)) return UI.planDate;
  if (UI.planDate === '') return null;
  return w.days.some((d: any) => d.date === today) ? today : null;
}
const mins = (m: number) => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}′`;
/* C: Wochenüberblick (Balken je Tag) und aufklappbare Tage */
function weekMix(w: any, today: string): string {
  const sel = selDay(w, today);
  const infos = w.days.map(dayInfo);
  const max = Math.max(60, ...infos.map((x: DayInfo) => x.min));
  const bars = infos.map((x: DayInfo) => {
    const segs = x.list.filter((s: any) => !s.cancelled).map((s: any) => `<i style="height:${((s.plannedMinutes || 0) / max * 100).toFixed(1)}%;background:${SPORT_COLOR[s.sport] || 'var(--rest)'}"></i>`).join('');
    return `<button class="pm-c ${x.d.date === today ? 'today' : ''} ${x.d.date === sel ? 'on' : ''}" data-act="plan-pick" data-date="${x.d.date}" aria-label="${esc(dowLong(x.d.date) + ' ' + fmtDate(x.d.date))}"><span class="pm-b">${x.rest ? `<span class="pm-rest">${ic('moon')}</span>` : segs}</span>${x.hard ? `<span class="pm-hard">${ic('bolt')}</span>` : ''}<span class="pm-l">${esc(dowShort(x.d.date).slice(0, 2))}</span></button>`;
  }).join('');
  const days = infos.map((x: DayInfo) => {
    const open = x.d.date === sel;
    const sum = x.rest ? `<span class="muted">${esc(x.before ? t('plan.beforeStart') : t('plan.restDay'))}</span>`
      : x.list.map((s: any) => `<span class="pm-si" style="--c:${SPORT_COLOR[s.sport] || 'var(--rest)'}">${sportIcon(s.sport)}</span>`).join('') + `<span class="pm-st">${esc(shortTitles(x))}</span>`;
    return `<div class="cday ${x.d.date === today ? 'today' : ''} ${open ? 'open' : ''} ${x.rest ? 'rest' : ''}" id="day-${x.d.date}" data-day="${x.d.date}">
      <button class="cday-h" data-act="plan-pick" data-date="${x.d.date}" aria-expanded="${open}"><span class="cday-d"><b>${esc(dowShort(x.d.date))}</b> ${esc(shortDate(x.d.date))}</span><span class="cday-s">${sum}</span><span class="cday-m">${x.min ? esc(mins(x.min)) : ''}${x.hard ? `<i class="pg-hard">${ic('bolt')}</i>` : ''}</span><span class="chev">${ic('down')}</span></button>
      ${open ? `<div class="cday-b">${x.rest ? restRow(x) : ''}${dayRows(x, today)}</div>` : ''}</div>`;
  }).join('');
  return `<div class="card pmix" data-plan-mix><div class="pm-bars">${bars}</div></div><div class="list cdays">${days}</div>`;
}
/* kurze Namen für die eingeklappte Zeile: „Lauf · Rad“ */
function shortTitles(x: DayInfo): string {
  const nm: Record<string, string> = { run: t('sport.run'), bike: t('sport.bike'), swim: t('sport.swim'), strength: t('sport.strength'), football: t('sport.football') };
  return x.list.map((s: any) => s.race ? s.title : (nm[s.sport] || s.title)).join(' · ');
}

/* gewählte Woche in der Leiste mittig halten, ohne die Seite zu bewegen */
export function centerWeekBar(): void {
  const bar = document.getElementById('wkbar'); if (!bar) return;
  const on = bar.querySelector('.wkc.on') as HTMLElement | null; if (!on) return;
  bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
}

function editRow(s: any): string {
  return `<button class="li ${s.locked ? 'locked' : ''}" data-act="sess-edit" data-sid="${esc(s.id)}">${sportIc(s.sport)}<span class="grow"><span class="t">${esc(s.title)}</span><br><span class="s">${esc(metaLine(s))}</span></span><span class="pill">${esc(t('edit.short'))}</span></button>`;
}
function adjustmentsList(): string {
  const from = addDays(todayStr(), -30);
  const groups = adjustmentGroups().filter((g: any) => !g.date || g.date >= from);
  if (!groups.length) return `<div class="card">${empty(t('plan.noAdj'))}</div>`;
  return `<div class="list">${groups.slice(0, 15).map((g: any) => {
    const undone = g.items.every((a: any) => a.undone);
    const note = g.items.find((a: any) => a.type === 'note');
    const changes = g.items.filter((a: any) => a.type !== 'note');
    const reason = (note && note.reason) || (changes[0] && changes[0].reason) || '';
    return `<div class="li" data-group="${esc(g.id)}" style="align-items:flex-start"><span class="grow"><span class="lbl">${g.date ? dowShort(g.date) + ' ' + fmtDate(g.date) : ''} ${changes.some((a: any) => a.from_ai) ? '· KI' : ''}</span><br>
      ${note ? `<span class="t">${esc(note.what)}</span><br>` : ''}${changes.slice(0, 4).map((a: any) => `<span class="${undone ? 'muted' : ''}" style="${undone ? 'text-decoration:line-through' : ''}">${esc(a.what || '')}</span>`).join('<br>')}${changes.length > 4 ? `<br><span class="s">+${changes.length - 4}</span>` : ''}
      <br><span class="s">${esc(t('adj.why'))}: ${esc(reason)}</span></span>${changes.length ? `<button class="btn ghost sm" data-act="adj-undo">${esc(undone ? t('plan.redo') : t('plan.undo'))}</button>` : ''}</div>`;
  }).join('')}</div>`;
}

// Tag antippen klappt ihn auf, nochmal antippen klappt zu
on('plan-pick', el => { const d = el.dataset.date!; UI.planDate = UI.planDate === d ? '' : d; saveUi(); nav.rerender(); });
on('plan-week', el => { UI.planWeek = +el.dataset.i!; UI.planDate = null; saveUi(); nav.rerender(); });
on('plan-today', () => { UI.planWeek = currentWeekIdx(); UI.planDate = todayStr(); saveUi(); nav.rerender(); scrollToPlanDay(); });
on('adj-undo', el => {
  const id = (el.closest('[data-group]') as HTMLElement).dataset.group;
  const g: any = adjustmentGroups().find((x: any) => x.id === id); if (!g) return;
  const undo = !g.items.every((a: any) => a.undone);
  g.items.forEach((a: any) => { STATE.adjustments[a.id] = { ...a, undone: undo }; });
  rebuildPlanIndex(); saveState(); nav.rerender(); toast(undo ? t('plan.undone') : t('plan.redone'));
});
export function scrollToPlanDay() {
  if (!UI.planDate) return;
  const el = document.getElementById('day-' + UI.planDate);
  if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }
}
void num; void more; void dowLong; void weekMinutes;
