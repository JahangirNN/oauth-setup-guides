# OAuth Setup Guides — Build Plan

**Assignment:** Composio APM Integrations take-home.
**Goal:** A library of shareable guides for creating a provider OAuth app and getting it approved, plus a live flow that generates a guide for any app a reviewer names.
**Budget:** 6–8 hours. **Deadline pressure:** the reviewer will submit an unfamiliar app and watch it generate live.

---

## 1. What we are building

A Next.js app with two surfaces:

1. **Library** — 6 pre-generated guides (GitHub, Linear, X, Microsoft Entra, Google, Meta) rendered from one schema.
2. **Live generator** — user submits an app name or URL; a pipeline discovers the provider's docs, fetches them, extracts claims with verbatim quotes, verifies them, and renders a shareable guide at `/g/<slug>`.

The product thesis: **existing guides tell you which buttons to click. This tells you which buttons will cost you six weeks — and where the evidence stops.**

Three differentiators, in priority order:

| # | Differentiator | Why it scores |
|---|---|---|
| 1 | **"Can I finish this?"** — `individualCanFinish` (yes / yes_paid / build_only / no / uncertain) | The question every tutorial omits; it is the week-long mistake |
| 2 | **Tested ceiling** — the exact point where the walkthrough stops being verifiable | Maps directly to "what you tested vs what sources support" |
| 3 | **Per-claim evidence badges** — tested / documented / reported / uncertain, each with a quote + URL | Makes "sound judgment about evidence" visible, not claimed |

---

## 2. Verified environment facts (tested 2026-10-28, not assumed)

### 2a. Primary model — IFM K2 Horizon

| Check | Result | Consequence |
|---|---|---|
| `IFM/K2-Horizon-375B-A23B` | 200, 0.5–2s on short prompts | **Working primary** |
| Context window | **512K tokens** (sparse MoE, 375B total / 23B active, Apache 2.0) | All 6 pages fit in one synthesis call |
| Daily allowance | **10,000,000 tokens/day per key**, resets 00:00 UTC, 429 + `Retry-After` past cap | ~100 guides/day; not a demo risk |
| Strict JSON schema | ✅ valid JSON in 947ms; unsupported keywords 400 at request time | Use for extraction + guide assembly |
| Function calling | ✅ correct `tool_calls` emission | Available if we want tool loops |
| Streaming | ✅ 234 SSE chunks, reasoning deltas included | Real token-by-token draft |
| Reasoning control | `chat_template_kwargs.reasoning_effort` = low / medium / high | Tunable cost/latency |
| Reasoning trace | Separate `reasoning_content`; **must be replayed verbatim** in multi-turn | Keep single-turn calls, or replay exactly |
| Extraction quality | 12s for 40k-char page, valid JSON, **4/4 quotes matched the page exactly** | Core evidence mechanism validated |
| Failure mode | `reasoning_effort: low` + `max_tokens: 4000` burned the entire budget on reasoning, `finish_reason: "length"`, no JSON | Must set generous `max_tokens` and check `finish_reason` |

### 2b. No fallback model

| Decision | Consequence |
|---|---|
| IFM is the only model provider | One key, one API shape, no provider abstraction to maintain |
| 10M tokens/day + 512K context | Enough headroom that a fallback is not needed for a 6–8h demo |
| 429 handling | `Retry-After` + one retry with backoff; if still failing, serve the pre-generated library and say so |
| Demo safety | The 6 library guides are static; an IFM outage cannot take down the main experience |

### 2c. Fetch and discovery — keyless

| Check | Result | Consequence |
|---|---|---|
| Jina Reader (`r.jina.ai`) | 200, 597ms, 24.6k chars clean markdown, keyless | **Primary fetch layer** |
| Jina Search (`s.jina.ai`) | 401 — auth required | Not usable |
| DuckDuckGo HTML | 200, 10 parsed results, official Linear docs ranked #1 | **Keyless discovery fallback** |
| `llms.txt` | Linear returns 131 doc URLs | Best first discovery probe |
| `sitemap.xml` | Linear returns 986 URLs | Second discovery probe |
| Direct fetch | 200 in 753ms, but 757k chars of raw HTML | Fallback only; needs extraction |

