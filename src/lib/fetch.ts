import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registrableDomain, safeUrl } from "./domain";
import { normalize, sha256 } from "./text";
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

function titleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).replace(/\s+/g, " ").trim() : "";
}

export type PageRejectReason =
  | "empty"
  | "login"
  | "not-found"
  | "access-denied"
  | "javascript-shell"
  | "binary";

export interface PageUsabilityInput {
  title?: string;
  text: string;
  raw?: string;
  method?: PageDoc["method"];
}

export interface PageUsability {
  usable: boolean;
  reason?: PageRejectReason;
}

const TITLE_LOGIN =
  /^(?:welcome back|sign ?in|log ?in|login|sign up|create (?:an )?account)\b/i;
const TITLE_NOT_FOUND =
  /^(?:(?:error\s*)?404|page not found|not found|page unavailable|page (?:does not|doesn't) exist)\b/i;
const TITLE_DENIED =
  /^(?:access denied|forbidden|unauthorized|permission denied|403)\b/i;
const SHELL_TEXT =
  /(?:(?:please )?(?:enable|turn on) javascript (?:to|and) (?:continue|use|run|view)|javascript (?:is )?required to (?:continue|use|run|view)|you need to enable javascript|requires? javascript to (?:run|work|continue)|checking your browser before accessing|verify you are human|just a moment\.\.\.|enable cookies and javascript|cf-challenge|access to this page has been denied)/i;
const NOT_FOUND_BODY =
  /(?:the page|this page|that page|we) (?:could not|couldn't|can't|does not|doesn't|did not|didn't) (?:be found|find|exist)|page not found|this page is unavailable/i;
const DENIED_BODY =
  /(?:access denied|403 forbidden|you (?:do not|don't) have permission|you are not authorized|request blocked)/i;
const LOGIN_SIGNALS = [
  "welcome back",
  "sign in",
  "log in",
  "password",
  "forgot password",
  "email address",
  "qr code login",
  "passkey",
  "continue with google",
  "continue with github",
  "enter your email",
  "create an account",
];
const DOC_CONTENT =
  /(?:oauth|redirect uri|callback url|scopes?|permissions?|integration|client (?:id|secret)|api reference|create (?:an )?(?:app|application|client))/i;

/**
 * Reject pages that fetched successfully but cannot support evidence
 * extraction: login walls, soft 404s, access-denied screens, JS shells.
 * Deliberately conservative: title signals win, body heuristics require short
 * pages and multiple independent signals.
 */
export function assessPageUsability(input: PageUsabilityInput): PageUsability {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length < 250) return { usable: false, reason: "empty" };
  if (/\uFFFD{3,}|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    return { usable: false, reason: "binary" };
  }

  const title = (input.title || "").replace(/\s+/g, " ").trim();
  const titleHead = title.split(/\s*[|·—–-]\s*/)[0] || title;
  const head = text.slice(0, 6_000).toLowerCase();

  if (TITLE_NOT_FOUND.test(titleHead) || /(?:\||·|—)\s*(?:404|not found)\s*$/i.test(title)) {
    return { usable: false, reason: "not-found" };
  }
  if (TITLE_DENIED.test(titleHead)) return { usable: false, reason: "access-denied" };
  if (TITLE_LOGIN.test(titleHead) && !DOC_CONTENT.test(titleHead)) {
    return { usable: false, reason: "login" };
  }
  if (SHELL_TEXT.test(head)) return { usable: false, reason: "javascript-shell" };

  if (text.length < 4_000 && NOT_FOUND_BODY.test(head)) {
    return { usable: false, reason: "not-found" };
  }
  if (text.length < 4_000 && DENIED_BODY.test(head)) {
    return { usable: false, reason: "access-denied" };
  }

  if (!DOC_CONTENT.test(head)) {
    const signals = LOGIN_SIGNALS.filter((signal) => head.includes(signal)).length;
    if (signals >= 3 && text.length < 8_000) return { usable: false, reason: "login" };
  }

  // A direct HTML fetch of a client-rendered app often has a large script
  // payload and almost no prose. Jina-rendered text should not be judged here.
  if (input.method === "direct" && input.raw) {
    const scriptChars = (input.raw.match(/<script\b[\s\S]*?<\/script>/gi) || []).reduce(
      (total, block) => total + block.length,
      0
    );
    if (scriptChars > input.raw.length * 0.5 && text.length < 3_000) {
      return { usable: false, reason: "javascript-shell" };
    }
  }

  return { usable: true };
}

/** Stable content key after removing URLs, so mirrored docs hosts dedupe. */
export function contentFingerprint(text: string): string {
  const canonical = normalize(text)
    .replace(/https?:\/\/[^\s)\]}>,;"']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sha256(canonical);
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
    // Keep the original fetch method so usability checks can distinguish a
    // Jina-rendered page from a raw HTML/JS shell. The caller still marks the
    // outcome as cached.
    return doc;
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
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !/(?:text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/xml)/.test(
        contentType
      )
    ) {
      return null;
    }
    const raw = await res.text();
    const text = stripHtml(raw);
    if (text.length < 300) return null;
    return { text, raw };
  } catch {
    return null;
  }
}

export interface FetchPageOutcome {
  page: PageDoc | null;
  reason?: PageRejectReason | "invalid-url" | "fetch-failed";
  cached?: boolean;
}

export async function fetchPageChecked(url: string, appDomain: string): Promise<FetchPageOutcome> {
  const parsed = safeUrl(url);
  if (!parsed) return { page: null, reason: "invalid-url" };

  const hash = sha256(parsed.toString());
  const cached = await readCache(hash);
  if (cached) {
    const usability = assessPageUsability({
      title: cached.title,
      text: cached.text,
      raw: cached.raw,
      method: cached.method,
    });
    if (!usability.usable) return { page: null, reason: usability.reason, cached: true };
    // Tier depends on the app domain, which can change between runs (e.g. Meta -> facebook.com).
    return {
      page: { ...cached, tier: classifyTier(parsed.toString(), appDomain) },
      cached: true,
    };
  }

  const jina = await viaJina(parsed.toString());
  const direct = jina ? null : await viaDirect(parsed.toString());
  const body = jina ?? direct;
  if (!body) return { page: null, reason: "fetch-failed" };

  const method = jina ? "jina" : "direct";
  const title =
    method === "direct"
      ? titleFromHtml(body.raw) || titleFromMarkdown(body.raw, parsed.toString())
      : titleFromMarkdown(body.raw, parsed.toString());

  const usability = assessPageUsability({
    title,
    text: body.text,
    raw: body.raw,
    method,
  });
  if (!usability.usable) return { page: null, reason: usability.reason };

  const doc: PageDoc = {
    url: parsed.toString().replace(/\.md$/i, ""),
    finalUrl: parsed.toString(),
    title,
    text: body.text,
    raw: body.raw,
    fetchedAt: new Date().toISOString(),
    method,
    tier: classifyTier(parsed.toString(), appDomain),
    hash,
  };

  await writeCache(hash, doc);
  return { page: doc };
}

export async function fetchPage(url: string, appDomain: string): Promise<PageDoc | null> {
  return (await fetchPageChecked(url, appDomain)).page;
}

export { classifyTier, stripHtml };
