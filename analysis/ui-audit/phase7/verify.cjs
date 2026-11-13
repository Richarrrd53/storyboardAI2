const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process'),postcss=require('postcss');
const base=JSON.parse(fs.readFileSync(__dirname+'/baseline.json','utf8')),allowed=new Set(['public/css/auth.css','public/css/components/input.css']);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source=Object.keys(base).map(file=>({file,unchanged:digest(file)===base[file],allowedCorrection:allowed.has(file)}));
const js=Object.keys(base).filter(f=>f.startsWith('public/')&&f.endsWith('.js')).map(file=>{try{new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});return{file,passed:true};}catch(error){return{file,passed:false,error:error.message};}});
const css=Object.keys(base).filter(f=>f.endsWith('.css')).map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch(error){return{file,passed:false,error:error.message};}});
const scenarios=JSON.parse(fs.readFileSync(__dirname+'/page-state-matrix.json','utf8'));
const html=[];for(const file of [...new Set(scenarios.pages.map(p=>p.source).filter(p=>p.endsWith('.html')))]){const s=fs.readFileSync(file,'utf8').replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<template\b[\s\S]*?<\/template>/gi,'');const ids=[...s.matchAll(/<(?:[^>]+)\s+id\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];html.push({file,ids:ids.length,duplicateStaticIds:duplicates});}
const colors=Object.assign({},...['public/css/tokens/primitives.css','public/css/tokens/colors.css','public/css/tokens.css'].map(f=>Object.fromEntries([...fs.readFileSync(f,'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]))));
function resolve(name,depth=0){if(depth>20)throw Error('Cycle');return colors[name].replace(/var\((--[\w-]+)\)/g,(_,name)=>resolve(name,depth+1));}
function luminance(hex){return hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const contrastEvidence={kind:'Specified solid-surface contrast, not native browser composition',before:resolve('--color-text-muted'),after:resolve('--color-text-secondary'),background:resolve('--color-surface-primary')};contrastEvidence.beforeRatio=contrast(contrastEvidence.before,contrastEvidence.background);contrastEvidence.afterRatio=contrast(contrastEvidence.after,contrastEvidence.background);
fs.writeFileSync(__dirname+'/contrast-evidence.json',JSON.stringify(contrastEvidence,null,2));
let whitespace=true;try{cp.execFileSync('git',['diff','--check'],{stdio:'pipe'});}catch{whitespace=false;}
const result={date:'2026-11-14',source,js,css,html,whitespace,contrastEvidence,unexpectedChanges:source.filter(f=>!f.unchanged&&!f.allowedCorrection)};
fs.writeFileSync(__dirname+'/source-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({sources:source.length,unchanged:source.filter(f=>f.unchanged).length,allowedChanges:source.filter(f=>!f.unchanged&&f.allowedCorrection),js:js.length,css:css.length,duplicates:html.filter(x=>x.duplicateStaticIds.length),whitespace,contrastEvidence,unexpectedChanges:result.unexpectedChanges}));
if(!whitespace||result.unexpectedChanges.length||js.some(x=>!x.passed)||css.some(x=>!x.passed))process.exitCode=1;
