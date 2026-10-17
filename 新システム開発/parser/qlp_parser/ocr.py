"""文字認識（OCR）。Tesseract（日本語データ jpn）を外部コマンドとして呼ぶ。

日本語の文字が図形（アウトライン）になっているPDFで使う。OCRは読み間違いがありうるので、
結果には必ず「OCRで読んだ」ことを残す（2026-10-15 水野さん決定：読み間違いは許容しOCRで文字にする）。
Tesseractが無い環境では available() が False になり、呼び出し側は画像表示に切り替える。
"""

import hashlib
import html
from html.parser import HTMLParser
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


# ---- 画像だけのPDF（紙をスキャンした年度）・文字化けしたPDFのページ全体を読む ----

PAGE_DPI = 300
_BBOX = re.compile(r"bbox (\d+) (\d+) (\d+) (\d+)")
_LINE_CLASSES = {"ocr_line", "ocr_caption", "ocr_textfloat", "ocr_header"}


class _Hocr(HTMLParser):
    """hOCR から行と語を取り出す。lines: [((x0, y0, x1, y1), [((x0, y0, x1, y1), 文字)])]（画素）"""

    def __init__(self):
        super().__init__()
        self.lines, self.stack, self.word = [], [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        m = _BBOX.search(a.get("title", ""))
        if cls in _LINE_CLASSES and m:
            self.lines.append((tuple(map(int, m.groups())), []))
        elif cls == "ocrx_word" and m and self.lines:
            self.word = [tuple(map(int, m.groups())), ""]
        self.stack.append(cls)

    def handle_endtag(self, tag):
        cls = self.stack.pop() if self.stack else ""
        if cls == "ocrx_word" and self.word is not None:
            if self.word[1].strip():
                self.lines[-1][1].append((self.word[0], self.word[1].strip()))
            self.word = None

    def handle_data(self, data):
        if self.word is not None:
            self.word[1] += data
_CJK = r"[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]"
# 日本語の試験問題には出てこない字の範囲（ヘブライ文字〜ギリシャ文字拡張・CJK拡張A・イ文字など）
_ODD = re.compile(r"[\u0590-\u1fff\u3400-\u4dbf\ua000-\uabff]")


def _join_words(words):
    """Tesseract は日本語の字の間にも空白を入れるので、日本語どうしの間の空白は詰める。"""
    out = ""
    for w in words:
        if out and not (re.search(_CJK + "$", out) and re.match(_CJK, w)) and not re.match(r"^[、。，．）」』】〕]", w):
            out += " "
        out += w
    return out


def is_scanned(page):
    """文字が取り出せず、ページの大半を画像が占めるページ（スキャンした紙）。"""
    if len(page.get_text().strip()) > 20:
        return False
    area = page.rect.width * page.rect.height
    for img in page.get_image_info():
        x0, y0, x1, y1 = img["bbox"]
        if (x1 - x0) * (y1 - y0) >= area * 0.5:
            return True
    return False


def is_garbled(page):
    """文字は取り出せるが、字の対応表が無く別の字に化けているページ（令和5年の測量士補など）。

    化けた字は、試験問題には出てこない字の範囲（_ODD）に飛ぶ。50字以上あって、その割合が2割を超えれば化けているとみなす。
    """
    text = re.sub(r"\s", "", page.get_text())
    if len(text) < 50:
        return False
    if len(_ODD.findall(text)) > len(text) * 0.2:
        return True
    # 字の対応表が無く、制御文字や記号に化けたページ（賃管の平成27年度など）：日本語がほとんど無く、記号ばかり
    junk = len(re.findall(r"[\x00-\x1f!-/:-@\[-`{-~]", text))
    return len(re.findall(_CJK, text)) < len(text) * 0.1 and junk > len(text) * 0.3


def needs_ocr(page):
    return available() and (is_scanned(page) or is_garbled(page))


_PAGE_CACHE = {}


def _render(page, psm):
    import fitz

    zoom = PAGE_DPI / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False, colorspace=fitz.csGRAY)
    pix.set_dpi(PAGE_DPI, PAGE_DPI)  # 解像度を画像に書いておく（無いと Tesseract が字の大きさを見誤る）
    # 同じページを何度も読まないよう、画像の中身で控える（問題の読み取りと正答表の読み取りで同じページを見るため）
    key = (hashlib.sha256(pix.samples).hexdigest(), psm, page.rect.x0, page.rect.y0)
    return key, pix.tobytes("png"), zoom, page.rect.x0, page.rect.y0


