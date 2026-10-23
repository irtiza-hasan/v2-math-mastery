# LLM-TA for Math Learning

A course-based mathematics learning workspace built with React, TypeScript, Vite, KaTeX, and a Cloudflare Worker. Adaptive diagnosis and targeted practice support numerical, symbolic, and proof-based mathematics.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

Node 22 is required for the test suite. Set `VITE_API_URL` to your Worker URL; the existing deployed Worker remains the fallback. API credentials belong only in Worker secrets. The Worker continues to use the existing Gemini provider.

Create a course, start a mathematical problem, and return through Saved sessions. Progress is automatically saved **only in this browser**. Export a JSON backup from the header. There is no account, cloud synchronization, or automatic syllabus extraction. Storage failures are shown explicitly.

The supplied [design brief](docs/DESIGN_BRIEF.md), [architecture guide](docs/FRONTEND_ARCHITECTURE.md), [tutoring engine guide](docs/TUTORING_ENGINE.md), and [V2 compliance matrix](docs/V2_COMPLIANCE.md) explain the data model, Worker state controller, API actions, persistence boundaries, current coverage, and known limits.

GitHub Pages still deploys only from `main`. Review this redesign on its feature branch before merging. Worker changes must be deployed separately after review; no production deployment is performed by this change.

For isolated local UI verification, run `VITE_API_URL=/__qa npm run dev:qa` and use a dedicated QA course. This explicitly selected test server returns mock tutor responses; normal `npm run dev` and production builds retain the existing provider. `/tests/responsive.html` is a 390px development-only preview. See the architecture guide for verified behavior and remaining limits.
