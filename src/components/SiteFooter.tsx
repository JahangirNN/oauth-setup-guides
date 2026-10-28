import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-6 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-medium text-ink">OAuth Setup Guides</span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          Every claim has a source.
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span>Documented ≠ tested.</span>
          <span aria-hidden="true">·</span>
          <Link href="/new" className="font-medium text-accent hover:underline">
            Generate a guide
          </Link>
        </p>
      </div>
    </footer>
  );
}
