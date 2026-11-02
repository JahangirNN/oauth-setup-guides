"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { GuideHeader, RunEvent, SourceTier } from "@/lib/types";
import { GenerateIntro } from "@/components/GenerateIntro";
import { RunPanel } from "@/components/RunPanel";
import { hostname } from "@/components/labels";
import { createStages, type SourceView, type StageView } from "@/components/run-types";

type RunStatus = "idle" | "running" | "done" | "error";
type Terminal = "done" | "error";

interface RunState {
  stages: StageView[];
  sources: SourceView[];
  meta: { header: GuideHeader; slug: string } | null;
}

function createRun(): RunState {
  return { stages: createStages(), sources: [], meta: null };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSourceTier(value: number | undefined): value is SourceTier {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isGuideHeader(value: unknown): value is GuideHeader {
  if (!value || typeof value !== "object") return false;
  const header = value as Record<string, unknown>;
  const difficulty = header.difficulty as Record<string, unknown> | null | undefined;
  const finish = header.canIndividualFinish;

  return (
    typeof header.appName === "string" &&
    typeof header.domain === "string" &&
    typeof header.canIndividualFinish === "string" &&
    (finish === "yes" ||
      finish === "yes_paid" ||
      finish === "build_only" ||
      finish === "no" ||
      finish === "uncertain") &&
    typeof difficulty === "object" &&
    difficulty !== null &&
    typeof difficulty.overall === "number"
  );
}

function parseRunEvent(line: string): RunEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const value: unknown = JSON.parse(trimmed);
    if (!value || typeof value !== "object") return null;
    const type = (value as { type?: unknown }).type;
    if (typeof type !== "string") return null;
    if (
      !["stage", "source", "delta", "meta", "done", "error", "ping"].includes(type)
    ) {
      return null;
    }
    return value as RunEvent;
  } catch {
    return null;
  }
}

function updateStage(
  stages: StageView[],
  update: {
    id: string;
    status: StageView["status"];
    label?: string;
    current?: number;
    total?: number;
  }
): StageView[] {
  let found = false;

  const next = stages.map((stage) => {
    if (stage.id !== update.id) return stage;
    found = true;
    return {
      ...stage,
      status: update.status,
      label: update.label || stage.label,
      current: update.current ?? stage.current,
      total: update.total ?? stage.total,
    };
  });

  if (found) return next;

  return [
    ...next,
    {
      id: update.id,
      label: update.label || update.id,
      status: update.status,
      current: update.current,
      total: update.total,
    },
  ];
}

function addSource(sources: SourceView[], source: SourceView): SourceView[] {
  if (sources.some((existing) => existing.url === source.url)) return sources;
  return [...sources, source];
}

