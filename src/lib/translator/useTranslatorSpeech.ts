"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TranslationEntry } from "@/lib/translator/types";
import { requestTranslatorSpeech } from "@/lib/translator/speechClient";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";

export function useTranslatorSpeech() {
  const playerRef = useRef<TranslatorSpeechPlayer | null>(null);

  if (playerRef.current === null) {
    playerRef.current = new TranslatorSpeechPlayer({
      requestSpeech: (entry, speed, signal) =>
        requestTranslatorSpeech(entry.translatedText, entry.targetLanguage, speed, {
          signal,
        }),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      createAudio: (url) => new Audio(url),
    });
  }

  useEffect(
    () => () => {
      playerRef.current?.dispose();
    },
    [],
  );

  const playTranslation = useCallback((
    entry: TranslationEntry,
    speed: number,
    autoplay: boolean,
    onPlaybackStarted?: () => void,
  ) => {
    const player = playerRef.current;
    if (!player) return Promise.reject(new Error("Speech player unavailable"));
    return player.play(entry, speed, { autoplay, onPlaybackStarted });
  }, []);

  const pausePlayback = useCallback(() => {
    return playerRef.current?.pausePlayback() ?? false;
  }, []);

  const resumePlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return Promise.reject(new Error("Speech player unavailable"));
    return player.resumePlayback();
  }, []);

  const stopPlayback = useCallback(() => {
    playerRef.current?.stopPlayback();
  }, []);

  const clearCache = useCallback(() => {
    playerRef.current?.clearCache();
  }, []);

  return {
    playTranslation,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearCache,
  };
}
