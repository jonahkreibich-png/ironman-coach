/* Berücksichtigungen (Auftrag 4 B5/C3): freie Notizen wie „Knie zwickt“ oder „Schwimmbad nur samstags“
   werden bekannten Kategorien zugeordnet und steuern den Plan. Was die Engine nicht versteht, bleibt sichtbar
   als „noch nicht berücksichtigt“, statt ignoriert zu werden. */

export type ConsCat = 'knee' | 'achilles' | 'shin' | 'hip' | 'back' | 'shoulder' | 'foot' | 'groin' | 'injury'
  | 'poolDays' | 'noPool' | 'noPoolWinter' | 'indoorBike' | 'noBikeWinter' | 'noBike' | 'heart' | 'asthma' | 'morningOnly' | 'eveningOnly' | 'gym' | 'treadmill' | 'noTrack';
export interface Effects {
  /** keine Lauf-Intensität, Laufumfang kleiner */
  runEasyOnly?: boolean; runVolume?: number;
  /** Schwimmen nur an diesen Wochentagen (0=So) */
  poolDays?: number[];
  /** Schwimmen ersetzen (ganz oder in diesen Monaten 1-12) */
  noSwim?: boolean; noSwimMonths?: number[];
  /** Rad nur drinnen bzw. kein Rad (in diesen Monaten) */
  bikeIndoor?: boolean; bikeIndoorMonths?: number[]; noBike?: boolean;
  /** Krafttraining: Rücken schonen, Knie schonen, Schulter schonen */
  strengthBack?: boolean; strengthKnee?: boolean; strengthShoulder?: boolean;
  /** Schwimmumfang kleiner (Schulter) */
  swimVolume?: number;
  /** vorsichtiger Plan (ärztliche Abklärung) */
  caution?: boolean;
  gym?: boolean;
}
export interface Consideration { text: string; cats: ConsCat[]; label: string; effect: string; understood: boolean }

const DOW_WORDS: [RegExp, number][] = [[/montag|\bmo\b/i, 1], [/dienstag|\bdi\b/i, 2], [/mittwoch|\bmi\b/i, 3], [/donnerstag|\bdo\b/i, 4], [/freitag|\bfr\b/i, 5], [/samstag|sonnabend|\bsa\b/i, 6], [/sonntag|\bso\b/i, 0]];
const WINTER = [11, 12, 1, 2, 3];
const RULES: { re: RegExp; cat: ConsCat; label: string; effect: string }[] = [
  { re: /knie|patella|meniskus|kreuzband/i, cat: 'knee', label: 'Knie', effect: 'weniger Lauf-Intensität, Laufumfang −20 %, Kraft kniefreundlich' },
  { re: /achilles|ferse/i, cat: 'achilles', label: 'Achillessehne', effect: 'keine Lauf-Intervalle, Laufumfang −20 %' },
  { re: /schienbein|shin/i, cat: 'shin', label: 'Schienbein', effect: 'keine Lauf-Intervalle, Laufumfang −30 %' },
  { re: /hüfte|huefte|hüft/i, cat: 'hip', label: 'Hüfte', effect: 'weniger Lauf-Intensität' },
  { re: /rücken|ruecken|bandscheib|lws|ischias/i, cat: 'back', label: 'Rücken', effect: 'Kraft ohne schwere Hebeübungen, Fokus Rumpf' },
  { re: /schulter/i, cat: 'shoulder', label: 'Schulter', effect: 'weniger Schwimmumfang, Kraft ohne Liegestütz' },
  { re: /\bfuß|\bfuss|plantar|sprunggelenk|knöchel/i, cat: 'foot', label: 'Fuß/Sprunggelenk', effect: 'keine Lauf-Intervalle, weicher Untergrund' },
  { re: /leiste|adduktor/i, cat: 'groin', label: 'Leiste', effect: 'keine Lauf-Intensität, Adduktoren-Übungen' },
  { re: /schmerz|verletz|zerr|entzünd/i, cat: 'injury', label: 'Beschwerden', effect: 'weniger Lauf-Intensität' },
  { re: /(kein|ohne|nicht).{0,25}(schwimmbad|hallenbad|bad|pool).{0,40}winter|winter.{0,40}(kein|ohne|nicht).{0,25}(schwimmbad|bad|pool)/i, cat: 'noPoolWinter', label: 'Kein Schwimmbad im Winter', effect: 'Schwimmen von November bis März durch andere Einheiten ersetzt' },
  { re: /(schwimmbad|hallenbad|\bbad\b|pool|schwimmen).{0,30}nur.{0,30}(mo|di|mi|do|fr|sa|so)|nur.{0,30}(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag).{0,30}(schwimm|bad|pool)/i, cat: 'poolDays', label: 'Schwimmbad nur an bestimmten Tagen', effect: 'Schwimmen nur an diesen Tagen' },
  { re: /(kein|ohne|nicht).{0,25}(schwimmbad|hallenbad|\bbad\b|pool)/i, cat: 'noPool', label: 'Kein Schwimmbad', effect: 'Schwimmen durch andere Einheiten ersetzt' },
  { re: /(kein|ohne|nicht).{0,25}(rad|fahrrad|radfahren).{0,40}winter|winter.{0,30}(nur )?(rolle|indoor|drinnen)/i, cat: 'noBikeWinter', label: 'Rad im Winter nur drinnen', effect: 'Radeinheiten von November bis März auf der Rolle' },
  { re: /nur.{0,20}(rolle|indoor|drinnen|smarttrainer|zwift)/i, cat: 'indoorBike', label: 'Rad nur drinnen', effect: 'Radeinheiten auf der Rolle' },
  { re: /(kein|ohne).{0,15}(fahrrad|rad\b)/i, cat: 'noBike', label: 'Kein Rad', effect: 'keine Radeinheiten' },
  { re: /herz|blutdruck|rhythmus|stent/i, cat: 'heart', label: 'Herz/Kreislauf', effect: 'vorsichtiger Plan, bitte ärztlich abklären' },
  { re: /asthma/i, cat: 'asthma', label: 'Asthma', effect: 'vorsichtiger Plan, lange Aufwärmphasen' },
  { re: /fitnessstudio|gym|hanteln|kraftraum/i, cat: 'gym', label: 'Fitnessstudio vorhanden', effect: 'Kraft mit Geräten möglich' },
  { re: /laufband/i, cat: 'treadmill', label: 'Laufband', effect: 'Läufe bei schlechtem Wetter aufs Laufband möglich' }
];
function dowsIn(text: string): number[] { return DOW_WORDS.filter(([re]) => re.test(text)).map(([, d]) => d); }

