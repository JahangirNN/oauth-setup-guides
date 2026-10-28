import { resolveApp, discoverSources, selectDiverseCandidates } from "../src/lib/discovery";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ignore
}

const input = process.argv[2];
const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 6;
if (!input) {
  console.error('Usage: npx tsx scripts/discover.ts "github.com" [--pages=6]');
  process.exit(1);
}

const resolved = await resolveApp(input);
const candidates = await discoverSources(resolved.name, resolved.domain);

console.log(JSON.stringify(resolved, null, 2));
console.log("");
for (const c of candidates) {
  console.log(`${String(c.score).padStart(3)}  ${c.url}\n     title="${c.title}"  [${c.reason}]`);
}

console.log(`\nSelected for maxPages=${maxPages}:`);
for (const c of selectDiverseCandidates(candidates, maxPages)) {
  console.log(
    `${String(c.score).padStart(3)}  ${c.url}\n     why=${c.selectionReason}  facets=${(c.facets ?? []).join(",") || "none"}`
  );
}
