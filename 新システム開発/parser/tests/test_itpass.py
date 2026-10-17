"""ITパスポート（IPA 公開問題）。

前半は合成データで、選択肢の記号・分野の案内・正答表の読み方を確かめる。
後半は令和8年度の公式PDF（実物）。PDFはリポジトリに置かない。環境変数 ITPASS_R8_Q・ITPASS_R8_A にパスを渡し、
Vision の応答の控え（QLP_OCR=vision QLP_VISION_CACHE=…）があるときだけ動く。
公式URL: https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_qs.pdf（解答例は _ip_ans.pdf）
"""

import os
import unittest
from pathlib import Path

from qlp_parser import fields
from qlp_parser.adapters import itpass
from qlp_parser.core import PdfSource, RawQuestion


def words(*texts, x=76, y=100, gap=30):
    """1行分の語 [(x0, y0, x1, y1, 文字)]。"""
    out = []
    for t in texts:
        w = 10 * len(t)
        out.append((x, y, x + w, y + 10, t))
        x += w + gap
    return out


def line(*texts, y=100, gap=30):
    ws = words(*texts, y=y, gap=gap)
    return (0, y, y + 10, " ".join(texts), ws[0][0], ws)


class Marks(unittest.TestCase):
    def test_four_choices_on_one_line(self):
        body = [line("費用のうち間接費はどれか。", y=80), line("ア", "a,b", "イ", "b", "ウ", "b,c", "エ", "c")]
        self.assertEqual([(i, k) for i, k, _ in itpass._choices(body)], [(1, 0), (1, 2), (1, 4), (1, 6)])

    def test_e_read_as_latin_i(self):
        # Vision は「エ」を英字の「I」「H」と読むことがある
        body = [line("ア", "30", "イ", "54", "ウ", "70", "I", "90")]
        self.assertEqual(len(itpass._choices(body)), 4)

    def test_katakana_word_is_not_a_mark(self):
        # 「アジャイル開発」の「ア」は選択肢の記号ではない
        body = [line("ア", "アジャイル開発", "イ", "ウォーターフォールモデル"), line("ウ", "スパイラルモデル", "エ", "プロトタイピング", y=120)]
        marks = itpass._choices(body)
        self.assertEqual([(i, k) for i, k, _ in marks], [(0, 0), (0, 2), (1, 0), (1, 2)])

    def test_missing_mark_gives_none(self):
        body = [line("ア", "a,b,c", "イ", "a,c", "b,c", "エ", "b,c,d")]
        self.assertIsNone(itpass._choices(body))


class Fields(unittest.TestCase):
    def test_banner(self):
        m = itpass.BANNER.search("問35から問54までは, マネジメント系の問題です。")
        self.assertEqual((m.group(1), m.group(2), itpass.BANNER_FIELD[m.group(3)]), ("35", "54", "m"))

    def test_classify_uses_banner_note(self):
        q = RawQuestion(number=35, stem="x", choices=[], pages=[1], notes=["field:m"])
        self.assertEqual(fields.classify_itpass(q)["fieldId"], "m")
        q = RawQuestion(number=35, stem="x", choices=[], pages=[1])
        self.assertIsNone(fields.classify_itpass(q)["fieldId"])

    def test_items_keep_their_lines(self):
        self.assertEqual(itpass._keep_items(["次のうちどれか。", "a 一つ目の", "続き", "b 二つ目"]), ["次のうちどれか。", "a 一つ目の続き", "b 二つ目"])
        self.assertEqual(itpass._fix_items(["a x", "c y"], ["a .", "C", "a, C"]), ["a", "c", "a, c"])


Q = os.environ.get("ITPASS_R8_Q")
A = os.environ.get("ITPASS_R8_A")
URL_Q = "https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_qs.pdf"
URL_A = "https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_ans.pdf"
# 解答例（公式）の問1〜25
FIRST_25 = "アアウイエエイウイエエエウアイアイアアイウエイアエ"


@unittest.skipUnless(Q and A and os.environ.get("QLP_VISION_CACHE"), "ITPASS_R8_Q / ITPASS_R8_A / QLP_VISION_CACHE が未指定")
class ItpassR8Official(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from qlp_parser.cli import run
        cls.r = run("itpass", 2026, PdfSource(Path(Q).read_bytes(), URL_Q), PdfSource(Path(A).read_bytes(), URL_A))

    def test_all_100_questions(self):
        self.assertEqual(self.r["packetCount"], 100, self.r["excluded"])

    def test_answers_from_official_table(self):
        got = {p["questionNumber"]: p["correctAnswer"] for p in self.r["packets"]}
        self.assertEqual("".join("アイウエ"[got[n] - 1] for n in range(1, 26)), FIRST_25)

    def test_fields_from_booklet_banners(self):
        f = {p["questionNumber"]: p["fieldId"] for p in self.r["packets"]}
        self.assertEqual((f[1], f[34], f[35], f[54], f[55], f[100]), ("s", "s", "m", "m", "t", "t"))

    def test_every_question_has_the_official_image(self):
        self.assertTrue(all(p["figures"] for p in self.r["packets"]))
        # 選択肢の記号を読み落とした問は、選択肢を公式PDFの画像で見せる（記号だけを持つ）
        for p in self.r["packets"]:
            if p["choiceMode"] == "official_image":
                self.assertEqual(p["choices"], ["ア", "イ", "ウ", "エ"])
