/* Tab-Leiste wie in iOS 26 (Auftrag 23/24/32, neu gebaut in Auftrag 33 nach Apples Fitness-App, Bild für Bild ausgemessen:
   docs/tabbar-ios26.md, Videos in docs/vergleich/).
   Ablauf wie im Video:
   - Ruhe: flache, dunkle Markierung hinter dem aktiven Tab (eine Linse, genau ein Element).
   - Berühren: die Markierung hebt sich sofort als klarer Glastropfen ab (1,2× breit, 1,27× hoch – ragt über die Leiste), der Inhalt darunter
     wird vergrößert (Lichtbrechung), die ganze Leiste gibt etwas nach (+3 %) und dehnt sich in Bewegungsrichtung.
   - Antippen: der Tropfen gleitet gedehnt zum Tab, schwingt nach, legt sich nach ~0,15 s wieder flach (gesamt ~0,3 s). Ein Tipp = Wechsel.
   - Halten und Ziehen: der Tropfen folgt dem Finger, wird beim schnellen Ziehen länger, beim Bremsen gestaucht; Loslassen: rastet am
     nächsten Tab ein, die Leiste federt kräftig zurück.
   - Scrollen: die Leiste bleibt, wie sie ist (wie in der Fitness-App). Vorher schrumpfte sie beim Runterscrollen – das brauchte mehrere
     Tipps, ruckelte und ließ sie bei schnellen Wechseln springen (Auftrag 33, Fehler 1 und 3).
   Ebenen: .tabbar-glass (Weichzeichner, fest) NEBEN .tabbar-body (sichtbare Kapsel, Linse und Tabs; wird verformt, ohne backdrop-filter).
   Läge die Kapsel im Element mit dem Weichzeichner, rechnete WebKit ihn bei jeder Verformung neu (gemessen: jedes 2.–3. Bild fiel aus). Die Linse liegt in der Kapsel und rechnet in deren Koordinaten
   (offsetLeft, unabhängig von Verformung, Safe Area, Drehen) – sie kann sich nicht mehr gegen die Leiste verschieben (vorher eigene Ebene
   in body mit Kopie der Tabs: doppelte Beschriftung beim Überscrollen, Fehler 2). Keine Kopie der Tabs mehr: vergrößert werden die echten.
   Flüssig: nur transform und opacity. Ziehen per requestAnimationFrame; Gleiten und Einrasten werden vorausberechnet und als Web-Animation
   abgespielt (läuft im Compositor weiter, während der neue Tab aufgebaut wird); der Tab wird erst zwei Bilder nach dem Start gebaut.
   „Bewegung reduzieren“: kein Tropfen, keine Verformung, die Markierung wechselt direkt. */
import { ACTIONS } from './kit';

const SLOP = 8;           // so weit darf der Finger beim Antippen wandern
export const LIFT = 1.2;  // Breite des Tropfens im Verhältnis zur Markierung (Video: 119 / 99 pt)
const LIFT_Y = 1.27;      // Höhe (Video: 67 / 53 pt)
const MIN_LIFT = 0.15;    // so lange bleibt der Tropfen beim Antippen mindestens gehoben (Video: hebt bei 0,03 s, legt sich ab 0,17 s)
/* Federn je Sekunde (Masse 1): k = Steifigkeit, z = Dämpfungsgrad (< 1 schwingt über). Aus dem Video: Weg zum Nachbar-Tab ~0,1 s,
   leichtes Überschwingen, flach nach ~0,28 s. */
export interface Spring { k: number; z: number }
export const SP_FOLLOW: Spring = { k: 700, z: 0.82 };  // folgt dem Finger, knapp hinterher
export const SP_GLIDE: Spring = { k: 900, z: 0.74 };   // Gleiten und Einrasten: rund 3 % Überschwingen
export const SP_SCALE: Spring = { k: 1300, z: 0.55 };  // Heben/Absetzen: schnell, mit Nachfedern (Gelee)
const STRETCH_MAX = 0.22, STRETCH_V = 1400;            // Dehnung: höchstens 22 %, halb bei etwa 770 px/s
const BRAKE_MAX = 0.14, BRAKE_A = 30000;               // Stauchen beim Abbremsen (px/s²)
const MAG = 0.14;                                      // Vergrößerung des Inhalts unter dem Tropfen
const BAR_GROW = 0.03, BAR_DX = 0.0025, BAR_DX_MAX = 5, BAR_STRETCH = 0.012;   // Leiste: +3 %, gibt bis 5 px in Bewegungsrichtung nach

