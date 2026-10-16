"""経路Bの分解サーバー（T5。Cloud Run で動かす）。経路Aと同じ qlp_parser をそのまま使う。

  POST /v1/parse
    {adapter, year, section, question:{url, sha256, base64}, answer:{url, sha256, base64}|null}
  → 200 {result, assets:{<file>: <base64 PNG>}}
  POST /v1/pages
    {pdf:{base64}, pages:[1始まりのページ番号, 最大4つ]}  または  {pdf:{base64}, find:"第11問", span:2}（見出しを含むページから）
  → 200 {pageCount, matchedPage, pages:{"p<番号>.png": <base64 PNG>}, excerpt:<base64 PDF>, tables:[{page, caption, rows}], figures:[{page, bbox}]}
    （どの資格の公式PDFでも、ページをそのまま画像にする。excerpt は図だけを切り出したPDF。図が無ければページ全体）
  GET /healthz → 200 {"ok": true, "parserVersion", "ocr"}

公式PDFの取得はしない（取得とSHA-256の照合はエンジン側）。届いたPDFのSHA-256が sha256 と違えば分解しない。
分解できなかったときも 200 で result.status=unavailable と理由コードを返す（エンジン側で取り込み元ごとに失敗にする）。

環境変数：PARSER_TOKEN（Bearer。設定されていれば必須）、PORT（Cloud Run が渡す）
"""

import base64
import binascii
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import PARSER_VERSION, ocr
from .cli import run
from .core import PdfSource

MAX_BODY = 80 * 1024 * 1024  # PDF 2つ（各30MBまで）を base64 で受け取れる大きさ


class BadRequest(Exception):
    pass


def _source(part):
    if not isinstance(part, dict) or not isinstance(part.get("base64"), str):
        raise BadRequest("PDF_REQUIRED")
    try:
        data = base64.b64decode(part["base64"], validate=True)
    except (binascii.Error, ValueError) as e:
        raise BadRequest("PDF_BASE64_INVALID") from e
    sha = part.get("sha256")
    if not isinstance(sha, str) or len(sha) != 64:
        raise BadRequest("SHA256_REQUIRED")
    return PdfSource(data, part.get("url"), sha)


def parse_request(body):
    """リクエストの中身から分解結果を作る（HTTPなしでテストできるよう分けている）。"""
    if not isinstance(body, dict):
        raise BadRequest("BODY_INVALID")
    year = body.get("year")
    if not isinstance(year, int) or isinstance(year, bool):
        raise BadRequest("YEAR_INVALID")
    question = _source(body.get("question"))
    answer = _source(body["answer"]) if body.get("answer") else None
    assets = {}
    result = run(body.get("adapter"), year, question, answer, body.get("section"), assets)
    if result.get("status") not in ("ready", "partial"):
        assets = {}
    return {"result": result, "assets": {k: base64.b64encode(v).decode("ascii") for k, v in assets.items()}}


MAX_PAGES = 4
PAGE_ZOOM = 2.0  # 約144dpi。スマホで図の細部が読める大きさ


