"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TranslationEntry } from "@/lib/translator/types";
import { requestTranslatorSpeech } from "@/lib/translator/speechClient";
import type { TranslatorSpeechGenerationDiagnostics } from "@/lib/translator/speechClient";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";
import type {
  TranslatorSpeechPlaybackIdentity,
  TranslatorSpeechPlaybackPosition,
} from "@/lib/translator/translatorSpeechPlayer";

export function useTranslatorSpeech() {
  const playerRef = useRef<TranslatorSpeechPlayer | null>(null);

  const createPlayer = useCallback(() =>
    new TranslatorSpeechPlayer({
      requestSpeech: (entry, speed, signal) =>
        requestTranslatorSpeech(entry.translatedText, entry.targetLanguage, speed, {
          signal,
          correlationId: `tts-${entry.id}`,
        }),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      createAudio: (url) => new Audio(url),
      isDocumentVisible: () => document.visibilityState === "visible",
    }), []);

  if (playerRef.current === null) {
    playerRef.current = createPlayer();
  }

  useEffect(() => {
    // React Strict Mode deliberately runs setup -> cleanup -> setup in
    // development. Recreate the player after that simulated cleanup instead
    // of leaving the hook bound to the disposed first instance.
    if (playerRef.current === null) playerRef.current = createPlayer();
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [createPlayer]);

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
    onPlaybackCompleted?: (position: TranslatorSpeechPlaybackPosition) => void,
    onSpeechDiagnosticsUpdated?: (
      diagnostics: Partial<TranslatorSpeechGenerationDiagnostics>,
    ) => void,
    onAudioPreparationStarted?: () => void,
    onAudioPreparationCompleted?: () => void,
    onPlayRequested?: () => void,
    onPlaybackAttempt?: (identity: TranslatorSpeechPlaybackIdentity) => void,
    onPlaybackInterrupted?: (position: TranslatorSpeechPlaybackPosition) => void,
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
      onPlaybackAttempt,
      onPlaybackInterrupted,
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

  const hasCachedTranslation = useCallback((entryId: string, speed: number) =>
    playerRef.current?.hasCachedAudio(entryId, speed) === true, []);

  const clearCache = useCallback(() => {
    playerRef.current?.clearCache();
  }, []);

  return {
    playTranslation,
    preparePlaybackForUserGesture,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    hasCachedTranslation,
    clearCache,
  };
}
