import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Guide } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // rely on the real environment
}

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npx tsx scripts/resynth.ts <slug>");
  process.exit(1);
}

const { displayNameFor } = await import("../src/lib/domain");
const { deriveHeader, synthesizeGuide } = await import("../src/lib/synthesize");

const generatedFile = path.join(process.cwd(), "data", "generated", `${slug}.json`);
const guide = JSON.parse(await readFile(generatedFile, "utf8")) as Guide;
const inferences = guide.inferences ?? [];
const header = deriveHeader(
  displayNameFor(guide.header.domain) ?? guide.header.appName,
  guide.header.domain,
  guide.claims,
  inferences
);

console.log(`Re-synthesizing ${guide.header.appName} (${slug}) from ${guide.claims.length} verified claims...`);
const synth = await synthesizeGuide(header.appName, header.domain, header, guide.claims, inferences);

const updated: Guide = {
  ...guide,
  header,
  markdown: synth.markdown,
  evidenceSummary: {
    ...guide.evidenceSummary,
    unsourcedLinks: synth.unsourcedLinks,
    numericViolations: synth.numericViolations,
  },
};

await writeFile(generatedFile, JSON.stringify(updated, null, 2));
await writeFile(
  path.join(process.cwd(), "data", "generated", `${slug}.md`),
  updated.markdown
);

const libraryDir = path.join(process.cwd(), "data", "guides");
await mkdir(libraryDir, { recursive: true });
await writeFile(path.join(libraryDir, `${slug}.json`), JSON.stringify(updated, null, 2));

console.log(`Difficulty: ${header.difficulty.overall} (setup ${header.difficulty.setup}, gate ${header.difficulty.gate}, time ${header.difficulty.time})`);
console.log(`Review: ${header.reviewRequired}; can individual finish: ${header.canIndividualFinish}`);
console.log(`Markdown: ${updated.markdown.length} chars, ${(updated.markdown.match(/^## /gm) ?? []).length} sections`);
console.log(`Unsourced links: ${synth.unsourcedLinks.length}; numeric violations: ${synth.numericViolations.length}`);
