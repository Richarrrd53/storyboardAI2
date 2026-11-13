const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const base='http://127.0.0.1:4323';
(async()=>{
 const health=await fetch(base+'/audit-health').then(r=>r.json());assert.equal(health.isolated,true);
 const rows=[];
 for(const route of ['/discovery','/discovery/settings']){const res=await fetch(base+route),body=await res.text();assert.equal(res.status,200);assert.match(body,/js\/main\.js/);assert.ok(!body.includes('id="api-settings-form"'));rows.push({route,status:res.status,spaBootstrap:true});}
 const html=await fetch(base+'/html/discovery-settings.html').then(r=>r.text());assert.ok(html.includes('id="api-settings-form"'));assert.ok(html.includes('id="retry-settings"'));
 const control=body=>fetch(base+'/discovery-control',{method:'POST',body:JSON.stringify(body)});
 await control({configured:false,failLoad:false,failSave:false,delay:0});
 const initial=await fetch(base+'/api/discovery/settings').then(r=>r.json());assert.equal(initial.configured,false);
 const saved=await fetch(base+'/api/discovery/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({youtubeApiKey:'fixture-youtube-only',geminiApiKey:'fixture-gemini-only'})}).then(r=>r.json());
 assert.equal(saved.configured,true);assert.ok(!JSON.stringify(saved).includes('fixture-'));const readback=await fetch(base+'/api/discovery/settings').then(r=>r.json());assert.equal(readback.savedAt,saved.savedAt);
 await control({failLoad:true});assert.equal((await fetch(base+'/api/discovery/settings')).status,503);
 await control({failLoad:false,failSave:true});assert.equal((await fetch(base+'/api/discovery/settings',{method:'POST',body:'{}'})).status,503);
 await control({failSave:false,configured:false});
 const harness=await fetch(base+'/discovery-harness?width=390').then(r=>r.text());new vm.Script(harness.match(/<script>([\s\S]*?)<\/script>/)[1]);
 const result={date:'2026-11-13',isolated:true,routes:rows,settings:{read:true,save:true,persistence:true,noKeyEcho:true,loadFailure:true,saveFailure:true},harnessSyntax:true,browser:'Pending: local browser access unavailable'};
 fs.writeFileSync(__dirname+'/http-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
