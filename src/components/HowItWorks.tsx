const STEPS = [
  {
    title: "Discover docs",
    description:
      "Resolve the app's domain, then probe llms.txt, sitemaps, and the docs for the pages that actually govern OAuth apps.",
  },
  {
    title: "Extract with quotes",
    description:
      "Pull each claim with a verbatim quote from the page it came from. No quote, no claim — the guide cannot invent specifics.",
  },
  {
    title: "Verify",
    description:
      "Match every quote against the fetched text, score the source tier, and publish the result — including what could not be confirmed.",
  },
];

export function HowItWorks() {
  return (
    <section className="mt-20 border-t border-line pt-10" aria-labelledby="how-it-works">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Method</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight text-ink">
          How this works
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-muted">
          Three steps, each visible in the evidence appendix of every guide.
        </p>
      </div>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle font-mono text-[11px] font-medium text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
