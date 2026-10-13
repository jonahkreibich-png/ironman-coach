// Deploy: Worker (mit Migrationen) und App auf Cloudflare Pages.
// Aufruf: node scripts/deploy.mjs test|production [--only-web|--only-api]
// „production“ ist die echte App (neutrale Namen coach-app-efc7 / coach-api-efc7 / coach-db-efc7, siehe scripts/release.md).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const TARGETS = {
  test: { db: 'stamio-test', envFlag: ' --env test', pages: 'stamio-test', toml: 'pages/wrangler.test.toml', appEnv: 'test', url: 'https://stamio-test.pages.dev' },
  production: { db: 'coach-db-efc7', envFlag: '', pages: 'coach-app-efc7', toml: 'pages/wrangler.prod.toml', appEnv: 'production', url: 'https://coach-app-efc7.pages.dev' }
};
const target = TARGETS[process.argv[2]];
if (!target) { console.error('Aufruf: node scripts/deploy.mjs test|production'); process.exit(1); }
const only = process.argv[3] || '';
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const run = (cmd, cwd, extra = {}) => { console.log('> ' + cmd); execSync(cmd, { stdio: 'inherit', cwd, env: { ...env, ...extra } }); };
// wrangler direkt über node starten (npx.cmd scheitert hier an Argumenten und gelegentlich mit Cloudflare-Fehler 7403)
const wr = 'node ' + JSON.stringify(process.cwd() + '/server/node_modules/wrangler/bin/wrangler.js');

if (only !== '--only-web') {
  run(`${wr} d1 migrations apply ${target.db}${target.envFlag} --remote`, 'server');
  run(`${wr} deploy${target.envFlag}`, 'server');
}
if (only !== '--only-api') {
  run('npm run build', undefined, { VITE_APP_ENV: target.appEnv });
  fs.copyFileSync(target.toml, 'pages/wrangler.toml');
  run(`${wr} pages deploy ../dist --project-name ${target.pages} --branch main --commit-dirty=true`, 'pages');
}
console.log('Fertig: ' + target.url);
