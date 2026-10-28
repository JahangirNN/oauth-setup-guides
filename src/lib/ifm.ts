const BASE = process.env.IFM_BASE_URL || "https://api.ifm.ai/v1";
const MODEL = process.env.IFM_MODEL || "IFM/K2-Horizon-375B-A23B";

export interface IFMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
}

export interface ChatOptions {
  system?: string;
  user: string;
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  stream?: false;
}

export interface ChatResult<T> {
  data: T;
  usage: IFMUsage;
  latencyMs: number;
  finishReason: string;
}

function apiKey(): string {
  const key = process.env.IFM_API_KEY;
  if (!key) throw new Error("IFM_API_KEY is not set");
  return key;
}

async function rawCall(opts: ChatOptions & { maxTokens: number }): Promise<{
  content: string;
  finishReason: string;
  usage: IFMUsage;
  latencyMs: number;
}> {
  const started = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens,
    chat_template_kwargs: { reasoning_effort: opts.effort ?? "high" },
  };

  if (opts.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName ?? "result",
        strict: true,
        schema: opts.schema,
      },
    };
  }

  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });

    if (res.status === 429 && attempt === 1) {
      const retryAfter = Number(res.headers.get("retry-after") || "5");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
      continue;
    }

    const json = (await res.json().catch(() => null)) as
      | {
          choices?: Array<{
            message?: { content?: string };
            finish_reason?: string;
          }>;
          usage?: IFMUsage;
          error?: unknown;
        }
      | null;

    if (!res.ok) {
      throw new Error(`IFM ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 300)}`);
    }

    const choice = json?.choices?.[0];
    const content = choice?.message?.content ?? "";
    const finishReason = choice?.finish_reason ?? "unknown";

    // Reasoning models can spend the whole budget thinking. Retry once with more room.
    if (finishReason === "length" && attempt === 1) {
      body.max_tokens = Math.min(opts.maxTokens * 2, 32_000);
      continue;
    }

    if (finishReason === "length") {
      throw new Error("IFM response hit the token limit (finish=length)");
    }

    return {
      content,
      finishReason,
      usage: json?.usage ?? {},
      latencyMs: Date.now() - started,
    };
  }

  throw new Error("IFM call exhausted retries");
}

/** JSON-schema-constrained call. */
export async function chatJSON<T>(opts: ChatOptions): Promise<ChatResult<T>> {
  const result = await rawCall({ ...opts, maxTokens: opts.maxTokens ?? 8000 });
  const cleaned = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let data: T;
  try {
    data = JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`IFM returned invalid JSON (finish=${result.finishReason}): ${cleaned.slice(0, 200)}`);
  }
  return { data, usage: result.usage, latencyMs: result.latencyMs, finishReason: result.finishReason };
}

/** Plain-text call, used only for the final Markdown when a schema is unnecessary. */
export async function chatText(opts: ChatOptions): Promise<ChatResult<string>> {
  const result = await rawCall({ ...opts, maxTokens: opts.maxTokens ?? 8000 });
  return {
    data: result.content.trim(),
    usage: result.usage,
    latencyMs: result.latencyMs,
    finishReason: result.finishReason,
  };
}

export const IFM_MODEL = MODEL;
