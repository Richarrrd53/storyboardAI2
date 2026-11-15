/** Display excerpts are derived locally; source text and generation input are never rewritten. */
(function(root){
 'use strict';
 const text=value=>typeof value==='string'?value.trim():'';
 const withoutUrls=value=>value.replace(/https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi,' ');
 function splitTitle(value){
  const tags=[],title=withoutUrls(text(value)).replace(/[#＃]([^\s#＃]+)/gu,(_,tag)=>{tags.push(tag);return ' ';}).replace(/\s+/g,' ').trim();return {title,tags};
 }
 function tagsOf(template){
  const seen=new Set(),result=[];
  for(const value of [...(Array.isArray(template.tags)?template.tags:[]),...splitTitle(template.name||template.title||template.source?.title).tags]){
   const tag=text(value).replace(/^[#＃]+/,'');if(tag&&!seen.has(tag.toLocaleLowerCase())){seen.add(tag.toLocaleLowerCase());result.push(tag);}
  }return result;
 }
 function excerpt(value,limit=240){const chars=Array.from(value);return chars.length>limit?chars.slice(0,limit-1).join('').trimEnd()+'…':value;}
 function present(template={}){
  const rawTitle=typeof template.source?.title==='string'?template.source.title:typeof template.name==='string'?template.name:typeof template.title==='string'?template.title:'';
  const rawDescription=typeof template.source?.description==='string'?template.source.description:typeof template.description==='string'?template.description:'';
  const displayTitle=text(template.displayTitle);
  const title=displayTitle||splitTitle(template.name||template.title||rawTitle).title||'未命名模板';
  const editorial=text(template.displaySummary)||text(template.summary)||text(template.narrative?.summary);
  const cleaned=withoutUrls(rawDescription).replace(/[#＃]([^\s#＃]+)/gu,' ').replace(/\s+/g,' ').trim();
  const summaryFull=editorial||cleaned||'尚未提供內容摘要；可查看鏡頭結構與來源資訊。';
  return {title,summary:excerpt(summaryFull),summaryFull,summaryLabel:editorial?'內容摘要':cleaned?'來源說明摘錄':'內容說明',tags:tagsOf(template),rawTitle,rawDescription};
 }
 function externalUrl(value,base){try{if(!text(value))return '';const url=new URL(value,base||root.document?.baseURI||'http://localhost/');return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}}
 function seconds(value){const candidate=typeof value==='number'?String(value):text(value),match=candidate.match(/^(\d+(?:\.\d+)?)\s*(?:s|秒)?$/i);return match&&Number(match[1])>0?Number(match[1]):null;}
 function durationOf(template){
  const explicit=seconds(template.duration);if(explicit!==null)return explicit;
  if(!Array.isArray(template.structure)||!template.structure.length)return null;
  const values=template.structure.map(shot=>seconds(shot.duration));return values.every(value=>value!==null)?Math.round(values.reduce((a,b)=>a+b,0)*100)/100:null;
 }
 function shotCountOf(template){const value=Number(template.shotsCount);return template.shotsCount!=null&&Number.isInteger(value)&&value>=0?value:Array.isArray(template.structure)?template.structure.length:null;}
 const CAT_MAP={product:'商品廣告',story:'敘事紀實',twist:'高留存節奏',custom:'團隊資產'};
 const categoryOf=t=>['product','story','twist'].includes(t.category||t.type)?(t.category||t.type):'custom';
 function filter(list,state={}) {
  const query=(state.query||'').trim().toLocaleLowerCase();
  let result=list.filter(t=>(!state.category||state.category==='全部'||categoryOf(t)===state.category)&&(!state.tag||tagsOf(t).includes(state.tag))&&(!query||[t.displayTitle,t.displaySummary,t.summary,t.narrative?.summary,t.name,t.title,t.description,t.source?.title,t.source?.description,t.categoryLabel,CAT_MAP[categoryOf(t)],...tagsOf(t),...(Array.isArray(t.platform)?t.platform:[])].some(value=>String(value||'').toLocaleLowerCase().includes(query))));
  const dir=state.direction==='desc'?-1:1;
  if(state.sort==='name')result=[...result].sort((a,b)=>(a.name||a.title||'').localeCompare(b.name||b.title||'','zh-Hant')*dir);
  else if(state.sort==='duration')result=[...result].sort((a,b)=>{const x=durationOf(a),y=durationOf(b);return x===null?y===null?0:1:y===null?-1:(x-y)*dir;});
  else if(dir===-1)result=[...result].reverse();
  return result;
 }
 root.TemplatePresentation={present,tagsOf,externalUrl,durationOf,shotCountOf,categoryOf,filter};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.TemplatePresentation;
})(typeof window!=='undefined'?window:globalThis);
