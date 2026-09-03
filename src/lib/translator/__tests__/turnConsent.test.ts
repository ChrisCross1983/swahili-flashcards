import { describe, expect, it } from "vitest";
import {
  prepareTranslatorConsentSettingChange,
  speechAudioEligibleForTurn,
  type TranslatorConsentEvent,
  type TranslatorConsentSnapshot,
} from "@/lib/translator/turnConsent";
import type { TranslatorDiagnosticsSettings } from "@/lib/translator/diagnosticsSettings";

function snapshot(speechSampleSharingEnabled: boolean): TranslatorConsentSnapshot {
  return {
    diagnosticsSharingEnabled: true,
    qualityContentSharingEnabled: false,
    speechSampleSharingEnabled,
    internalSpeechDiagnosticsEnabled: true,
  };
}

describe("per-turn translator consent", () => {
  it("never grants audio eligibility retroactively", () => {
    const turnOne = {
      consentAtRecordingStart: snapshot(false),
      consentAtTurnFinalization: snapshot(false),
    };
    const turnTwo = {
      consentAtRecordingStart: snapshot(true),
      consentAtTurnFinalization: snapshot(true),
    };
    expect(speechAudioEligibleForTurn(turnOne)).toBe(false);
    expect(speechAudioEligibleForTurn(turnTwo)).toBe(true);
  });

  it("rejects audio when sharing is switched off during the turn", () => {
    expect(speechAudioEligibleForTurn({
      consentAtRecordingStart: snapshot(true),
      consentAtTurnFinalization: snapshot(false),
    })).toBe(false);
  });

  it("requires finalization before audio can become eligible", () => {
    expect(speechAudioEligibleForTurn({
      consentAtRecordingStart: snapshot(true),
      consentAtTurnFinalization: null,
    })).toBe(false);
  });

  it("records exactly one event per real speech-sharing change", () => {
    let settings: TranslatorDiagnosticsSettings = {
      diagnosticsSharingEnabled: false,
      qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: true,
      internalQaModeEnabled: false,
    };
    const events: TranslatorConsentEvent[] = [];
    const update = (value: boolean, at: string) => {
      const change = prepareTranslatorConsentSettingChange(
        settings,
        "speechSampleSharingEnabled",
        value,
        at,
      );
      if (!change) return;
      settings = change.settings;
      events.push(change.event);
    };

    update(false, "2026-09-03T08:00:00.000Z");
    update(true, "2026-09-03T08:01:00.000Z");
    update(false, "2026-09-03T08:02:00.000Z");
    expect(events).toEqual([
      expect.objectContaining({ previousValue: true, newValue: false }),
      expect.objectContaining({ previousValue: false, newValue: true }),
      expect.objectContaining({ previousValue: true, newValue: false }),
    ]);
    expect(events).toHaveLength(3);

    // A repeated handler invocation or Strict-Mode re-render sees the updated
    // ref value and is a no-op instead of emitting a duplicate.
    update(false, "2026-09-03T08:02:00.000Z");
    expect(events).toHaveLength(3);
  });
});
