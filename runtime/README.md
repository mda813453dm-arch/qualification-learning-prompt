# Qualification Learning Runtime (candidate)

This directory is an independent, non-production implementation candidate. The existing tutor remains available from `master_prompt.txt` on `main`; this branch does not replace it.

## Design
- The program owns workflow state, required-field gates, evidence validation, and deterministic transitions.
- The AI may explain, summarize, and propose learning support, but cannot bypass a rejected transition.
- Official-question presentation requires the question text, every choice, the exact question key, a mapped answer, and evidence from URLs present in the indexed candidate set.
- Retrieval exhaustion is based on recorded attempts and explicit configured route/retry limits, never a single failure.
- GitHub Actions runs tests. It is not an interactive API server and does not automatically connect a chat model.

## Implemented in this candidate
- `src/state-machine.js`: initial learning workflow state machine.
- `src/retrieval-engine.js`: HTTPS CSV index retrieval, quoted CSV parser, candidate discovery, configured official-host PDF download, PDF.js text extraction (including Japanese CMaps), a Takken question/answer-table parser, route/retry log, and strict evidence gate.
- Tests include 403 retry behavior, missing extraction, incomplete choices, key mismatch, answer mapping mismatch, untrusted URL rejection, route fallback, and not-attempted versus exhausted.
- GitHub Actions installs PDF.js and runs the regression suite. The live integration test downloads RETIO's official 2025 Takken PDF and verifies Question 1's four choices, answer 3, question page 2, and answer-table page 30.

## Retrieval engine contract and limits
The engine accepts retrieval adapters. An adapter must report the HTTP response and provide extracted structured evidence. The engine does not guess URLs, does not treat a reachable PDF as readable, and does not infer an answer mapping. Each question and answer source must be an indexed URL marked official by the adapter, with retrieval time and page evidence.
The integration currently covers one known-format PDF from RETIO. It does not yet parse exam-body HTML pages, support arbitrary PDF layouts or all qualifications, or provide page-image/OCR review. A passing Takken integration test establishes that this PDF and parser worked from the GitHub Actions runner at that run; it does not establish that every source or retrieval environment will behave the same. HTTP 403 and other failure routes are verified with controlled tests, not actual 403 conditions from every exam site.

## Running tests
Requires Node.js 20 or later:
```sh
cd runtime
npm test
```

## Runtime / AI integration
GitHub-hosted source code does not execute merely because a model can read the repository. A real integration needs a running backend (for example, a small serverless function or hosted Node service), a chat UI/tool that can call it, and durable storage for session state. If using a hosted model API, the backend also needs an API key stored as a secret and API usage may incur charges. GitHub Actions can run scheduled or triggered jobs, but is not a suitable interactive session store/server.
Possible first deployment path: GitHub Actions for CI plus a free-tier serverless Node endpoint and a small database. Provider, free quotas, persistence, and API costs must be checked before selecting a production host. No paid service is required for the current deterministic code and tests.

## Release gate
Do not replace or remove the existing master prompt until real official sources, extraction routes (including visual review fallback), persistence, AI integration, and end-to-end tests have passed.
