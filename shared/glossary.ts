/** Zentrales Lexikon (Auftrag 17, Punkt 5): alle Fachbegriffe der App, nach Themen, kurz und verständlich, mit Suche unter Mehr → Lexikon.
 *  In den Ansichten stehen keine Erklärblöcke mehr, höchstens ein dezenter Link auf den Begriff. Die Einheiten-Typen kommen aus der
 *  zentralen Liste (shared/sessiontypes.ts), damit Plan, Anzeige, Coach und Lexikon dieselben Namen verwenden. */
import { SESSION_TYPES } from './sessiontypes';
import { KNOWLEDGE } from './trainingknowledge';
import { DRILLS } from './workouts';
import { WORKOUTS } from './workoutlib';
import { exampleSpec, diagramSvg } from './workoutdiagram';

export type GlossaryTopic = 'understand' | 'load' | 'values' | 'intensity' | 'planning' | 'technique' | 'sessions';
export interface Term { term: string; topic: GlossaryTopic; aliases: string; text: string; re: RegExp; ok?: RegExp;
  /** Auftrag 19: Formen der Einheiten-Bibliothek mit Ablaufbild und Steckbrief */ diagram?: string; facts?: string[] }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entry = (term: string, topic: GlossaryTopic, aliases: string, text: string): Term => ({ term, topic, aliases, text, re: new RegExp(esc(term), 'i') });

