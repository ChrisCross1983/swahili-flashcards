import { describe, expect, it } from "vitest";
import {
  createTranslatorDiagnosticEvent,
  expectedFallbackKind,
  primaryDiagnosticEvent,
} from "@/lib/translator/diagnosticEvents";

function event(kind: "failure" | "degradation" | "expected_fallback" | "info") {
  return createTranslatorDiagnosticEvent({
    eventOrigin: "organic_runtime", eventKind: kind, category: "REALTIME",
    stage: "transcription", endpoint: null, httpStatus: null, apiCode: kind,
    retryable: true, recoveryAction: "audio_upload_fallback",
    recoverySucceeded: true, qaScenarioId: null, authFailureType: null,
  });
}

describe("translator diagnostic event semantics", () => {
  it("classifies only the ordinary cold start as an expected fallback", () => {
    expect(expectedFallbackKind("realtime_not_ready_at_recording_start"))
      .toBe("expected_fallback");
    expect(expectedFallbackKind("session_error")).toBe("degradation");
    expect(expectedFallbackKind("transcript_timeout")).toBe("degradation");
  });

  it("derives legacy fields from failure before degradation and fallback", () => {
    const fallback = event("expected_fallback");
    const degradation = event("degradation");
    const failure = event("failure");
    expect(primaryDiagnosticEvent([fallback, degradation, failure])).toBe(failure);
  });
});
