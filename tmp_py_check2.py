from pathlib import Path
text = Path('public/js/prompt-translate.js').read_text(encoding='utf-8')
idx = text.find('/\\bathmosphere\\b/gi')
print('idx', idx)
print('slice', repr(text[idx:idx+30]))
print('slice raw', text[idx:idx+30])
print('contains atmosphere plain', 'atmosphere' in text)
print('contains /\\bathmosphere\\b/gi', '/\\bathmosphere\\b/gi' in text)
print('text segment bytes', text[idx:idx+30].encode('utf-8'))
