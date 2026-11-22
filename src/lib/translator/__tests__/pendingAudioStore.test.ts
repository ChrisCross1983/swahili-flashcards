import { describe, expect, it } from "vitest";
import {
  isPendingTranslatorAudioStale,
  PendingTranslatorAudioStore,
  type PendingTranslatorAudio,
} from "@/lib/translator/pendingAudioStore";

function recording(overrides: Partial<PendingTranslatorAudio> = {}): PendingTranslatorAudio {
  return {
    turnId: "turn-1",
    correlationId: "translation-turn-1",
    blob: new Blob(["audio"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    durationMs: 120_000,
    size: 3_080_000,
    mode: "auto",
    direction: { sourceLanguage: "auto", targetLanguage: "auto" },
    status: "pending",
    retryAttempt: 0,
    lastErrorCode: null,
    ...overrides,
  };
}

describe("PendingTranslatorAudioStore", () => {
  it("keeps the original blob and correlation id until explicit removal", async () => {
    const values = new Map<string, PendingTranslatorAudio>();
    const store = new PendingTranslatorAudioStore({
      getAll: async () => [...values.values()],
      put: async (value) => void values.set(value.turnId, value),
      delete: async (turnId) => void values.delete(turnId),
    }, () => Date.parse("2026-11-22T00:01:00.000Z"));
    const source = recording();
    await store.save(source);
    const failed = await store.update(source.turnId, {
      status: "failed", retryAttempt: 1, lastErrorCode: "translation_network_error",
    });

    expect(failed?.blob).toBe(source.blob);
    expect(failed?.correlationId).toBe(source.correlationId);
    expect(failed?.status).toBe("failed");
    expect((await store.list())[0]?.blob).toBe(source.blob);

    await store.remove(source.turnId);
    expect(await store.list()).toEqual([]);
  });

  it("supports multiple recordings and marks old pending audio without silently deleting it", async () => {
    const values = new Map<string, PendingTranslatorAudio>();
    const store = new PendingTranslatorAudioStore({
      getAll: async () => [...values.values()],
      put: async (value) => void values.set(value.turnId, value),
      delete: async (turnId) => void values.delete(turnId),
    });
    await store.save(recording({ turnId: "older", createdAt: "2026-11-01T00:00:00.000Z" }));
    await store.save(recording({ turnId: "newer", createdAt: "2026-11-22T00:00:00.000Z" }));

    expect((await store.list()).map((item) => item.turnId)).toEqual(["newer", "older"]);
    expect(isPendingTranslatorAudioStale(recording({ createdAt: "2026-11-01T00:00:00.000Z" }), Date.parse("2026-11-22T00:00:00.000Z"))).toBe(true);
    expect(values.has("older")).toBe(true);
  });
});
