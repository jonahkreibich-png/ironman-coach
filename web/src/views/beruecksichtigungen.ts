/* Berücksichtigungen (Auftrag 4 C3, Auftrag 5 A2/A3): Wochenraster (welche Sportart an welchem Tag), Sätze in eigenen Worten mit
   „So habe ich es verstanden“, Können (Kraul, Laufen am Stück, längste Radfahrt), Krankheitsphasen und Zyklus. Räder, Hilfsmittel und Schuhe: Ausrüstung.
   Alles landet im Regel-Modell (shared/constraints.ts). Änderungen werden erst vorgemerkt (Auftrag 6): „X Änderungen übernehmen“
   zeigt, was sich im Plan ändert, dann werden die kommenden Wochen neu geplant und die laufende Woche an die Regeln angepasst. */
import { profile, saveProfile, HAS_PLAN } from '../store';
import { stage, draftProfile, stageBarHtml, lastApplied } from '../staged';
import { esc } from '../util';
import { t } from '../../../shared/i18n';
import { on, onChange, sec, field, select, toggle } from '../kit';
import { BIKE_OPTIONS, SWIM_GEAR_OPTIONS } from '../../../shared/onboarding';
import { invalidate } from '../data';
import { replanFuture } from '../replan';
import { nav } from '../nav';
import { toast } from '../toast';
import { gridHtml, listHtml, addHtml, registerTarget, weekHtml } from './rules';
import { weekSummary } from '../../../shared/weekgrid';
import { dayCap } from '../../../shared/plangen';
import { todayStr } from '../util';
import { illnessCard, cycleCard, shoeCard } from './einstellungen';

const SCREEN = 'beruecksichtigungen';
const MONTH_OPTS = (): [string, string][] => Array.from({ length: 12 }, (_, i) => [String(i + 1), t('month.' + (i + 1))]);
/* alte Profile ohne „Zeit pro Tag“: die Zeiten, mit denen der Plan rechnet (alte Zeitfenster oder Standard), als Raster zeigen */
const dayLoadOf = (p: any) => Object.keys(p.dayLoad || {}).length ? p.dayLoad : Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => { const m = dayCap(p, d); return [d, m <= 0 ? 0 : m <= 45 ? 1 : m <= 90 ? 2 : 3]; }));
const dataOf = (p: any) => ({ notes: [...(p.notes || [])], rules: [...(p.rules || [])], dayLoad: dayLoadOf(p), sports: p.sports, team: p.teamSport,
  weeklyHours: p.weeklyHours, weeklyHoursSet: p.weeklyHoursSet !== false, maxDayHours: p.maxDayHours, freq: p.freq });
