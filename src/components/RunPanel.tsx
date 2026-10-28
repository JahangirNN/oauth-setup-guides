import Link from "next/link";
import type { GuideHeader } from "@/lib/types";
import { CanFinishBadge, DifficultyDots } from "@/components/Badges";
import { RunTimeline } from "@/components/RunTimeline";
import type { SourceView, StageView } from "@/components/run-types";

type RunPanelStatus = "running" | "done" | "error";

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 text-emerald-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

function WarningIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9v5" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

export function RunPanel({
  status,
  input,
  error,
  elapsedSeconds,
  stalled,
  stages,
  sources,
  meta,
  publishedSlug,
  activeLabel,
  onRetry,
}: {
  status: RunPanelStatus;
  input: string;
  error: string | null;
  elapsedSeconds: number;
  stalled: boolean;
  stages: StageView[];
  sources: SourceView[];
  meta: { header: GuideHeader; slug: string } | null;
  publishedSlug: string | null;
  activeLabel: string;
  onRetry: () => void;
}) {
  const hasProgress =
    sources.length > 0 || stages.some((stage) => stage.status !== "pending");

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              {status === "error" ? "Run stopped" : status === "done" ? "Published" : "Live run"}
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold tracking-tight text-ink">
              {status === "error"
                ? `Couldn't generate a guide for ${input}`
                : status === "done"
                  ? `The guide for ${input} is live`
                  : `Generating a guide for ${input}`}
            </h2>
            <div className="mt-1.5 flex items-start gap-2 text-sm text-muted">
              <span className="mt-0.5 shrink-0">
                {status === "running" ? <Spinner /> : status === "done" ? <CheckIcon /> : <WarningIcon className="h-4 w-4 text-rose-600" />}
              </span>
              <p className="min-w-0" role="status">
                {status === "running" ? (
                  activeLabel
                ) : status === "done" ? (
                  <>
                    Published. Opening the guide
                    {publishedSlug ? (
                      <>
                        {" — "}
                        <Link
                          href={`/g/${publishedSlug}`}
                          className="font-medium text-accent underline underline-offset-2"
                        >
                          open it now
                        </Link>
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  "The run stopped before publishing a guide."
                )}
              </p>
            </div>
          </div>

          <span className="rounded-full border border-line bg-subtle px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted">
            {elapsedSeconds}s elapsed
          </span>
        </div>

        {stalled ? (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Still working — the agent is reading sources.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-line px-5 py-5 sm:px-6">
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <div className="flex gap-3">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-rose-900">The guide didn&apos;t finish</p>
                <p className="mt-1 break-words text-sm leading-relaxed text-rose-800">{error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={onRetry} className="btn btn-secondary bg-white">
                    Try again
                  </button>
                  <Link href="/" className="btn btn-secondary bg-white">
                    Back to the library
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasProgress ? (
        <div className="px-5 py-5 sm:px-6">
          {meta ? (
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/20 bg-accent-soft/50 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                Detected
              </span>
              <span className="text-sm font-medium text-ink">{meta.header.appName}</span>
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
              <DifficultyDots value={meta.header.difficulty.overall} showValue />
              <CanFinishBadge value={meta.header.canIndividualFinish} />
            </div>
          ) : null}

          <RunTimeline stages={stages} sources={sources} />
        </div>
      ) : null}
    </section>
  );
}
