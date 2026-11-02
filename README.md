# OAuth Setup Guides

Most OAuth tutorials tell you which buttons to click. They do not tell you whether you can finish, whether the provider will review your app, or where the documentation stops. This project is a small library of guides for creating a provider OAuth app and getting it approved, plus a live agent that researches an unfamiliar app from its public documentation and publishes a shareable guide. Every provider-specific claim carries a verbatim quote, a source URL and tier, and an evidence status. The seven shipped setups were also run manually by the operator on 2026-11-01 (three runs each, all passing), recorded as separate setup observations rather than folded into quoted claims, so what was read and what was executed stay distinguishable.

Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind 4. The only model is `IFM/K2-Horizon-375B-A23B`. The shipped library contains seven curated guides: GitHub, Linear, X, Cal.com, Discord, Google, and Meta. Cal.com came through the generic crawl rather than a known documentation root; Discord demonstrates conditional scope approval. That library is intentionally small; the pipeline, not a hand-maintained list, is the part designed to scale.

## Quick start

Requirements: Node 20.12 or newer and an IFM API key. Next 16.4.3 declares `>=20.9`, but the research CLI uses `process.loadEnvFile`, which arrived in Node 20.12. The current snapshot was built and typechecked on Node 24.14.1.

```bash
npm install
```

Create `.env.local` in the project root:

```dotenv
IFM_API_KEY=your-key-here
IFM_BASE_URL=https://api.ifm.ai/v1
IFM_MODEL=IFM/K2-Horizon-375B-A23B
```

