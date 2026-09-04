import type { TranslatorTechnicalEvent } from "@/lib/translator/telemetry";

const CATEGORIES = new Set([
  "AUTH", "NETWORK", "REALTIME", "RECORDER", "TRANSCRIPTION", "TRANSLATION",
  "TTS", "RATE_LIMIT", "SERVICE_UNAVAILABLE", "VALIDATION", "UNKNOWN",
]);
const EVENT_ORIGINS = new Set(["organic_runtime", "qa_simulation"]);
const EVENT_KINDS = new Set(["failure", "degradation", "expected_fallback", "info"]);
const RECOVERY_ACTIONS = new Set([
  "none", "reset_to_idle", "audio_upload_fallback", "audio_transcription_rescue", "retry_translation_once",
  "keep_translation_without_tts", "reauthenticate",
]);
const AUTH_FAILURE_TYPES = new Set([
  "missing_session", "invalid_session", "auth_network_error",
  "auth_upstream_error", "unknown_auth_error",
]);

function nullableString(value: unknown, max = 100) {
  return typeof value === "string" && value.length <= max ? value : value === null ? null : undefined;
}

function nullableMetric(value: unknown) {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 600_000)
    ? value
    : undefined;
}

function nullableCount(value: unknown, max = 30_000_000) {
  return value === null || value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max)
    ? value ?? null
    : null;
}

function consentSnapshot(value: unknown) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = [
    "diagnosticsSharingEnabled", "qualityContentSharingEnabled",
    "speechSampleSharingEnabled", "internalSpeechDiagnosticsEnabled",
  ] as const;
  if (keys.some((key) => typeof record[key] !== "boolean")) return undefined;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as {
    diagnosticsSharingEnabled: boolean;
    qualityContentSharingEnabled: boolean;
    speechSampleSharingEnabled: boolean;
    internalSpeechDiagnosticsEnabled: boolean;
  };
}

function diagnosticEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    nullableString(item.eventId, 150) == null ||
    nullableString(item.at, 50) == null ||
    !EVENT_ORIGINS.has(String(item.eventOrigin)) ||
    !EVENT_KINDS.has(String(item.eventKind)) ||
    !CATEGORIES.has(String(item.category)) ||
    nullableString(item.stage, 100) == null ||
    !RECOVERY_ACTIONS.has(String(item.recoveryAction)) ||
    typeof item.retryable !== "boolean" ||
    (item.recoverySucceeded !== null && typeof item.recoverySucceeded !== "boolean")
  ) return null;
  const httpStatus = item.httpStatus === null
    ? null
    : typeof item.httpStatus === "number" && Number.isInteger(item.httpStatus) &&
        item.httpStatus >= 100 && item.httpStatus <= 599
      ? item.httpStatus
      : undefined;
  if (httpStatus === undefined) return null;
  if (item.authFailureType !== null && !AUTH_FAILURE_TYPES.has(String(item.authFailureType))) {
    return null;
  }
  return {
    eventId: String(item.eventId),
    at: String(item.at),
    eventOrigin: item.eventOrigin as TranslatorTechnicalEvent["eventOrigin"],
    eventKind: item.eventKind as TranslatorTechnicalEvent["eventKind"],
    category: item.category as NonNullable<TranslatorTechnicalEvent["failureCategory"]>,
    stage: String(item.stage),
    endpoint: nullableString(item.endpoint, 150) ?? null,
    httpStatus,
    apiCode: nullableString(item.apiCode, 100) ?? null,
    retryable: item.retryable as boolean,
    recoveryAction: String(item.recoveryAction) as TranslatorTechnicalEvent["recoveryAction"],
    recoverySucceeded: item.recoverySucceeded as boolean | null,
    qaScenarioId: nullableString(item.qaScenarioId, 100) ?? null,
    authFailureType: nullableString(item.authFailureType, 100) ?? null,
  };
}

