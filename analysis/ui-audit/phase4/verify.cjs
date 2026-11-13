const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),postcss=require('postcss');
const dir=__dirname,base=JSON.parse(fs.readFileSync(dir+'/baseline.json','utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedFiles=[...base.protected,'public/js/pages/dashboard.js'].map(file=>({file,unchanged:hash(file)===base.sha256[file]}));
const jsFiles=['project-card','project-card-interactions','project-trash-motion','project-cover-transition','surface-morph','user-panel','dialog-service'].map(file=>'public/js/components/'+file+'.js').concat('public/js/sys.js','public/js/pages/projects.js','public/js/pages/history.js');
const js=jsFiles.map(file=>{try{cp.execFileSync(process.execPath,['--check',file]);return{file,passed:true};}catch(error){return{file,passed:false,error:String(error)};}});
const cssFiles=[...new Set(cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/).filter(file=>file.endsWith('.css')).concat('public/css/components/account-panel.css'))];
const css=cssFiles.map(file=>{try{postcss.parse(fs.readFileSync(file,'utf8'),{from:file});return{file,passed:true};}catch(error){return{file,passed:false,error:String(error)};}});
const evidence=fs.readdirSync(dir).filter(file=>/^geometry-\d+\.json$/.test(file)).map(file=>{
  const result=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8')),requested=Number(file.match(/\d+/)[0]);
  return {file,requested,reported:result.width,viewport:result.viewport??null,validRequestedWidth:requested===result.width,note:'Pre-final browser measurement; final geometry/motion hardening requires recapture.'};
});
let whitespace=true;try{cp.execFileSync('git',['diff','--check'],{stdio:['ignore','pipe','ignore']});}catch{whitespace=false;}
const result={date:'2026-11-13',protectedFiles,js,css,whitespace,evidence,browserFinal:'Pending: local browser became unavailable before final recapture'};
fs.writeFileSync(dir+'/followup-source-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({protected:protectedFiles.every(x=>x.unchanged),js:js.filter(x=>x.passed).length,css:css.filter(x=>x.passed).length,whitespace}));
if(protectedFiles.some(x=>!x.unchanged)||js.some(x=>!x.passed)||css.some(x=>!x.passed)||!whitespace||evidence.some(x=>!x.validRequestedWidth))process.exitCode=1;