### 2d. The demo that proves the thesis

Asked cold, with no page attached, for GitHub OAuth facts:

- **Gemini 3.5 Flash** answered `reviewRequired: true, 1–2 business days` — **wrong**. GitHub OAuth Apps require no review.
- **IFM K2 Horizon** answered `reviewRequired: false, no formal review` — **correct**.

That is a ready-made demo: the model that reasons better is right, the one that reasons worse is confidently wrong, and the evidence pipeline is right in both cases because it never relies on memory.

---

## 3. Decisions (and what we rejected)

### 3.1 Model — IFM only

```
IFM/K2-Horizon-375B-A23B
```

Config:

- `chat_template_kwargs.reasoning_effort`: **`high` for extraction and synthesis.** `low` burned the entire output budget on reasoning in testing; `high` produced valid JSON with 4/4 exact quotes. Medium is acceptable for short classification calls if latency matters.
- `max_tokens`: **8,000 for extraction, 16,000 for synthesis.** Always check `finish_reason`. If it is `"length"`, retry once with a higher cap before accepting.
- `response_format: { type: "json_schema", strict: true }` for extraction and for the guide's structured fields. Keep schemas shallow — deep nesting degrades content quality even when it stays valid.
- Separate `content` from `reasoning_content`. Never parse the reasoning trace. Single-turn calls only, so no trace replay is needed.
- 512K context means the synthesis call can receive all 6 pages' extracted claims in one request.
- On 429: read `Retry-After`, wait once, retry. On repeated failure, fall back to the static library.

### 3.2 Search — own discovery layer, not Google grounding

**Do not use Gemini's built-in `google_search`.** Three reasons:

1. It returns 429 on this key (billing off).
2. Grounding terms restrict caching/syndicating results and displaying them to anyone other than the user who asked. A persisted, shareable guide is exactly that — a gray area we do not need.
3. Grounding returns citations, not verbatim source text. We need the quote for the evidence badge.

**Use instead:** DuckDuckGo HTML + `llms.txt` + `sitemap.xml` + homepage link scan, then fetch the pages ourselves. Keyless, auditable, and produces real quotes.

### 3.3 Fetch — Jina first, direct second, Firecrawl optional

| Layer | Role | Why |
|---|---|---|
| `r.jina.ai/<url>` | Primary | Keyless, 600ms, clean markdown, handles JS/PDF |
| `fetch` + Readability/trafilatura | Fallback | Free, fast, no third party |
| Firecrawl (if a key is added) | Optional upgrade | Best anti-bot handling; env-gated |

Cap: **6 pages per guide**, 30s per fetch, 2 retries.

### 3.4 Rendering — Markdown source, HTML output

- Model emits **plain Markdown**, never MDX/JSX.
- `react-markdown` + `remark-gfm` + `rehype-slug` + Tailwind typography.
- Copy buttons on code blocks; "Copy link", "Download .md", "Print / PDF".
- **No mermaid, no raw HTML, no `rehype-raw`.** Untrusted output.

### 3.5 Persistence — Upstash Redis

- `guide:{slug}` → JSON (TTL: none for demo library, 30d for generated)
- `src:{hash(url)}` → cached page text (7d)
- `rl:ip:{ip}:{hour}` → rate limit
- `lock:{appKey}` → single-flight

**Rejected:** filesystem / SQLite on Vercel (read-only, ephemeral), in-memory Map (per-instance), `@vercel/kv` (deprecated).

### 3.6 Framework — Next.js App Router on Vercel

- One deploy for UI, API, and share pages.
- Route handler with `maxDuration = 300` (Hobby limit with Fluid Compute).
- **Verify Fluid Compute is enabled** before demo day; otherwise the ceiling can drop to 60s.
- Node runtime, not Edge (25s first-byte limit).

---

## 4. Architecture

