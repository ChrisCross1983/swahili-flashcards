import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore, normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

type AiEvalPayload = {
    errorType: "typo" | "wrong_word" | "wrong_form" | "nonsense" | "skip" | "correct";
    correctedAnswer: string;
    feedbackShort: string;
    feedbackWhy: string;
    nextSuggestion: "repeat" | "next" | "easier" | "harder";
    minimalExample?: { sw: string; de: string } | null;
};

function feedbackTitle(intent: AiCoachResult["intent"]): AiCoachResult["feedbackTitle"] {
    if (intent === "correct") return "Richtig";
    if (intent === "typo" || intent === "almost") return "Fast richtig";
    return "Noch nicht";
}

function normalizeExample(task: AiCoachTask): { sw: string; de: string } | undefined {
    if (task.example?.sw?.trim() && task.example?.de?.trim()) {
        return { sw: task.example.sw.trim(), de: task.example.de.trim() };
    }
    return undefined;
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, _hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const expected = task.expectedAnswer;
    const normalized = normalizeText(answer);
    const example = normalizeExample(task);

    if (!normalized || /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss nicht|ich weiß nicht|ich weiss es nicht|ich weiß es nicht|i dont know|i don't know)$/.test(normalized)) {
        return {
            correct: false,
            intent: "no_attempt",
            verdict: "skip",
            score: 0,
            feedbackTitle: "Noch nicht",
            feedback: "Alles gut – wir machen als Nächstes eine leichtere Übung.",
            correctAnswer: expected,
            learnTip: "Wenn du unsicher bist: antworte mit dem Stammwort zuerst.",
            example,
            suggestedNext: "easier",
            retryAllowed: wrongAttemptsOnCard < 2,
        };
    }

    const classification = classifyAnswerIntent(answer, expected);
    const similarity = computeSimilarityScore(answer, expected);
    const partial = similarity >= 0.75 && similarity < 0.98;
    const isCorrect = classification.intent === "correct";
    const intent = isCorrect ? "correct" : (partial ? "almost" : classification.intent);

    return {
        correct: isCorrect,
        intent,
        verdict: isCorrect ? "correct" : intent === "nonsense" ? "nonsense" : partial || intent === "typo" ? "almost" : "wrong",
        score: isCorrect ? 1 : partial ? similarity : 0,
        feedbackTitle: feedbackTitle(intent),
        feedback: isCorrect ? "Sehr gut – korrekt." : partial ? "Fast richtig, überprüfe die genaue Form." : "Noch nicht korrekt. Prüfe Bedeutung und Wortform.",
        correctAnswer: expected,
        learnTip: intent === "typo" ? "Achte auf einzelne Buchstaben und Endungen." : "Vergleiche Stamm + Endung mit der Musterlösung.",
        example,
        suggestedNext: isCorrect ? "next" : partial ? "repeat" : "easier",
        retryAllowed: !isCorrect && wrongAttemptsOnCard < 2,
    };
}

async function evaluateWithOpenAi(task: AiCoachTask, answer: string, timeoutMs = 700): Promise<AiEvalPayload | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => {
        controller.abort();
        resolve(null);
    }, timeoutMs));

    try {
        const fetchPromise = fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
                input: [
                    {
                        role: "system",
                        content: [{ type: "input_text", text: "Du bist Swahili-Coach. Korrigiere nur sprachlich sauber. Wenn kein sicheres Beispiel vorhanden ist, gib minimalExample = null." }],
                    },
                    {
                        role: "user",
                        content: [{ type: "input_text", text: `Task: ${task.type}\nPrompt: ${task.prompt}\nErwartet: ${task.expectedAnswer}\nAntwort: ${answer}` }],
                    },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "ai_eval",
                        strict: true,
                        schema: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                errorType: { type: "string", enum: ["typo", "wrong_word", "wrong_form", "nonsense", "skip", "correct"] },
                                correctedAnswer: { type: "string" },
                                feedbackShort: { type: "string" },
                                feedbackWhy: { type: "string" },
                                nextSuggestion: { type: "string", enum: ["repeat", "next", "easier", "harder"] },
                                minimalExample: {
                                    anyOf: [
                                        { type: "null" },
                                        {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: { sw: { type: "string" }, de: { type: "string" } },
                                            required: ["sw", "de"],
                                        },
                                    ],
                                },
                            },
                            required: ["errorType", "correctedAnswer", "feedbackShort", "feedbackWhy", "nextSuggestion", "minimalExample"],
                        },
                    },
                },
            }),
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (!response || !("ok" in response) || !response.ok) return null;
        const data = (await response.json()) as { output_text?: string };
        return data.output_text ? JSON.parse(data.output_text) as AiEvalPayload : null;
    } catch {
        return null;
    }
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, fallback: AiCoachResult): Promise<AiCoachResult> {
    const ai = await evaluateWithOpenAi(task, answer);
    if (!ai) return fallback;

    const intentMap: Record<AiEvalPayload["errorType"], AiCoachResult["intent"]> = {
        correct: "correct",
        typo: "typo",
        wrong_word: "wrong",
        wrong_form: "almost",
        nonsense: "nonsense",
        skip: "no_attempt",
    };

    const mappedIntent = intentMap[ai.errorType] ?? fallback.intent;

    return {
        ...fallback,
        correct: ai.errorType === "correct",
        intent: mappedIntent,
        verdict: ai.errorType === "correct" ? "correct" : ai.errorType === "skip" ? "skip" : ai.errorType === "nonsense" ? "nonsense" : "wrong",
        feedbackTitle: feedbackTitle(mappedIntent),
        feedback: `${ai.feedbackShort} ${ai.feedbackWhy}`.trim(),
        correctAnswer: ai.correctedAnswer?.trim() || task.expectedAnswer,
        learnTip: ai.feedbackWhy?.trim() || fallback.learnTip,
        suggestedNext: ai.nextSuggestion,
        example: ai.minimalExample?.sw?.trim() && ai.minimalExample?.de?.trim()
            ? { sw: ai.minimalExample.sw.trim(), de: ai.minimalExample.de.trim() }
            : fallback.example,
    };
}
