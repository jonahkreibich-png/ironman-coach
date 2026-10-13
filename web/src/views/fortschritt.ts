/* Fortschritt: Scores aus gemessener Leistung (nicht aus Gefühl), mit Trend der letzten 6 Wochen und „Warum?“.
   Dazu Gesamt-Form, Ziel-Prognose, Umfang und Meilensteine. */
import { STATE, PLAN, saveState, currentWeekIdx } from '../store';
import { esc, fmtDate, todayStr } from '../util';
import { t, num, hours } from '../../../shared/i18n';
import { D } from '../data';
import { on, sec, ic, sparkline, bar, openSheet, armed, empty, more, sportLabel, field } from '../kit';
import { SPORT_COLOR, sportIcon } from '../icons';
import { fmtDuration } from '../../../shared/prognosis';
import { weekMinutes } from '../../../shared/rules';
import { nav } from '../nav';
import { toast } from '../toast';

export function renderFortschritt(): string {
  const d = D();
  const f = d.form;
  let h = `<div class="card"><div class="spread"><div><div class="lbl">${esc(t('prog.form'))}</div><div class="hero-num">${f.score}<small class="xs muted"> / 100</small></div></div>${d.goal ? `<div style="text-align:right" class="small muted">${esc(t('prog.formOf', { name: d.goal.name }))}<br>CTL ${num(f.ctl ?? 0, 0)} / ${f.target}</div>` : ''}</div>
    ${bar(f.score, 'var(--accent)')}<div class="hint">${esc(t('prog.formHint'))}</div></div>`;
  h += sec(t('prog.scores'), `<div class="score-grid">${d.scores.map(s => {
    const first = s.trend[0].score, last = s.score; const delta = last - first;
    return `<button class="score" data-act="score-open" data-sport="${s.sport}" style="--c:${SPORT_COLOR[s.sport]}"><div class="top-l"><span style="color:var(--c);width:20px;height:20px;display:inline-block">${sportIcon(s.sport)}</span><span class="nm">${esc(sportLabel(s.sport))}</span></div>
      <div class="spread"><span class="val">${s.score}</span><span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '± '}${Math.abs(delta) || ''} ${esc(t('prog.6w'))}</span></div>
      ${sparkline(s.trend.map((x: any) => x.score), SPORT_COLOR[s.sport])}<div class="xs muted">${esc(s.confidence < 0.3 ? t('prog.lowData') : t('prog.basis', { b: s.basis }))}</div></button>`;
  }).join('')}</div>`, t('prog.tapWhy'));
  // Prognose
  const p = d.prognosis;
  if (d.goal && p) {
    h += sec(t('prog.prognosis'), `<div class="card">${p.ok && p.total ? `<div class="lbl">${esc(d.goal.name)}</div><div class="big">${fmtDuration(p.total.low)} – ${fmtDuration(p.total.high)}</div><div class="xs muted">${esc(t('prog.confidence', { c: p.confidence }))}</div>
      ${(p.parts || []).map(x => `<div class="kv"><span class="muted">${esc(x.label)}</span><b class="num">${fmtDuration(x.low)} – ${fmtDuration(x.high)}</b></div>`).join('')}
      ${p.improve ? `<div class="banner info">${esc(p.improve)}</div>` : ''}
      ${p.runDistances && d.goal.type.startsWith('run') ? more(t('prog.otherDistances'), p.runDistances.map(x => `<div class="kv"><span class="muted">${esc(x.label)}</span><b class="num">${fmtDuration(x.best)}</b></div>`).join('')) : ''}`
      : `<div class="hint">${esc(t('prog.missing'))}</div><ul class="small">${(p.missing || []).map(m => `<li>${esc(m)}</li>`).join('')}</ul>`}</div>`);
  }
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

function scoreSheet(sport: string): string {
  const s = D().scores.find(x => x.sport === sport); if (!s) return '';
  return `<div class="stack"><div class="spread"><span class="hero-num" style="color:${SPORT_COLOR[sport]}">${s.score}</span><span class="small muted" style="text-align:right">${esc(t('prog.basis', { b: s.basis }))}<br>${esc(t('prog.measured', { m: s.measured ?? '–', c: Math.round(s.confidence * 100) }))}</span></div>
    ${sparkline(s.trend.map((x: any) => x.score), SPORT_COLOR[sport])}
    <div class="card flat tight"><div class="lbl">${esc(t('prog.why'))}</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.why.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul></div>
    <div class="card flat tight">${s.parts.map((p: any) => `<div class="part"><span class="small"><b>${esc(p.label)}</b><br><span class="muted">${esc(p.value)} · ${esc(t('prog.target'))} ${esc(p.target)}</span></span><span class="small num" style="align-self:center">${p.sub == null ? '–' : Math.round(p.sub)}</span><div style="grid-column:1/-1">${bar(p.sub ?? 0, SPORT_COLOR[sport])}</div></div>`).join('')}</div>
    <div class="hint">${esc(t('prog.scoreHint'))}</div></div>`;
}
on('score-open', el => { const sp = el.dataset.sport!; openSheet(sportLabel(sp), () => scoreSheet(sp)); });
on('ms-add', () => {
  const inp = document.getElementById('ms-text') as HTMLInputElement; const text = inp.value.trim();
  if (!text) { toast(t('prog.msEmpty')); inp.focus(); return; }
  STATE.milestones.push({ id: 'ms-' + Date.now(), date: todayStr(), text }); saveState(); nav.rerender(); toast(t('prog.msSaved'));
});
on('ms-del', el => { if (!armed(el, t('common.reallyDelete'))) return; const id = (el.closest('[data-mid]') as HTMLElement).dataset.mid; STATE.milestones = STATE.milestones.filter((m: any) => m.id !== id); saveState(); nav.rerender(); });
void hours; void weekMinutes; void empty; void field;
