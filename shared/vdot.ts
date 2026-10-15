/* Laufleistung nach Daniels/Gilbert (VDOT) und Riegel. Eigene Datei, damit Scores und Prognose sie ohne Kreis-Import nutzen. */

/* VDOT aus Distanz (m) und Zeit (min) */
export function vdot(meters: number, minutes: number): number {
  const v = meters / minutes;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  return vo2 / pct;
}
/* Zeit (min) für eine Distanz bei gegebenem VDOT (Newton-Verfahren) */
export function timeForVdot(meters: number, target: number): number {
  let t = meters / 200; // Startwert
  for (let i = 0; i < 40; i++) {
    const f = vdot(meters, t) - target;
    const d = (vdot(meters, t + 0.01) - vdot(meters, t - 0.01)) / 0.02;
    if (!d) break;
    t -= f / d;
    if (Math.abs(f) < 1e-6) break;
  }
  return t;
}
/* VDOT aus der Schwellen-Geschwindigkeit (m/s): Tempo, das man etwa 60 min halten kann */
export function vdotFromThreshold(speedMs: number): number { return vdot(speedMs * 3600, 60); }
/* Riegel: T2 = T1 × (D2/D1)^Exponent (1,06 gut trainiert … 1,15 wenig lange Einheiten) */
export function riegel(t1: number, d1: number, d2: number, exp = 1.06) { return t1 * Math.pow(d2 / d1, exp); }
