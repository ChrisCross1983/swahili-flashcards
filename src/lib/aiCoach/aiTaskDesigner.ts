import type { CardPedagogicalProfile } from "./cardInterpreter";
import type { LearnerCardState } from "./learnerModel";
import { aiTaskDesignerSchema } from "./aiSchemas";
import { type AiTaskDesign, validateAiTaskDesign } from "./aiValidators";
import { filterHintLevels } from "./hintQuality";
import type { AiCoachTask, AiTaskType } from "./types";

export type AiTaskDesignerInput = {
    task: AiCoachTask;
    card: { german_text: string; swahili_text: string; type?: string | null };
    cardProfile?: CardPedagogicalProfile;
    learnerState: LearnerCardState;
    recentTaskHistory: AiTaskType[];
    recentOutcomes: string[];
    allowedUiCapabilities: Array<"text" | "mcq" | "cloze_click">;
};

async function fetchAiTaskDesign(input: AiTaskDesignerInput, timeoutMs = 1000): Promise<AiTaskDesign | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
                input: [
                    { role: "system", content: [{ type: "input_text", text: "You are a Swahili teaching strategist. Return only valid JSON. Pick a pedagogically suitable task now, not a fixed template." }] },
                    {
                        role: "user",
                        content: [{
                            type: "input_text",
                            text: JSON.stringify({
                                card: input.card,
                                profile: input.cardProfile,
                                learnerState: input.learnerState,
                                recentTaskHistory: input.recentTaskHistory,
                                recentOutcomes: input.recentOutcomes,
                                currentDirection: input.task.direction,
                                allowedUiCapabilities: input.allowedUiCapabilities,
                            }),
                        }],
                    },
                ],
                text: { format: { type: "json_schema", name: "ai_task_designer", strict: true, schema: aiTaskDesignerSchema } },
            }),
        });

        if (!response.ok) return null;
        const data = (await response.json()) as { output_text?: string };
        if (!data.output_text) return null;
        return JSON.parse(data.output_text) as AiTaskDesign;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export async function designTaskWithAi(input: AiTaskDesignerInput): Promise<AiCoachTask | null> {
    const ai = await fetchAiTaskDesign(input);
    if (!ai || !validateAiTaskDesign(ai, input.task.direction)) return null;

    const mapUi = ai.taskType === "mcq" ? "mcq" : ai.taskType === "cloze" ? "cloze_click" : "text";
    if (!input.allowedUiCapabilities.includes(mapUi)) return null;

    const choices = ai.taskType === "mcq"
        ? [ai.expectedAnswer, ...ai.distractors].map((item) => item.trim()).filter(Boolean).slice(0, 6)
        : input.task.choices;

    const hintLevels = filterHintLevels(ai.hint?.trim() ? [ai.hint.trim(), ...(input.task.hintLevels ?? [])] : input.task.hintLevels);

    return {
        ...input.task,
        type: ai.taskType,
        prompt: ai.prompt.trim(),
        expectedAnswer: ai.expectedAnswer.trim(),
        choices,
        hintLevels,
        rationale: ai.teachingObjective.trim(),
        example: ai.exampleSentenceNeeded && ai.exampleSentence ? { sw: ai.exampleSentence.sw.trim(), de: ai.exampleSentence.de.trim() } : input.task.example,
        meta: {
            ...input.task.meta,
            resultCardPlan: {
                showStatus: true,
                showCorrectAnswer: true,
                showMorphology: ai.morphologyInfoNeeded,
                showExample: ai.exampleSentenceNeeded,
                showLearningNote: true,
            },
        },
    };
}
