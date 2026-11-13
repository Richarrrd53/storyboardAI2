const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm'),postcss=require('postcss');
const root=process.cwd(),base=JSON.parse(fs.readFileSync(__dirname+'/baseline.json','utf8'));
const protectedPaths=['public/js/features/creation.js','public/js/features/generation-task.js','public/js/features/template-workflow.js','public/js/features/projects.js','public/js/components/global-toast.js','server.js','lib/template-catalog.js'];
const protectedFiles=protectedPaths.map(file=>({file,unchanged:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===base[file]}));
const changed=cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/);
const jsFiles=[...new Set([...changed.filter(f=>f.endsWith('.js')&&(f.startsWith('public/')||f==='server.js')),'public/js/components/choice-group.js','public/js/components/template-presentation.js','analysis/ui-audit/phase1/mock-server.cjs'])];
const js=jsFiles.map(file=>{try{cp.execFileSync(process.execPath,['--check',file]);return{file,passed:true};}catch{return{file,passed:false};}});
const css=changed.filter(f=>f.startsWith('public/')&&f.endsWith('.css')).map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch{return{file,passed:false};}});
const before=fs.readFileSync(__dirname+'/before/public/js/spa-router.js','utf8'),after=fs.readFileSync('public/js/spa-router.js','utf8');
function engine(source){const start=source.indexOf('  async function navigate('),end=source.indexOf('  function handlePopState(');if(start<0||end<=start)throw new Error('Router boundary missing');return source.slice(start,end);}
const routerNavigateUnchanged=engine(before)===engine(after);
const harness='analysis/ui-audit/phase5/harness.html';let harnessSyntax=true;try{const source=fs.readFileSync(harness,'utf8');for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);}catch(error){harnessSyntax=false;console.error(error);}
let whitespace=true;try{cp.execFileSync('git',['diff','--check'],{stdio:'pipe'});}catch{whitespace=false;}
(async()=>{
 const paths=['/audit-health','/phase5-harness?width=390','/discovery-harness?width=390','/generate','/template/phase5-long-source','/js/components/choice-group.js','/js/components/template-presentation.js'];
 const http=[];for(const path of paths){const res=await fetch('http://127.0.0.1:4324'+path);const body=await res.text();http.push({path,status:res.status,bytes:Buffer.byteLength(body),passed:res.ok&&body.length>0});}
 const data=[{id:'http-only',name:'HTTP fixture',source:{title:'原文 #標籤'}}];
 const put=await fetch('http://127.0.0.1:4324/phase5-templates-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const returned=await fetch('http://127.0.0.1:4324/api/get-templates').then(r=>r.json());
 const catalogRoundtrip=put.ok&&JSON.stringify(data)===JSON.stringify(returned);
 await fetch('http://127.0.0.1:4324/phase5-templates-control',{method:'POST',body:'[]'});
 const results={date:'2026-11-13',protectedFiles,routerNavigateUnchanged,js,css,whitespace,harnessSyntax,http,catalogRoundtrip,browser:'Unavailable; HTTP and source checks do not verify rendering or interactions'};
 fs.writeFileSync(__dirname+'/source-verification.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({js:js.length,css:css.length,protectedFiles,routerNavigateUnchanged,whitespace,harnessSyntax,http,catalogRoundtrip}));
 if(protectedFiles.some(x=>!x.unchanged)||!routerNavigateUnchanged||!whitespace||!harnessSyntax||!catalogRoundtrip||js.some(x=>!x.passed)||css.some(x=>!x.passed)||http.some(x=>!x.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
