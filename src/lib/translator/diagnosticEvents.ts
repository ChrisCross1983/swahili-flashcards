import type {
  TranslatorAuthFailureType,
  TranslatorFailureCategory,
  TranslatorRecoveryAction,
} from "@/lib/translator/reliability";

export type TranslatorDiagnosticEventOrigin = "organic_runtime" | "qa_simulation";
export type TranslatorDiagnosticEventKind =
  | "failure"
  | "degradation"
  | "expected_fallback"
  | "info";

export type TranslatorDiagnosticEvent = {
  eventId: string;
  at: string;
  eventOrigin: TranslatorDiagnosticEventOrigin;
  eventKind: TranslatorDiagnosticEventKind;
  category: TranslatorFailureCategory;
  stage: string;
  endpoint: string | null;
  httpStatus: number | null;
  apiCode: string | null;
  retryable: boolean;
  recoveryAction: TranslatorRecoveryAction;
  recoverySucceeded: boolean | null;
  qaScenarioId: string | null;
  authFailureType: TranslatorAuthFailureType | null;
};

const EVENT_PRIORITY: Record<TranslatorDiagnosticEventKind, number> = {
  failure: 4,
  degradation: 3,
  expected_fallback: 2,
  info: 1,
};

export function createTranslatorDiagnosticEvent(
  input: Omit<TranslatorDiagnosticEvent, "eventId" | "at"> & {
    eventId?: string;
    at?: string;
  },
): TranslatorDiagnosticEvent {
  return {
    ...input,
    eventId:
      input.eventId ??
      globalThis.crypto?.randomUUID?.() ??
      `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: input.at ?? new Date().toISOString(),
  };
}

export function primaryDiagnosticEvent(
  events: readonly TranslatorDiagnosticEvent[],
) {
  return [...events].sort((left, right) => {
    const priority = EVENT_PRIORITY[right.eventKind] - EVENT_PRIORITY[left.eventKind];
    return priority !== 0 ? priority : right.at.localeCompare(left.at);
  })[0] ?? null;
}

export function expectedFallbackKind(reason: string | null | undefined) {
  return reason === "realtime_not_ready_at_recording_start" ||
    reason === "realtime_disabled"
    ? "expected_fallback" as const
    : "degradation" as const;
}
