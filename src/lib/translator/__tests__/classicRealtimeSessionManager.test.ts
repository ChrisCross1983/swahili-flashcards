import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLASSIC_REALTIME_IDLE_TTL_MS,
  ClassicRealtimeSessionManager,
} from "@/lib/translator/classicRealtimeSessionManager";
import type { RealtimeTranscriptionDiagnosticEvent } from "@/lib/translator/live/v2/realtimeTranscriptionClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Handlers = {
  onDelta: (delta: string) => void;
  onError: () => void;
  onDiagnosticEvent?: (event: RealtimeTranscriptionDiagnosticEvent) => void;
};

function createHarness(options: {
  finalizationFailureThreshold?: number;
  circuitBreakerTurns?: number;
} = {}) {
  let monotonic = 0;
  let wall = Date.parse("2026-08-31T06:00:00.000Z");
  let id = 0;
  const releaseMicrophone = vi.fn();
  const transports: Array<{
    handlers: Handlers;
    connection: ReturnType<typeof deferred<void>>;
    transcript: ReturnType<typeof deferred<string>>;
    connect: ReturnType<typeof vi.fn>;
    finalizeTurn: ReturnType<typeof vi.fn>;
    clearTurn: ReturnType<typeof vi.fn>;
    setInputEnabled: ReturnType<typeof vi.fn>;
    replaceInputStream: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    operations: string[];
  }> = [];
  const manager = new ClassicRealtimeSessionManager({
    createTransport: (handlers) => {
      const connection = deferred<void>();
      const transcript = deferred<string>();
      const operations: string[] = [];
      const transport = {
        handlers,
        connection,
        transcript,
        operations,
        connect: vi.fn(() => {
          handlers.onDiagnosticEvent?.({ stage: "session_request_started" });
          handlers.onDiagnosticEvent?.({
            stage: "session_response",
            durationMs: 1_400,
            httpStatus: 200,
          });
          handlers.onDiagnosticEvent?.({ stage: "peer_connection_created" });
          handlers.onDiagnosticEvent?.({ stage: "offer_created" });
          handlers.onDiagnosticEvent?.({ stage: "sdp_request_started" });
          handlers.onDiagnosticEvent?.({
            stage: "sdp_response",
            durationMs: 2_000,
            httpStatus: 201,
            requestId: "req_test",
          });
          handlers.onDiagnosticEvent?.({ stage: "remote_description_set" });
          handlers.onDiagnosticEvent?.({ stage: "data_channel_open" });
          return connection.promise;
        }),
        finalizeTurn: vi.fn(() => {
          operations.push("commit");
          return transcript.promise;
        }),
        clearTurn: vi.fn(() => operations.push("clear")),
        setInputEnabled: vi.fn(async (enabled: boolean) => {
          operations.push(enabled ? "sender_on" : "sender_off");
        }),
        replaceInputStream: vi.fn(async (_stream: MediaStream, generation: number) => {
          operations.push(`bind_${generation}`);
        }),
        disconnect: vi.fn(),
      };
      transports.push(transport);
      return transport;
    },
    releaseMicrophone,
    now: () => monotonic,
    wallNow: () => wall,
    randomId: () => `id-${++id}`,
    finalizationFailureThreshold: options.finalizationFailureThreshold,
    circuitBreakerTurns: options.circuitBreakerTurns,
  });
  const stream = {} as MediaStream;
  const advanceClock = (ms: number) => {
    monotonic += ms;
    wall += ms;
  };
  return { manager, stream, transports, releaseMicrophone, advanceClock };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("ClassicRealtimeSessionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("warms in the background, then reuses one connection for turns two and three", async () => {
    const harness = createHarness();
    const first = await harness.manager.prepareTurn(harness.stream);
    expect(first.transcriptionPath).toBe("audio_upload_fallback");
    expect(first.fallbackReason).toBe("realtime_not_ready_at_recording_start");

    harness.manager.recordingStarted(first, harness.stream);
    harness.manager.recordingStarted(first, harness.stream);
    expect(harness.transports).toHaveLength(1);
    harness.advanceClock(4_700);
    harness.transports[0].connection.resolve();
    await flush();
    await expect(harness.manager.finishTurn(first)).resolves.toEqual({
      ok: false,
      fallbackReason: "realtime_not_ready_at_recording_start",
    });

    const second = await harness.manager.prepareTurn(harness.stream);
    expect(second).toMatchObject({
      transcriptionPath: "realtime",
      realtimeConnectionReused: true,
      warmStart: true,
      connectionId: "id-2",
    });
    await harness.manager.recordingStarted(second, harness.stream, 2);
    const secondFinal = harness.manager.finishTurn(second);
    harness.transports[0].transcript.resolve("Habari yako?");
    await expect(secondFinal).resolves.toEqual({
      ok: true,
      authoritativeTranscript: "Habari yako?",
    });

    const third = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(third, harness.stream, 3);
    const thirdFinal = harness.manager.finishTurn(third);
    harness.transports[0].transcript = deferred<string>();
    // finalizeTurn captured the previous resolved promise; it still represents one commit.
    await expect(thirdFinal).resolves.toMatchObject({ ok: true });

    expect(harness.transports).toHaveLength(1);
    expect(harness.transports[0].connect).toHaveBeenCalledOnce();
    expect(harness.transports[0].finalizeTurn).toHaveBeenCalledTimes(2);
  });

  it("clears and gates the buffer around every warm realtime turn", async () => {
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(cold);
    harness.transports[0].operations.length = 0;

    const warm = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(warm, harness.stream, 2);
    const final = harness.manager.finishTurn(warm);
    harness.transports[0].transcript.resolve("Guten Morgen.");
    await final;

    expect(harness.transports[0].operations).toEqual([
      "clear",
      "bind_2",
      "sender_on",
      "sender_off",
      "commit",
      "clear",
    ]);
  });

  it("falls back on connection loss, reconnects without blocking, and uses realtime next", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(cold);

    const warm = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(warm, harness.stream, 2);
    harness.transports[0].handlers.onError();
    await expect(harness.manager.finishTurn(warm)).resolves.toEqual({
      ok: false,
      fallbackReason: "connection_lost_during_recording",
    });

    const duringReconnect = await harness.manager.prepareTurn(harness.stream);
    expect(duringReconnect.transcriptionPath).toBe("audio_upload_fallback");
    harness.manager.recordingStarted(duringReconnect, harness.stream);
    expect(harness.transports).toHaveLength(2);
    harness.transports[1].connection.resolve();
    await flush();
    await harness.manager.finishTurn(duringReconnect);
    const recovered = await harness.manager.prepareTurn(harness.stream);
    expect(recovered.transcriptionPath).toBe("realtime");
    expect(harness.manager.getConnectionDiagnostics().reconnectCount).toBe(1);
  });

  it("closes the peer and microphone after the idle TTL and restarts cold", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(cold);

    await vi.advanceTimersByTimeAsync(CLASSIC_REALTIME_IDLE_TTL_MS);
    expect(harness.transports[0].disconnect).toHaveBeenCalledWith(
      "classic_idle_ttl",
    );
    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
    expect(harness.manager.getState()).toBe("idle");

    const restarted = await harness.manager.prepareTurn(harness.stream);
    expect(restarted.transcriptionPath).toBe("audio_upload_fallback");
    harness.manager.recordingStarted(restarted, harness.stream);
    expect(harness.transports).toHaveLength(2);
    expect(
      harness.manager.getConnectionDiagnostics().connectionAttempts[1].reason,
    ).toBe("idle_restart");
  });

  it("falls back when a warm transcript is not finalized in time", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(cold);

    const warm = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(warm, harness.stream, 2);
    const final = harness.manager.finishTurn(warm);
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(final).resolves.toEqual({
      ok: false,
      fallbackReason: "transcript_timeout",
    });
    expect(harness.transports[0].disconnect).toHaveBeenCalledWith(
      "classic_turn_finalization_failed",
    );
  });

  it("exports detailed connection attempts and ignores stale callbacks after close", async () => {
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.advanceClock(4_800);
    harness.transports[0].connection.resolve();
    await flush();

    const diagnostics = harness.manager.getConnectionDiagnostics();
    expect(diagnostics).toMatchObject({
      connectionAttemptsTotal: 1,
      connectionSuccesses: 1,
      connectionFailures: 0,
      reconnectCount: 0,
    });
    expect(diagnostics.connectionAttempts[0]).toMatchObject({
      reason: "initial_background_warm",
      status: "success",
      sessionRouteMs: 1_400,
      sdpHttpStatus: 201,
      sdpRequestId: "req_test",
      sdpMs: 2_000,
      totalSetupMs: 4_800,
    });

    harness.manager.close("classic_unmount");
    harness.transports[0].handlers.onError();
    expect(harness.manager.getState()).toBe("closed");
    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
  });

  it("reports failed connection setup without failing the active recording", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const cold = await harness.manager.prepareTurn(harness.stream);
    harness.manager.recordingStarted(cold, harness.stream);
    harness.transports[0].connection.reject(
      Object.assign(new Error("client_secret_failed"), { name: "NetworkError" }),
    );
    await flush();

    expect(cold.transcriptionPath).toBe("audio_upload_fallback");
    expect(harness.manager.getState()).toBe("recording");
    expect(harness.manager.getConnectionDiagnostics()).toMatchObject({
      connectionAttemptsTotal: 1,
      connectionSuccesses: 0,
      connectionFailures: 1,
    });
    harness.manager.close("test_cleanup");
  });

  it("binds the current capture generation before enabling a warm sender", async () => {
    const harness = createHarness();
    const first = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(first, harness.stream, 1);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(first);
    harness.transports[0].operations.length = 0;

    const nextStream = {} as MediaStream;
    const warm = await harness.manager.prepareTurn(nextStream);
    expect(harness.transports[0].operations).toEqual(["clear"]);

    await harness.manager.recordingStarted(warm, nextStream, 2);

    expect(harness.transports[0].replaceInputStream)
      .toHaveBeenCalledWith(nextStream, 2);
    expect(harness.transports[0].operations).toEqual([
      "clear",
      "bind_2",
      "sender_on",
    ]);
    expect(warm.realtimeInputTrackGeneration).toBe(2);
  });

  it("rebinds a newer capture generation when a background connection resolves late", async () => {
    const harness = createHarness();
    const firstStream = {} as MediaStream;
    const secondStream = {} as MediaStream;
    const first = await harness.manager.prepareTurn(firstStream);
    await harness.manager.recordingStarted(first, firstStream, 1);
    await harness.manager.finishTurn(first);

    const second = await harness.manager.prepareTurn(secondStream);
    await harness.manager.recordingStarted(second, secondStream, 2);
    harness.transports[0].connection.resolve();
    await flush();

    expect(harness.transports[0].replaceInputStream)
      .toHaveBeenCalledWith(secondStream, 2);
    expect(second.realtimeInputTrackGeneration).toBe(2);
    expect(second.realtimeTransportReady).toBe(true);
    await harness.manager.finishTurn(second);
  });

  it("temporarily bypasses realtime after the configured finalization threshold", async () => {
    vi.useFakeTimers();
    const harness = createHarness({
      finalizationFailureThreshold: 1,
      circuitBreakerTurns: 2,
    });
    const cold = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(cold, harness.stream, 1);
    harness.transports[0].connection.resolve();
    await flush();
    await harness.manager.finishTurn(cold);

    const warm = await harness.manager.prepareTurn(harness.stream);
    await harness.manager.recordingStarted(warm, harness.stream, 2);
    const final = harness.manager.finishTurn(warm);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(final).resolves.toMatchObject({ ok: false });

    const bypassed = await harness.manager.prepareTurn(harness.stream);
    expect(bypassed).toMatchObject({
      transcriptionPath: "audio_upload_fallback",
      fallbackReason: "realtime_circuit_breaker",
      circuitBreakerBypassed: true,
    });
    await harness.manager.recordingStarted(bypassed, harness.stream, 3);
    expect(harness.transports).toHaveLength(1);
    await harness.manager.finishTurn(bypassed);
    expect(harness.manager.getConnectionDiagnostics()).toMatchObject({
      realtimeCircuitBreakerTrips: 1,
      realtimeCircuitBreakerTurnsRemaining: 1,
    });
  });
});
