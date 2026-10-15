/* Plan: Woche wählen, Tage mit Einheiten, Anpassungen mit Rückgängig. Hauptaktion: Einheit antippen. */
import { STATE, PLAN, UI, saveState, rebuildPlanIndex, currentWeekIdx, findDay, saveUi } from '../store';
import { esc, fmtDate, dowShort, dowLong, addDays, todayStr } from '../util';
import { t, num, hours } from '../../../shared/i18n';
import { on, sec, ic, pill, empty, more } from '../kit';
import { sessionRow, metaLine } from './session';
import { editBar, editing } from './planedit';
import { sportIc } from '../kit';
import { dayStats, sessState } from '../domain';
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
  // Prozent zur letzten Aufbauwoche: eigene kleine Zeile links (rechts bleibt kurz „3/11 · 6,8 h“)
  const volTxt = vol.pct == null ? '' : t('plan.volumeVs', { h: volH, p: (vol.pct > 0 ? '+' : vol.pct < 0 ? '−' : '±') + Math.abs(vol.pct) });
  let h = renderTimeline(PLAN.meta && PLAN.meta.timeline, today);
  h += explain.length ? `<div class="card plan-explain" style="margin-bottom:var(--s3)">${more(t('plan.explain'), explain.map(s => `<p class="small">${esc(s)}</p>`).join(''), false)}</div>` : '';
  h += `<div class="chips" role="tablist">${PLAN.weeks.map((x: any, i: number) => `<button class="chip ${i === UI.planWeek ? 'on' : ''}" data-act="plan-week" data-i="${i}" role="tab" aria-selected="${i === UI.planWeek}">${esc(t('plan.weekShort', { n: x.weekNumber }))}${i === cw ? ' ●' : ''}</button>`).join('')}</div>
    <div class="card" style="margin-top:var(--s3)"><div class="spread wk-head"><div class="wk-l"><div class="lbl">${fmtDate(w.startDate)} – ${fmtDate(w.endDate)}${w.isRecoveryWeek ? ' · ' + esc(t('plan.recovery')) : ''}</div>${w.headline ? `<div class="week-head" data-week-head>${esc(w.headline)}</div>` : ''}<div class="t" style="font-weight:${w.headline ? 400 : 600}">${esc(w.focus || '')}</div>${volTxt ? `<div class="xs muted" data-week-volume>${esc(volTxt)}</div>` : ''}${w.important ? `<div class="hint" style="margin-top:4px"><b>${esc(t('plan.thisWeek'))}:</b> ${esc(w.important)}</div>` : ''}</div>
      <div class="wk-r" data-week-count><div class="big">${done}/${total}</div><div class="xs muted">${esc(hours(vol.min / 60))}</div></div></div></div>`;
  h += editBar(w);
  for (const d of w.days) {
    const isToday = d.date === today;
    const list = d.sessions.map((s: any) => ({ ...s, date: d.date }));
    const customs = (STATE.customWorkouts || {})[d.date] || [];
    h += `<div class="day-h ${isToday ? 'today' : ''}" id="day-${d.date}"><b>${esc(dowLong(d.date))}</b><span>${fmtDate(d.date)}${isToday ? ' · ' + esc(t('common.today')) : ''}</span></div>
      <div class="list">${list.filter((s: any) => s.sport !== 'rest' && !s.removed).map((s: any) => editing() && d.date >= today && !s.race ? editRow(s) : sessionRow(s)).join('') || `<div class="li"><span class="ic" style="--c:var(--rest)">${ic('moon')}</span><span class="t muted">${esc(list.some((s: any) => s.sport === 'rest' && s.title === 'Vor dem Planstart') ? t('plan.beforeStart') : t('heute.restDay'))}</span></div>`}
      ${(d.moved || []).map((m: any) => `<div class="li"><span class="s">${esc(t('plan.movedTo', { t: m.title, d: `${dowShort(m.to)} ${fmtDate(m.to)}` }))}</span></div>`).join('')}
      ${customs.map((c: any) => `<button class="li" data-act="custom-open" data-cid="${esc(c.id)}" data-date="${d.date}"><span class="grow"><span class="t">${esc(c.title)}</span> ${pill(t('plan.extra'), 'accent')}<br><span class="s">${esc([c.metrics && c.metrics.min ? c.metrics.min + ' min' : c.plannedMinutes ? c.plannedMinutes + ' min' : '', c.metrics && c.metrics.km ? c.metrics.km + ' km' : ''].filter(Boolean).join(' · '))}</span></span></button>`).join('')}</div>`;
  }
  h += `<button class="btn ghost block" data-act="custom-add" data-date="${UI.planDate && w.days.some((d: any) => d.date === UI.planDate) ? UI.planDate : (w.days.some((d: any) => d.date === today) ? today : w.startDate)}" style="margin-top:var(--s3)">${ic('plus')} ${esc(t('plan.addExtra'))}</button>`;
  h += sec(t('plan.adjustments'), adjustmentsList(), t('plan.last30'));
  return h;
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

on('plan-week', el => { UI.planWeek = +el.dataset.i!; UI.planDate = null; saveUi(); nav.rerender(); });
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
void num; void more; void sessState;
