import type { Claim, Inference, PageDoc } from "./types";

/**
 * Language that indicates the provider reviews or verifies an app. Deliberately
 * narrower than /review/: "review your permissions" is not an app review.
 */
const REVIEW_SIGNAL =
  /(app review|review process|verification process|verify (?:your )?app|app verification|submit (?:your )?app|publishing review|approval process|requires? (?:review|verification|approval)|under review|app is rejected|unverified app)/i;

/**
 * Language that indicates a requirement gates review/verification rather than
 * app creation. These artifacts should not inflate the self-serve setup time.
 */
const REVIEW_ONLY_REQUIREMENT =
  /\breview(?:s|ed|ing)?\b|privileged (?:intents?|scopes?|permissions?)|use[- ]case justification|app(?:lication)? (?:verification|approval|submission)|verification (?:process|requirements?)|approval (?:process|requirements?)|submission|submit(?:ting)?|reviewers?|publish(?:ing)?|testing (?:instructions|video)|free trial/i;

const SETUP_REQUIREMENT_SIGNAL =
  /\b(?:create|creating|register|registering|set ?up|configure|configured|install|generate|retrieve|obtain|developer (?:portal|console|dashboard)|app creation|application creation|redirect uri|callback url|client id|client secret)\b/i;

interface RequirementFilter {
  setupText: string;
  excludedReviewOnly: boolean;
}

/**
 * Remove review submission requirements from the setup estimate. Review
 * clauses are dropped as a block, including semicolon list items that inherit
 * the review context ("For review: a privacy policy; security measures").
 */
function filterReviewOnlyRequirements(requirements: string): RequirementFilter {
  if (!REVIEW_ONLY_REQUIREMENT.test(requirements)) {
    return { setupText: requirements, excludedReviewOnly: false };
  }

  // With no setup action anywhere, the whole claim is review evidence.
  if (!SETUP_REQUIREMENT_SIGNAL.test(requirements)) {
    return { setupText: "", excludedReviewOnly: true };
  }

  const parts = requirements.split(/(?<=[.!?;])\s+|\n+/);
  const kept: string[] = [];
  let inReviewList = false;
  let excludedReviewOnly = false;

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    if (REVIEW_ONLY_REQUIREMENT.test(part)) {
      inReviewList = true;
      excludedReviewOnly = true;
    } else if (inReviewList && !SETUP_REQUIREMENT_SIGNAL.test(part)) {
      // A semicolon/newline continuation of the review list.
      excludedReviewOnly = true;
    } else {
      inReviewList = false;
      kept.push(part);
    }

    if (/[.!?]\s*$/.test(part)) inReviewList = false;
  }

  return { setupText: kept.join(" "), excludedReviewOnly };
}

function estimateSetup(claims: Claim[]): { value: string; basis: string; confidence: number } | null {
  const requirements = claims.find((c) => c.slot === "requirements")?.value;
  if (!requirements) return null;

  const filtered = filterReviewOnlyRequirements(requirements);

  // Ignore clauses that explicitly say something is NOT required. Otherwise
  // "no privacy policy, domain, logo, or video is required" inflates the estimate.
  const cleaned = filtered.setupText
    .split(/(?<=[.;])\s+/)
    .filter(
      (sentence) =>
        !/(does not|do not|not required|no requirement|not documented|none required|isn't required|aren't required)/i.test(
          sentence
        ) &&
        !(
          /^\s*no\s+/i.test(sentence) &&
          /(stated|mentioned|required|needed|documented|mandatory|necessary)/i.test(sentence)
        )
    )
    .join(" ")
    .toLowerCase();

  const artifacts = [
    "privacy",
    "policy",
    "terms",
    "domain",
    "video",
    "payment",
    "business",
    "verification",
    "consent",
    "security",
  ].filter((keyword) => cleaned.includes(keyword));

  const value =
    artifacts.length === 0 ? "~5-10 minutes" : artifacts.length <= 2 ? "~15-30 minutes" : "~30-60 minutes";
  const reviewNote = filtered.excludedReviewOnly
    ? " Review-only requirements were excluded because they gate review, not app creation."
    : "";

  return {
    value,
    basis: `Estimated from ${
      artifacts.length > 0
        ? `these prerequisite artifacts: ${artifacts.join(", ")}`
        : "a self-serve form with no setup prerequisite artifacts"
    }.${reviewNote} The provider does not publish a duration, so this is a heuristic, not a quote.`,
    confidence: 0.4,
  };
}

export function inferSetupTime(claims: Claim[]): Inference | null {
  const estimate = estimateSetup(claims);
  if (!estimate) return null;
  return {
    slot: "setupTime",
    value: estimate.value,
    basis: estimate.basis,
    confidence: estimate.confidence,
  };
}

export function inferFacts(claims: Claim[], pages: PageDoc[]): Inference[] {
  const out: Inference[] = [];
  const has = (slot: Claim["slot"]) => claims.some((c) => c.slot === slot);

  if (!has("reviewRequired")) {
    const signals: string[] = [];
    for (const page of pages) {
      const match = page.text.match(REVIEW_SIGNAL);
      if (match) signals.push(`${page.title}: "${match[0]}"`);
    }

    if (signals.length === 0) {
      out.push({
        slot: "reviewRequired",
        value: "No review required",
        basis: `No app review, verification, or approval process appears in the ${pages.length} official sources read. This is inferred from absence, not from a policy statement.`,
        confidence: 0.62,
      });
      if (!has("unverifiedUserExperience")) {
        out.push({
          slot: "unverifiedUserExperience",
          value: "No unverified state",
          basis: "Because no review or verification step appears in the sources, there is no documented period in which the app is treated as unverified.",
          confidence: 0.5,
        });
      }
    } else {
      out.push({
        slot: "reviewRequired",
        value: "Review may be required",
        basis: `Review-related language appears (${signals.slice(0, 2).join("; ")}), but no source states whether it gates OAuth app creation. Treat the gate as unresolved.`,
        confidence: 0.3,
      });
    }
  }

  if (!has("setupTime")) {
    const estimate = inferSetupTime(claims);
    if (estimate) out.push(estimate);
  }

  if (!has("canIndividualFinish")) {
    const requirements = claims.find((c) => c.slot === "requirements")?.value.toLowerCase() ?? "";
    if (/(business verification|legal entity|company|organization account|partner program)/.test(requirements)) {
      out.push({
        slot: "canIndividualFinish",
        value: "Build only",
        basis: "The documented requirements include business verification or a legal entity, so an individual can build and test but may not be able to ship to all users.",
        confidence: 0.6,
      });
    }
  }

  return out;
}
