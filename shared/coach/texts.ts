/* Textbausteine des Coachs im kostenlosen Modus: kurz, natürlich, abwechslungsreich, mit echten Zahlen.
   Die Auswahl ist stabil (gleicher Tag und Anlass ergibt denselben Text), wechselt aber von Tag zu Tag. */

export function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function pick<T>(list: T[], seed: string): T { return list[seedOf(seed) % list.length]; }
export const de = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
export const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
export function joinDe(list: string[]): string { return list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' und ' + list[list.length - 1]; }
const DOW = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export function dowName(date: string) { return DOW[new Date(date + 'T12:00:00Z').getUTCDay()]; }

export const T = {
  greet: (seed: string, name?: string) => pick(name ? [`Guten Morgen, ${name}!`, `Morgen, ${name}.`, `Hey ${name},`, `Moin ${name}!`] : ['Guten Morgen!', 'Morgen!', 'Hey,', 'Moin!'], seed),
  green: (seed: string) => pick(['Deine Werte sehen gut aus.', 'Alles im grünen Bereich.', 'Dein Körper ist bereit.', 'Erholung passt.'], seed),
  yellow: (seed: string) => pick(['Dein Körper braucht heute etwas mehr Ruhe.', 'Heute ist nicht der Tag für Vollgas.', 'Ein paar Werte sind nicht ganz im Normalbereich.'], seed),
  red: (seed: string) => pick(['Heute ist Erholung wichtiger als Training.', 'Dein Körper sendet klare Signale: heute Ruhe.', 'Heute lieber pausieren.'], seed),
  doneEasy: (seed: string) => pick(['Schön locker, genau richtig für die Grundlage.', 'Sauber im Grundlagenbereich.', 'Das war eine gute, ruhige Einheit.'], seed),
  doneHard: (seed: string) => pick(['Starke harte Einheit.', 'Das war ordentlich Arbeit.', 'Harte Einheit erledigt, gut gemacht.'], seed),
  doneGeneric: (seed: string) => pick(['Erledigt, gut gemacht.', 'Abgehakt, stark.', 'Wieder eine Einheit im Kasten.'], seed),
  next: (seed: string) => pick(['Weiter so.', 'Bleib dran.', 'Morgen geht es weiter.', 'Jetzt gut essen und trinken.'], seed)
};
