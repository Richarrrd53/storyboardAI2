const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),postcss=require('postcss');
const base=JSON.parse(fs.readFileSync('analysis/ui-audit/phase3/baseline.json','utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedFiles=base.protected.map(file=>({file,unchanged:base.sha256[file]===sha(file)}));
const cssFiles=[...new Set([...cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>f.endsWith('.css')),'public/css/components/account-panel.css'])];
const css=cssFiles.map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch(e){return{file,passed:false,error:e.message};}});
const js=['public/js/components/surface-morph.js','public/js/components/user-panel.js','public/js/components/overlay-manager.js','public/js/components/project-option-morph.js','public/js/shell/app-shell.js','public/js/pages/projects.js'].map(file=>{try{cp.execFileSync(process.execPath,['--check',file]);return{file,passed:true};}catch(e){return{file,passed:false};}});
const result={date:'2026-11-13',protectedFiles,css,js};fs.writeFileSync('analysis/ui-audit/phase3/source-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({protected:protectedFiles.every(x=>x.unchanged),css:css.length,js:js.length}));if(protectedFiles.some(x=>!x.unchanged)||css.some(x=>!x.passed)||js.some(x=>!x.passed))process.exitCode=1;