export function parseConsiderations(notes: string[]): Consideration[] {
  const out: Consideration[] = [];
  for (const raw of notes || []) {
    const text = String(raw || '').trim();
    if (!text || /^keine?\.?$/i.test(text)) continue;
    const hits = RULES.filter(r => r.re.test(text));
    // spezifische Kategorien zuerst, allgemeine nur ohne spezifische
    let cats = hits.map(h => h.cat);
    if (cats.includes('noPoolWinter')) cats = cats.filter(c => c !== 'noPool');
    if (cats.includes('poolDays')) cats = cats.filter(c => c !== 'noPool');
    if (cats.includes('noBikeWinter')) cats = cats.filter(c => c !== 'noBike' && c !== 'indoorBike');
    if (cats.some(c => ['knee', 'achilles', 'shin', 'hip', 'back', 'shoulder', 'foot', 'groin'].includes(c))) cats = cats.filter(c => c !== 'injury');
    const used = RULES.filter(r => cats.includes(r.cat));
    out.push({ text, cats, label: used.map(u => u.label).join(', '), effect: used.map(u => u.effect).join('; '), understood: cats.length > 0 });
  }
  return out;
}

export function effectsOf(list: Consideration[], allNotes?: string[]): Effects {
  const e: Effects = {};
  const has = (c: ConsCat) => list.some(x => x.cats.includes(c));
  if (has('knee') || has('hip') || has('injury') || has('groin')) { e.runEasyOnly = true; e.runVolume = Math.min(e.runVolume ?? 1, 0.8); }
  if (has('achilles') || has('foot')) { e.runEasyOnly = true; e.runVolume = Math.min(e.runVolume ?? 1, 0.8); }
  if (has('shin')) { e.runEasyOnly = true; e.runVolume = Math.min(e.runVolume ?? 1, 0.7); }
  if (has('knee')) e.strengthKnee = true;
  if (has('back')) e.strengthBack = true;
  if (has('shoulder')) { e.strengthShoulder = true; e.swimVolume = 0.7; }
  if (has('noPool')) e.noSwim = true;
  if (has('noPoolWinter')) e.noSwimMonths = WINTER;
  if (has('poolDays')) { const d = list.filter(x => x.cats.includes('poolDays')).flatMap(x => dowsIn(x.text)); if (d.length) e.poolDays = [...new Set(d)]; }
  if (has('indoorBike')) e.bikeIndoor = true;
  if (has('noBikeWinter')) e.bikeIndoorMonths = WINTER;
  if (has('noBike')) e.noBike = true;
  if (has('heart') || has('asthma')) e.caution = true;
  if (has('gym')) e.gym = true;
  void allNotes;
  return e;
}
/* Kurzer Tipp für eine Einheit aus den Berücksichtigungen */
export function tipFor(sport: string, list: Consideration[]): string | null {
  const has = (c: ConsCat) => list.some(x => x.cats.includes(c));
  if (sport === 'run') {
    if (has('knee')) return 'Knie: weicher Untergrund, kurze Schritte, bei Schmerz über 2/10 abbrechen.';
    if (has('achilles')) return 'Achillessehne: flach laufen, keine Bergsprints, bei Schmerz abbrechen.';
    if (has('shin')) return 'Schienbein: weicher Untergrund, langsam steigern.';
    if (has('foot')) return 'Fuß: gute Schuhe, weicher Untergrund.';
    if (has('groin')) return 'Leiste: keine schnellen Richtungswechsel, bei Ziehen locker bleiben.';
  }
  if (sport === 'swim' && has('shoulder')) return 'Schulter: ruhige Züge, keine Paddles, bei Schmerz Beinschlag statt Armzug.';
  if (sport === 'strength' && has('back')) return 'Rücken: Bauch anspannen, keine schweren Hebeübungen.';
  if (has('asthma')) return 'Asthma: lange aufwärmen, Spray griffbereit.';
  return null;
}
