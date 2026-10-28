import { readFile } from "node:fs/promises";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ignore
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/judge-test.ts data/generated/<guide>.json");
  process.exit(1);
}

const { judgeClaims } = await import("../src/lib/verify");
const guide = JSON.parse(await readFile(file, "utf8"));
const started = Date.now();
const kept = await judgeClaims(guide.claims);
console.log(`claims=${guide.claims.length} kept=${kept.length} dropped=${guide.claims.length - kept.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
