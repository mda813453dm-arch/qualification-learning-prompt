"""経路Bの分解サーバー（T5。Cloud Run で動かす）。経路Aと同じ qlp_parser をそのまま使う。

  POST /v1/parse
    {adapter, year, section, question:{url, sha256, base64}, answer:{url, sha256, base64}|null}
  → 200 {result, assets:{<file>: <base64 PNG>}}
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
        if self.path != "/v1/parse":
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
            self._send(200, parse_request(body))
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
