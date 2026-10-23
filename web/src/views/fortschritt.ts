/* Fortschritt: Scores aus gemessener Leistung (nicht aus Gefühl), mit Trend der letzten 6 Wochen und „Warum?“.
   Dazu Gesamt-Form, Ziel-Prognose, Umfang und Meilensteine. */
import { STATE, PLAN, saveState, currentWeekIdx } from '../store';
import { esc, fmtDate, todayStr } from '../util';
import { t, num, hours } from '../../../shared/i18n';
import { D } from '../data';
import { on, sec, ic, sparkline, bar, openSheet, armed, empty, more, sportLabel, field, termLink } from '../kit';
import { SPORT_COLOR, sportIcon } from '../icons';
import { fmtDuration, type Prognosis } from '../../../shared/prognosis';
import { pacingPlan } from '../../../shared/race';
import type { Goal } from '../../../shared/goals';
import { weekMinutes } from '../../../shared/rules';
import { nav } from '../nav';
import { toast } from '../toast';
import { renderTrends } from './trends';

export function renderFortschritt(): string {
  const d = D();
  const f = d.form;
  let h = `<div class="card"><div class="spread"><div><div class="lbl">${termLink('Gesamt-Form', t('prog.form'))}</div><div class="hero-num">${f.score}<small class="xs muted"> / 100</small></div></div>${d.goal ? `<div style="text-align:right" class="small muted">${esc(t('prog.formOf', { name: d.goal.name }))}<br>${termLink('CTL')} ${num(f.ctl ?? 0, 0)} / ${f.target}</div>` : ''}</div>
    ${bar(f.score, 'var(--accent)')}</div>`;
  h += sec(t('prog.scores'), `<div class="score-grid">${d.scores.map(s => {
    const first = s.trend[0].score, last = s.score; const delta = last - first;
    return `<button class="score" data-act="score-open" data-sport="${s.sport}" style="--c:${SPORT_COLOR[s.sport]}"><div class="top-l"><span style="color:var(--c);width:20px;height:20px;display:inline-block">${sportIcon(s.sport)}</span><span class="nm">${esc(sportLabel(s.sport))}</span></div>
      <div class="spread"><span class="val">${s.score}<small class="xs muted rng" data-range> ±${s.range}</small><small class="xs muted lvl"> ${esc(s.level)}</small></span><span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '± '}${Math.abs(delta) || ''} ${esc(t('prog.6w'))}</span></div>
      ${sparkline(s.trend.map((x: any) => x.score), SPORT_COLOR[s.sport])}<div class="xs muted">${esc(s.confidence < 0.3 ? t('prog.lowData') : (s.gains[0] && s.gains[0].delta ? s.gains[0].text : t('prog.scale')))}</div></button>`;
  }).join('')}</div><div class="xs muted">${termLink('Score', t('prog.scaleLink'))}</div>`, t('prog.tapWhy'));
  // Auftrag 13: Trends (Erholung, Fitness, Effizienz, Intensität, Schwimmen, Bestwerte, lange Einheiten, Zusammenhänge)
  h += renderTrends();
  // Prognose
  const p = d.prognosis;
  if (d.goal && p) h += sec(t('prog.prognosis'), progCard(d.goal, p, false));
  // Umfang pro Woche: höchstens 12 Wochen rund um die aktuelle (bei langen Plänen ragten sonst 60+ Balken aus dem Bildschirm, Auftrag 7)
  const cw = currentWeekIdx();
  const from = Math.max(0, Math.min(cw - 7, PLAN.weeks.length - 12)), to = Math.min(PLAN.weeks.length, from + 12);
  const wk = PLAN.weeks.slice(from, to).map((w: any, k: number) => {
    let pl = 0, dn = 0;
    w.days.forEach((day: any) => day.sessions.forEach((s: any) => { if (s.sport === 'rest' || s.cancelled) return; pl += s.plannedMinutes || 0; const st = STATE.sessions[s.id]; if (st && st.completed) dn += +(st.metrics && st.metrics.min ? String(st.metrics.min).replace(',', '.') : s.plannedMinutes || 0); }));
    return { i: from + k, n: w.weekNumber, p: pl / 60, d: dn / 60, cur: from + k === cw };
  });
  const max = Math.max(0.5, ...wk.map(x => Math.max(x.p, x.d)));
  const curW = wk.find(x => x.cur);
  h += sec(t('prog.volume'), `<div class="card" data-volume><div class="vol-bars">${wk.map(x => `<div class="vol-col"><div class="vol-bar" style="height:${(x.p / max * 92).toFixed(1)}%;${x.cur ? 'outline:2px solid var(--accent)' : ''}"><i style="height:${x.p ? Math.min(100, x.d / x.p * 100).toFixed(1) : 0}%"></i></div><div class="xs muted">${x.n}</div></div>`).join('')}</div>
    <div class="hint">${esc(t('prog.volumeHint', { d: num(curW ? curW.d : 0, 1), p: num(curW ? curW.p : 0, 1) }))}${PLAN.weeks.length > wk.length ? ' ' + esc(t('prog.volumeRange', { a: wk[0].n, b: wk[wk.length - 1].n, n: PLAN.weeks[PLAN.weeks.length - 1].weekNumber })) : ''}</div></div>`);
  // Meilensteine
  const ms = [...(STATE.milestones || [])].sort((a: any, b: any) => b.date.localeCompare(a.date));
  h += sec(t('prog.milestones'), `<div class="list">${ms.slice(0, 8).map((m: any) => `<div class="li" data-mid="${esc(m.id)}"><span class="ic" style="--c:var(--accent)">${ic('trophy')}</span><span class="grow"><span class="t">${esc(m.text)}</span><br><span class="s">${fmtDate(m.date)}</span></span><button class="btn danger sm" data-act="ms-del">${esc(t('common.delete'))}</button></div>`).join('') || `<div class="li"><span class="muted">${esc(t('prog.noMilestones'))}</span></div>`}</div>
    <div class="row" style="margin-top:var(--s2)"><input class="inp grow" id="ms-text" placeholder="${esc(t('prog.msPh'))}"><button class="btn" data-act="ms-add">${ic('plus')}</button></div>`);
  return h;
}

