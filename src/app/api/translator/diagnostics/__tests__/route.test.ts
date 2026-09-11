import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, upsert, from } = vi.hoisted(() => {
  const requireUser = vi.fn();
  const upsert = vi.fn();
  const from = vi.fn(() => ({ upsert }));
  return { requireUser, upsert, from };
});

vi.mock("@/lib/api/auth", () => ({ requireUser }));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from } }));

import { POST } from "@/app/api/translator/diagnostics/route";

const event = {
  installationId: "installation-123", sessionId: "session-123", turnId: "turn-123",
  timestamp: "2026-09-02T00:00:00.000Z", appVersion: "1", buildVersion: "2",
  gitCommitSha: null, environment: "development", platform: "web",
  browserFamily: "Safari", browserVersion: "18", osFamily: "iOS",
  translatorMode: "auto", sourceLanguage: "sw", targetLanguage: "de",
  transcriptionPath: "realtime", transcriptionModel: "gpt-live-transcribe",
  translationModel: "gpt-5.6-terra", ttsModel: "gpt-4o-mini-tts",
  warmStart: true, realtimeConnectionReused: true, fallbackReason: null,
  recordClickToRecordingStartedMs: 9, stopToTranscriptFinalMs: 874,
  transcriptFinalToTranslationVisibleMs: null, stopToPlaybackStartedMs: null,
  translationServerPreOpenAiMs: 796, translationAuthMs: 524,
  translationOpenAiTotalMs: 2342, ttsServerPreOpenAiMs: null, ttsAuthMs: null,
  ttsOpenAiTimeToFirstByteMs: null, ttsOpenAiTotalMs: null,
  status: "success", failureCategory: null, httpStatus: null, apiErrorCode: null,
  errorStage: null, retryable: false, recoveryAction: "none", recoverySucceeded: null,
  eventOrigin: null, eventKind: null, qaScenarioId: null, diagnosticEvents: [],
  consentAtRecordingStart: null, consentAtTurnFinalization: null,
};

describe("translator diagnostics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    upsert.mockResolvedValue({ error: null });
  });

  it("keeps auth active and stores only a validated batch", async () => {
    const response = await POST(new Request("http://test/api/translator/diagnostics", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ ...event, authorization: "Bearer secret" }] }),
    }));
    expect(response.status).toBe(200);
    expect(requireUser).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("translator_diagnostic_sessions");
    expect(from).toHaveBeenCalledWith("translator_diagnostic_turns");
    const rows = upsert.mock.calls[1][0];
    expect(rows[0].technical_payload).not.toHaveProperty("authorization");
    expect(rows[0]).toMatchObject({ report_revision: "5.2.6", diagnostic_events: [] });
  });

  it("returns the auth failure without touching storage", async () => {
    requireUser.mockResolvedValue({
      user: null,
      response: Response.json({ code: "auth_required" }, { status: 401 }),
    });
    const response = await POST(new Request("http://test/api/translator/diagnostics", {
      method: "POST", body: JSON.stringify({ events: [event] }),
    }));
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
