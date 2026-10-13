import hashlib
import io
import json
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

import fitz

from .server import FigureService, Handler, MAX_PDF_BYTES


class FakeOpenAIResponse:
    def __init__(self, data, url):
        self.data = data
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def geturl(self):
        return self.url

    def read(self, size=-1):
        return self.data if size < 0 else self.data[:size]


class HandlerHarness(Handler):
    """Invoke the real HTTP handler methods without opening a local socket."""
    def __init__(self, service, method, path, body=b"", headers=None):
        self.service = service
        self.command = method
        self.path = path
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.status = None
        self.response_headers = {}

    def send_response(self, code, message=None):
        self.status = code

    def send_header(self, key, value):
        self.response_headers[key] = value

    def end_headers(self):
        pass


def make_pdf():
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((40, 45), "Official question")
    page.draw_line((130, 180), (130, 500), color=(0, 0, 0), width=2)
    page.draw_line((130, 500), (430, 330), color=(0, 0, 0), width=2)
    page.draw_circle((130, 500), 5, color=(0, 0, 0), fill=(0, 0, 0))
    raw = doc.tobytes()
    doc.close()
    return raw


class CrossAIFigureApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.pdf = make_pdf()
        self.sha = hashlib.sha256(self.pdf).hexdigest()
        self.question_id = "sample-cert:2025:morning:2"
        manifest = {
            self.question_id: {
                "questionId": self.question_id,
                "pdfSha256": self.sha,
                "pageNumber": 1,
                "crop": {"x0": 80, "y0": 140, "x1": 470, "y1": 560},
                "dpi": 180,
            }
        }
        self.now = [1000]
        self.service = FigureService(
            manifest=manifest,
            store_dir=self.root / "store",
            public_base_url="https://figures.example.test",
            api_key="test-secret",
            ttl_seconds=60,
            now=lambda: self.now[0],
        )
    def tearDown(self):
        self.temp.cleanup()

    def request(self, method, path, body=b"", content_type=None, auth="Bearer test-secret"):
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        if body:
            headers["Content-Length"] = str(len(body))
        if auth:
            headers["Authorization"] = auth
        handler = HandlerHarness(self.service, method, path, body, headers)
        (handler.do_POST() if method == "POST" else handler.do_GET())
        payload = handler.wfile.getvalue()
        data = json.loads(payload) if handler.response_headers.get("Content-Type", "").startswith("application/json") else payload
        return handler.status, handler.response_headers, data

    def post(self, path, body, content_type, auth="Bearer test-secret"):
        return self.request("POST", path, body, content_type, auth)

    def test_multipart_pdf_returns_https_markdown_and_fresh_served_png(self):
        boundary = "TestBoundary-0123456789"
        chunks = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"question_id\"\r\n\r\n{self.question_id}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"current-chat.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode(),
            self.pdf,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        status, _, result = self.post("/v1/figures/extract", b"".join(chunks), f"multipart/form-data; boundary={boundary}")
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["questionId"], self.question_id)
        self.assertEqual(result["sourcePdfSha256"], self.sha)
        self.assertTrue(result["imageUrl"].startswith("https://figures.example.test/v1/figures/"))
        self.assertEqual(result["markdownImage"], f"![公式図]({result['imageUrl']})")
        self.assertEqual(result["delivery"], "https-url")
        token = result["imageUrl"].rsplit("/", 1)[-1][:-4]
        status, headers, body = self.request("GET", f"/v1/figures/{token}.png")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertIn("inline", headers["Content-Disposition"])
        self.assertTrue(body.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(hashlib.sha256(body).hexdigest(), result["imageSha256"])

    def test_chatgpt_file_ref_is_downloaded_and_processed_as_current_turn_input(self):
        link = "https://files.oaiusercontent.com/file-example?signature=temporary"
        payload = json.dumps({"questionId": self.question_id, "openaiFileIdRefs": [
            {"name": "attached.pdf", "id": "file-current", "mime_type": "application/pdf", "download_link": link}
        ]}).encode()
        fake = FakeOpenAIResponse(self.pdf, link)
        with patch("cross_ai_figure_service.server.urllib.request.build_opener") as build_opener:
            build_opener.return_value.open.return_value.__enter__.return_value = fake
            status, _, result = self.post("/v1/integrations/openai/figures/extract", payload, "application/json")
        self.assertEqual(status, 200)
        self.assertEqual(result["sourcePdfSha256"], self.sha)
        self.assertIn("https://figures.example.test/", result["markdownImage"])
        build_opener.assert_called_once()
        self.assertEqual(build_opener.call_args.args[0].__class__.__name__, "_NoRedirect")
        build_opener.return_value.open.assert_called_once()

    def test_missing_auth_and_unknown_question_fail_closed(self):
        status, _, response = self.post("/v1/figures/extract", b"", "application/json", auth=None)
        self.assertEqual(status, 401)
        self.assertEqual(response["error"], "UNAUTHORIZED")
        with self.assertRaises(Exception) as unknown:
            self.service.extract(self.pdf, "unreviewed:question")
        self.assertEqual(unknown.exception.status, 404)

    def test_mismatched_pdf_hash_and_non_pdf_fail_closed(self):
        changed = self.pdf + b" "
        self.assertEqual(self.post_multipart(changed)[0], 422)
        self.assertEqual(self.post_multipart(b"not a pdf")[0], 415)

    def post_multipart(self, pdf):
        boundary = "FailClosedBoundary"
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"question_id\"\r\n\r\n{self.question_id}\r\n".encode()
            + f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode()
            + pdf
            + f"\r\n--{boundary}--\r\n".encode()
        )
        return self.post("/v1/figures/extract", body, f"multipart/form-data; boundary={boundary}")

    def test_openai_file_link_host_is_allowlisted(self):
        payload = json.dumps({"questionId": self.question_id, "openaiFileIdRefs": [
            {"mime_type": "application/pdf", "download_link": "https://attacker.example/x.pdf"}
        ]}).encode()
        status, _, response = self.post("/v1/integrations/openai/figures/extract", payload, "application/json")
        self.assertEqual(status, 400)
        self.assertEqual(response["error"], "OPENAI_DOWNLOAD_LINK_NOT_ALLOWED")

    def test_openai_file_link_rejects_nonstandard_port(self):
        payload = json.dumps({"questionId": self.question_id, "openaiFileIdRefs": [
            {"mime_type": "application/pdf", "download_link": "https://files.oaiusercontent.com:8443/x.pdf"}
        ]}).encode()
        status, _, response = self.post("/v1/integrations/openai/figures/extract", payload, "application/json")
        self.assertEqual(status, 400)
        self.assertEqual(response["error"], "OPENAI_DOWNLOAD_LINK_NOT_ALLOWED")

    def test_expired_image_is_not_served(self):
        result = self.service.extract(self.pdf, self.question_id)
        token = result["imageUrl"].rsplit("/", 1)[-1][:-4]
        self.now[0] += 61
        status, _, response = self.request("GET", f"/v1/figures/{token}.png")
        self.assertEqual(status, 410)
        self.assertEqual(response["error"], "IMAGE_EXPIRED")

    def test_request_size_cap(self):
        with self.assertRaises(Exception) as too_big:
            self.service.extract(b"%PDF-" + b"x" * MAX_PDF_BYTES, self.question_id)
        self.assertEqual(getattr(too_big.exception, "status", None), 413)


if __name__ == "__main__":
    unittest.main()
