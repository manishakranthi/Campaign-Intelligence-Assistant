# Campaign Intelligence Assistant

A chat-based advisor for cross-platform ad campaigns running on **Meta, LinkedIn, Google Ads,
Taboola, and StackAdapt**. Ask it about a campaign ticket and it pulls performance data, flags
anomalies, checks pacing/budget, and recommends reallocations — either through the LLM chat
interface (native tool-calling) or by uploading raw platform export files for a campaign that
isn't already in the tracked Google Sheet.

Built with Next.js 16 (App Router), TypeScript, and React 19.

> **Working in this codebase?** Read [AGENTS.md](./AGENTS.md) first — this Next.js version has
> breaking changes vs. older releases. Check `node_modules/next/dist/docs/` before relying on
> training-data assumptions about the framework's APIs.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without any `.env.local`, the app runs
entirely on mock data and mock chat responses — see below to wire up real providers.

Other scripts:

```bash
npm run lint        # ESLint
npx tsc --noEmit     # Type-check
npm run build        # Production build
npm test             # Vitest
```

`vitest.config.mts` (note the `.mts` extension, not `.ts`) forces Vite to load the config as
native ESM — with a plain `.ts` config, Vite `require()`s it as CommonJS, which crashes on
`std-env` (a pure-ESM dependency pulled in transitively) with `ERR_REQUIRE_ESM`. That config also
declares the `@/*` → `./src/*` alias that `tsconfig.json` has, since Vitest doesn't read
tsconfig path mappings on its own — without it, any test file that imports a module using the
`@/` alias (e.g. `src/app/api/chat/route.ts`) fails to resolve.

## Environment variables (`.env.local`)

`.env.local` is gitignored and never committed. Nothing here is required for the app to run —
each data source falls back to mock data if its variables are absent.

### LLM provider (chat tool-calling)

The chat route (`src/app/api/chat/route.ts`) tries providers in order and automatically fails
over to the next one on a rate limit, quota error, or timeout, so the ones you don't set are
simply skipped:

| Variable | Provider | Notes |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI (`gpt-4o-mini`) | Tried first. Needs billing credit on the project — `insufficient_quota` errors surface clearly and fail over automatically. |
| `GROQ_API_KEY` | Groq (`llama-3.3-70b-versatile`) | Free tier; get a key at [console.groq.com/keys](https://console.groq.com/keys). Low per-minute token limit — expect this to rate-limit under a multi-tool conversation. |
| `OPENROUTER_API_KEY` | OpenRouter (free model) | Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `NVIDIA_API_KEY` | NVIDIA NIM | Separate free-tier quota from OpenRouter's, so it gives genuine extra headroom as a last resort. |

At least one of these must be set or the chat endpoint returns a graceful "couldn't reach an AI
provider" message instead of erroring.

### Data source #1 — Google Sheets (performance data)

| Variable | Purpose |
|---|---|
| `USE_REAL_SHEETS` | `"true"` to read the real spreadsheet; anything else (or unset) uses built-in mock data. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | The sheet ID. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account with read access to the sheet. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key. Keep the literal `\n` escapes — the app un-escapes them at read time. |

### Data source #2 — ticketing (campaign metadata)

| Variable | Purpose |
|---|---|
| `USE_REAL_TICKETING` | No real integration wired up yet (Jira/Zendesk/Freshdesk TBD) — always uses the mock ticketing source regardless of this value today. |

Campaigns uploaded via the Upload feature (see below) are layered on top of whichever ticketing
source is active, so they always show up regardless of this setting.

### Data source #3 — trending audience signals

| Variable | Purpose |
|---|---|
| `META_APP_ID` / `META_APP_SECRET` | Meta app credentials, used only to exchange a short-lived user token for a long-lived one. |
| `META_ACCESS_TOKEN` | A **user** access token (not an app token) with the `ads_read` scope, from Graph API Explorer or your own OAuth flow. Powers live Meta Audience/Interest search. |
| `META_AD_ACCOUNT_ID` | Discovered via `/me/adaccounts`; not currently used by the interest-search integration, kept for future account-level insights. |

Meta user tokens expire (short-lived: ~1-2 hours; long-lived: ~60 days) and **cannot be silently
refreshed once expired** — you'll need to generate a new one and re-paste it. Google Trends needs
no key. Without a valid Meta token, the audience card falls back to mocked Meta data (still
labeled as mocked in the UI) while Google Trends stays live.

## Uploading campaigns from raw platform exports

Campaigns don't have to come from the Google Sheet. The upload button (top of the ticket
sidebar) accepts native export files — `.csv` or `.xlsx` — for any subset of the 5 platforms.
Uploading 2+ platforms for the same campaign unlocks cross-platform comparison automatically.
Uploaded campaigns are stored in a local file (`.uploaded-campaigns.json`, gitignored, not a real
database) merged transparently into every existing tool/analysis path.

Because these exports are single-snapshot totals rather than day-by-day rows, trend analysis and
anomaly detection are skipped for them (not enough history) — everything else (performance,
comparative analysis, pacing, budget reallocation, creative fatigue) works as normal.

## Deployment (Netlify)

The app is configured for Netlify via `@netlify/plugin-nextjs`. Set the same environment
variables listed above in the Netlify site's build/runtime environment settings — `.env.local` is
never deployed. The chat route bounds its own total request time (`REQUEST_DEADLINE_MS`) well
under Netlify's function execution limit and returns partial results gracefully if a provider is
slow, rather than letting Netlify kill the function outright.

## A note on `xlsx`

`package.json` pins `xlsx` to SheetJS's own CDN tarball
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) rather than the npm registry version —
the registry package has known unpatched CVEs, and this CDN build is SheetJS's own documented fix
for that.
