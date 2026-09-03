import { describe, expect, it, vi } from "vitest";
import {
  TRANSLATOR_INCIDENT_MAX_SESSIONS,
  TRANSLATOR_INCIDENT_TTL_MS,
  TranslatorIncidentStore,
  type PersistedTranslatorIncident,
} from "@/lib/translator/incidentPersistence";

function memoryStore(now: () => number) {
  const records = new Map<string, PersistedTranslatorIncident>();
  const store = new TranslatorIncidentStore({
    getAll: async () => [...records.values()],
    put: async (value) => { records.set(value.sessionId, value); },
    delete: async (id) => { records.delete(id); },
  }, now);
  return { store, records };
}

describe("TranslatorIncidentStore", () => {
  it("keeps the latest bounded incident sessions and survives a new store instance", async () => {
    let now = Date.parse("2026-09-03T10:00:00.000Z");
    const { store, records } = memoryStore(() => now);
    for (let index = 0; index < TRANSLATOR_INCIDENT_MAX_SESSIONS + 1; index += 1) {
      await store.save({
        sessionId: `session-${index}`,
        reportId: `report-${index}`,
        createdAt: new Date(now).toISOString(),
        turnCount: 1,
        report: { turns: [] },
        audio: [],
      });
      now += 1_000;
    }
    expect(records.size).toBe(TRANSLATOR_INCIDENT_MAX_SESSIONS);
    await expect(store.latest()).resolves.toMatchObject({ sessionId: "session-2" });
  });

  it("expires incidents and removes audio whose per-turn consent is ineligible", async () => {
    let now = 1_000;
    const { store, records } = memoryStore(() => now);
    await store.save({
      sessionId: "incident",
      reportId: "report",
      createdAt: new Date(now).toISOString(),
      turnCount: 2,
      report: { turns: [
        { turnId: "allowed", speechAudioEligibleForTurn: true },
        { turnId: "denied", speechAudioEligibleForTurn: false },
      ] },
      audio: ["allowed", "denied"].map((turnId) => ({
        turnId,
        blob: new Blob([new Uint8Array(64)], { type: "audio/webm" }),
        durationMs: 1_000,
        recognitionReviewStatus: null,
        audioQualityMetrics: {
          source: "unavailable" as const,
          rmsDbfs: null, peakDbfs: null, clippingRatio: null,
          silenceRatio: null, speechActivityRatio: null,
        },
      })),
    });
    await store.purgeIneligibleAudio();
    expect(records.get("incident")?.audio.map((item) => item.turnId)).toEqual(["allowed"]);

    now += TRANSLATOR_INCIDENT_TTL_MS + 1;
    await expect(store.latest()).resolves.toBeNull();
    expect(records.size).toBe(0);
  });

  it("fails independently from translator work", async () => {
    const store = new TranslatorIncidentStore({
      getAll: vi.fn(async () => { throw new Error("storage unavailable"); }),
      put: vi.fn(async () => { throw new Error("storage unavailable"); }),
      delete: vi.fn(),
    });
    await expect(store.latest()).rejects.toThrow("storage unavailable");
  });
});
