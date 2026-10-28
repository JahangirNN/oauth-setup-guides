import { chatJSON } from "./ifm";
import { numericTokens } from "./text";
import type { Claim, Difficulty, GuideHeader, Inference, Slot } from "./types";

function valueOf(claims: Claim[], slot: Slot): string | null {
  return claims.find((c) => c.slot === slot)?.value ?? null;
}

function inferenceOf(inferences: Inference[], slot: Slot): Inference | null {
  return inferences.find((i) => i.slot === slot) ?? null;
}

function parseReview(value: string | null): GuideHeader["reviewRequired"] {
  if (!value) return "unknown";
  const v = value.toLowerCase();
  // Conditional review must win over a bare "no" later in the sentence:
  // "Yes, but only for certain scopes" is not a no-review app.
  if (
    /(sometimes|may require|depending|conditional|for sensitive|only for|only if|only when|when you request|if you request|if your app|certain scopes|some scopes|scopes require|requires approval|requires review)/.test(
      v
    )
  ) {
    return "sometimes";
  }
  if (
    /(not required|no review|no formal review|does not require|no approval|none required|^no\b|^false\b)/.test(
      v
    )
  ) {
    return "no";
  }
  if (/^(yes|true)\b/.test(v)) return "yes";
  if (/(required|review|verif|approval|submit)/.test(v)) return "yes";
  return "unknown";
}

function parseIndividual(value: string | null): GuideHeader["canIndividualFinish"] {
  if (!value) return "uncertain";
  const v = value.toLowerCase();
  if (/^build only|build_only/.test(v)) return "build_only";
  if (/(business verification|partner program|partner id|legal entity|organization account)/.test(v)) return "build_only";
  if (/(payment|paid|credit card|subscription|fee)/.test(v)) return "yes_paid";
  if (/^(yes|true)\b/.test(v) || /(individual|person|personal|anyone|solo)/.test(v)) return "yes";
  if (/(cannot|can't|not possible|impossible|no\b)/.test(v)) return "no";
  return "uncertain";
}

function maxDays(text: string | null): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  let max: number | null = null;
  const re = /(\d+(?:\.\d+)?)\s*(minute|hour|day|week|month)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const n = Number(m[1]);
    const unit = m[2];
    const days = unit === "minute" ? n / 1440 : unit === "hour" ? n / 24 : unit === "day" ? n : unit === "week" ? n * 7 : n * 30;
    if (max === null || days > max) max = days;
  }
  if (max === null && /several weeks/.test(lower)) return 21;
  if (max === null && /weeks/.test(lower)) return 14;
  return max;
}

function setupScore(text: string | null): number {
  const d = maxDays(text);
  if (d === null) return 2;
  if (d < 1 / 24) return 1;
  if (d < 1) return 2;
  if (d < 3) return 3;
  return 4;
}

function gateScore(review: GuideHeader["reviewRequired"], reviewText: string | null, requirements: string | null): number {
  if (review === "no") return 1;
  const v = (reviewText || "").toLowerCase();
  const req = (requirements || "").toLowerCase();
  if (/(security assessment|casa|annual|restricted|traction|active workspaces|marketplace)/.test(v + req)) return 5;
  if (/(business verification|domain verification|partner|admin consent|entity)/.test(v + req)) return 4;
  const d = maxDays(reviewText);
  if (d !== null && d <= 3) return 2;
  if (d !== null && d <= 14) return 3;
  if (review === "sometimes") return 3;
  return review === "unknown" ? 3 : 4;
}

function timeScore(review: GuideHeader["reviewRequired"], reviewText: string | null): number {
  if (review === "no") return 1;
  const d = maxDays(reviewText);
  if (d === null) return review === "unknown" ? 3 : review === "sometimes" ? 4 : 5;
  if (d <= 3) return 2;
  if (d <= 14) return 3;
  if (d <= 56) return 4;
  return 5;
}

