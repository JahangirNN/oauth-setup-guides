import { displayNameFor, looksLikeUrl, registrableDomain, safeUrl } from "./domain";
import { stripHtml } from "./fetch";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Candidate {
  url: string;
  title: string;
  score: number;
  reason: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const BLOCKED_HOSTS =
  /(reddit|youtube|medium\.com|quora|linkedin|instagram|tiktok|pinterest)/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A small accelerator for the apps this demo is built around. Unknown apps use the generic crawl. */
const KNOWN_DOC_ROOTS: Record<string, string[]> = {
  "github.com": ["https://docs.github.com/en/apps"],
  "google.com": [
    "https://developers.google.com/identity/protocols/oauth2",
    "https://developers.google.com/identity/protocols/oauth2/web-server",
    "https://developers.google.com/identity/protocols/oauth2/scopes",
    "https://support.google.com/cloud/answer/9110914",
    "https://support.google.com/cloud/answer/13463817",
    "https://support.google.com/cloud/answer/13464321",
    "https://support.google.com/cloud/answer/13461325",
    "https://support.google.com/cloud/answer/10311615",
    "https://support.google.com/cloud/answer/13464323",
    "https://support.google.com/cloud/answer/13465431",
  ],
  "facebook.com": [
    "https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow",
    "https://developers.facebook.com/docs/apps/review",
    "https://developers.facebook.com/docs/facebook-login/permissions",
  ],
  "meta.com": [
    "https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow",
    "https://developers.facebook.com/docs/apps/review",
    "https://developers.facebook.com/docs/facebook-login/permissions",
  ],
  "microsoft.com": [
    "https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow",
    "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview",
    "https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview",
  ],
  "x.com": [
    "https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code",
    "https://docs.x.com/x-api/getting-started/about-x-api",
    "https://docs.x.com/make-your-first-request",
    "https://docs.x.com/fundamentals/authentication/overview",
  ],
  "twitter.com": [
    "https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code",
    "https://docs.x.com/x-api/getting-started/about-x-api",
    "https://docs.x.com/make-your-first-request",
    "https://docs.x.com/fundamentals/authentication/overview",
  ],
  "linear.app": ["https://linear.app/developers/oauth-2-0-authentication"],
  "slack.com": [
    "https://api.slack.com/authentication/oauth-v2",
    "https://api.slack.com/apps",
    "https://api.slack.com/distribution",
  ],
};

const KNOWN_DOMAINS: Record<string, string> = {
  github: "github.com",
  google: "google.com",
  gmail: "google.com",
  meta: "facebook.com",
  facebook: "facebook.com",
  instagram: "instagram.com",
  whatsapp: "whatsapp.com",
  x: "x.com",
  twitter: "x.com",
  microsoft: "microsoft.com",
  outlook: "microsoft.com",
  linear: "linear.app",
  slack: "slack.com",
  notion: "notion.so",
  figma: "figma.com",
  airtable: "airtable.com",
  atlassian: "atlassian.com",
  jira: "atlassian.com",
  confluence: "atlassian.com",
  trello: "trello.com",
  stripe: "stripe.com",
  salesforce: "salesforce.com",
  hubspot: "hubspot.com",
  shopify: "shopify.com",
  discord: "discord.com",
  spotify: "spotify.com",
  dropbox: "dropbox.com",
  box: "box.com",
  asana: "asana.com",
  clickup: "clickup.com",
  monday: "monday.com",
  notionhq: "notion.so",
  zoom: "zoom.us",
  twilio: "twilio.com",
  sendgrid: "sendgrid.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
  zendesk: "zendesk.com",
  intercom: "intercom.com",
  todoist: "todoist.com",
  calendly: "calendly.com",
  docusign: "docusign.com",
  paypal: "paypal.com",
  plaid: "plaid.com",
  quickbooks: "quickbooks.intuit.com",
  intuit: "intuit.com",
  xero: "xero.com",
  netsuite: "netsuite.com",
  workday: "workday.com",
  servicenow: "servicenow.com",
  okta: "okta.com",
  auth0: "auth0.com",
  vercel: "vercel.com",
  netlify: "netlify.com",
  cloudflare: "cloudflare.com",
  aws: "aws.amazon.com",
  amazon: "amazon.com",
  apple: "apple.com",
  linkedin: "linkedin.com",
  reddit: "reddit.com",
  pinterest: "pinterest.com",
  tiktok: "tiktok.com",
  youtube: "youtube.com",
  twitch: "twitch.tv",
  telegram: "telegram.org",
  bluesky: "bsky.app",
  mastodon: "mastodon.social",
  threads: "threads.net",
};

async function fetchTextCapped(
  url: string,
  maxBytes = 400_000,
  timeoutMs = 20_000
): Promise<{ status: number; text: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { status: res.status, text: "", finalUrl: res.url };

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { status: res.status, text: text.slice(0, maxBytes), finalUrl: res.url };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
      }
      if (received >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { status: res.status, text, finalUrl: res.url };
  } catch {
    return null;
  }
}

