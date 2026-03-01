import type { Direction } from "@/lib/trainer/types";
import { buildChoices } from "../policy";
import type { AiCoachTask, AiTaskType } from "../types";
import { getOrCreateEnrichment } from "../enrichment/generateEnrichment";

export type SourceCard = {
    id: string;
    german_text: string;
    swahili_text: string;
    type?: "vocab" | "sentence" | null;
};

type GenerateTaskInput = {
    ownerKey: string;
    card: SourceCard;
    direction: Direction;
    taskType?: AiTaskType;
    pool?: SourceCard[];
};

function toExpected(card: SourceCard, direction: Direction): string {
    return direction === "DE_TO_SW" ? card.swahili_text : card.german_text;
}

function buildHintLevels(taskType: AiTaskType, expected: string, pos: string, nounClass: string | null, singular: string | null, plural: string | null, note: string | null, example?: { sw: string; de: string }): string[] {
    const cleanExpected = expected.trim();
    const start = cleanExpected.slice(0, 1);
    const end = cleanExpected.slice(-1);
    const nounHint = nounClass ? `Nomenklasse: ${nounClass}${singular ? ` • Singular: ${singular}` : ""}${plural ? ` • Plural: ${plural}` : ""}` : "";

    const level1 = `Wortart: ${pos}${nounHint ? ` • ${nounHint}` : ""}`;
    const level2 = cleanExpected ? `Beginnt mit „${start}" und endet mit „${end}".` : "Achte auf die Kernbedeutung und den Satzkontext.";
    const level3 = example ? `Beispiel: ${example.sw} — ${example.de}` : (note ?? "Sprich das Wort laut in einem eigenen Satz.");

    if (taskType === "mcq" || taskType === "cloze") {
        return [level1, note ?? level2, level3];
    }

    return [level1, level2, level3];
}

function asExample(entry?: { sw: string; de: string }): { sw: string; de: string } | undefined {
    if (!entry) return undefined;
    if (!entry.sw?.trim() || !entry.de?.trim()) return undefined;
    return { sw: entry.sw.trim(), de: entry.de.trim() };
}

function clozePrompt(example: { sw: string; de: string }, expected: string, card: SourceCard, direction: Direction): { prompt: string; sentenceWithGap: string } {
    const safeExpected = expected.trim();
    const sourceGloss = direction === "DE_TO_SW" ? card.german_text.trim() : card.swahili_text.trim();
    const baseSentence = direction === "DE_TO_SW" ? example.sw : example.de;
    const sentenceWithGap = safeExpected ? baseSentence.replace(safeExpected, "____") : baseSentence;
    const translation = direction === "DE_TO_SW" ? example.de : example.sw;

    return {
        prompt: `Fülle die Lücke. Gesuchtes Wort: ${sourceGloss}\n${sentenceWithGap}\nÜbersetzung: ${translation}`,
        sentenceWithGap,
    };
}

export async function generateTask(input: GenerateTaskInput): Promise<AiCoachTask> {
    const { ownerKey, card, direction, taskType = "translate", pool = [] } = input;
    const expectedAnswer = toExpected(card, direction);
    const enrichment = await getOrCreateEnrichment(ownerKey, card);
    const example = asExample(enrichment.examples[0]);
    const hintLevels = buildHintLevels(taskType, expectedAnswer, enrichment.pos, enrichment.noun_class, enrichment.singular, enrichment.plural, enrichment.notes, example);

    if (taskType === "mcq") {
        const poolAnswers = pool.map((candidate) => (direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text));
        const extraChoices = enrichment.examples.flatMap((item) => item.tags ?? []);
        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "mcq",
            direction,
            prompt: `Wähle die richtige Übersetzung: ${direction === "DE_TO_SW" ? card.german_text : card.swahili_text}`,
            expectedAnswer,
            choices: buildChoices(expectedAnswer, [...poolAnswers, ...extraChoices]),
            hintLevels,
            learnTip: enrichment.notes ?? undefined,
            example,
            ui: { inputMode: "mcq" },
            meta: {
                pos: enrichment.pos,
                nounClass: enrichment.noun_class ?? undefined,
                plural: enrichment.plural ?? undefined,
            },
        };
    }

    if (taskType === "cloze") {
        const clozeExample = example ?? {
            sw: `Hii ni ${card.swahili_text}.`,
            de: `Das ist ${card.german_text}.`,
        };
        const { prompt } = clozePrompt(clozeExample, expectedAnswer, card, direction);
        const poolAnswers = pool.map((candidate) => (direction === "DE_TO_SW" ? candidate.swahili_text : candidate.german_text));

        return {
            taskId: crypto.randomUUID(),
            cardId: card.id,
            type: "cloze",
            direction,
            prompt,
            expectedAnswer,
            choices: buildChoices(expectedAnswer, poolAnswers),
            hintLevels,
            learnTip: enrichment.notes ?? undefined,
            example: clozeExample,
            ui: { inputMode: "cloze_click" },
            meta: {
                pos: enrichment.pos,
                nounClass: enrichment.noun_class ?? undefined,
                plural: enrichment.plural ?? undefined,
            },
        };
    }

    return {
        taskId: crypto.randomUUID(),
        cardId: card.id,
        type: "translate",
        direction,
        prompt: `Übersetze natürlich: ${direction === "DE_TO_SW" ? card.german_text : card.swahili_text}`,
        expectedAnswer,
        hintLevels,
        learnTip: enrichment.notes ?? undefined,
        example,
        ui: { inputMode: "text" },
        meta: {
            pos: enrichment.pos,
            nounClass: enrichment.noun_class ?? undefined,
            plural: enrichment.plural ?? undefined,
        },
    };
}
