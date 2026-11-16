"""図表分離の監査（読み取り専用）。

保存済みの出題パケット（共有の分解結果）と公式PDFを突き合わせ、各問の「図」画像が
図表だけを写しているか（本文・選択肢・問番号が混ざっていないか）を、PDFの座標で調べる。

- 文字の位置：PDFの文字層（読めるページ）または OCR（Vision の控え。無ければ Tesseract。Vision は呼ばない）。
- 本文・選択肢の行：保存済みの本文・選択肢と、行の文字列を照合して見分ける。
- 図表の範囲：本文・選択肢・問番号の行を白く消したあとに残る線（表の罫線・図）と、その中の字。

出力（--out のフォルダ）:
- audit.json：問ごとの判定と、図表だけを切り出し直した範囲の候補（検証できたものだけ）
- sheets/*.png：判定ごとの見本（目で確かめるため）

判定（question.status）:
- pass：図は不要で画像もない、または全画像が図表だけ（本文・選択肢・問番号なし）で、図表をすべて含む
- fixable：今の画像は本文などを含むが、図表だけの範囲を検証付きで求められた（registry に載せる）
- text_only_fixable：図表が無いのに画像（問題全体）がある。画像を出さなければよい
- unverified：図表の範囲を安全に決められない（推測で切り出さない）
- image_question：本文が文字として無い（原本画像で出す問題）
- choice_image：選択肢を文字にできず画像で出す問題（選択肢の範囲だけを切り出す候補を付ける）
"""

import argparse
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
from difflib import SequenceMatcher

import fitz

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from qlp_parser import ocr  # noqa: E402

INK = 160
ZOOM = 2
MARGIN = 4
CAPTION = re.compile(r"^[〔\[(（]?\s*(?:図|表|資料|グラフ|別表|写真|地図)\s*[0-9０-９A-Za-zＡ-Ｚ①-⑳一二三四五六七八九十ーｰ\-－]*\s*[〕\])）]?\s*$")
CAPTION_HEAD = re.compile(r"^(?:図|表|資料|グラフ|別表|写真|地図)\s*[0-9０-９]")
HEADING = re.compile(r"^[\[〔【(（「{｛_'`]*\s*(?:No\s*[.．。]?\s*\d{1,2}|問\s*\d{1,3}|第\s*\d{1,3}\s*問)\s*[〕】\])）」}｝J]?")
CHOICE_MARK = re.compile(r"^\s*(?:[1-9１-９](?:[.．。)）]|\s)|[(（][1-9１-９][)）]|[ア-オ][.．。)）]|[a-eａ-ｅ][.．。)）]|[①-⑨])")
FIG_REF = re.compile(r"(?:図|表|グラフ|地図|写真|資料)\s*[0-9０-９①-⑨]|(?:次の|下の|右の|左の|以下の|下記の|上の)\s*(?:図|表|グラフ|地図|写真|フローチャート|画面|資料)|図に示|表に示|図のよう|表のよう|フローチャート|状態遷移図|ER図|構成図")


def norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"[\s,，、。．.・:：;；'\"‘’“”`′″°º~〜～\-−－―ー_|()（）\[\]［］「」『』〔〕【】{}｛｝<>＜＞]", "", s)


class Line:
    __slots__ = ("x0", "y0", "x1", "y1", "text", "n", "kind", "words")

    def __init__(self, x0, y0, x1, y1, text, words=None):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.text = text
        self.n = norm(text)
        self.kind = "other"
        self.words = words or []

    @property
    def rect(self):
        return fitz.Rect(self.x0, self.y0, self.x1, self.y1)

    @property
    def h(self):
        return self.y1 - self.y0


