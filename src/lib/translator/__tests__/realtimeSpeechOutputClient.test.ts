import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClassicRealtimeSpeechOutputClient,
  EXACT_TERRA_READ_INSTRUCTION,
} from "@/lib/translator/realtimeSpeechOutputClient";

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
    srcObject: null as MediaProvider | null,
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
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

  it("aborts before playback without calling audio.play", async () => {
    const { audio, client } = createHarness();
    const controller = new AbortController();
    const render = client.render("Habari", "sw", controller.signal);
    controller.abort();
    await expect(render).rejects.toMatchObject({ name: "AbortError" });
    expect(audio.play).not.toHaveBeenCalled();
  });
});
