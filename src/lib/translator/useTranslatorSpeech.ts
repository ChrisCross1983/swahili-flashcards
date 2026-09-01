"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TranslationEntry } from "@/lib/translator/types";
import { requestTranslatorSpeech } from "@/lib/translator/speechClient";
import type { TranslatorSpeechGenerationDiagnostics } from "@/lib/translator/speechClient";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";

export function useTranslatorSpeech() {
  const playerRef = useRef<TranslatorSpeechPlayer | null>(null);

  if (playerRef.current === null) {
    playerRef.current = new TranslatorSpeechPlayer({
      requestSpeech: (entry, speed, signal) =>
        requestTranslatorSpeech(entry.translatedText, entry.targetLanguage, speed, {
          signal,
          correlationId: `tts-${entry.id}`,
        }),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      createAudio: (url) => new Audio(url),
      isDocumentVisible: () => document.visibilityState === "visible",
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
    onSpeechGenerated?: (
      diagnostics: TranslatorSpeechGenerationDiagnostics,
    ) => void,
    onSpeechRequestStarted?: () => void,
    onSpeechReady?: () => void,
    onPlaybackStarted?: () => void,
    onPlaybackCompleted?: () => void,
    onSpeechDiagnosticsUpdated?: (
      diagnostics: Partial<TranslatorSpeechGenerationDiagnostics>,
    ) => void,
    onAudioPreparationStarted?: () => void,
    onAudioPreparationCompleted?: () => void,
    onPlayRequested?: () => void,
  ) => {
    const player = playerRef.current;
    if (!player) return Promise.reject(new Error("Speech player unavailable"));
    return player.play(entry, speed, {
      autoplay,
      onSpeechGenerated,
      onSpeechRequestStarted,
      onSpeechReady,
      onPlaybackStarted,
      onPlaybackCompleted,
      onSpeechDiagnosticsUpdated,
      onAudioPreparationStarted,
      onAudioPreparationCompleted,
      onPlayRequested,
    });
  }, []);

  const preparePlaybackForUserGesture = useCallback(() => {
    playerRef.current?.prepareForUserGesture();
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
    preparePlaybackForUserGesture,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearCache,
  };
}
