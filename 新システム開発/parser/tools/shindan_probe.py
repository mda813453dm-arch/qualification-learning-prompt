"""中小企業診断士：問題PDF・正解PDFの行の位置と、年度ごとの正解ページの有無を表示する（開発用・読み取りのみ）。"""
import re, sys, unicodedata, urllib.request
from urllib.parse import urljoin
import fitz

UA = {'User-Agent': 'Mozilla/5.0'}
BASE = 'https://www.jf-cmca.jp/contents/010_c_/'


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def html_of(url):
    return get(url).decode('cp932', 'ignore')


def pdfs(url):
    h = html_of(url)
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', h, re.S | re.I):
        out.append((urljoin(url, m.group(1)), unicodedata.normalize('NFKC', re.sub(r'<[^>]+>|\s+', ' ', m.group(2))).strip()))
    return out


def dump(url, pages, words=False):
    doc = fitz.open(stream=get(url), filetype='pdf')
    print('=' * 8, url, 'pages', doc.page_count)
    for i in pages:
        if i >= doc.page_count:
            continue
        p = doc[i]
        print('--- page', i + 1, 'drawings', len(p.get_drawings()), 'images', len(p.get_image_info()), 'rect', p.rect)
        if words:
            for w in p.get_text('words'):
                print('   w %.0f %.0f %s' % (w[0], w[1], w[4]))
            continue
        d = p.get_text('dict', sort=True)
        for b in d['blocks']:
            for ln in b.get('lines', []):
                t = ''.join(sp['text'] for sp in ln['spans'])
                if t.strip():
                    print('   %5.1f %5.1f %4.1f | %s' % (ln['bbox'][1], ln['bbox'][0], ln['spans'][0]['size'], t[:90]))


listing = pdfs(BASE + 'shikenmondai.html')
print('LISTING', len(listing))
for u, t in listing[:20]:
    print('  ', u, '|', t)
for nn in range(1, 9):
    u = BASE + f'010_c_r{nn:02d}_shiken/R{nn:02d}_1ji_shiken_kaitou.html'
    try:
        ls = pdfs(u)
        print('ANSWERPAGE', u, len(ls))
        for v, t in ls:
            print('    ', v, '|', t)
    except Exception as e:
        print('ANSWERPAGE', u, 'ERR', e)

q = {}
for u, t in listing:
    m = re.search(r'/1ji(\d{4})/([A-Ga-g])', u)
    if m:
        q.setdefault((int(m.group(1)), m.group(2).upper()), u)
for key, pages in [((2026, 'B'), range(0, 5)), ((2026, 'D'), range(1, 3)), ((2024, 'E'), range(1, 3)), ((2019, 'C'), range(1, 2))]:
    if key in q:
        dump(q[key], pages)
for u in sys.argv[1:]:
    dump(u, [0], words=True)
