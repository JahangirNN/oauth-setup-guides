import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[760px] flex-col items-start px-6 pb-24 pt-20 sm:pt-28">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        404 · Guide not found
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        This guide isn’t in the library.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        The link may be wrong, or the guide was generated in a different session and didn’t
        persist. Browse the existing guides, or generate a fresh one.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Browse the library
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/new" className="btn btn-secondary">
          Generate a guide
        </Link>
      </div>
    </main>
  );
}
