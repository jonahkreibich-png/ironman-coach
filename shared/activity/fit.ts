/* Eigener Decoder für .fit-Dateien (Flexible and Interoperable Data Transfer), ohne Fremdbibliothek.
   Liest Sitzung, Runden, Messpunkte (Puls, Tempo, Höhe, Leistung, Temperatur) und Schwimmbahnen (Züge, Lage).
   Unbekannte Nachrichten und Entwicklerfelder werden übersprungen. */
import type { RawActivity, RawRecord, RawLap, RawLength } from './types';

const FIT_EPOCH = Date.UTC(1989, 11, 31, 0, 0, 0); // Sekunde 0 der FIT-Zeit

/* Basistypen: Größe, ungültiger Wert, Lesefunktion */
type Reader = (v: DataView, o: number, le: boolean) => number;
interface BaseType { size: number; invalid: number | null; read: Reader; str?: boolean }
const BT: Record<number, BaseType> = {
  0x00: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) },
  0x01: { size: 1, invalid: 0x7f, read: (v, o) => v.getInt8(o) },
  0x02: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) },
  0x83: { size: 2, invalid: 0x7fff, read: (v, o, le) => v.getInt16(o, le) },
  0x84: { size: 2, invalid: 0xffff, read: (v, o, le) => v.getUint16(o, le) },
  0x85: { size: 4, invalid: 0x7fffffff, read: (v, o, le) => v.getInt32(o, le) },
  0x86: { size: 4, invalid: 0xffffffff, read: (v, o, le) => v.getUint32(o, le) },
  0x07: { size: 1, invalid: null, read: (v, o) => v.getUint8(o), str: true },
  0x88: { size: 4, invalid: null, read: (v, o, le) => v.getFloat32(o, le) },
  0x89: { size: 8, invalid: null, read: (v, o, le) => v.getFloat64(o, le) },
  0x0a: { size: 1, invalid: 0x00, read: (v, o) => v.getUint8(o) },
  0x8b: { size: 2, invalid: 0x0000, read: (v, o, le) => v.getUint16(o, le) },
  0x8c: { size: 4, invalid: 0x00000000, read: (v, o, le) => v.getUint32(o, le) },
  0x0d: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) },
  0x8e: { size: 8, invalid: null, read: (v, o, le) => Number(v.getBigInt64(o, le)) },
  0x8f: { size: 8, invalid: null, read: (v, o, le) => Number(v.getBigUint64(o, le)) },
  0x90: { size: 8, invalid: null, read: (v, o, le) => Number(v.getBigUint64(o, le)) }
};

interface FieldDef { num: number; size: number; type: number }
interface Def { global: number; le: boolean; fields: FieldDef[]; devSize: number }
export interface FitMessage { global: number; f: Record<number, any> }

export class FitError extends Error {}

/* Liest alle Nachrichten einer Datei (auch mehrere aneinandergehängte FIT-Dateien). */
export function decodeFitMessages(buf: ArrayBuffer | Uint8Array): FitMessage[] {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: FitMessage[] = [];
  let pos = 0;
  while (pos + 12 <= bytes.length) {
    const hsize = view.getUint8(pos);
    if (hsize !== 12 && hsize !== 14) throw new FitError('Kein gültiger FIT-Kopf');
    const dataSize = view.getUint32(pos + 4, true);
    const sig = String.fromCharCode(bytes[pos + 8], bytes[pos + 9], bytes[pos + 10], bytes[pos + 11]);
    if (sig !== '.FIT') throw new FitError('Keine FIT-Datei');
    const start = pos + hsize;
    const end = Math.min(start + dataSize, bytes.length);
    readRecords(view, bytes, start, end, out);
    pos = end + 2; // CRC
  }
  if (!out.length) throw new FitError('Leere FIT-Datei');
  return out;
}

