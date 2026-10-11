// Startet den lokalen Test-Server aus jedem Ordner heraus (wechselt ins Projektverzeichnis).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
await import(pathToFileURL(path.join(root, 'scripts/test-server.mjs')).href);