export async function ddgSearch(query: string, limit = 10): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // DuckDuckGo answers scrapers with a 202 "anomaly" page. Treat it as empty, not fatal.
    if (/anomaly|captcha|unusual traffic/i.test(html)) return [];

    const results: SearchResult[] = [];
    const blockRe =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)?/g;

    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < limit) {
      let href = m[1];
      const uddg = href.match(/uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (!/^https?:\/\//i.test(href)) continue;
      results.push({
        title: stripHtml(m[2] || ""),
        url: href,
        snippet: stripHtml(m[3] || m[4] || ""),
      });
    }
    return results;
  } catch {
    return [];
  }
}

function titleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).replace(/\s+/g, " ").trim() : "";
}

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i"
    );
    const m = html.match(re);
    if (m) return m[1].trim();
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      "i"
    );
    const m2 = html.match(re2);
    if (m2) return m2[1].trim();
  }
  return "";
}

function scoreHomepage(html: string, domain: string, name: string, tldPriority: number): number {
  const title = titleFromHtml(html).toLowerCase();
  const site = metaContent(html, ["og:site_name", "application-name"]).toLowerCase();
  const desc = metaContent(html, ["description", "og:description"]).toLowerCase();
  const hay = `${title} ${site} ${desc}`;
  const needle = name.toLowerCase().replace(/\s+/g, "");

  let score = tldPriority;
  if (title.includes(needle)) score += 6;
  if (site.includes(needle)) score += 4;
  if (desc.includes(needle)) score += 1;
  if (/software|platform|workspace|app|tool|service|api|developer|product/i.test(hay)) score += 1;
  if (/domain (is )?for sale|parked|coming soon|buy this domain|afternic|hugedomains/i.test(hay)) score -= 30;

  return score;
}

async function probeDomains(name: string): Promise<{ domain: string; title: string } | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (slug.length < 2) return null;

  const tlds: Array<[string, number]> = [
    ["com", 7],
    ["app", 6],
    ["io", 5],
    ["so", 4],
    ["dev", 3],
    ["co", 2],
    ["ai", 1],
    ["org", 1],
    ["net", 0],
  ];

  const results = await Promise.allSettled(
    tlds.map(async ([tld, priority]) => {
      const domain = `${slug}.${tld}`;
      const page = await fetchTextCapped(`https://${domain}`, 45_000, 9_000);
      if (!page || page.status !== 200 || !page.text) return null;
      const score = scoreHomepage(page.text, domain, name, priority);
      return { domain, title: titleFromHtml(page.text), score };
    })
  );

  const ranked = results
    .flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
    .filter((r) => r.score >= 7)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  return { domain: ranked[0].domain, title: ranked[0].title };
}

