"""スキャンした宅建過去問で、読めた文字をすべて画像化する退行を防ぐ。"""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from qlp_parser.adapters import takken


class Page:
    rect = SimpleNamespace(x0=0, y0=0, x1=600, y1=800)


class Doc(list):
    @property
    def page_count(self):
        return len(self)


class TakkenOcrTextModeTest(unittest.TestCase):
    def parse(self, fourth_choice='4 最後の選択肢はこの文章です。'):
        lines = [
            (40, 60, '【問 22】 次の記述のうち正しいものはどれか。', 40),
            (85, 105, '1 一番目の選択肢はこの文章です。', 50),
            (115, 135, '2 二番目の選択肢はこの文章です。', 50),
            (145, 165, '3 三番目の選択肢はこの文章です。', 50),
            (175, 195, fourth_choice, 50),
        ]
        with patch.object(takken.ocr, 'prefetch'), \
             patch.object(takken.ocr, 'needs_ocr', return_value=True), \
             patch.object(takken, '_lines', return_value=lines), \
             patch.object(takken, '_template_drawings', return_value=set()), \
             patch.object(takken, '_graphics_in', return_value=False):
            return takken.parse_questions(Doc([Page()]))

    def test_complete_ocr_is_readable_and_still_marked_unverified(self):
        q, = self.parse()
        self.assertEqual(q.number, 22)
        self.assertEqual((q.stem_mode, q.choice_mode), ('ocr', 'ocr'))
        self.assertIn('正しいもの', q.stem)
        self.assertEqual(q.choices[3], '最後の選択肢はこの文章です。')
        self.assertIn('manual_visual_comparison_pending', q.notes)
        self.assertIn('read_by_ocr', q.notes)
        self.assertTrue(q.crops, '原本の画像は照合用として残す')

    def test_unreadable_choice_cannot_be_published_as_ocr_text(self):
        q, = self.parse('4 4')
        self.assertEqual(q.stem_mode, 'official_image')
        self.assertEqual(q.choices, ['1', '2', '3', '4'])
        self.assertNotIn('manual_visual_comparison_pending', q.notes)
        self.assertIn('official_original_image_question', q.notes)


if __name__ == '__main__':
    unittest.main()
