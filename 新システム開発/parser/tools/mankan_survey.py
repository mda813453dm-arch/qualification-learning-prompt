"""マンション管理士：公式の過去問ページのPDFリンクを表示する（開発用・読み取りのみ）。"""
import re, unicodedata, urllib.request
from urllib.parse import urljoin

UA = {'User-Agent': 'Mozilla/5.0'}
for url in ['https://www.mankan.org/kakomondai.html', 'https://www.mankan.org/']:
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    except Exception as e:
        print('ERR', url, e)
        continue
    m = re.search(rb'charset=["\']?([A-Za-z0-9_-]+)', raw[:3000])
    enc = (m.group(1).decode() if m else 'utf-8').lower()
    h = raw.decode('cp932' if enc in ('shift_jis', 'sjis', 'x-sjis') else enc, 'ignore')
    print('PAGE', url, enc, len(h))
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S | re.I):
        href, text = urljoin(url, m.group(1)), unicodedata.normalize('NFKC', re.sub(r'<[^>]+>|\s+', ' ', m.group(2))).strip()
        if re.search(r'\.pdf|過去|試験|kakomon', href + text, re.I):
            print('  ', href, '|', text, '| before:', re.sub(r'<[^>]+>|\s+', ' ', h[max(0, m.start() - 150):m.start()])[-60:])

# 試験の概要（令和8年度ガイド）から、基準になる行を表示する（読み取りのみ）
import fitz
for u in ['https://www.mankan.org/pdf/guide.pdf']:
    try:
        d = fitz.open(stream=urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read(), filetype='pdf')
        print('GUIDE', u, 'pages', d.page_count)
        for i in range(min(d.page_count, 4)):
            text = unicodedata.normalize('NFKC', d[i].get_text())
            print('--- guide page', i + 1, 'chars', len(text))
            print(re.sub(r'\s+', ' ', text)[:2500])
    except Exception as e:
        print('ERR guide', e)
