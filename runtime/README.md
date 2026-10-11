# Qualification Learning Runtime (candidate)

This directory is a new, non-production implementation candidate. The existing `master_prompt.txt` on `main` remains unchanged by this branch.

## Design
- The program owns workflow state, required-field gates, and deterministic transitions.
- The AI may explain, summarize, and propose learning support, but cannot bypass a rejected transition.
- Official-question grading is allowed only when the exact question version, answer mapping, and official answer evidence are marked verified.
- Retrieval exhaustion must be based on recorded attempts and configured limits, never inferred from a single failure.
- GitHub Actions runs deterministic tests. It is not itself a persistent interactive API server.

## Current status
Initial state-machine scaffold only. No AI API, official PDF retrieval, persistent user session, or production deployment is implemented yet. Do not use this candidate as a live tutor until the listed components and integration tests are completed.
