const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),postcss=require('postcss'),vm=require('node:vm');
const base=JSON.parse(fs.readFileSync(__dirname+'/baseline.json','utf8'));
const protectedPaths=['public/js/features/projects.js','public/js/components/global-toast.js','public/js/components/project-trash-motion.js','public/css/components/project-card.css','public/js/components/surface-morph.js','public/js/components/quick-compose.js','public/js/sys.js','public/js/landing.js','public/js/landing-animation.js','public/css/components/mobile-nav.css'];
const protectedFiles=protectedPaths.map(file=>({file,unchanged:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===base[file]}));
const productFiles=Object.keys(base).filter(file=>!protectedPaths.includes(file));
const js=productFiles.filter(f=>f.endsWith('.js')).concat('analysis/ui-audit/phase1/mock-server.cjs').map(file=>{try{cp.execFileSync(process.execPath,['--check',file]);return{file,passed:true};}catch{return{file,passed:false};}});
const css=productFiles.filter(f=>f.endsWith('.css')).map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch{return{file,passed:false};}});
const shellBefore=fs.readFileSync(__dirname+'/before/public/js/shell/app-shell.js','utf8'),shellAfter=fs.readFileSync('public/js/shell/app-shell.js','utf8');
function mobileGestures(s){return s.slice(s.indexOf('  function initMobileBottomNavGestures()'),s.indexOf('  function bindGlobalListeners()'));}
const navGesturesUnchanged=mobileGestures(shellBefore)===mobileGestures(shellAfter);
let harnessSyntax=true;try{for(const match of fs.readFileSync(__dirname+'/harness.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);}catch{harnessSyntax=false;}
let whitespace=true;try{cp.execFileSync('git',['diff','--check'],{stdio:'pipe'});}catch{whitespace=false;}
const materialInventory=[];
function scan(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+file.name;if(file.isDirectory())scan(path);else if(path.endsWith('.css'))fs.readFileSync(path,'utf8').split(/\r?\n/).forEach((line,index)=>{if(/(?<!webkit-)backdrop-filter\s*:|mask-image\s*:/.test(line))materialInventory.push({file:path,line:index+1,rule:line.trim()});});}}
scan('public/css');fs.writeFileSync(__dirname+'/material-source-inventory.json',JSON.stringify(materialInventory,null,2));
(async()=>{const http=[];for(const path of ['/audit-health','/phase6-harness?width=390','/css/shell.css','/css/tokens/components.css','/css/tokens/motion.css','/js/dynamic-mask.js','/js/math-curve-loader.js']){const r=await fetch('http://127.0.0.1:4326'+path);http.push({path,status:r.status,passed:r.ok});await r.text();}
 const result={date:'2026-11-14',protectedFiles,navGesturesUnchanged,js,css,harnessSyntax,whitespace,http,materialSourceRecords:materialInventory.length};fs.writeFileSync(__dirname+'/source-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(!navGesturesUnchanged||!harnessSyntax||!whitespace||protectedFiles.some(x=>!x.unchanged)||js.some(x=>!x.passed)||css.some(x=>!x.passed)||http.some(x=>!x.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
