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
        qb, ab = get(u), (get(a) if a else None)
        r = run('shindan', year, PdfSource(qb, u), PdfSource(ab, a) if a else None, subj)
        if r['status'] == 'unavailable' and ab:
            import fitz
            d = fitz.open(stream=ab, filetype='pdf')
            print('    answer pdf', a, 'pages', d.page_count, [w[4] for w in d[0].get_text('words')][:60])
        if r['status'] == 'unavailable':
            import fitz
            print('    question cover', fitz.open(stream=qb, filetype='pdf')[0].get_text()[:200].replace('\n', ' / '))
        reasons = collections.Counter(e['reason'] for e in r.get('excluded', []))
        total.update(reasons)
        total['packets'] += r.get('packetCount', 0)
        print(year, subj, r['status'], r.get('reason', ''), r.get('detail', ''), 'packets', r.get('packetCount'), dict(reasons))
        raw = {}
        if r['status'] != 'unavailable':
            import fitz
            from qlp_parser.adapters import shindan
            raw = {q.number: q for q in shindan.parse_questions(fitz.open(stream=qb, filetype='pdf'))}
        notes = collections.Counter(n for q in raw.values() for n in q.notes if not n.startswith('subject:'))
        print('    notes', dict(notes))
        for e in r.get('excluded', []):
            q = raw.get(e['questionNumber'])
            if not q or 'subquestions' not in q.notes:
                print('    excluded', e, q and q.notes, q and q.stem[:80], q and len(q.choices))
        ps = r.get('packets', [])
        for p in [x for x in ps if 'table_by_layout' in x['evidence']['notes']][:2]:
            print('    table', p['questionNumber'], p['stem'][:100])
        for p in ps[:1]:
            print('    sample', json.dumps({k: p[k] for k in ('questionNumber', 'stem', 'choices', 'correctAnswer', 'fieldId', 'diagramRequired')}, ensure_ascii=False)[:700])
print('TOTAL', dict(total))
import fitz
d = fitz.open(stream=get('https://www.jf-cmca.jp/attach/test/r08/r08_1ji_annai.pdf'), filetype='pdf')
print('ANNAI pages', d.page_count)
for i in range(min(d.page_count, 6)):
    print('--- annai page', i + 1)
    print(d[i].get_text()[:3000])
