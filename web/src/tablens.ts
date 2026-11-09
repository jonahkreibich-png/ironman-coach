/* Tab-Leiste wie in iOS 26 (Auftrag 23, überarbeitet in Auftrag 24).
   Genau EIN Linsen-Element: Es markiert in Ruhe den aktiven Tab und ist beim Drücken/Ziehen die vergrößerte Glas-Linse.
   (Vorher gab es zusätzlich den Hintergrund von .tab.on – beim Ziehen standen dann zwei Linsen in der Leiste.)
   Bewegung mit Feder-Physik (Masse, Dämpfung, leichtes Überschwingen); beim schnellen Bewegen dehnt sich die Linse in Bewegungsrichtung
   und wird beim Abbremsen wieder rund. Beim Antippen eines anderen Tabs gleitet sie mit derselben Feder dorthin.
   Flüssig: nur transform/opacity. Ziehen läuft über requestAnimationFrame (dem Finger folgen). Gleiten und Einrasten werden einmal
   vorausberechnet und als Web-Animation abgespielt; die läuft im Compositor des Browsers weiter, auch während der neue Tab aufgebaut wird.
   Der neue Tab wird erst gebaut, wenn die Animation gestartet ist (zwei Frames später) – vorher ruckelte genau das.
   „Bewegung reduzieren“: keine Feder, keine Vergrößerung, die Linse wechselt ohne Animation.
   Die Navigation selbst bleibt in main.ts (ACTIONS['go-tab']); hier nur Geste und Darstellung. */
import { ACTIONS } from './kit';

const HOLD_MS = 200;     // ab hier gilt Drücken als Halten
const SLOP = 8;          // so weit darf der Finger beim Antippen wandern
const PRESS = 1.2;       // Größe der Linse beim Drücken (Inhalt darunter wächst mit)
/* Federn je Sekunde (Masse 1): k = Steifigkeit, z = Dämpfungsgrad (< 1 schwingt über) */
export interface Spring { k: number; z: number }
export const SP_FOLLOW: Spring = { k: 520, z: 0.8 };   // folgt dem Finger, knapp hinterher
export const SP_GLIDE: Spring = { k: 300, z: 0.72 };   // Gleiten und Einrasten: rund 4 % Überschwingen
export const SP_SCALE: Spring = { k: 420, z: 0.5 };    // Größe: weich, mit kleinem Nachfedern
const STRETCH_MAX = 0.24, STRETCH_V = 1800;            // Dehnung: höchstens 24 %, halb bei etwa 1000 px/s
const TAP_SWELL = 2.4;                                 // Antippen: Linse schwillt beim Losgleiten kurz an (Gelee)

export interface LensState { x: number; v: number; s: number; vs: number }
/* Ein Schritt der Feder (halbimplizites Euler-Verfahren, intern in 1/240 s, damit es bei jeder Bildrate gleich aussieht) */
export function stepSpring(o: LensState, toX: number, toS: number, sp: Spring, dt: number): void {
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  const cx = 2 * sp.z * Math.sqrt(sp.k), cs = 2 * SP_SCALE.z * Math.sqrt(SP_SCALE.k);
  for (let i = 0; i < n; i++) {
    o.v += (sp.k * (toX - o.x) - cx * o.v) * h; o.x += o.v * h;
    o.vs += (SP_SCALE.k * (toS - o.s) - cs * o.vs) * h; o.s += o.vs * h;
  }
}
export const settled = (o: LensState, toX: number, toS: number) => Math.abs(toX - o.x) < 0.25 && Math.abs(o.v) < 6 && Math.abs(toS - o.s) < 0.002 && Math.abs(o.vs) < 0.02;
/* Bahn bis zum Stillstand (60 Werte pro Sekunde, höchstens 1,5 s); letzter Wert genau am Ziel */
export function trajectory(from: LensState, toX: number, toS: number, sp: Spring): LensState[] {
  const o = { ...from }, out: LensState[] = [{ ...o }];
  for (let i = 0; i < 90; i++) { stepSpring(o, toX, toS, sp, 1 / 60); out.push({ ...o }); if (settled(o, toX, toS)) break; }
  out[out.length - 1] = { x: toX, v: 0, s: toS, vs: 0 };
  return out;
}
/* Dehnung aus der Geschwindigkeit: breiter in Bewegungsrichtung, etwas flacher; in Ruhe rund */
export const stretchOf = (v: number) => STRETCH_MAX * Math.tanh(Math.abs(v) / STRETCH_V);

