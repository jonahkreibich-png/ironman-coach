// Nachgemachter intervals.icu-Server mit erfundenen Daten für lokale Tests (Port 8799).
import http from 'node:http';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const yday = new Date(today + 'T12:00:00Z'); yday.setUTCDate(yday.getUTCDate() - 1);
const y = yday.toISOString().slice(0, 10);
export const FIXTURE = {
  wellness: [
    { id: y, ctl: 40.24, atl: 45.61, restingHR: 51, hrv: 74.4, sleepSecs: 30600, sleepScore: 82, spO2: 97.2, respiration: 14.6, OuraTempDeviation: 0.12, OuraRemSecs: 5400, tempWeight: false },
    { id: today, ctl: 40.8, atl: 47.2, restingHR: 53, hrv: 66, sleepSecs: 26100, sleepQuality: 2, spO2: 96.8, respiration: 15.1 }
  ],
  activities: [
    { id: 'i1001', start_date_local: today + 'T07:10:00', type: 'Ride', name: 'Morgenrunde', moving_time: 3600, distance: 27500, average_heartrate: 141.4, average_speed: 7.64, icu_training_load: 58, icu_rpe: 6 },
    { id: 'i1002', start_date_local: today + 'T16:00:00', type: 'Run', name: 'Lockerer Lauf', moving_time: 1800, distance: 5000, average_heartrate: 150, icu_training_load: 35 },
    { id: 'i1003', start_date_local: today + 'T18:30:00', type: 'Walk', name: 'Spaziergang', moving_time: 1200, distance: 1800 }
  ]
};
let lastAuth = null;
http.createServer((req, res) => {
  lastAuth = req.headers.authorization || null;
  const ok = lastAuth === 'Basic ' + Buffer.from('API_KEY:test-key').toString('base64');
  if (!ok) { res.writeHead(401); return res.end('{}'); }
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (/\/wellness$/.test(u.pathname)) return res.end(JSON.stringify(FIXTURE.wellness));
  if (/\/activities$/.test(u.pathname)) return res.end(JSON.stringify(FIXTURE.activities));
  res.end('[]');
}).listen(8799, () => console.log('mock intervals on 8799, heute ' + today));
