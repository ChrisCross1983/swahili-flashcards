export type TranslatorFailureCategory =
  | "AUTH"
  | "NETWORK"
  | "REALTIME"
  | "RECORDER"
  | "TRANSCRIPTION"
  | "TRANSLATION"
  | "TTS"
  | "RATE_LIMIT"
  | "SERVICE_UNAVAILABLE"
  | "VALIDATION"
  | "UNKNOWN";

export type TranslatorHealthStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "auth_required";

export type TranslatorRecoveryAction =
  | "none"
  | "reset_to_idle"
  | "audio_upload_fallback"
  | "retry_translation_once"
  | "keep_translation_without_tts"
  | "reauthenticate";

export type TranslatorAuthFailureType =
  | "missing_session"
  | "invalid_session"
  | "auth_network_error"
  | "auth_upstream_error"
  | "unknown_auth_error";

export type TranslatorFailure = {
  category: TranslatorFailureCategory;
  message: string;
  healthStatus: TranslatorHealthStatus;
  httpStatus: number | null;
  apiErrorCode: string | null;
  retryable: boolean;
  retryAfterMs: number | null;
  authFailureType: TranslatorAuthFailureType | null;
};

export class TranslatorOperationError extends Error {
  readonly failure: TranslatorFailure;

  constructor(failure: TranslatorFailure) {
    super(failure.message);
    this.name = "TranslatorOperationError";
    this.failure = failure;
  }
}

const MESSAGES: Record<TranslatorFailureCategory, string> = {
  AUTH: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  NETWORK:
    "Die Verbindung wurde kurz unterbrochen. Du kannst direkt erneut aufnehmen.",
  REALTIME:
    "Die Live-Spracherkennung ist gerade nicht verfügbar. Die sichere Erkennung wird verwendet.",
  RECORDER:
    "Die Aufnahme konnte nicht abgeschlossen werden. Du kannst direkt erneut aufnehmen.",
  TRANSCRIPTION:
    "Die Sprache konnte gerade nicht sicher erkannt werden. Bitte versuche es erneut.",
  TRANSLATION:
    "Die Übersetzung konnte gerade nicht erstellt werden. Bitte versuche es erneut.",
  TTS:
    "Die Übersetzung ist fertig, aber die Sprachausgabe ist momentan nicht verfügbar.",
  RATE_LIMIT:
    "Der Dienst ist gerade stark ausgelastet. Bitte versuche es gleich erneut.",
  SERVICE_UNAVAILABLE:
    "Der Übersetzungsdienst ist vorübergehend nicht verfügbar. Du kannst gleich erneut aufnehmen.",
  VALIDATION:
    "Die Aufnahme konnte nicht verarbeitet werden. Bitte nimm sie erneut auf.",
  UNKNOWN:
    "Etwas ist schiefgegangen. Du kannst direkt erneut aufnehmen.",
};

export function failureMessage(category: TranslatorFailureCategory) {
  return MESSAGES[category];
}

function errorFailure(error: unknown) {
  if (error instanceof TranslatorOperationError) return error.failure;
  if (
    error &&
    typeof error === "object" &&
    "failure" in error &&
    error.failure &&
    typeof error.failure === "object"
  ) {
    return error.failure as TranslatorFailure;
  }
  return null;
}

export function classifyTranslatorFailure(
  error: unknown,
  stage: string,
): TranslatorFailure {
  const existing = errorFailure(error);
  if (existing) return existing;
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      category: "UNKNOWN",
      message: MESSAGES.UNKNOWN,
      healthStatus: "healthy",
      httpStatus: null,
      apiErrorCode: "user_abort",
      retryable: false,
      retryAfterMs: null,
      authFailureType: null,
    };
  }
  const category: TranslatorFailureCategory = stage.startsWith("recording")
    ? "RECORDER"
    : stage === "transcription"
      ? "TRANSCRIPTION"
      : stage === "tts"
        ? "TTS"
        : "UNKNOWN";
  return {
    category,
    message: MESSAGES[category],
    healthStatus: category === "TTS" ? "degraded" : "healthy",
    httpStatus: null,
    apiErrorCode: null,
    retryable: category !== "UNKNOWN",
    retryAfterMs: null,
    authFailureType: null,
  };
}

export function failureFromHttp(input: {
  status: number;
  apiErrorCode: string | null;
  stage: "translation" | "tts";
  retryAfterMs?: number | null;
}): TranslatorFailure {
  const { status, apiErrorCode, stage } = input;
  let category: TranslatorFailureCategory;
  let authFailureType: TranslatorAuthFailureType | null = null;
  if (status === 401 || status === 403) {
    category = "AUTH";
    authFailureType = status === 401 ? "invalid_session" : "unknown_auth_error";
  } else if (status === 429) {
    category = "RATE_LIMIT";
  } else if (status === 502 || status === 503 || status === 504) {
    category = "SERVICE_UNAVAILABLE";
  } else if (status >= 400 && status < 500) {
    category = "VALIDATION";
  } else {
    category = stage === "tts" ? "TTS" : "TRANSLATION";
  }
  const retryAfterMs = input.retryAfterMs ?? null;
  return {
    category,
    message: MESSAGES[category],
    healthStatus: category === "AUTH"
      ? "auth_required"
      : category === "SERVICE_UNAVAILABLE"
        ? "offline"
        : category === "TTS"
          ? "degraded"
          : "healthy",
    httpStatus: status,
    apiErrorCode,
    retryable:
      status === 502 ||
      status === 503 ||
      status === 504 ||
      (status === 429 && retryAfterMs !== null),
    retryAfterMs,
    authFailureType,
  };
}

export function networkFailure(stage: "translation" | "tts"): TranslatorFailure {
  return {
    category: "NETWORK",
    message: MESSAGES.NETWORK,
    healthStatus: "offline",
    httpStatus: null,
    apiErrorCode: `${stage}_network_error`,
    retryable: true,
    retryAfterMs: null,
    authFailureType: null,
  };
}

export function applyAuthFailureType(
  failure: TranslatorFailure,
  authFailureType: TranslatorAuthFailureType | null,
): TranslatorFailure {
  if (!authFailureType) return failure;
  if (authFailureType === "auth_network_error") {
    return {
      ...failure,
      category: "NETWORK",
      message: MESSAGES.NETWORK,
      healthStatus: "offline",
      retryable: true,
      authFailureType,
    };
  }
  if (authFailureType === "auth_upstream_error") {
    return {
      ...failure,
      category: "SERVICE_UNAVAILABLE",
      message: MESSAGES.SERVICE_UNAVAILABLE,
      healthStatus: "offline",
      retryable: true,
      authFailureType,
    };
  }
  return { ...failure, authFailureType };
}

export function isUserAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
