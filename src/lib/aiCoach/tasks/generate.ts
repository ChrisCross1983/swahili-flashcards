import type { Direction } from "@/lib/trainer/types";
import { interpretCard, type CardPedagogicalProfile } from "../cardInterpreter";
import { isHighQualityExample } from "../contentQuality";
import type { CardEnrichment } from "../enrichment/generateEnrichment";
import { buildHintLevels } from "../hintEngine";
import { filterHintLevels } from "../hintQuality";
import { buildChoices, type ChoiceCandidate } from "../policy";
import { validateFinalTask } from "../finalTaskValidator";
import { rotateDeterministic } from "../variation";
import type { AiCoachTask, AiTaskType, LearningObjective, TeachingMove, TeachingState } from "../types";

export type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

type BuildTaskInput = {
    variationSeed?: string;
    card: SourceCard;
    direction: Direction;
    taskType?: AiTaskType;
    objective?: LearningObjective;
    cardProfile?: CardPedagogicalProfile;
    pool?: Array<SourceCard & { pos?: string | null; nounClass?: string | null }>;
    enrichment?: CardEnrichment | null;
    rationale?: string;
    teachingMove?: TeachingMove;
    teachingState?: TeachingState;
};

function toExpected(card: SourceCard, direction: Direction): string {
    return (direction === "DE_TO_SW" ? card.swahili_text : card.german_text).trim();
}

function safeExample(expectedAnswer: string, direction: Direction, enrichment?: CardEnrichment | null): { sw: string; de: string } | undefined {
    const taskLike = { expectedAnswer, direction };
    const entry = enrichment?.examples?.find((example) => isHighQualityExample(taskLike, example));
    if (!entry) return undefined;
    return { sw: entry.sw.trim(), de: entry.de.trim() };
}

function includesToken(sentence: string, token: string): boolean {
    const normalizedSentence = sentence.toLowerCase();
    const normalizedToken = token.toLowerCase().trim();
    return Boolean(normalizedToken) && normalizedSentence.includes(normalizedToken);
}

function buildTranslatePrompt(card: SourceCard, direction: Direction): string {
    const source = (direction === "DE_TO_SW" ? card.german_text : card.swahili_text).trim().replace(/[\n\r]+/g, " ");
    return `Übersetze: ${source}`;
}

function objectiveToTaskType(objective: LearningObjective | undefined, fallback: AiTaskType): AiTaskType {
    if (!objective) return fallback;
    if (objective === "recognition") return "mcq";
    if (objective === "guidedRecall" || objective === "contextUsage" || objective === "sentenceUnderstanding") return "cloze";
    return "translate";
}

function isTaskTypeAllowed(type: AiTaskType, profile: CardPedagogicalProfile): boolean {
    if (profile.forbiddenExerciseTypes.includes(type)) return false;
    if (type === "cloze") return profile.exerciseCapabilities.cloze && (profile.exerciseSuitability.guidedRecall || profile.exerciseSuitability.contextUsage);
    if (type === "mcq") return profile.exerciseSuitability.recognition && profile.unitType !== "full_sentence";
    return profile.exerciseCapabilities.translation && (profile.exerciseSuitability.recall || profile.exerciseSuitability.production);
}

function deriveResultCardPlan(profile: CardPedagogicalProfile, objective?: LearningObjective) {
    const objectiveType = objective ?? "recall";
    return {
        showStatus: true,
        showCorrectAnswer: true,
        showMorphology: profile.morphologyRelevant && (
            objectiveType === "morphologyFocus" ||
            objectiveType === "guidedRecall" ||
            objectiveType === "confusionRepair"
        ),
        showExample: profile.contextRequired && (
            objectiveType === "contextUsage" ||
            objectiveType === "phraseMeaning" ||
            objectiveType === "sentenceUnderstanding"
        ),
        showLearningNote: objectiveType !== "recognition",
        includeContrastNote: profile.exerciseSuitability.contrastLearning && (
            objectiveType === "phraseMeaning" ||
            objectiveType === "confusionRepair"
        ),
        includeUsageContext: profile.contextRequired && (
            objectiveType === "contextUsage" ||
            objectiveType === "phraseMeaning" ||
            objectiveType === "sentenceUnderstanding"
        ),
        includeExplanation: objectiveType !== "recognition",
        includeNextStep: objectiveType === "confusionRepair" || objectiveType === "guidedRecall",
    };
}

