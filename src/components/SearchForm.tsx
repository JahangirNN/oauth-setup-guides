"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const EXAMPLES = ["linear.app", "github.com", "notion.so"];

export function SearchForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function openGenerator(app: string) {
    const query = app.trim();
    if (!query) return;
    router.push(`/new?app=${encodeURIComponent(query)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openGenerator(value);
  }

  return (
    <form action="/new" method="get" onSubmit={handleSubmit} className="max-w-[660px]">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-1.5 shadow-sm transition-shadow focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/10 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <label htmlFor="app-search" className="sr-only">
            App name or URL
          </label>
          <input
            id="app-search"
            name="app"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="App name or URL, e.g. linear.app"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-muted/80 focus-visible:outline-none"
          />
        </div>
        <button type="submit" disabled={!value.trim()} className="btn btn-primary h-10 px-4">
          Generate guide
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setValue(example);
              openGenerator(example);
            }}
            className="rounded-full border border-line bg-white px-2.5 py-0.5 font-mono text-[11px] transition-colors hover:border-accent/40 hover:text-accent"
          >
            {example}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        We read public documentation and quote every claim. A run usually takes 30–90 seconds.
      </p>
    </form>
  );
}
