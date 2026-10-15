/* Auftrag 11, Punkt 7: fünf sehr unterschiedliche neue Nutzer für den Rundum-Check (Fragebogen → erster Plan → erste Woche → Coach). */
export const NEWUSER_TODAY = '2026-10-15';
export interface NewUser { id: string; label: string; answers: Record<string, any> }
export const NEW_USERS: NewUser[] = [
  { id: 'anfaenger-ohne-kraul', label: 'Anfängerin, 34, Sprint-Triathlon, kann nicht kraulen (nur Brust), läuft 10 min am Stück',
    answers: { goals: [{ id: 'g-a', type: 'tri_sprint', name: 'Erster Sprint', date: '2027-07-04', priority: 'A', timeMode: 'total' }], birthYear: 1992, sex: 'f', injuries: 'keine', medical: false,
      sports: ['swim', 'bike', 'run'], experienceYears: 0, weeklyHoursNow: 'unknown', swimCrawl: 'no', swimBreast: true, poolM: '25', openWater: false, runContinuousMin: 10, bikeLongestMin: 45, bikes: ['trekking'], powerMeter: false,
      teamYes: false, dayLoad: { 1: 1, 2: 0, 3: 2, 4: 0, 5: 1, 6: 2, 0: 2 }, notes: [], wantTests: true } },
  { id: 'laeufer-ohne-rad', label: 'Läufer, 28, Halbmarathon in 1:45, kein Rad, Kraft 1×',
    answers: { goals: [{ id: 'g-l', type: 'run_half', name: 'Halbmarathon', date: '2027-04-11', priority: 'A', targetTime: 6300, timeMode: 'total' }], birthYear: 1998, sex: 'm', injuries: 'keine', medical: false,
      sports: ['run', 'strength'], experienceYears: 4, weeklyHoursNow: 4.5, runContinuousMin: 90, bests: { run10k: 2880 },
      teamYes: false, dayLoad: { 1: 2, 2: 2, 3: 1, 4: 2, 5: 0, 6: 3, 0: 3 }, freq: { run: [4, 4], strength: [1, 1] }, notes: [], wantTests: true } },
  { id: 'teamsport-ohne-spiele', label: 'Volleyballerin, 22, Training Di/Do ohne Spiele, 10-km-Lauf, etwas Rad',
    answers: { goals: [{ id: 'g-t', type: 'run_10k', name: 'Stadtlauf', date: '2027-05-16', priority: 'A', timeMode: 'total' }], birthYear: 2004, sex: 'f', injuries: 'keine', medical: false,
      sports: ['run', 'bike', 'strength'], experienceYears: 1, weeklyHoursNow: 3, runContinuousMin: 35, bikeLongestMin: 60, bikes: ['road'], powerMeter: false,
      teamYes: true, teamName: 'Volleyball', teamTrainingDays: [2, 4], teamTrainingMinutes: 120, teamGames: false,
      dayLoad: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 1, 6: 3, 0: 2 }, notes: [], wantTests: false } },
  { id: 'fuenfzig-wenig-zeit', label: 'Mann, 50, wenig Zeit (3 Tage, 4 h), Olympischer Triathlon, krault 100 m',
    answers: { goals: [{ id: 'g-f', type: 'tri_olympic', name: 'Olympisch', date: '2027-08-22', priority: 'A', timeMode: 'total' }], birthYear: 1976, sex: 'm', injuries: 'Rücken manchmal steif', medical: false,
      sports: ['swim', 'bike', 'run'], experienceYears: 2, weeklyHoursNow: 3, swimCrawl: 'yes', swimCrawlM: 100, poolM: '25', openWater: false, runContinuousMin: 45, bikeLongestMin: 90, bikes: ['road', 'trainer'], powerMeter: false,
      teamYes: false, dayLoad: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 0, 6: 3, 0: 0 }, maxDayHours: 2, notes: [], wantTests: true } },
  { id: 'triathlet-50m-freiwasser', label: 'Erfahrene Triathletin, 38, Mitteldistanz, 50-m-Becken, Freiwasser Mai bis September',
    answers: { goals: [{ id: 'g-m', type: 'tri_middle', name: 'Mitteldistanz', date: '2027-06-27', priority: 'A', targetTime: 18900, timeMode: 'total' }, { id: 'g-o', type: 'tri_olympic', name: 'Olympisch', date: '2027-05-30', priority: 'B', timeMode: 'total' }],
      birthYear: 1988, sex: 'f', injuries: 'keine', medical: false, sports: ['swim', 'bike', 'run', 'strength'], experienceYears: 8, weeklyHoursNow: 9,
      swimCrawl: 'yes', swimCrawlM: 3000, poolM: '50', openWater: true, openWaterFrom: '5', openWaterTo: '9', runContinuousMin: 120, bikeLongestMin: 240, bikes: ['road', 'tt', 'trainer'], powerMeter: true, bests: { run10k: 2580, swim400: 380 },
      teamYes: false, dayLoad: { 1: 1, 2: 2, 3: 2, 4: 2, 5: 1, 6: 3, 0: 3 }, maxDayHours: 4, notes: ['Schwimmbad nur Di, Do und Sa'], wantTests: false } }
];
