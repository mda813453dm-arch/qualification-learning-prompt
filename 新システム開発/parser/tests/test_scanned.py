"""スキャンした紙（画像だけのPDF）をOCRで読むテスト。合成PDFを画像にしてから読む。Tesseract（jpn）が無ければ飛ばす。"""

import unittest

import fitz

from qlp_parser import ocr
from qlp_parser.adapters import surveyor, takken
from qlp_parser.cli import run
from qlp_parser.core import ANSWER_SPECIAL, PdfSource
from tests.test_surveyor_synthetic import SurveyorTextPdf
from tests.test_surveyor_synthetic import go as survey
from tests.test_takken_synthetic import ANS, Q, URL, make_pdf


def rasterize(data, dpi=200):
    src = fitz.open(stream=data, filetype="pdf")
    out = fitz.open()
    for p in src:
        page = out.new_page(width=p.rect.width, height=p.rect.height)
        page.insert_image(page.rect, stream=p.get_pixmap(dpi=dpi).tobytes("png"))
    return out.tobytes()


@unittest.skipUnless(ocr.available(), "Tesseract（jpn）が無い")
class TakkenScanned(unittest.TestCase):
    def test_scanned_pdf_is_read_by_ocr_with_official_image(self):
        r = run("takken", 2025, PdfSource(rasterize(make_pdf(Q, ANS)), URL), assets={})
        self.assertEqual(r["status"], "ready", r.get("excluded"))
        self.assertEqual([p["correctAnswer"] for p in r["packets"]], [3, 1, 4])
        p1 = r["packets"][0]
        self.assertEqual(p1["stemMode"], "ocr")
        self.assertIn("民法", p1["stem"])
        self.assertEqual(len(p1["choices"]), 4)
        self.assertTrue(p1["figures"], "OCRで読んだ問題は公式PDFの画像も付ける")


@unittest.skipUnless(ocr.available(), "Tesseract（jpn）が無い")
class SurveyorScanned(unittest.TestCase):
    def test_scanned_page_is_read_by_ocr(self):
        r = survey(rasterize(SurveyorTextPdf().make(figure=True)))
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        p = r["packets"][0]
        self.assertEqual((p["stemMode"], p["choiceMode"]), ("ocr", "ocr"))
        self.assertEqual(p["stem"], "次の文は、測量法に規定された事項について述べたものである。")
        self.assertEqual(p["choices"], ["10 m", "20 m", "30 m", "40 m", "50 m"])
        self.assertTrue(p["figures"], "OCRで読んだ問題でも図は付ける")
        # 図だけを切り出す（問題文・選択肢は文字で出すので、1問分の画像にしない）
        x0, y0, x1, y1 = p["figures"][0]["rect"]
        self.assertGreater(y0, 126)
        self.assertLess(y1, 290)
        self.assertGreater(x1, 395, "字より右へはみ出す図も切らない")

    def test_blank_box_in_the_text_is_not_a_figure(self):
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((75, 85), "〔No. 1〕", fontname="japan", fontsize=10)
        page.insert_text((93, 105), "次の文は、測量法に規定された事項について述べたものである。", fontname="japan", fontsize=10)
        page.insert_text((75, 125), "測量とは、", fontname="japan", fontsize=10)
        page.draw_rect(fitz.Rect(130, 114, 175, 128), color=(0, 0, 0), width=1)  # 空欄の枠
        page.insert_text((180, 125), "をいう。次の中から選べ。", fontname="japan", fontsize=10)
        for k in range(5):
            y = 169 + 20 * k
            page.insert_text((93, y), f"{k + 1}", fontname="japan", fontsize=10)
            page.insert_text((113, y), f"{10 * (k + 1)} m", fontname="japan", fontsize=10)
        r = survey(rasterize(doc.tobytes()))
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        self.assertEqual(r["packets"][0]["figures"], [])


