import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from './shared/brand';

const RELEASE = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const VERSION = process.env.APP_VERSION || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/* Setzt den App-Namen in index.html ein und erzeugt Manifest und Service Worker mit allen gebauten Dateien. */
function brandAndOffline(): Plugin {
  let outDir = 'dist';
  return {
    name: 'brand-and-offline',
    configResolved(c) { outDir = c.build.outDir; },
    transformIndexHtml(html) {
      return html.replace(/%APP_NAME%/g, BRAND.name).replace(/%APP_SHORT%/g, BRAND.shortName).replace(/%APP_DESCRIPTION%/g, BRAND.description);
    },
    generateBundle(_opts, bundle) {
      const manifest = {
        name: BRAND.name, short_name: BRAND.shortName, description: BRAND.description, lang: 'de',
        start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
        background_color: '#e8edf4', theme_color: '#e8edf4',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: { action: './?import=1', method: 'POST', enctype: 'multipart/form-data', params: { files: [{ name: 'file', accept: ['.fit', '.gpx', '.tcx', 'application/octet-stream', 'application/gpx+xml'] }] } }
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 1) });
      const built = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const pub = path.resolve('web/public');
      const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(pub, path.join(d, e.name)).replace(/\\/g, '/')]);
      const statics = walk(pub).filter(f => !f.startsWith('splash/') && !f.startsWith('.') && f !== 'icons/icon-maskable-512.png');
      const assets = ['./', ...[...built, ...statics, 'manifest.webmanifest'].filter((v, i, a) => a.indexOf(v) === i && v !== 'sw.js' && v !== 'index.html').map(f => './' + f)];
      const tpl = fs.readFileSync(path.resolve('web/sw-template.js'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl.replace('__VERSION__', VERSION).replace('__CACHE_PREFIX__', BRAND.slug + '-').replace('__ASSETS__', JSON.stringify(assets, null, 2)).replace('__APP_NAME__', BRAND.name) });
      void outDir;
    }
  };
}

export default defineConfig({
  root: 'web',
  base: './',
  publicDir: 'public',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(VERSION), 'import.meta.env.VITE_APP_RELEASE': JSON.stringify(RELEASE) },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2020', sourcemap: false },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  plugins: [brandAndOffline()]
} as any);
