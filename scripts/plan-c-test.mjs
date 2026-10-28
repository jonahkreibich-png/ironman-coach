// Test environment only. Production publication remains a separate, gated operation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {releaseEnvironment,verifyBackup,verifyDeployment} from './veroeffentlichen.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SELF=fileURLToPath(import.meta.url);
const WRANGLER=path.join(ROOT,'server/node_modules/wrangler/bin/wrangler.js');
const STATUS=path.join(ROOT,'PLAN-C-STATUS.txt');
const MARKER='Stamio - Plan C - Testlauf';
export function testPlan(now=new Date()) {
 const stamp=now.toISOString().replace(/[:.]/g,'-');
 const file=path.join(ROOT,'data-export','test-vor-plan-c-'+stamp+'.sql');
 return [{kind:'checks'},{kind:'backup',target:'test',file},{kind:'validate',target:'test',file},{kind:'deploy',target:'test'},{kind:'verify',target:'test'}];
}
export async function publishTestOnly({run,checkBackup=verifyBackup,verify=verifyDeployment,now=new Date(),onStep=()=>{}}={}) {
 if(typeof run!=='function')throw Error('Ausfuehrungsfunktion fehlt.');
 for(const step of testPlan(now)) {
  await onStep(step,'start');
  if(step.kind==='validate')await checkBackup(step.file);
  else if(step.kind==='verify')await verify('test');
  else await run(step);
  await onStep(step,'ok');
 }
}
function npmCli() {
 const file=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 if(!fs.existsSync(file))throw Error('npm-cli.js fehlt. Bitte Node.js-Installation pruefen.');
 return file;
}
function command(step) {
 if(step.kind==='checks')return {args:[npmCli(),'run','test:all'],cwd:ROOT};
 if(step.target!=='test')throw Error('Dieser Helfer erlaubt ausschliesslich die Testumgebung.');
 if(step.kind==='backup') {
  fs.mkdirSync(path.dirname(step.file),{recursive:true});
  return {args:[WRANGLER,'d1','export','stamio-test','--env','test','--remote','--output',step.file,'--skip-confirmation'],cwd:path.join(ROOT,'server')};
 }
 if(step.kind==='deploy')return {args:[path.join(ROOT,'scripts/deploy.mjs'),'test'],cwd:ROOT};
 throw Error('Unbekannter Schritt.');
}
async function main() {
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&!['--plan','--help'].includes(args[0])))throw Error('Aufruf: node scripts/plan-c-test.mjs [--plan|--help]');
 if(args[0]==='--help') {console.log('Standardtests -> Testsicherung pruefen -> Testseite aktualisieren -> Testseite pruefen. Keine Produktionsaenderung.');return;}
 if(args[0]==='--plan') {console.log(JSON.stringify(testPlan(),null,2));return;}
 // CA configuration must be present when Node starts, including for the final fetch verification.
 if(process.env.STAMIO_PLAN_C_READY!=='1') {
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[SELF],{cwd:ROOT,env:{...releaseEnvironment(),STAMIO_PLAN_C_READY:'1'},stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Testlauf angehalten. Details stehen in PLAN-C-STATUS.txt.')));});return;
 }
 if(fs.existsSync(STATUS)&&!fs.readFileSync(STATUS,'utf8').startsWith(MARKER))throw Error('PLAN-C-STATUS.txt existiert bereits mit anderem Inhalt. Bitte diese Datei zuerst umbenennen.');
 const logDir=path.join(ROOT,'scratch','plan-c-runs');fs.mkdirSync(logDir,{recursive:true});
 const logFile=path.join(logDir,new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid+'.log');
 fs.writeFileSync(logFile,'Plan C: nur Testumgebung\n',{flag:'wx'});
 const completed=[];let current='Start';
 const label={checks:'Vollstaendige Standardtests',backup:'Sicherung der Testdatenbank',validate:'Sicherung pruefen',deploy:'Testseite aktualisieren',verify:'Testseite pruefen'};
 const status=message=>fs.writeFileSync(STATUS,[MARKER,'',message,'','Erledigt: '+(completed.join(', ')||'noch kein Schritt'),'Aktueller Schritt: '+current,'Protokoll: '+logFile,'','Die echte App wird durch diesen Helfer nicht geaendert.'].join('\r\n')+'\r\n');
 const run=async step=>{
  const cmd=command(step);
  await new Promise((resolve,reject)=>{
   const p=spawn(process.execPath,cmd.args,{cwd:cmd.cwd,env:{...releaseEnvironment(),VITE_APP_ENV:'test'},stdio:['inherit','pipe','pipe']});
   for(const [stream,dest]of [[p.stdout,process.stdout],[p.stderr,process.stderr]])stream.on('data',chunk=>{dest.write(chunk);fs.appendFileSync(logFile,chunk);});
   p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(current+' fehlgeschlagen (Exit '+code+').')));
  });
 };
 try {
  status('Testlauf gestartet.');
  await publishTestOnly({run,onStep:(step,state)=>{current=label[step.kind];if(state==='start'){console.log('\n'+current+' ...');status('Testlauf laeuft.');}else{completed.push(current);status('Schritt erfolgreich.');}}});
  status('Testversion bereit: https://stamio-test.pages.dev');console.log('\nTestversion bereit: https://stamio-test.pages.dev');
 } catch(e) {status('ANGEHALTEN: '+e.message);throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(SELF))main().catch(e=>{console.error(e.message);process.exitCode=1;});
