/* Zeitleiste oben im Plan (Auftrag 9): Phasen und Ziele bis zum Hauptziel, damit man sieht, wo man gerade steht.
   Ziele mit Platzhalter-Termin sind gestrichelt und als „Platzhalter“ markiert. */
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { more } from '../kit';

const DAY = 86400000;
const ms = (d: string) => +new Date(d + 'T12:00:00Z');
const dm = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.${d.slice(2, 4)}`;

export function renderTimeline(tl: any, today: string, sel?: { from: string; to: string }): string {
  if (!tl || !Array.isArray(tl.segments) || !tl.segments.length) return '';
  const from = tl.segments[0].from, to = tl.segments[tl.segments.length - 1].to;
  const span = Math.max(1, ms(to) - ms(from) + DAY);
  const pct = (d: string) => Math.max(0, Math.min(100, (ms(d) - ms(from)) / span * 100));
  // gleiche Phase hintereinander zusammenfassen (über Ziele hinweg nur, wenn es dieselbe Phase ist)
  const segs = tl.segments.map((s: any) => `<span class="tl-seg tl-${esc(s.phase)}" style="left:${pct(s.from).toFixed(2)}%;width:${Math.max(0.4, pct(s.to) - pct(s.from) + 100 * DAY / span).toFixed(2)}%" title="${esc(t('tl.' + s.phase))}: ${dm(s.from)} – ${dm(s.to)}"></span>`).join('');
  const marks = (tl.goals || []).map((g: any) => `<span class="tl-goal ${g.placeholder ? 'ph' : ''} ${g.priority === 'A' ? 'a' : ''}" style="left:${pct(g.date).toFixed(2)}%" title="${esc(g.name)} ${dm(g.date)}"></span>`).join('');
  const now = today >= from && today <= to ? `<span class="tl-now" style="left:${pct(today).toFixed(2)}%" aria-hidden="true"></span>` : '';
  // gewählte Woche als Rahmen: so sieht man, wo die angezeigte Woche auf dem Weg liegt
  const selM = sel && sel.to >= from && sel.from <= to ? `<span class="tl-sel" style="left:${pct(sel.from).toFixed(2)}%;width:${Math.max(0.8, pct(sel.to) - pct(sel.from) + 100 * DAY / span).toFixed(2)}%" title="${esc(t('tl.sel'))}"></span>` : '';
  const years: string[] = [];
  for (let y = +from.slice(0, 4) + 1; y <= +to.slice(0, 4); y++) years.push(`<span class="tl-year" style="left:${pct(`${y}-01-01`).toFixed(2)}%">${y}</span>`);
  // wo stehe ich: aktuelle Phase und die nächste
  const cur = tl.segments.find((s: any) => s.from <= today && s.to >= today) || tl.segments[0];
  const idx = tl.segments.indexOf(cur);
  const nxt = tl.segments.slice(idx + 1).find((s: any) => s.phase !== cur.phase);
  const goalOf = (id: string) => (tl.goals || []).find((g: any) => g.id === id);
  const curGoal = goalOf(cur.goalId);
  const legend = ['base', 'build', 'specific', 'taper', 'race'].map(p => `<span class="tl-key"><i class="tl-${p}"></i>${esc(t('tl.' + p))}</span>`).join('');
  const goals = (tl.goals || []).map((g: any) => `<li class="tl-li"><span class="tl-dot ${g.placeholder ? 'ph' : ''} ${g.priority === 'A' ? 'a' : ''}"></span><span class="grow">${esc(g.name)}</span><span class="xs muted">${dm(g.date)}</span>${g.placeholder ? ` <span class="pill">${esc(t('tl.placeholder'))}</span>` : ''}</li>`).join('');
  return `<div class="card tl" data-timeline style="margin-bottom:var(--s3)">
    <div class="lbl">${esc(t('tl.title'))}</div>
    <div class="t" data-tl-now>${esc(t('tl.now', { p: t('tl.' + cur.phase), d: dm(cur.to) }))}${curGoal ? esc(t('tl.toward', { g: curGoal.name })) : ''}${nxt ? esc(t('tl.next', { p: t('tl.' + nxt.phase) })) : ''}</div>
    <div class="tl-bar" role="img" aria-label="${esc(t('tl.aria'))}">${segs}${selM}${marks}${now}</div>
    <div class="tl-years">${years.join('')}</div>
    ${more(t('tl.more'), `<div class="tl-legend">${legend}</div><ul class="tl-goals">${goals}</ul>${(tl.goals || []).some((g: any) => g.placeholder) ? `<div class="xs muted">${esc(t('tl.phHint'))}</div>` : ''}`)}
  </div>`;
}
