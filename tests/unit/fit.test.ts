import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { parseFit, decodeFitMessages } from '../../shared/activity/fit';
import { parseGpx, parseTcx, parseActivityFile } from '../../shared/activity/xml';
import { analyze } from '../../shared/activity/analyze';
import { swimFit, intervalFit, steadyFit } from '../helpers/fit-encode';

const fixture = (f: string) => fs.readFileSync('fixtures/fit/' + f);

describe('Echte .fit-Dateien', () => {
  test('Fenix 5 Lauf stimmt mit den Referenzwerten überein', () => {
    const a = parseFit(fixture('garmin-fenix-5-run.fit'));
    const csv = fs.readFileSync('fixtures/fit/garmin-fenix-5-run-records.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
    expect(a.sport).toBe('run');
    expect(a.records.length).toBe(csv.length);
    csv.forEach((row, i) => {
      expect(a.records[i].hr).toBe(+row[1]);
      expect(a.records[i].dist).toBeCloseTo(+row[4], 1);
      expect(a.records[i].alt).toBeCloseTo(+row[7], 1);
    });
  });
  test('Edge 820 Rad stimmt mit den Referenzwerten überein', () => {
    const a = parseFit(fixture('garmin-edge-820-bike.fit'));
    const csv = fs.readFileSync('fixtures/fit/garmin-edge-820-bike-records.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
    expect(a.sport).toBe('bike');
    csv.forEach((row, i) => { expect(a.records[i].hr).toBe(+row[1]); expect(a.records[i].speed).toBeCloseTo(+row[3], 2); });
  });
  test('Rollentrainer mit Leistung, Komprimierte Zeitstempel, COROS, Multisport', () => {
    const t = parseFit(fixture('sample-activity-indoor-trainer.fit'));
    expect(t.totals.avgPower).toBe(201);
    expect(analyze(t, { source: 'file' }).avgPower).toBe(201);
    const c = parseFit(fixture('compressed-speed-distance.fit'));
    expect(c.records.length).toBeGreaterThan(700);
    expect(c.records.every((r, i) => i === 0 || r.t >= c.records[i - 1].t)).toBe(true);
    const co = parseFit(fixture('coros-pace-2-cycling-misaligned-fields.fit'));
    expect(co.sport).toBe('bike'); expect(Math.round(co.totals.distanceM! / 1000)).toBe(32);
    const m = parseFit(fixture('activity-large-fenxi2-multisport.fit'));
    expect(m.sport).toBe('multi'); expect(m.sessions!.length).toBeGreaterThan(1);
    expect(m.records[0].t).toBeGreaterThanOrEqual(0);
  });
  test('Lauf-Auswertung: Zonen, Effizienz, Entkopplung', () => {
    const a = analyze(parseFit(fixture('activity-small-fenix2-run.fit')), { source: 'file', lthr: { run: 175 } });
    expect(a.km).toBeCloseTo(9.01, 1);
    expect(a.hrZones!.reduce((x, y) => x + y, 0)).toBeGreaterThan(2000);
    expect(a.efficiency).toBeGreaterThan(0.5);
    expect(a.decouplingPct).not.toBeNull();
  });
  test('keine FIT-Datei wird sauber abgelehnt', () => {
    expect(() => decodeFitMessages(new TextEncoder().encode('hallo welt, das ist nichts'))).toThrow();
  });
});

describe('Erzeugte Dateien', () => {
  test('Schwimmen: Bahnen, Züge pro Bahn, Meter pro Zug, Pace, längste Strecke am Stück', () => {
    const buf = swimFit('2026-10-14T15:00:00Z', [
      { lengths: 8, secPerLength: 30, strokes: 20, restSec: 30 },
      { lengths: 16, secPerLength: 28, strokes: 18, restSec: 60 },
      { lengths: 4, secPerLength: 35, strokes: 22, restSec: 0 }
    ]);
    const a = analyze(parseFit(buf), { source: 'healthfit' });
    expect(a.sport).toBe('swim');
    expect(a.km).toBeCloseTo(0.7, 2);
    expect(a.swim!.activeLengths).toBe(28);
    expect(a.swim!.poolLengthM).toBe(25);
    expect(a.swim!.longestContinuousM).toBe(400);
    expect(a.swim!.strokesPerLength).toBeCloseTo((8 * 20 + 16 * 18 + 4 * 22) / 28, 1);
    expect(a.swim!.metersPerStroke).toBeCloseTo(25 / a.swim!.strokesPerLength!, 2);
    expect(a.swim!.pace100).toBe(Math.round((8 * 30 + 16 * 28 + 4 * 35) / 7));
    expect(a.indoor).toBe(true);
  });
  test('Intervalle: Anzahl, Puls-Drift, Tempoabfall, Erholung in den Pausen', () => {
    const reps = [0, 1, 2, 3, 4].map(i => ({ sec: 180, speed: 4.2 - i * 0.03, hr: 165 + i * 2, restSec: 90, restHr: 128 + i }));
    const a = analyze(parseFit(intervalFit('2026-10-14T16:00:00Z', 'run', { warm: 600, reps, cool: 300, easySpeed: 2.9, easyHr: 140 })), { source: 'healthfit' });
    expect(a.intervals!.count).toBe(5);
    expect(a.intervals!.hrDriftPct).toBeCloseTo((173 / 165 - 1) * 100, 0);
    expect(a.intervals!.dropPct).toBeCloseTo((1 - 4.08 / 4.2) * 100, 0);
    expect(a.intervals!.recoveryHrDrop).toBeGreaterThan(35);
    expect(a.laps.filter(l => l.kind === 'rest')).toHaveLength(5);
  });
  test('Aerobe Entkopplung bei Pulsanstieg in der 2. Hälfte', () => {
    const a = analyze(parseFit(steadyFit('2026-10-14T08:00:00Z', 'run', 70, 3.0, 145, 154, 26)), { source: 'file' });
    expect(a.decouplingPct).toBeCloseTo((1 - 145 / 154) * 100, 0);
    expect(a.tempC).toBe(26);
    expect(a.paceSecKm).toBe(333);
  });
});

describe('GPX und TCX', () => {
  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="Test" xmlns:gpxtpx="x"><trk><name>Abendlauf &amp; Hund</name><type>running</type><trkseg>
    ${Array.from({ length: 61 }, (_, i) => `<trkpt lat="${(52.5 + i * 0.0001).toFixed(6)}" lon="13.4"><ele>${30 + (i % 5)}</ele><time>2026-10-14T17:00:${String(i % 60).padStart(2, '0')}Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + (i % 3)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).slice(0, 60).join('\n')}
    </trkseg></trk></gpx>`;
  test('GPX: Strecke, Puls, Name, Sportart', () => {
    const a = parseGpx(gpx);
    expect(a.sport).toBe('run'); expect(a.name).toBe('Abendlauf & Hund');
    expect(a.totals.distanceM).toBeCloseTo(59 * 11.12, -1);
    expect(a.totals.avgHr).toBe(141);
  });
  test('TCX: Runden, Kalorien, Distanz', () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Biking"><Id>2026-10-14T10:00:00Z</Id>
      <Lap StartTime="2026-10-14T10:00:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters><Calories>120</Calories><AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm><Track>
      <Trackpoint><Time>2026-10-14T10:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint>
      <Trackpoint><Time>2026-10-14T10:10:00Z</Time><DistanceMeters>5000</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint></Track></Lap>
      <Lap StartTime="2026-10-14T10:10:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>5500</DistanceMeters><Calories>140</Calories><Track>
      <Trackpoint><Time>2026-10-14T10:20:00Z</Time><DistanceMeters>10500</DistanceMeters></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const a = parseTcx(tcx);
    expect(a.sport).toBe('bike'); expect(a.laps).toHaveLength(2);
    expect(a.totals.kcal).toBe(260); expect(a.totals.distanceM).toBe(10500);
    expect(parseActivityFile('x.tcx', new TextEncoder().encode(tcx), parseFit).sport).toBe('bike');
  });
});
