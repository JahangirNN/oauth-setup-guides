import assert from "node:assert/strict";
import { deriveHeader, guideLooksComplete } from "../src/lib/synthesize";
import {
  candidateFacets,
  isProviderHost,
  isUsefulCandidateUrl,
  selectDiverseCandidates,
  shouldSearchForMoreCandidates,
  type Candidate,
} from "../src/lib/discovery";
import { assessPageUsability, contentFingerprint } from "../src/lib/fetch";
import { buildExtractionExcerpt } from "../src/lib/extract";
import { inferSetupTime } from "../src/lib/infer";
import { validateSetupObservation } from "../src/lib/observations";
import {
  isEnterpriseAuthClaim,
  isPersonalAccessTokenClaim,
  isPluginOnlyClaim,
} from "../src/lib/verify";
import {
  accessCodeRequired,
  beginGeneration,
  hasValidAccessCode,
  inputTooLong,
  requestIp,
} from "../src/lib/limits";
import { matchQuote, slugify } from "../src/lib/text";
import type { Claim } from "../src/lib/types";

function claim(value: string): Claim {
  return {
    id: "test",
    slot: "reviewRequired",
    value,
    quote: value,
    sourceUrl: "https://example.com/docs",
    sourceTitle: "Example docs",
    sourceTier: 1,
    status: "documented",
    match: "exact",
    confidence: 0.9,
    fetchedAt: new Date().toISOString(),
  };
}

function requirementClaim(value: string): Claim {
  return { ...claim(value), slot: "requirements" };
}

assert.equal(
  deriveHeader("Discord", "discord.com", [claim("Yes, but only for certain scopes: some scopes require approval.")], [])
    .reviewRequired,
  "sometimes",
  "conditional review must not be classified as no-review"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("No app review is required.")], []).reviewRequired,
  "no"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Yes, app review is required before launch.")], [])
    .reviewRequired,
  "yes"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Yes, every app requires approval.")], [])
    .reviewRequired,
  "yes",
  "universal review must not be mistaken for conditional review"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Sensitive scopes require approval.")], [])
    .reviewRequired,
  "sometimes"
);

const reviewOnlySetup = inferSetupTime([
  requirementClaim(
    "For review, submit a privacy policy, security measures, and a use-case justification for privileged intents."
  ),
]);
assert.equal(
  reviewOnlySetup?.value,
  "~5-10 minutes",
  "review-only artifacts must not inflate the app-creation estimate"
);
assert.match(
  reviewOnlySetup?.basis ?? "",
  /self-serve form|Review-only requirements were excluded/,
  "the basis must not cite review-only artifacts as setup prerequisites"
);
assert.doesNotMatch(
  reviewOnlySetup?.basis ?? "",
  /prerequisite artifacts:/,
  "policy and security review language must not be presented as setup artifacts"
);

const mixedSetup = inferSetupTime([
  requirementClaim("Register an app. For review, submit a privacy policy and security measures."),
]);
assert.equal(
  mixedSetup?.value,
  "~5-10 minutes",
  "a review sentence must be removed while the setup sentence is kept"
);
assert.match(mixedSetup?.basis ?? "", /Review-only requirements were excluded/);

const realSetup = inferSetupTime([
  requirementClaim("Before creating an app, prepare a privacy policy and a verified domain."),
]);
assert.equal(
  realSetup?.value,
  "~30-60 minutes",
  "genuine app-creation artifacts must still affect the estimate"
);
assert.match(realSetup?.basis ?? "", /prerequisite artifacts: privacy, policy, domain/);

const publicAppReviewSetup = inferSetupTime([
  requirementClaim(
    "A callback URL on an external server is required. For public apps, the submission requires a logo, a description, testing instructions, and an optional testing video."
  ),
]);
assert.equal(
  publicAppReviewSetup?.value,
  "~5-10 minutes",
  "public-app submission artifacts must not inflate setup time"
);
assert.doesNotMatch(publicAppReviewSetup?.basis ?? "", /testing video|video/);

const conditionalReview = deriveHeader(
  "Figma",
  "figma.com",
  [
    {
      ...claim("sometimes"),
      slot: "reviewRequired",
      quote:
        "When you publish a public OAuth app, Figma reviews it. Private apps are published without review.",
    },
  ]
);
assert.equal(conditionalReview.reviewRequired, "sometimes");
assert.match(
  conditionalReview.reviewNote ?? "",
  /publish a public OAuth app|reviews it/i,
  "a collapsed review value should recover its condition from the quote"
);

