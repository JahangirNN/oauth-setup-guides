import { TierBadge } from "@/components/Badges";
import { hostname, sourceLabel } from "@/components/labels";
import { stageDefinition, type SourceView, type StageView } from "@/components/run-types";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
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

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 animate-spin"
      fill="none"
      aria-hidden="true"
    >
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

function XIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 8 8" />
      <path d="m14 6-8 8" />
    </svg>
  );
}

function StageRow({ stage, index, last }: { stage: StageView; index: number; last: boolean }) {
  const definition = stageDefinition(stage.id);
  const title = definition?.title ?? stage.id;
  const active = stage.status === "start" || stage.status === "progress";
  const done = stage.status === "done";
  const failed = stage.status === "failed";
  const copy =
    stage.label ||
    (active
      ? "Working…"
      : failed
        ? "Stopped before finishing."
        : (definition?.hint ?? "Waiting to start."));

  const hasProgress = stage.id === "fetch" && stage.total !== undefined && stage.total > 0;
  const percent = hasProgress
    ? Math.min(100, Math.round(((stage.current ?? 0) / (stage.total ?? 1)) * 100))
    : 0;

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!last ? (
        <span
          className={`absolute bottom-0 left-[11px] top-7 w-px ${done ? "bg-accent/30" : "bg-line"}`}
          aria-hidden="true"
        />
      ) : null}

      <span
        className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-medium ${
          failed
            ? "border-rose-200 bg-rose-50 text-rose-600"
            : done
              ? "border-accent bg-accent text-white"
              : active
                ? "border-accent/30 bg-accent-soft text-accent"
                : "border-line bg-white text-muted"
        }`}
        aria-hidden="true"
      >
        {failed ? <XIcon /> : done ? <CheckIcon /> : active ? <Spinner /> : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p
            className={`text-sm font-medium ${
              failed ? "text-rose-900" : active || done ? "text-ink" : "text-muted"
            }`}
          >
            {title}
          </p>
          {failed ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-rose-600">
              Stopped
            </span>
          ) : active ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-accent">Running</span>
          ) : null}
        </div>
        <p className={`mt-0.5 text-xs leading-relaxed ${active ? "text-ink-soft" : "text-muted"}`}>
          {copy}
        </p>
        {hasProgress ? (
          <div className="mt-2 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function RunTimeline({
  stages,
  sources,
}: {
  stages: StageView[];
  sources: SourceView[];
}) {
  const readCount = sources.filter((source) => source.status === "ok").length;
  const failedCount = sources.length - readCount;

  return (
    <div>
      <ol className="space-y-0" aria-label="Generation stages">
        {stages.map((stage, index) => (
          <StageRow
            key={stage.id}
            stage={stage}
            index={index}
            last={index === stages.length - 1}
          />
        ))}
      </ol>

      {sources.length > 0 ? (
        <section className="mt-7 border-t border-line pt-5" aria-labelledby="run-sources-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="run-sources-heading" className="text-sm font-semibold text-ink">
              Sources
            </h3>
            <p className="text-xs text-muted" role="status">
              {readCount} read
              {failedCount > 0 ? ` · ${failedCount} skipped` : ""}
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sources.map((source) => {
              const failed = source.status === "failed";
              return (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`fade-in group min-w-0 rounded-lg border p-3 transition-colors ${
                    failed
                      ? "border-line bg-subtle/40"
                      : "border-line bg-white hover:border-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`line-clamp-2 text-sm font-medium ${
                        failed ? "text-muted" : "text-ink group-hover:text-accent"
                      }`}
                    >
                      {sourceLabel(source.title, source.url)}
                    </p>
                    {source.tier !== undefined ? (
                      <TierBadge tier={source.tier} />
                    ) : (
                      <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Skipped
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted">
                    {hostname(source.url)}
                  </p>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
