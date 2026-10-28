const POINTS = [
  "Reads up to six public documentation pages.",
  "Keeps a verbatim quote for every claim.",
  "Publishes unknowns instead of guessing.",
];

export function GenerateIntro() {
  return (
    <div className="mt-6 rounded-xl border border-line bg-subtle/50 p-5 sm:p-6">
      <p className="text-sm font-semibold text-ink">What the agent does</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {POINTS.map((point) => (
          <li key={point} className="flex gap-2 text-xs leading-relaxed text-muted">
            <svg
              viewBox="0 0 20 20"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m4 10 4 4 8-8" />
            </svg>
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        No account or API key needed. Every run reads public docs only — and leaves the gaps
        visible.
      </p>
    </div>
  );
}
