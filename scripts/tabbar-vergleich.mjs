// Auftrag 33: Vergleichsvideo der Tab-Leiste – links die iPhone-Aufnahme der Fitness-App, rechts die App (gleicher Ablauf, aufgenommen mit
// tests/e2e/tabbar-video.spec.ts). Beide auf 390 × 844, gleiche Länge, beschriftet; dazu ein Bildvergleich der Leiste (Einzelbilder).
// Aufruf: FFMPEG=<Pfad zu ffmpeg> node scripts/tabbar-vergleich.mjs [eigenes-video.webm]
// Ergebnis: docs/vergleich/vergleich-tableiste.mp4 (nicht im Repository) und docs/tabbar-ios26/vergleich-bilder.png
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FF = process.env.FFMPEG || 'ffmpeg';
const D = 'docs/vergleich';
const ios = `${D}/ios26-fitness-tableiste.mp4`;
const mine = process.argv[2] || `${D}/meine-app-neu-chromium.webm`;
for (const f of [ios, mine]) if (!fs.existsSync(f)) { console.error('fehlt: ' + f); process.exit(1); }
const run = args => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const label = t => `drawtext=text='${t}':x=12:y=60:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8`;
const LEN = 14;
// nebeneinander, 30 Bilder/s, 14 s (Länge der Fitness-Aufnahme)
run(['-i', ios, '-i', mine, '-filter_complex',
  `[0:v]fps=30,scale=390:844,setsar=1,trim=0:${LEN},setpts=PTS-STARTPTS,${label('iOS 26 Fitness')}[a];` +
  `[1:v]fps=30,scale=390:844,setsar=1,trim=0:${LEN},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${LEN},trim=0:${LEN},${label('Stamio 3.21')}[b];` +
  `[a][b]hstack=inputs=2[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', `${D}/vergleich-tableiste.mp4`]);
// Einzelbilder der Leiste (unterer Teil), je 0,5 s, beide übereinander – klein genug fürs Repository
fs.mkdirSync('docs/tabbar-ios26', { recursive: true });
const strip = (src, t) => `[${src}:v]fps=2,scale=390:844,setsar=1,trim=0:${LEN},setpts=PTS-STARTPTS,crop=390:150:0:694,tile=7x4[${t}]`;
run(['-i', ios, '-i', mine, '-filter_complex', `${strip(0, 'a')};${strip(1, 'b')};[a][b]vstack=inputs=2[v]`, '-map', '[v]', '-frames:v', '1', 'docs/tabbar-ios26/vergleich-bilder.png']);
console.log('fertig: ' + `${D}/vergleich-tableiste.mp4` + ', docs/tabbar-ios26/vergleich-bilder.png');