/* Balken mit eigener Position je Marke: Füllung = aktueller Wert, Striche = Für dein Ziel nötig / Etappenziel / Wunschzeit */
function markBar(sub: number | null, marks: any[], color: string): string {
  const max = Math.max(100, (sub || 0) + 5, ...marks.map(m => m.pos + 5));
  const pc = (v: number) => Math.max(0, Math.min(100, v / max * 100)).toFixed(1);
  return `<div class="mbar" style="--c:${color}" role="img" aria-label="${esc(marks.map(m => m.text).join(', '))}"><i class="fill" style="width:${pc(sub || 0)}%"></i>${marks.map(m => `<b class="mk ${m.kind}${m.done ? ' done' : ''}" style="left:${pc(m.pos)}%"></b>`).join('')}</div>`;
}
function scoreSheet(sport: string): string {
  const s: any = D().scores.find(x => x.sport === sport); if (!s) return '';
  const col = SPORT_COLOR[sport];
  return `<div class="stack" data-score-sheet><div class="spread"><span class="hero-num" style="color:${col}">${s.score}</span><span class="small muted" style="text-align:right">${esc(s.level)}<br><span data-range>${esc(s.rangeText)}</span><br>${esc(t('prog.basis', { b: s.basis }))}</span></div>
    ${sparkline(s.trend.map((x: any) => x.score), col)}
    <div class="card flat tight"><div class="lbl">${esc(t('prog.why'))}</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.why.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>
      <div class="small" style="margin-top:6px" data-conf>${esc(s.confText)}</div></div>
    ${s.gains.length ? `<div class="card flat tight" data-gains><div class="lbl">${esc(t('prog.gains'))}</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.gains.map((g: any) => `<li>${esc(g.text)}</li>`).join('')}</ul></div>` : ''}
    <div class="card flat tight">${s.parts.map((p: any) => `<div class="part" data-part="${esc(p.key)}"><span class="small"><b>${esc(p.label)}</b><br><span class="muted">${esc(p.value)}</span></span><span class="small num" style="align-self:center">${p.sub == null ? '–' : Math.round(p.sub)}</span>
      <div style="grid-column:1/-1">${markBar(p.sub, p.marks || [], col)}</div>${(p.marks || []).length ? `<div class="xs marks" style="grid-column:1/-1">${p.marks.map((m: any) => `<span class="mk-t ${m.kind}">${esc(m.text)}</span>`).join(' · ')}</div>` : p.target ? `<div class="xs muted" style="grid-column:1/-1">${esc(t('prog.good'))} ${esc(p.target)}</div>` : ''}</div>`).join('')}</div>
    ${s.counted.length ? more(t('prog.counted'), `<div class="list">${s.counted.map((c: any) => `<div class="li"><span class="grow small"><b>${esc(fmtDate(c.date))}</b> ${esc(c.title)}<br><span class="muted">${esc(c.value)}${c.manual ? ' · ' + esc(t('prog.byHand')) : ''}</span></span></div>`).join('')}</div>`) : ''}
    <div class="hint">${esc(t('prog.scoreHint'))}</div></div>`;
}
/* Prognose: heute und am Renntag, je Disziplin Bereich und wahrscheinlichster Wert, was am meisten bringt, Tests, Annahmen, Pacing */
export function progCard(goal: Goal, p: Prognosis, compact: boolean): string {
  if (!p.ok || !p.total) return `<div class="card"><div class="hint">${esc(t('prog.noProg'))}</div></div>`;
  const rng = (x: any) => `${fmtDuration(x.low)} – ${fmtDuration(x.high)}`;
  const thr = D().profile.thresholds;
  const pace = pacingPlan(goal, p, { lthrRun: thr.lthrRun, lthrBike: thr.lthrBike, ftp: thr.ftp });
  const parts = (p.parts || []).map((x, i) => { const r = p.race && p.race.parts[i]; return `<div class="prow"><span class="muted">${esc(x.label)}${x.note ? `<br><span class="xs">${esc(x.note)}</span>` : ''}</span><b class="num">${fmtDuration(x.best)}<br><span class="xs muted">${rng(x)}</span></b>${p.race ? `<b class="num">${r ? fmtDuration(r.best) : ''}<br><span class="xs muted">${r ? rng(r) : ''}</span></b>` : ''}</div>`; }).join('');
  return `<div class="card stack" data-prognosis><div class="lbl">${esc(goal.name)}</div>
    <div class="prog2"><div><div class="xs muted">${esc(t('prog.ifToday'))}</div><div class="big num" data-range>${fmtDuration(p.total.best)}</div><div class="xs muted">${rng(p.total)}</div></div>
    ${p.race ? `<div><div class="xs muted">${esc(t('prog.expectedAt', { d: fmtDate(p.race.date) }))}</div><div class="big num" data-race>${fmtDuration(p.race.total.best)}</div><div class="xs muted">${rng(p.race.total)}</div></div>` : ''}</div>
    <div class="ptable ${p.race ? 'three' : ''}">${p.race ? `<div class="prow head xs muted"><span></span><span>${esc(t('prog.today'))}</span><span>${esc(fmtDate(p.race.date))}</span></div>` : ''}${parts}</div>
    <div class="xs muted">${esc(t('prog.confidence', { c: p.confidence }))}${(p.confReasons || []).length ? ': ' + esc((p.confReasons || []).join('; ')) : ''}</div>
    ${p.improve ? `<div class="banner info">${esc(p.improve)}</div>` : ''}
    ${(p.missing || []).length ? `<div class="small" data-missing>${(p.missing || []).map(m => esc(m)).join('<br>')}</div>` : ''}
    ${compact ? '' : more(t('race.pacing'), `<div class="list">${pace.map(x => `<div class="li"><span class="grow small"><b>${esc(x.leg)} · ${esc(x.part)}</b><br><span class="muted">${esc(x.hint)}</span></span><span class="v small">${esc(x.target)}</span></div>`).join('')}</div>`)}
    ${compact || !(p.assumptions || []).length ? '' : more(t('prog.assumptions'), `<ul class="small" style="margin:0;padding-left:18px">${(p.assumptions || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul><div class="hint">${esc(t('prog.courseHint'))}</div>`)}
    ${p.runDistances && goal.type.startsWith('run') && !compact ? more(t('prog.otherDistances'), p.runDistances.map(x => `<div class="kv"><span class="muted">${esc(x.label)}</span><b class="num">${fmtDuration(x.best)}</b></div>`).join('')) : ''}</div>`;
}
on('score-open', el => { const sp = el.dataset.sport!; openSheet(sportLabel(sp), () => scoreSheet(sp)); });
on('ms-add', () => {
  const inp = document.getElementById('ms-text') as HTMLInputElement; const text = inp.value.trim();
  if (!text) { toast(t('prog.msEmpty')); inp.focus(); return; }
  STATE.milestones.push({ id: 'ms-' + Date.now(), date: todayStr(), text }); saveState(); nav.rerender(); toast(t('prog.msSaved'));
});
on('ms-del', el => { if (!armed(el, t('common.reallyDelete'))) return; const id = (el.closest('[data-mid]') as HTMLElement).dataset.mid; STATE.milestones = STATE.milestones.filter((m: any) => m.id !== id); saveState(); nav.rerender(); });
void hours; void weekMinutes; void empty; void field;
