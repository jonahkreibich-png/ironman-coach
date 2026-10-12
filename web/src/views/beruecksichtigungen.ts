/* Berücksichtigungen (Auftrag 4 C3, Auftrag 5 A2/A3): Wochenraster (welche Sportart an welchem Tag), Sätze in eigenen Worten mit
   „So habe ich es verstanden“, Können (Kraul, Laufen am Stück, längste Radfahrt) und Räder.
   Alles landet im Regel-Modell (shared/constraints.ts). Nach jeder Änderung werden die kommenden Wochen neu geplant und die
   laufende Woche sofort an die Regeln angepasst, mit Nachricht im Coach. */
import { profile, saveProfile, HAS_PLAN } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, field, select, toggle } from '../kit';
import { BIKE_OPTIONS } from '../../../shared/onboarding';
import { invalidate } from '../data';
import { replanFuture } from '../replan';
import { nav } from '../nav';
import { gridHtml, listHtml, addHtml, registerTarget } from './rules';

let DIRTY: string[] = [];
let LAST = '';
let TIMER: any = null;
registerTarget('cons', {
  get: () => { const p = profile(); return { notes: [...(p.notes || [])], rules: [...(p.rules || [])], dayLoad: p.dayLoad || {}, sports: p.sports, team: p.teamSport }; },
  set: (next, what) => { const p = profile(); p.notes = next.notes; p.rules = next.rules; saveProfile(p); changed(what); },
  setFreq: (sport, n, what) => { const p = profile(); p.freq = { ...(p.freq || {}), [sport]: [n, n] }; saveProfile(p); changed(what); }
});
export function renderBeruecksichtigungen(): string {
  const p = profile(); const sk = p.skills || {};
  let h = `<div class="hint" style="margin:0 2px var(--s3)">${esc(t('cons.intro'))}</div>`;
  if (LAST) h += `<div class="banner good" data-replanned style="margin-bottom:var(--s3)">${esc(LAST)}</div>`;
  h += sec(t('rules.gridTitle'), `<div class="card stack"><div class="hint">${esc(t('rules.gridHint'))}</div>${gridHtml('cons')}</div>`);
  h += sec(t('rules.notesTitle'), `<div class="hint" style="margin:0 2px var(--s2)">${esc(t('rules.notesHint'))}</div>${listHtml('cons')}<div style="margin-top:var(--s2)">${addHtml('cons')}</div>`);
  h += sec(t('cons.skills'), `<div class="card stack"><div class="fgrid">
    ${p.sports.includes('swim') ? select('cs-crawl', t('cons.crawl'), sk.swimCrawl || '', [['', '–'], ['yes', t('common.yes')], ['some', t('cons.some')], ['no', t('common.no')]], 'data-ch="cs" data-k="swimCrawl"') + field('cs-crawlm', t('cons.crawlM'), sk.swimCrawlM ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="swimCrawlM" data-num="1"' }) : ''}
    ${p.sports.includes('run') ? field('cs-run', t('cons.runMin'), sk.runContinuousMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="runContinuousMin" data-num="1"' }) : ''}
    ${p.sports.includes('bike') ? field('cs-bike', t('cons.bikeMin'), sk.bikeLongestMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="bikeLongestMin" data-num="1"' }) : ''}</div>
    ${p.sports.includes('swim') && sk.swimCrawl !== 'yes' ? toggle('cs-breast', t('cons.breast'), !!sk.swimBreast, 'data-ch="cs" data-k="swimBreast" data-bool="1"') : ''}
    ${p.sports.includes('bike') ? `<div class="lbl">${esc(t('cons.bikes'))}</div><div class="chips" style="flex-wrap:wrap">${BIKE_OPTIONS.map(([k, l]) => `<button class="chip ${(p.bikes || []).includes(k) ? 'on' : ''}" aria-pressed="${(p.bikes || []).includes(k)}" data-act="cs-bike" data-v="${k}">${esc(l)}</button>`).join('')}</div>` : ''}</div>`);
  if (!LAST && HAS_PLAN) h += `<div class="hint">${esc(t('cons.replanHint'))}</div>`;
  return h;
}
/* Nach jeder Änderung die kommenden Wochen anpassen (kurz gesammelt, damit mehrere Tipps eine Anpassung ergeben) */
function changed(what: string) {
  if (!DIRTY.includes(what)) DIRTY.push(what); invalidate(); nav.rerender();
  clearTimeout(TIMER); TIMER = setTimeout(replanNow, 600);
}
export function replanNow() {
  clearTimeout(TIMER); if (!DIRTY.length || !HAS_PLAN) return;
  const r = replanFuture(t('cons.reason'), t('cons.why', { list: DIRTY.join(', ') }));
  DIRTY = []; LAST = r.ok ? t('cons.replanned') + (r.changed && r.changed.length ? ' ' + t('cons.thisWeek', { list: r.changed.join('; ') }) : '') : r.msg; invalidate(); nav.rerender();
}
onChange('cs', el => {
  const p: any = profile(); const k = el.dataset.k!; const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) v = v === '' ? null : +v;
  p.skills = { ...(p.skills || {}), [k]: v || (v === 0 ? 0 : null) };
  saveProfile(p); changed(t('cons.skills'));
});
on('cs-bike', el => { const p = profile(); const v = el.dataset.v!; p.bikes = (p.bikes || []).includes(v) ? p.bikes.filter(x => x !== v) : [...(p.bikes || []), v]; saveProfile(p); changed(t('cons.bikes')); });
