"""文字認識（OCR）。Tesseract（日本語データ jpn）を外部コマンドとして呼ぶ。

日本語の文字が図形（アウトライン）になっているPDFで使う。OCRは読み間違いがありうるので、
結果には必ず「OCRで読んだ」ことを残す（2026-10-15 水野さん決定：読み間違いは許容しOCRで文字にする）。
Tesseractが無い環境では available() が False になり、呼び出し側は画像表示に切り替える。
"""

import html
import os
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

LANG = "jpn"


@lru_cache(maxsize=1)
def available():
    exe = shutil.which("tesseract")
    if not exe:
        return False
    try:
        out = subprocess.run([exe, "--list-langs"], capture_output=True, timeout=30).stdout.decode()
    except (OSError, subprocess.SubprocessError):
        return False
    return LANG in out.split()


@lru_cache(maxsize=1)
def version():
    if not available():
        return None
    out = subprocess.run(["tesseract", "--version"], capture_output=True, timeout=30)
    return (out.stdout or out.stderr).decode().splitlines()[0].strip()


_CHAR = re.compile(r"<span class='ocrx_cinfo' title='x_bboxes (\d+) (\d+) (\d+) (\d+); x_conf ([0-9.]+)'>([^<]*)</span>")


def _one_line(png, psm="7"):
    env = dict(os.environ, OMP_THREAD_LIMIT="1")  # 同じ入力に同じ結果を返すため
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", LANG, "--psm", psm, "-c", "hocr_char_boxes=1", "hocr"],
                       input=png, capture_output=True, timeout=60, env=env)
    if r.returncode != 0:
        return None
    out = []
    for x0, y0, x1, y1, conf, ch in _CHAR.findall(r.stdout.decode("utf-8", "replace")):
        ch = html.unescape(ch)
        if ch.strip():
            out.append((ch, int(x0), int(x1), float(conf)))
    return out


def read_chars(pngs, workers=8):
    """1字ずつの画像を読む（1字として読めなければ None）。"""
    with ThreadPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(lambda png: _one_line(png, "10"), pngs))
    return [r[0][0] if r and len(r) == 1 else None for r in res]


def read_lines(pngs, workers=8):
    """1行ずつの画像を読み、行ごとに [(字, 左端px, 右端px, 確からしさ)] を返す（失敗した行は None）。"""
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_one_line, pngs))
