"""ページの表と図の位置（page_layout）と、図だけを切り出したPDFのテスト。

実行: cd 新システム開発/parser && python -m unittest tests.test_page_layout
"""

import base64
import unittest

import fitz

from qlp_parser.server import page_layout, render_pages

FONT = "japan"


def _table(page, x, y, rows, w=110, h=21):
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            r = fitz.Rect(x + j * w, y + i * h, x + (j + 1) * w, y + (i + 1) * h)
            page.draw_rect(r, color=(0, 0, 0), width=0.6)
            page.insert_text((r.x0 + 8, r.y1 - 6), cell, fontname=FONT, fontsize=10)


def make_pdf():
    doc = fitz.open()
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((66, 85), "第11問　次の〔観測結果〕及び〔測量成果〕は、次の〔見取図〕に示されている。", fontname=FONT, fontsize=10.5)
    p1.insert_text((99, 125), "問1　Ｔ1点にトランシットを据え", fontname=FONT, fontsize=10.5)
    p1.insert_text((94, 495), "〔観測結果〕", fontname=FONT, fontsize=10.5)
    _table(p1, 101, 503, [["器械点", "視準点", "水平角", "水平距離（ｍ）"], ["Ｔ1", "Ｔ2", "0°00′00″", "─"], ["", "Ｆ", "243°44′07″", "14.12"]])
    p1.insert_text((94, 602), "〔測量成果〕", fontname=FONT, fontsize=10.5)
    p1.insert_text((99, 624), "北は、Ｘ軸正方向に一致する。", fontname=FONT, fontsize=10.5)
    _table(p1, 101, 632, [["点名", "Ｘ座標（ｍ）", "Ｙ座標（ｍ）"], ["Ｔ1", "200.00", "200.00"], ["Ａ", "205.41", "204.33"]])
    p2 = doc.new_page(width=595, height=842)
    _table(p2, 101, 77, [["Ｃ", "190.60", "214.92"], ["Ｄ", "186.70", "196.08"]])
    p2.insert_text((94, 172), "〔見取図〕", fontname=FONT, fontsize=10.5)
    pts = [(270, 245), (400, 258), (413, 450), (198, 451), (257, 344)]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        p2.draw_line(a, b, color=(0, 0, 0), width=0.6)
    for (x, y), name in zip(pts, "ABCDE"):
        p2.draw_circle((x, y), 3, color=(0, 0, 0), width=0.5)
        p2.insert_text((x + 6, y + 4), name, fontname="helv", fontsize=9)
    p2.draw_line((490, 210), (490, 285), color=(0, 0, 0), width=0.6)  # 方位記号
    p2.draw_line((472, 266), (512, 266), color=(0, 0, 0), width=0.6)
    p2.insert_text((298, 785), "─（12）─", fontname=FONT, fontsize=10)
    return doc.tobytes()


class PageLayout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf = make_pdf()
        cls.doc = fitz.open(stream=cls.pdf, filetype="pdf")

    def test_tables_with_caption_and_continuation(self):
        tables, _ = page_layout(self.doc, [1, 2])
        self.assertEqual(len(tables), 2)
        self.assertEqual(tables[0]["caption"], "〔観測結果〕")
        self.assertEqual(tables[0]["rows"][2], ["", "F", "243°44′07″", "14.12"])
        self.assertIn("〔測量成果〕", tables[1]["caption"])
        self.assertIn("北は、X軸正方向に一致する。", tables[1]["caption"])
        # 次のページの先頭の表は、前の表の続きとしてつなぐ
        self.assertEqual([r[0] for r in tables[1]["rows"]], ["点名", "T1", "A", "C", "D"])

    def test_figure_is_outside_tables(self):
        _, figures = page_layout(self.doc, [1, 2])
        self.assertEqual(len(figures), 1)
        f = figures[0]
        self.assertEqual(f["page"], 2)
        x0, y0, x1, y1 = f["bbox"]
        self.assertTrue(x0 <= 198 and x1 >= 512 and y0 <= 210 and y1 >= 451, f)
        self.assertGreater(y0, 120)  # 表は含めない

    def test_excerpt_is_cropped_figure(self):
        r = render_pages({"pdf": {"base64": base64.b64encode(self.pdf).decode()}, "find": "第11問", "span": 2})
        ex = fitz.open(stream=base64.b64decode(r["excerpt"]), filetype="pdf")
        self.assertEqual(ex.page_count, 1)
        self.assertLess(ex[0].rect.height, 400)
        self.assertEqual(len(r["tables"]), 2)
        self.assertEqual(sorted(r["pages"]), ["p1.png", "p2.png"])

    def test_no_figure_keeps_whole_pages(self):
        r = render_pages({"pdf": {"base64": base64.b64encode(self.pdf).decode()}, "pages": [1]})
        ex = fitz.open(stream=base64.b64decode(r["excerpt"]), filetype="pdf")
        self.assertEqual(ex.page_count, 1)
        self.assertEqual(r["figures"], [])
        self.assertGreater(ex[0].rect.height, 800)


