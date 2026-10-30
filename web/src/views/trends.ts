import { storage as localStorage } from "../persistence";
/* Auftrag 13, Punkt 3: Trends im Fortschritt. Rechnung in shared/trends.ts, hier nur Anzeige:
   Zeitraum wählen, je Gruppe Karten mit großer Zahl, Veränderung und einem Satz; Antippen zeigt den Verlauf. */
import { STATE, PLAN, BASE_WEEKS } from '../store';
import { esc, fmtDate } from '../util';
import { D } from '../data';
import { on, sparkline, openSheet, fold } from '../kit';
import { lineChart } from '../charts';
import { trendCards, GROUPS, type Period, type TrendCard, type TrendGroup } from '../../../shared/trends';
import { t } from '../../../shared/i18n';
import { nav } from '../nav';

const KEY = 'trendPeriod';
let PERIOD: Period = (() => { try { const v = localStorage.getItem(KEY); return v === '3m' || v === '1y' ? v : '4w'; } catch (e) { return '4w'; } })();
let CARDS: TrendCard[] = [];
let GROUP: TrendGroup | 'all' = 'all';

export function currentTrends(): TrendCard[] {
  const d = D();
  const state = { ...STATE, profile: d.profile, settings: { ...STATE.settings, readiness: d.fallback } };
  return trendCards({ today: d.today, period: PERIOD, activities: d.activities, trend: STATE.trend || [], illness: STATE.illnessPeriods || [], profile: d.profile, state, weeks: BASE_WEEKS.length ? PLAN.weeks : [] });
}
const TONE: Record<string, string> = { good: 'var(--good)', warn: 'var(--warn)', info: 'var(--info)' };
function card(c: TrendCard): string {
  if (c.locked) return `<div class="tcard locked" data-trend="${esc(c.id)}"><div class="tc-main"><div class="tc-t">${esc(c.title)}</div><div class="tc-s">${esc(c.locked)}</div></div></div>`;
  const preview = c.chart && c.chart.pts.length > 1 ? lineChart(c.chart.pts, c.chart.series, { h: 115, legend: c.chart.series.length > 1, endLabel: false, invert: c.chart.invert, fmt: c.chart.fmt && FMT[c.chart.fmt] ? FMT[c.chart.fmt] : undefined, label: c.title }) : '';
  return `<div class="card tight trend-panel"><button class="tcard" data-act="trend-open" data-id="${esc(c.id)}" data-trend="${esc(c.id)}" style="--c:${TONE[c.tone]}">
    <div class="tc-main"><div class="tc-t"><i class="tc-dot"></i>${esc(c.title)}</div><div class="tc-s">${esc(c.text)}</div></div>
    <div class="tc-val"><div class="tc-n num">${esc(c.value || '-')}${c.unit ? `<small> ${esc(c.unit)}</small>` : ''}</div>${c.delta ? `<div class="tc-d">${esc(c.delta)}</div>` : ''}</div></button>${preview}</div>`;
}
export function renderTrends(): string {
  CARDS = currentTrends();
  const seg = `<div class="seg" role="tablist" data-trend-period>${(['4w', '3m', '1y'] as Period[]).map(p => `<button role="tab" aria-selected="${p === PERIOD}" class="${p === PERIOD ? 'on' : ''}" data-act="trend-period" data-p="${p}">${esc(t('trend.p.' + p))}</button>`).join('')}</div>`;
  const groups = GROUPS.map(g => {
    if (GROUP !== 'all' && GROUP !== g) return '';
    const list = CARDS.filter(c => c.group === g);
    if (!list.length) return '';
    const open = list.filter(c => !c.locked), locked = list.filter(c => c.locked);
    return `<div class="tgroup" data-tgroup="${g}"><div class="lbl">${esc(t('trend.g.' + g))}</div><div class="tlist">${[...open, ...locked].map(card).join('')}</div></div>`;
  }).join('');
  const filters = `<div class="chips trend-groups" role="group" aria-label="Trendgruppe">${(['all', ...GROUPS] as const).map(g => `<button class="chip ${GROUP === g ? 'on' : ''}" aria-pressed="${GROUP === g}" data-act="trend-group" data-group="${g}">${g === 'all' ? 'Alle' : esc(t('trend.g.' + g))}</button>`).join('')}</div>`;
  // Auftrag 23: einklappbar; eingeklappt: Anzahl und der erste Hinweis
  const open = CARDS.filter(c => !c.locked); const warn = open.find(c => c.tone === 'warn') || open[0];
  const sum = open.length ? t('trend.sum', { n: open.length }) + (warn ? ` · ${warn.title}${warn.value ? ': ' + warn.value + (warn.unit ? ' ' + warn.unit : '') : ''}` : '') : t('trend.sumNone');
  return fold('trends', t('trend.title'), sum, `<div class="stack">${seg}${filters}${groups}</div>`, { aside: esc(t('trend.aside')) });
}

const FMT: Record<string, (v: number) => string> = {
  pace: v => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`,
  pace100: v => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`,
  pct: v => `${String(Math.round(v * 10) / 10).replace('.', ',')} %`,
  h: v => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
};
function sheet(id: string): string {
  const c = CARDS.find(x => x.id === id); if (!c) return '';
  const ch = c.chart;
  return `<div class="stack" data-trend-sheet="${esc(c.id)}"><div class="spread"><span class="hero-num" style="color:${TONE[c.tone]}">${esc(c.value || '–')}<small class="xs muted"> ${esc(c.unit || '')}</small></span>${c.delta ? `<span class="small muted" style="text-align:right">${esc(c.delta)}</span>` : ''}</div>
    <div class="banner ${c.tone === 'warn' ? 'warn' : c.tone === 'good' ? 'good' : 'info'}">${esc(c.text)}</div>
    ${c.rows ? `<div class="list">${c.rows.map(r => `<div class="li"><span class="grow small">${esc(r.label)}${r.date ? `<br><span class="muted xs">${esc(fmtDate(r.date))}</span>` : ''}</span><span class="v small num">${esc(r.value)}${r.badge === 'neu' ? ` <span class="pill good">${esc(t('trend.new'))}</span>` : r.badge === 'best' ? ' ★' : ''}</span></div>`).join('')}</div>` : ''}
    ${ch && ch.pts.length > 1 ? lineChart(ch.pts, ch.series, { legend: ch.series.length > 1, lines: ch.lines, invert: ch.invert, fmt: ch.fmt && FMT[ch.fmt] ? FMT[ch.fmt] : undefined, label: c.title }) : ''}
    <div class="hint">${esc(t('trend.period', { p: t('trend.p.' + PERIOD) }))}</div></div>`;
}
on('trend-period', el => { PERIOD = el.dataset.p as Period; try { localStorage.setItem(KEY, PERIOD); } catch (e) { /* privat */ } nav.rerender(); });
on('trend-group', el => { const g = el.dataset.group as TrendGroup | 'all'; if (g === 'all' || GROUPS.includes(g)) { GROUP = g; nav.rerender(); } });
on('trend-open', el => { const id = el.dataset.id!; const c = CARDS.find(x => x.id === id); openSheet(c ? c.title : '', () => sheet(id)); });
export type { TrendGroup };
