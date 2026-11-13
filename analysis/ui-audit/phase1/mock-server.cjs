/* Audit fixture only. No production server import, dotenv, database or proxy.
 * Every /api request terminates here. State is memory-only and resets on restart.
 * Run: node analysis/ui-audit/mock-server.cjs ; browse localhost:4318/login.
 */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../public');
const projects=[{id:'audit-folder',title:'隔離測試：咖啡店分鏡',tags:['稽核','品牌'],is_deleted:false,ratio:'9:16',style:'cinematic',updateAt:'2026-11-10T04:00:00Z',createAt:'2026-11-01T04:00:00Z',shots:[{id:'audit-shot',order:1,title:'晨光灑進咖啡店',duration:'3s',camera:'中景',payload:{image:'/audit-cover.svg'}}],previewImages:['/audit-cover.svg']}];
const port = Number(process.env.AUDIT_UI_PORT || 4318);
const logs=[]; let failRename = false, failRestore = false, delayRename = 0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost:4318');
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/audit-health') {res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ready:true,isolated:true,port,harness:'/phase1-harness'}));}
 if(url.pathname==='/') {res.writeHead(302,{Location:'/phase1-harness'});return res.end();}
 if(url.pathname==='/phase1-harness.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'harness.js')));}
 if(url.pathname==='/phase4-harness'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'../phase4/harness.html')));}
 if(url.pathname==='/phase4-results' && req.method==='POST'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{try{const data=JSON.parse(body);fs.writeFileSync(path.join(__dirname,'../phase4/browser-results.json'),JSON.stringify(data,null,2));res.writeHead(200);res.end('ok');}catch{res.writeHead(400);res.end('invalid result');}});return;}
 if(url.pathname==='/phase4-control' && req.method==='POST'){
  const base=JSON.parse(JSON.stringify(projects.find(p=>p.id==='audit-folder')||projects[0]));base.id='audit-folder';base.is_deleted=false;
  projects.splice(0,projects.length,base,
   {...base,id:'audit-long',title:'這是一個需要完整保留可讀名稱的長篇咖啡店品牌影片分鏡專案',ratio:'1:1',tags:['長名稱測試','品牌內容','第三個標籤'],shotCount:4},
   {...base,id:'audit-empty',title:'尚未生成封面的草稿',previewImages:[],shots:[],shotCount:0,ratio:'16:9',tags:[]},
   {...base,id:'audit-deleted',is_deleted:true});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isolated:true,projects:projects.length}));return;
 }
 if(url.pathname==='/phase2-visual'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'../phase2/visual.html')));}
 if(url.pathname==='/audit-results'&&req.method==='POST'){let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{try{const result=JSON.parse(data);fs.writeFileSync(path.join(__dirname,'../phase2/browser-results.json'),JSON.stringify(result,null,2));res.writeHead(200);res.end('ok');}catch{res.writeHead(400);res.end('Invalid results');}});return;}
 const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(url.pathname==='/audit-log')return json(logs);
 if(['/phase1-harness','/phase2-harness','/audit'].includes(url.pathname)) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'harness.html')));}
 if(url.pathname==='/phase1-control' && req.method==='POST') {
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
   let c;try{c=JSON.parse(body||'{}');}catch{return json({error:'Invalid fixture configuration'},400);}
   if(!c||typeof c!=='object'||Array.isArray(c))return json({error:'Fixture configuration must be an object'},400);
   projects[0].is_deleted=!!c.deleted;
   projects[0].title='隔離測試：咖啡店分鏡'; failRename=!!c.failRename;failRestore=!!c.failRestore;delayRename=c.delayRename||0;logs.length=0;json({ok:true});
  });return;
 }
 if(url.pathname.startsWith('/api/')){
  logs.push({path:url.pathname,method:req.method,time:new Date().toISOString()});
  if(url.pathname==='/api/auth/login')return json({token:'isolated-audit-fixture',user:{id:'audit',name:'隔離稽核帳號'}});
  if(url.pathname==='/api/auth/me')return json({user:{id:'audit',name:'隔離稽核帳號',email:'fixture@example.test',plan:'free'}});
  if(url.pathname==='/api/projects/audit-empty/cover')return json({error:'No cover'},404);
  if(url.pathname.endsWith('/cover')){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(cover);}
  if(url.searchParams.get('error')==='1')return json({error:'隔離測試錯誤'},503);
  if(url.pathname==='/api/projects')return json({projects});
  if(url.pathname==='/api/projects/audit-folder'){
   if(req.method==='PATCH') {
    let body=''; req.on('data',chunk=>body+=chunk);req.on('end',()=>setTimeout(()=>{
     if(failRename){failRename=false;return json({error:'隔離測試：儲存失敗，請重試'},503);}
     let payload;try{payload=JSON.parse(body);}catch{return json({error:'Invalid JSON'},400);}projects[0].title=payload.title;json({project:projects[0]});
    },delayRename)); return;
   }
   if(req.method==='DELETE')projects[0].is_deleted=true;
   return json({project:projects[0]});
  }
  if(url.pathname.endsWith('/restore')){if(failRestore){failRestore=false;return json({error:'隔離測試復原失敗'},503);}projects[0].is_deleted=false;return json({project:projects[0]});}
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
if(require.main===module) {
 server.on('error',async error=>{
  if(error.code==='EADDRINUSE') {
   try {const response=await fetch(`http://127.0.0.1:${port}/audit-health`);const health=await response.json();if(health.isolated&&health.ready){console.log(`UI verification already running: http://127.0.0.1:${port}/phase1-harness`);return;}}catch{}
  }
  console.error(`UI verification could not start: ${error.message}`);process.exitCode=1;
 });
 server.listen(port,'127.0.0.1',()=>console.log(`UI verification ready: http://127.0.0.1:${port}/phase1-harness — memory-only fixture, no database`));
}
module.exports = { server };
