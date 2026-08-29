import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveV2Client } from "../liveV2Client";

async function flush(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

class FakeTrack {
  enabled = true;
  stop = vi.fn();
}

class FakeStream {
  track = new FakeTrack();
  getAudioTracks() { return [this.track]; }
  getTracks() { return [this.track]; }
}

class FakeAnalyser {
  fftSize = 1024;
  speaking = false;
  getByteTimeDomainData(values: Uint8Array) {
    values.fill(this.speaking ? 140 : 128);
  }
}

class FakeAudioContext {
  analyser = new FakeAnalyser();
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createAnalyser() { return this.analyser; }
  createMediaStreamSource() { return { connect: vi.fn() }; }
}

class FakeAudio {
  currentTime = 0;
  preload = "";
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => { this.onplaying?.(); });
  setAttribute = vi.fn();
  end() { this.onended?.(); }
}

class FakeTransport {
  transcript = "";
  connect = vi.fn(async () => undefined);
  finalizeTurn = vi.fn(async () => this.transcript);
  clearTurn = vi.fn();
  disconnect = vi.fn();
}

type ClientInternals = {
  beginTurn(now: number): void;
  finishTurn(now: number, silenceMs: number): Promise<void>;
  sampleAudio(): void;
};

function internals(client: LiveV2Client) {
  return client as unknown as ClientInternals;
}

