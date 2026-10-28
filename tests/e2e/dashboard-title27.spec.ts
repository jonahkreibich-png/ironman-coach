import {test,expect} from './storage-harness';
import {seed,open} from './helpers';

test('Dashboardtitel bleibt bei 300/320px und Zoom ganz lesbar, Pfeil bleibt im eigenen Kasten',async({page})=>{
 await seed(page);await open(page,'/?go=plan');await page.evaluate(()=>document.fonts.ready);
 const button=page.getByRole('button',{name:'Dein Trainingsdashboard'});
 for(const width of [300,320,375,390])for(const dark of [false,true]){
  await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:dark?'dark':'light'});
  for(const expanded of [true,false]){
   if((await button.getAttribute('aria-expanded'))!==String(expanded))await button.click();
   const problems=await button.evaluate(el=>{
    const problems:string[]=[];const rect=el.getBoundingClientRect();
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for(let n=walker.nextNode();n;n=walker.nextNode()){
     const parent=n.parentElement!,box=parent.getBoundingClientRect();const text=n.textContent||'';
     const range=document.createRange();range.selectNodeContents(n);
     for(const r of Array.from(range.getClientRects()))if(r.width>0 && (r.right>box.right+2 || r.left<box.left-2 || r.right>rect.right+1))problems.push('Text exceeds own or button box');
     for(const match of text.matchAll(/\S+/g)){
      range.setStart(n,match.index!);range.setEnd(n,match.index!+match[0].length);
      if(new Set(Array.from(range.getClientRects()).filter(r=>r.width>0).map(r=>Math.round(r.top))).size>1)problems.push('Word breaks: '+match[0]);
     }
    }
    return problems;
   });
   expect(problems,'width='+width+',dark='+dark+',expanded='+expanded).toEqual([]);
   await expect(button).toBeVisible();await expect(page.locator('#plan-dashboard-body')).toBeVisible({visible:expanded});
  }
 }
});
