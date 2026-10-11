/* Ernährungs-Bildschirm */
import * as CoachCore from '../../../shared/core';
import { STATE, PLAN, SESS, UI, HAS_PLAN, BASE_WEEKS, findDay, currentWeekIdx } from '../store';
import { $, esc, de, todayStr, addDays, daysBetween, fmtDate, dowShort, dowLong, secToPace, parseNum, round5, round50, rng } from '../util';
import { SPORTS, icon, uiIcon } from '../icons';
import * as D from '../domain';
import { sessState, effStatus, illnessAt, activeIllness, returnPhase, RETURN_STAGES, trendAt, latestTrend, latestWithKey, hasRecovery, rollingAvg, arrow, computeReadiness, readinessHistoryHtml, computeScore, tierLabel, perfEntries, forgottenSessions, computeZones, computePaceZones, computeSpeedZones } from '../domain';
import { sessionCard, dayCard, dayBadge, weekStrip, weekProgress, checkinFields } from '../components';
import { lineChart, illnessShades } from '../charts';
import { VS } from '../viewstate';
import { APP } from '../config';
import { NUTRI_TYPES, NUTRI_SLOTS, MEALS, computeNutritionTargets, weightFor, nbar } from '../nutrition';


export function renderEssen() {
  if (!VS.NUT_DATE) VS.NUT_DATE = todayStr();
  const date = VS.NUT_DATE; const t = computeNutritionTargets(date); const e = STATE.nutrition[date] || {}; const ti = NUTRI_TYPES[t.type]; const pr = STATE.nutritionProfile;
  let h = `<h1 class="view-title">Ernährung<small>${dowLong(date)}, ${fmtDate(date)} · ${ti.label}</small></h1>
  <div class="panel"><div class="fgrid">
    <div class="fld" style="grid-column: span 2"><label for="nut-date">Datum</label><input class="inp" type="date" id="nut-date" value="${date}"></div>
    <div class="fld" style="grid-column: span 2"><label for="nut-type">Tagestyp</label><select class="inp" id="nut-type"><option value="auto">Automatisch (${NUTRI_TYPES[t.typeAuto].label})</option>${Object.entries(NUTRI_TYPES).map(([k, v]) => `<option value="${k}" ${t.overridden && t.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
  </div>
  <div class="tiles four">
    <div class="tile"><div class="k">Ruhe</div><div class="v">${Math.round(t.bmr)}</div><div class="s">Grundumsatz</div></div>
    <div class="tile"><div class="k">Alltag</div><div class="v">${Math.round(t.daily - t.bmr)}</div><div class="s">Schule, Gehen</div></div>
    <div class="tile"><div class="k">Training</div><div class="v">${Math.round(t.act)}</div><div class="s">kcal</div></div>
    <div class="tile"><div class="k">Gesamt</div><div class="v">${Math.round(t.tdee)}</div><div class="s">Verbrauch</div></div>
  </div>
  <div><div class="lbl">Zielbereich</div><div style="font:700 26px/1.1 var(--f-display)" class="num">${t.kcal[0]}-${t.kcal[1]} kcal</div>
    <div class="hint num">Kohlenhydrate <strong>${t.carbs[0]}-${t.carbs[1]} g</strong> (${ti.carbs[0]}-${ti.carbs[1]} g/kg) · Protein <strong>${t.protein[0]}-${t.protein[1]} g</strong> · Fett <strong>${t.fat[0]}-${t.fat[1]} g</strong> · Rechengewicht ${de(t.weight, 1)} kg</div></div>
  <div class="hint">${ti.note}</div>
  ${t.actDetails.length ? `<div>${t.actDetails.map(a => `<div class="kv"><span>${esc(a.title)}${a.custom ? ' (Extra)' : ''}</span><span class="muted">${a.minutes} min · ca. ${a.kcal} kcal</span></div>`).join('')}</div>` : '<div class="hint">Kein Training in der Berechnung.</div>'}
  </div>`;

  h += `<div class="sec"><div class="sec-h"><h2>Gegessen</h2><span class="aside">Tagessumme aus deiner App</span></div><div class="panel">
    <div class="fgrid">${[['kcal', 'Kalorien'], ['carbs', 'Kohlenh. g'], ['protein', 'Protein g'], ['fat', 'Fett g'], ['weight', 'Gewicht kg']].map(([k, l]) => `<div class="fld"><label for="nut-${k}">${l}</label><input class="inp" type="number" step="any" inputmode="decimal" id="nut-${k}" value="${e[k] ?? ''}"></div>`).join('')}</div>
    <button class="btn block" data-act="nut-save">Speichern</button>
    <div class="stack">${nbar('Kalorien', e.kcal ?? null, t.kcal[0], t.kcal[1], '')}${nbar('Kohlenh.', e.carbs ?? null, t.carbs[0], t.carbs[1], ' g')}${nbar('Protein', e.protein ?? null, t.protein[0], t.protein[1], ' g')}${nbar('Fett', e.fat ?? null, t.fat[0], t.fat[1], ' g')}</div>
    <div class="hint">Grün ist dein Zielbereich. Darunter: mehr essen, vor allem Kohlenhydrate. Darüber ist kein Problem.</div></div></div>`;

  const rows = []; for (let i = 6; i >= 0; i--) { const d = addDays(date, -i); rows.push({ d, t: computeNutritionTargets(d), e: STATE.nutrition[d] || {} }); }
  const logged = rows.filter(r => r.e.kcal != null);
  const icon2 = r => r.e.kcal == null ? '<span class="muted">·</span>' : r.e.kcal < r.t.kcal[0] ? '<span style="color:var(--warn)">●</span>' : r.e.kcal > r.t.kcal[1] ? '<span style="color:var(--info)">●</span>' : '<span style="color:var(--good)">●</span>';
  const last3 = logged.slice(-3);
  const banner = (last3.length === 3 && last3.every(r => r.e.kcal < r.t.kcal[0] * 0.9)) ? `<div class="banner">An den letzten drei eingetragenen Tagen lagst du deutlich unter dem Zielbereich. Beim Training zählt vor allem genug Energie und genug Kohlenhydrate. Iss an den nächsten Tagen etwas mehr, und wenn dir das Essen gerade schwerfällt, sag es mir oder sprich mit deinem Arzt.</div>` : '';
  let summary = 'Noch keine Tage in dieser Woche eingetragen.';
  if (logged.length) {
    const avgE = logged.reduce((a, r) => a + r.e.kcal, 0) / logged.length; const avgL = logged.reduce((a, r) => a + r.t.kcal[0], 0) / logged.length;
    const wc = logged.filter(r => r.e.carbs != null); const cpk = wc.length ? (wc.reduce((a, r) => a + r.e.carbs, 0) / wc.length) / weightFor(date) : null;
    summary = `${logged.length}/7 Tage eingetragen · Ø ${Math.round(avgE)} kcal (${Math.round(avgE / avgL * 100)} % vom Beginn des Zielbereichs)${cpk ? ` · Ø ${de(cpk, 1)} g Kohlenhydrate pro kg` : ''}.`;
  }
  h += `<div class="sec"><div class="sec-h"><h2>Letzte 7 Tage</h2></div>${banner}<div class="panel"><div class="scroll-x"><table class="tbl"><thead><tr><th>Tag</th><th>Typ</th><th>Ziel kcal</th><th>Gegessen</th><th>KH</th><th>P</th><th>F</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${dowShort(r.d)} ${fmtDate(r.d)}</td><td>${NUTRI_TYPES[r.t.type].label}</td><td>${r.t.kcal[0]}-${r.t.kcal[1]}</td><td>${r.e.kcal ?? '–'}</td><td>${r.e.carbs ?? '–'}</td><td>${r.e.protein ?? '–'}</td><td>${r.e.fat ?? '–'}</td><td>${icon2(r)}</td></tr>`).join('')}
    </tbody></table></div><div class="hint">${summary} <span style="color:var(--good)">●</span> im Bereich · <span style="color:var(--warn)">●</span> darunter · <span style="color:var(--info)">●</span> darüber</div></div></div>`;

  const we = Object.entries(STATE.nutrition || {}).filter(([d, v]) => v && v.weight != null).sort((a, b) => a[0].localeCompare(b[0]));
  const wp: any[] = we.map(([d, v]) => ({ date: d, weight: v.weight })); wp.forEach((p, i) => { p.avg = rollingAvg(wp, 'weight', i, 7); });
  const lastW = wp[wp.length - 1];
  h += `<div class="sec"><div class="sec-h"><h2>Gewicht</h2></div><div class="panel">${lineChart(wp, [{ key: 'weight', name: 'Gewicht', color: 'var(--ink-2)', fmt: v => de(v, 1) }, { key: 'avg', name: 'Ø 7 Tage', color: 'var(--info)', fmt: v => de(v, 1) }], { h: 140, legend: true, fmt: v => de(v, 1), empty: 'Für einen Verlauf braucht es mindestens zwei Einträge. Einer pro Woche reicht (morgens, nüchtern).' })}
    <div class="hint">${lastW ? `Letzter Wert ${de(lastW.weight, 1)} kg · Schnitt ${de(lastW.avg, 1)} kg. Das Gewicht schwankt täglich um 1-2 kg, nur der Schnitt zählt. Du bist noch im Wachstum, ein Gewichtsziel gibt es nicht. Es dient nur der Berechnung.` : 'Noch keine Gewichte eingetragen.'}</div></div></div>`;

  const slots = NUTRI_SLOTS[t.type]; const dayIdx = Math.floor(new Date(date + 'T12:00:00').getTime() / 86400000); let used = 0;
  h += `<div class="sec"><div class="sec-h"><h2>Vorschläge</h2><span class="aside">wechseln täglich</span></div><div class="panel">${slots.map(([name, share, cat]) => {
    const list = MEALS[cat]; const cnt = Math.min((cat === 'main' || cat === 'sick') ? 2 : 3, list.length); const off = (dayIdx + ((cat === 'main' || cat === 'sick') ? used * 2 : 0)) % list.length; if (cat === 'main' || cat === 'sick') used++;
    const opts = []; for (let i = 0; i < cnt; i++) opts.push((off + i) % list.length);
    return `<div class="meal"><div class="meal-h"><b>${name}</b><span>ca. ${rng(round50(t.kcal[0] * share / 100), round50(t.kcal[1] * share / 100))} kcal<br>${rng(round5(t.carbs[0] * share / 100), round5(t.carbs[1] * share / 100))} g KH</span></div>
      ${opts.map(i => { const m = list[i]; return `<div class="mopt"><div><strong>${m.n}</strong> · ${m.p}<div class="mm">ca. ${m.k} kcal · KH ${m.c} g · Protein ${m.pr} g · Fett ${m.f} g</div></div><button class="btn soft small" data-act="nut-add" data-cat="${cat}" data-i="${i}" aria-label="${m.n} als gegessen hinzufügen">+ Gegessen</button></div>`; }).join('')}</div>`;
  }).join('')}<div class="hint">„+ Gegessen“ addiert die Nährwerte zur Tagessumme oben. Mengen sind Richtwerte, Reis, Nudeln oder Kartoffeln passt du an deinen Hunger an.</div></div></div>`;

  h += `<div class="sec"><div class="panel"><details class="fold"><summary><span class="sec-h"><h2>Berechnung einstellen</h2></span><span class="chev">${uiIcon('chev', 18)}</span></summary><div class="fold-body">
    <div class="fgrid"><div class="fld"><label for="np-age">Alter</label><input class="inp" type="number" id="np-age" value="${pr.age}"></div><div class="fld"><label for="np-h">Größe cm</label><input class="inp" type="number" id="np-h" value="${pr.heightCm}"></div><div class="fld"><label for="np-w">Startgewicht kg</label><input class="inp" type="number" step="any" id="np-w" value="${pr.weightKg}"></div><div class="fld"><label for="np-pal">Alltagsfaktor</label><input class="inp" type="number" step="0.05" id="np-pal" value="${pr.pal}"></div></div>
    <button class="btn small" data-act="nut-settings">Speichern</button>
    <div class="hint">Grundumsatz nach Mifflin-St Jeor. Der Alltagsfaktor deckt Schule, Lernen und Gehen ab (1,4 = überwiegend sitzend). Training wird nach Dauer und Intensität dazugerechnet. Alle Zahlen sind Schätzungen (±10-15 %). Die App ist dafür da, dass du genug isst: der Zielbereich beginnt beim geschätzten Verbrauch, nie darunter.</div></div></details></div></div>`;
  $('#app').innerHTML = h;
}
