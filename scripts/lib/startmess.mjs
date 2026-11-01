/* Auftrag 26: Messung des App-Starts im Browser (WebKit und Chromium).
   Läuft als Init-Skript vor jedem Seiten-Code und schreibt alles nach window.__startMess:
   - Hintergrund in jedem Bild (weißer Blitz?), erstes Bild mit Inhalt
   - Neuaufbauten der ganzen Ansicht (#app bekommt neue Kinder) und Teil-Änderungen
   - Layout-Verschiebungen (eigene Berechnung wie CLS, weil WebKit kein LayoutShift kennt)
   - lange Bilder (Hauptthread blockiert), Server-Aufrufe, Schriften, Seiten-Neuladungen */
export function instrument() {
  const now = () => Math.round(performance.now());
  const M = (window.__startMess = { frames: 0, bg: [], firstView: null, firstPaintBg: null, rebuilds: [], partial: 0, shifts: [], cls: 0,
    longFrames: [], api: [], fonts: [], navs: 0, lastMut: 0, startupVisibleAt: [], swReload: false, theme: null, stacks: [] });
  try { M.navs = +(sessionStorage.getItem('__startNavs') || 0) + 1; sessionStorage.setItem('__startNavs', String(M.navs)); } catch (e) {}
  // Server-Aufrufe zählen (Sync, Konto, KI …)
  const of = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url || '';
    const m = /\/api\/[\w/.-]+/.exec(url); const t0 = now();
    const p = of.apply(this, arguments);
    if (m) p.then(() => M.api.push({ path: m[0], at: t0, ms: now() - t0 }), () => M.api.push({ path: m[0], at: t0, ms: now() - t0, failed: true }));
    return p;
  };
  try { document.fonts.addEventListener('loadingdone', e => { for (const f of e.fontfaces || []) M.fonts.push({ family: f.family, weight: f.weight, at: now() }); }); } catch (e) {}
  try { navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => { M.swReload = true; }); } catch (e) {}
  const canvasColor = () => {
    const h = document.documentElement, b = document.body;
    const hb = getComputedStyle(h).backgroundColor, bb = b ? getComputedStyle(b).backgroundColor : 'rgba(0, 0, 0, 0)';
    const clear = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    if (!clear(hb)) return hb; if (!clear(bb)) return bb;
    // Ohne gesetzten Hintergrund malt der Browser die Leinwand: weiß, außer color-scheme ist dunkel
    return /dark/.test(getComputedStyle(h).colorScheme || '') ? 'canvas-dark' : 'canvas-white';
  };
  const lum = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); if (!m) return c === 'canvas-white' ? 255 : c === 'canvas-dark' ? 18 : -1; return Math.round(0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]); };
  let prevRects = new Map(), lastT = 0;
  const keyOf = (el, i) => i + ':' + el.tagName + '.' + (el.className && el.className.baseVal == null ? el.className : '') + ':' + (el.textContent || '').trim().slice(0, 24);
  const frame = t => {
    M.frames++;
    if (lastT && t - lastT > 50) M.longFrames.push({ at: Math.round(lastT), ms: Math.round(t - lastT) });
    lastT = t;
    if (document.documentElement) {
      const c = canvasColor(); const L = lum(c);
      if (!M.bg.length || M.bg[M.bg.length - 1].c !== c) M.bg.push({ at: now(), c, lum: L });
      if (M.firstPaintBg == null && document.body) M.firstPaintBg = { at: now(), c, lum: L };
      M.theme = document.documentElement.getAttribute('data-theme');
    }
    const st = document.getElementById('app-startup');
    if (st && !st.hidden && st.offsetHeight) { if (!M.startupVisibleAt.length) M.startupVisibleAt.push(now()); }
    // Layout-Verschiebung: sichtbare Bausteine der Ansicht (zwei Ebenen) mit dem vorigen Bild vergleichen
    const view = document.querySelector('#app > .view');
    if (view) {
      const vh = innerHeight, vw = innerWidth, cur = new Map();
      const els = []; [...view.children].forEach((c, i) => { els.push([c, 'a' + i]); [...c.children].slice(0, 12).forEach((g, j) => els.push([g, 'a' + i + 'b' + j])); });
      let impact = 0, dist = 0, who = '';
      for (const [el, path] of els) {
        const r = el.getBoundingClientRect(); const k = keyOf(el, path); cur.set(k, r);
        const p = prevRects.get(k); if (!p) continue;
        const dy = Math.abs(r.top - p.top), dx = Math.abs(r.left - p.left);
        if (dy < 1 && dx < 1) continue;
        const vis = (q) => Math.max(0, Math.min(vh, q.bottom) - Math.max(0, q.top)) * Math.max(0, Math.min(vw, q.right) - Math.max(0, q.left));
        impact += Math.min(vis(r) + vis(p), vw * vh); if (Math.max(dy / vh, dx / vw) > dist) { dist = Math.max(dy / vh, dx / vw); who = k.slice(0, 60) + ' dy=' + Math.round(r.top - p.top); }
      }
      // Seite wurde gescrollt: keine Verschiebung des Inhalts
      if (impact && Math.abs((M._sy || 0) - scrollY) < 1) { const s = Math.min(1, impact / (vw * vh)) * Math.min(1, dist); if (s > 0.0005) { M.cls += s; M.shifts.push({ at: now(), score: +s.toFixed(4), who }); } }
      M._sy = scrollY; prevRects = cur;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Wer baut #app neu? (Aufrufkette, nur zur Ursachensuche)
  try {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get() { return d.get.call(this); },
      set(v) { if (this.id === 'app') M.stacks.push(now() + ' ' + String(new Error().stack).split(/\n/).slice(1, 8).join(' | ')); return d.set.call(this, v); } });
  } catch (e) {}
  const watch = () => {
    const app = document.getElementById('app');
    if (!app) return setTimeout(watch, 0);
    new MutationObserver(list => {
      M.lastMut = now();
      for (const m of list) {
        if (m.target === app && m.type === 'childList' && [...m.addedNodes].some(n => n.nodeType === 1 && n.classList.contains('view'))) {
          M.rebuilds.push(now()); if (M.firstView == null) M.firstView = now();
        } else M.partial++;
      }
    }).observe(app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
}

/* Wartet, bis die App ruhig ist: mindestens minMs vergangen und quietMs lang keine Änderung in #app */
export async function waitQuiet(page, { minMs = 6000, quietMs = 2500, maxMs = 25000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => { const M = window.__startMess; return M ? { now: Math.round(performance.now()), last: M.lastMut, first: M.firstView } : null; }).catch(() => null);
    const el = Date.now() - t0;
    if (s && s.first != null && el > minMs && s.now - s.last > quietMs) return;
    if (el > maxMs) return;
  }
}

