import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClassicTranslatorReport,
  classicTranslatorReportFilename,
  downloadClassicTranslatorReport,
} from "@/lib/translator/classicReport";
import type { TranslationEntry } from "@/lib/translator/types";
import {
  acceptSpeechQualityRecord,
  createSpeechQualitySample,
  createUnreviewedSpeechQualityRecord,
  reviewSameAudioComparison,
  SAFE_STT_PARITY_VERSION,
  type SameAudioBenchmarkComparison,
} from "@/lib/translator/speechQuality";
import { createTranslatorDiagnosticEvent } from "@/lib/translator/diagnosticEvents";
import type { TranslatorDiagnosticEvent } from "@/lib/translator/diagnosticEvents";
import type { SafeSttModelBenchmark } from "@/lib/translator/safeSttModelBenchmark";

function diagnosticEvent(
  overrides: Partial<TranslatorDiagnosticEvent> = {},
): TranslatorDiagnosticEvent {
  return createTranslatorDiagnosticEvent({
    eventOrigin: "organic_runtime",
    eventKind: "failure",
    category: "TRANSLATION",
    stage: "translation",
    endpoint: "/api/translator/translate",
    httpStatus: 503,
    apiCode: "service_unavailable",
    retryable: true,
    recoveryAction: "reset_to_idle",
    recoverySucceeded: false,
    qaScenarioId: null,
    authFailureType: null,
    ...overrides,
  });
}