let bar: HTMLElement | null = null, tabs: HTMLElement | null = null;
let lens: HTMLElement | null = null, clip: HTMLElement | null = null, inner: HTMLElement | null = null;
const st: LensState = { x: 0, v: 0, s: 1, vs: 0 };
let lensTab = '';                 // Tab, an dem die Linse steht bzw. auf den sie gerade zuläuft
let pendingTab = '';              // Navigation ist angestoßen, aber noch nicht ausgeführt
let placed = false;               // Linse hat schon eine Position
let copied = '';                  // zuletzt kopierte Tab-Leiste (für die vergrößerte Ansicht)

/* Geometrie wird nur bei Bedarf gelesen (Start, Größenänderung), nie im Animations-Frame */
interface Geo { w: number; h: number; top: number; bottom: number; trLeft: number; trTop: number; trW: number; trH: number; left: number; right: number; centers: { tab: string; c: number }[] }
let G: Geo | null = null;
/* nur für Aufnahmen in docs/: Zeitlupe (window.__lensSlow = 4) */
const slow = () => (typeof window !== 'undefined' && (window as any).__lensSlow) || 1;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabButtons = () => tabs ? [...tabs.querySelectorAll<HTMLElement>('.tab')] : [];
function measure(): Geo | null {
  if (!tabs) return null;
  // Auftrag 32: Leiste (und Linsen-Ebene) können gerade gedrückt oder geschrumpft sein – gemessen wird immer die Ruhelage
  return untransformed(measureRaw);
}
function measureRaw(): Geo | null {
  if (!tabs) return null;
  const list = tabButtons(); if (!list.length) return null;
  const r = tabs.getBoundingClientRect(), b0 = list[0].getBoundingClientRect();
  if (!r.width || !b0.height) return null;
  /* Auftrag 30: Abstand nach unten wie die Leiste selbst (ihr CSS-„bottom“ inkl. Safe Area + Abstand Tab → Leistenrand), nicht aus
     window.innerHeight: das meldet iOS nach dem Drehen kurz noch den alten Wert – danach stand die Linse versetzt. */
  const barEl = tabs.closest('.tabbar') as HTMLElement | null;
  const br = barEl ? barEl.getBoundingClientRect() : r;
  const cssBottom = barEl ? parseFloat(getComputedStyle(barEl).bottom) || 0 : 0;
  return { w: r.width / list.length, h: b0.height, top: b0.top, bottom: cssBottom + (br.bottom - b0.bottom), trLeft: r.left, trTop: r.top, trW: r.width, trH: r.height, left: r.left, right: r.right,
    centers: list.map(b => { const q = b.getBoundingClientRect(); return { tab: b.dataset.tab || '', c: q.left + q.width / 2 }; }) };
}
const geo = () => G || (G = measure());
function place(g: Geo): void {
  if (!lens || !inner) return;
  // unten verankert wie die Leiste selbst (Safari-Leiste ein-/ausgeblendet: beide wandern gleich)
  lens.style.width = g.w + 'px'; lens.style.height = g.h + 'px'; lens.style.bottom = g.bottom.toFixed(2) + 'px';
  inner.style.width = g.trW + 'px'; inner.style.height = g.trH + 'px';
}
function nearest(x: number): string {
  const g = geo(); if (!g) return '';
  let best = g.centers[0], d = Infinity;
  for (const c of g.centers) { const dd = Math.abs(c.c - x); if (dd < d) { d = dd; best = c; } }
  return best.tab;
}
const centerOf = (tab: string) => { const g = geo(); const c = g && g.centers.find(x => x.tab === tab); return c ? c.c : 0; };
const activeTab = () => { const b = tabs && tabs.querySelector<HTMLElement>('.tab.on'); return b ? b.dataset.tab || '' : ''; };

