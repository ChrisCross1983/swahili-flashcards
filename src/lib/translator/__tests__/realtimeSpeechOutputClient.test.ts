import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClassicRealtimeSpeechOutputClient,
  EXACT_TERRA_READ_INSTRUCTION,
} from "@/lib/translator/realtimeSpeechOutputClient";
import { RealtimeSpeechOutputPlayer } from "@/lib/translator/realtimeSpeechOutputPlayer";
import type { TranslatorSpeechPlaybackOptions } from "@/lib/translator/translatorSpeechPlayer";
import type { TranslationEntry } from "@/lib/translator/types";

class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

class FakePeer {
  connectionState: RTCPeerConnectionState = "new";
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new FakeDataChannel();
  addTransceiver = vi.fn();
  createDataChannel = vi.fn(() => this.channel as unknown as RTCDataChannel);
  createOffer = vi.fn(async () => ({ type: "offer" as RTCSdpType, sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => {
    this.channel.readyState = "open";
    this.channel.onopen?.();
  });
  close = vi.fn();
}

afterEach(() => vi.unstubAllGlobals());

function createHarness(useBrowserFetch = false) {
  const peer = new FakePeer();
  const audio = {
    autoplay: false,
    muted: false,
    srcObject: null as MediaProvider | null,
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onplaying: null as (() => void) | null,
    pause: vi.fn(),
    play: vi.fn(async () => undefined),
  };
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      clientSecret: "secret", expiresAt: 1, model: "gpt-realtime-2.1-mini", voice: "alloy",
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response("answer-sdp", { status: 200 }));
  const client = new ClassicRealtimeSpeechOutputClient({
    ...(useBrowserFetch ? {} : { fetcher }),
    createPeerConnection: () => peer as unknown as RTCPeerConnection,
    createAudio: () => audio,
    createMediaStream: () => ({}) as MediaStream,
  });
  return { peer, audio, fetcher, client };
}

describe("ClassicRealtimeSpeechOutputClient", () => {
  it("keeps the Window receiver when using browser fetch for session and SDP", async () => {
    const browserFetch = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      if (this !== globalThis) {
        throw new TypeError("Can only call Window.fetch on instances of Window");
      }
      return Promise.resolve(input === "/api/translator/realtime-speech/session"
        ? new Response(JSON.stringify({
          clientSecret: "secret", expiresAt: 1, model: "gpt-realtime-2.1-mini", voice: "alloy",
        }), { status: 200 })
        : new Response("answer-sdp", { status: 200 }));
    });
    vi.stubGlobal("fetch", browserFetch);
    const { peer, audio, client } = createHarness(true);

    const render = client.render("Habari", "sw", new AbortController().signal);
    await vi.waitFor(() => expect(peer.channel.send).toHaveBeenCalledTimes(2));
    expect(browserFetch).toHaveBeenCalledTimes(2);
    peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    audio.onended?.();
    await expect(render).resolves.toBeUndefined();
  });

