"""Stateless MCP tools for provider-neutral, attached-PDF figure extraction."""
from __future__ import annotations

import base64
import binascii
import json

PROTOCOL_VERSION = "2025-03-26"
TOOL_NAME = "extract_official_figure_from_attached_pdf"


def _error(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def dispatch_mcp(service, request):
    """Handle the MCP JSON-RPC methods used by standard MCP clients.

    The tool accepts bytes supplied by the active AI connector, verifies them
    through FigureService, and returns the exact HTTPS Markdown reference.
    It does not claim that a client rendered the image.
    """
    if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
        return _error(request.get("id") if isinstance(request, dict) else None, -32600, "Invalid Request")
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params") or {}
    if not isinstance(params, dict):
        return _error(request_id, -32602, "Invalid params")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": request_id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "qualification-learning-runtime", "version": "1.0.0"},
            },
        }
    if method == "notifications/initialized":
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {
            "jsonrpc": "2.0", "id": request_id,
            "result": {"tools": [{
                "name": TOOL_NAME,
                "description": (
                    "Extract the official figure crop from the PDF attached in the active chat. "
                    "Pass that PDF's bytes as base64 and the exact supported questionId. "
                    "Use the returned markdownImage verbatim at the matching figure position. "
                    "Never substitute a saved image, redraw the figure, or claim display was verified."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "questionId": {"type": "string"},
                        "pdfBase64": {"type": "string", "description": "Base64 of the PDF attached to this conversation."},
                    },
                    "required": ["questionId", "pdfBase64"],
                    "additionalProperties": False,
                },
            }]},
        }
    if method != "tools/call":
        if request_id is None and isinstance(method, str) and method.startswith("notifications/"):
            return None
        return _error(request_id, -32601, "Method not found")
    if request_id is None:
        return None

    arguments = params.get("arguments")
    if params.get("name") != TOOL_NAME or not isinstance(arguments, dict):
        return _error(request_id, -32602, "Unknown tool or invalid arguments")
    question_id = arguments.get("questionId")
    encoded = arguments.get("pdfBase64")
    if not isinstance(question_id, str) or not question_id.strip() or not isinstance(encoded, str) or not encoded:
        return _error(request_id, -32602, "questionId and pdfBase64 are required")
    try:
        pdf_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        return _error(request_id, -32602, "pdfBase64 must be valid base64")
    try:
        result = service.extract(pdf_bytes, question_id)
    except Exception as exc:
        code = getattr(exc, "code", None) or "FIGURE_EXTRACTION_BLOCKED"
        body = {"status": "blocked", "reason": code, "questionId": question_id}
        return {
            "jsonrpc": "2.0", "id": request_id,
            "result": {"content": [{"type": "text", "text": json.dumps(body, ensure_ascii=False)}], "isError": True},
        }
    return {
        "jsonrpc": "2.0", "id": request_id,
        "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                   "structuredContent": result, "isError": False},
    }