class SurveyorOlderText(unittest.TestCase):
    def test_choice_number_with_full_width_period(self):
        """令和4年の形：選択肢の番号が「1．」。表紙の「〔No.1〕～〔No.28〕」は見出しにしない。"""
        doc = fitz.open()
        cover = doc.new_page(width=595, height=842)
        cover.insert_text((75, 85), "令和4年測量士補試験問題集", fontname="japan", fontsize=10)
        cover.insert_text((75, 105), "2 問題は，〔No.1〕～〔No.28〕まで全部で28問あります。", fontname="japan", fontsize=10)
        page = doc.new_page(width=595, height=842)
        page.insert_text((75, 85), "〔No. 1〕", fontname="japan", fontsize=10)
        page.insert_text((93, 105), "次の文は，測量法に規定された事項について述べたものである。", fontname="japan", fontsize=10)
        for k in range(5):
            page.insert_text((93, 309 + 20 * k), f"{k + 1}． 選択肢{k + 1}", fontname="japan", fontsize=10)
        r = survey(doc.tobytes())
        self.assertEqual(r["status"], "ready", r.get("excluded") or r.get("detail"))
        self.assertEqual([p["questionNumber"] for p in r["packets"]], [1])
        self.assertEqual(r["packets"][0]["choices"], [f"選択肢{k}" for k in range(1, 6)])


class Garbled(unittest.TestCase):
    class FakePage:
        def __init__(self, text):
            self.text = text

        def get_text(self):
            return self.text

    def test_garbled_text_is_detected(self):
        # 令和5年の測量士補のPDFから取り出した字（字の対応表が無く化けたもの）
        self.assertTrue(ocr.is_garbled(self.FakePage("ࠝNo㸬1ࠞḟࡢᩥࡣ㸪㔞ἲ㸦᫛࿴24ᖺἲᚊ➨188ྕ㸧࡟つᐃࡉࢀࡓ஦㡯࡟ࡘ࠸࡚㏙࡭ࡓࡶࡢ࡛࠶ࡿࠋ᫂ࡽ࠿࡟㛫㐪ࡗ࡚࠸ࡿࡶࡢࡣ࡝ࢀ࠿")))

    def test_normal_text_and_answer_table_are_not_garbled(self):
        self.assertFalse(ocr.is_garbled(self.FakePage("次の文は，測量法に規定された事項について述べたものである。明らかに間違っているものはどれか。" * 2)))
        self.assertFalse(ocr.is_garbled(self.FakePage("令和５年測量士補試験解答 問題 正解 " + " ".join(f"No.{n} {n % 5 + 1}" for n in range(1, 29)))))


def ruled_answer_table(answers):
    """罫線で囲んだ正答表（「問n」の下の欄に正答）を画像にしたPDF。"""
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((50, 60), "正解番号表", fontname="japan", fontsize=12)
    y = 90
    for r in range(5):
        for c in range(10):
            x = 50 + c * 48
            p.draw_rect(fitz.Rect(x, y, x + 48, y + 20), width=0.8)
            p.draw_rect(fitz.Rect(x, y + 20, x + 48, y + 40), width=0.8)
            p.insert_text((x + 12, y + 14), f"問{r * 10 + c + 1}", fontname="japan", fontsize=9)
            p.insert_text((x + 20, y + 34), str(answers[r * 10 + c]), fontname="japan", fontsize=10)
        y += 50
    p.insert_text((50, y + 20), "合否判定基準", fontname="japan", fontsize=12)
    p.insert_text((50, y + 50), "※ 問42については、1又は4のいずれも正解として取り扱うことといたします。", fontname="japan", fontsize=10)
    return rasterize(doc.tobytes())


