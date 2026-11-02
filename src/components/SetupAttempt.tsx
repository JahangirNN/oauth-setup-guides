import type { SetupObservation, SetupObservationStep } from "@/lib/types";
import { formatDate, plural } from "@/components/labels";

function StepMark({ outcome }: { outcome: SetupObservationStep["outcome"] }) {
  if (outcome === "observed") {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
        ✓
      </span>
    );
  }
  if (outcome === "blocked") {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-semibold text-rose-800">
        ×
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-[11px] font-semibold text-muted">
      ·
    </span>
  );
}

function CreatedItem({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
          value ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
        }`}
        aria-hidden="true"
      >
        {value ? "✓" : "–"}
      </span>
      <span className="text-ink-soft">{label}</span>
      <span className="ml-auto text-muted">{value ? "Yes" : "No"}</span>
    </div>
  );
}

function ObservationCard({ observation }: { observation: SetupObservation }) {
  const observed = observation.outcome === "created";
  return (
    <article className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                observed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${observed ? "bg-emerald-500" : "bg-amber-500"}`}
                aria-hidden="true"
              />
              {observed ? "Attempt recorded" : "Attempt blocked or partial"}
            </span>
            <span className="font-mono text-[11px] text-muted">{observation.method}</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {observation.provider} · attempted {formatDate(observation.attemptedAt)}
          </p>
        </div>
        <span className="rounded border border-line bg-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Not documentation
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        This is a record of an attempted setup, not a quoted provider claim. It is separate from
        the evidence appendix so a reader can tell what was executed from what was only read.
        Credentials were not stored.
      </p>

      <ol className="mt-4 space-y-3">
        {observation.steps.map((step, index) => (
          <li key={`${observation.id}-${index}`} className="flex gap-2.5">
            <StepMark outcome={step.outcome} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-ink">
                {index + 1}. {step.label}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <CreatedItem label="OAuth app created" value={observation.created.oauthApp} />
        <CreatedItem label="Client ID issued" value={observation.created.clientId} />
        <CreatedItem label="Client secret issued (not stored)" value={observation.created.clientSecret} />
        <CreatedItem label="Submitted for review" value={observation.created.submittedForReview} />
      </div>

      {observation.notes ? (
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          {observation.notes}
        </p>
      ) : null}
    </article>
  );
}

export function SetupAttempt({ observations }: { observations: SetupObservation[] }) {
  if (observations.length === 0) return null;

  return (
    <section aria-labelledby="setup-attempt-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-attempt-heading" className="text-xl font-semibold tracking-tight text-ink">
          Setup attempt
        </h2>
        <p className="text-xs text-muted">
          {observations.length} {plural(observations.length, "record")} · operator-run
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        A recorded console or API attempt. It is not a provider approval and it does not change the
        quoted documentation claims above.
      </p>
      <div className="mt-4 space-y-4">
        {observations.map((observation) => (
          <ObservationCard key={observation.id} observation={observation} />
        ))}
      </div>
    </section>
  );
}
