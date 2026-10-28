import { discoverSources, resolveApp, type Candidate } from "./discovery";
import { extractPage } from "./extract";
import { fetchPage } from "./fetch";
import { IFM_MODEL } from "./ifm";
import { deriveHeader, synthesizeGuide } from "./synthesize";
import { inferFacts } from "./infer";
import { shortId, slugify } from "./text";
import { judgeClaims, mergeClaims, verifyClaims, findConflicts, type VerifiedClaim } from "./verify";
import type { Claim, EvidenceStatus, Guide, PageDoc, RunEvent } from "./types";
import { saveGuide } from "./store";

export interface PipelineOptions {
  input: string;
  maxPages?: number;
  /** Optional second-model audit. Off by default: it is slow and not required. */
  judge?: boolean;
  onEvent?: (event: RunEvent) => void;
}

const CONCURRENCY = 3;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runPipeline(options: PipelineOptions): Promise<Guide> {
  const started = Date.now();
  const emit = (event: RunEvent) => options.onEvent?.(event);
  const maxPages = options.maxPages ?? 6;

  emit({ type: "stage", id: "resolve", status: "start", label: "Identifying the app and its domain" });
  const resolved = await resolveApp(options.input);
  emit({ type: "stage", id: "resolve", status: "done", label: resolved.domain, detail: resolved.confidence });

  emit({ type: "stage", id: "discover", status: "start", label: "Finding OAuth documentation" });
  const candidates = await discoverSources(resolved.name, resolved.domain);
  emit({
    type: "stage",
    id: "discover",
    status: "done",
    label: `${candidates.length} candidate sources`,
  });

  if (candidates.length === 0) {
    throw new Error(`No public documentation found for ${resolved.name} (${resolved.domain}).`);
  }

  const selected = candidates.slice(0, maxPages);
  emit({
    type: "stage",
    id: "fetch",
    status: "start",
    label: `Reading 0 of ${selected.length} sources`,
    total: selected.length,
  });

  let fetched = 0;
  const pages = (
    await mapLimit(selected, CONCURRENCY, async (candidate: Candidate) => {
      const page = await fetchPage(candidate.url, resolved.domain);
      fetched++;
      if (page) {
        emit({
          type: "source",
          url: page.url,
          title: page.title,
          status: "ok",
          tier: page.tier,
        });
        emit({
          type: "stage",
          id: "fetch",
          status: "progress",
          label: `Reading ${fetched} of ${selected.length} sources`,
          current: fetched,
          total: selected.length,
        });
      } else {
        emit({ type: "source", url: candidate.url, title: candidate.title, status: "failed" });
      }
      return page;
    })
  ).filter((p): p is PageDoc => Boolean(p));

  if (pages.length === 0) {
    throw new Error(`Documentation was found but could not be read for ${resolved.name}.`);
  }

  emit({ type: "stage", id: "fetch", status: "done", label: `${pages.length} sources read` });

  emit({ type: "stage", id: "extract", status: "start", label: "Extracting facts with quotes" });
  let extracted = 0;
  const extractions = await mapLimit(pages, 3, async (page) => {
    const result = await extractPage(page, resolved.name);
    extracted++;
    emit({
      type: "stage",
      id: "extract",
      status: "progress",
      label: `Extracted ${extracted} of ${pages.length} sources`,
      current: extracted,
      total: pages.length,
    });
    return result.claims.map((c) => ({ ...c, page }));
  });

  emit({ type: "stage", id: "extract", status: "done", label: "Facts extracted" });

  emit({ type: "stage", id: "verify", status: "start", label: "Verifying quotes against source text" });

  let rejected = 0;
  const allVerified: VerifiedClaim[] = [];
  for (const group of extractions) {
    for (const item of group) {
      const outcome = verifyClaims([item], item.page);
      rejected += outcome.rejected;
      allVerified.push(...outcome.verified);
    }
  }

  let judged = allVerified as Claim[];
  if (options.judge && judged.length > 0) {
    try {
      judged = await judgeClaims(judged);
    } catch (error) {
      // The judge is a quality gate, not a dependency. If it fails, keep verified claims.
      emit({
        type: "stage",
        id: "verify",
        status: "progress",
        label: `Judge skipped: ${error instanceof Error ? error.message.slice(0, 80) : "failed"}`,
      });
    }
  }

  const merged = mergeClaims(judged);
  const conflicts = findConflicts(judged);

  const byStatus: Record<EvidenceStatus, number> = {
    tested: 0,
    documented: 0,
    reported: 0,
    inferred: 0,
    unknown: 0,
  };
  for (const c of merged) byStatus[c.status]++;

  emit({
    type: "stage",
    id: "verify",
    status: "done",
    label: `${allVerified.length} quotes verified, ${rejected} rejected`,
    verified: allVerified.length,
    rejected,
  });

  const inferences = inferFacts(merged, pages);
  const header = deriveHeader(resolved.name, resolved.domain, merged, inferences);

  emit({ type: "stage", id: "draft", status: "start", label: "Drafting the guide" });
  const synthesis = await synthesizeGuide(resolved.name, resolved.domain, header, merged, inferences);
  emit({ type: "stage", id: "draft", status: "done", label: "Draft complete" });

  const slug = `${slugify(resolved.name)}-oauth-${shortId(6)}`;

  const guide: Guide = {
    slug,
    header,
    markdown: synthesis.markdown,
    claims: merged,
    inferences,
    sources: [...new Map(pages.map((p) => [p.url, { url: p.url, title: p.title, tier: p.tier, fetchedAt: p.fetchedAt }])).values()],
    evidenceSummary: {
      pagesFetched: pages.length,
      pagesUsed: pages.length,
      quotesVerified: allVerified.length,
      quotesRejected: rejected,
      claims: merged.length,
      conflicts,
      byStatus,
      unsourcedLinks: synthesis.unsourcedLinks,
      numericViolations: synthesis.numericViolations,
    },
    generatedAt: new Date().toISOString(),
    model: IFM_MODEL,
    durationMs: Date.now() - started,
  };

  emit({ type: "stage", id: "publish", status: "start", label: "Creating share link" });
  const persisted = await saveGuide(guide);
  if (!persisted) {
    throw new Error(
      "The guide was generated, but no durable storage is available. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on this deployment, or run locally."
    );
  }
  emit({ type: "stage", id: "publish", status: "done", label: "Published" });

  emit({ type: "meta", header, slug });
  emit({ type: "done", slug, durationMs: guide.durationMs, evidence: guide.evidenceSummary });

  return guide;
}