export function GenerateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appParam = (searchParams.get("app") ?? "").trim();

  const routerRef = useRef(router);
  const abortRef = useRef<AbortController | null>(null);
  const lastActivityRef = useRef(0);
  const accessCodeRef = useRef("");

  const [input, setInput] = useState(appParam);
  const [activeInput, setActiveInput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [run, setRun] = useState<RunState>(createRun);
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (cancelled || !payload || typeof payload !== "object") return;
        const generation = (payload as { generation?: { accessCodeRequired?: unknown } }).generation;
        if (generation?.accessCodeRequired === true) setAccessCodeRequired(true);
        const saved = window.sessionStorage.getItem("oauth-demo-code") ?? "";
        if (saved) {
          setAccessCode(saved);
          accessCodeRef.current = saved;
        }
      })
      .catch(() => {
        // The generator still works if health is unavailable; the API will
        // report an access-code error if one is actually required.
      });
    return () => {
      cancelled = true;
    };
  }, []);



  function handleAccessCodeChange(value: string) {
    setAccessCode(value);
    accessCodeRef.current = value;
    if (value) window.sessionStorage.setItem("oauth-demo-code", value);
    else window.sessionStorage.removeItem("oauth-demo-code");
  }

  const startRun = useCallback(async (rawInput: string) => {
    const query = rawInput.trim();
    if (!query) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const started = Date.now();
    lastActivityRef.current = started;
    setInput(query);
    setActiveInput(query);
    setStartedAt(started);
    setNow(started);
    setStatus("running");
    setError(null);
    setPublishedSlug(null);
    setRun(createRun());

    const markActiveFailed = () => {
      setRun((previous) => ({
        ...previous,
        stages: previous.stages.map((stage) =>
          stage.status === "start" || stage.status === "progress"
            ? { ...stage, status: "failed" as const }
            : stage
        ),
      }));
    };

    const processLine = (line: string): Terminal | null => {
      const event = parseRunEvent(line);
      if (!event || event.type === "ping") return null;

      lastActivityRef.current = Date.now();

      switch (event.type) {
        case "stage": {
          const id = asString(event.id);
          const stageStatus = asString(event.status);
          if (
            !id ||
            (stageStatus !== "start" && stageStatus !== "progress" && stageStatus !== "done")
          ) {
            return null;
          }
          const label = asString(event.label);
          const current = asNumber(event.current);
          const total = asNumber(event.total);
          setRun((previous) => ({
            ...previous,
            stages: updateStage(previous.stages, {
              id,
              status: stageStatus,
              label,
              current,
              total,
            }),
          }));
          return null;
        }

        case "source": {
          const url = asString(event.url);
          if (!url) return null;
          const title = asString(event.title) ?? hostname(url);
          const ok = asString(event.status) !== "failed";
          const tier = asNumber(event.tier);
          const source: SourceView = {
            url,
            title,
            status: ok ? "ok" : "failed",
          };
          if (ok && isSourceTier(tier)) source.tier = tier;
          setRun((previous) => ({
            ...previous,
            sources: addSource(previous.sources, source),
          }));
          return null;
        }

        case "meta": {
          const slug = asString(event.slug);
          const header = event.header;
          if (!slug || !isGuideHeader(header)) return null;
          setRun((previous) => ({ ...previous, meta: { header, slug } }));
          return null;
        }

        case "done": {
          const slug = asString(event.slug);
          if (!slug) {
            markActiveFailed();
            setError("The run finished without a share link.");
            setStatus("error");
            return "error";
          }
          setStatus("done");
          setPublishedSlug(slug);
          routerRef.current.push(`/g/${slug}`);
          return "done";
        }

        case "error": {
          markActiveFailed();
          setError(
            asString(event.message) ?? "The generator reported an error before publishing a guide."
          );
          setStatus("error");
          return "error";
        }

        default:
          return null;
      }
    };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const code = accessCodeRef.current.trim();
      if (code) headers["x-demo-code"] = code;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: query }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = `The generator returned HTTP ${response.status}.`;
        try {
          const payload: unknown = await response.json();
          const apiError =
            payload && typeof payload === "object"
              ? (payload as { error?: unknown }).error
              : undefined;
          if (typeof apiError === "string" && apiError.trim()) message = apiError;
        } catch {
          // The error response was not JSON; keep the status message.
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("The generator returned an empty response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal: Terminal | null = null;

      const drain = (): Terminal | null => {
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const result = processLine(line);
          if (result) return result;
          newline = buffer.indexOf("\n");
        }
        return null;
      };

      while (terminal === null) {
        const chunk = await reader.read();
        if (chunk.done) {
          buffer += decoder.decode();
          if (buffer.trim()) terminal = processLine(buffer);
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        terminal = drain();
      }

      if (terminal) {
        await reader.cancel().catch(() => undefined);
        return;
      }

      if (!controller.signal.aborted) {
        markActiveFailed();
        setError(
          "The run ended before a guide was published. Try again, or check the server logs."
        );
        setStatus("error");
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      markActiveFailed();
      const message =
        cause instanceof TypeError
          ? "Could not reach the generator. Check your connection and try again."
          : cause instanceof Error
            ? cause.message
            : "Could not reach the generator.";
      if (/access code/i.test(message)) setAccessCodeRequired(true);
      setError(message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!appParam) return;
    void startRun(appParam);
    return () => {
      abortRef.current?.abort();
      setStatus("idle");
      setError(null);
    };
  }, [appParam, startRun]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const activeStage =
    run.stages.find((stage) => stage.status === "progress") ??
    run.stages.find((stage) => stage.status === "start");
  const activeLabel = activeStage?.label || "Starting the agent…";
  const elapsedSeconds =
    startedAt > 0 ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const stalled =
    status === "running" && startedAt > 0 && now - lastActivityRef.current >= 20_000;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "running" || status === "done") return;
    void startRun(input);
  }

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5"
      >
        <label htmlFor="generate-app" className="text-xs font-medium text-ink">
          App name or URL
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="generate-app"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="App name or URL, e.g. linear.app"
            autoComplete="off"
            spellCheck={false}
            disabled={status === "running" || status === "done"}
            className="h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3.5 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:bg-subtle disabled:text-muted"
          />
          <button
            type="submit"
            disabled={status === "running" || status === "done" || !input.trim()}
            className="btn btn-primary h-11 w-full shrink-0 px-5 sm:w-auto"
          >
            {status === "running" ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="3"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                Generating…
              </>
            ) : (
              <>
                Generate guide
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>
        {accessCodeRequired ? (
          <div className="mt-3 rounded-lg border border-line bg-subtle/50 p-3">
            <label htmlFor="demo-access-code" className="text-xs font-medium text-ink">
              Demo access code
            </label>
            <input
              id="demo-access-code"
              type="password"
              value={accessCode}
              onChange={(event) => handleAccessCodeChange(event.target.value)}
              placeholder="Provided with the demo link"
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              This demo limits generation to prevent abuse. The code is stored only in this
              browser tab.
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Public documentation only. Nothing is installed or executed against the provider.
        </p>
      </form>

      {status === "idle" ? (
        <GenerateIntro />
      ) : (
        <RunPanel
          status={status}
          input={activeInput}
          error={error}
          elapsedSeconds={elapsedSeconds}
          stalled={stalled}
          stages={run.stages}
          sources={run.sources}
          meta={run.meta}
          publishedSlug={publishedSlug}
          activeLabel={activeLabel}
          onRetry={() => {
            void startRun(input);
          }}
        />
      )}
    </div>
  );
}
