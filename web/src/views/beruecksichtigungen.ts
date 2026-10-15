/* Berücksichtigungen (Auftrag 4 C3, Auftrag 5 A2/A3): Wochenraster (welche Sportart an welchem Tag), Sätze in eigenen Worten mit
   „So habe ich es verstanden“, Können (Kraul, Laufen am Stück, längste Radfahrt) und Räder.
   Alles landet im Regel-Modell (shared/constraints.ts). Änderungen werden erst vorgemerkt (Auftrag 6): „X Änderungen übernehmen“
   zeigt, was sich im Plan ändert, dann werden die kommenden Wochen neu geplant und die laufende Woche an die Regeln angepasst. */
import { profile, saveProfile, HAS_PLAN } from '../store';
import { stage, draftProfile, stageBarHtml, lastApplied } from '../staged';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, field, select, toggle } from '../kit';
import { BIKE_OPTIONS } from '../../../shared/onboarding';
import { invalidate } from '../data';
import { replanFuture } from '../replan';
import { nav } from '../nav';
import { gridHtml, listHtml, addHtml, registerTarget } from './rules';

const SCREEN = 'beruecksichtigungen';
const MONTH_OPTS = (): [string, string][] => Array.from({ length: 12 }, (_, i) => [String(i + 1), t('month.' + (i + 1))]);
const dataOf = (p: any) => ({ notes: [...(p.notes || [])], rules: [...(p.rules || [])], dayLoad: p.dayLoad || {}, sports: p.sports, team: p.teamSport });
registerTarget('cons', {
  get: () => dataOf(draftProfile(SCREEN)),
  base: () => dataOf(profile()),
  set: next => stage(SCREEN, p => { p.notes = next.notes; p.rules = next.rules; }),
  setFreq: (sport, n) => stage(SCREEN, p => { p.freq = { ...(p.freq || {}), [sport]: [n, n] }; })
});
/* Lösung aus einer Coach-Nachricht („Laufen auch am Mo erlauben?“): ein bewusster Tipp, gilt sofort */
registerTarget('now', {
  get: () => dataOf(profile()),
  set: (next, what) => { const p = profile(); p.notes = next.notes; p.rules = next.rules; saveProfile(p); replanFuture(t('cons.reason'), t('cons.why', { list: what })); invalidate(); nav.rerender(); },
  setFreq: (sport, n, what) => { const p = profile(); p.freq = { ...(p.freq || {}), [sport]: [n, n] }; saveProfile(p); replanFuture(t('cons.reason'), t('cons.why', { list: what })); invalidate(); nav.rerender(); }
});
export function renderBeruecksichtigungen(): string {
  const p = draftProfile(SCREEN); const sk = p.skills || {};
  const LAST = lastApplied(SCREEN);
  let h = `<div class="hint" style="margin:0 2px var(--s3)">${esc(t('cons.intro'))}</div>`;
  if (LAST) h += `<div class="banner good" data-replanned style="margin-bottom:var(--s3)">${esc(LAST)}</div>`;
  h += sec(t('rules.gridTitle'), `<div class="card stack"><div class="hint">${esc(t('rules.gridHint'))}</div>${gridHtml('cons')}</div>`);
  h += sec(t('rules.notesTitle'), `<div class="hint" style="margin:0 2px var(--s2)">${esc(t('rules.notesHint'))}</div>${listHtml('cons')}<div style="margin-top:var(--s2)">${addHtml('cons')}</div>`);
  h += sec(t('cons.skills'), `<div class="card stack"><div class="fgrid">
    ${p.sports.includes('swim') ? select('cs-crawl', t('cons.crawl'), sk.swimCrawl || '', [['', '–'], ['yes', t('common.yes')], ['some', t('cons.some')], ['no', t('common.no')]], 'data-ch="cs" data-k="swimCrawl"') + field('cs-crawlm', t('cons.crawlM'), sk.swimCrawlM ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="swimCrawlM" data-num="1"' }) : ''}
    ${p.sports.includes('run') ? field('cs-run', t('cons.runMin'), sk.runContinuousMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="runContinuousMin" data-num="1"' }) : ''}
    ${p.sports.includes('bike') ? field('cs-bike', t('cons.bikeMin'), sk.bikeLongestMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="bikeLongestMin" data-num="1"' }) : ''}</div>
    ${p.sports.includes('swim') ? `<div class="fgrid">${select('cs-pool', t('cons.pool'), String(sk.poolM || ''), [['', '–'], ['25', '25 m'], ['50', '50 m'], ['both', t('cons.poolBoth')]], 'data-ch="cs" data-k="poolM"')}</div>${toggle('cs-ow', t('cons.openWater'), !!sk.openWater, 'data-ch="cs" data-k="openWater" data-bool="1"')}${sk.openWater ? `<div class="fgrid">${select('cs-owf', t('cons.owFrom'), String(sk.openWaterFrom || 6), MONTH_OPTS(), 'data-ch="cs" data-k="openWaterFrom" data-num="1"')}${select('cs-owt', t('cons.owTo'), String(sk.openWaterTo || 9), MONTH_OPTS(), 'data-ch="cs" data-k="openWaterTo" data-num="1"')}</div>` : ''}` : ''}
    ${p.sports.includes('swim') && sk.swimCrawl !== 'yes' ? toggle('cs-breast', t('cons.breast'), !!sk.swimBreast, 'data-ch="cs" data-k="swimBreast" data-bool="1"') : ''}
    ${p.sports.includes('bike') ? `<div class="lbl">${esc(t('cons.bikes'))}</div><div class="chips" style="flex-wrap:wrap">${BIKE_OPTIONS.map(([k, l]) => `<button class="chip ${(p.bikes || []).includes(k) ? 'on' : ''}" aria-pressed="${(p.bikes || []).includes(k)}" data-act="cs-bike" data-v="${k}">${esc(l)}</button>`).join('')}</div>` : ''}</div>`);
  if (!LAST && HAS_PLAN) h += `<div class="hint">${esc(t('cons.replanHint'))}</div>`;
  return h + stageBarHtml(SCREEN);
}
onChange('cs', el => {
  const k = el.dataset.k!; const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) v = v === '' ? null : +v;
  if (k === 'poolM') v = v === '50' ? 50 : v === '25' ? 25 : v === 'both' ? 'both' : null;
  if (k === 'openWater' && v) { stage(SCREEN, (p: any) => { p.skills = { ...(p.skills || {}), openWater: true, openWaterFrom: (p.skills || {}).openWaterFrom || 6, openWaterTo: (p.skills || {}).openWaterTo || 9 }; }); return; }
  stage(SCREEN, (p: any) => { p.skills = { ...(p.skills || {}), [k]: v || (v === 0 ? 0 : null) }; });
});
on('cs-bike', el => { const v = el.dataset.v!; stage(SCREEN, p => { p.bikes = (p.bikes || []).includes(v) ? p.bikes.filter(x => x !== v) : [...(p.bikes || []), v]; }); });