  it("sends the exact Terra text on the WebRTC event channel and plays the remote track", async () => {
    const { peer, audio, client } = createHarness();
    const onPlaybackStarted = vi.fn();
    const render = client.render("Kijiji kiko mbali.", "sw", new AbortController().signal, {
      onPlaybackStarted,
    });
    await vi.waitFor(() => expect(peer.channel.send).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(peer.channel.send.mock.calls[0][0]))).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message", role: "user",
        content: [{ type: "input_text", text: "Kijiji kiko mbali." }],
      },
    });
    expect(JSON.parse(String(peer.channel.send.mock.calls[1][0]))).toMatchObject({
      type: "response.create",
      response: { modalities: ["audio"], instructions: EXACT_TERRA_READ_INSTRUCTION },
    });
    peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
    await vi.waitFor(() => expect(onPlaybackStarted).toHaveBeenCalledOnce());
    expect(audio.play).toHaveBeenCalledOnce();
    audio.onended?.();
    await expect(render).resolves.toBeUndefined();
  });

  it("marks playback from playing even when WebKit leaves play() pending", async () => {
    const { peer, audio, client } = createHarness();
    audio.play.mockImplementation(() => new Promise<undefined>(() => {}));
    const onPlaybackStarted = vi.fn();
    const render = client.render("Habari", "sw", new AbortController().signal, {
      onPlaybackStarted,
    });
    await vi.waitFor(() => expect(peer.channel.send).toHaveBeenCalledTimes(2));

    peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
    expect(audio.autoplay).toBe(true);
    expect(audio.muted).toBe(false);
    expect(onPlaybackStarted).not.toHaveBeenCalled();
    audio.onplaying?.();
    expect(onPlaybackStarted).toHaveBeenCalledOnce();
    audio.onended?.();
    await expect(render).resolves.toBeUndefined();
  });

  it("does not mark the negotiated track as playing before response.create", async () => {
    vi.useFakeTimers();
    try {
      const { peer, audio, client } = createHarness();
      audio.play.mockImplementation(() => new Promise<undefined>(() => {}));
      peer.setRemoteDescription.mockImplementation(async () => {
        peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
        peer.channel.readyState = "open";
        peer.channel.onopen?.();
      });
      const onPlaybackStarted = vi.fn();
      const render = client.render("Habari", "sw", new AbortController().signal, { onPlaybackStarted });
      await vi.advanceTimersByTimeAsync(0);

      expect(audio.play).toHaveBeenCalledOnce();
      expect(peer.channel.send).toHaveBeenCalledTimes(2);
      expect(onPlaybackStarted).not.toHaveBeenCalled();
      audio.onplaying?.();
      expect(onPlaybackStarted).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(5_001);
      expect(peer.close).not.toHaveBeenCalled();

      audio.onended?.();
      await expect(render).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails after five seconds when a remote track arrives before setup but play stays pending", async () => {
    vi.useFakeTimers();
    try {
      const { peer, audio, client } = createHarness();
      audio.play.mockImplementation(() => new Promise<undefined>(() => {}));
      peer.setRemoteDescription.mockImplementation(() => {
        peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
        return new Promise<void>(() => {});
      });
      const onTelemetry = vi.fn();
      const onPlaybackStarted = vi.fn();
      const playLegacy = vi.fn(async (
        _entry: TranslationEntry,
        _speed: number,
        options: TranslatorSpeechPlaybackOptions,
      ) => {
        options.onPlaybackStarted?.();
      });
      const player = new RealtimeSpeechOutputPlayer({ client, playLegacy });
      const play = player.play({
        id: "turn-pending", timestamp: 1, sourceLanguage: "de", targetLanguage: "sw",
        originalText: "Hallo", translatedText: "Habari", sourceWasDetected: false,
      }, 1, {
        autoplay: true,
        onSpeechDiagnosticsUpdated: onTelemetry,
        onPlaybackStarted,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(audio.play).toHaveBeenCalledOnce();
      expect(onTelemetry).toHaveBeenCalledWith(expect.objectContaining({
        ttsRealtimeFirstAudioRenderableAt: expect.any(String),
      }));
      expect(onTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({
        ttsRealtimePeerConnectionReadyAt: expect.any(String),
      }));
      expect(peer.channel.send).not.toHaveBeenCalled();
      audio.onplaying?.();
      expect(onPlaybackStarted).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(play).resolves.toBeUndefined();
      expect(playLegacy).toHaveBeenCalledOnce();
      expect(playLegacy).toHaveBeenCalledWith(expect.any(Object), 1, expect.objectContaining({ autoplay: true }));
      expect(onTelemetry).toHaveBeenCalledWith(expect.objectContaining({
        ttsRealtimeFallbackUsed: true,
        ttsRealtimeFallbackReason: "realtime_playback_start_timeout",
        ttsRealtimeFallbackStartedAt: expect.any(String),
      }));
      expect(onPlaybackStarted).toHaveBeenCalledOnce();
      expect(audio.pause).toHaveBeenCalled();
      expect(peer.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("automatically falls back when WebKit rejects play() before playback", async () => {
    const { peer, audio, client } = createHarness();
    audio.play.mockRejectedValue(new DOMException("Autoplay blocked", "NotAllowedError"));
    const playLegacy = vi.fn(async () => undefined);
    const onTelemetry = vi.fn();
    const player = new RealtimeSpeechOutputPlayer({ client, playLegacy });
    const play = player.play({
      id: "turn-blocked", timestamp: 1, sourceLanguage: "de", targetLanguage: "sw",
      originalText: "Hallo", translatedText: "Habari", sourceWasDetected: false,
    }, 1, { autoplay: true, onSpeechDiagnosticsUpdated: onTelemetry });

    await vi.waitFor(() => expect(peer.channel.send).toHaveBeenCalledTimes(2));
    peer.ontrack?.({ streams: [{} as MediaStream], track: {} as MediaStreamTrack } as unknown as RTCTrackEvent);
    await expect(play).resolves.toBeUndefined();

    expect(playLegacy).toHaveBeenCalledOnce();
    expect(playLegacy).toHaveBeenCalledWith(expect.any(Object), 1, expect.objectContaining({ autoplay: true }));
    expect(onTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      ttsRealtimeFallbackUsed: true,
      ttsRealtimeFallbackReason: "Autoplay blocked",
    }));
  });

  it("aborts before playback without calling audio.play", async () => {
    const { audio, client } = createHarness();
    const controller = new AbortController();
    const render = client.render("Habari", "sw", controller.signal);
    controller.abort();
    await expect(render).rejects.toMatchObject({ name: "AbortError" });
    expect(audio.play).not.toHaveBeenCalled();
  });
});
