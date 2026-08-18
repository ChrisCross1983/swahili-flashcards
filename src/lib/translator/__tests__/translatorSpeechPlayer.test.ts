import { describe, expect, it, vi } from "vitest";
import type { TranslationEntry } from "@/lib/translator/types";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";

const entry: TranslationEntry = {
  id: "translation-1",
  timestamp: 1_700_000_000_000,
  sourceLanguage: "de",
  targetLanguage: "sw",
  originalText: "Guten Morgen.",
  translatedText: "Habari za asubuhi.",
};

type FakeAudio = HTMLAudioElement & {
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

function createHarness() {
  const audios: FakeAudio[] = [];
  const requestSpeech = vi.fn(async () =>
    Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
  );
  const createObjectUrl = vi.fn(() => "blob:translation-1");
  const revokeObjectUrl = vi.fn();
  const createAudio = vi.fn(() => {
    const audio = {
      currentTime: 5,
      onended: null,
      onerror: null,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      preload: "",
    } as unknown as FakeAudio;
    audios.push(audio);
    return audio;
  });
  const player = new TranslatorSpeechPlayer({
    requestSpeech,
    createObjectUrl,
    revokeObjectUrl,
    createAudio,
  });

  return {
    audios,
    requestSpeech,
    createObjectUrl,
    revokeObjectUrl,
    player,
  };
}

async function waitForAudio(audios: FakeAudio[], count: number) {
  await vi.waitFor(() => expect(audios).toHaveLength(count));
}

function finishAudio(audio: FakeAudio) {
  audio.onended?.call(audio, new Event("ended"));
}

describe("TranslatorSpeechPlayer", () => {
  it("generates audio on first replay and reuses the local cache", async () => {
    const harness = createHarness();

    const firstPlayback = harness.player.play(entry);
    await waitForAudio(harness.audios, 1);
    finishAudio(harness.audios[0]);
    await firstPlayback;

    const secondPlayback = harness.player.play(entry);
    await waitForAudio(harness.audios, 2);
    finishAudio(harness.audios[1]);
    await secondPlayback;

    expect(harness.requestSpeech).toHaveBeenCalledOnce();
    expect(harness.createObjectUrl).toHaveBeenCalledOnce();
    expect(harness.player.hasCachedAudio(entry.id)).toBe(true);
  });

  it("stops the current audio before another playback starts", async () => {
    const harness = createHarness();

    const firstPlayback = harness.player.play(entry);
    await waitForAudio(harness.audios, 1);
    const secondPlayback = harness.player.play(entry);
    await waitForAudio(harness.audios, 2);

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.audios[0].currentTime).toBe(0);
    await firstPlayback;
    finishAudio(harness.audios[1]);
    await secondPlayback;
  });

  it("stops playback and revokes cached object URLs when history is cleared", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry);
    await waitForAudio(harness.audios, 1);

    harness.player.clearCache();

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:translation-1");
    expect(harness.player.hasCachedAudio(entry.id)).toBe(false);
    await playback;
  });

  it("stops audio and releases URLs when disposed on unmount", async () => {
    const harness = createHarness();
    const playback = harness.player.play(entry);
    await waitForAudio(harness.audios, 1);

    harness.player.dispose();

    expect(harness.audios[0].pause).toHaveBeenCalledOnce();
    expect(harness.revokeObjectUrl).toHaveBeenCalledOnce();
    await playback;
    await expect(harness.player.play(entry)).rejects.toThrow(
      "Speech player is disposed",
    );
  });

  it("does not start delayed audio after a pending request was stopped", async () => {
    let resolveRequest!: (blob: Blob) => void;
    const requestSpeech = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const createAudio = vi.fn();
    const player = new TranslatorSpeechPlayer({
      requestSpeech,
      createObjectUrl: vi.fn(() => "blob:late"),
      revokeObjectUrl: vi.fn(),
      createAudio,
    });

    const playback = player.play(entry);
    await vi.waitFor(() => expect(requestSpeech).toHaveBeenCalledOnce());
    player.stopPlayback();
    resolveRequest(new Blob(["audio"], { type: "audio/mpeg" }));

    await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(createAudio).not.toHaveBeenCalled();
  });
});
