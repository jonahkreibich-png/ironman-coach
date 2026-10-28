/* UI-Bausteine nach DESIGN.md: Karten, Listen, Ring, Sparkline, Quellen-Symbol, Sheets, Aktionen. */
import { esc, $ } from './util';
import { ic, sportIcon, SPORT_COLOR, SPORT_LABEL_KEY } from './icons';
import { t } from '../../shared/i18n';
import { SOURCE_LABEL } from '../../shared/activity/merge';

/* ---------- Aktionen ---------- */
export type ActFn = (el: HTMLElement, ev: Event) => void | Promise<void>;
export const ACTIONS: Record<string, ActFn> = {};
export function on(name: string, fn: ActFn) { ACTIONS[name] = fn; }
export const CHANGE: Record<string, ActFn> = {};
export function onChange(name: string, fn: ActFn) { CHANGE[name] = fn; }
export const INPUT: Record<string, ActFn> = {};
export function onInput(name: string, fn: ActFn) { INPUT[name] = fn; }

/* ---------- Text und Kleinteile ---------- */
export const sportLabel = (s: string) => t(SPORT_LABEL_KEY[s] || 'sport.other');
export function sec(title: string, body: string, aside = ''): string {
  return `<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${aside ? `<span class="aside">${aside}</span>` : ''}</div>${body}</section>`;
}
export function li(o: { act?: string; data?: Record<string, string>; icon?: string; color?: string; title: string; sub?: string; value?: string; chevron?: boolean; cls?: string; html?: boolean }): string {
  const tag = o.act ? 'button' : 'div';
  const data = Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<${tag} class="li ${o.cls || ''}"${o.act ? ` data-act="${o.act}"` : ''}${data}>
    ${o.icon ? `<span class="ic" style="--c:${o.color || 'var(--ink-2)'}">${o.icon}</span>` : ''}
    <span class="grow"><span class="t">${o.html ? o.title : esc(o.title)}</span>${o.sub ? `<br><span class="s">${o.html ? o.sub : esc(o.sub)}</span>` : ''}</span>
    ${o.value ? `<span class="v">${o.value}</span>` : ''}${o.chevron !== false && o.act ? `<span class="chev">${ic('right')}</span>` : ''}</${tag}>`;
}
export function srcBadge(src?: string | null): string {
  if (!src) return '';
  const label = SOURCE_LABEL[src] || src;
  const short = src === 'manual' ? '✎' : src === 'note' ? 'Notiz' : label.replace(/[^A-Za-zÄÖÜ]/g, '').slice(0, 2).toUpperCase();
  return `<span class="src ${src === 'manual' ? 'manual' : ''}" title="${esc(t('src.from', { s: label }))}" aria-label="${esc(t('src.from', { s: label }))}">${esc(short)}</span>`;
}
export function sportIc(sport: string): string { return `<span class="ic" style="--c:${SPORT_COLOR[sport] || 'var(--rest)'}">${sportIcon(sport)}</span>`; }
export function ring(score: number | null, level: number, label: string, small = false): string {
  const r = 40, c = 2 * Math.PI * r, v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const col = ['var(--good)', 'var(--warn)', 'var(--bad)', 'var(--rest)'][level] || 'var(--rest)';
  return `<div class="ring ${small ? 'sm' : ''}" role="img" aria-label="${esc(label)} ${score ?? ''}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c - v / 100 * c).toFixed(1)}"/></svg>
    <div class="rv"><div><b>${score == null ? '–' : score}</b>${small ? '' : `<span>${esc(label)}</span>`}</div></div></div>`;
}
export function sparkline(vals: (number | null)[], color = 'var(--accent)'): string {
  const v = vals.map(x => (x == null ? null : x));
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return '';
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const W = 100, H = 30;
  const pts = v.map((x, i) => x == null ? null : [i / (v.length - 1) * W, H - 3 - (x - lo) / span * (H - 6)]).filter(Boolean) as number[][];
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
}
export function bar(pct: number, color = 'var(--accent)'): string { return `<div class="bar" style="--c:${color}"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`; }
export function pill(text: string, kind = ''): string { return `<span class="pill ${kind}">${esc(text)}</span>`; }
export function empty(text: string): string { return `<div class="empty">${esc(text)}</div>`; }
export function more(summary: string, body: string, open = false): string {
  return `<details class="more" ${open ? 'open' : ''}><summary>${esc(summary)}<span class="chev">${ic('down')}</span></summary><div class="body">${body}</div></details>`;
}
export function field(id: string, label: string, value: any, o: { type?: string; step?: string; placeholder?: string; wide?: boolean; inputmode?: string; data?: string; min?: string; max?: string } = {}): string {
  return `<div class="fld ${o.wide ? 'wide' : ''}"><label for="${id}">${esc(label)}</label><input class="inp" id="${id}" type="${o.type || 'text'}" ${o.step ? `step="${o.step}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.min ? `min="${o.min}"` : ''} ${o.max ? `max="${o.max}"` : ''} ${o.data || ''} value="${esc(value ?? '')}" placeholder="${esc(o.placeholder || '')}"></div>`;
}
/* Zeit- und Pace-Felder (Auftrag 4 A7): getrennte Zahlenfelder statt „5:30“, weil die iPhone-Zahlentastatur keinen Doppelpunkt hat.
   kind 'ms': Min + Sek (Pace, CSS, kurze Zeiten), 'hms': Std + Min + Sek (Bestzeiten, Wunschzeiten).
   Jedes Teilfeld trägt dieselben data-Attribute (data), dazu data-tf; readTime(el) liefert die Sekunden der ganzen Gruppe. */
export function timeField(id: string, label: string, sec: number | null | undefined, kind: 'ms' | 'hms', data = '', o: { wide?: boolean; hint?: string } = {}): string {
  const s = sec != null && isFinite(sec) && sec > 0 ? Math.round(sec) : null;
  const parts: [string, string, number | null, number][] = kind === 'hms'
    ? [['h', t('time.h'), s == null ? null : Math.floor(s / 3600), 99], ['m', t('time.m'), s == null ? null : Math.floor(s % 3600 / 60), 59], ['s', t('time.s'), s == null ? null : s % 60, 59]]
    : [['m', t('time.m'), s == null ? null : Math.floor(s / 60), 99], ['s', t('time.s'), s == null ? null : s % 60, 59]];
  return `<div class="fld ${o.wide ? 'wide' : ''}"><span class="lab" id="${id}-l">${esc(label)}</span><div class="tf" role="group" aria-labelledby="${id}-l" data-tfkind="${kind}">${parts.map(([k, l, v, max]) =>
    `<label class="tfp"><input class="inp" id="${id}-${k}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" data-tf="${k}" data-max="${max}" ${data} value="${v == null ? '' : k === 'h' ? v : String(v).padStart(2, '0')}" placeholder="${k === 'h' ? '0' : '00'}" aria-label="${esc(l)}"><span>${esc(l)}</span></label>`).join('')}</div>${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
}
/* Sekunden aus einer Zeitgruppe (null = leer, NaN = ungültig) */
export function readTime(el: HTMLElement): number | null {
  const g = el.closest('.tf'); if (!g) return null;
  const v = (k: string) => { const i = g.querySelector(`[data-tf="${k}"]`) as HTMLInputElement | null; if (!i) return 0; const raw = i.value.trim(); if (raw === '') return null; const n = +raw.replace(/\D/g, ''); return n; };
  const h = v('h'), m = v('m'), s = v('s');
  if (h == null && m == null && s == null) return null;
  if ((m ?? 0) > 59 && g.getAttribute('data-tfkind') === 'hms') return NaN;
  if ((s ?? 0) > 59) return NaN;
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}
export const secToMmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export function select(id: string, label: string, value: string, options: [string, string][], data = ''): string {
  return `<div class="fld"><label for="${id}">${esc(label)}</label><select class="inp" id="${id}" ${data}>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}
export function toggle(id: string, label: string, on: boolean, data = ''): string {
  return `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${data}><span>${esc(label)}</span></label>`;
}

/* ---------- Sheet ---------- */
let sheetRender: (() => string) | null = null;
/* Auftrag 17: an Fachbegriffen nur ein dezenter Link ins Lexikon (Mehr → Lexikon), keine Erklärtexte in den Ansichten */
export function termLink(term: string, label = term): string { return `<button type="button" class="term" data-act="lex" data-q="${esc(term)}" aria-label="${esc(t('lexicon.open', { term }))}">${esc(label)}</button>`; }
export function openSheet(title: string, render: () => string): void {
  sheetRender = () => `<div class="sheet-grip"></div><div class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${ic('close')}</button></div>${render()}`;
  $('#sheetPanel').innerHTML = sheetRender();
  $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
}
export function refreshSheet(): void { if (sheetRender && !$('#sheet').hidden) { const p = $('#sheetPanel'); const y = p.scrollTop; p.innerHTML = sheetRender(); p.scrollTop = y; } }
export function closeSheet(): void { sheetRender = null; $('#sheet').hidden = true; $('#sheetPanel').innerHTML = ''; document.body.style.overflow = ''; }
export function sheetOpen(): boolean { return !$('#sheet').hidden; }
on('sheet-close', () => closeSheet());

/* Zweistufige Bestätigung für gefährliche Knöpfe */
export function armed(btn: HTMLElement, label?: string): boolean {
  if (btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1'; const orig = btn.innerHTML;
  btn.textContent = label || t('common.sure'); btn.classList.add('armed');
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.innerHTML = orig; btn.classList.remove('armed'); } }, 3200);
  return false;
}
export { ic, sportIcon, esc };