/* Ergebnis eines Starts einsammeln */
export async function collect(page) {
  return page.evaluate(() => {
    const M = window.__startMess;
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]));
    const nav = performance.getEntriesByType('navigation')[0];
    const used = new Set(); document.querySelectorAll('body *').forEach(el => { if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) used.add(getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/"/g, '')); });
    const api = {}; M.api.forEach(a => { api[a.path] = (api[a.path] || 0) + 1; });
    return {
      navs: M.navs, swReload: M.swReload, theme: M.theme,
      firstPaint: paints['first-paint'] ?? null, fcp: paints['first-contentful-paint'] ?? null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      firstView: M.firstView, firstPaintBg: M.firstPaintBg, bg: M.bg, whiteFlash: M.bg.some(b => b.lum > 200) && !document.documentElement.matches('[data-theme="light"]') && matchMedia('(prefers-color-scheme: dark)').matches,
      rebuilds: M.rebuilds.length, rebuildTimes: M.rebuilds, partial: M.partial,
      cls: +M.cls.toFixed(4), shifts: M.shifts.slice(0, 20),
      longFrames: M.longFrames.filter(f => f.at > 0).slice(0, 30), longestFrame: Math.max(0, ...M.longFrames.map(f => f.ms)),
      api, apiCalls: M.api.sort((a, b) => a.at - b.at), fontsLoaded: M.fonts, fontsUsed: [...used],
      startupNotice: M.startupVisibleAt.length > 0, marks: Object.fromEntries(performance.getEntriesByType('mark').filter(m => m.name.startsWith('stamio:')).map(m => [m.name.slice(7), Math.round(m.startTime)])), stacks: M.stacks
    };
  });
}
