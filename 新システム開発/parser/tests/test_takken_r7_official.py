"""受入テスト1：宅建R7の公式PDF（実物）。

PDFはリポジトリに置かない。環境変数 TAKKEN_R7_PDF にPDFのパスを渡したときだけ動く。
公式URL: https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf
"""

import json
import os
import re
import unittest
from pathlib import Path

from qlp_parser.cli import run
from qlp_parser.core import PdfSource

PDF = os.environ.get("TAKKEN_R7_PDF")
URL = "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf"
SHA = "829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed"
ROOT = Path(__file__).resolve().parents[2]


def squash(s):
    return re.sub(r"\s+", "", s)


@unittest.skipUnless(PDF, "TAKKEN_R7_PDF が未指定")
class TakkenR7Official(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = run("takken", 2025, PdfSource(Path(PDF).read_bytes(), URL, SHA))

    def test_answers_match_repository_index(self):
        # 既存の索引（同じ公式PDFから作成済み）と正答が一致すること
        index = json.loads((ROOT / "data/takken-2025-official-source-index.json").read_text(encoding="utf-8"))
        expected = {q["number"]: q["answerNumber"] for q in index["questions"]}
        import fitz
        from qlp_parser.adapters import takken
        self.assertEqual(takken.parse_answers(fitz.open(PDF)), expected)
        got = {p["questionNumber"]: p["correctAnswer"] for p in self.r["packets"]}
        self.assertTrue(got)
        for n, a in got.items():
            self.assertEqual(a, expected[n], f"問{n}")

    def test_all_50_accounted_for(self):
        numbers = sorted([p["questionNumber"] for p in self.r["packets"]] + [e["questionNumber"] for e in self.r["excluded"]])
        self.assertEqual(numbers, list(range(1, 51)), self.r["excluded"])

    def test_q29_matches_verified_packet(self):
        v = json.loads((ROOT / "data/runtime-packets/verified/takken-2025-u8.json").read_text(encoding="utf-8"))["packets"][0]
        p = next(p for p in self.r["packets"] if p["questionNumber"] == 29)
        self.assertEqual(squash(p["stem"]), squash(v["stem"]))
        self.assertEqual([squash(c) for c in p["choices"]], [squash(c) for c in v["choices"]])
        self.assertEqual(p["correctAnswer"], v["correctAnswer"])

    def test_report(self):
        # 除外の内訳を出力する（目視確認用。失敗にはしない）
        print("\nready:", self.r["packetCount"], "excluded:", [(e["questionNumber"], e["reason"]) for e in self.r["excluded"]])


if __name__ == "__main__":
    unittest.main()
