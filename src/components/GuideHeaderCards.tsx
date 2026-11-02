import type { ReactNode } from "react";
import type { GuideHeader } from "@/lib/types";
import { CanFinishBadge, DifficultyDots, ReviewBadge } from "@/components/Badges";
import { CAN_FINISH_HINTS, firstSentence } from "@/components/labels";

function StatCard({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent ? "border-accent/25 bg-accent-soft/50" : "border-line bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-2.5 text-[15px] leading-snug text-ink">{children}</div>
    </div>
  );
}

export function GuideHeaderCards({ header }: { header: GuideHeader }) {
  const breakdown = [
    { label: "Setup", value: header.difficulty.setup },
    { label: "Gate", value: header.difficulty.gate },
    { label: "Time", value: header.difficulty.time },
  ];

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Difficulty">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight text-ink">
            {header.difficulty.overall}
          </span>
          <span className="text-sm text-muted">/ 5</span>
          <DifficultyDots value={header.difficulty.overall} className="ml-1" />
        </div>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {breakdown.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">{row.label}</span>
              <span className="flex items-center gap-2">
                <DifficultyDots value={row.value} size="sm" />
                <span className="w-3 text-right font-mono tabular-nums text-ink-soft">
                  {row.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </StatCard>

      <StatCard label="Setup time">
        {header.setupTime}
        {header.setupNote ? (
          <p className="mt-2 text-xs font-normal leading-relaxed text-muted">
            <span className="font-medium text-ink-soft">Context:</span>{" "}
            {firstSentence(header.setupNote)}
          </p>
        ) : null}
      </StatCard>

      <StatCard label="Review required">
        <ReviewBadge value={header.reviewRequired} />
        {header.reviewNote ? (
          <p className="mt-2 text-xs font-normal leading-relaxed text-muted">
            <span className="font-medium text-ink-soft">Context:</span>{" "}
            {firstSentence(header.reviewNote)}
          </p>
        ) : null}
      </StatCard>

      <StatCard label="Review wait">{header.reviewTime}</StatCard>

      <StatCard label="Total to launch">{header.totalTime}</StatCard>

      <StatCard
        label="Can I finish?"
        accent
      >
        <CanFinishBadge value={header.canIndividualFinish} />
        <p className="mt-2 text-xs font-normal leading-relaxed text-ink-soft">
          {CAN_FINISH_HINTS[header.canIndividualFinish]}
        </p>
      </StatCard>
    </div>
  );
}
