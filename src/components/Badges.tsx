import type { Claim, EvidenceStatus, GuideHeader, SourceTier } from "@/lib/types";
import {
  CAN_FINISH_LABELS,
  COVERAGE_HINTS,
  COVERAGE_LABELS,
  MATCH_LABELS,
  REVIEW_LABELS,
  STATUS_LABELS,
  TIER_HINTS,
  difficultyTone,
} from "@/components/labels";

const DOT_STYLES = {
  easy: { filled: "bg-emerald-500", empty: "bg-emerald-100" },
  medium: { filled: "bg-amber-500", empty: "bg-amber-100" },
  hard: { filled: "bg-rose-500", empty: "bg-rose-100" },
} as const;

const DOT_SIZES = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
} as const;

const DOT_GAPS = {
  sm: "gap-1",
  md: "gap-1",
  lg: "gap-1.5",
} as const;

export function DifficultyDots({
  value,
  size = "md",
  showValue = false,
  className = "",
}: {
  value: number;
  size?: keyof typeof DOT_SIZES;
  showValue?: boolean;
  className?: string;
}) {
  const score = Math.min(5, Math.max(0, Math.round(value)));
  const tone = DOT_STYLES[difficultyTone(score)];

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span className={`inline-flex items-center ${DOT_GAPS[size]}`} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={`rounded-full ${DOT_SIZES[size]} ${
              index < score ? tone.filled : tone.empty
            }`}
          />
        ))}
      </span>
      {showValue ? (
        <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted">{score}</span>
      ) : null}
      <span className="sr-only">Difficulty {score} out of 5</span>
    </span>
  );
}

const CAN_FINISH_STYLES: Record<GuideHeader["canIndividualFinish"], { badge: string; dot: string }> = {
  yes: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  yes_paid: { badge: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  build_only: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  no: { badge: "border-rose-200 bg-rose-50 text-rose-800", dot: "bg-rose-500" },
  uncertain: { badge: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" },
};

export function CanFinishBadge({
  value,
  className = "",
}: {
  value: GuideHeader["canIndividualFinish"];
  className?: string;
}) {
  const style = CAN_FINISH_STYLES[value] ?? CAN_FINISH_STYLES.uncertain;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {CAN_FINISH_LABELS[value] ?? "Uncertain"}
    </span>
  );
}

const REVIEW_STYLES: Record<GuideHeader["reviewRequired"], { badge: string; dot: string }> = {
  yes: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  sometimes: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  no: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  unknown: { badge: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" },
};

export function ReviewBadge({
  value,
  className = "",
}: {
  value: GuideHeader["reviewRequired"];
  className?: string;
}) {
  const style = REVIEW_STYLES[value] ?? REVIEW_STYLES.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {REVIEW_LABELS[value] ?? "Unknown"}
    </span>
  );
}

const COVERAGE_STYLES: Record<GuideHeader["coverage"], { badge: string; dot: string }> = {
  high: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  medium: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  low: { badge: "border-rose-200 bg-rose-50 text-rose-800", dot: "bg-rose-500" },
};

export function CoveragePill({
  coverage,
  className = "",
}: {
  coverage: GuideHeader["coverage"];
  className?: string;
}) {
  const style = COVERAGE_STYLES[coverage] ?? COVERAGE_STYLES.low;
  return (
    <span
      title={COVERAGE_HINTS[coverage]}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {COVERAGE_LABELS[coverage] ?? "Coverage unknown"}
    </span>
  );
}

const TIER_STYLES: Record<SourceTier, string> = {
  1: "border-emerald-200 bg-emerald-50 text-emerald-800",
  2: "border-teal-200 bg-teal-50 text-teal-800",
  3: "border-amber-200 bg-amber-50 text-amber-800",
  4: "border-orange-200 bg-orange-50 text-orange-800",
  5: "border-slate-200 bg-slate-50 text-slate-600",
};

export function TierBadge({ tier, className = "" }: { tier: SourceTier; className?: string }) {
  return (
    <span
      title={TIER_HINTS[tier]}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${TIER_STYLES[tier]} ${className}`}
    >
      Tier {tier}
    </span>
  );
}

const STATUS_STYLES: Record<EvidenceStatus, { badge: string; dot: string }> = {
  tested: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  documented: { badge: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  reported: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  inferred: { badge: "border-violet-200 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  unknown: { badge: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" },
};

export function StatusBadge({ status, className = "" }: { status: EvidenceStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {STATUS_LABELS[status] ?? "Unknown"}
    </span>
  );
}

const MATCH_STYLES: Record<Claim["match"], string> = {
  exact: "border-emerald-200 bg-emerald-50 text-emerald-700",
  loose: "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

export function MatchBadge({ match, className = "" }: { match: Claim["match"]; className?: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${MATCH_STYLES[match]} ${className}`}
    >
      {MATCH_LABELS[match]}
    </span>
  );
}