async function wikidataDomain(name: string): Promise<string | null> {
  const queries = [name, `${name} software`, `${name} company`];
  const candidates: Array<{ id: string; description: string }> = [];

  for (const query of queries) {
    try {
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
        query
      )}&language=en&format=json&limit=5`;
      const res = await fetch(url, {
        headers: { "User-Agent": "OAuthGuideBot/1.0 (research; contact: local)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        search?: Array<{ id: string; description?: string }>;
      };
      for (const item of json.search || []) {
        if (item.description && /software|company|service|platform|application|social|technology|business|website/i.test(item.description)) {
          candidates.push({ id: item.id, description: item.description });
        }
      }
      if (candidates.length >= 3) break;
    } catch {
      // try the next query
    }
  }

  for (const candidate of candidates.slice(0, 3)) {
    try {
      const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${candidate.id}&props=claims&format=json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "OAuthGuideBot/1.0 (research; contact: local)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }>;
      };
      const entity = json.entities?.[candidate.id];
      const website = entity?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
      if (typeof website === "string" && /^https?:\/\//i.test(website)) {
        const url = safeUrl(website);
        if (url) return registrableDomain(url.hostname);
      }
    } catch {
      // try the next entity
    }
  }

  return null;
}

export interface ResolvedApp {
  name: string;
  domain: string;
  docsHost?: string;
  confidence: "high" | "medium" | "low";
  alternatives: string[];
}

export async function resolveApp(input: string): Promise<ResolvedApp> {
  const trimmed = input.trim();

  if (looksLikeUrl(trimmed)) {
    const url = safeUrl(trimmed);
    if (!url) throw new Error(`Not a valid URL: ${input}`);
    const domain = registrableDomain(url.hostname);
    const slugName = domain.split(".")[0].replace(/[-_]/g, " ");
    return {
      name: displayNameFor(domain) ?? slugName.charAt(0).toUpperCase() + slugName.slice(1),
      domain,
      docsHost: url.hostname,
      confidence: "high",
      alternatives: [],
    };
  }

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = KNOWN_DOMAINS[slug];
  if (known) {
    return {
      name: displayNameFor(known) ?? trimmed,
      domain: known,
      confidence: "high",
      alternatives: [],
    };
  }

  const probed = await probeDomains(trimmed);
  if (probed) {
    return {
      name: displayNameFor(probed.domain) ?? trimmed,
      domain: probed.domain,
      confidence: "medium",
      alternatives: [],
    };
  }

  const wiki = await wikidataDomain(trimmed);
  if (wiki) {
    return {
      name: displayNameFor(wiki) ?? trimmed,
      domain: wiki,
      confidence: "medium",
      alternatives: [],
    };
  }

  // Last resort: search. This is allowed to fail silently.
  const results = await ddgSearch(`"${trimmed}" official website`, 8);
  const domains = results
    .map((r) => safeUrl(r.url))
    .filter((u): u is URL => Boolean(u) && !BLOCKED_HOSTS.test(u!.hostname))
    .map((u) => registrableDomain(u.hostname));
  if (domains.length > 0) {
    return {
      name: trimmed,
      domain: domains[0],
      confidence: "low",
      alternatives: [...new Set(domains)].slice(1, 4),
    };
  }

  throw new Error(
    `Could not resolve "${input}" to a company domain. Try the domain directly, e.g. "${trimmed.replace(/\s+/g, "").toLowerCase() || "app"}.com".`
  );
}

function scoreCandidate(url: string, appDomain: string): { score: number; reason: string } {
  let host = "";
  let pathname = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname.toLowerCase();
  } catch {
    return { score: -99, reason: "invalid" };
  }

  const firstParty = registrableDomain(host) === registrableDomain(appDomain);
  let score = firstParty ? 5 : 0;
  const reasons: string[] = [firstParty ? "first-party" : "third-party"];

  if (host === appDomain) {
    score += 2;
    reasons.push("canonical-host");
  } else if (/^developers?\./.test(host)) {
    score -= 1;
    reasons.push("alt-host");
  }
  if (pathname.endsWith(".md")) {
    score -= 2;
    reasons.push("markdown-copy");
  }

  if (/oauth|oauth2/.test(pathname)) {
    score += 7;
    reasons.push("oauth");
  } else if (/authentication|\bauth\b/.test(pathname)) {
    score += 2;
    reasons.push("auth");
  }
  if (/create|register|build|new/.test(pathname)) {
    score += 4;
    reasons.push("create");
  }
  if (/authoriz|using-oauth|access-restrictions|authenticating-to/.test(pathname)) {
    score -= 3;
    reasons.push("consumer-doc");
  }
  if (/enterprise-server@|enterprise-cloud@/.test(pathname)) {
    score -= 5;
    reasons.push("old-version");
  }
  if (/app|application|credential|client/.test(pathname)) {
    score += 2;
    reasons.push("app");
  }
  if (/verification|review|publish|approval|scopes?/.test(pathname)) {
    score += 3;
    reasons.push("review");
  }
  if (/docs?|developer|api|reference|help|support/.test(pathname)) {
    score += 1;
    reasons.push("docs");
  }
  if (
    /blog|pricing|careers|jobs|(^|\/)login(\/|$)|(^|\/)signup(\/|$)|community|contact/.test(pathname)
  ) {
    score -= 6;
    reasons.push("noise");
  }
  if (/third-party|install-approval|admin-approval/.test(pathname)) {
    score -= 5;
    reasons.push("install-approval");
  }
  if (/devcommunity|community\.|forum|discuss\./i.test(host)) {
    score -= 12;
    reasons.push("forum");
  }
  if (/\/oauth\/(request_token|authorize|access_token|2\/)/.test(pathname)) {
    score -= 12;
    reasons.push("api-endpoint");
  }
  if (/^api\./.test(host) && /^\/(oauth|oauth2|1\.1|2\/)/.test(pathname)) {
    score -= 15;
    reasons.push("api-endpoint");
  }
  if (/\/\.well-known\/|\/api\/|\/v[12]\//.test(pathname)) {
    score -= 10;
    reasons.push("api-endpoint");
  }
  if (/^(app|dashboard|console|admin)\./i.test(host) && !/\/docs?\//.test(pathname)) {
    score -= 12;
    reasons.push("console-host");
  }
  // Section-level relevance. Consumer and maintenance docs crowd out the
  // pages that actually explain how to create an app.
  if (/\/building-oauth-apps\//.test(pathname)) {
    score += 3;
    reasons.push("building-section");
  }
  if (/\/using-oauth-apps\//.test(pathname)) {
    score -= 10;
    reasons.push("consumer-section");
  }
  if (/\/maintaining-oauth-apps\//.test(pathname)) {
    score -= 8;
    reasons.push("maintenance-section");
  }
  if (/\/creating-github-apps\//.test(pathname)) {
    score -= 8;
    reasons.push("other-product");
  }
  if (/differences-between|rate-limits|custom-badge|troubleshooting/.test(pathname)) {
    score -= 6;
    reasons.push("off-topic");
  }
  if (/custom-badge|badge/.test(pathname)) {
    score -= 12;
    reasons.push("optional-customization");
  }
  if (/authenticating-to|authorizing-oauth/.test(pathname)) {
    score -= 5;
    reasons.push("token-usage");
  }
  if (/best-practices/.test(pathname)) {
    score -= 2;
    reasons.push("best-practices");
  }
  if (/application-only|oauth-1/.test(pathname)) {
    score -= 8;
    reasons.push("other-auth");
  }
  if (/xdks|reference\/xdk/.test(pathname)) {
    score -= 10;
    reasons.push("sdk-reference");
  }
  if (/api-reference|deprecated|conferencing|managing-oauth-access|access-restrictions/.test(pathname)) {
    score -= 8;
    reasons.push("reference-noise");
  }
  if (BLOCKED_HOSTS.test(host)) {
    score -= 10;
    reasons.push("blocked");
  }

  return { score, reason: reasons.join(",") };
}

function canonicalKey(raw: string): string {
  try {
    const u = new URL(raw);
    let path = u.pathname.toLowerCase().replace(/\.md$/i, "").replace(/\/+$/, "");
    path = path.replace(/^\/(docs|developers|developer)(?=\/)/, "");
    return `${registrableDomain(u.hostname)}${path}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = canonicalKey(c.url);
    const existing = best.get(key);
    if (!existing || c.score > existing.score) best.set(key, c);
  }
  return [...best.values()];
}

