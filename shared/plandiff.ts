/* Was ändert sich im Plan? (Auftrag 6, Punkt 1) Vor dem Übernehmen einer Einstellung zeigt die App kurz die Folgen,
   z. B. „Lauf von Mi auf Sa“, „Rad Do: 60 → 45 min“, „Schwimmen Fr entfällt“, „Neu: Kraft Di“.
   Verglichen werden die effektiven Plan-Tage (Plan plus Anpassungen) vorher und nachher in einem Zeitfenster. */

export interface PlanChange { kind: 'moved' | 'changed' | 'removed' | 'added'; sport: string; from?: string; to?: string; text: string }
/* day(date, anker): Wochentag; anker ist das Datum, unter dem die Änderung einsortiert wird (z. B. um „nächste Woche“ nur bei Wochenwechsel zu nennen) */
interface Labels { sport: (s: string) => string; day: (date: string, anchor: string) => string }
interface Item { id: string; sport: string; date: string; min: number; title: string }

const SKIP = new Set(['rest', 'note']);
function items(days: any[], from: string, to: string, done: (id: string) => boolean): Item[] {
  const out: Item[] = [];
  for (const d of days || []) {
    if (d.date < from || d.date > to) continue;
    for (const s of d.sessions || []) {
      if (!s || SKIP.has(s.sport) || s.cancelled || s._cancelled || done(s.id)) continue;
      out.push({ id: String(s.id), sport: s.sport, date: d.date, min: Math.round(+s.plannedMinutes || 0), title: String(s.title || '') });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function planDiff(before: any[], after: any[], from: string, to: string, L: Labels, done: (id: string) => boolean = () => false): PlanChange[] {
  const A = items(before, from, to, done), B = items(after, from, to, done);
  const usedA = new Set<Item>(), usedB = new Set<Item>();
  const out: PlanChange[] = [];
  const minTxt = (a: Item, b: Item) => a.min && b.min && a.min !== b.min ? `: ${a.min} → ${b.min} min` : '';
  const pair = (a: Item, b: Item) => {
    usedA.add(a); usedB.add(b);
    if (a.date !== b.date) out.push({ kind: 'moved', sport: a.sport, from: a.date, to: b.date, text: `${L.sport(a.sport)} von ${L.day(a.date, a.date)} auf ${L.day(b.date, a.date)}${a.min && b.min && a.min !== b.min ? ` (${a.min} → ${b.min} min)` : ''}` });
    else if ((a.min && b.min && a.min !== b.min) || (a.title && b.title && a.title !== b.title)) out.push({ kind: 'changed', sport: a.sport, from: a.date, to: b.date, text: `${L.sport(a.sport)} ${L.day(a.date, a.date)}${minTxt(a, b) || `: ${b.title}`}` });
  };
  // 1) gleiche Einheit (gleiche Kennung)
  for (const a of A) { const b = B.find(x => !usedB.has(x) && x.id === a.id); if (b) pair(a, b); }
  // 2) gleiche Sportart am gleichen Tag
  for (const a of A) { if (usedA.has(a)) continue; const b = B.find(x => !usedB.has(x) && x.sport === a.sport && x.date === a.date); if (b) pair(a, b); }
  // 3) gleiche Sportart an einem anderen Tag: der Reihe nach als verschoben
  for (const a of A) { if (usedA.has(a)) continue; const b = B.find(x => !usedB.has(x) && x.sport === a.sport); if (b) pair(a, b); }
  for (const a of A) if (!usedA.has(a)) out.push({ kind: 'removed', sport: a.sport, from: a.date, text: `${L.sport(a.sport)} ${L.day(a.date, a.date)} entfällt` });
  for (const b of B) if (!usedB.has(b)) out.push({ kind: 'added', sport: b.sport, to: b.date, text: `Neu: ${L.sport(b.sport)} ${L.day(b.date, b.date)}${b.min ? ` (${b.min} min)` : ''}` });
  const key = (c: PlanChange) => (c.from || c.to || '');
  return out.sort((x, y) => key(x).localeCompare(key(y)));
}
