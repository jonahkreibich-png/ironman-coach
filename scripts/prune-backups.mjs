/* Auftrag 21: data-export/ klein halten. Je Umgebung (echte App, Test) bleiben die 5 neuesten Datenbank-Sicherungen unverändert.
   Ältere werden komprimiert (data-export/archiv/*.gz, etwa ein Zehntel der Größe); davon bleiben je Umgebung die 10 neuesten, noch
   ältere werden gelöscht, aber nur, wenn sie älter als 60 Tage sind (Löschen ist nicht umkehrbar). Andere Dateien (Plan-Übersichten, Notizen) bleiben unberührt. data-export/ ist in .gitignore (nie in Git).
   Aufruf: node scripts/prune-backups.mjs [--dry-run]   (läuft auch automatisch am Ende von scripts/veroeffentlichen.mjs) */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const KEEP = 5, KEEP_ARCHIVE = 10, ARCHIVE_DAYS = 60;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const groupOf = name => /^(prod|production)[-_]/i.test(name) ? 'production' : /^test[-_]/i.test(name) ? 'test' : null;
export const isBackup = name => /\.(sql|sqlite)$/i.test(name) && !!groupOf(name);

/* Was passiert mit welcher Datei (reine Planung, testbar) */
export function planPrune(files, archives, now = Date.now()) {
  const out = { keep: [], compress: [], deleteArchive: [] };
  for (const g of ['production', 'test']) {
    const list = files.filter(f => groupOf(f.name) === g && isBackup(f.name)).sort((a, b) => b.mtime - a.mtime);
    out.keep.push(...list.slice(0, KEEP).map(f => f.name));
    out.compress.push(...list.slice(KEEP).map(f => f.name));
    const arch = [...archives.filter(f => groupOf(f.name) === g), ...list.slice(KEEP).map(f => ({ name: f.name + '.gz', mtime: f.mtime }))].sort((a, b) => b.mtime - a.mtime);
    out.deleteArchive.push(...arch.slice(KEEP_ARCHIVE).filter(f => f.mtime < now - ARCHIVE_DAYS * 86400000).map(f => f.name));
  }
  return out;
}

export async function prune(dir = path.join(ROOT, 'data-export'), dry = false) {
  if (!fs.existsSync(dir)) return { keep: [], compress: [], deleteArchive: [] };
  const archDir = path.join(dir, 'archiv'); if (!dry) fs.mkdirSync(archDir, { recursive: true });
  const stat = (d, n) => ({ name: n, mtime: fs.statSync(path.join(d, n)).mtimeMs });
  const files = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isFile()).map(n => stat(dir, n));
  const archives = fs.existsSync(archDir) ? fs.readdirSync(archDir).filter(n => n.endsWith('.gz')).map(n => stat(archDir, n)) : [];
  const p = planPrune(files, archives);
  if (dry) return p;
  for (const n of p.compress) {
    const src = path.join(dir, n), dst = path.join(archDir, n + '.gz');
    await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 9 }), fs.createWriteStream(dst));
    const t = fs.statSync(src).mtime; fs.utimesSync(dst, t, t);
    if (fs.statSync(dst).size > 0) fs.unlinkSync(src);
  }
  for (const n of p.deleteArchive) { const f = path.join(archDir, n); if (fs.existsSync(f)) fs.unlinkSync(f); }
  return p;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes('--dry-run');
  const p = await prune(undefined, dry);
  console.log(`${dry ? '(Probe) ' : ''}behalten: ${p.keep.length}, komprimiert: ${p.compress.length}, alte Archive gelöscht: ${p.deleteArchive.length}`);
}
