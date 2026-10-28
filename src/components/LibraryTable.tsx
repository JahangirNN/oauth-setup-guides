import Link from "next/link";
import type { Guide } from "@/lib/types";
import { CanFinishBadge, DifficultyDots, ReviewBadge } from "@/components/Badges";
import { formatDate } from "@/components/labels";

const HEAD =
  "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted first:pl-5 last:pr-5";
const CELL = "px-4 py-4 align-middle text-sm first:pl-5 last:pr-5";

export function LibraryTable({ guides }: { guides: Guide[] }) {
  return (
    <>
      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="OAuth app comparison table. Scroll horizontally for review, verification, and date columns."
        >
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <caption className="sr-only">OAuth app setup difficulty by provider</caption>
            <thead>
              <tr className="border-b border-line bg-subtle/70">
                <th scope="col" className={HEAD}>
                  App
                </th>
                <th scope="col" className={HEAD}>
                  Difficulty
                </th>
                <th scope="col" className={HEAD}>
                  Setup
                </th>
                <th scope="col" className={HEAD}>
                  Review required
                </th>
                <th scope="col" className={HEAD}>
                  Review wait
                </th>
                <th scope="col" className={HEAD}>
                  Can I finish?
                </th>
                <th scope="col" className={HEAD}>
                  Last verified
                </th>
              </tr>
            </thead>
            <tbody>
              {guides.map((guide) => (
                <tr
                  key={guide.slug}
                  className="group relative border-b border-line transition-colors last:border-0 hover:bg-subtle/60 focus-within:bg-subtle/60"
                >
                  <td className={CELL}>
                    <Link
                      href={`/g/${guide.slug}`}
                      className="font-semibold text-ink transition-colors after:absolute after:inset-0 group-hover:text-accent"
                    >
                      {guide.header.appName}
                    </Link>
                    <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted">
                      {guide.header.domain}
                    </span>
                  </td>
                  <td className={CELL}>
                    <DifficultyDots
                      value={guide.header.difficulty.overall}
                      showValue
                      className="whitespace-nowrap"
                    />
                  </td>
                  <td className={`${CELL} max-w-[190px] text-ink-soft`}>{guide.header.setupTime}</td>
                  <td className={CELL}>
                    <ReviewBadge value={guide.header.reviewRequired} />
                  </td>
                  <td className={`${CELL} max-w-[200px] text-ink-soft`}>{guide.header.reviewTime}</td>
                  <td className={CELL}>
                    <CanFinishBadge value={guide.header.canIndividualFinish} />
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-muted`}>
                    <time dateTime={guide.header.lastVerified}>
                      {formatDate(guide.header.lastVerified)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted sm:hidden">
        Scroll the table sideways for review, verification, and date columns.
      </p>
    </>
  );
}
