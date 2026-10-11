/* Essen: Bedarf des Tages, Gegessenes, Vorschläge, Gewicht. Ziel ist GENUG zu essen: kein Defizit, für Minderjährige keine Gewichtsziele.
   Essen per Foto ist vorbereitet: ohne KI-Coach geht Foto und Frage per Teilen-Menü an die Claude-App. */
import { STATE, saveState, findDay, UI } from '../store';
import { esc, fmtDate, dowShort, dowLong, addDays, parseNum, todayStr } from '../util';
import { t, num, weight } from '../../../shared/i18n';
import { D } from '../data';
import { on, onChange, sec, field, select, ic, more, openSheet, closeSheet, refreshSheet } from '../kit';
import { nutritionTargets, NUTRI_TYPES, NUTRI_SLOTS, mealsFor, underEatingCheck, type DaySession } from '../../../shared/nutrition';
import { effStatus, sessState } from '../domain';
import { lineChart } from '../charts';
import { nav } from '../nav';
import { toast } from '../toast';
import { aiState, apiCall } from '../sync';
import { ageOf } from '../../../shared/profile';
import * as C from '../../../shared/core';

function sessionsFor(date: string): DaySession[] {
  const out: DaySession[] = [];
  const day = findDay(date);
  if (day) day.sessions.forEach((s0: any) => {
    const s = { ...s0, date }; if (s.sport === 'rest') return;
    const status = effStatus(s); if (status === 'skipped' || status === 'sick' || status === 'missed' || status === 'cancelled') return;
    const m = sessState(s.id).metrics || {};
    const min = status === 'done' && m.min ? parseNum(m.min) : (s.plannedMinutes || (s.sport === 'football' ? (/spiel/i.test(s.title) ? 60 : 90) : 0));
    out.push({ sport: s.sport, title: s.title, zone: s.zone, minutes: min || 0 });
  });
  ((STATE.customWorkouts || {})[date] || []).forEach((w: any) => out.push({ sport: w.sport, title: w.title, minutes: parseNum((w.metrics || {}).min) ?? w.plannedMinutes ?? 0, custom: true }));
  return out.filter(x => x.minutes > 0);
}
function weightFor(date: string): number {
  const e = Object.entries(STATE.nutrition || {}).filter(([d, v]: any) => v && v.weight != null && d <= date).sort((a, b) => a[0].localeCompare(b[0]));
  if (e.length) { const last = e.slice(-7).map(x => (x[1] as any).weight); return last.reduce((a: number, b: number) => a + b, 0) / last.length; }
  return D().profile.weightKg || STATE.nutritionProfile.weightKg || 70;
}
export function targetsFor(date: string) {
  const p = D().profile;
  const age = ageOf(p, date) ?? STATE.nutritionProfile.age ?? 30;
  return nutritionTargets({ age, heightCm: p.heightCm || STATE.nutritionProfile.heightCm || 175, weightKg: weightFor(date), pal: p.pal || 1.4, sex: p.sex, sessions: sessionsFor(date), ill: !!C.illnessAt(STATE.illnessPeriods, date), override: ((STATE.nutrition || {})[date] || {}).typeOverride || null });
}
export function nutritionToday() {
  const d = D().today; const tg = targetsFor(d); const e = (STATE.nutrition || {})[d] || {};
  return { typeLabel: t('food.type.' + tg.type), low: tg.kcal[0], high: tg.kcal[1], eaten: e.kcal ?? null };
}
function nbar(label: string, eaten: number | null, lo: number, hi: number, unit: string): string {
  const max = hi * 1.25; const pct = (v: number) => Math.max(0, Math.min(100, v / max * 100));
  const st = eaten == null ? '' : eaten < lo ? 'low' : eaten > hi ? 'over' : '';
  return `<div class="spread small"><span class="muted">${esc(label)}</span><span class="num"><b>${eaten != null ? Math.round(eaten) : '–'}</b> / ${lo}-${hi}${unit}</span></div><div class="nbar"><div class="band" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>${eaten != null ? `<div class="fill ${st}" style="width:${pct(eaten)}%"></div>` : ''}</div>`;
}

