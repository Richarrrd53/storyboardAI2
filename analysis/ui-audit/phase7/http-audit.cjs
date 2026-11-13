const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve('public'),base='http://127.0.0.1:4327',rows=[],seen=new Set(),queue=[];
const html=['index','login','dashboard','projects','generate','history','template','discovery','discovery-settings'].map(n=>'/html/'+n+'.html');
const add=(reference,from,role,line)=>{if(!reference||/^(?:#|data:|blob:|javascript:|mailto:|tel:)/i.test(reference))return;let url;try{url=new URL(reference,base+from);}catch{return;}if(url.origin!==base)return;if(!/\.(?:html|css|js|svg|png|jpe?g|webp|gif|woff2?|ttf|ico|mp4)$/i.test(url.pathname))return;const key=url.pathname+url.search;if(seen.has(key))return;seen.add(key);queue.push({path:key,from,role,line});};
for(const file of html)add(file,'/','formal-html',null);
add('/main.html','/','app-host',null);
for(const m of fs.readFileSync('public/js/spa-router.js','utf8').matchAll(/['"]([^'"\n]+\.(?:css|js)(?:\?[^'"]*)?)['"]/g))add(m[1],'/js/spa-router.js','route-dependency',null);
(async()=>{
 for(let i=0;i<queue.length;i++){
  const item=queue[i],response=await fetch(base+item.path),textType=/\.(?:html|css|js)(?:\?|$)/.test(item.path);const buffer=Buffer.from(await response.arrayBuffer());rows.push({...item,status:response.status,bytes:buffer.length,ok:response.ok});
  if(!response.ok||!textType)continue;const source=buffer.toString('utf8'),pathname=new URL(item.path,base).pathname;
  const refs=[];
  if(pathname.endsWith('.html'))for(const m of source.matchAll(/<(?:script|link|img|source|video)\b[^>]*?\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi))refs.push(m);
  if(pathname.endsWith('.css'))for(const m of source.matchAll(/url\(\s*['"]?([^)'"\n]+)['"]?\s*\)/gi))if(!m[1].includes('var('))refs.push(m);
  for(const m of refs)add(m[1].trim(),pathname,'static-asset',source.slice(0,m.index).split('\n').length);
 }
 const formal=[];for(const route of ['/login','/register','/dashboard','/projects','/project/audit-folder','/generate','/template','/template/phase7-long','/history','/discovery','/discovery/settings']){const r=await fetch(base+route);formal.push({route,status:r.status,hasShell:(await r.text()).includes('./js/main.js')});}
 const harness=await fetch(base+'/phase7-harness').then(r=>r.text());let harnessSyntax=true;try{for(const m of harness.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}catch(error){harnessSyntax=false;console.error(error);}
 const result={date:'2026-11-14',kind:'Isolated HTTP / dependency audit; no browser rendering',base,formal,harnessSyntax,assets:rows,failures:rows.filter(r=>!r.ok)};fs.writeFileSync(__dirname+'/http-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({assets:rows.length,failures:result.failures,formal,harnessSyntax}));if(!harnessSyntax||formal.some(r=>r.status!==200||!r.hasShell))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
