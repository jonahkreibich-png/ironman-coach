/* Einstellungen: Darstellung, Heute-Ansicht, Zonen und Schwellen, Ampel-Rückfallwerte, Mitteilungen, Krankheitsphasen,
   KI-Coach (Schalter, Einwilligung, Budget, Kosten) und die manuelle Score-Korrektur. */
import { STATE, UI, saveState, saveUi, profile, saveProfile } from '../store';
import { esc, fmtDate, parseNum, paceToSec, secToPace, todayStr, addDays } from '../util';
import { t, num } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, field, select, toggle, armed, more, refreshSheet, openSheet, closeSheet, sportLabel, timeField, readTime } from '../kit';
import { hrZonesFor, powerZonesFor, swimZonesFor } from '../../../shared/sports';
import { setThreshold, isEstimated, estimateThresholds, type ThresholdKey } from '../../../shared/profile';
import { aiState, loadAiState, isSyncOn, pushSupported, pushStatus, enablePush, disablePush, apiCall } from '../sync';
import { invalidate, D } from '../data';
import { needsParentConsent } from '../../../shared/features';
import { STORAGE, APP } from '../config';
import { nav } from '../nav';
import { toast } from '../toast';

const NOTIFY_DEFAULTS = {
  types: { morning: true, preSession: true, eveEarly: true, evening: true, warnings: true, adductors: true, food: true, weekly: true, achievements: true },
  times: { morningSchool: '06:45', morningWeekend: '09:00', eveEarly: '21:00', evening: '20:30', adductors: '19:00', food: '18:00', weekly: '18:00' },
  quietStart: '22:30', quietEnd: '06:00', holidays: false
};
const NOTIFY_ROWS: [string, string[]][] = [
  ['morning', ['morningSchool', 'morningWeekend']], ['preSession', []], ['eveEarly', ['eveEarly']], ['evening', ['evening']],
  ['warnings', []], ['adductors', ['adductors']], ['food', ['food']], ['weekly', ['weekly']], ['achievements', []]
];
function notifyPrefs() {
  const p = (STATE.settings && STATE.settings.notify) || {};
  return { ...NOTIFY_DEFAULTS, ...p, types: { ...NOTIFY_DEFAULTS.types, ...(p.types || {}) }, times: { ...NOTIFY_DEFAULTS.times, ...(p.times || {}) } };
}
export const isStandalone = () => (navigator as any).standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let PUSH: any = undefined;

const theme = () => { try { return localStorage.getItem(STORAGE.theme) || ''; } catch (e) { return ''; } };
export function applyTheme(v: string) {
  if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(STORAGE.theme, v); } catch (e) {}
}

export function renderEinstellungen(): string {
  let h = sec(t('set.look'), `<div class="card stack"><div class="seg" role="group" aria-label="${esc(t('set.theme'))}">${[['', t('set.system')], ['light', t('set.light')], ['dark', t('set.dark')]].map(([v, l]) => `<button class="${theme() === v ? 'on' : ''}" data-act="set-theme" data-v="${v}" aria-pressed="${theme() === v}">${esc(l)}</button>`).join('')}</div>
    <div class="lbl">${esc(t('set.heuteVariant'))}</div><div class="seg">${[['answer', t('set.variantA')], ['feed', t('set.variantB')]].map(([v, l]) => `<button class="${(UI.heuteVariant || 'answer') === v ? 'on' : ''}" data-act="set-variant" data-v="${v}">${esc(l)}</button>`).join('')}</div></div>`);
  h += sec(t('set.zones'), zonesCard(), t('set.zonesAside'));
  h += sec(t('set.notify'), notifyCard());
  h += sec(t('set.ai'), aiCard());
  h += sec(t('set.illness'), illnessCard());
  h += sec(t('set.ready'), readyCard(), t('set.readyAside'));
  h += sec(t('set.score'), scoreCard(), t('set.scoreAside'));
  return h;
}

