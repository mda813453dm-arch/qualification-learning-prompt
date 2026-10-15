"""分野（fieldId）分類の規則のテスト。問題文は公式過去問（宅建 令和7年度・測量士補 令和8年）の書き出しを使う。"""

import unittest
from types import SimpleNamespace

from qlp_parser import fields


def q(stem, choices=()):
    return SimpleNamespace(stem=stem, choices=list(choices))


class Takken(unittest.TestCase):
    def check(self, stem, field_id, choices=()):
        r = fields.classify_takken(q(stem, choices))
        self.assertEqual(r["fieldId"], field_id, r)
        self.assertTrue(r["verified"])
        self.assertTrue(r["evidence"])

    def test_civil_code(self):
        self.check("次の記述のうち、民法の規定及び判例によれば、正しいものはどれか。", "t2")

    def test_business_act_wins_over_civil_code_in_topic(self):
        self.check("宅地建物取引業者Ａが行う業務に関する次の記述のうち、宅地建物取引業法の規定によれば、正しいものはどれか。", "t7")

    def test_city_planning(self):
        self.check("都市計画法に関する次の記述のうち、正しいものはどれか。", "t3")

    def test_tax(self):
        self.check("不動産取得税に関する次の記述のうち、正しいものはどれか。", "t4")

    def test_land_price(self):
        self.check("地価公示法に関する次の記述のうち、正しいものはどれか。", "t6")

    def test_housing_finance(self):
        self.check("独立行政法人住宅金融支援機構に関する次の記述のうち、誤っているものはどれか。", "t5")

    def test_land(self):
        self.check("土地に関する次の記述のうち、最も不適当なものはどれか。", "t1")

    def test_choices_used_last(self):
        self.check("次の記述のうち、正しいものはどれか。", "t3", ["建築基準法によれば、…", "…"])

    def test_unclassified(self):
        r = fields.classify_takken(q("次の記述のうち、正しいものはどれか。", ["甲", "乙"]))
        self.assertIsNone(r["fieldId"])
        self.assertFalse(r["verified"])


class Surveyor(unittest.TestCase):
    def check(self, stem, field_id):
        self.assertEqual(fields.classify_surveyor(q(stem))["fieldId"], field_id)

    def test_law(self):
        self.check("次の文は，測量法に規定された事項について述べたものである。", "s1")

    def test_leveling(self):
        self.check("次の文は，公共測量における水準測量について述べたものである。", "s4")

    def test_gnss(self):
        self.check("次の文は，公共測量におけるGNSS測量機を用いた基準点測量について述べたものである。", "s3")

    def test_photo(self):
        self.check("次の文は，公共測量における空中写真測量について述べたものである。", "s6")

    def test_full_width_is_normalized(self):
        self.check("ＧＮＳＳ測量について述べたものである。", "s3")


if __name__ == "__main__":
    unittest.main()
