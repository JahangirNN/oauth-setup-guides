import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Guide } from "./types";

const ROOT = process.cwd();
const LIBRARY_DIR = path.join(ROOT, "data", "guides");
const GENERATED_DIR = path.join(ROOT, "data", "generated");
const INDEX_KEY = "guides:index";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,120}$/;

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(upstashUrl && upstashToken);

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(`${upstashUrl}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Persist a generated guide. Never throws: on Vercel the filesystem is
 * read-only and Upstash may be down, and losing the save should not discard a
 * guide that was already produced. Returns whether the guide is durable.
 */
export async function saveGuide(guide: Guide): Promise<boolean> {
  if (!SLUG_PATTERN.test(guide.slug)) {
    console.warn(`Refusing to save guide with an invalid slug: ${guide.slug}`);
    return false;
  }

  if (useRedis) {
    try {
      await redis(["SET", `guide:${guide.slug}`, JSON.stringify(guide)]);
      await redis(["SADD", INDEX_KEY, guide.slug]);
      return true;
    } catch (error) {
      console.warn("Redis save failed; falling back to filesystem", error);
    }
  }

  try {
    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(path.join(GENERATED_DIR, `${guide.slug}.json`), JSON.stringify(guide, null, 2));
    return true;
  } catch (error) {
    console.warn("Filesystem save failed; guide is not durable", error);
    return false;
  }
}

export async function getGuide(slug: string): Promise<Guide | null> {
  if (!SLUG_PATTERN.test(slug)) return null;

  if (useRedis) {
    try {
      const raw = (await redis(["GET", `guide:${slug}`])) as string | null;
      if (raw) return JSON.parse(raw) as Guide;
    } catch (error) {
      console.warn("Redis read failed; falling back to filesystem", error);
    }
  }

  const generated = await readJson<Guide>(path.join(GENERATED_DIR, `${slug}.json`));
  if (generated) return generated;

  const library = await readJson<Guide>(path.join(LIBRARY_DIR, `${slug}.json`));
  if (library) return library;

  return null;
}

export async function listGuides(): Promise<Guide[]> {
  const bySlug = new Map<string, Guide>();

  // Guides generated on a deployed instance live in Upstash, not on disk.
  if (useRedis) {
    try {
      const slugs = (await redis(["SMEMBERS", INDEX_KEY])) as string[] | null;
      if (slugs && slugs.length > 0) {
        const keys = slugs.map((slug) => `guide:${slug}`);
        const raws = (await redis(["MGET", ...keys])) as Array<string | null> | null;
        for (const raw of raws ?? []) {
          if (!raw) continue;
          try {
            const guide = JSON.parse(raw) as Guide;
            bySlug.set(guide.slug, guide);
          } catch {
            // skip a malformed record rather than failing the library
          }
        }
      }
    } catch (error) {
      console.warn("Redis index read failed; showing filesystem guides", error);
    }
  }

  for (const dir of [LIBRARY_DIR, GENERATED_DIR]) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const guide = await readJson<Guide>(path.join(dir, file));
        if (guide) bySlug.set(guide.slug, guide);
      }
    } catch {
      // directory may not exist yet
    }
  }

  // One row per app: repeat runs and historical slugs stay reachable, but the
  // library table should not show five copies of GitHub.
  const byApp = new Map<string, Guide>();
  for (const guide of bySlug.values()) {
    const key = guide.header.appName.toLowerCase();
    const existing = byApp.get(key);
    if (!existing || new Date(guide.generatedAt) >= new Date(existing.generatedAt)) {
      byApp.set(key, guide);
    }
  }

  return [...byApp.values()].sort((a, b) => {
    const diff = a.header.difficulty.overall - b.header.difficulty.overall;
    return diff !== 0 ? diff : a.header.appName.localeCompare(b.header.appName);
  });
}

export async function hasGuide(slug: string): Promise<boolean> {
  return (await getGuide(slug)) !== null;
}
