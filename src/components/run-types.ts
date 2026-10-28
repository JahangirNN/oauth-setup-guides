import type { SourceTier } from "@/lib/types";

export type StageStatus = "pending" | "start" | "progress" | "done" | "failed";

export interface StageView {
  id: string;
  label: string;
  status: StageStatus;
  current?: number;
  total?: number;
}

export interface SourceView {
  url: string;
  title: string;
  status: "ok" | "failed";
  tier?: SourceTier;
}

export const STAGE_DEFS = [
  { id: "resolve", title: "Resolve the app", hint: "Identify the product and its domain." },
  {
    id: "discover",
    title: "Discover documentation",
    hint: "Probe llms.txt, sitemaps, and the provider's docs.",
  },
  { id: "fetch", title: "Read sources", hint: "Fetch up to six first-party pages." },
  { id: "extract", title: "Extract claims", hint: "Pull facts with verbatim quotes." },
  { id: "verify", title: "Verify quotes", hint: "Match every quote against the source text." },
  { id: "draft", title: "Draft the guide", hint: "Write from verified claims only." },
  { id: "publish", title: "Publish", hint: "Save the guide and create a share link." },
] as const;

export function createStages(): StageView[] {
  return STAGE_DEFS.map((stage) => ({ id: stage.id, label: "", status: "pending" }));
}

export function stageDefinition(id: string) {
  return STAGE_DEFS.find((stage) => stage.id === id);
}