export function renderEssen(): string {
  const date = UI.foodDate || D().today;
  const tg = targetsFor(date); const e = (STATE.nutrition || {})[date] || {};
  const minor = D().minor;
  let h = `<div class="spread" style="margin-bottom:var(--s3)"><input class="inp" type="date" value="${date}" data-ch="food-date" style="max-width:180px">${select('food-type', '', tg.overridden ? tg.type : 'auto', [['auto', t('food.auto', { t: t('food.type.' + tg.typeAuto) })], ...Object.keys(NUTRI_TYPES).map(k => [k, t('food.type.' + k)] as [string, string])], 'data-ch="food-type"').replace('<label for="food-type"></label>', '')}</div>
  <div class="card"><div class="lbl">${esc(t('food.target'))}</div><div class="big">${tg.kcal[0]}-${tg.kcal[1]} kcal</div>
    <div class="hint num">${esc(t('food.macros', { c: `${tg.carbs[0]}-${tg.carbs[1]}`, p: `${tg.protein[0]}-${tg.protein[1]}`, f: `${tg.fat[0]}-${tg.fat[1]}` }))}</div>
    ${nbar(t('food.kcal'), e.kcal ?? null, tg.kcal[0], tg.kcal[1], '')}${nbar(t('food.carbs'), e.carbs ?? null, tg.carbs[0], tg.carbs[1], ' g')}${nbar(t('food.protein'), e.protein ?? null, tg.protein[0], tg.protein[1], ' g')}
    <div class="hint">${esc(t('food.note.' + tg.type))}</div>
    <div class="row"><button class="btn grow" data-act="food-photo">${ic('camera')} ${esc(t('food.photo'))}</button><button class="btn ghost" data-act="food-edit">${ic('edit')} ${esc(t('food.enter'))}</button></div></div>`;
  // Hinweis bei zu wenig Essen
  const days = [] as { kcal: number | null; low: number }[];
  for (let i = 6; i >= 1; i--) { const d = addDays(date, -i); const ee = (STATE.nutrition || {})[d]; days.push({ kcal: ee && ee.kcal != null ? ee.kcal : null, low: targetsFor(d).kcal[0] }); }
  const chk = underEatingCheck(days, minor);
  if (chk.level) h += `<div class="banner ${chk.level === 2 ? 'bad' : ''}" style="margin-top:var(--s3)">${esc(chk.text)}</div>`;
  // Vorschläge
  const slots = NUTRI_SLOTS[tg.type]; const seed = Math.floor(new Date(date + 'T12:00:00').getTime() / 86400000);
  const diet = { vegetarian: !!D().profile.vegetarian, vegan: (D().profile.answers || {}).diet === 'vegan' };
  h += sec(t('food.ideas'), `<div class="list">${slots.map(([name, share, cat], i) => {
    const list = mealsFor(cat, diet); if (!list.length) return '';
    const m = list[(seed + i) % list.length];
    return `<div class="li"><span class="grow"><span class="lbl">${esc(name)} · ${Math.round(tg.kcal[0] * share / 100 / 50) * 50} kcal</span><br><span class="t">${esc(m.n)}</span><br><span class="s">${esc(m.p)}</span></span><button class="btn soft sm" data-act="food-add" data-cat="${cat}" data-n="${esc(m.n)}">+ ${m.k}</button></div>`;
  }).join('')}</div>`);
  // Gewicht
  const we = Object.entries(STATE.nutrition || {}).filter(([, v]: any) => v && v.weight != null).sort((a, b) => a[0].localeCompare(b[0])).slice(-60).map(([d, v]: any) => ({ date: d, w: v.weight }));
  h += sec(t('food.weight'), `<div class="card">${lineChart(we, [{ key: 'w', name: t('food.weight'), color: 'var(--ink-2)', fmt: (v: number) => num(v, 1) }], { h: 130, fmt: (v: number) => num(v, 1), empty: t('food.weightEmpty'), label: t('food.weight') })}<div class="hint">${esc(minor ? t('food.weightMinor') : t('food.weightAdult'))}</div></div>`);
  h += sec(t('food.week'), `<div class="card tight scroll-x"><table class="tbl"><thead><tr><th>${esc(t('common.day'))}</th><th>${esc(t('food.target'))}</th><th>${esc(t('food.eaten'))}</th></tr></thead><tbody>${[6, 5, 4, 3, 2, 1, 0].map(i => { const d = addDays(date, -i); const tt = targetsFor(d); const ee = (STATE.nutrition || {})[d] || {}; return `<tr><td>${dowShort(d)} ${fmtDate(d)}</td><td>${tt.kcal[0]}-${tt.kcal[1]}</td><td style="color:${ee.kcal == null ? '' : ee.kcal < tt.kcal[0] ? 'var(--warn)' : 'var(--good)'}">${ee.kcal ?? '–'}</td></tr>`; }).join('')}</tbody></table></div>`);
  return h;
}

