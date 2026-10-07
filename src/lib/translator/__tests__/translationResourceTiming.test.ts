import { describe, expect, it } from "vitest";
import { readTranslationResourceTiming } from "@/lib/translator/translationResourceTiming";

const url = "https://example.test/api/translator/translate";

describe("translation Resource Timing", () => {
  it("reads only matching same-origin request timing and numeric sizes", () => {
    const timing = {
      getEntriesByName: (name: string) => name === url ? [{
        startTime: 101,
        requestStart: 120,
        responseStart: 240,
        responseEnd: 270,
        transferSize: 2048,
        encodedBodySize: 1024,
        decodedBodySize: 1024,
        nextHopProtocol: "h2",
      }] : [],
    } as unknown as Pick<Performance, "getEntriesByName">;
    expect(readTranslationResourceTiming(100, timing, "https://example.test")).toEqual({
      translationResourceStartTimeMs: 101,
      translationResourceRequestStartMs: 120,
      translationResourceResponseStartMs: 240,
      translationResourceResponseEndMs: 270,
      translationResourceTransferSizeBytes: 2048,
      translationResourceEncodedBodySizeBytes: 1024,
      translationResourceDecodedBodySizeBytes: 1024,
      translationResourceNextHopProtocol: "h2",
    });
  });

  it("uses null for Safari-unavailable fields and ignores old or missing entries", () => {
    const timing = { getEntriesByName: () => [{ startTime: 100 }] } as unknown as Pick<Performance, "getEntriesByName">;
    expect(readTranslationResourceTiming(100, timing, "https://example.test")).toMatchObject({
      translationResourceRequestStartMs: null,
      translationResourceResponseStartMs: null,
      translationResourceResponseEndMs: null,
      translationResourceTransferSizeBytes: null,
      translationResourceEncodedBodySizeBytes: null,
      translationResourceDecodedBodySizeBytes: null,
      translationResourceNextHopProtocol: null,
    });
    expect(readTranslationResourceTiming(200, timing, "https://example.test")).toEqual({});
    expect(readTranslationResourceTiming(100, timing, undefined)).toEqual({});
  });
});
