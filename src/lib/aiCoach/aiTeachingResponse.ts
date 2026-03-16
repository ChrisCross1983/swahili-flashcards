import { aiTeachingResponseSchema } from "./aiSchemas";
import { type AiTeachingResponse, validateAiTeachingResponse } from "./aiValidators";
import { buildDeterministicExplanation, shouldUseExplanation } from "./hintQuality";
import { buildMiniLesson } from "./miniLessonBuilder";
import type { AiCoachResult, AiCoachTask } from "./types";

export type AiTeachingInput = {
    task: AiCoachTask;
    expectedAnswer: string;
    learnerAnswer: string;
    hintLevel: number;
    wrongAttemptsOnCard: number;
    fallback: AiCoachResult;
    learnerState?: Record<string, unknown>;
};

async function fetchTeachingResponse(input: AiTeachingInput, timeoutMs = 1000): Promise<AiTeachingResponse | null> {
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
                    { role: "system", content: [{ type: "input_text", text: "You are a Swahili teacher giving corrective pedagogical feedback. Return JSON only." }] },
                    {
                        role: "user",
                        content: [{
                            type: "input_text",
                            text: JSON.stringify({
                                task: { type: input.task.type, prompt: input.task.prompt, expectedAnswer: input.expectedAnswer },
                                learnerAnswer: input.learnerAnswer,
                                hintLevel: input.hintLevel,
                                wrongAttemptsOnCard: input.wrongAttemptsOnCard,
                                learnerState: input.learnerState ?? null,
                                morphology: input.task.profile?.morphologicalInfo ?? null,
                            }),
                        }],
                    },
                ],
                text: { format: { type: "json_schema", name: "ai_teaching_response", strict: true, schema: aiTeachingResponseSchema } },
            }),
        });

        if (!response.ok) return null;
        const data = (await response.json()) as { output_text?: string };
        if (!data.output_text) return null;
        return JSON.parse(data.output_text) as AiTeachingResponse;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export async function buildTeachingResponse(input: AiTeachingInput): Promise<AiCoachResult> {
    const ai = await fetchTeachingResponse(input);
    if (!ai || !validateAiTeachingResponse(ai, input.task)) return input.fallback;

    const intent = ai.verdict === "correct" ? "correct" : ai.verdict === "almost" ? "almost" : ai.verdict === "skip" ? "no_attempt" : ai.verdict === "nonsense" ? "nonsense" : "wrong";

    const explanation = shouldUseExplanation(ai.shortExplanation) ? ai.shortExplanation.trim() : (buildDeterministicExplanation(input.task, ai.errorType) ?? input.fallback.explanation);

    const nextResult: AiCoachResult = {
        ...input.fallback,
        intent,
        verdict: ai.verdict,
        explanation,
        errorCategory: ai.errorType,
        feedbackTitle: ai.verdict === "correct" ? "Richtig" : ai.verdict === "almost" ? "Fast richtig" : "Noch nicht",
        nextRecommendation: ai.nextLearningMoveRecommendation,
        repeatSameCard: ai.nextLearningMoveRecommendation === "repeat_same_card",
        lowerComplexity: ai.nextLearningMoveRecommendation === "lower_complexity",
        switchToContrast: ai.nextLearningMoveRecommendation === "switch_to_contrast",
        example: ai.showExample && ai.exampleSentence ? { sw: ai.exampleSentence.sw.trim(), de: ai.exampleSentence.de.trim() } : undefined,
    };

    return {
        ...nextResult,
        microLesson: buildMiniLesson({
            task: input.task,
            result: nextResult,
            learnerAnswer: input.learnerAnswer,
            aiExplanation: ai.shortExplanation,
            aiMemoryHook: ai.memoryHook ?? undefined,
        }),
    };
}
