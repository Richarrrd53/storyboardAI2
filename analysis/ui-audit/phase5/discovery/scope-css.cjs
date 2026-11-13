const fs=require('node:fs'),postcss=require('postcss');
const file='public/css/discovery.css',source=fs.readFileSync(file,'utf8');if(source.includes('only scroll owner')){console.log('Discovery stylesheet already scoped');process.exit(0);}const root=postcss.parse(source);
root.walkAtRules(rule=>{if(rule.name==='import')rule.remove();if(rule.name==='keyframes'&&rule.params==='spin')rule.params='discovery-spin';});
root.walkRules(rule=>{
 if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes')return;
 if(rule.selector===':root'){rule.selector='.discovery-page-content';return;}
 const selectors=rule.selectors.filter(selector=>!['*','html','body','body:before','button','input','select','.discovery-shell'].includes(selector.trim())&&!selector.includes('.discovery-nav')&&!selector.includes('.discovery-brand'));
 if(!selectors.length){rule.remove();return;}rule.selectors=selectors.map(selector=>'.discovery-page-content '+selector);
});
root.walkDecls(decl=>{decl.value=decl.value.replace(/'DM Sans'/g,'var(--font-family-body)').replace(/'Noto Sans TC'/g,'var(--font-family-body)').replace(/\bspin\b/g,'discovery-spin');});
fs.writeFileSync(file,root.toString());
