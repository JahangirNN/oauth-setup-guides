"use client";

import { useEffect, useRef, useState } from "react";

export function CopyLinkButton() {
  const [label, setLabel] = useState("Copy link");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(window.location.href);
      setLabel("Copied");
    } catch {
      setLabel("Copy failed");
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setLabel("Copy link"), 2000);
  }

  return (
    <button type="button" onClick={handleCopy} className="btn btn-secondary">
      {label === "Copied" ? (
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 text-emerald-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m4 10 4 4 8-8" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      )}
      <span aria-live="polite">{label}</span>
    </button>
  );
}