@unittest.skipUnless(ocr.available(), "Tesseract（jpn）が無い")
class TakkenRuledAnswerTable(unittest.TestCase):
    def test_ruled_table_is_read_by_position_and_never_wrong(self):
        answers = [(i * 7 + 3) % 4 + 1 for i in range(50)]
        doc = fitz.open(stream=ruled_answer_table(answers), filetype="pdf")
        got = takken.parse_answers(doc)
        normal = {n: c for n, c in got.items() if n != 42}
        self.assertGreaterEqual(len(normal), 30, "読めた問が少なすぎる")
        self.assertEqual({n: c for n, c in normal.items()}, {n: answers[n - 1] for n in normal}, "読めた正答は全て公式どおり")
        self.assertEqual(got[42], ANSWER_SPECIAL, "複数解の問は印を付ける")


class SpecialAnswers(unittest.TestCase):
    def test_notes_on_answer_table(self):
        self.assertEqual(takken.special_answers("問 4 8 は正解肢のない間題となっていることが判明しました。"), {48})
        self.assertEqual(takken.special_answers("※ 間 42 については、1 又は 4 のいずれも正解として取り扱う"), {42})
        self.assertEqual(takken.special_answers("問 44 の設問文アの記述中に誤植がありました。このため、選択肢 2 と選択肢 3 のいずれも正解とします。"), {44})
        self.assertEqual(takken.special_answers("問 1 から問 50 までの 50 問です。"), set())

    def test_special_question_is_excluded(self):
        from qlp_parser.core import RawQuestion, build_result
        q = RawQuestion(number=42, stem="民法の規定によれば", choices=["a", "b", "c", "d"], pages=[1])
        src = PdfSource(b"", URL)
        r = build_result(qualification_id="q041", year=2020, section="10月", question_source=src, question_sha="x",
                         answer_source=src, answer_sha="x", raw_questions=[q], answers={42: ANSWER_SPECIAL},
                         choice_count=4, classify=lambda q: {"fieldId": "t2", "verified": True})
        self.assertEqual(r["excluded"][0]["reason"], "OFFICIAL_ANSWER_SPECIAL_CASE")


class TakkenGridAnswers(unittest.TestCase):
    def test_grid_without_labels_is_read_in_rows_of_ten(self):
        doc = fitz.open()
        page = doc.new_page()
        cells = [(i % 4) + 1 for i in range(50)]
        for r in range(5):
            page.insert_text((50, 100 + r * 30), "    ".join(str(c) for c in cells[r * 10:(r + 1) * 10]), fontsize=10)
        answers = takken.parse_answers(doc)
        self.assertEqual(answers, {n: c for n, c in enumerate(cells, 1)})

    def test_grid_is_not_used_when_rows_do_not_match(self):
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 100), "1 2 3 4 1 2 3 4 1 2", fontsize=10)
        with self.assertRaises(Exception):
            takken.parse_answers(doc)


def setUpModule():
    from tests import _fields_stub
    _fields_stub.start()


def tearDownModule():
    from tests import _fields_stub
    _fields_stub.stop()


if __name__ == "__main__":
    unittest.main()


class NumberOrder(unittest.TestCase):
    def test_ocr_number_out_of_order_is_flagged(self):
        from qlp_parser.core import OUT_OF_ORDER, RawQuestion, mark_out_of_order
        qs = [RawQuestion(number=n, stem="s", choices=[], pages=[1], notes=["read_by_ocr"]) for n in (11, 12, 18, 13, 14)]
        mark_out_of_order(qs)
        self.assertEqual([OUT_OF_ORDER in q.notes for q in qs], [False, False, True, False, False])
        # どちらが読み違いか決められないときは両方出さない
        qs = [RawQuestion(number=n, stem="s", choices=[], pages=[1], notes=["read_by_ocr"]) for n in (11, 12, 18, 14)]
        mark_out_of_order(qs)
        self.assertEqual([OUT_OF_ORDER in q.notes for q in qs], [False, False, True, True])

    def test_text_questions_are_not_flagged(self):
        from qlp_parser.core import OUT_OF_ORDER, RawQuestion, mark_out_of_order
        qs = [RawQuestion(number=n, stem="s", choices=[], pages=[1]) for n in (2, 1)]
        mark_out_of_order(qs)
        self.assertFalse(any(OUT_OF_ORDER in q.notes for q in qs))
