/* „Neu in dieser Version“ (Auftrag 5 E6): nach einem Update einmal 2-3 Punkte, damit Tester wissen, was sie ausprobieren sollen. */
export const WHATS_NEW: { version: string; items: string[] }[] = [
  { version: '2.2.0', items: [
    'Dein Plan hält sich an deine Tage: Unter Mehr → Berücksichtigungen gibt es ein Wochenraster (geht / lieber nicht / geht nicht). Sätze wie „mittwochs kein Laufen, nur Sa oder So“ versteht die App und zeigt dir, was sie verstanden hat.',
    'Der Coach-Chat versteht mehr und ändert den Plan auf Zuruf: „Ich hab Mittwoch keine Zeit“, „Mach den Lauf kürzer“, „Ich bin krank“, „Urlaub vom 20.12. bis 6.1.“ – mit Vorschau und Rückgängig.',
    '„Fehler melden / Idee“ kommt jetzt sicher an, auch ohne Verbindung. Du siehst, wenn Jonah antwortet.'
  ] }
];
/* Punkte für ein Update von `seen` auf `current` (nur Versionen dazwischen) */
export function newsSince(seen: string | null | undefined, current: string): { version: string; items: string[] } | null {
  if (!seen || seen === current) return null;
  const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const list = WHATS_NEW.filter(w => cmp(w.version, seen) > 0 && cmp(w.version, current) <= 0).sort((a, b) => cmp(b.version, a.version));
  return list.length ? { version: list[0].version, items: list.flatMap(w => w.items).slice(0, 3) } : null;
}