function humanizeDays(days: number): string {
  if (days < 1) return "under a day";
  if (days <= 3) return `${Math.ceil(days)} days`;
  if (days <= 60) return `${Math.ceil(days / 7)} weeks`;
  return `${Math.ceil(days / 30)} months`;
}

export function deriveHeader(
  appName: string,
  domain: string,
  claims: Claim[],
  inferences: Inference[] = []
): GuideHeader {
  const reviewClaim = valueOf(claims, "reviewRequired");
  const reviewInference = inferenceOf(inferences, "reviewRequired");
  const reviewSource = reviewClaim ?? reviewInference?.value ?? null;
  const review = parseReview(reviewSource);
  const reviewNote = !reviewClaim && reviewInference
    ? reviewInference.basis
    : review === "sometimes" && reviewClaim
      ? reviewClaim
      : undefined;

  const reviewText = valueOf(claims, "reviewTimeline");
  const setupClaim = valueOf(claims, "setupTime");
  const setupInference = inferenceOf(inferences, "setupTime");
  const setupText = setupClaim ?? setupInference?.value ?? null;
  const setupNote = !setupClaim && setupInference ? setupInference.basis : undefined;
  const requirements = valueOf(claims, "requirements");

  const setup = setupScore(setupText);
  const gate = gateScore(review, reviewText, requirements);
  const time = timeScore(review, reviewText);
  const difficulty: Difficulty = { setup, gate, time, overall: Math.max(setup, gate, time) };

  const documented = claims.filter((c) => c.status === "documented").length;
  const coverage = documented >= 8 ? "high" : documented >= 4 ? "medium" : "low";

  const setupTime = setupText || (review === "no" ? "Under 1 hour (no review)" : "Not stated");
  const reviewTime = reviewText || (review === "no" ? "No review required" : "Not published");
  const reviewDays = maxDays(reviewText);
  const totalTime =
    review === "no"
      ? setupTime
      : review === "sometimes"
        ? reviewDays === null
          ? `${setupTime} setup; review wait, if required, not published`
          : `${setupTime} setup + up to ${humanizeDays(reviewDays)} review if required`
        : reviewDays === null
          ? `${setupTime} setup + an unpublished review wait`
          : `${setupTime} setup + up to ${humanizeDays(reviewDays)} review`;

  const consoleUrl = claims.find((c) => c.slot === "appCreationUrl")?.value ?? "";
  const consoleName = claims.find((c) => c.slot === "consoleName")?.value ?? "";
  const consoleFromName = consoleName.match(/https?:\/\/[^\s)`"']+/)?.[0] ?? "";
  const finalConsoleUrl = /^https?:\/\//.test(consoleUrl) ? consoleUrl : consoleFromName;

  const individualClaim = valueOf(claims, "canIndividualFinish");
  const individualInference = inferenceOf(inferences, "canIndividualFinish");

  return {
    appName,
    domain,
    tagline: `${appName} OAuth app setup and approval, with evidence for every claim.`,
    consoleUrl: /^https?:\/\//.test(finalConsoleUrl) ? finalConsoleUrl : "",
    setupTime,
    reviewRequired: review,
    reviewTime,
    totalTime,
    canIndividualFinish: parseIndividual(individualClaim ?? individualInference?.value ?? null),
    difficulty,
    lastVerified: new Date().toISOString().slice(0, 10),
    coverage,
    reviewNote,
    setupNote,
  };
}

const guideSchema = {
  type: "object",
  properties: { markdown: { type: "string" } },
  required: ["markdown"],
  additionalProperties: false,
};

export interface SynthResult {
  markdown: string;
  numericViolations: string[];
  unsourcedLinks: string[];
  latencyMs: number;
}

function cleanUrl(raw: string): string {
  return raw.replace(/[).,;:'"\]>`]+$/, "");
}

function findUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)\]"'<>]+/g)].map((m) => cleanUrl(m[0]));
}

