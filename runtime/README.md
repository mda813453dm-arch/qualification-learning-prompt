# Qualification Learning Runtime (candidate)

This is an independent, non-production candidate. The current tutor remains available from `master_prompt.txt` on `main`; this branch does not replace it.

## Design
- The program owns workflow state, required-field gates, evidence validation, and deterministic transitions.
- The AI may explain and support learning, but cannot bypass a rejected program transition.
- A question is eligible only when its text, all choices, exact question key, mapped answer, and source evidence are validated.
- Retrieval exhaustion depends on recorded attempts and configured limits, not one failure.
- GitHub Actions runs tests. It is not an interactive API server and does not automatically connect a chat model.

## Implemented
- `src/state-machine.js`: initial learning workflow state machine.
- `src/retrieval-engine.js`: HTTPS CSV retrieval, quoted CSV parsing, candidate discovery, allowlisted official-host PDF download, PDF.js text extraction with Japanese CMaps, Takken question/answer table parsing, route/retry logging, and a strict evidence gate.
- Regression tests cover 403 retries, missing extraction, incomplete choices, key/answer mismatch, untrusted URLs, fallback routes, and the difference between unattempted and exhausted.
- Live GitHub Actions integration downloads RETIO's official 2025 Takken PDF and checks all 50 questions: four choices per question, question-key mapping, answer-table mapping, question pages 2–28, answer-table page 30, and Question 1 answer 3. Verified run: https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38129887710

## Retrieval limits
The integration covers one known-format PDF from RETIO. It does not parse exam-body HTML pages, handle arbitrary PDF layouts or all qualifications, or provide page-image/OCR review. The integration proves this PDF/parser worked from the GitHub Actions runner in that run; it does not prove every source or retrieval environment will behave the same. 403 and other failure routes use controlled tests, not live failures from every exam site.

The engine does not guess URLs, treat a reachable PDF as readable, or infer an answer mapping. Retrieval adapters must report the HTTP result and structured evidence, with source URL, retrieval time, and page evidence.

## Run tests
Requires Node.js 20 or later:
```sh
cd runtime
npm test
```

## Runtime and AI integration
GitHub-hosted source code does not execute just because an AI can read the repository. Use requires a running backend, a chat UI/tool that can call it, and durable session storage. A hosted model API would require a secret API key and may charge for usage. GitHub Actions is for CI or triggered jobs, not interactive sessions.

The current deterministic code and tests need no paid service. A free-tier serverless host may be an option later, but its quotas and storage must be checked before choosing. No hosting or AI provider has been selected.

## Release gate
Keep the existing master prompt until official-source coverage, extraction fallbacks (including visual review), persistence, AI integration, and end-to-end tests pass.
