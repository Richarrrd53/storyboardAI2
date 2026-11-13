const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),postcss=require('postcss');
const base=JSON.parse(fs.readFileSync(__dirname+'/baseline.json','utf8'));
const protectedFiles=['public/js/features/projects.js','public/js/components/global-toast.js'].map(file=>({file,unchanged:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===base[file]}));
const files=cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>file.startsWith('public/'));
const js=[...new Set(files.filter(file=>file.endsWith('.js')).concat('server.js'))].map(file=>{try{cp.execFileSync(process.execPath,['--check',file]);return{file,passed:true};}catch{return{file,passed:false};}});
const css=files.filter(file=>file.endsWith('.css')).map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch{return{file,passed:false};}});
let whitespace=true;try{cp.execFileSync('git',['diff','--check']);}catch{whitespace=false;}
const routerBefore=fs.readFileSync(__dirname+'/discovery/before/public/js/spa-router.js','utf8'),routerAfter=fs.readFileSync('public/js/spa-router.js','utf8');
const engine=source=>source.slice(source.indexOf('  async function navigate('),source.indexOf('  function handlePopState('));
const routing={registrationOnly:engine(routerBefore)===engine(routerAfter)};
const deployment=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const json={vercel:true,apiRewriteUnchanged:deployment.rewrites.find(rule=>rule.source==='/api/(.*)').destination==='/api/index.js'};
const results={date:'2026-11-13',protectedFiles,routing,json,js,css,whitespace};fs.writeFileSync(__dirname+'/source-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(!routing.registrationOnly||!json.apiRewriteUnchanged||!whitespace||protectedFiles.some(x=>!x.unchanged)||js.some(x=>!x.passed)||css.some(x=>!x.passed))process.exitCode=1;
