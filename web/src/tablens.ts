/* Auftrag 23: Tab-Leiste wie in iOS 26. Drücken und Halten (oder Wischen über die Leiste) zeigt unter dem Finger eine leicht vergrößerte
   Glas-Linse, die elastisch nachfedert und dem Finger von Tab zu Tab folgt; der Tab darunter ist hervorgehoben. Loslassen: die Linse springt
   weich auf den Tab und öffnet ihn. Normales Antippen bleibt sofort (der Klick läuft wie bisher über data-act="go-tab").
   Nur transform/opacity, ein requestAnimationFrame-Schleife (60 fps auch auf älteren iPhones). „Bewegung reduzieren“: keine Feder, keine
   Vergrößerung, die Linse springt ohne Animation von Tab zu Tab.
   Eigene Datei, weil es die Geste vorher nicht gab; die Navigation selbst bleibt in main.ts (ACTIONS['go-tab']). */
import { ACTIONS } from './kit';

const HOLD_MS = 220;     // ab hier gilt Drücken als Halten
const SLOP = 8;          // so weit darf der Finger beim Antippen wandern
const SCALE = 1.14;      // Vergrößerung der Linse und des Inhalts darunter

interface Spring { x: number; v: number; s: number; vs: number }
let bar: HTMLElement | null = null, tabs: HTMLElement | null = null, lens: HTMLElement | null = null, inner: HTMLElement | null = null;
let pid: number | null = null, timer = 0, active = false, raf = 0, last = 0;
let targetX = 0, targetS = 1, releasing = false, releaseTab: HTMLElement | null = null;
const st: Spring = { x: 0, v: 0, s: 0.6, vs: 0 };
/* Nach dem Loslassen kommt noch der normale Klick derselben Geste; der würde ein zweites Mal navigieren. Die nächste Berührung setzt es zurück. */
let swallowClick = false;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabButtons = () => tabs ? [...tabs.querySelectorAll<HTMLElement>('.tab')] : [];
/* Geometrie wird beim Start der Geste einmal gelesen (kein Layout-Lesen im Animations-Frame) */
interface Geo { L: { w: number; h: number; top: number }; brLeft: number; brTop: number; tr: { left: number; top: number; width: number; height: number; right: number }; centers: { tab: string; c: number }[] }
let G: Geo | null = null;
function measure(): Geo {
  const r = tabs!.getBoundingClientRect(); const br = { left: 0, top: 0 };   // Linse ist position: fixed
  const list = tabButtons(); const n = Math.max(1, list.length);
  const w = Math.min(96, r.width / n + 10), h = Math.min(r.height - 4, 64);
  return { L: { w, h, top: r.top - br.top + (r.height - h) / 2 }, brLeft: br.left, brTop: br.top, tr: { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right },
    centers: list.map(b => { const q = b.getBoundingClientRect(); return { tab: b.dataset.tab || '', c: q.left + q.width / 2 }; }) };
}
function tabAt(x: number): HTMLElement | null {
  const g = G || measure(); if (!g.centers.length) return null;
  let best = g.centers[0], d = Infinity;
  for (const c of g.centers) { const dd = Math.abs(c.c - x); if (dd < d) { d = dd; best = c; } }
  return tabs!.querySelector<HTMLElement>(`.tab[data-tab="${best.tab}"]`);
}
function centerOf(b: HTMLElement): number { const g = G || measure(); const c = g.centers.find(x => x.tab === b.dataset.tab); return c ? c.c : 0; }

/* Vergrößerte Kopie der Tabs: nur zum Ansehen. Eigene Klassen und keine data-tab/aria-Merkmale, damit weder Screenreader noch Tests
   (oder Klicks) einen Tab doppelt finden. */