registerTarget('cons', {
  get: () => dataOf(draftProfile(SCREEN)),
  base: () => dataOf(profile()),
  set: next => stage(SCREEN, p => { p.notes = next.notes; p.rules = next.rules; }),
  setFreq: (sport, n) => stage(SCREEN, p => { p.freq = { ...(p.freq || {}), [sport]: [n, n] }; }),
  // Wochenraster (Auftrag 11): Zeit pro Tag, Limit, längster Tag, Häufigkeit – Stunden nie über der Zeit im Raster
  setWeek: patch => stage(SCREEN, (p: any) => { if (patch.dayLoad && !Object.keys(p.dayLoad || {}).length) p.dayLoad = dayLoadOf(p); Object.assign(p, patch); const ws = weekSummary(dataOf(p), todayStr()); if (patch.dayLoad) { p.weeklyHours = ws.weeklyHours; p.maxDayHours = ws.maxDayHours; } })
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
  h += sec(t('rules.gridTitle'), `<div class="card stack"><div class="hint">${esc(t('week.hint'))}</div>${weekHtml('cons')}</div>`);
  h += sec(t('cons.team'), teamCard(p));
  h += sec(t('rules.notesTitle'), `<div class="hint" style="margin:0 2px var(--s2)">${esc(t('rules.notesHint'))}</div>${listHtml('cons')}<div style="margin-top:var(--s2)">${addHtml('cons')}</div>`);
  h += sec(t('cons.skills'), `<div class="card stack"><div class="fgrid">
    ${p.sports.includes('swim') ? select('cs-crawl', t('cons.crawl'), sk.swimCrawl || '', [['', '–'], ['yes', t('common.yes')], ['some', t('cons.some')], ['no', t('common.no')]], 'data-ch="cs" data-k="swimCrawl"') + field('cs-crawlm', t('cons.crawlM'), sk.swimCrawlM ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="swimCrawlM" data-num="1"' }) : ''}
    ${p.sports.includes('run') ? field('cs-run', t('cons.runMin'), sk.runContinuousMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="runContinuousMin" data-num="1"' }) : ''}
    ${p.sports.includes('bike') ? field('cs-bike', t('cons.bikeMin'), sk.bikeLongestMin ?? '', { inputmode: 'numeric', data: 'data-ch="cs" data-k="bikeLongestMin" data-num="1"' }) : ''}</div>
    ${p.sports.includes('swim') ? `<div class="fgrid">${select('cs-pool', t('cons.pool'), String(sk.poolM || ''), [['', '–'], ['25', '25 m'], ['50', '50 m'], ['both', t('cons.poolBoth')]], 'data-ch="cs" data-k="poolM"')}</div>${toggle('cs-ow', t('cons.openWater'), !!sk.openWater, 'data-ch="cs" data-k="openWater" data-bool="1"')}${sk.openWater ? `<div class="fgrid">${select('cs-owf', t('cons.owFrom'), String(sk.openWaterFrom || 6), MONTH_OPTS(), 'data-ch="cs" data-k="openWaterFrom" data-num="1"')}${select('cs-owt', t('cons.owTo'), String(sk.openWaterTo || 9), MONTH_OPTS(), 'data-ch="cs" data-k="openWaterTo" data-num="1"')}</div>` : ''}` : ''}
    ${p.sports.includes('swim') && sk.swimCrawl !== 'yes' ? toggle('cs-breast', t('cons.breast'), !!sk.swimBreast, 'data-ch="cs" data-k="swimBreast" data-bool="1"') : ''}
    ${p.sports.includes('run') || p.sports.includes('bike') ? `<div class="lbl">${esc(t('cons.terrain'))}</div><div class="chips" style="flex-wrap:wrap" data-terrain>${[['hills', t('cons.terrainHills')], ['track', t('cons.terrainTrack')]].map(([k, l]) => { const on0 = !!(p.terrain && (p.terrain as any)[k]); return `<button class="chip ${on0 ? 'on' : ''}" aria-pressed="${on0}" data-act="cs-terrain" data-v="${k}">${esc(l)}</button>`; }).join('')}</div><div class="hint">${esc(t('cons.terrainHint'))}</div>` : ''}</div>`);
  if (!LAST && HAS_PLAN) h += `<div class="hint">${esc(t('cons.replanHint'))}</div>`;
  h += sec(t('set.illness'), illnessCard());
  if (p.sex !== 'm') h += sec(t('set.cycle'), cycleCard());
  return h + stageBarHtml(SCREEN);
}

/* Auftrag 25: Ausrüstung als eigene Seite (Räder, Wattmesser, Rolle, Schwimm-Hilfsmittel, Laufschuhe). Änderungen an Rad und Hilfsmitteln
   bestimmen den Plan und werden wie bisher erst vorgemerkt; die Laufschuhe gelten sofort. */
const GEAR = 'ausruestung';
export function renderAusruestung(): string {
  const p = draftProfile(GEAR); const sk = p.skills || {};
  const LAST = lastApplied(GEAR);
  let h = LAST ? `<div class="banner good" data-replanned style="margin-bottom:var(--s3)">${esc(LAST)}</div>` : '';
  const bike = p.sports.includes('bike') ? `<div class="card stack" data-gear-bike><div class="lbl">${esc(t('cons.bikes'))}</div><div class="chips" style="flex-wrap:wrap">${BIKE_OPTIONS.map(([k, l]) => `<button class="chip ${(p.bikes || []).includes(k) ? 'on' : ''}" aria-pressed="${(p.bikes || []).includes(k)}" data-act="cs-bike" data-v="${k}">${esc(l)}</button>`).join('')}</div>${toggle('cs-pm', t('cons.powerMeter'), !!p.powerMeter, 'data-ch="cs-pm"')}${(p.bikes || []).some(b => b === 'trainer' || b === 'spin') ? `<div>${select('cs-tt', t('cons.trainer'), p.trainerType || '', [['', '–'], ['smart', t('cons.trainerSmart')], ['basic', t('cons.trainerBasic')]], 'data-ch="cs-tt"')}</div><div class="hint">${esc(t('cons.trainerHint'))}</div>` : ''}</div>` : '';
  const swim = p.sports.includes('swim') ? `<div class="card stack" data-gear-swim><div class="lbl">${esc(t('cons.swimGear'))}</div><div class="chips" style="flex-wrap:wrap" data-swimgear>${SWIM_GEAR_OPTIONS.map(([k, l]) => `<button class="chip ${((sk.swimGear || []) as string[]).includes(k) ? 'on' : ''}" aria-pressed="${((sk.swimGear || []) as string[]).includes(k)}" data-act="cs-gear" data-v="${k}">${esc(l)}</button>`).join('')}</div><div class="hint">${esc(t(sk.swimGear == null ? 'cons.swimGearNone' : 'cons.swimGearHint'))}</div></div>` : '';
  if (bike) h += sec(t('gear.bike'), bike);
  if (swim) h += sec(t('gear.swim'), swim);
  if (p.sports.includes('run')) h += sec(t('gear.run'), shoeCard());
  if (!bike && !swim && !p.sports.includes('run')) h += `<div class="card"><div class="hint">${esc(t('gear.none'))}</div></div>`;
  return h + stageBarHtml(GEAR);
}
onChange('cs', el => {
  const k = el.dataset.k!; const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) v = v === '' ? null : +v;
  if (k === 'poolM') v = v === '50' ? 50 : v === '25' ? 25 : v === 'both' ? 'both' : null;
  if (k === 'openWater' && v) { stage(SCREEN, (p: any) => { p.skills = { ...(p.skills || {}), openWater: true, openWaterFrom: (p.skills || {}).openWaterFrom || 6, openWaterTo: (p.skills || {}).openWaterTo || 9 }; }); return; }
  stage(SCREEN, (p: any) => { p.skills = { ...(p.skills || {}), [k]: v || (v === 0 ? 0 : null) }; });
});
on('cs-gear', el => { const v = el.dataset.v!; stage(GEAR, (p: any) => { const cur: string[] = (p.skills || {}).swimGear || []; p.skills = { ...(p.skills || {}), swimGear: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }; }); });
on('cs-terrain', el => { const v = el.dataset.v as 'hills' | 'track'; stage(SCREEN, (p: any) => { const cur = { ...(p.terrain || {}) }; cur[v] = !cur[v]; p.terrain = cur; }); });
onChange('cs-pm', el => { const v = (el as HTMLInputElement).checked; stage(GEAR, p => { p.powerMeter = v; }); });
onChange('cs-tt', el => { const v = (el as HTMLSelectElement).value; stage(GEAR, p => { p.trainerType = v === 'smart' || v === 'basic' ? v : null; }); });
on('cs-bike', el => { const v = el.dataset.v!; stage(GEAR, p => { p.bikes = (p.bikes || []).includes(v) ? p.bikes.filter(x => x !== v) : [...(p.bikes || []), v]; }); });