/* Linse und Inhalt aus einem Zustand: Linse = Verschiebung + Größe + Dehnung; Inhalt (Kopie der Tabs) so, dass er unter der Linse
   deckungsgleich liegt und um die Linsenmitte genau um die Linsengröße vergrößert ist (ohne Dehnung) */
export function transforms(o: LensState, g: { w: number; h: number; top: number; trLeft: number; trTop: number }, noStretch = false): [string, string] {
  const str = noStretch ? 0 : stretchOf(o.v);
  const sX = o.s * (1 + str), sY = o.s * (1 - str * 0.45);
  const kx = o.s / sX, ky = o.s / sY, cy = g.top + g.h / 2;
  const ix = g.w / 2 + kx * (g.trLeft - o.x), iy = g.h / 2 + ky * (g.trTop - cy);
  return [`translate3d(${(o.x - g.w / 2).toFixed(2)}px,0,0) scale(${sX.toFixed(4)},${sY.toFixed(4)})`,
    `translate3d(${ix.toFixed(2)}px,${iy.toFixed(2)}px,0) scale(${kx.toFixed(4)},${ky.toFixed(4)})`];
}
function paint(): void {
  const g = geo(); if (!lens || !inner || !g) return;
  const [a, b] = transforms(st, g, reduced());
  lens.style.transform = a; inner.style.transform = b;
}
/* Hervorhebung des Tabs unter der Linse (in der Leiste und in der vergrößerten Kopie) */
let peeked = '';
function peek(tab: string): void {
  if (tab === peeked) return; peeked = tab;
  for (const x of tabButtons()) x.classList.toggle('peek', !!tab && x.dataset.tab === tab);
  if (inner) for (const x of inner.querySelectorAll<HTMLElement>('.ltab')) x.classList.toggle('peek', x.dataset.lens === tab);
}

/* Vergrößerte Kopie der Tabs: nur zum Ansehen. Eigene Klassen und keine data-tab/aria-Merkmale, damit weder Screenreader noch Tests
   (oder Klicks) einen Tab doppelt finden. */
function copyTabs(): void {
  if (!inner || !tabs) return;
  const html = tabs.innerHTML; if (html === copied) return; copied = html;
  inner.innerHTML = html;
  inner.querySelectorAll<HTMLElement>('*').forEach(e => {
    if (e.classList.contains('tab')) { e.classList.replace('tab', 'ltab'); e.classList.remove('on', 'peek'); e.dataset.lens = e.dataset.tab || ''; }
    for (const a of ['data-act', 'data-tab', 'aria-current', 'aria-label', 'id']) e.removeAttribute(a);
    if (e.tagName === 'BUTTON') e.setAttribute('tabindex', '-1');
  });
  const p = peeked; peeked = ''; peek(p);
}
function ensureLens(): void {
  if (lens) return;
  // eigene Ebene über der Leiste (nicht darin): die Leiste hat einen Weichzeichner, der sonst bei jeder Bewegung neu berechnet würde
  lens = document.createElement('div'); lens.className = 'tab-lens'; lens.setAttribute('aria-hidden', 'true');
  const shadow = document.createElement('div'); shadow.className = 'tab-lens-shadow';
  clip = document.createElement('div'); clip.className = 'tab-lens-clip';
  inner = document.createElement('div'); inner.className = 'tabbar-in tab-lens-in';
  const shine = document.createElement('div'); shine.className = 'tab-lens-shine';
  // Auftrag 32: Linse in einer eigenen Ebene, die beim Drücken und Schrumpfen genauso verformt wird wie die Leiste (bleibt deckungsgleich)
  wrap = document.createElement('div'); wrap.className = 'tab-lens-wrap'; wrap.setAttribute('aria-hidden', 'true');
  clip.append(inner, shine); lens.append(shadow, clip); wrap.appendChild(lens); document.body.appendChild(wrap);
}

