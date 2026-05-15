import re

file = r'c:\My Files\web\StoryboardAI2\public\html\index.html'

BARCODE = '<span></span>' * 20

def card(emoji, bg, cat, title, seat, num, desc):
    dot = '\u00b7'
    front = (
        f'<div class="ticket-film-area" style="background:linear-gradient(135deg,{bg})">{emoji}</div>'
        f'<div class="ticket-stub">'
        f'<span class="ticket-category">{cat}</span>'
        f'<span class="ticket-title">{title}</span>'
        f'<div class="ticket-meta"><span class="ticket-seat">{seat}</span><span class="ticket-number">{num}</span></div>'
        f'</div><div class="ticket-bottom-strip"></div>'
    )
    back = (
        f'<div class="card-back-content"><h3>{title}</h3><p>{desc}</p></div>'
        f'<div class="card-back-barcode"><div class="barcode-lines">{BARCODE}</div>'
        f'<span class="barcode-text">STORYBOARD-AI {dot} {num.replace("NO. ", "")}</span></div>'
    )
    return (
        f'<div class="feature-card card"><div class="card-inner">'
        f'<div class="card-front">{front}</div>'
        f'<div class="card-back">{back}</div>'
        f'</div></div>'
    )

data = [
    ('\U0001f4dd', '#2a1f0e,#3d2e12', 'TEMPLATE LIBRARY', '\u71b1\u9580\u7206\u9ede\u6a21\u677f\u5eab', 'SEAT A-01', 'NO. 001',
     '\u5305\u542b\u8d85\u904e\u767e\u7a2e\u7576\u524d\u6700\u71b1\u9580\u7684\u77ed\u5f71\u97f3\u7206\u6b3e\u6a21\u677f\uff0c\u5feb\u901f\u5957\u7528\u4e0d\u5361\u95dc\uff0c\u8b93\u5275\u610f\u77ac\u9593\u6293\u4f4f\u89c0\u773e\u773c\u7403\u3002'),
    ('\U0001f3ac', '#1f1510,#3a2415', 'AI GENERATION', 'AI\u77ed\u5f71\u97f3\u5206\u93e1\u751f\u6210', 'SEAT A-02', 'NO. 002',
     '\u53ea\u8981\u8f38\u5165\u6587\u5b57\u8173\u672c\uff0cAI\u5373\u53ef\u81ea\u52d5\u70ba\u60a8\u751f\u6210\u5c08\u696d\u7684\u77ed\u5f71\u97f3\u5206\u93e1\u5716\uff0c\u5927\u5e45\u7e2e\u77ed\u524d\u7f6e\u4f5c\u696d\u6642\u9593\u3002'),
    ('\u2728', '#201a08,#3a3010', 'CUSTOMIZATION', '\u9748\u6d3b\u81ea\u8a02\u7fa9\u4fee\u6539', 'SEAT B-01', 'NO. 003',
     '\u751f\u6210\u7684\u5206\u93e1\u652f\u63f4\u7d30\u90e8\u8abf\u6574\uff0c\u5f9e\u904b\u93e1\u65b9\u5411\u5230\u89d2\u8272\u8868\u60c5\uff0c\u8b93\u6bcf\u500b\u756b\u9762\u90fd\u7b26\u5408\u60a8\u7684\u5b8c\u7f8e\u60f3\u50cf\u3002'),
    ('\U0001f512', '#0e1f15,#1a3326', 'OFFLINE \u00b7 SECURE', '\u672c\u5730\u7aef\u96e2\u7dda\u904b\u7b97', 'SEAT B-02', 'NO. 004',
     '\u652f\u63f4\u5b8c\u5168\u96e2\u7dda\u7684 NPU \u904b\u7b97\uff0c\u78ba\u4fdd\u672a\u516c\u958b\u7684\u5546\u696d\u6a5f\u5bc6\u8207\u539f\u5275\u5287\u672c\u7372\u5f97\u6700\u9ad8\u5c64\u7d1a\u7684\u8cc7\u5b89\u4fdd\u8b77\u3002'),
    ('\U0001f4ca', '#170f22,#2a1f3d', '3D MOCAP', '3D \u52d5\u4f5c\u6355\u6349\u8207\u53c3\u6578\u8abf\u6574', 'SEAT C-01', 'NO. 005',
     '\u6574\u5408 3D \u52d5\u4f5c\u6355\u6349\u6280\u8853\uff0c\u8b93\u5206\u93e1\u4eba\u7269\u52d5\u4f5c\u66f4\u81ea\u7136\uff0c\u4e26\u63d0\u4f9b\u591a\u9805\u5c08\u696d\u904b\u93e1\u53c3\u6578\u4f9b\u9032\u968e\u8abf\u6574\u3002'),
    ('\U0001f3af', '#1f1510,#3a2415', 'ANALYTICS', '\u5e33\u865f\u6578\u64da\u7cbe\u6e96\u4f01\u5283', 'SEAT C-02', 'NO. 006',
     '\u7d81\u5b9a\u793e\u7fa4\u5e33\u865f\uff0c\u900f\u904e AI \u6df1\u5ea6\u5206\u6790\u89c0\u773e\u8f2a\u5edf\u8207\u6b77\u53f2\u6578\u64da\uff0c\u70ba\u60a8\u91cf\u8eab\u6253\u9020\u6700\u9ad8\u8f49\u63db\u7387\u7684\u4f01\u5283\u3002'),
]

sep = '\n                '
all_cards = sep.join(card(*d) for d in data * 2)
new_grid = f'<div class="features-grid" id="feature-container">\n                {all_cards}\n            </div>'

with open(file, encoding='utf-8') as f:
    html = f.read()

pattern = r'<div class="features-grid" id="feature-container">.*?</div>(?=\s*</div>\s*</div>\s*</section>)'
new_html = re.sub(pattern, new_grid, html, flags=re.DOTALL)

with open(file, 'w', encoding='utf-8') as f:
    f.write(new_html)

print('Done')
