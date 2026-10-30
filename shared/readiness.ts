import { localDate } from './tz';
/* Eine aktuelle Ampel für Anzeige und Coach. Keine persistierten Ableitungen als Eingabe. */
import * as C from './core';


/* Auftrag 22: „heute“ in der Zeitzone der App (Gerät bzw. Nutzer), nicht fest Europe/Berlin */
export function readinessDate(now = Date.now()): string { return localDate(now); }
export { readinessInputs, readinessSnapshot } from './core';
/* Kein Score, keine Gründe und keine aus gesperrten Messwerten abgeleitete Farbe gehen ans Modell. */
export function withheldReadiness(date: string): any {
  return { date, source: 'withheld', version: 'readiness-v1-withheld', dataDate: null, level: 3, score: null, reasons: [], crits: [], point: null, stale: false, personal: false, uncertain: 'withheld', staleLevel: null, have: 0 };
}
export function readinessContextLine(r: any): string {
  return r.source === 'withheld' ? 'Werte von Oura gibt die App nicht an die KI weiter; auch keine daraus abgeleitete Ampel. Die vollständige Ampel wird nicht an die KI weitergegeben. Keine eigene Farbe aus Teilwerten berechnen; die App zeigt den gültigen Status.' : `${C.readinessLine(r)} Stand ${r.date}; Daten ${r.dataDate || 'fehlend'}; Quelle ${r.source}; Version ${r.version}.`;
}
/* Der App-Ausgabepfad entscheidet über die Ampel, auch bei einer widersprechenden Modellantwort. */
export function isReadinessQuestion(text: string): boolean { return /ampel|readiness|trainingsbereit/i.test(text); }
export function guardReadinessAnswer(answer: string, question: string, ctx: any): string {
  if (!isReadinessQuestion(question) && !/ampel[^.!?\n]{0,90}\b(rot|gelb|grün|gruen)|\b(rot|gelb|grün|gruen)[^.!?\n]{0,40}ampel/i.test(answer)) return answer;
  const r = C.readinessSnapshot(ctx.state, C.applyAdjustments(ctx.baseWeeks || [], ctx.state.adjustments || {}), ctx.profile, ctx.today);
  return 'Ampel der App: ' + C.readinessLine(r) + ' Stand ' + r.date + ' (Trainingstag Europe/Berlin).' + (r.dataDate && r.dataDate !== r.date ? ' Letzte Morgenwerte: ' + r.dataDate + '; nicht aktuell.' : !r.dataDate ? ' Keine Morgenwerte für diesen Tag.' : '');
}
