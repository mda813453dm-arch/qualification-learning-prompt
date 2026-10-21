"""実物PDFのハッシュ・区分・特殊正答を固定して取り違えを防ぐ回帰テスト。"""
import unittest
import fitz
from qlp_parser.adapters import takken
from qlp_parser.core import RawQuestion


class TestOfficialKeys(unittest.TestCase):
    def test_twelve_pinned_official_documents(self):
        docs = takken._verified_key_documents()
        self.assertEqual(len(docs), 12)
        for doc in docs:
            got = takken.verified_answers(doc['year'], doc['section'], doc['sha256'], doc['sha256'])
            self.assertEqual(list(got), list(range(1, 51)))
            self.assertEqual(len(got), 50)

    def test_never_combine_other_year_section_or_hash(self):
        doc = takken._verified_key_documents()[4]
        self.assertIsNone(takken.verified_answers(doc['year'], '12月', doc['sha256'], doc['sha256']))
        self.assertIsNone(takken.verified_answers(2030, doc['section'], doc['sha256'], doc['sha256']))
        self.assertIsNone(takken.verified_answers(doc['year'], doc['section'], 'a' * 64, doc['sha256']))
        self.assertIsNone(takken.verified_answers(doc['year'], doc['section'], doc['sha256'], 'a' * 64))

    def test_special_answers_from_official_key(self):
        docs = takken._verified_key_documents()
        by_year = {(x['year'],x['section']):x for x in docs}
        self.assertEqual(by_year[(2020,'10月')]['answers'][41], [1,4])
        self.assertEqual(by_year[(2021,'12月')]['answers'][43], [2,3])
        self.assertEqual(by_year[(2022,'年度共通')]['answers'][47], 'all')

    def test_sha_locked_ocr_heading_recovery_and_no_duplicate_prior_crop(self):
        doc = fitz.open()
        for _ in range(28):
            doc.new_page(width=595.44, height=842.4)
        for (year, section, sha), patches in takken._VERIFIED_IMAGE_HEADINGS.items():
            for number, page, top, bottom, title in patches:
                previous = RawQuestion(number-1, '', ['1','2','3','4'], [page],
                    crops=[(page, (16, 50, 579, 818))])
                after = RawQuestion(number+1, '', ['1','2','3','4'], [page+1])
                actual = takken.recover_verified_missing_questions(
                    doc, [previous, after], year, section, sha)
                self.assertEqual([x.number for x in actual], [number-1, number, number+1])
                recovered = actual[1]
                self.assertEqual(recovered.crops[0][0], page)
                self.assertEqual(recovered.crops[0][1][1], top)
                self.assertEqual(recovered.crops[0][1][3], bottom)
                self.assertEqual(previous.crops[0][1][3], top-10)
                self.assertEqual(recovered.stem_mode, 'official_image')
                self.assertEqual(recovered.classification_text, title)
                untouched = takken.recover_verified_missing_questions(
                    doc, [previous, after], year, section, '0'*64)
                self.assertEqual(len(untouched), 2)

    def test_sha_locked_ocr_field_recovery(self):
        key = (2020, '12月',
               '3e771375cee071c58baf64f51d5ca344163a45f1df00ef18abf2402c7bf24104')
        q11 = RawQuestion(11, '', ['1','2','3','4'], [6], classification_text='OCR failure')
        q17 = RawQuestion(17, '', ['1','2','3','4'], [9], classification_text='OCR failure')
        takken.recover_verified_missing_questions(None, [q11,q17], *key)
        self.assertEqual(takken.fields.classify_takken(q11)['fieldId'], 't2')
        self.assertEqual(takken.fields.classify_takken(q17)['fieldId'], 't3')


if __name__ == '__main__':
    unittest.main()
