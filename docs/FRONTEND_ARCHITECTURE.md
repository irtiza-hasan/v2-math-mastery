# LLM-TA for Math Learning

## Design and implementation

The redesign extends the existing React / TypeScript / Vite application. It retains the KaTeX parser, screenshot compression and transcription confirmation, validated prerequisite DAG, per-module teaching, audited five-option questions with independent F, learner feedback, and existing Cloudflare Worker / Gemini provider. The provider was not replaced and no browser API key was introduced.

The course dashboard uses the supplied white-and-teal showcase as visual direction. Course context stays in the navigation, mathematical work occupies the center, and learning context appears in a collapsible right panel. Small screens use an accessible navigation drawer and stack the insights beneath the work. Seven named phase views replace the anonymous three-step navigation. Viewing a phase is not evidence of completion.

### Component hierarchy

- `main.tsx`: course navigation, save/error status, session selection, review queue, backup export.
- `CourseDashboard`: course creation, optional syllabus attachment, evidence summaries.
- `SessionList`: search, rename, archive/restore, permanent deletion with an explicit confirmation panel.
- `SkillMap`: course-specific graph and source-response evidence panel.
- `LearningWorkspace`: phase-specific views, context panel, map tab, notes, scratchpad, attachments, solution reconstruction, and transfer journals.
- `PrerequisiteGraph`: keyboard-selectable nodes, actual dependency edges, scrolling/zoom, and node details.
- `Tutor`: extracted existing tutor, including image workflow, teaching, MCQ, optional reasoning, optional feedback without a selection, and history. New feedback checkpoints require an explicit continuation before displaying the next question.
- `models.ts`: courses, sessions, shared course-skill identities, append-only observed evidence, and transparent status interpretation.
- `repository.ts`: versioned browser-storage boundary with legacy import and stale-write protection.
- `api-contracts.ts`: future provider-neutral problem analysis, prerequisites, diagnosis, response/feedback, integration, verified solution unlock, transfer, and evidence contracts.

## Persistence

Every new problem creates a stable session inside a course immediately. Problem drafts, selected choices, unsent reasoning/feedback, active questions, feedback-continuation state, original compressed image, history, phase, prerequisite map, notes, scratchwork, and attachments persist automatically. Reloading opens the dashboard; selecting the session restores its saved work. The prior single-profile problem is copied into an Imported learning course once; its original storage record is never removed.

The complete versioned record is synchronously written to localStorage after changes. Save failures (unavailable storage, quota, malformed saved content, or an observed newer revision) are surfaced prominently; in-memory work is exportable. The app does not claim cloud synchronization. Browser storage is origin-specific, can be cleared by the browser, is not encrypted, and has limited capacity. Attachments are limited to 1.5 MB each; total quota remains browser-dependent. Export JSON is available as a safety copy; a user-facing import/merge workflow is not implemented. A future remote implementation should replace `LearningRepository` and use authentication, transactional revisions, durable attachment storage, and conflict resolution. The tab revision guard detects ordinary stale writes but is not an atomic multi-tab transaction; edit from one tab at a time.

## Course evidence versus current diagnosis

Each course owns distinct skill IDs. Topics match by case-insensitive exact name inside that course; semantic synonym reconciliation is intentionally deferred. Every session links its local module IDs to those shared skill IDs. Original attempt records remain in the session; `SkillEvidence` is appended exactly once per observed response. Deleting a session removes its evidence; retaining the skill itself leaves an honest unassessed concept if no evidence remains.

- **Not assessed:** no assessed A–E observations. F is recorded as uncertainty, not an incorrect assessed answer.
- **Developing:** some evidence exists but is narrow, inconsistent, or insufficient.
- **Strong evidence:** the last five assessed responses were correct with no known reasoning error, spanning at least two sessions.
- **Needs review:** the most recent assessed observation is more than 21 days old. This is an explicit scheduling heuristic, not a measurement of forgetting.

These are transparent product heuristics, not psychometrically validated mastery classifications. No numerical mastery percentage is displayed. Course map edges are the union of relationships returned by individual problem maps, explicitly provisional. The graph renderer tolerates cycles in that union; each individual problem DAG still uses the existing validator. The syllabus is retained as context; it never creates invented dependency edges.

Prior observations from other sessions are supplied separately as `coursePrior`. The Worker bounds this to 20 concepts, up to three recent observations per concept, sanitizes fields, and sends it to the model as context only. No prior record affects current-session readiness. The first new problem still constructs its own minimal map, and all ten current diagnostic responses remain required. The existing early exit after five correct answers was removed in both client and Worker. Existing provider, mathematical audit, request validation, and progression gates remain. Deploying the updated Worker separately is necessary for this behavior on the hosted site; no deployment was performed.

## Implemented versus future integration

| Capability | Status |
| --- | --- |
| Courses, optional syllabus file, navigation | Implemented locally; no automatic syllabus parsing |
| Sessions, draft autosave, resume, rename, search, archive/restore, delete | Implemented in browser storage |
| Course evidence map and selected-skill observations | Implemented from actual saved responses |
| Problem-specific dependency map | Implemented from validated tutor output |
| Diagnostic and topic-training UI | Existing live provider preserved; feedback pause, count, topic selector, optional feedback retained |
| Mistake verification | UI sends learner-requested verification as feedback; updated Worker instructs a fresh same-skill check; no dedicated deterministic verification state machine |
| Prior-based initial diagnosis | Bounded prompt context in updated Worker; model-selected focus, never an assessment exemption |
| Integration | Existing audited derivation/proof checkpoints plus saved free-form work; scratchpad is not automatically graded |
| Complete solution | Student reconstruction journal and reflection checklist; verified complete-solution unlock requires future backend response |
| Near/mid/wider transfer | Persisted student-authored exercise/attempt journals and retrieval re-entry; generated/evaluated transfer requires future backend response |
| Cloud persistence, authentication, multi-device sync | Not implemented |
| Demo or fabricated student evidence | None seeded or presented as real |

The UI explicitly marks unsupported solution/transfer backend features. It never displays an invented full solution or marks a navigated phase complete. The internal Worker stage name `proof` is retained for API compatibility and displayed as general solution integration.

## Pedagogical specification

`DESIGN_BRIEF.md` preserves the supplied redesign specification. No separate updated tutoring prompt was present in this attachment; the existing Worker instructions remain the operational tutor specification with the compatibility changes described above. Before a future tutoring-engine upgrade, supply the authoritative complete Phases 0–6 prompt. Do not infer scientific validation, precise mastery, or a full assessment policy from UI labels.

## Validation

Run `npm ci`, `npm run check`, `npm test`, and `npm run build` on Node 22. The existing suite exercises origin restrictions, provider requests, authoritative answer grading, feedback, image inputs, request limits, malformed output recovery, independent mathematical question audit, LaTeX, dependency validation, module teaching, and solution-reconstruction gating. Additional regression assertions check ten-question diagnosis despite a correct streak and prior context forwarding without advancement. `tests/frontend.mjs` checks persistence round-trips, unsent drafts, evidence deduplication, course isolation/shared identities, uncertain F responses, review scheduling, legacy migration, and stale revision rejection.

Browser QA uses the managed local preview. The live production API is not used as a test fixture; real AI quality and deployment configuration require integration testing against a separately configured Worker. No branch merge, production website deployment, or Worker deployment is part of this change.