function copyTabs(): void {
  if (!inner || !tabs) return;
  inner.innerHTML = tabs.innerHTML;
  inner.querySelectorAll<HTMLElement>('*').forEach(e => {
    if (e.classList.contains('tab')) { e.classList.replace('tab', 'ltab'); if (e.classList.contains('on')) e.classList.replace('on', 'lon'); e.dataset.lens = e.dataset.tab || ''; }
    for (const a of ['data-act', 'data-tab', 'aria-current', 'aria-label', 'id']) e.removeAttribute(a);
    if (e.tagName === 'BUTTON') e.setAttribute('tabindex', '-1');
  });
}
function ensureLens(): void {
  if (lens || !bar) return;
  lens = document.createElement('div'); lens.className = 'tab-lens'; lens.setAttribute('aria-hidden', 'true');
  inner = document.createElement('div'); inner.className = 'tabbar-in tab-lens-in';
  // eigene Ebene über der Leiste (nicht darin): die Leiste hat einen Weichzeichner, der sonst bei jeder Bewegung neu berechnet würde
  lens.appendChild(inner); document.body.appendChild(lens);
}
/* Linse zeichnen: Position, Vergrößerung, leichtes Dehnen in Bewegungsrichtung (Glas wirkt elastisch) */
function paint(): void {
  if (!lens || !inner || !tabs || !bar) return;
  const g = G || (G = measure()); const L = g.L; const tr = g.tr;
  const cx = st.x - g.brLeft;                                   // Mitte der Linse in der Leiste
  const stretch = reduced() ? 0 : Math.max(-0.12, Math.min(0.18, Math.abs(st.v) * 0.0009));
  const sX = st.s * (1 + stretch), sY = st.s * (1 - stretch * 0.6);
  lens.style.transform = `translate3d(${(cx - L.w / 2).toFixed(2)}px,0,0) scale(${sX.toFixed(4)},${sY.toFixed(4)})`;
  // Inhalt darunter vergrößert: Kopie der Tabs, so verschoben, dass sie unter der Linse deckungsgleich liegt, dann um die Linsenmitte skaliert
  const offX = (tr.left - g.brLeft) - (cx - L.w / 2), offY = (tr.top - g.brTop) - L.top;
  // die Kopie erbt die Skalierung der Linse; netto immer SCALE (auch während die Linse federt oder sich dehnt)
  const kx = SCALE / Math.max(0.05, sX), ky = SCALE / Math.max(0.05, sY);
  inner.style.transformOrigin = `${(L.w / 2 - offX).toFixed(2)}px ${(L.h / 2 - offY).toFixed(2)}px`;
  inner.style.transform = `translate3d(${offX.toFixed(2)}px,${offY.toFixed(2)}px,0) scale(${kx.toFixed(4)},${ky.toFixed(4)})`;
}
function peek(b: HTMLElement | null): void {
  for (const x of tabButtons()) x.classList.toggle('peek', x === b);
  if (inner) for (const x of inner.querySelectorAll<HTMLElement>('.ltab')) x.classList.toggle('peek', x.dataset.lens === (b && b.dataset.tab));
}
/* Rechenzeit je Frame (für den Test „flüssig“): Summe, Anzahl, Maximum */
const perf = { n: 0, total: 0, max: 0 };
if (typeof window !== 'undefined') (window as any).__lensPerf = perf;
function frame(t: number): void {
  const t0 = performance.now();
  raf = 0;
  const dt = Math.min(2.5, last ? (t - last) / 16.667 : 1); last = t;
  if (reduced()) { st.x = targetX; st.v = 0; st.s = targetS; st.vs = 0; }
  else {
    // gedämpfte Feder (unterkritisch): folgt dem Finger mit leichtem Nachschwingen
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      const ax = 0.16 * (targetX - st.x) - 0.52 * st.v; st.v += ax * h; st.x += st.v * h;
      const as = 0.14 * (targetS - st.s) - 0.38 * st.vs; st.vs += as * h; st.s += st.vs * h;
    }
  }
  paint();
  const still = Math.abs(targetX - st.x) < 0.3 && Math.abs(st.v) < 0.05 && Math.abs(targetS - st.s) < 0.003 && Math.abs(st.vs) < 0.003;
  const w = performance.now() - t0; perf.n++; perf.total += w; if (w > perf.max) perf.max = w;
  if (releasing && still) { finishRelease(); return; }
  if (active || releasing) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

