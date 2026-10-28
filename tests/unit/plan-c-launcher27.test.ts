import {test,expect} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
// A copied launcher and a harmless node.cmd receiver exercise real batch argument forwarding.
// The copy has no scripts directory, so it cannot start deployment even if the receiver fails.
for(const argument of ['--plan','--production'])test.skipIf(process.platform!=='win32')('Windows launcher forwards '+argument,()=>{
 const dir=fs.mkdtempSync(path.join(process.cwd(),'scratch','plan-c-launcher-')),launcher=path.join(dir,'PLAN-C-TESTEN.cmd'),received=path.join(dir,'args.txt');
 fs.copyFileSync('PLAN-C-TESTEN.cmd',launcher);fs.writeFileSync(path.join(dir,'node.cmd'),'@echo off\r\n> "%PLAN_C_ARGS_FILE%" echo %*\r\n');
 execFileSync(process.env.ComSpec||'cmd.exe',['/d','/c',launcher,argument],{cwd:dir,env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,PLAN_C_ARGS_FILE:received},timeout:5000,stdio:'pipe'});
 expect(fs.readFileSync(received,'utf8').trim().endsWith(' '+argument)).toBe(true);
});
