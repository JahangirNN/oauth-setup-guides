import { resolveApp, discoverSources } from "../src/lib/discovery";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ignore
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npx tsx scripts/discover.ts "github.com"');
  process.exit(1);
}

const resolved = await resolveApp(input);
const candidates = await discoverSources(resolved.name, resolved.domain);

console.log(JSON.stringify(resolved, null, 2));
console.log("");
for (const c of candidates) {
  console.log(`${String(c.score).padStart(3)}  ${c.url}\n     title="${c.title}"  [${c.reason}]`);
}
