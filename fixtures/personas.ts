/* Zehn erfundene Test-Personen (Auftrag 4, Nr. 6 aus Auftrag 5, vier neue aus Auftrag 9): Antworten auf den kompletten Fragebogen.
   Keine echten Personen, keine echten Daten. Stichtag der Tests: 2026-10-14 (Mittwoch). */
export const PERSONA_TODAY = '2026-10-14';
const ALL = { 0: 3, 1: 1, 2: 2, 3: 2, 4: 2, 5: 1, 6: 3 };

export const PERSONAS: { id: string; label: string; answers: Record<string, any> }[] = [
  {
    id: 'jugend-langdistanz', label: '17, Triathlon-Langdistanz-Ziel, Fußball Mo/Fr, Kraul-Anfänger',
    answers: {
      goals: [{ id: 'g-ld', type: 'tri_long', name: 'Langdistanz', date: '2028-07-16', priority: 'A' }, { id: 'g-sprint', type: 'tri_sprint', name: 'Stadt-Sprint', date: '2026-11-08', priority: 'C' }],
      why: 'Einmal die lange Distanz finishen', birthYear: 2009, sex: 'm', heightCm: 180, weightKg: 68, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 2, weeklyHoursNow: 6,
      swimCrawl: 'some', swimCrawlM: 50, swimBreast: true, runContinuousMin: 60, bikeLongestMin: 120, bikes: ['road', 'trainer'], powerMeter: false,
      teamYes: true, teamName: 'Fußball', teamTrainingDays: [1, 5], teamTrainingMinutes: 90, teamGameDays: [6], teamGameMinutes: 80,
      dayLoad: { 0: 3, 1: 1, 2: 2, 3: 2, 4: 2, 5: 1, 6: 2 }, timeOfDay: 'evening', weeklyHours: 9, maxDayHours: 3,
      freq: { swim: [2, 2], bike: [2, 2], run: [2, 3], strength: [1, 1] },
      notes: ['Schwimmbad nur Di, Mi und So'], wantTests: true
    }
  },
  {
    id: 'vater-rad-lauf', label: 'ca. 50, Rad und Laufen, kann nicht kraulen, kein Teamsport, Kraft 2×, Gravelbike',
    answers: {
      goals: [{ id: 'g-rtf', type: 'bike_event', name: 'Radmarathon 150 km', date: '2027-03-21', priority: 'A', timeMode: 'total', targetTime: '6:30' }, { id: 'g-10', type: 'run_10k', name: 'Silvesterlauf 10 km', date: '2026-12-31', priority: 'C' }],
      birthYear: 1976, sex: 'm', heightCm: 182, weightKg: 84, injuries: 'keine', medical: false,
      sports: ['bike', 'run', 'strength'], experienceYears: 4, weeklyHoursNow: 5,
      swimCrawl: 'no', swimBreast: true, runContinuousMin: 40, bikeLongestMin: 150, bikes: ['gravel'], powerMeter: false,
      teamYes: false,
      dayLoad: { 0: 3, 1: 0, 2: 2, 3: 1, 4: 2, 5: 0, 6: 3 }, timeOfDay: 'morning', weeklyHours: 7, maxDayHours: 3.5,
      freq: { bike: [2, 3], run: [2, 2], strength: [2, 2] },
      notes: ['Knie links zwickt beim Bergablaufen'], wantTests: false
    }
  },
  {
    id: 'laeuferin-hm', label: 'nur Laufen, Halbmarathon in 10 Wochen plus 10 km in 4 Wochen',
    answers: {
      goals: [{ id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: '2026-12-20', priority: 'A', targetTime: '1:55:00' }, { id: 'g-10k', type: 'run_10k', name: '10-km-Rennen', date: '2026-11-14', priority: 'B', targetTime: '0:52:00' }],
      birthYear: 1992, sex: 'f', heightCm: 168, weightKg: 58, injuries: 'keine', medical: false,
      sports: ['run'], experienceYears: 5, weeklyHoursNow: 4, bests: { run10k: '0:54:30' }, runContinuousMin: 100,
      teamYes: false,
      dayLoad: { 0: 3, 1: 1, 2: 2, 3: 1, 4: 2, 5: 0, 6: 1 }, timeOfDay: '', weeklyHours: 5, maxDayHours: 2.5,
      freq: { run: [4, 4] }, notes: [], wantTests: false
    }
  },
  {
    id: 'einsteiger-sprint', label: 'Sprint-Triathlon in 6 Monaten, 4 h pro Woche, nur Brust',
    answers: {
      goals: [{ id: 'g-st', type: 'tri_sprint', name: 'Erster Sprint-Triathlon', date: '2027-04-18', priority: 'A' }],
      birthYear: 1988, sex: 'f', heightCm: 170, weightKg: 72, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run'], experienceYears: 0, weeklyHoursNow: 2,
      swimCrawl: 'no', swimBreast: true, runContinuousMin: 15, bikeLongestMin: 60, bikes: ['trekking'],
      teamYes: false,
      dayLoad: { 0: 2, 1: 0, 2: 1, 3: 0, 4: 1, 5: 0, 6: 2 }, weeklyHours: 4, maxDayHours: 1.5,
      freq: { swim: [1, 2], bike: [1, 2], run: [2, 2] }, notes: ['kein Schwimmbad im Winter'], wantTests: false
    }
  },
  {
    id: 'erfahren-md-marathon', label: 'Mitteldistanz und Marathon im selben Jahr, Wattmessung, 10 h pro Woche',
    answers: {
      goals: [{ id: 'g-md', type: 'tri_middle', name: 'Mitteldistanz', date: '2027-06-27', priority: 'A', timeMode: 'split', splits: { swim: 2100, bike: 9600, run: 6300 } }, { id: 'g-m', type: 'run_marathon', name: 'Frühjahrsmarathon', date: '2027-04-11', priority: 'B', targetTime: '3:20:00' }],
      birthYear: 1985, sex: 'm', heightCm: 178, weightKg: 72, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 10, weeklyHoursNow: 9, bests: { run10k: '0:41:00', swim400: '6:40' },
      swimCrawl: 'yes', swimCrawlM: 2000, runContinuousMin: 150, bikeLongestMin: 300, bikes: ['road', 'tt', 'trainer'], powerMeter: true,
      teamYes: false,
      dayLoad: ALL, timeOfDay: 'morning', weeklyHours: 10, maxDayHours: 4,
      freq: { swim: [2, 3], bike: [3, 3], run: [3, 4], strength: [1, 1] }, notes: ['Laufband im Keller'], wantTests: false
    }
  },
  {
    id: 'vater-regeln', label: 'Vater-Profil mit Regeln: Laufen nur Sa/So, mittwochs nie, Schwimmbad nur donnerstags, dienstags gar nichts',
    answers: {
      goals: [{ id: 'g-oly', type: 'tri_olympic', name: 'Olympische Distanz', date: '2027-06-20', priority: 'A' }],
      birthYear: 1975, sex: 'm', heightCm: 181, weightKg: 82, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 3, weeklyHoursNow: 5,
      swimCrawl: 'yes', swimCrawlM: 400, runContinuousMin: 60, bikeLongestMin: 120, bikes: ['gravel', 'trainer'], powerMeter: false,
      teamYes: false,
      dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 3 }, timeOfDay: 'morning', weeklyHours: 7, maxDayHours: 3,
      freq: { swim: [1, 2], bike: [2, 2], run: [3, 3], strength: [1, 1] },
      notes: ['kann mittwochs nicht laufen, nur Samstag oder Sonntag', 'Schwimmbad nur donnerstags', 'dienstags gar nichts'], wantTests: false
    }
  },
  {
    id: 'marathon-anfaenger', label: 'Marathon-Anfänger: erster Marathon in einem Jahr, läuft erst 20 min am Stück',
    answers: {
      goals: [{ id: 'g-mar', type: 'run_marathon', name: 'Erster Marathon', date: '2027-10-10', priority: 'A' }, { id: 'g-hm2', type: 'run_half', name: 'Halbmarathon', date: null, priority: 'B' }],
      birthYear: 1994, sex: 'm', heightCm: 182, weightKg: 86, injuries: 'keine', medical: false,
      sports: ['run', 'strength'], experienceYears: 0, weeklyHoursNow: 2.5, runContinuousMin: 20,
      teamYes: false,
      dayLoad: { 0: 3, 1: 1, 2: 2, 3: 0, 4: 2, 5: 0, 6: 2 }, timeOfDay: 'evening', weeklyHours: 6, maxDayHours: 3,
      freq: { run: [3, 4], strength: [1, 1] }, notes: [], wantTests: false
    }
  },
  {
    id: 'rad-event', label: 'Rad-Event 180 km in den Alpen, Wattmessung, Rolle im Winter',
    answers: {
      goals: [{ id: 'g-rad', type: 'bike_event', name: 'Alpen-Radmarathon 180 km', date: '2027-07-04', priority: 'A', legs: [{ sport: 'bike', km: 180 }] }],
      birthYear: 1980, sex: 'f', heightCm: 172, weightKg: 63, injuries: 'keine', medical: false,
      sports: ['bike', 'strength'], experienceYears: 6, weeklyHoursNow: 7, bikeLongestMin: 240, bikes: ['road', 'trainer'], powerMeter: true,
      teamYes: false,
      dayLoad: { 0: 3, 1: 0, 2: 2, 3: 2, 4: 2, 5: 0, 6: 3 }, timeOfDay: 'evening', weeklyHours: 10, maxDayHours: 6,
      freq: { bike: [4, 4], strength: [1, 2] }, notes: [], wantTests: false
    }
  },
  {
    id: 'olympisch-erfahren', label: 'Olympisch-Erfahrene: Olympische Distanz (A), Sprint (B) und 10 km (C), Wattmessung',
    answers: {
      goals: [{ id: 'g-ol', type: 'tri_olympic', name: 'Olympische Distanz', date: '2027-07-11', priority: 'A', targetTime: '2:25:00' }, { id: 'g-sp', type: 'tri_sprint', name: 'Sprint-Triathlon', date: '2027-06-06', priority: 'B' }, { id: 'g-10', type: 'run_10k', name: 'Stadtlauf 10 km', date: '2027-04-18', priority: 'C' }],
      birthYear: 1990, sex: 'f', heightCm: 166, weightKg: 57, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 6, weeklyHoursNow: 8, bests: { run10k: '0:44:00', swim400: '7:10' },
      swimCrawl: 'yes', swimCrawlM: 1500, runContinuousMin: 100, bikeLongestMin: 180, bikes: ['road', 'trainer'], powerMeter: true,
      teamYes: false,
      dayLoad: ALL, timeOfDay: 'morning', weeklyHours: 10, maxDayHours: 3.5,
      freq: { swim: [2, 3], bike: [2, 3], run: [3, 3], strength: [1, 1] }, notes: [], wantTests: false
    }
  },
  {
    id: 'langdistanz-profi', label: 'Langdistanz-Profi: Ironman in 10 Monaten, Mitteldistanz ohne Datum, 15 h pro Woche',
    answers: {
      goals: [{ id: 'g-im', type: 'tri_long', name: 'Ironman', date: '2027-08-29', priority: 'A', targetTime: '9:45:00' }, { id: 'g-70', type: 'tri_middle', name: 'Mitteldistanz', date: null, priority: 'B' }],
      birthYear: 1990, sex: 'm', heightCm: 180, weightKg: 70, injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 12, weeklyHoursNow: 15, bests: { run10k: '0:35:30', swim400: '5:30' },
      swimCrawl: 'yes', swimCrawlM: 4000, runContinuousMin: 180, bikeLongestMin: 360, bikes: ['road', 'tt', 'trainer'], powerMeter: true,
      teamYes: false,
      dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 }, timeOfDay: 'morning', weeklyHours: 20, maxDayHours: 7,
      freq: { swim: [3, 3], bike: [3, 4], run: [3, 4], strength: [1, 1] }, notes: [], wantTests: false
    }
  }
];
