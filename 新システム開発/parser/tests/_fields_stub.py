"""合成PDFのテスト用：問題文はダミーで分野の語を含まないため、分野分類を固定値に差し替える。

分類の規則そのものは tests/test_fields.py で本物の問題文を使って確かめる。
"""

from unittest import mock

from qlp_parser import fields

_patches = []


def _fixed(question):
    return {"fieldId": "x1", "unitId": "test", "method": "rule:test", "evidence": "test", "verified": True}


def start():
    for name in ("classify_takken", "classify_surveyor"):
        p = mock.patch.object(fields, name, _fixed)
        p.start()
        _patches.append(p)


def stop():
    while _patches:
        _patches.pop().stop()
