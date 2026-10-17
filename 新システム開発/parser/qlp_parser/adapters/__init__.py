"""資格ごとのアダプタ。資格ごとに違うのは「問題の見つけ方」「選択肢の形」「正答表の読み方」だけ。"""

from . import chintai, surveyor, takken

ADAPTERS = {
    "takken": takken,
    "surveyor": surveyor,
    "chintai": chintai,
}