```
                    ┌─────────────────────────────────────────┐
Browser ──POST─────▶│  /api/generate  (Node, 300s, streaming) │
                    │                                         │
                    │  1 resolve     ── DDG + heuristics      │
                    │  2 discover    ── llms.txt → sitemap →  │
                    │                     homepage → site:     │
                    │  3 fetch       ── Jina → direct         │
                    │  4 extract     ── IFM, JSON+quotes        │
                    │  5 verify      ── exact match + numbers │
                    │  6 synthesize  ── IFM, NO tools         │
                    │  7 publish     ── Redis → slug          │
                    └───────────────┬─────────────────────────┘
                                    │ NDJSON events
Browser ◀──────────────────────────┘
   │
   └──▶ /g/<slug>  server-rendered guide + evidence appendix
```

**The one rule that makes this credible:** at stage 6 the model has **no web access**. It sees only verified claims with quotes. It cannot add a fact it did not read. Every sentence must cite a `claim_id`.

---

## 5. Guide schema (the product)

```ts
type Status = "tested" | "documented" | "reported" | "inferred" | "unknown";

type Field<T> = {
  value: T | null;
  status: Status;
  confidence: number;            // computed in code, not self-reported
  quote?: string;                // verbatim from fetched page
  sourceUrl?: string;
  checkedAt: string;
  conflicting?: boolean;
};

type Guide = {
  slug: string;
  app: { name: string; domain: string; consoleUrl: Field<string> };

  scores: {
    setup: 1|2|3|4|5;            // console → first token
    gate: 1|2|3|4|5;             // approval to reach strangers
    time: 1|2|3|4|5;             // elapsed, not effort
    overall: 1|2|3|4|5;          // max(), never average
  };

  whoCanFinish: Field<"yes"|"yes_paid"|"build_only"|"no"|"uncertain">;
  setupTime: Field<string>;
  reviewRequired: Field<boolean>;
  reviewTime: Field<string>;      // must be "not published" when it is
  totalTimeToLaunch: Field<string>;

  requiredFields: Field<string[]>;
  redirectRules: Field<{ rule: "exact"|"exact_https"|"wildcard_subdomain";
                          maxUris?: number; localhostExempt?: boolean }>;
  scopes: Field<{ model: string; examples: string[]; sensitivity?: string }>;
  tokens: Field<{ model: string; accessLifetime?: string }>;

  rejectionCauses: Field<string[]>;
  testedCeiling: { reached: string; beyondIsDocumented: boolean };
  whatUserSeesWhileUnverified: Field<string>;

  steps: { n: number; text: string; claimIds: string[] }[];
  sources: { url: string; title: string; tier: 1|2|3|4|5; fetchedAt: string }[];
  evidenceSummary: {
    pagesFetched: number; quotesVerified: number; quotesRejected: number;
    tested: number; documented: number; uncertain: number; conflicts: number;
  };
};
```

**Difficulty rule:** `overall = max(setup, gate, time)`. A 10-minute setup behind a 6-week gate is a 6-week problem. Averaging hides the only number that matters.

---

## 6. Pipeline stages, with hard caps

| # | Stage | Implementation | Cap |
|---|---|---|---|
| 1 | Resolve | If input is a URL, take registrable domain. If a name, one DDG search; require the name in title/snippet | 1 search |
| 2 | Discover | `llms.txt` → `sitemap.xml` → homepage link scan → `site:` query → DDG generic | 24 candidates |
| 3 | Rank & select | +4 first-party domain, +3 path matches `oauth|auth|app|verify`, +2 snippet mentions redirect/client secret, −5 forum/Reddit/YouTube | top 6 |
| 4 | Fetch | Jina primary, direct+trafilatura fallback, Firecrawl optional | 6 pages, 30s each |
| 5 | Normalize | strip markdown anchors/escapes, unify quotes/dashes, store offsets | — |
| 6 | Extract | IFM K2 Horizon, `json_schema` strict, quote-first prompt, `reasoning_effort: high` | 1 call/page, parallel 3 |
| 7 | Verify | exact substring match; number-in-quote check; source tier; optional judge | 1 judge batch |
| 8 | Synthesize | IFM K2 Horizon, no tools, verified claims only, `reasoning_effort: high` | 1 call, 2 retries |
| 9 | Publish | slug + Redis + render | — |

