import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GenerateClient } from "@/components/GenerateClient";

export const metadata: Metadata = {
  title: "Generate a guide",
  description:
    "Generate an evidence-backed OAuth app setup guide for any provider, live from its public documentation.",
};

function GeneratorFallback() {
  return (
    <div className="rounded-xl border border-line bg-subtle/50 p-5 text-sm text-muted">
      Loading the generator…
    </div>
  );
}

export default function NewGuidePage() {
  return (
    <main className="mx-auto max-w-[820px] px-6 pb-24 pt-12 sm:pt-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
          ← All guides
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Live generation · 30–90s
        </span>
      </div>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Generate a setup guide
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
        Name an app or paste a URL. The agent will find the provider’s OAuth docs, extract claims
        with quotes, and show you where the evidence stops.
      </p>

      <div className="mt-8">
        <Suspense fallback={<GeneratorFallback />}>
          <GenerateClient />
        </Suspense>
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted">
        A run reads public documentation only. It does not create an account, click through a
        console, or test the provider’s flow — so anything beyond what the docs state stays marked
        as unknown.
      </p>
    </main>
  );
}
