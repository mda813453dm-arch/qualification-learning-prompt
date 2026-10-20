"""中小企業診断士：公式の過去問掲載ページと PDF の並びを調べる（開発用・読み取りのみ）。"""
import re, sys, unicodedata, urllib.request
from urllib.parse import urljoin
import fitz

PAGE = 'https://www.jf-cmca.jp/contents/010_c_/shikenmondai.html'
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

html = get(PAGE).decode('utf-8', 'ignore')
links = []
for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
    href, text = m.group(1), re.sub(r'<[^>]+>|\s+', ' ', m.group(2)).strip()
    links.append((urljoin(PAGE, href), text))
pdfs = [(u, t) for u, t in links if u.lower().endswith('.pdf')]
print('links', len(links), 'pdfs', len(pdfs))
for u, t in pdfs[:200]:
    print('PDF', u, '|', t)
others = [(u, t) for u, t in links if 'shiken' in u or '過去' in t or '試験' in t]
for u, t in others[:60]:
    print('LINK', u, '|', t)
# 本文の見出しらしきもの（年度・科目の並び方を見る）
body = re.sub(r'<script.*?</script>|<style.*?</style>', '', html, flags=re.S)
txt = unicodedata.normalize('NFKC', re.sub(r'<[^>]+>', '\n', body))
lines = [x.strip() for x in txt.splitlines() if x.strip()]
for x in lines:
    if re.search(r'年度|令和|第[0-9]+次|科目|解答|正解', x):
        print('TXT', x[:120])

def show(url, maxpages=4):
    data = get(url)
    doc = fitz.open(stream=data, filetype='pdf')
    print('=' * 8, url, 'pages', doc.page_count, 'bytes', len(data))
    for i in range(min(doc.page_count, maxpages)):
        t = doc[i].get_text()
        ls = [unicodedata.normalize('NFKC', x).strip() for x in t.splitlines() if x.strip()]
        print(f'-- p{i+1} chars={len(t)} imgs={len(doc[i].get_images())} drawings={len(doc[i].get_drawings())}')
        for x in ls[:40]:
            print('   ', x[:110])

# 直近の年度の PDF を数本だけ中身まで見る（問題1本・正解1本）
picked = []
for u, t in pdfs:
    if len(picked) >= 3:
        break
    picked.append(u)
for u in sys.argv[1:] or picked:
    try:
        show(u)
    except Exception as e:
        print('ERR', u, e)
