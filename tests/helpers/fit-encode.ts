/* Minimaler FIT-Encoder für Tests: erzeugt gültige .fit-Dateien (mit CRC) für Schwimmen mit Bahnen und Intervalle. */
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}
type F = [num: number, type: number, size: number, value: number | null];
const W: Record<number, (dv: DataView, o: number, v: number) => void> = {
  0x00: (d, o, v) => d.setUint8(o, v), 0x02: (d, o, v) => d.setUint8(o, v), 0x01: (d, o, v) => d.setInt8(o, v),
  0x84: (d, o, v) => d.setUint16(o, v, true), 0x83: (d, o, v) => d.setInt16(o, v, true),
  0x86: (d, o, v) => d.setUint32(o, v, true), 0x85: (d, o, v) => d.setInt32(o, v, true)
};
const INVALID: Record<number, number> = { 0x00: 0xff, 0x02: 0xff, 0x01: 0x7f, 0x84: 0xffff, 0x83: 0x7fff, 0x86: 0xffffffff, 0x85: 0x7fffffff };

export class FitWriter {
  private out: number[] = [];
  private defs = new Map<string, number>();
  private nextLocal = 0;
  msg(global: number, fields: F[]) {
    const sig = global + ':' + fields.map(f => f[0] + '/' + f[1]).join(',');
    let local = this.defs.get(sig);
    if (local == null) {
      local = this.nextLocal++ % 16; this.defs.set(sig, local);
      this.out.push(0x40 | local, 0, 0, global & 0xff, (global >> 8) & 0xff, fields.length);
      fields.forEach(f => this.out.push(f[0], f[2], f[1]));
    }
    const buf = new DataView(new ArrayBuffer(1 + fields.reduce((a, f) => a + f[2], 0)));
    buf.setUint8(0, local);
    let o = 1;
    for (const [, type, size, v] of fields) { W[type](buf, o, v == null ? INVALID[type] : v); o += size; }
    for (let i = 0; i < buf.byteLength; i++) this.out.push(buf.getUint8(i));
  }
  bytes(): Uint8Array {
    const data = this.out;
    const header = [14, 0x20, 0x08, 0x08, data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, (data.length >>> 24) & 0xff, 0x2e, 0x46, 0x49, 0x54];
    const hcrc = crc16(header);
    const all = [...header, hcrc & 0xff, hcrc >> 8, ...data];
    const c = crc16(all);
    return new Uint8Array([...all, c & 0xff, c >> 8]);
  }
}
export const FIT_TS = (iso: string) => Math.round((Date.parse(iso) - Date.UTC(1989, 11, 31)) / 1000);

/* Schwimmen im 25-m-Becken: Bahnen mit Zügen, Pausen zwischen Serien */
export function swimFit(startIso: string, sets: { lengths: number; secPerLength: number; strokes: number; restSec: number }[]): Uint8Array {
  const w = new FitWriter(); const t0 = FIT_TS(startIso);
  w.msg(0, [[0, 0x00, 1, 4], [1, 0x84, 2, 255], [4, 0x86, 4, t0]]);
  let t = t0, total = 0, count = 0, active = 0;
  for (const s of sets) {
    for (let i = 0; i < s.lengths; i++) {
      w.msg(101, [[253, 0x86, 4, t + s.secPerLength], [2, 0x86, 4, t], [3, 0x86, 4, s.secPerLength * 1000], [4, 0x86, 4, s.secPerLength * 1000], [5, 0x84, 2, s.strokes], [7, 0x00, 1, 0], [9, 0x02, 1, Math.round(s.strokes / s.secPerLength * 60)], [12, 0x00, 1, 1]]);
      t += s.secPerLength; total += 25; count++; active += s.secPerLength;
    }
    if (s.restSec) { w.msg(101, [[253, 0x86, 4, t + s.restSec], [2, 0x86, 4, t], [3, 0x86, 4, s.restSec * 1000], [4, 0x86, 4, s.restSec * 1000], [5, 0x84, 2, null], [7, 0x00, 1, null], [9, 0x02, 1, null], [12, 0x00, 1, 0]]); t += s.restSec; count++; }
  }
  w.msg(18, [[253, 0x86, 4, t], [2, 0x86, 4, t0], [5, 0x00, 1, 5], [6, 0x00, 1, 17], [7, 0x86, 4, (t - t0) * 1000], [8, 0x86, 4, (t - t0) * 1000], [9, 0x86, 4, total * 100], [44, 0x84, 2, 2500]]);
  return w.bytes();
}

