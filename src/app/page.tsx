import Link from "next/link";
import { listGuides } from "@/lib/store";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { HowItWorks } from "@/components/HowItWorks";
import { LibraryTable } from "@/components/LibraryTable";
import { SearchForm } from "@/components/SearchForm";
import { plural } from "@/components/labels";

export const dynamic = "force-dynamic";

const CHECKS = ["Verbatim quotes", "Review gates surfaced", "Unknowns left unknown"];

export default async function HomePage() {
  const guides = await listGuides();

  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-14 sm:pt-20">
      <section aria-labelledby="product-title">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          OAuth app onboarding, with evidence
        </p>
        <h1
          id="product-title"
          className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]"
        >
          OAuth Setup Guides
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Find out what it actually takes to ship this OAuth app — before you spend a week
          finding out.
        </p>

        <div className="mt-8">
          <SearchForm />
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
          {CHECKS.map((check) => (
            <li key={check} className="flex items-center gap-1.5">
              <svg
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5 text-emerald-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m4 10 4 4 8-8" />
              </svg>
              {check}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20" aria-labelledby="guides-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 id="guides-heading" className="text-2xl font-semibold tracking-tight text-ink">
              The library
            </h2>
            <p className="mt-1 text-sm text-muted">
              {guides.length} {plural(guides.length, "guide")} · sorted by difficulty
            </p>
          </div>
          <Link
            href="/new"
            className="text-sm font-medium text-accent hover:text-accent-strong hover:underline"
          >
            Generate a new guide
            <span aria-hidden="true"> →</span>
          </Link>
        </div>

        {guides.length === 0 ? <EmptyLibrary /> : <LibraryTable guides={guides} />}

        {guides.length > 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Difficulty runs from 1 (self-serve in minutes) to 5 (weeks of review or verification).
            Every row links to its sources and per-claim evidence.
          </p>
        ) : null}
      </section>

      <HowItWorks />
    </main>
  );
}