function readRecords(view: DataView, bytes: Uint8Array, start: number, end: number, out: FitMessage[]) {
  const defs: Record<number, Def> = {};
  let p = start;
  let lastTs = 0;
  while (p < end) {
    const h = view.getUint8(p++);
    let local: number, tsOffset: number | null = null;
    if (h & 0x80) { // komprimierter Zeitstempel
      local = (h >> 5) & 0x03; tsOffset = h & 0x1f;
    } else {
      local = h & 0x0f;
      if (h & 0x40) { // Definition
        const le = view.getUint8(p + 1) === 0;
        const global = view.getUint16(p + 2, le);
        const n = view.getUint8(p + 4);
        p += 5;
        const fields: FieldDef[] = [];
        for (let i = 0; i < n; i++) { fields.push({ num: view.getUint8(p), size: view.getUint8(p + 1), type: view.getUint8(p + 2) }); p += 3; }
        let devSize = 0;
        if (h & 0x20) { const dn = view.getUint8(p++); for (let i = 0; i < dn; i++) { devSize += view.getUint8(p + 1); p += 3; } }
        defs[local] = { global, le, fields, devSize };
        continue;
      }
    }
    const d = defs[local];
    if (!d) throw new FitError('Datennachricht ohne Definition');
    const f: Record<number, any> = {};
    for (const fd of d.fields) {
      if (p + fd.size > bytes.length) return; // abgeschnittene Datei: bis hier lesen
      f[fd.num] = readField(view, bytes, p, fd, d.le);
      p += fd.size;
    }
    p += d.devSize;
    if (f[253] != null) lastTs = f[253];
    else if (tsOffset != null) {
      // 5-Bit-Versatz zum letzten vollen Zeitstempel
      let ts = (lastTs & ~0x1f) + tsOffset;
      if (tsOffset < (lastTs & 0x1f)) ts += 0x20;
      f[253] = ts; lastTs = ts;
    }
    out.push({ global: d.global, f });
  }
}

function readField(view: DataView, bytes: Uint8Array, p: number, fd: FieldDef, le: boolean): any {
  const bt = BT[fd.type] || BT[fd.type & 0x9f] || BT[0x0d];
  if (bt.str) {
    let s = ''; for (let i = 0; i < fd.size; i++) { const c = bytes[p + i]; if (!c) break; s += String.fromCharCode(c); }
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  const n = Math.floor(fd.size / bt.size);
  if (n <= 0) return null;
  if (n === 1) { const v = bt.read(view, p, le); return v === bt.invalid ? null : v; }
  const arr: (number | null)[] = [];
  for (let i = 0; i < n; i++) { const v = bt.read(view, p + i * bt.size, le); arr.push(v === bt.invalid ? null : v); }
  return arr;
}

/* ---------- Übersetzung in eine neutrale Aktivität ---------- */
const SPORT: Record<number, RawActivity['sport']> = { 1: 'run', 2: 'bike', 5: 'swim', 4: 'strength', 10: 'strength', 7: 'football', 11: 'walk', 17: 'walk', 18: 'multi' };
const STROKE = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'drill', 'mixed', 'im'];
const sc = (v: any, s: number, o = 0): number | null => (v == null || Array.isArray(v) ? null : v / s - o);
const time = (ts: number | null | undefined) => (ts == null ? null : FIT_EPOCH + ts * 1000);

