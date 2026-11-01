import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { illustrationInput, illustrationPrompt } from "@/lib/cards/illustration";

export const runtime = "nodejs";
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 3;
const usage = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  let body: unknown;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 2048) throw new Error("large");
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "invalid_input", error: "Ungültige Kartendaten." }, { status: 400 });
  }
  const input = illustrationInput(body);
  if (!input || (body && typeof body === "object" && "prompt" in body)) {
    return NextResponse.json({ code: "unsuitable", error: "Für diesen Begriff ist keine klare Illustration möglich." }, { status: 400 });
  }
  const key = user.id;
  const now = Date.now();
  const bucket = usage.get(key);
  const current = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + WINDOW_MS };
  if (current.count >= LIMIT) {
    return NextResponse.json({ code: "rate_limited", error: "Bitte versuche es später erneut." }, { status: 429 });
  }
  current.count += 1;
  usage.set(key, current);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ code: "unavailable", error: "Illustration gerade nicht verfügbar." }, { status: 503 });
  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2.5-flare", n: 1, size: "1024x1024", quality: "low", output_format: "webp",
        safety_identifier: createHash("sha256").update(user.id).digest("hex"),
        prompt: illustrationPrompt(input),
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!upstream.ok) throw new Error("provider");
    const result = await upstream.json() as { data?: Array<{ b64_json?: unknown }> };
    const base64 = result.data?.[0]?.b64_json;
    if (typeof base64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length > 12_000_000) throw new Error("invalid_image");
    return NextResponse.json({ preview: `data:image/webp;base64,${base64}` }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "generation_failed", error: "Die Illustration konnte nicht erstellt werden. Bitte versuche es erneut." }, { status: 502 });
  }
}
