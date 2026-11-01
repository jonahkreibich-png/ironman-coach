/* Erfundener Demo-Datensatz für Tests, Screenshots und die Test-Umgebung.
   Enthält keine echten Personendaten. Alle Daten liegen relativ zu `today`. */

function addDays(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow(s) { return new Date(s + 'T12:00:00Z').getUTCDay(); }
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
// Kleiner deterministischer Zufall, damit Tests immer gleiche Werte sehen
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const LADDER = ['3×6', '3×8', '3×10', '2×15', '2×20', '2×20', '3×10', '2×15'];

function weekSessions(w, mon, recovery) {
  const f = recovery ? 0.7 : 1 + Math.min(w, 4) * 0.04;
  const m = x => Math.round(x * f / 5) * 5;
  const d = i => addDays(mon, i);
  const id = (i, k) => `w${w + 1}-${DOW[dow(d(i))].toLowerCase()}-${k}`;
  return [
    [{ id: id(0, 'team'), sport: 'football', title: 'Teamtraining', time: '18:00', plannedMinutes: 90, description: 'Training mit der Mannschaft.' }],
    [{ id: id(1, 'run'), sport: 'run', title: 'Lockerer Lauf vor der Schule 6:15', plannedMinutes: m(35), plannedKm: Math.round(m(35) / 6.3 * 10) / 10, zone: 'Zone 2', description: 'Ganz locker, Nasenatmung möglich.' }],
    [{ id: id(2, 'swim'), sport: 'swim', title: 'Schwimmen Technik', time: '17:00', plannedMinutes: m(45), plannedKm: 1.6, zone: 'Zone 2', description: '400 ein, 8×50 Technik, 4×100 locker, 200 aus.' },
     { id: id(2, 'kraft'), sport: 'strength', title: 'Kraft und Stabi', plannedMinutes: 25, description: 'Rumpf, Hüfte, Adduktoren.' }],
    [{ id: id(3, 'bike'), sport: 'bike', title: `Rad Sweet Spot ${LADDER[w] || '3×8'}`, time: '17:30', plannedMinutes: m(60), zone: 'Zone 3-4', description: 'Einfahren 15 min, Sweet-Spot-Intervalle, ausfahren.' }],
    [{ id: id(4, 'team'), sport: 'football', title: w % 2 ? 'Spiel' : 'Teamtraining', time: '18:30', plannedMinutes: w % 2 ? 60 : 90, description: w % 2 ? 'Punktspiel.' : 'Training mit der Mannschaft.' }],
    [{ id: id(5, 'bike'), sport: 'bike', title: 'Lange Ausfahrt', time: '10:00', plannedMinutes: m(120), plannedKm: Math.round(m(120) / 60 * 26), zone: 'Zone 2', description: 'Gleichmäßig, Verpflegung mitnehmen.' }],
    [{ id: id(6, 'run'), sport: 'run', title: 'Langer Lauf', time: '09:30', plannedMinutes: m(70), plannedKm: Math.round(m(70) / 6.2 * 10) / 10, zone: 'Zone 2', description: 'Locker und gleichmäßig.' }]
  ];
}

/* opts (Auftrag 26, Kaltstart-Test mit großen Datenmengen): pastWeeks = Wochen vor der aktuellen (Standard 3), trendDays = Tage mit Morgenwerten (40).
   Mit den Standardwerten entsteht genau der bisherige Datensatz. */
export function makeDemo(today, opts = {}) {
  const pastWeeks = opts.pastWeeks ?? 3, trendDays = opts.trendDays ?? 40;
  const r = rng(42);
  const todayDow = (dow(today) + 6) % 7; // Mo = 0
  const thisMon = addDays(today, -todayDow);
  const start = addDays(thisMon, -7 * pastWeeks); // Block begann vor 3 Wochen (Standard)
  const weeks = [];
  for (let w = 0; w < pastWeeks + 5; w++) {
    const mon = addDays(start, w * 7);
    const recovery = w % 4 === 3;
    const sess = weekSessions(w, mon, recovery);
    weeks.push({
      weekNumber: w + 1, label: 'Woche ' + (w + 1), startDate: mon, endDate: addDays(mon, 6), isRecoveryWeek: recovery,
      focus: recovery ? 'Erholung, Umfang runter' : w < 3 ? 'Grundlage aufbauen' : 'Grundlage plus Sweet Spot',
      days: sess.map((list, i) => ({ date: addDays(mon, i), dow: DOW[dow(addDays(mon, i))], sessions: list }))
    });
  }
  const calDate = addDays(start, 5);
  const plan = {
    meta: {
      event: 'Mitteldistanz', eventDate: addDays(today, 300), blockName: 'Block 1 · Grundlage', runIntervalsAllowed: false,
      scoreCalibration: { version: 1, date: calDate, scores: { swim: 31, bike: 44, run: 47, strength: 38 },
        notes: { swim: 'Schwimmen: Technik ausbaufähig, Ausdauer im Wasser kurz.', bike: 'Rad: solide Grundlage.', run: 'Laufen: gute Grundlage aus dem Teamsport.', strength: 'Kraft: regelmäßig, ohne Gewichte.' } }
    },
    weeks,
    keyDates: [{ date: addDays(today, 9), label: 'Schwellentest Rad' }, { date: addDays(today, 300), label: 'Mitteldistanz' }],
    zonePercents: [
      { zone: 1, label: 'Recovery', low: 0, high: 81 }, { zone: 2, label: 'Aerobic (Grundlage)', low: 81, high: 89 },
      { zone: 3, label: 'Tempo', low: 90, high: 93 }, { zone: 4, label: 'Schwelle', low: 94, high: 102 }, { zone: 5, label: 'VO2max/Anaerob', low: 102, high: 999 }
    ],
    seedMetrics: []
  };

  // Krankheit vor gut 2 Wochen, 3 Tage
  const illStart = addDays(today, -16), illEnd = addDays(today, -14);
  const illnessPeriods = [{ id: 'ill-demo-1', start: illStart, end: illEnd, note: 'Erkältung' }];
  const ill = d => d >= illStart && d <= illEnd;

  // Morgenwerte der letzten 40 Tage
  const trend = [];
  let ctl = 38, atl = 40;
  for (let i = trendDays; i >= 0; i--) {
    const d = addDays(today, -i);
    const sick = ill(d);
    ctl += (sick ? -0.6 : 0.25 + r() * 0.3); atl += (sick ? -3 : (r() - 0.45) * 6);
    const p = {
      date: d,
      hrv: Math.round((sick ? 48 : 70) + (r() - 0.5) * 14), restingHR: Math.round((sick ? 57 : 50) + (r() - 0.5) * 4),
      sleepHours: Math.round((sick ? 9.5 : 8.1 + (r() - 0.5) * 1.6) * 10) / 10, sleepQuality: Math.round(6 + r() * 3),
      bodyTemp: Math.round(((sick ? 0.6 : 0) + (r() - 0.5) * 0.3) * 100) / 100, breathingRate: Math.round((14 + r()) * 10) / 10,
      remSleep: Math.round(90 + r() * 40), deepSleep: Math.round(70 + r() * 40), sleepLatency: Math.round(5 + r() * 15), spo2: Math.round((96 + r() * 2) * 10) / 10,
      ctl: Math.round(ctl * 10) / 10, atl: Math.round(Math.max(10, atl) * 10) / 10, tsb: Math.round((ctl - Math.max(10, atl)) * 10) / 10,
      vo2max: i % 4 === 0 ? Math.round((54 + (trendDays - i) * 0.04 + (r() - 0.5)) * 10) / 10 : null,
      cardioRecovery: i % 4 === 0 ? Math.round(30 + r() * 6) : null, illness: sick ? 'Halskratzen, müde' : null
    };
    trend.push(p);
  }

  // Erledigte Einheiten bis gestern, ein paar ausgefallen
  const sessions = {};
  weeks.forEach(w => w.days.forEach(day => day.sessions.forEach(s => {
    if (day.date >= today) return;
    if (ill(day.date)) return;
    if (r() < 0.1) { sessions[s.id] = { completed: false, skipped: true, skipReason: 'Termin', notes: '' }; return; }
    const min = Math.round((s.plannedMinutes || 60) * (0.9 + r() * 0.2));
    const m = { min: String(min) };
    if (s.sport === 'run') { const pace = 375 - (r() * 20); const km = Math.round(min * 60 / pace * 100) / 100; Object.assign(m, { km: String(km), hr: String(Math.round(146 + r() * 8)), pace: Math.floor(pace / 60) + ':' + String(Math.round(pace % 60)).padStart(2, '0') }); }
    if (s.sport === 'bike') { const sp = 26 + r() * 3; Object.assign(m, { km: String(Math.round(sp * min / 60 * 10) / 10), hr: String(Math.round(138 + r() * 10)), speed: String(Math.round(sp * 10) / 10) }); }
    if (s.sport === 'swim') { const meters = 1400 + Math.round(r() * 4) * 100; const p100 = min * 60 / (meters / 100); Object.assign(m, { meters: String(meters), pace100: Math.floor(p100 / 60) + ':' + String(Math.round(p100 % 60)).padStart(2, '0'), spl: String(Math.round(21 - r() * 3)) }); }
    if (s.sport === 'football') Object.assign(m, { hr: String(Math.round(150 + r() * 10)) });
    sessions[s.id] = { completed: true, quality: r() < 0.6 ? 'good' : 'ok', rpe: String(Math.round(4 + r() * 4)), notes: '', metrics: m };
  })));
  // Eine vergessene Einheit vorgestern
  const vorgestern = weeks.flatMap(w => w.days).find(d => d.date === addDays(today, -2));
  if (vorgestern) vorgestern.sessions.forEach(s => { delete sessions[s.id]; });

  const nutrition = {};
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    if (i === 0) continue;
    nutrition[d] = { kcal: Math.round(2700 + r() * 600), carbs: Math.round(330 + r() * 80), protein: Math.round(120 + r() * 30), fat: Math.round(80 + r() * 20), weight: i % 3 === 0 ? Math.round((70 + r()) * 10) / 10 : null, typeOverride: null };
  }

  return {
    plan,
    sessions, trend, customWorkouts: {
      [addDays(today, -5)]: [{ id: 'custom-demo-1', sport: 'run', title: 'Spaziergang mit Hund', description: 'Locker', plannedMinutes: 40, plannedKm: 3.5, quality: 'ok' }]
    },
    openDays: {}, milestones: [{ id: 'ms-demo-1', date: addDays(today, -10), text: '400 m Kraul am Stück' }, { id: 'ms-demo-2', date: addDays(today, -25), text: 'Erste Ausfahrt über 2 Stunden' }],
    scoreAdjust: { swim: 0, bike: 0, run: 0, strength: 0 },
    settings: { lthrRun: 172, lthrBike: 164, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 29, readiness: { rhrMax: 56, hrvMin: 65, tempMax: 0.5 } },
    weekNotes: { 3: 'Gute Woche, Beine am Samstag schwer.' }, nutrition,
    nutritionProfile: { age: 25, heightCm: 178, weightKg: 70, pal: 1.5 },
    illnessPeriods, adjustments: {}, lastBackupAt: new Date(today + 'T08:00:00Z').toISOString(), scoreCalibVersion: 1,
    backupVersion: 2, exportedAt: new Date(today + 'T08:00:00Z').toISOString()
  };
}
