import { generationLimitSummary } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    model: process.env.IFM_API_KEY ? "configured" : "missing",
    storage:
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? "redis"
        : "filesystem",
    generation: generationLimitSummary(),
    timestamp: new Date().toISOString(),
  });
}