/* b: Nachgeben der Leiste (folgt dem Heben des Tropfens leicht verzögert – Video: Leiste am weitesten bei 0,2 s, Tropfen schon bei 0,13 s) */
export interface LensState { x: number; v: number; s: number; vs: number; a?: number; b?: number; bv?: number }
const BAR_TAU = 0.07;   // Video: Leiste wächst in ~4 Bildern um ~10 px
/* Ein Schritt der Feder (halbimplizites Euler-Verfahren, intern in 1/240 s, damit es bei jeder Bildrate gleich aussieht) */
export function stepSpring(o: LensState, toX: number, toS: number, sp: Spring, dt: number): void {
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  const cx = 2 * sp.z * Math.sqrt(sp.k), cs = 2 * SP_SCALE.z * Math.sqrt(SP_SCALE.k);
  const v0 = o.v;
  for (let i = 0; i < n; i++) {
    o.v += (sp.k * (toX - o.x) - cx * o.v) * h; o.x += o.v * h;
    o.vs += (SP_SCALE.k * (toS - o.s) - cs * o.vs) * h; o.s += o.vs * h;
  }
  o.a = dt > 0 ? (o.v - v0) / dt : 0;
  const L = (o.s - 1) / (LIFT - 1);
  const k = 1 - Math.exp(-dt / BAR_TAU);
  o.b = (o.b ?? L) + (L - (o.b ?? L)) * k;
  o.bv = (o.bv ?? o.v) + (o.v - (o.bv ?? o.v)) * k;   // Geschwindigkeit für das Nachgeben der Leiste, ebenso geglättet
}
export const settled = (o: LensState, toX: number, toS: number) => Math.abs(toX - o.x) < 0.25 && Math.abs(o.v) < 6 && Math.abs(toS - o.s) < 0.002 && Math.abs(o.vs) < 0.02;
/* Bahn bis zum Stillstand (60 Werte pro Sekunde, höchstens 1,5 s); letzter Wert genau am Ziel.
   lift: wie beim Antippen – erst heben (Tropfen), nach MIN_LIFT und am Ziel wieder flach (toS). */
export function trajectory(from: LensState, toX: number, toS: number, sp: Spring, lift = false): LensState[] {
  const o = { ...from }, out: LensState[] = [{ ...o, a: 0 }];
  for (let i = 0; i < 90; i++) {
    const t = (i + 1) / 60;
    const s = lift && (t < MIN_LIFT || Math.abs(toX - o.x) > 4) ? LIFT : toS;
    stepSpring(o, toX, s, sp, 1 / 60); out.push({ ...o });
    if (t >= MIN_LIFT && settled(o, toX, toS)) break;
  }
  // Ende: Tropfen genau am Ziel; die Leiste federt noch aus, bis auch sie ruht
  for (let i = 0; i < 30 && (Math.abs(o.b || 0) > 0.01 || Math.abs(o.bv || 0) > 20); i++) { stepSpring(o, toX, toS, sp, 1 / 60); out.push({ ...o }); }
  out[out.length - 1] = { x: toX, v: 0, s: toS, vs: 0, b: 0, bv: 0 };
  return out;
}
/* Dehnung aus der Geschwindigkeit: länger in Bewegungsrichtung, etwas flacher; in Ruhe rund */
export const stretchOf = (v: number) => STRETCH_MAX * Math.tanh(Math.abs(v) / STRETCH_V);
const brakeOf = (o: LensState) => (o.a && o.v && Math.sign(o.a) !== Math.sign(o.v)) ? BRAKE_MAX * Math.tanh(Math.abs(o.a) / BRAKE_A) : 0;
const liftOf = (o: LensState) => (o.s - 1) / (LIFT - 1);   // 0 = flach, 1 = gehoben (kurz auch etwas darunter: Nachfedern)

