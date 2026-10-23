# Tutoring behavior repair findings

This update is based on draft PR head `805e862` and the deterministic Worker test harness. It does not claim live Gemini behavior has been verified.

## Confirmed implementation defects and fixes

- **Uncertainty was implicit.** F was graded as `null`, but the persisted diagnostic observation did not identify why it was null. Diagnostic readiness summaries also treated every non-true response as an identified conceptual gap. The controller now records `classification: uncertain`, keeps F out of sound-reasoning evidence, and routes it to scaffolding without incrementing unresolved conceptual misses. The tutor response and rendered content blocks explicitly acknowledge F so model-authored praise cannot label it correct. Integration and REPITITION feedback apply the same rule.
- **Feedback-only request context was inconsistent.** The Worker accepted `note` at request validation but only forwarded `learnerFeedback.note` to Gemini. Feedback-only clients using the accepted `note` field therefore lost the clarification. The Worker now normalizes that field into prompt context; it preserves the current controller question and does not score an answer. The frontend explicitly labels clarification-only requests and includes recent choices with session history.
- **Question repetition had no application-side rejection.** Recent prompt text was available to Gemini, but a duplicate candidate could still pass schema and answer auditing. A bounded recent-question check now rejects exact matches, variable-renamed stems, and matching option sets alongside closely overlapping wording; it feeds the rejection back into the existing bounded generation retry and does not transition state until a valid question passes audit. A separate unit test permits a meaningfully different assessment of the same skill.
- **Phase-specific uncertainty feedback needed normalization.** Integration and retrieval use separate Worker actions; both now send explicit uncertainty classification to Gemini and force a neutral F acknowledgment in returned feedback. F cannot produce positive evaluation or successful retrieval evidence.

## Existing safeguards retained

The encrypted controller token remains authoritative for phase progression. Incorrect responses still go through the V2 possible-accident check and fresh verification question. Question schema validation and independent mathematical answer auditing happen before the controller accepts a generated item. Hidden answer keys remain stripped from frontend question objects. Gemini provider/model configuration and Worker secrets are unchanged.

## Remaining verification limits

The regression suite mocks Gemini. It verifies request composition, state transitions, answer labels, retry behavior and mathematical rendering contracts, but cannot establish that live Gemini will always produce pedagogically appropriate explanations. No browser driver was available in this execution environment, so the rendered UI was validated with the existing server-rendered conversation test rather than interactive desktop/mobile browser automation. Existing anonymous browser persistence and stateless encrypted-token replay characteristics are unchanged.
