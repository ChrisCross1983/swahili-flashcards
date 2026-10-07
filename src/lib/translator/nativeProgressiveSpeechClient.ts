import type { TranslationLanguage } from "@/lib/translator/types";

export class NativeProgressiveSpeechError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "NativeProgressiveSpeechError";
  }
}

export async function requestNativeProgressiveSpeech(
  text: string,
  language: TranslationLanguage,
  speed: number,
  signal: AbortSignal,
  fetcher?: typeof fetch,
) {
  const requestFetch = fetcher ?? (typeof window !== "undefined"
    ? window.fetch.bind(window) : globalThis.fetch.bind(globalThis));
  let response: Response;
  try {
    response = await requestFetch("/api/translator/speech/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, speed }),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new NativeProgressiveSpeechError("media_ticket_network_error");
  }
  if (!response.ok) throw new NativeProgressiveSpeechError(`media_ticket_http_${response.status}`);
  const body: unknown = await response.json().catch(() => null);
  const mediaUrl = body && typeof body === "object" && "mediaUrl" in body
    ? body.mediaUrl : null;
  if (typeof mediaUrl !== "string" ||
      !/^\/api\/translator\/speech\/native\/[A-Za-z0-9_-]{24}\.mp3$/.test(mediaUrl)) {
    throw new NativeProgressiveSpeechError("media_ticket_invalid_response");
  }
  return mediaUrl;
}

export async function readFirstNativeServerAudioChunkAt(
  mediaUrl: string,
  fetcher?: typeof fetch,
): Promise<string | null> {
  const requestFetch = fetcher ?? (typeof window !== "undefined"
    ? window.fetch.bind(window) : globalThis.fetch.bind(globalThis));
  try {
    const response = await requestFetch(mediaUrl, {
      method: "HEAD", credentials: "same-origin", cache: "no-store",
    });
    const at = response.headers.get("X-Progressive-First-Server-Audio-Chunk-At");
    return response.ok && at && Number.isFinite(Date.parse(at)) ? at : null;
  } catch {
    return null;
  }
}

/** Response end is on the browser clock: it proves full MP3 delivery, not server generation end. */
export function readNativeMediaResponseEnd(mediaUrl: string, after: number): number | null {
  if (typeof location === "undefined" || typeof performance === "undefined") return null;
  try {
    const absolute = new URL(mediaUrl, location.origin).href;
    const entries = performance.getEntriesByName(absolute, "resource") as PerformanceResourceTiming[];
    const entry = entries.filter((candidate) =>
      candidate.startTime >= after - 50 && candidate.responseEnd > 0,
    ).at(-1);
    return entry && Number.isFinite(entry.responseEnd) ? entry.responseEnd : null;
  } catch {
    return null;
  }
}

export function nativeMediaCurrentSrcForDiagnostics(value: string): string | null {
  if (!value || typeof location === "undefined") return null;
  try {
    const url = new URL(value, location.origin);
    if (!/^\/api\/translator\/speech\/native\/[A-Za-z0-9_-]{24}\.mp3$/.test(url.pathname)) {
      return `${url.origin}/<non-media-path>`;
    }
    return `${url.origin}/api/translator/speech/native/<media-id>.mp3`;
  } catch {
    return null;
  }
}

export function nativeMediaErrorMessageForDiagnostics(value: string): string | null {
  if (!value) return null;
  return value
    .replace(/https?:\/\/\S+/gi, "[media URL]")
    .replace(/[A-Za-z0-9_-]{24}\.mp3/g, "<media-id>.mp3")
    .slice(0, 200);
}

export function readNativeMediaResourceDiagnostics(mediaUrl: string, after: number) {
  if (typeof location === "undefined" || typeof performance === "undefined") return null;
  try {
    const absolute = new URL(mediaUrl, location.origin).href;
    const entries = performance.getEntriesByName(absolute, "resource") as PerformanceResourceTiming[];
    const entry = entries.filter((candidate) => candidate.startTime >= after - 50).at(-1);
    if (!entry) return { progressiveTtsMediaResourceObserved: false };
    const status = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
    const finite = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    return {
      progressiveTtsMediaResourceObserved: true,
      progressiveTtsMediaResourceResponseStatus:
        typeof status === "number" && status >= 100 && status <= 599 ? status : null,
      progressiveTtsMediaResourceRequestStartMs: finite(entry.requestStart),
      progressiveTtsMediaResourceResponseStartMs: finite(entry.responseStart),
      progressiveTtsMediaResourceResponseEndMs: finite(entry.responseEnd),
      progressiveTtsMediaResourceTransferSizeBytes:
        typeof entry.transferSize === "number" && Number.isFinite(entry.transferSize)
          ? Math.max(0, entry.transferSize) : null,
    };
  } catch {
    return null;
  }
}
