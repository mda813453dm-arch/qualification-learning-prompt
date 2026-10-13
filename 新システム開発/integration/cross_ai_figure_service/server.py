"""Cross-AI official-PDF figure extraction API.

The service accepts the PDF attached to the current conversation, verifies its
bytes against a reviewed question manifest, makes a fresh PNG crop, and serves
that PNG from a short-lived HTTPS URL. It never returns a machine-local path.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import time
import urllib.error
import urllib.request
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

INTEGRATION_DIR = Path(__file__).resolve().parent.parent
if str(INTEGRATION_DIR) not in os.sys.path:
    os.sys.path.insert(0, str(INTEGRATION_DIR))
from extract_attached_pdf_figure import extract_attached_pdf_figure

MAX_PDF_BYTES = 20 * 1024 * 1024
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{40,60}$")
OPENAI_FILE_HOST = "files.oaiusercontent.com"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not let a signed attachment URL redirect this service to another host."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class RequestError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


def _https_base_url(value: str) -> str:
    parsed = urlparse(value or "")
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("PUBLIC_BASE_URL_MUST_BE_HTTPS")
    return value.rstrip("/")


def _load_manifest(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1 or not isinstance(data.get("questions"), dict):
        raise ValueError("QUESTION_MANIFEST_INVALID")
    for question_id, item in data["questions"].items():
        if item.get("questionId") != question_id:
            raise ValueError("QUESTION_MANIFEST_ID_MISMATCH")
        if not re.fullmatch(r"[a-f0-9]{64}", item.get("pdfSha256", "")):
            raise ValueError("QUESTION_MANIFEST_PDF_HASH_INVALID")
    return data["questions"]


class FigureService:
    def __init__(self, *, manifest: dict, store_dir: str | Path, public_base_url: str,
                 api_key: str, ttl_seconds: int = 86400, now=time.time):
        if not api_key:
            raise ValueError("FIGURE_API_KEY_REQUIRED")
        if not 60 <= ttl_seconds <= 7 * 86400:
            raise ValueError("FIGURE_TTL_OUT_OF_RANGE")
        self.manifest = manifest
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self.public_base_url = _https_base_url(public_base_url)
        self.api_key = api_key
        self.ttl_seconds = ttl_seconds
        self.now = now

    def authorize(self, header: str | None) -> None:
        expected = "Bearer " + self.api_key
        if not header or not hmac.compare_digest(header, expected):
            raise RequestError(401, "UNAUTHORIZED")

    def extract(self, pdf_bytes: bytes, question_id: str) -> dict:
        if not isinstance(pdf_bytes, bytes) or not pdf_bytes:
            raise RequestError(400, "PDF_REQUIRED")
        if len(pdf_bytes) > MAX_PDF_BYTES:
            raise RequestError(413, "PDF_TOO_LARGE")
        if not pdf_bytes.startswith(b"%PDF-"):
            raise RequestError(415, "ATTACHED_FILE_IS_NOT_PDF")
        reviewed = self.manifest.get(question_id)
        if not reviewed:
            raise RequestError(404, "QUESTION_LAYOUT_NOT_REVIEWED")

        with tempfile.TemporaryDirectory(prefix="cross-ai-figure-") as temp:
            root = Path(temp)
            source = root / "attached.pdf"
            source.write_bytes(pdf_bytes)
            try:
                receipt = extract_attached_pdf_figure(
                    source,
                    expected_pdf_sha256=reviewed["pdfSha256"],
                    question_id=question_id,
                    page_number=reviewed["pageNumber"],
                    crop=reviewed["crop"],
                    output_dir=root / "crop",
                    dpi=reviewed.get("dpi", 180),
                )
            except ValueError as exc:
                code = str(exc)
                status = 422 if code == "ATTACHED_PDF_HASH_MISMATCH" else 422
                raise RequestError(status, code) from exc
            png = Path(receipt["imagePath"]).read_bytes()

        if not png.startswith(PNG_SIGNATURE):
            raise RequestError(500, "PNG_VALIDATION_FAILED")
        self._purge_expired()
        token = secrets.token_urlsafe(36).rstrip("=")
        expires_at = int(self.now()) + self.ttl_seconds
        image_path = self.store_dir / f"{token}.png"
        meta_path = self.store_dir / f"{token}.json"
        # Atomic writes prevent a GET from observing a partially written file.
        self._atomic_write(image_path, png)
        meta = {
            "questionId": question_id,
            "pdfSha256": receipt["sourcePdf"]["sha256"],
            "imageSha256": receipt["imageSha256"],
            "page": reviewed["pageNumber"],
            "expiresAt": expires_at,
        }
        self._atomic_write(meta_path, json.dumps(meta, separators=(",", ":")).encode())
        image_url = f"{self.public_base_url}/v1/figures/{token}.png"
        return {
            "status": "ready",
            "questionId": question_id,
            "sourcePdfSha256": meta["pdfSha256"],
            "imageSha256": meta["imageSha256"],
            "page": meta["page"],
            "imageUrl": image_url,
            "markdownImage": f"![公式図]({image_url})",
            "expiresAt": expires_at,
            "delivery": "https-url",
        }

    def get_image(self, token: str) -> tuple[bytes, dict]:
        if not TOKEN_RE.fullmatch(token):
            raise RequestError(404, "IMAGE_NOT_FOUND")
        image_path = self.store_dir / f"{token}.png"
        meta_path = self.store_dir / f"{token}.json"
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if int(meta["expiresAt"]) <= int(self.now()):
                image_path.unlink(missing_ok=True)
                meta_path.unlink(missing_ok=True)
                raise RequestError(410, "IMAGE_EXPIRED")
            png = image_path.read_bytes()
        except FileNotFoundError as exc:
            raise RequestError(404, "IMAGE_NOT_FOUND") from exc
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            image_path.unlink(missing_ok=True)
            meta_path.unlink(missing_ok=True)
            raise RequestError(410, "IMAGE_INTEGRITY_FAILED") from exc
        if not png.startswith(PNG_SIGNATURE) or hashlib.sha256(png).hexdigest() != meta.get("imageSha256"):
            raise RequestError(410, "IMAGE_INTEGRITY_FAILED")
        return png, meta

    def _purge_expired(self) -> None:
        now = int(self.now())
        for meta_path in self.store_dir.glob("*.json"):
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                if int(meta.get("expiresAt", 0)) <= now:
                    stem = meta_path.stem
                    (self.store_dir / f"{stem}.png").unlink(missing_ok=True)
                    meta_path.unlink(missing_ok=True)
            except (OSError, ValueError, TypeError):
                # Corrupt metadata is not served; remove it and its paired image.
                (self.store_dir / f"{meta_path.stem}.png").unlink(missing_ok=True)
                meta_path.unlink(missing_ok=True)
        for image_path in self.store_dir.glob("*.png"):
            if not (self.store_dir / f"{image_path.stem}.json").exists():
                image_path.unlink(missing_ok=True)

    @staticmethod
    def _atomic_write(path: Path, content: bytes) -> None:
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_bytes(content)
        os.replace(temp, path)


class Handler(BaseHTTPRequestHandler):
    service: FigureService | None = None
    server_version = "CrossAIFigure/1.0"
    sys_version = ""

    def do_GET(self):  # noqa: N802
        if self.path == "/healthz":
            return self._json(200, {"status": "ok"})
        match = re.fullmatch(r"/v1/figures/([A-Za-z0-9_-]+)\.png", urlparse(self.path).path)
        if not match:
            return self._json(404, {"error": "NOT_FOUND"})
        try:
            png, meta = self._service().get_image(match.group(1))
        except RequestError as exc:
            return self._json(exc.status, {"error": exc.code})
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.send_header("Content-Disposition", "inline; filename=official-figure.png")
        self.send_header("Cache-Control", "public, max-age=3600, immutable")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("ETag", '"' + meta["imageSha256"] + '"')
        self.end_headers()
        self.wfile.write(png)

    def do_POST(self):  # noqa: N802
        try:
            service = self._service()
            service.authorize(self.headers.get("Authorization"))
            if self.path == "/v1/figures/extract":
                pdf, question_id = self._parse_multipart_pdf()
            elif self.path == "/v1/integrations/openai/figures/extract":
                pdf, question_id = self._parse_openai_file_refs()
            else:
                return self._json(404, {"error": "NOT_FOUND"})
            return self._json(200, service.extract(pdf, question_id))
        except RequestError as exc:
            return self._json(exc.status, {"error": exc.code})
        except Exception:
            # Do not send paths, signed upload URLs, or internal exception text to clients.
            return self._json(500, {"error": "INTERNAL_ERROR"})

    def _parse_multipart_pdf(self) -> tuple[bytes, str]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data;"):
            raise RequestError(415, "MULTIPART_REQUIRED")
        body = self._read_body()
        message = BytesParser(policy=policy.default).parsebytes(
            b"MIME-Version: 1.0\r\nContent-Type: " + content_type.encode("ascii", "strict") + b"\r\n\r\n" + body
        )
        if not message.is_multipart():
            raise RequestError(400, "MULTIPART_INVALID")
        pdf = None
        question_id = None
        for part in message.iter_parts():
            field = part.get_param("name", header="content-disposition")
            payload = part.get_payload(decode=True) or b""
            if field == "file":
                if pdf is not None:
                    raise RequestError(400, "ONE_PDF_ALLOWED")
                pdf = payload
            elif field == "question_id":
                question_id = payload.decode("utf-8", "strict").strip()
        if not pdf or not question_id:
            raise RequestError(400, "PDF_AND_QUESTION_ID_REQUIRED")
        return pdf, question_id

    def _parse_openai_file_refs(self) -> tuple[bytes, str]:
        raw = self._read_body()
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RequestError(400, "JSON_INVALID") from exc
        question_id = data.get("questionId")
        refs = data.get("openaiFileIdRefs")
        if not isinstance(question_id, str) or not isinstance(refs, list) or len(refs) != 1:
            raise RequestError(400, "ONE_PDF_REFERENCE_AND_QUESTION_ID_REQUIRED")
        ref = refs[0]
        if not isinstance(ref, dict) or ref.get("mime_type") != "application/pdf":
            raise RequestError(415, "OPENAI_ATTACHMENT_MUST_BE_PDF")
        link = ref.get("download_link")
        parsed = urlparse(link if isinstance(link, str) else "")
        try:
            safe_port = parsed.port in (None, 443)
        except ValueError:
            safe_port = False
        if (parsed.scheme != "https" or parsed.hostname != OPENAI_FILE_HOST or
                parsed.username or parsed.password or not safe_port or parsed.fragment):
            raise RequestError(400, "OPENAI_DOWNLOAD_LINK_NOT_ALLOWED")
        request = urllib.request.Request(link, headers={"Accept": "application/pdf"})
        try:
            opener = urllib.request.build_opener(_NoRedirect())
            with opener.open(request, timeout=8) as response:
                if response.geturl() != link:
                    raise RequestError(400, "OPENAI_REDIRECT_NOT_ALLOWED")
                pdf = response.read(MAX_PDF_BYTES + 1)
        except RequestError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RequestError(422, "OPENAI_ATTACHMENT_DOWNLOAD_FAILED") from exc
        if len(pdf) > MAX_PDF_BYTES:
            raise RequestError(413, "PDF_TOO_LARGE")
        return pdf, question_id

    def _read_body(self) -> bytes:
        try:
            size = int(self.headers.get("Content-Length", "-1"))
        except ValueError as exc:
            raise RequestError(400, "CONTENT_LENGTH_INVALID") from exc
        if size < 0:
            raise RequestError(411, "CONTENT_LENGTH_REQUIRED")
        if size > MAX_PDF_BYTES + 64 * 1024:
            raise RequestError(413, "REQUEST_TOO_LARGE")
        body = self.rfile.read(size)
        if len(body) != size:
            raise RequestError(400, "REQUEST_BODY_TRUNCATED")
        return body

    def _service(self) -> FigureService:
        if self.service is None:
            raise RequestError(503, "SERVICE_NOT_CONFIGURED")
        return self.service

    def _json(self, status: int, data: dict):
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        # Avoid recording signed attachment URLs and authorization headers.
        print("figure-api", self.command, urlparse(self.path).path, args[1] if len(args) > 1 else "")


def create_server(service: FigureService, host="127.0.0.1", port=8080):
    handler = type("ConfiguredHandler", (Handler,), {"service": service})
    return ThreadingHTTPServer((host, port), handler)


def main():
    manifest_path = os.environ.get("FIGURE_MANIFEST_PATH", "question-layouts.json")
    store_dir = os.environ.get("FIGURE_STORE_DIR", "figure-store")
    public_base_url = os.environ.get("PUBLIC_BASE_URL", "")
    api_key = os.environ.get("FIGURE_API_KEY", "")
    questions = _load_manifest(manifest_path)
    service = FigureService(
        manifest=questions,
        store_dir=store_dir,
        public_base_url=public_base_url,
        api_key=api_key,
        ttl_seconds=int(os.environ.get("FIGURE_TTL_SECONDS", "86400")),
    )
    host = os.environ.get("FIGURE_BIND_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))
    server = create_server(service, host, port)
    print(f"Cross-AI Figure API listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
