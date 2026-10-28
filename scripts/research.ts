import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no local env file; rely on the real environment
}

const input = process.argv[2];
const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 6;
const judge = process.argv.includes("--judge");

if (!input) {
  console.error('Usage: npm run research -- "linear.app" [--pages=6] [--judge]');
  process.exit(1);
}

const { runPipeline } = await import("../src/lib/pipeline");

const started = Date.now();
console.log(`\nResearching: ${input}\n`);

try {
  const guide = await runPipeline({
    input,
    maxPages,
    judge,
    onEvent: (event) => {
      if (event.type === "stage") {
        const status = String(event.status ?? "");
        const label = String(event.label ?? "");
        const elapsed = ((Date.now() - started) / 1000).toFixed(0);
        if (status === "start") console.log(`[${elapsed}s] ${label}...`);
        else if (status === "done") console.log(`[${elapsed}s]   done: ${label}`);
        else if (status === "progress") console.log(`[${elapsed}s]   ${label}`);
      } else if (event.type === "source") {
        console.log(`          source ${event.status}: ${event.title} (${event.url})`);
      }
    },
  });

  await mkdir(path.join(process.cwd(), "data", "generated"), { recursive: true });
  await writeFile(path.join(process.cwd(), "data", "generated", `${guide.slug}.md`), guide.markdown);

  console.log(`\nGuide: ${guide.slug}`);
  console.log(`Difficulty: ${guide.header.difficulty.overall} (setup ${guide.header.difficulty.setup}, gate ${guide.header.difficulty.gate}, time ${guide.header.difficulty.time})`);
  console.log(`Review required: ${guide.header.reviewRequired}`);
  console.log(`Can an individual finish: ${guide.header.canIndividualFinish}`);
  console.log(`Claims: ${guide.claims.length} | verified quotes: ${guide.evidenceSummary.quotesVerified} | rejected: ${guide.evidenceSummary.quotesRejected}`);
  console.log(`Status: ${JSON.stringify(guide.evidenceSummary.byStatus)}`);
  console.log(`Duration: ${(guide.durationMs / 1000).toFixed(1)}s`);
  console.log(`Markdown: data/generated/${guide.slug}.md`);
} catch (error) {
  console.error("\nPipeline failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
