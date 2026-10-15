"""宅建アダプタと共通部分のテスト（合成PDF）。

実PDFでの受入テスト（R7の50問）は別ファイル。ここでは形と異常系を確かめる。
実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import unittest

import fitz

from qlp_parser.cli import run
from qlp_parser.core import PdfSource, clean_text, sha256

URL = "https://example.invalid/takken.pdf"


def make_pdf(questions, answer_rows, figure_for=None, extra=None):
    """questions: [(番号, 本文行list, 選択肢list)]、answer_rows: [(番号list, 正答list)]"""
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for n, stem_lines, choices in questions:
        if y > 650:
            page.insert_text((290, 820), "1", fontname="japan", fontsize=9)  # ページ番号
            page = doc.new_page()
            y = 60
        page.insert_text((50, y), f"【問 {n}】", fontname="japan", fontsize=10)
        y0 = y
        y += 16
        for ln in stem_lines:
            page.insert_text((50, y), ln, fontname="japan", fontsize=10)
            y += 16
        for i, c in enumerate(choices, 1):
            page.insert_text((50, y), f"{i} {c}", fontname="japan", fontsize=10)
            y += 16
            for ln in (extra or {}).get((n, i), []):  # 字下げした折り返し行
                if ln.startswith("@ruby:"):  # ふりがな（小さい文字の行）
                    page.insert_text((120, y - 4), ln[6:], fontname="japan", fontsize=5)
                    y += 6
                elif ln.startswith("@flush:"):  # 字下げのない行（注意書き）
                    page.insert_text((50, y), ln[7:], fontname="japan", fontsize=10)
                    y += 16
                else:
                    page.insert_text((62, y), ln, fontname="japan", fontsize=10)
                    y += 16
        if figure_for == n:
            page.draw_rect(fitz.Rect(300, y0, 400, y0 + 40), color=(0, 0, 0), width=1)
        y += 20
    page = doc.new_page()
    page.insert_text((50, 60), "正解番号", fontname="japan", fontsize=12)
    y = 100
    for nums, cells in answer_rows:
        page.insert_text((50, y), " ".join(f"問 {n}" for n in nums), fontname="japan", fontsize=10)
        page.insert_text((50, y + 16), " ".join(str(c) for c in cells), fontname="japan", fontsize=10)
        y += 50
    data = doc.tobytes()
    doc.close()
    return data


Q = [
    (1, ["次の記述のうち、民法の規定によれば、", "正しいものはどれか。"], ["甲は正しい。", "乙は正しい。", "丙は正しい。", "丁は正しい。"]),
    (2, ["宅地建物取引業法に関する次の記述のうち、誤っているものはどれか。"], ["Ａ", "Ｂ", "Ｃ", "Ｄ"]),
    (3, ["次の記述のうち、正しいものの組合せはどれか。", "ア 一つ目の記述", "イ 二つ目の記述"], ["ア、イ", "ア、ウ", "イ、ウ", "ウ、エ"]),
]
ANS = [([1, 2, 3], [3, 1, 4])]


class TakkenSynthetic(unittest.TestCase):
    def test_all_questions_ready(self):
        data = make_pdf(Q, ANS)
        r = run("takken", 2025, PdfSource(data, URL))
        self.assertEqual(r["status"], "ready", r["excluded"])
        self.assertEqual([p["questionNumber"] for p in r["packets"]], [1, 2, 3])
        self.assertEqual([p["correctAnswer"] for p in r["packets"]], [3, 1, 4])
        p1 = r["packets"][0]
        self.assertEqual(p1["stem"], "次の記述のうち、民法の規定によれば、正しいものはどれか。")
        self.assertEqual(p1["choices"][3], "丁は正しい。")
        self.assertEqual(p1["questionId"], "q041:2025:年度共通:1")
        self.assertEqual(p1["questionPdfSha256"], sha256(data))
        self.assertEqual(p1["verification"]["field"], "verified")
        # 箇条（ア・イ）の改行は残る
        self.assertIn("\nア 一つ目の記述\nイ 二つ目の記述", r["packets"][2]["stem"])

    def test_missing_choice_excludes_only_that_question(self):
        q = [Q[0], (2, ["本文"], ["Ａ", "Ｂ", "Ｃ"]), Q[2]]
        r = run("takken", 2025, PdfSource(make_pdf(q, ANS), URL))
        self.assertEqual(r["status"], "partial")
        self.assertEqual([p["questionNumber"] for p in r["packets"]], [1, 3])
        self.assertEqual(r["excluded"][0]["reason"], "CHOICES_INCOMPLETE")

    def test_missing_answer_excludes_question(self):
        r = run("takken", 2025, PdfSource(make_pdf(Q, [([1, 2], [3, 1])]), URL))
        self.assertEqual(r["excluded"], [{"questionNumber": 3, "reason": "OFFICIAL_ANSWER_NOT_FOUND", "pages": [1]}])

    def test_figure_question_is_withheld(self):
        r = run("takken", 2025, PdfSource(make_pdf(Q, ANS, figure_for=2), URL))
        self.assertEqual([e["reason"] for e in r["excluded"]], ["FIGURE_REQUIRED_NOT_AVAILABLE"])
        self.assertEqual([p["questionNumber"] for p in r["packets"]], [1, 3])

    def test_hash_mismatch_rejects_pdf(self):
        r = run("takken", 2025, PdfSource(make_pdf(Q, ANS), URL, "0" * 64))
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "PDF_HASH_MISMATCH"))

    def test_not_pdf(self):
        r = run("takken", 2025, PdfSource(b"<html>not found</html>", URL))
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "PDF_INVALID"))

    def test_answer_pdf_without_table(self):
        q = PdfSource(make_pdf(Q, ANS), URL)
        a = PdfSource(make_pdf(Q[:1], []), "https://example.invalid/other.pdf")
        r = run("takken", 2025, q, a)
        self.assertEqual((r["status"], r["reason"]), ("unavailable", "ANSWER_TABLE_NOT_FOUND"))

    def test_deterministic_output(self):
        data = make_pdf(Q, ANS)
        self.assertEqual(run("takken", 2025, PdfSource(data, URL)), run("takken", 2025, PdfSource(data, URL)))


    # 回帰：問番号・本文・選択肢の誤結合を防ぐ
    def test_stem_line_starting_with_1_is_not_a_choice(self):
        q = [(1, ["次の記述のうち正しいものはどれか。", "1 年以内に契約した場合とする。"], ["甲", "乙", "丙", "丁"])]
        r = run("takken", 2025, PdfSource(make_pdf(q, [([1, 2], [2, 2])]), URL))
        p = r["packets"][0]
        self.assertEqual(p["choices"], ["甲", "乙", "丙", "丁"])
        self.assertTrue(p["stem"].endswith("1 年以内に契約した場合とする。"))
        self.assertEqual(p["evidence"]["notes"], ["multiple_choice_starts"])

    def test_wrapped_line_starting_with_2_is_not_a_choice(self):
        q = [(1, ["本文"], ["甲であり、その期間は", "乙", "丙", "丁"])]
        r = run("takken", 2025, PdfSource(make_pdf(q, [([1, 2], [1, 1])], extra={(1, 1): ["2 年間とする。"]}), URL))
        self.assertEqual(r["packets"][0]["choices"][0], "甲であり、その期間は2 年間とする。")
        self.assertEqual(r["packets"][0]["choices"][1], "乙")

    def test_furigana_is_not_attached_to_choice(self):
        q = [(1, ["本文"], ["甲", "乙", "丙", "丁"])]
        r = run("takken", 2025, PdfSource(make_pdf(q, [([1, 2], [1, 1])], extra={(1, 1): ["@ruby:せい"]}), URL))
        self.assertEqual(r["packets"][0]["choices"], ["甲", "乙", "丙", "丁"])

    def test_notice_after_last_choice_is_dropped(self):
        q = [(1, ["本文"], ["甲", "乙", "丙", "丁です。"])]
        pdf = make_pdf(q, [([1, 2], [1, 1])], extra={(1, 4): ["続きの行。", "@flush:以下の問については解答しないでください。"]})
        p = run("takken", 2025, PdfSource(pdf, URL))["packets"][0]
        self.assertEqual(p["choices"][3], "丁です。続きの行。")
        self.assertEqual(p["evidence"]["notes"], ["trailing_text_dropped"])

    def test_duplicated_heading_withholds_both(self):
        q = [Q[0], (1, ["重複した見出し"], ["Ａ", "Ｂ", "Ｃ", "Ｄ"]), Q[1]]
        r = run("takken", 2025, PdfSource(make_pdf(q, ANS), URL))
        self.assertEqual([p["questionNumber"] for p in r["packets"]], [2])
        self.assertEqual([e["reason"] for e in r["excluded"]], ["QUESTION_NUMBER_DUPLICATED"] * 2)


class CleanText(unittest.TestCase):
    def test_joins_wrapped_japanese_and_keeps_list_markers(self):
        self.assertEqual(clean_text("宅地建物取引業者Ａが\n交付すべき書面\nア 記述"), "宅地建物取引業者Ａが交付すべき書面\nア 記述")

    def test_keeps_space_between_ascii_words(self):
        self.assertEqual(clean_text("Article\n37"), "Article 37")


if __name__ == "__main__":
    unittest.main()


def setUpModule():
    from tests import _fields_stub
    _fields_stub.start()


def tearDownModule():
    from tests import _fields_stub
    _fields_stub.stop()
