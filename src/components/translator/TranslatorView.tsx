"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import TranslationFeedbackSheet from "@/components/translator/TranslationFeedbackSheet";
import type { SavedTranslatorFeedback } from "@/components/translator/TranslationFeedbackSheet";
import {
  getTranslationRequestDirection,
  initialTranslatorState,
  translatorReducer,
} from "@/lib/translator/stateMachine";
import { getAudioRecorderErrorMessage } from "@/lib/translator/audioRecorder";
import { useAudioRecorder } from "@/lib/translator/useAudioRecorder";
import {
  createTranslationEntry,
  getTranslatorClientErrorMessage,
} from "@/lib/translator/client";
import {
  getTranslatorSpeechFailure,
  isSpeechAbortError,
  type TranslatorSpeechFailureKind,
} from "@/lib/translator/speechClient";
import { useTranslatorSpeech } from "@/lib/translator/useTranslatorSpeech";
import type {
  TranslationDiagnostics,
  TranslationEntry,
} from "@/lib/translator/types";
import { TranslatorTurnPerformance } from "@/lib/translator/turnPerformance";
import { RealtimeTranscriptionClientV2 } from "@/lib/translator/live/v2/realtimeTranscriptionClient";
import {
  ClassicRealtimeSessionManager,
  type ClassicRealtimeTurnHandle,
} from "@/lib/translator/classicRealtimeSessionManager";
import { requestClassicTranslation } from "@/lib/translator/classicTranslationPipeline";
import {
  buildClassicTranslatorReport,
  downloadClassicTranslatorReport,
  type ClassicTranslatorFailedTurn,
} from "@/lib/translator/classicReport";
import {
  DEFAULT_SPEECH_SPEED,
  formatSpeechSpeed,
  MAX_SPEECH_SPEED,
  MIN_SPEECH_SPEED,
  SPEECH_SPEED_STEP,
} from "@/lib/translator/speechSpeed";