export function parseFit(buf: ArrayBuffer | Uint8Array): RawActivity {
  const msgs = decodeFitMessages(buf);
  const sessions = msgs.filter(m => m.global === 18);
  const fileId = msgs.find(m => m.global === 0);
  const sportMsg = msgs.find(m => m.global === 12);
  const s0: any = sessions.length === 1 ? sessions[0].f : sessions.length ? sumSessions(sessions) : {};
  const recMsgs = msgs.filter(m => m.global === 20 && m.f[253] != null);
  const sessStarts = sessions.map(m => m.f[2]).filter((x: any) => x != null);
  const startTs = (sessStarts.length ? Math.min(...sessStarts, recMsgs[0] ? recMsgs[0].f[253] : Infinity) : null) ?? (recMsgs[0] && recMsgs[0].f[253]) ?? (fileId && fileId.f[4]);
  if (startTs == null) throw new FitError('Keine Zeitangabe in der Datei');
  const t0 = startTs;
  const sportNum = s0[5] ?? (sportMsg && sportMsg.f[0]);
  const subSport = s0[6] ?? (sportMsg && sportMsg.f[1]);
  let sport = SPORT[sportNum as number] || 'other';
  // Multisport: Hauptsport ist die längste Sitzung
  if (sessions.length > 1 && new Set(sessions.map(x => x.f[5])).size > 1) sport = 'multi';
  const records: RawRecord[] = recMsgs.map(m => {
    const f = m.f;
    const sp = f[73] != null ? sc(f[73], 1000) : sc(f[6], 1000);
    const alt = f[78] != null ? sc(f[78], 5, 500) : sc(f[2], 5, 500);
    return {
      t: f[253] - t0,
      hr: f[3] ?? null, cad: f[4] ?? null, power: f[7] ?? null,
      dist: sc(f[5], 100), speed: sp, alt, temp: f[13] ?? null,
      lat: f[0] != null ? f[0] * (180 / 2 ** 31) : null, lon: f[1] != null ? f[1] * (180 / 2 ** 31) : null
    };
  });
  const laps: RawLap[] = msgs.filter(m => m.global === 19).map(m => {
    const f = m.f;
    const st = f[2] ?? f[253];
    return {
      start: st != null ? st - t0 : 0,
      sec: sc(f[8], 1000) ?? sc(f[7], 1000) ?? 0,
      elapsed: sc(f[7], 1000),
      dist: sc(f[9], 100),
      avgHr: f[15] ?? null, maxHr: f[16] ?? null,
      avgSpeed: f[110] != null ? sc(f[110], 1000) : sc(f[13], 1000),
      avgPower: f[19] ?? null,
      intensity: f[23] != null ? (['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval', 'other'][f[23]] || 'active') : null,
      trigger: f[24] ?? null,
      lengths: f[32] ?? null
    };
  });
  const lengths: RawLength[] = msgs.filter(m => m.global === 101).map(m => {
    const f = m.f;
    const st = f[2] ?? f[253];
    return {
      start: st != null ? st - t0 : 0,
      sec: sc(f[4], 1000) ?? sc(f[3], 1000) ?? 0,
      strokes: f[5] ?? null,
      stroke: f[7] != null ? (STROKE[f[7]] || 'mixed') : null,
      cadence: f[9] ?? null,
      active: f[12] == null ? true : f[12] === 1
    };
  });
  const last = records[records.length - 1];
  const tot = {
    elapsedSec: sc(s0[7], 1000) ?? (last ? last.t : null),
    movingSec: sc(s0[8], 1000) ?? sc(s0[7], 1000) ?? (last ? last.t : null),
    distanceM: sc(s0[9], 100) ?? (last && last.dist != null ? last.dist : null),
    ascentM: s0[22] ?? null,
    kcal: s0[11] ?? null,
    avgHr: s0[16] ?? null, maxHr: s0[17] ?? null,
    avgPower: s0[20] ?? null,
    avgSpeed: s0[124] != null ? sc(s0[124], 1000) : sc(s0[14], 1000)
  };
  const indoor = (sport === 'bike' && (subSport === 6 || subSport === 58)) || (sport === 'run' && subSport === 1) || (sport === 'swim' && subSport === 17);
  return {
    format: 'fit',
    sport, subSport: subSport ?? null,
    startMs: time(t0)!,
    indoor: !!indoor,
    openWater: sport === 'swim' && subSport === 18,
    poolLengthM: sc(s0[44], 100),
    totals: tot,
    records, laps, lengths,
    device: fileId ? { manufacturer: fileId.f[1] ?? null, product: fileId.f[2] ?? null } : null,
    sessions: sessions.map(s => ({ sport: SPORT[s.f[5]] || 'other', start: (s.f[2] ?? t0) - t0, sec: sc(s.f[8], 1000) ?? sc(s.f[7], 1000) ?? 0, distanceM: sc(s.f[9], 100) }))
  };
}

/* Mehrere Sitzungen (Multisport): Summen und Durchschnitte über alle */
function sumSessions(list: FitMessage[]): Record<number, any> {
  const f: Record<number, any> = { ...list[0].f };
  const sum = (k: number) => list.reduce((a, m) => a + (m.f[k] || 0), 0);
  f[7] = sum(7); f[8] = sum(8); f[9] = sum(9); f[11] = sum(11); f[22] = sum(22);
  const hrs = list.filter(m => m.f[16] != null && m.f[8]);
  f[16] = hrs.length ? Math.round(hrs.reduce((a, m) => a + m.f[16] * m.f[8], 0) / hrs.reduce((a, m) => a + m.f[8], 0)) : null;
  f[17] = Math.max(...list.map(m => m.f[17] || 0)) || null;
  f[14] = null; f[124] = null; f[5] = list[0].f[5]; f[6] = null;
  return f;
}
