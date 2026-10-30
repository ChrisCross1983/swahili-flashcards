import { describe, expect, it, vi } from "vitest";
import { RealtimeTtsQaPlayback } from "../realtimeTtsQaPlayback";

class Audio extends EventTarget {
  autoplay = false; muted = true; volume = 0; loop = false; src = ""; srcObject: unknown = null;
  paused = true; error = null;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; }); load = vi.fn(); setAttribute = vi.fn(); removeAttribute = vi.fn();
}
function setup() {
  const audio = new Audio(); const status = vi.fn(); const changed = vi.fn(); const completed = vi.fn(); let time = 1000;
  const playback = new RealtimeTtsQaPlayback(audio as unknown as HTMLAudioElement, "run", changed, status, () => time, completed);
  const track = Object.assign(new EventTarget(), { kind: "audio", id: "track", enabled: false, muted: false, readyState: "live", stop: vi.fn() });
  const stream = { id: "remote", getAudioTracks: () => [track], getTracks: () => [track] };
  const bind = () => playback.bind({ track, streams: [stream] } as unknown as RTCTrackEvent);
  const request = () => { playback.request(); playback.event({ type: "response.created", response: { id: "response", metadata: { qaRunId: "run" } } }); };
  const event = (type: string, response_id = "response") => playback.event({ type, response_id });
  return { completed, audio, status, playback, track, stream, bind, request, event, changed, time: (value: number) => { time = value; } };
}
describe("QA WebRTC playback", () => {
  it("primes synchronously and binds the remote stream to the same unmuted element", () => {
    const s = setup(); s.playback.prime(); expect(s.audio.play).toHaveBeenCalledOnce();
    s.bind(); expect(s.audio.srcObject).toBe(s.stream); expect(s.audio.play).toHaveBeenCalledTimes(2);
    expect(s.audio.autoplay).toBe(true); expect(s.audio.muted).toBe(false); expect(s.audio.volume).toBe(1);
    expect(s.track.enabled).toBe(true); expect(s.audio.loop).toBe(false);
  });
  it("reports play rejection and retries from the manual gesture", async () => {
    const s = setup(); s.bind();
    s.audio.play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    await s.playback.play("manual"); expect(s.status).toHaveBeenLastCalledWith(expect.stringContaining("iOS blockiert"));
    expect(s.playback.data.debug).toContainEqual(expect.objectContaining({ event: "play-failure", name: "NotAllowedError" }));
    await s.playback.play("manual"); expect(s.playback.data.debug.at(-1)?.event).toBe("play-success");
    expect(s.playback.data.firstAudiblePlaybackAt).toBeNull();
  });
  it("ignores setup, foreign and late events and never infers playing from receipt/completion", () => {
    const s = setup(); s.event("output_audio_buffer.started"); s.audio.dispatchEvent(new Event("playing"));
    expect(s.playback.data.firstAudioReceivedAt).toBeNull();
    s.request(); s.time(1200); s.event("output_audio_buffer.started", "old-response");
    expect(s.playback.data.firstAudioReceivedAt).toBeNull();
    s.bind(); s.event("output_audio_buffer.started");
    expect(s.playback.data.requestToFirstAudioMs).toBe(200);
    expect(s.playback.data.firstAudiblePlaybackAt).toBeNull(); expect(s.playback.data.totalLatencyMs).toBeNull();
    s.time(1300); s.audio.dispatchEvent(new Event("playing"));
    expect(s.playback.data.requestToPlayingMs).toBe(300);
    s.time(1500); s.event("response.output_audio.done"); expect(s.playback.data.requestToCompleteAudioMs).toBe(500);
    s.event("output_audio_buffer.stopped"); expect(s.playback.data.playbackEndedAt).toBeNull();
  });
  it("does not interrupt an already playing live track at output start", async () => {
    const s = setup(); s.bind(); await Promise.resolve(); s.request();
    const attempts = s.audio.play.mock.calls.length;
    s.event("output_audio_buffer.started"); s.event("output_audio_buffer.started");
    expect(s.audio.pause).not.toHaveBeenCalled();
    expect(s.audio.play).toHaveBeenCalledTimes(attempts);
    expect(s.playback.data.firstAudiblePlaybackAt).toBeNull();
  });
  it("cleans tracks, element and listeners and ignores pending play resolutions", async () => {
    const s = setup(); s.bind(); s.request(); s.playback.dispose(); const calls = s.changed.mock.calls.length;
    s.audio.dispatchEvent(new Event("playing")); s.track.dispatchEvent(new Event("unmute"));
    s.event("output_audio_buffer.started"); await Promise.resolve();
    expect(s.track.stop).toHaveBeenCalledOnce(); expect(s.audio.srcObject).toBeNull();
    expect(s.audio.load).toHaveBeenCalledOnce(); expect(s.changed).toHaveBeenCalledTimes(calls);
    expect(s.playback.data.totalLatencyMs).toBeNull();
  });
});

describe("response starts only after remote readiness", () => {
  it("does not accept primer playing, and waits for remote play plus playing", async () => {
    const s = setup(); s.playback.prime(); s.audio.dispatchEvent(new Event("playing"));
    await Promise.resolve();
    const ready = vi.fn(); const controller = new AbortController();
    const waiting = s.playback.waitUntilReady(controller.signal).then(ready);
    await Promise.resolve(); expect(ready).not.toHaveBeenCalled();
    s.bind(); await Promise.resolve(); expect(ready).not.toHaveBeenCalled();
    s.audio.dispatchEvent(new Event("playing")); await waiting;
    expect(ready).toHaveBeenCalledOnce();
    expect(s.playback.data.firstAudiblePlaybackAt).toBeNull();
    expect(s.playback.data.firstResponseMediaEventAt).toBeNull();
    expect(s.audio.srcObject).toBe(s.stream);
  });
  it("rejects pending readiness on abort and dispose", async () => {
    const s = setup(); const controller = new AbortController();
    const waiting = s.playback.waitUntilReady(controller.signal);
    controller.abort(); await expect(waiting).rejects.toThrow("Abgebrochen");
    const another = s.playback.waitUntilReady(new AbortController().signal);
    s.playback.dispose(); await expect(another).rejects.toThrow("Abgebrochen");
  });
});

it.each([false, true])("finishes once only after response.done AND buffer drain (reversed=%s)", (reversed) => {
  const s = setup(); s.request();
  const done = () => s.playback.event({ type: "response.done", response: { id: "response", status: "completed" } });
  const drain = () => s.event("output_audio_buffer.stopped");
  (reversed ? drain : done)(); expect(s.completed).not.toHaveBeenCalled();
  (reversed ? done : drain)(); expect(s.completed).toHaveBeenCalledOnce();
  done(); drain(); expect(s.completed).toHaveBeenCalledOnce();
  s.playback.dispose();
  const second = setup(); second.request(); done(); drain();
  expect(second.completed).not.toHaveBeenCalled();
});
