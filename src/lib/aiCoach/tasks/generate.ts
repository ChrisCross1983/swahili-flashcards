import type { Direction } from "@/lib/trainer/types";
import { interpretCard, type CardPedagogicalProfile } from "../cardInterpreter";
import type { CardEnrichment } from "../enrichment/generateEnrichment";
import { buildHintLevels } from "../hintEngine";
import { buildChoices, type ChoiceCandidate } from "../policy";
import type { AiCoachTask, AiTaskType, LearningObjective } from "../types";

export type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

type BuildTaskInput = {
    card: SourceCard;
    direction: Direction;
    taskType?: AiTaskType;
    objective?: LearningObjective;
    cardProfile?: CardPedagogicalProfile;
    pool?: Array<SourceCard & { pos?: string | null; nounClass?: string | null }>;
    enrichment?: CardEnrichment | null;
    rationale?: string;
};

function toExpected(card: SourceCard, direction: Direction): string {
    return (direction === "DE_TO_SW" ? card.swahili_text : card.german_text).trim();
}

function safeExample(enrichment?: CardEnrichment | null): { sw: string; de: string } | undefined {
    const entry = enrichment?.examples?.find((example) => example.sw?.trim() && example.de?.trim());
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
    if (objective === "recognition" || objective === "errorRemediation") return "mcq";
    if (objective === "guidedRecall" || objective === "contrastLearning" || objective === "contextUsage") return "cloze";
    return "translate";
}

export function buildTask(input: BuildTaskInput): AiCoachTask {
    const { card, direction, enrichment, rationale } = input;
    const expectedAnswer = toExpected(card, direction);
    const profile = input.cardProfile ?? interpretCard(card, enrichment);
    const preferredType = input.taskType ?? objectiveToTaskType(input.objective, "translate");
    const example = safeExample(enrichment);
    const hasValidClozeExample = example
        ? includesToken(direction === "DE_TO_SW" ? example.sw : example.de, expectedAnswer)
        : false;
    const type = preferredType === "cloze" && !hasValidClozeExample ? "translate" : preferredType;

    const hintLevels = buildHintLevels(profile, expectedAnswer);

    if (type === "mcq") {
        const poolCandidates: ChoiceCandidate[] = (input.pool ?? []).map((candidate) => ({
            text: direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text,
            pos: candidate.pos,
            nounClass: candidate.nounClass,
        }));

        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "mcq",
            direction,
            objective: input.objective,
            rationale,
            profile,
            prompt: `Wähle die richtige Übersetzung: ${direction === "DE_TO_SW" ? card.german_text : card.swahili_text}`,
            expectedAnswer,
            choices: buildChoices(expectedAnswer, poolCandidates, { targetPos: enrichment?.pos, targetNounClass: enrichment?.noun_class }),
            hintLevels,
            learnTip: rationale,
            example,
            ui: { inputMode: "mcq" },
            meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined },
        };
    }

    if (type === "cloze" && example) {
        const base = direction === "DE_TO_SW" ? example.sw : example.de;
        const sentenceWithGap = base.replace(expectedAnswer, "____");
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            objective: input.objective,
            rationale,
            profile,
            prompt: `Fülle die Lücke: ${sentenceWithGap}`,
            expectedAnswer,
            choices: buildChoices(expectedAnswer, (input.pool ?? []).map((candidate) => direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text)),
            hintLevels,
            learnTip: rationale,
            example,
            ui: { inputMode: "cloze_click" },
            meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined },
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        objective: input.objective,
        rationale,
        profile,
        prompt: buildTranslatePrompt(card, direction),
        expectedAnswer,
        hintLevels,
        learnTip: rationale,
        example,
        ui: { inputMode: "text" },
        meta: { pos: enrichment?.pos, nounClass: enrichment?.noun_class ?? undefined, plural: enrichment?.plural ?? undefined },
    };
}

export const generateTask = buildTask;