/* Audit fixture only. No production server import, dotenv, database or proxy.
 * Every /api request terminates here. State is memory-only and resets on restart.
 * Run: node analysis/ui-audit/mock-server.cjs ; browse localhost:4317/login.
 */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../public');
const projects=[{id:'audit-folder',title:'隔離測試：咖啡店分鏡',tags:['稽核','品牌'],is_deleted:false,ratio:'9:16',style:'cinematic',updateAt:'2026-11-10T04:00:00Z',createAt:'2026-11-01T04:00:00Z',shots:[{id:'audit-shot',order:1,title:'晨光灑進咖啡店',duration:'3s',camera:'中景',payload:{image:'/audit-cover.svg'}}],previewImages:['/audit-cover.svg']}];
const logs=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost:4317');
 const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(url.pathname==='/audit-log')return json(logs);
 if(url.pathname.startsWith('/api/')){
  logs.push({path:url.pathname,method:req.method,time:new Date().toISOString()});
  if(url.pathname==='/api/auth/login')return json({token:'isolated-audit-fixture',user:{id:'audit',name:'隔離稽核帳號'}});
  if(url.pathname==='/api/auth/me')return json({user:{id:'audit',name:'隔離稽核帳號',email:'fixture@example.test',plan:'free'}});
  if(url.pathname.endsWith('/cover')){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(cover);}
  if(url.searchParams.get('error')==='1')return json({error:'隔離測試錯誤'},503);
  if(url.pathname==='/api/projects')return json({projects});
  if(url.pathname==='/api/projects/audit-folder'){
   if(req.method==='DELETE')projects[0].is_deleted=true;
   return json({project:projects[0]});
  }
  if(url.pathname.endsWith('/restore')){projects[0].is_deleted=false;return json({project:projects[0]});}
  if(url.pathname==='/api/get-templates')return json([]);
  return json({error:'Unimplemented fixture endpoint'},404);
 }
 if(url.pathname==='/audit-cover.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(cover);}
 const entry=url.pathname==='/'||/^\/(login|register|dashboard|projects|history|generate|template|project\/[^/]+)$/.test(url.pathname);
 const file=path.resolve(root,'.'+(entry?'/main.html':url.pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const cover='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#14253b"/><rect x="32" y="32" width="296" height="300" fill="#bacbd3"/><path d="M180 32v300M32 182h296" stroke="#f7f8fa" stroke-width="8"/><ellipse cx="180" cy="550" rx="110" ry="25" fill="#8a9fac"/><path d="M105 400h150v100q-75 50-150 0z" fill="#f7f8fa"/><text x="180" y="600" fill="#fff" text-anchor="middle" font-size="18">AUDIT FIXTURE</text></svg>';
server.listen(4317,'127.0.0.1',()=>console.log('Isolated audit fixture at http://localhost:4317 — no database'));
