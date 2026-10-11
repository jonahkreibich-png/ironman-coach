// Deploy in die Test-Umgebung: Worker (mit Migrationen) und App auf Cloudflare Pages.
// Aufruf: node scripts/deploy.mjs test [--only-web|--only-api]
// Die echte Umgebung wird nur über scripts/release.md beim „Freigeben“ angefasst.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const target = process.argv[2];
if (target !== 'test') { console.error('Nur "test" ist erlaubt. Die echte App wird erst beim Freigeben umgestellt (scripts/release.md).'); process.exit(1); }
const only = process.argv[3] || '';
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const run = (cmd, cwd) => { console.log('> ' + cmd); execSync(cmd, { stdio: 'inherit', cwd, env }); };
const wr = process.platform === 'win32' ? 'npx.cmd wrangler' : 'npx wrangler';

if (only !== '--only-web') {
  run(`${wr} d1 migrations apply stamio-test --env test --remote`, 'server');
  run(`${wr} deploy --env test`, 'server');
}
if (only !== '--only-api') {
  run('npm run build');
  fs.copyFileSync('pages/wrangler.test.toml', 'pages/wrangler.toml');
  run(`${wr} pages deploy ../dist --project-name stamio-test --branch main --commit-dirty=true`, 'pages');
}
console.log('Fertig: https://stamio-test.pages.dev');
