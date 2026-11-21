import { swimAids, GEAR_TXT } from '../../shared/workouts';
/* UI-Bausteine nach DESIGN.md: Karten, Listen, Ring, Sparkline, Quellen-Symbol, Sheets, Aktionen. */
import { esc, $ } from './util';
import { parseInput, readTimeInput, autoColon, timeWords, fmtTimeInput, type InputSpec, type TimeKind, type TimeRead } from '../../shared/validate';
import { toast as showToast } from './toast';
import { ic, sportIcon, SPORT_COLOR, SPORT_LABEL_KEY } from './icons';
import { t } from '../../shared/i18n';
import { SOURCE_LABEL } from '../../shared/activity/merge';
import { storage } from './persistence';
import { logError } from './errlog';
import { nav } from './nav';

/* ---------- Aktionen ---------- */
export type ActFn = (el: HTMLElement, ev: Event) => void | Promise<void>;
export const ACTIONS: Record<string, ActFn> = {};
export function on(name: string, fn: ActFn) { ACTIONS[name] = fn; }
export const CHANGE: Record<string, ActFn> = {};
export function onChange(name: string, fn: ActFn) { CHANGE[name] = fn; }
export const INPUT: Record<string, ActFn> = {};
export function onInput(name: string, fn: ActFn) { INPUT[name] = fn; }

/* ---------- Auftrag 28: Fehler bleiben in ihrem Bereich ---------- */
/* Ein Fehler in einem Bereich (Karte, Ansicht) zeigt nur dort „konnte nicht geladen werden“, statt die ganze App zu blockieren.
   Gemeldet wird jeder Fehler einmal je Sitzung (Fehlerprotokoll, ohne Gesundheitsdaten). */