export function addAgentSection(markdown: string, header: GuideHeader): string {
  if (/##\s+What the agent can do/i.test(markdown)) return markdown;

  const gate: string[] = [];
  if (header.reviewRequired === "yes") {
    gate.push(
      header.reviewTime && !/not published|not documented|unknown/i.test(header.reviewTime)
        ? `The sources reviewed say app review or verification is required. Documented timelines: ${header.reviewTime}. Submitting the app and answering reviewer questions are developer tasks.`
        : "The sources reviewed say app review or verification is required, but no timeline is published. Submitting the app and answering reviewer questions are developer tasks."
    );
  } else if (header.reviewRequired === "no") {
    gate.push(
      "No provider review or verification step appears in the sources reviewed; confirm that with the provider before launch. The remaining work is console setup and credential handling."
    );
  } else if (header.reviewRequired === "sometimes") {
    gate.push(
      "Review is conditional in the sources reviewed. Whether your app triggers it depends on the scopes or data you request; confirm the current policy."
    );
  } else {
    gate.push(
      "The sources reviewed do not establish whether the provider reviews the app. Check the current policy before assuming a self-serve launch."
    );
  }

  if (header.canIndividualFinish === "build_only") {
    gate.push(
      "An individual can build and test, but shipping to all users likely requires business verification or a legal entity."
    );
  }
  if (header.canIndividualFinish === "yes_paid") {
    gate.push("The provider may charge for API access; confirm pricing and eligibility before building.");
  }
  if (header.canIndividualFinish === "no") {
    gate.push("An individual cannot complete this flow alone; an organization or partner account is required.");
  }
  if (header.canIndividualFinish === "uncertain") {
    gate.push(
      "The sources reviewed do not clearly establish whether an individual can complete every step; verify account eligibility before starting."
    );
  }

  const section = `## What the agent can do vs. what you must do

An agent can research the public documentation, draft the app settings, redirect URIs, and scopes, write the authorization and token-exchange code, and keep credentials in server-side environment variables. It cannot create the provider account, click through the provider console, accept terms on your behalf, or submit an approval.

You must create the OAuth app, copy the client ID and secret into your deployment, and own the provider relationship. ${gate.join(" ")}

This guide was produced from public documentation; no provider account was used and no approval was submitted.`;

  const marker = "## What this guide does not know";
  if (markdown.includes(marker)) {
    return markdown.replace(marker, `${section}\n\n${marker}`);
  }
  return `${markdown}\n\n${section}`;
}

export function guideLooksComplete(markdown: string): boolean {
  const text = markdown.trim();
  if (text.length < 600) return false;
  if (/(final will be here|placeholder|lorem ipsum|to be continued|coming soon)/i.test(text)) return false;
  const headings = text.match(/^##\s+.+$/gm) ?? [];
  if (headings.length < 3) return false;
  return /##\s+(Step-by-step setup|Approval and review|Scopes|Before you start)/i.test(text);
}

export async function synthesizeGuide(
  appName: string,
  domain: string,
  header: GuideHeader,
  claims: Claim[],
  inferences: Inference[] = []
): Promise<SynthResult> {
  const compact = claims.map((c) => ({
    slot: c.slot,
    value: c.value,
    quote: c.quote,
    source: c.sourceUrl,
    status: c.status,
  }));

  const user = `Write a developer-facing Markdown guide for creating a ${appName} OAuth app and getting it approved.

AUDIENCE: a developer building an AI agent whose users must connect their ${appName} account. They need to know whether this will take an hour or six weeks, and what will block them.

ALLOWED FACTS: only the claims below. Every provider-specific statement must be supported by one of them.
- Do NOT invent URLs, field names, button labels, durations, or fees.
- Quote numbers and units exactly as supplied. Do not convert seconds to days or weeks, and do not round.
- If a fact is missing, write "Not documented" or omit that detail. Never guess.
- Generic OAuth education (client ID, redirect URI, scopes) is allowed, but do not attach provider specifics to it.

INFERENCES are conclusions drawn from absence or from the shape of the docs. They are not quotes.
- Phrase them as "no review process is documented" or "this appears to be self-serve", never as "the provider says no review is required".
- For setup time estimates, say "estimated at about N minutes from the documented steps".

Inferences:
${JSON.stringify(inferences.map((i) => ({ slot: i.slot, value: i.value, basis: i.basis })), null, 2)}

STRUCTURE (use these headings, skip a section if there is no evidence):
## Do you need your own OAuth app?
## Before you start
## Step-by-step setup
## Scopes
## Approval and review
## Troubleshooting
## Rollback
## What this guide does not know

STYLE: direct, specific, no marketing language. Short paragraphs. Bullets where they help.
Do NOT restate the header cards: no difficulty score, setup duration, review requirement, or review wait as a bullet list or table. The page already shows those above the guide. Mention them only to explain a nuance.

Derived header (already shown above the guide, do not repeat as a table):
${JSON.stringify(header, null, 2)}

CLAIMS:
${JSON.stringify(compact, null, 2)}`;

  const result = await chatJSON<{ markdown: string }>({
    system:
      "You are a technical writer producing evidence-bound documentation. You never add a fact that is not in the supplied claims. " +
      "You would rather write 'not documented' than guess. Always return the complete guide body, never a placeholder or a note to self.",
    user,
    schema: guideSchema,
    schemaName: "guide",
    maxTokens: 16_000,
    effort: "high",
    timeoutMs: 240_000,
  });

  let rawMarkdown = result.data.markdown.trim();
  let latencyMs = result.latencyMs;

  if (!guideLooksComplete(rawMarkdown)) {
    const retry = await chatJSON<{ markdown: string }>({
      system:
        "You are a technical writer producing evidence-bound documentation. You never add a fact that is not in the supplied claims. " +
        "Always return the complete guide body, never a placeholder or a note to self.",
      user: `${user}\n\nIMPORTANT: Your previous answer was not a guide. It was:\n"""${rawMarkdown.slice(
        0,
        300
      )}"""\nReturn the FULL Markdown guide now, using the required headings. Do not write "Final will be here", "placeholder", or any similar note.`,
      schema: guideSchema,
      schemaName: "guide",
      maxTokens: 16_000,
      effort: "high",
      timeoutMs: 240_000,
    });
    rawMarkdown = retry.data.markdown.trim();
    latencyMs += retry.latencyMs;
  }

  if (!guideLooksComplete(rawMarkdown)) {
    throw new Error(
      `Synthesis returned an incomplete guide (${rawMarkdown.length} characters). The run was stopped instead of publishing a placeholder. Please retry.`
    );
  }

  // The page already renders the app name and tagline; a model-added H1 duplicates it.
  const markdown = rawMarkdown
    .replace(/^#\s+.+\n+/, "")
    .replace(/\babout ~/g, "about ")
    .trim();
  const claimText = claims.map((c) => `${c.value} ${c.quote}`).join(" ");
  const claimNumbers = new Set(numericTokens(claimText).map((n) => n.replace(/\s+/g, " ").trim()));

  const violations = numericTokens(markdown)
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => /(day|week|hour|month|user|%)/.test(n))
    .filter((n) => !claimNumbers.has(n));

  const allowedUrls = new Set<string>();
  for (const claim of claims) {
    for (const url of [...findUrls(claim.value), ...findUrls(claim.quote), ...findUrls(claim.sourceUrl)]) {
      allowedUrls.add(url);
    }
  }
  for (const url of findUrls(header.consoleUrl)) allowedUrls.add(url);

  const unsourcedLinks = [...new Set(findUrls(markdown))].filter((url) => !allowedUrls.has(url));

  return {
    markdown: addAgentSection(markdown, header),
    numericViolations: [...new Set(violations)],
    unsourcedLinks,
    latencyMs,
  };
}
