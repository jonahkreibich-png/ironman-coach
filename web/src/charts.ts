/* Einfache SVG-Liniendiagramme mit Antippen für Einzelwerte. */
import { STATE } from './store';
import { $, esc, de, daysBetween, addDays, fmtDate, dowShort, todayStr } from './util';

export const CHARTS = {};
export let chartSeq = 0;
export function chartWidth() { const m = $('#app'); const w = m ? m.clientWidth - 32 - 30 : 320; return Math.max(260, Math.min(700, Math.round(w))); }
export function niceStep(range, target) {
  const raw = range / Math.max(1, target); const mag = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
export function fmtTick(v, step) { const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0; return de(v, dec); }
export function lineChart(pts, series, o) {
  o = o || {};
  const vals = [];
  series.forEach(s => pts.forEach(p => { if (p[s.key] != null) vals.push(p[s.key]); }));
  if (pts.length < 2 || !vals.length) return `<div class="empty">${o.empty || 'Noch nicht genug Datenpunkte für einen Verlauf.'}</div>`;
  (o.lines || []).forEach(l => vals.push(l.v));
  const id = 'c' + (++chartSeq);
  const W = chartWidth(), H = o.h || 170, L = 36, R = o.endLabel === false ? 10 : 40, T = 12, B = 24;
  let lo = o.min != null ? o.min : Math.min(...vals), hi = o.max != null ? o.max : Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, 3);
  if (o.min == null) lo = Math.floor((lo - (hi - lo) * 0.06) / step) * step;
  if (o.max == null) hi = Math.ceil((hi + (hi - lo) * 0.06) / step) * step;
  const n = pts.length;
  const span = Math.max(1, daysBetween(pts[0].date, pts[n - 1].date));
  const di = pts.map(p => daysBetween(pts[0].date, p.date));
  const xd = d => L + (d / span) * (W - L - R);
  const x = i => xd(di[i]);
  const y = v => { const r = (v - lo) / (hi - lo); return o.invert ? T + r * (H - T - B) : H - B - r * (H - T - B); };
  const fmt = o.fmt || (v => fmtTick(v, step));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Verlauf')}">`;
  (o.shade || []).forEach(r => {
    const a = daysBetween(pts[0].date, r.from) - 0.5, b2 = daysBetween(pts[0].date, r.to) + 0.5;
    if (b2 < 0 || a > span) return;
    const x1 = xd(Math.max(0, a)), x2 = xd(Math.min(span, b2));
    s += `<rect x="${x1}" y="${T}" width="${Math.max(2, x2 - x1)}" height="${H - T - B}" style="fill:var(--bad);opacity:.09"/>`;
  });
  (o.bands || []).forEach(b => {
    const a = y(Math.min(Math.max(b.from, lo), hi)), c = y(Math.min(Math.max(b.to, lo), hi));
    s += `<rect x="${L}" y="${Math.min(a, c)}" width="${W - L - R}" height="${Math.abs(c - a)}" style="fill:${b.color};opacity:.10"/>`;
  });
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line);stroke-width:1"/>`;
    s += `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  (o.lines || []).forEach(l => {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(l.v)}" y2="${y(l.v)}" style="stroke:${l.color || 'var(--ink-2)'};stroke-width:1.5;stroke-dasharray:5 4"/>`;
    s += `<text x="${W - R - 2}" y="${y(l.v) - 5}" text-anchor="end" style="fill:${l.color || 'var(--ink-2)'}">${esc(l.label)}</text>`;
  });
  series.forEach((ser, si) => {
    const c = pts.map((p, i) => p[ser.key] != null ? [x(i), y(p[ser.key]), p[ser.key]] : null).filter(Boolean);
    if (!c.length) return;
    const poly = c.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
    if (ser.area && c.length > 1) {
      const base = o.invert ? T : H - B;
      s += `<polygon points="${c[0][0].toFixed(1)},${base} ${poly} ${c[c.length - 1][0].toFixed(1)},${base}" style="fill:${ser.color};opacity:.12"/>`;
    }
    if (c.length > 1) s += `<polyline points="${poly}" style="fill:none;stroke:${ser.color};stroke-width:${ser.dashed ? 1.6 : 2.4};stroke-linejoin:round;stroke-linecap:round${ser.dashed ? ';stroke-dasharray:5 4' : ''}"/>`;
    if (!ser.dashed) {
      if (n <= 45) c.slice(0, -1).forEach(q => { s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" style="fill:${ser.color}"/>`; });
      const e = c[c.length - 1];
      s += `<circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="4.6" style="fill:${ser.color};stroke:var(--surface);stroke-width:2"/>`;
      if (o.endLabel !== false && si < 3) s += `<text class="end-l" x="${(e[0] + 8).toFixed(1)}" y="${(e[1] + 4).toFixed(1)}" style="fill:${ser.color}">${esc((ser.fmt || fmt)(e[2]))}</text>`;
    }
  });
  const want = Math.min(span + 1, W < 400 ? 4 : 6);
  const ds = [...new Set(Array.from({ length: want }, (_, k) => Math.round(k * span / Math.max(1, want - 1))))];
  ds.forEach(d => {
    const anchor = d === 0 ? 'start' : (d === span ? 'end' : 'middle');
    s += `<text x="${xd(d)}" y="${H - 6}" text-anchor="${anchor}">${fmtDate(addDays(pts[0].date, d))}</text>`;
  });
  s += `<line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" style="stroke:var(--ink-2);stroke-width:1;opacity:0"/>`;
  s += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" style="fill:transparent" data-chart-hit="${id}"/>`;
  s += '</svg>';
  CHARTS[id] = { pts, series, fmt, x, W, L, R, n, span, di };
  const legend = o.legend ? `<div class="legend">${series.map(se => `<span><i class="${se.dashed ? 'dash' : ''}" style="--c:${se.color}"></i>${esc(se.name)}</span>`).join('')}${(o.legendExtra || '')}</div>` : '';
  return `<div class="chart" data-chart="${id}">${legend}${s}<div class="readout" id="ro-${id}">Tippe auf den Verlauf für einzelne Werte.</div></div>`;
}
export function chartTap(e) {
  const hit = e.target.closest('[data-chart-hit]'); if (!hit) return false;
  const id = hit.getAttribute('data-chart-hit'); const C = CHARTS[id]; if (!C) return true;
  const svg = hit.ownerSVGElement; const r = svg.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * C.W;
  const d = (px - C.L) / (C.W - C.L - C.R) * C.span;
  let i = 0; C.di.forEach((v, k) => { if (Math.abs(v - d) < Math.abs(C.di[i] - d)) i = k; });
  const p = C.pts[i];
  const cur = svg.querySelector('.cursor'); cur.setAttribute('x1', C.x(i)); cur.setAttribute('x2', C.x(i)); cur.style.opacity = '.6';
  const parts = C.series.filter(se => p[se.key] != null).map(se => `${esc(se.name)} <b>${esc((se.fmt || C.fmt)(p[se.key]))}</b>`);
  const ro = document.getElementById('ro-' + id);
  if (ro) ro.innerHTML = `<b>${dowShort(p.date)} ${fmtDate(p.date)}</b> · ${parts.join(' · ') || 'kein Wert'}${p.note ? ' · ' + esc(p.note) : ''}`;
  return true;
}
export function illnessShades() { return STATE.illnessPeriods.filter(p => p.start).map(p => ({ from: p.start, to: p.end || todayStr() })); }