/* ---------- Auftrag 32: die ganze Leiste reagiert (wie iOS 26) ----------
   Drücken: die Leiste wird leicht größer und dehnt sich zur Druckstelle (Gummiband, folgt dem Finger ein Stück), Loslassen: federt
   elastisch mit kleinem Überschwingen zurück (vorausberechnete Feder als Web-Animation, läuft im Compositor).
   Runterscrollen: Leiste schrumpft etwas (CSS „scale“/„translate“ mit Feder-Kurve), Hochscrollen, Antippen oder Tab-Wechsel: wieder groß.
   Nur transform/scale (60 fps), Leiste und Linsen-Ebene immer gleich verformt. „Bewegung reduzieren“: nichts davon. */
let wrap: HTMLElement | null = null;
let mini = false;
let squishX: number | null = null, squishX0 = 0, squishAnim: Animation[] = [];
const SQ_S = 1.035, SQ_MAX = 7, SQ_K = 0.035;
const SP_BOUNCE: Spring = { k: 360, z: 0.42 };
const both = () => [bar, wrap].filter(Boolean) as HTMLElement[];
function untransformed<T>(fn: () => T): T {
  const els = both(); if (!els.length) return fn();
  squishAnim.forEach(a => a.cancel()); squishAnim = [];
  const prev = els.map(e => [e.style.transition, e.style.transform, e.style.scale, e.style.translate]);
  els.forEach(e => { e.style.transition = 'none'; e.style.transform = 'none'; e.style.scale = 'none'; e.style.translate = 'none'; });
  const out = fn();
  els.forEach((e, i) => { e.style.transform = prev[i][1]; e.style.scale = prev[i][2]; e.style.translate = prev[i][3]; });
  void (bar && bar.offsetWidth);                      // Ruhelage zurück, ohne Übergang
  els.forEach((e, i) => { e.style.transition = prev[i][0]; });
  return out;
}
/* Drehpunkt: beim Drücken die Druckstelle (Mitte der Leistenhöhe), sonst unten mittig */
function origin(x: number | null): void {
  if (!bar || !wrap) return;
  const r = untransformed(() => bar!.getBoundingClientRect());
  const ox = x == null ? r.left + r.width / 2 : Math.max(r.left, Math.min(r.right, x)), oy = x == null ? r.bottom : r.top + r.height / 2;
  bar.style.transformOrigin = `${(ox - r.left).toFixed(1)}px ${(oy - r.top).toFixed(1)}px`;
  wrap.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
}
const sqT = (dx: number, s: number) => `translate3d(${dx.toFixed(2)}px,0,0) scale(${s.toFixed(4)},${(1 + (s - 1) * 0.6).toFixed(4)})`;
const sqDx = (x: number) => Math.max(-SQ_MAX, Math.min(SQ_MAX, (x - squishX0) * SQ_K));
function squishIn(x: number): void {
  if (reduced() || !bar || !wrap || mini) return;
  squishAnim.forEach(a => a.cancel()); squishAnim = [];
  origin(x); squishX0 = x; squishX = x;
  for (const e of both()) { e.style.transition = 'transform .16s cubic-bezier(.2,.9,.3,1.25)'; e.style.transform = sqT(0, SQ_S); }
}
/* beim Ziehen bleibt die Leiste zur Druckstelle gedehnt stehen (sie dem Finger nachzuführen hieße, den Weichzeichner der Leiste in jedem
   Bild neu zu rechnen – das kostete in WebKit spürbar Bilder); erst wenn der Finger weit wandert, rückt das Gummiband einmal nach */