function entry(
  id: string,
  path: "realtime" | "audio_upload_fallback",
): TranslationEntry {
  const realtime = path === "realtime";
  return {
    id,
    timestamp: realtime ? 1_700_000_000_000 : 1_700_000_001_000,
    sourceLanguage: realtime ? "sw" : "de",
    targetLanguage: realtime ? "de" : "sw",
    originalText: realtime ? "Habari yako?" : "Guten Morgen.",
    translatedText: realtime ? "Wie geht es dir?" : "Habari za asubuhi.",
    sourceWasDetected: true,
    diagnostics: {
      transcriptionModel: realtime
        ? "gpt-live-transcribe"
        : "gpt-4o-mini-transcribe",
      translationModel: "gpt-5.6-terra",
      transcriptionMs: realtime ? 1_200 : 640,
      autoTranslateMs: 310,
      serverTranslationTotalMs: realtime ? 315 : 960,
      transcriptionFallbackUsed: !realtime,
      detectedLanguage: realtime ? "sw" : "de",
      recordButtonClickedAt: "2023-11-14T22:13:19.900Z",
      getUserMediaStartedAt: "2023-11-14T22:13:19.900Z",
      getUserMediaReadyAt: "2023-11-14T22:13:19.950Z",
      mediaRecorderPreparedAt: "2023-11-14T22:13:19.980Z",
      recordClickToGetUserMediaReadyMs: 50,
      recordClickToMicReadyMs: 50,
      recordClickToRecordingStartedMs: 100,
      getUserMediaToRecordingStartedMs: 100,
      realtimeSetupStartedAt: "2023-11-14T22:13:19.000Z",
      realtimeConnectionReadyAt: realtime
        ? "2023-11-14T22:13:19.200Z"
        : undefined,
      realtimeSetupMs: realtime ? undefined : 5_000,
      recordingStartedAt: "2023-11-14T22:13:20.000Z",
      recordingStoppedAt: "2023-11-14T22:13:21.000Z",
      recordingDurationMs: 1_000,
      microphoneAcquisitionAttemptId: `mic-${id}`,
      microphoneAcquisitionMs: 50,
      microphoneAcquisitionOutcome: "success",
      captureGeneration: realtime ? 2 : 1,
      freshStreamRequested: !realtime,
      streamReused: realtime,
      trackReadyStateAtAcquisition: "live",
      trackEnabledAtAcquisition: true,
      trackMutedAtAcquisition: false,
      mediaRecorderChunkCount: 2,
      mediaRecorderTotalChunkBytes: 2048,
      audioBlobSize: 2048,
      audioSignalObserved: true,
      realtimeTransportReady: realtime,
      realtimeInputTrackGeneration: realtime ? 2 : null,
      realtimeFirstDeltaObserved: realtime,
      realtimeFinalTranscriptReceived: realtime,
      capturePathOutcome: realtime
        ? "realtime_success"
        : "audio_fallback_success",
      firstTranscriptDeltaAt: realtime
        ? "2023-11-14T22:13:20.400Z"
        : undefined,
      transcriptFinalAt: "2023-11-14T22:13:21.100Z",
      stopToTranscriptFinalMs: realtime ? 100 : 640,
      translationStartedAt: "2023-11-14T22:13:21.100Z",
      translationReadyAt: "2023-11-14T22:13:21.410Z",
      translationClientRequestStartedAt: "2023-11-14T22:13:21.100Z",
      safeAudioBlobReadyAt: "2023-11-14T22:13:21.101Z",
      translationRequestPreparationStartedAt: "2023-11-14T22:13:21.102Z",
      translationFetchInvokedAt: "2023-11-14T22:13:21.103Z",
      translationFetchResolvedAt: "2023-11-14T22:13:21.400Z",
      safeAudioBlobReadyToFetchInvokedMs: 2,
      translationRequestPreparationMs: 1,
      translationFetchToResponseHeadersMs: 297,
      translationFetchTotalMs: 307,
      translationResourceStartTimeMs: 110,
      translationResourceRequestStartMs: 130,
      translationResourceResponseStartMs: 390,
      translationResourceResponseEndMs: 410,
      translationResourceTransferSizeBytes: 1024,
      translationResourceEncodedBodySizeBytes: 512,
      translationResourceDecodedBodySizeBytes: 512,
      translationResourceNextHopProtocol: "h2",
      translationRouteReceivedAt: "2023-11-14T22:13:21.110Z",
      translationAuthStartedAt: "2023-11-14T22:13:21.110Z",
      translationAuthCompletedAt: "2023-11-14T22:13:21.150Z",
      translationAuthClientPreparationStartedAt: "2023-11-14T22:13:21.110Z",
      translationAuthClientPreparationCompletedAt: "2023-11-14T22:13:21.115Z",
      translationAuthUserLookupStartedAt: "2023-11-14T22:13:21.115Z",
      translationAuthUserLookupCompletedAt: "2023-11-14T22:13:21.150Z",
      translationBodyReadStartedAt: "2023-11-14T22:13:21.150Z",
      translationBodyReadCompletedAt: "2023-11-14T22:13:21.160Z",
      translationJsonParseStartedAt: "2023-11-14T22:13:21.160Z",
      translationJsonParseCompletedAt: "2023-11-14T22:13:21.165Z",
      translationValidationStartedAt: "2023-11-14T22:13:21.170Z",
      translationValidationCompletedAt: "2023-11-14T22:13:21.180Z",
      translationInputNormalizationStartedAt: "2023-11-14T22:13:21.165Z",
      translationInputNormalizationCompletedAt: "2023-11-14T22:13:21.170Z",
      translationServiceEnteredAt: "2023-11-14T22:13:21.180Z",
      translationOpenAiClientReadyAt: "2023-11-14T22:13:21.185Z",
      translationOperationEnteredAt: "2023-11-14T22:13:21.186Z",
      translationOpenAiDispatchStartedAt: "2023-11-14T22:13:21.200Z",
      translationOpenAiDispatchedAt: "2023-11-14T22:13:21.201Z",
      translationBodyParsingCompletedAt: "2023-11-14T22:13:21.165Z",
      translationModeLanguageDecisionCompletedAt: "2023-11-14T22:13:21.175Z",
      translationGatewayReadyAt: "2023-11-14T22:13:21.185Z",
      translationAuthoritativeTextBranchEnteredAt: realtime
        ? "2023-11-14T22:13:21.187Z"
        : undefined,
      translationRecordedAudioBranchEnteredAt: realtime
        ? undefined
        : "2023-11-14T22:13:21.187Z",
      translationPreparationEnteredAt: "2023-11-14T22:13:21.188Z",
      translationSummaryEligibilityDecisionCompletedAt:
        "2023-11-14T22:13:21.189Z",
      translationSttStartedAt: realtime ? undefined : "2023-11-14T22:13:21.180Z",
      translationSttCompletedAt: realtime ? undefined : "2023-11-14T22:13:21.184Z",
      translationPromptPreparationStartedAt: "2023-11-14T22:13:21.185Z",
      translationPromptPreparationCompletedAt: "2023-11-14T22:13:21.190Z",
      translationSchemaPreparationStartedAt: "2023-11-14T22:13:21.190Z",
      translationSchemaPreparationCompletedAt: "2023-11-14T22:13:21.195Z",
      translationServerRequestReceivedAt: "2023-11-14T22:13:21.110Z",
      translationServerParsingDoneAt: "2023-11-14T22:13:21.112Z",
      translationOpenAiRequestStartedAt: "2023-11-14T22:13:21.115Z",
      translationOpenAiCompletedAt: "2023-11-14T22:13:21.400Z",
      translationServerSerializationDoneAt: "2023-11-14T22:13:21.405Z",
      translationServerResponseStartedAt: "2023-11-14T22:13:21.406Z",
      translationClientResponseFirstByteAt: "2023-11-14T22:13:21.407Z",
      translationClientResponseCompletedAt: "2023-11-14T22:13:21.410Z",
      translationStateCommittedAt: "2023-11-14T22:13:21.411Z",
      translationVisibleAt: "2023-11-14T22:13:21.420Z",
      translationRequestCorrelationId: `translation-${id}`,
      translationServerPreOpenAiMs: 100,
      translationAuthMs: 40,
      translationAuthClientPreparationMs: 5,
      translationAuthUserLookupMs: 35,
      translationBodyReadMs: 10,
      translationJsonParseMs: 5,
      translationValidationMs: 10,
      translationNormalizationMs: 5,
      translationPromptPreparationMs: 5,
      translationSchemaPreparationMs: 5,
      translationOpenAiClientPreparationMs: 5,
      translationOtherPreOpenAiMs: 15,
      translationRouteToServiceMs: 70,
      translationServiceToOperationMs: 6,
      translationOperationToOpenAiDispatchMs: 14,
      translationSttMs: realtime ? null : 4,
      translationSttToTranslationDispatchMs: realtime ? null : 16,
      translationUnattributedPreOpenAiMs: realtime ? 10 : 6,
      translationOpenAiTotalMs: 285,
      translationServerPostOpenAiMs: 5,
      translationClientPostResponseMs: 10,
      transcriptFinalToTranslationRequestStartMs: 0,
      translationRequestToVisibleMs: 320,
      transcriptFinalToTranslationVisibleMs: 320,
      transcriptFinalToTranslationReadyMs: 310,
      stopToTranslationVisibleMs: realtime ? 420 : 1_010,
      ttsDecisionAt: "2023-11-14T22:13:21.419Z",
      ttsRequested: true,
      ttsRequestReason: "autoplay",
      ttsRequestedAt: "2023-11-14T22:13:21.419Z",
      ttsGenerationOutcome: "success",
      ttsPlaybackOutcome: "completed",
      ttsOutcome: "success",
      ttsStartedAt: "2023-11-14T22:13:21.420Z",
      ttsReadyAt: "2023-11-14T22:13:21.720Z",
      ttsClientRequestStartedAt: "2023-11-14T22:13:21.420Z",
      ttsRouteReceivedAt: "2023-11-14T22:13:21.425Z",
      ttsAuthStartedAt: "2023-11-14T22:13:21.425Z",
      ttsAuthCompletedAt: "2023-11-14T22:13:21.455Z",
      ttsAuthClientPreparationStartedAt: "2023-11-14T22:13:21.425Z",
      ttsAuthClientPreparationCompletedAt: "2023-11-14T22:13:21.430Z",
      ttsAuthUserLookupStartedAt: "2023-11-14T22:13:21.430Z",
      ttsAuthUserLookupCompletedAt: "2023-11-14T22:13:21.455Z",
      ttsBodyReadStartedAt: "2023-11-14T22:13:21.455Z",
      ttsBodyReadCompletedAt: "2023-11-14T22:13:21.465Z",
      ttsJsonParseStartedAt: "2023-11-14T22:13:21.465Z",
      ttsJsonParseCompletedAt: "2023-11-14T22:13:21.470Z",
      ttsInputNormalizationStartedAt: "2023-11-14T22:13:21.470Z",
      ttsInputNormalizationCompletedAt: "2023-11-14T22:13:21.475Z",
      ttsValidationStartedAt: "2023-11-14T22:13:21.475Z",
      ttsValidationCompletedAt: "2023-11-14T22:13:21.480Z",
      ttsServiceEnteredAt: "2023-11-14T22:13:21.480Z",
      ttsOpenAiClientReadyAt: "2023-11-14T22:13:21.485Z",
      ttsInstructionPreparationStartedAt: "2023-11-14T22:13:21.485Z",
      ttsInstructionPreparationCompletedAt: "2023-11-14T22:13:21.490Z",
      ttsServerRequestReceivedAt: "2023-11-14T22:13:21.425Z",
      ttsServerParsingDoneAt: "2023-11-14T22:13:21.427Z",
      ttsOpenAiRequestStartedAt: "2023-11-14T22:13:21.430Z",
      ttsOpenAiFirstByteAt: "2023-11-14T22:13:21.550Z",
      ttsOpenAiCompletedAt: "2023-11-14T22:13:21.700Z",
      ttsServerFirstByteSentAt: "2023-11-14T22:13:21.551Z",
      ttsServerCompletedAt: "2023-11-14T22:13:21.702Z",
      ttsClientFirstByteAt: "2023-11-14T22:13:21.552Z",
      ttsClientResponseCompletedAt: "2023-11-14T22:13:21.720Z",
      ttsAudioPreparationStartedAt: "2023-11-14T22:13:21.720Z",
      ttsAudioPreparationCompletedAt: "2023-11-14T22:13:21.722Z",
      ttsGenerationCompletedAt: "2023-11-14T22:13:21.720Z",
      firstPlayableAudioAt: "2023-11-14T22:13:21.722Z",
      playRequestedAt: "2023-11-14T22:13:21.723Z",
      ttsRequestCorrelationId: `tts-${id}`,
      ttsServerPreOpenAiMs: 80,
      ttsAuthMs: 30,
      ttsAuthClientPreparationMs: 5,
      ttsAuthUserLookupMs: 25,
      ttsBodyReadMs: 10,
      ttsJsonParseMs: 5,
      ttsValidationMs: 5,
      ttsNormalizationMs: 5,
      ttsInstructionPreparationMs: 5,
      ttsOpenAiClientPreparationMs: 5,
      ttsOtherPreOpenAiMs: 15,
      ttsOpenAiTimeToFirstByteMs: 120,
      ttsOpenAiTotalMs: 270,
      ttsServerStreamingOverheadMs: 2,
      ttsClientDownloadTotalMs: 300,
      ttsAudioPreparationMs: 2,
      ttsPlayCallToStartedMs: 7,
      translationReadyToPlaybackStartedMs: 320,
      translationReadyToFirstPlayableAudioMs: 312,
      translationVisibleToFirstPlayableAudioMs: 302,
      stopToFirstPlayableAudioMs: realtime ? 722 : 1_312,
      ttsRequestToReadyMs: 300,
      translationReadyToTtsReadyMs: 310,
      stopToTtsReadyMs: realtime ? 720 : 1_310,
      playbackStartedAt: "2023-11-14T22:13:21.730Z",
      playbackCompletedAt: "2023-11-14T22:13:22.500Z",
      ttsPlaybackStartedAt: "2023-11-14T22:13:21.730Z",
      ttsPlaybackCompletedAt: "2023-11-14T22:13:22.500Z",
      ttsReadyToPlaybackStartedMs: 10,
      stopToPlaybackStartedMs: realtime ? 730 : 1_320,
      interactionOverheadMs: realtime ? 830 : 1_420,
      transcriptionPath: path,
      fallbackReason: realtime
        ? undefined
        : "realtime_not_ready_at_recording_start",
      transcriptionPathDecisionAt: "2023-11-14T22:13:19.990Z",
      transcriptionPathDecisionReason: realtime
        ? "warm_realtime_ready"
        : "realtime_not_ready_at_recording_start",
      connectionId: realtime ? "connection-1" : undefined,
      realtimeConnectionReadyAtRecordingStart: realtime
        ? "2023-11-14T22:13:10.000Z"
        : undefined,
      realtimeConnectionReused: realtime,
      realtimeConnectionAgeAtRecordingStartMs: realtime ? 9_990 : undefined,
      warmStart: realtime,
      ttsModel: "gpt-4o-mini-tts",
      ttsGenerationMs: 280,
      ttsSpeed: 1,
      autoplayEnabled: true,
      ttsStreamingUsed: true,
    },
  };
}

const safeSttModelBenchmark: SafeSttModelBenchmark = {
  benchmarkId: "model-benchmark-1",
  turnId: "fallback-turn",
  benchmarkVersion: "safe-stt-model-benchmark-v1",
  sameAudio: true,
  languageMode: "auto",
  resolvedSourceLanguage: "sw",
  recordingDurationMs: 1_000,
  audioMimeType: "audio/webm",
  groundTruthTranscript: "Habari yako leo?",
  reviewedAt: "2026-09-16T12:00:00.000Z",
  results: [
    {
      requestedModel: "gpt-4o-mini-transcribe",
      actualModel: "gpt-4o-mini-transcribe",
      transcript: "Habari yako leo?",
      transcriptionMs: 200,
      completedAt: "2026-09-16T12:00:01.000Z",
      outcome: "completed",
      failureCategory: null,
      failureReason: null,
      fallbackUsed: false,
      normalizedExactMatch: true,
      wer: 0,
    },
    {
      requestedModel: "gpt-transcribe",
      actualModel: null,
      transcript: null,
      transcriptionMs: null,
      completedAt: "2026-09-16T12:00:01.000Z",
      outcome: "unavailable",
      failureCategory: "model_unavailable",
      failureReason: "benchmark_model_unavailable",
      fallbackUsed: false,
      normalizedExactMatch: null,
      wer: null,
    },
    {
      requestedModel: "gpt-4o-transcribe",
      actualModel: null,
      transcript: null,
      transcriptionMs: null,
      completedAt: "2026-09-16T12:00:01.000Z",
      outcome: "runtime_failed",
      failureCategory: "transcription_failed",
      failureReason: "benchmark_model_transcription_failed",
      fallbackUsed: false,
      normalizedExactMatch: null,
      wer: null,
    },
  ],
};

