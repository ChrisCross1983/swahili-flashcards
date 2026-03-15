import type { CardPedagogicalProfile } from "./cardInterpreter";
import { computeMastery, isDue, type LearnerCardState } from "./learnerModel";
import { movePreferredTaskType, moveToObjective, type TeachingPlan } from "./teachingPlan";
import { deriveBaselineTeachingState } from "./teachingStateMachine";
import type { AiCoachResult, AiTaskType, TeachingMove, TeachingState } from "./types";

export type TeachingCoreInput = {
    learnerState: LearnerCardState;
    cardProfile: CardPedagogicalProfile;
    recentTaskTypes?: AiTaskType[];
    lastTaskType?: AiTaskType;
    lastResult?: AiCoachResult;
    recentTeachingMoves?: TeachingMove[];
    previousTeachingState?: TeachingState;
};

function pickMove(input: TeachingCoreInput): { teachingMove: TeachingMove; rationale: string; difficulty: TeachingPlan["difficulty"] } {
    const mastery = computeMastery(input.learnerState);
    const due = isDue(input.learnerState);
    const last = input.lastResult;

    if (!due) return { teachingMove: "revisit_due_item", rationale: "Karte ist noch nicht fällig; kurzes Stabilisieren.", difficulty: "challenge" };
    if (!last && mastery < 0.25) return { teachingMove: "reveal_anchor", rationale: "Neue/schwache Karte: erst Bedeutung ankern.", difficulty: "support" };
    if (last?.intent === "no_attempt") return { teachingMove: "reveal_anchor", rationale: "Kein Abruf: Lösung kurz zeigen und verankern.", difficulty: "support" };
    if (last && !last.correct && (last.errorCategory === "wrong_noun_class" || last.errorCategory === "wrong_form")) {
        return { teachingMove: "morphology_focus", rationale: "Form-/Morphologiefehler gezielt reparieren.", difficulty: "support" };
    }
    if (last && !last.correct && last.errorCategory === "semantic_confusion") {
        return { teachingMove: "contrast_repair", rationale: "Bedeutungsverwechslung mit Kontrast auflösen.", difficulty: "support" };
    }
    if (last?.intent === "almost" || last?.intent === "typo") {
        return { teachingMove: "guided_recall", rationale: "Teiltreffer: geführten Abruf nachschärfen.", difficulty: "standard" };
    }
    if (last?.correct && (last.confidence ?? 0) >= 0.9) {
        return {
            teachingMove: input.cardProfile.contextRequired || input.cardProfile.unitType === "full_sentence" ? "transfer_check" : "active_recall",
            rationale: "Starker Treffer: Transfer/robusten Abruf prüfen.",
            difficulty: "challenge",
        };
    }
    if (mastery < 0.4) return { teachingMove: "recognition_check", rationale: "Niedrige Beherrschung: sichere Wiedererkennung prüfen.", difficulty: "support" };
    return { teachingMove: "active_recall", rationale: "Regulärer Lernpfad: aktiver Abruf.", difficulty: "standard" };
}

function chooseImplementationTaskType(preferred: AiTaskType, profile: CardPedagogicalProfile, recentTaskTypes: AiTaskType[], lastTaskType?: AiTaskType): AiTaskType {
    const repeated = recentTaskTypes.slice(-2).every((type) => type === preferred);
    if (repeated && preferred === "mcq" && profile.exerciseCapabilities.translation) return "translate";
    if (repeated && preferred === "translate" && profile.exerciseCapabilities.cloze) return "cloze";
    if (preferred === "cloze" && !profile.exerciseCapabilities.cloze) return "translate";
    if (preferred === "mcq" && !profile.exerciseSuitability.recognition) return "translate";
    if (preferred === lastTaskType && preferred === "mcq" && profile.exerciseCapabilities.translation) return "translate";
    return preferred;
}

export function buildTeachingPlan(input: TeachingCoreInput): TeachingPlan & { teachingState: TeachingState } {
    const move = pickMove(input);
    const objective = moveToObjective(move.teachingMove, input.cardProfile);
    const preferredType = movePreferredTaskType(move.teachingMove, input.cardProfile);
    const taskType = chooseImplementationTaskType(preferredType, input.cardProfile, input.recentTaskTypes ?? [], input.lastTaskType);

    return {
        teachingMove: move.teachingMove,
        teachingState: input.previousTeachingState ?? deriveBaselineTeachingState(computeMastery(input.learnerState)),
        objective,
        implementationTaskType: taskType,
        difficulty: move.difficulty,
        revealPolicy: move.teachingMove === "reveal_anchor" ? "full_reveal" : move.teachingMove === "guided_recall" ? "inline_anchor" : "none",
        explanationPolicy: move.teachingMove === "contrast_repair" || move.teachingMove === "morphology_focus" ? "rich" : "targeted",
        morphologyPolicy: move.teachingMove === "morphology_focus" ? "focused" : input.cardProfile.morphologyRelevant ? "targeted" : "off",
        contextPolicy: move.teachingMove === "context_focus" || move.teachingMove === "transfer_check" ? "required" : input.cardProfile.contextRequired ? "light" : "off",
        transferPolicy: move.teachingMove === "active_recall" ? "check_after_success" : "none",
        rationale: move.rationale,
    };
}
