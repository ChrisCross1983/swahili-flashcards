import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeTranscriptionClientV2 } from "../realtimeTranscriptionClient";

class FakeChannel {
  readyState: RTCDataChannelState = "connecting";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = "closed"; }
  open() { this.readyState = "open"; this.onopen?.(); }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

const peers: FakePeer[] = [];
class FakePeer {
  connectionState: RTCPeerConnectionState = "connecting";
  iceConnectionState: RTCIceConnectionState = "checking";
  onconnectionstatechange: (() => void) | null = null;
  channel = new FakeChannel();
  sender = { replaceTrack: vi.fn(async () => undefined) };
  addTrack = vi.fn(() => this.sender);
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => {
    this.connectionState = "connected";
    this.channel.open();
  });
  close = vi.fn(() => { this.connectionState = "closed"; });
  constructor() { peers.push(this); }
}

class FakeTrack { stop = vi.fn(); }
class FakeStream {
  track = new FakeTrack();
  getAudioTracks() { return [this.track]; }
}

function credentialResponse(secret = "ephemeral-test-secret") {
  return new Response(JSON.stringify({
    clientSecret: secret,
    expiresAt: 123,
    transcriptionModel: "gpt-live-transcribe",
  }), { status: 200 });
}

function sdpResponse(status: number, requestId: string, retryAfter?: string) {
  const headers = new Headers({ "x-request-id": requestId });
  if (retryAfter !== undefined) headers.set("Retry-After", retryAfter);
  if (status >= 200 && status < 300) {
    return new Response("answer-sdp", { status, headers });
  }
  return new Response(JSON.stringify({
    error: {
      type: "server_error",
      code: `status_${status}`,
      message: `Temporary upstream error ${status}`,
    },
  }), { status, headers });
}