def text_layer_lines(page):
    # 同じ高さの語を1行にまとめる（空欄の枠の中の字は別の塊になるため、塊・行の番号ではまとめない）
    words = sorted(page.get_text("words"), key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    groups = []
    for w in words:
        cy = (w[1] + w[3]) / 2
        if groups and abs(cy - groups[-1][0]) <= max(2.5, 0.35 * (w[3] - w[1])):
            groups[-1][1].append(w)
        else:
            groups.append([cy, [w]])
    out = []
    for _, ws in groups:
        ws.sort(key=lambda w: w[0])
        out.append(Line(min(w[0] for w in ws), min(w[1] for w in ws), max(w[2] for w in ws), max(w[3] for w in ws),
                        " ".join(w[4] for w in ws), [tuple(w[:5]) for w in ws]))
    return sorted(out, key=lambda l: (round(l.y0), l.x0))


def ocr_lines(page):
    out = []
    for ln in ocr.page_ocr(page):
        ws = ln[4]
        if not ws:
            continue
        out.append(Line(min(w[0] for w in ws), min(w[1] for w in ws), max(w[2] for w in ws), max(w[3] for w in ws), ln[2],
                        [tuple(w[:5]) for w in ws]))
    return sorted(out, key=lambda l: (round(l.y0), l.x0))


def page_lines(page, packet, cache):
    key = page.number
    if key in cache:
        return cache[key]
    use_ocr = (packet.get("stemMode") == "ocr" or packet.get("choiceMode") == "ocr" or ocr.needs_ocr(page)
               or len(re.findall(r"[぀-ヿ一-鿿]", page.get_text())) < 30)
    lines, source = None, "text"
    if use_ocr:
        lines, source = ocr_lines(page), "ocr"
    if not lines:
        lines, source = text_layer_lines(page), "text"
    cache[key] = (lines, source)
    return cache[key]


def contains(hay, needle):
    """needle（行）が hay（本文）に含まれる割合（最長一致の長さ / 行の長さ）。OCRの小さな読み違いを許す。"""
    if not needle or not hay:
        return 0.0
    if needle in hay:
        return 1.0
    sm = SequenceMatcher(None, hay, needle, autojunk=False)
    total, i = 0, 0
    for b in sm.get_matching_blocks():
        if b.size >= 3:
            total += b.size
    return total / len(needle)


def prose_like(l, col):
    """本文・選択肢・問番号の行、または図の外の幅の広い文の行（照合できなかった本文のおそれ）。"""
    if l.kind in ("stem", "choice", "heading"):
        return True
    return l.kind == "other" and l.rect.width >= 0.5 * col and len(l.n) >= 12


def classify_lines(lines, packet, region_top, region_bottom):
    stem = norm(packet.get("stem"))
    choices = [norm(c) for c in packet.get("choices") or []]
    choice_text = "".join(choices)
    numbered_choices = all(re.fullmatch(r"[0-9アイウエオ]", c or "") for c in choices)
    for ln in lines:
        if not (region_top - 2 <= (ln.y0 + ln.y1) / 2 <= region_bottom + 2):
            ln.kind = "outside"
            continue
        t = unicodedata.normalize("NFKC", ln.text).strip()
        if HEADING.match(t) and len(ln.n) <= 14:
            ln.kind = "heading"
        elif CAPTION.match(t):
            ln.kind = "caption"
        elif len(ln.n) >= 6 and contains(stem, ln.n) >= 0.75:
            ln.kind = "stem"
        elif CHOICE_MARK.match(t) and (numbered_choices or (len(ln.n) >= 2 and contains(choice_text, ln.n[1:]) >= 0.6)):
            ln.kind = "choice"
        elif len(ln.n) >= 4 and not numbered_choices and contains(choice_text, ln.n) >= 0.8:
            ln.kind = "choice"
        else:
            ln.kind = "other"
    return lines


def render_gray(page, clip):
    pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(ZOOM, ZOOM), colorspace=fitz.csGRAY, alpha=False)
    return pix.width, pix.height, bytearray(pix.samples)


