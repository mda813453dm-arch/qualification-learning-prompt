"""汎用解析で、PDFに文字があるのに全問画像へ変換する退行を防ぐ。"""
import unittest
from types import SimpleNamespace

from qlp_parser.adapters import generic_mc


def block(text, y):
    return (30, y, 520, y + 19, text, 0, 0)


class Page:
    rect = SimpleNamespace(x0=0, y0=0, x1=600, y1=800)

    def __init__(self, blocks, images=False):
        self.blocks = blocks
        self.images = images

    def get_text(self, mode='text', sort=False):
        return self.blocks if mode == 'blocks' else ''

    def get_image_info(self):
        return [1] if self.images else []


class GenericTextModeTest(unittest.TestCase):
    def test_plain_text_and_wrapped_choice_are_extracted(self):
        page = Page([
            block('問1 正しいものを選べ', 40),
            block('1. 第一選択肢の前半', 75),
            block('後半です。', 95),
            block('2. 第二選択肢です。', 130),
            block('3. 第三選択肢です。', 160),
        ])
        questions = generic_mc.parse_questions([page])
        self.assertEqual(len(questions), 1)
        q = questions[0]
        self.assertEqual((q.stem_mode, q.choice_mode), ('text', 'text'))
        self.assertEqual(q.stem, '正しいものを選べ')
        self.assertEqual(q.choices[0], '第一選択肢の前半後半です。')
        self.assertEqual(len(q.choices), 3)
        self.assertEqual(q.crops, [])
        self.assertIn('manual_visual_comparison_pending', q.notes)

    def test_graphic_question_keeps_original_and_placeholder_is_not_text(self):
        page = Page([block('問1 下図を選べ', 40), block('1. A', 75), block('2. B', 100)], images=True)
        questions = generic_mc.parse_questions([page])
        self.assertEqual(len(questions), 1)
        q = questions[0]
        self.assertEqual((q.stem_mode, q.choice_mode), ('official_image', 'official_image'))
        self.assertEqual(q.choices, ['1', '2'])
        self.assertTrue(q.crops)

    def test_missing_choice_stays_excluded(self):
        page = Page([block('問1', 40), block('1. A', 75), block('3. C', 100)])
        self.assertEqual(generic_mc.parse_questions([page]), [])


if __name__ == '__main__':
    unittest.main()
