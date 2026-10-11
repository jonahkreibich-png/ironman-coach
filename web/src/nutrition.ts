/* Ernährung: Tagestyp, Bedarf, Vorschläge. */
import * as CoachCore from '../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, findDay, currentWeekIdx } from './store';
import { $, esc, de, todayStr, addDays, daysBetween, fmtDate, dowShort, dowLong, secToPace, parseNum, round5, round50, rng } from './util';
import { SPORTS, icon, uiIcon } from './icons';
import * as D from './domain';
import { sessState, effStatus, illnessAt, activeIllness, returnPhase, RETURN_STAGES, trendAt, latestTrend, latestWithKey, hasRecovery, rollingAvg, arrow, computeReadiness, readinessHistoryHtml, computeScore, tierLabel, perfEntries, forgottenSessions, computeZones, computePaceZones, computeSpeedZones } from './domain';
import { sessionCard, dayCard, dayBadge, weekStrip, weekProgress, checkinFields } from './components';
import { lineChart, illnessShades } from './charts';
import { VS } from './viewstate';
import { APP } from './config';

export const NUTRI_TYPES = {
  rest: { label: 'Ruhetag', carbs: [4, 5], note: 'Kein Training: Basis decken, viel Gemüse und genug Protein.' },
  training: { label: 'Trainingstag', carbs: [5, 6], note: 'Normales Training: Kohlenhydrate rund um die Einheit legen.' },
  hard: { label: 'Langer/harter Tag', carbs: [6, 8], note: 'Lange oder harte Einheit: viel Kohlenhydrate. Bei Einheiten über 75 min unterwegs 30-60 g Kohlenhydrate pro Stunde.' },
  match: { label: 'Spieltag', carbs: [6, 7], note: 'Spiel: 3-4 h vorher eine große Kohlenhydrat-Mahlzeit, danach schnell auffüllen.' },
  sick: { label: 'Krankheitstag', carbs: [4, 5], note: 'Krank: auch ohne Hunger regelmäßig kleine Portionen. Suppe, Reis, Toast, Banane, viel Tee und Wasser. Tracken ist optional.' }
};
export const NUTRI_SLOTS = {
  rest: [['Frühstück', 28, 'breakfast'], ['Mittagessen', 32, 'main'], ['Abendessen', 30, 'main'], ['Snack', 10, 'snack']],
  training: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 28, 'main'], ['Abendessen', 27, 'main'], ['Snack', 10, 'snack'], ['Nach dem Training', 10, 'post']],
  hard: [['Frühstück', 22, 'breakfast'], ['Vor dem Training (1-2 h)', 8, 'pre'], ['Mittagessen', 22, 'main'], ['Nach dem Training', 13, 'post'], ['Abendessen', 25, 'main'], ['Snack', 10, 'snack']],
  match: [['Frühstück', 22, 'breakfast'], ['Mittagessen (3-4 h vor dem Spiel)', 25, 'main'], ['Vor dem Spiel (1-1,5 h)', 8, 'pre'], ['Nach dem Spiel', 15, 'post'], ['Abendessen', 20, 'main'], ['Snack', 10, 'snack']],
  sick: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 30, 'sick'], ['Abendessen', 30, 'sick'], ['Snack', 15, 'snack']]
};
export const MEALS = {
  breakfast: [
    { n: 'Haferbrei', p: '80 g Haferflocken, 300 ml Milch, 1 Banane, 15 g Nüsse', k: 630, c: 97, pr: 25, f: 18 },
    { n: 'Skyr-Müsli', p: '250 g Skyr, 60 g Müsli, 100 g Beeren, 10 g Honig', k: 450, c: 64, pr: 35, f: 5 },
    { n: 'Brot mit Rührei', p: '3 Scheiben Vollkornbrot, 3 Eier, Gemüse', k: 520, c: 57, pr: 30, f: 18 }
  ],
  main: [
    { n: 'Reis mit Hähnchen', p: '100 g Reis (roh), 150 g Hähnchenbrust, 200 g Gemüse, 1 EL Öl', k: 665, c: 87, pr: 44, f: 13 },
    { n: 'Pasta mit Puten-Bolognese', p: '100 g Vollkornnudeln (roh), 150 g Putenhack, 150 g Tomatensauce, 15 g Parmesan', k: 635, c: 78, pr: 52, f: 11 },
    { n: 'Lachs mit Kartoffeln', p: '400 g Kartoffeln, 150 g Lachs, 200 g Brokkoli', k: 660, c: 74, pr: 44, f: 21 },
    { n: 'Linsen-Dal mit Reis', p: '100 g rote Linsen (roh), 60 g Reis (roh), 150 g Gemüse, 1 EL Öl', k: 695, c: 114, pr: 32, f: 13 }
  ],
  sick: [
    { n: 'Hühnersuppe mit Nudeln', p: '500 ml Brühe, 120 g Hähnchen, 60 g Nudeln (roh), Karotte, Sellerie', k: 480, c: 50, pr: 38, f: 10 },
    { n: 'Reis mit Rührei', p: '90 g Reis (roh), 2 Eier, etwas Butter', k: 500, c: 72, pr: 18, f: 15 },
    { n: 'Kartoffelbrei mit Quark', p: '350 g Kartoffeln, 100 ml Milch, 150 g Kräuterquark', k: 450, c: 60, pr: 22, f: 11 }
  ],
  snack: [
    { n: 'Banane mit Nüssen', p: '1 Banane, 30 g Nüsse', k: 285, c: 31, pr: 7, f: 16 },
    { n: 'Quark mit Obst', p: '250 g Magerquark, 150 g Obst', k: 250, c: 30, pr: 31, f: 1 },
    { n: 'Brot mit Erdnussbutter', p: '2 Scheiben Vollkornbrot, 20 g Erdnussbutter', k: 320, c: 40, pr: 12, f: 12 }
  ],
  pre: [
    { n: 'Toast mit Honig und Banane', p: '2 Scheiben Toast, 20 g Honig, 1 Banane', k: 330, c: 73, pr: 6, f: 2 },
    { n: 'Reiswaffeln mit Marmelade', p: '4 Reiswaffeln, 30 g Marmelade', k: 215, c: 48, pr: 3, f: 1 }
  ],
  post: [
    { n: 'Kakao mit Banane', p: '400 ml Milch, 20 g Kakaopulver, 1 Banane', k: 370, c: 63, pr: 15, f: 7 },
    { n: 'Skyr mit Haferflocken', p: '250 g Skyr, 40 g Haferflocken, 100 g Beeren', k: 350, c: 45, pr: 34, f: 4 }
  ]
};
export function sessionMet(s) {
  const intense = /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || ''));
  if (s.sport === 'run') return intense ? 11 : 9;
  if (s.sport === 'bike') return intense ? 9.5 : 7;
  if (s.sport === 'swim') return 6;
  if (s.sport === 'strength') return 4;
  if (s.sport === 'football') return 7.5;
  return 0;
}
export function sessionMinutes(s) {
  if (s.plannedMinutes) return s.plannedMinutes;
  if (s.sport === 'football') return /spiel|match/i.test(s.title || '') ? 60 : 90;
  return 0;
}
export function nutritionSessionsFor(date) {
  const out = []; const day = findDay(date);
  if (day) day.sessions.forEach(s0 => {
    const s = { ...s0, date }; if (s.sport === 'rest') return;
    const status = effStatus(s);
    if (status === 'skipped' || status === 'sick' || status === 'missed') return;
    out.push({ sport: s.sport, title: s.title, zone: s.zone, minutes: status === 'done' ? sessDoneMinutes(s) : sessionMinutes(s), custom: false });
  });
  (STATE.customWorkouts[date] || []).forEach(w => out.push({ sport: w.sport, title: w.title, zone: '', minutes: parseNum((w.metrics || {}).min) ?? sessionMinutes(w), custom: true }));
  return out.filter(x => x.minutes > 0);
}
export function classifyDay(date, sessions) {
  if (illnessAt(date) && !sessions.length) return 'sick';
  if (!sessions.length) return 'rest';
  if (sessions.some(s => s.sport === 'football' && /spiel|match/i.test(s.title || ''))) return 'match';
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const longest = Math.max(0, ...sessions.filter(s => s.sport !== 'strength').map(s => s.minutes));
  const intense = sessions.some(s => s.sport !== 'strength' && /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || '')));
  if (intense || longest >= 75 || total >= 150) return 'hard';
  return 'training';
}
export function weightFor(date) {
  const e = Object.entries(STATE.nutrition || {}).filter(([d, v]) => v && v.weight != null && d <= date).sort((a, b) => a[0].localeCompare(b[0]));
  if (e.length) { const last = e.slice(-7).map(x => x[1].weight); return last.reduce((a, b) => a + b, 0) / last.length; }
  return STATE.nutritionProfile.weightKg;
}
export function computeNutritionTargets(date) {
  const p = STATE.nutritionProfile; const w = weightFor(date);
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + 5;
  const daily = bmr * p.pal;
  const sessions = nutritionSessionsFor(date);
  const actDetails = sessions.map(s => ({ ...s, kcal: Math.round((sessionMet(s) - 1) * w * s.minutes / 60) }));
  const act = actDetails.reduce((a, s) => a + s.kcal, 0);
  const tdee = daily + act;
  const typeAuto = classifyDay(date, sessions);
  const ov = STATE.nutrition[date] && STATE.nutrition[date].typeOverride;
  const type = (ov && NUTRI_TYPES[ov]) ? ov : typeAuto;
  const t = NUTRI_TYPES[type];
  return { date, weight: w, bmr, daily, act, actDetails, tdee, type, typeAuto, overridden: !!(ov && NUTRI_TYPES[ov]),
    kcal: [round50(tdee), round50(tdee * 1.10)], carbs: [round5(t.carbs[0] * w), round5(t.carbs[1] * w)],
    protein: [round5(1.6 * w), round5(2.0 * w)], fat: [round5(1.0 * w), round5(1.5 * w)] };
}
export function nbar(label, eaten, lo, hi, unit) {
  const max = hi * 1.25; const pct = v => Math.max(0, Math.min(100, v / max * 100));
  const st = eaten == null ? '' : (eaten < lo ? 'low' : eaten > hi ? 'over' : 'ok');
  return `<div class="nrow"><span class="muted">${label}</span><div class="nbar"><div class="band" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>${eaten != null ? `<div class="fill ${st}" style="width:${pct(eaten)}%"></div>` : ''}</div><span class="v"><b>${eaten != null ? Math.round(eaten) : '–'}</b> / ${lo}-${hi}${unit}</span></div>`;
}
export function nutritionMini() {
  const d = todayStr(); const t = computeNutritionTargets(d); const e = STATE.nutrition[d] || {}; const info = NUTRI_TYPES[t.type];
  return `<button class="panel" data-act="go-essen" style="width:100%;text-align:left;cursor:pointer;display:block">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><div style="font:700 18px/1.1 var(--f-display);text-transform:uppercase;letter-spacing:.03em">${info.label}</div>
    <div class="hint num">Ziel ${t.kcal[0]}-${t.kcal[1]} kcal · KH ${t.carbs[0]}-${t.carbs[1]} g · Protein ${t.protein[0]}-${t.protein[1]} g</div></div>
    <div class="hint" style="text-align:right;flex-shrink:0">${e.kcal != null ? `<b class="num">${e.kcal}</b> kcal<br>eingetragen` : 'noch nichts<br>eingetragen'}</div></div>
    ${e.kcal != null ? nbar('Kalorien', e.kcal, t.kcal[0], t.kcal[1], '') : ''}</button>`;
}
export function sessDoneMinutes(s) { const st = sessState(s.id); const m = st.metrics ? parseNum(st.metrics.min) : null; return m != null ? m : sessionMinutes(s); }
export function sessDoneKm(s) {
  const st = sessState(s.id); const m = st.metrics || {};
  const km = parseNum(m.km); if (km != null) return km;
  const me = parseNum(m.meters); if (me != null) return me / 1000;
  return s.plannedKm || 0;
}
