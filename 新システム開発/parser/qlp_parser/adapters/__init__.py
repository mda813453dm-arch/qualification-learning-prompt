"""資格ごとのアダプタ。資格ごとに違うのは「問題の見つけ方」「選択肢の形」「正答表の読み方」だけ。"""

from . import generic_mc, ap, chintai, fe, fp2, fp3, gyosei, itpass, land_surveyor, mankan, shindan, surveyor, takken

ADAPTERS = {
    "generic_mc": generic_mc,
    "takken": takken,
    "surveyor": surveyor,
    "land_surveyor": land_surveyor,
    "chintai": chintai,
    "fp2": fp2,
    "fp3": fp3,
    "itpass": itpass,
    "fe": fe,
    "ap": ap,
    "gyosei": gyosei,
    "shindan": shindan,
    "mankan": mankan,
}