def blank(data, w, h, clip, rects, pad=1.0):
    for r in rects:
        r = fitz.Rect(r) & clip
        if r.is_empty:
            continue
        x0 = max(0, int((r.x0 - clip.x0 - pad) * ZOOM)); x1 = min(w, int((r.x1 - clip.x0 + pad) * ZOOM) + 1)
        y0 = max(0, int((r.y0 - clip.y0 - pad) * ZOOM)); y1 = min(h, int((r.y1 - clip.y0 + pad) * ZOOM) + 1)
        for y in range(y0, y1):
            data[y * w + x0:y * w + x1] = b"\xff" * (x1 - x0)


def ink_rows(data, w, h, min_px=3):
    return [sum(1 for v in data[y * w:(y + 1) * w] if v < INK) >= min_px for y in range(h)]


def ink_blocks(page, clip, text_rects, line_h):
    """clip の中で、字（text_rects）を消したあとに残る線のまとまり [Rect]（行の高さ以上の空きで分ける）。"""
    w, h, data = render_gray(page, clip)
    if not w or not h:
        return []
    blank(data, w, h, clip, text_rects)
    rows = ink_rows(data, w, h)
    blocks, cur, gap = [], None, 0
    for y, on in enumerate(rows):
        if on:
            if cur is None:
                cur = [y, y]
            cur[1], gap = y, 0
        elif cur is not None:
            gap += 1
            if gap > line_h * ZOOM:
                blocks.append(cur); cur = None
    if cur is not None:
        blocks.append(cur)
    out = []
    for y0, y1 in blocks:
        cols = [x for x in range(w) if any(data[y * w + x] < INK for y in range(y0, y1 + 1))]
        if not cols:
            continue
        r = fitz.Rect(clip.x0 + cols[0] / ZOOM, clip.y0 + y0 / ZOOM, clip.x0 + (cols[-1] + 1) / ZOOM, clip.y0 + (y1 + 1) / ZOOM)
        out.append(r)
    return out


def remaining_ink(page, clip, text_rects):
    w, h, data = render_gray(page, clip)
    if not w or not h:
        return 0
    blank(data, w, h, clip, text_rects)
    return sum(1 for v in data if v < INK)


def area(r):
    r = fitz.Rect(r)
    return 0.0 if r.is_empty else r.width * r.height


def inside(rect, ln, frac=0.6):
    r = rect & ln.rect
    if r.is_empty:
        return False
    a = max(1e-6, ln.rect.width * max(ln.rect.height, 1))
    return (r.width * max(r.height, 1)) / a >= frac


def question_regions(packet, doc):
    """問の範囲（ページ番号, Rect）。最初のページは questionRect、続くページは図の範囲・ページ全体（下端の頁番号を除く）。"""
    pages = packet.get("evidence", {}).get("questionPdfPages") or sorted({f["page"] for f in packet.get("figures") or []})
    qr = packet.get("evidence", {}).get("questionRect")
    out = []
    for i, pno in enumerate(pages):
        if not 1 <= pno <= doc.page_count:
            continue
        pr = doc[pno - 1].rect
        if i == 0 and qr:
            r = fitz.Rect(pr.x0, qr[0] - 4, pr.x1, qr[1] + 4)
        else:
            r = fitz.Rect(pr.x0, pr.y0, pr.x1, pr.y1 * 0.93)
        for f in packet.get("figures") or []:
            if f["page"] == pno:
                r |= fitz.Rect(f["rect"])
        out.append((pno, r & pr))
    return out


