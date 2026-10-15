"""測量士補アダプタのテスト（合成PDF）。

R8の問題PDFと同じく、日本語の文字を図形（塗りつぶした多角形）で描いたPDFを作って確かめる。
OCRは本物を使わず、図形の形から字を返す代わりのもの（FakeOcr）で、対応づけ・多数決・
読めなかった字の扱いを確かめる。本物のOCRでの確認は test_surveyor_r8_official.py。
"""

import math
import unittest
from unittest import mock

import fitz

from qlp_parser import ocr
from qlp_parser.adapters import surveyor
from qlp_parser.cli import run
from qlp_parser.core import PdfSource, sha256

KEYS = []  # 図形の字の一覧。頂点の数で字を見分ける（3頂点＝KEYS[0]）

QURL = "https://example.invalid/surveyor-q.pdf"
AURL = "https://example.invalid/surveyor-a.pdf"


def glyph(page, x, y, key):
    """1文字分の図形。key ごとに頂点の数が違い、同じ key は同じ形になる。"""
    if key not in KEYS:
        KEYS.append(key)
    n = 3 + KEYS.index(key)
    pts = [fitz.Point(x + 4 + 4 * math.cos(2 * math.pi * k / n + len(key)), y + 4 + 4 * math.sin(2 * math.pi * k / n + len(key))) for k in range(n)]
    sh = page.new_shape()
    sh.draw_polyline(pts + [pts[0]])
    sh.finish(color=None, fill=(0, 0, 0), closePath=True)
    sh.commit()


def heading(page, number):
    keys = ["〔", "N", "o", "."] + [f"d{c}" for c in str(number)] + ["〕"]
    x = 75
    for k, key in enumerate(keys):
        if k == 4:
            x += 6  # 「No.」と数字の間の空白
        glyph(page, x, 76, key)
        x += 10


def outlined_line(page, y, text, x=93):
    for k, ch in enumerate(text):
        glyph(page, x + 11 * k, y, ch)


STEM1, STEM2 = "次の文の正しいものを選べ", "測量の問題である。"


def question_page(doc, number, choices=None, outlined_choices=False, markers=5, figure=False, column_header=False,
                  underline=False):
    page = doc.new_page(width=595, height=842)
    heading(page, number)
    outlined_line(page, 96, STEM1, x=104)  # 段落の1行目は字下げ
    outlined_line(page, 116, STEM2)
    if figure:
        glyph(page, 150, 160, "A")  # 図の上のラベル
        page.draw_rect(fitz.Rect(150, 172, 400, 260), color=(0, 0, 0), width=1)
    choices = choices or [f"{100 + number}.{k}0 m" for k in range(1, 6)]
    if column_header:  # 選択肢の上の列見出し「ア イ」
        glyph(page, 120, 282, "ア")
        glyph(page, 160, 282, "イ")
    for k in range(markers):
        y = 300 + 20 * k
        page.insert_text((93, y + 9), str(k + 1), fontname="helv", fontsize=10)
        glyph(page, 99, y + 6, ".")  # 番号の後ろの「.」（R8では図形）
        page.insert_text((113, y + 9), choices[k], fontname="helv", fontsize=10)
        if outlined_choices:
            outlined_line(page, y + 1, "です", x=170)
    if underline:  # 選択肢1の数値の下線
        page.draw_line(fitz.Point(112, 311), fitz.Point(144, 311), color=(0, 0, 0), width=0.5)
    glyph(page, 290, 798, "page")  # ページ番号
    return page


def make_question_pdf(n=20, order=None, per_question=None):
    doc = fitz.open()
    cover = doc.new_page(width=595, height=842)
    for k in range(4):
        glyph(cover, 200 + 12 * k, 70, f"cover{k}")
    for k in range(5):  # 表紙の注意事項の箇条（1〜5）
        cover.insert_text((93, 400 + 20 * k), str(k + 1), fontname="helv", fontsize=10)
    for number in order or range(1, n + 1):
        question_page(doc, number, **(per_question or {}).get(number, {}))
    data = doc.tobytes()
    doc.close()
    return data


