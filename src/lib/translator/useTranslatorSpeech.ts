"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TranslationDiagnostics, TranslationEntry } from "@/lib/translator/types";
import { requestTranslatorSpeech } from "@/lib/translator/speechClient";
import type { TranslatorSpeechGenerationDiagnostics } from "@/lib/translator/speechClient";
import { TranslatorSpeechPlayer } from "@/lib/translator/translatorSpeechPlayer";
import { FIRST_SENTENCE_FAST_TTS_FLAG, assessFirstSentenceForSpeech, resolveTranslatorTtsQaMode, splitFirstSentenceForSpeech } from "@/lib/translator/firstSentenceFastTts";
import { FirstSegmentNotStartedError, FirstSentenceSpeechPlayer } from "@/lib/translator/firstSentenceSpeechPlayer";
import { createCorrelationId } from "@/lib/translator/performanceHeaders";
import type {
  TranslatorSpeechPlaybackIdentity,
  TranslatorSpeechPlaybackPosition,
} from "@/lib/translator/translatorSpeechPlayer";

export function useTranslatorSpeech() {
  const playerRef = useRef<TranslatorSpeechPlayer | null>(null);
  const segmentedPlayerRef = useRef<FirstSentenceSpeechPlayer | null>(null);
  const activeSegmentedRef = useRef(false);
  const qaMode = () => resolveTranslatorTtsQaMode(
    typeof window === "undefined" ? "" : window.location.search,
  );

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

  const createSegmentedPlayer = useCallback(() =>
    new FirstSentenceSpeechPlayer({
      requestSpeech: (text, entry, speed, signal) =>
        requestTranslatorSpeech(text, entry.targetLanguage, speed, {
          signal,
          correlationId: createCorrelationId("tts"),
        }),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      createAudio: () => new Audio(),
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
    if (FIRST_SENTENCE_FAST_TTS_FLAG && segmentedPlayerRef.current === null) {
      segmentedPlayerRef.current = createSegmentedPlayer();
    }
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
      segmentedPlayerRef.current?.dispose();
      segmentedPlayerRef.current = null;
    };
  }, [createPlayer, createSegmentedPlayer]);

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
    onSegmentedDiagnostics?: (diagnostics: Partial<TranslationDiagnostics>) => void,
  ) => {
    const player = playerRef.current;
    if (!player) return Promise.reject(new Error("Speech player unavailable"));
    const options = {
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
      onSegmentedDiagnostics,
    };
    const mode = qaMode();
    onSegmentedDiagnostics?.({ translatorTtsQaMode: mode });
    if (FIRST_SENTENCE_FAST_TTS_FLAG && mode !== "legacy") {
      const { split, reason } = assessFirstSentenceForSpeech(entry.translatedText);
      onSegmentedDiagnostics?.({ segmentedTtsEligible: split !== null, segmentedTtsUsed: split !== null,
        segmentedTtsEligibilityReason: reason });
      const segmentedPlayer = segmentedPlayerRef.current;
      if (split && segmentedPlayer) {
        activeSegmentedRef.current = true;
        return segmentedPlayer.play(entry, speed, split, options).catch((error: unknown) => {
          if (!(error instanceof FirstSegmentNotStartedError)) throw error;
          segmentedPlayer.stopPlayback();
          activeSegmentedRef.current = false;
          return player.play(entry, speed, options);
        });
      }
    }
    if (FIRST_SENTENCE_FAST_TTS_FLAG && mode === "legacy") {
      onSegmentedDiagnostics?.({ segmentedTtsEligible: false, segmentedTtsUsed: false,
        segmentedTtsEligibilityReason: "qa_legacy_mode" });
    }
    activeSegmentedRef.current = false;
    return player.play(entry, speed, options);
  }, []);

  const preparePlaybackForUserGesture = useCallback(() => {
    playerRef.current?.prepareForUserGesture();
    if (qaMode() !== "legacy") segmentedPlayerRef.current?.prepareForUserGesture();
  }, []);

  const pausePlayback = useCallback(() => {
    return activeSegmentedRef.current
      ? segmentedPlayerRef.current?.pausePlayback() ?? false
      : playerRef.current?.pausePlayback() ?? false;
  }, []);

  const resumePlayback = useCallback(() => {
    const player = activeSegmentedRef.current ? segmentedPlayerRef.current : playerRef.current;
    if (!player) return Promise.reject(new Error("Speech player unavailable"));
    return player.resumePlayback();
  }, []);

  const stopPlayback = useCallback(() => {
    playerRef.current?.stopPlayback();
    segmentedPlayerRef.current?.stopPlayback();
  }, []);

  const hasCachedTranslation = useCallback((entry: TranslationEntry, speed: number) =>
    FIRST_SENTENCE_FAST_TTS_FLAG && qaMode() !== "legacy" &&
    splitFirstSentenceForSpeech(entry.translatedText)
      ? segmentedPlayerRef.current?.hasCachedAudio(entry.id, speed) === true
      : playerRef.current?.hasCachedAudio(entry.id, speed) === true, []);

  const clearCache = useCallback(() => {
    playerRef.current?.clearCache();
    segmentedPlayerRef.current?.clearCache();
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
