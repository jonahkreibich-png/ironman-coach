/* Berücksichtigungen (Auftrag 4 C3): Können (Kraul, Laufen am Stück, längste Radfahrt) und freie Notizen
   (Verletzungen, Vorlieben, Ausrüstung, Schwimmbad-Zeiten). Die Engine ordnet Notizen bekannten Kategorien zu;
   was sie nicht versteht, steht als „noch nicht berücksichtigt“ da. Nach jeder Änderung werden die kommenden Wochen angepasst. */
import { profile, saveProfile, HAS_PLAN } from '../store';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, field, select, toggle, ic, pill, armed } from '../kit';
import { parseConsiderations } from '../../../shared/considerations';
import { BIKE_OPTIONS } from '../../../shared/onboarding';
import { invalidate } from '../data';
import { replanFuture } from '../replan';
import { nav } from '../nav';
import { toast } from '../toast';

let DIRTY: string[] = [];
let LAST = '';
let TIMER: any = null;
export function renderBeruecksichtigungen(): string {
  const p = profile(); const sk = p.skills || {};
  const cons = parseConsiderations([...(p.notes || [])]);
  let h = `<div class="hint" style="margin:0 2px var(--s3)">${esc(t('cons.intro'))}</div>`;
  h += sec(t('cons.skills'), `<div class="card stack"><div class="fgrid">
    ${p.sports.includes('swim') ? select('cs-crawl', t('cons.crawl'), sk.swimCrawl || '', [['', '–'], ['yes', t('common.yes')], ['some', t('cons.some')], ['no', t('common.no')]], 'data-ch="cs" data-k="swimCrawl"') + field('cs-crawlm', t('cons.crawlM'), sk.swimCrawlM ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="swimCrawlM" data-num="1"' }) : ''}
    ${p.sports.includes('run') ? field('cs-run', t('cons.runMin'), sk.runContinuousMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="runContinuousMin" data-num="1"' }) : ''}
    ${p.sports.includes('bike') ? field('cs-bike', t('cons.bikeMin'), sk.bikeLongestMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="bikeLongestMin" data-num="1"' }) : ''}</div>
    ${p.sports.includes('swim') && sk.swimCrawl !== 'yes' ? toggle('cs-breast', t('cons.breast'), !!sk.swimBreast, 'data-ch="cs" data-k="swimBreast" data-bool="1"') : ''}
    ${p.sports.includes('bike') ? `<div class="lbl">${esc(t('cons.bikes'))}</div><div class="chips" style="flex-wrap:wrap">${BIKE_OPTIONS.map(([k, l]) => `<button class="chip ${(p.bikes || []).includes(k) ? 'on' : ''}" aria-pressed="${(p.bikes || []).includes(k)}" data-act="cs-bike" data-v="${k}">${esc(l)}</button>`).join('')}</div>` : ''}</div>`);
  h += sec(t('cons.notes'), `<div class="list" data-cons-list>${cons.map((c, i) => `<div class="li" data-cons="${i}"><span class="grow"><span class="t">${esc(c.text)}</span><br><span class="s">${c.understood ? esc(t('cons.understood', { l: c.label, e: c.effect })) : esc(t('cons.notUnderstood'))}</span></span>${c.understood ? pill(t('cons.used'), 'good') : pill(t('cons.notUsed'), 'warn')}<button class="icon-btn" data-act="cons-del" data-i="${i}" aria-label="${esc(t('common.remove'))}">${ic('close')}</button></div>`).join('') || `<div class="li"><span class="muted">${esc(t('cons.none'))}</span></div>`}</div>
    <div class="row" style="margin-top:var(--s2)"><input class="inp grow" id="cons-new" placeholder="${esc(t('cons.ph'))}"><button class="btn" data-act="cons-add">${ic('plus')}</button></div>`);
  if (LAST) h += `<div class="banner good" data-replanned>${esc(LAST)}</div>`;
  else if (HAS_PLAN) h += `<div class="hint">${esc(t('cons.replanHint'))}</div>`;
  return h;
}
/* Nach jeder Änderung die kommenden Wochen anpassen (kurz gesammelt, damit mehrere Eingaben eine Anpassung ergeben) */
function changed(what: string) {
  if (!DIRTY.includes(what)) DIRTY.push(what); invalidate(); nav.rerender();
  clearTimeout(TIMER); TIMER = setTimeout(replanNow, 500);
}
export function replanNow() {
  clearTimeout(TIMER); if (!DIRTY.length || !HAS_PLAN) return;
  const r = replanFuture(t('cons.reason'), t('cons.why', { list: DIRTY.join(', ') }));
  DIRTY = []; LAST = r.ok ? t('cons.replanned') : r.msg; invalidate(); nav.rerender();
}
onChange('cs', el => {
  const p: any = profile(); const k = el.dataset.k!; const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) v = v === '' ? null : +v;
  p.skills = { ...(p.skills || {}), [k]: v || (v === 0 ? 0 : null) };
  saveProfile(p); changed(t('cons.skills'));
});
on('cs-bike', el => { const p = profile(); const v = el.dataset.v!; p.bikes = (p.bikes || []).includes(v) ? p.bikes.filter(x => x !== v) : [...(p.bikes || []), v]; saveProfile(p); changed(t('cons.bikes')); });
on('cons-add', () => {
  const inp = document.getElementById('cons-new') as HTMLInputElement; const v = inp.value.trim(); if (!v) return;
  const p = profile(); p.notes = [...(p.notes || []), v.slice(0, 200)]; saveProfile(p);
  const c = parseConsiderations([v])[0];
  toast(c && c.understood ? t('cons.addedOk', { l: c.label }) : t('cons.addedUnknown'));
  changed(v);
});
on('cons-del', el => {
  if (!armed(el, '?')) return;
  const p = profile(); const i = +el.dataset.i!; const txt = (p.notes || [])[i]; p.notes = (p.notes || []).filter((_, j) => j !== i); saveProfile(p); changed(t('cons.removed', { t: txt || '' }));
});