/* Geometrie in Koordinaten der Kapsel (offsetLeft/offsetTop: unabhängig von Verformung, Safe Area und Lage der Leiste) */
interface Geo { w: number; h: number; top: number; centers: { tab: string; c: number }[]; left: number; right: number; bodyW: number }
export interface Shape { lens: string; fill: number; glass: number; body: string; tabs: string[] }
/* Ein Bild: Linse (Verschiebung, Größe, Dehnung, Stauchen), Deckkraft von Markierung und Glas, Verformung der Leiste, Vergrößerung der Tabs */
export function shapeOf(o: LensState, g: Pick<Geo, 'w' | 'centers'> & { bodyW?: number }, still = false): Shape {
  const L = still ? 0 : liftOf(o);
  const str = still ? 0 : stretchOf(o.v), brk = still ? 0 : brakeOf(o);
  const sx = (still ? 1 : o.s) * (1 + str - brk), sy = (1 + (LIFT_Y - 1) * L) * (1 - 0.4 * str + 0.6 * brk);
  const glass = Math.max(0, Math.min(1, L));
  // nie ganz 0: sonst rastert WebKit den Tropfen erst bei der ersten Berührung (die erste Geste stockte) – 0,001 ist unsichtbar
  const vis = (v: number) => Math.max(0.001, v);
  // Leiste: wächst mit dem Tropfen gleichmäßig um ihre Mitte (Video 5,0 s: +17 / +15 px), rückt etwas zum Finger und gibt in Bewegungsrichtung nach
  const B = o.b ?? L, BV = o.bv ?? o.v;
  const bsx = still ? 1 : 1 + BAR_GROW * B + BAR_STRETCH * Math.tanh(Math.abs(BV) / 1500), bsy = still ? 1 : 1 + BAR_GROW * 0.8 * B;
  const mid = (g.bodyW || 0) / 2, pull = mid ? Math.max(-3, Math.min(3, (o.x - mid) * 0.02 * Math.max(0, B))) : 0;
  const dx = still ? 0 : Math.max(-BAR_DX_MAX, Math.min(BAR_DX_MAX, BV * BAR_DX)) + pull + mid * (1 - bsx);
  const tabs = g.centers.map(c => { const m = 1 + MAG * glass * Math.max(0, 1 - Math.abs(c.c - o.x) / g.w); return `scale(${m.toFixed(4)})`; });
  return {
    lens: `translate3d(${(o.x - g.w / 2).toFixed(2)}px,0,0) scale(${sx.toFixed(4)},${sy.toFixed(4)})`,
    fill: +vis(1 - glass).toFixed(3), glass: +vis(glass).toFixed(3),
    body: `translate3d(${dx.toFixed(2)}px,0,0) scale(${bsx.toFixed(4)},${bsy.toFixed(4)})`, tabs
  };
}

let bar: HTMLElement | null = null, body: HTMLElement | null = null, tabs: HTMLElement | null = null;
let lens: HTMLElement | null = null, fill: HTMLElement | null = null, glassEl: HTMLElement | null = null;
const st: LensState = { x: 0, v: 0, s: 1, vs: 0 };
let lensTab = '';                 // Tab, an dem die Linse steht bzw. auf den sie gerade zuläuft
let pendingTab = '';              // Navigation ist angestoßen, aber noch nicht ausgeführt
let placed = false;
let G: Geo | null = null;
/* nur für Aufnahmen in docs/: Zeitlupe (window.__lensSlow = 4) */
const slow = () => (typeof window !== 'undefined' && (window as any).__lensSlow) || 1;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabButtons = () => tabs ? [...tabs.querySelectorAll<HTMLElement>('.tab')] : [];

/* Beschriftung muss ganz in die Markierung passen (Auftrag 33: „Fortschritt“ ragte heraus) – in jeder Sprache und bei großer Schrift.
   Passt die längste nicht, wird die Schrift aller Tabs gemeinsam so weit verkleinert, dass sie mit Abstand passt (höchstens auf 70 %). */
