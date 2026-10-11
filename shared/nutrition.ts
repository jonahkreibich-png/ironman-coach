/* Ernährung: Tagestyp, Bedarf, Vorschläge und Verpflegung im Wettkampf.
   Grundsatz: Die App hilft, GENUG zu essen. Sie zeigt nie ein Kalorien-Defizit und für Minderjährige keine Gewichtsziele. */

export type DayType = 'rest' | 'training' | 'hard' | 'race' | 'match' | 'sick';
export const NUTRI_TYPES: Record<DayType, { label: string; carbs: [number, number]; note: string }> = {
  rest: { label: 'Ruhetag', carbs: [4, 5], note: 'Kein Training: Basis decken, viel Gemüse und genug Protein.' },
  training: { label: 'Trainingstag', carbs: [5, 6], note: 'Normales Training: Kohlenhydrate rund um die Einheit legen.' },
  hard: { label: 'Langer/harter Tag', carbs: [6, 8], note: 'Lange oder harte Einheit: viel Kohlenhydrate. Bei Einheiten über 75 min unterwegs 30-60 g Kohlenhydrate pro Stunde.' },
  race: { label: 'Wettkampftag', carbs: [7, 10], note: 'Wettkampf: gewohntes Frühstück 3 h vorher, unterwegs nach Verpflegungsplan, danach Kohlenhydrate und Protein.' },
  match: { label: 'Spieltag', carbs: [6, 7], note: 'Spiel: 3-4 h vorher eine große Kohlenhydrat-Mahlzeit, danach schnell auffüllen.' },
  sick: { label: 'Krankheitstag', carbs: [4, 5], note: 'Krank: auch ohne Hunger regelmäßig kleine Portionen. Suppe, Reis, Toast, Banane, viel Tee und Wasser. Tracken ist optional.' }
};
export const NUTRI_SLOTS: Record<DayType, [string, number, string][]> = {
  rest: [['Frühstück', 28, 'breakfast'], ['Mittagessen', 32, 'main'], ['Abendessen', 30, 'main'], ['Snack', 10, 'snack']],
  training: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 28, 'main'], ['Abendessen', 27, 'main'], ['Snack', 10, 'snack'], ['Nach dem Training', 10, 'post']],
  hard: [['Frühstück', 22, 'breakfast'], ['Vor dem Training (1-2 h)', 8, 'pre'], ['Mittagessen', 22, 'main'], ['Nach dem Training', 13, 'post'], ['Abendessen', 25, 'main'], ['Snack', 10, 'snack']],
  race: [['Frühstück (3 h vorher)', 25, 'pre'], ['Vor dem Start', 8, 'pre'], ['Nach dem Wettkampf', 20, 'post'], ['Abendessen', 30, 'main'], ['Snack', 17, 'snack']],
  match: [['Frühstück', 22, 'breakfast'], ['Mittagessen (3-4 h vor dem Spiel)', 25, 'main'], ['Vor dem Spiel (1-1,5 h)', 8, 'pre'], ['Nach dem Spiel', 15, 'post'], ['Abendessen', 20, 'main'], ['Snack', 10, 'snack']],
  sick: [['Frühstück', 25, 'breakfast'], ['Mittagessen', 30, 'sick'], ['Abendessen', 30, 'sick'], ['Snack', 15, 'snack']]
};
export interface Meal { n: string; p: string; k: number; c: number; pr: number; f: number; veg?: boolean; vegan?: boolean }
export const MEALS: Record<string, Meal[]> = {
  breakfast: [
    { n: 'Haferbrei', p: '80 g Haferflocken, 300 ml Milch, 1 Banane, 15 g Nüsse', k: 630, c: 97, pr: 25, f: 18, veg: true },
    { n: 'Skyr-Müsli', p: '250 g Skyr, 60 g Müsli, 100 g Beeren, 10 g Honig', k: 450, c: 64, pr: 35, f: 5, veg: true },
    { n: 'Brot mit Rührei', p: '3 Scheiben Vollkornbrot, 3 Eier, Gemüse', k: 520, c: 57, pr: 30, f: 18, veg: true },
    { n: 'Haferbrei mit Sojamilch', p: '80 g Haferflocken, 300 ml Sojadrink, 1 Banane, 20 g Erdnussbutter', k: 640, c: 92, pr: 24, f: 20, veg: true, vegan: true }
  ],
  main: [
    { n: 'Reis mit Hähnchen', p: '100 g Reis (roh), 150 g Hähnchenbrust, 200 g Gemüse, 1 EL Öl', k: 665, c: 87, pr: 44, f: 13 },
    { n: 'Pasta mit Puten-Bolognese', p: '100 g Vollkornnudeln (roh), 150 g Putenhack, 150 g Tomatensauce, 15 g Parmesan', k: 635, c: 78, pr: 52, f: 11 },
    { n: 'Lachs mit Kartoffeln', p: '400 g Kartoffeln, 150 g Lachs, 200 g Brokkoli', k: 660, c: 74, pr: 44, f: 21 },
    { n: 'Linsen-Dal mit Reis', p: '100 g rote Linsen (roh), 60 g Reis (roh), 150 g Gemüse, 1 EL Öl', k: 695, c: 114, pr: 32, f: 13, veg: true, vegan: true },
    { n: 'Pasta mit Tofu-Bolognese', p: '100 g Vollkornnudeln (roh), 150 g Tofu, 150 g Tomatensauce, Gemüse', k: 640, c: 82, pr: 36, f: 17, veg: true, vegan: true }
  ],
  sick: [
    { n: 'Hühnersuppe mit Nudeln', p: '500 ml Brühe, 120 g Hähnchen, 60 g Nudeln (roh), Karotte, Sellerie', k: 480, c: 50, pr: 38, f: 10 },
    { n: 'Reis mit Rührei', p: '90 g Reis (roh), 2 Eier, etwas Butter', k: 500, c: 72, pr: 18, f: 15, veg: true },
    { n: 'Kartoffelbrei mit Quark', p: '350 g Kartoffeln, 100 ml Milch, 150 g Kräuterquark', k: 450, c: 60, pr: 22, f: 11, veg: true },
    { n: 'Gemüsesuppe mit Brot', p: '500 ml Gemüsebrühe, Kartoffeln, Karotten, 2 Scheiben Brot', k: 420, c: 70, pr: 12, f: 8, veg: true, vegan: true }
  ],
  snack: [
    { n: 'Banane mit Nüssen', p: '1 Banane, 30 g Nüsse', k: 285, c: 31, pr: 7, f: 16, veg: true, vegan: true },
    { n: 'Quark mit Obst', p: '250 g Magerquark, 150 g Obst', k: 250, c: 30, pr: 31, f: 1, veg: true },
    { n: 'Brot mit Erdnussbutter', p: '2 Scheiben Vollkornbrot, 20 g Erdnussbutter', k: 320, c: 40, pr: 12, f: 12, veg: true, vegan: true }
  ],
  pre: [
    { n: 'Toast mit Honig und Banane', p: '2 Scheiben Toast, 20 g Honig, 1 Banane', k: 330, c: 73, pr: 6, f: 2, veg: true },
    { n: 'Reiswaffeln mit Marmelade', p: '4 Reiswaffeln, 30 g Marmelade', k: 215, c: 48, pr: 3, f: 1, veg: true, vegan: true }
  ],
  post: [
    { n: 'Kakao mit Banane', p: '400 ml Milch, 20 g Kakaopulver, 1 Banane', k: 370, c: 63, pr: 15, f: 7, veg: true },
    { n: 'Skyr mit Haferflocken', p: '250 g Skyr, 40 g Haferflocken, 100 g Beeren', k: 350, c: 45, pr: 34, f: 4, veg: true },
    { n: 'Sojadrink mit Banane und Haferflocken', p: '400 ml Sojadrink, 1 Banane, 40 g Haferflocken', k: 420, c: 65, pr: 20, f: 9, veg: true, vegan: true }
  ]
};
export function mealsFor(cat: string, diet?: { vegetarian?: boolean; vegan?: boolean }): Meal[] {
  const list = MEALS[cat] || [];
  if (diet && diet.vegan) return list.filter(m => m.vegan);
  if (diet && diet.vegetarian) return list.filter(m => m.veg);
  return list;
}