# スキャンした紙の汚れ・影が、行の先頭・末尾に記号として読まれることがある。記号だけの語は捨てる
_LEAD_JUNK = set("'\"“”‘’_、。・-ー|,.「`~—–:;")
_TRAIL_JUNK = set("'\"“”‘’_ー-|`~—–「")


def _trim(words):
    while words and set(words[0][4]) <= _LEAD_JUNK:
        words = words[1:]
    while words and set(words[-1][4]) <= _TRAIL_JUNK:
        words = words[:-1]
    return words


def _recognize(png, zoom, ox, oy, psm):
    env = dict(os.environ, OMP_THREAD_LIMIT="1")
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", LANG, "--psm", psm, "hocr"],
                       input=png, capture_output=True, timeout=180, env=env)
    if r.returncode != 0:
        return []
    parser = _Hocr()
    parser.feed(r.stdout.decode("utf-8", "replace"))
    out = []
    for (x0, y0, x1, y1), ws in parser.lines:
        words = _trim([(ox + a / zoom, oy + b / zoom, ox + c / zoom, oy + d / zoom, t) for (a, b, c, d), t in ws])
        text = _join_words([w[4] for w in words])
        if text:
            # 行の左端は、汚れを捨てた後の最初の語の位置（字下げで選択肢をそろえるため）
            out.append((oy + y0 / zoom, oy + y1 / zoom, text, words[0][0], words))
    return out


def image_text(png, psm="6"):
    """画像（PNGのバイト列）を読み、行ごとの文字をつないだ文字列を返す（罫線を消した正答表などに使う）。"""
    return "\n".join(ln[2] for ln in _recognize(png, 1, 0, 0, psm))


def _remember(key, out):
    if len(_PAGE_CACHE) >= 128:
        _PAGE_CACHE.pop(next(iter(_PAGE_CACHE)))
    _PAGE_CACHE[key] = out


def page_ocr(page, psm="6"):
    """ページ全体を読む。返り値は行のリスト [(y0, y1, 文字, x0, 語のリスト[(x0, y0, x1, y1, 文字)])]（座標はPDFのpt）。"""
    key, png, zoom, ox, oy = _render(page, psm)
    if key not in _PAGE_CACHE:
        _remember(key, _recognize(png, zoom, ox, oy, psm))
    return _PAGE_CACHE[key]


def prefetch(pages, workers=4, force=False):
    """OCRが要るページを並行して読み、控えに入れておく（1ページずつ順に読むと時間がかかるため）。"""
    if not available():
        return
    # PDFの描画は1つずつ（PyMuPDFは並行して描画できない）、文字認識だけを並行して行う
    jobs = [_render(p, "6") for p in pages if force or needs_ocr(p)]
    jobs = [j for j in jobs if j[0] not in _PAGE_CACHE]
    if not jobs:
        return
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(lambda j: _recognize(*j[1:], "6"), jobs))
    for j, out in zip(jobs, results):
        _remember(j[0], out)


def read_region(page, clip, psm="4", whitelist=None, dpi=400):
    """ページの一部を読み、語のリスト [(x0, y0, x1, y1, 文字)]（PDFのpt）を返す。表（正答表）を読むときに使う。"""
    import fitz

    zoom = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False, colorspace=fitz.csGRAY)
    pix.set_dpi(dpi, dpi)  # 解像度を画像に書いておく（無いと Tesseract が字の大きさを見誤る）
    args = ["tesseract", "stdin", "stdout", "-l", LANG, "--psm", psm]
    if whitelist:
        args += ["-c", f"tessedit_char_whitelist={whitelist}"]
    env = dict(os.environ, OMP_THREAD_LIMIT="1")
    r = subprocess.run(args + ["hocr"], input=pix.tobytes("png"), capture_output=True, timeout=180, env=env)
    if r.returncode != 0:
        return []
    parser = _Hocr()
    parser.feed(r.stdout.decode("utf-8", "replace"))
    x0, y0 = clip.x0, clip.y0
    return [(x0 + a / zoom, y0 + b / zoom, x0 + c / zoom, y0 + d / zoom, t) for _, ws in parser.lines for (a, b, c, d), t in ws]
