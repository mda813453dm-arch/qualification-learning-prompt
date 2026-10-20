"""中小企業診断士：公式サイトのどこに第1次試験の正解（解答）が載っているかを調べる（開発用・読み取りのみ）。"""
import re, sys, unicodedata, urllib.request
from urllib.parse import urljoin
import fitz

UA = {'User-Agent': 'Mozilla/5.0'}
START = ['https://www.jf-cmca.jp/contents/010_c_/shikenmondai.html', 'https://www.jf-cmca.jp/contents/007_shiken.html']


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def html_of(url):
    raw = get(url)
    m = re.search(rb'charset=["\']?([A-Za-z0-9_-]+)', raw[:3000])
    enc = (m.group(1).decode() if m else 'utf-8').lower()
    enc = 'cp932' if enc in ('shift_jis', 'sjis', 'x-sjis') else enc
    return raw.decode(enc, 'ignore')


def links(url):
    h = html_of(url)
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
        out.append((urljoin(url, m.group(1)), re.sub(r'<[^>]+>|\s+', ' ', m.group(2)).strip()))
    return h, out


seen, queue = set(), list(START)
hits = []
while queue and len(seen) < 40:
    u = queue.pop(0)
    if u in seen:
        continue
    seen.add(u)
    try:
        h, ls = links(u)
    except Exception as e:
        print('ERR', u, e)
        continue
    print('PAGE', u, len(ls))
    for v, t in ls:
        if re.search('解答|正解|正答|kaito|kaitou|seikai', v + t):
            print('  HIT', v, '|', t)
            hits.append(v)
        if v.startswith('https://www.jf-cmca.jp/contents/') and v.endswith('.html') and re.search('試験|診断士|shiken', v + t):
            queue.append(v)

for u in [x for x in hits if x.lower().endswith('.pdf')][:3] + sys.argv[1:]:
    try:
        data = get(u)
        doc = fitz.open(stream=data, filetype='pdf')
        print('=' * 8, u, 'pages', doc.page_count)
        for i in range(min(doc.page_count, 3)):
            for x in [unicodedata.normalize('NFKC', y).strip() for y in doc[i].get_text().splitlines() if y.strip()][:80]:
                print('   ', x[:110])
    except Exception as e:
        print('ERR', u, e)