const reportedBlocks = new Set<string>();
export function failedBlock(name: string, retry = false): string {
  return `<div class="card stack" data-failed="${esc(name)}" role="status"><b>${esc(t('err.blockTitle'))}</b><div class="hint">${esc(t('err.blockHint'))}</div>${retry ? `<button class="btn ghost" data-act="view-retry">${esc(t('err.retry'))}</button>` : ''}</div>`;
}
export function safeBlock(name: string, fn: () => string, retry = false): string {
  try {
    // nur für Tests (tests/e2e/start28.spec.ts): einen Bereich gezielt scheitern lassen
    if ((globalThis as any).__stamioFailBlock === name) throw new Error('Testfehler in ' + name);
    return fn();
  }
  catch (e: any) {
    const msg = (e && e.message) || String(e);
    if (!reportedBlocks.has(name + msg)) { reportedBlocks.add(name + msg); try { logError(msg, 'view:' + name + ' ' + (String((e && e.stack) || '').split('\n')[1] || '')); } catch (_) { /* nie scheitern */ } }
    return failedBlock(name, retry);
  }
}
/* Für Teile ohne Ausgabe (Kopfzeile, Tab-Leiste, Abzeichen): Fehler melden, weiterlaufen */
export function safeRun(name: string, fn: () => void): void { safeBlock(name, () => { fn(); return ''; }); }

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
  const short = src === 'manual' ? '✎' : src === 'note' ? 'Notiz' : src === 'sections' ? 'Σ' : label.replace(/[^A-Za-zÄÖÜ]/g, '').slice(0, 2).toUpperCase();
  return `<span class="src ${src === 'manual' ? 'manual' : ''}" title="${esc(t('src.from', { s: label }))}" aria-label="${esc(t('src.from', { s: label }))}">${esc(short)}</span>`;
}
/* Auftrag 21: Hilfsmittel einer Schwimmeinheit als Symbol + Wort */
export function gearChips(s: any): string {
  const aids = swimAids(s); if (!aids.length) return '';
  return `<span class="gear-chips" data-gear>${aids.map(g => `<span class="gear-chip">${ic(g)}${esc(GEAR_TXT[g] || g)}</span>`).join('')}</span>`;
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
/* Auftrag 23: einklappbarer Bereich, Zustand je Gerät gemerkt. Eingeklappt zeigt die Kopfzeile das Wichtigste (sum).
   kind 'sec': Abschnitt mit Überschrift; 'card': Karte innerhalb eines Abschnitts (z. B. eine Prognose je Ziel). */
const FOLD_KEY = 'fold:';
export function foldOpen(id: string, def = true): boolean {
  try { const v = storage.getItem(FOLD_KEY + id); return v === '1' ? true : v === '0' ? false : def; } catch (e) { return def; }
}
export function fold(id: string, title: string, sum: string, body: string, o: { kind?: 'sec' | 'card'; aside?: string; def?: boolean; sub?: string; badge?: string } = {}): string {
  const open = foldOpen(id, o.def ?? true);
  if ((o.kind || 'sec') === 'card') return `<details class="fold fold-card card" data-fold="${esc(id)}" ${open ? 'open' : ''}><summary class="fold-h"><span class="fold-t"><b>${esc(title)}</b>${o.badge ? ` <span class="pill">${esc(o.badge)}</span>` : ''}${o.sub ? `<br><span class="xs muted">${esc(o.sub)}</span>` : ''}</span><span class="fold-sum num" data-fold-sum>${esc(sum)}</span><span class="chev" aria-hidden="true">${ic('down')}</span></summary><div class="fold-body">${body}</div></details>`;
  return `<section class="sec"><details class="fold fold-sec" data-fold="${esc(id)}" ${open ? 'open' : ''}><summary class="sec-h fold-h"><h2>${esc(title)}</h2><span class="fold-sum" data-fold-sum>${esc(sum)}</span>${o.aside ? `<span class="aside fold-aside">${o.aside}</span>` : ''}<span class="chev" aria-hidden="true">${ic('down')}</span></summary><div class="fold-body">${body}</div></details></section>`;
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('click', ev => {
  // sofort beim Antippen merken (das toggle-Ereignis kommt erst danach; wer gleich neu lädt oder die App schließt, verlöre es sonst)
  const sm = ev.target && (ev.target as HTMLElement).closest ? (ev.target as HTMLElement).closest('summary') : null;
  const det = sm && sm.parentElement && sm.parentElement.matches('details[data-fold]') ? sm.parentElement as HTMLDetailsElement : null;
  if (det && !ev.defaultPrevented) { try { storage.setItem(FOLD_KEY + det.dataset.fold, det.open ? '0' : '1'); } catch (e) { /* privat */ } }
}, true);
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('toggle', ev => {
  const el = ev.target as HTMLElement;
  if (el && el.matches && el.matches('details[data-fold]')) { try { storage.setItem(FOLD_KEY + el.dataset.fold, (el as HTMLDetailsElement).open ? '1' : '0'); } catch (e) { /* privat */ } }
}, true);
export function more(summary: string, body: string, open = false): string {
  return `<details class="more" ${open ? 'open' : ''}><summary>${esc(summary)}<span class="chev">${ic('down')}</span></summary><div class="body">${body}</div></details>`;
}
export function field(id: string, label: string, value: any, o: { type?: string; step?: string; placeholder?: string; wide?: boolean; inputmode?: string; data?: string; min?: string; max?: string; dur?: boolean } = {}): string {
  // Auftrag 39: o.dur = Dauer in Minuten (90 = 90 min, 4530 = 45:30, 45,30 = 45 min 30 s), darunter die verstandene Dauer
  const dur = o.dur ? ` ${tfData('min', [0, 86400])}` : '';
  const im = o.dur ? 'decimal' : o.inputmode;
  return `<div class="fld ${o.wide ? 'wide' : ''}"><label for="${id}">${esc(label)}</label><input class="inp" id="${id}" type="${o.type || 'text'}" ${o.step ? `step="${o.step}"` : ''} ${im ? `inputmode="${im}"` : ''} ${o.min ? `min="${o.min}"` : ''} ${o.max ? `max="${o.max}"` : ''}${dur} ${o.data || ''} value="${esc(value ?? '')}" placeholder="${esc(o.placeholder || '')}">${o.dur ? tfHint(durHint(value)) : ''}</div>`;
}
/** „= 1 h 30 min“ unter einem Minuten-Feld, wenn die Zahl allein nicht klar ist */
export function durHint(v: any): string { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 && (n >= 60 || !Number.isInteger(n)) ? '= ' + timeWords(n * 60) : ''; }
/* Zeit- und Pace-Felder. Auftrag 39: EIN Feld statt getrennter Kästchen. Nur Ziffern tippen, der Doppelpunkt kommt von selbst
   (530 → 5:30, 14530 → 1:45:30); Komma, Punkt, Doppelpunkt gehen auch. Unter dem Feld steht, was verstanden wurde („= 45 min 30 s“),
   bei unklarer Eingabe eine Nachfrage mit Knöpfen (gespeichert wird erst nach der Antwort). Regel: readTimeInput (shared/validate.ts).
   kind: 'ms' Min:Sek (Pace, Testzeiten), 'hms' Std:Min:Sek (Bestzeiten, Wunsch- und Wettkampfzeiten), dazu 'pace' und 'sec'. */
export type TfOpts = { wide?: boolean; hint?: string; lim?: [number, number] | null; unit?: string };
/** data-Attribute für ein Zeitfeld (Feldart, Grenzen in Sekunden, Einheit für die Anzeige darunter) */
export function tfData(kind: TimeKind, lim?: [number, number] | null, unit?: string): string {
  return `data-tfkind="${kind}"${lim ? ` data-tflo="${lim[0]}" data-tfhi="${lim[1]}"` : ''}${unit ? ` data-tfunit="${esc(unit)}"` : ''}`;
}
/** Zeile unter dem Feld („= 45 min 30 s“); leer bis zur ersten Eingabe */
export const tfHint = (text = '') => `<span class="tf-hint" data-tf-hint aria-live="polite">${esc(text)}</span>`;
export function timeField(id: string, label: string, sec: number | null | undefined, kind: TimeKind, data = '', o: TfOpts = {}): string {
  const s = sec != null && isFinite(sec) && sec > 0 ? Math.round(sec) : null;
  const lim = o.lim !== undefined ? o.lim : kind === 'hms' ? [60, 48 * 3600] as [number, number] : null;
  const ph = kind === 'hms' ? 'z. B. 14530 = 1:45:30' : kind === 'sec' ? 'z. B. 45 = 0:45' : 'z. B. 530 = 5:30';
  return `<div class="fld ${o.wide ? 'wide' : ''}"><label for="${id}">${esc(label)}</label><input class="inp" id="${id}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-tf="1" ${tfData(kind, lim, o.unit)} ${data} value="${s == null ? '' : fmtTimeInput(s, kind)}" placeholder="${esc(ph)}">${tfHint()}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
}
const tfLim = (el: HTMLElement): [number, number] | null => (el.dataset.tflo != null && el.dataset.tfhi != null ? [+el.dataset.tflo, +el.dataset.tfhi] : null);
/** Eingabe eines Zeitfelds lesen (Regel und Grenzen aus den data-Attributen) */
export function tfRead(el: HTMLElement): TimeRead { return readTimeInput((el as HTMLInputElement).value, (el.dataset.tfkind || 'ms') as TimeKind, tfLim(el)); }
/* Sekunden aus einem Zeitfeld (null = leer, NaN = ungültig oder noch unklar – dann steht die Nachfrage unter dem Feld) */
export function readTime(el: HTMLElement): number | null {
  const r = tfRead(el);
  if (r.err || r.ask) return NaN;
  return r.sec;
}
/** true, solange unter dem Feld eine Nachfrage steht (dann nichts speichern und keine Fehlermeldung zeigen) */
export const tfAsking = (el: HTMLElement) => !!el && !!el.dataset && el.dataset.tfask === '1';
/** ungültige Zeit melden – außer es steht gerade die Nachfrage unter dem Feld */
export function tfInvalid(el: HTMLElement) { if (!tfAsking(el)) showToast(t('time.invalid')); }
function tfHintEl(el: HTMLElement): HTMLElement {
  let h = el.nextElementSibling as HTMLElement | null;
  if (!h || !h.matches('[data-tf-hint]')) { const tmp = document.createElement('span'); tmp.innerHTML = tfHint(); h = tmp.firstElementChild as HTMLElement; el.insertAdjacentElement('afterend', h); }
  return h;
}
function tfShow(el: HTMLElement, final: boolean) {
  const inp = el as HTMLInputElement; const kind = (el.dataset.tfkind || 'ms') as TimeKind;
  const raw = inp.value.trim(); const h = tfHintEl(el);
  if (!raw) { h.textContent = ''; delete el.dataset.tfask; return; }
  const r = tfRead(el);
  // Dauer-Feld mit Einheit („1,5 h“, „45 min“): das prüft parseInput beim Verlassen
  if (r.err === 'format' && (kind === 'min' || kind === 'minShort') && /[a-zäöü]/i.test(raw)) { h.textContent = ''; delete el.dataset.tfask; return; }
  if (r.ask && final) {
    el.dataset.tfask = '1';
    h.innerHTML = `<span>Meinst du</span> ${r.ask.map((s, i) => `${i ? '<span>oder</span> ' : ''}<button type="button" class="btn ghost sm" data-act="tf-pick" data-for="${esc(el.id)}" data-v="${esc(fmtTimeInput(s, kind))}">${esc(askLabel(s, kind, raw))}</button>`).join(' ')}<span>?</span>`;
    h.classList.add('ask'); return;
  }
  delete el.dataset.tfask; h.classList.remove('ask');
  if (r.ask) { h.textContent = '…'; return; }
  if (r.err) { h.textContent = final ? (r.err === 'sec' ? 'Sekunden bitte unter 60 (z. B. 5:30).' : 'Bitte nur Ziffern tippen, z. B. 530 für 5:30.') : ''; return; }
  if (r.sec == null) { h.textContent = ''; return; }
  h.textContent = `= ${timeWords(r.sec)}${el.dataset.tfunit ? ' ' + el.dataset.tfunit : ''}`;
}
/* Knopf der Nachfrage: „5:30“ / „5:18 (5,3 min)“ bzw. bei langen Zeiten in Worten („1 h 30 min“ / „1 min 30 s“) */
function askLabel(s: number, kind: TimeKind, raw: string): string {
  if (kind === 'min' || kind === 'minShort' || kind === 'hms') return timeWords(s);
  const clock = fmtTimeInput(s, kind);
  const m = /^(\d+)[,.](\d)$/.exec(raw.replace(/\s/g, ''));
  return m && s === +m[1] * 60 + +m[2] * 6 ? `${clock} (${m[1]},${m[2]} min)` : clock;
}
const TF_LAST = new WeakMap<HTMLElement, string>();
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('input', ev => {
    const el = ev.target as HTMLInputElement;
    if (!el || !el.dataset || !el.dataset.tfkind || el.tagName !== 'INPUT') return;
    const next = autoColon(el.value, el.dataset.tfkind as TimeKind);
    if (next !== el.value) { el.value = next; try { el.setSelectionRange(next.length, next.length); } catch (e) { /* nicht jedes Feld */ } }
    tfShow(el, false);
  }, true);
  // vor den Ansichten: bei unklarer Eingabe die Nachfrage setzen (die Ansicht sieht tfAsking und speichert nichts)
  document.addEventListener('change', ev => {
    const el = ev.target as HTMLInputElement;
    if (!el || !el.dataset || !el.dataset.tfkind || el.tagName !== 'INPUT') return;
    // eindeutig verstanden → im Feld so zeigen, wie es gespeichert wird („2,27“ → „2:27“, „5“ → „5:00“); Minuten-Felder zeigt die Ansicht
    const kind = el.dataset.tfkind as TimeKind; const r = tfRead(el);
    if (kind !== 'min' && kind !== 'minShort' && r.sec != null && !r.ask && !r.err && !r.out) el.value = fmtTimeInput(r.sec, kind);
    TF_LAST.set(el, el.value);
    tfShow(el, true);
  }, true);
  /* Setzt das Skript beim Tippen den Doppelpunkt (letzte Änderung „von uns“), lösen WebKit und Chromium beim Verlassen kein „change“
     aus – die Eingabe wäre nie gespeichert worden. Deshalb: Wert beim Antippen merken und beim Verlassen selbst „change“ auslösen. */
  document.addEventListener('focusin', ev => { const el = ev.target as HTMLInputElement; if (el && el.dataset && el.dataset.tfkind && el.tagName === 'INPUT') TF_LAST.set(el, el.value); }, true);
  document.addEventListener('focusout', ev => {
    const el = ev.target as HTMLInputElement;
    if (!el || !el.dataset || !el.dataset.tfkind || el.tagName !== 'INPUT' || !TF_LAST.has(el)) return;
    if (TF_LAST.get(el) !== el.value) el.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);
}
on('tf-pick', el => {
  const inp = document.getElementById(el.dataset.for || '') as HTMLInputElement | null; if (!inp) return;
  inp.value = el.dataset.v || ''; delete inp.dataset.tfask;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
});
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
  nav.seq++; // Auftrag 35: neuere Handlung – ein noch ausstehender Tab-Tipp schließt das Blatt nicht mehr
  sheetRender = () => `<div class="sheet-grip"></div><div class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${ic('close')}</button></div>${render()}`;
  $('#sheetPanel').innerHTML = sheetRender();
  $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
}
/* Auftrag 37: aufgeklappte Bereiche nach dem Neuzeichnen wiederfinden. Vorher über den Text der Überschrift – gleich lautende Bereiche
   („Satz bearbeiten“, „Lage, Hilfsmittel …“) klappten dann alle auf, sobald man in einem etwas änderte. Jetzt über eine feste Kennung
   (data-key, data-fold, id); der Text gilt nur noch, wenn er im Fenster eindeutig ist. */
const ownKey = (d: Element) => d.getAttribute('data-key') || d.getAttribute('data-fold') || d.getAttribute('data-ivk') || d.id || '';
const sumText = (d: Element) => (d.querySelector(':scope > summary')?.textContent || '').trim();
function detailsKeys(list: Element[]): (string | null)[] {
  const cnt = new Map<string, number>();
  list.forEach(d => { if (!ownKey(d)) { const t0 = sumText(d); cnt.set(t0, (cnt.get(t0) || 0) + 1); } });
  return list.map(d => { const k = ownKey(d); if (k) return 'k:' + k; const t0 = sumText(d); return t0 && cnt.get(t0) === 1 ? 't:' + t0 : null; });
}
function redrawPanel(p: HTMLElement, html: string): void {
  const y = p.scrollTop;
  // Auftrag 29: aufgeklappte Abschnitte („Weitere Werte“, Notiz …) bleiben beim Neuzeichnen offen (vorher klappten sie nach jeder Eingabe zu)
  const before = Array.from(p.querySelectorAll('details')); const bk = detailsKeys(before);
  const open = new Set(before.map((d, i) => ((d as HTMLDetailsElement).open ? bk[i] : null)).filter(Boolean) as string[]);
  // Auftrag 29: tippt man schon im nächsten Feld, bleiben Fokus und angefangene Eingabe erhalten (vorher ersetzte das Neuzeichnen das Feld)
  const act = document.activeElement as HTMLInputElement | null;
  const keep = act && act.id && p.contains(act) && /^(INPUT|TEXTAREA)$/.test(act.tagName) ? { id: act.id, value: act.value, typed: act.value !== act.defaultValue, sel: (() => { try { return act.selectionStart; } catch (e) { return null; } })() } : null;
  p.innerHTML = html;
  const after = Array.from(p.querySelectorAll('details')); const ak = detailsKeys(after);
  after.forEach((d, i) => { if (ak[i] && open.has(ak[i]!)) (d as HTMLDetailsElement).open = true; });
  if (keep) { const el = document.getElementById(keep.id) as HTMLInputElement | null; if (el && p.contains(el)) { if (keep.typed) el.value = keep.value; el.focus({ preventScroll: true }); try { if (keep.sel != null) el.setSelectionRange(keep.sel, keep.sel); } catch (e) { /* Feldart ohne Auswahl */ } } }
  p.scrollTop = y;
}
export function refreshSheet(): void {
  if (sheetRender && !$('#sheet').hidden) redrawPanel($('#sheetPanel'), sheetRender());
  refreshSub();
}
const closeHooks: (() => void)[] = [];
export function onSheetClose(fn: () => void): void { closeHooks.push(fn); }
export function closeSheet(): void { closeSub(true); closeHooks.forEach(f => { try { f(); } catch (e) { /* nie scheitern */ } }); sheetRender = null; $('#sheet').hidden = true; $('#sheetPanel').innerHTML = ''; document.body.style.overflow = ''; }
export function sheetOpen(): boolean { return !$('#sheet').hidden; }

/* ---------- Auftrag 37: Fenster über dem Fenster – ein Teil der Einheit (Aufwärmen, Satz, Wiederholung, Übung) ----------
   render liefert '' → den Teil gibt es nicht mehr (z. B. gelöscht oder rückgängig gemacht): das Fenster schließt sich. */
let subRender: (() => string) | null = null;
let subTitle: () => string = () => '';
let subClosed: (() => void) | null = null;
const subEl = () => document.getElementById('sub');
function subHtml(): string {
  const body = subRender ? subRender() : ''; if (!body) return '';
  return `<div class="sheet-grip"></div><div class="sheet-h"><h2>${esc(subTitle())}</h2><button class="icon-btn" data-act="sub-close" aria-label="${esc(t('common.close'))}">${ic('close')}</button></div>${body}`;
}
export function openSub(title: string | (() => string), render: () => string, onClose?: () => void): void {
  const el = subEl(); if (!el) return;
  if (subRender) closeSub(true); // Wechsel zu einem anderen Teil: ohne Schließen-Hinweis
  subTitle = typeof title === 'function' ? title : () => title; subRender = render; subClosed = onClose || null;
  const html = subHtml(); if (!html) { subRender = null; subClosed = null; return; }
  $('#subPanel').innerHTML = html; el.hidden = false; document.body.style.overflow = 'hidden'; $('#subPanel').scrollTop = 0;
}
export function refreshSub(): void {
  const el = subEl(); if (!subRender || !el || el.hidden) return;
  const html = subHtml(); if (!html) { closeSub(); return; }
  redrawPanel($('#subPanel'), html);
}
export function closeSub(silent = false): void {
  const el = subEl();
  if (!el || el.hidden) { subRender = null; subClosed = null; return; }
  // offenes Feld noch übernehmen (iPhone: „Fertig“ tippen, ohne das Feld vorher zu verlassen)
  const a = document.activeElement as HTMLElement | null;
  if (a && $('#subPanel').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
  if (el.hidden) return; // das Verlassen des Felds hat das Fenster schon geschlossen
  const cb = subClosed; subRender = null; subClosed = null; el.hidden = true; $('#subPanel').innerHTML = '';
  document.body.style.overflow = sheetOpen() ? 'hidden' : '';
  if (cb && !silent) { try { cb(); } catch (e) { /* nie scheitern */ } }
}
export function subOpen(): boolean { const el = subEl(); return !!el && !el.hidden; }
on('sub-close', () => closeSub());
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
/* Auftrag 29: Zahl aus einem Eingabefeld lesen (shared/validate parseInput). Ungültig: Meldung, Feld zeigt wieder den gespeicherten Wert,
   nichts wird gespeichert. Umgerechnet (andere Einheit): Hinweis. Ergebnis undefined = nicht speichern, null = Feld geleert. */
export function readNumberInput(el: HTMLElement, spec: InputSpec): number | null | undefined {
  const inp = el as HTMLInputElement;
  const r = parseInput(spec, inp.value);
  // Auftrag 39: unklare Dauer → die Nachfrage steht unter dem Feld; nichts speichern, Eingabe stehen lassen
  if (!r.ok && (r.ask || tfAsking(el))) return undefined;
  if (!r.ok) { inp.setAttribute('aria-invalid', 'true'); inp.value = inp.defaultValue; showToast(r.msg!); return undefined; }
  inp.removeAttribute('aria-invalid');
  if (r.note) showToast(r.note);
  return r.value;
}