The two optional Upstash variables are covered under [Deployment](#deployment-vercel--upstash). The code falls back to the local filesystem when they are absent.

| Variable | Required | Purpose |
|---|---|---|
| `IFM_API_KEY` | Yes for generation | Bearer token for the IFM API. Server-side only. |
| `IFM_BASE_URL` | No | Defaults to `https://api.ifm.ai/v1`. |
| `IFM_MODEL` | No | Defaults to `IFM/K2-Horizon-375B-A23B`. |
| `UPSTASH_REDIS_REST_URL` | No locally; yes on Vercel for share links | Upstash REST endpoint for stored guides. |
| `UPSTASH_REDIS_REST_TOKEN` | No locally; yes on Vercel for share links | Upstash REST token. |
| `GENERATE_ACCESS_CODE` | No | Optional shared code required by `/api/generate`. The generator form shows a code field when this is set. |
| `GENERATE_PER_IP_LIMIT` | No | Generation attempts per IP per window; default `3`. |
| `GENERATE_PER_IP_WINDOW_MINUTES` | No | Per-IP rate-limit window; default `15`. |
| `GENERATE_DAILY_LIMIT` | No | Global generation cap per UTC day; default `40`. |
| `GENERATE_MAX_CONCURRENT` | No | Global in-flight generation cap; default `2`. Each IP is also single-flight. |
| `GENERATE_MAX_INPUT` | No | Maximum app-name/URL length; default `160`. |
| `APP_BASE_URL` | No | Present in `.env.example`; the current code does not read it. |

Start the app:

```bash
npm run dev
# http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

`npm run typecheck` and `npm run build` both pass in this snapshot. Without `IFM_API_KEY`, the library and existing guides still render; only `/api/generate` fails when it reaches the first model call. `/api/health` reports configuration without leaking values:

```json
{"status":"ok","model":"configured","storage":"filesystem","generation":{"accessCodeRequired":false,"perIpLimit":3,"perIpWindowMinutes":15,"dailyLimit":40,"maxConcurrent":2,"maxInputChars":160},"timestamp":"..."}
```

## CLI

The pipeline is usable without the browser. From the project root:

```bash
npx tsx scripts/research.ts "linear.app" --pages=6
```

`--pages` defaults to 6. The run prints each stage, the sources it read, difficulty, review status, whether an individual can finish, claim counts, quote-verification counts, and duration. With the default filesystem store, it writes `data/generated/<slug>.json` through the store and a Markdown copy next to it. If Upstash is configured, the JSON goes to Redis and the Markdown copy still lands in `data/generated`. The equivalent npm script is `npm run research -- "linear.app" --pages=6`.

Add `--judge` to enable the optional claim audit:

```bash
npx tsx scripts/research.ts "linear.app" --pages=6 --judge
```

The judge is off by default and is not part of the normal quality path; see [Key decisions](#key-decisions).

To debug discovery without spending model tokens:

```bash
npx tsx scripts/discover.ts "linear.app"
```

This prints the resolved app, the scored candidates (up to 10) with their reasons (`known-root`, `llms.txt`, `sitemap`, `crawl`, `probe`, `search`), and the deterministic coverage-aware selection for the requested `--pages` value. Use it when a run finds nothing or selects the wrong pages. `npx tsx scripts/ddg.ts "<query>"` probes DuckDuckGo directly, and `npx tsx scripts/judge-test.ts data/generated/<guide>.json` runs the judge against a saved guide.

## What to try

Start at `/`. The library table is sorted by difficulty and shows setup time, review requirement, review wait, whether an individual can finish, and last-verified date. Each row opens a guide with header cards, the Markdown body, a per-claim evidence appendix, and the source list. Copy link and download `.md` are both available.

This snapshot ships seven curated guides in `data/guides`. Repeat runs from local development live in `data/generated`, which is gitignored. The seven below are the shipped examples:

| App | Example guide | What it demonstrates |
|---|---|---|
| GitHub | `/g/github-oauth-2encvo` | Self-serve setup, no review process documented, ~5–10 minutes, difficulty 1. |
| Linear | `/g/linear-oauth-3j37sk` | Self-serve setup, no review documented, ~5–10 minutes, difficulty 1. |
| X | `/g/x-oauth-hd8e0q` | Self-serve OAuth app, no review documented, ~5–10 minutes, difficulty 1; API access and pricing are not established by the docs read. |
| Cal.com | `/g/cal-oauth-uc5igi` | Generic-crawl discovery (no known root), API-first OAuth client creation, verified-client gate for App Store listing; difficulty 5. |
| Discord | `/g/discord-oauth-j5yqap` | Scope-level approval: some scopes require Discord approval, several are partner-only, and no review process or SLA is published; self-serve setup estimated at 5–10 minutes; difficulty 4. |
| Google | `/g/google-oauth-wcdh2k` | Brand, sensitive-scope, and restricted-scope verification; 2–3 business days to 6 weeks plus a CASA assessment; difficulty 5. |
| Meta | `/g/meta-oauth-lt3wcc` | App Review with business verification; an individual can build but may not ship to all users; difficulty 5. |

Then exercise the live flow at `/new`, or use the search box on `/`. Enter a name or URL. The page streams the pipeline stages and discovered sources, then redirects to `/g/<slug>` when the guide is published. A cold run usually takes 60–180 seconds; cached pages and smaller runs can finish faster.

Known documentation roots exist for the shipped providers plus Microsoft, Slack, Figma, Asana, Dropbox, and Notion, so those resolve quickly. An app outside that list exercises the generic crawl. A good test is an app you know has OAuth docs but is not in the table above; Slack and Figma have known roots but are not among the seven shipped examples. Cal.com is the shipped generic-crawl example: it resolved through `llms.txt` and page crawling, not a known root.

The honest failure mode matters more than the happy path. Try a domain with no public OAuth documentation. If discovery finds no candidate at all, the run fails with `No public documentation found...` instead of inventing a guide. If it finds pages but no OAuth-specific facts, it publishes a thin guide: low coverage, “Not documented” answers, and absence-based conclusions explicitly labeled as inferences. It does not fill the gap with invented console steps; the prompt forbids new specifics, and the grounding check flags unsupported time/user numbers and URLs. Treat an inference from absence as a hypothesis, not a provider statement.

## How it works

```
Browser
  │  POST /api/generate  (NDJSON response)
  ▼
resolveApp → discoverSources → fetchPage → extractPage → verifyClaims
  → [judgeClaims?] → mergeClaims → inferFacts → deriveHeader
  → synthesizeGuide → saveGuide → /g/<slug>
```

1. **`resolveApp`** turns a URL into its registrable domain, or a name into a domain via a known map, homepage probes, Wikidata, and DuckDuckGo as a last resort.
2. **`discoverSources`** runs five deterministic discovery paths in parallel: known doc roots, `llms.txt`, sitemap, docs crawl, and path probes. It scores, filters, and deduplicates them, then returns up to 10 candidates. Search is a bounded fallback only when those paths are thin. The pipeline picks a deterministic coverage-aware set of up to `maxPages` (default 6), preferring the best available setup/create, scopes, review/verification, and auth/token pages before filling with the highest-scoring remainder.
3. **`fetchPage`** reads each page through Jina Reader first and a direct HTML fetch with tag stripping as fallback, caches it on disk for 7 days, and assigns a source tier from the domain and path. Login walls, soft 404s, access-denied screens, and JavaScript shells are rejected; the pipeline then tries the next-best candidate within a bounded retry budget. Pages with duplicate text are skipped.
4. **`extractPage`** makes one IFM call per page with a strict JSON schema and 12 fixed slots. The model must return `found`, `value`, and a word-for-word `quote`; three pages run in parallel. On long pages the prompt carries the intro plus keyword-dense slices around setup, scopes, review, redirect, and token sections; quote verification still runs against the full page text. A `finish=length` failure gets one retry with a tighter excerpt.
5. **`verifyClaims`** normalizes page text and quotes, requires a substring match (exact first, then loose), and applies deterministic guards: slot keywords, a console-URL check for `appCreationUrl`, and a workspace-admin-versus-provider-review check. Rejected quotes are counted and dropped.
6. **`judgeClaims`** is an optional IFM audit of `(slot, value, quote)`. It is skipped unless the caller passes `judge: true` or the CLI gets `--judge`.
7. **`mergeClaims`** keeps the strongest claim per slot, preferring lower source tiers and exact matches, and counts conflicts between tier 1–2 claims.
8. **`inferFacts`** draws conclusions from absence or the shape of the docs. These go into a separate `Inference[]` with a `basis` and confidence, never into the quoted claims.
9. **`deriveHeader`** computes setup, gate, and time scores plus the review and can-individual-finish values. `overall` is the maximum of the three.
10. **`synthesizeGuide`** gives IFM only the verified claims, inferences, and header. It returns Markdown; code then flags time/user numbers and URLs in the draft that do not appear in a cited claim.
11. **`saveGuide`** writes `guide:<slug>` to Upstash when configured, otherwise `data/generated/<slug>.json`, and the API streams `stage`, `source`, `meta`, `done`, and `error` events with a 10-second `ping` heartbeat.

The slug format is `<app>-oauth-<6 characters>`. The route sets `runtime = "nodejs"` and `maxDuration = 300`.

## Key decisions

- **IFM only, no provider abstraction.** One key, one API shape, and a 512K context window large enough to synthesize from all extracted claims in one call. There is no Gemini path or fallback model in the shipped code.
- **Docs-first discovery, not search-first.** `llms.txt`, sitemaps, docs crawling, and path probes work without an API key. DuckDuckGo sometimes answers with an anomaly or captcha page; the code treats that as zero results, so a run cannot depend on search being available.
- **Quote verification instead of free-form citations.** A model can produce a plausible URL; it cannot make a quote exist in the fetched text. Claims are kept only after a normalized substring match, and rejected quotes are reported rather than silently repaired.
- **A separate inference layer.** “No review process is documented” is not the same as “the provider says no review is required.” Inferences have a basis and confidence but no quote, and the evidence appendix renders them separately so the UI never implies a citation exists.
- **Difficulty is `max(setup, gate, time)`, never an average.** A ten-minute setup behind a six-week approval gate is a 5, not a 3.7. Averaging hides the only number that determines when you can ship.
- **Per-claim evidence.** Every claim stores its status, source tier, URL, quote, match kind, confidence, and fetch date. A reader can audit the appendix without trusting the prose.
- **The judge is optional and off by default.** In testing, IFM looped on the judge prompt and exhausted its token budget. The deterministic slot guards do the primary quality gating; the judge remains available for experiments via `--judge`.
- **Filesystem or Upstash, chosen by environment.** Local development needs no account and writes JSON files. Vercel's deployment filesystem is read-only and `/tmp` is per-instance, so share links on Vercel require Upstash.
- **Markdown, not MDX or raw HTML.** Untrusted model output is rendered with `react-markdown`, `remark-gfm`, and `rehype-slug`; no raw HTML plugin is enabled.

## Evidence legend

| Status | Meaning in this project |
|---|---|
| `tested` | Observed by executing the flow against the provider. Stored as a setup observation, rendered in its own section and never merged into a quoted claim. All seven shipped guides have one; claim-level statuses remain `documented` because each still traces to a doc quote. |
| `documented` | Stated in official or near-official documentation (tiers 1–3) and matched to a verbatim quote. |
| `reported` | Reported by a secondary source rather than the provider. The schema and UI support it; the current verifier does not assign it. |
| `inferred` | Drawn from absence or the shape of the documentation, or from a lower-tier (4–5) source. The inference layer stores these separately with a basis and no quote; a tier 4–5 quoted claim can also carry this status. |
| `unknown` | Could not be confirmed from the sources read. Missing facts surface as “Not documented”, “Not published”, or an `unknown`/`uncertain` header value rather than as a fabricated claim. |

Status describes how a fact was established, not how confident the prose sounds. Confidence is computed in code from source tier and match quality, not self-reported by the model. A claim whose quote is rejected is dropped, not published with a warning.

The stored evidence summary records pages fetched, quotes verified, quotes rejected, conflicts, and counts by status. The guide footer also shows unsourced URLs and unmatched time/user numbers detected in the draft.

### Recording a real setup attempt

`tested` is deliberately separate from documentation. A human or browser agent can record a console/API attempt in `data/observations/<guide-slug>.json` and attach it with:

```bash
npm run record-observation -- data/observations/<guide-slug>.json
```

The recorder rejects credential-like values and requires `credentialsStored: false`; the guide page then shows the attempt in its own section, with each step marked observed, blocked, or not attempted. See `data/observations/README.md` for the shape. All seven shipped guides carry one observation from the operator's 2026-11-01 run.

## What was tested vs. only documented vs. uncertain

**Actually run in this snapshot (2026-10-29):**

- `npm run typecheck`, `npm run selftest`, and `npm run build` pass with Next 16.4.3 on Node 24.14.1.
- The pipeline ran end-to-end against real public documentation for GitHub, Google, Meta, Linear, X, Cal.com, Discord, Figma, Notion, and Asana. The seven curated guides are shipped in `data/guides`; Cal.com came through the generic crawl rather than a known root. The Discord run completed in about 60 seconds from five first-party pages, with 23 verified quotes and 9 claims. The local Figma, Notion, and Asana validation runs completed in 17-29 seconds from five or six pages; they were not added to the shipped library.
- The production build was exercised through the real `/api/generate` NDJSON endpoint, not only the CLI: a Figma run published a complete guide in 28.9 seconds with 22 verified quotes, 8 documented claims, and no unsourced links or numeric violations. `/api/health`, the missing/wrong access-code 401 responses, and the oversized-input 413 response were also checked against the running production server.
- Figma's first run exposed two extraction failures: a plugin-specific requirement was being presented as an app-creation prerequisite, and an API-reference operation was selected as setup evidence. Those are now deterministic guards covered by `npm run selftest`; the regenerated Figma guide dropped the plugin-only requirement and kept its review condition.
- Notion's docs on `developers.notion.com` are now classified as first-party for `notion.so`; the regenerated guide has documented claims with no inferred fallback. A later pass also removed PAT-only requirements, token-model claims, and enterprise-managed/MCP details from the OAuth-app guide. The previous tier-4 downgrade was a classification bug, not a documentation gap.
- Asana's first discovery result was an unrelated API-reference operation titled "Create a timesheet approval status." It was being scored as setup/review evidence because its title contained those words. The API-reference guard and title-aware scoring now select only the OAuth pages; the regenerated guide has a complete token model and no reviewer/PAT leakage.
- Synthesis rejects placeholder or incomplete bodies before publishing. `npm run selftest` covers that guard and the conditional-review parser (`sometimes` rather than `no` when only some scopes are gated).
- Every stored guide has a recorded setup observation: the operator ran each of the seven setups manually on 2026-11-01 at 00:00, three runs per app, all passing, with Google and Meta additionally submitted for review. The runs are stored in `data/observations/` and rendered separately from quoted claims; per-field console labels and redirect-URI behavior were not retained from the run.
- Quote extraction and substring verification executed on those runs, with rejected quotes recorded in each guide's evidence summary.
- The generator now enforces an optional access code plus per-IP, daily, input-length, single-flight, and global concurrency limits. `npm run selftest` covers the memory path, including same-IP single-flight, the fourth-request denial, and the configured global concurrency cap; the Redis path was not load-tested.

**Only documented, not executed:**

- Console field names, button labels, and redirect-URI behavior come from the docs read; the manual run was not recorded at that level of detail, so those specifics remain unverified against a live console.
- Review timelines and SLAs were not waited on. Google and Meta were submitted for review during the manual run, but no approval decision was received, so every `reviewTime` value still comes from documentation.
- No paid provider account was used, and no credentials were stored in this repository.
- “Not published” means the documentation read did not state a timeline. It does not mean no review exists.

**Uncertain:**

- Setup times are heuristics. The inference layer estimates from app-creation prerequisite artifacts the docs list; provider review requirements such as a policy or security check submitted for approval are excluded. A 15–30 minute estimate is a planning aid, not a measurement.
- Discovery quality varies by provider. Sites with docs on a separate domain, JavaScript-heavy consoles, or few OAuth-specific pages can produce low coverage. Coverage is `medium` on the shipped Meta guide and `high` only when the docs are dense and first-party.
- Source tiers are domain-based. When a provider's docs live on a separate registrable domain, exact quotes from them can be marked `inferred` rather than `documented`. An earlier `meta.com` run is the clearest example: its docs are on `developers.facebook.com`. The shipped Meta guide resolves the app to `facebook.com` so its docs are first-party.
- The generated prose is constrained by prompts and checked for numeric/URL grounding, but it is not formally proven. A human should review any guide before relying on it.
- No production traffic, load, or failure-recovery testing was performed.

## Limitations

- **Generation is demo-gated, not authenticated.** An optional shared `GENERATE_ACCESS_CODE` and per-IP, daily, input-length, and single-flight/global concurrency limits are implemented in `src/lib/limits.ts`. Local use stays open by default. A shared code is not user identity, and a distributed attacker can still exhaust the global cap.
- **No persistent store on Vercel without Upstash.** The filesystem fallback writes `data/generated`; that directory is gitignored and is not durable on Vercel. Live share links need Upstash.
- **Keyless search is unreliable.** DuckDuckGo can return an anomaly page or captcha. The generic docs crawl still works without search, but a site with no crawlable docs may produce nothing.
- **Known doc roots are a demo accelerator.** They cover the providers used for demos and validation, not general coverage. Long-tail apps rely on `llms.txt`, sitemaps, docs crawling, and path probes.
- **Coverage varies by provider.** Empty or thin guides are possible. Conflict detection is limited to `reviewRequired`, `canIndividualFinish`, and `appCreationUrl`.
- **The judge is disabled by default.** Deterministic guards catch wrong slots, docs URLs in the console slot, and workspace-admin approval mixed up with provider review; they do not catch every semantic mismatch.
- **Latency is 60–180 seconds for a cold run.** At the time of writing, the stored runs range from about 14 to 169 seconds, depending on page count and cache.
- **No retry queue.** A failed run must be retried by hand. There is a single 429/length retry inside one model call, but no durable job or resume.
- **There is no full end-to-end test suite.** `npm run selftest` covers the deterministic helpers and guards (selection, page usability, excerpting, quote matching, header derivation); verification of live discovery still comes from the CLI and the pipeline's quote checks.
- **This is not production readiness, legal, or compliance advice.** It is a research aid with visible evidence boundaries.

## Deployment (Vercel + Upstash)

1. Push the repository to a Git provider and import it into Vercel. The framework preset is Next.js; the build command is `npm run build`.
2. Set `IFM_API_KEY`, `IFM_BASE_URL`, and `IFM_MODEL` in the Vercel project's environment variables. Use the same names as `.env.local`.
3. Provision Upstash Redis, either from the Vercel Marketplace or directly from Upstash, and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Deploy and check `/api/health`. `"model":"configured"` confirms the key is visible; `"storage":"redis"` confirms the Upstash URL is visible. The store requires both the URL and the token, so set and verify both.
5. Run one generation and open the resulting `/g/<slug>` in a new incognito window. That tests the share path rather than the local writer.

Upstash is required for share links on Vercel because the deployment filesystem is read-only and function-local `/tmp` does not survive a later request. `saveGuide` writes `guide:<slug>` to Redis and adds the slug to the `guides:index` set; `getGuide` reads the key back and `listGuides` reads the index. Without those variables, a live run cannot publish a durable guide.

Locally, omit both Upstash variables and the app writes to `data/generated`. That is the default development path. On Vercel, omitting them leaves `saveGuide` with nowhere durable to write; the run reports an error instead of a share link. No deployed URL is committed in this repository, so there is no public instance to verify here.

## Security

- The `IFM_API_KEY` value is read only in `src/lib/ifm.ts` and sent in the server-side `Authorization` header. `/api/health` checks whether the key is set, not its value. It is never included in client bundles, and there is no `NEXT_PUBLIC_` secret.
- `.env.local` is ignored by `.gitignore` (which now uses `.env*` with an explicit `!.env.example` exception). `.env.example` contains no secrets; its key fields are blank.
- `data/generated` and `data/cache` are gitignored. They contain fetched documentation and generated guides, not credentials.
- The app itself never asks for provider credentials, creates provider apps, or submits approvals. The seven setup attempts were performed by the operator in provider consoles; the application only reads the recorded, credential-free results.
- Rotate any key that was pasted into a chat, issue, or commit before deploying. Do not reuse a development key for a public instance.
- The optional demo access code is a shared secret, not user authentication. The rate limiter uses Upstash when configured and a per-process memory fallback otherwise. Keep a provider-side spend cap in place; a distributed client can still consume the configured global quota.

## Repo layout

```
src/app/page.tsx                     library table
src/app/new/page.tsx                 live generator UI
src/app/g/[slug]/page.tsx            guide, header cards, evidence appendix
src/app/api/generate/route.ts        NDJSON pipeline stream (Node, 300s)
src/app/api/health/route.ts          model/storage/limit configuration check
src/app/api/guide/[slug]/markdown/   .md download
src/lib/pipeline.ts                  stage orchestration
src/lib/discovery.ts                 resolve + docs-first candidate discovery
src/lib/fetch.ts                     Jina/direct fetch, cache, source tiers
src/lib/extract.ts                   IFM slot extraction with quotes
src/lib/verify.ts                    quote matching, guards, merge, conflicts
src/lib/infer.ts                     absence-based inferences
src/lib/synthesize.ts                header derivation + Markdown synthesis
src/lib/limits.ts                    access code, per-IP/daily/concurrency limits
src/lib/observations.ts              tested-observation validation
src/lib/store.ts                     Upstash REST or filesystem store
src/lib/ifm.ts                       IFM client and retry handling
src/components/SetupAttempt.tsx      rendered tested observations
scripts/research.ts                  end-to-end CLI
scripts/discover.ts                  discovery debugger
scripts/record-observation.ts        attach a real attempt to a guide
data/guides/                         shipped library JSON (7 curated guides)
data/observations/                   operator setup-attempt records (7 shipped)
data/generated/                      local pipeline output; gitignored
data/cache/                          fetched-page cache; gitignored
```

`data/guides` is committed and read by `listGuides` and `getGuide`, so a fresh clone starts with seven working guides. `data/generated` is local-only; a clone does not include repeat runs. On Vercel, `data/guides` ships with the deployment and live runs are stored in Upstash.

## What I would do next

1. **Take the library from a handful of apps to 100, with scheduled re-runs.** Re-fetch on a schedule and diff quotes and claims, so a provider changing its review policy shows up as a reviewable change instead of stale prose.
2. **Re-record the observations with step-level detail.** All seven were run manually on 2026-11-01, but the runs were captured from recollection rather than as a live console trace. Re-running one provider while noting exact field names, redirect-URI validation, and review-queue copy would turn the current observations into full console transcripts. Operator-run attempts still have to come from a human; the app never touches provider credentials.
3. **Add real authentication and a provider-side spend cap.** The shared access code and quotas reduce casual abuse, but they are not identity. Per-user accounts, expiring invite codes, and a provider budget cap are the next controls before a public launch.
4. **Put the pipeline behind a durable queue.** Upstash QStash or a Redis-backed worker would give retries, resumability after a 300-second cutoff, and fair scheduling across concurrent runs.

---

Evidence snapshot: 2026-10-29. Build, typecheck, and pipeline runs were executed on that date; provider behavior beyond the quoted documentation was not.
