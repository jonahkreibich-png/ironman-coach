/* Fortschritt: Scores aus gemessener Leistung (nicht aus Gefühl), mit Trend der letzten 6 Wochen und „Warum?“.
   Dazu Gesamt-Form, Trends, eine Prognose je Ziel (Auftrag 23), Umfang und Meilensteine. Jeder Bereich lässt sich einklappen
   (Zustand je Gerät gemerkt); eingeklappt zeigt die Kopfzeile das Wichtigste. */
import { STATE, PLAN, saveState, currentWeekIdx, HAS_PLAN, profile, goals } from '../store';
import { esc, fmtDate, todayStr } from '../util';
import { t, num } from '../../../shared/i18n';
import { D, progMove, invalidate } from '../data';
import { on, ic, sparkline, bar, openSheet, closeSheet, armed, more, sportLabel, termLink, fold } from '../kit';
import { SPORT_COLOR, sportIcon } from '../icons';
import { fmtDuration, type Prognosis, type Prediction, type Growth } from '../../../shared/prognosis';
import { pacingPlan, wishPacing } from '../../../shared/race';
import { wishCheck, hm } from '../../../shared/goalcheck';
import { GOALS, mismatchText, type Goal } from '../../../shared/goals';
import { nav } from '../nav';
import { toast } from '../toast';
import { renderTrends } from './trends';
import { previewReplan, replanFuture } from '../replan';

