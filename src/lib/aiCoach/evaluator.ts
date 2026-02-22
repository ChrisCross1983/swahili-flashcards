import { AI_COACH_EVALUATOR_PROMPT_V1 } from "./prompts";
import type { AiCoachTask, AiEvaluationResult } from "./types";

function normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractResponseText(data: any): string | null {
    if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

    const out = data?.output;
    if (Array.isArray(out)) {
        const combined = out
            .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
            .map((c: any) => c?.text ?? c?.output_text ?? "")
            .join("")
            .trim();

        if (combined) return combined;
    }

    return null;
}

function parseResult(raw: string): AiEvaluationResult | null {
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (
            typeof parsed?.correct === "boolean" &&
            typeof parsed?.score === "number" &&
            typeof parsed?.feedback === "string" &&
            ["translate", "cloze", "repeat"].includes(parsed?.suggestedNext)
        ) {
            return {
                correct: parsed.correct,
                score: Math.max(0, Math.min(1, parsed.score)),
                feedback: parsed.feedback.trim().slice(0, 280),
                suggestedNext: parsed.suggestedNext,
            };
        }
    } catch {
        return null;
    }

    return null;
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string): AiEvaluationResult | null {
    if (normalize(answer) === normalize(task.expectedAnswer)) {
        return {
            correct: true,
            score: 1,
            feedback: "Genau richtig. Gute Arbeit!",
            suggestedNext: "translate",
        };
    }

    return null;
}

export async function evaluateWithAi(task: AiCoachTask, answer: string): Promise<AiEvaluationResult | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            max_output_tokens: 220,
            reasoning: { effort: "low" as const },
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: AI_COACH_EVALUATOR_PROMPT_V1 }],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `taskType=${task.type}\nprompt=${task.prompt}\nexpected=${task.expectedAnswer}\nanswer=${answer}`,
                        },
                    ],
                },
            ],
        }),
    });

    if (!r.ok) return null;

    const data = await r.json().catch(() => null);
    const text = extractResponseText(data);
    if (!text) return null;

    return parseResult(text);
}
