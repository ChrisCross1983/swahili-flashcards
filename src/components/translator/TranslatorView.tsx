"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import TurnFeedbackSheet, {
  type SavedTurnFeedback,
} from "@/components/translator/TurnFeedbackSheet";
import SpeechReviewPanel from "@/components/translator/SpeechReviewPanel";
import ProcessingIndicator, {
  type TranslatorProcessingStage,
} from "@/components/translator/ProcessingIndicator";
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
  enqueuePendingTranslatorFeedback,
  flushPendingTranslatorFeedback,
  removePendingTranslatorFeedback,
} from "@/lib/translator/feedbackRetry";
import { submitTranslatorFeedbackSubmission } from "@/lib/translator/feedbackClient";
import {
  createTranslatorFeedbackSubmission,
  type TranslatorFeedbackCategory,
  type TranslatorFeedbackRating,
} from "@/lib/translator/feedback";
import { supabaseBrowser } from "@/lib/supabase/client";
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
import {
  requestClassicTranslation,
  type SemanticRescueContext,
} from "@/lib/translator/classicTranslationPipeline";
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
  reviewSameAudioComparison,
  type SameAudioBenchmarkComparison,
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
  inferAudioSignalFromSuccessfulTranscription,
  UNAVAILABLE_AUDIO_QUALITY,
  type TranslatorAudioCaptureMetadata,
  type TranslatorAudioQualityMetrics,
} from "@/lib/translator/audioQuality";
import {
  INTERNAL_TRANSLATOR_QA_ENABLED,
  isClassicRealtimeEnabledForUserAgent,
} from "@/lib/translator/capturePolicy";
import {
  createBrowserTranslatorIncidentStore,
  type PersistedTranslatorIncident,
} from "@/lib/translator/incidentPersistence";
import {
  transcriptScriptAnomalyDetected,
  type SttCandidateComparison,
  type SttRoutingDecision,
} from "@/lib/translator/sttRouting";
import { SHARED_CONVERSATION_LABELS } from "@/lib/translator/sharedConversationLabels";
import {
  MAX_POST_CONVERSATION_REVIEW_CANDIDATES,
  selectPostConversationReviewCandidates,
} from "@/lib/translator/reviewCandidates";
import { TranslatorTtsAttemptRegistry } from "@/lib/translator/ttsAttemptRegistry";
import { SameAudioBenchmarkRunner } from "@/lib/translator/sameAudioBenchmark";
import {
  RecordingStartDiagnosticsTracker,
  RecordingStartOperationTimeoutError,
  recordingStartOutcomeForError,
  withRecordingStartOperationWatchdog,
  type RecordingStartPhase,
  type RecordingStartRecorderSnapshot,
} from "@/lib/translator/recordingStartDiagnostics";

const QA_FAILURE_LABELS = {
  realtime: "Realtime-Ausfall",
  semantic: "Semantic-Rescue",
  translation: "Translation 503",
  tts: "TTS 503",
  network: "Netzwerkabbruch",
} as const;

