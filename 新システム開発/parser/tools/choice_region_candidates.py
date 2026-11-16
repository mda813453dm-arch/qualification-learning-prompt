"""選択肢が原本画像の問について、選択肢だけの範囲の候補を原本の行の位置から作る（承認はしない。目視で確かめてから使う）。

選択肢の最初の行（「ア」または「1」で始まる行）から、次の問の見出し・ページ下端の手前までを範囲にする。
選択肢の最初の行より上に図の候補があれば、図の範囲もあわせて出す（監査結果の候補を上下で整えたもの）。

使い方：
  QLP_OCR=vision QLP_VISION_CACHE=<控え> python3 tools/choice_region_candidates.py --audit a.json --shared <共有結果> --pdf <PDF> --out choices.json
"""
import argparse
import glob
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import fitz  # noqa: E402
import figure_separation_audit as A  # noqa: E402
from refine_figure_candidates import refine  # noqa: E402

FIRST = {'ア': re.compile(r'^\s*ア(?:\s|[.．]|$)'), '1': re.compile(r'^\s*[1１](?:\s|[.．]|$)')}
LAST = {'ア': re.compile(r'^\s*エ(?:\s|[.．]|$)|\sエ\s'), '1': re.compile(r'^\s*[4４5５](?:\s|[.．]|$)')}
NEXT_Q = re.compile(r'^\s*(?:問\s*\d{1,3}|〔?No\.?\s*\d{1,2})')
FOOTER = re.compile(r'^\s*[-－―ー]?\s*\d{1,3}\s*[-－―ー]?\s*$')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', nargs='+', required=True)
    ap.add_argument('--shared', required=True)
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    packets = {}
    for f in glob.glob(os.path.join(a.shared, '*', '*.json')):
        r = json.load(open(f))['result']
        for p in r['packets']:
            packets[(r['questionPdfSha256'], r['section'], p['questionNumber'])] = p
    out = []
    for path in a.audit:
        for row in json.load(open(path)):
            if row.get('error'):
                continue
            qsha = row['questionPdfSha256']
            doc, cache = fitz.open(os.path.join(a.pdf, f'{qsha}.pdf')), {}
            for q in row['questions']:
                if q['status'] != 'choice_image':
                    continue
                p = packets.get((qsha, row['section'], q['questionNumber']))
                if not p:
                    continue
                kind = 'ア' if any(re.fullmatch(r'[アイウエ]', str(c)) for c in p.get('choices') or []) else '1'
                regions = A.question_regions(p, doc)
                found = None
                for pno, reg in regions:
                    lines, _ = A.page_lines(doc[pno - 1], p, cache)
                    inside = sorted([l for l in lines if reg.y0 <= (l.y0 + l.y1) / 2 <= reg.y1], key=lambda l: l.y0)
                    starts = [i for i, l in enumerate(inside) if FIRST[kind].match(unicodedata.normalize('NFKC', l.text))]
                    if not starts:
                        continue
                    i0 = starts[-1] if kind == 'ア' else starts[0]
                    first = inside[i0]
                    bottom = reg.y1
                    last_line = first
                    for l in inside[i0 + 1:]:
                        t = unicodedata.normalize('NFKC', l.text).strip()
                        if NEXT_Q.match(t) or FOOTER.match(t):
                            bottom = l.y0 - 2
                            break
                        last_line = l
                    # 選択肢の最後の行（または選択肢の図）の下端まで。図の選択肢は行が無いので範囲の下端まで
                    x0 = min([l.x0 for l in inside[i0:]] + [first.x0]) - 4
                    rect = fitz.Rect(x0, first.y0 - 3, reg.x1 - 20, bottom)
                    found = {'page': pno, 'rect': [round(v, 1) for v in rect], 'firstLine': first.text, 'lastLine': last_line.text}
                figs = []
                for c in q['candidates']:
                    lines, _ = A.page_lines(doc[c['page'] - 1], p, cache)
                    r, cut = refine(c['rect'], lines)
                    if found and c['page'] == found['page'] and r.y1 > found['rect'][1]:
                        r.y1 = min(r.y1, found['rect'][1] - 1)
                    if r.height >= 18:
                        figs.append({'page': c['page'], 'rect': [round(v, 1) for v in r], 'cut': cut})
                out.append({'qualificationId': row['qualificationId'], 'year': row['year'], 'section': row['section'],
                            'questionPdfSha256': qsha, 'questionNumber': q['questionNumber'], 'choice': found, 'figures': figs,
                            'stemCoverage': q.get('stemCoverage')})
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('questions', len(out), 'withChoice', sum(1 for x in out if x['choice']))


if __name__ == '__main__':
    main()
