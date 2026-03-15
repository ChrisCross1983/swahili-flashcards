import type { CardPedagogicalProfile } from "./cardInterpreter";
import type { AiTaskType, LearningObjective, TeachingMove } from "./types";

export type TeachingPlan = {
    teachingMove: TeachingMove;
    objective: LearningObjective;
    implementationTaskType: AiTaskType;
    difficulty: "support" | "standard" | "challenge";
    revealPolicy: "none" | "inline_anchor" | "full_reveal";
    explanationPolicy: "minimal" | "targeted" | "rich";
    morphologyPolicy: "off" | "targeted" | "focused";
    contextPolicy: "off" | "light" | "required";
    transferPolicy: "none" | "check_after_success";
    rationale: string;
};

export function moveToObjective(move: TeachingMove, profile: CardPedagogicalProfile): LearningObjective {
    if (move === "recognition_check" || move === "reveal_anchor") return "recognition";
    if (move === "guided_recall") return "guidedRecall";
    if (move === "morphology_focus") return "morphologyFocus";
    if (move === "context_focus") return profile.unitType === "full_sentence" ? "sentenceUnderstanding" : "contextUsage";
    if (move === "contrast_repair") return "confusionRepair";
    if (move === "production_check") return "recall";
    if (move === "transfer_check") return profile.unitType === "full_sentence" ? "sentenceUnderstanding" : "contextUsage";
    return "recall";
}

export function movePreferredTaskType(move: TeachingMove, profile: CardPedagogicalProfile): AiTaskType {
    if (move === "recognition_check" || move === "reveal_anchor") return "mcq";
    if (move === "guided_recall" || move === "context_focus" || move === "transfer_check") {
        return profile.exerciseCapabilities.cloze ? "cloze" : "translate";
    }
    return "translate";
}
