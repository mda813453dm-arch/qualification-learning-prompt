"""図だけの切り出し候補の上下から、本文の末尾・選択肢・次の塊の見出しの行を外す（監査結果を補う）。

監査（figure_separation_audit.py）の候補は、図の直下の1行の選択肢（「ア 11 イ 12 …」「1 アイ 2 アエ …」）や、
図の直上の本文の末尾（「…どれか。」）、次の塊の見出し（「〔表〕」）を含むことがある。
原本の行の位置（文字の層、または保存済みの OCR の控え）で、候補の上端・下端にあるこれらの行だけを外す。
外した後の候補は必ず目視で確かめてから使う（この道具は承認しない）。

使い方：
  QLP_OCR=vision QLP_VISION_CACHE=<控え> python3 tools/refine_figure_candidates.py --audit a.json --shared <共有結果> --pdf <PDF> --out refined.json
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

IPA_CHOICES = re.compile(r'^\s*ア\s*\S.*イ\s*\S')
NUM_CHOICES = re.compile(r'^\s*[1１][.．\s]\s*\S.*\s[2２][.．\s]')
ONE_CHOICE = re.compile(r'^\s*(?:[ア-エ]|[1-5１-５][.．])\s')
BRACKET = re.compile(r'^\s*〔[^〕]{1,12}〕\s*$')
STEM_TAIL = re.compile(r'(?:。|か。|せよ。|選べ。)\s*$')


def lines_in(lines, rect):
    out = []
    for ln in lines:
        cy = (ln.y0 + ln.y1) / 2
        cx = (ln.x0 + ln.x1) / 2
        if rect.y0 <= cy <= rect.y1 and rect.x0 - 4 <= cx <= rect.x1 + 4:
            out.append(ln)
    return sorted(out, key=lambda l: l.y0)


def refine(rect, lines):
    r = fitz.Rect(rect)
    cut = []
    for _ in range(8):
        inside = lines_in(lines, r)
        if not inside:
            break
        bottom, top = inside[-1], inside[0]
        tb = unicodedata.normalize('NFKC', bottom.text).strip()
        tt = unicodedata.normalize('NFKC', top.text).strip()
        # 下端：選択肢の行（1行に複数の選択肢、または選択肢が縦に並ぶ最後の数行）・次の塊の見出し
        if IPA_CHOICES.match(tb) or NUM_CHOICES.match(tb) or BRACKET.match(tb) or \
                (ONE_CHOICE.match(tb) and len(inside) >= 2 and ONE_CHOICE.match(unicodedata.normalize('NFKC', inside[-2].text).strip())):
            cut.append(('bottom', bottom.text))
            r.y1 = bottom.y0 - 1.5
            continue
        # 上端：本文の末尾（句点で終わる行）
        if STEM_TAIL.search(tt) and top.y1 < r.y0 + 0.25 * r.height:
            cut.append(('top', top.text))
            r.y0 = top.y1 + 1.5
            continue
        break
    return r, cut


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', nargs='+', required=True)
    ap.add_argument('--shared', required=True)
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--status', default='fixable,unverified')
    a = ap.parse_args()
    want = set(a.status.split(','))
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
            pdf = os.path.join(a.pdf, f'{qsha}.pdf')
            if not os.path.exists(pdf):
                continue
            doc, cache = fitz.open(pdf), {}
            for q in row['questions']:
                if q['status'] not in want or not q['candidates']:
                    continue
                p = packets.get((qsha, row['section'], q['questionNumber']))
                ref = []
                for c in q['candidates']:
                    lines, _ = A.page_lines(doc[c['page'] - 1], p or {}, cache)
                    r, cut = refine(c['rect'], lines)
                    ref.append({'page': c['page'], 'rect': [round(v, 1) for v in r], 'original': c['rect'], 'cut': cut,
                                'clean': c['clean'], 'tooSmall': r.height < 18})
                out.append({'qualificationId': row['qualificationId'], 'year': row['year'], 'section': row['section'],
                            'questionPdfSha256': qsha, 'questionNumber': q['questionNumber'], 'status': q['status'],
                            'stemCoverage': q.get('stemCoverage'), 'candidates': ref})
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('questions', len(out), 'trimmed', sum(1 for x in out for c in x['candidates'] if c['cut']))


if __name__ == '__main__':
    main()
