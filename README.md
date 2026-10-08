# Proofwise — V2 Math Mastery

A responsive mathematics tutoring studio implementing the V2 mastery framework around one theorem at a time. The starter lesson is Lemma 3.18: if a Cauchy sequence has a convergent subsequence, then the full sequence converges.

## Stack

- React 18, Vite 6, TypeScript, Tailwind CSS utilities, KaTeX
- Cloudflare Worker with structured Gemini API calls
- GitHub Actions and GitHub Pages
- Browser localStorage; no learner account or server-side learning history

The default model is gemini-3.5-flash-lite. Google's current Gemini API pricing lists its standard input and output as free-tier; actual account quota and eligibility still apply. Google also marks free-tier prompts and responses as usable to improve its products. Check the AI Studio rate-limit page before a public demo, and do not send private research or personal information.

## V2 learning flow

- Phase 0 orientation records comfort, confusion, suspected gaps, and an optional diagram preference.
- Phase 1 asks for a minimal prerequisite map before teaching.
- Phase 2 uses one question at a time and tracks a ten-question adaptive diagnostic.
- Wrong answers are graded against the answer key on the Worker; the AI evaluates the written reasoning, then asks whether the error was a silly mistake before targeted repair.
- Phase 3 trains demonstrated gaps. Phase 4 reconstructs the proof in small local, intermediate, and synthesis steps. Phase 5 unlocks a complete solution only after sufficient work.
- REPITITION starts with retrieval of the theorem, uses prior weak skills, and returns to variants.
- Each question has A–E options, an F “I don't know yet” option, and optional written reasoning.
- Text .txt, .md, and .tex files can be imported (up to 12,000 characters); theorem and proof text can also be entered directly.
- Feedback and attempts persist in localStorage. Diagrams remain off unless selected and useful.

The model can still make mathematical mistakes. The Worker requests a structured answer-key audit and rejects malformed or unaudited questions, but this is not an independent formal proof checker.

## Run locally

Requirements: Node.js 20.19+ and npm.

~~~bash
npm ci
npm run dev
~~~

Create .env with the local Worker URL before running Vite:

~~~text
VITE_API_URL=http://127.0.0.1:8787
~~~

In a second terminal:

~~~bash
cd worker
npm ci
cp .dev.vars.example .dev.vars
~~~

Put the Gemini API key in worker/.dev.vars (never in a Vite variable), then run:

~~~bash
npm run dev
~~~

The Worker uses http://localhost:5173 for local requests by default. The API key remains server-side. Cloudflare's Workers Free plan currently includes up to 100,000 requests/day and 10 ms CPU per invocation; quotas and terms may change.

## Deploy the Worker

1. Create a free Gemini API key in Google AI Studio.
2. In worker/wrangler.toml, set ALLOWED_ORIGIN to the final GitHub Pages origin, such as https://irtiza-hasan.github.io (no trailing slash). The origin is a browser CORS filter; it does not authenticate callers.
3. From worker/, run npx wrangler login, then npx wrangler deploy.
4. Add the API key without putting it in a shell command or source file:

~~~bash
npx wrangler secret put GEMINI_API_KEY
~~~

Paste the key only into Wrangler's hidden/interactive prompt. Test https://<worker-name>.<your-subdomain>.workers.dev/health.

Do not commit .dev.vars, .env, or Wrangler credentials. .gitignore excludes these paths.

## Deploy GitHub Pages

1. Create irtiza-hasan/v2-math-mastery.
2. Enable Settings → Pages → Build and deployment → GitHub Actions.
3. The production frontend defaults to `https://proofwise-api.irtiza-proofwise.workers.dev`. If you later change the Worker URL, set the GitHub Actions repository variable `VITE_API_URL` to the new Worker base URL (no `/tutor` suffix).
4. Push to main. .github/workflows/pages.yml builds and publishes automatically.
5. The project URL will be https://irtiza-hasan.github.io/v2-math-mastery/.

GitHub Free supports public Pages sites from public repositories. Making this repository public also publishes the source tree, including the V2 framework file; choose private only if your GitHub plan supports Pages for private repositories or you are willing to use a different hosting plan. The site itself is public in either case.

## Checks

~~~bash
npm run check
npm test
npm run build
~~~

npm run check validates Worker syntax and TypeScript. npm test covers origin checks, structured generation, server-side grading, reasoning transport, the silly-mistake flow, and health. The build output is dist/.

## Security and operating limits

- The Gemini API key is a Cloudflare secret and is never built into the client.
- The Worker validates JSON, body size, question shape, answer key, and distinct options. It sets a timeout and has a small per-isolate burst limit. That burst guard is not a durable/global limiter; use Turnstile or Cloudflare rate limiting before wider public promotion.
- CORS does not prevent direct API calls. A public Worker can still be called outside the website.
- The correct answer is present in browser lesson state to support interactive grading. This is a learning demo, not a secure exam.
- Free model quotas can change, and Gemini may decline a request or return a 429.
- Written reasoning is sent to Google's Gemini API. Don't include sensitive information.
- Data is local to this browser and can be cleared through Configuration.

## Update and maintain

- Frontend changes: edit src/main.tsx or src/styles.css, run npm run check && npm test && npm run build, then push to main.
- Worker changes: edit worker/src/index.js, run npm test from the repository root, then deploy from worker/.
- To rotate the Gemini key, run npx wrangler secret put GEMINI_API_KEY again.
- If changing GEMINI_MODEL, choose a current model that supports structured output and check its free-tier quota first.