function squishMove(x: number): void {
  if (squishX == null || !bar) return;
  // Gummiband: rückt nur in groben Stufen nach (halbe Maximal-Auslenkung), nicht in jedem Bild
  const cur = sqDx(squishX), next = sqDx(x);
  if (Math.abs(next - cur) < SQ_MAX / 2) return;
  squishX = x;
  const t = sqT(next, SQ_S);
  for (const e of both()) { e.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.2)'; e.style.transform = t; }
}
function squishOut(): void {
  if (squishX == null) return;
  const dx = sqDx(squishX); squishX = null;
  const els = both();
  const path = trajectory({ x: dx, v: 0, s: SQ_S, vs: 0 }, 0, 1, SP_BOUNCE);
  els.forEach(e => { e.style.transition = 'none'; e.style.transform = ''; });
  if (typeof (bar as any).animate !== 'function' || path.length < 3) return;
  const kf = path.map(o => ({ transform: sqT(o.x, o.s) }));
  const dur = (path.length - 1) * 1000 / 60 * slow();
  squishAnim = els.map(e => e.animate(kf, { duration: dur, easing: 'linear' }));
  squishAnim[0].onfinish = () => { squishAnim = []; };
}
function setMini(on: boolean): void {
  if (on === mini || !bar || !wrap) return;
  if (on && (reduced() || dragging || squishX != null || pid != null)) return;
  mini = on;
  origin(null);
  for (const e of both()) { e.style.transition = ''; e.classList.toggle('mini', on); }
}
let lastY = 0, acc = 0, userAt = -1e9;
/* nur Scrollen durch Finger oder Mausrad zählt (inkl. Nachlaufen); automatisches Scrollen der App (z. B. Coach nach unten) nicht */
function onScroll(): void {
  const y = window.scrollY || 0, d = y - lastY; lastY = y;
  if (!d || performance.now() - userAt > 1500) return;
  if ((d > 0) !== (acc > 0)) acc = 0;
  acc += d;
  if (y < 40) setMini(false);
  else if (acc > 24) setMini(true);
  else if (acc < -16) setMini(false);
}
export const _barState = () => ({ mini, pressed: squishX != null, transform: bar ? bar.style.transform : '' });
if (typeof window !== 'undefined') (window as any).__barState = _barState;

/* ---------- Animation ---------- */
/* Zeit- und Rechenmessung für die Tests „flüssig“: Rechenzeit je Frame (Summe, Anzahl, Maximum) */
const perf = { n: 0, total: 0, max: 0, glides: 0, glideFrames: 0 };
if (typeof window !== 'undefined') (window as any).__lensPerf = perf;

let raf = 0, last = 0;
let followX = 0;                  // Ziel beim Ziehen (Finger)
let dragging = false;
interface Glide { a: Animation; b: Animation; path: LensState[]; toTab: string }
let glideAnim: Glide | null = null;
let rafGlide: { path: LensState[]; t0: number; toTab: string } | null = null;   // Ersatz ohne Web-Animationen

