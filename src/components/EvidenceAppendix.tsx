import type { Claim, Inference } from "@/lib/types";
import { SLOT_LABELS } from "@/lib/types";
import { MatchBadge, StatusBadge, TierBadge } from "@/components/Badges";
import {
  STATUS_EXPLANATIONS,
  STATUS_ORDER,
  formatDate,
  hostname,
  plural,
  sourceLabel,
} from "@/components/labels";

function ClaimCard({ claim }: { claim: Claim }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={claim.status} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          {SLOT_LABELS[claim.slot]}
        </span>
        <MatchBadge match={claim.match} className="ml-auto" />
      </div>

      <p className="mt-2.5 break-words text-sm font-medium leading-relaxed text-ink">
        {claim.value}
      </p>

      {claim.quote ? (
        <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-ink-soft">
          {claim.quote}
        </blockquote>
      ) : (
        <p className="mt-3 text-xs italic text-muted">No verbatim quote recorded.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
        <TierBadge tier={claim.sourceTier} />
        <a
          href={claim.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 max-w-full truncate font-medium text-ink-soft hover:text-accent hover:underline"
        >
          {sourceLabel(claim.sourceTitle, claim.sourceUrl)}
        </a>
        <span aria-hidden="true">·</span>
        <span className="font-mono text-[11px]">{hostname(claim.sourceUrl)}</span>
        <span aria-hidden="true">·</span>
        <span>Fetched {formatDate(claim.fetchedAt)}</span>
      </div>
    </article>
  );
}

function InferenceCard({ inference }: { inference: Inference }) {
  return (
    <article className="rounded-lg border border-dashed border-line bg-subtle/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="inferred" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          {SLOT_LABELS[inference.slot]}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted">
          {Math.round(inference.confidence * 100)}% confidence
        </span>
      </div>
      <p className="mt-2.5 break-words text-sm font-medium leading-relaxed text-ink">
        {inference.value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{inference.basis}</p>
    </article>
  );
}

export function EvidenceAppendix({
  claims,
  inferences = [],
}: {
  claims: Claim[];
  inferences?: Inference[];
}) {
  const groups = STATUS_ORDER.map((status) => ({
    status,
    claims: claims.filter((claim) => claim.status === status),
  })).filter((group) => group.claims.length > 0);

  return (
    <details className="group rounded-xl border border-line bg-subtle/60">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-ink">Evidence appendix</span>
          <span className="text-xs text-muted">
            {claims.length} {plural(claims.length, "claim")}
            {inferences.length > 0
              ? ` · ${inferences.length} ${plural(inferences.length, "inference")}`
              : ""}{" "}
            · grouped by status
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>

      <div className="border-t border-line px-5 py-5">
        <p className="text-xs leading-relaxed text-muted">
          Every claim below is paired with the sentence it came from. Status describes how the
          claim was established, not how confident the model sounds. Inferences have no quote:
          they are conclusions drawn from absence or from the shape of the documentation.
        </p>

        {claims.length === 0 && inferences.length === 0 ? (
          <p className="mt-4 rounded-lg border border-line bg-white p-4 text-sm text-muted">
            No claims were recorded for this guide.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {inferences.length > 0 ? (
              <section aria-label="inferences">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="inferred" />
                  <span className="text-xs text-muted">
                    {inferences.length} {plural(inferences.length, "inference")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {STATUS_EXPLANATIONS.inferred}
                </p>
                <div className="mt-3 space-y-3">
                  {inferences.map((inference) => (
                    <InferenceCard key={inference.slot} inference={inference} />
                  ))}
                </div>
              </section>
            ) : null}

            {groups.map((group) => (
              <section key={group.status} aria-label={`${group.status} claims`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={group.status} />
                  <span className="text-xs text-muted">
                    {group.claims.length} {plural(group.claims.length, "claim")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {STATUS_EXPLANATIONS[group.status]}
                </p>

                <div className="mt-3 space-y-3">
                  {group.claims.map((claim) => (
                    <ClaimCard key={claim.id} claim={claim} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
