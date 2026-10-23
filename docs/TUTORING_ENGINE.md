# V2 tutoring engine

The Cloudflare Worker is authoritative for progression. `/tutor` handles orientation, prerequisite mapping, diagnosis, accidental-error verification, and targeted topic training. `/learning` handles controller-only decisions, ordered integration, verified solution unlock, transfer, and REPITITION. The browser stores the opaque authenticated state token with the local session and cannot advance a phase by changing view state or request fields.

## Deterministic rules

- Phase 0 and Phase 1 are explicit controller states and are recorded before the first audited Phase 2 question. The initial conversational response presents orientation, a minimal prerequisite map, and the first diagnostic question without solving the problem.
- Phase 2 requires at least ten A–E/F responses. Question 10 opens a choice to continue diagnosis or advance; it never advances silently. Course evidence may change the generated starting focus or difficulty but does not count as a current response.
- A wrong diagnostic or training response enters `mistake-check`. A learner claim of a silly mistake opens a fresh same-skill verification item; the original miss remains recorded. Rejecting the claim records a gap directly. `F` records uncertainty and does not enter the silly-mistake flow.
- Phase 3 uses evidence-guided ladders from the supplied V2 specification: secure topics receive two varied verification items, mildly shaky topics target four responses, and weak topics target ten. Misses add replacement work; the controller requires sound observations, multiple assessment angles, and no unresolved miss. These are operational gates, not psychometrically validated mastery scores.
- Phase 4 is an audited, ordered sequence of five-choice reconstruction questions. Only the active step can be accepted. Incorrect/uncertain work leaves that step active. A later step or client-supplied unlock flag cannot bypass the sequence.
- Phase 5 is unlocked only after every controller-owned integration step is accepted and the complete solution passes independent mathematical review.
- Phase 6 supports audited near, mid, and wider transfer. REPITITION starts with ten original-problem-first questions, then remains active with interleaved retrieval until the learner explicitly stops.
- Optional feedback or clarification never consumes, replaces, or grades the active question.

## Conversation and rendering

The frontend persists a chronological message array containing problems, questions, learner answers/reasoning, tutor explanations, phase events, integration work, and the verified solution. Legacy sessions are migrated from the existing attempt history. The current question stays singular and separate from prior turns. KaTeX rendering uses the shared parser for questions, choices, explanations, scratchwork, and saved history. Generated visuals are restricted to the validated fixed diagram vocabulary (`none`, sequence, number line, or mapping); arbitrary HTML, SVG, and JavaScript are never executed.

## Provider and auditing

Gemini remains the only provider and the configured model default remains `gemini-3.5-flash-lite`. Generation schemas constrain controller-relevant fields but tutor prose remains free-form inside explanation/feedback fields. Every generated diagnostic, training, integration, retrieval, solution, and transfer artifact is validated before state advancement. Malformed output, ambiguity, audit rejection, timeout, and rate limiting return an error without issuing an advanced token.

Tutor responses expose generation, audit, and total request time. Learning actions expose total request time. Retrieval feedback and next-question generation run concurrently, followed by the question audit. These measurements are observability data, not claims about live-provider speed; the automated tests use a mock endpoint.

## Persistence and security limits

The application remains anonymous and browser-local. There is no account identity, durable server session, or cross-device synchronization. `CONTROLLER_SECRET` should be an independent Worker secret of at least 16 characters. Tokens are encrypted and authenticated, bound to course/session IDs, and keep answer keys out of browser-visible question objects. Because the architecture is stateless, any previously issued valid token can be replayed to fork an earlier state. Durable anti-replay and concurrency control require server-side storage and are not implemented. Local transcripts, drafts, images, notes, and scratchwork are readable to anyone with access to the browser profile.

## Validation scope

`npm test` runs mock-provider workflows covering all seven phases for representative Real Analysis, Information Theory, and numerical optimization fixtures; diagnostic minimum and continuation; A–F handling; verification; ladders; course isolation; ordered integration; unlock rejection; transfer; continuing REPITITION; persistence/migration; token tampering; provider failure; and LaTeX parsing. Mock fixtures verify orchestration and invariants, not live Gemini mathematical quality. Live-provider correctness, latency, OCR quality, and rate-limit behavior still require a separately configured preview Worker and are intentionally not claimed here.