interface ExtractedLink {
  url: string;
  text: string;
}

function extractLinks(html: string, base: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let absolute: string;
    try {
      absolute = new URL(m[1], base).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(absolute)) continue;
    const text = stripHtml(m[2] || "").replace(/\s+/g, " ").trim();
    links.push({ url: absolute.replace(/[#?].*$/, ""), text });
  }
  return links;
}

function titleAdjustment(title: string): number {
  let adjustment = 0;
  if (/create|register/i.test(title)) adjustment += 3;
  if (/scope/i.test(title)) adjustment += 2;
  if (/review|verification|approval/i.test(title)) adjustment += 2;
  if (/differences|rate limit|custom badge|reviewing your|migrating/i.test(title)) adjustment -= 8;
  if (/authenticating to|authorizing oauth apps/i.test(title)) adjustment -= 5;
  if (/best practice/i.test(title)) adjustment -= 2;
  return adjustment;
}

function isOauthLink(link: ExtractedLink): boolean {
  return /oauth/i.test(link.url) || /oauth/i.test(link.text);
}

function isHubLink(link: ExtractedLink): boolean {
  const hay = `${link.url} ${link.text}`;
  if (/blog|pricing|careers|jobs|login|signup|community|contact|support\/contact/i.test(link.url)) return false;
  return /(apps?|applications?|authentication|authorize|integration|developer|identity|login)/i.test(hay);
}

async function fromKnownRoots(domain: string, appDomain: string): Promise<Candidate[]> {
  const roots = KNOWN_DOC_ROOTS[domain] ?? [];
  const out: Candidate[] = [];
  for (const url of roots) {
    // A section landing page is a crawl seed, not a guide source.
    if (/\/(en\/)?apps\/?$/.test(url)) continue;
    const s = scoreCandidate(url, appDomain);
    out.push({
      url,
      title: url.split("/").filter(Boolean).pop() || url,
      score: s.score + 10,
      reason: `known-root,${s.reason}`,
    });
  }
  return out;
}

async function fromLlmsTxt(domain: string, appDomain: string): Promise<Candidate[]> {
  const urls = [
    `https://${domain}/llms.txt`,
    `https://${domain}/llms-full.txt`,
    `https://docs.${domain}/llms.txt`,
    `https://docs.${domain}/llms-full.txt`,
    `https://developers.${domain}/llms.txt`,
    `https://developers.${domain}/llms-full.txt`,
    `https://${domain}/docs/llms.txt`,
  ];

  const pages = await Promise.allSettled(
    urls.map((u) => fetchTextCapped(u, 500_000, 15_000))
  );

  const out: Candidate[] = [];
  for (const result of pages) {
    if (result.status !== "fulfilled" || !result.value || result.value.status !== 200) continue;
    for (const line of result.value.text.split("\n")) {
      const matches = [...line.matchAll(/https?:\/\/[^\s)\]"'>]+/g)];
      for (const match of matches) {
        const found = match[0].replace(/[.,;`]+$/, "");
        if (!/oauth/i.test(found)) continue;
        if (found.includes("`") || found.includes("<")) continue;
        const s = scoreCandidate(found, appDomain);
        if (s.score < 5) continue;
        const title = line.replace(/https?:\/\/\S+/g, "").replace(/[()[\]*]/g, "").trim().slice(0, 100);
        out.push({
          url: found,
          title,
          score: s.score + 3 + titleAdjustment(title),
          reason: `llms.txt,${s.reason}`,
        });
      }
    }
  }
  return out;
}

async function fromSitemap(domain: string, appDomain: string): Promise<Candidate[]> {
  const urls = [
    `https://${domain}/sitemap.xml`,
    `https://docs.${domain}/sitemap.xml`,
    `https://developers.${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
  ];
  const pages = await Promise.allSettled(
    urls.map((u) => fetchTextCapped(u, 1_500_000, 20_000))
  );

  const out: Candidate[] = [];
  for (const result of pages) {
    if (result.status !== "fulfilled" || !result.value || result.value.status !== 200) continue;
    const locs = [...result.value.text.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    for (const loc of locs) {
      // OAuth-only. Generic sitemaps otherwise flood the list with 2FA and SSH docs.
      if (!/oauth/i.test(loc)) continue;
      const s = scoreCandidate(loc, appDomain);
      out.push({
        url: loc,
        title: loc.split("/").filter(Boolean).pop() || loc,
        score: s.score + 1,
        reason: `sitemap,${s.reason}`,
      });
    }
  }
  return out;
}

async function fromDocsCrawl(domain: string, appDomain: string): Promise<Candidate[]> {
  const roots = [
    `https://docs.${domain}`,
    `https://developers.${domain}`,
    `https://developer.${domain}`,
    `https://${domain}/docs`,
    `https://${domain}/developers`,
  ];

  const rootPages = await Promise.allSettled(
    roots.map((u) => fetchTextCapped(u, 350_000, 15_000))
  );

  const rootLinks: ExtractedLink[] = [];
  for (let i = 0; i < rootPages.length; i++) {
    const page = rootPages[i];
    if (page.status !== "fulfilled" || !page.value || page.value.status !== 200) continue;
    if (!/<a\s/i.test(page.value.text)) continue;
    rootLinks.push(...extractLinks(page.value.text, roots[i]));
  }

  const direct = rootLinks.filter(isOauthLink);
  if (direct.length >= 4) {
    return direct.map((link) => {
      const s = scoreCandidate(link.url, appDomain);
      return {
        url: link.url,
        title: link.text || link.url,
        score: s.score + 2 + titleAdjustment(link.text),
        reason: `crawl,${s.reason}`,
      };
    });
  }

  const hubLinks = [...new Map(
    rootLinks.filter(isHubLink).map((l) => [l.url, l])
  ).values()]
    .sort((a, b) => {
      const rank = (l: ExtractedLink) =>
        /oauth/i.test(l.url) ? 0 : /\/apps?|applications?/i.test(l.url) ? 1 : /auth|identity|login/i.test(l.url) ? 2 : 3;
      return rank(a) - rank(b);
    })
    .slice(0, 6);

  const hubPages = await Promise.allSettled(
    hubLinks.map((l) => fetchTextCapped(l.url, 350_000, 15_000))
  );

  const found: ExtractedLink[] = [...direct];
  for (let i = 0; i < hubPages.length; i++) {
    const page = hubPages[i];
    if (page.status !== "fulfilled" || !page.value || page.value.status !== 200) continue;
    const links = extractLinks(page.value.text, hubLinks[i].url);
    found.push(...links.filter(isOauthLink));
  }

  return [...new Map(found.map((l) => [l.url, l])).values()].map((link) => {
    const s = scoreCandidate(link.url, appDomain);
    return {
      url: link.url,
      title: link.text || link.url,
      score: s.score + 1 + titleAdjustment(link.text),
      reason: `crawl,${s.reason}`,
    };
  });
}

async function fromPathProbes(domain: string, appDomain: string): Promise<Candidate[]> {
  const bases = [`https://${domain}`, `https://docs.${domain}`, `https://developers.${domain}`];
  const paths = ["/oauth", "/docs/oauth", "/authentication", "/docs/authentication"];
  const urls = bases.flatMap((base) => paths.map((p) => `${base}${p}`));

  const pages = await Promise.allSettled(
    urls.map(async (u) => {
      const page = await fetchTextCapped(u, 30_000, 8_000);
      return page && page.status === 200 && page.finalUrl.replace(/\/$/, "") !== u.replace(/\/$/, "")
        ? { url: page.finalUrl, title: titleFromHtml(page.text) }
        : null;
    })
  );

  return pages
    .flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
    .map((page) => {
      const s = scoreCandidate(page.url, appDomain);
      return { url: page.url, title: page.title || page.url, score: s.score - 2, reason: `probe,${s.reason}` };
    })
    .filter((c) => c.score > 0);
}

async function fromSearch(name: string, domain: string, appDomain: string): Promise<Candidate[]> {
  const queries = [
    `site:${domain} "create an OAuth app" OR "OAuth application" redirect URI`,
    `site:docs.${domain} OAuth app redirect URI client secret`,
    `site:developers.${domain} OAuth app redirect URI client secret`,
    `"${name}" create OAuth app developer documentation redirect URI`,
    `"${name}" OAuth app verification review scopes`,
  ];
  const out: Candidate[] = [];
  for (const q of queries) {
    const results = await ddgSearch(q, 8);
    for (const r of results) {
      if (!/oauth/i.test(r.url + " " + r.title + " " + r.snippet)) continue;
      const s = scoreCandidate(r.url, appDomain);
      if (s.score < 5) continue;
      out.push({ url: r.url, title: r.title, score: s.score, reason: `search,${s.reason}` });
    }
    await sleep(1200);
    if (out.length >= 14) break;
  }
  return out;
}

export async function discoverSources(name: string, domain: string): Promise<Candidate[]> {
  const tasks = [
    fromKnownRoots(domain, domain),
    fromLlmsTxt(domain, domain),
    fromSitemap(domain, domain),
    fromDocsCrawl(domain, domain),
    fromPathProbes(domain, domain),
    fromSearch(name, domain, domain),
  ];

  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

  return dedupe(all)
    .filter((c) => c.score > 0)
    .filter(
      (c) =>
        c.reason.startsWith("known-root") ||
        /oauth/i.test(c.url + " " + c.title) ||
        c.score >= 12
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