export function parseTechnicalDiagnosticEvent(value: unknown): TranslatorTechnicalEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const requiredStrings = [
    "installationId", "sessionId", "turnId", "timestamp", "appVersion",
    "buildVersion", "environment", "platform", "browserFamily", "osFamily",
    "translatorMode", "translationModel", "ttsModel", "status", "recoveryAction",
  ] as const;
  if (requiredStrings.some((key) => nullableString(item[key], 150) === undefined || item[key] === null)) {
    return null;
  }
  const metrics = [
    "recordClickToRecordingStartedMs", "stopToTranscriptFinalMs",
    "transcriptFinalToTranslationVisibleMs", "stopToPlaybackStartedMs",
    "translationServerPreOpenAiMs", "translationAuthMs", "translationOpenAiTotalMs",
    "ttsServerPreOpenAiMs", "ttsAuthMs", "ttsOpenAiTimeToFirstByteMs", "ttsOpenAiTotalMs",
  ] as const;
  if (metrics.some((key) => nullableMetric(item[key]) === undefined)) return null;
  if (item.failureCategory !== null && !CATEGORIES.has(String(item.failureCategory))) return null;
  if (typeof item.retryable !== "boolean" ||
      (item.recoverySucceeded !== null && typeof item.recoverySucceeded !== "boolean")) return null;
  if (item.status !== "success" && item.status !== "failure") return null;
  if (item.eventOrigin != null && !EVENT_ORIGINS.has(String(item.eventOrigin))) return null;
  if (item.eventKind != null && !EVENT_KINDS.has(String(item.eventKind))) return null;
  const consentAtRecordingStart = consentSnapshot(item.consentAtRecordingStart ?? null);
  const consentAtTurnFinalization = consentSnapshot(item.consentAtTurnFinalization ?? null);
  if (consentAtRecordingStart === undefined || consentAtTurnFinalization === undefined) return null;
  const diagnosticEventsValue = item.diagnosticEvents ?? [];
  if (!Array.isArray(diagnosticEventsValue) || diagnosticEventsValue.length > 20) return null;
  const diagnosticEvents = diagnosticEventsValue.map(diagnosticEvent);
  if (diagnosticEvents.some((event) => event === null)) return null;
  // Only the explicit technical allowlist is returned. Content/audio/headers cannot pass through.
  return {
    installationId: String(item.installationId),
    sessionId: String(item.sessionId),
    turnId: String(item.turnId),
    timestamp: String(item.timestamp),
    appVersion: String(item.appVersion),
    buildVersion: String(item.buildVersion),
    gitCommitSha: nullableString(item.gitCommitSha, 100) ?? null,
    deploymentId: nullableString(item.deploymentId, 150) ?? null,
    vercelEnvironment:
      item.vercelEnvironment === "development" ||
      item.vercelEnvironment === "preview" ||
      item.vercelEnvironment === "production"
        ? item.vercelEnvironment
        : null,
    frontendRuntimeEnvironment:
      item.frontendRuntimeEnvironment === "development" ||
      item.frontendRuntimeEnvironment === "preview" ||
      item.frontendRuntimeEnvironment === "production"
        ? item.frontendRuntimeEnvironment
        : "unknown",
    frontendOriginKind:
      item.frontendOriginKind === "localhost" ||
      item.frontendOriginKind === "vercel_preview" ||
      item.frontendOriginKind === "vercel_production" ||
      item.frontendOriginKind === "custom_domain"
        ? item.frontendOriginKind
        : "unknown",
    backendEnvironmentLabel:
      item.backendEnvironmentLabel === "development" ||
      item.backendEnvironmentLabel === "staging" ||
      item.backendEnvironmentLabel === "production"
        ? item.backendEnvironmentLabel
        : "unknown",
    environment: item.environment as TranslatorTechnicalEvent["environment"],
    platform: "web",
    browserFamily: String(item.browserFamily),
    browserVersion: nullableString(item.browserVersion, 50) ?? null,
    osFamily: String(item.osFamily),
    translatorMode: item.translatorMode as TranslatorTechnicalEvent["translatorMode"],
    sourceLanguage: item.sourceLanguage === "de" || item.sourceLanguage === "sw" ? item.sourceLanguage : null,
    targetLanguage: item.targetLanguage === "de" || item.targetLanguage === "sw" ? item.targetLanguage : null,
    transcriptionPath: item.transcriptionPath === "realtime" || item.transcriptionPath === "audio_upload_fallback" ? item.transcriptionPath : null,
    transcriptionModel: nullableString(item.transcriptionModel, 100) ?? null,
    translationModel: String(item.translationModel),
    ttsModel: String(item.ttsModel),
    warmStart: item.warmStart === true,
    realtimeConnectionReused: item.realtimeConnectionReused === true,
    fallbackReason: nullableString(item.fallbackReason, 150) ?? null,
    microphoneAcquisitionAttemptId:
      nullableString(item.microphoneAcquisitionAttemptId, 150) ?? null,
    microphoneAcquisitionMs:
      nullableMetric(item.microphoneAcquisitionMs ?? null) as number | null,
    microphoneAcquisitionOutcome:
      nullableString(item.microphoneAcquisitionOutcome, 80) ?? null,
    captureGeneration: nullableCount(item.captureGeneration, 1_000_000),
    freshStreamRequested: item.freshStreamRequested === true,
    streamReused: item.streamReused === true,
    mediaRecorderChunkCount:
      nullableCount(item.mediaRecorderChunkCount, 100_000),
    mediaRecorderTotalChunkBytes:
      nullableCount(item.mediaRecorderTotalChunkBytes),
    audioBlobSize: nullableCount(item.audioBlobSize),
    audioSignalObserved:
      typeof item.audioSignalObserved === "boolean" ? item.audioSignalObserved : null,
    realtimeTransportReady: item.realtimeTransportReady === true,
    realtimeInputTrackGeneration:
      nullableCount(item.realtimeInputTrackGeneration, 1_000_000),
    realtimeFirstDeltaObserved: item.realtimeFirstDeltaObserved === true,
    realtimeFinalTranscriptReceived: item.realtimeFinalTranscriptReceived === true,
    capturePathOutcome: nullableString(item.capturePathOutcome, 100) ?? null,
    sttRoutingDecision: [
      "realtime_primary", "audio_fallback_cold",
      "audio_rescue_semantic_failure", "audio_safe_mode_circuit_breaker",
      "audio_safe_mode_feature_flag",
    ].includes(String(item.sttRoutingDecision))
      ? item.sttRoutingDecision as TranslatorTechnicalEvent["sttRoutingDecision"]
      : null,
    semanticRescueAttempted: item.semanticRescueAttempted === true,
    semanticRescueSucceeded: item.semanticRescueSucceeded === true,
    sameAudioComparisonAvailable: item.sameAudioComparisonAvailable === true,
    transcriptScriptAnomalyDetected: item.transcriptScriptAnomalyDetected === true,
    primaryFailureToRescueStartMs:
      nullableMetric(item.primaryFailureToRescueStartMs ?? null) as number | null,
    rescueTranscriptionMs:
      nullableMetric(item.rescueTranscriptionMs ?? null) as number | null,
    rescueTranscriptToTranslationReadyMs:
      nullableMetric(item.rescueTranscriptToTranslationReadyMs ?? null) as number | null,
    semanticRescueTotalMs:
      nullableMetric(item.semanticRescueTotalMs ?? null) as number | null,
    recordClickToRecordingStartedMs: nullableMetric(item.recordClickToRecordingStartedMs) as number | null,
    stopToTranscriptFinalMs: nullableMetric(item.stopToTranscriptFinalMs) as number | null,
    transcriptFinalToTranslationVisibleMs: nullableMetric(item.transcriptFinalToTranslationVisibleMs) as number | null,
    stopToPlaybackStartedMs: nullableMetric(item.stopToPlaybackStartedMs) as number | null,
    translationServerPreOpenAiMs: nullableMetric(item.translationServerPreOpenAiMs) as number | null,
    translationAuthMs: nullableMetric(item.translationAuthMs) as number | null,
    translationOpenAiTotalMs: nullableMetric(item.translationOpenAiTotalMs) as number | null,
    ttsServerPreOpenAiMs: nullableMetric(item.ttsServerPreOpenAiMs) as number | null,
    ttsAuthMs: nullableMetric(item.ttsAuthMs) as number | null,
    ttsOpenAiTimeToFirstByteMs: nullableMetric(item.ttsOpenAiTimeToFirstByteMs) as number | null,
    ttsOpenAiTotalMs: nullableMetric(item.ttsOpenAiTotalMs) as number | null,
    status: item.status as "success" | "failure",
    failureCategory: item.failureCategory as TranslatorTechnicalEvent["failureCategory"],
    httpStatus: typeof item.httpStatus === "number" ? item.httpStatus : null,
    apiErrorCode: nullableString(item.apiErrorCode, 100) ?? null,
    errorStage: nullableString(item.errorStage, 100) ?? null,
    retryable: item.retryable as boolean,
    recoveryAction: item.recoveryAction as TranslatorTechnicalEvent["recoveryAction"],
    recoverySucceeded: item.recoverySucceeded as boolean | null,
    eventOrigin: item.eventOrigin == null
      ? null
      : item.eventOrigin as TranslatorTechnicalEvent["eventOrigin"],
    eventKind: item.eventKind == null
      ? null
      : item.eventKind as TranslatorTechnicalEvent["eventKind"],
    qaScenarioId: nullableString(item.qaScenarioId, 100) ?? null,
    diagnosticEvents: diagnosticEvents as TranslatorTechnicalEvent["diagnosticEvents"],
    consentAtRecordingStart,
    consentAtTurnFinalization,
  };
}
