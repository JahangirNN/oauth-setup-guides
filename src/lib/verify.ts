import { chatJSON } from "./ifm";
import { matchQuote, normalize } from "./text";
import type { Claim, EvidenceStatus, PageDoc, Slot } from "./types";

const TIER_BASE: Record<number, number> = { 1: 0.92, 2: 0.82, 3: 0.68, 4: 0.52, 5: 0.35 };

/** Cheap semantic guard against a real quote being filed under the wrong slot. */
const SLOT_KEYWORDS: Partial<Record<Slot, RegExp>> = {
  appCreationUrl: /https?:\/\//,
  requirements: /(account|privacy|polic|homepage|domain|logo|icon|video|payment|business|verif|callback|redirect|scope|terms|agreement|consent)/,
  redirectRules: /(redirect|callback|url|https?|localhost|wildcard)/,
  scopes: /(scope|permission|access)/,
  tokenModel: /(token|expire|refresh|lifetime)/,
  reviewRequired: /(review|verif|approval|publish)/,
  reviewTimeline: /(day|week|month|hour|business|review|verif)/,
  rejectionCauses: /(reject|deny|block|fail|refus|suspend)/,
  unverifiedUserExperience: /(unverified|warning|limit|block|screen|user cap)/,
};

export interface VerifiedClaim extends Claim {}

function statusFor(tier: number, match: string): EvidenceStatus {
  if (match === "rejected") return "unknown";
  if (tier <= 3) return "documented";
  return "inferred";
}

function confidenceFor(tier: number, match: string): number {
  const base = TIER_BASE[tier] ?? 0.35;
  const exact = match === "exact" ? 0.03 : match === "loose" ? -0.06 : -0.3;
  return Math.max(0.05, Math.min(0.97, base + exact));
}

export interface VerifyOutcome {
  verified: VerifiedClaim[];
  rejected: number;
}

/**
 * Plugin-specific OAuth docs often describe registering a plugin with a
 * third-party OAuth provider. That is a different flow from creating the
 * provider's own OAuth app and must not become a setup prerequisite.
 */
export function isPluginOnlyClaim(
  page: Pick<PageDoc, "url" | "title">,
  claim: { slot: Slot; value: string; quote: string }
): boolean {
  const pageHay = `${page.url} ${page.title}`;
  if (!/(?:\/plugins?\/|with-plugins|plugin-oauth)/i.test(pageHay)) return false;
  if (!/\bplugin\b/i.test(`${claim.value} ${claim.quote}`)) return false;
  return /^(requirements|setupTime|reviewRequired|reviewTimeline|unverifiedUserExperience)$/.test(
    claim.slot
  );
}

/**
 * Enterprise managed authorization pages describe JWT/assertion failures for a
 * different connection type. Those are not common OAuth-app rejection causes.
 */
export function isEnterpriseAuthClaim(
  page: Pick<PageDoc, "url" | "title">,
  _claim: { slot: Slot; value: string; quote: string }
): boolean {
  const pageHay = `${page.url} ${page.title}`;
  // Enterprise-managed authorization / MCP pages describe a different
  // connection type (assertions, ID-JAG, managed grants). Their details do not
  // belong in a standard OAuth-app setup guide.
  return /(?:enterprise-managed|enterprise managed|\/mcp\/)/i.test(pageHay);
}

/** PAT pages are not evidence for the OAuth-app requirements or token model. */
export function isPersonalAccessTokenClaim(
  page: Pick<PageDoc, "url" | "title">,
  claim: { slot: Slot; value: string; quote: string }
): boolean {
  const pageHay = `${page.url} ${page.title}`;
  if (!/(?:personal-access-tokens?|personal access tokens?)/i.test(pageHay)) return false;
  if (/\b(?:oauth|public connection|oauth app|oauth application)\b/i.test(`${claim.value} ${claim.quote}`)) {
    return false;
  }
  return /^(requirements|setupTime|reviewRequired|reviewTimeline|unverifiedUserExperience|redirectRules|rejectionCauses|scopes|tokenModel|canIndividualFinish)$/.test(
    claim.slot
  );
}