function activate(x: number): void {
  if (active || !tabs) return;
  ensureLens(); if (!lens || !inner) return;
  active = true; releasing = false;
  G = measure();
  lens.style.width = G.L.w + 'px'; lens.style.height = G.L.h + 'px'; lens.style.top = G.L.top + 'px';
  inner.style.width = G.tr.width + 'px'; inner.style.height = G.tr.height + 'px';
  copyTabs();
  const b = tabAt(x); targetX = x; targetS = 1;
  st.x = b ? centerOf(b) : x; st.v = 0; st.s = reduced() ? 1 : 0.55; st.vs = 0;
  if (reduced() && b) { targetX = centerOf(b); st.x = targetX; }
  else if (b) targetX = x;
  bar!.classList.add('lens-on'); lens.classList.add('on');
  peek(b); paint(); kick();
}
function move(x: number): void {
  const b = tabAt(x);
  const r = (G || measure()).tr;
  targetX = reduced() && b ? centerOf(b) : Math.max(r.left + 20, Math.min(r.right - 20, x));
  peek(b); kick();
}
function release(x: number): void {
  const b = tabAt(x); releaseTab = b;
  active = false; releasing = true;
  if (b) targetX = centerOf(b);
  targetS = 1;
  swallowClick = true; window.setTimeout(() => { swallowClick = false; }, 800);
  // sofort öffnen; die Linse federt noch auf den Tab und blendet aus
  if (b && ACTIONS['go-tab']) { try { ACTIONS['go-tab'](b, new Event('click')); } catch (e) { /* Navigation zeigt eigene Meldung */ } }
  if (reduced()) { finishRelease(); return; }
  kick();
}
function finishRelease(): void {
  releasing = false; releaseTab = null; G = null;
  if (lens) lens.classList.remove('on');
  if (bar) bar.classList.remove('lens-on');
  peek(null);
}
function cancel(): void {
  clearTimeout(timer); timer = 0;
  if (active) { active = false; finishRelease(); }
  pid = null;
}

export function initTabLens(): void {
  bar = document.querySelector('.tabbar'); tabs = document.getElementById('tabs');
  if (!bar || !tabs || (bar as any)._lens) return;
  (bar as any)._lens = true;
  // Linse gleich unsichtbar anlegen und einmal zeichnen: sonst kostet die erste Geste Zeit fürs Anlegen und erste Rastern der Ebene
  ensureLens();
  const warm = () => { if (!lens || !inner || active || releasing || !tabs!.querySelector('.tab')) return; copyTabs(); G = measure(); lens.style.width = G.L.w + 'px'; lens.style.height = G.L.h + 'px'; lens.style.top = G.L.top + 'px'; inner.style.width = G.tr.width + 'px'; inner.style.height = G.tr.height + 'px'; st.x = G.centers.length ? G.centers[0].c : 0; st.s = 1; paint(); G = null;
    // einmal mit 1 % Deckkraft zeichnen lassen (nicht zu sehen), damit das erste Rastern nicht in die erste Geste fällt
    lens.style.transition = 'none'; lens.style.visibility = 'visible'; lens.style.opacity = '0.01';
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!lens) return; lens.style.opacity = ''; lens.style.visibility = ''; lens.style.transition = ''; }));
  };
  requestAnimationFrame(() => warm());
  const capture = (id: number) => { try { tabs!.setPointerCapture(id); } catch (er) { /* ältere Browser */ } };
  tabs.addEventListener('pointerdown', e => {
    if (pid != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!(e.target as HTMLElement).closest('.tab')) return;
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; lx = e.clientX; swallowClick = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => { timer = 0; if (pid != null) { capture(pid); activate(lx); } }, HOLD_MS);
  });
  tabs.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    lx = e.clientX;
    if (!active) {
      // Wischen über die Leiste startet die Linse sofort; senkrecht weg = keine Geste
      if (Math.abs(lx - x0) > SLOP) { clearTimeout(timer); timer = 0; capture(e.pointerId); activate(lx); move(lx); }
      else if (Math.abs(e.clientY - y0) > SLOP * 2) cancel();
      return;
    }
    e.preventDefault(); move(lx);
  });
  tabs.addEventListener('pointerup', e => {
    if (e.pointerId !== pid) return;
    clearTimeout(timer); timer = 0; pid = null;
    if (active) { e.preventDefault(); release(e.clientX); }
  });
  tabs.addEventListener('pointercancel', e => { if (e.pointerId === pid) cancel(); });
  // nach der Linse kommt noch der normale Klick: der würde ein zweites Mal navigieren
  window.addEventListener('click', e => { const el = e.target as HTMLElement; if (swallowClick && el && el.closest && el.closest('.tabbar')) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  // langes Drücken öffnet auf iOS sonst Kontextmenü/Textauswahl
  tabs.addEventListener('contextmenu', e => { if (active || pid != null) e.preventDefault(); });
}
let x0 = 0, y0 = 0, lx = 0;
/* für Tests */
export const _lensState = () => ({ active, releasing, x: st.x, s: st.s, tab: releaseTab && releaseTab.dataset.tab });
