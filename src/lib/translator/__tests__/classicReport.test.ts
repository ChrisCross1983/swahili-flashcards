import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClassicTranslatorReport,
  classicTranslatorReportFilename,
  downloadClassicTranslatorReport,
} from "@/lib/translator/classicReport";
import type { TranslationEntry } from "@/lib/translator/types";

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
      firstTranscriptDeltaAt: realtime
        ? "2023-11-14T22:13:20.400Z"
        : undefined,
      transcriptFinalAt: "2023-11-14T22:13:21.100Z",
      stopToTranscriptFinalMs: realtime ? 100 : 640,
      translationStartedAt: "2023-11-14T22:13:21.100Z",
      translationReadyAt: "2023-11-14T22:13:21.410Z",
      translationClientRequestStartedAt: "2023-11-14T22:13:21.100Z",
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
      translationServerPreOpenAiMs: 3,
      translationOpenAiTotalMs: 285,
      translationServerPostOpenAiMs: 5,
      translationClientPostResponseMs: 10,
      transcriptFinalToTranslationRequestStartMs: 0,
      translationRequestToVisibleMs: 320,
      transcriptFinalToTranslationVisibleMs: 320,
      transcriptFinalToTranslationReadyMs: 310,
      stopToTranslationVisibleMs: realtime ? 420 : 1_010,
      ttsStartedAt: "2023-11-14T22:13:21.420Z",
      ttsReadyAt: "2023-11-14T22:13:21.720Z",
      ttsClientRequestStartedAt: "2023-11-14T22:13:21.420Z",
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
      firstPlayableAudioAt: "2023-11-14T22:13:21.722Z",
      playRequestedAt: "2023-11-14T22:13:21.723Z",
      ttsRequestCorrelationId: `tts-${id}`,
      ttsServerPreOpenAiMs: 3,
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

describe("classic translator QA report", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
      reportVersion: 3,
      performanceOptimizationVersion: "classic-post-stop-v3",
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
      ttsStreamingTurns: 2,
      streamingFallbackTurns: 0,
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
        ttsStreamingUsed: true,
        ttsOpenAiTimeToFirstByteMs: 120,
        firstPlayableAudioAt: "2023-11-14T22:13:21.722Z",
      });
    expect(realtimeReportTurn?.ttsClientFirstByteAt).not.toBe(
      realtimeReportTurn?.firstPlayableAudioAt,
    );
    expect(realtimeReportTurn?.criticalPath).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "translation_openai", durationMs: 285 }),
        expect.objectContaining({ stage: "tts_openai_to_first_byte", durationMs: 120 }),
      ]),
    );
    expect(report.bottleneckSummary.largestMedianStage).toBeTruthy();
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
      reportVersion: 3,
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
      reportVersion: 3,
      totalTurns: 0,
      realtimeRate: null,
      fallbackRate: null,
      warmReuseRate: null,
      connectionAttempts: [],
    });

    expect(downloadClassicTranslatorReport(report)).toBe(true);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toMatch(/^translator-report-\d{12}\.json$/);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:classic-report");
  });
});
