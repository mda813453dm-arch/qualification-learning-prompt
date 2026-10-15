"""受入テスト2：測量士補R8（令和8年）の公式PDF（実物・図表あり）。

PDFはリポジトリに置かない。環境変数 SURVEYOR_R8_Q（問題）と SURVEYOR_R8_A（正答）に
PDFのパスを渡したときだけ動く。
公式URL: https://web2.gsi.go.jp/common/000278974.pdf（問題）、000278975.pdf（正答）
"""

import json
import os
import re
import unicodedata
import unittest
from pathlib import Path

from qlp_parser import ocr
from qlp_parser.cli import run
from qlp_parser.core import PdfSource, sha256

QPDF = os.environ.get("SURVEYOR_R8_Q")
APDF = os.environ.get("SURVEYOR_R8_A")
QURL = "https://web2.gsi.go.jp/common/000278974.pdf"
AURL = "https://web2.gsi.go.jp/common/000278975.pdf"
QSHA = "3b797566e6fbcfbf0fedc5a88e5983b82ac7b6676eceb2240043e43b283a60ac"
ASHA = "b513b25773b4e3e085169bd1500807eb7663b64e9853e7eb2b49fe72f8b134ef"
DATA = Path(__file__).resolve().parents[2] / "data/runtime-packets"


@unittest.skipUnless(QPDF and APDF, "SURVEYOR_R8_Q / SURVEYOR_R8_A が未指定")
class SurveyorR8Official(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = {}
        cls.r = run("surveyor", 2026, PdfSource(Path(QPDF).read_bytes(), QURL, QSHA),
                    PdfSource(Path(APDF).read_bytes(), AURL, ASHA), assets=cls.assets)
        cls.by_n = {p["questionNumber"]: p for p in cls.r.get("packets", [])}

    def test_all_28_ready(self):
        self.assertEqual(self.r["status"], "ready", self.r.get("excluded") or self.r.get("detail"))
        self.assertEqual(sorted(self.by_n), list(range(1, 29)))
        # 1ページ1問。表紙・注意事項（1〜2ページ）と関数表（31ページ）は問題にしない
        self.assertEqual([self.by_n[n]["evidence"]["questionPdfPages"] for n in range(1, 29)], [[n + 2] for n in range(1, 29)])

    def test_answers_match_saved_evidence(self):
        # 同じ正答PDFから以前に保存した文字（evidence.json の answerText）と一致すること
        text = json.loads((DATA / "assets/q063/2026/evidence.json").read_text(encoding="utf-8"))["answerText"]
        expected = {int(n): int(a) for n, a in re.findall(r"No\.(\d+)\s+(\d)", unicodedata.normalize("NFKC", text))}
        self.assertEqual(len(expected), 28)
        self.assertEqual({n: p["correctAnswer"] for n, p in self.by_n.items()}, expected)

    def test_q7_and_q27_match_verified_packets(self):
        verified = json.loads((DATA / "verified/q063-2026-visual.json").read_text(encoding="utf-8"))["packets"]
        for v in verified:
            p = self.by_n[v["questionNumber"]]
            self.assertEqual(p["evidence"]["questionPdfPages"], [v["evidence"]["questionPdfPage"]])
            self.assertEqual(p["correctAnswer"], v["correctAnswer"])
            # 検証済みパケットは上付きの²を「2」と書いている
            self.assertEqual([c.replace("²", "2") for c in p["choices"]], v["choices"])

    @unittest.skipUnless(ocr.available(), "Tesseract（jpn）が無い")
    def test_ocr_text_and_figure_crops(self):
        # 図・表のある問だけ、図・表の部分を切り出す（本文はOCRの文字）
        with_figure = {n for n, p in self.by_n.items() if p["figures"]}
        self.assertEqual(with_figure, {3, 7, 9, 12, 20, 21, 26, 27})
        for n, p in self.by_n.items():
            self.assertEqual(p["stemMode"], "ocr", n)
            self.assertTrue(p["stem"], n)
            for f in p["figures"]:
                self.assertEqual(f["sha256"], sha256(self.assets[f["file"]]), n)
                self.assertGreaterEqual(f["width"], 1300, n)  # 80番で読めた幅（1335px）と同程度
        # OCRの読み（主要な語句が読めていること。読み違いの許容は水野さん決定 2026-10-15）
        q7 = self.by_n[7]["stem"]
        for phrase in ["トータルステーション", "器械定数と反射鏡定数", "BC間の距離は幾らか", "巻末の関数表を使用すること"]:
            self.assertIn(phrase, q7)
        self.assertEqual(self.by_n[1]["choices"], ["a，e", "b，c", "b，d", "c，d", "d，e"])
        self.assertEqual(self.by_n[3]["choices"][0], "ア：40°、イ：49.5 m²")  # 列見出し付きの選択肢
        self.assertIn("［線形図データファイルは", self.by_n[25]["choices"][0])  # 下線部
        unknown = sum(int(x.split(":")[1]) for p in self.by_n.values() for x in p["evidence"]["notes"] if x.startswith("ocr_unknown:"))
        self.assertLessEqual(unknown, 5)

    def test_report(self):
        modes = {n: p["choiceMode"] for n, p in self.by_n.items()}
        print("\nchoices as text:", [n for n, m in modes.items() if m == "text"])


if __name__ == "__main__":
    unittest.main()