describe("LiveV2Client single-mic pipeline", () => {
  let now: number;
  let stream: FakeStream;
  let context: FakeAudioContext;
  let transport: FakeTransport;
  let audios: FakeAudio[];
  let detect: ReturnType<typeof vi.fn>;
  let translate: ReturnType<typeof vi.fn>;
  let requestSpeech: ReturnType<typeof vi.fn>;
  let onConnectionAttempt: (details: {
    attempt: number;
    httpStatus: number;
    requestId: string | null;
  }) => void;
  let client: LiveV2Client;

  beforeEach(() => {
    now = Date.parse("2026-08-26T07:00:00.000Z");
    stream = new FakeStream();
    context = new FakeAudioContext();
    transport = new FakeTransport();
    audios = [];
    detect = vi.fn(async (text: string) => ({
      language: text.startsWith("N") ? "sw" : text.startsWith("?") ? "unknown" : "de",
      classificationSource: "terra",
    }));
    translate = vi.fn(async (_text: string, source: "de" | "sw") => ({
      translatedText: source === "de" ? "Habari za asubuhi" : "Ja, vielen Dank",
      translationModel: "gpt-5.6-terra",
    }));
    requestSpeech = vi.fn(async () => ({
      audio: new Blob(["mp3"]),
      diagnostics: { ttsModel: "gpt-4o-mini-tts", ttsGenerationMs: 10 },
    }));
    client = new LiveV2Client({
      getUserMedia: vi.fn(async () => stream as unknown as MediaStream),
      createAudioContext: () => context as unknown as AudioContext,
      createTransport: vi.fn((handlers) => {
        onConnectionAttempt = handlers.onConnectionAttempt;
        return transport;
      }),
      detectLanguage: detect,
      translate,
      requestSpeech,
      createAudio: () => {
        const audio = new FakeAudio();
        audios.push(audio);
        return audio;
      },
      createObjectUrl: vi.fn(() => "blob:test"),
      revokeObjectUrl: vi.fn(),
      now: () => now,
      randomId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    } as never);
  });

  afterEach(() => client.stop());

  async function start() {
    await client.start();
    expect(client.getSnapshot().connectionStatus).toBe("connected");
    expect(transport.connect).toHaveBeenCalledOnce();
  }

  async function completeTurn(transcript: string) {
    transport.transcript = transcript;
    internals(client).beginTurn(now);
    now += 2_000;
    const completion = internals(client).finishTurn(now, 1_000);
    await flush();
    const audio = audios.at(-1);
    if (audio?.src) audio.end();
    await completion;
  }

  it("stays in the connecting UI state until transport retries finish", async () => {
    let resolveConnect!: () => void;
    transport.connect.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      resolveConnect = () => resolve(undefined);
    }));

    const starting = client.start();
    await flush();
    expect(client.getSnapshot()).toMatchObject({
      phase: "connecting",
      connectionStatus: "connecting",
      error: null,
    });

    resolveConnect();
    await starting;
    expect(client.getSnapshot()).toMatchObject({
      phase: "listening",
      connectionStatus: "connected",
      error: null,
    });
  });

  it("shows the generic unavailable state only after transport finally fails", async () => {
    transport.connect.mockRejectedValueOnce(new Error("sdp_request_failed"));

    await client.start();

    expect(client.getSnapshot()).toMatchObject({
      phase: "error",
      connectionStatus: "disconnected",
      error: "Live-Übersetzung ist gerade nicht verfügbar.",
    });
  });

  it("stores OpenAI request IDs in the local QA report", async () => {
    await start();
    onConnectionAttempt({ attempt: 1, httpStatus: 500, requestId: "req_failed" });
    onConnectionAttempt({ attempt: 2, httpStatus: 201, requestId: "req_success" });
    onConnectionAttempt({ attempt: 3, httpStatus: 201, requestId: "req_success" });

    expect(client.getTestReport()?.session.realtimeRequestIds).toEqual([
      "req_failed",
      "req_success",
    ]);
  });

  it("starts one transcription session and produces one authoritative DE-to-SW turn", async () => {
    await start();
    await completeTurn("Guten Morgen, wie geht es dir?");
    const turn = client.getSnapshot().turns[0];
    expect(turn).toMatchObject({
      pipelineVersion: "v2",
      authoritativeTranscript: "Guten Morgen, wie geht es dir?",
      detectedLanguage: "de",
      targetLanguage: "sw",
      translatedText: "Habari za asubuhi",
      status: "success",
    });
    expect(detect).toHaveBeenCalledWith(
      "Guten Morgen, wie geht es dir?",
      null,
      expect.any(AbortSignal),
    );
    expect(requestSpeech).toHaveBeenCalledWith(
      "Habari za asubuhi",
      "sw",
      1,
      expect.any(Object),
    );
  });

  it("alternates SW-to-DE without letting the expected hint override detection", async () => {
    await start();
    await completeTurn("Guten Morgen");
    now += 500;
    await completeTurn("Ndiyo, asante sana.");
    expect(client.getSnapshot().turns.map((turn) => turn.detectedLanguage)).toEqual(["de", "sw"]);
    expect(client.getSnapshot().turns[1]).toMatchObject({
      expectedLanguage: "sw",
      detectedLanguage: "sw",
      targetLanguage: "de",
      translatedText: "Ja, vielen Dank",
    });
    expect(detect.mock.calls[1][1]).toBe("sw");
  });

  it("keeps unknown authoritative speech visible and skips translation and TTS", async () => {
    await start();
    await completeTurn("? unclear");
    expect(client.getSnapshot().turns[0]).toMatchObject({
      status: "unknown",
      authoritativeTranscript: "? unclear",
      detectedLanguage: "unknown",
      translatedText: "",
    });
    expect(translate).not.toHaveBeenCalled();
    expect(requestSpeech).not.toHaveBeenCalled();
  });

  it("gates the microphone through TTS playback and does not create an echo turn", async () => {
    await start();
    transport.transcript = "Guten Morgen";
    internals(client).beginTurn(now);
    now += 2_000;
    const completion = internals(client).finishTurn(now, 1_000);
    await flush();
    expect(stream.track.enabled).toBe(false);
    expect(client.getSnapshot().phase).toBe("speaking");
    context.analyser.speaking = true;
    internals(client).sampleAudio();
    expect(client.getSnapshot().turns).toHaveLength(1);
    audios.at(-1)?.end();
    await completion;
    expect(stream.track.enabled).toBe(true);
    expect(client.getSnapshot().turns).toHaveLength(1);
  });

  it("stops generated audio once and resumes listening without committing playback", async () => {
    await start();
    transport.transcript = "Guten Morgen";
    internals(client).beginTurn(now);
    now += 2_000;
    const completion = internals(client).finishTurn(now, 1_000);
    await flush();
    client.stopAudio();
    await completion;
    expect(audios.at(-1)?.pause).toHaveBeenCalledOnce();
    expect(client.getSnapshot().phase).toBe("listening");
    expect(client.getSnapshot().turns).toHaveLength(1);
    expect(client.getSnapshot().turns[0].errorCode).toBe("playback_stopped_by_user");
  });

  it("uses the selected speed and cleans up on reconnect and session end", async () => {
    expect(client.setTtsSpeed(1.15)).toBe(true);
    await start();
    await completeTurn("Guten Morgen");
    expect(requestSpeech.mock.calls[0][2]).toBe(1.15);
    await client.reconnect();
    expect(transport.disconnect).toHaveBeenCalled();
    internals(client).beginTurn(now);
    client.stop();
    expect(client.getSnapshot().turns.at(-1)).toMatchObject({
      status: "discarded",
      errorCode: "session_ended",
    });
    expect(stream.track.stop).toHaveBeenCalled();
  });
});
