import type { TranslationEntry } from "@/lib/translator/types";
import type { TranslatorDiagnosticEvent } from "@/lib/translator/diagnosticEvents";
import type { SavedTranslatorFeedback } from "@/components/translator/TranslationFeedbackSheet";
import { detectCriticalFactCategories } from "@/lib/translator/essenceSummary";
import type { TranslatorSpeechQualitySample } from "@/lib/translator/speechQuality";

export const MAX_POST_CONVERSATION_REVIEW_CANDIDATES = 5;

export function selectPostConversationReviewCandidates(input: {
  entries: readonly TranslationEntry[];
  diagnosticEventsByTurn?: ReadonlyMap<string, readonly TranslatorDiagnosticEvent[]>;
  feedbackByTurn?: ReadonlyMap<string, SavedTranslatorFeedback>;
  qualityByTurn?: ReadonlyMap<string, TranslatorSpeechQualitySample>;
  maxCandidates?: number;
}) {
  return input.entries
    .map((entry, index) => {
      const diagnostics = entry.diagnostics;
      const events = input.diagnosticEventsByTurn?.get(entry.id) ?? [];
      const feedback = input.feedbackByTurn?.get(entry.id);
      let score = 0;
      if (diagnostics?.sttRoutingDecision === "audio_rescue_semantic_failure") score += 100;
      if (diagnostics?.fallbackReason === "connection_lost_during_recording") score += 90;
      if (diagnostics?.fallbackReason === "realtime_not_ready_at_recording_start") score += 60;
      if (diagnostics?.summaryContradictionDetected) score += 85;
      if (feedback?.feedbackRating === "problem") score += 80;
      if (diagnostics?.transcriptScriptAnomalyDetected) score += 70;
      if (detectCriticalFactCategories(entry.originalText).length > 0) score += 50;
      if ((diagnostics?.recordingDurationMs ?? 0) >= 25_000 || entry.originalText.length >= 500) {
        score += 40;
      }
      if (diagnostics?.summaryEligible) score += 35;
      if (events.some((event) => event.eventKind === "degradation")) score += 30;
      return { turnId: entry.id, score, index };
    })
    .filter((candidate) =>
      candidate.score > 0 &&
      (!input.qualityByTurn || input.qualityByTurn.has(candidate.turnId)))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, input.maxCandidates ?? MAX_POST_CONVERSATION_REVIEW_CANDIDATES)
    .map((candidate) => candidate.turnId);
}
