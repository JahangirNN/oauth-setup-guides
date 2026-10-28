# Deploying to Vercel

## What ships

- `data/guides/` contains seven curated guides: GitHub, Linear, X, Cal.com, Discord, Google, and Meta. It is committed and read at runtime, so the library is non-empty on a fresh deployment.
- `data/generated/` is gitignored. It holds local repeat runs and is not part of a Git deployment.
- `data/cache/` is gitignored and best-effort. Fetched pages are re-fetched on a cold deployment.

`listGuides()` reads the Upstash index first, then `data/guides` and `data/generated`, and shows one row per app (latest run wins). Historical slugs remain reachable by direct link.

## 1. Import the project

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Open <https://vercel.com/new> and import the repository.
3. Framework preset: **Next.js**. Root directory: `.`. Install command: `npm ci`.
   Build command: `npm run build`. Output directory: leave the default (`.next`).
4. Project Settings → Node.js Version: **22.x** (Next 16.4.3 requires **>=20.9.0**).
5. Add the environment variables below to **Production** and **Preview**, then deploy.

## 2. Environment variables (exact names)

| Name | Required | Purpose |
|---|---|---|
| `IFM_API_KEY` | Yes, for live generation | Server-only IFM bearer token. Never prefix with `NEXT_PUBLIC_`. |
| `IFM_BASE_URL` | No | Defaults to `https://api.ifm.ai/v1`. |
| `IFM_MODEL` | No | Defaults to `IFM/K2-Horizon-375B-A23B`. |
| `UPSTASH_REDIS_REST_URL` | Yes, for share links | Upstash REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, for share links | Upstash REST bearer token. Server-only. |
| `APP_BASE_URL` | No | Reserved; not read by the current code. |

The library, guide pages, and `/api/health` render without `IFM_API_KEY`; only `/api/generate` fails, with the clear message `IFM_API_KEY is not set`. `/api/health` reports `model: "missing"` when the key is absent.

## 3. Upstash setup

1. Sign in at <https://console.upstash.com> and create a **Redis** database (free tier is enough).
2. Choose a region close to the Vercel function region to keep share-link reads fast.
3. Open the database → **REST API** → copy `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
4. Add both to Vercel (Production and Preview) and redeploy.

**Why Upstash is required:** Vercel functions have a read-only filesystem (except `/tmp`) and
instances are ephemeral. A generated guide must survive across requests and instances for
`/g/<slug>` share links to work. `src/lib/store.ts` writes `guide:<slug>`, adds the slug to the
`guides:index` set, and reads both back. Without the two variables, `saveGuide` tries the local
filesystem; on Vercel that fails, and the pipeline stops with a clear storage error instead of
returning a dead share link.

## 4. Local fallback behavior

- Without Upstash, `saveGuide` writes `data/generated/<slug>.json`. This works on a local disk.
- `getGuide` looks in Redis first (when configured), then `data/generated`, then `data/guides`.
- `data/cache` writes are best-effort and silently skipped if the filesystem is read-only.
- On Vercel without Upstash, generation completes the research but fails at publish with
  `The guide was generated, but no durable storage is available...`. Set Upstash before demoing
  live generation.

## 5. Commands

```bash
npm ci
npm run build      # production build
npm run start      # serve the production build locally
npm run typecheck  # tsc --noEmit
npm run lint       # alias for tsc --noEmit
npm run finalize   # rebuild data/guides from the latest data/generated run per app
```

`finalize` is a maintenance script, not part of the Vercel build. It also removes stale library
entries, so run it only when you intend to replace the shipped set.

## 6. Post-deploy smoke test

- [ ] `GET /api/health` returns `status: "ok"`, `model: "configured"`, `storage: "redis"`.
- [ ] `/` lists the seven curated guides.
- [ ] Open a library guide; click **Download .md** and confirm a `text/markdown` response.
- [ ] Use `/new` with a small unfamiliar app; stages stream and a share link is returned.
- [ ] Open the share link in an incognito window or on another device; it resolves.
- [ ] Wait for a cold start or redeploy; the share link still resolves (proves Redis).
- [ ] Preview deploy without `IFM_API_KEY`: library renders, health says `model: "missing"`, and
  generation shows `IFM_API_KEY is not set` instead of crashing at startup.
- [ ] Search the browser's loaded JS for `IFM_API_KEY`, `UPSTASH`, and `IFM-v1_`; expect no hits.

## 7. Runtime notes

- `/api/generate` sets `maxDuration = 300`; enable Fluid Compute on the Vercel project.
- The generation endpoint is unauthenticated and has no application-level rate limit. Do not expose a funded key publicly without adding auth and a per-IP/global cap.
- The build emits a Turbopack warning that dynamic `readdir` in `store.ts` traces the whole project. `data/guides` is included in the deployment, which is what the runtime needs. If the reads are ever narrowed, add `outputFileTracingIncludes` for `./data/guides/**/*.json`.
- Deploy through Git integration. If you use the Vercel CLI, add a `.vercelignore` covering `.env*`, `data/cache`, and `data/generated` so local secrets and artifacts are not uploaded.