assert.equal(guideLooksComplete("Final will be here"), false);
assert.equal(guideLooksComplete("## Do you need your own OAuth app?\n\nToo short."), false);

const realGuide = `## Do you need your own OAuth app?

${"This paragraph explains the setup and the gate. ".repeat(20)}

## Step-by-step setup

${"1. Do the documented step. ".repeat(20)}

## Approval and review

${"No review is documented. ".repeat(20)}
`;
assert.equal(guideLooksComplete(realGuide), true);

const candidate = (url: string, title: string, score: number): Candidate => ({
  url,
  title,
  score,
  reason: "test",
});

const crowded: Candidate[] = [
  candidate("https://docs.example.com/oauth/reference/one", "OAuth reference", 50),
  candidate("https://docs.example.com/oauth/reference/two", "OAuth reference", 49),
  candidate("https://docs.example.com/oauth/reference/three", "OAuth reference", 48),
  candidate("https://docs.example.com/oauth/reference/four", "OAuth reference", 47),
  candidate("https://docs.example.com/oauth/reference/five", "OAuth reference", 46),
  candidate("https://docs.example.com/oauth/reference/six", "OAuth reference", 45),
  candidate("https://docs.example.com/apps/create", "Create an app", 20),
  candidate("https://docs.example.com/oauth/scopes", "Scopes and permissions", 18),
  candidate("https://docs.example.com/apps/review", "App review and verification", 16),
  candidate("https://docs.example.com/auth/tokens", "Access tokens", 14),
];

assert.deepEqual(
  candidateFacets(candidate("https://docs.example.com/apps/create", "Create an app", 1)),
  ["setup"]
);
assert.ok(
  candidateFacets(candidate("https://docs.example.com/oauth2-and-permissions", "OAuth2 and Permissions", 1)).includes(
    "scopes"
  )
);
assert.deepEqual(
  candidateFacets(candidate("https://docs.example.com/apps/review", "App review and verification", 1)),
  ["review"]
);

const selected = selectDiverseCandidates(crowded, 6);
assert.equal(selected.length, 6, "selection should fill maxPages");
assert.equal(selected[0].url, crowded[0].url, "the globally highest-scored page must stay");
const selectedUrls = selected.map((c) => c.url);
assert.ok(selectedUrls.includes("https://docs.example.com/apps/create"), "setup page must be represented");
assert.ok(selectedUrls.includes("https://docs.example.com/oauth/scopes"), "scopes page must be represented");
assert.ok(selectedUrls.includes("https://docs.example.com/apps/review"), "review page must be represented");
assert.ok(
  selected.some((candidate) => candidateFacets(candidate).includes("auth")),
  "an auth page must be represented"
);
assert.deepEqual(
  selectDiverseCandidates([...crowded].reverse(), 6).map((c) => c.url),
  selectedUrls,
  "selection must be deterministic regardless of input order"
);
assert.ok(selected.every((c) => c.selectionReason), "each selected source must explain itself");

const knownRootOnly = [{ ...candidate("https://docs.example.com/oauth", "OAuth", 20), reason: "known-root,test" }];
assert.equal(
  shouldSearchForMoreCandidates(knownRootOnly),
  true,
  "a single known root does not remove the bounded search fallback"
);
assert.equal(
  shouldSearchForMoreCandidates(crowded.slice(0, 6)),
  false,
  "six deterministic candidates are enough to fill the default page budget"
);
assert.equal(
  shouldSearchForMoreCandidates(crowded.slice(0, 5)),
  true,
  "thin deterministic discovery must retain a search fallback"
);
assert.equal(shouldSearchForMoreCandidates(crowded.slice(0, 6), 8), true);

