import type { GuideSource } from "@/lib/types";
import { TierBadge } from "@/components/Badges";
import { formatDate, hostname, plural, sourceLabel } from "@/components/labels";

export function SourcesList({ sources }: { sources: GuideSource[] }) {
  return (
    <section aria-labelledby="sources-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sources-heading" className="text-xl font-semibold tracking-tight text-ink">
          Sources
        </h2>
        <p className="text-xs text-muted">
          {sources.length} {plural(sources.length, "page")} fetched
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Tier 1 is first-party documentation. Fetch dates are recorded at generation time.
      </p>

      {sources.length === 0 ? (
        <p className="mt-4 rounded-lg border border-line bg-subtle/60 p-4 text-sm text-muted">
          No sources were recorded for this guide.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {sources.map((source, index) => (
            <li key={source.url} className="flex gap-3 px-4 py-3.5">
              <span className="mt-0.5 w-5 shrink-0 font-mono text-[11px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words text-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {sourceLabel(source.title, source.url)}
                </a>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <TierBadge tier={source.tier} />
                  <span className="truncate font-mono text-[11px]">{hostname(source.url)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Fetched {formatDate(source.fetchedAt)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
