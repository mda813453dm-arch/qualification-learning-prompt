# ChatGPT private MCP candidate (work in progress)

This folder contains a qualification-agnostic MCP service prototype intended to be called from the ChatGPT mobile app. It is separate from the current master prompt.

## Implemented in this prototype
- Private-user identity is required before any state is read or written.
- A study session is saved in D1 and can be restored across chats.
- The question index CSV is read from its maintained URL; results are labeled as candidates only.
- Candidate lookup records route, HTTP result, time, and outcome in D1.
- AI-supplied claims cannot mark a source, question, or answer as verified. Verification-dependent state transitions and question/answer presentation are blocked.

## Not yet usable as a complete tutor
The MCP server does not yet download and extract candidate PDFs, verify every choice and the exact answer-table cell, or present and score a question. Those steps must be connected to the tested retrieval engine before this Site is deployed to ChatGPT. The current verification result is deliberately limited to index candidate discovery plus the separately tested RETIO PDF parser in `runtime/src/retrieval-engine.js`.

## Intended ChatGPT connection
The target is a private Site MCP server. After a complete integration passes tests, publishing that Site creates a private ChatGPT tool connection. The AI API key is not needed for this path because the model continues running inside ChatGPT. GitHub Actions alone cannot provide interactive chat responses.

No paid third-party service has been added. The Site is private and unpublished; no deployment has been made.