assert.equal(isUsefulCandidateUrl("https://mintcdn.com/discord/example.png?fit=max"), false);
assert.equal(isUsefulCandidateUrl("https://discord.com/api/oauth2/token"), false);
assert.equal(isUsefulCandidateUrl("https://docs.example.com/oauth/apps"), true);
assert.equal(isUsefulCandidateUrl("https://docs.example.com/oauth/apps.md"), true);
assert.equal(isUsefulCandidateUrl("https://linear.app/docs/diffs#organization-setup\\"), false);
assert.equal(isUsefulCandidateUrl("https://linear.app/changelog/2020-12-08-oauth2"), false);
assert.equal(isUsefulCandidateUrl("https://github.com/login/oauth/authorize?client_id=x"), false);
assert.equal(
  isUsefulCandidateUrl("https://developers.asana.com/reference/createtimesheetapprovalstatus.md"),
  false,
  "API operation references must not look like app-setup pages"
);
assert.equal(
  isUsefulCandidateUrl("https://developers.asana.com/reference/oauth-scopes"),
  true,
  "OAuth reference pages must remain eligible"
);
assert.equal(
  isPluginOnlyClaim(
    { url: "https://developers.figma.com/docs/plugins/oauth-with-plugins/", title: "OAuth with Plugins" },
    {
      slot: "requirements",
      value: "A plugin must be registered with a third-party OAuth provider.",
      quote: "You must be able to register your plugin with the OAuth provider you plan to use.",
    }
  ),
  true,
  "plugin-specific requirements must not become app-setup prerequisites"
);
assert.equal(
  isPluginOnlyClaim(
    { url: "https://developers.figma.com/docs/rest-api/oauth-apps/", title: "OAuth apps" },
    {
      slot: "requirements",
      value: "A publicly available HTTPS server is required.",
      quote: "You must have a publicly available HTTPS server.",
    }
  ),
  false
);
assert.equal(
  isEnterpriseAuthClaim(
    {
      url: "https://developers.notion.com/guides/mcp/enterprise-managed-authorization",
      title: "Enterprise-managed authorization",
    },
    {
      slot: "rejectionCauses",
      value: "The token exchange fails when the assertion audience is wrong.",
      quote: "The assertion fails when aud contains more than one value.",
    }
  ),
  true,
  "enterprise assertion failures must not become OAuth-app rejection causes"
);
assert.equal(
  isPersonalAccessTokenClaim(
    {
      url: "https://developers.notion.com/guides/get-started/personal-access-tokens",
      title: "Personal access tokens",
    },
    {
      slot: "requirements",
      value: "Guests and restricted members cannot create PATs.",
      quote: "Guests and restricted members cannot create personal access tokens.",
    }
  ),
  true,
  "PAT-only requirements must not become OAuth-app prerequisites"
);
assert.equal(
  isPersonalAccessTokenClaim(
    {
      url: "https://developers.notion.com/guides/get-started/personal-access-tokens",
      title: "Personal access tokens",
    },
    {
      slot: "tokenModel",
      value: "A public connection issues an OAuth access token.",
      quote: "The public connection issues an OAuth access token for each user.",
    }
  ),
  false,
  "PAT pages may still mention OAuth explicitly"
);
assert.equal(
  isPersonalAccessTokenClaim(
    {
      url: "https://developers.asana.com/docs/personal-access-token",
      title: "Personal access token",
    },
    {
      slot: "canIndividualFinish",
      value: "Any individual can create personal access tokens.",
      quote: "Any user can create personal access tokens.",
    }
  ),
  true,
  "PAT eligibility must not be presented as OAuth-app eligibility"
);
assert.deepEqual(
  candidateFacets(
    candidate(
      "https://developers.asana.com/reference/createtimesheetapprovalstatus.md",
      "Create a timesheet approval status",
      20
    )
  ),
  [],
  "an unrelated API operation must not occupy setup or review coverage"
);
assert.ok(
  candidateFacets(
    candidate(
      "https://developers.asana.com/docs/getting-started-with-asana-oauth",
      "Getting started with Asana OAuth",
      13
    )
  ).includes("setup")
);

assert.equal(isProviderHost("developers.notion.com", "notion.so"), true);
assert.equal(isProviderHost("docs.example.com", "example.com"), true);
assert.equal(isProviderHost("docs.spring.io", "notion.com"), false);

const docsText =
  "Create an OAuth app in the developer console. Set the redirect URI to https://example.com/callback. ".repeat(
    20
  );