const LABEL_PAD = 5;
function fitLabels(w: number): void {
  if (!tabs) return;
  tabs.style.removeProperty('--tab-fs');
  const spans = tabButtons().map(b => b.querySelector('span')).filter(Boolean) as HTMLElement[];
  if (!spans.length) return;
  const base = parseFloat(getComputedStyle(spans[0]).fontSize) || 11;
  const widest = Math.max(...spans.map(s => { const r = s.getBoundingClientRect().width; return Math.max(s.scrollWidth, r); }));
  const avail = w - 2 * LABEL_PAD;
  if (widest > avail && widest > 0) tabs.style.setProperty('--tab-fs', Math.max(base * 0.7, Math.floor(base * avail / widest * 10) / 10) + 'px');
}
function measure(): Geo | null {
  if (!tabs || !body) return null;
  const list = tabButtons(); if (!list.length) return null;
  const b0 = list[0];
  if (!b0.offsetWidth || !b0.offsetHeight) return null;
  // Markierung so breit wie ein Tab (Video: Tab-Fläche mit 4 pt Abstand zum Rand der Leiste), so hoch wie der Tab
  return { w: b0.offsetWidth, h: b0.offsetHeight, top: b0.offsetTop, bodyW: body.offsetWidth,
    left: b0.offsetLeft, right: list[list.length - 1].offsetLeft + list[list.length - 1].offsetWidth,
    centers: list.map(b => ({ tab: b.dataset.tab || '', c: b.offsetLeft + b.offsetWidth / 2 })) };
}
const geo = () => G || (G = measure());
function place(g: Geo): void {
  if (!lens) return;
  lens.style.width = g.w + 'px'; lens.style.height = g.h + 'px'; lens.style.top = g.top + 'px';
  fitLabels(g.w);
}
/* Fingerstelle (Bildschirm) → Koordinate in der Kapsel; die Kapsel kann gerade verformt sein, deshalb über die unverformte Lage rechnen */
function localX(clientX: number): number {
  if (!body) return clientX;
  const r = (bar || body).getBoundingClientRect();
  return clientX - r.left - (body.offsetLeft || 0) - (bar ? bar.clientLeft : 0);
}
function nearest(x: number): string {
  const g = geo(); if (!g) return '';
  let best = g.centers[0], d = Infinity;
  for (const c of g.centers) { const dd = Math.abs(c.c - x); if (dd < d) { d = dd; best = c; } }
  return best.tab;
}
const centerOf = (tab: string) => { const g = geo(); const c = g && g.centers.find(x => x.tab === tab); return c ? c.c : 0; };
const activeTab = () => { const b = tabs && tabs.querySelector<HTMLElement>('.tab.on'); return b ? b.dataset.tab || '' : ''; };

function paint(still = false): void {
  const g = geo(); if (!lens || !fill || !glassEl || !body || !g) return;
  const S = shapeOf(st, g, still || reduced());
  lens.style.transform = S.lens; fill.style.opacity = String(S.fill); glassEl.style.opacity = String(S.glass);
  body.style.transform = S.body === 'translate3d(0.00px,0,0) scale(1.0000,1.0000)' ? '' : S.body;
  tabButtons().forEach((b, i) => { const v = S.tabs[i] || 'scale(1.0000)'; b.style.transform = v === 'scale(1.0000)' ? '' : v; });
}
/* Hervorhebung des Tabs unter dem Tropfen */
let peeked = '';
function peek(tab: string, force = false): void {
  if (tab === peeked && !force) return; peeked = tab;
  for (const x of tabButtons()) x.classList.toggle('peek', !!tab && x.dataset.tab === tab);
}

/* ---------- Animation ---------- */
/* Zeit- und Rechenmessung für die Tests „flüssig“: Rechenzeit je Frame (Summe, Anzahl, Maximum) */
const perf = { n: 0, total: 0, max: 0, glides: 0, glideFrames: 0 };
if (typeof window !== 'undefined') (window as any).__lensPerf = perf;

