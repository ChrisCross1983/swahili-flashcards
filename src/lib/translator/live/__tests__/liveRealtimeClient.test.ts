import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRealtimeClient } from "../liveRealtimeClient";

const SESSION_ENDPOINT = "/api/translator/live/session";
const SDP_ENDPOINT = "https://api.openai.com/v1/realtime/translations/calls";

function credentialsResponse(
  swSecret = "ek_sw",
  deSecret = "ek_de",
) {
  return new Response(JSON.stringify({ sessions: [
    { targetLanguage: "sw", clientSecret: swSecret, expiresAt: 123 },
    { targetLanguage: "de", clientSecret: deSecret, expiresAt: 123 },
  ] }), { status: 200 });
}

async function flushPromises(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

class FakeTrack {
  enabled = true;
  muted = false;
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  onended: (() => void) | null = null;
  stop = vi.fn();
}

class FakeStream {
  track = new FakeTrack();
  getAudioTracks() { return [this.track]; }
  getTracks() { return [this.track]; }
}

class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();

  open() {
    this.readyState = "open";
    this.onopen?.();
  }
}

type PeerScenario = {
  openDataChannel?: boolean;
  rejectRemoteDescription?: boolean;
};

const peers: FakePeer[] = [];
let peerScenarios: PeerScenario[] = [];
class FakePeer {
  connectionState: RTCPeerConnectionState = "connecting";
  iceConnectionState: RTCIceConnectionState = "checking";
  signalingState: RTCSignalingState = "stable";
  iceGatheringState: RTCIceGatheringState = "complete";
  ontrack: ((event: { streams: FakeStream[]; track: FakeTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  channel = new FakeDataChannel();
  close = vi.fn(() => { this.connectionState = "closed"; });
  private scenario: PeerScenario;
  constructor() {
    this.scenario = peerScenarios[peers.length] ?? {};
    peers.push(this);
  }
  createDataChannel() { return this.channel; }
  addTrack = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => {
    if (this.scenario.rejectRemoteDescription) {
      throw new DOMException("bad answer", "OperationError");
    }
    this.connectionState = "connected";
    if (this.scenario.openDataChannel !== false) this.channel.open();
  });
}

class FakeAudioContext {
  destination = {};
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource() { return { connect: vi.fn() }; }
  createAnalyser() {
    return { fftSize: 1024, getByteTimeDomainData: (data: Uint8Array) => data.fill(128) };
  }
}

const audioElements: FakeAudio[] = [];
class FakeAudio {
  static playbackRejection: Error | null = null;
  autoplay = false;
  muted = false;
  preload = "";
  srcObject: unknown = null;
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    if (this.src && FakeAudio.playbackRejection) throw FakeAudio.playbackRejection;
    this.onplaying?.();
  });
  pause = vi.fn(() => this.onpause?.());
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  setAttribute = vi.fn();

  src = "";

  constructor(src = "") {
    this.src = src;
    audioElements.push(this);
  }

  end() { this.onended?.(); }
  fail() { this.onerror?.(); }
}

function selectedPlayback() {
  return audioElements.find((audio) => Boolean(audio.src) && audio.srcObject == null);
}

function remoteSinks() {
  return audioElements.filter((audio) => audio.srcObject != null);
}

function playbackElements() {
  return audioElements.filter((audio) => audio.srcObject == null);
}

class FakeMediaRecorder {
  static emitData = true;
  static throwOnCreate = false;
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    if (FakeMediaRecorder.throwOnCreate) throw new Error("recorder unavailable");
  }
  start() { this.state = "recording"; }
  stop() {
    if (FakeMediaRecorder.emitData) {
      this.ondataavailable?.({ data: new Blob(["audio"]) });
    }
    this.state = "inactive";
    this.onstop?.(new Event("stop"));
  }
}

type TestableClient = {
  beginTurn(now: number): void;
  finishTurn(now: number, silenceDurationMs: number): Promise<void>;
  sampleAudio(): void;
  update(patch: Record<string, unknown>): void;
  currentTurn: {
    lastRemoteSoundAt: Partial<Record<"de" | "sw", number>>;
    firstAudioAt: Partial<Record<"de" | "sw", number>>;
  } | null;
  sourceAnalyser: {
    fftSize: number;
    getByteTimeDomainData(data: Uint8Array): void;
  } | null;
};

function internals(client: LiveRealtimeClient) {
  return client as unknown as TestableClient;
}