def make_answer_pdf(answers, era="８"):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "問題 正解", fontname="japan", fontsize=10)
    fw = str.maketrans("0123456789", "０１２３４５６７８９")
    y = 80
    for n, a in answers.items():
        page.insert_text((50, y), f"No.{str(n).translate(fw)}", fontname="japan", fontsize=10)
        page.insert_text((120, y), str(a).translate(fw), fontname="japan", fontsize=10)
        y += 16
    page.insert_text((50, y + 20), f"令和{era}年測量士補試験解答", fontname="japan", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


ANSWERS = {n: (n % 5) + 1 for n in range(1, 29)}


def go(qdata, adata=None, year=2026, assets=None):
    return run("surveyor", year, PdfSource(qdata, QURL), PdfSource(adata or make_answer_pdf(ANSWERS), AURL), assets=assets)


class FakeOcr:
    """図形の頂点の数から字を返すOCRの代わり。misread・drop で読み違い・読み落としを起こせる。"""

    def __init__(self, misread=None, drop=None, single=True):
        self.store, self.misread, self.drop, self.single = [], dict(misread or {}), set(drop or ()), single

    @staticmethod
    def key(g):
        return KEYS[len(g["items"]) - 3]

    def draw(self, glyphs):
        self.store.append(glyphs)
        return f"tok{len(self.store) - 1}".encode(), min(g["rect"].x0 for g in glyphs) - 3

    def read_lines(self, pngs, workers=8):
        out = []
        for png in pngs:
            gl = self.store[int(png[3:])]
            off = min(g["rect"].x0 for g in gl) - 3
            line = []
            for g in gl:
                ch = self.key(g)
                if ch in self.drop:
                    continue
                if ch in self.misread:
                    ch = self.misread.pop(ch)  # 1回だけ読み違える
                z = surveyor.OCR_ZOOM
                line.append((ch, int((g["rect"].x0 - off) * z), int((g["rect"].x1 - off) * z), 90.0))
            out.append(line)
        return out

    def read_chars(self, pngs, workers=8):
        return [self.key(self.store[int(p[3:])][0]) if self.single else None for p in pngs]

    def patch(self):
        return [mock.patch.object(surveyor, "_draw_glyphs", self.draw), mock.patch.object(ocr, "read_lines", self.read_lines),
                mock.patch.object(ocr, "read_chars", self.read_chars), mock.patch.object(ocr, "available", lambda: True)]


def with_ocr(fake, fn):
    patches = fake.patch()
    for pt in patches:
        pt.start()
    try:
        return fn()
    finally:
        for pt in patches:
            pt.stop()


class SurveyorOcr(unittest.TestCase):
    """日本語が図形のPDFを、OCRで文字にする（2026-10-15 水野さん決定）。"""

    def test_stem_and_choices_become_text(self):
        q = make_question_pdf(20, per_question={3: {"outlined_choices": True}})
        r = with_ocr(FakeOcr(), lambda: go(q))
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        p1, p3 = r["packets"][0], r["packets"][2]
        self.assertEqual((p1["stemMode"], p1["stem"]), ("ocr", STEM1 + STEM2))
        self.assertEqual(p1["verification"]["questionText"], "ocr_unverified")
        self.assertEqual((p1["choiceMode"], p1["choices"][0]), ("text", "101.10 m"))
        self.assertEqual((p3["choiceMode"], p3["choices"][1]), ("ocr", "103.20 mです"))
        self.assertEqual(p1["figures"], [])  # 図のない問は画像を付けない
        self.assertEqual(p1["evidence"]["notes"], ["ocr"])

    def test_single_misread_is_corrected_by_majority(self):
        r = with_ocr(FakeOcr(misread={"測": "側"}), lambda: go(make_question_pdf(20)))
        self.assertTrue(all(p["stem"] == STEM1 + STEM2 for p in r["packets"]))

    def test_dropped_char_is_recovered(self):
        # 「問」が読み落とされて字の数が合わない行は、形ごとの多数決と1字ずつの読み直しで組み立てる
        r = with_ocr(FakeOcr(drop={"問"}), lambda: go(make_question_pdf(20)))
        self.assertEqual(r["packets"][0]["stem"], STEM1 + STEM2)

    def test_unreadable_char_is_marked(self):
        r = with_ocr(FakeOcr(drop={"問"}, single=False), lambda: go(make_question_pdf(20)))
        p = r["packets"][0]
        self.assertEqual(p["stem"], STEM1 + STEM2.replace("問", "〓"))
        self.assertIn("ocr_unknown:1", p["evidence"]["notes"])

    def test_figure_is_cropped_without_the_stem(self):
        assets = {}
        r = with_ocr(FakeOcr(), lambda: go(make_question_pdf(20, per_question={2: {"figure": True}}), assets=assets))
        p = r["packets"][1]
        self.assertEqual(p["stem"], STEM1 + STEM2)  # 図のラベル「A」は本文に入れない
        self.assertTrue(p["diagramRequired"])
        x0, y0, x1, y1 = p["figures"][0]["rect"]
        self.assertGreater(y0, 126)  # 本文の下から
        self.assertLessEqual(y0, 160)  # ラベルを含む
        self.assertGreaterEqual(y1, 260)
        self.assertLess(y1, 300)  # 選択肢は含めない
        self.assertTrue(assets[p["figures"][0]["file"]].startswith(b"\x89PNG"))

    def test_column_header_labels_choices(self):
        q = make_question_pdf(20, per_question={4: {"column_header": True, "choices": [f"{k} m      {k}0 s" for k in range(1, 6)]}})
        p = with_ocr(FakeOcr(), lambda: go(q))["packets"][3]
        self.assertEqual(p["choices"][0], "ア：1 m、イ：10 s")
        self.assertEqual(p["figures"], [])

    def test_underline_is_marked(self):
        p = with_ocr(FakeOcr(), lambda: go(make_question_pdf(20, per_question={5: {"underline": True}})))["packets"][4]
        self.assertEqual(p["choices"][0], "［105.10］ m")
        self.assertIn("underline", p["evidence"]["notes"])


class SurveyorOutlined(unittest.TestCase):
    """OCRが使えない環境：本文は公式PDFの画像で見せる。"""

    def setUp(self):
        patcher = mock.patch.object(ocr, "available", lambda: False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_all_questions_ready_with_official_crops(self):
        assets = {}
        r = go(make_question_pdf(20, per_question={3: {"outlined_choices": True}, 4: {"column_header": True}}), assets=assets)
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        self.assertEqual([p["questionNumber"] for p in r["packets"]], list(range(1, 21)))
        self.assertEqual([p["evidence"]["questionPdfPages"] for p in r["packets"]], [[n + 1] for n in range(1, 21)])
        self.assertEqual([p["correctAnswer"] for p in r["packets"]], [ANSWERS[n] for n in range(1, 21)])
        p1, p3 = r["packets"][0], r["packets"][2]
        self.assertEqual((p1["stemMode"], p1["stem"]), ("official_image", ""))
        self.assertEqual((p1["choiceMode"], p1["choices"][0]), ("text", "101.10 m"))
        # 選択肢に図形の文字が混じる問は、番号だけにして画像で見せる
        self.assertEqual((p3["choiceMode"], p3["choices"]), ("official_image", ["1", "2", "3", "4", "5"]))
        self.assertEqual(p3["verification"]["choices"], "official_pdf_image")
        # 列見出しのある選択肢も、文字だけでは意味が伝わらないので画像で見せる
        self.assertEqual(r["packets"][3]["choiceMode"], "official_image")
        self.assertEqual(r["packets"][4]["choiceMode"], "text")
        fig = p1["figures"][0]
        self.assertEqual(fig["page"], 2)
        self.assertEqual(fig["zoom"], 3)
        data = assets[fig["file"]]
        self.assertTrue(data.startswith(b"\x89PNG"))
        self.assertEqual(fig["sha256"], sha256(data))
        # 見出しから最後の選択肢までを含み、ページ番号は含まない
        x0, y0, x1, y1 = fig["rect"]
        self.assertLessEqual(y0, 76)
        self.assertGreaterEqual(y1, 389)
        self.assertLess(y1, 798)

    def test_swapped_pages_are_rejected(self):
        order = list(range(1, 21))
        order[3], order[4] = order[4], order[3]
        r = go(make_question_pdf(order=order))
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "QUESTION_NUMBER_UNVERIFIED"))

    def test_missing_page_is_rejected(self):
        r = go(make_question_pdf(order=[n for n in range(1, 22) if n != 10]))
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "QUESTION_NUMBER_UNVERIFIED"))

    def test_too_few_questions_to_verify_numbers(self):
        r = go(make_question_pdf(5))
        self.assertEqual((r["status"], r["reason"], r["detail"]["reason"]), ("unavailable", "QUESTION_NUMBER_UNVERIFIED", "too_few_questions"))

    def test_missing_choice_excludes_only_that_question(self):
        r = go(make_question_pdf(20, per_question={7: {"markers": 4}}))
        self.assertEqual(r["status"], "partial")
        self.assertEqual(r["excluded"], [{"questionNumber": 7, "reason": "CHOICES_INCOMPLETE", "pages": [8]}])
        self.assertEqual(r["packetCount"], 19)

    def test_answer_year_mismatch(self):
        r = go(make_question_pdf(20), make_answer_pdf(ANSWERS, era="７"))
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "ANSWER_YEAR_MISMATCH"))

    def test_missing_answer_excludes_question(self):
        r = go(make_question_pdf(20), make_answer_pdf({n: a for n, a in ANSWERS.items() if n != 12}))
        self.assertEqual([(e["questionNumber"], e["reason"]) for e in r["excluded"]], [(12, "OFFICIAL_ANSWER_NOT_FOUND")])

    def test_deterministic_output(self):
        q, a = make_question_pdf(20), make_answer_pdf(ANSWERS)
        a1, a2 = {}, {}
        self.assertEqual(go(q, a, assets=a1), go(q, a, assets=a2))
        self.assertEqual(a1, a2)


