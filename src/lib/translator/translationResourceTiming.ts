import type { TranslationDiagnostics } from "@/lib/translator/types";

const TRANSLATION_PATH = "/api/translator/translate";

function nonNegative(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function positive(value: number | undefined): number | null {
  const number = nonNegative(value);
  return number !== null && number > 0 ? number : null;
}

/** Browser-only, same-origin timing. Never stores URL, query, headers or audio. */
export function readTranslationResourceTiming(
  fetchInvokedAt: number,
  timing: Pick<Performance, "getEntriesByName"> = performance,
  origin: string | undefined = typeof location === "undefined" ? undefined : location.origin,
): Partial<TranslationDiagnostics> {
  if (!origin || !Number.isFinite(fetchInvokedAt)) return {};
  try {
    const name = new URL(TRANSLATION_PATH, origin).href;
    const entries = timing.getEntriesByName(name, "resource") as PerformanceResourceTiming[];
    const matched = entries
      .filter((entry) => entry.startTime >= fetchInvokedAt - 50)
      .sort((a, b) => Math.abs(a.startTime - fetchInvokedAt) - Math.abs(b.startTime - fetchInvokedAt))[0];
    if (!matched || Math.abs(matched.startTime - fetchInvokedAt) > 50) return {};
    return {
      translationResourceStartTimeMs: nonNegative(matched.startTime),
      translationResourceRequestStartMs: positive(matched.requestStart),
      translationResourceResponseStartMs: positive(matched.responseStart),
      translationResourceResponseEndMs: positive(matched.responseEnd),
      translationResourceTransferSizeBytes: nonNegative(matched.transferSize),
      translationResourceEncodedBodySizeBytes: nonNegative(matched.encodedBodySize),
      translationResourceDecodedBodySizeBytes: nonNegative(matched.decodedBodySize),
      translationResourceNextHopProtocol: matched.nextHopProtocol || null,
    };
  } catch {
    return {};
  }
}
