export type LiveV2LogFamily =
  | "connection"
  | "connection retry"
  | "connection error"
  | "lifecycle"
  | "request error";

const SECRET_PATTERNS = [
  /\b(?:ek|sk)[-_][A-Za-z0-9_-]+\b/g,
  /Bearer\s+[^\s"']+/gi,
];

export function sanitizeLiveV2LogText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  let safe = value.trim().slice(0, 400);
  for (const pattern of SECRET_PATTERNS) safe = safe.replace(pattern, "[REDACTED]");
  return safe;
}

export function liveV2DevelopmentLog(
  family: LiveV2LogFamily,
  details: Record<string, unknown>,
  level: "log" | "error" = "log",
) {
  if (process.env.NODE_ENV !== "development") return;
  const line = `[translator-live-v2][${family}] ${JSON.stringify(details)}`;
  console[level](line);
}

export function safeOpenAIResponseError(body: string) {
  if (!body) {
    return { sanitizedErrorCode: "empty_error_response", sanitizedMessage: "Empty error response" };
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown; type?: unknown; message?: unknown };
    };
    const error = parsed.error;
    return {
      sanitizedErrorCode: sanitizeLiveV2LogText(
        typeof error?.code === "string" ? error.code : error?.type,
        "upstream_error",
      ),
      sanitizedMessage: sanitizeLiveV2LogText(error?.message, "OpenAI request failed"),
    };
  } catch {
    return {
      sanitizedErrorCode: "non_json_error_response",
      sanitizedMessage: "OpenAI request failed",
    };
  }
}

export function getOpenAIRequestId(headers: Headers) {
  const value = headers.get("x-request-id")?.trim();
  return value ? value.slice(0, 256) : null;
}

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}
