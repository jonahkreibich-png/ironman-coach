/* Wettkampf-Modus (Ziel-Wettkampf < 14 Tage): Countdown, Tapering, Briefing, Pacing, Verpflegung, Packliste.
   Danach: Ergebnis eintragen, Rückblick mit Prognose-Vergleich, Erholungsplan. */
import { STATE, saveState, saveSoon } from '../store';
import { esc, fmtDate, dowShort, addDays } from '../util';
import { t, hhmm, num } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, field, more, empty, timeField, readTime } from '../kit';
import { D, invalidate, prognosisFor } from '../data';
import { progCard } from './fortschritt';
import { GOALS, legsOf } from '../../../shared/goals';
import { briefing, taperPlan, pacingPlan, packingList, recoveryPlan, raceReview, raceFuel, daysUntil } from '../../../shared/race';
import { fmtDuration } from '../../../shared/prognosis';
import { nav } from '../nav';
import { toast } from '../toast';
import type { Goal } from '../../../shared/goals';

const parseHm = (s: string): number | null => { const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(String(s).trim()); if (!m) return null; return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 3600 + +m[2] * 60; };

export function renderWettkampf(): string {
  const d = D();
  const g = d.raceGoal || d.recentRace;
  if (!g) {
    const next = d.goals.filter(x => x.date && x.date >= d.today && x.type !== 'fitness').sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    return `<div class="card">${empty(next ? t('race.notYet', { name: next.name, n: daysUntil(d.today, next.date!) - 14 }) : t('race.noGoal'))}</div>`;
  }
  return g.date! >= d.today ? before(g) : after(g);
}

