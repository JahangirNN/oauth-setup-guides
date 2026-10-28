import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-4 px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
            OAuth Setup Guides
          </span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className="hidden rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink sm:block"
          >
            Library
          </Link>
          <Link href="/new" className="btn btn-primary px-3 py-1.5 text-[13px] sm:text-sm">
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">Generate guide</span>
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
