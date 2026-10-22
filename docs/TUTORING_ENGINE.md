# Tutoring engine

The Cloudflare Worker owns progression decisions. `/tutor` creates a session, grades submitted choices against the active question kept in an authenticated encrypted controller token, audits the next five-choice question, and returns a new token. `/learning` performs integration planning and step evaluation, verified solution unlock, transfer generation/evaluation, and retrieval-question generation. The browser stores the opaque token with the existing versioned local session record and sends it back when a conversation resumes.

## Current deterministic rules

- A session starts at Phase 2 with one active audited diagnostic question. At least ten diagnostic answers are recorded before Phase 3; a wrong answer triggers a fresh same-skill verification question. `F` is stored as uncertainty and is not graded as incorrect.
- Diagnostic mistakes are never erased. Verification distinguishes a possible accidental error (fresh response correct with sound reasoning), uncertainty, and a conceptual gap. Unresolved conceptual gaps are practiced in Phase 3.
- A prerequisite is considered ready after five sound, correct responses across at least three assessment types. This is a provisional controller policy, not a rule recovered from the authoritative updated tutoring prompt. Replace it when that specification is supplied.
- Integration uses an independently audited step plan. Each student step is evaluated and independently checked; only accepted step IDs count. A complete, independently audited solution is returned only after all plan steps are accepted.
- Transfer items and evaluations are independently checked before their state is recorded. Retrieval starts with an audited question and does not overwrite the original learning history.
- Question answer keys remain inside the encrypted token and are removed from API responses. Course/session IDs are bound to each token; the prerequisite map is taken from trusted state after session creation.

## Specification gap

The repository contains the earlier operational tutor instructions and general Phase 0–6 design notes, but not the authoritative updated tutoring prompt requested by the project. Exact diagnostic coverage, prescribed training ladders, remediation thresholds, integration acceptance policy, and transfer success criteria must be reconciled against that prompt. Current provisional rules are intentionally documented rather than presented as authoritative pedagogical policy.

## Persistence and security limitations

Session history and controller tokens use the current browser-local persistence architecture. There is no account identity, server-side durable session store, or cross-device sync. The token is encrypted and authenticated using `CONTROLLER_SECRET`; if not configured, the Worker derives a key from the Gemini key. Set a distinct random `CONTROLLER_SECRET` (at least 16 characters) in Worker secrets. Because tokens are stateless bearer credentials, an old token can be replayed to fork a prior valid state; preventing replay or concurrent forks requires durable server storage, which is outside the current anonymous architecture. Anyone with browser access can read or alter local transcripts/drafts, though changing a token does not change the server-validated progression state.

## Verification

Tests use a mocked Gemini endpoint and do not establish live Gemini mathematical reliability. Real-provider checks still need to verify structured output/schema compatibility, rate limits, timeout behavior, mathematical quality of generated maps/questions/evaluations/solutions/transfers, and the updated tutoring prompt. Keep all provider credentials in Worker secrets; never place them in frontend configuration.
