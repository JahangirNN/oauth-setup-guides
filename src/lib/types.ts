export type SourceTier = 1 | 2 | 3 | 4 | 5;
export type EvidenceStatus = "tested" | "documented" | "reported" | "inferred" | "unknown";
export type MatchKind = "exact" | "loose" | "rejected";

export const SLOTS = [
  "appCreationUrl",
  "consoleName",
  "reviewRequired",
  "reviewTimeline",
  "setupTime",
  "canIndividualFinish",
  "redirectRules",
  "scopes",
  "tokenModel",
  "rejectionCauses",
  "unverifiedUserExperience",
  "requirements",
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  appCreationUrl: "Where to create the OAuth app",
  consoleName: "Developer console",
  reviewRequired: "Is review or verification required?",
  reviewTimeline: "How long does review take?",
  setupTime: "How long does setup take?",
  canIndividualFinish: "Can an individual finish this?",
  redirectRules: "Redirect URI rules",
  scopes: "Scopes and sensitivity",
  tokenModel: "Token model and lifetime",
  rejectionCauses: "Common rejection causes",
  unverifiedUserExperience: "What users see while unverified",
  requirements: "Prerequisites and required artifacts",
};

export interface Claim {
  id: string;
  slot: Slot;
  value: string;
  quote: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceTier: SourceTier;
  fetchedAt: string;
  match: MatchKind;
  status: EvidenceStatus;
  confidence: number;
}

/**
 * A conclusion drawn from absence or from the shape of the docs, not from a
 * quoted sentence. Kept separate from claims so the UI never implies a quote exists.
 */
export interface Inference {
  slot: Slot;
  value: string;
  basis: string;
  confidence: number;
}

export interface PageDoc {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  raw: string;
  fetchedAt: string;
  method: "jina" | "direct" | "cache";
  tier: SourceTier;
  hash: string;
}

export interface Difficulty {
  setup: number;
  gate: number;
  time: number;
  overall: number;
}

export interface GuideHeader {
  appName: string;
  domain: string;
  tagline: string;
  consoleUrl: string;
  setupTime: string;
  reviewRequired: "yes" | "no" | "sometimes" | "unknown";
  reviewTime: string;
  totalTime: string;
  canIndividualFinish: "yes" | "yes_paid" | "build_only" | "no" | "uncertain";
  difficulty: Difficulty;
  lastVerified: string;
  coverage: "high" | "medium" | "low";
  reviewNote?: string;
  setupNote?: string;
}

export interface EvidenceSummary {
  pagesFetched: number;
  pagesUsed: number;
  quotesVerified: number;
  quotesRejected: number;
  claims: number;
  conflicts: number;
  byStatus: Record<EvidenceStatus, number>;
  /** URLs in the draft that do not appear in any cited claim or the header. */
  unsourcedLinks?: string[];
  /** Duration/user numbers in the draft that are not present in any cited claim. */
  numericViolations?: string[];
}

export interface GuideSource {
  url: string;
  title: string;
  tier: SourceTier;
  fetchedAt: string;
}

export interface Guide {
  slug: string;
  header: GuideHeader;
  markdown: string;
  claims: Claim[];
  inferences: Inference[];
  sources: GuideSource[];
  evidenceSummary: EvidenceSummary;
  generatedAt: string;
  model: string;
  durationMs: number;
}

export interface RunEvent {
  type: "stage" | "source" | "delta" | "meta" | "done" | "error" | "ping";
  [key: string]: unknown;
}