export function verifyClaims(pageClaims: Array<{
  slot: Slot;
  value: string;
  quote: string;
  found: boolean;
}>, page: PageDoc): VerifyOutcome {
  const verified: VerifiedClaim[] = [];
  let rejected = 0;

  for (const c of pageClaims) {
    if (!c.found || !c.quote || !c.value) continue;
    if (
      isPluginOnlyClaim(page, c) ||
      isEnterpriseAuthClaim(page, c) ||
      isPersonalAccessTokenClaim(page, c)
    ) {
      rejected++;
      continue;
    }
    const match = matchQuote(page.text, c.quote);
    if (match === "rejected") {
      rejected++;
      continue;
    }

    if (c.slot === "appCreationUrl") {
      const valueUrl = c.value.match(/https?:\/\/[^\s)`"']+/);
      const quoteUrl = c.quote.match(/https?:\/\/[^\s)`"']+/);
      const url = valueUrl?.[0] ?? quoteUrl?.[0];
      if (!url) {
        rejected++;
        continue;
      }
      const isDocumentation =
        /^https?:\/\/(docs?\.|learn\.|support\.|help\.)/i.test(url) ||
        /\/(docs?|documentation|learn|support|help)\//i.test(url);
      const isApiEndpoint =
        /^https?:\/\/api\./i.test(url) ||
        /\/v[12]\//i.test(url) ||
        /\.well-known|oauth2?\/token|oauth-clients\/?$/i.test(url);
      const looksLikeConsole = /(settings|console|dashboard|developer|apps?|oauth|portal|cloud|admin)/i.test(url);
      if (isDocumentation || isApiEndpoint || !looksLikeConsole) {
        rejected++;
        continue;
      }
      c.value = url;
    }

    const keywordCheck = SLOT_KEYWORDS[c.slot];
    if (keywordCheck && !keywordCheck.test(`${c.quote} ${c.value}`)) {
      rejected++;
      continue;
    }

    // "minutes" is not a duration. Require a number or an explicit qualitative estimate.
    if (
      c.slot === "setupTime" &&
      !/\d|\b(few|several|under|instant|immediately|self-serve|same day)\b/i.test(c.value)
    ) {
      rejected++;
      continue;
    }

    // A workspace approving an install is not the provider reviewing an app.
    if (
      /^(reviewRequired|reviewTimeline|unverifiedUserExperience|rejectionCauses)$/.test(c.slot) &&
      /(third-party|install|admin|approval)/i.test(`${page.url} ${page.title}`)
    ) {
      rejected++;
      continue;
    }

    verified.push({
      id: `${page.hash.slice(0, 6)}_${c.slot}`,
      slot: c.slot,
      value: c.value.trim(),
      quote: c.quote.trim(),
      sourceUrl: page.url,
      sourceTitle: page.title,
      sourceTier: page.tier,
      fetchedAt: page.fetchedAt,
      match,
      status: statusFor(page.tier, match),
      confidence: confidenceFor(page.tier, match),
    });
  }

  return { verified, rejected };
}

interface JudgeResult {
  verdicts: Array<{ id: string; verdict: "ok" | "wrong_slot" | "unsupported" }>;
}

const judgeSchema = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["ok", "wrong_slot", "unsupported"] },
        },
        required: ["id", "verdict"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

/**
 * The quote can be real and still answer the wrong question. This pass catches
 * that: it sees only (slot, value, quote), never the draft, so it cannot anchor.
 */
export async function judgeClaims(claims: Claim[]): Promise<Claim[]> {
  if (claims.length === 0) return claims;

  const payload = claims.map((c) => ({
    id: c.id,
    slot: c.slot,
    value: c.value,
    quote: c.quote,
  }));

  const result = await chatJSON<JudgeResult>({
    system:
      "You audit extracted claims about creating your own OAuth app. For each claim, decide whether the quote actually supports the value for that specific slot. " +
      "Critical distinction: 'reviewRequired', 'reviewTimeline', 'rejectionCauses' and 'unverifiedUserExperience' are about the PROVIDER reviewing YOUR OAuth app. " +
      "A workspace admin approving a third-party app install is a DIFFERENT thing — mark those wrong_slot. " +
      "verdict=ok when it does. verdict=wrong_slot when the quote is real but answers a different slot. " +
      "verdict=unsupported when the quote does not support the value. Answer with verdicts only, no explanations.",
    user: `Slots: appCreationUrl, consoleName, reviewRequired, reviewTimeline, setupTime, canIndividualFinish, redirectRules, scopes, tokenModel, rejectionCauses, unverifiedUserExperience, requirements.\n\nClaims:\n${JSON.stringify(payload)}`,
    schema: judgeSchema,
    schemaName: "judge",
    maxTokens: 8000,
    effort: "low",
    timeoutMs: 120_000,
  });

  const byId = new Map(result.data.verdicts.map((v) => [v.id, v]));
  return claims
    .filter((c) => {
      const v = byId.get(c.id);
      if (!v) return true;
      return v.verdict === "ok";
    })
    .map((c) => {
      const v = byId.get(c.id);
      if (v && v.verdict !== "ok") {
        return { ...c, confidence: Math.max(0.05, c.confidence - 0.2), status: "inferred" as EvidenceStatus };
      }
      return c;
    });
}

/** Pick the strongest claim per slot, preferring official sources and exact quotes. */
export function mergeClaims(claims: Claim[]): Claim[] {
  const rank = (c: Claim): number => {
    let score = 100 - c.sourceTier * 10 + (c.match === "exact" ? 2 : 0) + c.confidence;

    if (c.slot === "requirements") {
      const context = `${c.value} ${c.sourceTitle} ${c.sourceUrl}`;
      // A badge/logo requirement is optional polish, not a setup prerequisite.
      if (/(badge|logo|icon|custom)/i.test(context)) score -= 40;
      if (/(required|must provide|must have|must be|need)/i.test(c.value)) score += 5;
      if (/(recommended|optional)/i.test(c.value)) score -= 5;
      if (/(create|register|set ?up|before you start)/i.test(c.sourceTitle + c.sourceUrl)) score += 8;
    }

    return score;
  };

  const best = new Map<Slot, Claim>();
  for (const c of claims) {
    const existing = best.get(c.slot);
    if (!existing) {
      best.set(c.slot, c);
      continue;
    }
    if (rank(c) > rank(existing)) best.set(c.slot, c);
  }
  return [...best.values()].sort((a, b) => a.slot.localeCompare(b.slot));
}

/** Detect two official-looking claims that disagree on the same discrete fact. */
export function findConflicts(claims: Claim[]): number {
  const discrete = new Set<Slot>(["reviewRequired", "canIndividualFinish", "appCreationUrl"]);
  const bySlot = new Map<Slot, Set<string>>();

  for (const c of claims) {
    if (c.sourceTier > 2 || !discrete.has(c.slot)) continue;
    let category: string;
    if (c.slot === "reviewRequired" || c.slot === "canIndividualFinish") {
      const v = c.value.toLowerCase();
      category = /^(yes|true|required)/.test(v) ? "yes" : /^(no|false|not required)/.test(v) ? "no" : normalize(c.value).slice(0, 40);
    } else {
      category = normalize(c.value).replace(/\/$/, "");
    }
    const set = bySlot.get(c.slot) || new Set<string>();
    set.add(category);
    bySlot.set(c.slot, set);
  }

  let conflicts = 0;
  for (const values of bySlot.values()) if (values.size > 1) conflicts++;
  return conflicts;
}
