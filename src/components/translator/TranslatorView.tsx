"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import TranslationFeedbackSheet from "@/components/translator/TranslationFeedbackSheet";
import SpeechReviewPanel from "@/components/translator/SpeechReviewPanel";
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
  TranslatorClientError,
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
  type ClassicTranslatorAudioMetadata,
  type ClassicTranslatorFailedTurn,
} from "@/lib/translator/classicReport";
import {
  DEFAULT_SPEECH_SPEED,
  formatSpeechSpeed,
  MAX_SPEECH_SPEED,
  MIN_SPEECH_SPEED,
  SPEECH_SPEED_STEP,
} from "@/lib/translator/speechSpeed";
import {
  classifyTranslatorFailure,
  isUserAbort,
  TranslatorOperationError,
  type TranslatorFailure,
  type TranslatorRecoveryAction,
} from "@/lib/translator/reliability";
import {
  createTranslatorSessionId,
  DEFAULT_TRANSLATOR_DIAGNOSTICS_SETTINGS,
  getOrCreateInstallationId,
  loadTranslatorDiagnosticsSettings,
  saveTranslatorDiagnosticsSettings,
  type TranslatorDiagnosticsSettings,
} from "@/lib/translator/diagnosticsSettings";
import {
  detectTranslatorPlatform,
  getTranslatorBuildMetadata,
} from "@/lib/translator/diagnosticMetadata";
import {
  acceptSpeechQualityRecord,
  correctSpeechQualityRecord,
  createUnreviewedSpeechQualityRecord,
  type TranslatorSpeechQualitySample,
} from "@/lib/translator/speechQuality";
import {
  REMOTE_TRANSLATOR_TELEMETRY_ENABLED,
  TranslatorTelemetryQueue,
  type TranslatorTechnicalEvent,
} from "@/lib/translator/telemetry";
import {
  createTranslatorDiagnosticBundle,
  downloadTranslatorDiagnosticBundle,
} from "@/lib/translator/diagnosticBundle";
import {
  createTranslatorDiagnosticEvent,
  expectedFallbackKind,
  type TranslatorDiagnosticEvent,
  type TranslatorDiagnosticEventKind,
} from "@/lib/translator/diagnosticEvents";
import {
  prepareTranslatorConsentSettingChange,
  snapshotTranslatorConsent,
  speechAudioEligibleForTurn,
  type TranslatorConsentEvent,
  type TranslatorTurnConsent,
} from "@/lib/translator/turnConsent";
import {
  TranslatorAudioQualityMonitor,
  UNAVAILABLE_AUDIO_QUALITY,
  type TranslatorAudioCaptureMetadata,
  type TranslatorAudioQualityMetrics,
} from "@/lib/translator/audioQuality";

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
  const [diagnosticsSettings, setDiagnosticsSettings] =
    useState<TranslatorDiagnosticsSettings>(
      DEFAULT_TRANSLATOR_DIAGNOSTICS_SETTINGS,
    );
  const diagnosticsSettingsRef = useRef(diagnosticsSettings);
  const [, setQualityRevision] = useState(0);
  const [qaNextFailure, setQaNextFailure] = useState<
    "realtime" | "translation" | "tts" | "network" | null
  >(null);
  const buildMetadataRef = useRef(getTranslatorBuildMetadata());
  const sessionIdRef = useRef(createTranslatorSessionId());
  const installationIdRef = useRef<string | null>(null);
  const telemetryQueueRef = useRef<TranslatorTelemetryQueue | null>(null);
  const qualityByTurnRef = useRef(new Map<string, TranslatorSpeechQualitySample>());
  const audioBlobByTurnRef = useRef(new Map<string, Blob>());
  const audioIncludedInBundleTurnIdsRef = useRef(new Set<string>());
  const diagnosticEventsByTurnRef = useRef(new Map<string, TranslatorDiagnosticEvent[]>());
  const consentByTurnRef = useRef(new Map<string, TranslatorTurnConsent>());
  const consentEventsRef = useRef<TranslatorConsentEvent[]>([]);
  const audioQualityMonitorRef = useRef<TranslatorAudioQualityMonitor | null>(null);
  const audioCaptureByTurnRef = useRef(new Map<string, {
    metadata: TranslatorAudioCaptureMetadata;
    metrics: TranslatorAudioQualityMetrics;
  }>());
  const [failedSpeechReviewTurnIds, setFailedSpeechReviewTurnIds] = useState<string[]>([]);
  const translationInFlightRef = useRef(false);
  const recordingStartInFlightRef = useRef(false);
  const playbackInFlightRef = useRef(false);
  const playbackRunIdRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const turnPerformanceByEntryRef = useRef(
    new Map<string, TranslatorTurnPerformance>(),
  );
  const latestDiagnosticsByEntryRef = useRef(
    new Map<string, TranslationDiagnostics>(),
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
  const activeTurnStateBeforeRecordingRef = useRef<string | null>(null);
  const audioMetadataByTurnRef = useRef(
    new Map<string, ClassicTranslatorAudioMetadata>(),
  );
  const feedbackByTurnRef = useRef(new Map<string, SavedTranslatorFeedback>());

  useEffect(() => {
    const settings = loadTranslatorDiagnosticsSettings(localStorage);
    diagnosticsSettingsRef.current = settings;
    setDiagnosticsSettings(settings);
    installationIdRef.current = getOrCreateInstallationId(localStorage);
    telemetryQueueRef.current = new TranslatorTelemetryQueue({
      storage: localStorage,
      isEnabled: () =>
        REMOTE_TRANSLATOR_TELEMETRY_ENABLED &&
        diagnosticsSettingsRef.current.diagnosticsSharingEnabled,
    });
    if (REMOTE_TRANSLATOR_TELEMETRY_ENABLED && settings.diagnosticsSharingEnabled) {
      void telemetryQueueRef.current.flush();
    }
    const flushOnline = () => void telemetryQueueRef.current?.flush();
    window.addEventListener("online", flushOnline);
    return () => window.removeEventListener("online", flushOnline);
  }, []);

  const updateDiagnosticsSetting = useCallback(<K extends keyof TranslatorDiagnosticsSettings>(
    key: K,
    value: TranslatorDiagnosticsSettings[K],
  ) => {
    const change = prepareTranslatorConsentSettingChange(
      diagnosticsSettingsRef.current,
      key,
      value,
    );
    if (!change) return;
    consentEventsRef.current.push(change.event);
    diagnosticsSettingsRef.current = change.settings;
    setDiagnosticsSettings(change.settings);
    saveTranslatorDiagnosticsSettings(localStorage, change.settings);
    if (key === "diagnosticsSharingEnabled" && value === false) {
      telemetryQueueRef.current?.disable();
    }
    if (key === "speechSampleSharingEnabled" && value === false) {
      for (const turnId of audioBlobByTurnRef.current.keys()) {
        const consent = consentByTurnRef.current.get(turnId);
        if (!consent || !speechAudioEligibleForTurn(consent)) {
          audioBlobByTurnRef.current.delete(turnId);
        }
      }
    }
  }, []);

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

  const resetRecoverableResources = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    activeRealtimeTurnRef.current = null;
    translationInFlightRef.current = false;
    recordingStartInFlightRef.current = false;
    suspendMicrophone();
    clearRecorderError();
    if (recorderStatus === "error") disposeRecorder();
    audioQualityMonitorRef.current?.stop();
    audioQualityMonitorRef.current = null;
  }, [clearRecorderError, disposeRecorder, recorderStatus, suspendMicrophone]);

  const rememberDiagnosticEvent = useCallback((
    turnId: string,
    failure: TranslatorFailure,
    errorStage: string,
    eventKind: TranslatorDiagnosticEventKind,
    action: TranslatorRecoveryAction,
    recoverySucceeded: boolean | null,
    endpoint: string | null,
    qaScenarioId: string | null = null,
  ) => {
    const event = createTranslatorDiagnosticEvent({
      eventOrigin: qaScenarioId ? "qa_simulation" : "organic_runtime",
      eventKind,
      category: failure.category,
      stage: errorStage,
      endpoint,
      httpStatus: failure.httpStatus,
      apiCode: failure.apiErrorCode,
      retryable: failure.retryable,
      recoveryAction: action,
      recoverySucceeded,
      qaScenarioId,
      authFailureType: failure.authFailureType,
    });
    const current = diagnosticEventsByTurnRef.current.get(turnId) ?? [];
    diagnosticEventsByTurnRef.current.set(turnId, [...current, event]);
    return event;
  }, []);

  const rememberLocalAudio = useCallback((turnId: string, audioBlob: Blob) => {
    audioBlobByTurnRef.current.set(turnId, audioBlob);
    while (audioBlobByTurnRef.current.size > 20) {
      const oldestTurnId = audioBlobByTurnRef.current.keys().next().value;
      if (typeof oldestTurnId !== "string") break;
      audioBlobByTurnRef.current.delete(oldestTurnId);
    }
  }, []);

  const finalizeTurnConsent = useCallback((turnId: string) => {
    const current = consentByTurnRef.current.get(turnId);
    if (!current) return null;
    const finalized: TranslatorTurnConsent = {
      ...current,
      consentAtTurnFinalization: snapshotTranslatorConsent(
        diagnosticsSettingsRef.current,
      ),
    };
    consentByTurnRef.current.set(turnId, finalized);
    return finalized;
  }, []);

  const createSpeechReviewCandidate = useCallback((input: {
    turnId: string;
    recognizedTranscript: string;
    sourceLanguage: TranslationEntry["sourceLanguage"] | null;
    transcriptionModel: string;
    transcriptionPath: NonNullable<TranslationDiagnostics["transcriptionPath"]>;
    consent: TranslatorTurnConsent;
  }) => {
    if (
      !input.consent.consentAtRecordingStart.internalSpeechDiagnosticsEnabled ||
      input.consent.consentAtTurnFinalization?.internalSpeechDiagnosticsEnabled !== true ||
      !input.recognizedTranscript.trim()
    ) {
      return null;
    }
    const capture = audioCaptureByTurnRef.current.get(input.turnId);
    const record = createUnreviewedSpeechQualityRecord({
      turnId: input.turnId,
      createdAt: activeTurnCreatedAtRef.current ?? new Date().toISOString(),
      recognizedTranscript: input.recognizedTranscript,
      sourceLanguage: input.sourceLanguage,
      transcriptionModel: input.transcriptionModel,
      transcriptionPath: input.transcriptionPath,
      appVersion: buildMetadataRef.current.appVersion,
      audioEligible: speechAudioEligibleForTurn(input.consent),
      consentAtRecordingStart: input.consent.consentAtRecordingStart,
      audioMetadata: capture?.metadata,
      audioQualityMetrics: capture?.metrics ?? UNAVAILABLE_AUDIO_QUALITY,
    });
    qualityByTurnRef.current.set(input.turnId, record);
    setQualityRevision((current) => current + 1);
    return record;
  }, []);

  const enqueueTechnicalEvent = useCallback((input: {
    turnId: string;
    entry?: TranslationEntry;
    failure?: TranslatorFailure | null;
    diagnosticEvent?: TranslatorDiagnosticEvent | null;
    errorStage?: string | null;
    recoveryAction?: TranslatorRecoveryAction;
    recoverySucceeded?: boolean | null;
  }) => {
    const installationId = installationIdRef.current;
    if (!installationId || !diagnosticsSettingsRef.current.diagnosticsSharingEnabled) return;
    const entry = input.entry;
    const d = entry?.diagnostics;
    const platform = detectTranslatorPlatform(navigator.userAgent);
    const finite = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const event: TranslatorTechnicalEvent = {
      installationId,
      sessionId: sessionIdRef.current,
      turnId: input.turnId,
      timestamp: new Date().toISOString(),
      ...buildMetadataRef.current,
      ...platform,
      translatorMode: state.mode,
      sourceLanguage: entry?.sourceLanguage ?? null,
      targetLanguage: entry?.targetLanguage ?? null,
      transcriptionPath: d?.transcriptionPath ?? null,
      transcriptionModel: d?.transcriptionModel ?? null,
      translationModel: d?.translationModel ?? "gpt-5.6-terra",
      ttsModel: d?.ttsModel ?? "gpt-4o-mini-tts",
      warmStart: d?.warmStart === true,
      realtimeConnectionReused: d?.realtimeConnectionReused === true,
      fallbackReason: d?.fallbackReason ?? null,
      recordClickToRecordingStartedMs: finite(d?.recordClickToRecordingStartedMs),
      stopToTranscriptFinalMs: finite(d?.stopToTranscriptFinalMs),
      transcriptFinalToTranslationVisibleMs: finite(d?.transcriptFinalToTranslationVisibleMs),
      stopToPlaybackStartedMs: finite(d?.stopToPlaybackStartedMs),
      translationServerPreOpenAiMs: finite(d?.translationServerPreOpenAiMs),
      translationAuthMs: finite(d?.translationAuthMs),
      translationOpenAiTotalMs: finite(d?.translationOpenAiTotalMs),
      ttsServerPreOpenAiMs: finite(d?.ttsServerPreOpenAiMs),
      ttsAuthMs: finite(d?.ttsAuthMs),
      ttsOpenAiTimeToFirstByteMs: finite(d?.ttsOpenAiTimeToFirstByteMs),
      ttsOpenAiTotalMs: finite(d?.ttsOpenAiTotalMs),
      status: input.diagnosticEvent?.eventKind === "failure" ? "failure" : "success",
      failureCategory:
        input.diagnosticEvent?.category ?? input.failure?.category ?? null,
      httpStatus: input.diagnosticEvent?.httpStatus ?? input.failure?.httpStatus ?? null,
      apiErrorCode: input.diagnosticEvent?.apiCode ?? input.failure?.apiErrorCode ?? null,
      errorStage: input.diagnosticEvent?.stage ?? input.errorStage ?? null,
      retryable: input.diagnosticEvent?.retryable ?? input.failure?.retryable ?? false,
      recoveryAction:
        input.diagnosticEvent?.recoveryAction ?? input.recoveryAction ?? "none",
      recoverySucceeded:
        input.diagnosticEvent?.recoverySucceeded ?? input.recoverySucceeded ?? null,
      eventOrigin: input.diagnosticEvent?.eventOrigin ?? null,
      eventKind: input.diagnosticEvent?.eventKind ?? null,
      qaScenarioId: input.diagnosticEvent?.qaScenarioId ?? null,
      diagnosticEvents: diagnosticEventsByTurnRef.current.get(input.turnId) ?? [],
      consentAtRecordingStart:
        consentByTurnRef.current.get(input.turnId)?.consentAtRecordingStart ?? null,
      consentAtTurnFinalization:
        consentByTurnRef.current.get(input.turnId)?.consentAtTurnFinalization ?? null,
    };
    telemetryQueueRef.current?.enqueue(event);
  }, [state.mode]);

  const updateEntryDiagnostics = useCallback((
    entry: TranslationEntry,
    diagnostics: Partial<TranslationDiagnostics>,
    phase: string,
  ) => {
    latestDiagnosticsByEntryRef.current.set(entry.id, {
      ...entry.diagnostics,
      ...latestDiagnosticsByEntryRef.current.get(entry.id),
      ...diagnostics,
    } as TranslationDiagnostics);
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
    const failure = classifyTranslatorFailure(new Error(recorderError), "recording");
    const turnId = activeTurnIdRef.current;
    const realtimeTurn = activeRealtimeTurnRef.current;
    if (realtimeTurn) {
      void realtimeManagerRef.current?.abortTurn(realtimeTurn).catch(() => undefined);
    }
    if (
      turnId &&
      !(diagnosticEventsByTurnRef.current.get(turnId) ?? []).some(
        (event) => event.eventKind === "failure",
      )
    ) {
      const direction = getTranslationRequestDirection(state.mode);
      const consent = finalizeTurnConsent(turnId);
      const recorderEvent = rememberDiagnosticEvent(
        turnId,
        failure,
        "recorder_runtime",
        "failure",
        "reset_to_idle",
        true,
        null,
      );
      setFailedReportTurns((current) => [
        ...current,
        {
          turnId,
          createdAt: activeTurnCreatedAtRef.current ?? new Date().toISOString(),
          mode: state.mode,
          sourceLanguage: direction.sourceLanguage === "auto"
            ? null
            : direction.sourceLanguage,
          targetLanguage: direction.targetLanguage === "auto"
            ? null
            : direction.targetLanguage,
          diagnostics: activeTurnPerformanceRef.current?.getDiagnostics() ?? {},
          transcriptionModel: null,
          translationModel: "gpt-5.6-terra",
          ttsModel: "gpt-4o-mini-tts",
          ttsSpeed: speechSpeed,
          errorCode: "recording_failed",
          errorStage: "recorder_runtime",
          errorType: "MediaRecorderError",
          sanitizedErrorMessage: recorderError,
          stateBeforeRecording: activeTurnStateBeforeRecordingRef.current,
          stateAtFailure: state.status,
          stateAfterCleanup: "idle",
          recorderStatusBefore: recorderStatus,
          recorderStatusAtFailure: "error",
          recorderStatusAfterCleanup: "idle",
          realtimeManagerStateBefore: realtimeManagerRef.current?.getState() ?? null,
          realtimeManagerStateAtFailure: realtimeManagerRef.current?.getState() ?? null,
          realtimeManagerStateAfterCleanup: "idle",
          endpoint: null,
          httpStatus: failure.httpStatus,
          apiErrorCode: failure.apiErrorCode,
          failureCategory: failure.category,
          retryable: failure.retryable,
          recoveryAction: "reset_to_idle",
          recoverySucceeded: true,
          audioBlobAvailable: false,
          authCheckAttempted: false,
          authCheckSucceeded: null,
          authFailureType: failure.authFailureType,
        },
      ]);
      enqueueTechnicalEvent({
        turnId,
        failure,
        diagnosticEvent: recorderEvent,
        errorStage: "recorder_runtime",
        recoveryAction: "reset_to_idle",
        recoverySucceeded: true,
      });
      if (consent && !speechAudioEligibleForTurn(consent)) {
        audioBlobByTurnRef.current.delete(turnId);
      }
    }
    resetRecoverableResources();
    dispatch({
      type: "RECORDING_FAILED",
      message: recorderError,
      category: failure.category,
      healthStatus: failure.healthStatus,
    });
    activeTurnPerformanceRef.current = null;
    activeTurnCreatedAtRef.current = null;
    activeTurnIdRef.current = null;
    activeTurnStateBeforeRecordingRef.current = null;
  }, [
    enqueueTechnicalEvent,
    finalizeTurnConsent,
    recorderError,
    recorderStatus,
    rememberDiagnosticEvent,
    resetRecoverableResources,
    speechSpeed,
    state.mode,
    state.status,
  ]);

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
    const recovery = diagnosticEventsByTurnRef.current.get(entry.id)?.at(-1);
    enqueueTechnicalEvent({
      turnId: entry.id,
      entry: {
        ...entry,
        diagnostics: {
          ...entry.diagnostics,
          ...performance.getDiagnostics(),
        } as TranslationDiagnostics,
      },
      failure: null,
      diagnosticEvent: recovery ?? null,
      recoveryAction: recovery?.recoveryAction ?? "none",
      recoverySucceeded: recovery?.recoverySucceeded ?? null,
    });
  }, [enqueueTechnicalEvent, state.entries, updateEntryDiagnostics]);

  useEffect(
    () => () => {
      requestAbortRef.current?.abort();
      realtimeManagerRef.current?.close("classic_unmount");
      realtimeManagerRef.current = null;
      activeRealtimeTurnRef.current = null;
      activeTurnPerformanceRef.current = null;
      audioQualityMonitorRef.current?.stop();
      audioQualityMonitorRef.current = null;
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
      audioQualityMonitorRef.current?.stop();
      audioQualityMonitorRef.current = null;
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
    const stateBeforeRecording = state.status;
    activeTurnStateBeforeRecordingRef.current = stateBeforeRecording;
    const recorderStatusBefore = recorderStatus;
    const realtimeManagerStateBefore = realtimeManagerRef.current?.getState() ?? "idle";
    if (state.status === "playing" || state.status === "paused") {
      handleStopPlayback();
    }
    if (state.autoPlay) preparePlaybackForUserGesture();
    setSpeechFeedback(null);
    activeTurnCreatedAtRef.current = new Date().toISOString();
    activeTurnIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
    consentByTurnRef.current.set(activeTurnIdRef.current, {
      consentAtRecordingStart: snapshotTranslatorConsent(
        diagnosticsSettingsRef.current,
      ),
      consentAtTurnFinalization: null,
    });
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
      const recordingConsent = consentByTurnRef.current.get(
        activeTurnIdRef.current ?? "",
      )?.consentAtRecordingStart;
      if (
        recordingConsent?.internalSpeechDiagnosticsEnabled ||
        recordingConsent?.speechSampleSharingEnabled
      ) {
        const monitor = new TranslatorAudioQualityMonitor();
        audioQualityMonitorRef.current = monitor;
        const monitoringTurnId = activeTurnIdRef.current;
        setTimeout(() => {
          if (
            audioQualityMonitorRef.current === monitor &&
            activeTurnIdRef.current === monitoringTurnId
          ) {
            monitor.start(stream);
          }
        }, 0);
      }
    } catch (error) {
      audioQualityMonitorRef.current?.stop();
      audioQualityMonitorRef.current = null;
      if (realtimeTurn) {
        await getRealtimeManager().abortTurn(realtimeTurn);
      }
      activeRealtimeTurnRef.current = null;
      const failure = classifyTranslatorFailure(error, "recording_setup");
      const message = failure.category === "RECORDER"
        ? getAudioRecorderErrorMessage(error)
        : failure.message;
      const direction = getTranslationRequestDirection(state.mode);
      const turnId =
        activeTurnIdRef.current ??
        globalThis.crypto?.randomUUID?.() ??
        `failed-${Date.now()}`;
      finalizeTurnConsent(turnId);
      const recordingEvent = rememberDiagnosticEvent(
        turnId,
        failure,
        "recording_setup",
        "failure",
        failure.category === "AUTH" ? "reauthenticate" : "reset_to_idle",
        failure.category === "AUTH" ? false : true,
        null,
      );
      setFailedReportTurns((current) => [
        ...current,
        {
          turnId,
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
          stateBeforeRecording,
          stateAtFailure: state.status,
          stateAfterCleanup: failure.category === "AUTH" ? "error" : "idle",
          recorderStatusBefore,
          recorderStatusAtFailure: recorderStatus,
          recorderStatusAfterCleanup: null,
          realtimeManagerStateBefore,
          realtimeManagerStateAtFailure:
            realtimeManagerRef.current?.getState() ?? "idle",
          realtimeManagerStateAfterCleanup:
            realtimeManagerRef.current?.getState() ?? "idle",
          endpoint: null,
          httpStatus: failure.httpStatus,
          apiErrorCode: failure.apiErrorCode,
          failureCategory: failure.category,
          retryable: failure.retryable,
          recoveryAction:
            failure.category === "AUTH" ? "reauthenticate" : "reset_to_idle",
          recoverySucceeded: failure.category === "AUTH" ? false : true,
          audioBlobAvailable: false,
          authCheckAttempted: false,
          authCheckSucceeded: null,
          authFailureType: failure.authFailureType,
        },
      ]);
      enqueueTechnicalEvent({
        turnId,
        failure,
        diagnosticEvent: recordingEvent,
        errorStage: "recording_setup",
        recoveryAction:
          failure.category === "AUTH" ? "reauthenticate" : "reset_to_idle",
        recoverySucceeded: failure.category !== "AUTH",
      });
      resetRecoverableResources();
      dispatch({
        type: "RECORDING_FAILED",
        message,
        category: failure.category,
        healthStatus: failure.healthStatus,
        authRequired: failure.category === "AUTH",
      });
      activeTurnPerformanceRef.current = null;
      activeTurnCreatedAtRef.current = null;
      activeTurnIdRef.current = null;
      activeTurnStateBeforeRecordingRef.current = null;
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
      if (qaNextFailure === "tts" && process.env.NODE_ENV !== "production") {
        setQaNextFailure(null);
        throw new TranslatorOperationError({
          category: "TTS", message: "Simulierter TTS-Fehler", healthStatus: "degraded",
          httpStatus: 503, apiErrorCode: "qa_tts_503", retryable: true,
          retryAfterMs: null, authFailureType: null,
        });
      }
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
      const latestDiagnostics = latestDiagnosticsByEntryRef.current.get(entry.id);
      const recovery = diagnosticEventsByTurnRef.current.get(entry.id)?.at(-1);
      enqueueTechnicalEvent({
        turnId: entry.id,
        entry: latestDiagnostics ? { ...entry, diagnostics: latestDiagnostics } : entry,
        diagnosticEvent: recovery ?? null,
        recoveryAction: recovery?.recoveryAction ?? "none",
        recoverySucceeded: recovery?.recoverySucceeded ?? null,
      });
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
        } else {
          const technicalFailure = classifyTranslatorFailure(error, "tts");
          const qaScenarioId = technicalFailure.apiErrorCode?.startsWith("qa_")
            ? technicalFailure.apiErrorCode
            : null;
          const ttsEvent = rememberDiagnosticEvent(
            entry.id,
            technicalFailure,
            "tts",
            "degradation",
            "keep_translation_without_tts",
            true,
            qaScenarioId ? null : "/api/translator/speech",
            qaScenarioId,
          );
          enqueueTechnicalEvent({
            turnId: entry.id,
            entry,
            failure: technicalFailure,
            diagnosticEvent: ttsEvent,
            errorStage: "tts",
            recoveryAction: "keep_translation_without_tts",
            recoverySucceeded: true,
          });
          dispatch({
            type: "SET_HEALTH",
            healthStatus: qaScenarioId ? "healthy" : technicalFailure.healthStatus,
          });
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
    const recorderStatusBeforeStop = recorderStatus;
    const realtimeManagerStateBeforeStop =
      realtimeManagerRef.current?.getState() ?? null;
    const turnPerformance =
      activeTurnPerformanceRef.current ??
      new TranslatorTurnPerformance({ recordingStarted: performance.now() });
    turnPerformance.markRecordingStopped();
    const activeTurnId = activeTurnIdRef.current ??
      globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
    const monitorResult = audioQualityMonitorRef.current?.stop() ?? {
      metadata: { sampleRate: null, channelCount: null },
      metrics: UNAVAILABLE_AUDIO_QUALITY,
    };
    audioQualityMonitorRef.current = null;
    audioCaptureByTurnRef.current.set(activeTurnId, {
      metadata: {
        mimeType: null,
        sizeBytes: null,
        durationMs: turnPerformance.getDiagnostics().recordingDurationMs ?? null,
        sampleRate: monitorResult.metadata.sampleRate,
        channelCount: monitorResult.metadata.channelCount,
      },
      metrics: monitorResult.metrics,
    });
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
    const retryState: { failure: TranslatorFailure | null } = { failure: null };
    let qaRealtimeScenarioId: string | null = null;

    try {
      const realtimeTurn = activeRealtimeTurnRef.current;
      activeRealtimeTurnRef.current = null;
      let realtimeResult = realtimeTurn
        ? await getRealtimeManager().finishTurn(realtimeTurn)
        : {
            ok: false as const,
            fallbackReason:
              "realtime_not_ready_at_recording_start" as const,
          };
      if (qaNextFailure === "realtime" && process.env.NODE_ENV !== "production") {
        realtimeResult = { ok: false, fallbackReason: "session_error" };
        qaRealtimeScenarioId = "qa_realtime_failure";
        setQaNextFailure(null);
      }
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
      const usedAudioFallback = !(realtimeResult.ok && transcriptionMs !== undefined);
      turnPerformance.markTranslationRequestStarted();
      errorStage = "translation";
      if (
        (qaNextFailure === "translation" || qaNextFailure === "network") &&
        process.env.NODE_ENV !== "production"
      ) {
        const simulated = qaNextFailure;
        setQaNextFailure(null);
        throw new TranslatorOperationError({
          category: simulated === "network" ? "NETWORK" : "SERVICE_UNAVAILABLE",
          message: simulated === "network"
            ? "Die Verbindung wurde kurz unterbrochen. Du kannst direkt erneut aufnehmen."
            : "Die Übersetzung konnte gerade nicht erstellt werden. Bitte versuche es erneut.",
          healthStatus: simulated === "network" ? "offline" : "degraded",
          httpStatus: simulated === "network" ? null : 503,
          apiErrorCode: simulated === "network"
            ? "qa_network_disconnect"
            : "qa_translation_503",
          retryable: true,
          retryAfterMs: null, authFailureType: null,
        });
      }
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
        onRetry: ({ failure }) => {
          retryState.failure = failure;
        },
      });
      turnPerformance.markTranslationCompleted();
      if (usedAudioFallback) {
        turnPerformance.setFallbackServerTimings(result.diagnostics);
      }
      const finalizedConsent = finalizeTurnConsent(activeTurnId);
      if (finalizedConsent) {
        createSpeechReviewCandidate({
          turnId: activeTurnId,
          recognizedTranscript: result.originalText,
          sourceLanguage: result.sourceLanguage,
          transcriptionModel: result.diagnostics.transcriptionModel,
          transcriptionPath: usedAudioFallback
            ? "audio_upload_fallback"
            : "realtime",
          consent: finalizedConsent,
        });
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
      latestDiagnosticsByEntryRef.current.set(
        entry.id,
        entry.diagnostics as TranslationDiagnostics,
      );
      void audioBlobResult.then((recordedAudio) => {
        if (!recordedAudio.ok) return;
        audioMetadataByTurnRef.current.set(entry.id, {
          audioMimeType: recordedAudio.audioBlob.type || null,
          audioSize: recordedAudio.audioBlob.size,
        });
        const capture = audioCaptureByTurnRef.current.get(entry.id);
        if (capture) {
          capture.metadata.mimeType = recordedAudio.audioBlob.type || null;
          capture.metadata.sizeBytes = recordedAudio.audioBlob.size;
        }
        const quality = qualityByTurnRef.current.get(entry.id);
        if (quality) {
          qualityByTurnRef.current.set(entry.id, {
            ...quality,
            audioMetadata: {
              ...quality.audioMetadata,
              mimeType: recordedAudio.audioBlob.type || null,
              sizeBytes: recordedAudio.audioBlob.size,
            },
          });
          setQualityRevision((current) => current + 1);
        }
        const turnConsent = consentByTurnRef.current.get(entry.id);
        if (turnConsent && speechAudioEligibleForTurn(turnConsent)) {
          rememberLocalAudio(entry.id, recordedAudio.audioBlob);
        }
      });
      pendingTranslationVisibleEntryIdRef.current = entry.id;
      turnPerformance.markTranslationStateCommitted();
      dispatch({
        type: "PROCESSING_SUCCEEDED",
        entry,
        ...(!usedAudioFallback
          ? {}
          : {
              healthStatus: qaRealtimeScenarioId
                ? "healthy" as const
                : "degraded" as const,
              notice:
                "Die Live-Spracherkennung ist gerade nicht verfügbar. Die sichere Erkennung wurde verwendet.",
              noticeCategory: "REALTIME" as const,
            }),
      });
      if (usedAudioFallback) {
        const realtimeFailure: TranslatorFailure = {
          category: "REALTIME",
          message:
            "Die Live-Spracherkennung ist gerade nicht verfügbar. Die sichere Erkennung wurde verwendet.",
          healthStatus: "degraded",
          httpStatus: null,
          apiErrorCode: realtimeResult.ok
            ? "transcript_not_finalized"
            : realtimeResult.fallbackReason,
          retryable: true,
          retryAfterMs: null,
          authFailureType: null,
        };
        rememberDiagnosticEvent(
          entry.id,
          realtimeFailure,
          "transcription",
          expectedFallbackKind(realtimeFailure.apiErrorCode),
          "audio_upload_fallback",
          true,
          qaRealtimeScenarioId ? null : "/api/translator/translate",
          qaRealtimeScenarioId,
        );
      } else if (retryState.failure) {
        const recoveredFailure: TranslatorFailure = {
          ...retryState.failure,
          healthStatus: "healthy",
        };
        rememberDiagnosticEvent(
          entry.id,
          recoveredFailure,
          "translation",
          "degradation",
          "retry_translation_once",
          true,
          "/api/translator/translate",
        );
      }
      if (state.autoPlay) void handlePlayback(entry, true);
    } catch (error) {
      if (!isUserAbort(error)) {
        if (!authoritativeTranscript && error instanceof TranslatorClientError) {
          authoritativeTranscript = error.recognizedTranscript;
        }
        const recordedAudio = await audioBlobResult;
        const failure = recordedAudio.ok
          ? classifyTranslatorFailure(error, errorStage)
          : classifyTranslatorFailure(recordedAudio.error, "recording_stop");
        const message = recordedAudio.ok
          ? failure.message || getTranslatorClientErrorMessage(error)
          : getAudioRecorderErrorMessage(recordedAudio.error);
        const diagnostics = turnPerformance.getDiagnostics();
        const turnId =
          activeTurnIdRef.current ??
          globalThis.crypto?.randomUUID?.() ??
          `failed-${Date.now()}`;
        const finalizedConsent = finalizeTurnConsent(turnId);
        if (finalizedConsent && authoritativeTranscript) {
          const quality = createSpeechReviewCandidate({
            turnId,
            recognizedTranscript: authoritativeTranscript,
            sourceLanguage:
              direction.sourceLanguage === "auto" ? null : direction.sourceLanguage,
            transcriptionModel:
              diagnostics.transcriptionPath === "realtime"
                ? "gpt-live-transcribe"
                : "gpt-4o-mini-transcribe",
            transcriptionPath: diagnostics.transcriptionPath ?? "realtime",
            consent: finalizedConsent,
          });
          if (quality) {
            setFailedSpeechReviewTurnIds((current) =>
              current.includes(turnId) ? current : [...current, turnId],
            );
          }
        }
        const recoveryAction = failure.category === "AUTH"
          ? "reauthenticate" as const
          : "reset_to_idle" as const;
        const qaScenarioId = failure.apiErrorCode?.startsWith("qa_")
          ? failure.apiErrorCode
          : null;
        const failureEvent = rememberDiagnosticEvent(
          turnId,
          failure,
          recordedAudio.ok ? errorStage : "recording_stop",
          "failure",
          recoveryAction,
          failure.category === "AUTH" ? false : true,
          recordedAudio.ok && !qaScenarioId ? "/api/translator/translate" : null,
          qaScenarioId,
        );
        setFailedReportTurns((current) => [
          ...current,
          {
            turnId,
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
            stateBeforeRecording: activeTurnStateBeforeRecordingRef.current,
            stateAtFailure: "processing",
            stateAfterCleanup: failure.category === "AUTH" ? "error" : "idle",
            recorderStatusBefore: recorderStatusBeforeStop,
            recorderStatusAtFailure: recorderStatus,
            recorderStatusAfterCleanup: null,
            realtimeManagerStateBefore: realtimeManagerStateBeforeStop,
            realtimeManagerStateAtFailure:
              realtimeManagerRef.current?.getState() ?? "idle",
            realtimeManagerStateAfterCleanup:
              realtimeManagerRef.current?.getState() ?? "idle",
            endpoint: recordedAudio.ok ? "/api/translator/translate" : null,
            httpStatus: failure.httpStatus,
            apiErrorCode: failure.apiErrorCode,
            failureCategory: failure.category,
            retryable: failure.retryable,
            recoveryAction,
            recoverySucceeded: failure.category !== "AUTH",
            audioBlobAvailable:
              recordedAudio.ok &&
              finalizedConsent !== null &&
              speechAudioEligibleForTurn(finalizedConsent),
            authCheckAttempted: recordedAudio.ok,
            authCheckSucceeded: failure.authFailureType !== null ? false : true,
            authFailureType: failure.authFailureType,
          },
        ]);
        if (recordedAudio.ok) {
          const capture = audioCaptureByTurnRef.current.get(turnId);
          if (capture) {
            capture.metadata.mimeType = recordedAudio.audioBlob.type || null;
            capture.metadata.sizeBytes = recordedAudio.audioBlob.size;
          }
          const quality = qualityByTurnRef.current.get(turnId);
          if (quality) {
            qualityByTurnRef.current.set(turnId, {
              ...quality,
              audioMetadata: {
                ...quality.audioMetadata,
                mimeType: recordedAudio.audioBlob.type || null,
                sizeBytes: recordedAudio.audioBlob.size,
              },
            });
          }
          const turnConsent = consentByTurnRef.current.get(turnId);
          if (turnConsent && speechAudioEligibleForTurn(turnConsent)) {
            rememberLocalAudio(turnId, recordedAudio.audioBlob);
          }
        }
        enqueueTechnicalEvent({
          turnId,
          failure,
          diagnosticEvent: failureEvent,
          errorStage: recordedAudio.ok ? errorStage : "recording_stop",
          recoveryAction,
          recoverySucceeded: failure.category !== "AUTH",
        });
        resetRecoverableResources();
        dispatch({
          type: "PROCESSING_FAILED",
          message,
          category: failure.category,
          healthStatus: qaScenarioId ? "healthy" : failure.healthStatus,
          authRequired: failure.category === "AUTH",
        });
      }
    } finally {
      suspendMicrophone();
      requestAbortRef.current = null;
      translationInFlightRef.current = false;
      activeTurnPerformanceRef.current = null;
      activeTurnCreatedAtRef.current = null;
      activeTurnIdRef.current = null;
      activeTurnStateBeforeRecordingRef.current = null;
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
    latestDiagnosticsByEntryRef.current.clear();
    audioMetadataByTurnRef.current.clear();
    feedbackByTurnRef.current.clear();
    qualityByTurnRef.current.clear();
    audioBlobByTurnRef.current.clear();
    audioIncludedInBundleTurnIdsRef.current.clear();
    diagnosticEventsByTurnRef.current.clear();
    consentByTurnRef.current.clear();
    consentEventsRef.current = [];
    audioCaptureByTurnRef.current.clear();
    setFailedSpeechReviewTurnIds([]);
    pendingTranslationVisibleEntryIdRef.current = null;
    reportStartedAtRef.current = new Date().toISOString();
    reportIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`;
    setFailedReportTurns([]);
    setSpeechFeedback(null);
    setFeedbackEntryId(null);
    setSavedFeedbackIds(new Set());
    setQualityRevision((current) => current + 1);
    dispatch({ type: "CLEAR_HISTORY" });
  }

  function buildCurrentReport(
    qualityByTurn = qualityByTurnRef.current,
    audioIncludedInDiagnosticBundleByTurn: ReadonlySet<string> =
      audioIncludedInBundleTurnIdsRef.current,
  ) {
    const connectionDiagnostics =
      realtimeManagerRef.current?.getConnectionDiagnostics() ?? {
        connectionAttempts: [],
        connectionAttemptsTotal: 0,
        connectionSuccesses: 0,
        connectionFailures: 0,
        reconnectCount: 0,
      };
    const reportAudioMetadata = new Map(audioMetadataByTurnRef.current);
    for (const [turnId, capture] of audioCaptureByTurnRef.current) {
      const current = reportAudioMetadata.get(turnId);
      reportAudioMetadata.set(turnId, {
        audioMimeType: current?.audioMimeType ?? capture.metadata.mimeType,
        audioSize: current?.audioSize ?? capture.metadata.sizeBytes,
        durationMs: capture.metadata.durationMs,
        sampleRate: capture.metadata.sampleRate,
        channelCount: capture.metadata.channelCount,
        audioQualityMetrics: capture.metrics,
      });
    }
    return buildClassicTranslatorReport({
        reportId: reportIdRef.current,
        startedAt: reportStartedAtRef.current,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        currentMode: state.mode,
        ttsSpeed: speechSpeed,
        entries: state.entries,
        failedTurns: failedReportTurns,
        audioMetadataByTurn: reportAudioMetadata,
        feedbackByTurn: feedbackByTurnRef.current,
        qualityByTurn,
        diagnosticEventsByTurn: diagnosticEventsByTurnRef.current,
        consentByTurn: consentByTurnRef.current,
        consentEvents: consentEventsRef.current,
        audioBlobAvailableByTurn: new Set(audioBlobByTurnRef.current.keys()),
        audioIncludedInDiagnosticBundleByTurn,
        buildMetadata: buildMetadataRef.current,
        diagnosticsSettings,
        installationId: installationIdRef.current,
        sessionId: sessionIdRef.current,
        ...connectionDiagnostics,
      });
  }

  function handleExportReport() {
    downloadClassicTranslatorReport(buildCurrentReport());
  }

  async function handleExportDiagnosticBundle() {
    const qualityForExport = new Map(qualityByTurnRef.current);
    const includedTurnIds = new Set<string>();
    for (const turnId of audioBlobByTurnRef.current.keys()) {
      const consent = consentByTurnRef.current.get(turnId);
      if (consent && speechAudioEligibleForTurn(consent)) {
        includedTurnIds.add(turnId);
        const sample = qualityForExport.get(turnId);
        if (sample) {
          qualityForExport.set(turnId, {
            ...sample,
            audioIncludedInDiagnosticBundle: true,
          });
        }
      }
    }
    const bundle = await createTranslatorDiagnosticBundle({
      report: buildCurrentReport(qualityForExport, includedTurnIds),
      includeAudio: true,
      audioFiles: Array.from(audioBlobByTurnRef.current, ([turnId, blob]) => ({
        turnId,
        blob,
        consentEligible: includedTurnIds.has(turnId),
        durationMs: audioCaptureByTurnRef.current.get(turnId)?.metadata.durationMs ?? null,
        recognitionReviewStatus:
          qualityByTurnRef.current.get(turnId)?.recognitionReviewStatus ?? null,
        audioQualityMetrics:
          audioCaptureByTurnRef.current.get(turnId)?.metrics ??
          UNAVAILABLE_AUDIO_QUALITY,
      })),
    });
    for (const turnId of includedTurnIds) {
      audioIncludedInBundleTurnIdsRef.current.add(turnId);
    }
    downloadTranslatorDiagnosticBundle(bundle);
  }

  function handleTranscriptCorrection(entry: TranslationEntry, correctedTranscript: string) {
    const current = qualityByTurnRef.current.get(entry.id);
    if (!current) return;
    qualityByTurnRef.current.set(
      entry.id,
      correctSpeechQualityRecord(current, correctedTranscript),
    );
    setQualityRevision((current) => current + 1);
  }

  function handleAcceptTranscript(turnId: string) {
    const current = qualityByTurnRef.current.get(turnId);
    if (!current) return;
    qualityByTurnRef.current.set(turnId, acceptSpeechQualityRecord(current));
    setQualityRevision((revision) => revision + 1);
  }

  function handleFailedTranscriptCorrection(
    turnId: string,
    correctedTranscript: string,
  ) {
    const current = qualityByTurnRef.current.get(turnId);
    if (!current) return;
    qualityByTurnRef.current.set(
      turnId,
      correctSpeechQualityRecord(current, correctedTranscript),
    );
    setQualityRevision((revision) => revision + 1);
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
              {state.errorMessage ? (
                <div
                  className={`status-note mt-3 ${
                    state.healthStatus === "degraded" ? "status-info" : "status-warning"
                  }`}
                  role="status"
                >
                  <p>{state.errorMessage}</p>
                  <p className="mt-1 text-sm font-medium">
                    Du kannst direkt eine neue Aufnahme starten.
                  </p>
                </div>
              ) : null}
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
                {state.healthStatus === "auth_required"
                  ? "Anmeldung erforderlich"
                  : recorderError
                    ? "Aufnahme nicht möglich"
                    : "Übersetzung nicht möglich"}
              </p>
              <p className="mt-1">{state.errorMessage}</p>
              {state.healthStatus === "auth_required" ? (
                <Link className="btn btn-primary mt-4 min-h-12 w-full" href="/login">
                  Erneut anmelden
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary mt-4 min-h-12 w-full"
                  onClick={handleResetError}
                >
                  Erneut versuchen
                </button>
              )}
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

        <section className="panel mt-5 p-5" aria-labelledby="diagnostics-heading">
          <h2 id="diagnostics-heading" className="text-lg font-semibold text-primary">
            Datenschutz &amp; Diagnose
          </h2>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <label className="font-medium text-primary" htmlFor="diagnostics-sharing">
                Diagnose- &amp; Verbesserungsdaten teilen
              </label>
              <p className="mt-1 text-sm text-muted">
                Hilft uns, Fehler, Geschwindigkeit und Qualität zu verbessern. Es werden pseudonyme technische Daten übertragen.
              </p>
            </div>
            <button
              id="diagnostics-sharing"
              type="button"
              role="switch"
              aria-checked={diagnosticsSettings.diagnosticsSharingEnabled}
              className={`relative h-10 w-20 shrink-0 rounded-full border p-1 transition ${
                diagnosticsSettings.diagnosticsSharingEnabled
                  ? "border-success-strong bg-accent-success"
                  : "border-strong bg-surface-elevated"
              }`}
              onClick={() => updateDiagnosticsSetting(
                "diagnosticsSharingEnabled",
                !diagnosticsSettings.diagnosticsSharingEnabled,
              )}
            >
              <span className={`flex h-7 w-9 items-center justify-center rounded-full bg-surface text-[10px] font-bold shadow-soft transition ${
                diagnosticsSettings.diagnosticsSharingEnabled ? "translate-x-8" : "translate-x-0"
              }`}>
                {diagnosticsSettings.diagnosticsSharingEnabled ? "AN" : "AUS"}
              </span>
            </button>
          </div>
          <div className="mt-4 border-t border-soft pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="font-medium text-primary" htmlFor="quality-content-sharing">
                  Textkorrekturen zur Qualitätsverbesserung teilen
                </label>
                <p className="mt-1 text-sm text-muted">
                  Erlaubt künftig die Übertragung ausdrücklich gespeicherter Transkriptkorrekturen. Technische Diagnose allein enthält keine Gesprächsinhalte.
                </p>
              </div>
              <input
                id="quality-content-sharing"
                type="checkbox"
                className="mt-1 h-6 w-6 shrink-0 accent-[color:var(--accent-cta)]"
                checked={diagnosticsSettings.qualityContentSharingEnabled}
                onChange={(event) => updateDiagnosticsSetting(
                  "qualityContentSharingEnabled",
                  event.target.checked,
                )}
              />
            </div>
          </div>
          <div className="mt-4 border-t border-soft pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="font-medium text-primary" htmlFor="speech-sharing">
                  Sprachaufnahmen zur Verbesserung der Spracherkennung teilen
                </label>
                <p className="mt-1 text-sm text-muted">
                  Sprachaufnahmen werden nur mit dieser eigenen Zustimmung lokal für ein Diagnosepaket behalten. Der Remote-Audioupload ist noch nicht aktiviert.
                </p>
              </div>
              <input
                id="speech-sharing"
                type="checkbox"
                className="mt-1 h-6 w-6 shrink-0 accent-[color:var(--accent-cta)]"
                checked={diagnosticsSettings.speechSampleSharingEnabled}
                onChange={(event) => updateDiagnosticsSetting(
                  "speechSampleSharingEnabled",
                  event.target.checked,
                )}
              />
            </div>
          </div>
          {process.env.NODE_ENV !== "production" ? (
            <div className="mt-4 border-t border-soft pt-4">
              <label className="flex items-center gap-3 font-medium text-primary">
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-[color:var(--accent-cta)]"
                  checked={diagnosticsSettings.internalQaModeEnabled}
                  onChange={(event) => updateDiagnosticsSetting(
                    "internalQaModeEnabled",
                    event.target.checked,
                  )}
                />
                Sprach-Qualitätsmodus (interner Test)
              </label>
              <p className="mt-2 text-sm text-muted">
                Speichert für interne Tests die erkannte Sprache und – wenn erlaubt – Audio lokal, damit Fehler der Spracherkennung analysiert werden können. Es wird keine zusätzliche Spracherkennung gestartet.
              </p>
              {diagnosticsSettings.internalQaModeEnabled ? (
                <div className="mt-3">
                  <p className="text-sm font-medium text-primary">
                    Nächsten Fehler einmalig simulieren
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([
                      ["realtime", "Realtime"],
                      ["translation", "Translation 503"],
                      ["tts", "TTS 503"],
                      ["network", "Netzwerk"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`btn min-h-11 text-sm ${
                          qaNextFailure === value ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => setQaNextFailure(
                          qaNextFailure === value ? null : value,
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {qaNextFailure ? (
                    <p className="mt-2 text-xs text-muted" role="status">
                      Simulation vorgemerkt; sie wird nur beim nächsten passenden Turn verwendet.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
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
                const speechReview = qualityByTurnRef.current.get(entry.id) ?? null;
                const speechReviewEnabled =
                  process.env.NODE_ENV !== "production" && speechReview !== null;

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
                    correctedTranscript={
                      speechReviewEnabled ? speechReview.correctedTranscript : null
                    }
                    recognitionReviewStatus={
                      speechReviewEnabled ? speechReview.recognitionReviewStatus : null
                    }
                    onAcceptTranscript={
                      speechReviewEnabled
                        ? () => handleAcceptTranscript(entry.id)
                        : undefined
                    }
                    onSaveTranscriptCorrection={speechReviewEnabled
                      ? (correctedTranscript) =>
                          handleTranscriptCorrection(entry, correctedTranscript)
                      : undefined}
                  />
                );
              })}
            </div>
          )}
          {process.env.NODE_ENV !== "production" &&
          diagnosticsSettings.internalQaModeEnabled &&
          failedSpeechReviewTurnIds.length > 0 ? (
            <div className="mt-4 space-y-2" aria-label="Sprachqualität fehlgeschlagener Turns">
              {failedSpeechReviewTurnIds.flatMap((turnId) => {
                const sample = qualityByTurnRef.current.get(turnId);
                return sample
                  ? [
                      <SpeechReviewPanel
                        key={turnId}
                        sample={sample}
                        onAccept={() => handleAcceptTranscript(turnId)}
                        onCorrect={(value) =>
                          handleFailedTranscriptCorrection(turnId, value)}
                      />,
                    ]
                  : [];
              })}
            </div>
          ) : null}
          <div className="mt-4">
              <button
                type="button"
                className="btn btn-secondary min-h-12 w-full"
                onClick={handleExportReport}
              >
                Testreport exportieren
              </button>
              <button
                type="button"
                className="btn btn-secondary mt-2 min-h-12 w-full"
                onClick={() => void handleExportDiagnosticBundle()}
              >
                Diagnosepaket exportieren
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