function editSheet(): string {
  const date = UI.foodDate || D().today; const e = (STATE.nutrition || {})[date] || {};
  return `<div class="stack"><div class="hint">${esc(dowLong(date))}, ${fmtDate(date)}</div><div class="fgrid">
    ${[['kcal', t('food.kcal')], ['carbs', t('food.carbs') + ' g'], ['protein', t('food.protein') + ' g'], ['fat', t('food.fat') + ' g'], ['weight', t('food.weight') + ' kg']].map(([k, l]) => field('fe-' + k, l, e[k] ?? '', { inputmode: 'decimal', data: `data-ch="food-field" data-k="${k}"` })).join('')}</div>
    <button class="btn block" data-act="sheet-close">${esc(t('common.done'))}</button></div>`;
}

/* Essen per Foto: mit aktivem KI-Coach eine Schätzung als Bereich, sonst Teilen an die Claude-App */
let PHOTO: { b64: string; type: string; est: any; question: string } | null = null;
function photoSheet(): string {
  const ai = aiState();
  if (!PHOTO) return `<div class="stack"><div class="hint">${esc((ai.active && ai.food !== false) ? t('food.photoHintAi') : t('food.photoHintShare'))}</div>
    <label class="btn block" for="food-file">${ic('camera')} ${esc(t('food.takePhoto'))}</label><input type="file" id="food-file" accept="image/*" capture="environment" hidden data-ch="food-file">
    <div class="fld"><label for="food-q">${esc(t('food.question'))}</label><input class="inp" id="food-q" data-ch="food-q" placeholder="${esc(t('food.questionPh'))}"></div></div>`;
  if (!PHOTO.est) return `<div class="stack"><img src="data:${PHOTO.type};base64,${PHOTO.b64}" alt="" style="width:100%;border-radius:16px">
    ${(ai.active && ai.food !== false) ? `<button class="btn block" data-act="food-estimate">${esc(t('food.estimate'))}</button>` : `<button class="btn block" data-act="food-share">${ic('share')} ${esc(t('food.shareClaude'))}</button>`}
    <button class="btn ghost block" data-act="food-reset">${esc(t('food.otherPhoto'))}</button></div>`;
  const e = PHOTO.est;
  return `<div class="stack"><div class="hint">${esc(e.items.join(', '))}</div><div class="hint">${esc(e.note)}</div>
    <div class="fgrid">${[['kcal', t('food.kcal')], ['carbs', t('food.carbs')], ['protein', t('food.protein')], ['fat', t('food.fat')]].map(([k, l]) => field('fp-' + k, `${l} (${e[k][0]}-${e[k][1]})`, Math.round((e[k][0] + e[k][1]) / 2), { inputmode: 'decimal', data: `data-k="${k}"` })).join('')}</div>
    <div class="hint">${esc(t('food.confirmHint'))}</div>
    <button class="btn block" data-act="food-confirm">${esc(t('food.confirm'))}</button></div>`;
}

