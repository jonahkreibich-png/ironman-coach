/* Isolierter Browser-Testtransport ohne TCP-Port: gebaute Assets + echter Worker
   mit synthetischem SQLite-D1 im Testprozess. Normaler E2E-Betrieb bleibt gleich. */
import {test as base, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../../server/src/index';
// @ts-ignore
import {D1Shim} from '../../server/test/d1-shim.mjs';
const enabled=process.env.STAMIO_STORAGE_IN_PROCESS==='1';
const root=path.resolve('dist');
function database(){const db=new D1Shim();for(const name of fs.readdirSync('server/migrations').filter(x=>x.endsWith('.sql')).sort())db.execFile('server/migrations/'+name);return db;}
const types:any={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
export const test=base.extend<{memoryServer:any;memoryRoutes:void}>({
 memoryServer:async({},use)=>{
  if(!enabled){await use(null);return;}
  const env:any={DB:database(),ALLOWED_ORIGINS:'http://localhost:4180',ALLOW_TEST_ROUTES:'1',TOKEN_KEY:'synthetic-in-process-storage-key-0123456789',PUBLIC_URL:'http://localhost:4180',SIGNUP_PER_IP:'100000',SIGNUP_PER_HOUR:'100000'};
  const handle=async(url:string,method='GET',body?:any,headers:any={})=>{
   const u=new URL(url,'http://localhost:4180');
   if(u.pathname==='/__reset'){env.DB.db.close();env.DB=database();return new Response(null,{status:204});}
   const req=new Request(u,{method,headers:{'Content-Type':'application/json',...headers},body:['GET','HEAD'].includes(method)?undefined:typeof body==='string'?body:JSON.stringify(body)});
   return worker.fetch(req,env,{waitUntil(){}});
  };
  await use({handle});env.DB.db.close();
 },
 request:async({request,memoryServer},use)=>{
  if(!memoryServer){await use(request);return;}
  const send=async(method:string,url:string,o:any={})=>{const r=await memoryServer.handle(url,method,o.data,o.headers);return {ok:()=>r.ok,status:()=>r.status,json:()=>r.clone().json(),text:()=>r.clone().text()};};
  await use({post:(url,o)=>send('POST',url,o),get:(url,o)=>send('GET',url,o)} as any);
 },
 memoryRoutes:[async({browser,memoryServer},use)=>{
  if(!memoryServer){await use();return;}
  const original=browser.newContext.bind(browser);
  (browser as any).newContext=async(options:any)=>{
   const context=await original(options);
   await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.protocol==='blob:' || url.protocol==='data:')return route.continue();
    if(url.hostname!=='localhost')return route.abort();
    if(url.pathname.startsWith('/api/')){
     const response=await memoryServer.handle(url.href,r.method(),r.postData()??undefined,r.headers());
     return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(path.relative(root,file).startsWith('..'))return route.abort();
    const asset=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'index.html');
    return route.fulfill({status:200,contentType:types[path.extname(asset)]||'application/octet-stream',body:fs.readFileSync(asset)});
   });
   return context;
  };
  try{await use();}finally{(browser as any).newContext=original;}
 },{auto:true}]
});
export {expect};