/* ---------- Zonen ---------- */
function zonesCard(): string {
  const p = profile(); const th = p.thresholds;
  const zc = ['var(--rest)', 'var(--info)', 'var(--good)', 'var(--warn)', 'var(--bad)'];
  const run = hrZonesFor(th.lthrRun), bike = hrZonesFor(th.lthrBike);
  const pace = (pct: number) => secToPace(th.thresholdPaceRunSec * 100 / pct);
  // Pace-Zonen: dieselben Prozent der Schwelle wie beim Puls (schneller = höherer Prozentwert)
  const PCT = [[0, 81], [81, 89], [90, 93], [94, 102], [102, 999]];
  const paceRange = (i: number) => { const [lo, hi] = PCT[i]; return lo === 0 ? '> ' + pace(hi) : hi >= 999 ? '< ' + pace(lo) : `${pace(hi)}–${pace(lo)}`; };
  const tbl = (rows: string[]) => `<div class="scroll-x"><table class="tbl"><tbody>${rows.join('')}</tbody></table></div>`;
  const hasRun = p.sports.includes('run'), hasBike = p.sports.includes('bike'), hasSwim = p.sports.includes('swim');
  const est = (k: ThresholdKey) => isEstimated(p, k) ? ' ' + t('set.estShort') : '';
  return `<div class="card stack">${estimatedNote(p)}<div class="fgrid">
    ${hasRun ? field('z-lr', t('set.lthrRun') + est('lthrRun'), th.lthrRun, { inputmode: 'numeric', data: 'data-ch="thr" data-k="lthrRun"' }) + timeField('z-tp', t('set.paceRun') + est('thresholdPaceRunSec'), th.thresholdPaceRunSec, 'ms', 'data-ch="thr" data-k="thresholdPaceRunSec"') : ''}
    ${hasBike ? field('z-lb', t('set.lthrBike') + est('lthrBike'), th.lthrBike, { inputmode: 'numeric', data: 'data-ch="thr" data-k="lthrBike"' }) + field('z-ftp', t('set.ftp'), th.ftp ?? '', { inputmode: 'numeric', data: 'data-ch="thr" data-k="ftp"' }) + field('z-ts', t('set.speedBike') + est('thresholdSpeedBikeKmh'), th.thresholdSpeedBikeKmh, { inputmode: 'decimal', data: 'data-ch="thr" data-k="thresholdSpeedBikeKmh"' }) : ''}
    ${hasSwim ? timeField('z-css', t('set.css') + est('cssSec'), th.cssSec, 'ms', 'data-ch="thr" data-k="cssSec"') : ''}
    ${field('z-max', t('set.maxHr') + est('maxHr'), th.maxHr ?? '', { inputmode: 'numeric', data: 'data-ch="thr" data-k="maxHr"' })}</div>
    ${hasRun ? `<div class="lbl">${esc(sportLabel('run'))}</div>` + tbl(run.map((z, i) => `<tr><td><b style="color:${zc[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td class="num">${z.lo}${z.hi ? '–' + z.hi : '+'} bpm</td><td class="num">${paceRange(i)}/km</td></tr>`)) : ''}
    ${hasBike ? `<div class="lbl">${esc(sportLabel('bike'))}</div>` + tbl(bike.map((z, i) => { const pw = th.ftp ? powerZonesFor(th.ftp)[i] : null; return `<tr><td><b style="color:${zc[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td class="num">${z.lo}${z.hi ? '–' + z.hi : '+'} bpm</td><td class="num">${pw ? `${pw.lo}${pw.hi ? '–' + pw.hi : '+'} W` : ''}</td></tr>`; })) : ''}
    ${hasSwim && th.cssSec ? `<div class="lbl">${esc(sportLabel('swim'))}</div>` + tbl(swimZonesFor(th.cssSec).map((z, i) => `<tr><td><b style="color:${zc[i]}">Z${z.zone}</b></td><td>${esc(z.label)}</td><td class="num">${secToPace(z.fast)}–${secToPace(z.slow)} /100 m</td></tr>`)) : ''}
    <div class="hint">${esc(t('set.zonesHint'))}</div></div>`;
}
/* Geschätzte Werte: Hinweis mit Herkunft und Test-Vorschlag */
function estimatedNote(p: any): string {
  const est = (p.thresholds.estimated || []) as ThresholdKey[];
  if (!est.length) return '';
  const basis = estimateThresholds(p, todayStr()).basis;
  const names = est.map(k => `${t('set.thr.' + k)} (${basis[k] || t('set.estimated')})`).join(', ');
  return `<div class="banner info" data-estimated>${esc(t('set.estimatedNote', { list: names }))}</div>`;
}
onChange('thr', el => {
  const p = profile(); const k = el.dataset.k!; const raw = (el as HTMLInputElement).value.trim();
  let v: number | null = el.dataset.tf ? readTime(el) : (k === 'thresholdPaceRunSec' || k === 'cssSec') ? paceToSec(raw) : parseNum(raw);
  if (el.dataset.tf && v == null && k !== 'cssSec') return; // Feld wird gerade geleert
  if (v != null && isNaN(v)) { toast(t('time.invalid')); return; }
  if ((raw === '' || v == null) && (k === 'ftp' || k === 'cssSec' || k === 'maxHr')) v = null;
  else if (v == null || v <= 0) { toast(t('common.invalidNumber')); return; }
  const lim: Record<string, [number, number]> = { lthrRun: [100, 215], lthrBike: [100, 215], maxHr: [120, 230], ftp: [50, 600], thresholdSpeedBikeKmh: [10, 60], thresholdPaceRunSec: [150, 600], cssSec: [50, 240] };
  if (v != null && lim[k] && (v < lim[k][0] || v > lim[k][1])) { toast(t('set.outOfRange')); return; }
  saveProfile(setThreshold(p, k as ThresholdKey, v)); invalidate(); if (!el.dataset.tf) nav.rerender(); toast(t('common.saved'));
});

/* ---------- Mitteilungen ---------- */
function notifyCard(): string {
  if (!isSyncOn()) return `<div class="card"><div class="hint">${esc(t('set.notifyNeedSync'))}</div></div>`;
  if (PUSH === undefined) { PUSH = null; pushStatus().then(s => { PUSH = s || { configured: false }; nav.rerender(); }); }
  const P = notifyPrefs();
  let head: string;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  if (!pushSupported() || (isIOS() && !isStandalone())) head = `<div class="hint">${esc(t('set.notifyInstall'))}</div>`;
  else if (PUSH && PUSH.configured === false) head = `<div class="hint">${esc(t('set.notifyServer'))}</div>`;
  else if (perm === 'denied') head = `<div class="hint">${esc(t('set.notifyBlocked', { app: APP.shortName }))}</div>`;
  else if (PUSH && PUSH.thisDevice && perm === 'granted') head = `<div class="spread"><span class="sync-st ok">${esc(t('set.notifyOn'))}</span><button class="btn ghost sm" data-act="push-test">${esc(t('set.notifyTest'))}</button></div>`;
  else head = `<div class="hint">${esc(t('set.notifyAsk'))}</div><button class="btn" data-act="push-on">${ic('bell')} ${esc(t('set.notifyAllow'))}</button>`;
  const rows = NOTIFY_ROWS.map(([k, times]) => `<div>${toggle('np-' + k, t('notify.' + k), !!(P.types as any)[k], `data-ch="np" data-p="types.${k}"`)}${times.length ? `<div class="row" style="margin:4px 0 6px 44px;gap:8px">${times.map(tk => `<label class="small muted">${esc(t('notify.t.' + tk))} <input class="inp sm" type="time" data-ch="np" data-p="times.${tk}" value="${esc((P.times as any)[tk])}"></label>`).join('')}</div>` : ''}</div>`).join('');
  return `<div class="card stack">${head}${more(t('set.notifyWhich'), `<div class="stack">${rows}
    ${toggle('np-hol', t('set.holidays'), !!P.holidays, 'data-ch="np" data-p="holidays"')}
    <div class="row" style="gap:8px"><label class="small muted">${esc(t('set.quietFrom'))} <input class="inp sm" type="time" data-ch="np" data-p="quietStart" value="${esc(P.quietStart)}"></label><label class="small muted">${esc(t('set.quietTo'))} <input class="inp sm" type="time" data-ch="np" data-p="quietEnd" value="${esc(P.quietEnd)}"></label></div>
    <div class="hint">${esc(t('set.notifyHint'))}</div></div>`)}
    ${PUSH && PUSH.thisDevice ? `<button class="link" data-act="push-off">${esc(t('set.notifyOff'))}</button>` : ''}</div>`;
}
onChange('np', el => {
  STATE.settings.notify = notifyPrefs();
  const inp = el as HTMLInputElement; const val = inp.type === 'checkbox' ? inp.checked : inp.value;
  const parts = el.dataset.p!.split('.');
  if (parts.length === 2) STATE.settings.notify[parts[0]][parts[1]] = val; else STATE.settings.notify[parts[0]] = val;
  saveState(); toast(t('common.saved'));
});
on('push-on', async el => { (el as HTMLButtonElement).disabled = true; try { await enablePush(); PUSH = await pushStatus(); toast(t('set.notifyOn')); } catch (e: any) { toast(e.message); } nav.rerender(); });
on('push-off', async () => { try { await disablePush(); PUSH = await pushStatus(); } catch (e: any) { toast(e.message); } nav.rerender(); });
on('push-test', async () => { try { const r = await apiCall('POST', '/api/push/test'); toast(r.delivered ? t('set.testSent') : t('set.testNone')); } catch (e: any) { toast(e.message); } });

/* ---------- KI-Coach ---------- */
function aiCard(): string {
  const A = aiState(); const S = STATE.settings.ai || {};
  const minor = D().minor; const parent = needsParentConsent(D().age);
  let status: string;
  if (!isSyncOn()) status = t('ai.needSync');
  else if (A.entitled === false) status = t('ai.notEntitled');
  else if (!A.keyPresent) status = t('ai.noKey');
  else if (!S.consentAt) status = t('ai.noConsent');
  else if (!S.enabled) status = t('ai.off');
  else status = A.active ? t('ai.on') : t('ai.limit');
  return `<div class="card stack"><div class="spread"><span>${esc(status)}</span>${pill(A.active ? t('ai.activePill') : t('ai.freePill'), A.active ? 'good' : '')}</div>
    <div class="hint">${esc(t('ai.freeExplain'))}</div>
    ${S.consentAt ? toggle('ai-on', t('ai.switch'), !!S.enabled, 'data-ch="ai-on"') : `<button class="btn ghost" data-act="ai-consent">${ic('lock')} ${esc(t('ai.consentOpen'))}</button>`}
    ${A.keyPresent ? `<div class="kv"><span class="muted">${esc(t('ai.costMonth'))}</span><b class="num">${num(A.monthUsd, 2)} $ / ${num(A.budgetUsd, 0)} $</b></div><div class="kv"><span class="muted">${esc(t('ai.today'))}</span><b class="num">${A.todayMessages} / ${A.maxPerDay}</b></div>
      <div class="fgrid">${select('ai-budget', t('ai.budget'), String(S.budgetUsd || A.budgetUsd || 5), [['2', '2 $'], ['5', '5 $'], ['10', '10 $'], ['20', '20 $']], 'data-ch="ai-set" data-k="budgetUsd"')}${select('ai-max', t('ai.maxDay'), String(S.maxPerDay || A.maxPerDay || 30), [['10', '10'], ['30', '30'], ['60', '60']], 'data-ch="ai-set" data-k="maxPerDay"')}</div>` : ''}
    ${parent ? `<div class="hint">${esc(t('ai.parentHint'))}</div>` : minor ? `<div class="hint">${esc(t('ai.minorHint'))}</div>` : ''}
    ${S.consentAt ? `<button class="link" data-act="ai-revoke">${esc(t('ai.revoke'))}</button>` : ''}</div>`;
}
function consentSheet(): string {
  const minor = needsParentConsent(D().age);
  return `<div class="stack"><div class="hint">${esc(t('ai.consentIntro'))}</div>
    <ul class="small" style="padding-left:18px;margin:0">${[1, 2, 3, 4, 5, 6].map(i => `<li>${esc(t('ai.c' + i))}</li>`).join('')}</ul>
    ${toggle('ai-c-read', t('ai.cAgree'), false)}
    ${minor ? toggle('ai-c-parent', t('ai.cParent'), false) : ''}
    <button class="btn block" data-act="ai-consent-ok">${esc(t('ai.cConfirm'))}</button></div>`;
}
on('ai-consent', () => openSheet(t('ai.consentTitle'), consentSheet));
on('ai-consent-ok', () => {
  const ok = (id: string) => !!(document.getElementById(id) as HTMLInputElement | null)?.checked;
  if (!ok('ai-c-read') || (needsParentConsent(D().age) && !ok('ai-c-parent'))) { toast(t('ai.cMissing')); return; }
  STATE.settings.ai = { ...(STATE.settings.ai || {}), consentAt: new Date().toISOString(), parentConsent: needsParentConsent(D().age) ? true : undefined, enabled: true };
  saveState(); closeSheet(); setTimeout(() => loadAiState().then(() => nav.rerender()), 1800); nav.rerender(); toast(t('ai.consentSaved'));
});
on('ai-revoke', el => {
  if (!armed(el, t('common.sure'))) return;
  STATE.settings.ai = { ...(STATE.settings.ai || {}), consentAt: null, enabled: false };
  saveState(); setTimeout(() => loadAiState().then(() => nav.rerender()), 1800); nav.rerender(); toast(t('ai.revoked'));
});
onChange('ai-on', el => { STATE.settings.ai = { ...(STATE.settings.ai || {}), enabled: (el as HTMLInputElement).checked }; saveState(); setTimeout(() => loadAiState().then(() => nav.rerender()), 1800); });
onChange('ai-set', el => { STATE.settings.ai = { ...(STATE.settings.ai || {}), [el.dataset.k!]: +(el as HTMLSelectElement).value }; saveState(); setTimeout(() => loadAiState().then(() => nav.rerender()), 1800); toast(t('common.saved')); });

/* ---------- Krankheitsphasen ---------- */
function illnessCard(): string {
  const list = [...(STATE.illnessPeriods || [])].sort((a: any, b: any) => String(b.start).localeCompare(String(a.start)));
  return `<div class="card stack"><div class="hint">${esc(t('set.illnessHint'))}</div>
    ${list.map((p: any) => `<div class="fgrid" data-ill="${esc(p.id)}" style="padding-top:10px;border-top:1px solid var(--line)">
      <div class="fld"><label>${esc(t('common.from'))}</label><input class="inp" type="date" data-ch="ill-f" data-f="start" value="${p.start || ''}"></div>
      <div class="fld"><label>${esc(t('common.to'))}</label><input class="inp" type="date" data-ch="ill-f" data-f="end" value="${p.end || ''}"></div>
      <div class="fld wide"><label>${esc(t('common.note'))}</label><input class="inp" data-ch="ill-f" data-f="note" value="${esc(p.note || '')}"></div>
      <div class="fld"><button class="btn danger sm" data-act="ill-del">${esc(t('common.delete'))}</button></div></div>`).join('') || `<div class="empty">${esc(t('set.noIllness'))}</div>`}
    <button class="btn ghost sm" data-act="ill-add">${ic('plus')} ${esc(t('set.addIllness'))}</button></div>`;
}
on('ill-add', () => { const d = todayStr(); STATE.illnessPeriods.push({ id: 'ill-' + Date.now(), start: addDays(d, -1), end: d, note: '' }); saveState(); invalidate(); nav.rerender(); });
on('ill-del', el => {
  if (!armed(el, t('common.reallyDelete'))) return;
  const id = (el.closest('[data-ill]') as HTMLElement).dataset.ill; STATE.illnessPeriods = STATE.illnessPeriods.filter((p: any) => p.id !== id); saveState(); invalidate(); nav.rerender();
});
onChange('ill-f', el => {
  const p = STATE.illnessPeriods.find((x: any) => x.id === (el.closest('[data-ill]') as HTMLElement).dataset.ill); if (!p) return;
  const f = el.dataset.f!; const v = (el as HTMLInputElement).value;
  p[f] = v || (f === 'end' ? null : f === 'note' ? '' : p.start);
  if (p.end && p.start && p.end < p.start) p.end = p.start;
  saveState(); invalidate(); nav.rerender();
});

/* ---------- Ampel-Rückfallwerte ---------- */
function readyCard(): string {
  const R = STATE.settings.readiness || {};
  return `<div class="card stack"><div class="hint">${esc(t('set.readyHint'))}</div><div class="fgrid">
    ${field('r-rhr', t('set.rhrMax'), R.rhrMax ?? '', { inputmode: 'numeric', data: 'data-ch="rdy" data-k="rhrMax"' })}
    ${field('r-hrv', t('set.hrvMin'), R.hrvMin ?? '', { inputmode: 'numeric', data: 'data-ch="rdy" data-k="hrvMin"' })}
    ${field('r-temp', t('set.tempMax'), R.tempMax ?? '', { inputmode: 'decimal', data: 'data-ch="rdy" data-k="tempMax"' })}</div>
    <div class="hint">${esc(t('set.sleepNeed', { a: num(D().fallback.sleepNeed[0], 1), b: num(D().fallback.sleepNeed[1], 1) }))}</div></div>`;
}
onChange('rdy', el => {
  const v = parseNum((el as HTMLInputElement).value); if (v == null) { toast(t('common.invalidNumber')); return; }
  STATE.settings.readiness = { ...(STATE.settings.readiness || {}), [el.dataset.k!]: v }; saveState(); invalidate(); toast(t('common.saved'));
});

/* ---------- Manuelle Score-Korrektur (nur hier, sonst rechnen die Scores aus Messdaten) ---------- */
function scoreCard(): string {
  const sc = D().scores;
  return `<div class="card stack"><div class="hint">${esc(t('set.scoreHint'))}</div>
    ${sc.map(s => { const adj = (STATE.scoreAdjust || {})[s.sport] || 0; return `<div class="spread"><span>${esc(sportLabel(s.sport))} <b class="num">${s.score}</b>${adj ? ` <span class="xs muted">(${adj > 0 ? '+' : ''}${adj})</span>` : ''}</span><span class="row" style="gap:6px"><button class="btn ghost sm" data-act="score-adj" data-sport="${s.sport}" data-d="-1" aria-label="${esc(t('set.scoreDown'))}">−</button><button class="btn ghost sm" data-act="score-adj" data-sport="${s.sport}" data-d="1" aria-label="${esc(t('set.scoreUp'))}">+</button></span></div>`; }).join('')}
    <button class="link" data-act="score-reset">${esc(t('set.scoreReset'))}</button></div>`;
}
on('score-adj', el => { const s = el.dataset.sport!; STATE.scoreAdjust = { ...(STATE.scoreAdjust || {}), [s]: Math.max(-15, Math.min(15, ((STATE.scoreAdjust || {})[s] || 0) + +el.dataset.d!)) }; saveState(); invalidate(); nav.rerender(); });
on('score-reset', () => { STATE.scoreAdjust = {}; saveState(); invalidate(); nav.rerender(); toast(t('common.saved')); });

on('set-theme', el => { applyTheme(el.dataset.v || ''); nav.rerender(); });
on('set-variant', el => { UI.heuteVariant = el.dataset.v; saveUi(); nav.rerender(); });
void fmtDate; void refreshSheet; void saveProfile;
