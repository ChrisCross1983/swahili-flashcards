import { describe, expect, it, vi } from "vitest";
import {
  RecordingStartDiagnosticsTracker,
  RecordingStartOperationTimeoutError,
  withRecordingStartOperationWatchdog,
} from "@/lib/translator/recordingStartDiagnostics";

const snapshot = {
  recorderStatus: "starting",
  microphoneAcquisitionState: "requesting_permission_or_device",
  hasPendingAcquisition: true,
  recordingStartInFlight: true,
  captureGeneration: null,
};

describe("recording start operation diagnostics", () => {
  it("exports an active pre-turn attempt with phase and age", () => {
    let now = 100;
    const tracker = new RecordingStartDiagnosticsTracker({
      now: () => now,
      isoNow: () => "2026-09-08T04:53:25.782Z",
      id: () => "start-1",
    });
    const id = tracker.begin(snapshot);
    tracker.mark(id, "microphone_acquisition_requested", snapshot);
    now = 13_100;

    expect(tracker.getActiveAttempt()).toMatchObject({
      attemptId: "start-1",
      currentPhase: "microphone_acquisition_requested",
      ageMs: 13_000,
      hasPendingAcquisition: true,
      recordingStartInFlight: true,
    });
  });

  it.each(["raw getUserMedia", "prepareRecording"])(
    "times out a hanging %s promise under the whole-operation watchdog",
    async () => {
      vi.useFakeTimers();
      const onTimeout = vi.fn();
      const result = withRecordingStartOperationWatchdog(
        new Promise<never>(() => undefined),
        { timeoutMs: 50, onTimeout },
      );
      const rejection = expect(result).rejects.toBeInstanceOf(
        RecordingStartOperationTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(50);
      await rejection;
      expect(onTimeout).toHaveBeenCalledOnce();
      vi.useRealTimers();
    },
  );

  it("keeps a timed-out attempt terminal and records a discarded late result", () => {
    let now = 0;
    const tracker = new RecordingStartDiagnosticsTracker({
      now: () => now,
      isoNow: () => `2026-09-08T04:53:${String(now / 1_000).padStart(2, "0")}.000Z`,
      id: () => "start-timeout",
    });
    const id = tracker.begin(snapshot);
    now = 14_000;
    tracker.mark(id, "timeout", snapshot);
    tracker.complete(id, "timeout", { ...snapshot, recordingStartInFlight: false });
    now = 20_000;
    tracker.markLateCompletion(id, snapshot);

    expect(tracker.getActiveAttempt()).toBeNull();
    expect(tracker.getAttempts()[0]).toMatchObject({
      outcome: "timeout",
      durationMs: 14_000,
    });
    expect(tracker.getAttempts()[0].timeline.at(-1)?.phase).toBe(
      "stale_start_result_discarded",
    );
  });
});
