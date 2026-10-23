# V2 compliance matrix

| V2 requirement | Implementation | Automated evidence | Remaining limit |
| --- | --- | --- | --- |
| Phase 0 orientation | Explicit controller state; initial tutor prose identifies givens, objective, structure, and bottleneck | Controller phase-history test | Orientation and mapping share the initial provider round trip |
| Phase 1 minimal prerequisite map | Validated acyclic per-problem map, course evidence supplied only as prior context | Worker schema/audit and three-domain fixtures | Model quality requires live review |
| Phase 2 adaptive diagnosis | One audited A–E/F question at a time; minimum ten; explicit continue/advance decision | Route and controller tests | No formal item-response model |
| Course evidence | Same-course observations are bounded prompt context and never increment current diagnosis/readiness | Route payload and course-isolation tests | Exact semantic topic matching remains limited |
| Silly-mistake handling | Wrong response -> learner decision -> fresh same-skill verification or recorded gap | Controller and route tests | Model must generate a genuinely fresh equivalent item |
| F uncertainty | Stored as `correct: null`; no false verification claim | Route test | None known |
| Phase 3 training | Smallest mapped gap; 2/4/10 ladder; varied assessment angles; unresolved misses add work | Controller ladder test | Pedagogical quality remains model-dependent |
| Clarification/feedback | Preserves active question and assessment count | Route regression test | None known |
| Phase 4 integration | Ordered five-choice reconstruction; active step only; partial feedback | Controller/action tests | Integration-plan granularity is model-dependent |
| Phase 5 solution | Server unlock only after every accepted step and independent solution audit | Unlock rejection/success tests | Live audit reliability requires Gemini validation |
| Phase 6 transfer | Audited near/mid/wider generation and evaluated learner work | Mock action workflow | Only near transfer is exercised end-to-end in the mock action test |
| REPITITION | Ten original-problem-first questions, then interleaved questions until explicit stop | Controller continuation and action tests | Scheduling is session-local, not calendar-based |
| Continuous conversation | Persisted typed message thread; active question singular; legacy history migration | Typecheck/build plus persistence suite | No cloud transcript storage |
| Mathematical rendering | Shared KaTeX parser for conversation, options, explanations, and scratchwork | Math regression suite and production build | Unsupported malformed source falls back to visible text |
| Safe visuals | Fixed validated diagram types rendered by application code | Schema validation | Does not yet offer a general safe plotting primitive system |
| Performance | Tutor returns generation/audit/total timings; learning actions return total; retrieval generation is parallelized | Mock suite exercises response fields | No live latency sample was taken in this change |
| Token security | Authenticated encrypted token, course/session binding, hidden keys, tamper rejection | Token/isolation tests | Valid older tokens can be replayed without durable storage |
| Persistence | Versioned browser record preserves drafts, messages, images, notes, scratchwork, and tokens | Frontend persistence/migration suite | Browser-only; no accounts or cross-device sync |
| Provider constraint | Existing Gemini integration/model configuration retained | Source inspection and request mocks | Real Gemini calls require configured Worker secrets |