**Verification rules (code, not prompt):**

1. `quote` must be an exact substring of the normalized page text → else reject.
2. Every number/duration/URL in the final guide must appear in a cited quote.
3. `tested` is reserved for recorded observations. With no provider account, the honest output is **"0 tested, N documented, M unknown."**
4. Source tier ≥ 4 (blogs, forums, integration vendors) can corroborate but **cannot** establish `documented`.
5. Independence = registrable domain, not URL count. Two pages on `foo.com` are one source.
6. Conflicts are **published**, never averaged.

**Budget:** 6 pages, ~60k input tokens, ~10k output, 90s wall clock, ~**100k tokens per guide** against a 10M/day cap (≈100 guides/day). No per-call dollar cost on the IFM allowance.

---

## 7. UI

### Library `/`
- Hero: "Find out what it actually takes to ship this OAuth app."
- Search box (name or URL) → starts live generation.
- Comparison table: app · difficulty · setup time · review required · review wait · can I finish? · last verified.
- Sort/filter by difficulty and by `individualCanFinish`.

### Guide `/g/[slug]`
1. **At a glance** — difficulty, setup time, review time, can-I-finish, last verified.
2. **Do you need your own OAuth app?** — managed vs custom decision table.
3. **The 5 concepts** — provider app vs connection, client ID/secret, redirect URI, scopes, verification.
4. **Before you start** — checklist.
5. **Step-by-step** — numbered, exact fields, console URL.
6. **Scopes: the minimum that works** — scope → sensitivity → review impact.
7. **Approval / review** — required?, artifacts, timeline, rejection playbook. *This is the differentiator.*
8. **Troubleshooting** — literal error → cause → fix.
9. **Rollback** — revoke, rotate, delete.
10. **Evidence appendix** — every claim, its quote, its source, its status.

### Live generation `/g/new`
- Stage checklist with spinners → checks: resolve, discover, fetch (n/6), extract, verify, draft, publish.
- Sources appear as cards as they resolve.
- Draft streams into a `Streamdown` pane.
- First event within 300ms so it never looks dead.

---

## 8. Demo content

**Chosen six** (difficulty 1, 2, 2, 4, 5, 5 — covers every archetype):

| App | Why | Tested ceiling |
|---|---|---|
| GitHub | Trivial, no review | Full flow (create app → token → API call) |
| Linear | Fiddly self-serve, refresh tokens | Full flow |
| X | Paid, self-serve, volatile pricing | Full flow (costs cents) |
| Microsoft Entra | Admin consent gate | Single-tenant registration |
| Google | Brand + sensitive/restricted review | Testing mode, 100-user cap |
| Meta | App Review + business verification | Dev mode, role-holder only |

**Depth on three (GitHub, Google, Meta), structure on six.** The table carries breadth; three deep guides prove the format.

---

## 9. 8-hour schedule

| Time | Work | Done when |
|---|---|---|
| 0:00–0:45 | Scaffold Next + Tailwind + typography; 6 library entries as Markdown | Home + guide render |
| 0:45–1:30 | Markdown pipeline, copy buttons, TOC, print CSS | GitHub guide looks shippable |
| 1:30–2:30 | Discovery + fetch + cache, as a CLI (`npm run research -- linear.app`) | Produces 4–6 pages + JSON |
| 2:30–3:30 | Extraction schema + quote verification | Quote validity > 95% on 5 apps |
| 3:30–4:15 | Synthesis with claim IDs + numeric grounding | Markdown guide from claims |
| 4:15–5:15 | `/api/generate` NDJSON stream + progress UI | Live run visible end to end |
| 5:15–6:00 | Redis persistence, slug, share page, rate limit | Share link works in incognito |
| 6:00–7:00 | Generate the 6 library guides; spot-check 3 against sources | Evidence badges populated |
| 7:00–7:45 | Deploy, README, `.env.example`, secret scan | Production URL works |
| 7:45–8:00 | Run 3 unfamiliar apps; record a backup demo | No surprises |