assert.equal(
  assessPageUsability({ title: "Create an OAuth app", text: docsText, method: "jina" }).usable,
  true
);
assert.deepEqual(
  assessPageUsability({
    title: "Welcome back!",
    text: "Sign in with your email address and password. Forgot password? QR code login. Welcome back. ".repeat(
      4
    ),
    method: "jina",
  }),
  { usable: false, reason: "login" }
);
assert.deepEqual(
  assessPageUsability({
    title: "Cal.com",
    text: "# Cal.com\n\nWelcome back! Sign in to continue\n\nSign in with Google Sign in with Microsoft or Email Password [Forgot?] Continue [Create account] Sign in with SAML/OIDC\n\nAdd this app to your home screen for faster access and improved experience. Dismiss. ".repeat(
      2
    ),
    method: "jina",
  }),
  { usable: false, reason: "login" },
  "a branded login shell must be rejected from its body, not just its title"
);
assert.equal(
  assessPageUsability({
    title: "Page not found",
    text: "The page you are looking for doesn't exist. Return to the home page. ".repeat(10),
  }).reason,
  "not-found"
);
assert.equal(
  assessPageUsability({
    title: "Access denied",
    text: "You do not have permission to view this page. ".repeat(10),
  }).reason,
  "access-denied"
);
assert.equal(
  assessPageUsability({
    title: "Example",
    text: "You need to enable JavaScript to run this app. Please enable JavaScript to continue. ".repeat(
      10
    ),
  }).reason,
  "javascript-shell"
);
assert.equal(
  assessPageUsability({
    title: "Troubleshooting OAuth errors",
    text: "If the redirect URI returns a 404 error, check the callback URL and the registered client. ".repeat(
      20
    ),
  }).usable,
  true,
  "a docs page that mentions 404 must not be rejected as a soft 404"
);

assert.equal(
  contentFingerprint("Create an OAuth app at https://cal.com/docs. Set the redirect URI."),
  contentFingerprint("Create an OAuth app at https://docs.cal.com/. Set the redirect URI."),
  "URL-only differences must not defeat duplicate detection"
);
assert.notEqual(
  contentFingerprint("Create an OAuth app at https://cal.com/docs."),
  contentFingerprint("A different page about scopes.")
);

const noise = "Connected accounts for end users. ".repeat(400);
const longPage = `# Example OAuth

${"Intro text about the developer platform. ".repeat(100)}

${noise}

## Create an OAuth app

Create an app in the developer console and set the redirect URI to https://example.com/callback. Register the client ID and client secret.

## Scopes

Request only the scopes your app needs. Sensitive scopes require review.

## Review

Apps require verification before they can be used by other users. Submit the app for review.`;
const excerpt = buildExtractionExcerpt(longPage, 12_000);
assert.equal(excerpt.truncated, true);
assert.ok(excerpt.usedChars <= 12_000, "excerpt must respect the character budget");
assert.ok(excerpt.text.includes("Create an app in the developer console"), "late setup section must be included");
assert.ok(excerpt.text.includes("Sensitive scopes require review"), "late scopes section must be included");
assert.ok(excerpt.text.includes("Apps require verification"), "late review section must be included");
assert.ok(
  (excerpt.text.match(/Connected accounts/g) || []).length < 200,
  "irrelevant middle content should not consume the whole budget"
);
for (const part of excerpt.text.split("\n\n[...]\n\n")) {
  assert.ok(longPage.includes(part), "every excerpt block must be an exact slice of the page");
}
const reviewQuote = "Apps require verification before they can be used by other users.";
assert.equal(matchQuote(longPage, reviewQuote), "exact");
assert.equal(buildExtractionExcerpt("Short page", 45_000).text, "Short page");
assert.equal(slugify("!!! 微信"), "app", "non-Latin-only names still need a valid slug");
assert.equal(slugify("Acme Notes"), "acme-notes");

