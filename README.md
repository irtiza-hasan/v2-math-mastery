# Math Mastery Study Space

A browser-based mathematics practice site with a React, TypeScript, Vite, and KaTeX frontend; a Cloudflare Worker connects questions to Gemini. Learner progress is stored locally in the browser. There are no accounts.

## Local development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run check
npm test
npm run build
```

## Deployment

GitHub Actions builds the frontend and deploys it to GitHub Pages when changes are pushed to `main`. The app uses the public Worker endpoint configured in `src/main.tsx`; set `VITE_API_URL` only if that endpoint changes.

The Worker source is in `worker/`. Deploy it with Wrangler from that directory. Keep `GEMINI_API_KEY` as a Cloudflare Worker secret and never add it to frontend files or GitHub. Configure `ALLOWED_ORIGIN` to the exact GitHub Pages origin.

## Anonymous learner data

Each browser creates an anonymous local learner profile. The **New learner** control creates another isolated profile on that device. Progress does not sync between browsers or devices.