/* Teamsport mit derselben Logik wie im Fragebogen (Auftrag 11): erst „Gibt es Spiele?“, nur dann Spieltage und Dauer */
const DOWS = [1, 2, 3, 4, 5, 6, 0];
function teamCard(p: any): string {
  const ts = p.teamSport;
  const yn = (act: string, on: boolean | null) => `<div class="seg">${[['1', t('common.yes')], ['0', t('common.no')]].map(([k, l]) => `<button class="${(on === true && k === '1') || (on === false && k === '0') ? 'on' : ''}" data-act="${act}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
  const days = (key: string, sel: number[]) => `<div class="daychips">${DOWS.map(d => `<button class="chip ${sel.includes(d) ? 'on' : ''}" aria-pressed="${sel.includes(d)}" data-act="ct-day" data-k="${key}" data-d="${d}">${esc(t('dow.' + d))}</button>`).join('')}</div>`;
  if (!ts) return `<div class="card stack" data-team-card><div class="lab">${esc(t('cons.teamYes'))}</div>${yn('ct-yes', false)}</div>`;
  const games = (ts.gameDays || []).length > 0 || ts.gameMinutes > 0;
  return `<div class="card stack" data-team-card><div class="lab">${esc(t('cons.teamYes'))}</div>${yn('ct-yes', true)}
    <div class="fgrid">${field('ct-name', t('prof.teamSport'), ts.name || '', { data: 'data-ch="ct" data-k="name"' })}${field('ct-tmin', t('cons.teamMin'), ts.trainingMinutes || 90, { inputmode: 'numeric', data: 'data-ch="ct" data-k="trainingMinutes" data-num="1"' })}</div>
    <div class="lab">${esc(t('cons.teamDays'))}</div>${days('trainingDays', ts.trainingDays || [])}
    <div class="lab">${esc(t('cons.teamGames'))}</div>${yn('ct-games', games)}
    ${games ? `<div class="lab">${esc(t('cons.gameDays'))}</div>${days('gameDays', ts.gameDays || [])}<div class="fgrid">${field('ct-gmin', t('cons.gameMin'), ts.gameMinutes || 90, { inputmode: 'numeric', data: 'data-ch="ct" data-k="gameMinutes" data-num="1"' })}</div>` : `<div class="hint">${esc(t('cons.noGames'))}</div>`}</div>`;
}
on('ct-yes', el => stage(SCREEN, (p: any) => {
  if (el.dataset.v === '1') { if (!p.teamSport) p.teamSport = { name: p.teamSportName || 'Teamsport', trainingDays: [], trainingMinutes: 90, gameDays: [], gameMinutes: 0, seasonFrom: null, seasonTo: null }; if (!p.sports.includes('football')) p.sports = [...p.sports, 'football']; }
  else { p.teamSport = null; p.sports = p.sports.filter((x: string) => x !== 'football'); }
}));
on('ct-games', el => stage(SCREEN, (p: any) => { if (!p.teamSport) return; if (el.dataset.v === '1') p.teamSport = { ...p.teamSport, gameMinutes: p.teamSport.gameMinutes || 90 }; else p.teamSport = { ...p.teamSport, gameDays: [], gameMinutes: 0 }; }));
on('ct-day', el => stage(SCREEN, (p: any) => { if (!p.teamSport) return; const k = el.dataset.k!; const d = +el.dataset.d!; const cur: number[] = p.teamSport[k] || []; p.teamSport = { ...p.teamSport, [k]: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort() }; }));
onChange('ct', el => { const k = el.dataset.k!; let v: any = (el as HTMLInputElement).value; if (el.dataset.num) { v = parseInt(v, 10); if (!(v >= 15 && v <= 240)) { toast(t('ob.range', { min: 15, max: 240 })); return; } } stage(SCREEN, (p: any) => { if (!p.teamSport) return; p.teamSport = { ...p.teamSport, [k]: v }; if (k === 'name') p.teamSportName = v; }); });
