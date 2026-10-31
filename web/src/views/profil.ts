/* Profil und Ziele: persönliche Angaben (mit Bild, Auftrag 25) statt fester Werte im Code, mehrere Ziele mit Priorität.
   Sprache und Einheiten stehen seit Auftrag 25 unter Mehr → Einstellungen.
   Was den Plan bestimmt (Ziele, Sportarten, Stunden, Stil …), wird erst vorgemerkt und mit Vorschau übernommen (Auftrag 6, web/src/staged.ts).
   Persönliche Angaben (Name, Gewicht, Sprache …) werden sofort gespeichert. */
import { STATE, saveState, profile, goals, saveProfile } from '../store';
import { esc, fmtDate, parseNum, paceToSec, secToPace, todayStr } from '../util';
import { t, hhmm } from '../../../shared/i18n';
import { on, onChange, sec, ic, pill, openSheet, closeSheet, refreshSheet, field, select, toggle, armed, more, sportLabel, timeField, readTime } from '../kit';
import { realism } from '../../../shared/goalcheck';
import { GOALS, mainGoal, missingSports, mismatchText, type Goal, type GoalType , legsOf } from '../../../shared/goals';
import { ageOf, isMinor, type Profile, type SportKey } from '../../../shared/profile';
import { goalAllowed } from '../../../shared/rules';
import { daysUntil } from '../../../shared/race';
import { invalidate, goalPrognosis } from '../data';
import { nav } from '../nav';
import { toast } from '../toast';
import { avatarHtml } from './mehr';
import { stage, draftProfile, draftGoals, draftGoal, stageBarHtml, lastApplied, PLAN_FIELDS } from '../staged';

const SCREEN = 'profil';

const SPORT_KEYS: SportKey[] = ['swim', 'bike', 'run', 'strength', 'football'];
export const goalLabel = (type: string) => t('goal.' + type);