describe("classic translator QA report", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serializes older turns without network-ingress fields as null", () => {
    const old = entry("old-turn", "audio_upload_fallback");
    if (!old.diagnostics) throw new Error("test entry missing diagnostics");
    delete old.diagnostics.safeAudioBlobReadyAt;
    delete old.diagnostics.translationFetchInvokedAt;
    delete old.diagnostics.translationFetchToResponseHeadersMs;
    delete old.diagnostics.translationResourceRequestStartMs;
    const report = buildClassicTranslatorReport({
      startedAt: "2023-11-14T22:13:00.000Z",
      userAgent: "QA", platform: "QA", currentMode: "auto", ttsSpeed: 1,
      entries: [old], failedTurns: [],
    });
    expect(report.turns[0]).toMatchObject({
      safeAudioBlobReadyAt: null,
      translationFetchInvokedAt: null,
      translationFetchToResponseHeadersMs: null,
      translationResourceRequestStartMs: null,
      translationClientToServerTimingClock: "cross_clock_diagnostic_only",
      progressiveTtsAttempted: false,
      progressiveTtsFallbackUsed: false,
      progressiveTtsPlaybackStartedBeforeStreamCompleted: null,
    });
  });

  it("serializes additive progressive playback proof without changing legacy report revision", () => {
    const turn = entry("progressive-turn", "audio_upload_fallback");
    Object.assign(turn.diagnostics!, {
      progressiveTtsAttempted: true,
      progressiveTtsPlaybackStartedAt: "2026-10-07T10:00:01.000Z",
      progressiveTtsStreamCompletedAt: "2026-10-07T10:00:03.000Z",
      progressiveTtsPlaybackStartedBeforeStreamCompleted: true,
      progressiveTtsFallbackUsed: false,
      progressiveTtsPlaybackStartMs: 350,
    });
    const report = buildClassicTranslatorReport({
      startedAt: "2026-10-07T10:00:00.000Z", userAgent: "QA", platform: "iPhone",
      currentMode: "auto", ttsSpeed: 1, entries: [turn], failedTurns: [],
    });
    expect(report.turns[0]).toMatchObject({
      progressiveTtsAttempted: true,
      progressiveTtsPlaybackStartedBeforeStreamCompleted: true,
      progressiveTtsPlaybackStartMs: 350,
      progressiveTtsFallbackUsed: false,
    });
    expect(JSON.stringify(report)).toContain('"progressiveTtsStreamCompletedAt":"2026-10-07T10:00:03.000Z"');
    expect(report.reportRevision).toBe("5.2.7");
  });

  it("exports mixed realtime, fallback and failed turns with correct timings", () => {
    const realtime = entry("realtime-turn", "realtime");
    const fallback = entry("fallback-turn", "audio_upload_fallback");
    const report = buildClassicTranslatorReport({
      reportId: "report-qa",
      startedAt: "2023-11-14T22:13:00.000Z",
      exportedAt: "2023-11-14T22:14:00.000Z",
      userAgent: "QA Browser",
      platform: "QA Platform",
      currentMode: "auto",
      ttsSpeed: 1,
      entries: [fallback, realtime],
      failedTurns: [
        {
          turnId: "failed-turn",
          createdAt: "2023-11-14T22:13:22.000Z",
          mode: "auto",
          diagnostics: { transcriptionPath: "audio_upload_fallback" },
          transcriptionModel: "gpt-4o-mini-transcribe",
          translationModel: "gpt-5.6-terra",
          ttsSpeed: 1,
          errorCode: "processing_failed",
          errorStage: "translation",
          sanitizedErrorMessage:
            "Authorization: Bearer secret-token und sk-exampleSecret123\nCookie: session=abc\nephemeral_secret=hidden OPENAI_API_KEY=plain-secret SUPABASE_SESSION_TOKEN=session-secret",
        },
      ],
      audioMetadataByTurn: new Map([
        [
          "realtime-turn",
          { audioMimeType: "audio/webm", audioSize: 12_345 },
        ],
        [
          "fallback-turn",
          { audioMimeType: "audio/webm", audioSize: 23_456 },
        ],
      ]),
      feedbackByTurn: new Map([
        [
          "realtime-turn",
          {
            feedbackRating: "good",
            feedbackCategories: [],
            feedbackComment: "Klingt natürlich.",
          },
        ],
      ]),
      connectionAttempts: [
        {
          connectionAttemptId: "attempt-1",
          connectionId: "connection-1",
          reason: "initial_background_warm",
          startedAt: "2023-11-14T22:13:05.000Z",
          endedAt: "2023-11-14T22:13:10.000Z",
          status: "success",
          sessionRequestStartedAt: "2023-11-14T22:13:05.000Z",
          sessionResponseAt: "2023-11-14T22:13:06.500Z",
          sessionRouteMs: 1_500,
          peerConnectionCreatedAt: "2023-11-14T22:13:06.510Z",
          offerCreatedAt: "2023-11-14T22:13:06.520Z",
          sdpRequestStartedAt: "2023-11-14T22:13:06.530Z",
          sdpResponseAt: "2023-11-14T22:13:09.900Z",
          sdpHttpStatus: 201,
          sdpRequestId: "req_qa",
          sdpMs: 3_370,
          remoteDescriptionSetAt: "2023-11-14T22:13:09.950Z",
          dataChannelOpenedAt: "2023-11-14T22:13:10.000Z",
          connectionReadyAt: "2023-11-14T22:13:10.000Z",
          totalSetupMs: 5_000,
          errorStage: null,
          errorType: null,
          errorCode: null,
          sanitizedErrorMessage: null,
        },
      ],
      connectionAttemptsTotal: 1,
      connectionSuccesses: 1,
      connectionFailures: 0,
      reconnectCount: 0,
    });

    expect(report).toMatchObject({
      reportVersion: 5,
      reportRevision: "5.2.7",
      performanceOptimizationVersion: "classic-quality-hardening-v5.2.7",
      preOpenAiOptimizationEnabled: true,
      translationPreOpenAiOptimized: true,
      ttsPreOpenAiOptimized: true,
      translationStreamingEnabled: false,
      ttsStreamingEnabled: true,
      earlyTtsEnabled: false,
      initialRealtimeSetupMs: 5_000,
      reportId: "report-qa",
      totalTurns: 3,
      successfulTurns: 2,
      failedTurns: 1,
      realtimeTurns: 1,
      fallbackTurns: 2,
      realtimeRate: 0.3333,
      fallbackRate: 0.6667,
      warmRealtimeTurns: 1,
      coldRealtimeTurns: 0,
      warmReuseRate: 1,
      fallbackReasons: {
        realtime_not_ready_at_recording_start: 1,
      },
      transcriptionModels: [
        "gpt-live-transcribe",
        "gpt-4o-mini-transcribe",
      ],
      translationModel: "gpt-5.6-terra",
      ttsModel: "gpt-4o-mini-tts",
      connectionAttemptsTotal: 1,
      connectionSuccesses: 1,
      microphoneAcquisitionAttempts: 2,
      freshStreamCount: 1,
      reusedStreamCount: 1,
      audioFallbackSuccessCount: 1,
      ttsStreamingTurns: 2,
      streamingFallbackTurns: 0,
    });
    expect(report.turns.find((turn) => turn.turnId === "fallback-turn")).toMatchObject({
      translationClientTimingClock: "browser_performance",
      translationServerTimingClock: "server_performance",
      translationClientToServerTimingClock: "cross_clock_diagnostic_only",
      safeAudioBlobReadyToFetchInvokedMs: 2,
      translationRequestPreparationMs: 1,
      translationFetchToResponseHeadersMs: 297,
      translationFetchTotalMs: 307,
      translationResourceNextHopProtocol: "h2",
      translationResourceTransferSizeBytes: 1024,
    });
    const realtimeReportTurn = report.turns.find(
      (turn) => turn.turnId === "realtime-turn",
    );
    expect(realtimeReportTurn).toMatchObject({
        status: "success",
        originalText: "Habari yako?",
        translatedText: "Wie geht es dir?",
        transcriptionPath: "realtime",
        transcriptionModel: "gpt-live-transcribe",
        transcriptionFallbackUsed: false,
        fallbackReason: null,
        audioMimeType: "audio/webm",
        audioSize: 12_345,
        serverTranscriptionMs: null,
        feedbackRating: "good",
        feedbackComment: "Klingt natürlich.",
        realtimeSetupMs: null,
        translationRequestCorrelationId: "translation-realtime-turn",
        ttsRequestCorrelationId: "tts-realtime-turn",
        translationRouteToServiceMs: 70,
        translationServiceToOperationMs: 6,
        translationOperationToOpenAiDispatchMs: 14,
        translationBodyParsingCompletedAt: "2023-11-14T22:13:21.165Z",
        translationModeLanguageDecisionCompletedAt: "2023-11-14T22:13:21.175Z",
        translationGatewayReadyAt: "2023-11-14T22:13:21.185Z",
        translationAuthoritativeTextBranchEnteredAt:
          "2023-11-14T22:13:21.187Z",
        translationPreparationEnteredAt: "2023-11-14T22:13:21.188Z",
        translationSummaryEligibilityDecisionCompletedAt:
          "2023-11-14T22:13:21.189Z",
        translationOpenAiDispatchStartedAt: "2023-11-14T22:13:21.200Z",
        translationOpenAiDispatchedAt: "2023-11-14T22:13:21.201Z",
        translationSttMs: null,
        translationSttToTranslationDispatchMs: null,
        translationUnattributedPreOpenAiMs: 10,
        ttsStreamingUsed: true,
        ttsOpenAiTimeToFirstByteMs: 120,
        translationAuthMs: 40,
        translationAuthUserLookupMs: 35,
        ttsAuthMs: 30,
        ttsAuthUserLookupMs: 25,
        combinedPreOpenAiMs: 180,
        translationAuthDiagnostic: {
          attempted: true, succeeded: true, failureType: null, durationMs: 40,
        },
        ttsAuthDiagnostic: {
          attempted: true, succeeded: true, failureType: null, durationMs: 30,
        },
        firstPlayableAudioAt: "2023-11-14T22:13:21.722Z",
      });
    expect(realtimeReportTurn?.ttsClientFirstByteAt).not.toBe(
      realtimeReportTurn?.firstPlayableAudioAt,
    );
    expect(realtimeReportTurn?.criticalPath).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "translation_openai", durationMs: 285 }),
        expect.objectContaining({ stage: "translation_auth", durationMs: 40 }),
        expect.objectContaining({ stage: "translation_auth_user_lookup", durationMs: 35 }),
        expect.objectContaining({ stage: "tts_auth", durationMs: 30 }),
        expect.objectContaining({ stage: "tts_auth_user_lookup", durationMs: 25 }),
        expect.objectContaining({ stage: "tts_openai_to_first_byte", durationMs: 120 }),
      ]),
    );
    expect(report.bottleneckSummary.largestMedianStage).toBeTruthy();
    expect(report.preOpenAiBottleneckSummary).toEqual({
      largestTranslationPreOpenAiStage: "auth",
      largestTranslationPreOpenAiStageMedianMs: 40,
      largestTtsPreOpenAiStage: "auth",
      largestTtsPreOpenAiStageMedianMs: 30,
    });
    expect(
      report.preOpenAiBottleneckSummaryByGroup.warmReusedRealtimeTurns,
    ).toEqual(report.preOpenAiBottleneckSummary);
    expect(report.turns.find((turn) => turn.turnId === "fallback-turn"))
      .toMatchObject({
        transcriptionPath: "audio_upload_fallback",
        transcriptionModel: "gpt-4o-mini-transcribe",
        transcriptionFallbackUsed: true,
        fallbackReason: "realtime_not_ready_at_recording_start",
        serverTranscriptionMs: 640,
      });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-exampleSecret123");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("session=abc");
    expect(serialized).not.toContain("ephemeral_secret");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("plain-secret");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("rawAudio");
    expect(serialized).not.toContain("offer-sdp");
    expect(serialized).not.toContain("answer-sdp");
  });

  it("exports benchmark failure classification without provider error content", () => {
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-16T12:00:00.000Z",
      userAgent: "QA Browser",
      platform: "QA Platform",
      currentMode: "auto",
      ttsSpeed: 1,
      entries: [entry("fallback-turn", "audio_upload_fallback")],
      failedTurns: [],
      safeSttModelBenchmarksByTurn: new Map([[safeSttModelBenchmark.turnId, safeSttModelBenchmark]]),
    });

    expect(report.safeSttModelBenchmarkSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "gpt-4o-mini-transcribe", completedSamples: 1, reviewedSamples: 1, accessOrRuntimeFailures: 0 }),
      expect.objectContaining({ model: "gpt-transcribe", completedSamples: 0, unavailableFailures: 1, runtimeFailures: 0, reviewedSamples: 0, accessOrRuntimeFailures: 1 }),
      expect.objectContaining({ model: "gpt-4o-transcribe", completedSamples: 0, unavailableFailures: 0, runtimeFailures: 1, reviewedSamples: 0, accessOrRuntimeFailures: 1 }),
    ]));
    expect(report.safeSttModelBenchmarkResults).toEqual([
      expect.objectContaining({ turnId: "fallback-turn", requestedModel: "gpt-4o-mini-transcribe", actualModel: "gpt-4o-mini-transcribe", outcome: "completed", fallbackUsed: false, transcriptionMs: 200 }),
      expect.objectContaining({ turnId: "fallback-turn", requestedModel: "gpt-transcribe", actualModel: null, outcome: "unavailable", failureCategory: "model_unavailable", failureReason: "benchmark_model_unavailable", fallbackUsed: false, transcriptionMs: null }),
      expect.objectContaining({ turnId: "fallback-turn", requestedModel: "gpt-4o-transcribe", actualModel: null, outcome: "runtime_failed", failureCategory: "transcription_failed", failureReason: "benchmark_model_transcription_failed", fallbackUsed: false, transcriptionMs: null }),
    ]);
    expect(report.safeSttModelBenchmarkGroundTruthCoverage).toEqual({
      completedEligibleTurns: 1,
      reviewedTurns: 1,
      unreviewedCompletedTurns: 0,
      coverageRate: 1,
    });
    expect(JSON.stringify(report.safeSttModelBenchmarkResults)).not.toContain("provider");
    expect(JSON.stringify(report.safeSttModelBenchmarkResults)).not.toContain("secret");
  });

  it("uses the requested local filename format", () => {
    expect(
      classicTranslatorReportFilename(new Date("2026-08-30T09:45:00.000Z")),
    ).toBe("translator-report-202608300945.json");
  });

  it("aggregates three warm realtime turns with median, p90 and null-safe empty groups", () => {
    const values = [100, 200, 900];
    const entries = values.map((value, index) => {
      const turn = entry(`warm-${index + 1}`, "realtime");
      turn.timestamp += index * 1_000;
      if (turn.diagnostics) {
        turn.diagnostics.stopToPlaybackStartedMs = value;
        turn.diagnostics.interactionOverheadMs = value + 10;
        turn.diagnostics.translationServerPreOpenAiMs = value;
        turn.diagnostics.ttsServerPreOpenAiMs = [50, 100, 300][index];
      }
      return turn;
    });
    const report = buildClassicTranslatorReport({
      reportId: "three-warm",
      startedAt: "2026-08-30T09:00:00.000Z",
      userAgent: "QA",
      platform: "QA",
      currentMode: "auto",
      ttsSpeed: 1,
      entries,
      failedTurns: [],
    });

    expect(report).toMatchObject({
      reportVersion: 5,
      realtimeTurns: 3,
      fallbackTurns: 0,
      realtimeRate: 1,
      fallbackRate: 0,
      warmRealtimeTurns: 3,
      warmReuseRate: 1,
    });
    expect(
      report.performanceSummary.warmReusedRealtimeTurns
        .stopToPlaybackStartedMs,
    ).toEqual({
      count: 3,
      average: 400,
      median: 200,
      p90: 900,
      min: 100,
      max: 900,
    });
    expect(report).toMatchObject({
      medianTranslationServerPreOpenAiMs: 200,
      p90TranslationServerPreOpenAiMs: 900,
      medianTtsServerPreOpenAiMs: 100,
      p90TtsServerPreOpenAiMs: 300,
      medianCombinedPreOpenAiMs: 300,
      p90CombinedPreOpenAiMs: 1_200,
    });
    expect(
      report.performanceSummary.warmReusedRealtimeTurns.combinedPreOpenAiMs,
    ).toMatchObject({ median: 300, p90: 1_200 });
    expect(report.turns.find((turn) => turn.turnId === "warm-3")
      ?.performanceBudgetViolations).toEqual(
        expect.arrayContaining([
          { metric: "translationServerPreOpenAiMs", budgetMs: 300, actualMs: 900 },
          { metric: "ttsServerPreOpenAiMs", budgetMs: 300, actualMs: 300 },
          { metric: "combinedPreOpenAiMs", budgetMs: 600, actualMs: 1_200 },
        ]),
      );
    expect(
      report.performanceSummary.warmReusedRealtimeTurns.realtimeSetupMs,
    ).toEqual({
      count: 0,
      average: null,
      median: null,
      min: null,
      max: null,
    });
    expect(
      report.performanceSummary.audioUploadFallbackTurns
        .stopToPlaybackStartedMs,
    ).toEqual({
      count: 0,
      average: null,
      median: null,
      min: null,
      max: null,
    });
  });

  it("downloads the report locally without persistence", () => {
    vi.useFakeTimers();
    const anchor = {
      href: "",
      download: "",
      hidden: false,
      click: vi.fn(),
      remove: vi.fn(),
    };
    const append = vi.fn();
    const createObjectURL = vi.fn(() => "blob:classic-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { append },
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const report = buildClassicTranslatorReport({
      reportId: "empty-report",
      startedAt: "2026-08-30T09:00:00.000Z",
      exportedAt: "2026-08-30T09:01:00.000Z",
      userAgent: "QA",
      platform: "QA",
      currentMode: "auto",
      ttsSpeed: 1,
      entries: [],
      failedTurns: [],
    });

    expect(report).toMatchObject({
      reportVersion: 5,
      totalTurns: 0,
      realtimeRate: null,
      fallbackRate: null,
      warmReuseRate: null,
      connectionAttempts: [],
      medianTranslationServerPreOpenAiMs: null,
      p90TranslationServerPreOpenAiMs: null,
      medianTtsServerPreOpenAiMs: null,
      p90TtsServerPreOpenAiMs: null,
      medianCombinedPreOpenAiMs: null,
      p90CombinedPreOpenAiMs: null,
      preOpenAiBottleneckSummary: {
        largestTranslationPreOpenAiStage: null,
        largestTranslationPreOpenAiStageMedianMs: null,
        largestTtsPreOpenAiStage: null,
        largestTtsPreOpenAiStageMedianMs: null,
      },
      preOpenAiBottleneckSummaryByGroup: {
        allSuccessfulTurns: {
          largestTranslationPreOpenAiStage: null,
          largestTranslationPreOpenAiStageMedianMs: null,
          largestTtsPreOpenAiStage: null,
          largestTtsPreOpenAiStageMedianMs: null,
        },
      },
    });
    expect(report.turns).toEqual([]);

    expect(downloadClassicTranslatorReport(report)).toBe(true);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toMatch(/^translator-report-\d{12}\.json$/);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:classic-report");
  });

  it("reports V5 consent, recovery, failures and STT corrections", () => {
    const corrected = createSpeechQualitySample({
      turnId: "warm", recognizedTranscript: "kupwa", correctedTranscript: "kubwa",
      sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
      transcriptionPath: "realtime", appVersion: "1.2.3",
    });
    const report = buildClassicTranslatorReport({
      reportId: "v5", startedAt: "2026-09-02T00:00:00.000Z", userAgent: "QA",
      platform: "QA", currentMode: "auto", ttsSpeed: 1, entries: [entry("warm", "realtime")],
      failedTurns: [], qualityByTurn: new Map([["warm", corrected]]),
      recoveryByTurn: new Map([["warm", {
        failureCategory: "REALTIME", errorStage: "transcription", endpoint: null,
        httpStatus: null, apiErrorCode: "connection_failure", retryable: true,
        recoveryAction: "audio_upload_fallback", recoverySucceeded: true,
        healthStatus: "degraded", authCheckAttempted: false,
        authCheckSucceeded: null, authFailureType: null,
      }]]),
      buildMetadata: {
        appVersion: "1.2.3", buildVersion: "99", gitCommitSha: "abc",
        environment: "preview", deploymentId: "dpl_99", vercelEnvironment: "preview",
        frontendRuntimeEnvironment: "preview", frontendOriginKind: "vercel_preview",
        backendEnvironmentLabel: "staging",
      },
      diagnosticsSettings: {
        diagnosticsSharingEnabled: true, qualityContentSharingEnabled: true,
        speechSampleSharingEnabled: false, internalQaModeEnabled: false,
      },
    });
    expect(report).toMatchObject({
      reportVersion: 5, appVersion: "1.2.3", buildVersion: "99",
      diagnosticsSharingEnabled: true, speechSampleSharingEnabled: false,
      reportRevision: "5.2.7", failureCount: 0, failuresByCategory: {},
      degradationCount: 1, expectedFallbackCount: 0,
      recoveryAttempts: 1, successfulRecoveries: 1,
      sttCorrectionCount: 1, speechQualitySampleCount: 1,
    });
    expect(report.turns[0]).toMatchObject({
      recognizedTranscript: "kupwa", correctedTranscript: "kubwa",
      transcriptCorrected: true, recoveryAction: "audio_upload_fallback",
      recoverySucceeded: true, audioSharedRemotely: false,
    });
  });

  it("separates turn failures, expected fallbacks, degradations and QA events exactly", () => {
    const normal = entry("normal", "realtime");
    const expected = entry("expected", "audio_upload_fallback");
    const degraded = entry("degraded", "audio_upload_fallback");
    const failedBase = {
      createdAt: "2026-09-02T00:00:10.000Z",
      mode: "auto" as const,
      diagnostics: {},
      transcriptionModel: "gpt-live-transcribe",
      translationModel: "gpt-5.6-terra",
      ttsSpeed: 1,
      errorCode: "processing_failed",
      errorStage: "translation",
      sanitizedErrorMessage: "Temporärer Fehler",
    };
    const report = buildClassicTranslatorReport({
      reportId: "event-semantics",
      startedAt: "2026-09-02T00:00:00.000Z",
      userAgent: "QA", platform: "QA", currentMode: "auto", ttsSpeed: 1,
      entries: [normal, expected, degraded],
      failedTurns: [
        { ...failedBase, turnId: "qa-failed" },
        { ...failedBase, turnId: "organic-failed" },
      ],
      diagnosticEventsByTurn: new Map([
        ["expected", [diagnosticEvent({
          eventKind: "expected_fallback", category: "REALTIME",
          stage: "transcription_path_decision", endpoint: null, httpStatus: null,
          apiCode: "realtime_not_ready_at_recording_start",
          recoveryAction: "audio_upload_fallback", recoverySucceeded: true,
        })]],
        ["degraded", [diagnosticEvent({
          eventKind: "degradation", category: "REALTIME", stage: "transcription",
          endpoint: null, httpStatus: null, apiCode: "connection_failure",
          recoveryAction: "audio_upload_fallback", recoverySucceeded: true,
        })]],
        ["qa-failed", [diagnosticEvent({
          eventOrigin: "qa_simulation", qaScenarioId: "qa_translation_503",
          apiCode: "qa_translation_failure",
        })]],
        ["organic-failed", [diagnosticEvent()]],
      ]),
    });

    expect(report).toMatchObject({
      totalTurns: 5, successfulTurns: 3, failedTurns: 2, failureCount: 2,
      diagnosticEventCount: 4, organicRuntimeFailureCount: 1,
      qaSimulationEventCount: 1, degradationCount: 1, expectedFallbackCount: 1,
      eventsByOrigin: { organic_runtime: 3, qa_simulation: 1 },
      eventsByKind: { expected_fallback: 1, degradation: 1, failure: 2 },
      failuresByCategory: { TRANSLATION: 2 },
      failuresByStage: { translation: 2 },
      organicFailureRate: 0.25,
      qaScenariosTriggered: ["qa_translation_503"],
    });
  });

  it("reports route auth only when the real route ran", () => {
    const success = entry("auth-success", "realtime");
    const failedBase = {
      createdAt: "2026-09-02T00:00:10.000Z", mode: "auto" as const,
      diagnostics: {}, transcriptionModel: "gpt-live-transcribe",
      translationModel: "gpt-5.6-terra", ttsSpeed: 1,
      errorCode: "processing_failed", errorStage: "translation",
      sanitizedErrorMessage: "Fehler",
    };
    const report = buildClassicTranslatorReport({
      reportId: "auth-semantics", startedAt: "2026-09-02T00:00:00.000Z",
      userAgent: "QA", platform: "QA", currentMode: "auto", ttsSpeed: 1,
      entries: [success],
      failedTurns: [
        { ...failedBase, turnId: "qa-before-route" },
        { ...failedBase, turnId: "auth-401" },
      ],
      diagnosticEventsByTurn: new Map([
        ["qa-before-route", [diagnosticEvent({
          eventOrigin: "qa_simulation", qaScenarioId: "qa_translation_503",
          endpoint: null, apiCode: "qa_translation_failure",
        })]],
        ["auth-401", [diagnosticEvent({
          category: "AUTH", httpStatus: 401, apiCode: "auth_required",
          retryable: false, recoveryAction: "reauthenticate",
          authFailureType: "invalid_session",
        })]],
      ]),
    });
    const qa = report.turns.find((turn) => turn.turnId === "qa-before-route");
    const auth401 = report.turns.find((turn) => turn.turnId === "auth-401");
    expect(qa).toMatchObject({
      translationAuthDiagnostic: { attempted: false, succeeded: null },
      ttsAuthDiagnostic: { attempted: false, succeeded: null },
      authCheckAttempted: false, authCheckSucceeded: null,
    });
    expect(auth401).toMatchObject({
      translationAuthDiagnostic: {
        attempted: true, succeeded: false, failureType: "invalid_session",
        durationMs: null,
      },
      authCheckAttempted: true, authCheckSucceeded: false,
      authFailureType: "invalid_session",
    });
  });

  it("keeps per-turn consent and a reviewed STT sample after translation failure", () => {
    const startConsent = {
      diagnosticsSharingEnabled: true, qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: true, internalSpeechDiagnosticsEnabled: true,
    };
    const failedSample = acceptSpeechQualityRecord(createUnreviewedSpeechQualityRecord({
      turnId: "failed-after-stt", recognizedTranscript: "Nyumba hii ni kubwa.",
      sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
      transcriptionPath: "realtime", appVersion: "1.0", audioEligible: true,
      consentAtRecordingStart: startConsent,
      audioMetadata: {
        mimeType: "audio/webm", sizeBytes: 5_000, durationMs: 1_500,
        sampleRate: 48_000, channelCount: 1,
      },
      audioQualityMetrics: {
        source: "realtime_analyser", rmsDbfs: -18, peakDbfs: -2,
        clippingRatio: 0.001, silenceRatio: 0.2, speechActivityRatio: 0.7,
      },
    }));
    const report = buildClassicTranslatorReport({
      reportId: "speech-after-failure", startedAt: "2026-09-02T00:00:00.000Z",
      userAgent: "QA", platform: "QA", currentMode: "auto", ttsSpeed: 1,
      entries: [],
      failedTurns: [{
        turnId: "failed-after-stt", createdAt: "2026-09-02T00:00:10.000Z",
        mode: "auto", diagnostics: { transcriptionPath: "realtime" },
        transcriptionModel: "gpt-live-transcribe", translationModel: "gpt-5.6-terra",
        ttsSpeed: 1, errorCode: "processing_failed", errorStage: "translation",
        sanitizedErrorMessage: "Übersetzung nicht verfügbar",
      }],
      qualityByTurn: new Map([["failed-after-stt", failedSample]]),
      consentByTurn: new Map([["failed-after-stt", {
        consentAtRecordingStart: startConsent,
        consentAtTurnFinalization: startConsent,
      }]]),
      consentEvents: [{
        at: "2026-09-02T00:00:01.000Z", setting: "speechSampleSharingEnabled",
        previousValue: false, newValue: true,
      }],
      audioBlobAvailableByTurn: new Set(["failed-after-stt"]),
      audioIncludedInDiagnosticBundleByTurn: new Set(["failed-after-stt"]),
    });
    expect(report).toMatchObject({
      speechQualitySampleCount: 1, sttAcceptedCount: 1, sttCorrectionCount: 0,
      audioEligibleTurnCount: 1, audioIncludedTurnCount: 1,
      consentEvents: [{ setting: "speechSampleSharingEnabled", previousValue: false, newValue: true }],
    });
    expect(report.turns[0]).toMatchObject({
      status: "failed", recognizedTranscript: "Nyumba hii ni kubwa.",
      recognitionReviewStatus: "accepted", correctedTranscript: null,
      speechAudioEligibleForTurn: true, audioBlobAvailable: true,
      audioIncludedInDiagnosticBundle: true, audioSharedRemotely: false,
      consentAtRecordingStart: startConsent, consentAtTurnFinalization: startConsent,
      audioMetadata: {
        mimeType: "audio/webm", sizeBytes: 5_000, durationMs: 1_500,
        sampleRate: 48_000, channelCount: 1,
      },
      audioQualityMetrics: { source: "realtime_analyser", rmsDbfs: -18 },
    });
  });

  it("derives rescue, routing, learning, timeline, and integrity summaries without double-counting", () => {
    const rescued = entry("rescued", "audio_upload_fallback");
    rescued.diagnostics = {
      ...rescued.diagnostics!,
      sttRoutingDecision: "audio_rescue_semantic_failure",
      primaryTranscriptionPath: "realtime",
      primaryTranscriptionModel: "gpt-live-transcribe",
      rescueTranscriptionPath: "audio_upload_fallback",
      rescueTranscriptionModel: "gpt-4o-mini-transcribe",
      finalTranscriptionPath: "audio_upload_fallback",
      finalTranscriptionModel: "gpt-4o-mini-transcribe",
      primaryFailureToRescueStartMs: 12,
      rescueTranscriptionMs: 600,
      semanticRescueTotalMs: 950,
    };
    const event = diagnosticEvent({
      eventKind: "degradation",
      category: "TRANSCRIPTION",
      httpStatus: 422,
      apiCode: "unsupported_language",
      recoveryAction: "audio_transcription_rescue",
      recoverySucceeded: true,
    });
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-04T00:00:00.000Z", userAgent: "QA", platform: "QA",
      currentMode: "auto", ttsSpeed: 1, entries: [rescued], failedTurns: [],
      diagnosticEventsByTurn: new Map([[rescued.id, [event]]]),
      sttRoutingByTurn: new Map([[rescued.id, "audio_rescue_semantic_failure"]]),
      sttComparisonsByTurn: new Map([[rescued.id, {
        turnId: rescued.id, createdAt: "2026-09-04T00:00:01.000Z",
        audioFingerprintSessionLocal: "audio-rescued",
        primary: { model: "gpt-live-transcribe", path: "realtime", transcript: "Nie Bgani", transcriptLength: 9 },
        rescue: { model: "gpt-4o-mini-transcribe", path: "audio_upload_fallback", transcript: "Ni bei gani?", transcriptLength: 12 },
        didTranscriptChange: true, finalPath: "audio_rescue_semantic_failure",
        rescueReason: "unsupported_language", translationOutcomeBeforeRescue: "unsupported_language",
        translationOutcomeAfterRescue: "success", primaryFailureToRescueStartMs: 12,
        semanticRescueTotalMs: 950,
      }]]),
      realtimeSemanticCircuitBreakerTrips: 1,
    });
    expect(report.executiveSummary).toMatchObject({
      successful: 1, terminalFailures: 0, recoveredTurns: 1,
      sttRescueAttempts: 1, sttRescueSuccessRate: 1,
    });
    expect(report.learningSummary).toMatchObject({
      sameAudioComparisonCount: 1, realtimeToRescueTranscriptDisagreementCount: 1,
      semanticRescueAttempts: 1, semanticRescueSuccesses: 1,
      semanticCircuitBreakerTrips: 1,
    });
    expect(report.sttRoutingSummary.semanticRescueSuccesses).toBe(1);
    expect(report.failureCount).toBe(0);
    expect(report.degradationCount).toBe(1);
    expect(report.incidentTimeline.map((item) => item.stage)).toEqual(
      expect.arrayContaining(["translation", "fallback_started", "fallback_success"]),
    );
    expect(report.turns[0].sttCandidateComparison).toMatchObject({
      primary: { transcript: null }, rescue: { transcript: null },
    });
    expect(report.reportIntegrity).toMatchObject({
      schemaVersion: "translator-report-v5.2.7", reportRevision: "5.2.7",
    });
  });

  it("separates cold fallback from connection-loss recovery and exposes product success", () => {
    const entries = Array.from({ length: 9 }, (_, index) => {
      const value = entry(`field-${index + 1}`, "audio_upload_fallback");
      value.timestamp += index;
      value.diagnostics = {
        ...value.diagnostics!,
        fallbackReason: index < 3
          ? "realtime_not_ready_at_recording_start"
          : "connection_lost_during_recording",
        sttRoutingDecision: index < 3
          ? "audio_fallback_cold"
          : "audio_fallback_connection_loss",
      };
      return value;
    });
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-07T00:00:00.000Z",
      userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1",
      platform: "iPhone",
      currentMode: "auto",
      ttsSpeed: 1,
      entries,
      failedTurns: [],
      sttRoutingByTurn: new Map(entries.map((value, index) => [
        value.id,
        index < 3 ? "audio_fallback_cold" : "audio_fallback_connection_loss",
      ] as const)),
    });

    expect(report).toMatchObject({
      productTurnSuccessRate: 1,
      primaryPathSuccessRate: 0,
      audioFallbackSuccessCount: 9,
      executiveSummary: {
        productTurnSuccessRate: 1,
        realtimeAttemptedTurns: 6,
        realtimeSuccessfulTurns: 0,
        realtimeAttemptSuccessRate: 0,
        coldFallbackTurns: 3,
        connectionLossFallbackTurns: 6,
        recoveredDegradationTurns: 6,
        primaryFinding: "realtime_unstable_fallback_healthy",
      },
      sttRoutingSummary: {
        coldFallbackTurns: 3,
        connectionLossFallbackTurns: 6,
        realtimePrimarySuccesses: 0,
      },
    });
    expect(report.keyFindings).toEqual(expect.arrayContaining([
      "all_organic_turns_successful",
      "realtime_unstable",
      "fallback_healthy",
    ]));
  });

  it("reports an overlong active recording start even with zero turns", () => {
    const attempt = {
      attemptId: "start-stuck",
      startedAt: "2026-09-08T04:53:25.782Z",
      completedAt: null,
      durationMs: null,
      currentPhase: "microphone_acquisition_requested" as const,
      outcome: null,
      recorderStatus: "starting",
      microphoneAcquisitionState: "requesting_permission_or_device",
      hasPendingAcquisition: true,
      recordingStartInFlight: true,
      captureGeneration: null,
      timeline: [{
        phase: "microphone_acquisition_requested" as const,
        at: "2026-09-08T04:53:25.782Z",
        recorderStatus: "starting",
        microphoneAcquisitionState: "requesting_permission_or_device",
        hasPendingAcquisition: true,
        recordingStartInFlight: true,
        captureGeneration: null,
      }],
    };
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-08T04:53:25.000Z",
      userAgent: "Chrome", platform: "Mac", currentMode: "auto", ttsSpeed: 1,
      entries: [], failedTurns: [], recordingStartAttempts: [attempt],
      activeRecordingStartAttempt: { ...attempt, ageMs: 29_000 },
    });
    expect(report).toMatchObject({
      totalTurns: 0,
      recordingStartAttempts: 1,
      recordingStartTimeouts: 0,
      preTurnIncidentCount: 1,
      activeRecordingStartAttempt: {
        attemptId: "start-stuck",
        currentPhase: "microphone_acquisition_requested",
      },
      executiveSummary: { overallHealth: "degraded" },
    });
    expect(report.keyFindings).toContain("recording_start_stuck");
    expect(report.incidentTimeline[0].stage).toBe("microphone_acquisition_requested");
  });

  it("does not call one expected cold start followed by seven warm successes unstable", () => {
    const entries = Array.from({ length: 8 }, (_, index) => {
      const value = entry(`desktop-${index}`, index === 0
        ? "audio_upload_fallback" : "realtime");
      value.timestamp += index;
      value.diagnostics = {
        ...value.diagnostics,
        fallbackReason: index === 0
          ? "realtime_not_ready_at_recording_start" : undefined,
        sttRoutingDecision: index === 0 ? "audio_fallback_cold" : "realtime_primary",
        realtimeConnectionReused: index > 0,
        warmStart: index > 0,
      } as NonNullable<TranslationEntry["diagnostics"]>;
      return value;
    });
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-08T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries, failedTurns: [], reconnectCount: 0,
      sttRoutingByTurn: new Map(entries.map((value, index) => [
        value.id, index === 0 ? "audio_fallback_cold" : "realtime_primary",
      ] as const)),
    });
    expect(report.executiveSummary).toMatchObject({
      realtimeAttemptedTurns: 7,
      realtimeSuccessfulTurns: 7,
      realtimeAttemptSuccessRate: 1,
    });
    expect(report.keyFindings).not.toContain("realtime_unstable");
    expect(report.keyFindings).toContain("realtime_warm_path_healthy");
  });

  it("reports a completed whole-start timeout as a pre-turn degradation", () => {
    const snapshot = {
      recorderStatus: "idle",
      microphoneAcquisitionState: "timed_out",
      hasPendingAcquisition: false,
      recordingStartInFlight: false,
      captureGeneration: null,
    };
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-08T04:53:25.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries: [], failedTurns: [],
      recordingStartAttempts: [{
        attemptId: "timeout", startedAt: "2026-09-08T04:53:25.000Z",
        completedAt: "2026-09-08T04:53:39.000Z", durationMs: 14_000,
        currentPhase: "cleanup_completed", outcome: "timeout", ...snapshot,
        timeline: [
          { phase: "timeout", at: "2026-09-08T04:53:39.000Z", ...snapshot },
          { phase: "cleanup_completed", at: "2026-09-08T04:53:39.010Z", ...snapshot },
        ],
      }],
    });
    expect(report).toMatchObject({
      totalTurns: 0, recordingStartAttempts: 1, recordingStartTimeouts: 1,
      recordingStartFailures: 1, preTurnIncidentCount: 1,
      executiveSummary: { overallHealth: "degraded" },
    });
    expect(report.keyFindings).toEqual(expect.arrayContaining([
      "microphone_start_timeout", "pre_turn_failure",
    ]));
    expect(report.executiveSummary.recommendedQaFocus).toContain("mic_start_reliability");
  });

  it("keeps QA simulations out of organic product and realtime health metrics", () => {
    const cold = entry("organic-cold", "audio_upload_fallback");
    cold.diagnostics = {
      ...cold.diagnostics!,
      fallbackReason: "realtime_not_ready_at_recording_start",
      sttRoutingDecision: "audio_fallback_cold",
    };
    const warm = Array.from({ length: 4 }, (_, index) => {
      const value = entry(`organic-warm-${index}`, "realtime");
      value.timestamp += index + 10;
      value.diagnostics = {
        ...value.diagnostics!,
        sttRoutingDecision: "realtime_primary",
        realtimeConnectionReused: true,
        warmStart: true,
      };
      return value;
    });
    const qaTts = entry("qa-tts", "realtime");
    const qaEvents = new Map<string, TranslatorDiagnosticEvent[]>([
      ["qa-translation", [diagnosticEvent({
        eventOrigin: "qa_simulation", eventKind: "failure",
        apiCode: "qa_translation_503", qaScenarioId: "qa_translation_503",
      })]],
      ["qa-network", [diagnosticEvent({
        eventOrigin: "qa_simulation", eventKind: "failure", category: "NETWORK",
        apiCode: "qa_network_disconnect", qaScenarioId: "qa_network_disconnect",
      })]],
      ["qa-tts", [diagnosticEvent({
        eventOrigin: "qa_simulation", eventKind: "degradation", category: "TTS",
        stage: "tts_generation", apiCode: "qa_tts_503", qaScenarioId: "qa_tts_503",
        recoveryAction: "keep_translation_without_tts", recoverySucceeded: true,
      })]],
    ]);
    const failedTurns = ["qa-translation", "qa-network"].map((turnId) => ({
      turnId,
      createdAt: `2023-11-14T22:13:3${turnId === "qa-network" ? 1 : 0}.000Z`,
      mode: "auto" as const,
      diagnostics: { transcriptionPath: "realtime" as const },
      ttsSpeed: 1,
      errorCode: turnId === "qa-network" ? "qa_network_disconnect" : "qa_translation_503",
      errorStage: "translation",
      sanitizedErrorMessage: "Simulated QA failure",
    }));
    const entries = [cold, ...warm, qaTts];
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-09T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries, failedTurns,
      diagnosticEventsByTurn: qaEvents,
      sttRoutingByTurn: new Map(entries.map((value) => [
        value.id,
        value.id === "organic-cold" ? "audio_fallback_cold" : "realtime_primary",
      ] as const)),
    });

    expect(report).toMatchObject({
      totalTurns: 8,
      successfulTurns: 6,
      failedTurns: 2,
      sessionTurnSuccessRate: 0.75,
      organicTotalTurns: 5,
      organicSuccessfulTurns: 5,
      organicFailedTurns: 0,
      organicProductTurnSuccessRate: 1,
      organicRealtimeAttemptedTurns: 4,
      organicRealtimeSuccessfulTurns: 4,
      organicRealtimeAttemptSuccessRate: 1,
      qaSummary: {
        qaTurns: 3,
        qaTerminalFailures: 2,
        qaFailures: 2,
        qaDegradations: 1,
        qaResult: "passed_with_expected_terminal_failures",
      },
      executiveSummary: {
        overallHealth: "healthy",
        productTurnSuccessRate: 1,
        organicTurns: 5,
        organicSuccessful: 5,
        organicTerminalFailures: 0,
      },
    });
    expect(report.keyFindings).toContain("all_organic_turns_successful");
    expect(report.keyFindings).toContain("realtime_warm_path_healthy");
    expect(report.keyFindings).not.toContain("realtime_unstable");
  });

  it("reports generation and browser playback outcomes without treating disabled TTS as failure", () => {
    const success = entry("tts-success", "realtime");
    const disabled = entry("tts-disabled", "realtime");
    disabled.diagnostics = {
      ...disabled.diagnostics!, autoplayEnabled: false, ttsRequested: false,
      ttsRequestReason: "none", ttsGenerationOutcome: "disabled",
      ttsPlaybackOutcome: "not_attempted", ttsOutcome: "disabled",
      ttsSkipReason: "autoplay_disabled",
    };
    const blocked = entry("tts-blocked", "realtime");
    blocked.diagnostics = {
      ...blocked.diagnostics!, ttsRequested: true, ttsRequestReason: "autoplay",
      ttsGenerationOutcome: "success", ttsPlaybackOutcome: "blocked",
      ttsOutcome: "success", ttsSkipReason: "browser_autoplay_blocked",
      ttsPlaybackStartedAt: undefined,
      ttsPlaybackCompletedAt: undefined,
      playbackStartedAt: undefined,
      playbackCompletedAt: undefined,
    };
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-09T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries: [success, disabled, blocked],
      failedTurns: [],
    });
    expect(report.sections.tts).toEqual({
      autoplayEnabledTurns: 2,
      ttsRequestedTurns: 2,
      ttsGenerationSuccesses: 2,
      ttsGenerationFailures: 0,
      ttsRequestSuccessRate: 1,
      ttsPlaybackStartedTurns: 1,
      ttsPlaybackCompletedTurns: 1,
      ttsPlaybackInterruptedTurns: 0,
      ttsPlaybackBlockedTurns: 1,
      ttsPlaybackFailures: 0,
      ttsPlaybackFailedTurns: 0,
      ttsPlaybackFromCacheCount: 0,
      ttsNegativeFeedbackCount: 0,
      ttsNegativeFeedbackWithCompletedPlaybackCount: 0,
      ttsPlaybackSuccessRate: 0.5,
      manualTtsRequests: 0,
      organicTtsDegradations: 0,
    });
    expect(report.keyFindings).toContain("tts_playback_blocked");
    expect(report.keyFindings).not.toContain("tts_unavailable");
  });

  it("keeps negative TTS feedback independent from a completed natural playback", () => {
    const completed = entry("tts-completed-negative", "audio_upload_fallback");
    completed.diagnostics = {
      ...completed.diagnostics!,
      ttsRequested: true,
      ttsGenerationOutcome: "success",
      ttsPlaybackOutcome: "completed",
    };
    const interrupted = entry("tts-interrupted", "audio_upload_fallback");
    interrupted.diagnostics = {
      ...interrupted.diagnostics!,
      ttsRequested: true,
      ttsGenerationOutcome: "success",
      ttsPlaybackOutcome: "interrupted",
      ttsPlaybackStartedAt: "2026-09-12T00:00:02.000Z",
      ttsPlaybackInterruptedAt: "2026-09-12T00:00:03.000Z",
    };
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-12T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries: [completed, interrupted], failedTurns: [],
      feedbackByTurn: new Map([[completed.id, {
        feedbackRating: "problem", feedbackCategories: ["speech_pronunciation"],
        feedbackComment: "not all read", feedbackType: "tts", ttsFeedback: "negative",
        persistenceStatus: "synced",
      }]]),
    });

    expect(report.sections.tts).toMatchObject({
      // Both turns began playback; one then reached ended and one was stopped.
      ttsPlaybackStartedTurns: 2,
      ttsPlaybackCompletedTurns: 1,
      ttsPlaybackInterruptedTurns: 1,
      // Completion rate is terminal-outcome based, not a start-rate.
      ttsPlaybackSuccessRate: 0.5,
      ttsNegativeFeedbackCount: 1,
      ttsNegativeFeedbackWithCompletedPlaybackCount: 1,
    });
  });

  it("tolerates legacy turns that do not contain V5.2.7 playback diagnostics", () => {
    const legacy = entry("legacy-tts", "audio_upload_fallback");
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-12T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries: [legacy], failedTurns: [],
    });

    expect(report.turns[0]).toMatchObject({
      ttsPlaybackInterruptedAt: null,
      ttsGenerationId: null,
      ttsPlaybackAttemptId: null,
      ttsPlaybackFromCache: null,
      ttsAudioByteLength: null,
      ttsAudioMimeType: null,
    });
  });

  it("does not count a non-critical TTS degradation as a recovered translation turn", () => {
    const ttsDegraded = entry("tts-degraded", "realtime");
    ttsDegraded.diagnostics = {
      ...ttsDegraded.diagnostics!, ttsGenerationOutcome: "request_failed",
      ttsPlaybackOutcome: "not_attempted", ttsOutcome: "request_failed",
    };
    const connectionRecovered = entry("connection-recovered", "audio_upload_fallback");
    connectionRecovered.diagnostics = {
      ...connectionRecovered.diagnostics!,
      fallbackReason: "connection_lost_during_recording",
      sttRoutingDecision: "audio_fallback_connection_loss",
    };
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-09T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1,
      entries: [ttsDegraded, connectionRecovered], failedTurns: [],
      diagnosticEventsByTurn: new Map([
        ["tts-degraded", [diagnosticEvent({
          eventKind: "degradation", category: "TTS", stage: "tts_generation",
          recoveryAction: "keep_translation_without_tts", recoverySucceeded: true,
        })]],
      ]),
      sttRoutingByTurn: new Map([
        ["tts-degraded", "realtime_primary"],
        ["connection-recovered", "audio_fallback_connection_loss"],
      ]),
    });
    expect(report.executiveSummary.recoveredTurns).toBe(1);
    expect(report.executiveSummary.recoveredDegradationTurns).toBe(1);
    expect(report.sections.tts.organicTtsDegradations).toBe(1);
  });

  it("exports reviewed same-audio benchmark metrics separately from product health", () => {
    const comparison = reviewSameAudioComparison({
      comparisonId: "comparison-1", turnId: "benchmark-turn",
      primaryEngine: "gpt-live-transcribe", secondaryEngine: "gpt-4o-mini-transcribe",
      primaryTranscript: "Una etwa nani? Mimi ni Chris.",
      secondaryTranscript: "Unaitwa nani? Mimi ni Chris.",
      primaryCompletedAt: "2026-09-10T10:00:00.000Z",
      secondaryCompletedAt: "2026-09-10T10:00:01.000Z", sameAudio: true,
      recordingDurationMs: 2_000, primaryRoute: "realtime",
      secondaryRoute: "audio_upload_fallback", groundTruthStatus: "unreviewed",
      groundTruthTranscript: null, reviewedAt: null, benchmarkStatus: "completed",
      benchmarkFailure: null, secondaryTranscriptionMs: 800,
      primaryNormalizedExactMatch: null, secondaryNormalizedExactMatch: null,
      primaryWer: null, secondaryWer: null,
      benchmarkParityVersion: SAFE_STT_PARITY_VERSION,
    } satisfies SameAudioBenchmarkComparison, { status: "accepted_secondary" });
    const benchmarkEntry = entry("benchmark-turn", "realtime");
    const report = buildClassicTranslatorReport({
      startedAt: "2026-09-10T00:00:00.000Z", userAgent: "Chrome", platform: "Mac",
      currentMode: "auto", ttsSpeed: 1, entries: [benchmarkEntry], failedTurns: [],
      sameAudioBenchmarksByTurn: new Map([[benchmarkEntry.id, comparison]]),
      sameAudioEligibleTurnIds: new Set([benchmarkEntry.id]),
      qualityByTurn: new Map([[benchmarkEntry.id, createSpeechQualitySample({
        turnId: benchmarkEntry.id, recognizedTranscript: benchmarkEntry.originalText,
        sourceLanguage: "sw", transcriptionModel: "gpt-live-transcribe",
        transcriptionPath: "realtime", appVersion: "5.2.6",
      })]]),
      feedbackByTurn: new Map([[benchmarkEntry.id, {
        feedbackRating: "good", feedbackCategories: [], feedbackComment: null,
        feedbackType: "all_correct", speechFeedbackStatus: "accepted",
        correctedTranscript: null, translationFeedback: "positive",
        ttsFeedback: "positive", persistenceStatus: "synced",
      }]]),
    });
    expect(report.speechBenchmarkSummary).toMatchObject({
      sameAudioEligibleTurns: 1, sameAudioComparisonAttempts: 1,
      sameAudioComparisonCompleted: 1, sameAudioGroundTruthReviewed: 1,
      realtimeWins: 0, audioSttWins: 1, ties: 0,
      audioSttNormalizedExactMatchRate: 1, audioSttMeanWer: 0,
      benchmarkEvidenceLevel: "insufficient",
    });
    expect(report.turns[0]).toMatchObject({
      sameAudioBenchmarkAttempted: true, sameAudioBenchmarkCompleted: true,
      secondaryTranscriptionModel: "gpt-4o-mini-transcribe",
      benchmarkGroundTruthAvailable: true, secondaryWer: 0,
    });
    expect(report.organicProductTurnSuccessRate).toBe(1);
    expect(report).toMatchObject({
      speechFeedbackCount: 1, speechAcceptedCount: 1, speechCorrectedCount: 0,
      translationPositiveFeedbackCount: 1, translationNegativeFeedbackCount: 0,
      ttsFeedbackCount: 1, benchmarkGroundTruthCount: 1,
    });
    expect(report.keyFindings).toContain("speech_benchmark_insufficient_evidence");
  });
});