/* laufendes Gleiten anhalten und den Zustand an der aktuellen Stelle übernehmen (Geschwindigkeit inklusive) */
function stopGlide(): void {
  if (glideAnim) {
    const g = glideAnim; glideAnim = null;
    const t = typeof g.a.currentTime === 'number' ? g.a.currentTime : 0;
    Object.assign(st, g.path[Math.min(g.path.length - 1, Math.max(0, Math.round(t / (1000 / 60))))]);
    g.a.cancel(); g.b.cancel(); paint();
  }
  if (rafGlide) {
    const t = performance.now() - rafGlide.t0;
    Object.assign(st, rafGlide.path[Math.min(rafGlide.path.length - 1, Math.round(t / (1000 / 60)))]);
    rafGlide = null;
  }
}
function settle(toTab: string): void {
  lensTab = toTab;
  if (lens) lens.classList.remove('moving');
  if (!dragging) { if (bar) bar.classList.remove('lens-on'); peek(toTab); }
}
/* Gleiten zu einem Tab (Feder), optional mit Anschwellen; bei „Bewegung reduzieren“ sofort */
function glideTo(tab: string, swell = 0): void {
  const g = geo(); if (!g || !lens || !inner) return;
  stopGlide();
  const toX = centerOf(tab);
  lensTab = tab; peek(tab);
  if (reduced() || !placed) { Object.assign(st, { x: toX, v: 0, s: 1, vs: 0 }); placed = true; paint(); settle(tab); return; }
  if (swell) st.vs += swell;
  const path = trajectory(st, toX, 1, SP_GLIDE);
  if (path.length <= 2) { Object.assign(st, path[path.length - 1]); paint(); settle(tab); return; }
  perf.glides++; perf.glideFrames += path.length;
  lens.classList.add('moving');
  const dur = (path.length - 1) * 1000 / 60;
  if (typeof lens.animate === 'function') {
    const ka: Keyframe[] = [], kb: Keyframe[] = [];
    for (const o of path) { const [a, b] = transforms(o, g); ka.push({ transform: a }); kb.push({ transform: b }); }
    const opts: KeyframeAnimationOptions = { duration: dur, easing: 'linear', fill: 'forwards' };
    const a = lens.animate(ka, opts), b = inner.animate(kb, opts);
    if (slow() !== 1) { a.playbackRate = b.playbackRate = 1 / slow(); }
    const me: Glide = { a, b, path, toTab: tab }; glideAnim = me;
    a.onfinish = () => { if (glideAnim !== me) return; glideAnim = null; Object.assign(st, path[path.length - 1]); paint(); a.cancel(); b.cancel(); settle(tab); };
  } else {
    rafGlide = { path, t0: performance.now(), toTab: tab }; kick();
  }
}
function frame(t: number): void {
  const t0 = performance.now();
  raf = 0;
  const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60) / slow(); last = t;
  if (dragging) {
    if (reduced()) { Object.assign(st, { x: followX, v: 0, s: 1, vs: 0 }); }
    else stepSpring(st, followX, PRESS, SP_FOLLOW, dt);
    paint();
  } else if (rafGlide) {
    const i = Math.round((performance.now() - rafGlide.t0) / (1000 / 60) / slow());
    Object.assign(st, rafGlide.path[Math.min(rafGlide.path.length - 1, i)]); paint();
    if (i >= rafGlide.path.length - 1) { const tab = rafGlide.toTab; rafGlide = null; settle(tab); }
  }
  const w = performance.now() - t0; perf.n++; perf.total += w; if (w > perf.max) perf.max = w;
  if (dragging || rafGlide) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

