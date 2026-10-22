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

The supplied [design brief](docs/DESIGN_BRIEF.md) and [architecture / feature-status guide](docs/FRONTEND_ARCHITECTURE.md) explain the data model, evidence heuristics, existing functionality, backend contracts, limitations, and validation. Complete-solution verification and generated transfer exercises are future integration boundaries; the frontend currently provides clearly labeled student reconstruction and transfer journals.

GitHub Pages still deploys only from `main`. Review this redesign on its feature branch before merging. Worker changes must be deployed separately after review; no production deployment is performed by this change.
