import base64
import json
import unittest
import io
from email.message import Message

from .test_server import HandlerHarness
from .server import RequestError
from .mcp_protocol import TOOL_NAME, dispatch_mcp


class FakeService:
    def authorize(self, header):
        if header != "Bearer test-secret":
            raise RequestError(401, "UNAUTHORIZED")

    def __init__(self):
        self.calls = []

    def extract(self, pdf_bytes, question_id):
        self.calls.append((pdf_bytes, question_id))
        return {
            "status": "ready",
            "questionId": question_id,
            "sourcePdfSha256": "a" * 64,
            "imageSha256": "b" * 64,
            "page": 9,
            "imageUrl": "https://images.example.test/a.png",
            "markdownImage": "![公式図](https://images.example.test/a.png)",
            "expiresAt": 9999999999,
            "delivery": "https-url",
        }


class McpProtocolTests(unittest.TestCase):
    def setUp(self):
        self.service = FakeService()

    def test_initialize_and_tool_discovery(self):
        initialized = dispatch_mcp(self.service, {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
        })
        self.assertEqual(initialized["result"]["protocolVersion"], "2025-03-26")
        self.assertIn("tools", initialized["result"]["capabilities"])
        tools = dispatch_mcp(self.service, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        tool = tools["result"]["tools"][0]
        self.assertEqual(tool["name"], TOOL_NAME)
        self.assertEqual(tool["inputSchema"]["required"], ["questionId", "pdfBase64"])

    def test_tool_call_forwards_current_pdf_and_returns_exact_markdown(self):
        pdf = b"%PDF-1.7 attached-to-current-chat"
        question_id = "land-surveyor:2025:morning:6"
        response = dispatch_mcp(self.service, {
            "jsonrpc": "2.0", "id": "call-1", "method": "tools/call",
            "params": {"name": TOOL_NAME, "arguments": {
                "questionId": question_id, "pdfBase64": base64.b64encode(pdf).decode("ascii"),
            }},
        })
        self.assertEqual(self.service.calls, [(pdf, question_id)])
        result = response["result"]["structuredContent"]
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["markdownImage"], "![公式図](https://images.example.test/a.png)")
        self.assertFalse(response["result"]["isError"])

    def test_invalid_base64_and_wrong_tool_do_not_call_service(self):
        invalid = dispatch_mcp(self.service, {
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": TOOL_NAME, "arguments": {"questionId": "q", "pdfBase64": "%%%"}},
        })
        wrong = dispatch_mcp(self.service, {
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": {"name": "guess_figure", "arguments": {}},
        })
        self.assertEqual(invalid["error"]["code"], -32602)
        self.assertEqual(wrong["error"]["code"], -32602)
        self.assertEqual(self.service.calls, [])

    def test_notification_has_no_response(self):
        self.assertIsNone(dispatch_mcp(self.service, {
            "jsonrpc": "2.0", "method": "notifications/initialized",
        }))


class HttpMcpEndpointTests(unittest.TestCase):
    def test_authenticated_http_endpoint_dispatches_mcp_tool(self):
        service = FakeService()
        pdf = b"%PDF-1.7 attached"
        request = {
            "jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": {"name": TOOL_NAME, "arguments": {
                "questionId": "land-surveyor:2025:morning:6",
                "pdfBase64": base64.b64encode(pdf).decode("ascii"),
            }},
        }
        body = json.dumps(request).encode()
        headers = {
            "Content-Length": str(len(body)),
            "Content-Type": "application/json",
            "Authorization": "Bearer test-secret",
        }
        harness = HandlerHarness(service, "POST", "/mcp", body, headers)
        harness.do_POST()
        self.assertEqual(harness.status, 200)
        response = json.loads(harness.wfile.getvalue())
        self.assertEqual(response["result"]["structuredContent"]["status"], "ready")
        self.assertEqual(service.calls, [(pdf, "land-surveyor:2025:morning:6")])

    def test_http_endpoint_requires_authentication(self):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode()
        headers = {"Content-Length": str(len(body)), "Content-Type": "application/json"}
        harness = HandlerHarness(FakeService(), "POST", "/mcp", body, headers)
        harness.do_POST()
        self.assertEqual(harness.status, 401)


if __name__ == "__main__":
    unittest.main()