assert.equal(inputTooLong("x".repeat(160)), false);
assert.equal(inputTooLong("x".repeat(161)), true);
assert.equal(requestIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
assert.equal(requestIp(new Headers({ "x-real-ip": "203.0.113.10" })), "203.0.113.10");
assert.equal(accessCodeRequired(), false);
assert.equal(hasValidAccessCode(new Headers()), true);

const previousCode = process.env.GENERATE_ACCESS_CODE;
process.env.GENERATE_ACCESS_CODE = "demo-secret";
assert.equal(accessCodeRequired(), true);
assert.equal(hasValidAccessCode(new Headers({ "x-demo-code": "demo-secret" })), true);
assert.equal(hasValidAccessCode(new Headers({ "x-demo-code": "wrong" })), false);
assert.equal(hasValidAccessCode(new Headers()), false);
if (previousCode === undefined) delete process.env.GENERATE_ACCESS_CODE;
else process.env.GENERATE_ACCESS_CODE = previousCode;

if (!process.env.UPSTASH_REDIS_REST_URL) {
  const previousAccessCode = process.env.GENERATE_ACCESS_CODE;
  delete process.env.GENERATE_ACCESS_CODE;
  const limitRequest = () =>
    new Request("http://localhost/api/generate", {
      headers: { "x-forwarded-for": "198.51.100.20" },
    });
  const first = await beginGeneration(limitRequest(), "example.com");
  assert.equal(first.allowed, true);
  const concurrent = await beginGeneration(limitRequest(), "example.com");
  assert.equal(concurrent.allowed, false, "same-IP runs must be single-flight");
  await first.release();
  const second = await beginGeneration(limitRequest(), "example.com");
  assert.equal(second.allowed, true);
  await second.release();
  const third = await beginGeneration(limitRequest(), "example.com");
  assert.equal(third.allowed, true);
  await third.release();
  const overLimit = await beginGeneration(limitRequest(), "example.com");
  assert.equal(overLimit.allowed, false, "per-IP window must stop the fourth run");
  assert.equal(overLimit.status, 429);

  const previousConcurrent = process.env.GENERATE_MAX_CONCURRENT;
  process.env.GENERATE_MAX_CONCURRENT = "1";
  const firstIp = new Request("http://localhost/api/generate", {
    headers: { "x-forwarded-for": "198.51.100.21" },
  });
  const secondIp = new Request("http://localhost/api/generate", {
    headers: { "x-forwarded-for": "198.51.100.22" },
  });
  const globalFirst = await beginGeneration(firstIp, "example.com");
  assert.equal(globalFirst.allowed, true);
  const globalSecond = await beginGeneration(secondIp, "example.com");
  assert.equal(globalSecond.allowed, false, "the configured global cap must be enforced");
  await globalFirst.release();
  const globalAfterRelease = await beginGeneration(secondIp, "example.com");
  assert.equal(globalAfterRelease.allowed, true);
  await globalAfterRelease.release();

  if (previousConcurrent === undefined) delete process.env.GENERATE_MAX_CONCURRENT;
  else process.env.GENERATE_MAX_CONCURRENT = previousConcurrent;
  if (previousAccessCode === undefined) delete process.env.GENERATE_ACCESS_CODE;
  else process.env.GENERATE_ACCESS_CODE = previousAccessCode;
}

const validObservation = {
  id: "obs-test",
  provider: "Example",
  attemptedAt: "2026-10-29",
  method: "console",
  outcome: "created",
  steps: [{ label: "Open console", detail: "Reached the app form.", outcome: "observed" }],
  created: {
    oauthApp: true,
    clientId: true,
    clientSecret: true,
    submittedForReview: false,
  },
  credentialsStored: false,
  notes: "Client secret was not copied.",
};
assert.deepEqual(validateSetupObservation(validObservation), []);
assert.ok(
  validateSetupObservation({ ...validObservation, credentialsStored: true }).some((error) =>
    error.includes("credentialsStored")
  ),
  "observations that store credentials must be rejected"
);
assert.ok(
  validateSetupObservation({ ...validObservation, notes: "client_secret=abcdefghijklmnop" }).some(
    (error) => error.includes("credential")
  ),
  "secret-like values must be rejected even in free text"
);
assert.ok(
  validateSetupObservation({
    ...validObservation,
    outcome: "created",
    created: { ...validObservation.created, oauthApp: false },
  }).some((error) => error.includes("created outcome")),
  "a created outcome must not claim the app was never created"
);
assert.ok(
  validateSetupObservation({
    ...validObservation,
    outcome: "blocked",
    created: { ...validObservation.created, oauthApp: true },
  }).some((error) => error.includes("outcome=partial")),
  "a blocked outcome must use partial when the app was created"
);

console.log("selftest passed");