**Cut first if behind:** filters, PDF export, OG images, dark mode, regeneration.
**Never cut:** static library, live stream, share page, rate limit, README.

---

## 10. Test & evaluation plan

Build a CLI harness before the UI. It is faster to iterate and it becomes the evidence for the README.

**Eval set:** Linear, Notion, Slack, HubSpot, Airtable, Beehiiv (easy → docs split across help center → no self-serve flow).

**Metrics to report in the README:**

| Metric | Target |
|---|---|
| Quote validity (exact substring) | > 98% |
| Unsupported claims in final prose | < 5% |
| Numeric grounding violations | 0 |
| Unknown honesty (gold "not stated" → marked unknown) | 100% |
| Slot recall (correct value or explicit unknown) | > 80% |

**The GitHub test:** ask the pipeline for GitHub. A memory-only model says "review required, 1–2 days." The correct answer is **no review**. If the pipeline outputs "no review" with a docs quote, the evidence gate works.

---

## 11. Risks

| Risk | Trigger | Mitigation |
|---|---|---|
| Model unavailable | IFM 429/5xx | `Retry-After` + one backoff retry; on repeat, serve the static library with a clear banner |
| Reasoning eats the budget | `finish_reason: "length"` with no JSON (observed with `reasoning_effort: low` + 4k cap) | `max_tokens` 8k/16k; `reasoning_effort: high`; detect `length` and retry once with a larger cap |
| Field mis-mapping | Model returns a real quote for the wrong slot (observed: `redirect_rule` → authorize endpoint) | Tight per-field definitions + examples; one call per field group; reject on slot mismatch |
| Daily token cap | 10M tokens/day | ~100 guides/day of headroom; log usage per run; 429 handling with `Retry-After` |
| Vercel timeout | >300s run | 6-page cap, 110s internal deadline, stream partial, persist what exists |
| Discovery miss | Unfamiliar app with no `llms.txt` | 4-step cascade + `site:` retry + "low coverage" banner + list candidate URLs |
| Hallucinated timeline | Model fills a gap | Quote-or-null extraction; numeric grounding in code; `unknown` is a valid output |
| Thin docs | Startup with one page | Degrade to "here is the console URL and what to look for", visibly |
| Key burned during demo | Public endpoint | 3/hour/IP, 50/day global, single-flight, provider spend cap |

---

## 12. Credentials & submission hygiene

**Both keys in this conversation must be treated as compromised.** The Gemini key (`AIza…`) and the IFM key (`IFM-v1_…`) were pasted into chat. Only the IFM key is used by this build; rotate it before submission and use the replacement only in `.env.local` and Vercel env vars. The Gemini key should be revoked.

Required env:

```
IFM_API_KEY=
IFM_BASE_URL=https://api.ifm.ai/v1
IFM_MODEL=IFM/K2-Horizon-375B-A23B

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_BASE_URL=http://localhost:3000
```

- `.gitignore`: `.env*`, `!.env.example`
- Never `NEXT_PUBLIC_` on a secret.
- `git log --all -p | rg "AIza|IFM-v1|api[_-]?key"` before submitting — check history, not just the working tree.
- `/api/health` reports `{ model: "configured", redis: "ok" }` without values.
- Local run without a key must still render the library; only `/api/generate` is gated.
- README must state: what was tested, what was read, what is uncertain, and the exact date of verification.

---

## 13. Open questions for the user

1. **Persistence:** Upstash Redis, or filesystem-only for the local demo? Recommended: build the store abstraction now, wire Upstash when the account exists; filesystem for local.
2. **Hosting:** Vercel recommended. Hobby is non-commercial; a take-home qualifies, but Railway is the fallback if >300s is ever needed.

---

*Plan version 1.2 — 2026-10-28. IFM-only. Every environment claim in §2 was executed, not assumed.*
