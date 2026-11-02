import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSetupObservation } from "../src/lib/observations";
import type { Guide, SetupObservation } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // observations are local metadata; no model key is required
}

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx scripts/record-observation.ts data/observations/<slug>.json");
  process.exit(1);
}

const raw = JSON.parse(await readFile(path.resolve(inputFile), "utf8")) as {
  slug?: unknown;
  observation?: unknown;
};
const slug =
  typeof raw.slug === "string"
    ? raw.slug
    : path.basename(inputFile, path.extname(inputFile));
const observation =
  raw.observation && typeof raw.observation === "object" ? raw.observation : raw;

if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) {
  console.error("Observation rejected: slug must be a lowercase guide slug");
  process.exit(1);
}

const errors = validateSetupObservation(observation);
if (errors.length > 0) {
  console.error("Observation rejected:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const guidePath = path.join(process.cwd(), "data", "guides", `${slug}.json`);
const guide = JSON.parse(await readFile(guidePath, "utf8")) as Guide;
if (guide.slug !== slug) {
  console.error(`Observation rejected: ${guidePath} contains guide "${guide.slug}", not "${slug}"`);
  process.exit(1);
}
const parsed = observation as SetupObservation;
const existing = (guide.observations ?? []).filter((item) => item.id !== parsed.id);
guide.observations = [...existing, parsed];

await writeFile(guidePath, JSON.stringify(guide, null, 2));
console.log(
  `Recorded ${parsed.outcome} observation for ${guide.header.appName} (${slug}): ${parsed.steps.length} steps.`
);
console.log("No credentials were written; verify the file by reading it before sharing.");