export default function TranslatorView() {
  const [state, dispatch] = useReducer(translatorReducer, initialTranslatorState);
  const [speechFeedback, setSpeechFeedback] = useState<{
    kind: TranslatorSpeechFailureKind;
    message: string;
  } | null>(null);
  const [speechSpeed, setSpeechSpeed] = useState(DEFAULT_SPEECH_SPEED);
  const [feedbackEntryId, setFeedbackEntryId] = useState<string | null>(null);
  const [savedFeedbackIds, setSavedFeedbackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const translationInFlightRef = useRef(false);
  const recordingStartInFlightRef = useRef(false);
  const playbackInFlightRef = useRef(false);
  const playbackRunIdRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const turnPerformanceByEntryRef = useRef(
    new Map<string, TranslatorTurnPerformance>(),
  );
  const pendingTranslationVisibleEntryIdRef = useRef<string | null>(null);
  const activeTurnPerformanceRef = useRef<TranslatorTurnPerformance | null>(
    null,
  );
  const realtimeManagerRef = useRef<ClassicRealtimeSessionManager | null>(null);
  const activeRealtimeTurnRef = useRef<ClassicRealtimeTurnHandle | null>(null);
  const mountedRef = useRef(true);
  const {
    status: recorderStatus,
    acquireMicrophone,
    prepareRecording,
    startPreparedRecording,
    stopRecording,
    suspendMicrophone,
    releaseMicrophone,
    disposeRecorder,
    error: recorderError,
    clearError: clearRecorderError,
  } = useAudioRecorder();
  const {
    playTranslation,
    preparePlaybackForUserGesture,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearCache,
  } = useTranslatorSpeech();
  const [playbackReady, setPlaybackReady] = useState(false);
  const [failedReportTurns, setFailedReportTurns] = useState<
    ClassicTranslatorFailedTurn[]
  >([]);
  const reportStartedAtRef = useRef(new Date().toISOString());
  const reportIdRef = useRef(
    globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`,
  );
  const activeTurnCreatedAtRef = useRef<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const audioMetadataByTurnRef = useRef(
    new Map<string, { audioMimeType: string | null; audioSize: number | null }>(),
  );
  const feedbackByTurnRef = useRef(new Map<string, SavedTranslatorFeedback>());

  const getRealtimeManager = useCallback(() => {
    if (realtimeManagerRef.current) return realtimeManagerRef.current;
    const manager = new ClassicRealtimeSessionManager({
      createTransport: (handlers) =>
        new RealtimeTranscriptionClientV2(handlers),
      releaseMicrophone: () => {
        releaseMicrophone();
      },
    });
    realtimeManagerRef.current = manager;
    return manager;
  }, [releaseMicrophone]);

  const updateEntryDiagnostics = useCallback((
    entry: TranslationEntry,
    diagnostics: Partial<TranslationDiagnostics>,
    phase: string,
  ) => {
    dispatch({
      type: "UPDATE_ENTRY_DIAGNOSTICS",
      entryId: entry.id,
      diagnostics,
    });
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[translator][turn performance][client] ${JSON.stringify({
          phase,
          transcriptionModel: entry.diagnostics?.transcriptionModel,
          transcriptionFallbackUsed:
            entry.diagnostics?.transcriptionFallbackUsed,
          autoplayEnabled: entry.diagnostics?.autoplayEnabled,
          ...diagnostics,
        })}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!recorderError) return;
    dispatch({ type: "RECORDING_FAILED", message: recorderError });
  }, [recorderError]);

  useEffect(() => {
    const entryId = pendingTranslationVisibleEntryIdRef.current;
    if (!entryId) return;
    const entry = state.entries.find((candidate) => candidate.id === entryId);
    const performance = turnPerformanceByEntryRef.current.get(entryId);
    if (!entry || !performance) return;

    pendingTranslationVisibleEntryIdRef.current = null;
    updateEntryDiagnostics(
      entry,
      performance.markTranslationVisible(),
      "translationVisible",
    );
  }, [state.entries, updateEntryDiagnostics]);

  useEffect(
    () => () => {
      requestAbortRef.current?.abort();
      realtimeManagerRef.current?.close("classic_unmount");
      realtimeManagerRef.current = null;
      activeRealtimeTurnRef.current = null;
      activeTurnPerformanceRef.current = null;
    },
    [],
  );
  useEffect(() => {
    const handlePageHide = () => {
      requestAbortRef.current?.abort();
      stopPlayback();
      realtimeManagerRef.current?.close("classic_page_hide");
      realtimeManagerRef.current = null;
      activeRealtimeTurnRef.current = null;
      activeTurnPerformanceRef.current = null;
      disposeRecorder();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [disposeRecorder, stopPlayback]);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const recorderBusy =
    recorderStatus === "starting" || recorderStatus === "stopping";
  const controlsLocked = state.status !== "idle" || recorderBusy;
  const feedbackEntry = feedbackEntryId
    ? state.entries.find((entry) => entry.id === feedbackEntryId) ?? null
    : null;

  async function handleStartRecording() {
    if (recordingStartInFlightRef.current) return;
    if (
      state.status !== "idle" &&
      state.status !== "playing" &&
      state.status !== "paused"
    ) {
      return;
    }
    recordingStartInFlightRef.current = true;
    if (state.status === "playing" || state.status === "paused") {
      handleStopPlayback();
    }
    if (state.autoPlay) preparePlaybackForUserGesture();
    setSpeechFeedback(null);
    activeTurnCreatedAtRef.current = new Date().toISOString();
    activeTurnIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
    const turnPerformance = new TranslatorTurnPerformance({
      recordButtonClicked: performance.now(),
    });
    activeTurnPerformanceRef.current = turnPerformance;
    let realtimeTurn: ClassicRealtimeTurnHandle | null = null;
    try {
      turnPerformance.markGetUserMediaStarted();
      const stream = await acquireMicrophone();
      turnPerformance.markGetUserMediaReady();
      await prepareRecording();
      turnPerformance.markMediaRecorderPrepared();
      realtimeTurn = await getRealtimeManager().prepareTurn(
        stream,
        () => turnPerformance.markFirstTranscriptDelta(),
      );
      activeRealtimeTurnRef.current = realtimeTurn;
      turnPerformance.markTranscriptionPathDecision(realtimeTurn);
      if (!mountedRef.current) return;
      await startPreparedRecording();
      turnPerformance.markRecordingStarted();
      dispatch({ type: "START_RECORDING" });
      getRealtimeManager().recordingStarted(realtimeTurn, stream);
    } catch (error) {
      if (realtimeTurn) {
        await getRealtimeManager().abortTurn(realtimeTurn);
      }
      activeRealtimeTurnRef.current = null;
      suspendMicrophone();
      const message = getAudioRecorderErrorMessage(error);
      const direction = getTranslationRequestDirection(state.mode);
      setFailedReportTurns((current) => [
        ...current,
        {
          turnId:
            activeTurnIdRef.current ??
            globalThis.crypto?.randomUUID?.() ??
            `failed-${Date.now()}`,
          createdAt:
            activeTurnCreatedAtRef.current ?? new Date().toISOString(),
          mode: state.mode,
          sourceLanguage:
            direction.sourceLanguage === "auto"
              ? null
              : direction.sourceLanguage,
          targetLanguage:
            direction.targetLanguage === "auto"
              ? null
              : direction.targetLanguage,
          diagnostics: turnPerformance.getDiagnostics(),
          transcriptionModel: realtimeTurn ? "gpt-live-transcribe" : null,
          translationModel: "gpt-5.6-terra",
          ttsModel: "gpt-4o-mini-tts",
          ttsSpeed: speechSpeed,
          errorCode: "recording_failed",
          errorStage: "recording_setup",
          errorType: error instanceof Error ? error.name : "UnknownError",
          sanitizedErrorMessage: message,
        },
      ]);
      dispatch({
        type: "RECORDING_FAILED",
        message,
      });
      activeTurnPerformanceRef.current = null;
      activeTurnCreatedAtRef.current = null;
      activeTurnIdRef.current = null;
    } finally {
      recordingStartInFlightRef.current = false;
    }
  }

  async function handlePlayback(
    entry: TranslationEntry,
    automatic: boolean,
  ) {
    if (playbackInFlightRef.current) return;
    const runId = playbackRunIdRef.current + 1;
    playbackRunIdRef.current = runId;
    playbackInFlightRef.current = true;
    setPlaybackReady(false);
    setSpeechFeedback(null);
    if (!automatic) {
      dispatch({ type: "START_PLAYBACK", entryId: entry.id });
    }

    try {
      await playTranslation(
        entry,
        speechSpeed,
        automatic,
        (diagnostics) => {
          updateEntryDiagnostics(
            entry,
            { ...diagnostics, ttsSpeed: speechSpeed },
            "ttsGenerated",
          );
        },
        () => {
          turnPerformanceByEntryRef.current
            .get(entry.id)
            ?.markTtsRequestStarted();
        },
        () => {
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          if (performance) {
            updateEntryDiagnostics(
              entry,
              performance.markTtsReady(),
              "ttsReady",
            );
          }
        },
        () => {
          if (mountedRef.current && playbackRunIdRef.current === runId) {
            setPlaybackReady(true);
            const performance = turnPerformanceByEntryRef.current.get(entry.id);
            updateEntryDiagnostics(
              entry,
              {
                ...(performance?.markPlaybackStarted() ?? {}),
                ttsSpeed: speechSpeed,
                ...(automatic ? { autoplayBlocked: false } : {}),
              },
              "playbackStarted",
            );
          }
        },
        () => {
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          if (performance) {
            updateEntryDiagnostics(
              entry,
              performance.markPlaybackCompleted(),
              "playbackCompleted",
            );
          }
        },
        (diagnostics) => {
          updateEntryDiagnostics(
            entry,
            {
              ...diagnostics,
              ...(typeof diagnostics.ttsOpenAiTotalMs === "number"
                ? { ttsGenerationMs: diagnostics.ttsOpenAiTotalMs }
                : {}),
            },
            "ttsServerDiagnostics",
          );
        },
        () => {
          turnPerformanceByEntryRef.current
            .get(entry.id)
            ?.markTtsAudioPreparationStarted();
        },
        () => {
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          if (performance) {
            updateEntryDiagnostics(
              entry,
              performance.markTtsAudioPreparationCompleted(),
              "firstPlayableAudio",
            );
          }
        },
        () => {
          turnPerformanceByEntryRef.current.get(entry.id)?.markPlayRequested();
        },
      );
    } catch (error) {
      if (
        mountedRef.current &&
        playbackRunIdRef.current === runId &&
        !isSpeechAbortError(error)
      ) {
        const failure = getTranslatorSpeechFailure(error, automatic);
        setSpeechFeedback(failure);
        if (failure.kind === "autoplay-blocked") {
          updateEntryDiagnostics(
            entry,
            { autoplayBlocked: true },
            "autoplayBlocked",
          );
        }
      }
    } finally {
      if (playbackRunIdRef.current === runId) {
        playbackInFlightRef.current = false;
        if (mountedRef.current) {
          setPlaybackReady(false);
          dispatch({ type: "PLAYBACK_FINISHED" });
        }
      }
    }
  }

  function handlePausePlayback() {
    if (state.status !== "playing" || !playbackReady) return;
    if (pausePlayback()) dispatch({ type: "PAUSE_PLAYBACK" });
  }

  function handleResumePlayback() {
    if (state.status !== "paused") return;
    dispatch({ type: "RESUME_PLAYBACK" });
    void resumePlayback().catch(() => undefined);
  }

  function handleStopPlayback() {
    playbackRunIdRef.current += 1;
    playbackInFlightRef.current = false;
    setPlaybackReady(false);
    stopPlayback();
    dispatch({ type: "PLAYBACK_FINISHED" });
  }

  async function handleStopRecording() {
    if (state.status !== "recording" || translationInFlightRef.current) return;
    const turnPerformance =
      activeTurnPerformanceRef.current ??
      new TranslatorTurnPerformance({ recordingStarted: performance.now() });
    turnPerformance.markRecordingStopped();
    translationInFlightRef.current = true;
    const direction = getTranslationRequestDirection(state.mode);
    const audioBlobResult = stopRecording().then(
      (audioBlob) => ({ ok: true as const, audioBlob }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    dispatch({ type: "STOP_AND_TRANSLATE" });
    const abortController = new AbortController();
    requestAbortRef.current = abortController;
    let authoritativeTranscript: string | null = null;
    let errorStage = "transcription";

    try {
      const realtimeTurn = activeRealtimeTurnRef.current;
      activeRealtimeTurnRef.current = null;
      const realtimeResult = realtimeTurn
        ? await getRealtimeManager().finishTurn(realtimeTurn)
        : {
            ok: false as const,
            fallbackReason:
              "realtime_not_ready_at_recording_start" as const,
          };
      turnPerformance.setRealtimeSetupDuration(realtimeTurn?.realtimeSetupMs);
      suspendMicrophone();

      let transcriptionMs: number | undefined;
      if (realtimeResult.ok) {
        authoritativeTranscript = realtimeResult.authoritativeTranscript;
        turnPerformance.markTranscriptFinal();
        transcriptionMs = turnPerformance.getRecordingToTranscriptFinalMs();
      }
      if (realtimeResult.ok && transcriptionMs !== undefined) {
        turnPerformance.setTranscriptionOutcome("realtime");
      } else {
        turnPerformance.setTranscriptionOutcome(
          "audio_upload_fallback",
          realtimeResult.ok
            ? "transcript_not_finalized"
            : realtimeResult.fallbackReason,
        );
      }
      turnPerformance.markTranslationRequestStarted();
      errorStage = "translation";
      const result = await requestClassicTranslation({
        realtimeResult,
        transcriptionMs,
        getAudioBlob: async () => {
          const recordedAudio = await audioBlobResult;
          if (!recordedAudio.ok) throw recordedAudio.error;
          return recordedAudio.audioBlob;
        },
        direction,
        signal: abortController.signal,
        correlationId: activeTurnIdRef.current
          ? `translation-${activeTurnIdRef.current}`
          : undefined,
        onResponseCompleted: (now) =>
          turnPerformance.markTranslationClientResponseCompleted(now),
      });
      turnPerformance.markTranslationCompleted();
      if (!(realtimeResult.ok && transcriptionMs !== undefined)) {
        turnPerformance.setFallbackServerTimings(result.diagnostics);
      }
      const entry = createTranslationEntry(result, {
        id: activeTurnIdRef.current ?? undefined,
        sourceWasDetected: direction.sourceLanguage === "auto",
        diagnostics: {
          ttsSpeed: speechSpeed,
          autoplayEnabled: state.autoPlay,
          ...turnPerformance.getDiagnostics(),
        },
      });
      turnPerformanceByEntryRef.current.set(entry.id, turnPerformance);
      void audioBlobResult.then((recordedAudio) => {
        if (!recordedAudio.ok) return;
        audioMetadataByTurnRef.current.set(entry.id, {
          audioMimeType: recordedAudio.audioBlob.type || null,
          audioSize: recordedAudio.audioBlob.size,
        });
      });
      pendingTranslationVisibleEntryIdRef.current = entry.id;
      turnPerformance.markTranslationStateCommitted();
      dispatch({
        type: "PROCESSING_SUCCEEDED",
        entry,
      });
      if (state.autoPlay) void handlePlayback(entry, true);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const recordedAudio = await audioBlobResult;
        const message = recordedAudio.ok
          ? getTranslatorClientErrorMessage(error)
          : getAudioRecorderErrorMessage(recordedAudio.error);
        const diagnostics = turnPerformance.getDiagnostics();
        setFailedReportTurns((current) => [
          ...current,
          {
            turnId:
              activeTurnIdRef.current ??
              globalThis.crypto?.randomUUID?.() ??
              `failed-${Date.now()}`,
            createdAt:
              activeTurnCreatedAtRef.current ?? new Date().toISOString(),
            mode: state.mode,
            sourceLanguage:
              direction.sourceLanguage === "auto"
                ? null
                : direction.sourceLanguage,
            targetLanguage:
              direction.targetLanguage === "auto"
                ? null
                : direction.targetLanguage,
            diagnostics,
            originalText: authoritativeTranscript,
            transcriptionModel:
              diagnostics.transcriptionPath === "realtime"
                ? "gpt-live-transcribe"
                : "gpt-4o-mini-transcribe",
            translationModel: "gpt-5.6-terra",
            ttsModel: "gpt-4o-mini-tts",
            ttsSpeed: speechSpeed,
            audioMimeType:
              recordedAudio.ok && recordedAudio.audioBlob.type
                ? recordedAudio.audioBlob.type
                : null,
            audioSize: recordedAudio.ok
              ? recordedAudio.audioBlob.size
              : null,
            errorCode: recordedAudio.ok
              ? "processing_failed"
              : "recording_failed",
            errorStage: recordedAudio.ok ? errorStage : "recording_stop",
            errorType: error instanceof Error ? error.name : "UnknownError",
            sanitizedErrorMessage: message,
          },
        ]);
        dispatch(
          recordedAudio.ok
            ? {
                type: "PROCESSING_FAILED",
                message,
              }
            : {
                type: "PROCESSING_FAILED",
                message,
              },
        );
      }
    } finally {
      suspendMicrophone();
      requestAbortRef.current = null;
      translationInFlightRef.current = false;
      activeTurnPerformanceRef.current = null;
      activeTurnCreatedAtRef.current = null;
      activeTurnIdRef.current = null;
    }
  }

  function handleResetError() {
    clearRecorderError();
    dispatch({ type: "RESET_ERROR" });
  }

  function handleClearHistory() {
    realtimeManagerRef.current?.close("classic_history_cleared");
    realtimeManagerRef.current = null;
    activeRealtimeTurnRef.current = null;
    releaseMicrophone();
    clearCache();
    turnPerformanceByEntryRef.current.clear();
    audioMetadataByTurnRef.current.clear();
    feedbackByTurnRef.current.clear();
    pendingTranslationVisibleEntryIdRef.current = null;
    reportStartedAtRef.current = new Date().toISOString();
    reportIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`;
    setFailedReportTurns([]);
    setSpeechFeedback(null);
    setFeedbackEntryId(null);
    setSavedFeedbackIds(new Set());
    dispatch({ type: "CLEAR_HISTORY" });
  }

  function handleExportReport() {
    const connectionDiagnostics =
      realtimeManagerRef.current?.getConnectionDiagnostics() ?? {
        connectionAttempts: [],
        connectionAttemptsTotal: 0,
        connectionSuccesses: 0,
        connectionFailures: 0,
        reconnectCount: 0,
      };
    downloadClassicTranslatorReport(
      buildClassicTranslatorReport({
        reportId: reportIdRef.current,
        startedAt: reportStartedAtRef.current,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        currentMode: state.mode,
        ttsSpeed: speechSpeed,
        entries: state.entries,
        failedTurns: failedReportTurns,
        audioMetadataByTurn: audioMetadataByTurnRef.current,
        feedbackByTurn: feedbackByTurnRef.current,
        ...connectionDiagnostics,
      }),
    );
  }

  function handleFeedbackSaved(
    entryId: string,
    feedback: SavedTranslatorFeedback,
  ) {
    feedbackByTurnRef.current.set(entryId, feedback);
    setSavedFeedbackIds((current) => new Set(current).add(entryId));
  }

  return (
    <main className="min-h-screen bg-base px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-primary">Übersetzer</h1>
            <p className="mt-1 text-sm text-muted">Deutsch ↔ Kiswahili</p>
          </div>
          <Link className="btn btn-ghost min-h-11 shrink-0" href="/">
            Zurück
          </Link>
        </header>

        <section className="mt-6" aria-labelledby="direction-heading">
          <h2 id="direction-heading" className="sr-only">Übersetzungsrichtung</h2>
          <TranslationDirectionSelector
            mode={state.mode}
            disabled={controlsLocked}
            onChange={(mode) => dispatch({ type: "SET_MODE", mode })}
          />
        </section>

        <section className="panel mt-4 p-5 sm:p-6" aria-live="polite">
          {state.status === "idle" ? (
            <>
              <p className="text-center text-sm font-medium text-muted">Bereit</p>
              <button
                type="button"
                className="btn btn-primary mt-4 min-h-24 w-full touch-manipulation text-lg active:scale-[0.99]"
                disabled={recorderStatus !== "idle"}
                onClick={() => void handleStartRecording()}
              >
                {recorderStatus === "starting" || recorderStatus === "recording"
                  ? "Mikrofon wird geöffnet …"
                  : "Aufnahme starten"}
              </button>
            </>
          ) : null}

          {state.status === "recording" ? (
            <>
              <div className="flex items-center justify-center gap-3 text-accent-danger-strong">
                <span className="h-3 w-3 rounded-full bg-accent-danger motion-safe:animate-pulse" aria-hidden="true" />
                <p className="font-semibold">Aufnahme läuft …</p>
              </div>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-24 w-full touch-manipulation text-lg active:scale-[0.99]"
                disabled={recorderStatus === "stopping"}
                onClick={() => void handleStopRecording()}
              >
                {recorderStatus === "stopping" ? "Aufnahme wird beendet …" : "Fertig & übersetzen"}
              </button>
            </>
          ) : null}

          {state.status === "processing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <span className="h-8 w-8 rounded-full border-4 border-soft border-t-[color:var(--accent-cta)] motion-safe:animate-spin" aria-hidden="true" />
              <p className="mt-4 font-semibold">Wird übersetzt …</p>
            </div>
          ) : null}

          {state.status === "playing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <p className="font-semibold text-accent-success-strong">
                {playbackReady
                  ? "Wird vorgelesen …"
                  : "Sprachausgabe wird vorbereitet …"}
              </p>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-16 w-full text-base"
                onClick={handleStopPlayback}
              >
                <span aria-hidden="true">■</span> Sprachausgabe stoppen
              </button>
            </div>
          ) : null}

          {state.status === "paused" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <p className="font-semibold text-primary">Wiedergabe pausiert</p>
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-secondary min-h-12"
                  onClick={handleResumePlayback}
                >
                  <span aria-hidden="true">▶</span> Fortsetzen
                </button>
                <button
                  type="button"
                  className="btn btn-danger min-h-12"
                  onClick={handleStopPlayback}
                >
                  <span aria-hidden="true">■</span> Stop
                </button>
              </div>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="status-note status-warning">
              <p className="font-semibold">
                {recorderError ? "Aufnahme nicht möglich" : "Übersetzung nicht möglich"}
              </p>
              <p className="mt-1">{state.errorMessage}</p>
              <button
                type="button"
                className="btn btn-secondary mt-4 min-h-12 w-full"
                onClick={handleResetError}
              >
                Erneut versuchen
              </button>
            </div>
          ) : null}
        </section>

        {speechFeedback ? (
          <div
            className={`status-note mt-3 ${
              speechFeedback.kind === "autoplay-blocked"
                ? "status-info"
                : "status-warning"
            }`}
            role="status"
          >
            {speechFeedback.message}
          </div>
        ) : null}

        <section className="mt-4 border-y border-soft py-4" aria-label="Sprachausgabe">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-primary" htmlFor="translator-auto-play">
              Übersetzung automatisch vorlesen
            </label>
            <button
              id="translator-auto-play"
              type="button"
              role="switch"
              aria-checked={state.autoPlay}
              disabled={controlsLocked}
              className={`relative h-10 w-20 shrink-0 rounded-full border p-1 transition ${
                state.autoPlay
                  ? "border-success-strong bg-accent-success"
                  : "border-strong bg-surface-elevated"
              }`}
              onClick={() => dispatch({ type: "TOGGLE_AUTO_PLAY" })}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-primary shadow-soft transition ${
                  state.autoPlay ? "translate-x-8" : "translate-x-0"
                }`}
              >
                {state.autoPlay ? "AN" : "AUS"}
              </span>
            </button>
          </div>

          <div className="mt-3 border-t border-soft pt-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="font-medium text-primary" htmlFor="translator-speech-speed">
                Sprechtempo
              </label>
              <output
                className="min-w-12 text-right font-semibold tabular-nums text-primary"
                htmlFor="translator-speech-speed"
              >
                {formatSpeechSpeed(speechSpeed)}×
              </output>
            </div>
            <input
              id="translator-speech-speed"
              type="range"
              min={MIN_SPEECH_SPEED}
              max={MAX_SPEECH_SPEED}
              step={SPEECH_SPEED_STEP}
              value={speechSpeed}
              disabled={controlsLocked}
              aria-label={`Sprechtempo: ${formatSpeechSpeed(speechSpeed)}-fach`}
              className="h-11 w-full cursor-pointer touch-manipulation accent-[color:var(--accent-cta)] disabled:cursor-not-allowed disabled:opacity-60"
              onChange={(event) => setSpeechSpeed(Number(event.target.value))}
            />
          </div>
        </section>

        <section className="mt-7" aria-labelledby="conversation-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="conversation-heading" className="text-xl font-semibold">Gespräch</h2>
            <button
              type="button"
              className="btn btn-utility min-h-11 px-3 text-sm text-accent-danger-strong"
              disabled={
                (state.entries.length === 0 && failedReportTurns.length === 0) ||
                controlsLocked
              }
              onClick={handleClearHistory}
            >
              Gespräch löschen
            </button>
          </div>

          {state.entries.length === 0 ? (
            <div className="mt-3 border-y border-soft py-8 text-center text-sm text-muted">
              Noch keine Übersetzungen
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {state.entries.map((entry, index) => {
                const isActive = state.activePlaybackEntryId === entry.id;
                const playbackState = !isActive
                  ? "idle"
                  : state.status === "paused"
                    ? "paused"
                    : playbackReady
                      ? "playing"
                      : "preparing";

                return (
                  <TranslationCard
                    key={entry.id}
                    entry={entry}
                    isLatest={index === 0}
                    playbackState={playbackState}
                    playbackDisabled={controlsLocked}
                    feedbackDisabled={controlsLocked}
                    feedbackSaved={savedFeedbackIds.has(entry.id)}
                    onPlay={() => void handlePlayback(entry, false)}
                    onPause={handlePausePlayback}
                    onResume={handleResumePlayback}
                    onStop={handleStopPlayback}
                    onFeedback={() => setFeedbackEntryId(entry.id)}
                  />
                );
              })}
            </div>
          )}
          <div className="mt-4">
              <button
                type="button"
                className="btn btn-secondary min-h-12 w-full"
                onClick={handleExportReport}
              >
                Testreport exportieren
              </button>
              {process.env.NODE_ENV === "development" ? (
                <p className="mt-2 text-center text-xs text-muted">
                  Enthält Gespräch, Performance und technische Diagnostik – kein Audio.
                </p>
              ) : null}
          </div>
        </section>
      </div>
      <TranslationFeedbackSheet
        entry={feedbackEntry}
        open={Boolean(feedbackEntry)}
        onClose={() => setFeedbackEntryId(null)}
        onSaved={handleFeedbackSaved}
      />
    </main>
  );
}
