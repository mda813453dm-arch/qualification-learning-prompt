"""未検証の問について、本文の最後の行と選択肢の最初の行の間（図が置かれる帯）を図だけの範囲の候補にする（承認はしない。目視で確かめてから使う）。

監査の候補が本文・選択肢と重なって使えない問で、原本の行の位置から
「本文の最後の行の下端」〜「選択肢の最初の行の上端」を取り、余白を上下左右から削る。
本文の続き（図の後の文）がある問は、図の下端を次の本文の行の上端までにする。
候補は必ず目視で確かめてから figure_separation_manual.json の questions に書く。

使い方：
  QLP_OCR=vision QLP_VISION_CACHE=<控え> python3 tools/band_figure_candidates.py --audit a.json --registry ../engine/data/figure-separation.json \
      --shared <共有結果> --pdf <PDF> --out band.json
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
from choice_region_candidates import FIRST, loose_starts, NEXT_Q, FOOTER  # noqa: E402


def ink_box(page, clip, pad=3.0):
    """clip の中の墨の外接矩形（無ければ None）。"""
    pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(2, 2), colorspace=fitz.csGRAY, alpha=False)
    w, h, s = pix.width, pix.height, pix.samples
    xs, ys = [], []
    for y in range(h):
        row = s[y * w:(y + 1) * w]
        hit = [x for x in range(0, w, 1) if row[x] < 160]
        if len(hit) >= 2:
            ys.append(y); xs.append(hit[0]); xs.append(hit[-1])
    if not ys:
        return None
    r = fitz.Rect(clip.x0 + min(xs) / 2 - pad, clip.y0 + ys[0] / 2 - pad, clip.x0 + (max(xs) + 1) / 2 + pad, clip.y0 + (ys[-1] + 1) / 2 + pad)
    return r & clip


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', nargs='+', required=True)
    ap.add_argument('--registry', required=True)
    ap.add_argument('--shared', required=True)
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    reg = json.load(open(a.registry))['questions']
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
            doc, cache = None, {}
            for q in row['questions']:
                n = q['questionNumber']
                e = reg.get(f'{qsha}:{n}@{row["section"]}') or reg.get(f'{qsha}:{n}')
                if not e or e['status'] not in ('unverified', 'choice_image'):
                    continue
                p = packets.get((qsha, row['section'], n))
                if not p:
                    continue
                doc = doc or fitz.open(os.path.join(a.pdf, f'{qsha}.pdf'))
                kind = 'ア' if any(re.fullmatch(r'[アイウエ]', str(c)) for c in p.get('choices') or []) else '1'
                pages = []
                for pno, region in A.question_regions(p, doc):
                    page = doc[pno - 1]
                    lines, _ = A.page_lines(page, p, cache)
                    lines = [A.Line(l.x0, l.y0, l.x1, l.y1, l.text, l.words) for l in lines]
                    A.classify_lines(lines, p, region.y0, region.y1)
                    inside = sorted([l for l in lines if l.kind != 'outside'], key=lambda l: l.y0)
                    norm = [unicodedata.normalize('NFKC', l.text).strip() for l in inside]
                    starts = [i for i, t in enumerate(norm) if FIRST[kind].match(t)] or loose_starts(inside, kind)
                    ch = None
                    if starts:
                        ch = inside[starts[-1] if kind == 'ア' else starts[0]]
                    stop = next((l for l, t in zip(inside, norm) if (NEXT_Q.match(t) and l.y0 > region.y0 + 5) or FOOTER.match(t)), None)
                    bottom = min([region.y1] + ([ch.y0 - 2] if ch else []) + ([stop.y0 - 2] if stop else []))
                    stems = [l for l in inside if l.kind in ('stem', 'heading') and l.y1 <= bottom]
                    # 図の上端：図より上の本文の最後の行。図の後に本文が続く場合は、帯の中で幅の広い本文の行で切る
                    col = max(1.0, max((l.x1 for l in inside), default=1) - min((l.x0 for l in inside), default=0))
                    wide = [l for l in stems if l.rect.width >= 0.55 * col]
                    top = region.y0
                    gaps = []
                    ys = sorted([(l.y0, l.y1) for l in wide])
                    prev = region.y0
                    for y0, y1 in ys:
                        if y0 - prev > 2.5 * (y1 - y0 + 1):
                            gaps.append((prev, y0))
                        prev = max(prev, y1)
                    if bottom - prev > 10:
                        gaps.append((prev, bottom))
                    for g0, g1 in gaps:
                        clip = fitz.Rect(region.x0, g0 + 1.5, region.x1, g1 - 1.5)
                        if clip.height < 14:
                            continue
                        box = ink_box(page, clip)
                        if box and box.height >= 14 and box.width >= 30:
                            pages.append({'page': pno, 'rect': [round(v, 1) for v in box]})
                out.append({'qualificationId': row['qualificationId'], 'year': row['year'], 'section': row['section'],
                            'questionPdfSha256': qsha, 'questionNumber': n, 'status': e['status'],
                            'stemCoverage': q.get('stemCoverage'), 'candidates': pages})
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('questions', len(out), 'withCandidate', sum(1 for x in out if x['candidates']))


if __name__ == '__main__':
    main()
