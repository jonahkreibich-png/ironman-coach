/* Laufende Woche an geänderte Regeln anpassen (Auftrag 5 A4): Ändert jemand eine Einschränkung, prüft die App sofort die
   restlichen Tage dieser Woche. Einheiten, die jetzt eine harte Regel brechen, rutschen auf einen erlaubten Tag derselben Woche
   (ohne zweimal dieselbe Sportart am Tag, ohne zwei harte Tage hintereinander), sonst entfallen sie. Ab nächster Woche plant
   replanFuture ohnehin neu. Ergebnis sind normale Anpassungen mit Grund und Rückgängig. */
import * as C from './core';
import { evaluate, describe, type Rule } from './constraints';

const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dm = (d: string) => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`;

export function repairWeek(weeks: any[], state: any, rules: Rule[], today: string, group = 'rules-' + today): any[] {
  const w = weeks.find((x: any) => x.days.some((d: any) => d.date === today)) || weeks.find((x: any) => x.startDate > today);
  if (!w) return [];
  const done = (s: any) => !!((state.sessions || {})[s.id] || {}).completed;
  const days = w.days.filter((d: any) => d.date >= today).map((d: any) => ({ date: d.date, list: d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.removed) }));
  const out: any[] = [];
  const hardOn = (date: string) => { const d = days.find((x: any) => x.date === date); return !!d && d.list.some((s: any) => C.isHard(s)); };
  for (const d of days) {
    for (const s of [...d.list]) {
      if (done(s) || s.race || s.fixed || s.ruleOverride || s.locked) continue;
      const ev = evaluate(rules, s, d.date).hard;
      if (!ev.length && C.ruleOk(rules, s, d.date, d.list)) continue;
      const why = ev.length ? `Regel „${describe(ev[0])}“` : 'Tagesgrenze aus deinen Regeln';
      const target = days.filter((x: any) => x.date !== d.date && x.date > today || (x.date === today && x.date !== d.date && !x.list.length))
        .filter((x: any) => !x.list.some((y: any) => y.sport === s.sport) && x.list.length < 2 && C.ruleOk(rules, s, x.date, x.list))
        .filter((x: any) => !C.isHard(s) || (!hardOn(x.date) && !hardOn(C.addDays(x.date, -1)) && !hardOn(C.addDays(x.date, 1))))
        .sort((a: any, b: any) => a.list.length - b.list.length || a.date.localeCompare(b.date))[0];
      d.list = d.list.filter((x: any) => x !== s);
      if (target) {
        target.list.push(s);
        out.push({ id: `${group}-${s.id}`, group, type: 'move', sessionId: s.id, from: d.date, to: target.date, what: `${s.title}: ${dm(d.date)} → ${dm(target.date)}`, reason: why });
      } else out.push({ id: `${group}-${s.id}`, group, type: 'cancel', sessionId: s.id, what: `${s.title} entfällt`, reason: `${why}, kein anderer Tag frei` });
    }
  }
  return out;
}