async function captureTurn(
  client: LiveRealtimeClient,
  input: string | null,
  output = "Habari za asubuhi",
  target: "de" | "sw" = "sw",
  inputPeerIndex = 0,
  hasAudioFrames = true,
) {
  const testClient = internals(client);
  testClient.beginTurn(performance.now());
  if (input != null) {
    peers[inputPeerIndex].channel.onmessage?.({
      data: JSON.stringify({ type: "session.input_transcript.delta", delta: input }),
    });
  }
  if (output) {
    const peer = target === "sw" ? peers[0] : peers[1];
    peer.channel.onmessage?.({
      data: JSON.stringify({ type: "session.output_transcript.delta", delta: output }),
    });
  }
  testClient.update({ detectedLanguage: target === "sw" ? "de" : "sw" });
  if (testClient.currentTurn) {
    testClient.currentTurn.lastRemoteSoundAt[target] = performance.now() - 1_000;
    if (hasAudioFrames) testClient.currentTurn.firstAudioAt[target] = performance.now();
  }
  await testClient.finishTurn(performance.now(), 1_000);
}

describe("LiveRealtimeClient lifecycle", () => {
  let stream: FakeStream;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    peers.length = 0;
    audioElements.length = 0;
    FakeAudio.playbackRejection = null;
    FakeMediaRecorder.emitData = true;
    FakeMediaRecorder.throwOnCreate = false;
    peerScenarios = [];
    stream = new FakeStream();
    getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("Audio", FakeAudio);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:translated-audio");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/translator/live/session") {
        return new Response(JSON.stringify({ sessions: [
          { targetLanguage: "sw", clientSecret: "ek_sw", expiresAt: 123 },
          { targetLanguage: "de", clientSecret: "ek_de", expiresAt: 123 },
        ] }), { status: 200 });
      }
      if (url === "/api/translator/live/detect") {
        return new Response(JSON.stringify({ language: "de" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("answer-sdp", { status: 200 });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts one microphone and two mocked WebRTC directions, then cleans up", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    expect(client.getSnapshot().connectionStatus).toBe("connected");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(peers).toHaveLength(2);

    client.stop();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
    expect(peers.every((peer) => peer.channel.send.mock.calls[0]?.[0].includes("session.close"))).toBe(true);
  });

  it("uses both client secrets for successful translation SDP calls", async () => {
    const client = new LiveRealtimeClient();
    await client.start();

    const calls = vi.mocked(fetch).mock.calls.filter(
      ([url]) => url === "https://api.openai.com/v1/realtime/translations/calls",
    );
    expect(calls).toHaveLength(2);
    expect(calls.map(([, init]) => new Headers(init?.headers).get("Authorization"))).toEqual([
      "Bearer ek_sw",
      "Bearer ek_de",
    ]);
    expect(calls.every(([, init]) => new Headers(init?.headers).get("Content-Type") === "application/sdp")).toBe(true);
    expect(calls.every(([, init]) => init?.body === "offer-sdp")).toBe(true);
    expect(peers.every((peer) => peer.setRemoteDescription.mock.calls.length === 1)).toBe(true);
    client.stop();
  });

  it("starts the second SDP call only after the first sidecar is ready", async () => {
    let resolveFirstSdp!: (response: Response) => void;
    const firstSdp = new Promise<Response>((resolve) => { resolveFirstSdp = resolve; });
    let sdpCalls = 0;
    let activeSdpCalls = 0;
    let maximumConcurrentSdpCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      if (url !== SDP_ENDPOINT) throw new Error(`unexpected request: ${url}`);
      sdpCalls += 1;
      activeSdpCalls += 1;
      maximumConcurrentSdpCalls = Math.max(maximumConcurrentSdpCalls, activeSdpCalls);
      if (sdpCalls === 1) {
        const response = await firstSdp;
        activeSdpCalls -= 1;
        return response;
      }
      activeSdpCalls -= 1;
      return new Response("answer-sdp", { status: 201 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await flushPromises();
    expect(sdpCalls).toBe(1);
    expect(peers).toHaveLength(1);

    resolveFirstSdp(new Response("answer-sdp", { status: 201 }));
    await starting;
    expect(sdpCalls).toBe(2);
    expect(maximumConcurrentSdpCalls).toBe(1);
    expect(peers[0].connectionState).toBe("connected");
    expect(peers[1].connectionState).toBe("connected");
    client.stop();
  });

  it("retries a 429 once with the same sidecar secret", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let deCalls = 0;
    const deAuthorizations: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      if (url !== SDP_ENDPOINT) throw new Error(`unexpected request: ${url}`);
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      deCalls += 1;
      deAuthorizations.push(authorization);
      return deCalls === 1
        ? new Response("rate limited", { status: 429 })
        : new Response("answer-sdp", { status: 201 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deCalls).toBe(1);
    expect(client.getSnapshot()).toMatchObject({
      phase: "connecting",
      connectionStatus: "connecting",
      error: null,
    });
    expect(peers[0].close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await starting;
    expect(deCalls).toBe(2);
    expect(deAuthorizations).toEqual(["Bearer ek_de", "Bearer ek_de"]);
    expect(client.getSnapshot().connectionStatus).toBe("connected");
    const retryLog = info.mock.calls.find(
      ([label]) => label === "[translator-live][connection retry]",
    );
    expect(retryLog?.[1]).toEqual({
      targetLanguage: "de",
      attempt: 2,
      reason: "rate_limit",
      delayMs: 1_000,
    });
    const readyLog = info.mock.calls.find(
      ([label, details]) =>
        label === "[translator-live][connection]" &&
        (details as { targetLanguage?: string }).targetLanguage === "de" &&
        (details as { step?: string }).step === "connection_ready",
    );
    expect(readyLog?.[1]).toMatchObject({ attempt: 2 });
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain("ek_de");
    client.stop();
  });

  it("retries 429 twice and then connects successfully", async () => {
    vi.useFakeTimers();
    let deCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      deCalls += 1;
      return deCalls <= 2
        ? new Response("rate limited", { status: 429 })
        : new Response("answer-sdp", { status: 201 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(3_000);
    await starting;
    expect(deCalls).toBe(3);
    expect(client.getSnapshot().connectionStatus).toBe("connected");
    client.stop();
  });

  it("prefers a safe Retry-After delay over the configured backoff", async () => {
    vi.useFakeTimers();
    let deCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      deCalls += 1;
      return deCalls === 1
        ? new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "0.25" },
          })
        : new Response("answer-sdp", { status: 201 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(249);
    expect(deCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await starting;
    expect(deCalls).toBe(2);
    client.stop();
  });

  it("fails cleanly after the bounded 429 retry sequence", async () => {
    vi.useFakeTimers();
    let deCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      deCalls += 1;
      return new Response("rate limited", { status: 429 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(deCalls).toBe(3);
    expect(peers[0].connectionState).toBe("connected");
    expect(peers[0].close).not.toHaveBeenCalled();
    expect(client.getSnapshot().phase).toBe("connecting");

    await vi.advanceTimersByTimeAsync(4_000);
    await starting;
    expect(deCalls).toBe(4);
    expect(client.getSnapshot()).toMatchObject({
      phase: "error",
      connectionStatus: "disconnected",
      error: "Live-Übersetzung ist gerade nicht verfügbar.",
    });
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
    client.stop();
  });

  it.each([400, 403])("does not retry an SDP HTTP %i", async (status) => {
    let sdpCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      sdpCalls += 1;
      return new Response("not retryable", { status });
    }));

    const client = new LiveRealtimeClient();
    await client.start();
    expect(sdpCalls).toBe(1);
    expect(peers).toHaveLength(1);
    expect(client.getSnapshot().connectionStatus).toBe("disconnected");
    client.stop();
  });

  it("reports an SDP HTTP failure without attempting its remote description", async () => {
    let sdpCall = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/translator/live/session") {
        return new Response(JSON.stringify({ sessions: [
          { targetLanguage: "sw", clientSecret: "ek_sw", expiresAt: 123 },
          { targetLanguage: "de", clientSecret: "ek_de", expiresAt: 123 },
        ] }), { status: 200 });
      }
      sdpCall += 1;
      return sdpCall === 1
        ? new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "model_not_found", message: "No access" } }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("answer-sdp", { status: 200, headers: { "Content-Type": "application/sdp" } });
    }));

    const client = new LiveRealtimeClient();
    await client.start();
    expect(client.getSnapshot()).toMatchObject({ phase: "error", connectionStatus: "disconnected" });
    expect(peers[0].setRemoteDescription).not.toHaveBeenCalled();
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
    client.stop();
  });

  it("reports setRemoteDescription failure and cleans up both sidecars", async () => {
    peerScenarios = [{ rejectRemoteDescription: true }, {}];
    const client = new LiveRealtimeClient();
    await client.start();
    expect(client.getSnapshot().connectionStatus).toBe("disconnected");
    expect(peers[0].setRemoteDescription).toHaveBeenCalledOnce();
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
    client.stop();
  });

  it("does not become ready when one DataChannel never opens", async () => {
    vi.useFakeTimers();
    peerScenarios = [{ openDataChannel: false }, {}];
    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(10_001);
    await starting;
    expect(client.getSnapshot()).toMatchObject({ phase: "error", connectionStatus: "disconnected" });
    expect(peers.every((peer) => peer.close.mock.calls.length === 1)).toBe(true);
    client.stop();
  });

  it("marks the client ready only after both sidecar DataChannels open", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    expect(peers).toHaveLength(2);
    expect(peers.every((peer) => peer.channel.readyState === "open")).toBe(true);
    expect(client.getSnapshot()).toMatchObject({ phase: "listening", connectionStatus: "connected" });
    client.stop();
  });

  it("records a successful turn and preserves its timings", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, guten Morgen");
    expect(client.getSnapshot().transcript).toHaveLength(1);
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "success",
      sourceLanguage: "de",
      targetLanguage: "sw",
      sourceTranscript: "Hallo, guten Morgen",
      translatedTranscript: "Habari za asubuhi",
      detectionStatus: "success",
      detectHttpStatus: 200,
      silenceDurationMs: 1_000,
      playbackStarted: true,
      firstRemoteAudioAt: expect.any(String),
      selectedAudioReadyAt: expect.any(String),
      playbackStartedAt: expect.any(String),
    });
    expect(remoteSinks()).toHaveLength(2);
    expect(remoteSinks().every((audio) => audio.muted)).toBe(true);
    expect(selectedPlayback()?.muted).toBe(false);
    expect(selectedPlayback()?.play).toHaveBeenCalledOnce();
    expect(client.getSnapshot().transcript[0].sidecars).toMatchObject({
      sw: { translatedTranscript: "Habari za asubuhi", hadRemoteAudio: true },
      de: { remoteTrackReceived: true },
    });
    selectedPlayback()?.end();
    expect(client.getSnapshot().transcript[0].playbackStopped).toBe(true);
    expect(client.getSnapshot().transcript[0].audioCompletedAt).toEqual(expect.any(String));
    client.stop();
  });

  it("receives and keeps both remote sidecar tracks muted", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    const sinks = remoteSinks();
    expect(sinks).toHaveLength(2);
    expect(sinks.every((audio) => audio.srcObject instanceof FakeStream)).toBe(true);
    expect(sinks.every((audio) => audio.muted && audio.play.mock.calls.length === 1)).toBe(true);
    client.stop();
    expect(sinks.every((audio) => audio.pause.mock.calls.length === 1)).toBe(true);
  });

  it("reports a missing selected remote track precisely", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers[1].ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() });
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?", "sw");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      selectedSidecar: "sw",
      errorCode: "remote_audio_track_missing",
      playbackStarted: false,
    });
    expect(selectedPlayback()).toBeUndefined();
    client.stop();
  });

  it("distinguishes a present track with no audio frames", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?", "sw", 0, false);
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      errorCode: "no_audio_frames_for_turn",
      playbackStarted: false,
      sidecars: { sw: { audioErrorCode: "no_audio_frames_for_turn" } },
    });
    client.stop();
  });

  it("distinguishes a selected sidecar audio-capture failure", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    FakeMediaRecorder.throwOnCreate = true;
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      errorCode: "audio_capture_failed",
      sidecars: { sw: { audioErrorCode: "audio_capture_failed" } },
    });
    client.stop();
  });

  it("reports a selected sidecar whose recorder produced no audio blob", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    FakeMediaRecorder.emitData = false;
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      errorCode: "selected_sidecar_audio_missing",
      playbackStarted: false,
    });
    client.stop();
  });

  it("reports browser-blocked playback without retrying or playing both sidecars", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    FakeAudio.playbackRejection = new DOMException("blocked", "NotAllowedError");
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      errorCode: "playback_blocked",
      playbackStarted: false,
      sidecars: { sw: { audioErrorCode: "playback_blocked" } },
    });
    expect(playbackElements()).toHaveLength(1);
    expect(playbackElements()[0].play).toHaveBeenCalledOnce();
    client.stop();
  });

  it("reports a playback media failure after playback started", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?");
    selectedPlayback()?.fail();
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "technical_error",
      errorCode: "playback_failed",
      playbackStarted: true,
      sidecars: { sw: { audioErrorCode: "playback_failed" } },
    });
    client.stop();
  });

  it("keeps an unknown turn in the protocol", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === "/api/translator/live/detect") {
        return new Response(JSON.stringify({ language: "unknown" }), { status: 200 });
      }
      throw new Error(`unexpected request: ${String(url)}`);
    });
    await captureTurn(client, "123", "");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "unknown",
      detectedLanguage: "unknown",
      detectionStatus: "unknown",
      sourceTranscript: "123",
    });
    client.stop();
  });

  it("uses an input transcript candidate from either sidecar", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, wie geht es dir?", "Habari yako?", "sw", 1);
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "success",
      sourceTranscript: "Hallo, wie geht es dir?",
      selectedSidecar: "sw",
      sidecars: {
        de: { sourceTranscript: "Hallo, wie geht es dir?" },
        sw: { sourceTranscript: "" },
      },
    });
    selectedPlayback()?.end();
    client.stop();
  });

  it("keeps a detect-400 visible while using the local language fallback", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    vi.stubEnv("NODE_ENV", "development");
    const detectError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === "/api/translator/live/detect") {
        return new Response(JSON.stringify({
          language: "unknown",
          code: "invalid_transcript",
          reason: "validation_failed",
        }), { status: 400 });
      }
      throw new Error(`unexpected request: ${String(url)}`);
    });
    await captureTurn(client, "Hallo, guten Morgen");
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "success",
      sourceLanguage: "de",
      detectionStatus: "error",
      detectHttpStatus: 400,
      detectErrorCode: "invalid_transcript",
    });
    const errorCall = detectError.mock.calls.find(
      ([label]) => label === "[translator-live][detect error]",
    );
    expect(errorCall?.[1]).toMatchObject({
      httpStatus: 400,
      safeCode: "invalid_transcript",
      reason: "validation_failed",
    });
    expect(JSON.stringify(errorCall)).not.toContain("Hallo, guten Morgen");
    selectedPlayback()?.end();
    client.stop();
  });

  it("records an empty turn without sending an invalid detect request", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    vi.stubEnv("NODE_ENV", "development");
    const detectInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const detectCallsBefore = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/translator/live/detect").length;
    await captureTurn(client, null, "");
    const detectCallsAfter = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/translator/live/detect").length;
    expect(detectCallsAfter).toBe(detectCallsBefore);
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "empty",
      detectionStatus: "skipped",
      detectErrorCode: "empty_transcript",
    });
    const requestCall = detectInfo.mock.calls.find(
      ([label]) => label === "[translator-live][detect request]",
    );
    expect(requestCall?.[1]).toMatchObject({
      transcriptLength: 0,
      hasTranscript: false,
      candidateCount: 0,
    });
    client.stop();
  });

  it("preserves alternating DE/SW turns and selects one sidecar each time", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers.forEach((peer) => peer.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack() }));
    await captureTurn(client, "Hallo, guten Morgen", "Habari za asubuhi");
    selectedPlayback()?.end();
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === "/api/translator/live/detect") {
        return new Response(JSON.stringify({ language: "sw" }), { status: 200 });
      }
      throw new Error(`unexpected request: ${String(url)}`);
    });
    await captureTurn(client, "Ninafurahi kukuona", "Ich freue mich, dich zu sehen", "de");
    selectedPlayback()?.end();
    expect(client.getSnapshot().transcript.map((turn) => turn.sourceTranscript)).toEqual([
      "Hallo, guten Morgen",
      "Ninafurahi kukuona",
    ]);
    expect(client.getSnapshot().transcript.map((turn) => turn.selectedSidecar)).toEqual([
      "sw",
      "de",
    ]);
    expect(playbackElements()).toHaveLength(1);
    expect(playbackElements()[0].play).toHaveBeenCalledTimes(2);
    const report = client.getTestReport();
    expect(report?.turns).toHaveLength(2);
    expect(report?.session).toMatchObject({ totalTurns: 2, successfulTurns: 2 });
    expect(JSON.stringify(report)).not.toMatch(/clientSecret|ek_sw|offer-sdp/i);
    client.stop();
  });

  it("does not create a new turn from playback audio", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    const testClient = internals(client);
    testClient.update({ phase: "speaking", audioPlaying: true });
    for (let index = 0; index < 10; index += 1) testClient.sampleAudio();
    expect(client.getSnapshot().transcript).toHaveLength(0);
    expect(testClient.currentTurn).toBeNull();
    client.stop();
  });

  it("records a sustained speech attempt that is gated during playback", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    const testClient = internals(client);
    testClient.sourceAnalyser = {
      fftSize: 32,
      getByteTimeDomainData: (data) => data.fill(255),
    };
    testClient.update({ phase: "speaking", audioPlaying: true });
    for (let index = 0; index < 4; index += 1) testClient.sampleAudio();
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "ignored",
      detectionStatus: "not_attempted",
      errorCode: "input_gated_during_playback",
    });
    client.stop();
  });

  it("keeps a turn that is interrupted when the session ends", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    internals(client).beginTurn(performance.now());
    client.stop();
    expect(client.getSnapshot().transcript[0]).toMatchObject({
      status: "discarded",
      errorCode: "session_ended",
      detectionStatus: "not_attempted",
    });
    expect(client.getTestReport()?.session.endedAt).not.toBeNull();
  });

  it("cancels a pending rate-limit backoff when the session stops", async () => {
    vi.useFakeTimers();
    let deCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) return credentialsResponse();
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      deCalls += 1;
      return new Response("rate limited", { status: 429 });
    }));

    const client = new LiveRealtimeClient();
    const starting = client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    client.stop();
    await starting;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deCalls).toBe(1);
  });

  it("reconnect cancels the old retry loop before starting a new sequence", async () => {
    vi.useFakeTimers();
    let sessionCalls = 0;
    let oldDeCalls = 0;
    let newSdpCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SESSION_ENDPOINT) {
        sessionCalls += 1;
        return sessionCalls === 1
          ? credentialsResponse("ek_old_sw", "ek_old_de")
          : credentialsResponse("ek_new_sw", "ek_new_de");
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer ek_old_sw") {
        return new Response("answer-sdp", { status: 201 });
      }
      if (authorization === "Bearer ek_old_de") {
        oldDeCalls += 1;
        return new Response("rate limited", { status: 429 });
      }
      newSdpCalls += 1;
      return new Response("answer-sdp", { status: 201 });
    }));

    const client = new LiveRealtimeClient();
    const firstStart = client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(oldDeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    const reconnecting = client.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([firstStart, reconnecting]);
    expect(sessionCalls).toBe(2);
    expect(oldDeCalls).toBe(1);
    expect(newSdpCalls).toBe(2);
    expect(client.getSnapshot().connectionStatus).toBe("connected");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(oldDeCalls).toBe(1);
    client.stop();
  });

  it("redacts client secrets from development connection logs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/translator/live/session") {
        return new Response(JSON.stringify({ sessions: [
          { targetLanguage: "sw", clientSecret: "ek_sw_secret_value", expiresAt: 123 },
          { targetLanguage: "de", clientSecret: "ek_de_secret_value", expiresAt: 123 },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: {
        type: "invalid_request_error",
        code: "model_not_found",
        message: "secret ek_sw_secret_value is invalid",
      } }), { status: 403, headers: { "Content-Type": "application/json" } });
    }));

    const client = new LiveRealtimeClient();
    await client.start();
    const logs = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    expect(logs).not.toContain("ek_sw_secret_value");
    expect(logs).not.toContain("ek_de_secret_value");
    expect(logs).toContain("model_not_found");
    client.stop();
  });

  it("surfaces a friendly microphone error", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const client = new LiveRealtimeClient();
    await client.start();
    expect(client.getSnapshot()).toMatchObject({
      phase: "error",
      connectionStatus: "disconnected",
      error: "Mikrofon konnte nicht geöffnet werden.",
    });
    client.stop();
  });

  it("prevents a second parallel live session", async () => {
    const first = new LiveRealtimeClient();
    const second = new LiveRealtimeClient();
    await first.start();
    await second.start();
    expect(second.getSnapshot().error).toBe("Es läuft bereits ein Live-Gespräch.");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    first.stop();
    second.stop();
  });

  it("exposes connection loss and reconnects without a live API request", async () => {
    const client = new LiveRealtimeClient();
    await client.start();
    peers[0].connectionState = "failed";
    peers[0].onconnectionstatechange?.();
    expect(client.getSnapshot().error).toBe("Live-Verbindung wurde unterbrochen.");
    await client.reconnect();
    expect(client.getSnapshot().connectionStatus).toBe("connected");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    client.stop();
  });
});
