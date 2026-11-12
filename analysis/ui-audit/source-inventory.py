"""Read-only source inventory; outputs stay in this audit directory."""
import pathlib,re,json,hashlib,subprocess
root=pathlib.Path(__file__).resolve().parents[2]
out=pathlib.Path(__file__).parent
files=list((root/'public/css').rglob('*.css'))+list((root/'public/js').rglob('*.js'))+list((root/'public/html').glob('*.html'))
files=[p for p in files if 'vendor' not in p.parts]
patterns={'important':r'!important','transition_all':r'transition\s*:\s*all','backdrop':r'(?<!-)backdrop-filter\s*:','mask':r'(?<!-)mask-image\s*:','reduced':r'prefers-reduced-motion','z_index':r'z-index\s*:\s*[^;\n]+','gsap':r'\bgsap\.', 'raf':r'requestAnimationFrame\(', 'breakpoint':r'@media[^\{]+'}
result=[];tokens={}
for p in files:
 s=p.read_text(encoding='utf-8-sig');rel=p.relative_to(root).as_posix()
 hits={k:[{'line':s.count('\n',0,m.start())+1,'text':m.group(0)[:160]} for m in re.finditer(v,s)] for k,v in patterns.items()}
 result.append({'file':rel,'lines':len(s.splitlines()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'hits':{k:v for k,v in hits.items() if v}})
 if '/tokens/' in rel or rel.endswith('tokens.css'):
  for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;\n]+)',s):tokens.setdefault(m[1],[]).append({'file':rel,'line':s.count('\n',0,m.start())+1,'value':m[2]})
(out/'source-inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'token-inventory.json').write_text(json.dumps(tokens,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'baseline-status.txt').write_text(subprocess.check_output(['git','status','--short'],cwd=root,text=True),encoding='utf-8')
print(json.dumps({'files':len(result),'tokens':len(tokens),'duplicateTokenNames':{k:v for k,v in tokens.items() if len(v)>1},'counts':{k:sum(len(f['hits'].get(k,[])) for f in result) for k in patterns}},ensure_ascii=False,indent=2))
