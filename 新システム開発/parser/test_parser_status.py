"""New Cloud Run parser health route must be reachable and separate from protected parsing."""
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from qlp_parser.server import Handler


class ParserStatusRouteTest(unittest.TestCase):
    def test_both_status_aliases_return_real_version_and_parse_needs_a_token(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        background = threading.Thread(target=httpd.serve_forever, daemon=True)
        background.start()
        base = f"http://127.0.0.1:{httpd.server_port}"
        try:
            for path in ("/healthz", "/v1/status"):
                with self.subTest(path=path):
                    with urllib.request.urlopen(base + path, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn("application/json", response.headers.get("Content-Type", ""))
                        payload = json.load(response)
                        self.assertIs(payload.get("ok"), True)
                        self.assertIsInstance(payload.get("parserVersion"), str)
                        self.assertTrue(payload["parserVersion"])
                        self.assertIn("ocr", payload)
            with patch.dict(os.environ, {"PARSER_TOKEN": "local-test-token"}):
                request = urllib.request.Request(
                    base + "/v1/parse", data=b"{}", method="POST",
                    headers={"Content-Type": "application/json"},
                )
                with self.assertRaises(urllib.error.HTTPError) as rejected:
                    urllib.request.urlopen(request, timeout=5)
                self.assertEqual(rejected.exception.code, 401)
                self.assertEqual(json.load(rejected.exception), {"error": "UNAUTHORIZED"})
        finally:
            httpd.shutdown()
            background.join(timeout=5)
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