export function renderFortschritt(): string {
  const d = D();
  const f = d.form;
  let h = `<div class="card"><div class="spread"><div><div class="lbl">${termLink('Gesamt-Form', t('prog.form'))}</div><div class="hero-num">${f.score}<small class="xs muted"> / 100</small></div></div>${d.goal ? `<div style="text-align:right" class="small muted">${esc(t('prog.formOf', { name: d.goal.name }))}<br>${termLink('CTL')} ${num(f.ctl ?? 0, 0)} / ${f.target}</div>` : ''}</div>
    ${bar(f.score, 'var(--accent)')}</div>`;
  h += fold('scores', t('prog.scores'), d.scores.map(s => `${sportLabel(s.sport)} ${s.score}`).join(' · '), `<div class="score-grid">${d.scores.map(s => {
    const first = s.trend[0].score, last = s.score; const delta = last - first;
    return `<button class="score" data-act="score-open" data-sport="${s.sport}" style="--c:${SPORT_COLOR[s.sport]}"><div class="top-l"><span style="color:var(--c);width:20px;height:20px;display:inline-block">${sportIcon(s.sport)}</span><span class="nm">${esc(sportLabel(s.sport))}</span></div>
      <div class="spread"><span class="val">${s.score}<small class="xs muted rng" data-range> ±${s.range}${s.provisional ? ' ' + esc(t('prog.provisional')) : ''}</small><small class="xs muted lvl"> ${esc(s.measured == null ? 'Schätzwert' : s.level)}</small></span><span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '± '}${Math.abs(delta) || ''} ${esc(t('prog.6w'))}</span></div>
      ${sparkline(s.trend.map((x: any) => x.score), SPORT_COLOR[s.sport])}<div class="xs muted">${esc(s.provisional ? t('prog.provisionalHint') : s.confidence < 0.3 ? t('prog.lowData') : (s.gains[0] && s.gains[0].delta ? s.gains[0].text : t('prog.scale')))}</div></button>`;
  }).join('')}</div><div class="xs muted">${termLink('Score', t('prog.scaleLink'))} · ${esc(t('prog.tapWhy'))}</div>`);
  // Auftrag 13: Trends (Erholung, Fitness, Effizienz, Intensität, Schwimmen, Bestwerte, lange Einheiten, Zusammenhänge)
  h += renderTrends();
  // Auftrag 23: Prognose für jedes Ziel mit Datum (auch Platzhalter), das nächste zuerst; jede einzeln einklappbar
  const list = d.prognoses || [];
  // Auftrag 24: Ziel passt nicht zu den gewählten Sportarten: keine Prognose, ein kurzer Hinweis mit Weg ins Profil
  const mis = (d.mismatches || []).map(x => `<div class="banner info small" data-goal-mismatch="${esc(x.goal.id)}"><b>${esc(x.goal.name)}:</b> ${esc(mismatchText(x.missing))} <button class="btn ghost sm" data-act="go-sub" data-sub="profil">${esc(t('prog.toProfile'))}</button></div>`).join('');
  if (mis) h += mis;
  if (list.length) h += fold('prognoses', t('prog.prognoses'), list.map(x => `${x.goal.name}: ${shortRange(x.p)}`).join(' · '),
    `<div class="stack" data-prognoses>${list.map(x => fold('prog-' + x.goal.id, x.goal.name, shortRange(x.p), progCard(x.goal, x.p, false, x.placeholder), { kind: 'card', sub: goalSub(x.goal, x.placeholder), badge: x.placeholder ? t('prog.placeholder') : '' })).join('')}</div>`);
  else if (d.goal && d.prognosis) h += fold('prognoses', t('prog.prognosis'), `${d.goal.name}: ${shortRange(d.prognosis)}`, progCard(d.goal, d.prognosis, false, false));
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
  h += fold('volume', t('prog.volume'), t('prog.volumeSum', { d: num(curW ? curW.d : 0, 1), p: num(curW ? curW.p : 0, 1) }), `<div class="card" data-volume><div class="vol-bars">${wk.map(x => `<div class="vol-col"><div class="vol-bar" style="height:${(x.p / max * 92).toFixed(1)}%;${x.cur ? 'outline:2px solid var(--accent)' : ''}"><i style="height:${x.p ? Math.min(100, x.d / x.p * 100).toFixed(1) : 0}%"></i></div><div class="xs muted">${x.n}</div></div>`).join('')}</div>
    <div class="hint">${esc(t('prog.volumeHint', { d: num(curW ? curW.d : 0, 1), p: num(curW ? curW.p : 0, 1) }))}${PLAN.weeks.length > wk.length && wk.length ? ' ' + esc(t('prog.volumeRange', { a: wk[0].n, b: wk[wk.length - 1].n, n: PLAN.weeks[PLAN.weeks.length - 1].weekNumber })) : ''}</div></div>`);
  // Meilensteine
  const ms = [...(STATE.milestones || [])].sort((a: any, b: any) => b.date.localeCompare(a.date));
  h += fold('milestones', t('prog.milestones'), ms.length ? `${ms.length} · ${ms[0].text}` : t('prog.noMilestones'), `<div class="list">${ms.slice(0, 8).map((m: any) => `<div class="li" data-mid="${esc(m.id)}"><span class="ic" style="--c:var(--accent)">${ic('trophy')}</span><span class="grow"><span class="t">${esc(m.text)}</span><br><span class="s">${fmtDate(m.date)}</span></span><button class="btn danger sm" data-act="ms-del">${esc(t('common.delete'))}</button></div>`).join('') || `<div class="li"><span class="muted">${esc(t('prog.noMilestones'))}</span></div>`}</div>
    <div class="row" style="margin-top:var(--s2)"><input class="inp grow" id="ms-text" placeholder="${esc(t('prog.msPh'))}"><button class="btn" data-act="ms-add" aria-label="${esc(t('prog.msAdd'))}">${ic('plus')}</button></div>`);
  return h;
}