export interface DaySession { sport: string; title: string; zone?: string; minutes: number; custom?: boolean; race?: boolean }
export function sessionMet(s: { sport: string; zone?: string; title?: string }): number {
  const intense = /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || ''));
  return ({ run: intense ? 11 : 9, bike: intense ? 9.5 : 7, swim: 6, strength: 4, football: 7.5 } as Record<string, number>)[s.sport] || 0;
}
/* Tagestyp aus dem eigenen Plan. Spieltag nur für Teamsportler (Auftrag 4 E1). */
export function classifyDay(sessions: DaySession[], ill: boolean, o: { team?: boolean } = {}): DayType {
  if (ill && !sessions.length) return 'sick';
  if (!sessions.length) return 'rest';
  if (sessions.some(s => s.race)) return 'race';
  if (o.team && sessions.some(s => s.sport === 'football' && /spiel|match/i.test(s.title || ''))) return 'match';
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const longest = Math.max(0, ...sessions.filter(s => s.sport !== 'strength').map(s => s.minutes));
  const intense = sessions.some(s => s.sport !== 'strength' && /sweet|schwelle|intervall|zone 4|zone 5/i.test((s.zone || '') + ' ' + (s.title || '')));
  return intense || longest >= 75 || total >= 150 ? 'hard' : 'training';
}
const r5 = (x: number) => Math.round(x / 5) * 5, r50 = (x: number) => Math.round(x / 50) * 50;
export interface Targets { weight: number; bmr: number; daily: number; act: number; tdee: number; type: DayType; typeAuto: DayType; overridden: boolean; kcal: [number, number]; carbs: [number, number]; protein: [number, number]; fat: [number, number]; actDetails: (DaySession & { kcal: number })[] }
/* Grundumsatz nach Mifflin-St Jeor × Alltagsfaktor + Training. Der Zielbereich beginnt beim Verbrauch, nie darunter. */
/* Tagestypen, die zu dieser Person passen (Auswahl im Essen-Bildschirm) */
export function dayTypesFor(o: { team: boolean; races: boolean }): DayType[] {
  return (['rest', 'training', 'hard', 'race', 'match', 'sick'] as DayType[]).filter(k => (k !== 'match' || o.team) && (k !== 'race' || o.races));
}
export function nutritionTargets(o: { age: number; heightCm: number; weightKg: number; pal: number; sex?: 'f' | 'm' | 'd' | null; sessions: DaySession[]; ill: boolean; override?: DayType | null; team?: boolean }): Targets {
  const w = o.weightKg;
  const bmr = 10 * w + 6.25 * o.heightCm - 5 * o.age + (o.sex === 'f' ? -161 : 5);
  const daily = bmr * o.pal;
  const actDetails = o.sessions.map(s => ({ ...s, kcal: Math.round((sessionMet(s) - 1) * w * s.minutes / 60) }));
  const act = actDetails.reduce((a, s) => a + s.kcal, 0);
  const tdee = daily + act;
  const typeAuto = classifyDay(o.sessions, o.ill, { team: o.team });
  const type = o.override && NUTRI_TYPES[o.override] ? o.override : typeAuto;
  const t = NUTRI_TYPES[type];
  return { weight: w, bmr, daily, act, tdee, type, typeAuto, overridden: !!(o.override && NUTRI_TYPES[o.override]), actDetails,
    kcal: [r50(tdee), r50(tdee * 1.1)], carbs: [r5(t.carbs[0] * w), r5(t.carbs[1] * w)], protein: [r5(1.6 * w), r5(2.0 * w)], fat: [r5(1.0 * w), r5(1.5 * w)] };
}
/* Mehrere Tage deutlich unter dem Bedarf → freundlicher Hinweis, bei Warnzeichen auch auf Hilfe */
export function underEatingCheck(days: { kcal: number | null; low: number }[], minor: boolean): { level: 0 | 1 | 2; text: string } {
  const logged = days.filter(d => d.kcal != null);
  const last3 = logged.slice(-3);
  const low = last3.length === 3 && last3.every(d => d.kcal! < d.low * 0.9);
  const veryLow = logged.slice(-5).filter(d => d.kcal! < d.low * 0.7).length >= 4;
  if (veryLow) return { level: 2, text: 'Du isst seit mehreren Tagen viel weniger, als dein Körper fürs Training braucht. Das ist auf Dauer riskant. Bitte sprich mit deinen Eltern, deinem Arzt oder einer Beratungsstelle (z. B. BZgA-Telefon zu Essstörungen 0221 892031), wenn Essen gerade schwierig ist.' + (minor ? ' Du kannst auch anonym bei der Nummer gegen Kummer anrufen: 116 111.' : '') };
  if (low) return { level: 1, text: 'An den letzten drei eingetragenen Tagen lagst du deutlich unter dem Zielbereich. Beim Training zählt genug Energie, vor allem Kohlenhydrate. Iss an den nächsten Tagen etwas mehr.' };
  return { level: 0, text: '' };
}