async function flush(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function makeClient(onConnectionAttempt = vi.fn()) {
  return {
    client: new RealtimeTranscriptionClientV2({
      onDelta: vi.fn(),
      onError: vi.fn(),
      onConnectionAttempt,
    }),
    onConnectionAttempt,
  };
}

describe("RealtimeTranscriptionClientV2", () => {
  beforeEach(() => {
    peers.length = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal("RTCPeerConnection", FakePeer);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates one transcription connection and commits one authoritative turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(201, "req_success"));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const onConnectionAttempt = vi.fn();
    const onDiagnosticEvent = vi.fn();
    const client = new RealtimeTranscriptionClientV2({
      onDelta: (delta) => deltas.push(delta),
      onError: vi.fn(),
      onConnectionAttempt,
      onDiagnosticEvent,
    });

    await client.connect(new FakeStream() as unknown as MediaStream);
    expect(peers).toHaveLength(1);
    expect(peers[0].addTrack).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.openai.com/v1/realtime/calls");
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/sdp");
    expect(onConnectionAttempt).toHaveBeenCalledWith({
      attempt: 1,
      httpStatus: 201,
      requestId: "req_success",
    });
    expect(onDiagnosticEvent.mock.calls.map(([event]) => event.stage)).toEqual(
      expect.arrayContaining([
        "session_request_started",
        "session_response",
        "peer_connection_created",
        "offer_created",
        "sdp_request_started",
        "sdp_response",
        "data_channel_open",
        "connection_ready",
      ]),
    );

    peers[0].channel.emit({
      type: "conversation.item.input_audio_transcription.delta",
      delta: "Ndiyo, ",
    });
    const final = client.finalizeTurn();
    expect(JSON.parse(peers[0].channel.sent[0])).toEqual({ type: "input_audio_buffer.commit" });
    peers[0].channel.emit({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "Ndiyo, asante sana.",
    });
    await expect(final).resolves.toBe("Ndiyo, asante sana.");
    expect(deltas).toEqual(["Ndiyo, "]);
    client.disconnect();
  });

  it("retries an SDP 500 once with a fresh peer and succeeds on 201", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(500, "req_500_1"))
      .mockResolvedValueOnce(sdpResponse(201, "req_201_2"));
    vi.stubGlobal("fetch", fetchMock);
    const { client, onConnectionAttempt } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await connection;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(peers).toHaveLength(2);
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(peers[1].connectionState).toBe("connected");
    expect(onConnectionAttempt.mock.calls.map(([details]) => details)).toEqual([
      { attempt: 1, httpStatus: 500, requestId: "req_500_1" },
      { attempt: 2, httpStatus: 201, requestId: "req_201_2" },
    ]);
    client.disconnect();
  });

  it("retries 500 twice with 1s/2s backoff and then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(500, "req_1"))
      .mockResolvedValueOnce(sdpResponse(500, "req_2"))
      .mockResolvedValueOnce(sdpResponse(201, "req_3"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await connection;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(peers).toHaveLength(3);
    client.disconnect();
  });

  it("retries SDP 503 and prefers a valid Retry-After header", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(503, "req_503", "0.25"))
      .mockResolvedValueOnce(sdpResponse(201, "req_after_503"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    await flush();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await connection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    client.disconnect();
  });

  it("fails after four serial SDP 500 attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(500, "req_1"))
      .mockResolvedValueOnce(sdpResponse(500, "req_2"))
      .mockResolvedValueOnce(sdpResponse(500, "req_3"))
      .mockResolvedValueOnce(sdpResponse(500, "req_4"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    const rejection = expect(connection).rejects.toThrow("sdp_request_failed");
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(peers).toHaveLength(4);
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
  });

  it.each([400, 403])("does not retry non-transient SDP status %s", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(status, `req_${status}`));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    await expect(client.connect(new FakeStream() as unknown as MediaStream))
      .rejects.toThrow("sdp_request_failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peers).toHaveLength(1);
  });

  it("preserves 429 retry behavior and reuses the same valid client secret", async () => {
    vi.useFakeTimers();
    const secret = "ephemeral-reused-secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse(secret))
      .mockResolvedValueOnce(sdpResponse(429, "req_rate_limit", "0"))
      .mockResolvedValueOnce(sdpResponse(201, "req_after_limit"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    await vi.runAllTimersAsync();
    await connection;
    const firstHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    const secondHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe(`Bearer ${secret}`);
    expect(secondHeaders.Authorization).toBe(`Bearer ${secret}`);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/translator/live/v2/session"))
      .toHaveLength(1);
    client.disconnect();
  });

  it("aborts a pending 5xx backoff on stop and never starts the stale attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(500, "req_stop"))
      .mockResolvedValueOnce(sdpResponse(201, "req_must_not_run"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    const rejection = expect(connection).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    client.disconnect("stop");
    await rejection;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peers).toHaveLength(1);
    expect(peers[0].close).toHaveBeenCalledOnce();
  });

  it("does not let a retry from an unmounted client affect a remounted client", async () => {
    vi.useFakeTimers();
    let sdpCall = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/translator/live/v2/session") return credentialResponse();
      sdpCall += 1;
      return sdpCall === 1 ? sdpResponse(500, "req_old") : sdpResponse(201, "req_new");
    });
    vi.stubGlobal("fetch", fetchMock);
    const oldClient = makeClient().client;
    const oldConnection = oldClient.connect(new FakeStream() as unknown as MediaStream);
    const oldRejection = expect(oldConnection).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    oldClient.disconnect("unmount");
    await oldRejection;

    const newClient = makeClient().client;
    await newClient.connect(new FakeStream() as unknown as MediaStream);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sdpCall).toBe(2);
    expect(peers).toHaveLength(2);
    expect(peers[0].connectionState).toBe("closed");
    expect(peers[1].connectionState).toBe("connected");
    newClient.disconnect();
  });

  it("emits copyable structured logs with request metadata but no secret or SDP", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "ek_test_do_not_log_123";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(credentialResponse(secret))
      .mockResolvedValueOnce(sdpResponse(500, "req_loggable"))
      .mockResolvedValueOnce(sdpResponse(201, "req_success")));
    const { client } = makeClient();

    const connection = client.connect(new FakeStream() as unknown as MediaStream);
    await vi.advanceTimersByTimeAsync(1_000);
    await connection;
    client.disconnect();

    const lines = [...log.mock.calls, ...error.mock.calls].map(([line]) => line);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => typeof line === "string")).toBe(true);
    expect(lines).toContainEqual(expect.stringContaining(
      "[translator-live-v2][connection retry] {\"target\":\"transcription\"",
    ));
    expect(lines).toContainEqual(expect.stringContaining("\"requestId\":\"req_loggable\""));
    const serialized = lines.join("\n");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("offer-sdp");
    expect(serialized).not.toContain("answer-sdp");
    expect(serialized).not.toContain("Authorization");
  });

  it("clears discarded local noise without creating a transcript turn", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(201, "req_clear")));
    const client = new RealtimeTranscriptionClientV2({
      onDelta: vi.fn(),
      onError: vi.fn(),
    });
    await client.connect(new FakeStream() as unknown as MediaStream);
    client.clearTurn();
    expect(JSON.parse(peers[0].channel.sent[0])).toEqual({ type: "input_audio_buffer.clear" });
    client.disconnect();
  });

  it("can gate and restore the input sender without changing the Live V2 connection", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(sdpResponse(201, "req_gate")));
    const stream = new FakeStream();
    const client = new RealtimeTranscriptionClientV2({
      onDelta: vi.fn(),
      onError: vi.fn(),
    });
    await client.connect(stream as unknown as MediaStream);

    await client.setInputEnabled(false);
    await client.setInputEnabled(true);

    expect(peers[0].sender.replaceTrack).toHaveBeenNthCalledWith(1, null);
    expect(peers[0].sender.replaceTrack).toHaveBeenNthCalledWith(
      2,
      stream.track,
    );
    expect(peers).toHaveLength(1);
    client.disconnect();
  });
});
