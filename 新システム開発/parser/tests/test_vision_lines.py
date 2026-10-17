"""Google Cloud Vision の応答を行・語に直す処理（qlp_parser/vision.py）の試験。応答は合成したもの。"""

import unittest

from qlp_parser import vision


def sym(text, x0, y0, x1, y1, brk=None):
    s = {"text": text, "boundingBox": {"vertices": [{"x": x0, "y": y0}, {"x": x1, "y": y0}, {"x": x1, "y": y1}, {"x": x0, "y": y1}]}}
    if brk:
        s["property"] = {"detectedBreak": {"type": brk}}
    return s


def word(*syms):
    xs = [v["x"] for s in syms for v in s["boundingBox"]["vertices"]]
    ys = [v["y"] for s in syms for v in s["boundingBox"]["vertices"]]
    return {"symbols": list(syms), "boundingBox": {"vertices": [{"x": min(xs), "y": min(ys)}, {"x": max(xs), "y": max(ys)}]}}


def full(*paras):
    return {"pages": [{"blocks": [{"paragraphs": [{"words": list(p)} for p in paras]}]}]}


class VisionLinesTest(unittest.TestCase):
    def test_marker_and_ascii_merge(self):
        f = full([word(sym("1", 10, 10, 15, 20)), word(sym(".", 15, 10, 17, 20)),
                  word(sym("測", 30, 10, 40, 20), sym("量", 40, 10, 50, 20, "LINE_BREAK"))])
        (y0, y1, ws, text), = vision.lines(f, 1, 0, 0)
        self.assertEqual([w[4] for w in ws], ["1.", "測量"])
        self.assertEqual(text, "1. 測量")

    def test_stacked_table_column_is_split_into_rows(self):
        # 表の列を縦に1語で読んだもの（「5」と「7」が別の行）と、同じ「5」の読み直し
        f = full([word(sym("4", 10, 100, 15, 110)), word(sym("5", 10, 130, 15, 140)),
                  word(sym("5", 80, 100, 85, 110), sym("7", 80, 130, 85, 140)),
                  word(sym("5", 80, 101, 85, 110))])
        rows = vision.lines(f, 1, 0, 0)
        self.assertEqual([r[3] for r in rows], ["4 5", "5 7"])

    def test_blank_label_I_becomes_e(self):
        f = full([word(sym("ア", 10, 10, 20, 20)), word(sym("~", 22, 10, 30, 20)), word(sym("I", 32, 10, 36, 20)),
                  word(sym("に", 38, 10, 48, 20, "LINE_BREAK"))],
                 [word(sym("G", 10, 40, 16, 50), sym("I", 16, 40, 19, 50), sym("S", 19, 40, 25, 50))])
        rows = vision.lines(f, 1, 0, 0)
        self.assertEqual(rows[0][3], "ア~エに")
        self.assertEqual(rows[1][3], "GIS")

    def test_upper_c_between_b_and_d(self):
        f = full([word(sym("b", 10, 10, 15, 20)), word(sym(".", 15, 10, 17, 20, "LINE_BREAK"))],
                 [word(sym("C", 10, 30, 15, 40)), word(sym(".", 15, 30, 17, 40, "LINE_BREAK"))],
                 [word(sym("d", 10, 50, 15, 60)), word(sym(".", 15, 50, 17, 60, "LINE_BREAK"))])
        self.assertEqual([r[3] for r in vision.lines(f, 1, 0, 0)], ["b.", "c.", "d."])


if __name__ == "__main__":
    unittest.main()
