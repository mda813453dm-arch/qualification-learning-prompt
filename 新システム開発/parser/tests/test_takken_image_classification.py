"""スキャン原本を公式画像で出すときの分野判定の退行防止。"""
from types import SimpleNamespace
from qlp_parser.fields import classify_takken


def test_ocr_classification_text_is_used_when_original_image_is_shown():
    q = SimpleNamespace(stem="", choices=["1", "2", "3", "4"],
                        classification_text="都市計画法に関する次の記述のうち、正しいものはどれか。")
    result = classify_takken(q)
    assert result["fieldId"] == "t3"
    assert result["verified"] is True


def test_normal_takken_question_still_uses_stem():
    q = SimpleNamespace(stem="民法の規定によれば、正しいものはどれか。", choices=["1", "2", "3", "4"],
                        classification_text=None)
    assert classify_takken(q)["fieldId"] == "t2"