/* Auftrag 24: Ziel braucht eine Sportart, die nicht gewählt ist: kurzer Hinweis direkt am Ziel, mit „Ziel ändern“ und „… hinzufügen“ */
function mismatchHint(g: Goal, sports: readonly string[], today: string): string {
  if (g.result || (g.date && g.date < today) || g.type === 'fitness') return '';
  const miss = missingSports(g, sports); if (!miss.length) return '';
  return `<div class="banner info small" data-goal-mismatch="${esc(g.id)}">${esc(mismatchText(miss))}<div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-act="goal-open" data-id="${esc(g.id)}">${esc(t('prof.changeGoal'))}</button>${miss.map(s => `<button class="btn ghost sm" data-act="pf-sport" data-s="${s}">${esc(t('prof.addSport', { s: sportLabel(s) }))}</button>`).join('')}</div></div>`;
}
export function renderProfil(): string {
  const p = profile(), dp = draftProfile(SCREEN), today = todayStr();
  const gl = draftGoals(SCREEN).sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const main = mainGoal(gl, today);
  const last = lastApplied(SCREEN);
  let h = last ? `<div class="banner good" data-replanned style="margin-bottom:var(--s3)">${esc(last)}</div>` : '';
  h += sec(t('prof.goals'), `<div class="list">${gl.map(g => `<button class="li" data-act="goal-open" data-id="${esc(g.id)}"><span class="ic" style="--c:var(--accent)">${ic(g.result ? 'trophy' : 'target')}</span>
      <span class="grow"><span class="t">${esc(g.name)}</span> ${pill(g.priority, g.priority === 'A' ? 'accent' : '')}${main && main.id === g.id ? ' ' + pill(t('prof.main'), 'good') : ''}<br>
      <span class="s">${esc(goalLabel(g.type))}${g.date ? ' · ' + fmtDate(g.date) + (g.date >= today ? ' · ' + t('prof.inDays', { n: daysUntil(today, g.date) }) : '') : ''}${g.result && g.result.timeSec ? ' · ' + hhmm(g.result.timeSec) : ''}</span></span><span class="chev">${ic('right')}</span></button>${mismatchHint(g, dp.sports, today)}`).join('') || `<div class="li"><span class="muted">${esc(t('prof.noGoals'))}</span></div>`}</div>
    <button class="btn ghost block" data-act="goal-new" style="margin-top:var(--s2)">${ic('plus')} ${esc(t('prof.addGoal'))}</button>`, t('prof.goalsAside'));
  h += sec(t('prof.person'), `<div class="card"><div class="row" data-photo style="gap:var(--s3);margin-bottom:var(--s3);align-items:center">${avatarHtml(64)}<div class="stack" style="gap:4px"><div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn ghost sm" for="pf-photo">${esc(t((p as any).photo ? 'prof.photoChange' : 'prof.photoPick'))}</label><input type="file" id="pf-photo" data-ch="pf-photo" accept="image/*" hidden>${(p as any).photo ? `<button class="btn ghost sm" data-act="pf-photo-del">${esc(t('prof.photoRemove'))}</button>` : ''}</div><span class="xs muted">${esc(t('prof.photoHint'))}</span></div></div><div class="fgrid">
    ${field('pf-name', t('prof.name'), p.name, { data: 'data-ch="pf" data-k="name"' })}
    ${field('pf-birth', t('prof.birthYear'), p.birthYear ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="birthYear" data-num="1"' })}
    ${select('pf-sex', t('prof.sex'), p.sex || '', [['', t('prof.sexNone')], ['f', t('prof.sexF')], ['m', t('prof.sexM')], ['d', t('prof.sexD')]], 'data-ch="pf" data-k="sex"')}
    ${field('pf-h', t('prof.height'), p.heightCm ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="heightCm" data-num="1"' })}
    ${field('pf-w', t('prof.weight'), p.weightKg ?? '', { inputmode: 'decimal', data: 'data-ch="pf" data-k="weightKg" data-num="1"' })}
    ${select('pf-pal', t('prof.pal'), String(p.pal), [['1.2', t('prof.pal12')], ['1.4', t('prof.pal14')], ['1.6', t('prof.pal16')], ['1.8', t('prof.pal18')]], 'data-ch="pf" data-k="pal" data-num="1"')}
    </div>${ageOf(p, todayStr()) != null ? `<div class="hint">${esc(t('prof.age', { n: ageOf(p, todayStr()) }))}${isMinor(p, todayStr()) ? ' · ' + esc(t('prof.minorHint')) : ''}</div>` : ''}</div>`);
  h += sec(t('prof.training'), `<div class="card"><div class="lbl">${esc(t('prof.sports'))}</div><div class="chips" style="margin:6px 0 var(--s3)">${SPORT_KEYS.filter(s => s !== 'football' || dp.teamSport || dp.sports.includes('football')).map(s => `<button class="chip ${dp.sports.includes(s) ? 'on' : ''}" data-act="pf-sport" data-s="${s}" aria-pressed="${dp.sports.includes(s)}">${esc(s === 'football' && dp.teamSportName ? dp.teamSportName : sportLabel(s))}</button>`).join('')}</div>
    <div class="fgrid">${dp.sports.includes('football') ? field('pf-team', t('prof.teamSport'), dp.teamSportName, { data: 'data-ch="pf" data-k="teamSportName"' }) : ''}
    ${field('pf-exp', t('prof.experience'), dp.experienceYears ?? '', { inputmode: 'numeric', data: 'data-ch="pf" data-k="experienceYears" data-num="1"' })}
    ${select('pf-style', t('prof.planStyle'), dp.planStyle, [['flexible', t('prof.flexible')], ['strict', t('prof.strict')]], 'data-ch="pf" data-k="planStyle"')}
    ${select('pf-likes', t('prof.likes'), dp.likesIntensity, [['balanced', t('prof.balanced')], ['intensity', t('prof.intensity')], ['volume', t('prof.volume')]], 'data-ch="pf" data-k="likesIntensity"')}</div>
    <div class="fld wide" data-week-link><span class="lab">${esc(t('prof.timeTitle'))}</span><span class="small">${esc(t('prof.timeSummary', { h: String(dp.weeklyHours).replace('.', ','), d: String(dp.maxDayHours).replace('.', ',') }))}</span><button class="btn ghost sm" data-act="go-sub" data-sub="beruecksichtigungen" style="margin-top:6px">${esc(t('prof.timeEdit'))}</button></div>
    <div class="fld wide"><label for="pf-inj">${esc(t('prof.injuries'))}</label><input class="inp" id="pf-inj" data-ch="pf" data-k="injuries" value="${esc(dp.injuries)}" placeholder="${esc(t('prof.injuriesPh'))}"></div>
    ${toggle('pf-med', t('prof.medical'), dp.medicalCaution, 'data-ch="pf" data-k="medicalCaution" data-bool="1"')}
    <div class="hint">${esc(t('stage.profHint'))}</div>${toggle('pf-veg', t('prof.vegetarian'), !!p.vegetarian, 'data-ch="pf" data-k="vegetarian" data-bool="1"')}
    <div class="hint">${esc(t('prof.thresholdsHint'))}</div><button class="btn ghost sm" data-act="go-sub" data-sub="zonen">${esc(t('prof.toZones'))}</button></div>`);
  h += `<button class="btn ghost block" data-act="go-sub" data-sub="onboarding" style="margin-top:var(--s3)">${ic('wand')} ${esc(t('prof.redoOnboarding'))}</button>`;
  return h + stageBarHtml(SCREEN);
}

