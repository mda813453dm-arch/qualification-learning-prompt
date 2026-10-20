"""中小企業診断士：公式PDFをアダプタで分解して、結果の要約を表示する（開発用・読み取りのみ）。"""
import collections, json, re, sys, unicodedata, urllib.request
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from qlp_parser.cli import run
from qlp_parser.core import PdfSource
from qlp_parser.adapters.shindan import subject_of

UA = {'User-Agent': 'Mozilla/5.0'}
BASE = 'https://www.jf-cmca.jp/contents/010_c_/'
YEARS = [int(y) for y in sys.argv[1:]] or [2026, 2023, 2020]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def pdfs(url):
    h = get(url).decode('cp932', 'ignore')
    return [(urljoin(url, m.group(1)), unicodedata.normalize('NFKC', re.sub(r'<[^>]+>|\s+', ' ', m.group(2))).strip())
            for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', h, re.S | re.I)]


listing = pdfs(BASE + 'shikenmondai.html')
total = collections.Counter()
for year in YEARS:
    nn = year - 2018
    answers = {subject_of(t): u for u, t in pdfs(BASE + f'010_c_r{nn:02d}_shiken/R{nn:02d}_1ji_shiken_kaitou.html') if subject_of(t) and '訂正' not in t}
    for u, t in listing:
        if f'/1ji{year}/' not in u:
            continue
        subj = subject_of(t)
        a = answers.get(subj)
        r = run('shindan', year, PdfSource(get(u), u), PdfSource(get(a), a) if a else None, subj)
        reasons = collections.Counter(e['reason'] for e in r.get('excluded', []))
        total.update(reasons)
        total['packets'] += r.get('packetCount', 0)
        print(year, subj, r['status'], r.get('reason', ''), r.get('detail', ''), 'packets', r.get('packetCount'), dict(reasons))
        for e in r.get('excluded', []):
            if e['reason'] not in ('FIGURE_REQUIRED_NOT_AVAILABLE',):
                print('    excluded', e)
        ps = r.get('packets', [])
        for p in ps[:1] + [x for x in ps if len(x['choices']) == 5][:1]:
            print('    sample', json.dumps({k: p[k] for k in ('questionNumber', 'stem', 'choices', 'correctAnswer', 'fieldId', 'diagramRequired')}, ensure_ascii=False)[:700])
print('TOTAL', dict(total))
