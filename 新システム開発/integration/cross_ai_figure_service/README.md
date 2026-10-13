# Cross-AI official PDF figure service

This provider-neutral HTTP API fixes the cross-chat image-path problem. A client
uploads the PDF attached to its current conversation; the service verifies the
PDF bytes and a reviewed question layout, creates a new PNG crop from that PDF,
and returns a short-lived public HTTPS image URL plus the exact Markdown image
reference. It never returns `sandbox:` paths or asks the model to redraw a figure.

## MCP client contract

The same service exposes a stateless MCP Streamable HTTP endpoint at `/mcp`. A client that supports MCP can discover `extract_official_figure_from_attached_pdf` with `tools/list` and call it with the active attachment bytes encoded as base64 plus the exact supported `questionId`. The tool returns `structuredContent.markdownImage`, which must be inserted verbatim at the figure position. The MCP server does not claim that the AI client rendered that Markdown. The provider must be configured to forward its current PDF bytes to the MCP tool; this cannot be enabled by repository code alone.

## Client contract

Any AI platform or agent runner that can call an authenticated HTTP API and pass
its active conversation's PDF can use the same endpoint:

```http
POST /v1/figures/extract
Authorization: Bearer <server-side-api-key>
Content-Type: multipart/form-data

question_id=land-surveyor:2025:morning:6
file=<the PDF attached in this conversation>
```

On success, the service returns `status: ready`, the source PDF SHA-256, the
image SHA-256, `imageUrl`, and `markdownImage`. The AI must insert the exact
`markdownImage` string at the question's figure position in its normal answer.
It must not claim success until the API returns `ready` and the image reference
is actually included in the response. Clients can fetch the HTTPS URL without
access to the originating chat's filesystem.

`openapi.yaml` documents this general multipart operation. The OpenAI-specific
adapter accepts `openaiFileIdRefs` for GPT Actions. Other providers use the
provider-neutral multipart operation or an equivalent connector that forwards
the active chat's PDF bytes. Keep the API key in the platform's server-side
connector/action configuration; never expose it in a user prompt.

## Deploy

Build from the integration directory so the existing PDF extraction module is
included in the image:

```sh
docker build \
  -f 新システム開発/integration/cross_ai_figure_service/Dockerfile \
  -t cross-ai-figure-service \
  新システム開発/integration

docker run --rm -p 8080:8080 \
  -e PUBLIC_BASE_URL=https://your-public-https-host \
  -e FIGURE_API_KEY='replace-with-a-long-random-secret' \
  -v figure-data:/data \
  cross-ai-figure-service
```

Set `PUBLIC_BASE_URL` to the public HTTPS origin routed to this service. Put TLS
termination and rate limiting at the gateway. `/data/figure-store` must be
persistent and shared by instances serving image URLs. The service retains only
the extracted PNG and its integrity metadata for 24 hours by default; the
uploaded PDF is handled in a temporary directory and removed after extraction.

## Reviewed layouts and fail-closed behavior

The manifest currently contains the reviewed official Land Surveyor 2025
morning Q6 PDF hash, page, and crop rectangle. A PDF whose bytes differ, an
unknown question ID, invalid crop, missing file, or unsupported layout is
rejected. Adding another supported question requires verifying its official
PDF hash, page number, and crop rectangle and adding that reviewed entry to the
manifest. The model cannot choose or guess crop coordinates.

The service accepts one PDF per request (20 MiB maximum), returns PNG only, and
serves unguessable expiring HTTPS URLs. The OpenAI adapter restricts download
links to HTTPS `files.oaiusercontent.com`, port 443, and blocks redirects.

## What this enables

This is a shared transport and extraction mechanism, not a prompt-only feature.
Each AI product must have an HTTP action/tool/MCP connector that can forward its
current chat's uploaded PDF and insert returned Markdown into the answer. The
AI client must render ordinary remote Markdown images. An AI chat with neither
file-to-tool forwarding nor external tool support cannot call this service.
Actual provider setup and phone rendering must be verified after deployment;
passing these API tests does not claim that every AI app renders the image.