def audit_packet(doc, packet, cache):
    res = {"questionNumber": packet["questionNumber"], "stemMode": packet.get("stemMode"), "choiceMode": packet.get("choiceMode"),
           "figures": [], "candidates": [], "notes": []}
    stem_text = packet.get("stem") or ""
    res["stemRefersFigure"] = bool(FIG_REF.search(unicodedata.normalize("NFKC", stem_text)))
    if packet.get("stemMode") == "official_image":
        res["status"] = "image_question"
        return res
    regions = question_regions(packet, doc)
    if not regions:
        res["status"] = "unverified"; res["notes"].append("no_page"); return res
    sources = set()
    per_page = {}
    for pno, region in regions:
        page = doc[pno - 1]
        lines, source = page_lines(page, packet, cache)
        sources.add(source)
        lines = [Line(l.x0, l.y0, l.x1, l.y1, l.text, l.words) for l in lines]
        classify_lines(lines, packet, region.y0, region.y1)
        per_page[pno] = (page, region, [l for l in lines if l.kind != "outside"])
    res["textSource"] = sorted(sources)
    # 本文の行の高さ
    hs = sorted(l.h for _, _, ls in per_page.values() for l in ls if l.kind == "stem") or sorted(l.h for _, _, ls in per_page.values() for l in ls) or [10]
    line_h = max(6.0, hs[len(hs) // 2])
    res["lineHeight"] = round(line_h, 1)
    stem_chars = sum(len(l.n) for _, _, ls in per_page.values() for l in ls if l.kind == "stem")
    res["stemCoverage"] = round(stem_chars / max(1, len(norm(stem_text))), 2)
    # 図表の候補：すべての字を消して残る線（罫線・図）のまとまり。本文の行の帯に収まる飾り（空欄の枠）は除く
    prose_kinds = ("stem", "choice", "heading")
    candidates = []
    for pno, (page, region, lines) in per_page.items():
        allwords = [fitz.Rect(w[:4]) for l in lines for w in (l.words or [(l.x0, l.y0, l.x1, l.y1, "")])]
        blocks = ink_blocks(page, region, allwords, line_h)
        col = max(1.0, max((l.x1 for l in lines), default=1) - min((l.x0 for l in lines), default=0))
        prose_bands = [(l.y0 - 1, l.y1 + 1) for l in lines if l.kind in prose_kinds and l.rect.width >= 0.5 * col]
        structs = []
        for b in blocks:
            if b.height < 2.2 * line_h:
                continue
            covered_rows = sum(1 for k in range(int(b.y0), int(b.y1) + 1) if any(y0 <= k <= y1 for y0, y1 in prose_bands))
            if covered_rows >= 0.5 * max(1, b.height):
                continue
            structs.append(b)
        for b in structs:
            grown = b + (-3, -0.8 * line_h, 3, 0.8 * line_h)
            # 図の中の字（地名・数値・表の欄）。本文と同じ語でも、幅の狭い行は図の中の字とみなす
            members = [l for l in lines if l.kind in ("other", "caption", "stem", "choice")
                       and grown.contains(fitz.Point((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2))
                       and l.x0 >= grown.x0 - line_h and l.x1 <= grown.x1 + line_h
                       and (l.kind in ("other", "caption") or l.rect.width < 0.5 * col
                            or (b.contains(l.rect) and b.height >= 3 * line_h))]
            for l in members:
                l.kind = "figure_text"
            box = fitz.Rect(b)
            for l in members:
                box |= l.rect
            # 図の見出し（表6・図1）と、図のすぐ上下の短いラベル
            for l in lines:
                near = (box + (-line_h, -2.2 * line_h, line_h, 2.2 * line_h)).intersects(l.rect)
                cap_near = (box + (-line_h, -3.5 * line_h, line_h, 3.5 * line_h)).intersects(l.rect)
                if (cap_near and l.kind == "caption") or near and ( (l.kind == "other" and l.rect.width < 0.6 * box.width
                                                      and (l.y1 <= box.y0 + 2 or l.y0 >= box.y1 - 2) and len(l.n) <= 20)):
                    l.kind = "figure_text" if l.kind == "other" else l.kind
                    box |= l.rect
            # 図表の直後の注記（凡例・記号の説明）。選択肢の直前の列の見出しは選択肢側に残す
            first_choice = min((l.y0 for l in lines if l.kind == "choice"), default=1e9)
            for l in sorted(lines, key=lambda l: l.y0):
                if l.y0 < box.y1 - 1:
                    continue
                if l.kind != "other" or l.y0 - box.y1 > 2.5 * line_h or l.y1 > first_choice - 1.6 * line_h:
                    break
                l.kind = "figure_text"
                box |= l.rect
            box = (box + (-MARGIN, -MARGIN, MARGIN, MARGIN)) & page.rect
            candidates.append({"page": pno, "rect": [round(v, 1) for v in box]})
    # 重なる候補をまとめる
    merged = []
    for c in sorted(candidates, key=lambda c: (c["page"], c["rect"][1])):
        if merged and merged[-1]["page"] == c["page"] and (fitz.Rect(merged[-1]["rect"]) + (0, 0, 0, 1.2 * line_h)).intersects(fitz.Rect(c["rect"])):
            m = merged[-1]
            m["rect"] = [round(v, 1) for v in (fitz.Rect(m["rect"]) | fitz.Rect(c["rect"]))]
        else:
            merged.append(dict(c))
    for m in merged:
        page, region, lines = per_page[m["page"]]
        col = max(1.0, max((l.x1 for l in lines), default=1) - min((l.x0 for l in lines), default=0))
        bad = [l for l in lines if prose_like(l, col) and inside(fitz.Rect(m["rect"]), l, 0.25)]
        m["clean"] = not bad
        m["intrudes"] = sorted({l.kind for l in bad})
        # 図の位置：図より下にある本文の行（図のあとに続く文）
        below = [l for l in lines if l.kind == "stem" and l.y0 >= m["rect"][3] - 1]
        m["stemLinesBelow"] = len(below)
        if below:
            m["firstStemLineBelow"] = below[0].text
        # 問題の範囲の中で、本文・選択肢・図のどれにも入らない行（本文の欠落のおそれ）
    res["candidates"] = merged
    stray = [l.text for _, (_, _, ls) in per_page.items() for l in ls if l.kind == "other" and len(l.n) >= 6]
    if stray:
        res["unaccountedLines"] = stray[:6]
    # 今の画像の判定
    for f in packet.get("figures") or []:
        page, region, lines = per_page.get(f["page"], (None, None, []))
        fr = fitz.Rect(f["rect"])
        inl = [l for l in lines if inside(fr, l, 0.5)]
        kinds = {}
        for l in inl:
            kinds[l.kind] = kinds.get(l.kind, 0) + len(l.n)
        col = max(1.0, max((l.x1 for l in lines), default=1) - min((l.x0 for l in lines), default=0))
        stem_in = kinds.get("stem", 0) + sum(len(l.n) for l in inl if l.kind == "other" and prose_like(l, col))
        choice_in = sum(1 for l in inl if l.kind == "choice")
        heading_in = kinds.get("heading", 0) > 0
        covers = [c for c in merged if c["page"] == f["page"] and fitz.Rect(c["rect"]).intersects(fr)
                  and area(fitz.Rect(c["rect"]) & fr) >= 0.8 * area(c["rect"])]
        ink = remaining_ink(page, fr, [l.rect for l in lines]) if page is not None else 0
        tall = page is not None and fr.height >= 0.8 * page.rect.height
        if heading_in or tall or (stem_in >= 0.5 * max(1, stem_chars) and choice_in >= 2):
            verdict = "whole_question"
        elif stem_in >= 6 or choice_in:
            verdict = "contains_text"
        elif not covers and ink < 400:
            verdict = "text_only"
        else:
            verdict = "figure_only"
        res["figures"].append({"file": f["file"], "page": f["page"], "rect": f["rect"], "verdict": verdict,
                               "stemCharsInside": stem_in, "choiceLinesInside": choice_in, "headingInside": heading_in})
    figs = res["figures"]
    needed = [c for c in merged]
    covered = lambda c: any(fv["verdict"] == "figure_only" and fv["page"] == c["page"] and  # noqa: E731
                            area(fitz.Rect(fv["rect"]) & fitz.Rect(c["rect"])) >= 0.9 * area(c["rect"]) for fv in figs)
    if res["stemCoverage"] < 0.6:
        # 保存した本文の行をページの上で見つけられない：何も判定しない（推測で切り出さない）
        res["status"] = "unverified"
        res["notes"].append("stem_text_not_located")
    elif packet.get("choiceMode") == "official_image":
        res["status"] = "choice_image"
        res["choiceRegion"] = choice_region(per_page, merged, line_h)
    elif not figs and not needed:
        res["status"] = "pass"
    elif figs and all(fv["verdict"] == "figure_only" for fv in figs) and all(covered(c) for c in needed):
        res["status"] = "pass"
    elif not needed and all(fv["verdict"] in ("whole_question", "contains_text", "text_only") for fv in figs):
        # 図表が無い（本文・選択肢だけ）。図表の言及があれば安全側で未検証
        res["status"] = "unverified" if res["stemRefersFigure"] else "text_only_fixable"
    elif needed and all(c["clean"] for c in needed):
        res["status"] = "fixable"
    else:
        res["status"] = "unverified"
        if needed and not all(c["clean"] for c in needed):
            res["notes"].append("candidate_overlaps_text")
        elif not needed:
            res["notes"].append("figure_reference_without_detected_figure")
    if "ocr" in sources and packet.get("stemMode") == "text":
        res["notes"].append("ocr_used_for_text_layer_question")
    return res


def choice_region(per_page, merged, line_h):
    """選択肢の行（と、そのすぐ上の列の見出し）の範囲。図表の候補や本文と重なれば None。"""
    for pno, (page, region, lines) in per_page.items():
        ch = [l for l in lines if l.kind == "choice"]
        if len(ch) < 2:
            continue
        top = min(l.y0 for l in ch)
        head = [l for l in lines if l.kind in ("other", "figure_text") and top - 3.2 * line_h <= l.y0 < top and len(l.n) <= 12]
        r = fitz.Rect(min(l.x0 for l in ch + head), min(l.y0 for l in ch + head), max(l.x1 for l in ch + head), max(l.y1 for l in ch))
        r = (r + (-MARGIN, -MARGIN, MARGIN * 2, MARGIN)) & page.rect
        if any(l.kind in ("stem", "heading") and inside(r, l, 0.25) for l in lines):
            return None
        if any(c["page"] == pno and fitz.Rect(c["rect"]).intersects(r) and (fitz.Rect(c["rect"]) & r).height > line_h for c in merged
               if not (fitz.Rect(c["rect"]).y0 >= r.y0 - 2)):
            return None
        return {"page": pno, "rect": [round(v, 1) for v in r]}
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shared", required=True)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    results = []
    files = sorted(glob.glob(os.path.join(a.shared, "*", "*.json")))
    if a.only:
        files = [f for f in files if re.search(a.only, f)]
    for f in files:
        r = json.load(open(f, encoding="utf-8"))["result"]
        path = os.path.join(a.pdf, r["questionPdfSha256"] + ".pdf")
        row = {"file": os.path.basename(f), "qualificationId": r["qualificationId"], "year": r["year"], "section": r["section"],
               "questionPdfSha256": r["questionPdfSha256"], "parserVersion": r["parserVersion"], "questions": []}
        if not os.path.exists(path):
            row["error"] = "PDF_MISSING"
            results.append(row)
            continue
        doc = fitz.open(path)
        if hashlib.sha256(open(path, "rb").read()).hexdigest() != r["questionPdfSha256"]:
            row["error"] = "PDF_SHA_MISMATCH"
            results.append(row)
            continue
        cache = {}
        for p in r["packets"]:
            try:
                q = audit_packet(doc, p, cache)
            except Exception as e:  # noqa: BLE001
                q = {"questionNumber": p.get("questionNumber"), "status": "unverified", "notes": ["audit_error:" + type(e).__name__ + ":" + str(e)[:80]],
                     "figures": [], "candidates": []}
            q["questionId"] = p.get("questionId")
            row["questions"].append(q)
        results.append(row)
        print(row["file"], {s: sum(1 for q in row["questions"] if q["status"] == s) for s in sorted({q["status"] for q in row["questions"]})}, flush=True)
    json.dump(results, open(os.path.join(a.out, "audit.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