const BASE: Term[] = [
  // Belastung und Erholung
  entry('Belastung', 'load', 'Trainingslast Load TSS', 'Wie stark eine Einheit fordert: Dauer mal Intensität. Die App nimmt Werte von intervals.icu oder schätzt sie aus Puls bzw. Anstrengung (RPE). Teamsport zählt voll mit.'),
  entry('CTL', 'load', 'Fitness Chronic Training Load', 'Deine Fitness im Modell: die durchschnittliche Belastung der letzten etwa 6 Wochen (42 Tagen Zeitkonstante). Steigt langsam, wenn du regelmäßig trainierst. Eine Schätzung, keine Messung.'),
  entry('ATL', 'load', 'Müdigkeit Ermüdung Acute Training Load', 'Deine Müdigkeit im Modell: die Belastung der letzten etwa 7 Tage (7 Tagen Zeitkonstante). Reagiert schnell auf harte Tage und Pausen.'),
  entry('TSB', 'load', 'Form Frische Training Stress Balance', 'Form = Fitness minus Müdigkeit (CTL − ATL) am Tagesende. Negativ heißt: gerade viel trainiert. Leicht positiv heißt: erholt, gut für Wettkämpfe.'),
  entry('ATL/CTL', 'load', 'Belastungsverhältnis Load Ratio', 'Müdigkeit geteilt durch Fitness. Über 1 trainierst du gerade mehr als sonst. Nur ein Hinweis zum Verlauf: Es sagt keine Verletzung voraus und ist keine feste Grenze.'),
  entry('ACWR', 'load', 'Acute Chronic Workload Ratio', 'Verhältnis der Belastung der letzten Woche zu den Wochen davor. Ähnlich wie ATL/CTL. Kein persönlicher Verletzungsprädiktor, nur ein Hinweis, ob es gerade schnell mehr wird.'),
  entry('Ampel', 'load', 'Bereitschaft Readiness grün gelb rot', 'Zeigt morgens, wie erholt du bist: aus Ruhepuls, HFV, Schlaf, Temperatur und deinem Gefühl im Vergleich zu deinem Normalbereich. Gelb oder rot: lockerer trainieren.'),
  entry('Erholungswoche', 'load', 'Entlastungswoche Recovery', 'Alle 3-4 Wochen eine leichtere Woche (etwa zwei Drittel des Umfangs, kaum Hartes). In der Pause wird der Körper stärker.'),
  entry('Steigerung', 'load', '10 Prozent Regel Umfang erhöhen', 'Der Umfang steigt höchstens etwa 10 % pro Woche, gemessen an dem, was du wirklich gemacht hast, dann kommt eine Erholungswoche (z. B. 3+1).'),
  // Werte und Messung
  entry('HFV', 'values', 'HRV Herzfrequenzvariabilität', 'Wie unterschiedlich die Abstände zwischen deinen Herzschlägen sind (in ms). Höher als dein Normalwert heißt meist: gut erholt. Wichtig ist nur der Vergleich mit dir selbst.'),
  entry('Ruhepuls', 'values', 'Ruheherzfrequenz Puls morgens', 'Dein Puls in Ruhe, am besten morgens gemessen. Einige Schläge höher als sonst: oft Müdigkeit, Stress oder ein beginnender Infekt.'),
  entry('SpO2', 'values', 'Sauerstoffsättigung', 'Wie viel Sauerstoff dein Blut trägt (in %). Meist 95-99 %. Einzelne niedrigere Nachtwerte sind oft Messfehler der Uhr oder des Rings.'),
  entry('Körpertemperatur', 'values', 'Temperatur Abweichung', 'Abweichung von deiner normalen Hauttemperatur in der Nacht. Deutlich erhöht kann ein Infekt sein: dann lieber locker oder Pause.'),
  entry('VO2max', 'values', 'maximale Sauerstoffaufnahme VO₂max', 'Wie viel Sauerstoff dein Körper bei voller Belastung aufnehmen kann. Uhren schätzen ihn nur. „Sehr harte Intervalle“ trainieren genau das.'),
  entry('Entkopplung', 'values', 'Decoupling Pulsdrift aerobe Entkopplung', 'Wie stark dein Puls in einer gleichmäßigen Einheit gegen Ende steigt, obwohl das Tempo gleich bleibt. Unter 5 % ist gut. Hitze und wenig Trinken erhöhen sie.'),
  entry('Effizienz', 'values', 'Meter pro Herzschlag Laufökonomie', 'Wie viel Tempo du pro Herzschlag schaffst. Steigt sie bei lockeren Läufen, wirst du fitter.'),
  entry('Score', 'values', 'Leistungs-Score Punkte', 'Deine Leistung je Sportart auf einer festen Skala: 20 Einsteiger, 50 solider Hobbysportler, 70 stark, 85 Spitzenamateur, 100 Elite, nach Alter und Geschlecht bereinigt. Nur aus echten Messwerten und Tests, nie aus dem Plan.'),
  entry('Gesamt-Form', 'values', 'Form für das Ziel', 'Deine gemessene Belastung (CTL) im Vergleich zu dem, was dein Ziel ungefähr braucht.'),
  entry('W/kg', 'values', 'Watt pro Kilogramm', 'Leistung auf dem Rad geteilt durch dein Gewicht. Wichtig am Berg; bei Jugendlichen zeigt die App keine Gewichtswerte als Ziel.'),
  entry('Prognose', 'values', 'Zielzeit Vorhersage', 'Eine Spanne für deine Zeit im Wettkampf aus Schwellen, Ausdauer und Plan bis dahin. Je mehr Messwerte, desto enger.'),
  // Intensität und Zonen
  entry('Zonen', 'intensity', 'Zone 1 Zone 2 Zone 3 Zone 4 Zone 5 Z1 Z2 Z3 Z4 Z5 Pulszonen Trainingsbereiche', 'Fünf Stufen der Anstrengung: Z1 ganz locker, Z2 locker (Sprechen geht), Z3 zügig, Z4 Schwelle (hart), Z5 sehr hart. Die Werte stehen in jeder Einheit.'),
  entry('Schwelle', 'intensity', 'Laktatschwelle anaerobe Schwelle', 'Das Tempo, das du etwa eine Stunde lang halten kannst (Zone 4). Darüber wird es schnell sehr anstrengend.'),
  entry('LTHR', 'intensity', 'Schwellenpuls Lactate Threshold Heart Rate', 'Dein Puls an der Schwelle. Aus dem Lauftest (Schnitt der letzten 20 min) oder dem Radtest; daraus rechnet die App deine Pulszonen.'),
  entry('FTP', 'intensity', 'Functional Threshold Power Schwellenleistung Watt', 'Die Leistung in Watt, die du auf dem Rad etwa eine Stunde halten kannst. Aus dem Radtest (95 % der 20 Minuten).'),
  entry('CSS', 'intensity', 'Critical Swim Speed Schwimmschwelle', 'Dein Schwellentempo im Wasser pro 100 m, aus 400 m und 200 m auf Zeit. Gibt es erst, wenn du 400 m am Stück kraulen kannst.'),
  entry('Pace', 'intensity', 'Tempo min/km min/100 m', 'Zeit pro Kilometer (Laufen) bzw. pro 100 m (Schwimmen). Kleinere Zahl heißt schneller.'),
  entry('Sweet Spot', 'intensity', 'SST knapp unter Schwelle', 'Rad-Intervalle knapp unter der Schwelle (oberes Zone 3): fordernd, aber gut durchzuhalten. Hebt die Schwelle, ohne so müde zu machen.'),
  entry('Over-Unders', 'intensity', 'Over Under', 'Rad-Intervalle im Wechsel knapp über und knapp unter der Schwelle (z. B. je 2 min). Üben Tempowechsel wie im Rennen.'),
  entry('RPE', 'intensity', 'Anstrengung Gefühl 1-10 Rate of Perceived Exertion', 'Wie anstrengend sich die Einheit angefühlt hat, von 1 (ganz leicht) bis 10 (maximal). Locker ist etwa 3-4, hart 7-8.'),
  entry('Kadenz', 'intensity', 'Trittfrequenz Schrittfrequenz', 'Umdrehungen pro Minute auf dem Rad (meist 85-95) bzw. Schritte pro Minute beim Laufen.'),
  entry('Wettkampftempo', 'intensity', 'Renntempo Race Pace Halbmarathon-Tempo', 'Das Tempo, das du im Wettkampf laufen oder fahren willst. Kurz geübt in den letzten Wochen vorher.'),
  entry('Harte Einheit', 'intensity', 'hart Qualität Schlüsseleinheit', 'Einheit mit Abschnitten ab Zone 4, Test, Spiel oder Wettkampf. Höchstens 2 eigene pro Woche plus Spiel, nie zwei harte Tage hintereinander.'),
  // Planung
  entry('Periodisierung', 'planning', 'Phasen Trainingsphasen Block', 'Der Plan in Abschnitten: Grundlage, Aufbau, wettkampfspezifisch, Tapering, Wettkampf, dazwischen Erholungswochen.'),
  entry('Grundlage', 'planning', 'Base Grundlagenausdauer', 'Phase mit viel lockerem Training, Technik und Kraft. Baut die Ausdauer auf, auf der alles andere steht.'),
  entry('Aufbau', 'planning', 'Build Aufbauphase', 'Phase, in der Intervalle dazukommen und die langen Einheiten wachsen.'),
  entry('Wettkampfspezifisch', 'planning', 'spezifische Phase Specific', 'Die Wochen vor dem Ziel: Renntempo üben, beim Triathlon auch Koppeltraining.'),
  entry('Tapering', 'planning', 'Taper Wettkampfvorbereitung Frische', 'Die letzten 1-2 Wochen vor dem Wettkampf: weniger Umfang, kurze scharfe Reize, damit du frisch an den Start gehst.'),
  entry('Intervalle', 'planning', 'Intervalltraining Wiederholungen', 'Mehrere Abschnitte zügig oder hart mit Pausen dazwischen, z. B. „Lauf-Intervalle 6×1 min zügig“. Die Zahl vor dem × ist die Anzahl.'),
  entry('Koppellauf', 'planning', 'Koppeltraining Brick Wechsel-Lauf', 'Kurz laufen direkt nach dem Radfahren, damit sich die Beine an den Wechsel gewöhnen. Nur im Aufbau, jede 2.-3. Woche.'),
  entry('Steigerungen', 'planning', 'Steigerungsläufe Strides', 'Am Ende eines lockeren Laufs 4-6 × 15-20 s zügig, dazwischen gehen. Macht den Laufstil leichter, ohne müde zu machen.'),
  entry('Lauf-Geh-Wechsel', 'planning', 'Laufen Gehen Einsteiger', 'Abwechselnd laufen und gehen. Die Laufstücke werden Stufe für Stufe länger, bis 30 min am Stück gehen.'),
  entry('Test', 'planning', 'Lauftest Radtest Kraul-Check Schwimmtest', 'Kurze Prüfung deiner Schwelle oder Kraul-Strecke. Daraus kommen deine Zonen. Höchstens ein harter Test pro Erholungswoche.'),
  entry('Soll und Ist', 'planning', 'geplant gemacht SOLL IST', 'Soll ist der Plan, Ist ist, was du eingetragen hast oder die Uhr gemessen hat. Fortschritt, Bestwerte und Stufen kommen nur aus dem Ist.'),
  entry('Wiedereinstieg', 'planning', 'nach Krankheit', 'Nach einer Krankheit startet der Plan leichter und steigt in Stufen (etwa 70 %, 90 %, 100 %).'),
  // Technik und Ausrüstung
  entry('Kraul am Stück', 'technique', 'längste Strecke Kraul Kraulstufe', 'Die längste Strecke, die du ohne Pause kraulst. Die nächste Schwimm-Stufe kommt erst, wenn du die längere Strecke in 2 Einheiten geschafft hast.'),
  entry('SWOLF', 'technique', 'Swim Golf Effizienz Schwimmen', 'Züge plus Sekunden für eine Bahn. Kleiner ist effizienter. Gut zum Vergleich mit dir selbst auf derselben Bahnlänge.'),
  entry('Züge pro Bahn', 'technique', 'Zugzahl Meter pro Zug DPS', 'Wie viele Armzüge du für eine Bahn brauchst. Weniger Züge bei gleichem Tempo heißt bessere Technik.'),
  entry('Pull Buoy', 'technique', 'Pullbuoy Schwimmhilfe', 'Schaumstoff zwischen den Beinen: die Beine bleiben oben, du übst Zug und Wasserlage. Kommt nur in den Plan, wenn du einen hast.'),
  entry('Kickbrett', 'technique', 'Schwimmbrett Brett Beinschlag', 'Brett in den Händen für Beinschlag-Übungen: Beine aus der Hüfte, Knie locker.'),
  entry('Flossen', 'technique', 'Schwimmflossen kurze Flossen', 'Machen Technik-Übungen leichter, weil du mehr Vortrieb hast. Gut für Einsteiger beim Beinschlag.'),
  entry('Schnorchel', 'technique', 'Frontschnorchel', 'Du musst nicht seitlich atmen und kannst dich ganz auf Armzug und Wasserlage konzentrieren.'),
  entry('Paddles', 'technique', 'Handpaddles', 'Platten an den Händen für mehr Druck im Wasser. Nur kurz und nur mit sauberer Technik, sonst leidet die Schulter.'),
  entry('Dreier-Atmung', 'technique', 'Atmung beidseitig', 'Alle 3 Züge atmen, abwechselnd links und rechts. Macht den Zug gleichmäßig und hilft im Freiwasser.'),
  entry('Freiwasser', 'technique', 'Open Water See', 'Schwimmen im See oder Meer: alle paar Züge nach vorn schauen (Sichten). Nie allein schwimmen.'),
  entry('Rolle', 'technique', 'Indoor Trainer Smarttrainer Rollentrainer', 'Fahrrad-Trainer für drinnen. Gut für Intervalle und im Winter; die Geschwindigkeit dort ist nur virtuell.')
];
/* Auftrag 19: alle Formen der Einheiten-Bibliothek mit kurzer Erklärung, Steckbrief und Ablaufbild (Mehr → Lexikon → Einheiten) */
const LV_TXT: Record<string, string> = { beginner: 'alle', advanced: 'ab Fortgeschritten', experienced: 'Erfahrene' };
const NEED_TXT: Record<string, string> = { hills: 'Hügel', track: 'Laufbahn', trainer: 'Rolle', buoy: 'Pull Buoy', board: 'Kickbrett', paddles: 'Paddles', openwater: 'Freiwasser' };
const EX_TXT: Record<string, string> = { achilles: 'Achillessehnen-Beschwerden', knee: 'Kniebeschwerden', back: 'Rückenbeschwerden', shoulder: 'Schulterbeschwerden', runEasyOnly: 'Lauf nur locker (Beschwerden)' };
const SPORT_TXT: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', tri: 'Triathlon' };
const LIB_ALL: Term[] = WORKOUTS.map(d => {
  const sp = exampleSpec(d.key);
  const facts = [`${SPORT_TXT[d.sport]} · ${d.load} · ${LV_TXT[d.level]}`, `Beispiel: ${d.example}`, `Aufbau: ${d.structure}`, `Steigerung: ${d.stages.join(' → ')}`,
    ...(d.needs && d.needs.length ? [`Braucht: ${d.needs.map(n => NEED_TXT[n] || n).join(', ')}${d.altText ? '. ' + d.altText : ''}`] : []), ...(d.excludes && d.excludes.length ? [`Nicht bei: ${d.excludes.map(x => EX_TXT[x] || x).join(', ')}`] : []), ...(d.swimMin ? [`Ab ${d.swimMin} m Kraul am Stück`] : [])];
  return { term: d.name, topic: 'sessions' as GlossaryTopic, aliases: `Einheit ${d.key} ${d.load} ${SPORT_TXT[d.sport]} ${d.example}`, text: d.purpose, re: new RegExp(esc(d.name), 'i'), facts, ...(sp ? { diagram: diagramSvg(sp, { label: 'Ablauf: ' + d.name }) } : {}) };
});
// Begriffe, die es schon gibt (z. B. Sweet Spot, Over-Unders, Freiwasser), bekommen Steckbrief und Ablaufbild dazu
for (const b of BASE) { const l = LIB_ALL.find(x => x.term === b.term); if (l) { b.facts = l.facts; b.diagram = l.diagram; } }
const LIB_TERMS = LIB_ALL.filter(l => !BASE.some(b => b.term === l.term));
/* Einheiten aus der zentralen Liste: Name, Zweck und Aufbau */
const SESSIONS: Term[] = [...LIB_TERMS, ...SESSION_TYPES.filter(t => !BASE.some(b => b.term === t.name) && !LIB_TERMS.some(l => l.term === t.name)).map(t => entry(t.name, 'sessions', `Einheit ${t.key} ${t.intensity}`, `${t.purpose} Aufbau: ${t.structure}`))];
/* Auftrag 18: Technik-Übungen im Wasser (Übungs-Katalog) und „Training verstehen“ (die Trainingsregeln mit Begründung). Beide werden nur
   im Lexikon gezeigt, nicht in Texten gesucht. */