function setFood(date: string, patch: any) { STATE.nutrition[date] = { ...(STATE.nutrition[date] || {}), ...patch }; saveState(); nav.rerender(); }
onChange('food-date', el => { UI.foodDate = (el as HTMLInputElement).value || todayStr(); nav.rerender(); });
onChange('food-type', el => { const v = (el as HTMLSelectElement).value; setFood(UI.foodDate || D().today, { typeOverride: v === 'auto' ? null : v }); });
onChange('food-field', el => { const k = el.dataset.k!; const n = parseNum((el as HTMLInputElement).value); setFood(UI.foodDate || D().today, { [k]: n == null || n < 0 ? null : n, ...(k === 'weight' ? { weightManual: true } : {}) }); });
on('food-edit', () => openSheet(t('food.enter'), editSheet));
on('food-add', el => {
  const m = mealsFor(el.dataset.cat!).find(x => x.n === el.dataset.n); if (!m) return;
  const date = UI.foodDate || D().today; const e = STATE.nutrition[date] || {};
  setFood(date, { kcal: (e.kcal || 0) + m.k, carbs: (e.carbs || 0) + m.c, protein: (e.protein || 0) + m.pr, fat: (e.fat || 0) + m.f });
  toast(`${m.n}: +${m.k} kcal`);
});
on('food-photo', () => { PHOTO = null; openSheet(t('food.photo'), photoSheet); });
on('food-reset', () => { PHOTO = null; refreshSheet(); });
onChange('food-q', el => { if (PHOTO) PHOTO.question = (el as HTMLInputElement).value; else (window as any).__foodQ = (el as HTMLInputElement).value; });
onChange('food-file', async el => {
  const f = (el as HTMLInputElement).files && (el as HTMLInputElement).files![0]; if (!f) return;
  const b64 = await shrink(f);
  PHOTO = { b64, type: 'image/jpeg', est: null, question: (window as any).__foodQ || '' };
  refreshSheet();
});
on('food-estimate', async el => {
  if (!PHOTO) return; (el as HTMLButtonElement).disabled = true;
  try { const r = await apiCall('POST', '/api/coach/food', { image: PHOTO.b64, mediaType: PHOTO.type, question: PHOTO.question }); PHOTO.est = r.estimate; PHOTO.b64 = ''; refreshSheet(); }
  catch (e) { toast((e as Error).message); (el as HTMLButtonElement).disabled = false; }
});
on('food-share', async () => {
  if (!PHOTO) return;
  const bin = atob(PHOTO.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], 'essen.jpg', { type: 'image/jpeg' });
  const text = t('food.shareText', { q: PHOTO.question || t('food.questionPh') });
  try {
    if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) await navigator.share({ files: [file], text } as any);
    else { await navigator.clipboard.writeText(text); toast(t('coach.copied')); }
    closeSheet();
  } catch (e) { /* abgebrochen */ }
});
on('food-confirm', () => {
  const date = UI.foodDate || D().today; const e = STATE.nutrition[date] || {};
  const v = (k: string) => parseNum((document.getElementById('fp-' + k) as HTMLInputElement).value) || 0;
  setFood(date, { kcal: (e.kcal || 0) + v('kcal'), carbs: (e.carbs || 0) + v('carbs'), protein: (e.protein || 0) + v('protein'), fat: (e.fat || 0) + v('fat') });
  PHOTO = null; closeSheet(); toast(t('food.added'));
});
/* Foto verkleinern (max. 1280 px, JPEG) – das Original wird nicht gespeichert */
async function shrink(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
void weight; void more;