function before(g: Goal): string {
  const d = D(); const n = daysUntil(d.today, g.date!);
  const b = briefing(g, d.today);
  // Auftrag 23: die Prognose dieses Ziels (vorher nur, wenn es das Hauptziel war; ein B-Rennen in 10 Tagen hatte sonst keine)
  const own = (d.prognoses || []).find(x => x.goal.id === g.id);
  const prog = own ? own.p : d.prognosis && d.goal && d.goal.id === g.id ? d.prognosis : null;
  const thr = d.profile.thresholds;
  const pace = pacingPlan(g, prog, { lthrRun: thr.lthrRun, lthrBike: thr.lthrBike, ftp: thr.ftp });
  const fuel = raceFuel(g, prog, d.profile.weightKg || 65, d.minor);
  const pack = packingList(g);
  const checked: Record<string, boolean> = ((STATE.raceResults || {})[g.id] || {}).packed || {};
  let h = `<div class="card"><div class="spread"><div><div class="lbl">${esc(g.name)} · ${dowShort(g.date!)} ${fmtDate(g.date!)}</div><div class="hero-num">${n === 0 ? esc(t('race.dayZero')) : n}<small class="xs muted"> ${n === 0 ? '' : esc(t('race.days'))}</small></div></div>${ic('flag')}</div>
    <div class="t" style="font-weight:600;margin-top:var(--s2)">${esc(b.title)}</div><div class="small">${esc(b.text)}</div></div>`;
  h += sec(t('race.taper'), `<div class="list">${taperPlan(g).map(p => `<div class="li ${d.today >= p.from && d.today <= p.to ? 'on' : ''}"><span class="grow"><span class="t">${fmtDate(p.from)} – ${fmtDate(p.to)} ${d.today >= p.from && d.today <= p.to ? pill(t('race.now'), 'accent') : ''}</span><br><span class="s">${esc(p.text)}</span></span><span class="v num">${p.volumePct} %</span></div>`).join('')}</div>`);
  if (prog && prog.total) h += sec(t('race.prognosis'), progCard(g, prog, true));
  h += sec(t('race.pacing'), `<div class="list">${pace.map(p => `<div class="li"><span class="grow"><span class="t">${esc(p.leg)} · ${esc(p.part)}</span><br><span class="s">${esc(p.hint)}</span></span><span class="v small">${esc(p.target)}</span></div>`).join('')}</div>`);
  h += sec(t('race.fuel'), `<div class="card stack"><div class="kv"><span class="muted">${esc(t('race.carbs'))}</span><b>${fuel.carbsPerHour} g/h</b></div><div class="kv"><span class="muted">${esc(t('race.fluid'))}</span><b>${fuel.fluidMlPerHour} ml/h</b></div><div class="kv"><span class="muted">${esc(t('race.sodium'))}</span><b>${fuel.sodiumMgPerHour} mg/h</b></div>
    ${more(t('race.before'), `<ul class="small" style="padding-left:18px;margin:0">${fuel.before.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)}
    ${fuel.schedule.length ? more(t('race.schedule'), `<div class="list">${fuel.schedule.map(s => `<div class="li"><span class="v num" style="min-width:56px">${s.min} min</span><span class="grow small">${esc(s.what)}</span></div>`).join('')}</div>`) : ''}
    ${fuel.notes.map(x => `<div class="hint">${esc(x)}</div>`).join('')}</div>`);
  h += sec(t('race.packing'), pack.map(grp => `<div class="lbl" style="margin:var(--s2) 2px 4px">${esc(grp.group)}</div><div class="list">${grp.items.map(it => { const k = grp.group + ':' + it; return `<label class="li"><input type="checkbox" data-ch="pack" data-k="${esc(k)}" ${checked[k] ? 'checked' : ''}><span class="grow ${checked[k] ? 'muted' : ''}">${esc(it)}</span></label>`; }).join('')}</div>`).join(''),
    t('race.packed', { a: Object.values(checked).filter(Boolean).length, b: pack.reduce((s, x) => s + x.items.length, 0) }));
  return h;
}

/* Prognose am Renntag (gespeichert beim ersten Eintragen), für Vergleich und Korrekturfaktor */
function predictedOf(g: Goal): any { const pr = g.result && g.result.predicted; return pr && pr.total ? { ok: true, confidence: 'mittel', total: { label: g.name, best: pr.total, low: pr.total * 0.95, high: pr.total * 1.05 } } : null; }
function after(g: Goal): string {
  const d = D();
  const res = g.result || {};
  const prog = predictedOf(g) || d.prognosis;
  const sports = [...new Set(legsOf(g).map(l => l.sport))].filter(x => x === 'swim' || x === 'bike' || x === 'run') as ('swim' | 'bike' | 'run')[];
  const multi = GOALS[g.type].group === 'tri' && sports.length > 1;
  const pr: any = (res as any).predicted || null;
  const raceSec = res.timeSec || null;
  const day = daysUntil(g.date!, d.today);
  let h = `<div class="card stack"><div class="lbl">${esc(g.name)} · ${fmtDate(g.date!)}</div>
    <div class="fgrid">${timeField('rr-time', t('race.yourTime'), res.timeSec, 'hms', 'data-ch="rr" data-k="time"')}${field('rr-place', t('race.place'), res.place || '', { data: 'data-ch="rr" data-k="place"' })}</div>
    ${multi ? `<div class="lbl">${esc(t('race.splits'))}</div><div class="fgrid" data-splits>${sports.map(sp => timeField('rr-' + sp, t('race.split.' + sp) + (pr && pr[sp] ? ` (${t('race.predShort')} ${fmtDuration(pr[sp])})` : ''), (res.splits || {})[sp], 'hms', `data-ch="rr" data-k="split" data-sp="${sp}"`)).join('')}</div><div class="hint">${esc(t('race.splitsHint'))}</div>` : ''}
    <div class="fld"><label for="rr-note">${esc(t('race.howWasIt'))}</label><textarea class="inp" id="rr-note" rows="2" data-ch="rr" data-k="note">${esc(res.note || '')}</textarea></div>
    <div class="banner info">${esc(raceReview(g, { timeSec: raceSec, note: res.note }, prog))}</div></div>`;
  h += sec(t('race.recovery'), `<div class="list">${recoveryPlan(g, raceSec).map(r => `<div class="li ${r.day === day ? 'on' : ''}"><span class="v num" style="min-width:64px">${esc(t('race.dayN', { n: r.day }))}</span><span class="grow small">${esc(r.text)}</span>${r.day === day ? pill(t('race.now'), 'accent') : ''}</div>`).join('')}</div>`, `${fmtDate(addDays(g.date!, 1))} …`);
  return h;
}

onChange('pack', el => {
  const g = D().raceGoal; if (!g) return;
  const rec = { ...((STATE.raceResults || {})[g.id] || { goalId: g.id }) };
  rec.packed = { ...(rec.packed || {}), [el.dataset.k!]: (el as HTMLInputElement).checked };
  STATE.raceResults = { ...(STATE.raceResults || {}), [g.id]: rec };
  saveSoon(); nav.rerender();
});
onChange('rr', el => {
  const g = D().recentRace; if (!g) return;
  const k = el.dataset.k!; const v = (el as HTMLInputElement).value.trim();
  const goal = { ...(STATE.goals[g.id] || g) };
  const r = { ...(goal.result || {}) };
  if (k === 'time') { const s = el.dataset.tf ? readTime(el) : parseHm(v); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } r.timeSec = s; }
  else if (k === 'split') { const s = readTime(el); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } r.splits = { ...(r.splits || {}), [el.dataset.sp!]: s }; if (!s) delete r.splits[el.dataset.sp!]; }
  else r[k] = v;
  // Prognose am Renntag einmal merken: Abweichung = persönlicher Korrekturfaktor für die nächsten Prognosen (Auftrag 12)
  if ((k === 'time' || k === 'split') && !r.predicted) {
    const pg = prognosisFor(g, g.date!);
    if (pg && pg.total) { const by: Record<string, number> = { total: Math.round(pg.total.best) }; (pg.parts || []).forEach(x => { if (x.sport && x.sport !== 'trans') by[x.sport] = Math.round((by[x.sport] || 0) + x.best); }); r.predicted = by; }
  }
  goal.result = r;
  STATE.goals = { ...STATE.goals, [g.id]: goal };
  saveState(); invalidate(); nav.rerender();
  if (k === 'time' && r.timeSec) toast(t('race.saved'));
});
void num; void on;