class SurveyorTextPdf(unittest.TestCase):
    """見出し・本文が文字で読める年度のPDF。"""

    def make(self, figure=False, superscript=False):
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((75, 85), "〔No. 1〕", fontname="japan", fontsize=10)
        page.insert_text((93, 105), "次の文は、測量法に規定された", fontname="japan", fontsize=10)
        page.insert_text((75, 125), "事項について述べたものである。", fontname="japan", fontsize=10)
        if figure:
            page.draw_rect(fitz.Rect(150, 150, 400, 260), color=(0, 0, 0), width=1)
        for k in range(5):
            y = 309 + 20 * k
            page.insert_text((93, y), f"{k + 1}", fontname="japan", fontsize=10)
            page.insert_text((113, y), f"{10 * (k + 1)} m", fontname="japan", fontsize=10)
            if superscript:
                page.insert_text((113 + fitz.get_text_length(f"{10 * (k + 1)} m", fontname="japan", fontsize=10) + 0.5, y - 4), "2", fontname="japan", fontsize=6)
        data = doc.tobytes()
        doc.close()
        return data

    def test_text_stem_and_choices(self):
        r = go(self.make())
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        p = r["packets"][0]
        self.assertEqual((p["stemMode"], p["choiceMode"]), ("text", "text"))
        self.assertEqual(p["stem"], "次の文は、測量法に規定された事項について述べたものである。")
        self.assertEqual(p["choices"], ["10 m", "20 m", "30 m", "40 m", "50 m"])
        self.assertEqual(p["figures"], [])

    def test_figure_is_cropped(self):
        r = go(self.make(figure=True))
        p = r["packets"][0]
        self.assertEqual(r["status"], "ready")
        self.assertTrue(p["diagramRequired"])
        self.assertEqual(p["verification"]["visual"], "official_pdf_crop_rendered")

    def test_superscript_unit(self):
        p = go(self.make(superscript=True))["packets"][0]
        self.assertEqual(p["choices"][0], "10 m²")


if __name__ == "__main__":
    unittest.main()
