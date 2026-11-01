/* Auftrag 26: Ansicht sanft angleichen statt neu aufbauen.
   Vorher ersetzte jedes Neuzeichnen (z. B. nach dem Sync) die ganze Ansicht per innerHTML: Bilder luden neu, offene Bereiche klappten zu,
   der Bildschirm flackerte. morph() vergleicht den neuen HTML-Text mit dem vorhandenen DOM und ändert nur, was anders ist.
   Gleiche Knoten bleiben erhalten (gleicher Tag und gleiche id), Ereignisse laufen ohnehin über data-act am Dokument. */

let added: Element[] | null = null;
/** Ersetzt den Inhalt von `el` durch `html`, ändert dabei nur abweichende Knoten. Gibt die Zahl der geänderten Knoten zurück.
    `inserted` sammelt neu eingefügte Elemente (für das sanfte Einblenden nach dem Sync). */
export function morph(el: Element, html: string, inserted?: Element[]): number {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  added = inserted || null;
  try { return kids(el, tpl.content); } finally { added = null; }
}

/* Schlüssel eines Knotens: id oder ein fachlicher Schlüssel (Einheit, Datum, Nachricht). So erkennt der Abgleich eine neu eingefügte Zeile,
   statt alle folgenden Zeilen umzuschreiben (wichtig für das sanfte Gleiten nach dem Sync). */
function key(n: Node): string {
  if (n.nodeType !== 1) return '';
  const e = n as HTMLElement, d = e.dataset || {};
  return e.id ? '#' + e.id : d.sid ? 's:' + d.sid : d.msg ? 'm:' + d.msg : d.date ? 'd:' + d.date : d.key ? 'k:' + d.key : '';
}
function same(a: Node, b: Node): boolean {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || (a as Element).id === (b as Element).id);
}

function kids(from: Node, to: Node): number {
  let n = 0;
  let a = from.firstChild;
  let b = to.firstChild;
  // Schlüssel, die im neuen Inhalt noch kommen (für „ist der alte Knoten später noch dran?“)
  const later = new Map<string, number>();
  for (let x = b; x; x = x.nextSibling) { const k = key(x); if (k) later.set(k, (later.get(k) || 0) + 1); }
  const take = (k: string) => { if (!k) return; const c = (later.get(k) || 0) - 1; if (c > 0) later.set(k, c); else later.delete(k); };
  while (b) {
    const nextB = b.nextSibling;
    const kb = key(b);
    take(kb);
    if (a && same(a, b) && key(a) === kb) { n += node(a, b); a = a.nextSibling; }
    else {
      // gleicher Schlüssel weiter hinten: Knoten nach vorn holen und angleichen
      let hit: Node | null = null;
      if (kb) for (let x = a; x; x = x.nextSibling) if (key(x) === kb && same(x, b)) { hit = x; break; }
      if (hit) { if (hit !== a) from.insertBefore(hit, a); else a = a.nextSibling; n += node(hit, b); }
      else if (a && same(a, b) && !(key(a) && later.has(key(a)))) { n += node(a, b); a = a.nextSibling; }
      else { from.insertBefore(b, a); n++; if (added && b.nodeType === 1) added.push(b as Element); }
    }
    b = nextB;
  }
  while (a) { const next = a.nextSibling; from.removeChild(a); n++; a = next; }
  return n;
}

const FORM = /^(INPUT|TEXTAREA|SELECT)$/;

function node(a: Node, b: Node): number {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) { a.nodeValue = b.nodeValue; return 1; }
    return 0;
  }
  const ea = a as HTMLElement, eb = b as HTMLElement;
  let n = 0;
  // Offene „Mehr“-Bereiche ohne gespeicherten Zustand bleiben, wie der Nutzer sie gelassen hat
  const keepOpen = ea.tagName === 'DETAILS' && !ea.hasAttribute('data-fold');
  for (const at of Array.from(ea.attributes)) {
    if (!eb.hasAttribute(at.name) && !(keepOpen && at.name === 'open')) { ea.removeAttribute(at.name); n++; }
  }
  for (const at of Array.from(eb.attributes)) {
    if (keepOpen && at.name === 'open') continue;
    if (ea.getAttribute(at.name) !== at.value) { ea.setAttribute(at.name, at.value); n++; }
  }
  if (FORM.test(ea.tagName)) {
    // Wer gerade tippt, behält seinen Text; sonst gilt der neue Wert
    const focused = typeof document !== 'undefined' && document.activeElement === ea;
    if (ea.tagName === 'TEXTAREA') {
      if (!focused && (ea as HTMLTextAreaElement).value !== (eb as HTMLTextAreaElement).value) { (ea as HTMLTextAreaElement).value = (eb as HTMLTextAreaElement).value; n++; }
      return n;
    }
    if (ea.tagName === 'INPUT') {
      const ia = ea as HTMLInputElement, ib = eb as HTMLInputElement;
      if (!focused && ia.type !== 'file') {
        if (ia.value !== ib.value) { ia.value = ib.value; n++; }
        if (ia.checked !== ib.hasAttribute('checked')) { ia.checked = ib.hasAttribute('checked'); n++; }
      }
      return n;
    }
    n += kids(ea, eb);
    if (!focused) {
      const want = Array.from((eb as HTMLSelectElement).options).findIndex(o => o.hasAttribute('selected'));
      const sa = ea as HTMLSelectElement;
      const idx = want >= 0 ? want : 0;
      if (sa.selectedIndex !== idx && sa.options.length > idx) { sa.selectedIndex = idx; n++; }
    }
    return n;
  }
  return n + kids(ea, eb);
}
