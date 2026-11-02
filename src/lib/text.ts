import { createHash } from "node:crypto";

/**
 * Normalize a page or a quote into the same projection before matching.
 * Markdown links are reduced to their text, heading anchors and escapes removed,
 * typographic quotes/dashes unified, whitespace collapsed, lowercased.
 */
export function normalize(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Aggressive projection used as a second-chance match. */
export function looseNormalize(input: string): string {
  return normalize(input)
    .replace(/[`*_|>#]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type QuoteMatch = "exact" | "loose" | "rejected";

export function matchQuote(pageText: string, quote: string): QuoteMatch {
  const q = normalize(quote);
  if (q.length < 12) return "rejected";
  if (normalize(pageText).includes(q)) return "exact";
  const lq = looseNormalize(quote);
  if (lq.length >= 12 && looseNormalize(pageText).includes(lq)) return "loose";
  return "rejected";
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/\.[a-z]{2,}.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "app";
}

export function shortId(len = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Extract every number-ish token from prose, for numeric grounding checks. */
export function numericTokens(text: string): string[] {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\s*(?:business\s+days?|days?|weeks?|hours?|minutes?|months?|users?|%|usd|\$)?/gi);
  return matches ? matches.map((m) => m.trim().toLowerCase()) : [];
}
