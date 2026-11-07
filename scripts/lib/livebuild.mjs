// Auftrag 28: den gerade veröffentlichten Build (genau das, was die Nutzer jetzt haben) lokal ablegen –
// für den Start-Test „lokaler Stand der Vorversion“ und als Rückweg (scripts/nach-release.mjs).
// Dateien: index.html, sw.js, alles aus der Liste des Service Workers, Startbilder aus index.html, Icons aus dem Manifest.
import fs from 'node:fs';
import path from 'node:path';

export function swVersion(text) { const m = /const VERSION = '([^']+)'/.exec(String(text)); return m ? m[1] : null; }

export async function downloadLiveBuild(url, dir, { fetchImpl = fetch } = {}) {
  const get = async p => {
    const u = new URL(p, url + '/'); u.searchParams.set('livebuild', String(Date.now()));
    const r = await fetchImpl(u.href, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Live-Build: ${p} → HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (p, buf) => { const f = path.join(dir, p.replace(/^\.?\//, '')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
  const sw = await get('sw.js'); put('sw.js', sw);
  const html = await get('index.html'); put('index.html', html);
  const m = /const ASSETS = (\[[\s\S]*?\]);/.exec(sw.toString('utf8'));
  if (!m) throw new Error('Live-Build: Liste im Service Worker nicht lesbar.');
  const files = new Set(JSON.parse(m[1]).filter(p => p !== './'));
  for (const x of html.toString('utf8').matchAll(/(?:href|src)="([^"#?:]+)"/g)) if (!x[1].startsWith('/src/') && !x[1].startsWith('//')) files.add(x[1]);
  for (const f of files) put(f, await get(f));
  try { const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8')); for (const i of man.icons || []) if (!fs.existsSync(path.join(dir, i.src))) put(i.src, await get(i.src)); } catch (_) { /* ohne Manifest */ }
  return { dir, version: swVersion(sw), files: files.size + 2 };
}
