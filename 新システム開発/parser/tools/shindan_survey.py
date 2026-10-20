"""中小企業診断士：公式の過去問掲載ページと PDF の並びを調べる（開発用・読み取りのみ）。"""
import re, sys, unicodedata, urllib.request
from urllib.parse import urljoin
import fitz

PAGE = 'https://www.jf-cmca.jp/contents/010_c_/shikenmondai.html'
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

raw = get(PAGE)
html = raw.decode('cp932', 'ignore')
links = []
for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
    href, text = m.group(1), re.sub(r'<[^>]+>|\s+', ' ', m.group(2)).strip()
    links.append((urljoin(PAGE, href), text))
pdfs = [(u, t) for u, t in links if u.lower().endswith('.pdf')]
print('links', len(links), 'pdfs', len(pdfs))
rest = [(u, t) for u, t in pdfs if not re.search(r'/(1ji|2ji)[^/]*/[a-gA-G][12]j', u)]
for u, t in rest:
    print('OTHER', u, '|', t)
answers = [u for u, t in rest if '1' in u]
others = [(u, t) for u, t in links if not u.lower().endswith('.pdf') and ('shiken' in u or '過去' in t or '正' in t or '解答' in t)]
for u, t in others[:40]:
    print('LINK', u, '|', t)
# 本文の見出しらしきもの（年度・科目の並び方を見る）
body = re.sub(r'<script.*?</script>|<style.*?</style>', '', html, flags=re.S)
txt = unicodedata.normalize('NFKC', re.sub(r'<[^>]+>', '\n', body))
lines = [x.strip() for x in txt.splitlines() if x.strip()]
for x in lines:
    if re.search(r'正解|正答|解答', x):
        print('TXT', x[:120])

def show(url, maxpages=4, pages=None):
    data = get(url)
    doc = fitz.open(stream=data, filetype='pdf')
    print('=' * 8, url, 'pages', doc.page_count, 'bytes', len(data))
    for i in (pages if pages is not None else range(min(doc.page_count, maxpages))):
        if i >= doc.page_count:
            continue
        t = doc[i].get_text()
        ls = [unicodedata.normalize('NFKC', x).strip() for x in t.splitlines() if x.strip()]
        print(f'-- p{i+1} chars={len(t)} imgs={len(doc[i].get_images())} drawings={len(doc[i].get_drawings())}')
        for x in ls[:40]:
            print('   ', x[:110])

# 直近の年度の PDF を数本だけ中身まで見る（問題1本・正解1本）
for u in sys.argv[1:]:
    try:
        show(u, pages=range(0, 60))
    except Exception as e:
        print('ERR', u, e)
for u in [x for x in answers if '2025' in x or '2026' in x][:2] + answers[-1:]:
    try:
        show(u, pages=range(0, 3))
    except Exception as e:
        print('ERR', u, e)
# 設問が分かれた問題の形を見る（財務・会計の後ろ）
try:
    show('https://www.jf-cmca.jp/attach/test/shikenmondai/1ji2025/B1JI2025.pdf', pages=range(14, 18))
except Exception as e:
    print('ERR', e)