def render_pages(body):
    """PDFの指定ページを、そのまま画像（PNG）にする。資格ごとの分解はしない。"""
    if not isinstance(body, dict):
        raise BadRequest("BODY_INVALID")
    part = body.get("pdf")
    if not isinstance(part, dict) or not isinstance(part.get("base64"), str):
        raise BadRequest("PDF_REQUIRED")
    try:
        data = base64.b64decode(part["base64"], validate=True)
    except (binascii.Error, ValueError) as e:
        raise BadRequest("PDF_BASE64_INVALID") from e
    import fitz

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:  # noqa: BLE001
        raise BadRequest("PDF_UNREADABLE") from e
    count = doc.page_count
    nums = body.get("pages")
    find = body.get("find")
    matched = None
    if find is not None:
        # 見出し（例：「第11問」）を含む最初のページと、続くページを返す。ページ番号をAIに推測させないため
        if not isinstance(find, str) or not 1 <= len(find) <= 30:
            raise BadRequest("FIND_INVALID")
        span = body.get("span", 2)
        if not isinstance(span, int) or isinstance(span, bool) or not 1 <= span <= MAX_PAGES:
            raise BadRequest("SPAN_INVALID")
        key = find.replace(" ", "").replace("\u3000", "")
        norm = lambda t: t.replace(" ", "").replace("\u3000", "")  # noqa: E731
        texts = [doc[i].get_text() for i in range(count)]
        # 行の頭に見出しがあるページを優先し（目次や注意書きの言及を避ける）、無ければ文中に含むページ
        first = next((i + 1 for i, t in enumerate(texts) if any(norm(line).startswith(key) for line in t.splitlines())), None)
        if first is None:
            first = next((i + 1 for i, t in enumerate(texts) if key in norm(t).replace("\n", "")), None)
        if first is None:
            raise BadRequest("FIND_NOT_FOUND")
        nums = list(range(first, min(count, first + span - 1) + 1))
        matched = first
    elif not isinstance(nums, list) or not nums or len(nums) > MAX_PAGES or any(not isinstance(n, int) or isinstance(n, bool) or n < 1 for n in nums):
        raise BadRequest("PAGES_INVALID")
    out = {}
    nums = sorted(set(nums))
    for n in nums:
        if n > count:
            raise BadRequest("PAGE_OUT_OF_RANGE")
        pix = doc[n - 1].get_pixmap(matrix=fitz.Matrix(PAGE_ZOOM, PAGE_ZOOM), alpha=False)
        out[f"p{n}.png"] = base64.b64encode(pix.tobytes("png")).decode("ascii")
    tables, figures = page_layout(doc, nums)
    # 図だけを切り出したPDF（1ページに図1つ）。図が見つからなければページ全体。
    # ChatGPTは外部の画像を表示しないため、ファイルとして渡し、AI側のPythonで画像にする
    excerpt = fitz.open()
    if figures:
        for f in figures:
            excerpt.insert_pdf(doc, from_page=f["page"] - 1, to_page=f["page"] - 1)
            excerpt[-1].set_cropbox(fitz.Rect(f["bbox"]))
    else:
        for n in nums:
            excerpt.insert_pdf(doc, from_page=n - 1, to_page=n - 1)
    pdf_b64 = base64.b64encode(excerpt.tobytes(garbage=3, deflate=True)).decode("ascii")
    return {"pageCount": count, "matchedPage": matched, "pages": out, "excerpt": pdf_b64, "tables": tables, "figures": figures}


FIG_GAP = 15  # これより近い線や画像は同じ図とみなす（pt）
FIG_MIN_W, FIG_MIN_H = 80, 60  # これより小さいまとまりは図とみなさない（記号や下線）
FIG_MARGIN = 6
FIG_ATTACH = 80  # 図からこの距離までの小さなまとまり（方位記号など）は図に含める
CAPTION_GAP = 30  # 表のすぐ上（この距離まで）の文を、表の見出しとして付ける


_HALF = {c: c - 0xFEE0 for c in range(0xFF01, 0xFF5F)}  # 全角の英数字・記号を半角に（″などの記号はそのまま）


def _clean_cell(v):
    return " ".join((v or "").translate(_HALF).split())


