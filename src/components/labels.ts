import type { Claim, EvidenceStatus, GuideHeader, SourceTier } from "@/lib/types";

export const CAN_FINISH_LABELS: Record<GuideHeader["canIndividualFinish"], string> = {
  yes: "Yes",
  yes_paid: "Yes, paid",
  build_only: "Build only",
  no: "No",
  uncertain: "Uncertain",
};

export const CAN_FINISH_HINTS: Record<GuideHeader["canIndividualFinish"], string> = {
  yes: "One developer can complete this without a company, payment, or partner program.",
  yes_paid: "One developer can finish this, but a paid plan or fee is required.",
  build_only: "You can build against it, but shipping to other people needs an organization or extra approval.",
  no: "An individual cannot complete this setup as documented.",
  uncertain: "The sources do not establish whether an individual can finish.",
};

export const REVIEW_LABELS: Record<GuideHeader["reviewRequired"], string> = {
  yes: "Yes",
  no: "No",
  sometimes: "Sometimes",
  unknown: "Unknown",
};

export const COVERAGE_LABELS: Record<GuideHeader["coverage"], string> = {
  high: "High coverage",
  medium: "Medium coverage",
  low: "Low coverage",
};

export const COVERAGE_HINTS: Record<GuideHeader["coverage"], string> = {
  high: "Official documentation answered the key questions.",
  medium: "Some answers rest on partial or indirect documentation.",
  low: "Thin documentation. Expect gaps in the evidence.",
};

export const STATUS_ORDER: EvidenceStatus[] = [
  "documented",
  "inferred",
  "reported",
  "tested",
  "unknown",
];

export const STATUS_LABELS: Record<EvidenceStatus, string> = {
  tested: "Tested",
  documented: "Documented",
  reported: "Reported",
  inferred: "Inferred",
  unknown: "Unknown",
};

export const STATUS_EXPLANATIONS: Record<EvidenceStatus, string> = {
  tested: "Observed by executing the flow against the provider.",
  documented: "Stated in first-party documentation, with a verbatim quote.",
  reported: "Reported by a secondary source rather than the provider.",
  inferred: "Derived from related evidence; not stated directly.",
  unknown: "Could not be confirmed from the available sources.",
};

export const MATCH_LABELS: Record<Claim["match"], string> = {
  exact: "Exact match",
  loose: "Loose match",
  rejected: "Rejected",
};

export const TIER_HINTS: Record<SourceTier, string> = {
  1: "Tier 1 — first-party documentation",
  2: "Tier 2 — official disclosure",
  3: "Tier 3 — partner or help-center documentation",
  4: "Tier 4 — third-party write-up",
  5: "Tier 5 — community source",
};

export type DifficultyTone = "easy" | "medium" | "hard";

export function difficultyTone(value: number): DifficultyTone {
  if (value <= 2) return "easy";
  if (value === 3) return "medium";
  return "hard";
}

export function formatDate(value: string): string {
  if (!value) return "Unknown";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function sourceLocation(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${host}${pathname}`;
  } catch {
    return url;
  }
}

export function sourceLabel(title: string, url: string): string {
  const cleaned = title.replace(/^URL Source:\s*/i, "").trim();
  if (!cleaned || cleaned === url) return sourceLocation(url);
  return cleaned;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function firstSentence(value: string): string {
  const index = value.indexOf(". ");
  return index > 0 ? value.slice(0, index + 1) : value;
}
