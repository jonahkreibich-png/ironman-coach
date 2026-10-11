/* Werte-Bildschirm */
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



export function renderWerte() {
  const t = todayStr();
  if (!VS.WERTE_DATE) VS.WERTE_DATE = t;
  const lt = latestTrend() || {};
  const cardio = latestWithKey('cardioRecovery');
  const vo2 = latestWithKey('vo2max');
  const ill = activeIllness();
  const tsbCls = v => v == null ? '' : (v >= -10 ? 'good' : v >= -20 ? 'warn' : 'bad');
  let h = `<h1 class="view-title">Werte<small>Belastung, Form und Erholung${lt.date ? ' · Stand ' + fmtDate(lt.date) : ''}</small></h1>`;
  h += `<div class="tiles">
    <div class="tile"><div class="k">CTL</div><div class="v">${de(lt.ctl)} ${arrow('ctl')}</div><div class="s">Fitness</div></div>
    <div class="tile"><div class="k">ATL</div><div class="v">${de(lt.atl)} ${arrow('atl')}</div><div class="s">Ermüdung</div></div>
    <div class="tile ${tsbCls(lt.tsb)}"><div class="k">TSB</div><div class="v">${de(lt.tsb)} ${arrow('tsb')}</div><div class="s">Form</div></div>
    <div class="tile"><div class="k">VO2max</div><div class="v">${de(vo2 && vo2.vo2max)} ${arrow('vo2max')}</div><div class="s">Garmin</div></div>
    <div class="tile"><div class="k">Cardio-Erh.</div><div class="v">${de(cardio && cardio.cardioRecovery)} ${arrow('cardioRecovery')}</div><div class="s">bpm</div></div>
  </div>`;
  const own = CoachCore.ownLoadSeries(STATE, PLAN.weeks, t);
  const ol = own.length ? own[own.length - 1] : null;
  if (ol) h += `<div class="lbl" style="margin-top:12px">Eigene Berechnung aus deinen Einheiten</div><div class="tiles">
    <div class="tile"><div class="k">CTL</div><div class="v">${de(ol.ctl, 0)}</div><div class="s">eigen</div></div>
    <div class="tile"><div class="k">ATL</div><div class="v">${de(ol.atl, 0)}</div><div class="s">eigen</div></div>
    <div class="tile ${tsbCls(ol.tsb)}"><div class="k">TSB</div><div class="v">${de(ol.tsb, 0)}</div><div class="s">eigen</div></div>
    <div class="tile"><div class="k">Heute</div><div class="v">${de(ol.load, 0)}</div><div class="s">Belastung</div></div></div>`;
  if (ill) h += `<div class="banner info" style="margin-top:10px">Du bist gerade krank. CTL und ATL sinken, weil keine Trainingslast dazukommt, und TSB steigt. Das zeigt keine echte Erholung und keinen echten Fitnessverlust.</div>`;

  const withBoth = STATE.trend.filter(p => p.ctl != null && p.atl != null && p.ctl > 0);
  let gauge = '<div class="empty">Noch keine CTL/ATL-Werte.</div>';
  if (withBoth.length) {
    const L = withBoth[withBoth.length - 1]; const ratio = L.atl / L.ctl;
    const [lab, col] = ratio < 0.8 ? ['Unterbelastet', 'var(--info)'] : ratio <= 1.3 ? ['Im grünen Bereich', 'var(--good)'] : ratio <= 1.5 ? ['Erhöht', 'var(--warn)'] : ['Hohes Risiko', 'var(--bad)'];
    gauge = `<div class="row" style="align-items:baseline"><span style="font:700 34px/1 var(--f-display);color:${col}" class="num">${de(ratio, 2)}</span><span style="color:${col};font-weight:600">${lab}</span></div>
      <div class="gauge-w"><div class="gauge"><i style="width:40%;background:var(--info);opacity:.55"></i><i style="width:25%;background:var(--good);opacity:.7"></i><i style="width:10%;background:var(--warn);opacity:.7"></i><i style="width:25%;background:var(--bad);opacity:.6"></i></div>
      <div class="gauge-m" style="left:${Math.min(100, ratio / 2 * 100)}%"></div></div>
      <div class="gauge-l">${[[0, '0'], [40, '0,8'], [65, '1,3'], [75, '1,5'], [100, '2+']].map(([l, t]) => `<span style="left:${l}%">${t}</span>`).join('')}</div>
      <div class="hint">ATL geteilt durch CTL. Unter 0,8 trainierst du unter deiner Kapazität, 0,8 bis 1,3 ist der gute Bereich, über 1,5 steigt das Verletzungsrisiko.${ill ? ' Während der Krankheit ist der Wert nicht aussagekräftig.' : ''}</div>`;
  }
  h += `<div class="sec"><div class="sec-h"><h2>Belastungsverhältnis</h2></div><div class="panel">${gauge}</div></div>`;

  const tpMap = {};
  STATE.trend.filter(p => p.ctl != null || p.atl != null || p.tsb != null).forEach(p => { tpMap[p.date] = { date: p.date, ctl: p.ctl, atl: p.atl, tsb: p.tsb, note: p.illness || '' }; });
  const firstTp = Object.keys(tpMap).sort()[0];
  own.filter(o => !firstTp || o.date >= firstTp).forEach(o => { tpMap[o.date] = Object.assign(tpMap[o.date] || { date: o.date }, { octl: o.ctl }); });
  const tp = Object.values(tpMap).sort((a, b) => a.date.localeCompare(b.date));
  h += `<div class="sec"><div class="sec-h"><h2>Fitness, Ermüdung, Form</h2></div><div class="panel">${lineChart(tp, [
    { key: 'ctl', name: 'CTL', color: 'var(--info)', area: true }, { key: 'atl', name: 'ATL', color: 'var(--run)' }, { key: 'tsb', name: 'TSB', color: 'var(--good)' },
    ...(own.length ? [{ key: 'octl', name: 'CTL eigen', color: 'var(--info)', dashed: true }] : [])
  ], { h: 200, legend: true, legendExtra: '<span><i class="box" style="--c:var(--bad)"></i>krank</span>', shade: illnessShades(), lines: [{ v: 0, label: '' }], label: 'CTL ATL TSB Verlauf' })}
    <div class="hint">CTL ist deine Fitness (Belastung der letzten 6 Wochen), ATL die Ermüdung der letzten Woche, TSB die Differenz. TSB unter -20 heißt: Erholung einplanen.${own.length ? ' Die gestrichelte Linie rechnet die App selbst aus deinen Einheiten: mit Puls als hrTSS (LTHR Rad 162, Laufen 170), ohne Puls über die RPE. Liefert intervals.icu eine Trainingslast, zählt diese.' : ''}</div></div></div>`;

  const R = STATE.settings.readiness;
  const bH = CoachCore.baselineOf(STATE.trend, STATE.illnessPeriods, addDays(t, 1), 'hrv', Math.log);
  const bR = CoachCore.baselineOf(STATE.trend, STATE.illnessPeriods, addDays(t, 1), 'restingHR');
  const hrvLine = bH && bH.n >= CoachCore.MIN_DAYS ? { v: Math.round(Math.exp(bH.mean)), label: `dein Normalwert ${Math.round(Math.exp(bH.mean))}`, color: 'var(--good)' } : { v: R.hrvMin, label: `Ziel ≥${R.hrvMin}`, color: 'var(--good)' };
  const rhrLine = bR && bR.n >= CoachCore.MIN_DAYS ? { v: Math.round(bR.mean), label: `dein Normalwert ${Math.round(bR.mean)}`, color: 'var(--good)' } : { v: R.rhrMax, label: `Ziel ≤${R.rhrMax}`, color: 'var(--good)' };
  const hp = STATE.trend.filter(p => p.hrv != null).map((p, i, arr) => ({ date: p.date, hrv: p.hrv, avg: rollingAvg(arr, 'hrv', i, 7), note: p.illness || '' }));
  const rp = STATE.trend.filter(p => p.restingHR != null).map(p => ({ date: p.date, rhr: p.restingHR, note: p.illness || '' }));
  const tpts = STATE.trend.filter(p => p.bodyTemp != null).map(p => ({ date: p.date, temp: p.bodyTemp, note: p.illness || '' }));
  h += `<div class="sec"><div class="sec-h"><h2>Erholung</h2><span class="aside">Rot hinterlegt: krank</span></div>
    <div class="panel"><div class="lbl">HFV (ms) mit 7-Tage-Schnitt</div>${lineChart(hp, [{ key: 'hrv', name: 'HFV', color: 'var(--info)', area: true }, { key: 'avg', name: 'Ø 7 Tage', color: 'var(--ink-2)', dashed: true }], { legend: true, shade: illnessShades(), lines: [hrvLine], label: 'HFV Verlauf' })}</div>
    <div class="panel"><div class="lbl">Ruhepuls (bpm)</div>${lineChart(rp, [{ key: 'rhr', name: 'Ruhepuls', color: 'var(--run)', area: true }], { shade: illnessShades(), lines: [rhrLine], label: 'Ruhepuls Verlauf' })}
      <div class="hint">Die Ampel wird gelb, wenn der Ruhepuls 3 Schläge über deinem Normalwert liegt, und rot ab 5 Schlägen. Bei der HFV zählt der 3-Tage-Schnitt im Vergleich zu deinen letzten 28 Tagen.</div></div>
    <div class="panel"><div class="lbl">Temperatur-Abweichung (°C)</div>${lineChart(tpts, [{ key: 'temp', name: 'Temp.', color: 'var(--warn)', fmt: v => (v > 0 ? '+' : '') + de(v, 1) }], { h: 140, shade: illnessShades(), lines: [{ v: 0.3, label: 'Gelb +0,3', color: 'var(--warn)' }, { v: 0.5, label: 'Rot +0,5', color: 'var(--bad)' }], label: 'Temperatur Verlauf' })}</div>
  </div>`;

  const rows = STATE.trend.filter(p => hasRecovery(p) || p.illness).slice(-10).reverse();
  const all = STATE.trend;
  h += `<div class="sec"><div class="sec-h"><h2>Schlaf-Tabelle</h2><span class="aside">letzte ${rows.length} Nächte</span></div><div class="panel">${rows.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Datum</th><th>Schlaf</th><th>Qual.</th><th>Ruhep.</th><th>HFV</th><th>Ø7</th><th>Temp.</th><th>Atem</th><th>REM</th><th>Tief</th><th>Lat.</th><th>SpO2</th></tr></thead><tbody>
    ${rows.map(r => { const idx = all.indexOf(r); const a7 = rollingAvg(all, 'hrv', idx, 7); let fl = '';
      if (r.hrv != null && a7) { const d = (r.hrv - a7) / a7 * 100; fl = d <= -10 ? ' <span class="flag-low" title="mehr als 10 % unter Schnitt">▼</span>' : d >= 10 ? ' <span class="flag-high" title="mehr als 10 % über Schnitt">▲</span>' : ''; }
      return `<tr class="${illnessAt(r.date) ? 'sick' : ''}"><td>${dowShort(r.date)} ${fmtDate(r.date)}</td><td>${de(r.sleepHours)}</td><td>${de(r.sleepQuality)}</td><td>${de(r.restingHR)}</td><td>${de(r.hrv)}${fl}</td><td>${a7 != null ? de(a7, 0) : '–'}</td><td>${r.bodyTemp != null ? (r.bodyTemp > 0 ? '+' : '') + de(r.bodyTemp) : '–'}</td><td>${de(r.breathingRate)}</td><td>${de(r.remSleep)}</td><td>${de(r.deepSleep)}</td><td>${de(r.sleepLatency)}</td><td>${de(r.spo2)}</td></tr>`; }).join('')}
    </tbody></table></div><div class="hint">▼ HFV mehr als 10 % unter deinem 7-Tage-Schnitt, ▲ deutlich darüber. Rote Datumsangaben: krank.</div>` : '<div class="empty">Noch keine Einträge.</div>'}</div></div>`;

  h += `<div class="sec" id="werte-form"><div class="sec-h"><h2>Werte eintragen</h2><span class="aside">auch für andere Tage</span></div><div class="panel">
    <div class="fgrid"><div class="fld" style="grid-column: span 2"><label for="w-date">Datum</label><input class="inp" type="date" id="w-date" value="${VS.WERTE_DATE}" max="${t}"></div></div>
    ${checkinFields('w', VS.WERTE_DATE)}
    <button class="btn block" data-act="checkin-save" data-prefix="w">Werte speichern</button></div></div>`;
  $('#app').innerHTML = h;
}
