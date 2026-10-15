"""経路Bの分解サーバーのテスト（合成PDFを実際にHTTPで送る）。

実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import base64
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from qlp_parser.core import sha256
from qlp_parser.server import Handler
from tests.test_takken_synthetic import ANS, Q, URL, make_pdf


class ParserServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["PARSER_TOKEN"] = "test-token"
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.pdf = make_pdf(Q, ANS)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        os.environ.pop("PARSER_TOKEN", None)

    def post(self, body, token="test-token", path="/v1/parse"):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(req) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def body(self, pdf=None, sha=None):
        pdf = pdf or self.pdf
        return {"adapter": "takken", "year": 2025, "section": None,
                "question": {"url": URL, "sha256": sha or sha256(pdf), "base64": base64.b64encode(pdf).decode()}, "answer": None}

    def test_parse_returns_same_result_as_cli(self):
        status, out = self.post(self.body())
        self.assertEqual(status, 200)
        self.assertEqual(out["result"]["status"], "ready")
        self.assertEqual([p["correctAnswer"] for p in out["result"]["packets"]], [3, 1, 4])
        self.assertEqual(out["result"]["questionPdfSha256"], sha256(self.pdf))
        self.assertEqual(out["assets"], {})

    def test_token_required(self):
        self.assertEqual(self.post(self.body(), token=None)[0], 401)
        self.assertEqual(self.post(self.body(), token="wrong")[0], 401)

    def test_sha_mismatch_is_not_parsed(self):
        status, out = self.post(self.body(sha="0" * 64))
        self.assertEqual(status, 200)
        self.assertEqual(out["result"]["status"], "unavailable")
        self.assertEqual(out["result"]["reason"], "PDF_HASH_MISMATCH")

    def test_bad_requests(self):
        b = self.body()
        b["question"]["base64"] = "@@@"
        self.assertEqual(self.post(b), (400, {"error": "PDF_BASE64_INVALID"}))
        b = self.body()
        b["year"] = "2025"
        self.assertEqual(self.post(b), (400, {"error": "YEAR_INVALID"}))
        b = self.body()
        del b["question"]["sha256"]
        self.assertEqual(self.post(b), (400, {"error": "SHA256_REQUIRED"}))
        self.assertEqual(self.post(self.body(), path="/other")[0], 404)

    def test_unknown_adapter(self):
        b = self.body()
        b["adapter"] = "nothing"
        self.assertEqual(self.post(b)[1]["result"]["reason"], "ADAPTER_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
