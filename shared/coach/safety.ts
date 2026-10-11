/* Warnzeichen und Grenzen des Coachs: keine Medikamente, keine Diagnosen, bei Warnzeichen immer an Arzt oder Notdienst.
   Warnzeichen: Fieber über mehrere Tage, Brustschmerz, Atemnot, Ohnmacht, starke oder anhaltende Schmerzen,
   Hinweise auf Übertraining oder Essstörungen. */
import { addDays, illnessAt } from '../core';

export type Flag = 'emergency' | 'fever' | 'pain' | 'overtraining' | 'eating' | 'medication';
export interface SafetyHit { flag: Flag; text: string; urgent: boolean }

const EMERGENCY_RE = /brust(schmerz|enge|druck)|herz(rasen|stolpern|schmerz)|atemnot|kaum luft|keine luft|ohnmacht|bewusstlos|umgekippt|zusammengebrochen|kollabiert|chest pain|faint/i;
const FEVER_RE = /fieber|fever|\b(38|39|40)[.,]\d\s*°?/i;
const MED_RE = /\b(ibuprofen|paracetamol|aspirin|diclofenac|voltaren|antibiotik|medikament|tablette|schmerzmittel|cortison|kortison|spray|inhalier|dosis|dosierung|wie viel .* nehmen|was soll ich nehmen|welche(s)? (mittel|medikament))/i;
const DIAG_RE = /(was habe ich|ist das (ein|eine)|hab ich (einen|eine|ein)|diagnos|ist es (ein|eine)|bänderriss|ermüdungsbruch|sehnenentzündung|meniskus)/i;
const EATING_RE = /(nichts gegessen|kaum gegessen|will abnehmen|muss abnehmen|zu dick|fasten|kalorien sparen|erbrech|hungern|essen ausfallen lassen)/i;

export const DOCTOR_TEXT = 'Bitte lass das ärztlich abklären. Ich bin ein Trainings-Coach und kann keine Diagnosen stellen oder Medikamente empfehlen.';
export const EMERGENCY_TEXT = 'Das klingt nach einem Warnzeichen. Hör sofort mit dem Training auf. Bei Brustschmerz, Atemnot oder Ohnmacht ruf den Notruf 112. Sonst bitte heute noch zum Arzt.';

/* Prüft eine Nachricht des Nutzers */
export function checkMessage(text: string): SafetyHit[] {
  const out: SafetyHit[] = [];
  if (EMERGENCY_RE.test(text)) out.push({ flag: 'emergency', urgent: true, text: EMERGENCY_TEXT });
  if (MED_RE.test(text) || DIAG_RE.test(text)) out.push({ flag: 'medication', urgent: false, text: DOCTOR_TEXT });
  if (EATING_RE.test(text)) out.push({ flag: 'eating', urgent: false, text: 'Genug zu essen ist fürs Training wichtiger als jedes Gewicht. Wenn dir Essen gerade schwerfällt, sprich bitte mit deinen Eltern, deinem Arzt oder ruf das BZgA-Telefon zu Essstörungen an (0221 892031). Für Jugendliche gibt es auch die Nummer gegen Kummer: 116 111.' });
  if (FEVER_RE.test(text)) out.push({ flag: 'fever', urgent: false, text: 'Mit Fieber kein Training, auch nicht locker. Erst 24-48 h fieberfrei, dann der Stufenplan. Bei Fieber über 39 °C oder länger als 2-3 Tage bitte zum Arzt.' });
  return out;
}

/* Prüft die Daten der letzten Tage */
export function checkData(state: any, today: string): SafetyHit[] {
  const out: SafetyHit[] = [];
  const trend = (state.trend || []).filter((p: any) => p && p.date <= today && p.date > addDays(today, -10));
  const notes = trend.map((p: any) => String(p.illness || '')).concat(Object.values(state.sessions || {}).map((s: any) => String((s && s.notes) || '')));
  if (notes.some((t: string) => EMERGENCY_RE.test(t))) out.push({ flag: 'emergency', urgent: true, text: EMERGENCY_TEXT });
  // Fieber: Temperatur-Abweichung ≥ 0,8 an 3 Tagen oder „Fieber“ in Notizen an 3 Tagen
  const feverDays = trend.filter((p: any) => (p.bodyTemp != null && p.bodyTemp >= 0.8) || FEVER_RE.test(String(p.illness || ''))).length;
  if (feverDays >= 3) out.push({ flag: 'fever', urgent: true, text: 'Deine Werte und Notizen deuten auf Fieber über mehrere Tage hin. Bitte geh zum Arzt. Training erst wieder nach ärztlicher Freigabe und dann nach Stufenplan.' });
  // anhaltende oder starke Schmerzen
  const painRe = /(\d+(?:[.,]\d)?)\s*(?:\/|von)\s*10/;
  const pains = notes.map((t: string) => { const m = painRe.exec(t); return m && /schmerz|leist|knie|achill|rücken|fuß|wade|hüft|zieh|stech/i.test(t) ? parseFloat(m[1].replace(',', '.')) : null; }).filter((x: any) => x != null) as number[];
  if (pains.some(p => p >= 6)) out.push({ flag: 'pain', urgent: false, text: 'Du hast starke Schmerzen notiert (6/10 oder mehr). Bitte lass das ärztlich oder physiotherapeutisch abklären, bevor du in dieser Sportart weiter trainierst.' });
  else if (pains.filter(p => p > 2).length >= 5) out.push({ flag: 'pain', urgent: false, text: 'Die Schmerzen tauchen seit über einer Woche immer wieder auf. Bitte lass das abklären, ein Physiotherapeut kann früh viel verhindern.' });
  // Übertraining: 7 Tage HFV deutlich unter normal und Ruhepuls erhöht, ohne Krankheit
  const last7 = trend.filter((p: any) => p.date > addDays(today, -7) && !illnessAt(state.illnessPeriods, p.date));
  const base = (state.trend || []).filter((p: any) => p && p.date <= addDays(today, -7) && p.date > addDays(today, -35));
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const hb = base.map((p: any) => p.hrv).filter((x: any) => x > 0), rb = base.map((p: any) => p.restingHR).filter((x: any) => x > 0);
  const h7 = last7.map((p: any) => p.hrv).filter((x: any) => x > 0), r7 = last7.map((p: any) => p.restingHR).filter((x: any) => x > 0);
  if (hb.length >= 10 && h7.length >= 5 && rb.length >= 10 && r7.length >= 5 && avg(h7) < avg(hb) * 0.85 && avg(r7) > avg(rb) + 4) {
    out.push({ flag: 'overtraining', urgent: false, text: 'Seit einer Woche ist deine HFV deutlich niedriger und dein Ruhepuls höher als normal. Das kann ein Zeichen für zu viel Belastung sein. Ich nehme den Umfang raus. Fühlst du dich dauerhaft müde oder schläfst schlecht, sprich mit deinem Arzt.' });
  }
  return out;
}