def page_layout(doc, nums):
    """ページの表（行と列の文字）と、図（線や画像のまとまり）の位置を返す。

    表は PyMuPDF の表検出で読む。次のページの先頭に同じ列数の表が続くときは、ひとつの表につなぐ。
    図は、表の外にある線と画像を近いものどうしでまとめ、小さすぎるものを除いた範囲。
    """
    import fitz

    tables, figures = [], []
    for n in nums:
        page = doc[n - 1]
        prect = page.rect
        try:
            found = page.find_tables().tables
        except Exception:  # noqa: BLE001
            found = []
        tboxes = [fitz.Rect(t.bbox) for t in found]
        blocks = [b for b in page.get_text("blocks") if b[4].strip()]
        prev_bottom = 0
        for t, box in sorted(zip(found, tboxes), key=lambda x: x[1].y0):
            rows = [[_clean_cell(c) for c in r] for r in t.extract()]
            rows = [r for r in rows if any(r)]
            if not rows:
                continue
            caption = " ".join(_clean_cell(b[4]) for b in blocks if prev_bottom <= b[1] and box.y0 - CAPTION_GAP <= b[3] <= box.y0 + 1)
            last = tables[-1] if tables else None
            continued = last and last["page"] == n - 1 and not caption and box.y0 < prect.height * 0.25 and len(rows[0]) == len(last["rows"][0])
            if continued:
                last["rows"].extend(rows)
            else:
                tables.append({"page": n, "caption": caption, "rows": rows})
            prev_bottom = box.y1
        grown = [b + (-2, -2, 2, 2) for b in tboxes]
        rects = [fitz.Rect(d["rect"]) for d in page.get_drawings()]
        for img in page.get_images():
            rects.extend(page.get_image_rects(img[0]))
        rects = [r for r in rects if not any(g.contains(r) for g in grown) and r.width * r.height < prect.width * prect.height * 0.8]
        clusters = []
        for r in rects:
            r = fitz.Rect(r) + (-0.5, -0.5, 0.5, 0.5)  # 縦線・横線は幅0なので、重なりを判定できるよう少し太らせる
            merged = True
            while merged:
                merged = False
                for c in clusters:
                    if (c + (-FIG_GAP, -FIG_GAP, FIG_GAP, FIG_GAP)).intersects(r):
                        clusters.remove(c)
                        r |= c
                        merged = True
                        break
            clusters.append(r)
        big = [c for c in clusters if c.width >= FIG_MIN_W and c.height >= FIG_MIN_H]
        small = [c for c in clusters if not (c.width >= FIG_MIN_W and c.height >= FIG_MIN_H)]
        # 方位記号のような小さなまとまりは、近くの図に含める
        for c in small:
            near = [i for i, b in enumerate(big) if (b + (-FIG_ATTACH, -FIG_ATTACH, FIG_ATTACH, FIG_ATTACH)).intersects(c)]
            if near:
                big[near[0]] = big[near[0]] | c
        for c in sorted(big, key=lambda c: c.y0):
            # 図のすぐ外にある短い文字（点名など）も含める
            for b in blocks:
                br = fitz.Rect(b[:4])
                if len(b[4].strip()) <= 4 and (c + (-10, -10, 10, 10)).intersects(br):
                    c |= br
            box = (c + (-FIG_MARGIN, -FIG_MARGIN, FIG_MARGIN, FIG_MARGIN)) & prect
            figures.append({"page": n, "bbox": [round(v, 1) for v in box]})
    return tables, figures


class Handler(BaseHTTPRequestHandler):
    server_version = "qlp-parser"

    def _send(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self):
        token = os.environ.get("PARSER_TOKEN")
        if not token:
            return True
        return hmac.compare_digest(self.headers.get("authorization", ""), f"Bearer {token}")

    def do_GET(self):  # noqa: N802
        if self.path == "/healthz":
            self._send(200, {"ok": True, "parserVersion": PARSER_VERSION, "ocr": ocr.available()})
        else:
            self._send(404, {"error": "NOT_FOUND"})

    def do_POST(self):  # noqa: N802
        if self.path not in ("/v1/parse", "/v1/pages"):
            self._send(404, {"error": "NOT_FOUND"})
            return
        if not self._authorized():
            self._send(401, {"error": "UNAUTHORIZED"})
            return
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(413 if length > MAX_BODY else 400, {"error": "BODY_SIZE_INVALID"})
            return
        try:
            body = json.loads(self.rfile.read(length))
            self._send(200, render_pages(body) if self.path == "/v1/pages" else parse_request(body))
        except (BadRequest, json.JSONDecodeError) as e:
            self._send(400, {"error": str(e) if isinstance(e, BadRequest) else "BODY_INVALID"})
        except Exception as e:  # noqa: BLE001  想定外の失敗は理由を伏せて500
            print(f"parse failed: {type(e).__name__}: {e}", file=sys.stderr)
            self._send(500, {"error": "INTERNAL_ERROR"})

    def log_message(self, fmt, *args):  # 本文（PDF）をログに出さない
        sys.stderr.write("%s %s\n" % (self.command, self.path))


def main():
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
