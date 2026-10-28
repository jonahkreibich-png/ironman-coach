import { chromium, webkit } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('docs/previews/plan26');
const html=readFileSync(resolve(root,'index.html'),'utf8');
const artifacts=resolve(root,'screenshots');mkdirSync(artifacts,{recursive:true});
const counts={checks:0,flows:0};
function check(v,m){assert.ok(v,m);counts.checks++}
for(const [name,type,exe] of [['chromium',chromium,'C:/Users/Anwender/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'],['webkit',webkit,'C:/Users/Anwender/AppData/Local/ms-playwright/webkit-2370/Playwright.exe']]){
 const browser=await type.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://preview.local/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://preview.local/');
 async function data(){return page.evaluate(()=>JSON.parse(JSON.stringify(state)))}
 async function reset(v){await page.evaluate(v=>{resetDemo();state.variant=v;render()},v)}
 async function confirm(){await page.locator('#confirm-action').click()}
 async function openDay(d){if(await page.locator(`.day[data-day="${d}"]`).getAttribute('open')===null)await page.locator(`.day[data-day="${d}"] summary`).click()}
 async function edit(id){await openDay(0);await page.locator(`[data-unit="${id}"]`).getByRole('button',{name:'Bearbeiten',exact:true}).click()}
 async function template(t){await page.getByRole('button',{name:'Aus Trainingsvorlage',exact:true}).click();await page.locator(`#template-list button[onclick="templatePreview('${t}')"]`).click()}
 for(const v of ['A','B','C']){
  await reset(v);
  check((await data()).units.length===11,'sample count');
  if(v==='B')await page.getByRole('button',{name:'Woche 4 Mittwoch',exact:true}).click();
  check((await page.locator('.day[data-day="2"] summary').textContent()).includes('70 min'),'cancelled excluded, extra included');
  check(!(await page.locator('.day[data-day="2"] summary').textContent()).includes('Schwimmen'),'cancelled sport absent in collapsed header');
  if(v==='B')await page.getByRole('button',{name:'Woche 4 Montag',exact:true}).click();
  await page.locator('#toast').evaluate(e=>e.hidden=true);await page.screenshot({path:resolve(artifacts,`${name}-${v}-390.png`),fullPage:true});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await openDay(0);await page.locator('[data-unit="sw4"]').getByRole('button',{name:'Verschieben / Tauschen'}).click();await page.getByRole('button',{name:'Vorschau',exact:true}).click();
  check((await data()).units.find(u=>u.id==='sw4').week===4,'preview does not mutate');await confirm();let s=await data();check(s.units.find(u=>u.id==='sw4').week===7,'moves across weeks');check(s.units.find(u=>u.id==='sw4').status==='planned','missed not completed');check(s.units.find(u=>u.id==='st4').week===4,'additional strength stays');check(s.units.length===11,'no duplicate');await page.getByRole('button',{name:'Rückgängig',exact:true}).click();check((await data()).units.find(u=>u.id==='sw4').week===4,'undo');
  await openDay(0);await page.locator('[data-unit="sw4"]').getByRole('button',{name:'Verschieben / Tauschen'}).click();await page.locator('#operation').selectOption('swap');await page.getByRole('button',{name:'Vorschau',exact:true}).click();await confirm();s=await data();check(s.units.find(u=>u.id==='bike7').week===4&&s.units.find(u=>u.id==='sw4').week===7,'single swap across weeks');check(s.units.find(u=>u.id==='st4').day===0,'strength unchanged');
  await reset(v);await openDay(0);await page.locator('.day[data-day="0"]').getByRole('button',{name:'Tag tauschen',exact:true}).click();await page.getByRole('button',{name:'Vorschau',exact:true}).click();await confirm();s=await data();check(s.units.find(u=>u.id==='st4').week===7&&s.units.find(u=>u.id==='bike7').week===4,'whole day swap');
  await reset(v);await openDay(0);await page.locator('[data-unit="st4"]').getByRole('button',{name:'Ausfallen lassen',exact:true}).click();await confirm();check((await page.locator('.day[data-day="0"] summary').textContent()).includes('45 min'),'cancel immediately updates summary');
  await reset(v);await edit('sw4');await page.locator('#edit-title').fill('Individuell');await page.locator('#edit-minutes').fill('33');await page.getByRole('button',{name:'Speichern',exact:true}).click();await confirm();check((await data()).units.find(u=>u.id==='sw4').minutes===33,'edit saved');
  for(const t of ['ts','tb','tr','tk'])for(const mode of ['replace','append','new']){
   await reset(v);if(mode==='new'){await openDay(0);await page.locator('.day[data-day="0"]').getByRole('button',{name:'＋ Einheit',exact:true}).click()}else{await edit('sw4');const sport={ts:'swim',tb:'bike',tr:'run',tk:'strength'}[t];await page.locator('#edit-sport').selectOption(sport)}
   await template(t);if(mode==='append')await page.locator('#template-mode').selectOption('append');const before=await data();check(before.units[0].title==='Technik im Wasser','template preview not committed');await page.getByRole('button',{name:'In Entwurf übernehmen',exact:true}).click();await page.getByRole('button',{name:'Speichern',exact:true}).click();await confirm();s=await data();const base={ts:26,tb:44,tr:40,tk:25}[t],u=mode==='new'?s.units.at(-1):s.units[0];check(u.minutes===base+(mode==='append'?45:0),`${v} ${t} ${mode} minutes`);check(s.units.length===(mode==='new'?12:11),'template count');check(mode==='new'?u.id!=='sw4':u.id==='sw4','template identity');check(s.templates[0].blocks[0].minutes===5,'template independence');check(s.units.find(u=>u.id==='run4').actual.minutes===48,'actual untouched');counts.flows++;
  }
  await reset(v);await edit('sw4');await page.getByRole('button',{name:'Aus Trainingsvorlage',exact:true}).click();await page.locator('#template-filter').selectOption('bike');check(await page.locator('#template-list button').count()===1,'filter');await page.locator('#template-search').fill('kein-treffer');check(await page.locator('#template-list button').count()===0,'search');await page.getByRole('button',{name:'Dialog schließen'}).click();check((await data()).units[0].minutes===45,'cancel unchanged');
  await page.locator('.adjust summary').click();await page.getByRole('textbox',{name:'Planungsnotiz'}).fill('Bleibt erhalten');await page.getByRole('combobox',{name:'Trainingswoche',exact:true}).selectOption('7');check(await page.getByRole('textbox',{name:'Planungsnotiz'}).inputValue()==='Bleibt erhalten','adjustment retained');
  for(let n=0;n<20;n++)await page.getByRole('combobox',{name:'Trainingswoche',exact:true}).selectOption(n%2?'4':'7');check((await data()).units.length===11,'rapid navigation stable');
 }
 await page.setViewportSize({width:1440,height:1000});await reset('B');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow');await page.screenshot({path:resolve(artifacts,`${name}-B-desktop.png`),fullPage:true});check(errors.length===0,errors.join('; '));await browser.close();console.log(name+' passed');
}
console.log(JSON.stringify(counts));