export default function TranslatorView({
  initialFeedbackOwnerId,
}: {
  initialFeedbackOwnerId: string;
}) {
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
  const [qualityRevision, setQualityRevision] = useState(0);
  const [lastIncident, setLastIncident] =
    useState<PersistedTranslatorIncident | null>(null);
  const incidentStoreRef =
    useRef<ReturnType<typeof createBrowserTranslatorIncidentStore>>(null);
  const preTurnPersistenceChainRef = useRef<Promise<void>>(Promise.resolve());
  const [qaNextFailure, setQaNextFailure] = useState<
    "realtime" | "semantic" | "translation" | "tts" | "network" | null
  >(null);
  const [qaLastResult, setQaLastResult] = useState<string | null>(null);
  const [processingPhase, setProcessingPhase] = useState<TranslatorProcessingStage>("translation");
  const [postConversationReviewOpen, setPostConversationReviewOpen] = useState(false);
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const buildMetadataRef = useRef(getTranslatorBuildMetadata());
  const sessionIdRef = useRef(createTranslatorSessionId());
  const installationIdRef = useRef<string | null>(null);
  const telemetryQueueRef = useRef<TranslatorTelemetryQueue | null>(null);
  const qualityByTurnRef = useRef(new Map<string, TranslatorSpeechQualitySample>());
  const audioBlobByTurnRef = useRef(new Map<string, Blob>());
  const diagnosticEventsByTurnRef = useRef(new Map<string, TranslatorDiagnosticEvent[]>());
  const consentByTurnRef = useRef(new Map<string, TranslatorTurnConsent>());
  const consentEventsRef = useRef<TranslatorConsentEvent[]>([]);
  const sttRoutingByTurnRef = useRef(new Map<string, SttRoutingDecision>());
  const sttComparisonsByTurnRef = useRef(new Map<string, SttCandidateComparison>());
  const sameAudioBenchmarksByTurnRef = useRef(
    new Map<string, SameAudioBenchmarkComparison>(),
  );
  const sameAudioEligibleTurnIdsRef = useRef(new Set<string>());
  const sameAudioBenchmarkRunnerRef = useRef(new SameAudioBenchmarkRunner());
  const audioQualityMonitorRef = useRef<TranslatorAudioQualityMonitor | null>(null);
  const audioCaptureByTurnRef = useRef(new Map<string, {
    metadata: TranslatorAudioCaptureMetadata;
    metrics: TranslatorAudioQualityMetrics;
  }>());
  const [failedSpeechReviewTurnIds, setFailedSpeechReviewTurnIds] = useState<string[]>([]);
  const translationInFlightRef = useRef(false);
  const recordingStartInFlightRef = useRef(false);
  const recordingStartGenerationRef = useRef(0);
  const recordingStartTrackerRef = useRef(new RecordingStartDiagnosticsTracker());
  const playbackInFlightRef = useRef(false);
  const playbackRunIdRef = useRef(0);
  const ttsAttemptRegistryRef = useRef(new TranslatorTtsAttemptRegistry());
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
    poisonCurrentStream,
    abortPendingAcquisition,
    getCaptureDiagnostics,
    getRecorderSnapshot,
    getMicrophoneAcquisitionState,
    hasPendingAcquisition,
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
    hasCachedTranslation,
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
  const feedbackByTurnRef = useRef(new Map<string, SavedTurnFeedback>());
  const feedbackSyncInFlightRef = useRef(false);
  const feedbackOwnerIdRef = useRef<string | null>(initialFeedbackOwnerId);
  const feedbackOwnerGenerationRef = useRef(0);

  const markPendingFeedbackSynced = useCallback((entryId: string) => {
    const current = feedbackByTurnRef.current.get(entryId);
    if (!current || current.persistenceStatus === "synced") return;
    feedbackByTurnRef.current.set(entryId, { ...current, persistenceStatus: "synced" });
    setSavedFeedbackIds((ids) => new Set(ids).add(entryId));
    setQualityRevision((revision) => revision + 1);
  }, []);

  const flushPendingFeedback = useCallback((ownerId = feedbackOwnerIdRef.current) => {
    if (!ownerId || feedbackSyncInFlightRef.current || typeof sessionStorage === "undefined") return;
    const ownerGeneration = feedbackOwnerGenerationRef.current;
    feedbackSyncInFlightRef.current = true;
    void flushPendingTranslatorFeedback({
      storage: sessionStorage,
      ownerId,
      submit: submitTranslatorFeedbackSubmission,
      onSynced: (entryId) => {
        if (
          feedbackOwnerIdRef.current === ownerId &&
          feedbackOwnerGenerationRef.current === ownerGeneration
        ) {
          markPendingFeedbackSynced(entryId);
        }
      },
      shouldContinue: () =>
        feedbackOwnerIdRef.current === ownerId &&
        feedbackOwnerGenerationRef.current === ownerGeneration,
    }).catch(() => undefined).finally(() => {
      feedbackSyncInFlightRef.current = false;
      const currentOwnerId = feedbackOwnerIdRef.current;
      if (
        currentOwnerId &&
        feedbackOwnerGenerationRef.current !== ownerGeneration
      ) {
        flushPendingFeedback(currentOwnerId);
      }
    });
  }, [markPendingFeedbackSynced]);

  useEffect(() => {
    let active = true;
    const settings = loadTranslatorDiagnosticsSettings(localStorage);
    diagnosticsSettingsRef.current = settings;
    setDiagnosticsSettings(settings);
    installationIdRef.current = getOrCreateInstallationId(localStorage);
    incidentStoreRef.current = createBrowserTranslatorIncidentStore();
    void incidentStoreRef.current?.latest(sessionIdRef.current)
      .then((incident) => {
        if (active) setLastIncident(incident);
      })
      .catch(() => undefined);
    telemetryQueueRef.current = new TranslatorTelemetryQueue({
      storage: localStorage,
      isEnabled: () =>
        REMOTE_TRANSLATOR_TELEMETRY_ENABLED &&
        diagnosticsSettingsRef.current.diagnosticsSharingEnabled,
    });
    if (REMOTE_TRANSLATOR_TELEMETRY_ENABLED && settings.diagnosticsSharingEnabled) {
      void telemetryQueueRef.current.flush();
    }
    const supabase = supabaseBrowser();
    const setFeedbackOwner = (ownerId: string | null) => {
      if (feedbackOwnerIdRef.current === ownerId) {
        if (ownerId) flushPendingFeedback(ownerId);
        return;
      }
      feedbackOwnerGenerationRef.current += 1;
      feedbackOwnerIdRef.current = ownerId;
      if (ownerId) flushPendingFeedback(ownerId);
    };
    setFeedbackOwner(initialFeedbackOwnerId);
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setFeedbackOwner(data.user?.id ?? null);
    }).catch(() => undefined);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setFeedbackOwner(session?.user.id ?? null);
    });
    const flushOnline = () => {
      void telemetryQueueRef.current?.flush();
      flushPendingFeedback();
    };
    window.addEventListener("online", flushOnline);
    return () => {
      active = false;
      window.removeEventListener("online", flushOnline);
      subscription.unsubscribe();
    };
  }, [flushPendingFeedback, initialFeedbackOwnerId]);

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
      void incidentStoreRef.current?.purgeIneligibleAudio()
        .catch(() => undefined);
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
      realtimeEnabled:
        typeof navigator !== "undefined" &&
        isClassicRealtimeEnabledForUserAgent(navigator.userAgent),
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
    abortPendingAcquisition();
    suspendMicrophone();
    clearRecorderError();
    if (recorderStatus === "error") disposeRecorder();
    audioQualityMonitorRef.current?.stop();
    audioQualityMonitorRef.current = null;
  }, [abortPendingAcquisition, clearRecorderError, disposeRecorder, recorderStatus, suspendMicrophone]);

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
    setQualityRevision((current) => current + 1);
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
    if (!input.recognizedTranscript.trim()) {
      return null;
    }
    const capture = audioCaptureByTurnRef.current.get(input.turnId);
    const comparison = sttComparisonsByTurnRef.current.get(input.turnId);
    const baseRecord = createUnreviewedSpeechQualityRecord({
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
    const record: TranslatorSpeechQualitySample = {
      ...baseRecord,
      primaryTranscriptAvailable: comparison !== undefined,
      rescueTranscriptAvailable: comparison?.rescue !== null && comparison !== undefined,
      benchmarkReadySameAudioSample: false,
    };
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
      microphoneAcquisitionAttemptId: d?.microphoneAcquisitionAttemptId ?? null,
      microphoneAcquisitionMs: finite(d?.microphoneAcquisitionMs),
      microphoneAcquisitionOutcome: d?.microphoneAcquisitionOutcome ?? null,
      captureGeneration: finite(d?.captureGeneration),
      freshStreamRequested: d?.freshStreamRequested === true,
      streamReused: d?.streamReused === true,
      mediaRecorderChunkCount: finite(d?.mediaRecorderChunkCount),
      mediaRecorderTotalChunkBytes: finite(d?.mediaRecorderTotalChunkBytes),
      audioBlobSize: finite(d?.audioBlobSize),
      audioSignalObserved:
        typeof d?.audioSignalObserved === "boolean" ? d.audioSignalObserved : null,
      realtimeTransportReady: d?.realtimeTransportReady === true,
      realtimeInputTrackGeneration: finite(d?.realtimeInputTrackGeneration),
      realtimeFirstDeltaObserved: d?.realtimeFirstDeltaObserved === true,
      realtimeFinalTranscriptReceived: d?.realtimeFinalTranscriptReceived === true,
      capturePathOutcome: d?.capturePathOutcome ?? null,
      sttRoutingDecision: d?.sttRoutingDecision ??
        sttRoutingByTurnRef.current.get(input.turnId) ?? null,
      semanticRescueAttempted: sttComparisonsByTurnRef.current.has(input.turnId),
      semanticRescueSucceeded:
        d?.sttRoutingDecision === "audio_rescue_semantic_failure" &&
        input.entry !== undefined,
      sameAudioComparisonAvailable: sttComparisonsByTurnRef.current.has(input.turnId),
      transcriptScriptAnomalyDetected: d?.transcriptScriptAnomalyDetected === true,
      primaryFailureToRescueStartMs: finite(d?.primaryFailureToRescueStartMs),
      rescueTranscriptionMs: finite(d?.rescueTranscriptionMs),
      rescueTranscriptToTranslationReadyMs: finite(
        d?.rescueTranscriptToTranslationReadyMs,
      ),
      semanticRescueTotalMs: finite(d?.semanticRescueTotalMs),
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
      sameAudioBenchmarkRunnerRef.current.reset();
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
      const activeStart = recordingStartTrackerRef.current.getActiveAttempt();
      if (activeStart) {
        recordingStartGenerationRef.current += 1;
        recordingStartInFlightRef.current = false;
        recordingStartTrackerRef.current.mark(
          activeStart.attemptId,
          "cleanup_completed",
          recordingStartSnapshot(),
        );
        recordingStartTrackerRef.current.complete(
          activeStart.attemptId,
          "aborted",
          recordingStartSnapshot(),
        );
        void persistPreTurnDiagnosticSnapshot();
      }
      requestAbortRef.current?.abort();
      sameAudioBenchmarkRunnerRef.current.reset();
      abortPendingAcquisition();
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
    // The pagehide handler intentionally snapshots the latest refs without
    // re-registering for every render of the report builder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abortPendingAcquisition, disposeRecorder, stopPlayback]);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      // getUserMedia cannot be cancelled portably. Invalidating the attempt is
      // enough; a late result is stopped by the recorder generation guard.
      abortPendingAcquisition();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [abortPendingAcquisition]);
  useEffect(() => {
      mountedRef.current = true;
      return () => {
      mountedRef.current = false;
      };
  }, []);

  const recorderBusy =
    recorderStatus === "starting" || recorderStatus === "stopping";
  const controlsLocked = state.status !== "idle" || recorderBusy;
  const feedbackEntry = feedbackEntryId
    ? state.entries.find((entry) => entry.id === feedbackEntryId) ?? null
    : null;
  const failedPostConversationReviewCandidateIds = failedSpeechReviewTurnIds
    .filter((turnId) => qualityByTurnRef.current.has(turnId))
    .slice(0, MAX_POST_CONVERSATION_REVIEW_CANDIDATES);
  const postConversationReviewCandidateList =
    selectPostConversationReviewCandidates({
        entries: state.entries,
        diagnosticEventsByTurn: diagnosticEventsByTurnRef.current,
        feedbackByTurn: feedbackByTurnRef.current,
        qualityByTurn: qualityByTurnRef.current,
        maxCandidates: Math.max(
          0,
          MAX_POST_CONVERSATION_REVIEW_CANDIDATES -
            failedPostConversationReviewCandidateIds.length,
        ),
      });
  const postConversationReviewCandidateCount =
    failedPostConversationReviewCandidateIds.length +
    postConversationReviewCandidateList.length;
  const postConversationReviewCandidateIds = postConversationReviewOpen
    ? new Set(postConversationReviewCandidateList)
    : new Set<string>();

  function recordingStartSnapshot(): RecordingStartRecorderSnapshot {
    return {
      recorderStatus: getRecorderSnapshot().status,
      microphoneAcquisitionState: getMicrophoneAcquisitionState(),
      hasPendingAcquisition: hasPendingAcquisition(),
      recordingStartInFlight: recordingStartInFlightRef.current,
      captureGeneration: getCaptureDiagnostics()?.captureGeneration ?? null,
    };
  }

  function markRecordingStartAttempt(
    attemptId: string,
    phase: RecordingStartPhase,
    persist = true,
  ) {
    recordingStartTrackerRef.current.mark(
      attemptId,
      phase,
      recordingStartSnapshot(),
    );
    if (persist) void persistPreTurnDiagnosticSnapshot();
  }

  async function persistPreTurnDiagnosticSnapshot() {
    const store = incidentStoreRef.current;
    if (!store) return;
    const report = buildCurrentReport();
    preTurnPersistenceChainRef.current = preTurnPersistenceChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await store.save({
          sessionId: sessionIdRef.current,
          reportId: reportIdRef.current,
          createdAt: new Date().toISOString(),
          turnCount: report.turns.length,
          report,
          audio: [],
        });
      })
      .catch(() => undefined);
    await preTurnPersistenceChainRef.current;
  }

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
    const operationGeneration = ++recordingStartGenerationRef.current;
    const attemptId = recordingStartTrackerRef.current.begin(
      recordingStartSnapshot(),
    );
    markRecordingStartAttempt(attemptId, "start_operation_started");
    const stateBeforeRecording = state.status;
    activeTurnStateBeforeRecordingRef.current = stateBeforeRecording;
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
    let stream: MediaStream | null = null;
    const assertCurrentOperation = async () => {
      if (
        mountedRef.current &&
        recordingStartGenerationRef.current === operationGeneration
      ) return;
      recordingStartTrackerRef.current.markLateCompletion(
        attemptId,
        recordingStartSnapshot(),
      );
      if (realtimeTurn) await getRealtimeManager().abortTurn(realtimeTurn);
      throw new Error("stale_recording_start_operation");
    };
    try {
      const startOperation = (async () => {
        turnPerformance.markGetUserMediaStarted();
        const acquisition = acquireMicrophone();
        markRecordingStartAttempt(attemptId, "microphone_acquisition_requested");
        try {
          stream = await acquisition;
        } catch (error) {
          if (recordingStartGenerationRef.current !== operationGeneration) {
            recordingStartTrackerRef.current.markLateCompletion(
              attemptId,
              recordingStartSnapshot(),
            );
            void persistPreTurnDiagnosticSnapshot();
          }
          throw error;
        }
        await assertCurrentOperation();
        markRecordingStartAttempt(attemptId, "microphone_acquired");
        turnPerformance.markGetUserMediaReady();
        markRecordingStartAttempt(attemptId, "recorder_prepare_started");
        await prepareRecording();
        await assertCurrentOperation();
        markRecordingStartAttempt(attemptId, "recorder_prepared");
        turnPerformance.markMediaRecorderPrepared();
        const captureDiagnostics = getCaptureDiagnostics();
        if (captureDiagnostics) turnPerformance.setCaptureDiagnostics(captureDiagnostics);
        realtimeTurn = await getRealtimeManager().prepareTurn(
          stream,
          () => turnPerformance.markFirstTranscriptDelta(),
        );
        await assertCurrentOperation();
        activeRealtimeTurnRef.current = realtimeTurn;
        turnPerformance.markTranscriptionPathDecision(realtimeTurn);
        markRecordingStartAttempt(attemptId, "recording_start_called");
        await startPreparedRecording();
        await assertCurrentOperation();
        turnPerformance.markRecordingStarted();
        dispatch({ type: "START_RECORDING" });
        markRecordingStartAttempt(attemptId, "recording_started");
        return captureDiagnostics;
      })();
      const captureDiagnostics = await withRecordingStartOperationWatchdog(
        startOperation,
        {
          onTimeout: () => {
            if (recordingStartGenerationRef.current !== operationGeneration) return;
            recordingStartGenerationRef.current += 1;
            recordingStartInFlightRef.current = false;
            abortPendingAcquisition();
            disposeRecorder();
          },
        },
      );
      recordingStartTrackerRef.current.complete(
        attemptId,
        "recording_started",
        { ...recordingStartSnapshot(), recordingStartInFlight: false },
      );
      const incidentStore = incidentStoreRef.current;
      if (incidentStore) {
        preTurnPersistenceChainRef.current = preTurnPersistenceChainRef.current
          .catch(() => undefined)
          .then(() => incidentStore.remove(sessionIdRef.current))
          .catch(() => undefined);
      }
      const startedStream = stream as MediaStream | null;
      const startedRealtimeTurn = realtimeTurn as ClassicRealtimeTurnHandle | null;
      if (!startedStream || !startedRealtimeTurn) {
        throw new Error("recording_start_incomplete");
      }
      markRecordingStartAttempt(attemptId, "realtime_rebind_started", false);
      await getRealtimeManager().recordingStarted(
        startedRealtimeTurn,
        startedStream,
        captureDiagnostics?.captureGeneration ?? 0,
      );
      markRecordingStartAttempt(attemptId, "realtime_rebind_completed", false);
      turnPerformance.setCaptureDiagnostics({
        realtimeTransportReady: startedRealtimeTurn.realtimeTransportReady,
        realtimeInputTrackGeneration: startedRealtimeTurn.realtimeInputTrackGeneration,
      });
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
            monitor.start(startedStream);
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
      const operationTimedOut = error instanceof RecordingStartOperationTimeoutError;
      const startOutcome = recordingStartOutcomeForError(error);
      const failure = classifyTranslatorFailure(error, "recording_setup");
      const failureCategory = operationTimedOut ? "RECORDER" : failure.category;
      turnPerformance.setCaptureDiagnostics({
        ...(getCaptureDiagnostics() ?? {}),
        capturePathOutcome:
          failure.apiErrorCode === "microphone_acquisition_timeout"
            ? "microphone_acquisition_timeout"
            : "recording_failed",
      });
      const message = operationTimedOut
        ? "Das Mikrofon konnte nicht geöffnet werden."
        : failureCategory === "RECORDER"
        ? getAudioRecorderErrorMessage(error)
        : failure.message;
      if (startOutcome === "timeout") {
        markRecordingStartAttempt(attemptId, "timeout");
      }
      resetRecoverableResources();
      disposeRecorder();
      markRecordingStartAttempt(attemptId, "cleanup_completed");
      recordingStartTrackerRef.current.complete(
        attemptId,
        startOutcome,
        recordingStartSnapshot(),
      );
      void persistPreTurnDiagnosticSnapshot();
      dispatch({
        type: "RECORDING_FAILED",
        message,
        category: failureCategory,
        healthStatus: operationTimedOut ? "degraded" : failure.healthStatus,
        authRequired: failureCategory === "AUTH",
      });
      const abandonedTurnId = activeTurnIdRef.current;
      if (abandonedTurnId) consentByTurnRef.current.delete(abandonedTurnId);
      activeTurnPerformanceRef.current = null;
      activeTurnCreatedAtRef.current = null;
      activeTurnIdRef.current = null;
      activeTurnStateBeforeRecordingRef.current = null;
    } finally {
      if (recordingStartGenerationRef.current === operationGeneration) {
        recordingStartInFlightRef.current = false;
      }
    }
  }

  async function handlePlayback(
    entry: TranslationEntry,
    automatic: boolean,
  ) {
    const decisionAt = new Date().toISOString();
    if (automatic) {
      if (!ttsAttemptRegistryRef.current.claimAutoplay(entry.id)) {
        updateEntryDiagnostics(entry, {
          ttsSkipReason: "duplicate_autoplay_suppressed",
        }, "ttsDuplicateAutoplaySuppressed");
        return;
      }
    }
    if (playbackInFlightRef.current) {
      if (automatic) ttsAttemptRegistryRef.current.releaseAutoplay(entry.id);
      updateEntryDiagnostics(entry, {
        ttsDecisionAt: decisionAt,
        ttsRequested: false,
        ttsRequestReason: "none",
        ttsGenerationOutcome: "not_requested",
        ttsPlaybackOutcome: "not_attempted",
        ttsOutcome: "not_requested",
        ttsSkipReason: "playback_operation_in_flight",
      }, "ttsSkippedWhilePlaybackBusy");
      return;
    }
    const runId = playbackRunIdRef.current + 1;
    const attemptId = `${entry.id}:${runId}`;
    playbackRunIdRef.current = runId;
    playbackInFlightRef.current = true;
    let speechRequestStarted = false;
    let speechReady = hasCachedTranslation(entry.id, speechSpeed);
    setPlaybackReady(false);
    setSpeechFeedback(null);
    updateEntryDiagnostics(entry, {
      ttsDecisionAt: decisionAt,
      ttsRequested: true,
      ttsRequestReason: automatic ? "autoplay" : "manual_play",
      ttsRequestedAt: decisionAt,
      ...(speechReady ? {
        ttsGenerationOutcome: "success" as const,
        ttsOutcome: "success" as const,
      } : {
        ttsGenerationOutcome: "request_started" as const,
        ttsOutcome: "request_started" as const,
      }),
      ttsPlaybackOutcome: "not_attempted",
      ttsPlaybackAttemptId: attemptId,
      ttsSkipReason: null,
    }, speechReady ? "ttsCachedPlaybackRequested" : "ttsRequested");
    if (!automatic) {
      dispatch({ type: "START_PLAYBACK", entryId: entry.id });
    }

    try {
      if (qaNextFailure === "tts" && INTERNAL_TRANSLATOR_QA_ENABLED) {
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
          speechReady = true;
          updateEntryDiagnostics(
            entry,
            {
              ...diagnostics,
              ttsSpeed: speechSpeed,
              ttsGenerationCompletedAt: new Date().toISOString(),
              ttsGenerationOutcome: "success",
              ttsOutcome: "success",
            },
            "ttsGenerated",
          );
        },
        () => {
          speechRequestStarted = true;
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          performance?.markTtsRequestStarted();
          updateEntryDiagnostics(entry, {
            ...(performance?.getDiagnostics() ?? {}),
            ttsGenerationOutcome: "request_started",
            ttsOutcome: "request_started",
          }, "ttsClientRequestStarted");
        },
        () => {
          speechReady = true;
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          updateEntryDiagnostics(
            entry,
            {
              ...(performance?.markTtsReady() ?? {}),
              ttsGenerationOutcome: "success",
              ttsOutcome: "success",
            },
            "ttsReady",
          );
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
                ttsPlaybackStartedAt: new Date().toISOString(),
                ttsPlaybackOutcome: "started",
                ...(automatic ? { autoplayBlocked: false } : {}),
              },
              "playbackStarted",
            );
          }
        },
        (position) => {
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          if (mountedRef.current && playbackRunIdRef.current === runId) {
            updateEntryDiagnostics(
              entry,
              {
                ...(performance?.markPlaybackCompleted() ?? {}),
                ttsPlaybackCompletedAt: new Date().toISOString(),
                ttsPlaybackOutcome: "completed",
                ttsPlaybackCurrentTimeAtEnd: position.currentTime,
                ttsPlaybackDurationAtEnd: position.duration,
              },
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
          const performance = turnPerformanceByEntryRef.current.get(entry.id);
          performance?.markPlayRequested();
          updateEntryDiagnostics(entry, {
            ...(performance?.getDiagnostics() ?? {}),
            ttsPlaybackRequestedAt: new Date().toISOString(),
          }, "ttsPlaybackRequested");
        },
        (identity) => {
          if (mountedRef.current && playbackRunIdRef.current === runId) {
            updateEntryDiagnostics(entry, {
              ttsGenerationId: identity.generationId,
              ttsPlaybackAttemptId: identity.playbackAttemptId,
              ttsPlaybackFromCache: identity.fromCache,
            }, "ttsPlaybackAttemptPrepared");
          }
        },
        (position) => {
          if (mountedRef.current && playbackRunIdRef.current === runId) {
            updateEntryDiagnostics(entry, {
              ttsPlaybackInterruptedAt: new Date().toISOString(),
              ttsPlaybackOutcome: "interrupted",
              ttsPlaybackCurrentTimeAtInterrupt: position.currentTime,
              ttsPlaybackDurationAtInterrupt: position.duration,
            }, "playbackInterrupted");
          }
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
      const isCurrentRun = playbackRunIdRef.current === runId;
      if (isSpeechAbortError(error)) {
        if (mountedRef.current) {
          updateEntryDiagnostics(entry, {
            ttsGenerationOutcome: isCurrentRun ? "aborted" : "stale_result",
            ttsOutcome: isCurrentRun ? "aborted" : "stale_result",
            ttsSkipReason: isCurrentRun ? "playback_aborted" : "stale_playback_result",
          }, isCurrentRun ? "ttsAborted" : "ttsStaleResult");
        }
      } else if (mountedRef.current && isCurrentRun) {
        const failure = getTranslatorSpeechFailure(error, automatic, speechReady);
        setSpeechFeedback(failure);
        if (failure.kind === "autoplay-blocked") {
          updateEntryDiagnostics(
            entry,
            {
              autoplayBlocked: true,
              ttsGenerationOutcome: "success",
              ttsPlaybackOutcome: "blocked",
              ttsOutcome: "success",
              ttsSkipReason: "browser_autoplay_blocked",
            },
            "autoplayBlocked",
          );
        } else {
          const generationFailed = !speechReady;
          updateEntryDiagnostics(entry, {
            ttsGenerationOutcome: generationFailed ? "request_failed" : "success",
            ttsPlaybackOutcome: generationFailed ? "not_attempted" : "failed",
            ttsOutcome: generationFailed ? "request_failed" : "playback_failed",
            ttsSkipReason: generationFailed
              ? (speechRequestStarted ? "speech_request_failed" : "speech_player_unavailable")
              : "browser_playback_failed",
          }, generationFailed ? "ttsRequestFailed" : "ttsPlaybackFailed");
          const technicalFailure = classifyTranslatorFailure(error, "tts");
          const qaScenarioId = technicalFailure.apiErrorCode?.startsWith("qa_")
            ? technicalFailure.apiErrorCode
            : null;
          if (ttsAttemptRegistryRef.current.claimFailureEvent(attemptId)) {
            const ttsEvent = rememberDiagnosticEvent(
              entry.id,
              technicalFailure,
              generationFailed ? "tts_generation" : "tts_playback",
              "degradation",
              "keep_translation_without_tts",
              true,
              qaScenarioId || !generationFailed ? null : "/api/translator/speech",
              qaScenarioId,
            );
            enqueueTechnicalEvent({
              turnId: entry.id,
              entry,
              failure: technicalFailure,
              diagnosticEvent: ttsEvent,
              errorStage: generationFailed ? "tts_generation" : "tts_playback",
              recoveryAction: "keep_translation_without_tts",
              recoverySucceeded: true,
            });
          }
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
    // Stop first so the active attempt can record its intentional interruption.
    // Only then invalidate its callbacks for the next playback generation.
    stopPlayback();
    playbackRunIdRef.current += 1;
    playbackInFlightRef.current = false;
    setPlaybackReady(false);
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
    setProcessingPhase("recognition");
    const abortController = new AbortController();
    requestAbortRef.current = abortController;
    let authoritativeTranscript: string | null = null;
    let errorStage = "transcription";
    const retryState: { failure: TranslatorFailure | null } = { failure: null };
    let qaRealtimeScenarioId: string | null = null;
    let semanticRescueContext: SemanticRescueContext | null = null;
    let semanticRescueSucceeded = false;
    let qaSemanticScenarioId: string | null = null;
    let finishedRealtimeTurn: ClassicRealtimeTurnHandle | null = null;

    try {
      const realtimeTurn = activeRealtimeTurnRef.current;
      finishedRealtimeTurn = realtimeTurn;
      activeRealtimeTurnRef.current = null;
      let realtimeResult = realtimeTurn
        ? await getRealtimeManager().finishTurn(realtimeTurn)
        : {
            ok: false as const,
            fallbackReason:
              "realtime_not_ready_at_recording_start" as const,
          };
      if (qaNextFailure === "realtime" && INTERNAL_TRANSLATOR_QA_ENABLED) {
        realtimeResult = { ok: false, fallbackReason: "session_error" };
        qaRealtimeScenarioId = "qa_realtime_failure";
        setQaNextFailure(null);
      }
      turnPerformance.setRealtimeSetupDuration(realtimeTurn?.realtimeSetupMs);
      turnPerformance.setCaptureDiagnostics({
        trackRebindStartedAt: realtimeTurn?.trackRebindStartedAt ?? null,
        trackRebindCompletedAt: realtimeTurn?.trackRebindCompletedAt ?? null,
        trackRebindMs: realtimeTurn?.trackRebindMs ?? null,
        trackRebindOutcome: realtimeTurn?.trackRebindOutcome ?? undefined,
        senderHadTrackBeforeRebind:
          realtimeTurn?.senderHadTrackBeforeRebind ?? null,
        connectionStateBeforeRebind:
          realtimeTurn?.connectionStateBeforeRebind ?? null,
        connectionStateAfterRebind:
          realtimeTurn?.connectionStateAfterRebind ?? null,
        realtimeConnectionStateTimeline:
          getRealtimeManager().getConnectionDiagnostics()
            .realtimeConnectionStateTimeline,
      });
      let captureDiagnostics = getCaptureDiagnostics();
      if (captureDiagnostics) {
        turnPerformance.setCaptureDiagnostics({
          ...captureDiagnostics,
          realtimeTransportReady: realtimeTurn?.realtimeTransportReady ?? false,
          realtimeInputTrackGeneration:
            realtimeTurn?.realtimeInputTrackGeneration ?? null,
          realtimeFirstDeltaObserved: realtimeTurn?.firstDeltaSeen ?? false,
          realtimeFinalTranscriptReceived: realtimeResult.ok,
          audioSignalObserved:
            typeof monitorResult.metrics.speechActivityRatio === "number"
              ? monitorResult.metrics.speechActivityRatio > 0
              : null,
        });
      }
      suspendMicrophone();

      let transcriptionMs: number | undefined;
      if (realtimeResult.ok) {
        authoritativeTranscript = realtimeResult.authoritativeTranscript;
        turnPerformance.markTranscriptFinal();
        transcriptionMs = turnPerformance.getRecordingToTranscriptFinalMs();
      }
      if (realtimeResult.ok && transcriptionMs !== undefined) {
        turnPerformance.setTranscriptionOutcome("realtime");
        if (realtimeTurn?.semanticCircuitBreakerProbe) {
          rememberDiagnosticEvent(
            activeTurnId,
            {
              category: "REALTIME",
              message: "Realtime semantic probe started",
              healthStatus: "degraded",
              httpStatus: null,
              apiErrorCode: "realtime_semantic_circuit_breaker_probe",
              retryable: false,
              retryAfterMs: null,
              authFailureType: null,
            },
            "semantic_circuit_breaker",
            "info",
            "none",
            null,
            null,
          );
        }
      } else {
        turnPerformance.setTranscriptionOutcome(
          "audio_upload_fallback",
          realtimeResult.ok
            ? "transcript_not_finalized"
            : realtimeResult.fallbackReason,
        );
      }
      const usedAudioFallback = !(realtimeResult.ok && transcriptionMs !== undefined);
      const initialRoutingDecision: SttRoutingDecision = usedAudioFallback
        ? realtimeTurn?.fallbackReason === "realtime_semantic_circuit_breaker"
          ? "audio_safe_mode_circuit_breaker"
          : realtimeTurn?.fallbackReason === "realtime_disabled"
            ? "audio_safe_mode_feature_flag"
            : realtimeResult.ok === false &&
                realtimeResult.fallbackReason === "connection_lost_during_recording"
              ? "audio_fallback_connection_loss"
            : "audio_fallback_cold"
        : "realtime_primary";
      sttRoutingByTurnRef.current.set(activeTurnId, initialRoutingDecision);
      let completedFallbackAudio: Awaited<typeof audioBlobResult> | null = null;
      if (usedAudioFallback) {
        completedFallbackAudio = await audioBlobResult;
        captureDiagnostics = getCaptureDiagnostics();
        if (captureDiagnostics) {
          turnPerformance.setCaptureDiagnostics(captureDiagnostics);
        }
      }
      setProcessingPhase("translation");
      turnPerformance.markTranslationRequestStarted();
      const translationCorrelationId = activeTurnIdRef.current
        ? `translation-${activeTurnIdRef.current}`
        : undefined;
      if (translationCorrelationId) {
        turnPerformance.setCaptureDiagnostics({
          translationRequestCorrelationId: translationCorrelationId,
        });
      }
      errorStage = "translation";
      if (qaNextFailure === "semantic" && INTERNAL_TRANSLATOR_QA_ENABLED) {
        qaSemanticScenarioId = "qa_semantic_unsupported_language";
        setQaNextFailure(null);
      }
      if (
        (qaNextFailure === "translation" || qaNextFailure === "network") &&
        INTERNAL_TRANSLATOR_QA_ENABLED
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
        correlationId: translationCorrelationId,
        recordedAudioDiagnostics: {
          recordingDurationMs:
            turnPerformance.getDiagnostics().recordingDurationMs ?? null,
          chunkCount: captureDiagnostics?.mediaRecorderChunkCount ?? null,
          totalChunkBytes:
            captureDiagnostics?.mediaRecorderTotalChunkBytes ?? null,
        },
        simulatePrimaryUnsupportedLanguage: qaSemanticScenarioId !== null,
        onSemanticRescueStarted: ({ primaryFailure }) => {
          setProcessingPhase("recognition");
          rememberDiagnosticEvent(
            activeTurnId,
            { ...primaryFailure, category: "TRANSCRIPTION", retryable: false },
            "semantic_rescue",
            "info",
            "none",
            null,
            "/api/translator/translate",
            qaSemanticScenarioId,
          );
        },
        onSemanticRescueSucceeded: (context) => {
          semanticRescueContext = context;
          semanticRescueSucceeded = true;
        },
        onSemanticRescueFailed: (context) => {
          semanticRescueContext = context;
        },
        onResponseCompleted: (now) =>
          turnPerformance.markTranslationClientResponseCompleted(now),
        onRetry: ({ failure }) => {
          retryState.failure = failure;
        },
      });
      setProcessingPhase("translation");
      result.diagnostics.sttRoutingDecision ??=
        sttRoutingByTurnRef.current.get(activeTurnId) ?? initialRoutingDecision;
      result.diagnostics.finalTranscript = result.originalText;
      result.diagnostics.finalTranscriptionPath = semanticRescueSucceeded || usedAudioFallback
        ? "audio_upload_fallback"
        : "realtime";
      result.diagnostics.finalTranscriptionModel = result.diagnostics.transcriptionModel;
      result.diagnostics.transcriptScriptAnomalyDetected =
        transcriptScriptAnomalyDetected(result.originalText);
      if (completedFallbackAudio?.ok) {
        const capture = audioCaptureByTurnRef.current.get(activeTurnId);
        if (capture) {
          capture.metrics = inferAudioSignalFromSuccessfulTranscription(
            capture.metrics,
          );
          turnPerformance.setCaptureDiagnostics({
            audioSignalObserved: true,
            audioSignalEvidence: capture.metrics.evidence,
          });
        }
      }
      if (!semanticRescueSucceeded) {
        result.diagnostics.primaryTranscript = realtimeResult.ok
          ? realtimeResult.authoritativeTranscript
          : result.originalText;
        result.diagnostics.primaryTranscriptionPath = usedAudioFallback
          ? "audio_upload_fallback"
          : "realtime";
        result.diagnostics.primaryTranscriptionModel = result.diagnostics.transcriptionModel;
      }
      turnPerformance.markTranslationCompleted();
      if (usedAudioFallback || semanticRescueSucceeded) {
        turnPerformance.setFallbackServerTimings(result.diagnostics);
      }
      if (semanticRescueSucceeded) {
        completedFallbackAudio = await audioBlobResult;
        sttRoutingByTurnRef.current.set(activeTurnId, "audio_rescue_semantic_failure");
        turnPerformance.setTranscriptionOutcome(
          "audio_upload_fallback",
          "unsupported_language",
        );
        const semanticOutcome = realtimeTurn
          ? getRealtimeManager().recordSemanticFailure(realtimeTurn, {
              organic: qaSemanticScenarioId === null,
            })
          : { tripped: false, probe: false };
        const context = semanticRescueContext as unknown as SemanticRescueContext;
        const startConsent = consentByTurnRef.current.get(activeTurnId)
          ?.consentAtRecordingStart;
        const allowLocalCandidateContent = Boolean(
          (startConsent?.internalSpeechDiagnosticsEnabled &&
            diagnosticsSettingsRef.current.internalQaModeEnabled) ||
          (startConsent?.qualityContentSharingEnabled &&
            diagnosticsSettingsRef.current.qualityContentSharingEnabled),
        );
        sttComparisonsByTurnRef.current.set(activeTurnId, {
          turnId: activeTurnId,
          createdAt: new Date().toISOString(),
          audioFingerprintSessionLocal: `audio-${activeTurnId}`,
          primary: {
            model: context.primaryModel,
            path: "realtime",
            transcript: allowLocalCandidateContent ? context.primaryTranscript : null,
            transcriptLength: context.primaryTranscript.length,
          },
          rescue: {
            model: context.rescueModel ?? "gpt-4o-mini-transcribe",
            path: "audio_upload_fallback",
            transcript: allowLocalCandidateContent ? context.rescueTranscript : null,
            transcriptLength: context.rescueTranscript?.length ?? 0,
          },
          didTranscriptChange: context.rescueTranscript === null
            ? null
            : context.primaryTranscript !== context.rescueTranscript,
          finalPath: "audio_rescue_semantic_failure",
          rescueReason: "unsupported_language",
          translationOutcomeBeforeRescue: "unsupported_language",
          translationOutcomeAfterRescue: "success",
          primaryFailureToRescueStartMs: context.primaryFailureToRescueStartMs,
          semanticRescueTotalMs: context.semanticRescueTotalMs,
        });
        const rescueFailure: TranslatorFailure = {
          ...context.primaryFailure,
          category: "TRANSCRIPTION",
          message: "Die Live-Erkennung war unsicher. Die sichere Spracherkennung wurde verwendet.",
          healthStatus: "degraded",
          retryable: false,
        };
        rememberDiagnosticEvent(
          activeTurnId,
          rescueFailure,
          "semantic_translation_validation",
          "degradation",
          "audio_transcription_rescue",
          true,
          "/api/translator/translate",
          qaSemanticScenarioId,
        );
        if (semanticOutcome.tripped) {
          rememberDiagnosticEvent(
            activeTurnId,
            { ...rescueFailure, apiErrorCode: "realtime_semantic_circuit_breaker_activated" },
            "semantic_circuit_breaker",
            "info",
            "audio_upload_fallback",
            true,
            null,
          );
        }
      } else if (realtimeResult.ok && realtimeTurn) {
        const semanticOutcome = getRealtimeManager().recordSemanticSuccess(
          realtimeTurn,
          { organic: qaRealtimeScenarioId === null },
        );
        if (semanticOutcome.recoveredProbe) {
          rememberDiagnosticEvent(
            activeTurnId,
            {
              category: "REALTIME",
              message: "Realtime semantic probe recovered",
              healthStatus: "healthy",
              httpStatus: null,
              apiErrorCode: "realtime_semantic_circuit_breaker_recovered",
              retryable: false,
              retryAfterMs: null,
              authFailureType: null,
            },
            "semantic_circuit_breaker",
            "info",
            "none",
            true,
            null,
          );
        }
      }
      turnPerformance.setCaptureDiagnostics({
        audioBlobSize:
          completedFallbackAudio?.ok === true
            ? completedFallbackAudio.audioBlob.size
            : null,
        capturePathOutcome: semanticRescueSucceeded
          ? "semantic_rescue_success"
          : usedAudioFallback
          ? "audio_fallback_success"
          : "realtime_success",
      });
      const finalizedConsent = finalizeTurnConsent(activeTurnId);
      if (finalizedConsent) {
        createSpeechReviewCandidate({
          turnId: activeTurnId,
          recognizedTranscript: result.originalText,
          sourceLanguage: result.sourceLanguage,
          transcriptionModel: result.diagnostics.transcriptionModel,
          transcriptionPath: usedAudioFallback || semanticRescueSucceeded
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
          ttsDecisionAt: new Date().toISOString(),
          ttsRequested: state.autoPlay,
          ttsRequestReason: state.autoPlay ? "autoplay" : "none",
          ttsGenerationOutcome: state.autoPlay ? "request_started" : "disabled",
          ttsPlaybackOutcome: "not_attempted",
          ttsOutcome: state.autoPlay ? "request_started" : "disabled",
          ttsSkipReason: state.autoPlay ? null : "autoplay_disabled",
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
        turnPerformance.setCaptureDiagnostics({
          audioBlobSize: recordedAudio.audioBlob.size,
        });
        updateEntryDiagnostics(
          entry,
          { audioBlobSize: recordedAudio.audioBlob.size },
          "audioBackupFinalized",
        );
        audioMetadataByTurnRef.current.set(entry.id, {
          audioMimeType: recordedAudio.audioBlob.type || null,
          audioSize: recordedAudio.audioBlob.size,
        });
        const capture = audioCaptureByTurnRef.current.get(entry.id);
        if (capture) {
          capture.metadata.mimeType = recordedAudio.audioBlob.type || null;
          capture.metadata.sizeBytes = recordedAudio.audioBlob.size;
          capture.metrics = inferAudioSignalFromSuccessfulTranscription(
            capture.metrics,
          );
          updateEntryDiagnostics(
            entry,
            {
              audioSignalObserved: true,
              audioSignalEvidence: capture.metrics.evidence,
            },
            "audioSignalInferred",
          );
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
            audioQualityMetrics:
              capture?.metrics ?? quality.audioQualityMetrics,
          });
          setQualityRevision((current) => current + 1);
        }
        const turnConsent = consentByTurnRef.current.get(entry.id);
        if (turnConsent && speechAudioEligibleForTurn(turnConsent)) {
          rememberLocalAudio(entry.id, recordedAudio.audioBlob);
        }
        const benchmarkInput = turnConsent ? {
          turnId: entry.id,
          audioBlob: recordedAudio.audioBlob,
          primaryTranscript: result.originalText,
          primaryCompletedAt: turnPerformance.getDiagnostics().transcriptFinalAt ??
            result.diagnostics.transcriptFinalAt ?? new Date().toISOString(),
          primaryEngine: "gpt-live-transcribe",
          primaryRoute: "realtime" as const,
          fallbackDirection: direction,
          recordingDurationMs: turnPerformance.getDiagnostics().recordingDurationMs ?? null,
          consent: turnConsent,
          internalQaEnabled: INTERNAL_TRANSLATOR_QA_ENABLED &&
            diagnosticsSettingsRef.current.internalQaModeEnabled &&
            !usedAudioFallback && !semanticRescueSucceeded,
          recordedAudioDiagnostics: {
            recordingDurationMs: turnPerformance.getDiagnostics().recordingDurationMs ?? null,
            chunkCount: captureDiagnostics?.mediaRecorderChunkCount ?? null,
            totalChunkBytes: captureDiagnostics?.mediaRecorderTotalChunkBytes ?? null,
          },
        } : null;
        if (benchmarkInput && sameAudioBenchmarkRunnerRef.current.isEligible(benchmarkInput)) {
          sameAudioEligibleTurnIdsRef.current.add(entry.id);
          sameAudioBenchmarkRunnerRef.current.run(benchmarkInput, (comparison) => {
            if (!mountedRef.current) return;
            const existing = sameAudioBenchmarksByTurnRef.current.get(entry.id);
            const sample = qualityByTurnRef.current.get(entry.id);
            let nextComparison = comparison.benchmarkStatus === "completed" &&
              existing && existing.groundTruthStatus !== "unreviewed"
              ? reviewSameAudioComparison(comparison, {
                  status: existing.groundTruthStatus,
                  correctedTranscript: existing.groundTruthTranscript ?? undefined,
                  reviewedAt: existing.reviewedAt ?? undefined,
                })
              : comparison;
            if (comparison.benchmarkStatus === "completed" &&
              nextComparison.groundTruthStatus === "unreviewed" &&
              sample?.recognitionReviewStatus === "accepted") {
              nextComparison = reviewSameAudioComparison(comparison, {
                status: "accepted_primary",
              });
            } else if (comparison.benchmarkStatus === "completed" &&
              nextComparison.groundTruthStatus === "unreviewed" &&
              sample?.recognitionReviewStatus === "corrected" &&
              sample.correctedTranscript) {
              nextComparison = reviewSameAudioComparison(comparison, {
                status: "corrected",
                correctedTranscript: sample.correctedTranscript,
              });
            }
            sameAudioBenchmarksByTurnRef.current.set(entry.id, nextComparison);
            if (sample) qualityByTurnRef.current.set(entry.id, {
              ...sample,
              primaryTranscriptAvailable: true,
              rescueTranscriptAvailable: nextComparison.secondaryTranscript !== null,
              benchmarkReadySameAudioSample:
                nextComparison.benchmarkStatus === "completed" &&
                nextComparison.groundTruthStatus !== "unreviewed",
            });
            setQualityRevision((revision) => revision + 1);
          });
        }
      });
      pendingTranslationVisibleEntryIdRef.current = entry.id;
      turnPerformance.markTranslationStateCommitted();
      dispatch({
        type: "PROCESSING_SUCCEEDED",
        entry,
      });
      if (qaRealtimeScenarioId) {
        setQaLastResult("Test erfolgreich: Realtime-Ausfall → sicherer Audio-Fallback");
      } else if (qaSemanticScenarioId && semanticRescueSucceeded) {
        setQaLastResult("Test erfolgreich: Semantic-Rescue → sichere Erkennung");
      }
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
        setProcessingPhase("translation");
        const failedRescueContext = semanticRescueContext as unknown as
          SemanticRescueContext | null;
        if (failedRescueContext) {
          if (finishedRealtimeTurn) {
            getRealtimeManager().recordSemanticFailure(
              finishedRealtimeTurn,
              { organic: qaSemanticScenarioId === null },
            );
          }
          const startConsent = consentByTurnRef.current.get(activeTurnId)
            ?.consentAtRecordingStart;
          const allowLocalCandidateContent = Boolean(
            (startConsent?.internalSpeechDiagnosticsEnabled &&
              diagnosticsSettingsRef.current.internalQaModeEnabled) ||
            (startConsent?.qualityContentSharingEnabled &&
              diagnosticsSettingsRef.current.qualityContentSharingEnabled),
          );
          sttRoutingByTurnRef.current.set(activeTurnId, "audio_rescue_semantic_failure");
          sttComparisonsByTurnRef.current.set(activeTurnId, {
            turnId: activeTurnId,
            createdAt: new Date().toISOString(),
            audioFingerprintSessionLocal: `audio-${activeTurnId}`,
            primary: {
              model: failedRescueContext.primaryModel,
              path: "realtime",
              transcript: allowLocalCandidateContent
                ? failedRescueContext.primaryTranscript : null,
              transcriptLength: failedRescueContext.primaryTranscript.length,
            },
            rescue: failedRescueContext.rescueTranscript === null ? null : {
              model: failedRescueContext.rescueModel ?? "gpt-4o-mini-transcribe",
              path: "audio_upload_fallback",
              transcript: allowLocalCandidateContent
                ? failedRescueContext.rescueTranscript : null,
              transcriptLength: failedRescueContext.rescueTranscript.length,
            },
            didTranscriptChange: failedRescueContext.rescueTranscript === null
              ? null
              : failedRescueContext.primaryTranscript !==
                failedRescueContext.rescueTranscript,
            finalPath: "audio_rescue_semantic_failure",
            rescueReason: "unsupported_language",
            translationOutcomeBeforeRescue: "unsupported_language",
            translationOutcomeAfterRescue:
              failedRescueContext.rescueFailure?.apiErrorCode === "unsupported_language"
                ? "unsupported_language"
                : "failure",
            primaryFailureToRescueStartMs:
              failedRescueContext.primaryFailureToRescueStartMs,
            semanticRescueTotalMs: failedRescueContext.semanticRescueTotalMs,
          });
          rememberDiagnosticEvent(
            activeTurnId,
            {
              ...failedRescueContext.primaryFailure,
              category: "TRANSCRIPTION",
              healthStatus: "degraded",
              retryable: false,
            },
            "semantic_translation_validation",
            "degradation",
            "audio_transcription_rescue",
            false,
            "/api/translator/translate",
            qaSemanticScenarioId,
          );
          authoritativeTranscript = failedRescueContext.rescueTranscript ??
            failedRescueContext.primaryTranscript;
        }
        if (!authoritativeTranscript && error instanceof TranslatorClientError) {
          authoritativeTranscript = error.recognizedTranscript;
        }
        const recordedAudio = await audioBlobResult;
        const failure = recordedAudio.ok
          ? classifyTranslatorFailure(error, errorStage)
          : classifyTranslatorFailure(recordedAudio.error, "recording_stop");
        const invalidCapture =
          failure.apiErrorCode === "invalid_audio_capture" ||
          failure.apiErrorCode === "no_audio_captured";
        if (invalidCapture) {
          poisonCurrentStream();
          turnPerformance.setCaptureDiagnostics({
            audioBlobSize: recordedAudio.ok ? recordedAudio.audioBlob.size : null,
            capturePathOutcome: "invalid_audio_capture",
          });
        }
        const message = recordedAudio.ok
          ? failure.message || getTranslatorClientErrorMessage(error)
          : getAudioRecorderErrorMessage(recordedAudio.error);
        const failureStage = invalidCapture ? "recording_stop" :
          recordedAudio.ok ? errorStage : "recording_stop";
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
          : qaSemanticScenarioId;
        const failureEvent = rememberDiagnosticEvent(
          turnId,
          failure,
          failureStage,
          "failure",
          recoveryAction,
          failure.category === "AUTH" ? false : true,
          recordedAudio.ok && !invalidCapture && !qaScenarioId
            ? "/api/translator/translate" : null,
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
            errorCode: failure.apiErrorCode ?? (recordedAudio.ok
              ? "processing_failed"
              : "recording_failed"),
            errorStage: failureStage,
            errorType: error instanceof Error ? error.name : "UnknownError",
            sanitizedErrorMessage: message,
            stateBeforeRecording: activeTurnStateBeforeRecordingRef.current,
            stateAtFailure: "processing",
            stateAfterCleanup: failure.category === "AUTH" ? "error" : "idle",
            recorderStatusBefore: recorderStatusBeforeStop,
            recorderStatusAtFailure: recorderStatus,
            recorderStatusAfterCleanup: "idle",
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
            authCheckAttempted:
              recordedAudio.ok &&
              !qaScenarioId &&
              failure.apiErrorCode !== "invalid_audio_capture" &&
              failure.apiErrorCode !== "no_audio_captured",
            authCheckSucceeded:
              !recordedAudio.ok || qaScenarioId ||
              failure.apiErrorCode === "invalid_audio_capture" ||
              failure.apiErrorCode === "no_audio_captured"
                ? null
                : failure.authFailureType !== null ? false : true,
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
          if (!invalidCapture && turnConsent && speechAudioEligibleForTurn(turnConsent)) {
            rememberLocalAudio(turnId, recordedAudio.audioBlob);
          }
        }
        enqueueTechnicalEvent({
          turnId,
          failure,
          diagnosticEvent: failureEvent,
          errorStage: failureStage,
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
      setProcessingPhase("translation");
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
    diagnosticEventsByTurnRef.current.clear();
    sttRoutingByTurnRef.current.clear();
    sttComparisonsByTurnRef.current.clear();
    sameAudioBenchmarksByTurnRef.current.clear();
    sameAudioEligibleTurnIdsRef.current.clear();
    sameAudioBenchmarkRunnerRef.current.reset();
    ttsAttemptRegistryRef.current.reset();
    consentByTurnRef.current.clear();
    consentEventsRef.current = [];
    audioCaptureByTurnRef.current.clear();
    recordingStartTrackerRef.current.reset();
    setFailedSpeechReviewTurnIds([]);
    pendingTranslationVisibleEntryIdRef.current = null;
    reportStartedAtRef.current = new Date().toISOString();
    reportIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`;
    setFailedReportTurns([]);
    setSpeechFeedback(null);
    setQaLastResult(null);
    setFeedbackEntryId(null);
    setSavedFeedbackIds(new Set());
    setPostConversationReviewOpen(false);
    setQualityRevision((current) => current + 1);
    dispatch({ type: "CLEAR_HISTORY" });
  }

  function buildCurrentReport(
    qualityByTurn = qualityByTurnRef.current,
    audioIncludedInDiagnosticBundleByTurn: ReadonlySet<string> = new Set<string>(),
    bundleSnapshot = false,
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
        sttRoutingByTurn: sttRoutingByTurnRef.current,
        sttComparisonsByTurn: sttComparisonsByTurnRef.current,
        sameAudioBenchmarksByTurn: sameAudioBenchmarksByTurnRef.current,
        sameAudioEligibleTurnIds: sameAudioEligibleTurnIdsRef.current,
        audioBlobAvailableByTurn: new Set(audioBlobByTurnRef.current.keys()),
        audioIncludedInDiagnosticBundleByTurn,
        buildMetadata: buildMetadataRef.current,
        diagnosticsSettings,
        installationId: installationIdRef.current,
        sessionId: sessionIdRef.current,
        audioManifestConsistent: bundleSnapshot ? true : null,
        recordingStartAttempts: recordingStartTrackerRef.current.getAttempts(),
        activeRecordingStartAttempt:
          recordingStartTrackerRef.current.getActiveAttempt(),
        droppedTelemetryEvents:
          telemetryQueueRef.current?.getDroppedEventCount() ?? 0,
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
      report: buildCurrentReport(qualityForExport, includedTurnIds, true),
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
    downloadTranslatorDiagnosticBundle(bundle);
  }

  useEffect(() => {
    const hasInternalQaLearning = diagnosticsSettingsRef.current.internalQaModeEnabled && (
      feedbackByTurnRef.current.size > 0 ||
      sameAudioBenchmarksByTurnRef.current.size > 0 ||
      Array.from(qualityByTurnRef.current.values()).some((sample) =>
        sample.recognitionReviewStatus !== "unreviewed")
    );
    if ((failedReportTurns.length === 0 && !hasInternalQaLearning) || !incidentStoreRef.current) return;
    const report = buildCurrentReport();
    const audio = Array.from(audioBlobByTurnRef.current, ([turnId, blob]) => ({
      turnId,
      blob,
      durationMs:
        audioCaptureByTurnRef.current.get(turnId)?.metadata.durationMs ?? null,
      recognitionReviewStatus:
        qualityByTurnRef.current.get(turnId)?.recognitionReviewStatus ?? null,
      audioQualityMetrics:
        audioCaptureByTurnRef.current.get(turnId)?.metrics ??
        UNAVAILABLE_AUDIO_QUALITY,
    }));
    void incidentStoreRef.current.save({
      sessionId: sessionIdRef.current,
      reportId: reportIdRef.current,
      createdAt: new Date().toISOString(),
      turnCount: report.turns.length,
      report,
      audio,
    }).then((saved) => setLastIncident(saved)).catch(() => undefined);
    // Refs hold the privacy-filtered audio/quality snapshot. The revision is
    // intentionally the trigger for their non-React mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedReportTurns, qualityRevision, state.entries]);

  async function handleExportLastIncident() {
    if (!lastIncident) return;
    const included = new Set(lastIncident.audio.map((audio) => audio.turnId));
    const base = lastIncident.report && typeof lastIncident.report === "object"
      ? lastIncident.report as Record<string, unknown>
      : {};
    const turns = Array.isArray(base.turns)
      ? base.turns.map((turn) => {
          if (!turn || typeof turn !== "object") return turn;
          const record = turn as Record<string, unknown>;
          return {
            ...record,
            audioIncludedInDiagnosticBundle:
              typeof record.turnId === "string" && included.has(record.turnId),
          };
        })
      : [];
    const report = {
      ...base,
      turns,
      audioIncludedTurnCount: included.size,
      incidentExpiresAt: lastIncident.expiresAt,
      reportIntegrity: {
        ...(base.reportIntegrity && typeof base.reportIntegrity === "object"
          ? base.reportIntegrity : {}),
        sessionComplete: true,
        persistedSnapshotUsed: true,
        audioManifestConsistent: true,
      },
    };
    const bundle = await createTranslatorDiagnosticBundle({
      report,
      includeAudio: true,
      audioFiles: lastIncident.audio.map((audio) => ({
        ...audio,
        consentEligible: true,
      })),
    });
    downloadTranslatorDiagnosticBundle(bundle);
  }

  function handleTranscriptCorrection(entry: TranslationEntry, correctedTranscript: string) {
    const current = qualityByTurnRef.current.get(entry.id);
    if (!current) return;
    qualityByTurnRef.current.set(
      entry.id,
      {
        ...correctSpeechQualityRecord(current, correctedTranscript),
        benchmarkReadySameAudioSample:
          sttComparisonsByTurnRef.current.has(entry.id) &&
          audioBlobByTurnRef.current.has(entry.id),
      },
    );
    const comparison = sameAudioBenchmarksByTurnRef.current.get(entry.id);
    if (comparison) {
      sameAudioBenchmarksByTurnRef.current.set(entry.id, reviewSameAudioComparison(
        comparison,
        { status: "corrected", correctedTranscript },
      ));
    }
    setQualityRevision((current) => current + 1);
    rememberReviewCompleted(entry.id);
  }

  function handleAcceptTranscript(turnId: string) {
    const current = qualityByTurnRef.current.get(turnId);
    if (!current) return;
    qualityByTurnRef.current.set(turnId, {
      ...acceptSpeechQualityRecord(current),
      benchmarkReadySameAudioSample:
        sttComparisonsByTurnRef.current.has(turnId) &&
        audioBlobByTurnRef.current.has(turnId),
    });
    const comparison = sameAudioBenchmarksByTurnRef.current.get(turnId);
    if (comparison && comparison.groundTruthStatus === "unreviewed") {
      sameAudioBenchmarksByTurnRef.current.set(
        turnId,
        reviewSameAudioComparison(comparison, { status: "accepted_primary" }),
      );
    }
    setQualityRevision((revision) => revision + 1);
    rememberReviewCompleted(turnId);
  }

  function handleBenchmarkReview(
    turnId: string,
    status: Parameters<typeof reviewSameAudioComparison>[1]["status"],
    correctedTranscript?: string,
  ) {
    const current = sameAudioBenchmarksByTurnRef.current.get(turnId);
    if (!current) return;
    const reviewed = reviewSameAudioComparison(current, { status, correctedTranscript });
    sameAudioBenchmarksByTurnRef.current.set(turnId, reviewed);
    const sample = qualityByTurnRef.current.get(turnId);
    if (sample) {
      const reviewedSample = status === "accepted_primary" || status === "equivalent"
        ? acceptSpeechQualityRecord(sample)
        : reviewed.groundTruthTranscript && status !== "uncertain"
          ? correctSpeechQualityRecord(sample, reviewed.groundTruthTranscript)
          : sample;
      qualityByTurnRef.current.set(turnId, {
        ...reviewedSample,
        benchmarkReadySameAudioSample: status !== "uncertain",
      });
    }
    setQualityRevision((revision) => revision + 1);
    rememberReviewCompleted(turnId);
  }

  function handleFailedTranscriptCorrection(
    turnId: string,
    correctedTranscript: string,
  ) {
    const current = qualityByTurnRef.current.get(turnId);
    if (!current) return;
    qualityByTurnRef.current.set(
      turnId,
      {
        ...correctSpeechQualityRecord(current, correctedTranscript),
        benchmarkReadySameAudioSample:
          sttComparisonsByTurnRef.current.has(turnId) &&
          audioBlobByTurnRef.current.has(turnId),
      },
    );
    setQualityRevision((revision) => revision + 1);
    rememberReviewCompleted(turnId);
  }

  function rememberReviewCompleted(turnId: string) {
    const events = diagnosticEventsByTurnRef.current.get(turnId) ?? [];
    const qaEvent = events.find((event) =>
      event.eventOrigin === "qa_simulation");
    const qaScenarioId = qaEvent?.qaScenarioId ?? null;
    diagnosticEventsByTurnRef.current.set(turnId, [...events,
      createTranslatorDiagnosticEvent({
        eventOrigin: qaEvent ? "qa_simulation" : "organic_runtime",
        eventKind: "info",
        category: "UNKNOWN",
        stage: "review_completed",
        endpoint: null,
        httpStatus: null,
        apiCode: null,
        retryable: false,
        recoveryAction: "none",
        recoverySucceeded: null,
        qaScenarioId,
        authFailureType: null,
      }),
    ]);
  }

  function handleFeedbackSaved(
    entryId: string,
    feedback: SavedTurnFeedback,
    ownerId: string | null,
  ) {
    if (typeof sessionStorage !== "undefined" && ownerId) {
      removePendingTranslatorFeedback(sessionStorage, ownerId, entryId);
    }
    feedbackByTurnRef.current.set(entryId, feedback);
    setSavedFeedbackIds((current) => new Set(current).add(entryId));
    setQualityRevision((current) => current + 1);
  }

  function handleFeedbackCaptured(
    entryId: string,
    feedback: SavedTurnFeedback,
  ) {
    feedbackByTurnRef.current.set(entryId, feedback);
    setSavedFeedbackIds((current) => new Set(current).add(entryId));
    if (feedback.speechFeedbackStatus === "accepted") {
      handleAcceptTranscript(entryId);
    } else if (feedback.speechFeedbackStatus === "corrected" && feedback.correctedTranscript) {
      const entry = state.entries.find((item) => item.id === entryId);
      if (entry) handleTranscriptCorrection(entry, feedback.correctedTranscript);
    }
    setQualityRevision((current) => current + 1);
  }

  function handleFeedbackSyncFailed(
    entry: TranslationEntry,
    input: {
      rating: TranslatorFeedbackRating;
      categories: TranslatorFeedbackCategory[];
      comment: string;
    },
    ownerId: string | null,
  ) {
    if (typeof sessionStorage === "undefined" || !ownerId) return;
    enqueuePendingTranslatorFeedback(
      sessionStorage,
      ownerId,
      createTranslatorFeedbackSubmission(entry, input),
    );
  }

  return (
    <main className="min-h-screen bg-base px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
      <div className="mx-auto flex w-full max-w-xl flex-col">
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

        <section className="panel mt-4 p-5 sm:p-6">
          {state.status === "idle" ? (
            <>
              <p className="text-center text-sm font-medium text-muted">
                {SHARED_CONVERSATION_LABELS.ready.de}
                <span className="ml-1 text-xs">· {SHARED_CONVERSATION_LABELS.ready.sw}</span>
              </p>
              {state.errorMessage ? (
                <div
                  className={`status-note mt-3 ${
                    state.healthStatus === "degraded" ? "status-info" : "status-warning"
                  }`}
                  role="status"
                >
                  <p>{state.errorMessage}</p>
                  {state.failureCategory === "REALTIME" ? (
                    <p className="mt-1 text-sm text-muted">
                      {SHARED_CONVERSATION_LABELS.safeRecognitionUsed.sw}
                    </p>
                  ) : null}
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
                <span>
                  {recorderStatus === "starting" || recorderStatus === "recording"
                    ? SHARED_CONVERSATION_LABELS.openingMicrophone.de
                    : state.errorMessage
                      ? SHARED_CONVERSATION_LABELS.retry.de
                      : SHARED_CONVERSATION_LABELS.startRecording.de}
                  <span className="mt-1 block text-sm font-medium opacity-80">
                    {recorderStatus === "starting" || recorderStatus === "recording"
                      ? SHARED_CONVERSATION_LABELS.openingMicrophone.sw
                      : state.errorMessage
                        ? SHARED_CONVERSATION_LABELS.retry.sw
                        : SHARED_CONVERSATION_LABELS.startRecording.sw}
                  </span>
                </span>
              </button>
            </>
          ) : null}

          {state.status === "recording" ? (
            <>
              <div className="flex items-center justify-center gap-3 text-accent-danger-strong">
                <span className="h-3 w-3 rounded-full bg-accent-danger motion-safe:animate-pulse" aria-hidden="true" />
                <p className="font-semibold">
                  {SHARED_CONVERSATION_LABELS.recording.de}
                  <span className="block text-sm font-medium">
                    {SHARED_CONVERSATION_LABELS.recording.sw}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-24 w-full touch-manipulation text-lg active:scale-[0.99]"
                disabled={recorderStatus === "stopping"}
                onClick={() => void handleStopRecording()}
              >
                <span>
                  {recorderStatus === "stopping"
                    ? SHARED_CONVERSATION_LABELS.finishingRecording.de
                    : SHARED_CONVERSATION_LABELS.finish.de}
                  <span className="mt-1 block text-sm font-medium opacity-85">
                    {recorderStatus === "stopping"
                      ? SHARED_CONVERSATION_LABELS.finishingRecording.sw
                      : SHARED_CONVERSATION_LABELS.finish.sw}
                  </span>
                </span>
              </button>
            </>
          ) : null}

          {state.status === "processing" ? (
            <ProcessingIndicator key={processingPhase} stage={processingPhase} />
          ) : null}

          {state.status === "playing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              {playbackReady ? (
                <p className="font-semibold text-accent-success-strong">
                  Wird vorgelesen … · Inasomwa …
                </p>
              ) : (
                <ProcessingIndicator stage="audio" />
              )}
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
                  <span>
                    {SHARED_CONVERSATION_LABELS.retry.de}
                    <span className="ml-1 text-sm font-medium text-muted">
                      · {SHARED_CONVERSATION_LABELS.retry.sw}
                    </span>
                  </span>
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

        <details className="order-2 mt-5 rounded-xl border border-soft bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 py-3 font-medium text-primary">
            <span>⚙ Erweiterte Einstellungen</span>
            {diagnosticsSettings.diagnosticsSharingEnabled ? (
              <span className="text-xs font-normal text-muted">Diagnose aktiviert</span>
            ) : null}
          </summary>
          <section className="border-t border-soft p-5" aria-labelledby="diagnostics-heading">
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
                  Sprachaufnahmen werden nur mit dieser Zustimmung lokal für das Diagnosepaket behalten. Im internen Sprach-Qualitätsmodus darf dieselbe Aufnahme zusätzlich einmal an die sichere Erkennung gesendet werden; sie wird nicht als zweite Audiodatei archiviert.
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
          {INTERNAL_TRANSLATOR_QA_ENABLED ? (
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
                Speichert für interne Tests erkannte Sprache und – wenn erlaubt – Audio lokal. Bei Realtime-Turns wird dieselbe Aufnahme zusätzlich über die sichere Erkennung verglichen; Übersetzung und Vorlesen warten nicht darauf.
              </p>
              {diagnosticsSettings.internalQaModeEnabled ? (
                <div className="mt-3">
                  <p className="text-sm font-medium text-primary">
                    Nächsten Fehler einmalig simulieren
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Nur interner Test. Der gewählte Fehler wird genau bei der nächsten Aufnahme simuliert.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(Object.entries(QA_FAILURE_LABELS) as Array<
                      [keyof typeof QA_FAILURE_LABELS, string]
                    >).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`btn min-h-11 text-sm ${
                          qaNextFailure === value ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => {
                          setQaLastResult(null);
                          setQaNextFailure(qaNextFailure === value ? null : value);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {qaNextFailure ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-soft p-2 text-xs" role="status">
                      <span>Nächster Test: {QA_FAILURE_LABELS[qaNextFailure]}</span>
                      <button type="button" className="btn btn-ghost min-h-10 px-3 text-xs" onClick={() => setQaNextFailure(null)}>Abbrechen</button>
                    </div>
                  ) : null}
                  {qaLastResult ? <p className="status-note status-info mt-2 text-sm" role="status">{qaLastResult}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          </section>
        </details>

        <section className="order-1 mt-7" aria-labelledby="conversation-heading">
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

          {state.entries.length === 0 && postConversationReviewCandidateCount === 0 ? (
            <div className="mt-3 border-y border-soft py-8 text-center text-sm text-muted">
              Noch keine Übersetzungen
            </div>
          ) : (
            <>
            {INTERNAL_TRANSLATOR_QA_ENABLED &&
            diagnosticsSettings.internalQaModeEnabled ? (
              <div
                ref={reviewSectionRef}
                className="mt-3 scroll-mt-4 rounded-xl border border-soft bg-surface p-3"
                tabIndex={-1}
              >
                <button
                  type="button"
                  className="btn btn-secondary min-h-11 w-full"
                  aria-expanded={postConversationReviewOpen}
                  disabled={postConversationReviewCandidateCount === 0}
                  onClick={() => {
                    setPostConversationReviewOpen((open) => {
                      if (!open) requestAnimationFrame(() => {
                        const firstCandidate = document.querySelector<HTMLElement>(
                          '[data-review-candidate="true"]',
                        );
                        const target = firstCandidate ?? reviewSectionRef.current;
                        target?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                        target?.focus({ preventScroll: true });
                      });
                      return !open;
                    });
                  }}
                >
                  Qualitätsprüfung ({postConversationReviewCandidateCount})
                </button>
                <p className="mt-2 text-center text-xs text-muted">
                  {postConversationReviewCandidateCount === 0
                    ? "Für dieses Gespräch gibt es aktuell keine auffälligen Passagen zum Prüfen."
                    : postConversationReviewOpen
                      ? "Die ausgewählten Passagen sind jetzt direkt unterhalb markiert."
                      : "Prüft automatisch ausgewählte Gesprächspassagen. Jeder Turn kann zusätzlich direkt über Rückmeldung korrigiert werden."}
                </p>
              </div>
            ) : null}
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
                  INTERNAL_TRANSLATOR_QA_ENABLED &&
                  postConversationReviewOpen &&
                  postConversationReviewCandidateIds.has(entry.id) &&
                  speechReview !== null;

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
                    reviewOrigin={(diagnosticEventsByTurnRef.current.get(entry.id) ?? [])
                      .some((event) => event.eventOrigin === "qa_simulation")
                      ? "qa_simulation"
                      : "organic_runtime"}
                    onAcceptTranscript={
                      speechReviewEnabled
                        ? () => handleAcceptTranscript(entry.id)
                        : undefined
                    }
                    onSaveTranscriptCorrection={speechReviewEnabled
                      ? (correctedTranscript) =>
                          handleTranscriptCorrection(entry, correctedTranscript)
                      : undefined}
                    benchmarkComparison={
                      INTERNAL_TRANSLATOR_QA_ENABLED && diagnosticsSettings.internalQaModeEnabled
                        ? sameAudioBenchmarksByTurnRef.current.get(entry.id) ?? null
                        : null
                    }
                    onBenchmarkReview={
                      INTERNAL_TRANSLATOR_QA_ENABLED && diagnosticsSettings.internalQaModeEnabled
                        ? (status, correctedTranscript) =>
                            handleBenchmarkReview(entry.id, status, correctedTranscript)
                        : undefined
                    }
                  />
                );
              })}
            </div>
            </>
          )}
          {INTERNAL_TRANSLATOR_QA_ENABLED &&
          diagnosticsSettings.internalQaModeEnabled &&
          postConversationReviewOpen &&
          failedSpeechReviewTurnIds.length > 0 ? (
            <div className="mt-4 space-y-2" aria-label="Sprachqualität fehlgeschlagener Turns">
              {failedPostConversationReviewCandidateIds.flatMap((turnId) => {
                const sample = qualityByTurnRef.current.get(turnId);
                return sample
                  ? [
                      <SpeechReviewPanel
                        key={turnId}
                        sample={sample}
                        reviewOrigin={(diagnosticEventsByTurnRef.current.get(turnId) ?? [])
                          .some((event) => event.eventOrigin === "qa_simulation")
                          ? "qa_simulation"
                          : "organic_runtime"}
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
              {state.entries.length === 0 && failedReportTurns.length === 0 && lastIncident ? (
                <button
                  type="button"
                  className="btn btn-secondary mt-2 min-h-12 w-full"
                  onClick={() => void handleExportLastIncident()}
                >
                  Letzte Diagnose exportieren
                </button>
              ) : null}
              {process.env.NODE_ENV === "development" ? (
                <p className="mt-2 text-center text-xs text-muted">
                  Enthält Gespräch, Performance und technische Diagnostik – kein Audio.
                </p>
              ) : null}
          </div>
        </section>
      </div>
      <TurnFeedbackSheet
        entry={feedbackEntry}
        open={Boolean(feedbackEntry)}
        speechSample={feedbackEntry
          ? qualityByTurnRef.current.get(feedbackEntry.id) ?? null
          : null}
        comparison={feedbackEntry
          ? sameAudioBenchmarksByTurnRef.current.get(feedbackEntry.id) ?? null
          : null}
        internalQaMode={INTERNAL_TRANSLATOR_QA_ENABLED && diagnosticsSettings.internalQaModeEnabled}
        onClose={() => setFeedbackEntryId(null)}
        onCaptured={handleFeedbackCaptured}
        onSaved={handleFeedbackSaved}
        onSyncFailed={handleFeedbackSyncFailed}
        onSyncOpportunity={flushPendingFeedback}
        getFeedbackOwnerId={() => feedbackOwnerIdRef.current}
      />
    </main>
  );
}
