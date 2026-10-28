import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registrableDomain, safeUrl } from "./domain";
import { sha256 } from "./text";
import type { PageDoc, SourceTier } from "./types";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FIRST_PARTY_DOC_HINTS = /(docs?|developer|api|oauth|auth|app|reference|help|support|platform)/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromMarkdown(markdown: string, url: string): string {
  const h = markdown.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  const t = markdown.match(/^Title:\s*(.+)$/m);
  if (t) return t[1].replace(/^URL Source:\s*/i, "").trim();
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function classifyTier(url: string, appDomain: string): SourceTier {
  let host = "";
  let pathname = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname;
  } catch {
    return 5;
  }

  const appBase = registrableDomain(appDomain);
  const hostBase = registrableDomain(host);
  const firstParty = appBase === hostBase;

  if (/(reddit|stackoverflow|youtube|medium|quora|discourse|forum|community\.)/i.test(host)) return 5;
  if (/(nango|zapier|apideck|merge|workos|paragon|prismatic)/i.test(host)) return 4;

  if (firstParty) {
    if (/changelog|release-notes/i.test(pathname)) return 2;
    if (/blog/i.test(pathname)) return 3;
    if (FIRST_PARTY_DOC_HINTS.test(pathname + host)) return 1;
    return 1;
  }

  return 4;
}

async function readCache(hash: string): Promise<PageDoc | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${hash}.json`), "utf8");
    const doc = JSON.parse(raw) as PageDoc & { cachedAt: number };
    if (Date.now() - doc.cachedAt > CACHE_TTL_MS) return null;
    return { ...doc, method: "cache" };
  } catch {
    return null;
  }
}

async function writeCache(hash: string, doc: PageDoc): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify({ ...doc, cachedAt: Date.now() }));
  } catch {
    // cache is best-effort
  }
}

async function viaJina(url: string): Promise<{ text: string; raw: string } | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "X-Return-Format": "markdown", Accept: "text/plain" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 400) return null;
    return { text: text.replace(/^Title:[\s\S]*?Markdown Content:\s*/i, ""), raw: text };
  } catch {
    return null;
  }
}

async function viaDirect(url: string): Promise<{ text: string; raw: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const text = stripHtml(raw);
    if (text.length < 300) return null;
    return { text, raw };
  } catch {
    return null;
  }
}

export async function fetchPage(url: string, appDomain: string): Promise<PageDoc | null> {
  const parsed = safeUrl(url);
  if (!parsed) return null;

  const hash = sha256(parsed.toString());
  const cached = await readCache(hash);
  if (cached) {
    // Tier depends on the app domain, which can change between runs (e.g. Meta -> facebook.com).
    return { ...cached, tier: classifyTier(parsed.toString(), appDomain) };
  }

  const jina = await viaJina(parsed.toString());
  const direct = jina ? null : await viaDirect(parsed.toString());
  const body = jina ?? direct;
  if (!body) return null;

  const doc: PageDoc = {
    url: parsed.toString().replace(/\.md$/i, ""),
    finalUrl: parsed.toString(),
    title: titleFromMarkdown(body.raw, parsed.toString()),
    text: body.text,
    raw: body.raw,
    fetchedAt: new Date().toISOString(),
    method: jina ? "jina" : "direct",
    tier: classifyTier(parsed.toString(), appDomain),
    hash,
  };

  await writeCache(hash, doc);
  return doc;
}

export { classifyTier, stripHtml };