let raf = 0, last = 0;
let followX = 0;                  // Ziel beim Halten/Ziehen (Finger)
let dragging = false;
interface Glide { anims: Animation[]; path: LensState[]; toTab: string }
let glideAnim: Glide | null = null;
let rafGlide: { path: LensState[]; t0: number; toTab: string } | null = null;   // Ersatz ohne Web-Animationen

/* laufendes Gleiten anhalten und den Zustand an der aktuellen Stelle übernehmen (Geschwindigkeit inklusive) */
function stopGlide(): void {
  if (glideAnim) {
    const g = glideAnim; glideAnim = null;
    const t = typeof g.anims[0].currentTime === 'number' ? g.anims[0].currentTime as number : 0;
    Object.assign(st, g.path[Math.min(g.path.length - 1, Math.max(0, Math.round(t / (1000 / 60) / slow())))]);
    paint(); g.anims.forEach(a => a.cancel());
  }
  if (rafGlide) {
    const t = performance.now() - rafGlide.t0;
    Object.assign(st, rafGlide.path[Math.min(rafGlide.path.length - 1, Math.round(t / (1000 / 60) / slow()))]);
    rafGlide = null;
  }
}
function settle(toTab: string): void {
  lensTab = toTab;
  if (lens) lens.classList.remove('moving', 'pressed');
  if (!dragging) { if (bar) bar.classList.remove('lens-on'); peek(''); }
}
/* Gleiten zu einem Tab: wie beim Antippen (Tropfen hebt sich, gleitet, legt sich); bei „Bewegung reduzieren“ sofort */
function glideTo(tab: string, liftUp = true): void {
  const g = geo(); if (!g || !lens) return;
  stopGlide();
  const toX = centerOf(tab);
  lensTab = tab;
  if (reduced() || !placed) { Object.assign(st, { x: toX, v: 0, s: 1, vs: 0, a: 0, b: 0, bv: 0 }); placed = true; paint(true); settle(tab); return; }
  const path = trajectory(st, toX, 1, SP_GLIDE, liftUp);
  if (path.length <= 2) { Object.assign(st, path[path.length - 1]); paint(); settle(tab); return; }
  perf.glides++; perf.glideFrames += path.length;
  lens.classList.add('moving'); if (bar) bar.classList.add('lens-on');
  const dur = (path.length - 1) * 1000 / 60;
  const shapes = path.map(o => shapeOf(o, g));
  // für Tests: Bahn der letzten Animation (die läuft im Compositor; Bilder per requestAnimationFrame fehlen, während der Tab aufgebaut wird)
  const sc = path.map(o => { const L = liftOf(o), str = stretchOf(o.v), brk = brakeOf(o); return { sx: o.s * (1 + str - brk), sy: (1 + (LIFT_Y - 1) * L) * (1 - 0.4 * str + 0.6 * brk) }; });
  (perf as any).last = { toTab: tab, xs: path.map(o => o.x), sx: sc.map(x => x.sx), sy: sc.map(x => x.sy), glass: shapes.map(x => x.glass), centers: Object.fromEntries(g.centers.map(c => [c.tab, c.c])), h: g.h, bodyH: body ? body.offsetHeight : 0 };
  // Hervorhebung wandert mit dem Tropfen (Farbe wechselt am Ziel)
  peek(tab);
  if (typeof lens.animate === 'function') {
    const opts: KeyframeAnimationOptions = { duration: dur * slow(), easing: 'linear', fill: 'forwards' };
    const btns = tabButtons();
    const anims = [
      lens.animate(shapes.map(s => ({ transform: s.lens })), opts),
      fill!.animate(shapes.map(s => ({ opacity: s.fill })), opts),
      glassEl!.animate(shapes.map(s => ({ opacity: s.glass })), opts),
      body!.animate(shapes.map(s => ({ transform: s.body })), opts),
      ...btns.map((b, i) => b.animate(shapes.map(s => ({ transform: s.tabs[i] || 'scale(1)' })), opts))
    ];
    const me: Glide = { anims, path, toTab: tab }; glideAnim = me;
    anims[0].onfinish = () => { if (glideAnim !== me) return; glideAnim = null; Object.assign(st, path[path.length - 1]); paint(); anims.forEach(a => a.cancel()); settle(tab); };
  } else {
    rafGlide = { path, t0: performance.now(), toTab: tab }; kick();
  }
}
function frame(t: number): void {
  const t0 = performance.now();
  raf = 0;
  const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60) / slow(); last = t;
  if (dragging) {
    if (reduced()) { Object.assign(st, { x: followX, v: 0, s: 1, vs: 0, a: 0, b: 0, bv: 0 }); paint(true); }
    else { stepSpring(st, followX, LIFT, SP_FOLLOW, dt); paint(); }
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
let pid: number | null = null, x0 = 0, y0 = 0, moved = false;
/* Nach dem Loslassen kommt noch der normale Klick derselben Geste; der würde ein zweites Mal navigieren. Die nächste Berührung setzt es zurück. */
let swallowClick = false;
const clampX = (x: number) => { const g = geo(); return g ? Math.max(g.left + g.w * 0.35, Math.min(g.right - g.w * 0.35, x)) : x; };

/* Berühren: Tropfen hebt sich sofort und läuft zur Fingerstelle (wie im Video schon nach 0,03 s) */
function press(cx: number): void {
  if (!lens) return;
  const g = (G = measure()); if (!g) return;
  place(g);
  stopGlide();
  dragging = true;
  const x = localX(cx);
  followX = reduced() ? centerOf(nearest(x)) : clampX(x);
  if (bar) bar.classList.add('lens-on');
  lens.classList.add('pressed', 'moving');
  peek(nearest(x)); kick();
}
function drag(cx: number): void {
  const x = localX(cx), tab = nearest(x);
  followX = reduced() ? centerOf(tab) : clampX(x);
  peek(tab); kick();
}
function release(cx: number): void {
  const tab = nearest(localX(cx));
  dragging = false;
  swallowClick = true; window.setTimeout(() => { swallowClick = false; }, 800);
  // rastet am nächsten Tab ein (Restgeschwindigkeit fließt in die Feder ein); Tropfen legt sich am Ziel flach, Leiste federt zurück
  glideTo(tab);
  if (tab) navigate(tab);
}
function cancel(): void {
  pid = null;
  if (dragging) { dragging = false; glideTo(activeTab() || lensTab); }
}

/* Nach jedem Neuzeichnen der Leiste (main.ts → render): Linse zum aktiven Tab bringen (auch wenn der Tab anders gewechselt wurde,
   z. B. per Tastatur oder Knopf im Inhalt); Hervorhebung erneut setzen (das Neuzeichnen setzt die Klassen zurück) */
export function syncTabLens(): void {
  if (!lens || !tabs) return;
  peek(peeked, true);
  if (G) fitLabels(G.w);
  if (dragging || pendingTab) return;
  const on = activeTab(); if (!on) return;
  if (!placed) { G = measure(); const g = geo(); if (!g) return; place(g); lens.classList.add('on'); glideTo(on); return; }
  const target = glideAnim ? glideAnim.toTab : rafGlide ? rafGlide.toTab : lensTab;
  if (target !== on) glideTo(on);
}
/* Größe geändert (Drehen, Schriftgröße, Sprache): neu messen. Unveränderte Maße (ResizeObserver beim Start, Nachmessen nach dem Drehen,
   App-Wechsel) ändern nichts – auch kein laufendes Gleiten (Auftrag 33: das Neu-Ausmessen löste vorher Springen aus). */
function relayout(): void {
  if (!lens || dragging) return;
  const old = G; const g = measure(); if (!g) return;
  const same = !!old && placed && Math.abs(old.w - g.w) < 0.5 && Math.abs(old.h - g.h) < 0.5 && Math.abs(old.top - g.top) < 0.5 && Math.abs(old.left - g.left) < 0.5 && Math.abs(old.bodyW - g.bodyW) < 0.5;
  G = g;
  if (same) return;
  place(g);
  stopGlide();
  const on = pendingTab || activeTab() || lensTab; if (!on) return;
  Object.assign(st, { x: centerOf(on), v: 0, s: 1, vs: 0, a: 0, b: 0, bv: 0 }); lensTab = on; placed = true; paint(true); settle(on);
}

function ensureLens(): void {
  if (lens || !tabs) return;
  // Kapsel um die Tabs (falls index.html sie nicht schon hat): sie trägt Tönung, Kante, Schatten, Linse und Tabs und wird verformt
  body = tabs.parentElement && tabs.parentElement.classList.contains('tabbar-body') ? tabs.parentElement : null;
  if (!body) { body = document.createElement('div'); body.className = 'tabbar-body'; tabs.parentElement!.insertBefore(body, tabs); body.appendChild(tabs); }
  if (bar && !bar.querySelector('.tabbar-glass')) { const gl = document.createElement('div'); gl.className = 'tabbar-glass'; gl.setAttribute('aria-hidden', 'true'); bar.insertBefore(gl, bar.firstChild); }
  lens = document.createElement('div'); lens.className = 'tab-lens'; lens.setAttribute('aria-hidden', 'true');
  fill = document.createElement('i'); fill.className = 'tab-lens-fill';
  glassEl = document.createElement('i'); glassEl.className = 'tab-lens-glass';
  lens.append(fill, glassEl);
  body.insertBefore(lens, tabs);
}

export function initTabLens(): void {
  bar = document.querySelector('.tabbar'); tabs = document.getElementById('tabs');
  if (!bar || !tabs) return;
  if ((bar as any)._lens) { syncTabLens(); return; }
  (bar as any)._lens = true;
  ensureLens(); syncTabLens();
  // Größe geändert (Drehen, Safari-Leiste, Schrift, Rückkehr in die App): neu messen – sofort und noch einmal, wenn iOS fertig ist
  let rt = 0; const late: number[] = [];
  const onResize = () => {
    cancelAnimationFrame(rt); rt = requestAnimationFrame(relayout);
    late.splice(0).forEach(clearTimeout); for (const ms of [120, 350, 800]) late.push(window.setTimeout(relayout, ms));
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('pageshow', onResize);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResize(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(onResize); ro.observe(tabs); ro.observe(bar); }
  if ((document as any).fonts && (document as any).fonts.ready) (document as any).fonts.ready.then(onResize).catch(() => {});
  const capture = (id: number) => { try { tabs!.setPointerCapture(id); } catch (er) { /* ältere Browser */ } };
  tabs.addEventListener('pointerdown', e => {
    if (pid != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (!b) return;
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; moved = false; swallowClick = false;
    capture(e.pointerId);
    press(e.clientX);
  });
  tabs.addEventListener('pointermove', e => {
    if (e.pointerId !== pid || !dragging) return;
    if (!moved && Math.abs(e.clientX - x0) <= SLOP && Math.abs(e.clientY - y0) <= SLOP) return;
    moved = true;
    e.preventDefault(); drag(e.clientX);
  });
  tabs.addEventListener('pointerup', e => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!dragging) return;
    e.preventDefault();
    // kurzer Tipp ohne Wischen: der berührte Tab (nicht die Stelle, an der der Finger gerade ist)
    release(moved ? e.clientX : x0);
  });
  tabs.addEventListener('pointercancel', e => { if (e.pointerId === pid) cancel(); });
  tabs.addEventListener('lostpointercapture', e => { if (e.pointerId === pid) cancel(); });
  // nach der Geste kommt noch der normale Klick: der würde ein zweites Mal navigieren
  window.addEventListener('click', e => { const el = e.target as HTMLElement; if (swallowClick && el && el.closest && el.closest('.tabbar')) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  // langes Drücken öffnet auf iOS sonst Kontextmenü/Textauswahl
  tabs.addEventListener('contextmenu', e => { if (dragging || pid != null) e.preventDefault(); });
}
/* für Tests: Zustand der Linse und der Leiste */
export const _lensState = () => ({ dragging, tab: lensTab, pending: pendingTab, x: st.x, s: st.s, gliding: !!(glideAnim || rafGlide) });
export const _barState = () => ({ mini: false, pressed: dragging, transform: body ? body.style.transform : '' });
if (typeof window !== 'undefined') { (window as any).__lensState = _lensState; (window as any).__barState = _barState; }