/* Lauf oder Rad mit Intervall-Runden: Einlaufen, n × (Belastung, Pause), Auslaufen. Messpunkte jede Sekunde. */
export function intervalFit(startIso: string, sport: 'run' | 'bike', opts: { warm: number; reps: { sec: number; speed: number; hr: number; restSec: number; restHr: number }[]; cool: number; easySpeed: number; easyHr: number; tempC?: number }): Uint8Array {
  const w = new FitWriter(); const t0 = FIT_TS(startIso);
  w.msg(0, [[0, 0x00, 1, 4], [1, 0x84, 2, 1], [4, 0x86, 4, t0]]);
  let t = t0, dist = 0;
  const lap = (sec: number, speed: number, hr: number, intensity: number) => {
    const st = t; const d0 = dist;
    for (let i = 0; i < sec; i++) {
      dist += speed;
      w.msg(20, [[253, 0x86, 4, t + i], [3, 0x02, 1, Math.round(hr + Math.sin(i / 7) * 2)], [5, 0x86, 4, Math.round(dist * 100)], [6, 0x84, 2, Math.round(speed * 1000)], [13, 0x01, 1, opts.tempC ?? 15]]);
    }
    t += sec;
    w.msg(19, [[253, 0x86, 4, t], [2, 0x86, 4, st], [7, 0x86, 4, sec * 1000], [8, 0x86, 4, sec * 1000], [9, 0x86, 4, Math.round((dist - d0) * 100)], [13, 0x84, 2, Math.round(speed * 1000)], [15, 0x02, 1, hr], [16, 0x02, 1, hr + 6], [23, 0x00, 1, intensity]]);
  };
  lap(opts.warm, opts.easySpeed, opts.easyHr, 2);
  for (const r of opts.reps) { lap(r.sec, r.speed, r.hr, 0); if (r.restSec) lap(r.restSec, opts.easySpeed * 0.6, r.restHr, 1); }
  lap(opts.cool, opts.easySpeed, opts.easyHr, 3);
  w.msg(18, [[253, 0x86, 4, t], [2, 0x86, 4, t0], [5, 0x00, 1, sport === 'run' ? 1 : 2], [6, 0x00, 1, 0], [7, 0x86, 4, (t - t0) * 1000], [8, 0x86, 4, (t - t0) * 1000], [9, 0x86, 4, Math.round(dist * 100)]]);
  return w.bytes();
}

/* Gleichmäßiger Dauerlauf/-fahrt mit Pulsanstieg in der 2. Hälfte (für Entkopplung) */
export function steadyFit(startIso: string, sport: 'run' | 'bike', min: number, speed: number, hr1: number, hr2: number, tempC = 15): Uint8Array {
  const w = new FitWriter(); const t0 = FIT_TS(startIso);
  w.msg(0, [[0, 0x00, 1, 4], [1, 0x84, 2, 1], [4, 0x86, 4, t0]]);
  let dist = 0; const sec = min * 60;
  for (let i = 0; i < sec; i++) {
    dist += speed;
    const hr = i < sec / 2 ? hr1 : hr2;
    w.msg(20, [[253, 0x86, 4, t0 + i], [3, 0x02, 1, hr], [5, 0x86, 4, Math.round(dist * 100)], [6, 0x84, 2, Math.round(speed * 1000)], [13, 0x01, 1, tempC]]);
  }
  w.msg(19, [[253, 0x86, 4, t0 + sec], [2, 0x86, 4, t0], [7, 0x86, 4, sec * 1000], [8, 0x86, 4, sec * 1000], [9, 0x86, 4, Math.round(dist * 100)], [13, 0x84, 2, Math.round(speed * 1000)], [15, 0x02, 1, Math.round((hr1 + hr2) / 2)], [16, 0x02, 1, hr2 + 5], [23, 0x00, 1, 0]]);
  w.msg(18, [[253, 0x86, 4, t0 + sec], [2, 0x86, 4, t0], [5, 0x00, 1, sport === 'run' ? 1 : 2], [6, 0x00, 1, 0], [7, 0x86, 4, sec * 1000], [8, 0x86, 4, sec * 1000], [9, 0x86, 4, Math.round(dist * 100)]]);
  return w.bytes();
}