if __name__ == "__main__":
    unittest.main()


def make_raster_pdf():
    """図が画像で入っている問題（第4問のような形）と、次の問の見出し。"""
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((66, 85), "第4問　次の〔図〕のとおり、水準点を新設するために水準測量を行った。", fontname=FONT, fontsize=10.5)
    p.insert_text((99, 107), "ただし、既知点の標高は次の〔表〕のとおりとする。", fontname=FONT, fontsize=10.5)
    p.insert_text((94, 140), "〔図〕", fontname=FONT, fontsize=10.5)
    pic = fitz.open()
    pp = pic.new_page(width=300, height=150)
    pp.draw_bezier((20, 120), (80, 10), (160, 140), (280, 30), color=(0, 0, 0), width=2)
    pp.draw_rect(fitz.Rect(14, 114, 26, 126), color=(0, 0, 0), width=1.5)
    png = pp.get_pixmap(dpi=144).tobytes("png")
    p.insert_image(fitz.Rect(100, 150, 400, 300), stream=png)
    p.insert_text((94, 330), "〔表〕", fontname=FONT, fontsize=10.5)
    _table(p, 101, 338, [["点名", "標高"], ["Ａ", "3.150ｍ"]])
    p.insert_text((99, 420), "1 　4.370ｍ", fontname=FONT, fontsize=10.5)
    p.insert_text((99, 442), "2 　4.380ｍ", fontname=FONT, fontsize=10.5)
    p.insert_text((66, 500), "第5問　次の問題。", fontname=FONT, fontsize=10.5)
    return doc.tobytes()


class QuestionDisplay(unittest.TestCase):
    def test_vector_figure_in_order(self):
        r = render_pages({"pdf": {"base64": base64.b64encode(make_pdf()).decode()}, "find": "第11問", "span": 2})
        d = r["display"]
        self.assertTrue(d.startswith("第11問"))
        self.assertLess(d.index("〔観測結果〕"), d.index("〔測量成果〕"))
        self.assertLess(d.index("〔測量成果〕"), d.index("<svg"))
        self.assertIn('width="100%"', d)
        self.assertNotIn("─（12）─", d)
        self.assertEqual(d.count("<svg"), 1)

    @unittest.skipUnless(__import__("shutil").which("potrace"), "potrace がない")
    def test_raster_figure_is_traced_and_next_question_excluded(self):
        r = render_pages({"pdf": {"base64": base64.b64encode(make_raster_pdf()).decode()}, "find": "第4問", "span": 1})
        d = r["display"]
        self.assertIsNotNone(d)
        self.assertLess(d.index("ただし"), d.index("<svg"))
        self.assertLess(d.index("</svg>"), d.index("〔表〕\n|"))
        self.assertLess(d.index("〔表〕\n|"), d.index("4.370"))
        self.assertNotIn("第5問", d)
        self.assertNotIn("base64", d)
        self.assertIn("<path", d)
        self.assertLess(len(d), 8000)
        self.assertEqual(len(r["figures"]), 1)