function fallbackTaskType(preferred: AiTaskType, profile: CardPedagogicalProfile): AiTaskType {
    if (preferred === "cloze") {
        if (isTaskTypeAllowed("translate", profile)) return "translate";
        return isTaskTypeAllowed("mcq", profile) ? "mcq" : "translate";
    }

    if (preferred === "mcq") {
        if (isTaskTypeAllowed("translate", profile)) return "translate";
        return isTaskTypeAllowed("cloze", profile) ? "cloze" : "mcq";
    }

    if (isTaskTypeAllowed("cloze", profile)) return "cloze";
    return isTaskTypeAllowed("mcq", profile) ? "mcq" : "translate";
}

export function buildTask(input: BuildTaskInput): AiCoachTask {
    const { card, direction, enrichment, rationale } = input;
    const expectedAnswer = toExpected(card, direction);
    const profile = input.cardProfile ?? interpretCard(card, enrichment);
    const objectiveType = objectiveToTaskType(input.objective, "translate");
    const preferredType = input.taskType ?? objectiveType;
    const example = safeExample(expectedAnswer, direction, enrichment);
    const hasValidClozeExample = example
        ? includesToken(direction === "DE_TO_SW" ? example.sw : example.de, expectedAnswer)
        : false;
    const formulaLike = profile.unitType === "phrase" || profile.unitType === "greeting" || profile.unitType === "formula" || profile.unitType === "expression";
    const adjustedPreferred = formulaLike && preferredType === "mcq" ? "translate" : preferredType;
    const suitableType = !isTaskTypeAllowed(adjustedPreferred, profile)
        ? fallbackTaskType(adjustedPreferred, profile)
        : adjustedPreferred;
    const type = suitableType === "cloze" && !hasValidClozeExample ? fallbackTaskType("cloze", profile) : suitableType;

    const rawHintLevels = buildHintLevels(profile, expectedAnswer);
    const hintLevels = filterHintLevels(rawHintLevels) ?? [];

    if (type === "mcq") {
        const poolCandidates: ChoiceCandidate[] = (input.pool ?? []).map((candidate) => ({
            text: direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text,
            pos: candidate.pos,
            nounClass: candidate.nounClass,
        }));
        const mcqChoices = rotateDeterministic(
            buildChoices(expectedAnswer, poolCandidates, { targetPos: enrichment?.pos, targetNounClass: enrichment?.noun_class, direction }),
            input.variationSeed ?? `${card.id}:${expectedAnswer}`
        );

        if (mcqChoices.length < 4) {
            return validateFinalTask({
                taskId: crypto.randomUUID(),
                cardId: card.id,
                type: "translate",
                direction,
                objective: input.objective,
                rationale,
                teachingMove: input.teachingMove,
                teachingState: input.teachingState,
                profile,
                prompt: buildTranslatePrompt(card, direction),
                expectedAnswer,
                hintLevels,
                learnTip: rationale,
                example,
                ui: { inputMode: "text" },
                meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined, resultCardPlan: deriveResultCardPlan(profile, input.objective) },
            }, { card, pool: input.pool });
        }

        return validateFinalTask({
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "mcq",
            direction,
            objective: input.objective,
            rationale,
            teachingMove: input.teachingMove,
            teachingState: input.teachingState,
            profile,
            prompt: `Wähle die richtige Übersetzung: ${direction === "DE_TO_SW" ? card.german_text : card.swahili_text}`,
            expectedAnswer,
            choices: mcqChoices,
            hintLevels,
            learnTip: rationale,
            example,
            ui: { inputMode: "mcq" },
            meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined, resultCardPlan: deriveResultCardPlan(profile, input.objective) },
        }, { card, pool: input.pool });
    }

    if (type === "cloze" && example && hasValidClozeExample) {
        const base = direction === "DE_TO_SW" ? example.sw : example.de;
        const sentenceWithGap = base.replace(expectedAnswer, "____");
        return validateFinalTask({
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            objective: input.objective,
            rationale,
            teachingMove: input.teachingMove,
            teachingState: input.teachingState,
            profile,
            prompt: `Fülle die Lücke: ${sentenceWithGap}`,
            expectedAnswer,
            choices: buildChoices(expectedAnswer, (input.pool ?? []).map((candidate) => direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text), { direction }),
            hintLevels,
            learnTip: rationale,
            example,
            ui: { inputMode: "cloze_click" },
            meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined, resultCardPlan: deriveResultCardPlan(profile, input.objective) },
        }, { card, pool: input.pool });
    }

    return validateFinalTask({
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        objective: input.objective,
        rationale,
        teachingMove: input.teachingMove,
        teachingState: input.teachingState,
        profile,
        prompt: buildTranslatePrompt(card, direction),
        expectedAnswer,
        hintLevels,
        learnTip: rationale,
        example,
        ui: { inputMode: "text" },
        meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined, resultCardPlan: deriveResultCardPlan(profile, input.objective) },
    }, { card, pool: input.pool });
}


export const generateTask = buildTask;