import type { ErrorCategory, TeachingMove, TeachingState } from "./types";

export type TeachingTransitionInput = {
    currentState: TeachingState;
    teachingMove: TeachingMove;
    correct: boolean;
    errorCategory?: ErrorCategory;
    intent: "correct" | "almost" | "wrong" | "typo" | "no_attempt" | "nonsense";
    confidence?: number;
    hintLevel?: number;
};

export function deriveBaselineTeachingState(mastery: number): TeachingState {
    if (mastery >= 0.85) return "stabilized";
    if (mastery >= 0.55) return "active_recall_in_progress";
    if (mastery >= 0.3) return "guided_recall_in_progress";
    return "unknown";
}

export function transitionTeachingState(input: TeachingTransitionInput): TeachingState {
    if (!input.correct && (input.intent === "no_attempt" || input.errorCategory === "no_attempt")) return "just_revealed";
    if (!input.correct && input.intent === "wrong") return "remediation_needed";
    if (!input.correct && input.intent === "nonsense") return "remediation_needed";

    if (input.teachingMove === "reveal_anchor") return "recognition_in_progress";
    if (input.teachingMove === "recognition_check") {
        return input.correct ? "active_recall_in_progress" : "just_revealed";
    }
    if (input.teachingMove === "guided_recall" || input.teachingMove === "morphology_focus" || input.teachingMove === "contrast_repair") {
        return input.correct ? "active_recall_in_progress" : "remediation_needed";
    }
    if (input.teachingMove === "active_recall" || input.teachingMove === "production_check") {
        if (!input.correct) return "guided_recall_in_progress";
        if ((input.confidence ?? 0) >= 0.9 && (input.hintLevel ?? 0) === 0) return "transfer_check_in_progress";
        return "active_recall_in_progress";
    }
    if (input.teachingMove === "transfer_check" || input.teachingMove === "context_focus") {
        return input.correct ? "stabilized" : "guided_recall_in_progress";
    }

    return input.currentState;
}