onChange('pf', el => {
  const p: any = profile(); const k = el.dataset.k!;
  const inp = el as HTMLInputElement;
  let v: any = el.dataset.bool ? inp.checked : inp.value;
  if (el.dataset.num) { v = parseNum(v); if (v == null && k !== 'birthYear' && k !== 'heightCm' && k !== 'weightKg' && k !== 'experienceYears') { toast(t('common.invalidNumber')); return; } }
  if (k === 'birthYear' && v != null && (v < 1930 || v > +todayStr().slice(0, 4) - 5)) { toast(t('common.invalidNumber')); return; }
  if (k === 'sex' && !v) v = null;
  if ((PLAN_FIELDS as readonly string[]).includes(k)) { stage(SCREEN, (x: any) => { x[k] = v; }); return; }
  p[k] = v;
  saveProfile(p); invalidate();
  if (k === 'lang' || k === 'units' || k === 'birthYear') { nav.rerender(); toast(t('common.saved')); }
});
on('pf-sport', el => {
  const s = el.dataset.s as SportKey; const cur = draftProfile(SCREEN).sports;
  const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
  if (!next.length) { toast(t('prof.oneSport')); return; }
  stage(SCREEN, p => { p.sports = next; });
});

/* ---------- Ziel bearbeiten ---------- */
let G: Goal | null = null; let G_NEW = false;
const TYPES = Object.keys(GOALS) as GoalType[];
function goalSheet(): string {
  if (!G) return '';
  const p = profile(); const allowed = goalAllowed(G.type, ageOf(p, todayStr()));
  const past = !!G.date && G.date < todayStr();
  return `<div class="stack"><div class="fgrid">
    ${select('g-type', t('goal.type'), G.type, TYPES.map(k => [k, goalLabel(k)] as [string, string]), 'data-ch="g" data-k="type"')}
    ${field('g-name', t('goal.name'), G.name, { data: 'data-ch="g" data-k="name"', placeholder: t('goal.namePh') })}
    ${field('g-date', t('goal.date'), G.date || '', { type: 'date', data: 'data-ch="g" data-k="date"' })}
    ${select('g-prio', t('goal.priority'), G.priority, [['A', t('goal.prioA')], ['B', t('goal.prioB')], ['C', t('goal.prioC')]], 'data-ch="g" data-k="priority"')}
    ${select('g-out', t('goal.outcome'), G.outcome || 'finish', [['finish', t('goal.finish')], ['time', t('goal.time')], ['place', t('goal.place')]], 'data-ch="g" data-k="outcome"')}
    ${G.outcome === 'time' ? timeField('g-target', t('goal.target'), G.targetTimeSec, 'hms', 'data-ch="g" data-k="targetTimeSec"', { wide: true }) : ''}</div>
    ${G.date && G.type !== 'fitness' ? (() => { const r = realism(G!, profile(), todayStr(), goalPrognosis(G!)); return r ? `<div class="banner ${r.ok === false ? 'warn' : 'info'}" data-goal-realism>${esc(r.text)}</div>` : ''; })() : ''}
    ${!allowed.ok ? `<div class="banner warn">${esc(allowed.msg || '')}</div>` : ''}
    <div class="fld wide"><label for="g-why">${esc(t('goal.why'))}</label><input class="inp" id="g-why" data-ch="g" data-k="why" value="${esc(G.why || '')}"></div>
    ${courseFields(G)}
    ${past || G.result ? `<div class="card flat tight"><div class="lbl">${esc(t('goal.result'))}</div><div class="fgrid">${timeField('g-res', t('goal.resultTime'), G.result && G.result.timeSec, 'hms', 'data-ch="g" data-k="resultTime"')}${field('g-place', t('goal.resultPlace'), (G.result && G.result.place) || '', { data: 'data-ch="g" data-k="resultPlace"' })}</div></div>` : ''}
    <button class="btn block" data-act="goal-save">${esc(t('common.save'))}</button>
    ${G_NEW ? '' : `<button class="btn danger" data-act="goal-del">${esc(t('goal.delete'))}</button>`}
    <div class="hint">${esc(t('goal.planHint'))}</div></div>`;
}
/* Strecke (Auftrag 12, optional): macht die Prognose genauer */
function courseFields(g: Goal): string {
  const sp = new Set(legsOf(g).map(l => l.sport)); if (!sp.size || g.type === 'fitness') return '';
  const c: any = g.course || {};
  const yn = (v: any) => v === true ? 'yes' : v === false ? 'no' : '';
  return more(t('goal.course'), `<div class="fgrid" data-course>
    ${sp.has('bike') ? field('gc-ba', t('goal.bikeAscent'), c.bikeAscentM ?? '', { inputmode: 'numeric', data: 'data-ch="gc" data-k="bikeAscentM"' }) : ''}
    ${sp.has('run') ? field('gc-ra', t('goal.runAscent'), c.runAscentM ?? '', { inputmode: 'numeric', data: 'data-ch="gc" data-k="runAscentM"' }) : ''}
    ${sp.has('swim') ? select('gc-sv', t('goal.swimVenue'), c.swimVenue || '', [['', t('goal.unknown')], ['open', t('goal.open')], ['pool', t('goal.pool')]], 'data-ch="gc" data-k="swimVenue"') + select('gc-ws', t('goal.wetsuit'), yn(c.wetsuit), [['', t('goal.unknown')], ['yes', t('common.yes')], ['no', t('common.no')]], 'data-ch="gc" data-k="wetsuit"') : ''}
    ${field('gc-t', t('goal.temp'), c.tempC ?? '', { inputmode: 'numeric', data: 'data-ch="gc" data-k="tempC"' })}</div><div class="hint">${esc(t('goal.courseHint'))}</div>`);
}
onChange('gc', el => {
  if (!G) return; const k = el.dataset.k!; const v = (el as HTMLInputElement).value.trim();
  const c: any = { ...(G.course || {}) };
  if (k === 'swimVenue') c.swimVenue = v || null;
  else if (k === 'wetsuit') c.wetsuit = v === 'yes' ? true : v === 'no' ? false : null;
  else { const n = v === '' ? null : parseFloat(v.replace(',', '.')); if (n != null && (!isFinite(n) || n < (k === 'tempC' ? -10 : 0) || n > (k === 'tempC' ? 45 : 10000))) { toast(t('common.invalidNumber')); return; } c[k] = n == null ? null : Math.round(n); }
  G.course = c;
});
const parseHm = (s: string): number | null => { const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(String(s).trim()); if (!m) return null; return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 3600 + +m[2] * 60; };
on('goal-new', () => { G = { id: 'goal-' + Date.now(), type: 'run_10k', name: goalLabel('run_10k'), date: null, priority: draftGoals(SCREEN).length ? 'B' : 'A', outcome: 'finish' }; G_NEW = true; openSheet(t('prof.addGoal'), goalSheet); });
on('goal-open', el => { const g = draftGoal(SCREEN, el.dataset.id!); if (!g) return; G = JSON.parse(JSON.stringify(g)); G_NEW = false; openSheet(g.name, goalSheet); });
onChange('g', el => {
  if (!G) return; const k = el.dataset.k!; const v = (el as HTMLInputElement).value;
  if (k === 'type') { const wasDefault = !G.name || TYPES.some(x => goalLabel(x) === G!.name); G.type = v as GoalType; if (wasDefault) G.name = goalLabel(v); refreshSheet(); return; }
  if (k === 'targetTimeSec') { const s = el.dataset.tf ? readTime(el) : parseHm(v); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } G.targetTimeSec = s; const box = document.querySelector('[data-goal-realism]'); const r = G.date ? realism(G, profile(), todayStr(), goalPrognosis(G)) : null; if (box && r) { box.textContent = r.text; box.className = `banner ${r.ok === false ? 'warn' : 'info'}`; } return; }
  if (k === 'resultTime') { const s = el.dataset.tf ? readTime(el) : parseHm(v); if (s != null && isNaN(s)) { toast(t('time.invalid')); return; } G.result = { ...(G.result || {}), timeSec: s }; return; }
  if (k === 'resultPlace') { G.result = { ...(G.result || {}), place: v }; return; }
  (G as any)[k] = v || (k === 'date' ? null : v);
  if (k === 'outcome' || k === 'date') refreshSheet();
});
on('goal-save', () => {
  if (!G) return;
  if (!G.name.trim()) { toast(t('goal.nameMissing')); return; }
  const g = { ...G, createdAt: G.createdAt || Date.now() };
  closeSheet(); stage(SCREEN, (_p, gs) => { gs[g.id] = g; });
});
on('goal-del', el => {
  if (!G || !armed(el, t('common.reallyDelete'))) return;
  const id = G.id; closeSheet(); stage(SCREEN, (_p, gs) => { delete gs[id]; });
});
void more; void paceToSec; void secToPace;
export type { Profile };

/* Auftrag 25: Profilbild. Auf 192 × 192 px zugeschnitten und als JPEG im Profil gespeichert (etwa 10 KB, wird mit dem Konto gesichert). */
export async function photoDataUrl(file: Blob, size = 192): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('img')); img.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight); if (!side) throw new Error('img');
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); if (!g) throw new Error('canvas');
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
onChange('pf-photo', async el => {
  const f = (el as HTMLInputElement).files && (el as HTMLInputElement).files![0]; if (!f) return;
  try { const data = await photoDataUrl(f); if (data.length > 60000) throw new Error('size'); saveProfile({ ...profile(), photo: data } as any); nav.rerender(); toast(t('prof.photoSaved')); }
  catch (e) { toast(t('prof.photoFail')); }
});
on('pf-photo-del', () => { const p: any = { ...profile() }; delete p.photo; saveProfile(p); nav.rerender(); toast(t('common.saved')); });