/* Navigation erst, wenn die Animation läuft (zwei Frames später): Aufbau des neuen Tabs bremst das Gleiten dann nicht mehr */
function navigate(tab: string): void {
  pendingTab = tab;
  const go = () => {
    pendingTab = '';
    const b = tabs && tabs.querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`);
    if (b && ACTIONS['go-tab']) { try { ACTIONS['go-tab'](b, new Event('click')); } catch (e) { /* Navigation zeigt eigene Meldung */ } }
    // Navigation abgelehnt (z. B. ungespeicherte Änderungen): Linse zurück zum aktiven Tab
    syncTabLens();
  };
  if (reduced()) { go(); return; }
  requestAnimationFrame(() => requestAnimationFrame(go));
}

/* ---------- Geste ---------- */
let pid: number | null = null, timer = 0, x0 = 0, y0 = 0, lx = 0, downTab = '', downType = '';
/* Nach dem Loslassen kommt noch der normale Klick derselben Geste; der würde ein zweites Mal navigieren. Die nächste Berührung setzt es zurück. */
let swallowClick = false;

function press(x: number): void {
  if (dragging || !lens) return;
  const g = (G = measure()); if (!g) return;
  place(g); copyTabs();
  stopGlide();
  dragging = true;
  followX = reduced() ? centerOf(nearest(x)) : clampX(x);
  bar!.classList.add('lens-on'); lens.classList.add('pressed', 'moving');
  // Auftrag 32: Halten/Ziehen – die ganze Leiste wird größer und dehnt sich zur Druckstelle (kurzes Antippen: nur die Linse gleitet,
  // damit Leiste mit Weichzeichner und Linse nicht gleichzeitig animieren)
  squishIn(x);
  peek(nearest(x)); kick();
}
const clampX = (x: number) => { const g = geo(); return g ? Math.max(g.left + g.w * 0.35, Math.min(g.right - g.w * 0.35, x)) : x; };
function drag(x: number): void {
  const tab = nearest(x);
  followX = reduced() ? centerOf(tab) : clampX(x);
  peek(tab); kick(); squishMove(x);
}
function release(x: number): void {
  const tab = nearest(x);
  dragging = false;
  if (lens) lens.classList.remove('pressed');
  swallowClick = true; window.setTimeout(() => { swallowClick = false; }, 800);
  // rastet am nächsten Tab ein (Restgeschwindigkeit der Geste fließt in die Feder ein: weiches Nachfedern)
  glideTo(tab);
  if (bar) bar.classList.remove('lens-on');
  if (tab) navigate(tab);
}
function tap(tab: string): void {
  if (tab !== lensTab) glideTo(tab, TAP_SWELL);
  // Maus (PC): der normale Klick öffnet den Tab sofort, die Linse gleitet im Compositor weiter. Finger/Stift (iPhone): Tab erst bauen,
  // wenn die Animation läuft (zwei Frames), sonst ruckelt das Gleiten
  if (downType === 'mouse') { window.setTimeout(syncTabLens, 50); return; }   // Klick abgelehnt (z. B. ungespeicherte Änderungen): Linse zurück
  swallowClick = true; window.setTimeout(() => { swallowClick = false; }, 800);
  navigate(tab);
}
function cancel(): void {
  clearTimeout(timer); timer = 0; pid = null; squishOut();
  if (dragging) { dragging = false; if (lens) lens.classList.remove('pressed'); if (bar) bar.classList.remove('lens-on'); glideTo(activeTab() || lensTab); }
}

/* Nach jedem Neuzeichnen der Leiste (main.ts → render): Kopie auffrischen und die Linse zum aktiven Tab bringen
   (auch wenn der Tab anders gewechselt wurde, z. B. per Tastatur oder Knopf im Inhalt) */
export function syncTabLens(): void {
  if (!lens || !tabs) return;
  copyTabs();
  if (dragging || pendingTab) return;
  const on = activeTab(); if (!on) return;
  if (!placed) { G = measure(); const g = geo(); if (!g) return; place(g); lens.classList.add('on'); glideTo(on); return; }
  const target = glideAnim ? glideAnim.toTab : rafGlide ? rafGlide.toTab : lensTab;
  if (target !== on) { const g = geo(); if (g) place(g); glideTo(on); setMini(false); }
}
/* Größe geändert (Drehen, Schriftgröße, Safari-Leiste): neu messen und ohne Animation an den aktiven Tab setzen */
function relayout(): void {
  if (!lens || dragging) return;
  const old = G; G = measure(); const g = geo(); if (!g) return;
  place(g);
  // Auftrag 30: unveränderte Maße (Nachmessen nach dem Drehen, ResizeObserver beim Start) unterbrechen kein laufendes Gleiten
  const same = !!old && placed && Math.abs(old.trLeft - g.trLeft) < 0.5 && Math.abs(old.trW - g.trW) < 0.5 && Math.abs(old.top - g.top) < 0.5 && Math.abs(old.h - g.h) < 0.5 && Math.abs(old.bottom - g.bottom) < 0.5;
  if (same) { if (!glideAnim && !rafGlide) { const on = pendingTab || activeTab() || lensTab; if (on && Math.abs(st.x - centerOf(on)) > 0.5) { Object.assign(st, { x: centerOf(on), v: 0, s: 1, vs: 0 }); lensTab = on; paint(); settle(on); } } return; }
  stopGlide();
  const on = pendingTab || activeTab() || lensTab; if (!on) return;
  Object.assign(st, { x: centerOf(on), v: 0, s: 1, vs: 0 }); lensTab = on; placed = true; paint(); settle(on);
}

export function initTabLens(): void {
  bar = document.querySelector('.tabbar'); tabs = document.getElementById('tabs');
  if (!bar || !tabs) return;
  if ((bar as any)._lens) { syncTabLens(); return; }
  (bar as any)._lens = true;
  ensureLens(); syncTabLens();
  // Auftrag 30: bei jeder Größenänderung, Drehung, Safari-Leiste und Rückkehr in die App neu messen – sofort und noch einmal, wenn iOS
  // das Layout nach dem Drehen fertig hat (Safe Area und Breite kommen dort erst etwas später an)
  let rt = 0; const late: number[] = [];
  const onResize = () => {
    cancelAnimationFrame(rt); rt = requestAnimationFrame(relayout);
    late.splice(0).forEach(clearTimeout); for (const ms of [120, 350, 800]) late.push(window.setTimeout(relayout, ms));
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('pageshow', onResize);
  // Auftrag 32: Runterscrollen schrumpft die Leiste, Hochscrollen macht sie wieder groß
  lastY = window.scrollY || 0; window.addEventListener('scroll', onScroll, { passive: true });
  const mark = () => { userAt = performance.now(); };
  window.addEventListener('touchmove', mark, { passive: true }); window.addEventListener('wheel', mark, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResize(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(onResize); ro.observe(tabs); ro.observe(bar); }
  const capture = (id: number) => { try { tabs!.setPointerCapture(id); } catch (er) { /* ältere Browser */ } };
  tabs.addEventListener('pointerdown', e => {
    if (pid != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (!b) return;
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; lx = e.clientX; downTab = b.dataset.tab || ''; downType = e.pointerType; swallowClick = false;
    // Auftrag 32: geschrumpfte Leiste wird beim Antippen wieder groß (die ganze Leiste reagiert beim Drücken/Halten, siehe press)
    if (mini) setMini(false);
    clearTimeout(timer);
    timer = window.setTimeout(() => { timer = 0; if (pid != null) { capture(pid); press(lx); } }, HOLD_MS);
  });
  tabs.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    lx = e.clientX;
    if (!dragging) {
      // Wischen über die Leiste startet die Linse sofort; senkrecht weg = keine Geste
      if (Math.abs(lx - x0) > SLOP) { clearTimeout(timer); timer = 0; capture(e.pointerId); press(lx); drag(lx); }
      else if (Math.abs(e.clientY - y0) > SLOP * 2) cancel();
      return;
    }
    e.preventDefault(); drag(lx);
  });
  tabs.addEventListener('pointerup', e => {
    if (e.pointerId !== pid) return;
    clearTimeout(timer); timer = 0; pid = null; squishOut();
    if (dragging) { e.preventDefault(); release(e.clientX); }
    else if (downTab) tap(downTab);
  });
  tabs.addEventListener('pointercancel', e => { if (e.pointerId === pid) cancel(); });
  // nach Linse bzw. Antippen kommt noch der normale Klick: der würde ein zweites Mal navigieren
  window.addEventListener('click', e => { const el = e.target as HTMLElement; if (swallowClick && el && el.closest && el.closest('.tabbar')) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  // langes Drücken öffnet auf iOS sonst Kontextmenü/Textauswahl
  tabs.addEventListener('contextmenu', e => { if (dragging || pid != null) e.preventDefault(); });
}
/* für Tests: Zustand und Anzahl sichtbarer Linsen (Linsen-Element + Tabs mit eigener Markierungsfläche) */
export const _lensState = () => ({ dragging, tab: lensTab, pending: pendingTab, x: st.x, s: st.s, gliding: !!(glideAnim || rafGlide) });
if (typeof window !== 'undefined') (window as any).__lensState = _lensState;
