import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { displayNameFor } from "../src/lib/domain";
import { inferSetupTime } from "../src/lib/infer";
import { addAgentSection, deriveHeader } from "../src/lib/synthesize";
import type { Claim, EvidenceStatus, Guide, Inference } from "../src/lib/types";

const ROOT = process.cwd();
const GENERATED = path.join(ROOT, "data", "generated");
const LIBRARY = path.join(ROOT, "data", "guides");

function sanitizeClaims(claims: Claim[]): Claim[] {
  return claims.filter((claim) => {
    if (claim.sourceTier >= 5) return false;

    if (
      claim.slot === "setupTime" &&
      !/\d|\b(few|several|under|instant|immediately|self-serve|same day)\b/i.test(claim.value)
    ) {
      return false;
    }

    if (claim.slot === "appCreationUrl") {
      const url = claim.value.match(/https?:\/\/[^\s)`"']+/)?.[0];
      if (!url) return false;
      const isDocumentation =
        /^https?:\/\/(docs?\.|learn\.|support\.|help\.|documentation\.)/i.test(url) ||
        /\/(docs?|documentation|learn|support|help)\//i.test(url);
      const looksLikeConsole = /(settings|console|dashboard|developer|apps?|oauth|portal|cloud|admin)/i.test(url);
      if (isDocumentation || !looksLikeConsole) return false;
      claim.value = url;
    }

    return true;
  });
}

function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/^#\s+.+\n+/, "")
    .replace(/\babout ~/g, "about ")
    .trim();
}

function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)\]"'<>`]+/g)].map((match) =>
    match[0].replace(/[).,;:'"\]>]+$/, "")
  );
}

async function main() {
  const files = (await readdir(GENERATED)).filter((file) => file.endsWith(".json"));
  const byApp = new Map<string, Guide>();

  for (const file of files) {
    try {
      const guide = JSON.parse(await readFile(path.join(GENERATED, file), "utf8")) as Guide;
      const key = guide.header.appName.toLowerCase();
      const existing = byApp.get(key);
      if (!existing || new Date(guide.generatedAt) > new Date(existing.generatedAt)) {
        byApp.set(key, guide);
      }
    } catch {
      // skip malformed run
    }
  }

  if (byApp.size === 0) {
    console.error("No generated guides found.");
    process.exit(1);
  }

  await mkdir(LIBRARY, { recursive: true });

  // Rebuild the shipped library from scratch so stale runs do not linger.
  for (const file of await readdir(LIBRARY).catch(() => [] as string[])) {
    if (file.endsWith(".json")) await unlink(path.join(LIBRARY, file));
  }

  for (const guide of byApp.values()) {
    const claims = sanitizeClaims(guide.claims);
    const inferences: Inference[] = (guide.inferences ?? []).filter((i) => i.slot !== "setupTime");
    const setup = inferSetupTime(claims);
    if (setup) inferences.push(setup);

    const allowedUrls = new Set(
      claims.flatMap((claim) => [
        ...urlsIn(claim.value),
        ...urlsIn(claim.quote),
        ...urlsIn(claim.sourceUrl),
      ])
    );
    const unsourcedLinks = (guide.evidenceSummary.unsourcedLinks ?? [])
      .map((url) => url.replace(/[)`]+$/, ""))
      .filter((url) => !allowedUrls.has(url));

    const header = deriveHeader(
      displayNameFor(guide.header.domain) ?? guide.header.appName,
      guide.header.domain,
      claims,
      inferences
    );
    const byStatus: Record<EvidenceStatus, number> = {
      tested: 0,
      documented: 0,
      reported: 0,
      inferred: 0,
      unknown: 0,
    };
    for (const claim of claims) byStatus[claim.status]++;

    const sources = guide.sources.filter((source) => source.tier < 5);
    const finalized: Guide = {
      ...guide,
      header,
      claims,
      inferences,
      sources,
      markdown: addAgentSection(cleanMarkdown(guide.markdown), header),
      evidenceSummary: {
        ...guide.evidenceSummary,
        claims: claims.length,
        byStatus,
        unsourcedLinks,
        numericViolations: guide.evidenceSummary.numericViolations ?? [],
      },
    };

    await writeFile(path.join(LIBRARY, `${guide.slug}.json`), JSON.stringify(finalized, null, 2));
    console.log(
      `${guide.header.appName.padEnd(10)} ${guide.slug.padEnd(28)} difficulty=${header.difficulty.overall} review=${header.reviewRequired} time=${header.setupTime} claims=${claims.length}`
    );
  }
}

await main();
