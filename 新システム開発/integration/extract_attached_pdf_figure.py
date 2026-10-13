"""Render a reviewed figure crop from the PDF attached in the current chat.

The output is regenerated from the supplied PDF bytes on every invocation.
Call this only with attachment/chat identifiers supplied by the trusted chat
attachment connector and crop coordinates from the verified question bundle.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from pathlib import Path


def extract_attached_pdf_figure(
    pdf_path: str | Path,
    *,
    expected_pdf_sha256: str,
    attachment_id: str,
    chat_id: str,
    question_id: str,
    page_number: int,
    crop: dict[str, float],
    output_dir: str | Path,
    dpi: int = 180,
) -> dict:
    """Create a fresh PNG crop and a source-bound receipt, or raise ValueError."""
    try:
        import fitz
    except ImportError as exc:  # pragma: no cover - environment-specific
        raise ValueError("PYMUPDF_REQUIRED") from exc

    source_path = Path(pdf_path)
    raw = source_path.read_bytes()
    if not raw.startswith(b"%PDF-"):
        raise ValueError("ATTACHED_FILE_IS_NOT_PDF")
    digest = hashlib.sha256(raw).hexdigest()
    if not re.fullmatch(r"[a-f0-9]{64}", expected_pdf_sha256 or "") or digest != expected_pdf_sha256:
        raise ValueError("ATTACHED_PDF_HASH_MISMATCH")
    if not attachment_id or not chat_id or not question_id:
        raise ValueError("CURRENT_CHAT_ATTACHMENT_BINDING_REQUIRED")
    if type(page_number) is not int or page_number < 1:
        raise ValueError("INVALID_PAGE")
    if type(dpi) is not int or not 100 <= dpi <= 300:
        raise ValueError("INVALID_DPI")
    if not isinstance(crop, dict) or not all(k in crop for k in ("x0", "y0", "x1", "y1")):
        raise ValueError("REVIEWED_CROP_REQUIRED")
    if not all(isinstance(crop[k], (int, float)) and math.isfinite(crop[k]) for k in ("x0", "y0", "x1", "y1")):
        raise ValueError("CROP_COORDINATES_INVALID")

    doc = fitz.open(stream=raw, filetype="pdf")
    if page_number > len(doc):
        raise ValueError("PAGE_OUT_OF_RANGE")
    page = doc[page_number - 1]
    rect = fitz.Rect(crop["x0"], crop["y0"], crop["x1"], crop["y1"])
    if rect.is_empty or rect.width < 2 or rect.height < 2 or not page.rect.contains(rect):
        raise ValueError("CROP_OUTSIDE_PAGE_OR_EMPTY")

    pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), clip=rect, alpha=False)
    png = pix.tobytes("png")
    if not png.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("PNG_RENDER_FAILED")

    safe_question = re.sub(r"[^A-Za-z0-9_-]+", "_", question_id).strip("_") or "question"
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    # Unique path prevents a prior chat's generated crop from being reused.
    image_path = out / f"{safe_question}-p{page_number}-{uuid.uuid4().hex}.png"
    image_path.write_bytes(png)
    return {
        "status": "ready",
        "mediaType": "image/png",
        "imagePath": str(image_path),
        "imageSha256": hashlib.sha256(png).hexdigest(),
        "width": pix.width,
        "height": pix.height,
        "generatedInChatId": chat_id,
        "derivedFromPdf": {
            "fileId": attachment_id,
            "pdfSha256": digest,
            "page": page_number,
            "crop": {k: float(crop[k]) for k in ("x0", "y0", "x1", "y1")},
            "extractionVerified": True,
        },
    }


def write_receipt(receipt: dict, receipt_path: str | Path) -> None:
    Path(receipt_path).write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