/* Verpflegung im Wettkampf: Kohlenhydrate pro Stunde, Trinkmenge und Zeitpunkte */
export interface FuelPlan { carbsPerHour: number; fluidMlPerHour: number; sodiumMgPerHour: number; schedule: { min: number; what: string }[]; before: string[]; notes: string[] }
export function raceFuelPlan(o: { durationMin: number; tempC?: number | null; weightKg: number; minor: boolean; sport: 'tri' | 'run' | 'bike' | 'swim' }): FuelPlan {
  const h = o.durationMin / 60;
  let carbs = h < 1.25 ? 0 : h < 2.5 ? 45 : 75;
  if (o.minor) carbs = Math.min(carbs, 60);
  const temp = o.tempC ?? 18;
  const fluid = Math.round(Math.min(900, Math.max(400, 5 * o.weightKg + (temp - 15) * 20)) / 50) * 50;
  const sodium = temp > 25 ? 700 : 500;
  const schedule: { min: number; what: string }[] = [];
  if (carbs) for (let m = 20; m < o.durationMin - 10; m += 20) schedule.push({ min: m, what: `${Math.round(carbs / 3)} g Kohlenhydrate (z. B. ${carbs / 3 >= 25 ? '1 Gel' : '½ Riegel'}) und ${Math.round(fluid / 3 / 50) * 50} ml trinken` });
  else for (let m = 20; m < o.durationMin - 5; m += 20) schedule.push({ min: m, what: `ein paar Schlucke Wasser (${Math.round(fluid / 3 / 50) * 50} ml)` });
  return {
    carbsPerHour: carbs, fluidMlPerHour: fluid, sodiumMgPerHour: sodium, schedule,
    before: ['Abend vorher: kohlenhydratreich und gewohnt essen (Nudeln, Reis), nichts Neues.', `3 h vor dem Start: Frühstück mit ${Math.round(o.weightKg * 2)} g Kohlenhydraten (z. B. Toast mit Honig, Banane).`, '30 min vorher: noch ein paar Schlucke Wasser, bei langen Rennen ein Gel.'],
    notes: [
      o.sport === 'tri' ? 'Auf dem Rad essen, beim Laufen eher trinken und Gels: der Magen verträgt im Sitzen mehr.' : 'An jeder Verpflegungsstelle ein paar Schlucke, nicht erst bei Durst.',
      temp > 25 ? 'Heiß: mehr trinken und Salz (Elektrolyt-Getränk), Kühlung über Schwamm oder Wasser über Kopf.' : 'Trinkmenge an Durst und Wetter anpassen, nicht mehr als 900 ml pro Stunde.',
      'Im Wettkampf nur Produkte, die du im Training getestet hast.'
    ]
  };
}