const NEVER = /(?!)/;
const DRILL_TERMS: Term[] = Object.values(DRILLS).filter(d => !BASE.some(b => b.term === d.name)).map(d => ({ term: d.name, topic: 'technique' as GlossaryTopic, aliases: `Übung Technik Schwimmen ${d.focus}`, text: `Übung im Wasser: ${d.what}`, re: NEVER }));
const UNDERSTAND: Term[] = KNOWLEDGE.map(k => ({ term: k.title, topic: 'understand' as GlossaryTopic, aliases: `Regel ${k.topic} ${k.id}`, text: `${k.rule} Warum: ${k.why}`, re: NEVER }));
export const JARGON: Term[] = [...BASE, ...DRILL_TERMS, ...SESSIONS, ...UNDERSTAND];

const normalize = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/₂/g, '2');
export function searchGlossary(query = '', topic: GlossaryTopic | '' = ''): Term[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return JARGON.filter(j => (!topic || j.topic === topic) && words.every(w => normalize(`${j.term} ${j.aliases} ${j.text}`).includes(w))).sort((a, b) => a.term.localeCompare(b.term, 'de'));
}
/* der beste Treffer für einen Begriff (für Links aus den Ansichten) */
export function findTerm(q: string): Term | null {
  const n = normalize(q);
  return JARGON.find(j => normalize(j.term) === n) || JARGON.find(j => normalize(j.aliases).split(/\s+/).includes(n)) || searchGlossary(q)[0] || null;
}
/** Nur für gezielte Textprüfungen; keine zusätzliche Anweisung. */
export function unexplained(text: string): string[] { return JARGON.filter(j => j.topic !== 'sessions' && j.topic !== 'understand' && j.re.test(String(text || '')) && !(j.ok && j.ok.test(text))).map(j => j.term); }
/** Alte Aufrufer bleiben kompatibel; Erklärungen stehen unter Mehr → Lexikon. */
export function termsLine(_text: string): string { return ''; }
/** Ausdrücklich geschriebene Erklärungen und Sicherheitshinweise bleiben erhalten. */
export function withTerms(text: string): string { return String(text || ''); }
