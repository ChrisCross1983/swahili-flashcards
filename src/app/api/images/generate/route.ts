import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { illustrationInput, illustrationPrompt } from "@/lib/cards/illustration";

export const runtime = "nodejs";
export const maxDuration = 120;
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 12; // One hour allows several previews across multiple cards.
const MAX_IMAGE_BYTES = 9_000_000;
const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";
const IMAGE_SIZE = "896x896";
const IMAGE_QUALITY = "low";
const IMAGE_OUTPUT_FORMAT = "webp";
const IMAGE_OUTPUT_COMPRESSION = 80;
const usage = new Map<string, { count: number; resetAt: number }>();
const inFlightUsers = new Set<string>();

type ImageErrorCode = "image_model_unavailable" | "image_generation_local_rate_limited" | "image_generation_upstream_rate_limited" | "image_generation_invalid_request" | "image_generation_in_progress" | "image_generation_failed";
const failure = (code: ImageErrorCode, status: number, retryAfterSeconds?: number) =>
  NextResponse.json(
    { error: code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) } },
  );

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 86_400) : undefined;
}

function providerFailure(status: number, code: unknown, type: unknown): { code: ImageErrorCode; status: number } {
  const detail = `${String(code ?? "")} ${String(type ?? "")}`.toLowerCase();
  if (status === 429) {
    if (/credit_balance_exhausted|spend_limit_exceeded|usage_limit_exceeded|insufficient_quota|billing_hard_limit/.test(detail)) return { code: "image_generation_failed", status: 503 };
    return { code: "image_generation_upstream_rate_limited", status: 429 };
  }
  if (status === 404 || /model_not_found|model.*unavailable|invalid_model|organization_verification_required/.test(detail)) return { code: "image_model_unavailable", status: 503 };
  if (status === 401 || status === 402 || status === 403) return { code: "image_generation_failed", status: 503 };
  if (status === 400 || status === 422) return { code: "image_generation_invalid_request", status: 502 };
  return { code: "image_generation_failed", status: status === 408 || status === 504 ? 504 : 502 };
}

function validWebp(base64: unknown): base64 is string {
  if (typeof base64 !== "string" || !base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return false;
  const bytes = Buffer.from(base64, "base64");
  return bytes.length >= 20 && bytes.length <= MAX_IMAGE_BYTES && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) && bytes.readUInt32LE(4) === bytes.length - 8;
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  let body: unknown;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 2048) throw new Error("large");
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const input = illustrationInput(body);
  if (!input || (body && typeof body === "object" && "prompt" in body)) {
    return NextResponse.json({ error: "unsuitable" }, { status: 400 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("image_generation_config_missing", { env: "OPENAI_API_KEY" });
    return failure("image_generation_failed", 503);
  }
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const key = user.id;
  if (inFlightUsers.has(key)) return failure("image_generation_in_progress", 409);
  const now = Date.now();
  const bucket = usage.get(key);
  const current = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + WINDOW_MS };
  if (current.count >= LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    console.info("image_generation_local_rate_limited", { limit: LIMIT, windowMs: WINDOW_MS });
    return failure("image_generation_local_rate_limited", 429, retryAfterSeconds);
  }
  current.count += 1;
  usage.set(key, current);
  inFlightUsers.add(key);

  const startedAt = performance.now();
  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, n: 1, size: IMAGE_SIZE, quality: IMAGE_QUALITY, output_format: IMAGE_OUTPUT_FORMAT, output_compression: IMAGE_OUTPUT_COMPRESSION,
        safety_identifier: createHash("sha256").update(user.id).digest("hex"),
        prompt: illustrationPrompt(input),
      }),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });
    if (!upstream.ok) {
      const payload = await upstream.json().catch(() => null) as { error?: { code?: unknown; type?: unknown; param?: unknown } } | null;
      const providerError = payload?.error;
      const mapped = providerFailure(upstream.status, providerError?.code, providerError?.type);
      // Never log the provider message: it may contain user text. The request ID permits upstream tracing.
      console.error("image_generation_upstream_failed", {
        status: upstream.status, code: providerError?.code ?? null, type: providerError?.type ?? null,
        param: providerError?.param ?? null, requestId: upstream.headers.get("x-request-id"), model,
      });
      const retryAfterSeconds = mapped.code === "image_generation_upstream_rate_limited"
        ? parseRetryAfter(upstream.headers.get("retry-after")) ?? 30
        : undefined;
      return failure(mapped.code, mapped.status, retryAfterSeconds);
    }
    const result = await upstream.json().catch(() => null) as { data?: Array<{ b64_json?: unknown }> } | null;
    const base64 = result?.data?.[0]?.b64_json;
    if (!validWebp(base64)) {
      console.error("image_generation_invalid_response", { requestId: upstream.headers.get("x-request-id"), model });
      return failure("image_generation_failed", 502);
    }
    console.info("image_generation_completed", { model, size: IMAGE_SIZE, quality: IMAGE_QUALITY, durationMs: Math.round(performance.now() - startedAt) });
    return NextResponse.json({ preview: `data:image/webp;base64,${base64}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("image_generation_transport_failed", { kind: timedOut ? "timeout" : "network", model });
    return failure("image_generation_failed", timedOut ? 504 : 502);
  } finally {
    inFlightUsers.delete(key);
  }
}