/* Bereich kurz: über 1 Jahr gerundet („ca. 11–13 h“), sonst h:mm (unter 1 h m:ss) */
const hmm = (s: number) => { s = Math.round(s); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return hh ? `${hh}:${String(m).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
export function shortRange(p: Prognosis): string {
  if (!p || !p.ok || !p.total) return '–';
  if (p.race && p.race.approx) return 'ca. ' + p.race.approx;
  const r = p.race ? p.race.total : p.total;
  return `ca. ${hmm(r.low)}–${hmm(r.high)}`;
}
function goalSub(g: Goal, placeholder: boolean): string {
  if (!g.date) return '';
  const days = Math.round((Date.parse(g.date + 'T12:00:00Z') - Date.parse(todayStr() + 'T12:00:00Z')) / 86400000);
  const when = days > 540 ? t('prog.inYears', { n: num(days / 365.25, 1) }) : days > 60 ? t('prog.inMonths', { n: Math.round(days / 30.4) }) : t('prog.inDays', { n: days });
  return `${fmtDate(g.date)}${placeholder ? ' (' + t('prog.placeholderDate') + ')' : ''} · ${when}`;
}
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x) * 100, 0)} %`;
function growthLine(gr: Growth, d: ReturnType<typeof D>): string {
  const pace = (ms: number) => { const s = Math.round(1000 / ms); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`; };
  const p100 = (ms: number) => { const s = Math.round(100 / ms); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/100 m`; };
  const to = gr.from * (1 + gr.gain);
  const v = gr.sport === 'run' ? `${pace(gr.from)} → ${pace(to)}` : gr.sport === 'swim' ? `${p100(gr.from)} → ${p100(to)}${gr.breast ? ' ' + t('prog.breast') : ''}` : (() => { const k = num(gr.from, 1) === num(to, 1) ? 2 : 1; return `${num(gr.from, k)} → ${num(to, k)} W/kg`; })();
  // Auftrag 24: woraus die Hochrechnung stammt
  const basis = gr.basis === 'pause' ? t('prog.basisPause', { w: Math.max(1, Math.round(gr.pauseWeeks || 0)) })
    : gr.basis === 'trend' ? t('prog.basisTrend', { w: gr.trendWeeks ?? '', p: Math.round((gr.trendShare || 0) * 100) })
      : gr.trendWeeks ? t('prog.basisTypicalSome', { w: gr.trendWeeks }) : t('prog.basisTypical');
  return t('prog.growthLine', { s: sportLabel(gr.sport), lvl: gr.level, v, g: pct(gr.gain) }) + ' – ' + basis;
}
function moveLine(goal: Goal): string {
  const m = progMove(goal);
  if (!m) return `<div class="xs muted" data-updated>${esc(t('prog.updatedNone'))}</div>`;
  const dt = Math.abs(m.delta);
  const amount = dt >= 90 ? `${Math.round(dt / 60)} min` : `${Math.round(dt)} s`;
  return `<div class="xs muted" data-updated>${esc(t('prog.updated', { d: fmtDate(m.date), x: (m.delta < 0 ? '−' : '+') + amount }))}${m.why.length ? ': ' + esc(m.why.join(', ')) : ''}</div>`;
}

/* Prognose eines Ziels: heute und am Wettkampftag, je Disziplin Bereich und wahrscheinlichster Wert, Sicherheit, zuletzt aktualisiert,
   Wunschzeit gegen Prognose, was am meisten bringt, Tests, „Warum?“, Pacing */
export function progCard(goal: Goal, p: Prognosis, compact: boolean, placeholder = false): string {
  if (!p.ok || !p.total) return `<div class="card"><div class="hint">${esc(t('prog.noProg'))}</div></div>`;
  const d = D();
  const rng = (x: Prediction) => `${fmtDuration(x.low)} – ${fmtDuration(x.high)}`;
  const thr = d.profile.thresholds;
  const race = p.race;
  const raceProg: Prognosis = race ? { ...p, parts: race.parts, total: race.total, bike: race.bike || p.bike } : p;
  const pace = pacingPlan(goal, raceProg, { lthrRun: thr.lthrRun, lthrBike: thr.lthrBike, ftp: thr.ftp });
  const parts = (p.parts || []).map((x, i) => { const r = race && race.parts[i]; return `<div class="prow"><span class="muted">${esc(x.label)}${x.note ? `<br><span class="xs">${esc(x.note)}</span>` : ''}</span><b class="num">${fmtDuration(x.best)}<br><span class="xs muted">${rng(x)}</span></b>${race ? `<b class="num">${r ? (race.approx ? '≈ ' + hmm(r.best) : fmtDuration(r.best)) : ''}<br><span class="xs muted">${r ? (race.approx ? `${hmm(r.low)} – ${hmm(r.high)}` : rng(r)) : ''}</span></b>` : ''}</div>`; }).join('');
  const raceHead = race ? (race.approx
    ? `<div><div class="xs muted">${esc(t('prog.expectedAt', { d: fmtDate(race.date) }))}</div><div class="big num approx" data-race>${esc('ca. ' + race.approx)}</div><div class="xs muted">${esc(t('prog.ifPlan', { b: hm(race.total.best) }))}</div></div>`
    : `<div><div class="xs muted">${esc(t('prog.expectedAt', { d: fmtDate(race.date) }))}</div><div class="big num" data-race>${fmtDuration(race.total.best)}</div><div class="xs muted">${rng(race.total)}</div></div>`) : '';
  const confTxt = race
    ? t('prog.conf2', { a: p.confidence, b: race.confidence || p.confidence }) + (race.horizon === 'lang' ? ' ' + t('prog.confLong') : '')
    : t('prog.confidence', { c: p.confidence });
  const wc = wishCheck(goal, p);
  const wp = wc ? wishPacing(goal, p, wc.rows, { lthrRun: thr.lthrRun, lthrBike: thr.lthrBike, ftp: thr.ftp }) : null;
  const tri = GOALS[goal.type] && GOALS[goal.type].group === 'tri';
  const wishHtml = !wc ? (compact ? '' : `<div class="xs muted" data-wish-none>${esc(t('prog.wishNone'))}</div>`) : `<div class="card flat tight stack" data-wish="${esc(goal.id)}">
      <div class="spread"><span class="lbl">${esc(t('prog.wish', { w: hm(wc.target) }))}</span><span class="pill ${wc.verdict === 'realistisch' ? 'good' : wc.verdict === 'ambitioniert' ? 'warn' : 'bad'}" data-verdict>${esc(wc.verdict)}</span></div>
      <div class="small">${esc(wc.text)}</div>
      <div class="list">${wc.rows.filter(r => r.sport !== 'trans' || wc.rows.length > 1).filter(r => r.sport !== 'trans').map(r => `<div class="li${r.lever ? ' lever' : ''}" data-wish-row="${r.sport}"><span class="grow small"><b>${esc(r.label)}</b>: ${esc(t('prog.wishRow', { n: hm(r.need), p: hm(r.pred) }))}${r.lever ? ` <b class="lever-t">→ ${esc(t('prog.lever'))}</b>` : ''}</span><span class="pill ${r.verdict === 'realistisch' ? 'good' : r.verdict === 'ambitioniert' ? 'warn' : 'bad'} xs">${esc(r.verdict)}</span></div>`).join('')}</div>
      ${p.improve && wc.verdict !== 'realistisch' ? `<div class="small">${esc(p.improve)}</div>` : ''}
      ${wp && wp.warnings.length ? `<div class="banner warn small" data-wish-warn>${wp.warnings.map(w => esc(w)).join('<br>')}</div>` : ''}
      ${compact || !wp ? '' : more(t('prog.wishPacing'), `<div class="list">${wp.segments.map(x => `<div class="li"><span class="grow small"><b>${esc(x.leg)} · ${esc(x.part)}</b><br><span class="muted">${esc(x.hint)}</span></span><span class="v small">${esc(x.target)}</span></div>`).join('')}</div>`)}
      ${compact || !HAS_PLAN || !tri || wc.verdict === 'realistisch' && !goal.alignWish ? '' : goal.alignWish
        ? `<div class="row"><span class="xs muted grow">${esc(t('prog.aligned'))}</span><button class="btn ghost sm" data-act="wish-unalign" data-id="${esc(goal.id)}">${esc(t('prog.unalign'))}</button></div>`
        : `<button class="btn ghost sm" data-act="wish-align" data-id="${esc(goal.id)}">${esc(t('prog.align'))}</button><div class="xs muted">${esc(t('prog.alignHint'))}</div>`}
    </div>`;
  const why = compact ? '' : more(t('prog.whyTitle'), `<div class="stack small" data-prog-why>
      ${race && race.growth && race.growth.length ? `<div><b>${esc(t('prog.whyGrowth', { w: race.weeks ?? '' }))}</b><ul style="margin:4px 0 0;padding-left:18px">${race.growth.map(g => `<li>${esc(growthLine(g, d))}</li>`).join('')}</ul>${(race.notes || []).map(n => `<div class="xs">${esc(n)}</div>`).join('')}<div class="xs muted">${esc(t('prog.whyModel', { a: d.age ?? '–', h: num(d.profile.weeklyHours || 0, 0) }))}</div></div>` : ''}
      ${(p.confReasons || []).length ? `<div>${esc(t('prog.whyConf'))} ${esc((p.confReasons || []).join('; '))}</div>` : ''}
      ${(p.assumptions || []).length ? `<div><b>${esc(t('prog.assumptions'))}</b><ul style="margin:4px 0 0;padding-left:18px">${(p.assumptions || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <div class="hint">${esc(t('prog.courseHint'))}</div></div>`);
  const runGoal = goal.type.startsWith('run');
  const others = p.runDistances && runGoal && !compact ? more(t('prog.otherDistances'), `<div class="ptable ${race && race.runDistances ? 'three' : ''}">${race && race.runDistances ? `<div class="prow head xs muted"><span></span><span>${esc(t('prog.today'))}</span><span>${esc(fmtDate(race.date))}</span></div>` : ''}${p.runDistances.map((x, i) => { const r = race && race.runDistances && race.runDistances[i]; return `<div class="prow"><span class="muted">${esc(x.label)}</span><b class="num">${fmtDuration(x.best)}</b>${r ? `<b class="num">${fmtDuration(r.best)}</b>` : ''}</div>`; }).join('')}</div>`) : '';
  return `<div class="stack" data-prognosis="${esc(goal.id)}">${compact ? `<div class="lbl">${esc(goal.name)}</div>` : ''}
    ${placeholder ? `<div class="banner info small" data-placeholder>${esc(t('prog.placeholderHint'))}</div>` : ''}
    <div class="prog2"><div><div class="xs muted">${esc(t('prog.ifToday'))}</div><div class="big num" data-range>${fmtDuration(p.total.best)}</div><div class="xs muted">${rng(p.total)}</div></div>${raceHead}</div>
    <div class="ptable ${race ? 'three' : ''}">${race ? `<div class="prow head xs muted"><span></span><span>${esc(t('prog.today'))}</span><span>${esc(fmtDate(race.date))}</span></div>` : ''}${parts}</div>
    <div class="xs muted" data-conf>${esc(confTxt)}</div>
    ${compact ? '' : moveLine(goal)}
    ${wishHtml}
    ${p.improve && !(wc && wc.verdict !== 'realistisch') ? `<div class="banner info">${esc(p.improve)}</div>` : ''}
    ${(p.missing || []).length ? `<div class="small" data-missing>${(p.missing || []).map(m => esc(m)).join('<br>')}</div>` : ''}
    ${why}
    ${compact ? '' : more(t('race.pacing'), `<div class="list">${pace.map(x => `<div class="li"><span class="grow small"><b>${esc(x.leg)} · ${esc(x.part)}</b><br><span class="muted">${esc(x.hint)}</span></span><span class="v small">${esc(x.target)}</span></div>`).join('')}</div>`)}
    ${others}</div>`;
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
  return `<div class="stack" data-score-sheet><div class="spread"><span class="hero-num" style="color:${col}">${s.score}</span><span class="small muted" style="text-align:right">${esc(s.measured == null ? 'Schätzwert' : s.level)}<br><span data-range>${esc(s.rangeText)}</span><br>${esc(t('prog.basis', { b: s.basis }))}</span></div>
    ${sparkline(s.trend.map((x: any) => x.score), col)}
    <div class="card flat tight"><div class="lbl">${esc(t('prog.why'))}</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.why.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>
      <div class="small" style="margin-top:6px" data-conf>${esc(s.confText)}</div></div>
    ${s.gains.length ? `<div class="card flat tight" data-gains><div class="lbl">${esc(t('prog.gains'))}</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.gains.map((g: any) => `<li>${esc(g.text)}</li>`).join('')}</ul></div>` : ''}
    <div class="card flat tight">${s.parts.map((p: any) => `<div class="part" data-part="${esc(p.key)}"><span class="small"><b>${esc(p.label)}</b><br><span class="muted">${esc(p.value)}</span></span><span class="small num" style="align-self:center">${p.sub == null ? '–' : Math.round(p.sub)}</span>
      <div style="grid-column:1/-1">${markBar(p.sub, p.marks || [], col)}</div>${(p.marks || []).length ? `<div class="xs marks" style="grid-column:1/-1">${p.marks.map((m: any) => `<span class="mk-t ${m.kind}">${esc(m.text)}</span>`).join(' · ')}</div>` : p.target ? `<div class="xs muted" style="grid-column:1/-1">${esc(t('prog.good'))} ${esc(p.target)}</div>` : ''}</div>`).join('')}</div>
    ${s.counted.length ? more(t('prog.counted'), `<div class="list">${s.counted.map((c: any) => `<div class="li"><span class="grow small"><b>${esc(fmtDate(c.date))}</b> ${esc(c.title)}<br><span class="muted">${esc(c.value)}${c.manual ? ' · ' + esc(t('prog.byHand')) : ''}</span></span></div>`).join('')}</div>`) : ''}
    <div class="hint">${esc(t('prog.scoreHint'))}</div></div>`;
}

/* „Plan auf Wunschzeit ausrichten“ (Auftrag 23): nur auf Knopfdruck, mit Vorschau. Verschiebt die Schwerpunkte nach dem Rückstand zur
   Wunschzeit (z. B. Schwimm-Qualität zuerst); Umfang, Steigerung, Ruhetage und Intensitätsgrenzen bleiben wie im normalen Plan. */
function withAlign(id: string, on: boolean): Goal[] { return goals().map(g => g.id === id ? { ...g, alignWish: on } : g); }
function alignSheet(id: string, on: boolean): string {
  const g = goals().find(x => x.id === id); if (!g) return '';
  const pv = previewReplan(profile(), withAlign(id, on).filter(x => !x.result));
  const lines = pv.ok ? [...pv.thisWeek, ...pv.nextWeek] : [];
  return `<div class="stack" data-align-sheet><div class="small">${esc(t(on ? 'prog.alignIntro' : 'prog.unalignIntro', { n: g.name }))}</div>
    ${!pv.ok ? `<div class="hint">${esc(pv.msg)}</div>` : lines.length ? `<div class="lbl">${esc(t('stage.inPlan'))}</div><div class="list" data-align-preview>${lines.slice(0, 8).map(c => `<div class="li"><span class="t">${esc(c)}</span></div>`).join('')}${lines.length > 8 ? `<div class="li"><span class="muted">${esc(t('stage.more', { n: lines.length - 8 }))}</span></div>` : ''}</div><div class="hint">${esc(t('stage.laterToo'))}</div>` : `<div class="hint" data-align-preview>${esc(t('stage.noChangeSoon'))}</div>`}
    <div class="banner info small">${esc(t('prog.alignSafe'))}</div>
    <div class="row"><button class="btn" data-act="wish-align-ok" data-id="${esc(id)}" data-on="${on ? '1' : '0'}" ${pv.ok ? '' : 'disabled'}>${esc(t('stage.confirm'))}</button><button class="btn ghost" data-act="sheet-close">${esc(t('stage.back'))}</button></div></div>`;
}
on('wish-align', el => { const id = el.dataset.id!; openSheet(t('prog.align'), () => alignSheet(id, true)); });
on('wish-unalign', el => { const id = el.dataset.id!; openSheet(t('prog.unalign'), () => alignSheet(id, false)); });
on('wish-align-ok', el => {
  const id = el.dataset.id!; const onA = el.dataset.on === '1';
  const g = STATE.goals && STATE.goals[id]; if (!g) { closeSheet(); return; }
  STATE.goals[id] = { ...g, alignWish: onA }; saveState();
  const r = replanFuture(t(onA ? 'prog.alignReason' : 'prog.unalignReason'), t('prog.alignWhy', { n: g.name }));
  invalidate(); closeSheet(); nav.rerender();
  toast(r.ok ? t(onA ? 'prog.alignDone' : 'prog.unalignDone') : r.msg);
});
on('score-open', el => { const sp = el.dataset.sport!; openSheet(sportLabel(sp), () => scoreSheet(sp)); });
on('ms-add', () => {
  const inp = document.getElementById('ms-text') as HTMLInputElement; const text = inp.value.trim();
  if (!text) { toast(t('prog.msEmpty')); inp.focus(); return; }
  STATE.milestones.push({ id: 'ms-' + Date.now(), date: todayStr(), text }); saveState(); nav.rerender(); toast(t('prog.msSaved'));
});
on('ms-del', el => { if (!armed(el, t('common.reallyDelete'))) return; const id = (el.closest('[data-mid]') as HTMLElement).dataset.mid; STATE.milestones = STATE.milestones.filter((m: any) => m.id !== id); saveState(); nav.rerender(); });
