import { beginGeneration } from "@/lib/limits";
import { runPipeline } from "@/lib/pipeline";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input = "";
  try {
    const body = (await request.json()) as { input?: string };
    input = (body.input || "").trim();
  } catch {
    input = "";
  }

  if (!input) {
    return Response.json({ error: "Missing app name or URL" }, { status: 400 });
  }

  const guard = await beginGeneration(request, input);
  if (!guard.allowed) {
    return Response.json(
      { error: guard.message || "Generation is not available right now." },
      {
        status: guard.status ?? 429,
        headers: {
          "Cache-Control": "no-store",
          ...(guard.retryAfter
            ? { "Retry-After": String(Math.max(1, Math.ceil(guard.retryAfter))) }
            : {}),
        },
      }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => send({ type: "ping" }), 10_000);

      try {
        await runPipeline({ input, onEvent: send });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Generation failed",
        });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        await guard.release();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
